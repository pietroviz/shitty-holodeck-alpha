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
 * Tabs: File · Land · Sky · Stuff · FX.
 *   File   — name / description / tags (wired)
 *   Land   — ground size + ground color + stage color (wired)
 *            walls + stage-size controls coming next
 *   Sky    — stub
 *   Stuff  — stub (object placement)
 *   FX     — stub (lighting + atmosphere effects)
 *
 * See docs/environment-builder-notes.md for a running design log.
 */

import * as THREE from 'three';
import { Line2 }        from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { BaseBridge } from './BaseBridge.js?v=3';
import { loadPalette }     from '../shared/paletteLoader.js';
import { showColorPicker } from '../shared/colorPicker.js';

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

// ── Tabs (File · Ground · Sky · Stuff · FX) ─────────────────────
const TABS = [
    { id: 'file',   label: 'File'   },
    { id: 'ground', label: 'Ground' },
    { id: 'sky',    label: 'Sky'    },
    { id: 'stuff',  label: 'Stuff'  },
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

// Dice icon for per-field Surprise buttons
const DICE_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
     fill="none" stroke="currentColor" stroke-width="1.75"
     stroke-linecap="round" stroke-linejoin="round">
  <rect x="3" y="3" width="18" height="18" rx="3"/>
  <circle cx="8"  cy="8"  r="1.2" fill="currentColor" stroke="none"/>
  <circle cx="16" cy="8"  r="1.2" fill="currentColor" stroke="none"/>
  <circle cx="8"  cy="16" r="1.2" fill="currentColor" stroke="none"/>
  <circle cx="16" cy="16" r="1.2" fill="currentColor" stroke="none"/>
  <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>
</svg>`;

// Render a field head row (label on left, Surprise dice on right).
const _fieldHead = (label, surpriseKey) => `
    <div class="cb-field-head">
        <div class="cb-label">${label}</div>
        <button type="button" class="cb-field-surprise" data-surprise="${surpriseKey}" aria-label="Surprise me" title="Surprise me">
            ${DICE_ICON}
        </button>
    </div>`;

// Palette swatch grid with a selection highlight
const _paletteGrid = (palette, selectedHex, field) => {
    if (!palette) return '<div class="cb-hint">Loading palette…</div>';
    return `<div class="cb-palette-grid" data-field="${field}">${
        palette.map(c => {
            const sel = c.hex.toLowerCase() === (selectedHex || '').toLowerCase();
            return `<button type="button" class="cb-pal-swatch ${sel ? 'selected' : ''}"
                        data-hex="${c.hex}" title="${c.name || c.hex}"
                        style="background:${c.hex};"></button>`;
        }).join('')
    }</div>`;
};

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
            // Future: skyTop/Mid/Bot, objects, fx, lighting
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

        // Scene background — mid grey
        this._scene.background = new THREE.Color(0x5A5A5A);

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
        this._controls.maxPolarAngle = Math.PI * 0.49;
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
        const geom = new THREE.PlaneGeometry(size, size);
        const mat  = new THREE.MeshStandardMaterial({
            color: new THREE.Color(this._state.groundColor),
            roughness: 0.95,
            metalness: 0,
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = 0;
        mesh.receiveShadow = true;
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
            this._groundMesh.geometry = new THREE.PlaneGeometry(clamped, clamped);
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
            ...this._state,
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
        if (tab === 'sky')    body = this._renderStubTab('Sky');
        if (tab === 'stuff')  body = this._renderStubTab('Stuff');
        if (tab === 'fx')     body = this._renderStubTab('FX');

        return tabBar + `<div class="cb-tab-content">${body}</div>`;
    }

    // ── File tab ────────────────────────────────────────────────
    _renderFileTab() {
        const name = _esc(this.asset?.name || '');
        const desc = _esc(this.asset?.payload?.description || '');
        const tags = _esc((this.asset?.tags || []).join(', '));
        return `
          <div class="cb-field">
            ${_fieldHead('Name', 'name')}
            <input type="text" class="bridge-name-input cb-name-input"
                   value="${name}" placeholder="Environment name..." maxlength="40">
          </div>
          <div class="cb-field">
            ${_fieldHead('Description', 'description')}
            <textarea class="cb-desc-input" placeholder="Describe this environment..."
                      rows="3" maxlength="200">${desc}</textarea>
          </div>
          <div class="cb-field">
            ${_fieldHead('Tags', 'tags')}
            <input type="text" class="cb-tags-input"
                   value="${tags}" placeholder="e.g. template, outdoor, warm" maxlength="100">
          </div>`;
    }

    // ── Ground tab ──────────────────────────────────────────────
    _renderGroundTab() {
        const s = this._state;

        // Subtitle row with a single dice for the whole subsection
        const subtitle = (text, surpriseKey) => `
          <div class="cb-subtitle-row">
            <div class="cb-subtitle">${text}</div>
            <button type="button" class="cb-field-surprise" data-surprise="${surpriseKey}"
                    aria-label="Surprise me" title="Surprise me">${DICE_ICON}</button>
          </div>`;

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

        // ── File tab ───────────────────────────────────────────
        panel.querySelector('.bridge-name-input')?.addEventListener('input', (e) => {
            if (this.asset) this.asset.name = e.target.value.trim();
            this._scheduleAutoSave();
        });

        panel.querySelector('.cb-desc-input')?.addEventListener('input', (e) => {
            if (!this.asset) return;
            if (!this.asset.payload) {
                this.asset.payload = {
                    description: '',
                    format: 'environment_state',
                    state: {},
                    _editor: null,
                };
            }
            this.asset.payload.description = e.target.value;
            this._scheduleAutoSave();
        });

        panel.querySelector('.cb-tags-input')?.addEventListener('input', (e) => {
            if (!this.asset) return;
            this.asset.tags = e.target.value.split(',').map(t => t.trim()).filter(Boolean);
            this._scheduleAutoSave();
        });

        // ── Ground tab ─────────────────────────────────────────
        const sizeInput = panel.querySelector('#ground-size');
        const sizeLabel = panel.querySelector('#ground-size-val');
        sizeInput?.addEventListener('input', (e) => {
            const n = parseInt(e.target.value, 10);
            this._applyGroundSize(n);
            if (sizeLabel) sizeLabel.textContent = `${this._state.groundSize}×${this._state.groundSize}`;
            this._scheduleAutoSave();
        });

        // Color triggers — open the shared color picker modal
        panel.querySelectorAll('.cb-color-trigger').forEach(trigger => {
            trigger.addEventListener('click', () => {
                const field = trigger.dataset.colorField;
                const current = field === 'groundColor' ? this._state.groundColor
                              : field === 'stageColor'  ? this._state.stageColor
                              : field === 'wallColor'   ? this._state.wallColor
                              : '';
                const titleMap = {
                    groundColor: 'Ground Color',
                    stageColor:  'Stage Color',
                    wallColor:   'Wall Color',
                };
                const valueElId = field === 'groundColor' ? '#ground-color-val'
                                : field === 'stageColor'  ? '#stage-color-val'
                                : field === 'wallColor'   ? '#wall-color-val'
                                : null;
                showColorPicker({
                    currentHex: current,
                    title: titleMap[field] || 'Choose color',
                    onPick: (hex) => {
                        if (field === 'groundColor') this._applyGroundColor(hex);
                        if (field === 'stageColor')  this._applyStageColor(hex);
                        if (field === 'wallColor')   this._applyWallColor(hex);
                        trigger.style.background = hex;
                        const valEl = valueElId ? panel.querySelector(valueElId) : null;
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

        // ── Surprise buttons ───────────────────────────────────
        panel.querySelectorAll('.cb-field-surprise').forEach(btn => {
            btn.addEventListener('click', () => {
                const which = btn.dataset.surprise;
                this._onSurpriseField(which);
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

        // File-tab per-field stubs (intelligence layer pending)
        console.debug(`[EnvironmentBridge] surprise requested for "${key}" (stub — intelligence pending)`);
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
        const target = new THREE.Vector3(0, 0, 0);
        const toPos  = new THREE.Vector3(5.2, 3.9, 5.2);
        const fromPos = this._camera.position.clone();
        const fromTarget = this._controls.target.clone();

        const startTime = performance.now();
        const duration  = 500;
        const ease = (t) => 1 - Math.pow(1 - t, 4);

        if (this._resetRaf) cancelAnimationFrame(this._resetRaf);
        const step = (now) => {
            const t = Math.min(1, (now - startTime) / duration);
            const e = ease(t);
            this._camera.position.lerpVectors(fromPos, toPos, e);
            this._controls.target.lerpVectors(fromTarget, target, e);
            this._controls.update();
            if (t < 1) this._resetRaf = requestAnimationFrame(step);
            else       this._resetRaf = null;
        };
        this._resetRaf = requestAnimationFrame(step);
    }
}
