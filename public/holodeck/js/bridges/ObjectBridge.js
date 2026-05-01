/**
 * ObjectBridge.js — Full 3D object/prop editor bridge.
 *
 * Tabs: File · Bounds · Shapes · Colours
 *
 * File     — name, description, tags
 * Bounds   — anchor point XYZ, attach points
 * Shapes   — add/remove 3D primitives, position/rotate, layer order, per-shape params
 * Colours  — color roles (primary/secondary/tertiary) with DB32 palette, roughness, randomize
 */

import { BaseBridge } from './BaseBridge.js?v=4';
import { renderFileTab, wireFileTabEvents, tweenToPose } from '../shared/builderUI.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { UI }       from '../shared/palette.js';
import { standard } from '../shared/materials.js';
import { renderProp } from '../shared/propRenderer.js';
import { BUILDERS, PRIMITIVE_IDS, buildMesh } from '../shared/primitives.js';
import { loadPalette, paletteGridHtml } from '../shared/paletteLoader.js';
import { ORBIT_MAX_DISTANCE } from '../shared/envGeometry.js?v=5';

// ── Tab definitions ─────────────────────────────────────────────
const TABS = [
    { id: 'file',    label: 'File',    icon: '📄' },
    { id: 'bounds',  label: 'Bounds',  icon: '⊞' },
    { id: 'shapes',  label: 'Shapes',  icon: '◆' },
    { id: 'colours', label: 'Colours', icon: '🎨' },
];

// ── Primitive palette (display grid) ────────────────────────────
const PRIM_GRID = [
    { id: 'box',         label: 'Box',      icon: '▬' },
    { id: 'sphere',      label: 'Sphere',   icon: '●' },
    { id: 'cylinder',    label: 'Cylinder', icon: '▮' },
    { id: 'cone',        label: 'Cone',     icon: '▲' },
    { id: 'torus',       label: 'Torus',    icon: '◎' },
    { id: 'capsule',     label: 'Capsule',  icon: '⬮' },
    { id: 'hemisphere',  label: 'Half-Sph', icon: '⌓' },
    { id: 'wedge',       label: 'Wedge',    icon: '◣' },
    { id: 'pyramid',     label: 'Pyramid',  icon: '△' },
    { id: 'prism',       label: 'Prism',    icon: '⏢' },
    { id: 'tube',        label: 'Tube',     icon: '◯' },
    { id: 'rounded-box', label: 'Rnd Box',  icon: '▢' },
    { id: 'star',        label: 'Star',     icon: '★' },
    { id: 'heart',       label: 'Heart',    icon: '♥' },
];

// ── Default params per primitive (sensible starting sizes) ──────
const DEFAULT_PARAMS = {
    box:          { width: 0.5, height: 0.5, depth: 0.5 },
    sphere:       { radius: 0.3 },
    cylinder:     { radiusTop: 0.25, radiusBottom: 0.25, height: 0.6 },
    cone:         { radius: 0.3, height: 0.6 },
    torus:        { radius: 0.3, tube: 0.1 },
    capsule:      { radius: 0.2, length: 0.4 },
    hemisphere:   { radius: 0.3 },
    wedge:        { width: 0.5, height: 0.5, depth: 0.5 },
    pyramid:      { baseWidth: 0.5, height: 0.5 },
    prism:        { radius: 0.3, height: 0.5 },
    tube:         { outerRadius: 0.3, innerRadius: 0.15, height: 0.5 },
    'rounded-box':{ width: 0.5, height: 0.5, depth: 0.5, bevelRadius: 0.06 },
    star:         { outerRadius: 0.4, innerRadius: 0.2, depth: 0.15, points: 5 },
    heart:        { size: 0.4, depth: 0.15 },
};

