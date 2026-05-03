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
import { Line2 }        from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { SCENE, LIGHT } from './shared/palette.js';
import { standard, groundMaterial, gridColors } from './shared/materials.js';
import { BUILDERS } from './shared/primitives.js';
import { MouthRig } from './shared/mouthRig.js';
import { VoiceEngine } from './shared/voiceEngine.js';
import { MusicEngine } from './shared/musicEngine.js?v=2';
import { musicPlayer } from './shared/musicPlayer.js?v=2';
import { assetToTheme } from './shared/musicCompiler.js?v=2';
import { buildMusicVisualizer, deriveBackgroundColor } from './shared/musicVisualizer.js?v=4';
import {
    buildArchetypeHead,
    runStoryPlayback,
    showSubtitle,
    setSubtitleWord,
    hideSubtitle,
    removeSubtitle,
    updateStoryNameTags,
    removeStoryNameTags,
    pickThreeBeats,
    speakWithArchetype,
    animateStoryHeads,
} from './shared/archetypeHead.js?v=6';
import { makeEyeTexture, makeEyebrowTexture } from './shared/eyeTexture.js';
import { generateHeadGeometry } from './shared/headShapes.js';
import { generateBodyGeometry } from './shared/bodyShapes.js';
import {
    CHARACTER, HEAD, COLOR_ZONES, HAND,
    BODY_HEIGHT_PRESETS, BODY_WIDTH_PRESETS,
    HEAD_HEIGHT_PRESETS, HEAD_WIDTH_PRESETS,
    FACE_FEATURES, FACE_PLACEMENT_PRESETS, DEFAULT_COLORS,
} from './shared/charConfig.js';
import { buildCharacterMesh } from './shared/characterMesh.js?v=5';
import { loadGlobalAssets } from './assetLoader.js';
import {
    STAGE_SIZE as _ENV_STAGE_SIZE,
    cellToWorld as _envCellToWorld,
    inCameraCorridor as _envInCameraCorridor,
    DEFAULT_CAMERA,
    SIM_CAMERA,
    CAST_LAYOUT,
    ORBIT_MAX_DISTANCE,
    propHeightCap,
    groundObjHeightCap,
} from './shared/envGeometry.js?v=5';
import { computeShotPose, pickShot, SHOTS } from './shared/cameraShots.js?v=2';
import { AnimationRig, pickAnimation, animationState } from './shared/animationRig.js?v=4';

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
let _initialCamPos = null;      // camera pose captured at preview build time
let _initialTarget = null;      // controls target captured at preview build time
let _resetRaf = null;           // active reset tween

// Bumped on every showPreview / destroyPreview. Async builders capture the
// id at start and bail if it changed before they could apply their result —
// otherwise stale music plays and stale meshes leak into a new preview.
let _previewSession = 0;

// ── Browse voice + mouth rig (for "Look at me" in browse preview) ──
let _mouthRig    = null;    // MouthRig instance for the current character preview
let _voiceEngine = null;    // VoiceEngine shared across previews
let _voiceReady  = false;
let _voiceConfigured = null; // Promise that resolves when voice state is applied for current preview

// Closed-mouth rest pose fed to non-speaking sim heads each tick so their
// viseme shapes don't freeze mid-word when the speaker changes. Matches
// the same constant used in SimulationBridge.
const _MOUTH_REST_PARAMS = { jawOpen: 0, lipWidth: 0.45, lipRound: 0, tongueUp: 0, teethShow: 0 };

// Beat-emotion → Mixamo-emotion mapping. Beats use a richer vocabulary
// (wary / tender / wry / etc.); the animation library covers seven core
// emotions. Map to the closest match; fall back to neutral.
const _BEAT_EMOTION_MAP = {
    // angry-ish
    'angry': 'angry', 'cold': 'angry', 'cruel': 'angry', 'fierce': 'angry',
    // disgusted
    'disgust': 'disgust', 'disgusted': 'disgust',
    // happy / warm
    'happy': 'happy', 'joyful': 'happy', 'warm': 'happy', 'tender': 'happy',
    'welcoming': 'happy', 'wholesome': 'happy', 'wry': 'happy', 'arch': 'happy',
    // sad
    'sad': 'sad', 'ache': 'sad', 'melancholy': 'sad', 'somber': 'sad',
    // scared / wary
    'scared': 'scared', 'wary': 'scared', 'nervous': 'scared', 'anxious': 'scared',
    // surprised
    'surprised': 'surprised', 'awed': 'surprised', 'stunned': 'surprised',
    // neutral / contemplative / deadpan / reverent / measured / curious / resolute / resigned
    // (everything else falls through to neutral)
};
function _resolveBeatEmotion(beat) {
    const e = String(beat?.emotion || '').toLowerCase();
    return _BEAT_EMOTION_MAP[e] || 'neutral';
}

// Map a beat's mixamo-emotion + tension to musicPlayer dials (valence ∈ [0,1]
// = sad↔happy; complexity ∈ [0,1] = sparse↔dense). Speed stays fixed for now —
// the theme's tempo carries musical character; modulating it tends to lurch.
const _EMOTION_VALENCE = {
    happy:     0.85,
    surprised: 0.75,
    neutral:   0.50,
    scared:    0.30,
    disgust:   0.25,
    angry:     0.20,
    sad:       0.15,
};
function _beatToMusicDials(beat) {
    const emotion   = _resolveBeatEmotion(beat);
    const valence   = _EMOTION_VALENCE[emotion] ?? 0.5;
    // Tension 1..6 → complexity 0.15..0.85 (calm → busy).
    const t = Math.max(1, Math.min(6, Number(beat?.tension) || 3));
    const complexity = 0.15 + ((t - 1) / 5) * 0.70;
    return { valence, complexity };
}

// Map a per-line shot override (human or AI-emitted) to the canonical
// SHOTS enum. Tolerates underscores, hyphens, and a few common aliases
// so an author can write `shot: "close-up"` or `shot: "close"` without
// the override silently falling through to the style default.
const _SHOT_ALIASES = {
    'wide':       SHOTS.wide,       'wideshot':       SHOTS.wide,
    'close':      SHOTS.close_up,   'closeup':        SHOTS.close_up,
    'close_up':   SHOTS.close_up,   'close-up':       SHOTS.close_up,
    'two':        SHOTS.two_shot,   'two_shot':       SHOTS.two_shot,
    'two-shot':   SHOTS.two_shot,   'twoshot':        SHOTS.two_shot,
};
function _normaliseShot(input) {
    if (!input) return null;
    const key = String(input).toLowerCase().replace(/\s+/g, '');
    return _SHOT_ALIASES[key] || null;
}

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

// Environment preview state — populated by _buildEnvironmentPreview, consumed
// in the tick loop for dynamic wall + ground-object culling and weather.
let _envPreview = null;

// Story preview state — populated by _buildStoryPreview, consumed in the tick
// loop for head bob + mouth wiggle, and torn down on showPreview / destroyPreview.
let _storyPreview = null;

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

/**
 * Tween the preview camera back to the pose captured when the current
 * preview was built. Used by the global reset button while browsing.
 */
export function previewResetView() {
    if (!_controls || !_initialCamPos) return;
    // Also stop any auto-rotate so the camera doesn't fight the tween.
    _autoSpin = false;

    const fromPos = _camera.position.clone();
    const fromTgt = _controls.target.clone();
    const toPos   = _initialCamPos.clone();
    const toTgt   = _initialTarget ? _initialTarget.clone() : new THREE.Vector3(0, 0, 0);
    const duration = 500;
    const startTime = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 4);

    if (_resetRaf) cancelAnimationFrame(_resetRaf);
    const step = (now) => {
        const t = Math.min(1, (now - startTime) / duration);
        const e = ease(t);
        _camera.position.lerpVectors(fromPos, toPos, e);
        _controls.target.lerpVectors(fromTgt, toTgt, e);
        _controls.update();
        if (t < 1) _resetRaf = requestAnimationFrame(step);
        else       _resetRaf = null;
    };
    _resetRaf = requestAnimationFrame(step);
}

