/**
 * previewRenderer.js — Lightweight 3D preview for browsing assets.
 *
 * When the user selects an asset from the Explore/My Stuff panel,
 * this module swaps the viewport to show a quick preview of that asset.
 * Unlike the full bridge editors, previews are read-only and light.
 */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SCENE, LIGHT } from './shared/palette.js';
import { standard, groundMaterial, gridColors } from './shared/materials.js';
import { BUILDERS } from './shared/primitives.js';
import { MouthRig } from './shared/mouthRig.js';
import { VoiceEngine } from './shared/voiceEngine.js';
import { MusicEngine } from './shared/musicEngine.js';
import { makeEyeTexture, makeEyebrowTexture } from './shared/eyeTexture.js';
import { generateHeadGeometry } from './shared/headShapes.js';
import { generateBodyGeometry } from './shared/bodyShapes.js';
import {
    CHARACTER, HEAD, COLOR_ZONES, HAND,
    BODY_HEIGHT_PRESETS, BODY_WIDTH_PRESETS,
    HEAD_HEIGHT_PRESETS, HEAD_WIDTH_PRESETS,
    FACE_FEATURES, FACE_PLACEMENT_PRESETS, DEFAULT_COLORS,
} from './shared/charConfig.js';

let _renderer = null;
let _scene    = null;
let _camera   = null;
let _controls = null;
let _raf      = null;
let _ro       = null;
let _container = null;
let _clock     = new THREE.Clock();
let _previewGroup = null;   // the group containing asset meshes (for rotation)
let _autoSpin = true;
let _pingPongAngle = 0;       // current oscillation angle (radians)
let _pingPongDir   = 1;       // 1 = moving right, -1 = moving left
const _PP_RANGE    = Math.PI * 0.45; // ~81° total sweep (3/4 left to 3/4 right)
const _PP_SPEED    = 0.15;           // radians per second
let _thumbnailCallback = null;  // called once after first render with dataURL
let _currentAsset = null;       // asset being previewed (for thumbnail caching)

// ── Browse voice + mouth rig (for "Look at me" in browse preview) ──
let _mouthRig    = null;    // MouthRig instance for the current character preview
let _voiceEngine = null;    // VoiceEngine shared across previews
let _voiceReady  = false;
let _voiceConfigured = null; // Promise that resolves when voice state is applied for current preview

// ── Browse music engine (for music asset preview playback) ──
let _musicEngine = null;
let _musicReady  = false;

async function _ensureMusic() {
    if (_musicEngine) return;
    _musicEngine = new MusicEngine();
    try {
        await _musicEngine.init();
        _musicReady = true;
    } catch (e) {
        console.warn('[previewRenderer] Music init failed:', e.message);
    }
}

// Map voice IDs to their subfolder paths
const _VOICE_FOLDERS = {
    voice_male: 'standard', voice_female: 'standard', voice_child: 'standard', voice_narrator: 'standard',
    voice_robot: 'fantasy', voice_alien: 'fantasy', voice_demon: 'fantasy', voice_ghost: 'fantasy', voice_fairy: 'fantasy',
    voice_french: 'accented', voice_german: 'accented', voice_italian: 'accented', voice_spanish: 'accented',
    voice_russian: 'accented', voice_british: 'accented', voice_scottish: 'accented', voice_swedish: 'accented',
    voice_goblin: 'creatures', voice_giant: 'creatures', voice_dragon: 'creatures', voice_elf: 'creatures',
    voice_ogre: 'creatures', voice_pixie: 'creatures', voice_treant: 'creatures', voice_imp: 'creatures', voice_serpent: 'creatures',
    voice_elderly_man: 'everyday', voice_elderly_woman: 'everyday', voice_teenager: 'everyday', voice_gruff: 'everyday',
    voice_cheerful: 'everyday', voice_professor: 'everyday', voice_villain: 'everyday', voice_sports_announcer: 'everyday',
};
function _voicePath(voiceId) {
    const folder = _VOICE_FOLDERS[voiceId] || 'standard';
    return `${folder}/${voiceId}.json`;
}

async function _ensureVoice() {
    if (_voiceEngine) return;
    _voiceEngine = new VoiceEngine();
    try {
        await _voiceEngine.init();
        _voiceReady = true;
    } catch (e) {
        console.warn('[previewRenderer] Voice init failed:', e.message);
    }
}

let _onSpeakStateChange = null;  // callback(isSpeaking) for UI updates

/** Register a callback for when speaking starts/stops. */
export function setOnSpeakStateChange(cb) { _onSpeakStateChange = cb; }

/** Check if the preview voice is currently speaking. */
export function isPreviewSpeaking() { return _voiceEngine?.isSpeaking ?? false; }

/** Speak text in the browse preview (drives mouth rig). */
export function previewSpeak(text) {
    if (!_voiceReady || !_voiceEngine) {
        _ensureVoice().then(() => {
            if (_voiceReady) {
                _wireOnSpeakEnd();
                _voiceEngine.speak(text);
                if (_onSpeakStateChange) _onSpeakStateChange(true);
            }
        });
        return;
    }
    _wireOnSpeakEnd();
    _voiceEngine.speak(text);
    if (_onSpeakStateChange) _onSpeakStateChange(true);
}

/** Speak after the voice state has been applied (for auto-play on browse). */
export async function previewSpeakWhenReady(text) {
    if (_voiceConfigured) await _voiceConfigured;
    previewSpeak(text);
}

/** Stop any active browse-preview voice. */
export function previewStopVoice() {
    if (_voiceEngine) _voiceEngine.stop();
    if (_onSpeakStateChange) _onSpeakStateChange(false);
}

/** Play music in the browse preview (respects duration_behavior from asset). */
export async function previewPlayMusic(asset) {
    if (!_musicReady) await _ensureMusic();
    if (!_musicReady || !_musicEngine) return;
    _musicEngine.onEnd = () => {
        if (_onSpeakStateChange) _onSpeakStateChange(false);
    };
    _musicEngine.play(asset);
}