// ── Editable param definitions per primitive ────────────────────
// { key, label, min, max, step }
const SHAPE_PARAMS = {
    box:          [{ key:'width',  label:'Width',  min:0.05, max:5, step:0.05 },
                   { key:'height', label:'Height', min:0.05, max:5, step:0.05 },
                   { key:'depth',  label:'Depth',  min:0.05, max:5, step:0.05 }],
    sphere:       [{ key:'radius', label:'Radius', min:0.05, max:3, step:0.05 }],
    cylinder:     [{ key:'radiusTop',    label:'Top R',    min:0, max:3, step:0.05 },
                   { key:'radiusBottom', label:'Bot R',    min:0.01, max:3, step:0.05 },
                   { key:'height',       label:'Height',   min:0.05, max:5, step:0.05 }],
    cone:         [{ key:'radius', label:'Radius', min:0.05, max:3, step:0.05 },
                   { key:'height', label:'Height', min:0.05, max:5, step:0.05 }],
    torus:        [{ key:'radius', label:'Radius', min:0.1,  max:3, step:0.05 },
                   { key:'tube',   label:'Tube',   min:0.02, max:1, step:0.02 }],
    capsule:      [{ key:'radius', label:'Radius', min:0.05, max:2, step:0.05 },
                   { key:'length', label:'Length', min:0.1,  max:5, step:0.05 }],
    hemisphere:   [{ key:'radius', label:'Radius', min:0.05, max:3, step:0.05 }],
    wedge:        [{ key:'width',  label:'Width',  min:0.05, max:5, step:0.05 },
                   { key:'height', label:'Height', min:0.05, max:5, step:0.05 },
                   { key:'depth',  label:'Depth',  min:0.05, max:5, step:0.05 }],
    pyramid:      [{ key:'baseWidth', label:'Base W', min:0.1, max:5, step:0.05 },
                   { key:'height',    label:'Height', min:0.05, max:5, step:0.05 }],
    prism:        [{ key:'radius', label:'Radius', min:0.05, max:3, step:0.05 },
                   { key:'height', label:'Height', min:0.05, max:5, step:0.05 }],
    tube:         [{ key:'outerRadius', label:'Outer R', min:0.1,  max:3, step:0.05 },
                   { key:'innerRadius', label:'Inner R', min:0.02, max:2.9, step:0.05 },
                   { key:'height',      label:'Height',  min:0.05, max:5, step:0.05 }],
    'rounded-box':[{ key:'width',       label:'Width',  min:0.1, max:5, step:0.05 },
                   { key:'height',      label:'Height', min:0.1, max:5, step:0.05 },
                   { key:'depth',       label:'Depth',  min:0.1, max:5, step:0.05 },
                   { key:'bevelRadius', label:'Bevel',  min:0.01, max:0.5, step:0.01 }],
    star:         [{ key:'outerRadius', label:'Outer R', min:0.1, max:3, step:0.05 },
                   { key:'innerRadius', label:'Inner R', min:0.05, max:2, step:0.05 },
                   { key:'depth',       label:'Depth',  min:0.05, max:2, step:0.05 },
                   { key:'points',      label:'Points', min:3, max:12, step:1 }],
    heart:        [{ key:'size',  label:'Size',  min:0.1, max:3, step:0.05 },
                   { key:'depth', label:'Depth', min:0.05, max:2, step:0.05 }],
};

// ── Color role names ────────────────────────────────────────────
const COLOR_ROLES = ['primary', 'secondary', 'tertiary'];

