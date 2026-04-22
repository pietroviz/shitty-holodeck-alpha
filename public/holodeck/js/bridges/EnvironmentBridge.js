/**
 * EnvironmentBridge.js — Fresh minimal rebuild (April 2026).
 *
 * The blank-slate baseline renders the canonical "Scene3D" look:
 *   - Mid-grey backdrop (#5A5A5A)
 *   - Colored ground plane + colored stage plane
 *   - World grid that scales with ground size
 *   - 5×5 stage perimeter (thick light-grey Line2) + inner stage grid
 *   - Flat lighting (ambient + one directional), no placeholder cube
 *
 * Tabs: File · Ground · Sky · Stage · FX.
 *   File   — name / description / tags (wired)
 *   Ground — ground size + ground/stage/wall color, walls (wired)
 *   Sky    — 3-stop vertical gradient (top/mid/bot color pickers, wired)
 *   Stage  — numbered 5×5 grid, greybox character placeholders (wired)
 *   FX     — stub (lighting + atmosphere effects)
 *
 * See docs/environment-builder-notes.md for a running design log.
 */

import * as THREE from 'three';
import { Line2 }        from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { OrbitControls }      from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

import { BaseBridge } from './BaseBridge.js?v=3';
import { loadPalette }     from '../shared/paletteLoader.js';
import { showColorPicker } from '../shared/colorPicker.js';
import { renderSubtitle, renderFileTab, wireFileTabEvents, tweenToPose } from '../shared/builderUI.js';

// Ping-pong auto-rotate tuning (matches browse preview for a consistent feel)
const _PP_RANGE = Math.PI * 0.45;
const _PP_SPEED = 0.15;

// Ground tab tuning
const GROUND_SIZE_MIN = 5;
const GROUND_SIZE_MAX = 25;
const STAGE_SIZE      = 5;

// DB32-picked defaults that feel like an "inviting little world"
const DEFAULT_GROUND_COLOR = '#4b692f'; // DB32 dark grass
const DEFAULT_STAGE_COLOR  = '#595652'; // DB32 dark grey
const DEFAULT_WALL_COLOR   = '#696a6a'; // DB32 mid grey (slightly lighter)
const DEFAULT_GROUND_SIZE  = 19;
const DEFAULT_WALL_HEIGHT  = 0;     // 0 = off, 1–3 = blocks
const DEFAULT_WINDOW_STYLE = 'none'; // none | single | double | triple
const DEFAULT_WINDOW_COLOR = '#8ec8f0'; // translucent pane tint (pale sky blue)
const WINDOW_PANE_OPACITY  = 0.25;
const WINDOW_OPACITY_MIN   = 0.05;
const WINDOW_OPACITY_MAX   = 1.0;
const DEFAULT_TEXTURE      = 'none';

// Sky gradient defaults (top-to-bottom, subtle dusk)
const DEFAULT_SKY_TOP = '#4a5870';   // soft studio blue (visible, not near-black)
const DEFAULT_SKY_MID = '#8497ac';   // lighter mid-tone at horizon
const DEFAULT_SKY_BOT = '#b0bcc8';   // pale grey-blue beneath horizon

// Orb light — floats above the stage for a little interior drama.
// Off by default so existing envs keep their look; presets turn it on
// where it fits (e.g. night / dusk).
const DEFAULT_ORB_VISIBLE   = false;
const DEFAULT_ORB_COLOR     = '#ffddaa';   // warm candle / torch
const DEFAULT_ORB_INTENSITY = 1.4;
const DEFAULT_ORB_HEIGHT    = 2.0;         // metres above the stage
const DEFAULT_ORB_FLICKER   = false;
const ORB_HEIGHT_MIN = 1.0;
const ORB_HEIGHT_MAX = 3.0;
const ORB_LIGHT_RANGE = 9;                 // metres — falloff distance

// FX lighting presets
const FX_PRESETS = {
    flat: {
        label: 'Flat',
        skyTop: '#4a5870',  skyMid: '#8497ac',  skyBot: '#b0bcc8',
        sunColor: '#ffffee', sunElevation: 60, sunVisible: false,
        ambientColor: '#ffffff', ambientIntensity: 1.2,
        dirColor: '#ffffff',     dirIntensity: 0.4,
        fogEnabled: false, fogColor: '#888888', fogDensity: 0.02,
        orbVisible: false, orbColor: '#ffddaa', orbIntensity: 1.4, orbHeight: 2.0, orbFlicker: false,
    },
    day: {
        label: 'Day',
        skyTop: '#1a4a7a',  skyMid: '#70a8d8',  skyBot: '#c8e0f0',
        sunColor: '#ffffaa', sunElevation: 65, sunVisible: true,
        ambientColor: '#e8eeff', ambientIntensity: 1.0,
        dirColor: '#fffae0',     dirIntensity: 1.2,
        fogEnabled: false, fogColor: '#c0d8f0', fogDensity: 0.01,
        orbVisible: false, orbColor: '#ffddaa', orbIntensity: 1.4, orbHeight: 2.0, orbFlicker: false,
    },
    dusk: {
        label: 'Dusk',
        skyTop: '#4a2a78',  skyMid: '#c4609a',  skyBot: '#ffa060',
        sunColor: '#ff9944', sunElevation: 10, sunVisible: true,
        ambientColor: '#9080b0', ambientIntensity: 0.7,
        dirColor: '#ffaa55',     dirIntensity: 0.9,
        fogEnabled: true,  fogColor: '#6a4060', fogDensity: 0.02,
        orbVisible: true,  orbColor: '#ffaa66', orbIntensity: 1.2, orbHeight: 2.0, orbFlicker: false,
    },
    night: {
        label: 'Night',
        skyTop: '#1a1f3a',  skyMid: '#364070',  skyBot: '#5a6490',
        sunColor: '#bbddff', sunElevation: 40, sunVisible: true,
        ambientColor: '#405880', ambientIntensity: 0.5,
        dirColor: '#88aacc',     dirIntensity: 0.5,
        fogEnabled: true,  fogColor: '#101828', fogDensity: 0.03,
        orbVisible: true,  orbColor: '#ffcc88', orbIntensity: 1.8, orbHeight: 2.0, orbFlicker: true,
    },
};

// Weather particle system
const WEATHER_TYPES = ['none', 'snow', 'rain', 'leaves'];
const WEATHER_PARTICLE_COUNT = 600;
const WEATHER_SPREAD  = 14;   // particles spread ±14m from centre (covers ground)
const WEATHER_HEIGHT  = 12;   // particles span 0 → 12m high
const WEATHER_CFG = {
    snow:   { size: 0.12, color: 0xffffff, speed: 1.2, drift: 0.6, opacity: 0.85 },
    rain:   { size: 0.06, color: 0xaaccee, speed: 8.0, drift: 0.3, opacity: 0.5  },
    leaves: { size: 0.15, color: 0x88aa44, speed: 0.8, drift: 1.5, opacity: 0.9  },
};

// Cast — always 5 fixed slots, each with an assigned colour
const CAST_SLOT_COUNT  = 5;
const CAST_COLORS = [
    '#e04040',   // slot 1 — red
    '#40a0e0',   // slot 2 — blue
    '#50c878',   // slot 3 — green
    '#e0a020',   // slot 4 — amber
    '#b060d0',   // slot 5 — purple
];

// Wall height range (blocks, 1 block = 1 meter).
// Capped at 3 so walls don't tower over the stage — tall walls made
// windows sit above eye level and looked window-less from the ground.
const WALL_HEIGHT_MIN = 0;
const WALL_HEIGHT_MAX = 3;
const WALL_THICK      = 0.25;

// Cached texture asset list (id, name) loaded from images/textures/_index.json
let _TEXTURE_OPTS = null;
async function _loadTextureOpts() {
    if (_TEXTURE_OPTS) return _TEXTURE_OPTS;
    try {
        const idxRes = await fetch('global_assets/images/textures/_index.json');
        const files  = await idxRes.json();
        const items  = await Promise.all(files.map(async f => {
            try {
                const r = await fetch(`global_assets/images/textures/${f}`);
                const a = await r.json();
                return { id: a.id, name: a.name || a.id };
            } catch { return null; }
        }));
        _TEXTURE_OPTS = items.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
    } catch {
        _TEXTURE_OPTS = [];
    }
    return _TEXTURE_OPTS;
}

// ── Ground-object asset helpers ─────────────────────────────────
// Flat list of objects suitable for ground scatter (excludes headwear,
// items and panels which don't make sense as scenery).
let _OBJECT_LIST = null;
async function _loadObjectList() {
    if (_OBJECT_LIST) return _OBJECT_LIST;
    try {
        const res = await fetch('global_assets/objects/manifest.json');
        const manifest = await res.json();
        const list = [];
        const skip = new Set(['headwear', 'items', 'panels', 'fashion']);
        for (const [catKey, cat] of Object.entries(manifest.categories)) {
            if (skip.has(catKey)) continue;
            for (const file of cat.files) {
                const id = file.replace('.json', '');
                const name = id.replace(/^prop_/, '').replace(/_batch$/, '')
                    .replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                list.push({ id, name, category: cat.name,
                            path: `global_assets/objects/${catKey}/${file}` });
            }
        }
        _OBJECT_LIST = list.sort((a, b) => a.name.localeCompare(b.name));
    } catch { _OBJECT_LIST = []; }
    return _OBJECT_LIST;
}

// Cache full asset JSON so we only fetch once per session
const _assetCache = new Map();
async function _fetchAsset(path) {
    if (_assetCache.has(path)) return _assetCache.get(path);
    const res  = await fetch(path);
    const data = await res.json();
    _assetCache.set(path, data);
    return data;
}

// Scatter / tile density settings (ground plane)
const _SCATTER_COUNTS = { low: 6, med: 14, high: 28 };
const _TILE_SPACING   = { low: 3.5, med: 2.5, high: 1.8 };

// Stage set-dressing constants
const SET_DRESSING_SLOTS = 5;
const SET_DRESSING_HEIGHT_CAP = 0.6;    // max height in world units (~waist height, won't block cast faces)
const GROUND_OBJ_HEIGHT_CAP  = 1.5;    // max height for ground plane objects
const _STAGE_SCATTER_COUNTS = { low: 3, med: 6, high: 10 };
const _STAGE_TILE_SPACING   = { low: 2.0, med: 1.4, high: 1.0 };

// Default camera is at (5.2, 3.9, 5.2) looking at origin.
// Camera corridor: a wedge from origin outward in the +x/+z quadrant.
// Any ground point inside this wedge would obstruct the view.
const _CAM_DIR_X = 5.2, _CAM_DIR_Z = 5.2;                    // camera direction
const _CAM_CORRIDOR_COS = Math.cos(Math.PI * 2 / 9);          // ±40° half-angle
const _camDirLen = Math.sqrt(_CAM_DIR_X * _CAM_DIR_X + _CAM_DIR_Z * _CAM_DIR_Z);
const _camNormX  = _CAM_DIR_X / _camDirLen;
const _camNormZ  = _CAM_DIR_Z / _camDirLen;

/** True if (x,z) lies inside the camera corridor wedge (beyond the stage). */
function _inCameraCorridor(x, z, stageHalf) {
    const len = Math.sqrt(x * x + z * z);
    if (len < stageHalf + 0.5) return false;   // inside stage buffer — handled separately
    const dot = (x * _camNormX + z * _camNormZ) / (len || 1);
    return dot > _CAM_CORRIDOR_COS;             // within ±40° of camera direction
}

// ── Tabs (File · Ground · Sky · Stage · FX) ─────────────────────
const TABS = [
    { id: 'file',   label: 'File'   },
    { id: 'ground', label: 'Ground' },
    { id: 'sky',    label: 'Sky'    },
    { id: 'stage',  label: 'Stage'  },
    { id: 'fx',     label: 'FX'     },
];

// Small HTML escape helper
const _esc = (s = '') =>
    String(s).replace(/[&<>"']/g, m => (
        { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]
    ));

// Snap an integer to the nearest odd value within [GROUND_SIZE_MIN..MAX]
const _snapOdd = (n) => {
    let v = Math.round(n);
    if (v < GROUND_SIZE_MIN) v = GROUND_SIZE_MIN;
    if (v > GROUND_SIZE_MAX) v = GROUND_SIZE_MAX;
    if (v % 2 === 0) v = (v + 1 <= GROUND_SIZE_MAX) ? v + 1 : v - 1;
    return v;
};

// Legacy windowStyle names → current names.
const _migrateWindowStyle = (s) => {
    if (s === 'row')  return 'double';
    if (s === 'grid') return 'triple';
    return s;
};

// ── BINGO grid for the 5×5 stage ────────────────────────────────
// Viewed from the camera the stage is a diamond.  Labels sit on the
// two visible top edges:
//   Left edge  (bottom→apex):  B  I  N  G  O   (rows, front→back)
//   Back edge  (apex→right):   1  2  3  4  5   (columns, left→right)
//
// Rows B-I-N-G-O (front to back, +z → −z).
// Columns 1-2-3-4-5 (left to right, −x → +x).
//   B1 = front-left (left point of diamond)
//   O5 = back-right  (right point of diamond)
//   O1 = back-left   (apex, farthest from camera)
//   B5 = front-right (bottom, nearest to camera)
//   N3 = dead centre
const BINGO_COLS = 'BINGO';

/** Return a cell label like "B5" for a (col, row) pair.
 *  Letter = column: B(0) left … O(4) right.
 *  Number = row:    5 front … 1 back.
 *  Equivalence: B=1, I=2, N=3, G=4, O=5. */
function _cellLabel(col, row) {
    return BINGO_COLS[col] + (row + 1);
}

/** Parse a BINGO cell label → world-space {x, z} centre, or null.
 *  Letter = column (B left … O right), Number = row (5 front … 1 back). */
function _cellToWorld(cell) {
    if (!cell || cell.length < 2) return null;
    const letterIdx = BINGO_COLS.indexOf(cell[0].toUpperCase());
    const num       = parseInt(cell.slice(1), 10);
    if (letterIdx < 0 || num < 1 || num > 5) return null;
    // B(0)→x=−2 (left), O(4)→x=+2 (right); 5→z=+2 (front), 1→z=−2 (back)
    return { x: letterIdx - 2, z: num - 3 };
}

/** All 25 cell labels in row-major order. */
const ALL_CELLS = [];
for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++)
        ALL_CELLS.push(_cellLabel(c, r));

// DICE_ICON / renderFieldHead / renderFileTab live in shared/builderUI.js