/** Stop any active browse-preview music. */
export function previewStopMusic() {
    if (_musicEngine) _musicEngine.stop();
}

/** Check if music is currently playing. */
export function isPreviewMusicPlaying() { return _musicEngine?.isPlaying ?? false; }

/** Auto-play music for an environment preview by fetching the music asset by ID. */
async function _autoPlayEnvironmentMusic(musicId) {
    if (!musicId) return;
    try {
        // Try loading from global music assets
        const folders = ['ambient', 'world', 'nature', 'lofi', 'electronic', 'action', 'cinematic', 'retro'];
        let track = null;
        for (const folder of folders) {
            try {
                const res = await fetch(`global_assets/music/${folder}/${musicId}.json`);
                if (res.ok) { track = await res.json(); break; }
            } catch { /* try next */ }
        }
        if (!track) return;
        if (!_musicReady) await _ensureMusic();
        if (!_musicReady || !_musicEngine) return;
        _musicEngine.play(track);
    } catch { /* silent */ }
}

/** Wire up the voiceEngine's onSpeakEnd to notify the state change callback. */
function _wireOnSpeakEnd() {
    if (!_voiceEngine || _voiceEngine._endHooked) return;
    _voiceEngine._endHooked = true;
    _voiceEngine.onSpeakEnd = () => {
        if (_onSpeakStateChange) _onSpeakStateChange(false);
    };
}

// ─────────────────────────────────────────────────────────────────
//  PUBLIC API
// ─────────────────────────────────────────────────────────────────

/**
 * Show a preview of the given asset in the container element.
 * Destroys any previous preview. Reuses the renderer if possible.
 * @param {HTMLElement} container — #scene-container
 * @param {Object}      asset    — full asset JSON from global_assets
 */
/**
 * @param {HTMLElement} container
 * @param {Object}      asset
 * @param {Object}      [opts]
 * @param {Function}    [opts.onThumbnail] — called with (dataURL) after first frame renders
 */
export function showPreview(container, asset, opts = {}) {
    _container = container;
    _currentAsset = asset;
    _thumbnailCallback = opts.onThumbnail || null;

    // Tear down previous preview if any
    _stopLoop();
    _musicViz = null;
    if (_musicEngine) _musicEngine.stop();

    // Create or reuse renderer
    if (!_renderer) {
        _renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        _renderer.shadowMap.enabled   = true;
        _renderer.shadowMap.type      = THREE.PCFSoftShadowMap;
        _renderer.toneMapping         = THREE.ACESFilmicToneMapping;
        _renderer.toneMappingExposure = 1.0;
    }
    _renderer.setSize(container.clientWidth, container.clientHeight);

    // Only append if not already a child
    if (!container.contains(_renderer.domElement)) {
        // Remove any existing canvases (from Scene3D)
        container.querySelectorAll('canvas').forEach(c => c.remove());
        container.appendChild(_renderer.domElement);
    }

    // Build scene
    _scene  = new THREE.Scene();
    _scene.background = new THREE.Color(SCENE.builderBg);

    _camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000);

    // Orbit controls
    if (_controls) { _controls.dispose(); _controls = null; }
    _controls = new OrbitControls(_camera, _renderer.domElement);
    _controls.enableDamping = true;
    _controls.dampingFactor = 0.08;
    _controls.minDistance   = 1.5;
    _controls.maxDistance   = 8;
    _controls.maxPolarAngle = Math.PI * 0.85;
    _autoSpin = true;
    _pingPongAngle = 0;
    _pingPongDir   = 1;
    const stopSpin = () => { _autoSpin = false; };
    _renderer.domElement.addEventListener('pointerdown', stopSpin);
    _renderer.domElement.addEventListener('wheel', stopSpin);

    // Ground + grid
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), groundMaterial());
    ground.rotation.x    = -Math.PI / 2;
    ground.receiveShadow = true;
    _scene.add(ground);

    const gc = gridColors();
    const grid = new THREE.GridHelper(10, 20, gc.major, gc.minor);
    grid.position.y = 0.001;
    _scene.add(grid);

    // Lights
    _scene.add(new THREE.AmbientLight(SCENE.ambient, LIGHT.ambientIntensity));
    const key = new THREE.DirectionalLight(SCENE.keyLight, LIGHT.keyIntensity);
    key.position.set(...LIGHT.keyPosition);
    key.castShadow = true;
    _scene.add(key);
    const fill = new THREE.DirectionalLight(SCENE.fillLight, LIGHT.fillIntensity);
    fill.position.set(...LIGHT.fillPosition);
    _scene.add(fill);

    // Create preview group (for gentle rotation)
    _previewGroup = new THREE.Group();
    _scene.add(_previewGroup);

    // Build the asset preview (some are async for loading accessories)
    const type = asset.type;
    if (type === 'character') {
        _buildCharacterPreview(asset);  // async internally
        if (_controls) _controls.target.set(0, 0.8, 0);
    } else if (type === 'prop') {
        _buildPropPreview(asset);
        if (_controls) _controls.target.set(0, 0.5, 0);
    } else if (type === 'environment') {
        _buildEnvironmentPreview(asset);
        if (_controls) _controls.target.set(0, 0.3, 0);
    } else if (type === 'music') {
        _buildMusicPreview(asset);
        if (_controls) _controls.target.set(0, 0.5, 0);
    } else if (type === 'voice') {
        _buildVoicePreview(asset);
        _autoSpin = false;  // voice heads face forward, no spin
        if (_controls) _controls.target.set(0, 0.7, 0);
    } else if (type === 'asset' || type === 'image') {
        _buildImagePreview(asset);
        _autoSpin = false;  // 2D images don't rotate
        if (_controls) _controls.target.set(0, 1, 0);
    } else {
        _buildFallbackPreview(asset);
        if (_controls) _controls.target.set(0, 0.5, 0);
    }
    if (_controls) _controls.update();

    // Resize observer
    if (_ro) _ro.disconnect();
    _ro = new ResizeObserver(() => {
        _camera.aspect = container.clientWidth / container.clientHeight;
        _camera.updateProjectionMatrix();
        _renderer.setSize(container.clientWidth, container.clientHeight);
    });
    _ro.observe(container);

    // Start render loop
    _clock = new THREE.Clock();
    _startLoop();
}