export class ObjectBridge extends BaseBridge {
    constructor(sceneContainer, panelEl, options = {}) {
        super(sceneContainer, panelEl, options);
        this.displayName = '3D Object';
        this.storeName   = 'objects';

        const d  = this.asset?.payload?.state || this.asset?.state || {};
        const ed = this.asset?.payload?._editor || this.asset?._editor || {};

        const colorAssignments = d.colorAssignments
            || ed.color_assignments
            || this.asset?.payload?.color_assignments
            || {};

        // Normalize elements: prefer saved state (from auto-save), fall back to _editor
        // Then convert flat-format elements (mailbox-style) into the
        // nested { primitiveId, params } format used by the editor.
        const rawEls = structuredClone(d.elements || ed.elements || []);
        const elements = rawEls.map(el => {
            if (el.params) return el; // already nested format (sword-style)
            // Flat format: { type: "box", px: 0, width: 0.5, fill: "primary", ... }
            const { id, type, primitiveId, primitive, zIndex, ...rest } = el;
            return {
                id:          id || undefined,
                primitiveId: primitiveId || primitive || type || 'box',
                zIndex:      zIndex || 0,
                params:      rest,
            };
        });

        // Editable state (included in undo/redo)
        this._state = {
            elements,
            colorAssignments: { primary: '#888888', ...colorAssignments },
            roughness:        d.roughness ?? 0.5,
            anchorPoint:      d.anchorPoint || this.asset?.payload?.anchor_point || { x: 0, y: 0, z: 0 },
            attachPoints:     d.attachPoints || this.asset?.payload?.attach_points || [],
        };

        // UI-only state
        this._activeTab        = 'file';
        this._selectedIdx      = -1;
        this._palette          = null;
        this._activeColorTarget = null;
        this._propGroup        = null;
        this._orbitControls    = null;
    }

    async init() {
        this._palette = await loadPalette();
        await super.init();
    }

    // ═══════════════════════════════════════════════════════════════
    //  SCENE
    // ═══════════════════════════════════════════════════════════════

    _buildScene() {
        // Square-on default — matches the unified pattern (DEFAULT_CAMERA in
        // shared/envGeometry.js). Object editor uses its own framing depth so
        // small objects fill the frame without losing scale relative to the
        // 5 m stage. Auto-framed below from the prop bounding box.
        this._camera.position.set(0, 2.0, 4.0);
        this._camera.lookAt(0, 0.5, 0);
        this._camera.fov = 50;
        this._camera.updateProjectionMatrix();

        this._orbitControls = new OrbitControls(this._camera, this._renderer.domElement);
        this._orbitControls.enableDamping  = true;
        this._orbitControls.dampingFactor  = 0.08;
        this._orbitControls.target.set(0, 0.5, 0);
        this._orbitControls.minDistance    = 1;
        this._orbitControls.maxDistance    = ORBIT_MAX_DISTANCE;

        this._rebuildProp();
    }

    /** Rebuild the 3D prop from current element state. */
    _rebuildProp() {
        // Dispose old
        if (this._propGroup) {
            this._scene.remove(this._propGroup);
            this._propGroup.traverse(c => {
                if (c.geometry) c.geometry.dispose();
                if (c.material) c.material.dispose();
            });
            this._propGroup = null;
        }

        const els = this._state.elements;

        if (els.length > 0) {
            // Build synthetic propData for renderProp()
            const propData = {
                id: this.asset?.id || 'object',
                payload: {
                    _editor: {
                        elements: els,
                        color_assignments: { ...this._state.colorAssignments },
                    },
                    color_assignments: { ...this._state.colorAssignments },
                },
            };

            this._propGroup = renderProp(propData);

            // Apply roughness to all meshes
            const rough = this._state.roughness;
            this._propGroup.traverse(c => {
                if (c.material) c.material.roughness = rough;
            });
        } else {
            // Empty state — show a placeholder ghost box
            this._propGroup = new THREE.Group();
            const ghost = new THREE.Mesh(
                new THREE.BoxGeometry(0.5, 0.5, 0.5),
                new THREE.MeshStandardMaterial({
                    color: 0x444466,
                    transparent: true,
                    opacity: 0.25,
                    wireframe: true,
                }),
            );
            ghost.position.y = 0.25;
            this._propGroup.add(ghost);
        }

        this._propGroup.userData.role = 'propGroup';
        this._scene.add(this._propGroup);
        this._autoFrame();
    }

