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
const DEFAULT_WALL_HEIGHT  = 0;     // 0 = off, 1–8 = blocks
const DEFAULT_TEXTURE      = 'none';

// Sky gradient defaults (top-to-bottom, subtle dusk)
const DEFAULT_SKY_TOP = '#222034';   // DB32 deep navy
const DEFAULT_SKY_MID = '#394b5a';   // muted blue-grey
const DEFAULT_SKY_BOT = '#5a5a5a';   // horizon grey (matches old solid bg)

// Stage item cap
const MAX_STAGE_ITEMS = 5;

// Wall height range (blocks, 1 block = 1 meter)
const WALL_HEIGHT_MIN = 0;
const WALL_HEIGHT_MAX = 8;
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

// Scatter / tile density settings
const _SCATTER_COUNTS = { low: 6, med: 14, high: 28 };
const _TILE_SPACING   = { low: 3.5, med: 2.5, high: 1.8 };

// Default camera is at (5.2, 3.9, 5.2) looking at origin.
// Camera corridor: a wedge from origin outward in the +x/+z quadrant.
// Any ground point inside this wedge would obstruct the view.
const _CAM_DIR_X = 5.2, _CAM_DIR_Z = 5.2;                    // camera direction
const _CAM_CORRIDOR_COS = Math.cos(Math.PI / 6);              // ±30° half-angle
const _camDirLen = Math.sqrt(_CAM_DIR_X * _CAM_DIR_X + _CAM_DIR_Z * _CAM_DIR_Z);
const _camNormX  = _CAM_DIR_X / _camDirLen;
const _camNormZ  = _CAM_DIR_Z / _camDirLen;