/**
 * Destroy the preview and clean up.
 */
export function destroyPreview() {
    _stopLoop();
    _musicViz = null;
    if (_voiceEngine) _voiceEngine.stop();
    if (_musicEngine) _musicEngine.stop();
    if (_mouthRig) { _mouthRig.dispose(); _mouthRig = null; }
    if (_controls) { _controls.dispose(); _controls = null; }
    if (_ro) { _ro.disconnect(); _ro = null; }
    if (_renderer?.domElement && _container?.contains(_renderer.domElement)) {
        _container.removeChild(_renderer.domElement);
    }
    if (_renderer) { _renderer.dispose(); _renderer = null; }
    _scene    = null;
    _camera   = null;
    _container = null;
    _previewGroup = null;
}

// ─────────────────────────────────────────────────────────────────
//  RENDER LOOP
// ─────────────────────────────────────────────────────────────────

function _startLoop() {
    if (_raf) return;
    let _frameCount = 0;
    const tick = () => {
        _raf = requestAnimationFrame(tick);
        const delta = _clock.getDelta();
        const deltaMs = delta * 1000;

        // Ping-pong rotation between 3/4 views (stops when user interacts)
        if (_controls) {
            if (_autoSpin) {
                _pingPongAngle += _PP_SPEED * delta * _pingPongDir;
                if (_pingPongAngle >= _PP_RANGE)  { _pingPongAngle = _PP_RANGE;  _pingPongDir = -1; }
                if (_pingPongAngle <= -_PP_RANGE) { _pingPongAngle = -_PP_RANGE; _pingPongDir =  1; }
                const dist  = _controls.getDistance();
                const polar = _controls.getPolarAngle();
                const baseAzimuth = 0; // front-facing center
                _controls.object.position.setFromSpherical(
                    new THREE.Spherical(dist, polar, baseAzimuth + _pingPongAngle)
                ).add(_controls.target);
            }
            _controls.update();
        }

        // Update mouth rig from voice engine
        if (_voiceEngine && _mouthRig) {
            _voiceEngine.update(deltaMs);
            _mouthRig.update(_voiceEngine.getVisemeParams());
        }

        // Update music visualizer animation
        if (_musicViz) {
            _musicViz.time += delta;
            const t = _musicViz.time;
            const beat = _musicViz.beatSec;

            // Pulse core on beat
            const beatPhase = (t % beat) / beat;
            const pulse = 1 + 0.12 * Math.exp(-beatPhase * 6);
            _musicViz.core.scale.setScalar(pulse);
            _musicViz.core.rotation.y = t * 0.3;
            _musicViz.coreMat.emissiveIntensity = 0.15 + 0.35 * Math.exp(-beatPhase * 4);

            // Pulse glow ring
            _musicViz.glowMat.opacity = 0.3 + 0.3 * Math.exp(-beatPhase * 5);

            // Orbit layer rings
            for (const ring of _musicViz.layerRings) {
                for (const orb of ring.orbs) {
                    const a = orb.baseAngle + t * ring.speed * 0.5 + ring.angleOffset;
                    orb.mesh.position.x = Math.cos(a) * ring.radius;
                    orb.mesh.position.z = Math.sin(a) * ring.radius;
                    orb.mesh.position.y = 0.8 + Math.sin(a * 2 + t) * 0.15;
                }
            }
        }

        _renderer.render(_scene, _camera);

        // Capture thumbnail after a few frames (let async assets load)
        _frameCount++;
        if (_frameCount === 10 && _thumbnailCallback && _renderer) {
            try {
                const dataURL = _renderer.domElement.toDataURL('image/jpeg', 0.7);
                _thumbnailCallback(dataURL);
            } catch { /* ignore capture errors */ }
            _thumbnailCallback = null;
        }
    };
    tick();
}

function _stopLoop() {
    if (_raf) { cancelAnimationFrame(_raf); _raf = null; }
}

// ─────────────────────────────────────────────────────────────────
//  CHARACTER PREVIEW
// ─────────────────────────────────────────────────────────────────

// ── Prop cache for character accessories ──
const _propCache = {};

async function _fetchProp(propId) {
    if (!propId || propId === 'none') return null;
    if (_propCache[propId]) return _propCache[propId];

    // Try multiple locations: headwear, glasses, facial_hair
    const paths = [
        `global_assets/objects/fashion/headwear/${propId}.json`,
        `global_assets/objects/fashion/glasses/${propId}.json`,
        `global_assets/objects/fashion/facial_hair/${propId}.json`,
    ];
    for (const p of paths) {
        try {
            const res = await fetch(p);
            if (res.ok) {
                const data = await res.json();
                _propCache[propId] = data;
                return data;
            }
        } catch { /* try next */ }
    }
    return null;
}