/* ── Environment preview: rotation on/off is the "playback" control ── */
export function previewPlayEnvironment() {
    // Reset ping-pong so rotation starts from a neutral angle.
    _pingPongAngle = 0;
    _pingPongDir   = 1;
    _autoSpin = true;
}
export function previewStopEnvironment() {
    _autoSpin = false;
}
export function isPreviewEnvironmentPlaying() {
    // Only "playing" when an environment is actively being previewed
    // AND auto-rotate is on. Otherwise (no preview, or previewing a
    // different asset type), report false so UI like the reset button
    // doesn't wrongly hide itself.
    return _currentAsset?.type === 'environment' && _autoSpin;
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

    // Bump session so any in-flight async builders / music plays from a
    // previous preview no-op when they finally resolve.
    _previewSession++;

    // Tear down previous preview if any
    _stopLoop();
    if (_musicViz?.viz) { try { _musicViz.viz.dispose(); } catch {} }
    _musicViz = null;
    _envPreview = null;
    _teardownStoryPreview();
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
    _controls.maxDistance   = ORBIT_MAX_DISTANCE;
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
        _autoSpin = false;  // envs stay still until user hits Play or toggles Auto-play
        if (_controls) _controls.target.set(0, 0.3, 0);
    } else if (type === 'music') {
        _buildMusicPreview(asset);
        _autoSpin = false;  // clumped cluster — no rotation, see musicVisualizer.js
        if (_controls) _controls.target.set(0, 1.0, 0);
    } else if (type === 'voice') {
        _buildVoicePreview(asset);
        _autoSpin = false;  // voice heads face forward, no spin
        if (_controls) _controls.target.set(0, 0.7, 0);
    } else if (type === 'asset' || type === 'image') {
        _buildImagePreview(asset);
        _autoSpin = false;  // 2D images don't rotate
        if (_controls) _controls.target.set(0, 1, 0);
    } else if (type === 'story') {
        _buildStoryPreview(asset);
        _autoSpin = false;  // story preview is a read-through — camera stays put
        if (_controls) _controls.target.set(0, 0.95, -0.25);
    } else if (type === 'simulation') {
        _buildSimulationPreview(asset);
        _autoSpin = false;  // simulation preview mirrors story framing
        if (_controls) _controls.target.set(0, 0.95, -0.25);
    } else {
        _buildFallbackPreview(asset);
        if (_controls) _controls.target.set(0, 0.5, 0);
    }
    if (_controls) _controls.update();

    // Snapshot the initial camera pose so resetView() can return to it.
    _initialCamPos = _camera.position.clone();
    _initialTarget = _controls ? _controls.target.clone() : null;

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
    _previewSession++;
    _stopLoop();
    if (_musicViz?.viz) { try { _musicViz.viz.dispose(); } catch {} }
    _musicViz = null;
    _envPreview = null;
    _teardownStoryPreview();
    removeSubtitle();
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

        // Wrap the entire frame body — a throw inside any per-frame system
        // (story heads, music viz, env culling) would otherwise abort tick
        // before _renderer.render(), freezing the scene visually even though
        // controls are still updating internally.
        try {

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

        // Advance the voice engine so visemeEngine keeps producing fresh
        // jawOpen + viseme params. The character/voice preview writes those
        // params to its singleton mouthRig; the story preview reads them back
        // below to drive amp-based head jiggle + per-head talkParams.
        if (_voiceEngine) _voiceEngine.update(deltaMs);
        if (_voiceEngine && _mouthRig) {
            _mouthRig.update(_voiceEngine.getVisemeParams());
        }

        // Environment preview: dynamic culling + weather
        if (_envPreview) {
            if (_envPreview.walls) _envCullWalls(_envPreview.walls, _camera);
            if (_envPreview.groundObjs.length) _envCullGroundObjects(_envPreview.groundObjs, _camera);
            if (_envPreview.weather) _envTickWeather(_envPreview.weather, delta);
        }

        // Story preview: amp-driven mouth + head jiggle on the speaking slot.
        if (_storyPreview) {
            const visemeParams = _voiceEngine ? _voiceEngine.getVisemeParams() : null;
            const amp = visemeParams ? Math.max(0, Math.min(1, visemeParams.jawOpen || 0)) : 0;
            animateStoryHeads(_storyPreview.heads, {
                speakingSlot: _storyPreview.speakingSlot,
                amp,
                visemeParams,
                t: performance.now() * 0.001,
            });
            // Asset-built character heads have their own mouthRig +
            // facialHairRig (animateStoryHeads only handles archetype heads'
            // .talk function). Drive the speaker's rigs with the live
            // visemeParams; everyone else gets a closed-mouth rest pose so
            // their lips don't freeze mid-shape on a previous viseme.
            //
            // Animation rig also runs here — Mixamo body/torso/head
            // quaternion overlays the synthetic idle bob from
            // animateStoryHeads (position-only) so they coexist cleanly.
            for (const h of _storyPreview.heads) {
                if (h.animationRig) {
                    h.animationRig.update(delta);
                    // Auto-fall-back: if a one-shot talk anim just ended,
                    // seed back to a matching idle so the head doesn't
                    // freeze mid-pose.
                    if (h.animationRig.isFinished()) {
                        const fallback = pickAnimation(_storyPreview.animationLibrary, {
                            emotion: h.animationRig.currentEmotion() || 'neutral',
                            intent:  'idle',
                        });
                        if (fallback) h.animationRig.play(animationState(fallback));
                    }
                }
                if (h.isArchetype) continue;
                const isSpeaker = h.slot === _storyPreview.speakingSlot;
                const params = (isSpeaker && visemeParams) ? visemeParams : _MOUTH_REST_PARAMS;
                h.mouthRig?.update(params);
                h.facialHairRig?.update(params);
            }
            // Floating archetype name over the speaking head + word-by-word subtitle.
            updateStoryNameTags(
                _storyPreview.heads,
                _storyPreview.speakingSlot,
                _camera,
                _renderer.domElement,
            );
            if (_storyPreview.speakingSlot && visemeParams && visemeParams.wordIdx >= 0) {
                setSubtitleWord(visemeParams.wordIdx);
            }
        }

        // Update music visualizer — pulses driven by REAL per-role
        // fire times from the shared musicPlayer singleton. When no
        // music is playing the cluster sits still.
        if (_musicViz) {
            const playing = musicPlayer.isPlaying();
            _musicViz.viz.tick({
                isPlaying:   playing,
                firesByRole: playing ? musicPlayer.getLastFireByRole() : null,
            });
        }

        } catch (e) {
            console.warn('[previewRenderer] tick body threw, continuing:', e?.message);
        }

        // Always render — even if a per-frame system threw, the user should
        // still see the scene update.
        try { _renderer.render(_scene, _camera); } catch { /* renderer dead */ }

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

    // Square-on default, matching ObjectBridge editor framing.
    _camera.position.set(0, 2.0, 4.0);
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

/**
 * Apply the canonical Scene3D look to the preview scene —
 * mid-grey backdrop, 21x21 world grid, 5x5 stage perimeter,
 * inner stage grid, flat lighting, no placeholder cube.
 * Used for blank-template environments (e.g. env_default).
 */
function _applyScene3DLook() {
    // Nuke everything in the current scene except the _previewGroup root
    // so we can start from a clean canvas.
    const toRemove = [];
    _scene.traverse(obj => {
        if (obj === _scene || obj === _previewGroup) return;
        if (obj.parent === _previewGroup) return;
        if (obj.isMesh || obj.isLine || obj.isGridHelper || obj.isLight) {
            toRemove.push(obj);
        }
    });
    for (const obj of toRemove) {
        obj.geometry?.dispose?.();
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose?.());
        else obj.material?.dispose?.();
        obj.parent?.remove(obj);
    }

    // Mid-grey scene background
    _scene.background = new THREE.Color(0x5A5A5A);

    // Camera pose matching Scene3D — DEFAULT_CAMERA (square-on)
    _camera.position.set(...DEFAULT_CAMERA.pos);
    _camera.lookAt(...DEFAULT_CAMERA.target);
    if (_controls) _controls.target.set(...DEFAULT_CAMERA.target);

    // 21x21 world grid
    const worldGrid = new THREE.GridHelper(21, 21, 0x2F2F2F, 0x2F2F2F);
    worldGrid.material.opacity     = 0.3;
    worldGrid.material.transparent = true;
    _scene.add(worldGrid);

    // 5x5 stage perimeter (thick line)
    const c = _container;
    const perimPositions = [
        -2.5, 0.01, -2.5,
         2.5, 0.01, -2.5,
         2.5, 0.01,  2.5,
        -2.5, 0.01,  2.5,
        -2.5, 0.01, -2.5,
    ];
    const perimGeo = new LineGeometry();
    perimGeo.setPositions(perimPositions);
    const perimMat = new LineMaterial({
        color: 0xC8C8C8,
        linewidth: 3,
        resolution: new THREE.Vector2(c.clientWidth, c.clientHeight),
    });
    const perimLine = new Line2(perimGeo, perimMat);
    perimLine.computeLineDistances();
    _scene.add(perimLine);

    // Inner stage grid lines
    const innerMat = new THREE.LineBasicMaterial({
        color: 0xB0B0B0, opacity: 0.4, transparent: true,
    });
    for (let i = -1.5; i <= 1.5; i += 1) {
        _scene.add(new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(i, 0.01, -2.5),
                new THREE.Vector3(i, 0.01,  2.5),
            ]), innerMat
        ));
        _scene.add(new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(-2.5, 0.01, i),
                new THREE.Vector3( 2.5, 0.01, i),
            ]), innerMat
        ));
    }

    // Flat lights — ambient + one directional
    _scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 10, 5);
    _scene.add(dir);
}

// ─── Environment preview shared helpers (mirror EnvironmentBridge) ──
// Stage geometry + BINGO grid + camera corridor all live in
// shared/envGeometry.js — imported at the top of this file as `_ENV_STAGE_SIZE`,
// `_envCellToWorld`, `_envInCameraCorridor` so the thousand-call-site sweep
// stays a zero-behaviour-change consolidation.

const _ENV_WALL_THICK   = 0.25;
const _ENV_ORB_RANGE    = 9;
const _ENV_SKY_RADIUS   = 50;