    /** Auto-frame the camera around the prop. */
    _autoFrame() {
        if (!this._propGroup) return;
        const box = new THREE.Box3().setFromObject(this._propGroup);
        if (box.isEmpty()) return;
        const center = box.getCenter(new THREE.Vector3());
        const size   = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov    = this._camera.fov * (Math.PI / 180);
        let dist     = (maxDim / 2) / Math.tan(fov / 2);
        dist = Math.max(dist * 1.5, 2);
        // Square-on auto-frame: x=0, lifted slightly to take the prop in fully.
        this._camera.position.set(0, center.y + dist * 0.4, dist);
        this._camera.lookAt(center);
        if (this._orbitControls) this._orbitControls.target.copy(center);
    }

    _onTick() {
        if (this._orbitControls) this._orbitControls.update();
    }

    // ═══════════════════════════════════════════════════════════════
    //  PANEL RENDERING
    // ═══════════════════════════════════════════════════════════════

    _renderPanelBody() {
        const tab = this._activeTab;

        // Tab bar
        const tabBar = `<div class="cb-tabs-list">${
            TABS.map(t =>
                `<button class="cb-tab-trigger ${t.id === tab ? 'active' : ''}" data-tab="${t.id}">
                    <span class="cb-tab-icon">${t.icon}</span>${t.label}
                 </button>`
            ).join('')
        }</div>`;

        let body = '';
        if (tab === 'file')     body = this._renderFileTab();
        if (tab === 'bounds')   body = this._renderBoundsTab();
        if (tab === 'shapes')   body = this._renderShapesTab();
        if (tab === 'colours')  body = this._renderColoursTab();

        return tabBar + `<div class="cb-tab-content">${body}</div>`;
    }

    // ── File Tab ────────────────────────────────────────────────
    _renderFileTab() {
        return renderFileTab(this.asset, {
            namePlaceholder: 'Object name…',
            descPlaceholder: 'Describe this object…',
            tagsPlaceholder: 'e.g. furniture, chair, wood',
        });
    }

    // ── Bounds Tab ──────────────────────────────────────────────
    _renderBoundsTab() {
        const a = this._state.anchorPoint;
        const pts = this._state.attachPoints;

        let attachHtml = pts.map((pt, i) => `
            <div class="cb-element-row" style="display:flex;gap:6px;align-items:center;margin-bottom:4px;">
                <input type="text" class="cb-input cb-attach-name" data-idx="${i}"
                       value="${_esc(pt.name)}" placeholder="Point name" style="flex:1;">
                <button class="cb-btn-sm cb-attach-del" data-idx="${i}" title="Remove">✕</button>
            </div>
        `).join('');

        return `
          <div class="cb-section">
            <div class="cb-section-title">Anchor Point</div>
            <div style="display:flex;gap:8px;">
              ${_numInput('anchor-x', 'X', a.x, -5, 5, 0.1)}
              ${_numInput('anchor-y', 'Y', a.y, -5, 5, 0.1)}
              ${_numInput('anchor-z', 'Z', a.z, -5, 5, 0.1)}
            </div>
          </div>
          <div class="cb-section">
            <div class="cb-section-title">Attach Points</div>
            ${attachHtml || '<div class="cb-hint">No attach points yet</div>'}
            <button class="cb-btn-sm cb-attach-add" style="margin-top:6px;">+ Add Point</button>
          </div>`;
    }