function _renderPropGroup(propData, primaryColor, scale) {
    const payload = propData.payload;
    const elements = payload._editor?.elements || [];
    const colorMap = payload._editor?.color_assignments || payload.color_assignments || {};
    const group = new THREE.Group();
    group.name = propData.id || 'prop';

    const PRIM = {
        box(p) { return new THREE.BoxGeometry(p.width||p.sx||1, p.height||p.sy||1, p.depth||p.sz||1); },
        sphere(p) { return new THREE.SphereGeometry(p.radius||0.5, 16, 12); },
        cylinder(p) { return new THREE.CylinderGeometry(p.radiusTop??p.radius??0.5, p.radiusBottom??p.radius??0.5, p.height||1, 16); },
        cone(p) { const g = new THREE.ConeGeometry(p.radius||0.5, p.height||1, 16); g.rotateX(Math.PI); return g; },
        torus(p) { const g = new THREE.TorusGeometry(p.radius||0.5, p.tubeRadius||p.tube||0.15, 12, 24); g.rotateX(Math.PI/2); return g; },
        capsule(p) { return new THREE.CapsuleGeometry(p.radius||0.3, p.length||1, 8, 12); },
        hemisphere(p) { return new THREE.SphereGeometry(p.radius||0.5, 16, 12, 0, Math.PI*2, 0, Math.PI/2); },
        pyramid(p) { return new THREE.ConeGeometry((p.baseWidth||1)/2, p.height||1, 4); },
    };

    const sorted = [...elements].sort((a,b) => (a.zIndex||0)-(b.zIndex||0));
    for (const el of sorted) {
        const factory = PRIM[el.primitiveId || el.primitive];
        if (!factory) continue;
        const p = el.params || {};
        const geo = factory(p);

        // Resolve color: "primary" → override, token → colorMap, hex → direct
        let fill = p.fill || 'primary';
        let color;
        if (fill === 'primary' && primaryColor) color = primaryColor;
        else if (colorMap[fill]) color = colorMap[fill];
        else if (fill.startsWith?.('#')) color = fill;
        else color = '#888888';

        const mat = new THREE.MeshStandardMaterial({
            color, metalness: p.metalness ?? 0.1, roughness: p.roughness ?? 0.7,
            transparent: (p.opacity??1)<1, opacity: p.opacity??1,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.position.set(p.px||0, p.py||0, p.pz||0);
        const d = Math.PI/180;
        mesh.rotation.set((p.rx||0)*d, (p.ry||0)*d, (p.rz||0)*d);
        group.add(mesh);
    }
    if (scale) group.scale.setScalar(scale);
    return group;
}

// ── Canvas-based eye renderer (simplified EyeRig) ──
// _makeEyeTexture — delegates to shared module
function _makeEyeTexture(irisColor, shape, eyelashStyle, eyelashColor) {
    return makeEyeTexture(irisColor, shape, eyelashStyle, eyelashColor);
}

// ── Canvas-based mouth renderer (simplified MouthRig) ──
function _makeMouthTexture(lipColor) {
    const SIZE = 128, HALF = 64;
    const canvas = document.createElement('canvas');
    canvas.width = SIZE; canvas.height = SIZE;
    const ctx = canvas.getContext('2d');

    // Mouth interior ellipse
    ctx.beginPath();
    ctx.ellipse(HALF, HALF, 32, 14, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#2a1015';
    ctx.fill();

    // Upper teeth hint
    ctx.beginPath();
    ctx.ellipse(HALF, HALF - 4, 24, 6, 0, 0, Math.PI);
    ctx.fillStyle = '#f0eee8';
    ctx.fill();

    // Lips outline
    ctx.beginPath();
    ctx.ellipse(HALF, HALF, 34, 16, 0, 0, Math.PI * 2);
    ctx.strokeStyle = lipColor || '#d4626e';
    ctx.lineWidth = 3.5;
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
}

/**
 * Two-zone gradient material: top color above splitY, bottom color below.
 * Uses shader injection like the editor's createTwoZoneMaterial.
 */
function _twoZoneMaterial(topHex, bottomHex, splitY) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0.05 });
    mat.onBeforeCompile = (sh) => {
        sh.uniforms.uTopColor    = { value: new THREE.Color(topHex) };
        sh.uniforms.uBottomColor = { value: new THREE.Color(bottomHex) };
        sh.uniforms.uSplitY      = { value: splitY };
        sh.vertexShader = sh.vertexShader
            .replace('#include <common>', '#include <common>\nvarying float vModelY;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvModelY = position.y;');
        sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>',
                '#include <common>\nuniform vec3 uTopColor;\nuniform vec3 uBottomColor;\nuniform float uSplitY;\nvarying float vModelY;')
            .replace('#include <color_fragment>',
                '#include <color_fragment>\nvec3 zoneColor = vModelY >= uSplitY ? uTopColor : uBottomColor;\ndiffuseColor.rgb *= zoneColor;');
    };
    return mat;
}