// Density + size constants (mirror EnvironmentBridge)
// Height caps are scaleClass-aware — see propHeightCap / groundObjHeightCap
// imported from shared/envGeometry.js. The site-local references below pass
// the env's scaleClass through.
const _ENV_SCATTER_COUNTS    = { low: 6, med: 14, high: 28 };
const _ENV_TILE_SPACING      = { low: 3.5, med: 2.5, high: 1.8 };
const _ENV_STAGE_SCATTER     = { low: 3, med: 6, high: 10 };
const _ENV_STAGE_TILE        = { low: 2.0, med: 1.4, high: 1.0 };

// Weather constants
const _ENV_WEATHER_COUNT   = 500;
const _ENV_WEATHER_SPREAD  = 14;
const _ENV_WEATHER_HEIGHT  = 12;
const _ENV_WEATHER_CFG = {
    snow:   { size: 0.12, color: 0xffffff, speed: 1.2, drift: 0.6, opacity: 0.85 },
    rain:   { size: 0.06, color: 0xaaccee, speed: 8.0, drift: 0.3, opacity: 0.5  },
    leaves: { size: 0.15, color: 0x88aa44, speed: 0.8, drift: 1.5, opacity: 0.9  },
};

// Object manifest + asset JSON caches (shared across env previews in a session)
let _envObjectList = null;
async function _envLoadObjectList() {
    if (_envObjectList) return _envObjectList;
    try {
        const res = await fetch('global_assets/objects/manifest.json');
        const manifest = await res.json();
        const list = [];
        const skip = new Set(['headwear', 'items', 'panels', 'fashion']);
        for (const [catKey, cat] of Object.entries(manifest.categories)) {
            if (skip.has(catKey)) continue;
            for (const file of cat.files) {
                const id = file.replace('.json', '');
                list.push({ id, path: `global_assets/objects/${catKey}/${file}` });
            }
        }
        _envObjectList = list;
    } catch { _envObjectList = []; }
    return _envObjectList;
}

const _envAssetCache = new Map();
async function _envFetchAsset(path) {
    if (_envAssetCache.has(path)) return _envAssetCache.get(path);
    const res  = await fetch(path);
    const data = await res.json();
    _envAssetCache.set(path, data);
    return data;
}

/** Build a Three.js Group from an object asset's element list. Bottom sits at y=0. */
function _envBuildMeshFromAsset(asset) {
    const elements = asset?.payload?._editor?.elements;
    if (!elements || !elements.length) return null;
    const colors = asset.payload.color_assignments || {};

    const group = new THREE.Group();
    for (const el of elements) {
        let geom;
        switch (el.type) {
            case 'box':
                geom = new THREE.BoxGeometry(el.width || 1, el.height || 1, el.depth || 1); break;
            case 'cylinder':
                geom = new THREE.CylinderGeometry(
                    el.radiusTop ?? 0.5, el.radiusBottom ?? 0.5, el.height || 1, 16); break;
            case 'cone':
                geom = new THREE.ConeGeometry(el.radius ?? 0.5, el.height || 1, 16); break;
            case 'sphere':
                geom = new THREE.SphereGeometry(el.radius ?? 0.5, 16, 12); break;
            case 'torus':
                geom = new THREE.TorusGeometry(el.radius ?? 0.5, el.tube ?? 0.2, 12, 24); break;
            default:
                geom = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        }
        const hex = (typeof el.fill === 'string' && colors[el.fill])
            ? colors[el.fill] : (el.fill || '#888888');
        const mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(hex),
            roughness: el.roughness ?? 0.85,
            metalness: el.metalness ?? 0,
            transparent: (el.opacity ?? 1) < 1,
            opacity: el.opacity ?? 1,
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(el.px || 0, el.py || 0, el.pz || 0);
        mesh.rotation.set(el.rx || 0, el.ry || 0, el.rz || 0);
        mesh.castShadow = true;
        group.add(mesh);
    }
    const box3 = new THREE.Box3().setFromObject(group);
    if (box3.min.y !== 0) group.children.forEach(c => { c.position.y -= box3.min.y; });
    group.userData._templateHeight = box3.max.y - box3.min.y;
    return group;
}

function _envDisposeGroup(g) {
    g.traverse(child => {
        child.geometry?.dispose?.();
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose?.());
        else child.material?.dispose?.();
    });
}

/** Scatter points inside the stage area, avoiding occupied cast cells. */
function _envStageScatterPoints(count, usedCells) {
    const pts = [];
    let tries = 0;
    while (pts.length < count && tries < count * 20) {
        const x = (Math.random() - 0.5) * _ENV_STAGE_SIZE;
        const z = (Math.random() - 0.5) * _ENV_STAGE_SIZE;
        tries++;
        let blocked = false;
        for (const c of usedCells) {
            const p = _envCellToWorld(c);
            if (p && Math.abs(x - p.x) < 0.4 && Math.abs(z - p.z) < 0.4) {
                blocked = true; break;
            }
        }
        if (blocked) continue;
        pts.push({ x, z, rotY: Math.random() * Math.PI * 2 });
    }
    return pts;
}

/** Regular grid inside the stage area, skipping occupied cast cells. */
function _envStageTilePoints(spacing, usedCells) {
    const half = _ENV_STAGE_SIZE / 2;
    const pts = [];
    for (let x = -half + spacing / 2; x < half; x += spacing) {
        for (let z = -half + spacing / 2; z < half; z += spacing) {
            let blocked = false;
            for (const c of usedCells) {
                const p = _envCellToWorld(c);
                if (p && Math.abs(x - p.x) < 0.4 && Math.abs(z - p.z) < 0.4) {
                    blocked = true; break;
                }
            }
            if (blocked) continue;
            pts.push({ x, z, rotY: 0 });
        }
    }
    return pts;
}

/** Scatter random points across the ground, avoiding stage + camera corridor. */
function _envGroundScatterPoints(halfGround, count, stageHalf) {
    const pts = [];
    let tries = 0;
    while (pts.length < count && tries < count * 20) {
        const x = (Math.random() - 0.5) * halfGround * 2;
        const z = (Math.random() - 0.5) * halfGround * 2;
        tries++;
        if (Math.abs(x) < stageHalf && Math.abs(z) < stageHalf) continue;
        if (_envInCameraCorridor(x, z, stageHalf)) continue;
        pts.push({ x, z, rotY: Math.random() * Math.PI * 2 });
    }
    return pts;
}

/** Regular grid across the ground, skipping stage + camera corridor. */
function _envGroundTilePoints(halfGround, spacing, stageHalf) {
    const pts = [];
    for (let x = -halfGround + spacing / 2; x < halfGround; x += spacing) {
        for (let z = -halfGround + spacing / 2; z < halfGround; z += spacing) {
            if (Math.abs(x) < stageHalf && Math.abs(z) < stageHalf) continue;
            if (_envInCameraCorridor(x, z, stageHalf)) continue;
            pts.push({ x, z, rotY: 0 });
        }
    }
    return pts;
}