    // ── Shapes Tab ──────────────────────────────────────────────
    _renderShapesTab() {
        const els = this._state.elements;

        // Primitive grid for adding shapes
        const gridHtml = PRIM_GRID.map(p =>
            `<button class="cb-shape-btn cb-prim-add" data-prim="${p.id}" title="${p.label}">
                <span style="font-size:16px;">${p.icon}</span><br>
                <span style="font-size:9px;">${p.label}</span>
             </button>`
        ).join('');

        // Element list
        let listHtml = '';
        if (els.length === 0) {
            listHtml = '<div class="cb-hint">Click a shape above to add it</div>';
        } else {
            listHtml = els.map((el, i) => {
                const prim = el.primitiveId || el.primitive || el.type || 'box';
                const sel  = i === this._selectedIdx;
                const icon = PRIM_GRID.find(p => p.id === prim)?.icon || '?';
                return `<button class="cb-element-row cb-el-select ${sel ? 'active' : ''}" data-idx="${i}">
                    <span>${icon}</span>
                    <span style="flex:1;text-align:left;">${_capitalize(prim)} ${i + 1}</span>
                </button>`;
            }).join('');
        }

        // Selected element properties
        let propsHtml = '';
        if (this._selectedIdx >= 0 && this._selectedIdx < els.length) {
            propsHtml = this._renderElementProps(els[this._selectedIdx], this._selectedIdx);
        }

        return `
          <div class="cb-section">
            <div class="cb-section-title">Add Primitive</div>
            <div class="cb-shape-grid">${gridHtml}</div>
          </div>
          <div class="cb-section">
            <div class="cb-section-title">Elements (${els.length})</div>
            ${listHtml}
          </div>
          ${propsHtml}`;
    }

    /** Render properties for a selected element. */
    _renderElementProps(el, idx) {
        const p    = el.params || el;
        const prim = el.primitiveId || el.primitive || el.type || 'box';
        const defs = SHAPE_PARAMS[prim] || [];

        // Position
        const posHtml = `
            <div class="cb-section-title">Position</div>
            <div style="display:flex;gap:8px;">
              ${_numInput('el-px', 'X', p.px || 0, -5, 5, 0.05)}
              ${_numInput('el-py', 'Y', p.py || 0, -5, 5, 0.05)}
              ${_numInput('el-pz', 'Z', p.pz || 0, -5, 5, 0.05)}
            </div>`;

        // Rotation
        const rotHtml = `
            <div class="cb-section-title" style="margin-top:8px;">Rotation</div>
            <div style="display:flex;gap:8px;">
              ${_numInput('el-rx', 'X°', p.rx || 0, -360, 360, 1)}
              ${_numInput('el-ry', 'Y°', p.ry || 0, -360, 360, 1)}
              ${_numInput('el-rz', 'Z°', p.rz || 0, -360, 360, 1)}
            </div>`;

        // Shape-specific params
        let shapeHtml = '';
        if (defs.length > 0) {
            shapeHtml = `<div class="cb-section-title" style="margin-top:8px;">Shape Parameters</div>` +
                defs.map(d => {
                    const val = p[d.key] ?? DEFAULT_PARAMS[prim]?.[d.key] ?? 0.5;
                    return `<div class="cb-color-row">
                        <label class="cb-color-label">${d.label}:</label>
                        <input type="number" class="cb-input cb-shape-param" data-key="${d.key}"
                               value="${val}" min="${d.min}" max="${d.max}" step="${d.step}">
                    </div>`;
                }).join('');
        }

        // Fill color
        const fillHtml = `
            <div class="cb-section-title" style="margin-top:8px;">Fill</div>
            <div class="cb-color-row">
              <label class="cb-color-label">Color Role:</label>
              <select class="cb-acc-select cb-el-fill">
                ${COLOR_ROLES.map(r => `<option value="${r}" ${(p.fill || 'primary') === r ? 'selected' : ''}>${_capitalize(r)}</option>`).join('')}
                <option value="custom" ${(p.fill && p.fill.startsWith('#')) ? 'selected' : ''}>Custom</option>
              </select>
            </div>`;

        // Layer / Delete
        const layerHtml = `
            <div style="display:flex;gap:8px;margin-top:10px;">
              <button class="cb-btn-sm cb-el-up" data-idx="${idx}" ${idx === 0 ? 'disabled' : ''}>↑ Up</button>
              <button class="cb-btn-sm cb-el-down" data-idx="${idx}" ${idx >= this._state.elements.length - 1 ? 'disabled' : ''}>↓ Down</button>
              <button class="cb-btn-sm cb-el-delete" data-idx="${idx}" style="margin-left:auto;color:${UI.danger};">Delete</button>
            </div>`;

        return `<div class="cb-section cb-props-section">
            <div class="cb-section-title" style="display:flex;justify-content:space-between;">
                <span>${PRIM_GRID.find(pp => pp.id === prim)?.icon || ''} ${_capitalize(prim)} ${idx + 1}</span>
                <button class="cb-btn-sm cb-el-deselect">✕</button>
            </div>
            ${posHtml}
            ${rotHtml}
            ${shapeHtml}
            ${fillHtml}
            ${layerHtml}
        </div>`;
    }