async function _buildCharacterPreview(asset) {
    const s = asset.payload?.state || asset.state || {};

    _camera.position.set(0, 1.3, 3.5);
    _camera.lookAt(0, 0.8, 0);
    _camera.fov = 40;
    _camera.updateProjectionMatrix();

    // ── Real config-matched sizes ──
    const bodyH = (BODY_HEIGHT_PRESETS[s.heightPreset] || BODY_HEIGHT_PRESETS.medium).height;
    const bodyW = (BODY_WIDTH_PRESETS[s.widthPreset] || BODY_WIDTH_PRESETS.moderate).width;
    const headH = (HEAD_HEIGHT_PRESETS[s.headHeightPreset] || HEAD_HEIGHT_PRESETS.medium).height;
    const headW = (HEAD_WIDTH_PRESETS[s.headWidthPreset] || HEAD_WIDTH_PRESETS.moderate).width;

    const floatY = CHARACTER.floatHeight;

    // ── Body (real shape generator — matches editor exactly) ──
    const bodyGeo = generateBodyGeometry(s.bodyShape || 'roundedBox', bodyW, bodyH);
    // Geometry is centered at origin; split for bottom color zone is relative to bottom
    const bodySplitY = -bodyH / 2 + COLOR_ZONES.bottomHeight;
    const bodyMat = _twoZoneMaterial(s.torsoColor || '#7b4daa', s.bottomColor || '#3a2870', bodySplitY);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = floatY + bodyH / 2;
    body.castShadow = true;
    _previewGroup.add(body);

    // ── Hands (same proportions as editor's HAND config) ──
    const handScale = bodyW / HAND.referenceBodyWidth;
    const handGeo = new RoundedBoxGeometry(
        HAND.baseWidth * handScale, HAND.baseHeight * handScale, HAND.baseDepth * handScale,
        HAND.segments, HAND.cornerRadius * handScale
    );
    const handMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(s.skinColor || '#ffcc88'), roughness: 0.75, metalness: 0.05,
    });
    // Position hands at sides, below shoulders (arms hang down)
    const bodyTopY = floatY + bodyH;
    const handY = bodyTopY - bodyH * 0.35;  // roughly where hands rest
    const handX = bodyW / 2 + HAND.baseWidth * handScale * 0.8;
    const leftHand = new THREE.Mesh(handGeo, handMat);
    leftHand.position.set(-handX, handY, 0);
    leftHand.castShadow = true;
    _previewGroup.add(leftHand);
    const rightHand = new THREE.Mesh(handGeo.clone(), handMat);
    rightHand.position.set(handX, handY, 0);
    rightHand.castShadow = true;
    _previewGroup.add(rightHand);

    // ── Head (real shape generator + two-zone scalp gradient) ──
    const neckGap = HEAD.neckGap;
    const headBaseY = bodyTopY + neckGap;
    const { geometry: headGeo, frontZ } = generateHeadGeometry(s.headShape || 'roundedBox', headW, headH);
    // Head geometry has bottom at y=0, top at y=headH (pre-translated in generator)
    const scalpSplitY = headH - headH * HEAD.scalpFraction;
    const headMat = _twoZoneMaterial(s.scalpColor || '#8b2020', s.skinColor || '#ffcc88', scalpSplitY);
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = headBaseY;
    head.castShadow = true;
    _previewGroup.add(head);

    // Head center Y in world space (for face feature positioning)
    const headCenterY = headBaseY + headH / 2;

    // ── Face placement (real config) ──
    const faceOffset = (FACE_PLACEMENT_PRESETS[s.facePlacement] || FACE_PLACEMENT_PRESETS.mid).offset;
    const fwPreset = s.faceWidthPreset || 'moderate';
    const fhPreset = s.faceHeightPreset || 'medium';
    const exo = FACE_FEATURES.eye.xOffsetByWidth[fwPreset] || FACE_FEATURES.eye.xOffsetByWidth.moderate;
    const eyo = FACE_FEATURES.eye.yOffsetByHeight[fhPreset] || FACE_FEATURES.eye.yOffsetByHeight.medium;
    const myo = FACE_FEATURES.mouth.yOffsetByHeight[fhPreset] || FACE_FEATURES.mouth.yOffsetByHeight.medium;

    // Compute skin center Y like the editor does
    const skinH = headH - headH * HEAD.scalpFraction;
    const skinCY = headBaseY + skinH / 2;
    const faceCY = skinCY + faceOffset;
    const eyeY = faceCY + eyo;
    const mouthY = faceCY - myo;

    // ── Eyes (canvas texture on planes) ──
    const eyeTex = _makeEyeTexture(s.eyeIrisColor, s.eyeShape, s.eyelashStyle, s.eyelashColor);
    const eyePlaneSize = FACE_FEATURES.eye.scleraDiameter * 1.3;
    const eyeGeo = new THREE.PlaneGeometry(eyePlaneSize, eyePlaneSize);

    const eyeMatL = new THREE.MeshBasicMaterial({
        map: eyeTex, transparent: true, depthWrite: false, side: THREE.FrontSide,
    });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMatL);
    eyeL.position.set(-exo, eyeY, frontZ + 0.005);
    _previewGroup.add(eyeL);

    const eyeTexR = eyeTex.clone();
    eyeTexR.needsUpdate = true;
    const eyeMatR = new THREE.MeshBasicMaterial({
        map: eyeTexR, transparent: true, depthWrite: false, side: THREE.FrontSide,
    });
    const eyeR = new THREE.Mesh(eyeGeo.clone(), eyeMatR);
    eyeR.position.set(exo, eyeY, frontZ + 0.005);
    _previewGroup.add(eyeR);

    // ── Eyebrows (2D canvas texture planes above eyes) ──
    if (s.eyebrowStyle && s.eyebrowStyle !== 'none') {
        const browTexL = makeEyebrowTexture(s.eyebrowStyle, s.eyebrowColor || s.scalpColor || '#4a3728', false);
        const browTexR = makeEyebrowTexture(s.eyebrowStyle, s.eyebrowColor || s.scalpColor || '#4a3728', true);
        if (browTexL && browTexR) {
            const browSize = eyePlaneSize * 1.3;
            const browGeo = new THREE.PlaneGeometry(browSize, browSize * 0.5);
            const browMatL = new THREE.MeshBasicMaterial({ map: browTexL, transparent: true, depthWrite: false, side: THREE.FrontSide });
            const browMatR = new THREE.MeshBasicMaterial({ map: browTexR, transparent: true, depthWrite: false, side: THREE.FrontSide });
            const browL = new THREE.Mesh(browGeo, browMatL);
            const browR = new THREE.Mesh(browGeo.clone(), browMatR);
            const browY = eyeY + eyePlaneSize * 0.55;
            browL.position.set(-exo, browY, frontZ + 0.006);
            browR.position.set(exo, browY, frontZ + 0.006);
            _previewGroup.add(browL);
            _previewGroup.add(browR);
        }
    }

    // ── Mouth (real MouthRig for animated visemes) ──
    if (_mouthRig) { _mouthRig.dispose(); _mouthRig = null; }
    _mouthRig = new MouthRig();
    if (s.lipColor) _mouthRig.setLipColor(s.lipColor);
    _mouthRig.mesh.position.set(0, mouthY, frontZ + 0.005);
    _previewGroup.add(_mouthRig.mesh);

    // Init voice engine and apply assigned voice (if any)
    _voiceConfigured = _ensureVoice().then(async () => {
        if (!_voiceReady || !_voiceEngine) return;
        if (s.voiceId) {
            // Load the voice JSON and apply its state to the engine
            try {
                const vRes = await fetch(`global_assets/voices/${_voicePath(s.voiceId)}`);
                if (vRes.ok) {
                    const vData = await vRes.json();
                    const vState = vData.payload?.state || {};
                    if (_voiceEngine.applyState) _voiceEngine.applyState(vState);
                    return;
                }
            } catch { /* fall through to default */ }
        }
        // No assigned voice — apply character's own voice params if any
        if (_voiceEngine.applyState) _voiceEngine.applyState(s);
    });

    // ── Accessories (loaded asynchronously) ──
    const headTopY = headCenterY + headH / 2;
    const PROP_REF = 1.1;
    const FACE_REF = 0.55;
    const HAIR_REF = 0.18;

    // Hat / Hair
    const hatId  = s.hatStyle;
    const hairId = s.hairStyle;
    const headwearId = (hatId && hatId !== 'none') ? hatId : ((hairId && hairId !== 'none') ? hairId : null);
    if (headwearId) {
        const prop = await _fetchProp(headwearId);
        if (prop && _previewGroup) {
            const scale = headW / PROP_REF;
            const g = _renderPropGroup(prop, hatId !== 'none' ? s.hatColor : s.hairColor, scale);
            g.position.y = headTopY;
            _previewGroup.add(g);
        }
    }

    // Glasses
    if (s.glassesStyle && s.glassesStyle !== 'none') {
        const prop = await _fetchProp(s.glassesStyle);
        if (prop && _previewGroup) {
            const scale = headW / FACE_REF;
            const g = _renderPropGroup(prop, s.glassesColor, scale);
            g.position.set(0, eyeY, frontZ + 0.01);
            _previewGroup.add(g);
        }
    }

    // Facial hair
    if (s.facialHairStyle && s.facialHairStyle !== 'none') {
        const prop = await _fetchProp(s.facialHairStyle);
        if (prop && _previewGroup) {
            const scale = headW / HAIR_REF;
            const g = _renderPropGroup(prop, s.facialHairColor, scale);
            g.position.set(0, mouthY - 0.02, frontZ + 0.01);
            _previewGroup.add(g);
        }
    }
}