export class EnvironmentBridge extends BaseBridge {
    constructor(sceneContainer, panelEl, options = {}) {
        super(sceneContainer, panelEl, options);
        this.displayName = 'Environment';
        this.storeName   = 'environments';

        // Carry forward any previously-saved state.
        // Shallow-copy so legacy-schema translation below doesn't mutate the asset.
        const d = { ...(this.asset?.payload?.state || this.asset?.state || {}) };

        // Legacy sky schema: stock env JSONs use skyTopColor / skyHorizonColor
        // (a 2-stop zenith→horizon gradient). Translate to the new 3-stop
        // layout so those environments read the way their authors intended:
        //   legacy top      → skyTop  (zenith)
        //   legacy horizon  → skyMid  (the horizon band)
        //   skyBot is synthesized as a mild brightening of mid so looking
        //   under the horizon isn't a sudden dark cut.
        const _legacyTop = d.skyTopColor     || this.asset?.payload?.skybox?.topColor;
        const _legacyHor = d.skyHorizonColor || this.asset?.payload?.skybox?.bottomColor;
        if (_legacyTop && !d.skyTop) d.skyTop = _legacyTop;
        if (_legacyHor && !d.skyMid) d.skyMid = _legacyHor;
        if (!d.skyBot && _legacyHor) {
            const m = new THREE.Color(_legacyHor);
            d.skyBot = '#' + m.clone().lerp(new THREE.Color(0xffffff), 0.25).getHexString();
        }

        this._state = {
            groundColor:    d.groundColor || DEFAULT_GROUND_COLOR,
            stageColor:     d.stageColor  || DEFAULT_STAGE_COLOR,
            wallColor:      d.wallColor   || DEFAULT_WALL_COLOR,
            // Ground size is odd-only (5, 7, 9, ... 25) so the ground
            // grows/shrinks one row around the perimeter at a time.
            groundSize:     _snapOdd(d.groundSize ?? DEFAULT_GROUND_SIZE),
            walls:          typeof d.walls === 'number' ? d.walls
                            : typeof d.walls === 'string'
                            ? ({ off: 0, low: 1, med: 3, high: 5 }[d.walls] ?? 0)
                            : DEFAULT_WALL_HEIGHT,
            windowStyle:    _migrateWindowStyle(d.windowStyle) || DEFAULT_WINDOW_STYLE,
            windowColor:    d.windowColor || DEFAULT_WINDOW_COLOR,
            windowOpacity:  Math.min(WINDOW_OPACITY_MAX, Math.max(WINDOW_OPACITY_MIN,
                                d.windowOpacity ?? WINDOW_PANE_OPACITY)),
            // Texture choices (stub for now — we just store the id;
            // applying real textures comes later)
            groundTexture:  d.groundTexture || DEFAULT_TEXTURE,
            stageTexture:   d.stageTexture  || DEFAULT_TEXTURE,
            wallTexture:    d.wallTexture   || DEFAULT_TEXTURE,
            // Sky gradient (3-stop vertical)
            skyTop:         d.skyTop || DEFAULT_SKY_TOP,
            skyMid:         d.skyMid || DEFAULT_SKY_MID,
            skyBot:         d.skyBot || DEFAULT_SKY_BOT,
            // Cast — always 5 slots; cell=null means empty
            cast: d.cast || [
                { cell: 'I2', facing: 'camera' },
                { cell: 'N2', facing: 'camera' },
                { cell: 'I3', facing: 'camera' },
                { cell: 'I4', facing: 'camera' },
                { cell: 'G2', facing: 'camera' },
            ],
            // Stage items — set dressing objects on the stage (5 slots)
            stageItems: d.stageItems || Array.from({ length: SET_DRESSING_SLOTS }, () => ({
                assetId: 'none', mode: 'place', cell: null, scale: 1.0, density: 'med',
            })),
            // Ground objects — 3 scatter/tile slots
            groundObjects:  d.groundObjects || [
                { assetId: 'none', mode: 'scatter', density: 'med', scale: 1.0 },
                { assetId: 'none', mode: 'scatter', density: 'med', scale: 1.0 },
                { assetId: 'none', mode: 'scatter', density: 'med', scale: 1.0 },
            ],
            // FX — lighting, fog, sun/moon
            fxPreset:       d.fxPreset      || 'flat',
            sunColor:       d.sunColor      || '#ffffee',
            sunElevation:   d.sunElevation  ?? 60,         // degrees, 0=horizon 90=overhead
            sunVisible:     d.sunVisible    ?? false,
            ambientColor:   d.ambientColor  || '#ffffff',
            ambientIntensity: d.ambientIntensity ?? 1.2,
            dirColor:       d.dirColor      || '#ffffff',
            dirIntensity:   d.dirIntensity  ?? 0.4,
            fogEnabled:     d.fogEnabled    ?? false,
            fogColor:       d.fogColor      || '#888888',
            fogDensity:     d.fogDensity    ?? 0.02,
            weather:        d.weather       || 'none',
            // Floating orb light (interior drama — think torch / hovering lantern)
            orbVisible:     d.orbVisible    ?? DEFAULT_ORB_VISIBLE,
            orbColor:       d.orbColor      || DEFAULT_ORB_COLOR,
            orbIntensity:   d.orbIntensity  ?? DEFAULT_ORB_INTENSITY,
            orbHeight:      Math.min(ORB_HEIGHT_MAX, Math.max(ORB_HEIGHT_MIN,
                                d.orbHeight ?? DEFAULT_ORB_HEIGHT)),
            orbFlicker:     d.orbFlicker    ?? DEFAULT_ORB_FLICKER,
        };

        // Texture options cache (loaded with palette in _buildScene)
        this._textureOpts = null;

        this._activeTab = 'file';

        // Scene object references (so we can update / dispose cleanly)
        this._groundMesh  = null;
        this._stageMesh   = null;
        this._worldGrid   = null;
        this._perimMat    = null;
        this._perimLine   = null;
        this._stageInner  = [];
        this._wallBack    = null;     // back wall  (−z edge of stage)
        this._wallLeft    = null;     // left wall  (−x edge of stage)
        this._wallRight   = null;     // right wall (+x edge of stage)
        this._wallFront   = null;     // front wall (+z edge of stage)
        this._skyCanvas   = null;     // off-screen canvas for gradient (legacy, replaced by sphere)
        this._skyTexture  = null;     // THREE.CanvasTexture (legacy)
        this._skySphere   = null;     // sky dome mesh
        this._sunOrb      = null;     // visible sun/moon sphere
        this._orbLight    = null;     // floating interior PointLight
        this._orbMesh     = null;     // visible glowing sphere for the orb light
        this._orbFlickerTime = 0;     // clock for smooth flicker noise
        this._ambientLight = null;    // THREE.AmbientLight
        this._dirLight     = null;    // THREE.DirectionalLight (follows sun)
        this._gridNumbers = [];       // sprites for square number labels
        this._stageItemMeshes = [];   // greybox character groups (cast)
        this._setDressingMeshes = []; // set dressing objects on stage
        this._groundObjMeshes = [];   // scattered/tiled ground objects
        this._objectList  = null;     // loaded object catalog
        this._wallsEnabled = false;   // true when walls height > 0
        this._extraLights = [];
        this._weatherPoints = null;  // THREE.Points for weather particles
        this._weatherVels   = null;  // Float32Array of per-particle velocities

        // Viewport interaction (matches browse preview)
        this._controls      = null;
        this._autoSpin      = false;
        this._pingPongAngle = 0;
        this._pingPongDir   = 1;
        this._isPlaying     = false;

        // DB32 palette (loaded async in _buildScene)
        this._palette = null;
    }

    // ═══════════════════════════════════════════════════════════════
    //  SCENE — overrides BaseBridge's default scene
    // ═══════════════════════════════════════════════════════════════

    async _buildScene() {
        // Clear the ground/grid/lights BaseBridge added so we can own them
        this._stripBaseSceneDefaults();

        // Load the DB32 palette + texture/object options in parallel with setup
        const paletteP  = loadPalette();
        const texturesP = _loadTextureOpts();
        const objectsP  = _loadObjectList();

        // Sky dome (gradient sphere you can look around in)
        this._buildSkySphere();

        // Camera pose — matches Scene3D
        this._camera.position.set(5.2, 3.9, 5.2);
        this._camera.lookAt(0, 0, 0);

        // Orbit controls
        this._controls = new OrbitControls(this._camera, this._renderer.domElement);
        this._controls.target.set(0, 0, 0);
        this._controls.enableDamping = true;
        this._controls.dampingFactor = 0.08;
        this._controls.minDistance   = 2;
        this._controls.maxDistance   = 20;
        // No maxPolarAngle — free roam lets you orbit under the island
        this._controls.update();

        // Pointer interaction stops auto-rotate
        const stopSpin = () => {
            if (this._autoSpin) {
                this._autoSpin  = false;
                this._isPlaying = false;
                document.dispatchEvent(new CustomEvent('bridge-play-state', {
                    detail: { playing: false },
                }));
            }
        };
        this._renderer.domElement.addEventListener('pointerdown', stopSpin);
        this._renderer.domElement.addEventListener('wheel',       stopSpin);

        // Ground + stage planes
        this._buildGroundPlane();
        this._buildStagePlane();

        // World grid (scales with groundSize)
        this._buildWorldGrid();

        // 5×5 stage perimeter + inner grid
        this._buildStagePerimeter();
        this._buildStageInnerGrid();

        // Four walls around the stage perimeter. Dynamic culling in
        // _onTick hides walls that face the camera.
        this._buildWalls();

        // Stage grid number labels (1–25 in diamond order)
        this._buildGridNumbers();

        // Stage items (greybox character placeholders etc.)
        this._buildStageItems();
        this._rebuildSetDressing();

        // Lighting (ambient + directional that follows the sun orb).
        // Colours go through _tintedColor so they read as tints rather
        // than darkening replacements.
        this._ambientLight = new THREE.AmbientLight(0xffffff, this._state.ambientIntensity);
        this._ambientLight.color.copy(this._tintedColor(this._state.ambientColor));
        this._scene.add(this._ambientLight);
        this._extraLights.push(this._ambientLight);

        this._dirLight = new THREE.DirectionalLight(0xffffff, this._state.dirIntensity);
        this._dirLight.color.copy(this._tintedColor(this._state.dirColor));
        this._scene.add(this._dirLight);
        this._extraLights.push(this._dirLight);

        // Sun/moon orb (unlit sphere, positioned by elevation)
        this._buildSunOrb();
        this._applySunPosition();

        // Floating orb light (interior drama)
        this._buildOrbLight();
        this._applyOrbLight();

        // Fog (off by default)
        this._applyFog();

        // Weather particles (snow / rain / leaves)
        this._buildWeather();

        // Resize observer keeps the perimeter line resolution fresh
        const c = this.container;
        this._ro?.disconnect();
        this._ro = new ResizeObserver(() => {
            this._camera.aspect = c.clientWidth / c.clientHeight;
            this._camera.updateProjectionMatrix();
            this._renderer.setSize(c.clientWidth, c.clientHeight);
            this._perimMat?.resolution.set(c.clientWidth, c.clientHeight);
        });
        this._ro.observe(c);

        // Wait for palette + texture + object list so the panel renders fully
        this._palette     = await paletteP;
        this._textureOpts = await texturesP;
        this._objectList  = await objectsP;

        // Ground-object scatter/tile (async — loads asset meshes)
        this._rebuildGroundObjects();
    }