    // ── Colours Tab ─────────────────────────────────────────────
    _renderColoursTab() {
        const s   = this._state;
        const pal = paletteGridHtml(this._palette);

        // Color role swatches
        const rolesHtml = COLOR_ROLES.map(role => {
            const color = s.colorAssignments[role] || '#888888';
            return `<div class="cb-color-row">
                <label class="cb-color-label">${_capitalize(role)}:</label>
                <div class="cb-color-swatch" data-property="${role}" style="background:${color};"></div>
            </div>`;
        }).join('');

        return `
          <div class="cb-section">
            <div class="cb-section-title">Colour Roles</div>
            ${rolesHtml}
            <div class="cb-palette-grid" style="display:none;">${pal}</div>
          </div>
          <div class="cb-section">
            <div class="cb-section-title">Surface</div>
            <div class="cb-color-row">
              <label class="cb-color-label">Roughness:</label>
              <input type="range" class="cb-range" data-property="roughness"
                     value="${s.roughness}" min="0" max="1" step="0.01">
            </div>
          </div>
          <div class="cb-section">
            <button class="cb-btn-sm cb-randomize-colors">Randomize Colours</button>
          </div>`;
    }

    // ═══════════════════════════════════════════════════════════════
    //  EVENT WIRING
    // ═══════════════════════════════════════════════════════════════