// ─────────────────────────────────────────────────────────────────
//  PROP / 3D OBJECT PREVIEW
// ─────────────────────────────────────────────────────────────────

function _buildPropPreview(asset) {
    const editor = asset.payload?._editor;
    const colorMap = editor?.color_assignments || asset.payload?.color_assignments || {};

    _camera.position.set(2.5, 2, 3);
    _camera.lookAt(0, 0.5, 0);
    _camera.fov = 50;
    _camera.updateProjectionMatrix();

    if (editor?.elements?.length) {
        for (const el of editor.elements) {
            const builder = BUILDERS[el.type];
            if (!builder) continue;

            const geo = builder(el);
            const fillColor = el.fill && colorMap[el.fill]
                ? colorMap[el.fill]
                : (el.fill?.startsWith('#') ? el.fill : '#888888');

            const mat = standard(new THREE.Color(fillColor), {
                metalness: el.metalness ?? 0.1,
                roughness: el.roughness ?? 0.7,
            });

            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(el.px || 0, el.py || 0, el.pz || 0);
            mesh.rotation.set(
                (el.rx || 0) * Math.PI / 180,
                (el.ry || 0) * Math.PI / 180,
                (el.rz || 0) * Math.PI / 180,
            );
            mesh.castShadow = true;
            _previewGroup.add(mesh);
        }
    } else {
        // Fallback: simple box
        const box = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            standard(0x6F6F6F),
        );
        box.position.y = 0.5;
        _previewGroup.add(box);
    }
}

// ─────────────────────────────────────────────────────────────────
//  ENVIRONMENT PREVIEW
// ─────────────────────────────────────────────────────────────────

async function _buildEnvironmentPreview(asset) {
    _camera.position.set(4, 3, 5);
    _camera.lookAt(0, 0.3, 0);
    _camera.fov = 55;
    _camera.updateProjectionMatrix();

    const p = asset.payload || {};
    const s = p.state || {};

    // Auto-play assigned music track
    const musicId = s.musicId || p.musicId;
    if (musicId) {
        _autoPlayEnvironmentMusic(musicId);
    }

    // Skybox as scene background — support both payload.skybox and state-based sky colors
    const skyTop    = p.skybox?.topColor    || s.skyTopColor;
    const skyBottom = p.skybox?.bottomColor || s.skyHorizonColor;
    if (skyTop && skyBottom) {
        const canvas = document.createElement('canvas');
        canvas.width = 2; canvas.height = 256;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createLinearGradient(0, 0, 0, 256);
        grad.addColorStop(0, skyTop);
        grad.addColorStop(1, skyBottom);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 2, 256);
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        _scene.background = tex;
    }

    // Ground color override — support both payload.ground and state-based ground color
    const groundColor = p.ground?.color || s.groundColor;
    if (groundColor) {
        const ground = _scene.children.find(c => c.geometry?.type === 'PlaneGeometry');
        if (ground) ground.material.color.set(groundColor);
    }

    // Place objects as simple placeholder boxes (actual props would need to be loaded)
    if (p.objects?.length) {
        for (const obj of p.objects.slice(0, 20)) {
            const box = new THREE.Mesh(
                new THREE.BoxGeometry(0.4, 0.6, 0.4),
                standard(0x6F6F6F, { roughness: 0.8 }),
            );
            const pos = obj.position || [0, 0, 0];
            box.position.set(pos[0], pos[1] + 0.3, pos[2]);
            box.castShadow = true;
            _previewGroup.add(box);
        }
    }

    // If no objects, show a placeholder scene
    if (!p.objects?.length) {
        const placeholder = new THREE.Mesh(
            new THREE.CylinderGeometry(0.3, 0.3, 0.05, 32),
            standard(0x888888),
        );
        placeholder.position.y = 0.025;
        _previewGroup.add(placeholder);
    }
}