/** Build a weather particle system matching EnvironmentBridge behaviour. */
function _envBuildWeather(type, hasWalls) {
    const cfg = _ENV_WEATHER_CFG[type];
    if (!cfg) return null;
    const count = _ENV_WEATHER_COUNT;
    const positions = new Float32Array(count * 3);
    const vels      = new Float32Array(count * 3);
    const stageHalf = _ENV_STAGE_SIZE / 2;

    for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        let x, z;
        do {
            x = (Math.random() - 0.5) * _ENV_WEATHER_SPREAD * 2;
            z = (Math.random() - 0.5) * _ENV_WEATHER_SPREAD * 2;
        } while (hasWalls && Math.abs(x) < stageHalf && Math.abs(z) < stageHalf);

        positions[i3]     = x;
        positions[i3 + 1] = Math.random() * _ENV_WEATHER_HEIGHT;
        positions[i3 + 2] = z;

        const vary = 0.7 + Math.random() * 0.6;
        vels[i3]     = (Math.random() - 0.5) * cfg.drift;
        vels[i3 + 1] = -cfg.speed * vary;
        vels[i3 + 2] = (Math.random() - 0.5) * cfg.drift;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    if (type === 'leaves') {
        const colors = new Float32Array(count * 3);
        const palette = [
            new THREE.Color(0x88aa44), new THREE.Color(0x669933),
            new THREE.Color(0xbbaa33), new THREE.Color(0xcc8833),
            new THREE.Color(0xaa5522),
        ];
        for (let i = 0; i < count; i++) {
            const c = palette[Math.floor(Math.random() * palette.length)];
            colors[i * 3]     = c.r;
            colors[i * 3 + 1] = c.g;
            colors[i * 3 + 2] = c.b;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }

    const mat = new THREE.PointsMaterial({
        size: cfg.size,
        color: type === 'leaves' ? 0xffffff : cfg.color,
        vertexColors: type === 'leaves',
        transparent: true,
        opacity: cfg.opacity,
        depthWrite: false,
        sizeAttenuation: true,
        fog: true,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    return { points, vels, type, hasWalls };
}

/** Advance weather particles by delta seconds. */
function _envTickWeather(w, delta) {
    const pos   = w.points.geometry.attributes.position;
    const arr   = pos.array;
    const vels  = w.vels;
    const count = pos.count;
    const stageH = _ENV_STAGE_SIZE / 2;
    const drift = _ENV_WEATHER_CFG[w.type]?.drift || 0;
    const time  = performance.now() * 0.001;

    for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        arr[i3]     += vels[i3]     * delta;
        arr[i3 + 1] += vels[i3 + 1] * delta;
        arr[i3 + 2] += vels[i3 + 2] * delta;

        if (w.type !== 'rain') {
            arr[i3]     += Math.sin(time + i * 0.37) * drift * 0.3 * delta;
            arr[i3 + 2] += Math.cos(time + i * 0.53) * drift * 0.3 * delta;
        }

        const y = arr[i3 + 1];
        const x = arr[i3];
        const z = arr[i3 + 2];
        const outOfBounds = y < 0 ||
            Math.abs(x) > _ENV_WEATHER_SPREAD ||
            Math.abs(z) > _ENV_WEATHER_SPREAD;
        const insideWalls = w.hasWalls && Math.abs(x) < stageH && Math.abs(z) < stageH;

        if (outOfBounds || insideWalls) {
            let nx, nz;
            do {
                nx = (Math.random() - 0.5) * _ENV_WEATHER_SPREAD * 2;
                nz = (Math.random() - 0.5) * _ENV_WEATHER_SPREAD * 2;
            } while (w.hasWalls && Math.abs(nx) < stageH && Math.abs(nz) < stageH);
            arr[i3]     = nx;
            arr[i3 + 1] = _ENV_WEATHER_HEIGHT + Math.random() * 2;
            arr[i3 + 2] = nz;
        }
    }
    pos.needsUpdate = true;
}

/** Dynamic wall culling: hide walls between camera and stage. Mirrors EnvironmentBridge. */
function _envCullWalls(walls, camera) {
    if (!walls) return;
    const cx = camera.position.x;
    const cz = camera.position.z;
    const ax = Math.abs(cx);
    const az = Math.abs(cz);

    walls.back.visible  = true;
    walls.front.visible = true;
    walls.left.visible  = true;
    walls.right.visible = true;

    const ratio = Math.max(ax, az) / (Math.min(ax, az) + 0.001);
    if (ratio > 2.5) {
        if (ax > az) {
            if (cx > 0) walls.right.visible = false;
            else        walls.left.visible  = false;
        } else {
            if (cz > 0) walls.front.visible = false;
            else        walls.back.visible  = false;
        }
    } else {
        if (cx > 0) walls.right.visible = false;
        else        walls.left.visible  = false;
        if (cz > 0) walls.front.visible = false;
        else        walls.back.visible  = false;
    }
}

/** Dynamic ground-object culling: hide tall objects between camera and stage. */
function _envCullGroundObjects(meshes, camera) {
    if (!meshes || !meshes.length) return;
    const cx = camera.position.x;
    const cz = camera.position.z;
    const camLen = Math.sqrt(cx * cx + cz * cz) || 1;
    const cnx = cx / camLen;
    const cnz = cz / camLen;
    const cosThr   = Math.cos(Math.PI * 2 / 9);
    const stageHalf = _ENV_STAGE_SIZE / 2 + 0.5;
    const heightThr = 0.8;

    for (let i = 0; i < meshes.length; i++) {
        const m = meshes[i];
        const ox = m.position.x;
        const oz = m.position.z;
        const oLen = Math.sqrt(ox * ox + oz * oz);
        if (oLen < stageHalf) { m.visible = true; continue; }
        const worldH = m.userData._worldHeight || 0;
        if (worldH < heightThr) { m.visible = true; continue; }
        const dot = (ox * cnx + oz * cnz) / (oLen || 1);
        m.visible = dot <= cosThr;
    }
}

function _envTinted(hex) {
    const c = new THREE.Color(hex);
    c.lerp(new THREE.Color(0xffffff), 0.5);
    return c;
}

function _buildEnvSkySphere(skyTop, skyMid, skyBot) {
    const geo = new THREE.SphereGeometry(_ENV_SKY_RADIUS, 32, 16);
    const top = new THREE.Color(skyTop);
    const mid = new THREE.Color(skyMid);
    const bot = new THREE.Color(skyBot);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const t = y / _ENV_SKY_RADIUS;
        const k = Math.pow(Math.abs(t), 1.7);
        const color = t >= 0 ? mid.clone().lerp(top, k) : mid.clone().lerp(bot, k);
        colors[i * 3]     = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.MeshBasicMaterial({
        vertexColors: true, side: THREE.BackSide, depthWrite: false, fog: false,
    });
    const sphere = new THREE.Mesh(geo, mat);
    sphere.renderOrder = -1;
    return sphere;
}

function _buildEnvWalls(state) {
    const h = state.walls || 0;
    if (h === 0) return null;

    const group = new THREE.Group();
    const t     = _ENV_WALL_THICK;
    const W     = _ENV_STAGE_SIZE;
    const halfW = W / 2;
    const SILL = 0.5, LINT = 0.5, SIDE = 0.5, GUT = 0.25;

    const style = state.windowStyle || 'none';
    const count = style === 'single' ? 1 : style === 'double' ? 2 : style === 'triple' ? 3 : 0;
    const hasWindows = count > 0 && h >= 2;
    const winH = Math.max(0, h - SILL - LINT);

    const wallMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(state.wallColor || '#696a6a'),
        roughness: 0.85,
    });
    const paneMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(state.windowColor || '#8ec8f0'),
        roughness: 0.3, metalness: 0.1,
        transparent: true,
        opacity: state.windowOpacity ?? 0.25,
        side: THREE.DoubleSide,
    });

    let winW = 0;
    const winCentres = [];
    if (hasWindows) {
        const interiorW = W - SIDE * 2;
        winW = (interiorW - (count - 1) * GUT) / count;
        let x = -halfW + SIDE + winW / 2;
        for (let i = 0; i < count; i++) { winCentres.push(x); x += winW + GUT; }
    }

    const walls = {};
    const buildWall = (wallOrigin, isVertical, name) => {
        const sub = new THREE.Group();
        sub.name = name;
        sub.position.copy(wallOrigin);
        const addSlab = (along, y, width, height, isPane = false) => {
            const depth = isPane ? t * 0.3 : t;
            const geom = isVertical
                ? new THREE.BoxGeometry(depth, height, width)
                : new THREE.BoxGeometry(width, height, depth);
            const m = new THREE.Mesh(geom, isPane ? paneMat : wallMat);
            if (isVertical) m.position.set(0, y, along);
            else            m.position.set(along, y, 0);
            if (!isPane) { m.castShadow = true; m.receiveShadow = true; }
            sub.add(m);
        };

        if (!hasWindows) {
            addSlab(0, h / 2, W, h);
        } else {
            addSlab(0, SILL / 2,     W, SILL);
            addSlab(0, h - LINT / 2, W, LINT);
            const pillarY = SILL + winH / 2;
            addSlab(-halfW + SIDE / 2, pillarY, SIDE, winH);
            addSlab( halfW - SIDE / 2, pillarY, SIDE, winH);
            for (let i = 0; i < winCentres.length - 1; i++) {
                const mid = (winCentres[i] + winCentres[i + 1]) / 2;
                addSlab(mid, pillarY, GUT, winH);
            }
            for (const cx of winCentres) {
                addSlab(cx, pillarY, winW * 0.98, winH * 0.98, true);
            }
        }
        group.add(sub);
        walls[name] = sub;
    };

    buildWall(new THREE.Vector3(0, 0, -halfW - t / 2), false, 'back');
    buildWall(new THREE.Vector3(0, 0,  halfW + t / 2), false, 'front');
    buildWall(new THREE.Vector3(-halfW - t / 2, 0, 0), true,  'left');
    buildWall(new THREE.Vector3( halfW + t / 2, 0, 0), true,  'right');
    return { group, walls };
}