/** True if (x,z) lies inside the camera corridor wedge (beyond the stage). */
function _inCameraCorridor(x, z, stageHalf) {
    const len = Math.sqrt(x * x + z * z);
    if (len < stageHalf + 0.5) return false;   // inside stage buffer — handled separately
    const dot = (x * _camNormX + z * _camNormZ) / (len || 1);
    return dot > _CAM_CORRIDOR_COS;             // within ±30° of camera direction
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

// ── BINGO grid for the 5×5 stage ────────────────────────────────
// Rows B-I-N-G-O (back to front, −z → +z).
// Columns 5-4-3-2-1 (left to right, −x → +x).
//   B5 = back-left (wall corner)   B1 = back-right
//   O5 = front-left                O1 = front-right (nearest camera)
//   N3 = dead centre
const BINGO_ROWS = 'BINGO';

/** Return a cell label like "N3" for a (col, row) pair.
 *  col 0 = leftmost (number 5), col 4 = rightmost (number 1).
 *  row 0 = back (B), row 4 = front (O). */
function _cellLabel(col, row) {
    return BINGO_ROWS[row] + (5 - col);
}

/** Parse a BINGO cell label → world-space {x, z} centre, or null.
 *  Letter = row (B back … O front), Number = column (5 left … 1 right). */
function _cellToWorld(cell) {
    if (!cell || cell.length < 2) return null;
    const rowIdx = BINGO_ROWS.indexOf(cell[0].toUpperCase());
    const num    = parseInt(cell.slice(1), 10);
    if (rowIdx < 0 || num < 1 || num > 5) return null;
    const colIdx = 5 - num;           // 5→0 (left), 1→4 (right)
    return { x: colIdx - 2, z: rowIdx - 2 };
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

        // Carry forward any previously-saved state
        const d = this.asset?.payload?.state || this.asset?.state || {};

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
            // Texture choices (stub for now — we just store the id;
            // applying real textures comes later)
            groundTexture:  d.groundTexture || DEFAULT_TEXTURE,
            stageTexture:   d.stageTexture  || DEFAULT_TEXTURE,
            wallTexture:    d.wallTexture   || DEFAULT_TEXTURE,
            // Sky gradient (3-stop vertical)
            skyTop:         d.skyTop || DEFAULT_SKY_TOP,
            skyMid:         d.skyMid || DEFAULT_SKY_MID,
            skyBot:         d.skyBot || DEFAULT_SKY_BOT,
            // Stage items — array of { type, square }
            stageItems:     d.stageItems || [
                { type: 'greybox', cell: 'B2' },
                { type: 'greybox', cell: 'N4' },
                { type: 'greybox', cell: 'N2' },
            ],
            // Ground objects — 3 scatter/tile slots
            groundObjects:  d.groundObjects || [
                { assetId: 'none', mode: 'scatter', density: 'med', scale: 1.0 },
                { assetId: 'none', mode: 'scatter', density: 'med', scale: 1.0 },
                { assetId: 'none', mode: 'scatter', density: 'med', scale: 1.0 },
            ],
            // Future: fx, lighting
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
        this._skyCanvas   = null;     // off-screen canvas for gradient
        this._skyTexture  = null;     // THREE.CanvasTexture on scene.background
        this._gridNumbers = [];       // sprites for square number labels
        this._stageItemMeshes = [];   // greybox character groups
        this._groundObjMeshes = [];   // scattered/tiled ground objects
        this._objectList  = null;     // loaded object catalog
        this._wallsEnabled = false;   // true when walls height > 0
        this._extraLights = [];

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

        // Sky gradient background (replaces old solid grey)
        this._buildSkyGradient();

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

        // Flat lighting
        const amb = new THREE.AmbientLight(0xffffff, 0.6);
        this._scene.add(amb);
        this._extraLights.push(amb);

        const dir = new THREE.DirectionalLight(0xffffff, 0.8);
        dir.position.set(5, 10, 5);
        this._scene.add(dir);
        this._extraLights.push(dir);

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
        const makeMat = () => new THREE.MeshStandardMaterial({
            color: new THREE.Color(this._state.wallColor), roughness: 0.85,
        });

        // Back wall (−z edge): runs along x
        const backGeo = new THREE.BoxGeometry(STAGE_SIZE + t, 1, t);
        this._wallBack = new THREE.Mesh(backGeo, makeMat());
        this._wallBack.position.set(0, 0.5, -half - t / 2);
        this._wallBack.castShadow = true;
        this._wallBack.receiveShadow = true;
        this._scene.add(this._wallBack);

        // Front wall (+z edge): runs along x
        const frontGeo = new THREE.BoxGeometry(STAGE_SIZE + t, 1, t);
        this._wallFront = new THREE.Mesh(frontGeo, makeMat());
        this._wallFront.position.set(0, 0.5, half + t / 2);
        this._wallFront.castShadow = true;
        this._wallFront.receiveShadow = true;
        this._scene.add(this._wallFront);

        // Left wall (−x edge): runs along z
        const leftGeo = new THREE.BoxGeometry(t, 1, STAGE_SIZE + t);
        this._wallLeft = new THREE.Mesh(leftGeo, makeMat());
        this._wallLeft.position.set(-half - t / 2, 0.5, 0);
        this._wallLeft.castShadow = true;
        this._wallLeft.receiveShadow = true;
        this._scene.add(this._wallLeft);

        // Right wall (+x edge): runs along z
        const rightGeo = new THREE.BoxGeometry(t, 1, STAGE_SIZE + t);
        this._wallRight = new THREE.Mesh(rightGeo, makeMat());
        this._wallRight.position.set(half + t / 2, 0.5, 0);
        this._wallRight.castShadow = true;
        this._wallRight.receiveShadow = true;
        this._scene.add(this._wallRight);

        // Apply current state — sets visibility + height
        this._applyWalls(this._state.walls, /*skipState*/ true);
    }

    /**
     * Build a 3-stop vertical gradient on an off-screen canvas and use it
     * as the Three.js scene background texture.  Updating a stop just
     * repaints the canvas and flips needsUpdate — no geometry re-creation.
     */
    _buildSkyGradient() {
        const canvas  = document.createElement('canvas');
        canvas.width  = 2;          // 1-pixel-wide gradient is enough
        canvas.height = 256;
        this._skyCanvas = canvas;
        this._updateSkyCanvas();

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        this._skyTexture = tex;
        this._scene.background = tex;
    }

    /** Repaint the sky canvas from the current state colours. */
    _updateSkyCanvas() {
        const canvas = this._skyCanvas;
        if (!canvas) return;
        const ctx  = canvas.getContext('2d');
        const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
        grad.addColorStop(0,   this._state.skyTop);
        grad.addColorStop(0.5, this._state.skyMid);
        grad.addColorStop(1,   this._state.skyBot);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (this._skyTexture) this._skyTexture.needsUpdate = true;
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

        // Column numbers: 5, 4, 3, 2, 1 across the back edge (−z side)
        for (let c = 0; c < 5; c++) {
            const num = 5 - c;               // 5 on the left, 1 on the right
            const sprite = makeSprite(String(num));
            sprite.position.set(c - 2, 0.06, -half - offset);
            this._scene.add(sprite);
            this._gridNumbers.push(sprite);
        }

        // Row letters: B, I, N, G, O down the left edge (−x side)
        for (let r = 0; r < 5; r++) {
            const sprite = makeSprite(BINGO_ROWS[r]);
            sprite.position.set(-half - offset, 0.06, r - 2);
            this._scene.add(sprite);
            this._gridNumbers.push(sprite);
        }
    }

    /**
     * Build the 3D meshes for every item in state.stageItems.
     * Currently only supports type 'greybox' (placeholder character).
     */
    _buildStageItems() {
        this._clearStageItems();
        for (const item of this._state.stageItems) {
            const pos = _cellToWorld(item.cell);
            if (!pos) continue;
            if (item.type === 'greybox') {
                const group = this._makeGreyboxCharacter();
                group.position.set(pos.x, 0, pos.z);
                this._scene.add(group);
                this._stageItemMeshes.push(group);
            }
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

    /**
     * Create a greybox placeholder character: rounded-box body + head,
     * proportions loosely matching the character builder.
     */
    _makeGreyboxCharacter() {
        const grey = new THREE.MeshStandardMaterial({
            color: 0x888888, roughness: 0.85, metalness: 0,
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

        const group = new THREE.Group();
        group.add(body);
        group.add(head);
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
                const s = isScatter
                    ? baseScale * (0.7 + Math.random() * 0.6)
                    : baseScale;
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
        for (const w of [this._wallBack, this._wallFront, this._wallLeft, this._wallRight]) {
            w?.material.color.set(hex);
        }
    }

    _applySkyColor(field, hex) {
        this._state[field] = hex;
        this._updateSkyCanvas();
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
        for (const wall of [this._wallBack, this._wallFront, this._wallLeft, this._wallRight]) {
            if (!wall) continue;
            wall.visible = this._wallsEnabled;
            if (this._wallsEnabled) {
                wall.scale.y = height;
                wall.position.y = height / 2;
            }
        }
        // Run a single dynamic-cull pass so the camera-facing walls hide immediately
        if (this._wallsEnabled) this._cullWallsByCamera();
    }

    /**
     * Hide walls that face the camera so the stage is always visible.
     * Called every frame from _onTick (cheap — just 4 bool checks).
     * If the camera is in the +x half-space, the +x (right) wall faces
     * toward the viewer and should be hidden.  Same logic for −x, ±z.
     */
    _cullWallsByCamera() {
        if (!this._wallsEnabled) return;
        const cx = this._camera.position.x;
        const cz = this._camera.position.z;

        // 3-wall room: show all four, then hide only the single wall
        // that most directly faces the camera.  We compare |cx| vs |cz|
        // to find the dominant axis, then hide the wall on that side.
        this._wallBack.visible  = true;
        this._wallFront.visible = true;
        this._wallLeft.visible  = true;
        this._wallRight.visible = true;

        if (Math.abs(cx) >= Math.abs(cz)) {
            // Camera is more to the left/right — hide the x-axis wall it faces
            if (cx > 0) this._wallRight.visible = false;
            else        this._wallLeft.visible  = false;
        } else {
            // Camera is more to the front/back — hide the z-axis wall it faces
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
        const cosThr = Math.cos(Math.PI / 6);    // ±30° half-angle
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
        // Sky gradient
        for (const f of ['skyTop', 'skyMid', 'skyBot']) {
            if (state[f] && state[f] !== this._state[f]) {
                this._applySkyColor(f, state[f]);
            }
        }
        // Stage items
        if (Array.isArray(state.stageItems)) {
            this._state.stageItems = state.stageItems;
            this._buildStageItems();
        }
        // Ground objects
        if (Array.isArray(state.groundObjects)) {
            this._state.groundObjects = state.groundObjects;
            this._rebuildGroundObjects();
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
        if (tab === 'fx')     body = this._renderStubTab('FX');

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
                         min="0.2" max="3.0" step="0.1" value="${scaleVal}">
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

        return `
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
        `;
    }

    // ── Stage tab ────────────────────────────────────────────────
    _renderStageTab() {
        const items = this._state.stageItems || [];
        const subtitle = renderSubtitle;

        const itemCards = items.length === 0
            ? `<p style="color:var(--text-dim); text-align:center; padding:16px 0;">
                   No items placed yet.
               </p>`
            : items.map((item, i) => `
                <div class="cb-card-tight">
                    <div class="cb-card-tight-label">${_esc(item.cell || '?')}</div>
                    <div class="cb-card-tight-control" style="font-size:0.8rem; color:var(--text-dim);">
                        ${item.type === 'greybox' ? 'Character placeholder' : _esc(item.type)}
                    </div>
                    <div class="cb-card-tight-value">
                        <button type="button" class="cb-stage-remove" data-idx="${i}"
                                style="background:none; border:none; color:var(--text-dim); cursor:pointer; font-size:1rem;"
                                aria-label="Remove">&times;</button>
                    </div>
                </div>`).join('');

        return `
          ${subtitle('Stage Items', 'stageItems')}
          ${itemCards}
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

        // ── Stage tab: remove item buttons ─────────────────────
        panel.querySelectorAll('.cb-stage-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx, 10);
                if (isNaN(idx)) return;
                this._state.stageItems.splice(idx, 1);
                this._buildStageItems();       // rebuild 3D meshes
                this._renderPanel();
                this._scheduleAutoSave();
            });
        });

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
            this._renderPanel();
            this._scheduleAutoSave();
            return;
        }
        if (key === 'sky') {
            for (const f of ['skyTop', 'skyMid', 'skyBot']) {
                const c = randHex();
                if (c) this._applySkyColor(f, c);
            }
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
                scale:    +(0.4 + Math.random() * 2.2).toFixed(1),  // 0.4–2.6
            }));
            this._rebuildGroundObjects();
            this._renderPanel();
            this._scheduleAutoSave();
            return;
        }
        if (key === 'stageItems') {
            // Random 1–MAX_STAGE_ITEMS greybox characters on random cells
            const count = 1 + Math.floor(Math.random() * MAX_STAGE_ITEMS);
            const usedCells = new Set();
            const items = [];
            while (items.length < count && usedCells.size < 25) {
                const cell = ALL_CELLS[Math.floor(Math.random() * 25)];
                if (usedCells.has(cell)) continue;
                usedCells.add(cell);
                items.push({ type: 'greybox', cell });
            }
            this._state.stageItems = items;
            this._buildStageItems();
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
        for (const key of ['groundPlane', 'stage', 'walls', 'sky', 'groundObjects', 'stageItems']) {
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