// ─────────────────────────────────────────────────────────────────
//  MUSIC PREVIEW (enhanced BPM-driven visualiser)
// ─────────────────────────────────────────────────────────────────

// Animation state for music visualizer
let _musicViz = null;

// Layer color palette (used to give each layer a unique hue)
const _LAYER_COLORS = ['#00D9D9', '#FF6B9D', '#C084FC', '#FCD34D', '#34D399', '#F97316', '#60A5FA', '#F472B6'];

function _buildMusicPreview(asset) {
    _camera.position.set(0, 2.2, 4.5);
    _camera.lookAt(0, 0.8, 0);
    _camera.fov = 55;
    _camera.updateProjectionMatrix();

    const payload = asset.payload?.state || asset.payload || {};
    const moodColor = payload.mood_color || asset.payload?.mood_color || '#00D9D9';
    const bpm = payload.bpm || asset.payload?.bpm || 120;
    const layers = payload.layers || asset.payload?.layers || [];
    const beatSec = 60 / bpm;

    // ── Central pulsing shape ──
    const coreGeo = new THREE.OctahedronGeometry(0.45, 1);
    const coreMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(moodColor),
        emissive: new THREE.Color(moodColor),
        emissiveIntensity: 0.3,
        roughness: 0.2,
        metalness: 0.4,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.y = 1.2;
    core.castShadow = true;
    _previewGroup.add(core);

    // ── Glow ring around core (mood color) ──
    const glowGeo = new THREE.TorusGeometry(0.7, 0.03, 8, 48);
    const glowMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(moodColor),
        transparent: true,
        opacity: 0.5,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.y = 1.2;
    glow.rotation.x = Math.PI / 2;
    _previewGroup.add(glow);

    // ── One orbiting ring per layer ──
    const layerRings = [];
    const layerCount = Math.min(layers.length, 6);
    for (let i = 0; i < layerCount; i++) {
        const layer = layers[i];
        const color = _LAYER_COLORS[i % _LAYER_COLORS.length];
        const radius = 1.0 + i * 0.4;
        const noteCount = (layer.pattern || '').split(/\s+/).filter(Boolean).length;
        const orbCount = Math.max(2, Math.min(noteCount, 8));

        const ring = { orbs: [], radius, speed: (1 + i * 0.3), angleOffset: (i / layerCount) * Math.PI * 2 };

        // Ring path (subtle visual guide)
        const ringGeo = new THREE.TorusGeometry(radius, 0.01, 8, 48);
        const ringMat = new THREE.MeshBasicMaterial({
            color: new THREE.Color(color), transparent: true, opacity: 0.15,
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.position.y = 0.8;
        ringMesh.rotation.x = Math.PI / 2;
        _previewGroup.add(ringMesh);

        // Orbiting notes
        for (let j = 0; j < orbCount; j++) {
            const angle = (j / orbCount) * Math.PI * 2;
            const size = 0.06 + (layer.gain ?? 0.5) * 0.06;
            const orb = new THREE.Mesh(
                new THREE.SphereGeometry(size, 12, 12),
                new THREE.MeshStandardMaterial({
                    color: new THREE.Color(color),
                    emissive: new THREE.Color(color),
                    emissiveIntensity: 0.2,
                    roughness: 0.3,
                }),
            );
            orb.position.set(
                Math.cos(angle) * radius,
                0.8 + Math.sin(angle * 2) * 0.15,
                Math.sin(angle) * radius,
            );
            _previewGroup.add(orb);
            ring.orbs.push({ mesh: orb, baseAngle: angle });
        }
        layerRings.push(ring);
    }

    // ── BPM indicator dots on the ground ──
    const bpmDots = Math.min(Math.round(bpm / 30), 8);
    for (let i = 0; i < bpmDots; i++) {
        const angle = (i / bpmDots) * Math.PI * 2;
        const dot = new THREE.Mesh(
            new THREE.CircleGeometry(0.04, 16),
            new THREE.MeshBasicMaterial({ color: new THREE.Color(moodColor), transparent: true, opacity: 0.4 }),
        );
        dot.rotation.x = -Math.PI / 2;
        dot.position.set(Math.cos(angle) * 0.5, 0.005, Math.sin(angle) * 0.5);
        _previewGroup.add(dot);
    }

    // Store animation state
    _musicViz = { core, coreMat, glow, glowMat, layerRings, beatSec, time: 0 };
}

// ─────────────────────────────────────────────────────────────────
//  2D IMAGE / ASSET PREVIEW
// ─────────────────────────────────────────────────────────────────

function _buildImagePreview(asset) {
    _camera.position.set(0, 1.5, 3);
    _camera.lookAt(0, 1, 0);
    _camera.fov = 50;
    _camera.updateProjectionMatrix();

    const bgColor = asset.payload?.background_color || '#cccccc';
    const colorMap = asset.payload?.color_assignments || {};

    // Main canvas plane
    const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 1.5),
        standard(new THREE.Color(bgColor)),
    );
    plane.position.set(0, 1, 0);
    _previewGroup.add(plane);

    // If there are 2D elements, render them as colored rectangles on the plane
    const elements = asset.payload?._editor?.elements;
    if (elements?.length) {
        const scale = 1 / 256; // map SVG coords to world
        for (const el of elements.slice(0, 20)) { // limit to avoid too many meshes
            const p = el.params || el;
            const w = (p.w || p.width || 30) * scale;
            const h = (p.h || p.height || 30) * scale;
            const cx = (p.cx || p.px || 128) * scale - 1;
            const cy = -(p.cy || p.py || 128) * scale + 1;

            const fillColor = p.fill && colorMap[p.fill]
                ? colorMap[p.fill]
                : (p.fill?.startsWith?.('#') ? p.fill : '#888888');

            const rect = new THREE.Mesh(
                new THREE.PlaneGeometry(w, h),
                standard(new THREE.Color(fillColor)),
            );
            rect.position.set(cx, 1 + cy, 0.01);
            _previewGroup.add(rect);
        }
    }
}