async function _buildEnvironmentPreview(asset) {
    // Square-on default — DEFAULT_CAMERA from shared/envGeometry.js.
    _camera.position.set(...DEFAULT_CAMERA.pos);
    _camera.lookAt(...DEFAULT_CAMERA.target);
    _camera.fov = DEFAULT_CAMERA.fov;
    _camera.updateProjectionMatrix();

    _envPreview = { walls: null, groundObjs: [], props: [], weather: null, ready: false };

    const p = asset.payload || {};
    const s = p.state || {};

    // Blank-template detection: render canonical Scene3D look.
    const skyTop = s.skyTop || s.skyTopColor || p.skybox?.topColor;
    const skyMid = s.skyMid || s.skyHorizonColor || p.skybox?.bottomColor;
    const groundColor = s.groundColor || p.ground?.color;
    const isBlankTemplate =
        asset.id === 'env_default' ||
        (!skyTop && !skyMid && !groundColor &&
         !(p.walls?.length) && !(p.objects?.length) && !(p.images?.length));

    if (isBlankTemplate) {
        _applyScene3DLook();
        return;
    }

    // Remove the default ground/grid/lights added by showPreview — the
    // environment owns its own look.
    const toRemove = [];
    _scene.traverse(obj => {
        if (obj === _scene || obj === _previewGroup) return;
        if (obj.parent === _scene && (obj.isMesh || obj.isGridHelper || obj.isLight)) {
            toRemove.push(obj);
        }
    });
    for (const obj of toRemove) {
        obj.geometry?.dispose?.();
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose?.());
        else obj.material?.dispose?.();
        _scene.remove(obj);
    }
    _scene.background = null;

    // Resolve sky stops — legacy envs supply top+horizon only, synthesize a bot.
    const topHex = skyTop || '#4a5870';
    const midHex = skyMid || skyTop || '#8497ac';
    let botHex = s.skyBot;
    if (!botHex) {
        const m = new THREE.Color(midHex);
        botHex = '#' + m.clone().lerp(new THREE.Color(0xffffff), 0.25).getHexString();
    }

    _previewGroup.add(_buildEnvSkySphere(topHex, midHex, botHex));

    // Ground slab (floating-island look)
    const groundSize = s.groundSize ?? 19;
    const groundMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(groundColor || '#4b692f'),
        roughness: 0.95, metalness: 0,
    });
    const ground = new THREE.Mesh(
        new THREE.BoxGeometry(groundSize, 1, groundSize), groundMat,
    );
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    _previewGroup.add(ground);

    // Stage plane
    const stageMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(s.stageColor || '#595652'),
        roughness: 0.85,
    });
    const stage = new THREE.Mesh(new THREE.PlaneGeometry(_ENV_STAGE_SIZE, _ENV_STAGE_SIZE), stageMat);
    stage.rotation.x = -Math.PI / 2;
    stage.position.y = 0.002;
    stage.receiveShadow = true;
    _previewGroup.add(stage);

    // World grid
    const worldGrid = new THREE.GridHelper(groundSize, groundSize, 0x2F2F2F, 0x2F2F2F);
    worldGrid.material.opacity = 0.3;
    worldGrid.material.transparent = true;
    worldGrid.position.y = 0.004;
    _previewGroup.add(worldGrid);

    // Walls
    const wallsBundle = _buildEnvWalls(s);
    if (wallsBundle) {
        _previewGroup.add(wallsBundle.group);
        _envPreview.walls = wallsBundle.walls;
        _envCullWalls(_envPreview.walls, _camera);
    }

    // Fog
    if (s.fogEnabled) {
        _scene.fog = new THREE.FogExp2(s.fogColor || '#888888', s.fogDensity ?? 0.02);
    } else {
        _scene.fog = null;
    }

    // Ambient + directional
    const ambient = new THREE.AmbientLight(
        _envTinted(s.ambientColor || '#ffffff'),
        s.ambientIntensity ?? 1.2,
    );
    _scene.add(ambient);

    const dir = new THREE.DirectionalLight(
        _envTinted(s.dirColor || '#ffffff'),
        s.dirIntensity ?? 0.4,
    );
    const elev = (s.sunElevation ?? 60) * Math.PI / 180;
    const lightDist = 10;
    dir.position.set(
        lightDist * Math.cos(elev) * 0.9,
        lightDist * Math.sin(elev) + 2,
        lightDist * Math.cos(elev) * 0.5,
    );
    dir.castShadow = true;
    _scene.add(dir);

    // Sun/moon orb behind the stage
    if (s.sunVisible) {
        const sunGeo = new THREE.SphereGeometry(1.5, 16, 12);
        const sunMat = new THREE.MeshBasicMaterial({
            color: new THREE.Color(s.sunColor || '#ffffee'),
            fog: false,
        });
        const sun = new THREE.Mesh(sunGeo, sunMat);
        const orbDist = 35;
        sun.position.set(
            -orbDist * Math.cos(elev) * 0.7,
             orbDist * Math.sin(elev),
            -orbDist * Math.cos(elev) * 0.7,
        );
        _previewGroup.add(sun);
    }

    // Floating orb light
    if (s.orbVisible) {
        const color = new THREE.Color(s.orbColor || '#ffddaa');
        const pt = new THREE.PointLight(color, s.orbIntensity ?? 1.4, _ENV_ORB_RANGE, 2);
        const h = Math.min(3.0, Math.max(1.0, s.orbHeight ?? 2.0));
        pt.position.set(0, h, 0);
        _scene.add(pt);

        const orbMesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.18, 16, 12),
            new THREE.MeshBasicMaterial({ color: color.clone(), fog: false }),
        );
        orbMesh.position.set(0, h, 0);
        _previewGroup.add(orbMesh);
    }

    // Weather particles
    if (s.weather && s.weather !== 'none') {
        const hasWalls = (s.walls || 0) > 0;
        const w = _envBuildWeather(s.weather, hasWalls);
        if (w) {
            _previewGroup.add(w.points);
            _envPreview.weather = w;
        }
    }

    // Capture a reference to this preview session so async fills from an
    // older asset don't pollute the current one.
    const previewRef = _envPreview;

    // Props (stage) + ground objects — async asset loads
    const objectList = await _envLoadObjectList();
    if (_envPreview !== previewRef) return;  // preview changed while awaiting

    // ── Props on stage ──
    const propCap   = propHeightCap(s.scaleClass);
    const usedCells = new Set(
        (s.cast || []).filter(c => c?.cell).map(c => c.cell)
    );
    const propSlots = s.props || [];
    for (const slot of propSlots) {
        if (!slot.assetId || slot.assetId === 'none') continue;
        const entry = objectList.find(o => o.id === slot.assetId);
        if (!entry) continue;

        let asset;
        try { asset = await _envFetchAsset(entry.path); } catch { continue; }
        if (_envPreview !== previewRef) return;

        const template = _envBuildMeshFromAsset(asset);
        if (!template) continue;

        const baseScale = slot.scale ?? 1.0;
        const templateH = template.userData._templateHeight || 1;

        if (slot.mode === 'place') {
            if (!slot.cell) { _envDisposeGroup(template); continue; }
            const pos = _envCellToWorld(slot.cell);
            if (!pos) { _envDisposeGroup(template); continue; }

            const clone = template.clone();
            clone.position.set(pos.x, 0, pos.z);
            clone.rotation.y = Math.random() * Math.PI * 2;
            let sc = baseScale;
            if (templateH * sc > propCap) sc = propCap / templateH;
            clone.scale.set(sc, sc, sc);
            _previewGroup.add(clone);
            _envPreview.props.push(clone);
        } else {
            const points = slot.mode === 'tile'
                ? _envStageTilePoints(_ENV_STAGE_TILE[slot.density] ?? 1.4, usedCells)
                : _envStageScatterPoints(_ENV_STAGE_SCATTER[slot.density] ?? 6, usedCells);
            const isScatter = slot.mode !== 'tile';
            for (const pt of points) {
                const clone = template.clone();
                clone.position.set(pt.x, 0, pt.z);
                clone.rotation.y = pt.rotY;
                let sc = isScatter
                    ? baseScale * (0.7 + Math.random() * 0.6)
                    : baseScale;
                if (templateH * sc > propCap) sc = propCap / templateH;
                clone.scale.set(sc, sc, sc);
                _previewGroup.add(clone);
                _envPreview.props.push(clone);
            }
        }
        _envDisposeGroup(template);
    }

    // ── Ground objects ──
    const groundCap = groundObjHeightCap(s.scaleClass);
    const groundHalf = (s.groundSize ?? 19) / 2;
    const stageHalf  = _ENV_STAGE_SIZE / 2 + 0.5;
    const groundSlots = s.groundObjects || [];
    for (const slot of groundSlots) {
        if (!slot.assetId || slot.assetId === 'none') continue;
        const entry = objectList.find(o => o.id === slot.assetId);
        if (!entry) continue;

        let asset;
        try { asset = await _envFetchAsset(entry.path); } catch { continue; }
        if (_envPreview !== previewRef) return;

        const template = _envBuildMeshFromAsset(asset);
        if (!template) continue;

        const points = slot.mode === 'tile'
            ? _envGroundTilePoints(groundHalf, _ENV_TILE_SPACING[slot.density] ?? 2.5, stageHalf)
            : _envGroundScatterPoints(groundHalf, _ENV_SCATTER_COUNTS[slot.density] ?? 14, stageHalf);

        const baseScale = slot.scale ?? 1.0;
        const isScatter = slot.mode !== 'tile';
        const templateH = template.userData._templateHeight || 1;
        for (const pt of points) {
            const clone = template.clone();
            clone.position.set(pt.x, 0, pt.z);
            clone.rotation.y = pt.rotY;
            let sc = isScatter
                ? baseScale * (0.7 + Math.random() * 0.6)
                : baseScale;
            if (templateH * sc > groundCap) sc = groundCap / templateH;
            clone.scale.set(sc, sc, sc);
            clone.userData._worldHeight = templateH * sc;
            _previewGroup.add(clone);
            _envPreview.groundObjs.push(clone);
        }
        _envDisposeGroup(template);
    }

    // Run a ground-object cull pass now that everything is loaded.
    if (_envPreview === previewRef) {
        _envCullGroundObjects(_envPreview.groundObjs, _camera);
        _envPreview.ready = true;
    }
}

export function isEnvPreviewReady() {
    return _envPreview?.ready === true;
}

// Force a synchronous render of the current scene. Lets the env thumb-farm
// capture the canvas immediately after async prop/ground loads complete
// without waiting for the next rAF tick.
export function renderNow() {
    if (_renderer && _scene && _camera) {
        _renderer.render(_scene, _camera);
    }
}