    _wirePanelEvents() {
        const panel = this.panelEl;

        // ── Tab switching ──
        panel.querySelectorAll('.cb-tab-trigger').forEach(btn => {
            btn.addEventListener('click', () => {
                this._activeTab = btn.dataset.tab;
                this._renderPanel();
            });
        });

        // ── File tab (shared wiring) ──
        wireFileTabEvents(panel, this, { formatType: 'object_state' });

        // ── Bounds tab: anchor point ──
        for (const axis of ['x', 'y', 'z']) {
            const inp = panel.querySelector(`.cb-num[data-key="anchor-${axis}"]`);
            if (inp) inp.addEventListener('change', () => {
                this._state.anchorPoint[axis] = parseFloat(inp.value) || 0;
                this.markDirty('Move anchor');
            });
        }

        // ── Bounds tab: attach points ──
        panel.querySelectorAll('.cb-attach-name').forEach(inp => {
            inp.addEventListener('change', () => {
                const i = parseInt(inp.dataset.idx);
                if (this._state.attachPoints[i]) {
                    this._state.attachPoints[i].name = inp.value;
                    this.markDirty('Rename attach point');
                }
            });
        });
        panel.querySelectorAll('.cb-attach-del').forEach(btn => {
            btn.addEventListener('click', () => {
                this._state.attachPoints.splice(parseInt(btn.dataset.idx), 1);
                this.markDirty('Remove attach point');
                this._renderPanel();
            });
        });
        panel.querySelector('.cb-attach-add')?.addEventListener('click', () => {
            this._state.attachPoints.push({ name: `Point ${this._state.attachPoints.length + 1}`, x: 0, y: 0, z: 0 });
            this.markDirty('Add attach point');
            this._renderPanel();
        });

        // ── Shapes tab: add primitive ──
        panel.querySelectorAll('.cb-prim-add').forEach(btn => {
            btn.addEventListener('click', () => {
                const primId = btn.dataset.prim;
                const defaults = DEFAULT_PARAMS[primId] || {};
                const newEl = {
                    primitiveId: primId,
                    params: {
                        ...defaults,
                        px: 0, py: defaults.height ? defaults.height / 2 : 0.25, pz: 0,
                        rx: 0, ry: 0, rz: 0,
                        fill: 'primary',
                    },
                };
                this._state.elements.push(newEl);
                this._selectedIdx = this._state.elements.length - 1;
                this._rebuildProp();
                this.markDirty(`Add ${primId}`);
                this._renderPanel();
            });
        });

        // ── Shapes tab: select element ──
        panel.querySelectorAll('.cb-el-select').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx);
                this._selectedIdx = (this._selectedIdx === idx) ? -1 : idx;
                this._renderPanel();
            });
        });

        // ── Shapes tab: deselect ──
        panel.querySelector('.cb-el-deselect')?.addEventListener('click', () => {
            this._selectedIdx = -1;
            this._renderPanel();
        });

        // ── Shapes tab: element position/rotation ──
        for (const key of ['el-px','el-py','el-pz','el-rx','el-ry','el-rz']) {
            const inp = panel.querySelector(`.cb-num[data-key="${key}"]`);
            if (inp) inp.addEventListener('change', () => {
                if (this._selectedIdx < 0) return;
                const paramKey = key.replace('el-', '');
                this._state.elements[this._selectedIdx].params[paramKey] = parseFloat(inp.value) || 0;
                this._rebuildProp();
                this.markDirty('Move shape');
            });
        }

        // ── Shapes tab: shape-specific params ──
        panel.querySelectorAll('.cb-shape-param').forEach(inp => {
            inp.addEventListener('change', () => {
                if (this._selectedIdx < 0) return;
                const key = inp.dataset.key;
                this._state.elements[this._selectedIdx].params[key] = parseFloat(inp.value);
                this._rebuildProp();
                this.markDirty(`Change ${key}`);
            });
        });

        // ── Shapes tab: fill role ──
        panel.querySelector('.cb-el-fill')?.addEventListener('change', (e) => {
            if (this._selectedIdx < 0) return;
            this._state.elements[this._selectedIdx].params.fill = e.target.value;
            this._rebuildProp();
            this.markDirty('Change fill');
        });

        // ── Shapes tab: layer up/down ──
        panel.querySelectorAll('.cb-el-up').forEach(btn => {
            btn.addEventListener('click', () => {
                const i = parseInt(btn.dataset.idx);
                if (i <= 0) return;
                [this._state.elements[i - 1], this._state.elements[i]] =
                    [this._state.elements[i], this._state.elements[i - 1]];
                this._selectedIdx = i - 1;
                this._rebuildProp();
                this.markDirty('Move shape up');
                this._renderPanel();
            });
        });
        panel.querySelectorAll('.cb-el-down').forEach(btn => {
            btn.addEventListener('click', () => {
                const i = parseInt(btn.dataset.idx);
                if (i >= this._state.elements.length - 1) return;
                [this._state.elements[i], this._state.elements[i + 1]] =
                    [this._state.elements[i + 1], this._state.elements[i]];
                this._selectedIdx = i + 1;
                this._rebuildProp();
                this.markDirty('Move shape down');
                this._renderPanel();
            });
        });

        // ── Shapes tab: delete element ──
        panel.querySelectorAll('.cb-el-delete').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!confirm('Delete this shape?')) return;
                const i = parseInt(btn.dataset.idx);
                this._state.elements.splice(i, 1);
                this._selectedIdx = -1;
                this._rebuildProp();
                this.markDirty('Delete shape');
                this._renderPanel();
            });
        });

        // ── Colours tab: swatch toggle ──
        panel.querySelectorAll('.cb-color-swatch').forEach(sw => {
            sw.addEventListener('click', () => {
                const prop = sw.dataset.property;
                const grid = panel.querySelector('.cb-palette-grid');
                if (!grid) return;
                if (this._activeColorTarget === prop && grid.style.display !== 'none') {
                    grid.style.display = 'none';
                    this._activeColorTarget = null;
                } else {
                    this._activeColorTarget = prop;
                    grid.style.display = 'grid';
                    grid.scrollIntoView({ behavior: 'instant', block: 'nearest' });
                }
            });
        });

        // ── Colours tab: palette swatch click ──
        panel.querySelectorAll('.cb-pal-swatch').forEach(sw => {
            sw.addEventListener('click', () => {
                if (!this._activeColorTarget) return;
                const hex = sw.dataset.hex;
                this._state.colorAssignments[this._activeColorTarget] = hex;
                // Update swatch display
                const el = panel.querySelector(`.cb-color-swatch[data-property="${this._activeColorTarget}"]`);
                if (el) el.style.background = hex;
                this._rebuildProp();
                this.markDirty('Change colour');
            });
        });

        // ── Colours tab: roughness ──
        panel.querySelector('.cb-range[data-property="roughness"]')?.addEventListener('input', (e) => {
            this._state.roughness = parseFloat(e.target.value);
            if (this._propGroup) {
                this._propGroup.traverse(c => {
                    if (c.material) c.material.roughness = this._state.roughness;
                });
            }
        });

        // ── Colours tab: randomize ──
        panel.querySelector('.cb-randomize-colors')?.addEventListener('click', () => {
            if (!this._palette || this._palette.length === 0) return;
            for (const role of COLOR_ROLES) {
                const rand = this._palette[Math.floor(Math.random() * this._palette.length)];
                this._state.colorAssignments[role] = rand.hex;
            }
            this._rebuildProp();
            this.markDirty('Randomize colours');
            this._renderPanel();
        });
    }

    // ═══════════════════════════════════════════════════════════════
    //  STATE MANAGEMENT
    // ═══════════════════════════════════════════════════════════════

    _getState() {
        return {
            elements:         structuredClone(this._state.elements),
            colorAssignments: { ...this._state.colorAssignments },
            roughness:        this._state.roughness,
            anchorPoint:      { ...this._state.anchorPoint },
            attachPoints:     structuredClone(this._state.attachPoints),
        };
    }

    _applyState(state) {
        this._state = {
            elements:         structuredClone(state.elements || []),
            colorAssignments: { ...state.colorAssignments },
            roughness:        state.roughness ?? 0.5,
            anchorPoint:      { ...state.anchorPoint },
            attachPoints:     structuredClone(state.attachPoints || []),
        };
        this._selectedIdx = -1;
        this._rebuildProp();
    }

    /** Tween camera back to the initial pose (square-on, matching _buildScene). */
    resetView() {
        if (!this._orbitControls || !this._camera) return;
        this._resetCancel?.();
        this._resetCancel = tweenToPose(
            this._camera, this._orbitControls,
            new THREE.Vector3(0, 2.0, 4.0),
            new THREE.Vector3(0, 0.5, 0),
        );
    }

    destroy() {
        if (this._orbitControls) {
            this._orbitControls.dispose();
            this._orbitControls = null;
        }
        super.destroy();
    }
}

// ── Helpers ──────────────────────────────────────────────────────

function _esc(t) { return String(t).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[m]); }
function _capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function _numInput(key, label, value, min, max, step) {
    return `<div style="flex:1;">
        <div class="cb-color-label" style="font-size:10px;">${label}</div>
        <input type="number" class="cb-input cb-num" data-key="${key}"
               value="${value}" min="${min}" max="${max}" step="${step}"
               style="width:100%;">
    </div>`;
}