// ─────────────────────────────────────────────────────────────────
//  FALLBACK PREVIEW
// ─────────────────────────────────────────────────────────────────

function _buildVoicePreview(asset) {
    const s = asset.payload?.state || asset.state || {};

    // Position head so it's vertically centered in the viewport.
    // Head geometry sits on the ground (bottom at y=0, top at y=headH).
    // We raise the group so the head center lands at a comfortable eye-line.
    const headCenterY = 0.72;   // target center of head in world space (raised to account for bottom UI overlay)
    const groupY = headCenterY - HEAD_HEIGHT_PRESETS['medium'].height / 2;

    _camera.position.set(0, headCenterY, 1.6);
    _camera.lookAt(0, headCenterY, 0);
    _camera.fov = 45;
    _camera.updateProjectionMatrix();

    const headGroup = new THREE.Group();
    headGroup.position.y = groupY;

    // Head mesh — medium defaults
    const headH = HEAD_HEIGHT_PRESETS['medium'].height;
    const headW = HEAD_WIDTH_PRESETS['moderate'].width;
    const { geometry: headGeo, frontZ } = generateHeadGeometry('roundedBox', headW, headH);

    // Voice heads use neutral non-human colors (avoid skin tone associations)
    const faceColor = s.faceColor || '#7eb8c9';
    const scalpColor = s.scalpColor || '#3d6b7a';
    const scalpSplitY = headH - headH * HEAD.scalpFraction;
    const headMat = _twoZoneMaterial(scalpColor, faceColor, scalpSplitY, 0.06);
    const headMesh = new THREE.Mesh(headGeo, headMat);
    headMesh.castShadow = true;
    headGroup.add(headMesh);

    // Eyes — canvas texture on planes (matches character creator style)
    const exo = FACE_FEATURES.eye.xOffsetByWidth.moderate;
    const eyo = FACE_FEATURES.eye.yOffsetByHeight.medium;
    const myo = FACE_FEATURES.mouth.yOffsetByHeight.medium;
    const skinH = headH - headH * HEAD.scalpFraction;
    const skinCY = skinH / 2;
    const faceZ = frontZ + 0.005;

    const eyeTex = _makeEyeTexture(s.eyeIrisColor || '#808080', s.eyeShape || 'circle', s.eyelashStyle, s.eyelashColor);
    const eyePlaneSize = FACE_FEATURES.eye.scleraDiameter * 1.3;
    const eyeGeo = new THREE.PlaneGeometry(eyePlaneSize, eyePlaneSize);

    const eyeMatL = new THREE.MeshBasicMaterial({
        map: eyeTex, transparent: true, depthWrite: false, side: THREE.FrontSide,
    });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMatL);
    eyeL.position.set(-exo, skinCY + eyo, faceZ);
    headGroup.add(eyeL);

    const eyeTexR = eyeTex.clone();
    eyeTexR.needsUpdate = true;
    const eyeMatR = new THREE.MeshBasicMaterial({
        map: eyeTexR, transparent: true, depthWrite: false, side: THREE.FrontSide,
    });
    const eyeR = new THREE.Mesh(eyeGeo.clone(), eyeMatR);
    eyeR.position.set(exo, skinCY + eyo, faceZ);
    headGroup.add(eyeR);

    // Eyebrows
    if (s.eyebrowStyle && s.eyebrowStyle !== 'none') {
        const browTexL = makeEyebrowTexture(s.eyebrowStyle, s.eyebrowColor || scalpColor, false);
        const browTexR = makeEyebrowTexture(s.eyebrowStyle, s.eyebrowColor || scalpColor, true);
        if (browTexL && browTexR) {
            const browSize = eyePlaneSize * 1.3;
            const browGeo2 = new THREE.PlaneGeometry(browSize, browSize * 0.5);
            const browMatL2 = new THREE.MeshBasicMaterial({ map: browTexL, transparent: true, depthWrite: false, side: THREE.FrontSide });
            const browMatR2 = new THREE.MeshBasicMaterial({ map: browTexR, transparent: true, depthWrite: false, side: THREE.FrontSide });
            const browL2 = new THREE.Mesh(browGeo2, browMatL2);
            const browR2 = new THREE.Mesh(browGeo2.clone(), browMatR2);
            const browY2 = skinCY + eyo + eyePlaneSize * 0.55;
            browL2.position.set(-exo, browY2, faceZ + 0.001);
            browR2.position.set(exo, browY2, faceZ + 0.001);
            headGroup.add(browL2);
            headGroup.add(browR2);
        }
    }

    // Mouth rig
    if (_mouthRig) { _mouthRig.dispose(); _mouthRig = null; }
    _mouthRig = new MouthRig();
    if (s.lipColor)     _mouthRig.setLipColor(s.lipColor);
    if (s.lipThickness) _mouthRig.setLipThickness(s.lipThickness);
    _mouthRig.attach(headGroup, skinCY, myo, faceZ);

    _previewGroup.add(headGroup);

    // Apply voice state to engine for preview playback
    _voiceConfigured = _ensureVoice().then(() => {
        if (_voiceReady && _voiceEngine.applyState) _voiceEngine.applyState(s);
    });
}

function _buildFallbackPreview(asset) {
    _camera.position.set(2, 2, 3);
    _camera.lookAt(0, 0.5, 0);
    _camera.fov = 50;
    _camera.updateProjectionMatrix();

    const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.8, 0.8),
        standard(0x6F6F6F),
    );
    box.position.y = 0.5;
    _previewGroup.add(box);
}
