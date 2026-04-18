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
const DEFAULT_WALLS        = 'off';
const DEFAULT_TEXTURE      = 'none';

// Sky gradient defaults (top-to-bottom, subtle dusk)
const DEFAULT_SKY_TOP = '#222034';   // DB32 deep navy
const DEFAULT_SKY_MID = '#394b5a';   // muted blue-grey
const DEFAULT_SKY_BOT = '#5a5a5a';   // horizon grey (matches old solid bg)

// Wall heights (meters)
const WALL_HEIGHTS = { off: 0, low: 1, med: 3, high: 5 };
const WALL_THICK   = 0.25;

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

// ── Diamond-order numbering for the 5×5 stage grid ─────────────
// Square 1 = far corner from default camera (−x, −z apex of the
// diamond).  Numbered right-to-left along each diagonal toward the
// camera, ending at square 25 (nearest corner, +x, +z).
const _SQUARE_MAP = (() => {
    const map = [null]; // 1-indexed (map[0] unused)
    for (let diag = 0; diag <= 8; diag++) {
        for (let col = Math.min(diag, 4); col >= Math.max(0, diag - 4); col--) {
            map.push({ col, row: diag - col });
        }
    }
    return map;
})();

/** Return the world-space {x, z} centre of a numbered stage square. */
function _squareCenter(n) {
    const cell = _SQUARE_MAP[n];
    if (!cell) return null;
    // Stage grid cells are 1×1, centred at origin.  col/row 0–4 → x/z −2..+2
    return { x: cell.col - 2, z: cell.row - 2 };
}

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
            walls:          d.walls || DEFAULT_WALLS,
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
                { type: 'greybox', square: 7  },
                { type: 'greybox', square: 9  },
                { type: 'greybox', square: 17 },
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
        this._wallBack    = null;     // back wall (along -z edge of stage)
        this._wallLeft    = null;     // left wall (along -x edge of stage)
        this._skyCanvas   = null;     // off-screen canvas for gradient
        this._skyTexture  = null;     // THREE.CanvasTexture on scene.background
        this._gridNumbers = [];       // sprites for square number labels
        this._stageItemMeshes = [];   // greybox character groups
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

        // Load the DB32 palette + texture options in parallel with setup
        const paletteP = loadPalette();
        const texturesP = _loadTextureOpts();

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

        // Two back-corner walls (only the back & left edges, away from
        // default camera). Visible only when state.walls != 'off'.
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

        // Wait for palette + texture list so the panel renders fully
        this._palette     = await paletteP;
        this._textureOpts = await texturesP;
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
     * Build the two back-corner walls (back edge along -z, left edge
     * along -x). Both walls are 0.25m thick. Their visible height is
     * driven by state.walls ('off' | 'low' | 'med' | 'high').
     */
    _buildWalls() {
        const half = STAGE_SIZE / 2;       // 2.5
        const t    = WALL_THICK;
        const matBack = new THREE.MeshStandardMaterial({
            color: new THREE.Color(this._state.wallColor), roughness: 0.85,
        });
        const matLeft = new THREE.MeshStandardMaterial({
            color: new THREE.Color(this._state.wallColor), roughness: 0.85,
        });

        // Back wall: full 5m wide along x, sits just outside the stage's -z edge
        const backGeo = new THREE.BoxGeometry(STAGE_SIZE + t, 1, t);
        this._wallBack = new THREE.Mesh(backGeo, matBack);
        this._wallBack.position.set(-t / 2, 0.5, -half - t / 2);
        this._wallBack.castShadow = true;
        this._wallBack.receiveShadow = true;
        this._scene.add(this._wallBack);

        // Left wall: full 5m deep along z, sits just outside the stage's -x edge
        const leftGeo = new THREE.BoxGeometry(t, 1, STAGE_SIZE + t);
        this._wallLeft = new THREE.Mesh(leftGeo, matLeft);
        this._wallLeft.position.set(-half - t / 2, 0.5, -t / 2);
        this._wallLeft.castShadow = true;
        this._wallLeft.receiveShadow = true;
        this._scene.add(this._wallLeft);

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
     * Render number labels (1–25) on each stage grid cell as always-
     * facing sprites. The numbers use the diamond-order scheme defined
     * by _SQUARE_MAP so artists can reference positions by number.
     */
    _buildGridNumbers() {
        for (let n = 1; n <= 25; n++) {
            const pos = _squareCenter(n);
            if (!pos) continue;

            // Draw the number onto a small canvas
            const canvas  = document.createElement('canvas');
            canvas.width  = 64;
            canvas.height = 64;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle    = 'rgba(255, 255, 255, 0.35)';
            ctx.font         = 'bold 38px sans-serif';
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(n), 32, 32);

            const tex    = new THREE.CanvasTexture(canvas);
            const mat    = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
            const sprite = new THREE.Sprite(mat);
            sprite.position.set(pos.x, 0.06, pos.z);
            sprite.scale.set(0.45, 0.45, 1);
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
            const pos = _squareCenter(item.square);
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
        this._wallBack?.material.color.set(hex);
        this._wallLeft?.material.color.set(hex);
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

    _applyWalls(mode, skipState = false) {
        if (!skipState) this._state.walls = mode;
        const h = WALL_HEIGHTS[mode] ?? 0;
        const visible = h > 0;
        for (const wall of [this._wallBack, this._wallLeft]) {
            if (!wall) continue;
            wall.visible = visible;
            if (visible) {
                wall.scale.y = h;
                // Box geometry is unit-tall (height=1), so y position must
                // shift to keep the wall sitting on the ground.
                wall.position.y = h / 2;
            }
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
        if (state.walls && state.walls !== this._state.walls) {
            this._applyWalls(state.walls);
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

        const wallOpts   = ['off', 'low', 'med', 'high'];
        const wallLabels = { off: 'Off', low: 'Low', med: 'Med', high: 'High' };

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
              <div class="cb-segmented" id="walls-seg">
                ${wallOpts.map(o => `
                  <button type="button" data-walls="${o}"
                          class="${s.walls === o ? 'active' : ''}">${wallLabels[o]}</button>`).join('')}
              </div>
            </div>
            <div class="cb-card-tight-value">${WALL_HEIGHTS[s.walls] ? `${WALL_HEIGHTS[s.walls]}m` : '—'}</div>
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
        `;
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
                    <div class="cb-card-tight-label">Sq ${item.square}</div>
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

        // Walls segmented toggle
        panel.querySelectorAll('#walls-seg button').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.walls;
                this._applyWalls(mode);
                this._renderPanel();   // refresh active state + value column
                this._scheduleAutoSave();
            });
        });

        // Texture dropdowns (stub for now — saves choice to state)
        panel.querySelectorAll('.cb-tex-select').forEach(sel => {
            sel.addEventListener('change', (e) => {
                const field = sel.dataset.texField;
                this._applyTexture(field, e.target.value);
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
            const opts = ['off', 'low', 'med', 'high'];
            this._applyWalls(opts[Math.floor(Math.random() * opts.length)]);
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
        if (key === 'stageItems') {
            // Random 1–5 greybox characters on random squares
            const count = 1 + Math.floor(Math.random() * 5);
            const usedSquares = new Set();
            const items = [];
            while (items.length < count && usedSquares.size < 25) {
                const sq = 1 + Math.floor(Math.random() * 25);
                if (usedSquares.has(sq)) continue;
                usedSquares.add(sq);
                items.push({ type: 'greybox', square: sq });
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
        for (const key of ['groundPlane', 'stage', 'walls', 'sky', 'stageItems']) {
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