    _stripBaseSceneDefaults() {
        const toRemove = [];
        this._scene.traverse(obj => {
            if (obj === this._scene) return;
            if (obj.isMesh || obj.isLine || obj.isGridHelper || obj.isLight) {
                toRemove.push(obj);
            }
        });
        for (const obj of toRemove) {
            obj.geometry?.dispose?.();
            if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose?.());
            else obj.material?.dispose?.();
            this._scene.remove(obj);
        }
    }

    // ── Scene builders (break up _buildScene for clarity) ───────

    _buildGroundPlane() {
        const size = this._state.groundSize;
        const geom = new THREE.BoxGeometry(size, 1, size);
        const mat  = new THREE.MeshStandardMaterial({
            color: new THREE.Color(this._state.groundColor),
            roughness: 0.95,
            metalness: 0,
        });
        const mesh = new THREE.Mesh(geom, mat);
        // Top face sits at y=0, bottom at y=−1 (floating-island slab)
        mesh.position.y = -0.5;
        mesh.receiveShadow = true;
        mesh.castShadow    = true;
        this._scene.add(mesh);
        this._groundMesh = mesh;
    }

    _buildStagePlane() {
        const geom = new THREE.PlaneGeometry(STAGE_SIZE, STAGE_SIZE);
        const mat  = new THREE.MeshStandardMaterial({
            color: new THREE.Color(this._state.stageColor),
            roughness: 0.85,
            metalness: 0,
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = 0.002; // just above the ground plane
        mesh.receiveShadow = true;
        this._scene.add(mesh);
        this._stageMesh = mesh;
    }

    _buildWorldGrid() {
        const size = this._state.groundSize;
        const grid = new THREE.GridHelper(size, size, 0x2F2F2F, 0x2F2F2F);
        grid.material.opacity     = 0.3;
        grid.material.transparent = true;
        grid.position.y = 0.004; // above the stage plane so lines stay visible
        this._scene.add(grid);
        this._worldGrid = grid;
    }

    _buildStagePerimeter() {
        const c = this.container;
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
        this._scene.add(perimLine);
        this._perimMat  = perimMat;
        this._perimLine = perimLine;
    }

    _buildStageInnerGrid() {
        const mat = new THREE.LineBasicMaterial({
            color: 0xB0B0B0, opacity: 0.4, transparent: true,
        });
        for (let i = -1.5; i <= 1.5; i += 1) {
            const v = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(i, 0.01, -2.5),
                    new THREE.Vector3(i, 0.01,  2.5),
                ]), mat);
            const h = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(-2.5, 0.01, i),
                    new THREE.Vector3( 2.5, 0.01, i),
                ]), mat);
            this._scene.add(v);
            this._scene.add(h);
            this._stageInner.push(v, h);
        }
    }

    /**
     * Build four walls around the stage perimeter.  Each wall is a thin
     * BoxGeometry slab.  Dynamic camera-based culling in _onTick hides
     * whichever walls face the viewer so the stage is always visible.
     */
    _buildWalls() {
        const half = STAGE_SIZE / 2;       // 2.5
        const t    = WALL_THICK;

        // Each wall is a Group so we can rebuild its blocks when window style changes.
        // Position the group at the wall's fixed edge; blocks are children.
        this._wallBack  = new THREE.Group();
        this._wallBack.position.set(0, 0, -half - t / 2);
        this._scene.add(this._wallBack);

        this._wallFront = new THREE.Group();
        this._wallFront.position.set(0, 0, half + t / 2);
        this._scene.add(this._wallFront);

        this._wallLeft  = new THREE.Group();
        this._wallLeft.position.set(-half - t / 2, 0, 0);
        this._scene.add(this._wallLeft);

        this._wallRight = new THREE.Group();
        this._wallRight.position.set(half + t / 2, 0, 0);
        this._scene.add(this._wallRight);

        // Build the block content and apply current state
        this._rebuildWallBlocks();
        this._applyWalls(this._state.walls, /*skipState*/ true);
    }

    /**
     * Rebuild the slab meshes inside each wall group.
     * Walls read like a house: a 0.5-unit sill at the bottom, a single
     * band of window(s) in the middle, a 0.5-unit lintel on top, and
     * 0.5-unit side padding on left/right. Window count (1/2/3) is set
     * by windowStyle (single/double/triple); gutters between windows
     * are 0.25 unit. 1-unit walls have no visible window.
     */
    _rebuildWallBlocks() {
        const h = this._state.walls || 0;

        const clearGroup = (g) => {
            while (g.children.length) {
                const c = g.children[0];
                c.geometry?.dispose?.();
                g.remove(c);
            }
        };

        if (h === 0) {
            clearGroup(this._wallBack);
            clearGroup(this._wallFront);
            clearGroup(this._wallLeft);
            clearGroup(this._wallRight);
            return;
        }

        const t     = WALL_THICK;
        const W     = STAGE_SIZE;      // wall length (5)
        const halfW = W / 2;           // 2.5
        const SILL  = 0.5;
        const LINT  = 0.5;
        const SIDE  = 0.5;
        const GUT   = 0.25;

        const style      = this._state.windowStyle || 'none';
        const count      = style === 'single' ? 1 : style === 'double' ? 2 : style === 'triple' ? 3 : 0;
        const hasWindows = count > 0 && h >= 2;
        const winH       = Math.max(0, h - SILL - LINT);

        const wallMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(this._state.wallColor),
            roughness: 0.85,
        });
        const paneMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(this._state.windowColor || DEFAULT_WINDOW_COLOR),
            roughness: 0.3, metalness: 0.1,
            transparent: true, opacity: this._state.windowOpacity ?? WINDOW_PANE_OPACITY,
            side: THREE.DoubleSide,
        });

        // Window centre-x's along the wall, plus the shared window width.
        let winW = 0;
        const winCentres = [];
        if (hasWindows) {
            const interiorW = W - SIDE * 2;
            winW = (interiorW - (count - 1) * GUT) / count;
            let x = -halfW + SIDE + winW / 2;
            for (let i = 0; i < count; i++) {
                winCentres.push(x);
                x += winW + GUT;
            }
        }

        const buildWall = (group, isVertical) => {
            clearGroup(group);

            // addSlab(offset along wall, centre-y, width along wall, height, isPane?)
            const addSlab = (along, y, width, height, isPane = false) => {
                const depth = isPane ? t * 0.3 : t;
                const geom = isVertical
                    ? new THREE.BoxGeometry(depth, height, width)
                    : new THREE.BoxGeometry(width, height, depth);
                const mesh = new THREE.Mesh(geom, isPane ? paneMat : wallMat);
                if (isVertical) mesh.position.set(0, y, along);
                else            mesh.position.set(along, y, 0);
                if (!isPane) {
                    mesh.castShadow    = true;
                    mesh.receiveShadow = true;
                }
                group.add(mesh);
            };

            if (!hasWindows) {
                // Solid wall slab
                addSlab(0, h / 2, W, h);
                return;
            }

            // Sill + lintel (full wall width)
            addSlab(0, SILL / 2,           W, SILL);
            addSlab(0, h - LINT / 2,       W, LINT);

            // Left / right side padding pillars
            const pillarY = SILL + winH / 2;
            addSlab(-halfW + SIDE / 2, pillarY, SIDE, winH);
            addSlab( halfW - SIDE / 2, pillarY, SIDE, winH);

            // Inter-window gutter pillars
            for (let i = 0; i < winCentres.length - 1; i++) {
                const mid = (winCentres[i] + winCentres[i + 1]) / 2;
                addSlab(mid, pillarY, GUT, winH);
            }

            // Panes — slightly inset from the frame so edges don't z-fight
            for (const cx of winCentres) {
                addSlab(cx, pillarY, winW * 0.98, winH * 0.98, /*isPane*/ true);
            }
        };

        buildWall(this._wallBack,  false);
        buildWall(this._wallFront, false);
        buildWall(this._wallLeft,  true);
        buildWall(this._wallRight, true);
    }

    /**
     * Build a 3-stop vertical gradient on an off-screen canvas and use it
     * as the Three.js scene background texture.  Updating a stop just
     * repaints the canvas and flips needsUpdate — no geometry re-creation.
     */
    /**
     * Build a large inverted sphere for the sky dome.
     * Uses vertex colours for a 3-stop gradient (top/mid/bot) —
     * no textures, no shaders, just free GPU-interpolated colour.
     * MeshBasicMaterial = zero lighting cost.
     */
    _buildSkySphere() {
        const radius = 50;
        const geo = new THREE.SphereGeometry(radius, 32, 16);
        // NOTE: don't flip the geometry with `scale(-1,1,1)` — BackSide alone
        // is what makes the inside visible. Doing both cancels out and the
        // sphere renders nothing, leaving the scene cleared to black.

        // Set vertex colours based on normalized Y (1=top, 0=mid, -1=bot)
        this._skyGeo = geo;
        this._updateSkyColors();

        const mat = new THREE.MeshBasicMaterial({
            vertexColors: true,
            side: THREE.BackSide,
            depthWrite: false,
            fog: false,         // sky dome should never be fogged
        });
        this._skySphere = new THREE.Mesh(geo, mat);
        this._skySphere.renderOrder = -1;   // render behind everything
        this._scene.add(this._skySphere);
        // Clear any old scene.background so the sphere is visible
        this._scene.background = null;
    }

    /** Update sky sphere vertex colours from state (top/mid/bot). */
    _updateSkyColors() {
        const geo = this._skyGeo;
        if (!geo) return;

        const top = new THREE.Color(this._state.skyTop);
        const mid = new THREE.Color(this._state.skyMid);
        const bot = new THREE.Color(this._state.skyBot);

        const pos    = geo.attributes.position;
        const count  = pos.count;
        const colors = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            const y = pos.getY(i);
            // Normalize: y ranges from -radius to +radius → t in [-1, +1]
            const t = y / 50;
            // Power curve so the mid colour reads as a visible band hugging
            // the horizon, with top/bot only blooming near the poles.
            // Exponent > 1 biases the lerp toward mid near the equator.
            const k = Math.pow(Math.abs(t), 1.7);
            let color;
            if (t >= 0) {
                color = mid.clone().lerp(top, k);
            } else {
                color = mid.clone().lerp(bot, k);
            }
            colors[i * 3]     = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.attributes.color.needsUpdate = true;
    }

    /** Build the sun/moon orb — a small unlit glowing sphere. */
    _buildSunOrb() {
        const geo = new THREE.SphereGeometry(1.5, 16, 12);
        const mat = new THREE.MeshBasicMaterial({
            color: new THREE.Color(this._state.sunColor),
            fog: false,         // orb shouldn't fade in fog
        });
        this._sunOrb = new THREE.Mesh(geo, mat);
        this._sunOrb.visible = this._state.sunVisible ?? true;
        this._scene.add(this._sunOrb);
    }

    /** Position the sun orb + directional light based on elevation angle.
     *  The orb sits behind the stage (−x, −z) so it's visible in the sky.
     *  The directional light is decoupled: it shines from the camera side
     *  (+x, +z quadrant) so the stage is front-lit like a theatre. The
     *  elevation slider still controls how steep the light angle is. */
    _applySunPosition() {
        const elev = (this._state.sunElevation ?? 60) * Math.PI / 180;

        // Sun orb — behind the stage so it's visible in the sky backdrop
        const orbDist = 35;
        const ox = -orbDist * Math.cos(elev) * 0.7;
        const oy =  orbDist * Math.sin(elev);
        const oz = -orbDist * Math.cos(elev) * 0.7;
        if (this._sunOrb) this._sunOrb.position.set(ox, oy, oz);

        // Directional light — from the camera/audience side (+x, +z),
        // offset slightly left so shadows have direction.  Height follows
        // the elevation slider so low sun = long dramatic shadows.
        const lightDist = 10;
        const lx = lightDist * Math.cos(elev) * 0.9;
        const ly = lightDist * Math.sin(elev) + 2;  // minimum 2m up
        const lz = lightDist * Math.cos(elev) * 0.5;
        if (this._dirLight) this._dirLight.position.set(lx, ly, lz);
    }

    /** Build the floating orb light — a PointLight paired with a small
     *  glowing sphere so the source itself is visible in the scene.
     *  Cost is ~1 extra light and ~192 tris; negligible on mobile. */
    _buildOrbLight() {
        const color = new THREE.Color(this._state.orbColor);
        this._orbLight = new THREE.PointLight(color, this._state.orbIntensity, ORB_LIGHT_RANGE, 2);
        this._orbLight.castShadow = false;   // shadows from point lights are expensive
        this._scene.add(this._orbLight);
        this._extraLights.push(this._orbLight);

        // Visible orb — small unlit sphere so the source reads on camera.
        const geo = new THREE.SphereGeometry(0.18, 16, 12);
        const mat = new THREE.MeshBasicMaterial({ color: color.clone(), fog: false });
        this._orbMesh = new THREE.Mesh(geo, mat);
        this._scene.add(this._orbMesh);
    }

    /** Apply current state to the orb light + mesh (position, colour,
     *  visibility, intensity). Flicker modulation happens in _onTick. */
    _applyOrbLight() {
        if (!this._orbLight) return;
        const s = this._state;
        const visible = !!s.orbVisible;
        this._orbLight.visible = visible;
        if (this._orbMesh) this._orbMesh.visible = visible;

        const h = Math.min(ORB_HEIGHT_MAX, Math.max(ORB_HEIGHT_MIN, s.orbHeight ?? DEFAULT_ORB_HEIGHT));
        this._orbLight.position.set(0, h, 0);
        if (this._orbMesh) this._orbMesh.position.set(0, h, 0);

        const col = new THREE.Color(s.orbColor);
        this._orbLight.color.copy(col);
        if (this._orbMesh) this._orbMesh.material.color.copy(col);

        // When flicker is off, set intensity directly; when on, _onTick drives it.
        if (!s.orbFlicker) {
            this._orbLight.intensity = s.orbIntensity;
        }
    }

    /** Apply fog state.
     *  Uses exponential-squared fog so the scene stays clear up close and
     *  fades smoothly into the distance — matching how atmospheric haze
     *  actually reads. The slider directly controls density: low = subtle
     *  distant haze, high = close fog. */
    _applyFog() {
        if (this._state.fogEnabled) {
            const d = this._state.fogDensity;
            this._scene.fog = new THREE.FogExp2(this._state.fogColor, d);
        } else {
            this._scene.fog = null;
        }
    }

    /** Apply a named sky preset — affects sky gradient + sun only.
     *  Lights and fog are left alone so the FX tab stays authoritative
     *  for scene lighting. */
    _applyFXPreset(key) {
        const p = FX_PRESETS[key];
        if (!p) return;
        this._state.fxPreset = key;

        // Sky colours
        this._state.skyTop = p.skyTop;
        this._state.skyMid = p.skyMid;
        this._state.skyBot = p.skyBot;
        this._updateSkyColors();

        // Sun / moon
        this._state.sunColor     = p.sunColor;
        this._state.sunElevation = p.sunElevation;
        this._state.sunVisible   = p.sunVisible;
        if (this._sunOrb) {
            this._sunOrb.material.color.set(p.sunColor);
            this._sunOrb.visible = p.sunVisible;
        }
        this._applySunPosition();

        // Orb light — only overridden when the preset actually defines it,
        // so older saves + flat presets don't clobber user tweaks.
        if (p.orbVisible   != null) this._state.orbVisible   = p.orbVisible;
        if (p.orbColor)             this._state.orbColor     = p.orbColor;
        if (p.orbIntensity != null) this._state.orbIntensity = p.orbIntensity;
        if (p.orbHeight    != null) this._state.orbHeight    = p.orbHeight;
        if (p.orbFlicker   != null) this._state.orbFlicker   = p.orbFlicker;
        this._applyOrbLight();
    }

    _applySunColor(hex) {
        this._state.sunColor = hex;
        if (this._sunOrb) this._sunOrb.material.color.set(hex);
    }

    // Treat the stored hex as a *tint* rather than a full replacement —
    // we blend it halfway toward white before handing it to Three.js, so
    // that picking (say) a blue gives a blue-tinted scene instead of
    // collapsing the red/green channels to near-zero. The stored state
    // keeps the user's original hex so the swatch shows what they chose.
    _tintedColor(hex) {
        const c = new THREE.Color(hex);
        c.lerp(new THREE.Color(0xffffff), 0.5);
        return c;
    }

    _applyAmbientColor(hex) {
        this._state.ambientColor = hex;
        if (this._ambientLight) this._ambientLight.color.copy(this._tintedColor(hex));
    }

    _applyDirColor(hex) {
        this._state.dirColor = hex;
        if (this._dirLight) this._dirLight.color.copy(this._tintedColor(hex));
    }

    _applyFogColor(hex) {
        this._state.fogColor = hex;
        this._applyFog();
    }

    _applyOrbColor(hex) {
        this._state.orbColor = hex;
        this._applyOrbLight();
    }

    // ── Weather particle system ─────────────────────────────────

    /** Build (or rebuild) the weather particle system.
     *  A single THREE.Points with WEATHER_PARTICLE_COUNT vertices.
     *  Particles are spread across the ground area, avoiding the
     *  interior of walled stages. */
    _buildWeather() {
        // Dispose old
        if (this._weatherPoints) {
            this._scene.remove(this._weatherPoints);
            this._weatherPoints.geometry.dispose();
            this._weatherPoints.material.dispose();
            this._weatherPoints = null;
            this._weatherVels   = null;
        }

        const type = this._state.weather;
        if (!type || type === 'none') return;

        const cfg = WEATHER_CFG[type];
        if (!cfg) return;

        const count = WEATHER_PARTICLE_COUNT;
        const positions = new Float32Array(count * 3);
        const vels      = new Float32Array(count * 3); // vx, vy, vz per particle

        const stageHalf = STAGE_SIZE / 2;
        const hasWalls  = (this._state.walls || 0) > 0;

        for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            // Random position across the ground area
            let x, z;
            do {
                x = (Math.random() - 0.5) * WEATHER_SPREAD * 2;
                z = (Math.random() - 0.5) * WEATHER_SPREAD * 2;
            } while (hasWalls && Math.abs(x) < stageHalf && Math.abs(z) < stageHalf);

            positions[i3]     = x;
            positions[i3 + 1] = Math.random() * WEATHER_HEIGHT;
            positions[i3 + 2] = z;

            // Per-particle velocity variation (±30%)
            const vary = 0.7 + Math.random() * 0.6;
            vels[i3]     = (Math.random() - 0.5) * cfg.drift;   // x drift
            vels[i3 + 1] = -cfg.speed * vary;                   // y fall speed
            vels[i3 + 2] = (Math.random() - 0.5) * cfg.drift;  // z drift
        }

        this._weatherVels = vels;

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        // Leaves get varied colours
        if (type === 'leaves') {
            const colors = new Float32Array(count * 3);
            const leafPalette = [
                new THREE.Color(0x88aa44), // green
                new THREE.Color(0x669933), // dark green
                new THREE.Color(0xbbaa33), // yellow-green
                new THREE.Color(0xcc8833), // orange
                new THREE.Color(0xaa5522), // brown
            ];
            for (let i = 0; i < count; i++) {
                const c = leafPalette[Math.floor(Math.random() * leafPalette.length)];
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

        this._weatherPoints = new THREE.Points(geo, mat);
        this._weatherPoints.frustumCulled = false; // always render
        this._scene.add(this._weatherPoints);
    }

    /** Advance weather particles by delta seconds.
     *  Called from _onTick only when playing. */
    _tickWeather(delta) {
        if (!this._weatherPoints || !this._weatherVels) return;

        const pos      = this._weatherPoints.geometry.attributes.position;
        const arr      = pos.array;
        const vels     = this._weatherVels;
        const count    = pos.count;
        const stageH   = STAGE_SIZE / 2;
        const hasWalls = (this._state.walls || 0) > 0;
        const type     = this._state.weather;
        const drift    = WEATHER_CFG[type]?.drift || 0;
        const time     = performance.now() * 0.001;

        for (let i = 0; i < count; i++) {
            const i3 = i * 3;

            // Advance position
            arr[i3]     += vels[i3]     * delta;
            arr[i3 + 1] += vels[i3 + 1] * delta;
            arr[i3 + 2] += vels[i3 + 2] * delta;

            // Leaves and snow get a gentle sine sway
            if (type !== 'rain') {
                arr[i3]     += Math.sin(time + i * 0.37) * drift * 0.3 * delta;
                arr[i3 + 2] += Math.cos(time + i * 0.53) * drift * 0.3 * delta;
            }

            // Reset particle if it falls below ground or drifts too far
            const y = arr[i3 + 1];
            const x = arr[i3];
            const z = arr[i3 + 2];

            const outOfBounds = y < 0 ||
                Math.abs(x) > WEATHER_SPREAD ||
                Math.abs(z) > WEATHER_SPREAD;

            // Push particles out of walled interior
            const insideWalls = hasWalls &&
                Math.abs(x) < stageH && Math.abs(z) < stageH;

            if (outOfBounds || insideWalls) {
                // Respawn at top with new random position
                let nx, nz;
                do {
                    nx = (Math.random() - 0.5) * WEATHER_SPREAD * 2;
                    nz = (Math.random() - 0.5) * WEATHER_SPREAD * 2;
                } while (hasWalls && Math.abs(nx) < stageH && Math.abs(nz) < stageH);
                arr[i3]     = nx;
                arr[i3 + 1] = WEATHER_HEIGHT + Math.random() * 2;
                arr[i3 + 2] = nz;
            }
        }

        pos.needsUpdate = true;
    }

    /**
     * Render BINGO column headers across the back edge (−z) and row
     * numbers 1–5 down the left edge (−x) of the stage grid.  Labels
     * sit just outside the stage so they don't overlap characters.
     */
    _buildGridNumbers() {
        const half = STAGE_SIZE / 2;       // 2.5
        const offset = 0.65;              // distance outside stage edge

        const makeSprite = (text) => {
            const canvas  = document.createElement('canvas');
            canvas.width  = 128;
            canvas.height = 128;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle    = 'rgba(255, 255, 255, 0.45)';
            ctx.font         = 'bold 72px sans-serif';
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, 64, 64);

            const tex    = new THREE.CanvasTexture(canvas);
            const mat    = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
            const sprite = new THREE.Sprite(mat);
            sprite.scale.set(0.55, 0.55, 1);
            return sprite;
        };

        // Left edge (−x): rows 5 (front, z=+2) down to 1 (back, z=−2)
        for (let i = 0; i < 5; i++) {
            const sprite = makeSprite(String(5 - i));
            sprite.position.set(-half - offset, 0.06, 2 - i);
            this._scene.add(sprite);
            this._gridNumbers.push(sprite);
        }

        // Back edge (−z): columns B (left, x=−2) to O (right, x=+2)
        for (let i = 0; i < 5; i++) {
            const sprite = makeSprite(BINGO_COLS[i]);
            sprite.position.set(i - 2, 0.06, -half - offset);
            this._scene.add(sprite);
            this._gridNumbers.push(sprite);
        }
    }

    /**
     * Build the 3D meshes for every cast slot that has a cell assigned.
     * Each slot gets its assigned colour as a subtle tint on the mesh.
     */
    _buildStageItems() {
        this._clearStageItems();
        const camX = 5.2, camZ = 5.2;

        for (let i = 0; i < CAST_SLOT_COUNT; i++) {
            const slot = this._state.cast[i];
            if (!slot || !slot.cell) continue;
            const pos = _cellToWorld(slot.cell);
            if (!pos) continue;

            const color = CAST_COLORS[i] || '#888888';
            const group = this._makeGreyboxCharacter(color);
            group.position.set(pos.x, 0, pos.z);

            // Apply facing rotation
            const facing = slot.facing || 'camera';
            if (facing === 'camera') {
                group.rotation.y = Math.atan2(camX - pos.x, camZ - pos.z);
            } else {
                const target = _cellToWorld(facing);
                if (target) {
                    group.rotation.y = Math.atan2(target.x - pos.x, target.z - pos.z);
                }
            }

            this._scene.add(group);
            this._stageItemMeshes.push(group);
        }
    }

    /** Dispose and remove all current stage-item meshes. */
    _clearStageItems() {
        for (const g of this._stageItemMeshes) {
            g.traverse(child => {
                child.geometry?.dispose?.();
                child.material?.dispose?.();
            });
            this._scene.remove(g);
        }
        this._stageItemMeshes = [];
    }

    // ── Set Dressing (stage items) ──────────────────────────────

    /**
     * Build 3D meshes for stage set-dressing items.
     * Modes: 'place' puts a single item on a BINGO cell;
     *        'scatter' / 'tile' distributes across unoccupied stage cells.
     * All items are height-capped to avoid blocking cast character faces.
     */
    async _rebuildSetDressing() {
        this._clearSetDressing();
        const list = this._objectList || [];
        const half = STAGE_SIZE / 2;

        // Cells occupied by cast members — set dressing avoids these
        const usedCells = new Set(
            (this._state.cast || []).filter(s => s?.cell).map(s => s.cell)
        );

        for (const slot of this._state.stageItems) {
            if (!slot.assetId || slot.assetId === 'none') continue;
            const entry = list.find(o => o.id === slot.assetId);
            if (!entry) continue;

            let asset;
            try { asset = await _fetchAsset(entry.path); } catch { continue; }

            const template = this._buildMeshFromAsset(asset);
            if (!template) continue;

            const baseScale = slot.scale ?? 1.0;
            const templateH = template.userData._templateHeight || 1;

            if (slot.mode === 'place') {
                // Single placement on a specific cell
                if (!slot.cell) { this._disposeTemplate(template); continue; }
                const pos = _cellToWorld(slot.cell);
                if (!pos) { this._disposeTemplate(template); continue; }

                const clone = template.clone();
                clone.position.set(pos.x, 0, pos.z);
                clone.rotation.y = Math.random() * Math.PI * 2;

                // Height-cap: scale down if it would exceed the cap
                let s = baseScale;
                if (templateH * s > SET_DRESSING_HEIGHT_CAP) {
                    s = SET_DRESSING_HEIGHT_CAP / templateH;
                }
                clone.scale.set(s, s, s);
                this._scene.add(clone);
                this._setDressingMeshes.push(clone);
            } else {
                // Scatter or tile across the stage area
                const points = slot.mode === 'tile'
                    ? this._stageTilePoints(_STAGE_TILE_SPACING[slot.density] ?? 1.4, usedCells)
                    : this._stageScatterPoints(_STAGE_SCATTER_COUNTS[slot.density] ?? 6, usedCells);

                const isScatter = slot.mode !== 'tile';
                for (const pt of points) {
                    const clone = template.clone();
                    clone.position.set(pt.x, 0, pt.z);
                    clone.rotation.y = pt.rotY;

                    let s = isScatter
                        ? baseScale * (0.7 + Math.random() * 0.6)
                        : baseScale;
                    // Height-cap
                    if (templateH * s > SET_DRESSING_HEIGHT_CAP) {
                        s = SET_DRESSING_HEIGHT_CAP / templateH;
                    }
                    clone.scale.set(s, s, s);
                    this._scene.add(clone);
                    this._setDressingMeshes.push(clone);
                }
            }

            this._disposeTemplate(template);
        }
    }

    _clearSetDressing() {
        for (const g of this._setDressingMeshes) {
            g.traverse(child => {
                child.geometry?.dispose?.();
                child.material?.dispose?.();
            });
            this._scene.remove(g);
        }
        this._setDressingMeshes = [];
    }

    _disposeTemplate(t) {
        t.traverse(c => { c.geometry?.dispose?.(); c.material?.dispose?.(); });
    }

    /** Scatter random points within the stage area, avoiding occupied cells. */
    _stageScatterPoints(count, usedCells) {
        const half = STAGE_SIZE / 2;
        const pts = [];
        let tries = 0;
        while (pts.length < count && tries < count * 20) {
            const x = (Math.random() - 0.5) * STAGE_SIZE;
            const z = (Math.random() - 0.5) * STAGE_SIZE;
            tries++;
            // Avoid occupied cast cells (±0.4 around cell centre)
            let blocked = false;
            for (const c of usedCells) {
                const p = _cellToWorld(c);
                if (p && Math.abs(x - p.x) < 0.4 && Math.abs(z - p.z) < 0.4) {
                    blocked = true; break;
                }
            }
            if (blocked) continue;
            pts.push({ x, z, rotY: Math.random() * Math.PI * 2 });
        }
        return pts;
    }

    /** Regular grid within the stage area, skipping occupied cells. */
    _stageTilePoints(spacing, usedCells) {
        const half = STAGE_SIZE / 2;
        const pts = [];
        for (let x = -half + spacing / 2; x < half; x += spacing) {
            for (let z = -half + spacing / 2; z < half; z += spacing) {
                let blocked = false;
                for (const c of usedCells) {
                    const p = _cellToWorld(c);
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

    /**
     * Create a greybox placeholder character: rounded-box body + head,
     * proportions loosely matching the character builder.
     */
    _makeGreyboxCharacter(slotColor) {
        // Subtle tint: blend the slot colour with grey at ~30% strength
        const baseGrey = new THREE.Color(0x888888);
        const tint     = new THREE.Color(slotColor || '#888888');
        const blended  = baseGrey.clone().lerp(tint, 0.3);
        const grey = new THREE.MeshStandardMaterial({
            color: blended, roughness: 0.85, metalness: 0,
        });
        const noseTint = baseGrey.clone().lerp(tint, 0.5);
        const noseMat = new THREE.MeshStandardMaterial({
            color: noseTint, roughness: 0.7, metalness: 0,
        });

        // Body — roughly 0.4 wide × 0.65 tall × 0.25 deep
        const bodyGeo  = new RoundedBoxGeometry(0.4, 0.65, 0.25, 2, 0.06);
        const body     = new THREE.Mesh(bodyGeo, grey);
        body.position.y = 0.325;            // bottom at y=0
        body.castShadow = true;

        // Head — roughly 0.3 × 0.32 × 0.26, with more rounding
        const headGeo  = new RoundedBoxGeometry(0.3, 0.32, 0.26, 2, 0.08);
        const head     = new THREE.Mesh(headGeo, grey);
        head.position.y = 0.65 + 0.05 + 0.16;  // body top + neck gap + half head
        head.castShadow = true;

        // Nose — small bump on the front face (+z) of the head so you
        // can see which way the character is facing
        const noseGeo = new THREE.ConeGeometry(0.04, 0.08, 6);
        noseGeo.rotateX(Math.PI / 2);       // point forward along +z
        const nose = new THREE.Mesh(noseGeo, noseMat);
        nose.position.set(0, 0.65 + 0.05 + 0.14, 0.14);  // centred on head, front face
        nose.castShadow = true;

        const group = new THREE.Group();
        group.add(body);
        group.add(head);
        group.add(nose);
        return group;
    }

    // ── Ground-object scatter / tile ──────────────────────────

    /** Tear down and rebuild all ground-object meshes from state. */
    async _rebuildGroundObjects() {
        this._clearGroundObjects();
        const list = this._objectList || [];
        const half = this._state.groundSize / 2;
        const stageHalf = STAGE_SIZE / 2 + 0.5; // buffer so nothing clips the stage

        for (const slot of this._state.groundObjects) {
            if (!slot.assetId || slot.assetId === 'none') continue;
            const entry = list.find(o => o.id === slot.assetId);
            if (!entry) continue;

            // Load the full asset JSON
            let asset;
            try { asset = await _fetchAsset(entry.path); } catch { continue; }

            // Build a template mesh group from the asset's elements
            const template = this._buildMeshFromAsset(asset);
            if (!template) continue;

            // Generate placement points
            const points = slot.mode === 'tile'
                ? this._tilePoints(half, _TILE_SPACING[slot.density] ?? 2.5, stageHalf)
                : this._scatterPoints(half, _SCATTER_COUNTS[slot.density] ?? 14, stageHalf);

            const baseScale = slot.scale ?? 1.0;
            const isScatter = slot.mode !== 'tile';
            for (const pt of points) {
                // Auto-cull: skip points inside the camera corridor
                if (_inCameraCorridor(pt.x, pt.z, stageHalf)) continue;

                const clone = template.clone();
                clone.position.set(pt.x, 0, pt.z);
                clone.rotation.y = pt.rotY;

                // Scale: scatter gets ±30% random variation, tile is uniform
                const templateH = template.userData._templateHeight || 1;
                let s = isScatter
                    ? baseScale * (0.7 + Math.random() * 0.6)
                    : baseScale;
                // Height-cap: scale down if it would exceed the ground object cap
                if (templateH * s > GROUND_OBJ_HEIGHT_CAP) {
                    s = GROUND_OBJ_HEIGHT_CAP / templateH;
                }
                clone.scale.set(s, s, s);

                // Store actual world height for dynamic camera culling
                clone.userData._worldHeight = (template.userData._templateHeight || 1) * s;

                this._scene.add(clone);
                this._groundObjMeshes.push(clone);
            }

            // Dispose the template (we only needed it for cloning)
            template.traverse(c => { c.geometry?.dispose?.(); c.material?.dispose?.(); });
        }
    }

    _clearGroundObjects() {
        for (const g of this._groundObjMeshes) {
            g.traverse(child => {
                child.geometry?.dispose?.();
                child.material?.dispose?.();
            });
            this._scene.remove(g);
        }
        this._groundObjMeshes = [];
    }

    /**
     * Build a Three.js Group from an object asset's element list.
     * Handles box, cylinder, cone, sphere, torus primitives.
     * The group is shifted so its bounding-box bottom sits at y=0.
     */
    _buildMeshFromAsset(asset) {
        const elements = asset?.payload?._editor?.elements;
        if (!elements || !elements.length) return null;
        const colors = asset.payload.color_assignments || {};

        const group = new THREE.Group();
        for (const el of elements) {
            let geom;
            switch (el.type) {
                case 'box':
                    geom = new THREE.BoxGeometry(el.width || 1, el.height || 1, el.depth || 1);
                    break;
                case 'cylinder':
                    geom = new THREE.CylinderGeometry(
                        el.radiusTop ?? 0.5, el.radiusBottom ?? 0.5, el.height || 1, 16);
                    break;
                case 'cone':
                    geom = new THREE.ConeGeometry(el.radius ?? 0.5, el.height || 1, 16);
                    break;
                case 'sphere':
                    geom = new THREE.SphereGeometry(el.radius ?? 0.5, 16, 12);
                    break;
                case 'torus':
                    geom = new THREE.TorusGeometry(el.radius ?? 0.5, el.tube ?? 0.2, 12, 24);
                    break;
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

        // Shift the group so its bottom sits at y = 0
        const box3 = new THREE.Box3().setFromObject(group);
        if (box3.min.y !== 0) {
            group.children.forEach(c => { c.position.y -= box3.min.y; });
        }
        // Store unscaled height so dynamic culling knows how tall each clone is
        group.userData._templateHeight = box3.max.y - box3.min.y;
        return group;
    }

    /** Random points on the ground plane, avoiding the stage area and camera corridor. */
    _scatterPoints(halfGround, count, stageHalf) {
        const pts = [];
        let tries = 0;
        while (pts.length < count && tries < count * 20) {
            const x = (Math.random() - 0.5) * halfGround * 2;
            const z = (Math.random() - 0.5) * halfGround * 2;
            tries++;
            if (Math.abs(x) < stageHalf && Math.abs(z) < stageHalf) continue;
            if (_inCameraCorridor(x, z, stageHalf)) continue;
            pts.push({ x, z, rotY: Math.random() * Math.PI * 2 });
        }
        return pts;
    }

    /** Regular grid on the ground plane, skipping the stage area and camera corridor. */
    _tilePoints(halfGround, spacing, stageHalf) {
        const pts = [];
        for (let x = -halfGround + spacing / 2; x < halfGround; x += spacing) {
            for (let z = -halfGround + spacing / 2; z < halfGround; z += spacing) {
                if (Math.abs(x) < stageHalf && Math.abs(z) < stageHalf) continue;
                if (_inCameraCorridor(x, z, stageHalf)) continue;
                pts.push({ x, z, rotY: 0 });
            }
        }
        return pts;
    }

    // ── Live scene updates from panel controls ──────────────────

    _applyGroundColor(hex) {
        this._state.groundColor = hex;
        this._groundMesh?.material.color.set(hex);
    }

    _applyStageColor(hex) {
        this._state.stageColor = hex;
        this._stageMesh?.material.color.set(hex);
    }

    _applyWallColor(hex) {
        this._state.wallColor = hex;
        const color = new THREE.Color(hex);
        for (const wall of [this._wallBack, this._wallFront, this._wallLeft, this._wallRight]) {
            if (!wall) continue;
            wall.traverse(child => {
                if (child.material && !child.material.transparent) {
                    child.material.color.copy(color);
                }
            });
        }
    }

    _applySkyColor(field, hex) {
        this._state[field] = hex;
        this._updateSkyColors();
    }

    _applyTexture(field, id) {
        if (field === 'groundTexture') this._state.groundTexture = id;
        if (field === 'stageTexture')  this._state.stageTexture  = id;
        if (field === 'wallTexture')   this._state.wallTexture   = id;
        // Texture rendering is a stub for now — the chosen id is saved
        // in state. Visual application will land in a future pass.
    }

    _applyGroundSize(n) {
        const clamped = _snapOdd(n);
        this._state.groundSize = clamped;
        // Rebuild ground + grid with the new size
        if (this._groundMesh) {
            this._groundMesh.geometry.dispose();
            this._groundMesh.geometry = new THREE.BoxGeometry(clamped, 1, clamped);
        }
        if (this._worldGrid) {
            this._scene.remove(this._worldGrid);
            this._worldGrid.geometry.dispose();
            this._worldGrid.material.dispose();
            this._buildWorldGrid();
        }
    }

    _applyWalls(h, skipState = false) {
        const height = Math.max(0, Math.min(WALL_HEIGHT_MAX, Math.round(h)));
        if (!skipState) this._state.walls = height;
        this._wallsEnabled = height > 0;

        // Rebuild wall blocks (the block count depends on height)
        this._rebuildWallBlocks();

        for (const wall of [this._wallBack, this._wallFront, this._wallLeft, this._wallRight]) {
            if (!wall) continue;
            wall.visible = this._wallsEnabled;
        }
        // Run a single dynamic-cull pass so the camera-facing walls hide immediately
        if (this._wallsEnabled) this._cullWallsByCamera();

        // Rebuild weather so particles avoid (or enter) the interior
        if (this._state.weather && this._state.weather !== 'none') {
            this._buildWeather();
        }
    }

    /** Update window style and rebuild walls. */
    _applyWindowStyle(style) {
        this._state.windowStyle = _migrateWindowStyle(style) || 'none';
        this._rebuildWallBlocks();
    }

    /** Update window pane colour on existing panes. */
    _applyWindowColor(hex) {
        this._state.windowColor = hex;
        const color = new THREE.Color(hex);
        for (const wall of [this._wallBack, this._wallFront, this._wallLeft, this._wallRight]) {
            if (!wall) continue;
            wall.traverse(child => {
                if (child.material?.transparent) {
                    child.material.color.copy(color);
                }
            });
        }
    }

    /** Update window pane opacity (0.05–1.0) on existing panes live. */
    _applyWindowOpacity(val) {
        const op = Math.min(WINDOW_OPACITY_MAX, Math.max(WINDOW_OPACITY_MIN, +val || 0));
        this._state.windowOpacity = op;
        for (const wall of [this._wallBack, this._wallFront, this._wallLeft, this._wallRight]) {
            if (!wall) continue;
            wall.traverse(child => {
                if (child.material?.transparent) {
                    child.material.opacity = op;
                    child.material.needsUpdate = true;
                }
            });
        }
    }

    /**
     * Dynamic wall culling — mostly 2 walls hidden, with a sweet spot
     * near the axes where only 1 wall hides (showing 3 walls).
     *
     * When the camera is at a corner angle (roughly equal |cx| and |cz|),
     * both walls in that quadrant are hidden → 2-wall view.  When the
     * camera is nearly axis-aligned (one axis dominates by >2.5×), only
     * the single dominant wall hides → 3-wall view.
     *
     * Default camera (5.2, _, 5.2) has ratio ≈ 1 → 2-wall view (back+left).
     */
    _cullWallsByCamera() {
        if (!this._wallsEnabled) return;
        const cx = this._camera.position.x;
        const cz = this._camera.position.z;
        const ax = Math.abs(cx);
        const az = Math.abs(cz);

        // Start with all visible
        this._wallBack.visible  = true;
        this._wallFront.visible = true;
        this._wallLeft.visible  = true;
        this._wallRight.visible = true;

        const ratio = Math.max(ax, az) / (Math.min(ax, az) + 0.001);

        if (ratio > 2.5) {
            // Near-axis: only hide the single dominant wall → 3-wall room
            if (ax > az) {
                if (cx > 0) this._wallRight.visible = false;
                else        this._wallLeft.visible  = false;
            } else {
                if (cz > 0) this._wallFront.visible = false;
                else        this._wallBack.visible  = false;
            }
        } else {
            // Corner angle: hide both walls in the camera's quadrant → 2-wall room
            if (cx > 0) this._wallRight.visible = false;
            else        this._wallLeft.visible  = false;
            if (cz > 0) this._wallFront.visible = false;
            else        this._wallBack.visible  = false;
        }
    }

    /**
     * Dynamic ground-object culling: hide objects that are between the
     * camera and the stage AND tall enough to obstruct the view.
     *
     * For each object we check two things:
     *   1. Is it in the camera corridor? (within ±30° of the camera
     *      direction from the origin, i.e. roughly "in front of" the
     *      camera when looking at the stage)
     *   2. Is it taller than a threshold? (short ground-cover like
     *      grass and flowers should stay visible)
     *
     * Objects that fail both checks are shown; objects that pass both
     * are hidden.  This runs every frame but is just arithmetic — no
     * bounding-box recomputation.
     */
    _cullGroundObjectsByCamera() {
        const meshes = this._groundObjMeshes;
        if (!meshes.length) return;

        const cx = this._camera.position.x;
        const cz = this._camera.position.z;
        const camLen = Math.sqrt(cx * cx + cz * cz) || 1;
        const cnx = cx / camLen;
        const cnz = cz / camLen;
        const cosThr = Math.cos(Math.PI * 2 / 9);  // ±40° half-angle
        const stageHalf = STAGE_SIZE / 2 + 0.5;
        const heightThr = 0.8;                    // below this → always visible

        for (let i = 0; i < meshes.length; i++) {
            const m = meshes[i];
            const ox = m.position.x;
            const oz = m.position.z;
            const oLen = Math.sqrt(ox * ox + oz * oz);

            // Objects inside the stage buffer are always visible (shouldn't exist, but safe)
            if (oLen < stageHalf) { m.visible = true; continue; }

            const worldH = m.userData._worldHeight || 0;
            // Short objects never obstruct — always show
            if (worldH < heightThr) { m.visible = true; continue; }

            // Dot product: is this object in the camera's direction from origin?
            const dot = (ox * cnx + oz * cnz) / (oLen || 1);
            m.visible = dot <= cosThr;    // outside the corridor → show
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  STATE
    // ═══════════════════════════════════════════════════════════════

    _getState() {
        return {
            ...this._state,   // includes skyTop, skyMid, skyBot
            description: this.asset?.payload?.description || '',
            tags:        this.asset?.tags || [],
        };
    }

    _applyState(state) {
        if (!state) return;
        if (state.groundColor && state.groundColor !== this._state.groundColor) {
            this._applyGroundColor(state.groundColor);
        }
        if (state.stageColor && state.stageColor !== this._state.stageColor) {
            this._applyStageColor(state.stageColor);
        }
        if (state.wallColor && state.wallColor !== this._state.wallColor) {
            this._applyWallColor(state.wallColor);
        }
        if (typeof state.groundSize === 'number' && state.groundSize !== this._state.groundSize) {
            this._applyGroundSize(state.groundSize);
        }
        if (state.walls != null && state.walls !== this._state.walls) {
            // Backwards-compat: convert old string modes to numeric heights
            const wh = typeof state.walls === 'string'
                ? ({ off: 0, low: 1, med: 3, high: 5 }[state.walls] ?? 0)
                : state.walls;
            this._applyWalls(wh);
        }
        if (state.groundTexture && state.groundTexture !== this._state.groundTexture) {
            this._applyTexture('groundTexture', state.groundTexture);
        }
        if (state.stageTexture && state.stageTexture !== this._state.stageTexture) {
            this._applyTexture('stageTexture', state.stageTexture);
        }
        if (state.wallTexture && state.wallTexture !== this._state.wallTexture) {
            this._applyTexture('wallTexture', state.wallTexture);
        }
        // Windows
        if (state.windowStyle && state.windowStyle !== this._state.windowStyle) {
            this._applyWindowStyle(state.windowStyle);
        }
        if (state.windowColor && state.windowColor !== this._state.windowColor) {
            this._applyWindowColor(state.windowColor);
        }
        if (state.windowOpacity != null && state.windowOpacity !== this._state.windowOpacity) {
            this._applyWindowOpacity(state.windowOpacity);
        }
        // Sky gradient
        for (const f of ['skyTop', 'skyMid', 'skyBot']) {
            if (state[f] && state[f] !== this._state[f]) {
                this._applySkyColor(f, state[f]);
            }
        }
        // Cast placement
        if (Array.isArray(state.cast)) {
            this._state.cast = state.cast;
            this._buildStageItems();
        }
        // Legacy stageItems → cast migration
        if (Array.isArray(state.stageItems) && !Array.isArray(state.cast)) {
            // Convert old variable-length stageItems to fixed 5-slot cast
            const cast = Array.from({ length: CAST_SLOT_COUNT }, (_, i) => {
                const old = state.stageItems[i];
                return old ? { cell: old.cell || null, facing: old.facing || 'camera' }
                           : { cell: null, facing: 'camera' };
            });
            this._state.cast = cast;
            this._buildStageItems();
        }
        // Set dressing (stage items)
        if (Array.isArray(state.stageItems) && state.stageItems.length &&
            state.stageItems[0]?.assetId !== undefined) {
            // New-format stageItems (set dressing with assetId)
            this._state.stageItems = state.stageItems;
            this._rebuildSetDressing();
        }
        // Ground objects
        if (Array.isArray(state.groundObjects)) {
            this._state.groundObjects = state.groundObjects;
            this._rebuildGroundObjects();
        }
        // FX — apply preset or individual fields
        // Sky preset covers sky gradient + sun fields. Individual sky/sun
        // fields below can still override the preset, and lights/fog are
        // always loaded from their own state (the preset no longer owns
        // them).
        if (state.fxPreset && FX_PRESETS[state.fxPreset]) {
            this._applyFXPreset(state.fxPreset);
        }
        if (state.sunColor)    this._applySunColor(state.sunColor);
        if (state.sunElevation != null) {
            this._state.sunElevation = state.sunElevation;
            this._applySunPosition();
        }
        if (state.sunVisible != null) {
            this._state.sunVisible = state.sunVisible;
            if (this._sunOrb) this._sunOrb.visible = state.sunVisible;
        }
        if (state.ambientColor) this._applyAmbientColor(state.ambientColor);
        if (state.ambientIntensity != null) {
            this._state.ambientIntensity = state.ambientIntensity;
            if (this._ambientLight) this._ambientLight.intensity = state.ambientIntensity;
        }
        if (state.dirColor)    this._applyDirColor(state.dirColor);
        if (state.dirIntensity != null) {
            this._state.dirIntensity = state.dirIntensity;
            if (this._dirLight) this._dirLight.intensity = state.dirIntensity;
        }
        if (state.fogEnabled != null) this._state.fogEnabled = state.fogEnabled;
        if (state.fogColor)  this._state.fogColor  = state.fogColor;
        if (state.fogDensity != null) this._state.fogDensity = state.fogDensity;
        if (state.fogEnabled != null || state.fogColor || state.fogDensity != null) {
            this._applyFog();
        }
        // Orb light
        let orbDirty = false;
        if (state.orbVisible   != null) { this._state.orbVisible   = state.orbVisible;   orbDirty = true; }
        if (state.orbColor)             { this._state.orbColor     = state.orbColor;     orbDirty = true; }
        if (state.orbIntensity != null) { this._state.orbIntensity = state.orbIntensity; orbDirty = true; }
        if (state.orbHeight    != null) { this._state.orbHeight    = state.orbHeight;    orbDirty = true; }
        if (state.orbFlicker   != null) { this._state.orbFlicker   = state.orbFlicker;   orbDirty = true; }
        if (orbDirty) this._applyOrbLight();
        // Weather
        if (state.weather && state.weather !== this._state.weather) {
            this._state.weather = state.weather;
            this._buildWeather();
        }
        super._applyState(state);
    }

    // ═══════════════════════════════════════════════════════════════
    //  PANEL
    // ═══════════════════════════════════════════════════════════════

    _renderPanelBody() {
        const tab = this._activeTab;

        const tabBar = `<div class="cb-tabs-list">${
            TABS.map(t =>
                `<button class="cb-tab-trigger ${t.id === tab ? 'active' : ''}" data-tab="${t.id}">
                    ${t.label}
                 </button>`
            ).join('')
        }</div>`;

        let body = '';
        if (tab === 'file')   body = this._renderFileTab();
        if (tab === 'ground') body = this._renderGroundTab();
        if (tab === 'sky')    body = this._renderSkyTab();
        if (tab === 'stage')  body = this._renderStageTab();
        if (tab === 'fx')     body = this._renderFXTab();

        return tabBar + `<div class="cb-tab-content">${body}</div>`;
    }

    // ── File tab ────────────────────────────────────────────────
    _renderFileTab() {
        return renderFileTab(this.asset, {
            namePlaceholder: 'Environment name…',
            descPlaceholder: 'Describe this environment…',
            tagsPlaceholder: 'e.g. template, outdoor, warm',
        });
    }

    // ── Ground tab ──────────────────────────────────────────────
    _renderGroundTab() {
        const s = this._state;
        const subtitle = renderSubtitle;

        const colorTrigger = (field, hex) => `
            <button type="button" class="cb-color-trigger" data-color-field="${field}"
                    style="background:${hex};" aria-label="Choose color"></button>`;

        const textureSelect = (field, currentId) => {
            const opts = this._textureOpts || [];
            const optionsHtml = `<option value="none"${currentId === 'none' ? ' selected' : ''}>None</option>` +
                opts.map(o =>
                    `<option value="${o.id}"${currentId === o.id ? ' selected' : ''}>${_esc(o.name)}</option>`
                ).join('');
            return `<select class="cb-tex-select" data-tex-field="${field}">${optionsHtml}</select>`;
        };

        // Default-position % for the size slider's faint default tick
        const defPos = ((DEFAULT_GROUND_SIZE - GROUND_SIZE_MIN) /
                        (GROUND_SIZE_MAX - GROUND_SIZE_MIN)) * 100;

        const wallH = s.walls || 0;
        const wallLabel = wallH === 0 ? 'Off' : `${wallH} block${wallH > 1 ? 's' : ''}`;

        return `
          ${subtitle('Ground Plane', 'groundPlane')}

          <div class="cb-card-tight">
            <div class="cb-card-tight-label">Size</div>
            <div class="cb-card-tight-control">
              <div class="cb-slider-wrap" style="--default-pos:${defPos}%;">
                <input type="range" class="cb-range" id="ground-size"
                       min="${GROUND_SIZE_MIN}" max="${GROUND_SIZE_MAX}" step="2"
                       value="${s.groundSize}">
              </div>
            </div>
            <div class="cb-card-tight-value" id="ground-size-val">${s.groundSize}×${s.groundSize}</div>
          </div>

          <div class="cb-card-tight">
            <div class="cb-card-tight-label">Color</div>
            <div class="cb-card-tight-control">
              ${colorTrigger('groundColor', s.groundColor)}
            </div>
            <div class="cb-card-tight-value" id="ground-color-val">${s.groundColor}</div>
          </div>

          <div class="cb-card-tight">
            <div class="cb-card-tight-label">Texture</div>
            <div class="cb-card-tight-control">
              ${textureSelect('groundTexture', s.groundTexture)}
            </div>
          </div>

          ${subtitle('Stage', 'stage')}

          <div class="cb-card-tight">
            <div class="cb-card-tight-label">Color</div>
            <div class="cb-card-tight-control">
              ${colorTrigger('stageColor', s.stageColor)}
            </div>
            <div class="cb-card-tight-value" id="stage-color-val">${s.stageColor}</div>
          </div>

          <div class="cb-card-tight">
            <div class="cb-card-tight-label">Texture</div>
            <div class="cb-card-tight-control">
              ${textureSelect('stageTexture', s.stageTexture)}
            </div>
          </div>

          ${subtitle('Walls', 'walls')}

          <div class="cb-card-tight">
            <div class="cb-card-tight-label">Height</div>
            <div class="cb-card-tight-control">
              <input type="range" id="wall-height-slider"
                     min="${WALL_HEIGHT_MIN}" max="${WALL_HEIGHT_MAX}" step="1"
                     value="${wallH}">
            </div>
            <div class="cb-card-tight-value" id="wall-height-val">${wallLabel}</div>
          </div>

          <div class="cb-card-tight">
            <div class="cb-card-tight-label">Color</div>
            <div class="cb-card-tight-control">
              ${colorTrigger('wallColor', s.wallColor)}
            </div>
            <div class="cb-card-tight-value" id="wall-color-val">${s.wallColor}</div>
          </div>

          <div class="cb-card-tight">
            <div class="cb-card-tight-label">Texture</div>
            <div class="cb-card-tight-control">
              ${textureSelect('wallTexture', s.wallTexture)}
            </div>
          </div>

          <div class="cb-card-tight">
            <div class="cb-card-tight-label">Windows</div>
            <div class="cb-card-tight-control">
              <select id="window-style-select">
                ${['none', 'single', 'double', 'triple'].map(v =>
                    `<option value="${v}"${s.windowStyle === v ? ' selected' : ''}>${v[0].toUpperCase() + v.slice(1)}</option>`
                ).join('')}
              </select>
            </div>
          </div>

          ${s.windowStyle !== 'none' ? `
          <div class="cb-card-tight">
            <div class="cb-card-tight-label">Pane</div>
            <div class="cb-card-tight-control">
              ${colorTrigger('windowColor', s.windowColor)}
            </div>
            <div class="cb-card-tight-value" id="window-color-val">${s.windowColor}</div>
          </div>
          <div class="cb-card-tight">
            <div class="cb-card-tight-label">Opacity</div>
            <div class="cb-card-tight-control">
              <input type="range" id="window-opacity" min="${WINDOW_OPACITY_MIN}" max="${WINDOW_OPACITY_MAX}" step="0.05"
                     value="${s.windowOpacity}" class="cb-slider">
            </div>
            <div class="cb-card-tight-value" id="window-opacity-val">${Math.round(s.windowOpacity * 100)}%</div>
          </div>` : ''}

          ${subtitle('Ground Objects', 'groundObjects')}
          ${this._renderGroundObjectSlots()}
        `;
    }

    /** Render the 3 ground-object slot cards (used by _renderGroundTab). */
    _renderGroundObjectSlots() {
        const slots = this._state.groundObjects;
        const objs  = this._objectList || [];
        const modeLabels    = { scatter: 'Scatter', tile: 'Tile' };
        const densityLabels = { low: 'Low', med: 'Med', high: 'High' };

        return slots.map((slot, i) => {
            const optionsHtml = `<option value="none"${slot.assetId === 'none' ? ' selected' : ''}>None</option>` +
                objs.map(o =>
                    `<option value="${o.id}"${slot.assetId === o.id ? ' selected' : ''}>${_esc(o.name)}</option>`
                ).join('');

            const hasObj = slot.assetId && slot.assetId !== 'none';
            const scaleVal = slot.scale ?? 1.0;
            const scaleLabel = scaleVal.toFixed(1) + '×';

            const controlsHtml = hasObj ? `
                <div class="cb-gobj-row">
                  <div class="cb-segmented cb-gobj-mode" data-slot="${i}">
                    ${Object.entries(modeLabels).map(([k, v]) =>
                        `<button type="button" data-mode="${k}" class="${slot.mode === k ? 'active' : ''}">${v}</button>`
                    ).join('')}
                  </div>
                  <div class="cb-segmented cb-gobj-density" data-slot="${i}">
                    ${Object.entries(densityLabels).map(([k, v]) =>
                        `<button type="button" data-density="${k}" class="${slot.density === k ? 'active' : ''}">${v}</button>`
                    ).join('')}
                  </div>
                </div>
                <div class="cb-gobj-row">
                  <span class="cb-gobj-scale-label">Scale ${scaleLabel}</span>
                  <input type="range" class="cb-gobj-scale" data-slot="${i}"
                         min="0.2" max="2.0" step="0.1" value="${scaleVal}">
                </div>` : '';

            return `
              <div class="cb-gobj-card" data-slot="${i}">
                <div class="cb-gobj-card-header">
                  <span class="cb-gobj-card-num">${i + 1}</span>
                  <select class="cb-gobj-select" data-slot="${i}">${optionsHtml}</select>
                </div>
                ${controlsHtml}
              </div>`;
        }).join('');
    }

    // ── Sky tab ──────────────────────────────────────────────────
    _renderSkyTab() {
        const s = this._state;
        const subtitle = renderSubtitle;

        const colorTrigger = (field, hex) => `
            <button type="button" class="cb-color-trigger" data-color-field="${field}"
                    style="background:${hex};" aria-label="Choose color"></button>`;

        // Time-of-day preset buttons
        const presetBtns = Object.entries(FX_PRESETS).map(([key, p]) =>
            `<button type="button" class="cb-fx-preset${s.fxPreset === key ? ' active' : ''}"
                     data-preset="${key}">${p.label}</button>`
        ).join('');

        return `
          ${subtitle('Time of Day', 'fx')}
          <div class="cb-fx-preset-row">${presetBtns}</div>

          ${subtitle('Sky Gradient', 'sky')}

          <div class="cb-card-tight">
            <div class="cb-card-tight-label">Top</div>
            <div class="cb-card-tight-control">
              ${colorTrigger('skyTop', s.skyTop)}
            </div>
            <div class="cb-card-tight-value" id="sky-top-val">${s.skyTop}</div>
          </div>

          <div class="cb-card-tight">
            <div class="cb-card-tight-label">Middle</div>
            <div class="cb-card-tight-control">
              ${colorTrigger('skyMid', s.skyMid)}
            </div>
            <div class="cb-card-tight-value" id="sky-mid-val">${s.skyMid}</div>
          </div>

          <div class="cb-card-tight">
            <div class="cb-card-tight-label">Bottom</div>
            <div class="cb-card-tight-control">
              ${colorTrigger('skyBot', s.skyBot)}
            </div>
            <div class="cb-card-tight-value" id="sky-bot-val">${s.skyBot}</div>
          </div>

          ${subtitle('Sun / Moon')}

          <div class="cb-card-tight">
            <input type="checkbox" id="fx-sun-visible" ${s.sunVisible ? 'checked' : ''}>
            ${colorTrigger('sunColor', s.sunColor)}
            <div class="cb-card-tight-label" style="min-width:48px;">Sun</div>
            <div class="cb-card-tight-control" style="flex:1;">
              <input type="range" id="fx-sun-elev" min="0" max="90" step="1"
                     value="${s.sunElevation}" class="cb-range">
            </div>
            <div class="cb-card-tight-value" id="fx-sun-elev-val">${s.sunElevation}°</div>
          </div>
        `;
    }

    // ── Stage tab ────────────────────────────────────────────────
    _renderStageTab() {
        const cast = this._state.cast || [];
        const subtitle = renderSubtitle;

        // ── Facing options for the dropdown
        const facingOpts = [
            { value: 'camera', label: 'Camera' },
            ...ALL_CELLS.map(c => ({ value: c, label: c })),
        ];

        // ── Cast Placement cards (always 5 slots)
        const castCards = Array.from({ length: CAST_SLOT_COUNT }, (_, i) => {
            const slot  = cast[i] || {};
            const color = CAST_COLORS[i];
            const empty = !slot.cell;
            const facing = slot.facing || 'camera';

            if (empty) {
                return `
                <div class="cb-cast-card" data-slot="${i}">
                    <span class="cb-cast-chip" style="background:${color};"></span>
                    <span class="cb-cast-label" style="color:var(--text-dim);">Slot ${i + 1} — empty</span>
                    <button type="button" class="cb-cast-add" data-slot="${i}"
                            style="margin-left:auto; background:none; border:1px solid var(--text-dim);
                            color:var(--text-dim); border-radius:4px; padding:2px 8px; cursor:pointer;
                            font-size:0.75rem; font-family:inherit;">+ Add</button>
                </div>`;
            }

            const facingSelect = `<select class="cb-cast-facing" data-slot="${i}"
                style="font-size:0.75rem; padding:1px 2px; background:rgba(255,255,255,0.08);
                border:1px solid rgba(255,255,255,0.15); border-radius:4px; color:var(--text-primary);
                font-family:inherit; max-width:80px;">
                ${facingOpts.map(o =>
                    `<option value="${o.value}"${facing === o.value ? ' selected' : ''}>${o.label}</option>`
                ).join('')}
            </select>`;

            // Column letter + row number selectors
            const curLetter = slot.cell ? slot.cell[0].toUpperCase() : 'N';
            const curNum    = slot.cell ? slot.cell.slice(1) : '3';

            const letterSelect = `<select class="cb-cast-letter" data-slot="${i}"
                style="font-size:0.75rem; padding:1px 2px; background:rgba(255,255,255,0.08);
                border:1px solid rgba(255,255,255,0.15); border-radius:4px; color:var(--text-primary);
                font-family:inherit; width:38px;">
                ${'BINGO'.split('').map(l =>
                    `<option value="${l}"${curLetter === l ? ' selected' : ''}>${l}</option>`
                ).join('')}
            </select>`;

            const numSelect = `<select class="cb-cast-num" data-slot="${i}"
                style="font-size:0.75rem; padding:1px 2px; background:rgba(255,255,255,0.08);
                border:1px solid rgba(255,255,255,0.15); border-radius:4px; color:var(--text-primary);
                font-family:inherit; width:38px;">
                ${[1,2,3,4,5].map(n =>
                    `<option value="${n}"${curNum === String(n) ? ' selected' : ''}>${n}</option>`
                ).join('')}
            </select>`;

            return `
                <div class="cb-cast-card" data-slot="${i}">
                    <span class="cb-cast-chip" style="background:${color};"></span>
                    <span class="cb-cast-pos">${letterSelect}${numSelect}</span>
                    <span class="cb-cast-facing-wrap">→ ${facingSelect}</span>
                    <button type="button" class="cb-cast-remove" data-slot="${i}"
                            style="margin-left:auto; background:none; border:none; color:var(--text-dim);
                            cursor:pointer; font-size:1rem;" aria-label="Remove">&times;</button>
                </div>`;
        }).join('');

        // ── Stage Items (set dressing) — 5 slots ──────────────────
        const stageItemsHtml = this._renderSetDressingSlots();

        return `
          ${subtitle('Cast Placement', 'cast')}
          ${castCards}

          ${subtitle('Stage Items', 'setDressing')}
          ${stageItemsHtml}
        `;
    }

    /** Render 5 set-dressing slot cards for the Stage tab. */
    _renderSetDressingSlots() {
        const slots = this._state.stageItems;
        const objs  = this._objectList || [];
        const modeLabels    = { place: 'Place', scatter: 'Scatter', tile: 'Tile' };
        const densityLabels = { low: 'Low', med: 'Med', high: 'High' };

        return slots.map((slot, i) => {
            const optionsHtml = `<option value="none"${slot.assetId === 'none' ? ' selected' : ''}>None</option>` +
                objs.map(o =>
                    `<option value="${o.id}"${slot.assetId === o.id ? ' selected' : ''}>${_esc(o.name)}</option>`
                ).join('');

            const hasObj = slot.assetId && slot.assetId !== 'none';
            const scaleVal = slot.scale ?? 1.0;
            const scaleLabel = scaleVal.toFixed(1) + '×';

            let controlsHtml = '';
            if (hasObj) {
                // Mode toggle (Place / Scatter / Tile)
                const modeRow = `
                    <div class="cb-gobj-row">
                      <div class="cb-segmented cb-sdress-mode" data-slot="${i}">
                        ${Object.entries(modeLabels).map(([k, v]) =>
                            `<button type="button" data-mode="${k}" class="${slot.mode === k ? 'active' : ''}">${v}</button>`
                        ).join('')}
                      </div>
                    </div>`;

                // Cell selector — only visible in Place mode
                const cellRow = slot.mode === 'place' ? `
                    <div class="cb-gobj-row">
                      <span style="font-size:0.75rem; color:var(--text-dim); min-width:30px;">Cell</span>
                      <select class="cb-sdress-letter" data-slot="${i}"
                          style="font-size:0.75rem; padding:1px 2px; background:rgba(255,255,255,0.08);
                          border:1px solid rgba(255,255,255,0.15); border-radius:4px; color:var(--text-primary);
                          font-family:inherit; width:38px;">
                          ${'BINGO'.split('').map(l =>
                              `<option value="${l}"${(slot.cell?.[0]?.toUpperCase() || 'N') === l ? ' selected' : ''}>${l}</option>`
                          ).join('')}
                      </select>
                      <select class="cb-sdress-num" data-slot="${i}"
                          style="font-size:0.75rem; padding:1px 2px; background:rgba(255,255,255,0.08);
                          border:1px solid rgba(255,255,255,0.15); border-radius:4px; color:var(--text-primary);
                          font-family:inherit; width:38px;">
                          ${[1,2,3,4,5].map(n =>
                              `<option value="${n}"${(slot.cell?.slice(1) || '3') === String(n) ? ' selected' : ''}>${n}</option>`
                          ).join('')}
                      </select>
                    </div>` : '';

                // Density — only visible in Scatter / Tile modes
                const densityRow = slot.mode !== 'place' ? `
                    <div class="cb-gobj-row">
                      <div class="cb-segmented cb-sdress-density" data-slot="${i}">
                        ${Object.entries(densityLabels).map(([k, v]) =>
                            `<button type="button" data-density="${k}" class="${slot.density === k ? 'active' : ''}">${v}</button>`
                        ).join('')}
                      </div>
                    </div>` : '';

                // Scale slider (always visible)
                const scaleRow = `
                    <div class="cb-gobj-row">
                      <span class="cb-gobj-scale-label">Scale ${scaleLabel}</span>
                      <input type="range" class="cb-sdress-scale" data-slot="${i}"
                             min="0.2" max="2.0" step="0.1" value="${scaleVal}">
                    </div>`;

                controlsHtml = modeRow + cellRow + densityRow + scaleRow;
            }

            return `
              <div class="cb-gobj-card" data-slot="${i}">
                <div class="cb-gobj-card-header">
                  <span class="cb-gobj-card-num">${i + 1}</span>
                  <select class="cb-sdress-select" data-slot="${i}">${optionsHtml}</select>
                </div>
                ${controlsHtml}
              </div>`;
        }).join('');
    }

    // ── FX tab ──────────────────────────────────────────────────
    _renderFXTab() {
        const s = this._state;
        const subtitle = renderSubtitle;

        const colorTrigger = (field, hex) => `
            <button type="button" class="cb-color-trigger" data-color-field="${field}"
                    style="background:${hex};" aria-label="Choose color"></button>`;

        const weatherLabel = { none: 'None', snow: 'Snow', rain: 'Rain', leaves: 'Leaves' };

        return `
          ${subtitle('Weather')}

          <div class="cb-card-tight">
            <div class="cb-card-tight-label">Effect</div>
            <div class="cb-card-tight-control">
              <select id="fx-weather-select">
                ${WEATHER_TYPES.map(w =>
                    `<option value="${w}"${s.weather === w ? ' selected' : ''}>${weatherLabel[w]}</option>`
                ).join('')}
              </select>
            </div>
          </div>

          ${subtitle('Lighting')}

          <div class="cb-card-tight">
            ${colorTrigger('ambientColor', s.ambientColor)}
            <div class="cb-card-tight-label" style="min-width:68px;">Ambient</div>
            <div class="cb-card-tight-control" style="flex:1;">
              <input type="range" id="fx-ambient-int" min="0" max="2.0" step="0.05"
                     value="${s.ambientIntensity}" class="cb-range">
            </div>
            <div class="cb-card-tight-value" id="fx-ambient-int-val">${s.ambientIntensity.toFixed(2)}</div>
          </div>

          <div class="cb-card-tight">
            ${colorTrigger('dirColor', s.dirColor)}
            <div class="cb-card-tight-label" style="min-width:68px;">Key&nbsp;Light</div>
            <div class="cb-card-tight-control" style="flex:1;">
              <input type="range" id="fx-dir-int" min="0" max="2.0" step="0.05"
                     value="${s.dirIntensity}" class="cb-range">
            </div>
            <div class="cb-card-tight-value" id="fx-dir-int-val">${s.dirIntensity.toFixed(2)}</div>
          </div>

          ${subtitle('Orb Light', 'orb')}

          <div class="cb-card-tight">
            <input type="checkbox" id="fx-orb-visible" ${s.orbVisible ? 'checked' : ''}>
            ${colorTrigger('orbColor', s.orbColor)}
            <div class="cb-card-tight-label" style="min-width:68px;">Intensity</div>
            <div class="cb-card-tight-control" style="flex:1;">
              <input type="range" id="fx-orb-int" min="0" max="3.0" step="0.05"
                     value="${s.orbIntensity}" class="cb-range">
            </div>
            <div class="cb-card-tight-value" id="fx-orb-int-val">${s.orbIntensity.toFixed(2)}</div>
          </div>

          <div class="cb-card-tight">
            <div class="cb-card-tight-label" style="min-width:68px; margin-left:26px;">Height</div>
            <div class="cb-card-tight-control" style="flex:1;">
              <input type="range" id="fx-orb-height" min="${ORB_HEIGHT_MIN}" max="${ORB_HEIGHT_MAX}" step="0.05"
                     value="${s.orbHeight}" class="cb-range">
            </div>
            <div class="cb-card-tight-value" id="fx-orb-height-val">${s.orbHeight.toFixed(2)}m</div>
          </div>

          <div class="cb-card-tight">
            <input type="checkbox" id="fx-orb-flicker" ${s.orbFlicker ? 'checked' : ''}>
            <div class="cb-card-tight-label">Flicker</div>
          </div>

          ${subtitle('Fog')}

          <div class="cb-card-tight">
            <input type="checkbox" id="fx-fog-enabled" ${s.fogEnabled ? 'checked' : ''}>
            ${colorTrigger('fogColor', s.fogColor)}
            <div class="cb-card-tight-label" style="min-width:48px;">Fog</div>
            <div class="cb-card-tight-control" style="flex:1;">
              <input type="range" id="fx-fog-density" min="0.005" max="0.15" step="0.005"
                     value="${s.fogDensity}" class="cb-range">
            </div>
            <div class="cb-card-tight-value" id="fx-fog-density-val">${s.fogDensity.toFixed(3)}</div>
          </div>
        `;
    }

    // ── Stub tab ────────────────────────────────────────────────
    _renderStubTab(label) {
        return `
          <div class="cb-section">
            <p style="color: var(--text-dim); text-align: center; padding: 20px 0;">
                ${_esc(label)} controls coming soon.
            </p>
          </div>`;
    }

    // ═══════════════════════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════════════════════

    _wirePanelEvents() {
        const panel = this.panelEl;

        // Tab switching
        panel.querySelectorAll('.cb-tab-trigger').forEach(btn => {
            btn.addEventListener('click', () => {
                this._activeTab = btn.dataset.tab;
                this._renderPanel();
            });
        });

        // ── File tab (shared wiring) ───────────────────────────
        wireFileTabEvents(panel, this, { formatType: 'environment_state' });

        // ── Ground tab ─────────────────────────────────────────
        const sizeInput = panel.querySelector('#ground-size');
        const sizeLabel = panel.querySelector('#ground-size-val');
        sizeInput?.addEventListener('input', (e) => {
            const n = parseInt(e.target.value, 10);
            this._applyGroundSize(n);
            if (sizeLabel) sizeLabel.textContent = `${this._state.groundSize}×${this._state.groundSize}`;
            this._scheduleAutoSave();
        });

        // Color triggers — open the shared color picker modal.
        // Data-driven: maps data-color-field → apply function + value display id.
        const COLOR_FIELDS = {
            groundColor: { title: 'Ground Color', valId: '#ground-color-val',
                           apply: (h) => this._applyGroundColor(h) },
            stageColor:  { title: 'Stage Color',  valId: '#stage-color-val',
                           apply: (h) => this._applyStageColor(h) },
            wallColor:   { title: 'Wall Color',   valId: '#wall-color-val',
                           apply: (h) => this._applyWallColor(h) },
            skyTop:      { title: 'Sky — Top',     valId: '#sky-top-val',
                           apply: (h) => this._applySkyColor('skyTop', h) },
            skyMid:      { title: 'Sky — Middle',  valId: '#sky-mid-val',
                           apply: (h) => this._applySkyColor('skyMid', h) },
            skyBot:      { title: 'Sky — Bottom',  valId: '#sky-bot-val',
                           apply: (h) => this._applySkyColor('skyBot', h) },
            windowColor: { title: 'Window Pane',   valId: '#window-color-val',
                           apply: (h) => this._applyWindowColor(h) },
            sunColor:    { title: 'Sun / Moon',        valId: null,
                           apply: (h) => this._applySunColor(h) },
            ambientColor:{ title: 'Ambient Light',     valId: null,
                           apply: (h) => this._applyAmbientColor(h) },
            dirColor:    { title: 'Key Light',         valId: null,
                           apply: (h) => this._applyDirColor(h) },
            fogColor:    { title: 'Fog Color',         valId: null,
                           apply: (h) => this._applyFogColor(h) },
            orbColor:    { title: 'Orb Light',         valId: null,
                           apply: (h) => this._applyOrbColor(h) },
        };
        panel.querySelectorAll('.cb-color-trigger').forEach(trigger => {
            trigger.addEventListener('click', () => {
                const field = trigger.dataset.colorField;
                const cfg   = COLOR_FIELDS[field];
                if (!cfg) return;
                showColorPicker({
                    currentHex: this._state[field] || '',
                    title: cfg.title,
                    onPick: (hex) => {
                        cfg.apply(hex);
                        trigger.style.background = hex;
                        const valEl = cfg.valId ? panel.querySelector(cfg.valId) : null;
                        if (valEl) valEl.textContent = hex;
                        this._scheduleAutoSave();
                    },
                });
            });
        });

        // Walls height slider
        const wallSlider = panel.querySelector('#wall-height-slider');
        if (wallSlider) {
            wallSlider.addEventListener('input', () => {
                const h = parseInt(wallSlider.value, 10);
                this._applyWalls(h);
                const valEl = panel.querySelector('#wall-height-val');
                if (valEl) valEl.textContent = h === 0 ? 'Off' : `${h} block${h > 1 ? 's' : ''}`;
            });
            wallSlider.addEventListener('change', () => {
                this._scheduleAutoSave();
            });
        }

        // Window style dropdown
        const winSelect = panel.querySelector('#window-style-select');
        if (winSelect) {
            winSelect.addEventListener('change', () => {
                this._applyWindowStyle(winSelect.value);
                this._renderPanel();          // show/hide pane colour picker
                this._scheduleAutoSave();
            });
        }

        // Window pane opacity slider (live update without rebuild)
        const winOp = panel.querySelector('#window-opacity');
        if (winOp) {
            const lbl = panel.querySelector('#window-opacity-val');
            winOp.addEventListener('input', () => {
                this._applyWindowOpacity(winOp.value);
                if (lbl) lbl.textContent = Math.round(this._state.windowOpacity * 100) + '%';
            });
            winOp.addEventListener('change', () => this._scheduleAutoSave());
        }

        // Texture dropdowns (stub for now — saves choice to state)
        panel.querySelectorAll('.cb-tex-select').forEach(sel => {
            sel.addEventListener('change', (e) => {
                const field = sel.dataset.texField;
                this._applyTexture(field, e.target.value);
                this._scheduleAutoSave();
            });
        });

        // ── Ground objects (slot select + mode/density toggles) ─
        panel.querySelectorAll('.cb-gobj-select').forEach(sel => {
            sel.addEventListener('change', () => {
                const i = parseInt(sel.dataset.slot, 10);
                this._state.groundObjects[i].assetId = sel.value;
                this._rebuildGroundObjects();
                this._renderPanel();
                this._scheduleAutoSave();
            });
        });
        panel.querySelectorAll('.cb-gobj-mode button').forEach(btn => {
            btn.addEventListener('click', () => {
                const i = parseInt(btn.closest('.cb-gobj-mode').dataset.slot, 10);
                this._state.groundObjects[i].mode = btn.dataset.mode;
                this._rebuildGroundObjects();
                this._renderPanel();
                this._scheduleAutoSave();
            });
        });
        panel.querySelectorAll('.cb-gobj-density button').forEach(btn => {
            btn.addEventListener('click', () => {
                const i = parseInt(btn.closest('.cb-gobj-density').dataset.slot, 10);
                this._state.groundObjects[i].density = btn.dataset.density;
                this._rebuildGroundObjects();
                this._renderPanel();
                this._scheduleAutoSave();
            });
        });
        panel.querySelectorAll('.cb-gobj-scale').forEach(slider => {
            slider.addEventListener('input', () => {
                const i = parseInt(slider.dataset.slot, 10);
                const val = parseFloat(slider.value);
                this._state.groundObjects[i].scale = val;
                // Update the label live without a full re-render
                const label = slider.closest('.cb-gobj-row')?.querySelector('.cb-gobj-scale-label');
                if (label) label.textContent = `Scale ${val.toFixed(1)}×`;
            });
            slider.addEventListener('change', () => {
                this._rebuildGroundObjects();
                this._scheduleAutoSave();
            });
        });

        // ── Cast Placement controls ─────────────────────────────
        // Position: letter (row) dropdown
        panel.querySelectorAll('.cb-cast-letter').forEach(sel => {
            sel.addEventListener('change', () => {
                const i = parseInt(sel.dataset.slot, 10);
                const slot = this._state.cast[i];
                if (!slot || !slot.cell) return;
                const num = slot.cell.slice(1);
                slot.cell = sel.value + num;
                this._buildStageItems();
                this._renderPanel();
                this._scheduleAutoSave();
            });
        });
        // Position: number (column) dropdown
        panel.querySelectorAll('.cb-cast-num').forEach(sel => {
            sel.addEventListener('change', () => {
                const i = parseInt(sel.dataset.slot, 10);
                const slot = this._state.cast[i];
                if (!slot || !slot.cell) return;
                const letter = slot.cell[0].toUpperCase();
                slot.cell = letter + sel.value;
                this._buildStageItems();
                this._renderPanel();
                this._scheduleAutoSave();
            });
        });
        // Facing dropdown
        panel.querySelectorAll('.cb-cast-facing').forEach(sel => {
            sel.addEventListener('change', () => {
                const i = parseInt(sel.dataset.slot, 10);
                const slot = this._state.cast[i];
                if (!slot) return;
                slot.facing = sel.value;
                this._buildStageItems();
                this._scheduleAutoSave();
            });
        });
        // Remove button (empties the slot, keeps it visible)
        panel.querySelectorAll('.cb-cast-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                const i = parseInt(btn.dataset.slot, 10);
                this._state.cast[i] = { cell: null, facing: 'camera' };
                this._buildStageItems();
                this._renderPanel();
                this._scheduleAutoSave();
            });
        });
        // Add button (fills an empty slot with centre cell)
        panel.querySelectorAll('.cb-cast-add').forEach(btn => {
            btn.addEventListener('click', () => {
                const i = parseInt(btn.dataset.slot, 10);
                // Find a cell not already taken
                const used = new Set(this._state.cast.filter(s => s?.cell).map(s => s.cell));
                let cell = 'N3';
                if (used.has(cell)) {
                    cell = ALL_CELLS.find(c => !used.has(c)) || 'N3';
                }
                this._state.cast[i] = { cell, facing: 'camera' };
                this._buildStageItems();
                this._renderPanel();
                this._scheduleAutoSave();
            });
        });

        // ── Set Dressing controls ────────────────────────────────
        panel.querySelectorAll('.cb-sdress-select').forEach(sel => {
            sel.addEventListener('change', () => {
                const i = parseInt(sel.dataset.slot, 10);
                this._state.stageItems[i].assetId = sel.value;
                // Default to 'place' + centre cell when first picking an object
                if (sel.value !== 'none' && !this._state.stageItems[i].cell) {
                    this._state.stageItems[i].cell = 'N3';
                }
                this._rebuildSetDressing();
                this._renderPanel();
                this._scheduleAutoSave();
            });
        });
        panel.querySelectorAll('.cb-sdress-mode button').forEach(btn => {
            btn.addEventListener('click', () => {
                const i = parseInt(btn.closest('.cb-sdress-mode').dataset.slot, 10);
                this._state.stageItems[i].mode = btn.dataset.mode;
                // Ensure cell is set for Place mode
                if (btn.dataset.mode === 'place' && !this._state.stageItems[i].cell) {
                    this._state.stageItems[i].cell = 'N3';
                }
                this._rebuildSetDressing();
                this._renderPanel();
                this._scheduleAutoSave();
            });
        });
        panel.querySelectorAll('.cb-sdress-density button').forEach(btn => {
            btn.addEventListener('click', () => {
                const i = parseInt(btn.closest('.cb-sdress-density').dataset.slot, 10);
                this._state.stageItems[i].density = btn.dataset.density;
                this._rebuildSetDressing();
                this._renderPanel();
                this._scheduleAutoSave();
            });
        });
        panel.querySelectorAll('.cb-sdress-letter').forEach(sel => {
            sel.addEventListener('change', () => {
                const i = parseInt(sel.dataset.slot, 10);
                const num = this._state.stageItems[i].cell?.slice(1) || '3';
                this._state.stageItems[i].cell = sel.value + num;
                this._rebuildSetDressing();
                this._renderPanel();
                this._scheduleAutoSave();
            });
        });
        panel.querySelectorAll('.cb-sdress-num').forEach(sel => {
            sel.addEventListener('change', () => {
                const i = parseInt(sel.dataset.slot, 10);
                const letter = this._state.stageItems[i].cell?.[0]?.toUpperCase() || 'N';
                this._state.stageItems[i].cell = letter + sel.value;
                this._rebuildSetDressing();
                this._renderPanel();
                this._scheduleAutoSave();
            });
        });
        panel.querySelectorAll('.cb-sdress-scale').forEach(slider => {
            slider.addEventListener('input', () => {
                const i = parseInt(slider.dataset.slot, 10);
                const val = parseFloat(slider.value);
                this._state.stageItems[i].scale = val;
                const label = slider.closest('.cb-gobj-row')?.querySelector('.cb-gobj-scale-label');
                if (label) label.textContent = `Scale ${val.toFixed(1)}×`;
            });
            slider.addEventListener('change', () => {
                this._rebuildSetDressing();
                this._scheduleAutoSave();
            });
        });

        // ── FX tab ──────────────────────────────────────────────
        // Preset buttons
        panel.querySelectorAll('.cb-fx-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                this._applyFXPreset(btn.dataset.preset);
                this._renderPanel();
                this._scheduleAutoSave();
            });
        });

        // Sun elevation slider
        const sunElev = panel.querySelector('#fx-sun-elev');
        if (sunElev) {
            sunElev.addEventListener('input', () => {
                const v = parseInt(sunElev.value, 10);
                this._state.sunElevation = v;
                this._applySunPosition();
                const lbl = panel.querySelector('#fx-sun-elev-val');
                if (lbl) lbl.textContent = `${v}°`;
            });
            sunElev.addEventListener('change', () => this._scheduleAutoSave());
        }

        // Sun visible checkbox
        const sunVis = panel.querySelector('#fx-sun-visible');
        if (sunVis) {
            sunVis.addEventListener('change', () => {
                this._state.sunVisible = sunVis.checked;
                if (this._sunOrb) this._sunOrb.visible = sunVis.checked;
                this._scheduleAutoSave();
            });
        }

        // Weather select
        const weatherSel = panel.querySelector('#fx-weather-select');
        if (weatherSel) {
            weatherSel.addEventListener('change', () => {
                this._state.weather = weatherSel.value;
                this._buildWeather();
                this._scheduleAutoSave();
            });
        }

        // Ambient intensity slider
        const ambInt = panel.querySelector('#fx-ambient-int');
        if (ambInt) {
            ambInt.addEventListener('input', () => {
                const v = parseFloat(ambInt.value);
                this._state.ambientIntensity = v;
                if (this._ambientLight) this._ambientLight.intensity = v;
                const lbl = panel.querySelector('#fx-ambient-int-val');
                if (lbl) lbl.textContent = v.toFixed(2);
            });
            ambInt.addEventListener('change', () => this._scheduleAutoSave());
        }

        // Directional intensity slider
        const dirInt = panel.querySelector('#fx-dir-int');
        if (dirInt) {
            dirInt.addEventListener('input', () => {
                const v = parseFloat(dirInt.value);
                this._state.dirIntensity = v;
                if (this._dirLight) this._dirLight.intensity = v;
                const lbl = panel.querySelector('#fx-dir-int-val');
                if (lbl) lbl.textContent = v.toFixed(2);
            });
            dirInt.addEventListener('change', () => this._scheduleAutoSave());
        }

        // Fog enabled checkbox
        const fogEn = panel.querySelector('#fx-fog-enabled');
        if (fogEn) {
            fogEn.addEventListener('change', () => {
                this._state.fogEnabled = fogEn.checked;
                this._applyFog();
                this._scheduleAutoSave();
            });
        }

        // Fog density slider
        const fogDens = panel.querySelector('#fx-fog-density');
        if (fogDens) {
            fogDens.addEventListener('input', () => {
                const v = parseFloat(fogDens.value);
                this._state.fogDensity = v;
                this._applyFog();
                const lbl = panel.querySelector('#fx-fog-density-val');
                if (lbl) lbl.textContent = v.toFixed(3);
            });
            fogDens.addEventListener('change', () => this._scheduleAutoSave());
        }

        // Orb visible checkbox
        const orbVis = panel.querySelector('#fx-orb-visible');
        if (orbVis) {
            orbVis.addEventListener('change', () => {
                this._state.orbVisible = orbVis.checked;
                this._applyOrbLight();
                this._scheduleAutoSave();
            });
        }

        // Orb intensity slider
        const orbInt = panel.querySelector('#fx-orb-int');
        if (orbInt) {
            orbInt.addEventListener('input', () => {
                const v = parseFloat(orbInt.value);
                this._state.orbIntensity = v;
                this._applyOrbLight();
                const lbl = panel.querySelector('#fx-orb-int-val');
                if (lbl) lbl.textContent = v.toFixed(2);
            });
            orbInt.addEventListener('change', () => this._scheduleAutoSave());
        }

        // Orb height slider
        const orbH = panel.querySelector('#fx-orb-height');
        if (orbH) {
            orbH.addEventListener('input', () => {
                const v = parseFloat(orbH.value);
                this._state.orbHeight = v;
                this._applyOrbLight();
                const lbl = panel.querySelector('#fx-orb-height-val');
                if (lbl) lbl.textContent = `${v.toFixed(2)}m`;
            });
            orbH.addEventListener('change', () => this._scheduleAutoSave());
        }

        // Orb flicker checkbox
        const orbFl = panel.querySelector('#fx-orb-flicker');
        if (orbFl) {
            orbFl.addEventListener('change', () => {
                this._state.orbFlicker = orbFl.checked;
                this._applyOrbLight();
                this._scheduleAutoSave();
            });
        }

        // ── Surprise buttons (env-specific subtitles) ──────────
        // File-tab dice (name/description/tags) are wired by
        // wireFileTabEvents above; these handle Ground tab subtitles.
        const FILE_KEYS = new Set(['name', 'description', 'tags']);
        panel.querySelectorAll('.cb-field-surprise').forEach(btn => {
            if (FILE_KEYS.has(btn.dataset.surprise)) return;
            btn.addEventListener('click', () => {
                this._onSurpriseField(btn.dataset.surprise);
            });
        });
    }

    _onSurpriseField(key) {
        const pal = this._palette || [];
        const tex = this._textureOpts || [];
        const randHex = () => pal.length ? pal[Math.floor(Math.random() * pal.length)].hex : null;
        const randTex = () => {
            // Roughly 50/50 None vs an actual texture
            if (!tex.length || Math.random() < 0.5) return 'none';
            return tex[Math.floor(Math.random() * tex.length)].id;
        };
        const randSize = () => {
            const span = (GROUND_SIZE_MAX - GROUND_SIZE_MIN) / 2 + 1;
            return GROUND_SIZE_MIN + 2 * Math.floor(Math.random() * span);
        };

        // Per-subtitle (whole-section) randomizers
        if (key === 'groundPlane') {
            this._applyGroundSize(randSize());
            const c = randHex(); if (c) this._applyGroundColor(c);
            this._applyTexture('groundTexture', randTex());
            this._renderPanel();
            this._scheduleAutoSave();
            return;
        }
        if (key === 'stage') {
            const c = randHex(); if (c) this._applyStageColor(c);
            this._applyTexture('stageTexture', randTex());
            this._renderPanel();
            this._scheduleAutoSave();
            return;
        }
        if (key === 'walls') {
            this._applyWalls(Math.floor(Math.random() * (WALL_HEIGHT_MAX + 1)));
            const c = randHex(); if (c) this._applyWallColor(c);
            this._applyTexture('wallTexture', randTex());
            // Randomise window style + pane colour
            const winStyles = ['none', 'none', 'single', 'double', 'triple']; // bias toward none
            this._applyWindowStyle(winStyles[Math.floor(Math.random() * winStyles.length)]);
            const wc = randHex(); if (wc) this._applyWindowColor(wc);
            this._renderPanel();
            this._scheduleAutoSave();
            return;
        }
        if (key === 'sky') {
            // Pick a preset (biased bright) then tint the sky gradient
            const weighted = ['flat','flat','day','day','day','dusk','night'];
            const pk = weighted[Math.floor(Math.random() * weighted.length)];
            this._applyFXPreset(pk);
            // Tint each sky stop toward a random palette colour (30% blend
            // keeps the preset's feel while adding variety)
            for (const f of ['skyTop', 'skyMid', 'skyBot']) {
                const c = randHex();
                if (c) {
                    const base = new THREE.Color(this._state[f]);
                    const tint = new THREE.Color(c);
                    base.lerp(tint, 0.3);
                    this._applySkyColor(f, '#' + base.getHexString());
                }
            }
            // Jitter sun elevation ±15°
            const elev = Math.max(0, Math.min(90,
                this._state.sunElevation + Math.round((Math.random() - 0.5) * 30)));
            this._state.sunElevation = elev;
            this._applySunPosition();
            this._renderPanel();
            this._scheduleAutoSave();
            return;
        }
        if (key === 'groundObjects') {
            const objs = this._objectList || [];
            if (!objs.length) return;
            const modes = ['scatter', 'tile'];
            const dens  = ['low', 'med', 'high'];
            this._state.groundObjects = this._state.groundObjects.map(() => ({
                assetId:  objs[Math.floor(Math.random() * objs.length)].id,
                mode:     modes[Math.floor(Math.random() * modes.length)],
                density:  dens[Math.floor(Math.random() * dens.length)],
                scale:    +(0.3 + Math.random() * 1.4).toFixed(1),  // 0.3–1.7
            }));
            this._rebuildGroundObjects();
            this._renderPanel();
            this._scheduleAutoSave();
            return;
        }
        if (key === 'cast') {
            // Randomise 1–5 cast slots on random cells, rest empty
            const count = 1 + Math.floor(Math.random() * CAST_SLOT_COUNT);
            const usedCells = new Set();
            const facingOpts = ['camera', ...ALL_CELLS];
            const cast = Array.from({ length: CAST_SLOT_COUNT }, (_, i) => {
                if (i >= count) return { cell: null, facing: 'camera' };
                let cell;
                do { cell = ALL_CELLS[Math.floor(Math.random() * 25)]; }
                while (usedCells.has(cell));
                usedCells.add(cell);
                const facing = facingOpts[Math.floor(Math.random() * facingOpts.length)];
                return { cell, facing };
            });
            this._state.cast = cast;
            this._buildStageItems();
            this._renderPanel();
            this._scheduleAutoSave();
            return;
        }

        if (key === 'setDressing') {
            const objs = this._objectList || [];
            if (!objs.length) return;
            const modes = ['place', 'scatter', 'tile'];
            const dens  = ['low', 'med', 'high'];
            // Fill 2–4 random slots, leave the rest empty
            const count = 2 + Math.floor(Math.random() * 3);
            this._state.stageItems = Array.from({ length: SET_DRESSING_SLOTS }, (_, i) => {
                if (i >= count) return { assetId: 'none', mode: 'place', cell: null, scale: 1.0, density: 'med' };
                const mode = modes[Math.floor(Math.random() * modes.length)];
                const cell = mode === 'place' ? ALL_CELLS[Math.floor(Math.random() * 25)] : null;
                return {
                    assetId: objs[Math.floor(Math.random() * objs.length)].id,
                    mode,
                    cell,
                    scale: +(0.3 + Math.random() * 1.0).toFixed(1),  // 0.3–1.3
                    density: dens[Math.floor(Math.random() * dens.length)],
                };
            });
            this._rebuildSetDressing();
            this._renderPanel();
            this._scheduleAutoSave();
            return;
        }

        if (key === 'fx') {
            // Jitter ambient + directional intensities around current values,
            // with a brightness floor so scenes never go too dark.
            const jitter = (base, min, max) =>
                +Math.max(min, Math.min(max, base + (Math.random() - 0.4) * 0.5)).toFixed(2);
            this._state.ambientIntensity = jitter(this._state.ambientIntensity, 0.5, 1.8);
            if (this._ambientLight) this._ambientLight.intensity = this._state.ambientIntensity;
            this._state.dirIntensity = jitter(this._state.dirIntensity, 0.3, 1.6);
            if (this._dirLight) this._dirLight.intensity = this._state.dirIntensity;
            // Random tint for ambient from palette
            const ac = randHex();
            if (ac) this._applyAmbientColor(ac);
            // 40% chance toggle fog, light density
            if (Math.random() < 0.4) {
                this._state.fogEnabled = !this._state.fogEnabled;
            }
            if (this._state.fogEnabled) {
                this._state.fogDensity = +(0.01 + Math.random() * 0.04).toFixed(3);
            }
            this._applyFog();
            // Random weather (biased toward none — 50% none, 50% some effect)
            const weatherOpts = ['none', 'none', 'none', 'snow', 'rain', 'leaves'];
            this._state.weather = weatherOpts[Math.floor(Math.random() * weatherOpts.length)];
            this._buildWeather();
            // Orb light — 35% chance visible; if on, jitter intensity/height/flicker/warm color
            this._state.orbVisible = Math.random() < 0.35;
            if (this._state.orbVisible) {
                this._state.orbIntensity = +(0.6 + Math.random() * 1.9).toFixed(2);
                this._state.orbHeight = +(ORB_HEIGHT_MIN + Math.random() * (ORB_HEIGHT_MAX - ORB_HEIGHT_MIN)).toFixed(2);
                this._state.orbFlicker = Math.random() < 0.4;
                const warm = ['#ffddaa', '#ffc27a', '#ffb36b', '#ffe4b8', '#ffa36b', '#e0c8ff', '#aee1ff'];
                this._state.orbColor = warm[Math.floor(Math.random() * warm.length)];
            }
            this._applyOrbLight();
            this._renderPanel();
            this._scheduleAutoSave();
            return;
        }

        // File-tab per-field stubs (intelligence layer pending)
        console.debug(`[EnvironmentBridge] surprise requested for "${key}" (stub — intelligence pending)`);
    }

    /**
     * Global "Surprise me!" — randomise every section at once.
     * Called by the title-row Surprise button in builder mode.
     */
    surpriseAll() {
        // Hit every section-level randomiser in one go
        for (const key of ['groundPlane', 'stage', 'walls', 'sky', 'groundObjects', 'cast', 'setDressing', 'fx']) {
            this._onSurpriseField(key);
        }
        // _onSurpriseField already calls _renderPanel + _scheduleAutoSave
    }

    // ═══════════════════════════════════════════════════════════════
    //  VIEWPORT TICK + PLAYBACK
    // ═══════════════════════════════════════════════════════════════

    _onTick(delta) {
        if (!this._controls) return;

        if (this._autoSpin) {
            this._pingPongAngle += _PP_SPEED * delta * this._pingPongDir;
            if (this._pingPongAngle >=  _PP_RANGE) { this._pingPongAngle =  _PP_RANGE; this._pingPongDir = -1; }
            if (this._pingPongAngle <= -_PP_RANGE) { this._pingPongAngle = -_PP_RANGE; this._pingPongDir =  1; }
            const dist  = this._controls.getDistance();
            const polar = this._controls.getPolarAngle();
            this._controls.object.position.setFromSpherical(
                new THREE.Spherical(dist, polar, this._pingPongAngle)
            ).add(this._controls.target);
        }

        this._controls.update();

        // Dynamic culling — hide walls + tall ground objects facing the camera
        this._cullWallsByCamera();
        this._cullGroundObjectsByCamera();

        // Weather particles — only animate when playing
        if (this._isPlaying) {
            this._tickWeather(delta);
        }

        // Orb flicker — drive intensity with a mix of sinusoids so it
        // feels candle-like rather than random strobing. Only runs when
        // the orb is visible *and* flicker is on.
        if (this._orbLight && this._state.orbVisible && this._state.orbFlicker) {
            this._orbFlickerTime += delta;
            const t = this._orbFlickerTime;
            // Three low-freq sines combined — smooth, organic, no hard jumps.
            const n = 0.5 * Math.sin(t * 7.3)
                    + 0.3 * Math.sin(t * 13.1 + 1.7)
                    + 0.2 * Math.sin(t * 19.9 + 3.2);
            // Keep the dip gentle (0.6× – 1.0× base) so the orb never goes dark.
            const base = this._state.orbIntensity;
            this._orbLight.intensity = base * (0.8 + 0.2 * n);
        }
    }

    play() {
        this._pingPongAngle = 0;
        this._pingPongDir   = 1;
        this._autoSpin      = true;
        this._isPlaying     = true;
    }

    stop() {
        this._autoSpin  = false;
        this._isPlaying = false;
    }

    resetView() {
        this.stop();
        document.dispatchEvent(new CustomEvent('bridge-play-state', { detail: { playing: false } }));
        if (!this._controls) return;
        this._resetCancel?.();
        this._resetCancel = tweenToPose(
            this._camera, this._controls,
            new THREE.Vector3(5.2, 3.9, 5.2), new THREE.Vector3(0, 0, 0)
        );
    }
}