// ─────────────────────────────────────────────────────────────────
//  MUSIC PREVIEW (enhanced BPM-driven visualiser)
// ─────────────────────────────────────────────────────────────────

// Animation state for music visualizer (still-life via shared module)
let _musicViz = null;

function _buildMusicPreview(asset) {
    _camera.position.set(0, 1.8, 5.8);
    _camera.lookAt(0, 1.0, 0);
    _camera.fov = 55;
    _camera.updateProjectionMatrix();

    // Per-track background — each theme paints its own stage.
    const coverColor = asset?.payload?.state?.coverColor
                    ?? asset?.payload?.mood_color
                    ?? asset?.payload?.coverColor
                    ?? '#5b9bd5';
    if (_scene) {
        _scene.background = deriveBackgroundColor(coverColor);
        // Hide ground + grid added in showPreview — the music view is
        // the floating cluster against the tinted void only.
        for (const child of _scene.children) {
            if (child.type === 'Mesh' && child.geometry?.type === 'PlaneGeometry') child.visible = false;
            if (child.type === 'GridHelper') child.visible = false;
        }
    }

    // Clumped cluster — no rotation. Reactive to real per-role note
    // fires from the shared musicPlayer singleton (see render-loop).
    const viz = buildMusicVisualizer({
        scene:   _previewGroup,
        theme:   asset,
        anchorY: 0,
    });

    _musicViz = { viz, time: 0 };
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

// ── Story preview ───────────────────────────────────────────────
// Three archetype heads arranged as a loose triangle: CHAR_A (main) sits
// one BINGO cell deeper than the side two, and CHAR_B/C are rotated to
// face inward as if mid-conversation — but cheated back toward the camera
// so we don't see them in profile.
// CHAR_A sits front-and-centre; B/C are pulled back + inward so the main
// character reads as the focus. Spacing tightened so the trio feels grouped
// without being crowded — they occupy ~1.8u × 0.85u instead of 2.3u × 1.0u.
const _STORY_POS = {
    CHAR_B: [-0.85, 0.95, -0.55],
    CHAR_A: [ 0.00, 0.95,  0.00],
    CHAR_C: [ 0.85, 0.95, -0.55],
};
const _STORY_ROT_Y = {
    CHAR_B:  Math.PI / 4,   // 45° inward — matches CAST_LAYOUT for consistency
    CHAR_A:  0,
    CHAR_C: -Math.PI / 4,
};

function _teardownStoryPreview() {
    if (!_storyPreview) return;
    _storyPreview.playback?.stop?.();
    hideSubtitle();
    removeStoryNameTags();
    if (_voiceEngine) _voiceEngine.stop();
    // Drop the musicPlayer beat subscription before nulling state, otherwise
    // the next sim's subscriber would race with this one's queued cuts.
    try { _storyPreview._unsubscribeLayerFire?.(); } catch {}
    if (_storyPreview.pendingCutTimeout) clearTimeout(_storyPreview.pendingCutTimeout);
    for (const h of _storyPreview.heads) {
        h.container.parent?.remove(h.container);
        h.dispose?.();
    }
    _storyPreview = null;
}

function _buildStoryPreview(asset) {
    // Tighter framing: camera pulled in to match the narrower triangle,
    // target sits just behind CHAR_A so B/C read as "behind and inward".
    // Camera dropped (1.15 → 0.75) so heads sit higher in the frame.
    _camera.position.set(0, 0.75, 2.8);
    _camera.lookAt(0, 0.95, -0.25);
    _camera.fov = 50;
    _camera.updateProjectionMatrix();

    // Disable the ping-pong auto-spin — story preview is a read-through, the
    // camera should stay put so subtitles + wiggles read cleanly.
    _autoSpin = false;

    const state = asset.payload?.state || asset.state || {};
    const cast  = Array.isArray(state.cast) && state.cast.length ? state.cast : [
        { slot: 'CHAR_A', archetype: 'Edge' },
        { slot: 'CHAR_B', archetype: 'Bloom' },
        { slot: 'CHAR_C', archetype: 'Glitch' },
    ];
    const beats = pickThreeBeats(Array.isArray(state.beats) ? state.beats : []);

    const heads = [];
    for (const c of cast) {
        const h = buildArchetypeHead(c.archetype);
        const container = new THREE.Group();
        container.add(h.group);
        const pos = _STORY_POS[c.slot] || [0, 0.95, 0];
        const rotY = _STORY_ROT_Y[c.slot] || 0;
        container.position.set(...pos);
        container.rotation.y = rotY;
        _previewGroup.add(container);
        heads.push({
            slot: c.slot,
            container,
            basePos: container.position.clone(),
            baseRotY: rotY,
            label: `${c.archetype}-core`,
            talk: h.talk,
            talkParams: h.talkParams,
            dispose: h.dispose,
        });
    }

    _storyPreview = {
        heads,
        speakingSlot: null,
        playback: null,
        cast,
        beats,
        isPlaying: false,
    };

    // Prime the voice engine but don't auto-start playback — the Play button
    // (and the autoplay toggle) decides whether to kick it off. This mirrors
    // how env + music previews behave.
    _voiceConfigured = _ensureVoice().then(() => {
        if (!_voiceReady || !_voiceEngine) return;
        // Reset to a neutral default so archetype deltas land on consistent
        // baseline params on first speak.
        if (_voiceEngine.applyState) {
            _voiceEngine.applyState({ speed: 175, pitch: 50, amplitude: 100, wordgap: 0, variant: 'm3' });
        }
    });
}

function _startStoryPlayback() {
    if (!_storyPreview || _storyPreview.playback) return;
    const { cast, beats } = _storyPreview;
    if (!beats || beats.length === 0) return;
    _storyPreview.isPlaying = true;

    _storyPreview.playback = runStoryPlayback({
        beats,
        getLabelForSlot: (slot) => {
            const entry = cast.find(c => c.slot === slot);
            return entry ? `${entry.archetype}-core` : slot;
        },
        getArchetypeForSlot: (slot) => {
            const entry = cast.find(c => c.slot === slot);
            return entry?.archetype || null;
        },
        // Per-line override schema (read from beat.lines[lineIdx]):
        //   emotion?:   string  — overrides beat emotion for THIS line's
        //                          animation pick (one defiant line in an
        //                          otherwise sad beat). Music dials still
        //                          follow the beat-level emotion.
        //   shot?:      'wide' | 'close_up' | 'two_shot' — overrides the
        //                          camera style's default for this cut.
        //   animation?: string  — explicit anim id (e.g. for an author who
        //                          wants the chicken dance specifically).
        //   sfx?:       string  — reserved for future SFX system.
        //
        // All fields optional. Both human authors and AI generators emit
        // the same shape; the runtime falls back to beat-level defaults
        // whenever a field is unspecified.
        onLine: ({ slot, text, silent, beatIdx, lineIdx }) => {
            if (!_storyPreview) return;
            const style = _storyPreview.cameraStyle;
            if (silent) {
                // Silent beat (the 260ms breather between lines): clear the
                // mouth/subtitle but HOLD the current shot. Cutting to wide
                // every line was film-school sloppy — wide is reserved for
                // playback start and end (and any beat the author marks).
                _storyPreview.speakingSlot = null;
                hideSubtitle();
                return;
            }

            const beat = _storyPreview.beats?.[beatIdx];
            const line = beat?.lines?.[lineIdx];

            const prev = _storyPreview.speakingSlot;
            _storyPreview.speakingSlot = slot;
            showSubtitle(text);

            // Cut on speaker-change only — holding the same speaker through
            // multiple lines is film convention. With v2 music playing, the
            // cut is QUEUED for the next musical downbeat (drums or bass)
            // instead of firing instantly — much more cinematic, since the
            // edit lands on the rhythm. A 250 ms failsafe still cuts even
            // if no beat fires (slow tempos, rests, theme transitions).
            //
            // Per-line shot override fires whenever it's set, even on the
            // SAME speaker — that's the whole point of an explicit override.
            const lineShot = _normaliseShot(line?.shot);
            if (_storyPreview.isSimulation && (slot !== prev || lineShot)) {
                const shot = lineShot || pickShot(style, slot);
                if (_storyPreview.musicMode === 'v2') {
                    _storyPreview.pendingCut = { shot, slot };
                    if (_storyPreview.pendingCutTimeout) clearTimeout(_storyPreview.pendingCutTimeout);
                    _storyPreview.pendingCutTimeout = setTimeout(() => {
                        if (!_storyPreview?.pendingCut) return;
                        const q = _storyPreview.pendingCut;
                        _storyPreview.pendingCut = null;
                        _storyPreview.pendingCutTimeout = null;
                        _applyPreviewShot(q.shot, q.slot);
                    }, 250);
                } else {
                    _applyPreviewShot(shot, slot);
                }
            }

            // Music dials: on beat-change, modulate valence/complexity from
            // the BEAT-level emotion + tension so the music tracks the story.
            // Per-line emotion overrides do NOT modulate music — that would
            // lurch the soundtrack on every line.
            if (_storyPreview.musicMode === 'v2' && beatIdx !== _storyPreview.lastBeatIdx) {
                _storyPreview.lastBeatIdx = beatIdx;
                if (beat) {
                    const { valence, complexity } = _beatToMusicDials(beat);
                    try {
                        musicPlayer.setParam('valence', valence);
                        musicPlayer.setParam('complexity', complexity);
                    } catch { /* silent */ }
                }
            }

            // Animation: per-line override > line.emotion > beat.emotion.
            const emotion = line?.emotion
                ? (_BEAT_EMOTION_MAP[String(line.emotion).toLowerCase()] || 'neutral')
                : _resolveBeatEmotion(beat);
            const lib = _storyPreview.animationLibrary;
            const explicitAnim = line?.animation
                ? lib?.find(a => a.id === line.animation || a.id === `anim_${line.animation}`)
                : null;
            for (const h of _storyPreview.heads) {
                if (!h.animationRig || !lib?.length) continue;
                const isSpeaker = h.slot === slot;
                if (isSpeaker && explicitAnim) {
                    h.animationRig.play(animationState(explicitAnim));
                    continue;
                }
                const intent = isSpeaker ? 'talk' : 'idle';
                // Hold idle if already playing a matching idle (avoids
                // restarting the loop on every line). Always restart on
                // talk so the animation re-fires for each line.
                if (intent === 'idle'
                    && h.animationRig.currentIntent() === 'idle'
                    && h.animationRig.currentEmotion() === emotion) continue;
                const pick = pickAnimation(lib, { emotion, intent });
                if (pick) h.animationRig.play(animationState(pick));
            }
        },
        onIdle: () => {
            if (!_storyPreview) return;
            _storyPreview.speakingSlot = null;
            hideSubtitle();
            // Wide on idle — film convention.
            if (_storyPreview.isSimulation) {
                _applyPreviewShot(SHOTS.wide, null);
            }
        },
        speakLine: async (text, archetype, slot) => {
            if (_voiceConfigured) await _voiceConfigured;
            if (!_voiceReady || !_voiceEngine) return;
            // Pull the per-character voiceState. Falls back to a neutral
            // baseState if the character has no voice assigned.
            const head = _storyPreview?.heads.find(h => h.slot === slot);
            const baseState = head?.voiceState
                || { speed: 175, pitch: 50, amplitude: 100, wordgap: 0, variant: 'm3' };
            await speakWithArchetype(_voiceEngine, { text, archetype, baseState });
        },
        loop: true,
    });
}

function _stopStoryPlayback() {
    if (!_storyPreview) return;
    _storyPreview.playback?.stop?.();
    _storyPreview.playback = null;
    _storyPreview.isPlaying = false;
    _storyPreview.speakingSlot = null;
    hideSubtitle();
    if (_voiceEngine) _voiceEngine.stop();
}

export function previewPlayStory() {
    if (!_storyPreview) return;
    _startStoryPlayback();
}
export function previewStopStory() {
    _stopStoryPlayback();
}
export function isPreviewStoryPlaying() {
    return !!(_storyPreview && _storyPreview.isPlaying);
}

// ── Simulation playback (read-through + music together) ──────────
// Simulations differ from stories by also kicking the assigned music
// track. The sim build deliberately does NOT auto-play music — only this
// function (called from the global Play button) starts audio.
export function previewPlaySimulation() {
    if (!_storyPreview) return;
    _startStoryPlayback();
    // Kick music if the sim has one assigned. Idempotent — _autoPlaySimulationMusic
    // bails if music isn't ready yet and re-tries on its own.
    if (_storyPreview.musicId) {
        _autoPlaySimulationMusic(_storyPreview.musicId, _previewSession);
    }
}
export function previewStopSimulation() {
    _stopStoryPlayback();
    // Either path may have started — stop both to be safe.
    if (_musicEngine) _musicEngine.stop();
    try { musicPlayer.stop(); } catch {}
    // Return to wide so the camera doesn't pin on the last cut after stop.
    if (_storyPreview?.isSimulation) _applySimCamera();
}
export function isPreviewSimulationPlaying() {
    return !!(_storyPreview && _storyPreview.isPlaying);
}

// ── Simulation preview ───────────────────────────────────────────
// Cast positions + rotations come from CAST_LAYOUT in shared/envGeometry.js
// so the sim render and the env-builder ghost-cast preview stay in sync.
// Conversation arrangement: CHAR_A upstage centre (0, 0, -1), CHAR_B/C
// downstage flanks turned 45° inward.
const _SIM_SLOT_POSITIONS = Object.fromEntries(
    Object.entries(CAST_LAYOUT).map(([slot, { pos }]) => [slot, pos])
);
const _SIM_SLOT_ROT_Y = Object.fromEntries(
    Object.entries(CAST_LAYOUT).map(([slot, { rotY }]) => [slot, rotY])
);
const _SIM_ARCHETYPE_LIFT_Y = 0.95;

async function _resolveSimAsset(refs, type, id) {
    if (!id) return null;
    if (Array.isArray(refs)) {
        const hit = refs.find(r => r?.snapshot?.id === id || r?.id === id);
        if (hit?.snapshot) return hit.snapshot;
        if (hit?.payload || hit?.state) return hit;
    }
    try {
        const list = await loadGlobalAssets(type);
        return list?.find(a => a.id === id) || null;
    } catch { return null; }
}

function _applySimCamera() {
    // SIM_CAMERA — eye-level, closer than DEFAULT_CAMERA. Frames the cast
    // conversation rather than the whole stage. Single source of truth in
    // shared/envGeometry.js — change there to retune all sim playback.
    _camera.position.set(...SIM_CAMERA.pos);
    _camera.lookAt(...SIM_CAMERA.target);
    _camera.fov = SIM_CAMERA.fov;
    _camera.updateProjectionMatrix();
    _autoSpin = false;
    if (_controls) {
        _controls.enabled = true;
        _controls.target.set(...SIM_CAMERA.target);
        _controls.update();
    }
}

/**
 * Apply a named camera shot during sim playback. Hard-cuts (durationMs=0)
 * for close-ups; tweens for wide returns. Disables auto-spin so the cut
 * doesn't fight the ping-pong. Reads the speaker's head Y from
 * _storyPreview.heads so close-ups frame the actual face — short
 * characters don't get cropped, tall ones don't get clipped.
 */
function _applyPreviewShot(shot, slot) {
    if (!_camera) return;
    const head = slot && _storyPreview
        ? _storyPreview.heads.find(h => h.slot === slot)
        : null;
    const headY = head?.headY;
    const pose = computeShotPose(shot, slot, { headY });
    _autoSpin = false;
    if (pose.fov && pose.fov !== _camera.fov) {
        _camera.fov = pose.fov;
        _camera.updateProjectionMatrix();
    }
    // Hard cut for close_up / two_shot; tween only on wide returns.
    _camera.position.set(...pose.pos);
    _camera.lookAt(...pose.target);
    if (_controls) {
        _controls.target.set(...pose.target);
        _controls.update();
    }
}

async function _buildSimulationPreview(asset) {
    const session = _previewSession;          // capture for stale-result guard
    try {
        const state = asset?.payload?.state || asset?.state || {};
        const refs  = asset?.refs;

        const cast = Array.isArray(state.cast) && state.cast.length ? state.cast : [
            { slot: 'CHAR_A', archetype: 'Edge' },
            { slot: 'CHAR_B', archetype: 'Bloom' },
            { slot: 'CHAR_C', archetype: 'Glitch' },
        ];

        // Set the close-up camera up front so the user sees the right pose
        // from the very first frame. The env build will briefly nudge it to
        // a wide pose and we re-assert at the end.
        _applySimCamera();
        _initialCamPos = _camera.position.clone();
        _initialTarget = _controls ? _controls.target.clone() : null;

        // Resolve env + every cast character in parallel. Each resolve has
        // its own try/catch so one bad ID can't take the rest down.
        const charPromises = cast.map(c =>
            c.charId
                ? _resolveSimAsset(refs, 'Characters', c.charId).catch(() => null)
                : Promise.resolve(null)
        );
        const envPromise = state.envId
            ? _resolveSimAsset(refs, 'Environments', state.envId).catch(() => null)
            : Promise.resolve(null);
        const [envAsset, ...charAssets] = await Promise.all([envPromise, ...charPromises]);
        if (session !== _previewSession) return;

        // Resolve each character's per-character voice asset. The character
        // JSON's payload.state.voiceId points at one of ~55 stock voices —
        // applying the voice's full state (variant, pitch, brightness,
        // breathiness, vocalFry, etc.) gives every character a distinct
        // sound instead of cycling through 12 archetype variants.
        const voicePromises = charAssets.map(ca => {
            const voiceId = ca?.payload?.state?.voiceId;
            return voiceId
                ? _resolveSimAsset(refs, 'Voices', voiceId).catch(() => null)
                : Promise.resolve(null);
        });
        const voiceAssets = await Promise.all(voicePromises);
        if (session !== _previewSession) return;

        // Animation library — load once for the whole sim. Cheap (each
        // trimmed Mixamo anim is ~50–200 KB; the whole library is well
        // under 4 MB). We pick semantically (emotion + intent) per line.
        const animationLibrary = await loadGlobalAssets('Animations').catch(() => []);
        if (session !== _previewSession) return;

        // Music is wired to the sim but DOES NOT auto-play here — only the
        // user pressing Play (via previewPlaySimulation) starts audio. Stash
        // the musicId on _storyPreview so the play handler can find it.

        // Kick the env build in PARALLEL with character build. If env build
        // throws or hangs, characters + camera + music still come up — the
        // user is never stranded with a wide shot and no cast.
        const envBuildPromise = envAsset
            ? _buildEnvironmentPreview(envAsset).catch(e => {
                console.warn('[previewRenderer] sim env build failed:', e?.message);
            })
            : Promise.resolve();

        // Build heads/characters per cast slot in parallel. Each slot
        // independently falls back to an archetype head if its asset is
        // missing or the mesh build throws.
        const builds = await Promise.all(cast.map(async (c, i) => {
            const charAsset = charAssets[i] || null;
            const voiceState = voiceAssets[i]?.payload?.state || null;
            if (charAsset) {
                try {
                    const mesh = await buildCharacterMesh(charAsset);
                    return { c, mesh, voiceState };
                } catch (e) {
                    console.warn(`[previewRenderer] sim char build failed for ${c.slot}, archetype fallback:`, e?.message);
                }
            }
            return { c, mesh: null, voiceState };
        }));
        if (session !== _previewSession) {
            for (const b of builds) b.mesh?.dispose?.();
            return;
        }

        // Place heads. Each placement is in its own try/catch so one bad
        // head can't strand the rest.
        const heads = [];
        for (const { c, mesh, voiceState } of builds) {
            try {
                const pos  = _SIM_SLOT_POSITIONS[c.slot] || [0, 0, 0];
                const rotY = _SIM_SLOT_ROT_Y[c.slot]     || 0;
                const container = new THREE.Group();
                container.position.set(...pos);
                container.rotation.y = rotY;

                let entry;
                if (mesh) {
                    container.add(mesh.group);
                    // Approximate head-centre Y: top of the head minus ~0.3 m
                    // (about half a stylised head). Used by close-up framing
                    // so short / tall characters get the camera at face level.
                    const headY = (mesh.totalHeight ?? 1.6) - 0.3;
                    // Per-head animation rig. root → character container
                    // (full-body sway); head → head subgroup pivoting at
                    // the neck (independent shake/nod); armL / armR → arm
                    // subgroups pivoting at the shoulders (gesture, wave,
                    // point). Future attention/look-at + reach systems
                    // can write to these same quaternions AFTER the rig
                    // updates, layering on top of the mocap baseline.
                    const animationRig = new AnimationRig();
                    animationRig.attach(container, {
                        head: mesh.headGroup,
                        armL: mesh.armLGroup,
                        armR: mesh.armRGroup,
                    });
                    entry = {
                        slot: c.slot,
                        container,
                        basePos: container.position.clone(),
                        baseRotY: rotY,
                        label: `${c.archetype || 'Edge'}-core`,
                        talkParams: null,
                        headY,
                        voiceState,
                        mouthRig:      mesh.mouthRig      || null,
                        facialHairRig: mesh.facialHairRig || null,
                        animationRig,
                        dispose: () => { animationRig.dispose(); mesh.dispose(); },
                        isArchetype: false,
                    };
                } else {
                    const head = buildArchetypeHead(c.archetype || 'Edge');
                    container.add(head.group);
                    container.position.y = _SIM_ARCHETYPE_LIFT_Y;
                    entry = {
                        slot: c.slot,
                        container,
                        basePos: container.position.clone(),
                        baseRotY: rotY,
                        label: `${c.archetype || 'Edge'}-core`,
                        talk: head.talk,
                        talkParams: head.talkParams,
                        headY: _SIM_ARCHETYPE_LIFT_Y,
                        voiceState,
                        animationRig: null,
                        dispose: head.dispose,
                        isArchetype: true,
                    };
                }

                _previewGroup.add(container);
                heads.push(entry);
            } catch (e) {
                console.warn(`[previewRenderer] sim head place failed for ${c.slot}:`, e?.message);
                mesh?.dispose?.();
            }
        }

        // Re-assert camera after heads land — the env build may have moved
        // it to its wide framing before we got here.
        _applySimCamera();
        _initialCamPos = _camera.position.clone();
        _initialTarget = _controls ? _controls.target.clone() : null;

        // Story-style read-through state (so Play can drive subtitles + speak).
        const beats = pickThreeBeats(Array.isArray(state.beats) ? state.beats : []);
        _storyPreview = {
            heads,
            speakingSlot: null,
            playback: null,
            cast,
            beats,
            isPlaying: false,
            // Stashed so previewPlaySimulation can kick the music when the
            // user hits Play. Not auto-played on build.
            musicId: state.musicId || null,
            isSimulation: true,
            // Camera style for cuts during playback. Default to speaker_cuts
            // so the homepage random sim feels alive. dolly_drift in sim
            // preview falls back to wide for now (no ambient orbit here).
            cameraStyle: state.cameraStyle || 'speaker_cuts',
            // Animation library + state for per-line emotion-driven anims.
            animationLibrary,
            // Music: tracks which playback path was used (v2 = new themes
            // with realtime dials, legacy = old MusicEngine) and which beat
            // the dials were last set for, so we don't re-fire setParam on
            // every line within the same beat.
            musicMode: 'idle',
            lastBeatIdx: -1,
            // Beat-locked camera cuts — speaker change queues a cut here;
            // a musicPlayer layer-fire subscriber pops it on the next
            // downbeat (drums or bass). Subscriber handle is stashed so
            // teardown can unsubscribe and avoid leaking handlers.
            pendingCut: null,
            pendingCutTimeout: null,
            _unsubscribeLayerFire: null,
        };

        // Subscribe to musicPlayer beat events. Filter to downbeat roles
        // (drums + bass) so cuts land on the strong beat, not on melody
        // noodles. Same hook is the future home for SFX triggers — when
        // story SFX land, they register an additional subscriber here.
        _storyPreview._unsubscribeLayerFire = musicPlayer.subscribeLayerFire((role) => {
            if (!_storyPreview) return;
            if (role !== 'drums' && role !== 'bass') return;
            const queued = _storyPreview.pendingCut;
            if (!queued) return;
            _storyPreview.pendingCut = null;
            if (_storyPreview.pendingCutTimeout) {
                clearTimeout(_storyPreview.pendingCutTimeout);
                _storyPreview.pendingCutTimeout = null;
            }
            _applyPreviewShot(queued.shot, queued.slot);
        });

        // Seed every animatable head with a neutral idle on build so the
        // homepage scene reads as alive even before Play is pressed.
        const neutralIdle = pickAnimation(animationLibrary, { emotion: 'neutral', intent: 'idle' });
        if (neutralIdle) {
            for (const h of heads) {
                if (h.animationRig) h.animationRig.play(animationState(neutralIdle));
            }
        }

        _voiceConfigured = _ensureVoice().then(() => {
            if (!_voiceReady || !_voiceEngine) return;
            if (_voiceEngine.applyState) {
                _voiceEngine.applyState({ speed: 175, pitch: 50, amplitude: 100, wordgap: 0, variant: 'm3' });
            }
        });

        // Once the env build resolves, re-assert the camera one final time
        // in case it moved during the long async load (props, ground, etc.).
        envBuildPromise.then(() => {
            if (session !== _previewSession) return;
            _applySimCamera();
        });
    } catch (e) {
        console.error('[previewRenderer] _buildSimulationPreview failed:', e);
        // Even on failure, leave a usable camera and orbit state so the
        // user isn't stuck staring at a default pose with broken controls.
        if (session === _previewSession) _applySimCamera();
    }
}

async function _autoPlaySimulationMusic(musicId, session) {
    if (!musicId) return;
    try {
        // Look in `themes/` first (new v2 format with valence / complexity /
        // speed dials). Fall back to legacy mood folders for older mus_* ids.
        const folders = ['themes', 'ambient', 'world', 'nature', 'lofi', 'electronic', 'action', 'cinematic', 'retro'];
        let track = null;
        for (const folder of folders) {
            if (session !== _previewSession) return;
            try {
                const res = await fetch(`global_assets/music/${folder}/${musicId}.json`);
                if (session !== _previewSession) return;
                if (res.ok) { track = await res.json(); break; }
            } catch { /* try next */ }
        }
        if (session !== _previewSession) return;
        if (!track) return;

        // v2 themes go through the shared musicPlayer (Tone.js pipeline,
        // realtime dials, single-source-of-truth). Legacy mus_* tracks
        // stay on the simple oscillator MusicEngine.
        const theme = assetToTheme(track);
        if (theme) {
            try {
                await musicPlayer.play(theme);
                // Stash on _storyPreview so the onLine handler can dial
                // valence/complexity per beat.
                if (_storyPreview) _storyPreview.musicMode = 'v2';
            } catch (e) {
                console.warn('[previewRenderer] sim music play failed:', e?.message);
            }
            return;
        }

        // Legacy fallback.
        if (!_musicReady) await _ensureMusic();
        if (session !== _previewSession) return;
        if (!_musicReady || !_musicEngine) return;
        _musicEngine.play(track);
        if (_storyPreview) _storyPreview.musicMode = 'legacy';
    } catch { /* silent */ }
}
