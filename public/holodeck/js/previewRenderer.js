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
import { makeEyeTexture } from './shared/eyeTexture.js';
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
let _thumbnailCallback = null;  // called once after first render with dataURL
let _currentAsset = null;       // asset being previewed (for thumbnail caching)

// ── Browse voice + mouth rig (for "Look at me" in browse preview) ──
let _mouthRig    = null;    // MouthRig instance for the current character preview
let _voiceEngine = null;    // VoiceEngine shared across previews
let _voiceReady  = false;
let _voiceConfigured = null; // Promise that resolves when voice state is applied for current preview

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
    if (_voiceEngine) _voiceEngine.stop();
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

        // Auto-spin via OrbitControls (stops when user interacts)
        if (_controls) {
            _controls.autoRotate      = _autoSpin;
            _controls.autoRotateSpeed = 0.8;
            _controls.update();
        }

        // Update mouth rig from voice engine
        if (_voiceEngine && _mouthRig) {
            _voiceEngine.update(deltaMs);
            _mouthRig.update(_voiceEngine.getVisemeParams());
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
        cone(p) { return new THREE.ConeGeometry(p.radius||0.5, p.height||1, 16); },
        torus(p) { return new THREE.TorusGeometry(p.radius||0.5, p.tubeRadius||p.tube||0.15, 12, 24); },
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
function _makeEyeTexture(irisColor, shape) {
    return makeEyeTexture(irisColor, shape);
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
    const eyeTex = _makeEyeTexture(s.eyeIrisColor, s.eyeShape);
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

    // ── Mouth (real MouthRig for animated visemes) ──
    if (_mouthRig) { _mouthRig.dispose(); _mouthRig = null; }
    _mouthRig = new MouthRig();
    if (s.lipColor) _mouthRig.setLipColor(s.lipColor);
    _mouthRig.mesh.position.set(0, mouthY, frontZ + 0.005);
    _previewGroup.add(_mouthRig.mesh);

    // Init voice engine in background so it's ready for play button
    _ensureVoice();

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

function _buildEnvironmentPreview(asset) {
    _camera.position.set(4, 3, 5);
    _camera.lookAt(0, 0.3, 0);
    _camera.fov = 55;
    _camera.updateProjectionMatrix();

    const p = asset.payload || {};

    // Skybox as scene background
    if (p.skybox?.topColor && p.skybox?.bottomColor) {
        const canvas = document.createElement('canvas');
        canvas.width = 2; canvas.height = 256;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createLinearGradient(0, 0, 0, 256);
        grad.addColorStop(0, p.skybox.topColor);
        grad.addColorStop(1, p.skybox.bottomColor);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 2, 256);
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        _scene.background = tex;
    }

    // Ground color override
    if (p.ground?.color) {
        const ground = _scene.children.find(c => c.geometry?.type === 'PlaneGeometry');
        if (ground) ground.material.color.set(p.ground.color);
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
//  MUSIC PREVIEW (simple visualiser shapes)
// ─────────────────────────────────────────────────────────────────

function _buildMusicPreview(asset) {
    _camera.position.set(0, 2, 4);
    _camera.lookAt(0, 0.5, 0);
    _camera.fov = 60;
    _camera.updateProjectionMatrix();

    const moodColor = asset.payload?.mood_color || '#00D9D9';

    // Floating shape representing the track
    const shape = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.6),
        standard(new THREE.Color(moodColor)),
    );
    shape.position.y = 1.2;
    _previewGroup.add(shape);

    // Orbiting smaller shapes
    const count = Math.min(Math.floor((asset.payload?.bpm || 120) / 30), 6);
    for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const r = 1.5;
        const mini = new THREE.Mesh(
            new THREE.SphereGeometry(0.12, 16, 16),
            standard(new THREE.Color(moodColor), { roughness: 0.3 }),
        );
        mini.position.set(Math.cos(angle) * r, 0.8 + Math.sin(angle * 2) * 0.3, Math.sin(angle) * r);
        _previewGroup.add(mini);
    }
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

    const eyeTex = _makeEyeTexture(s.eyeIrisColor || '#808080', s.eyeShape || 'circle');
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
