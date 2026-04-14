/**
 * ImageBridge.js — Full 2D image asset editor bridge.
 *
 * Tabs: File · Frame · Shapes · Colours
 *
 * File     — name, description, tags
 * Frame    — aspect ratio presets, background (transparency + colour), anchor point
 * Shapes   — add/remove 2D primitives, position, layer order, per-shape params
 * Colours  — colour roles with DB32 palette, quick palettes, randomize
 */

import { BaseBridge } from './BaseBridge.js';
import * as THREE from 'three';
import { UI }       from '../shared/palette.js';
import { renderImage } from '../shared/imageRenderer.js';
import { loadPalette, paletteGridHtml } from '../shared/paletteLoader.js';

const EMOJI_MANIFEST_URL = 'global_assets/images/emojis/manifest.json';

// ── Tab definitions ─────────────────────────────────────────────
const TABS = [
    { id: 'file',    label: 'File',    icon: '📄' },
    { id: 'frame',   label: 'Frame',   icon: '⬜' },
    { id: 'shapes',  label: 'Shapes',  icon: '◆' },
    { id: 'colours', label: 'Colours', icon: '🎨' },
];

// ── Aspect ratio presets ────────────────────────────────────────
const FRAME_PRESETS = [
    { id: '1:1',   label: '1:1',   w: 512, h: 512 },
    { id: '4:3',   label: '4:3',   w: 512, h: 384 },
    { id: '16:9',  label: '16:9',  w: 512, h: 288 },
    { id: '3:4',   label: '3:4',   w: 384, h: 512 },
    { id: '9:16',  label: '9:16',  w: 288, h: 512 },
    { id: '2:1',   label: '2:1',   w: 512, h: 256 },
];

// ── 2D primitive palette ────────────────────────────────────────
const PRIM_2D = [
    { id: 'circle',       label: 'Circle',   icon: '●' },
    { id: 'ellipse',      label: 'Ellipse',  icon: '⬮' },
    { id: 'rect',         label: 'Rect',     icon: '▬' },
    { id: 'square',       label: 'Square',   icon: '■' },
    { id: 'rounded-rect', label: 'Rnd Rect', icon: '▢' },
    { id: 'triangle',     label: 'Triangle', icon: '▲' },
    { id: 'pentagon',     label: 'Pentagon', icon: '⬠' },
    { id: 'hexagon',      label: 'Hexagon',  icon: '⬡' },
    { id: 'diamond',      label: 'Diamond',  icon: '◆' },
    { id: 'star-4',       label: 'Star 4',   icon: '✦' },
    { id: 'star-5',       label: 'Star 5',   icon: '★' },
    { id: 'star-6',       label: 'Star 6',   icon: '✶' },
    { id: 'ring',         label: 'Ring',      icon: '◯' },
    { id: 'cross',        label: 'Cross',     icon: '✚' },
    { id: 'arc',          label: 'Arc',       icon: '◠' },
    { id: 'line',         label: 'Line',      icon: '╱' },
];

// ── Default params per 2D primitive ─────────────────────────────
const DEFAULT_2D = {
    circle:        { cx: 256, cy: 256, radius: 80 },
    ellipse:       { cx: 256, cy: 256, rx: 100, ry: 60 },
    rect:          { cx: 256, cy: 256, width: 120, height: 80 },
    square:        { cx: 256, cy: 256, width: 80, height: 80 },
    'rounded-rect':{ cx: 256, cy: 256, width: 120, height: 80, rx: 12 },
    triangle:      { cx: 256, cy: 256, radius: 70 },
    pentagon:      { cx: 256, cy: 256, radius: 70 },
    hexagon:       { cx: 256, cy: 256, radius: 70 },
    diamond:       { cx: 256, cy: 256, radius: 70 },
    'star-4':      { cx: 256, cy: 256, outerRadius: 70, innerRatio: 0.4 },
    'star-5':      { cx: 256, cy: 256, outerRadius: 70, innerRatio: 0.4 },
    'star-6':      { cx: 256, cy: 256, outerRadius: 70, innerRatio: 0.4 },
    ring:          { cx: 256, cy: 256, radius: 70, strokeWidth: 8 },
    cross:         { cx: 256, cy: 256, width: 80, height: 80, thickness: 20 },
    arc:           { cx: 256, cy: 256, radius: 70, startAngle: 0, endAngle: 180, strokeWidth: 6 },
    line:          { cx: 256, cy: 256, length: 120, angle: 0, strokeWidth: 4 },
};

// ── Editable param definitions per 2D primitive ─────────────────
const SHAPE_2D_PARAMS = {
    circle:        [{ key:'radius', label:'Radius', min:5, max:250, step:1 }],
    ellipse:       [{ key:'rx', label:'Radius X', min:5, max:250, step:1 },
                    { key:'ry', label:'Radius Y', min:5, max:250, step:1 }],
    rect:          [{ key:'width',  label:'Width',  min:5, max:500, step:1 },
                    { key:'height', label:'Height', min:5, max:500, step:1 }],
    square:        [{ key:'width', label:'Size', min:5, max:500, step:1 }],
    'rounded-rect':[{ key:'width',  label:'Width',  min:5, max:500, step:1 },
                    { key:'height', label:'Height', min:5, max:500, step:1 },
                    { key:'rx',     label:'Corner R', min:0, max:100, step:1 }],
    triangle:      [{ key:'radius', label:'Size', min:5, max:250, step:1 }],
    pentagon:      [{ key:'radius', label:'Size', min:5, max:250, step:1 }],
    hexagon:       [{ key:'radius', label:'Size', min:5, max:250, step:1 }],
    diamond:       [{ key:'radius', label:'Size', min:5, max:250, step:1 }],
    'star-4':      [{ key:'outerRadius', label:'Outer R', min:10, max:250, step:1 },
                    { key:'innerRatio',  label:'Inner %', min:0.1, max:0.9, step:0.05 }],
    'star-5':      [{ key:'outerRadius', label:'Outer R', min:10, max:250, step:1 },
                    { key:'innerRatio',  label:'Inner %', min:0.1, max:0.9, step:0.05 }],
    'star-6':      [{ key:'outerRadius', label:'Outer R', min:10, max:250, step:1 },
                    { key:'innerRatio',  label:'Inner %', min:0.1, max:0.9, step:0.05 }],
    ring:          [{ key:'radius',      label:'Radius', min:5, max:250, step:1 },
                    { key:'strokeWidth', label:'Thickness', min:1, max:50, step:1 }],
    cross:         [{ key:'width',     label:'Width',     min:10, max:400, step:1 },
                    { key:'height',    label:'Height',    min:10, max:400, step:1 },
                    { key:'thickness', label:'Thickness', min:2, max:100, step:1 }],
    arc:           [{ key:'radius',     label:'Radius',  min:5, max:250, step:1 },
                    { key:'startAngle', label:'Start°',  min:0, max:360, step:1 },
                    { key:'endAngle',   label:'End°',    min:0, max:360, step:1 },
                    { key:'strokeWidth',label:'Thick',   min:1, max:50, step:1 }],
    line:          [{ key:'length',     label:'Length',  min:5, max:500, step:1 },
                    { key:'angle',      label:'Angle°',  min:0, max:360, step:1 },
                    { key:'strokeWidth',label:'Thick',   min:1, max:20, step:1 }],
};

// ── Colour roles ────────────────────────────────────────────────
const COLOR_ROLES = ['primary', 'secondary', 'tertiary'];

// ── Quick palettes (curated 3-colour combos from DB32) ──────────
const QUICK_PALETTES = [
    { name: 'Sunset',  colors: ['#df7126','#d95763','#fbf236'] },
    { name: 'Forest',  colors: ['#37946e','#6abe30','#4b692f'] },
    { name: 'Ocean',   colors: ['#306082','#639bff','#5fcde4'] },
    { name: 'Royal',   colors: ['#76428a','#5b6ee1','#cbdbfc'] },
    { name: 'Earth',   colors: ['#8f563b','#d9a066','#eec39a'] },
    { name: 'Neon',    colors: ['#99e550','#5fcde4','#d77bba'] },
    { name: 'Mono',    colors: ['#222034','#696a6a','#cbdbfc'] },
    { name: 'Candy',   colors: ['#d95763','#d77bba','#fbf236'] },
];

export class ImageBridge extends BaseBridge {
    constructor(sceneContainer, panelEl, options = {}) {
        super(sceneContainer, panelEl, options);
        this.displayName = '2D Image';
        this.storeName   = 'images';

        const payload = this.asset?.payload || {};
        const d  = payload.state || this.asset?.state || {};
        const ed = payload._editor || this.asset?._editor || {};
        const colorAssignments = d.colorAssignments || ed.color_assignments || payload.color_assignments || {};

        this._state = {
            elements:         structuredClone(d.elements || ed.elements || []),
            colorAssignments: { primary: '#888888', ...colorAssignments },
            backgroundColor:  d.backgroundColor || payload.background_color || null,
            framePreset:      d.framePreset || payload.framePreset || '1:1',
            anchorPoint:      d.anchorPoint || payload.anchorPoint || { x: 256, y: 256 },
        };

        // UI state
        this._activeTab        = 'file';
        this._selectedIdx      = -1;
        this._palette          = null;
        this._activeColorTarget = null;
        this._plane            = null;
        this._canvasTexture    = null;

        // Template browsing
        this._showTemplatePicker   = false;
        this._templates            = null;
        this._templateCategories   = null;
    }

    async init() {
        this._palette = await loadPalette();
        await super.init();
    }

    // ═══════════════════════════════════════════════════════════════
    //  SCENE
    // ═══════════════════════════════════════════════════════════════

    _buildScene() {
        this._camera.position.set(0, 0, 3);
        this._camera.lookAt(0, 0, 0);
        this._camera.fov = 45;
        this._camera.updateProjectionMatrix();

        // Brighter ambient for 2D viewing
        this._scene.traverse(obj => {
            if (obj.isAmbientLight)     obj.intensity = 1.2;
            if (obj.isDirectionalLight) obj.intensity = 0.4;
        });

        this._renderCanvasPlane();
    }

    /** Re-render the 2D canvas and update the plane texture. */
    _renderCanvasPlane() {
        // Dispose old
        if (this._plane) {
            this._scene.remove(this._plane);
            if (this._plane.geometry) this._plane.geometry.dispose();
            if (this._plane.material) this._plane.material.dispose();
        }
        if (this._canvasTexture) {
            this._canvasTexture.dispose();
            this._canvasTexture = null;
        }

        // Remove old border
        this._scene.traverse(obj => {
            if (obj.userData?.role === 'border') this._scene.remove(obj);
        });

        const els = this._state.elements;
        const frame = FRAME_PRESETS.find(f => f.id === this._state.framePreset) || FRAME_PRESETS[0];

        if (els.length > 0) {
            const syntheticAsset = {
                payload: {
                    ...this.asset?.payload,
                    _editor: {
                        elements: els,
                        color_assignments: { ...this._state.colorAssignments },
                    },
                    color_assignments: { ...this._state.colorAssignments },
                    background_color: this._state.backgroundColor,
                },
            };

            const canvas = renderImage(syntheticAsset, { width: frame.w, height: frame.h });
            this._canvasTexture = new THREE.CanvasTexture(canvas);
            this._canvasTexture.colorSpace = THREE.SRGBColorSpace;

            const material = new THREE.MeshBasicMaterial({
                map: this._canvasTexture,
                transparent: !this._state.backgroundColor,
                side: THREE.DoubleSide,
            });

            // Scale plane to aspect ratio
            const aspect = frame.w / frame.h;
            const pw = aspect >= 1 ? 2 : 2 * aspect;
            const ph = aspect >= 1 ? 2 / aspect : 2;

            this._plane = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), material);
        } else {
            // Placeholder
            const aspect = frame.w / frame.h;
            const pw = aspect >= 1 ? 2 : 2 * aspect;
            const ph = aspect >= 1 ? 2 / aspect : 2;

            this._plane = new THREE.Mesh(
                new THREE.PlaneGeometry(pw, ph),
                new THREE.MeshBasicMaterial({ color: 0x444444, side: THREE.DoubleSide }),
            );
        }

        this._plane.userData.role = 'imagePlane';
        this._scene.add(this._plane);

        // Border
        const aspect = frame.w / frame.h;
        const bw = aspect >= 1 ? 1 : aspect;
        const bh = aspect >= 1 ? 1 / aspect : 1;
        const border = new THREE.LineLoop(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(-bw, -bh, 0.01),
                new THREE.Vector3( bw, -bh, 0.01),
                new THREE.Vector3( bw,  bh, 0.01),
                new THREE.Vector3(-bw,  bh, 0.01),
            ]),
            new THREE.LineBasicMaterial({
                color: parseInt(UI.accent.slice(1), 16),
                transparent: true, opacity: 0.3,
            }),
        );
        border.userData.role = 'border';
        this._scene.add(border);
    }

    // ═══════════════════════════════════════════════════════════════
    //  PANEL
    // ═══════════════════════════════════════════════════════════════

    _renderPanelBody() {
        const tab = this._activeTab;

        const tabBar = `<div class="cb-tabs-list">${
            TABS.map(t =>
                `<button class="cb-tab-trigger ${t.id === tab ? 'active' : ''}" data-tab="${t.id}">
                    <span class="cb-tab-icon">${t.icon}</span>${t.label}
                 </button>`
            ).join('')
        }</div>`;

        let body = '';
        if (tab === 'file')    body = this._renderFileTab();
        if (tab === 'frame')   body = this._renderFrameTab();
        if (tab === 'shapes')  body = this._renderShapesTab();
        if (tab === 'colours') body = this._renderColoursTab();

        return tabBar + `<div class="cb-tab-content">${body}</div>`;
    }

    // ── File Tab ────────────────────────────────────────────────
    _renderFileTab() {
        const name = _esc(this.asset?.name || '');
        const desc = _esc(this.asset?.payload?.description || '');
        const tags = _esc((this.asset?.tags || []).join(', '));
        return `
          <div class="cb-section">
            <div class="cb-label">Name</div>
            <input type="text" class="bridge-name-input cb-name-input"
                   value="${name}" placeholder="Image name..." maxlength="40">
            <div class="cb-char-count">${(this.asset?.name || '').length}/40</div>
          </div>
          <div class="cb-section">
            <div class="cb-label">Description</div>
            <textarea class="cb-desc-input" placeholder="What is this asset?"
                      rows="3" maxlength="200">${desc}</textarea>
            <div class="cb-char-count">${(this.asset?.payload?.description || '').length}/200</div>
          </div>
          <div class="cb-section">
            <div class="cb-label">Tags</div>
            <input type="text" class="cb-tags-input"
                   value="${tags}" placeholder="e.g. sky, cloud, nature" maxlength="100">
          </div>
          <div class="cb-section">
            <button class="cb-btn-sm cb-img-browse-btn">Browse Templates</button>
            ${this._renderTemplatePicker()}
          </div>`;
    }

    _renderTemplatePicker() {
        if (!this._showTemplatePicker || !this._templateCategories) return '';
        const cats = this._templateCategories.map(cat => {
            const thumbs = cat.items.map(item => {
                const pc = item.payload?.color_assignments?.primary || '#888';
                return `<button class="cb-item-thumb cb-img-thumb" data-id="${_esc(item.id)}" title="${_esc(item.name)}">
                    <div class="cb-item-thumb-icon" style="background:${_esc(pc)};border-radius:50%"></div>
                    <div class="cb-item-thumb-name">${_esc(item.name)}</div>
                </button>`;
            }).join('');
            return `<div class="cb-item-cat-title">${_esc(cat.name)}</div>
                    <div class="cb-item-grid">${thumbs}</div>`;
        }).join('');

        return `<div class="cb-item-picker cb-img-picker">
            <div class="cb-item-picker-header">
                <span>Choose Image</span>
                <button class="cb-item-picker-close">✕</button>
            </div>
            ${cats}
        </div>`;
    }

    // ── Frame Tab ───────────────────────────────────────────────
    _renderFrameTab() {
        const s = this._state;

        const presetBtns = FRAME_PRESETS.map(f =>
            `<button class="cb-shape-btn cb-frame-btn ${s.framePreset === f.id ? 'active' : ''}"
                     data-frame="${f.id}">${f.label}</button>`
        ).join('');

        const bgChecked = s.backgroundColor ? 'checked' : '';
        const bgColor   = s.backgroundColor || '#1a1a2e';

        return `
          <div class="cb-section">
            <div class="cb-section-title">Aspect Ratio</div>
            <div class="cb-shape-grid" style="grid-template-columns:repeat(3,1fr);">${presetBtns}</div>
          </div>
          <div class="cb-section">
            <div class="cb-section-title">Background</div>
            <div class="cb-color-row">
              <label class="cb-color-label">Show Background:</label>
              <label style="display:flex;align-items:center;gap:6px;">
                <input type="checkbox" class="cb-bg-toggle" ${bgChecked}>
                <input type="color" class="cb-color cb-bg-color" value="${_esc(bgColor)}"
                       ${s.backgroundColor ? '' : 'disabled'}>
              </label>
            </div>
            <div class="cb-hint">Unchecked = transparent background</div>
          </div>
          <div class="cb-section">
            <div class="cb-section-title">Anchor Point</div>
            <div class="cb-hint">The origin point for positioning in scenes</div>
            <div style="display:flex;gap:8px;margin-top:6px;">
              ${_numInput('anchor-x', 'X', s.anchorPoint.x, 0, 512, 1)}
              ${_numInput('anchor-y', 'Y', s.anchorPoint.y, 0, 512, 1)}
            </div>
            <button class="cb-btn-sm cb-anchor-center" style="margin-top:6px;">Center</button>
          </div>`;
    }

    // ── Shapes Tab ──────────────────────────────────────────────
    _renderShapesTab() {
        const els = this._state.elements;

        const gridHtml = PRIM_2D.map(p =>
            `<button class="cb-shape-btn cb-prim-add" data-prim="${p.id}" title="${p.label}">
                <span style="font-size:16px;">${p.icon}</span><br>
                <span style="font-size:9px;">${p.label}</span>
             </button>`
        ).join('');

        let listHtml = '';
        if (els.length === 0) {
            listHtml = '<div class="cb-hint">Click a shape above to add it</div>';
        } else {
            listHtml = els.map((el, i) => {
                const prim = el.primitiveId || el.primitive || 'rect';
                const sel  = i === this._selectedIdx;
                const icon = PRIM_2D.find(p => p.id === prim)?.icon || '?';
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
            <div class="cb-section-title">Add Shape</div>
            <div class="cb-shape-grid">${gridHtml}</div>
          </div>
          <div class="cb-section">
            <div class="cb-section-title">Elements (${els.length})</div>
            ${listHtml}
          </div>
          ${propsHtml}`;
    }

    _renderElementProps(el, idx) {
        const p    = el.params || {};
        const prim = el.primitiveId || el.primitive || 'rect';
        const defs = SHAPE_2D_PARAMS[prim] || [];

        // Position
        const posHtml = `
            <div class="cb-section-title">Position</div>
            <div style="display:flex;gap:8px;">
              ${_numInput('el-cx', 'X', p.cx || 256, 0, 512, 1)}
              ${_numInput('el-cy', 'Y', p.cy || 256, 0, 512, 1)}
            </div>`;

        // Shape params
        let shapeHtml = '';
        if (defs.length > 0) {
            shapeHtml = `<div class="cb-section-title" style="margin-top:8px;">Shape Parameters</div>` +
                defs.map(d => {
                    const val = p[d.key] ?? DEFAULT_2D[prim]?.[d.key] ?? 50;
                    return `<div class="cb-color-row">
                        <label class="cb-color-label">${d.label}:</label>
                        <input type="number" class="cb-input cb-shape-param" data-key="${d.key}"
                               value="${val}" min="${d.min}" max="${d.max}" step="${d.step}">
                    </div>`;
                }).join('');
        }

        // Fill
        const fillHtml = `
            <div class="cb-section-title" style="margin-top:8px;">Fill</div>
            <div class="cb-color-row">
              <label class="cb-color-label">Colour Role:</label>
              <select class="cb-acc-select cb-el-fill">
                ${COLOR_ROLES.map(r => `<option value="${r}" ${(p.fill || 'primary') === r ? 'selected' : ''}>${_capitalize(r)}</option>`).join('')}
                <option value="custom" ${(p.fill && p.fill.startsWith('#')) ? 'selected' : ''}>Custom</option>
              </select>
            </div>`;

        // Opacity
        const opacityHtml = `
            <div class="cb-color-row" style="margin-top:6px;">
              <label class="cb-color-label">Opacity:</label>
              <input type="range" class="cb-range cb-el-opacity" value="${p.opacity ?? 1}" min="0" max="1" step="0.05" style="flex:1;">
            </div>`;

        // Layer / Delete
        const layerHtml = `
            <div style="display:flex;gap:8px;margin-top:10px;">
              <button class="cb-btn-sm cb-el-up" data-idx="${idx}" ${idx === 0 ? 'disabled' : ''}>↑ Front</button>
              <button class="cb-btn-sm cb-el-down" data-idx="${idx}" ${idx >= this._state.elements.length - 1 ? 'disabled' : ''}>↓ Back</button>
              <button class="cb-btn-sm cb-el-delete" data-idx="${idx}" style="margin-left:auto;color:${UI.danger};">Delete</button>
            </div>`;

        const primLabel = PRIM_2D.find(pp => pp.id === prim)?.icon || '';

        return `<div class="cb-section cb-props-section">
            <div class="cb-section-title" style="display:flex;justify-content:space-between;">
                <span>${primLabel} ${_capitalize(prim)} ${idx + 1}</span>
                <button class="cb-btn-sm cb-el-deselect">✕</button>
            </div>
            ${posHtml}
            ${shapeHtml}
            ${fillHtml}
            ${opacityHtml}
            ${layerHtml}
        </div>`;
    }

    // ── Colours Tab ─────────────────────────────────────────────
    _renderColoursTab() {
        const s   = this._state;
        const pal = paletteGridHtml(this._palette);

        const rolesHtml = COLOR_ROLES.map(role => {
            const color = s.colorAssignments[role] || '#888888';
            return `<div class="cb-color-row">
                <label class="cb-color-label">${_capitalize(role)}:</label>
                <div class="cb-color-swatch" data-property="${role}" style="background:${color};"></div>
            </div>`;
        }).join('');

        // Quick palettes
        const quickHtml = QUICK_PALETTES.map(qp =>
            `<button class="cb-element-row cb-quick-palette" data-colors='${JSON.stringify(qp.colors)}'>
                <span style="display:flex;gap:3px;">
                    ${qp.colors.map(c => `<span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:${c};"></span>`).join('')}
                </span>
                <span style="flex:1;text-align:left;margin-left:8px;">${qp.name}</span>
            </button>`
        ).join('');

        return `
          <div class="cb-section">
            <div class="cb-section-title">Colour Roles</div>
            ${rolesHtml}
            <div class="cb-palette-grid" style="display:none;">${pal}</div>
          </div>
          <div class="cb-section">
            <div class="cb-section-title">Quick Palettes</div>
            ${quickHtml}
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

        // Tab switching
        panel.querySelectorAll('.cb-tab-trigger').forEach(btn => {
            btn.addEventListener('click', () => {
                this._activeTab = btn.dataset.tab;
                this._renderPanel();
            });
        });

        // ── File tab ──
        panel.querySelector('.cb-desc-input')?.addEventListener('input', e => {
            if (this.asset?.payload) this.asset.payload.description = e.target.value;
            // Update char count
            const counter = panel.querySelector('.cb-desc-input')?.parentElement?.querySelector('.cb-char-count');
            if (counter) counter.textContent = `${e.target.value.length}/200`;
        });
        panel.querySelector('.cb-tags-input')?.addEventListener('input', e => {
            if (this.asset) this.asset.tags = e.target.value.split(',').map(t => t.trim()).filter(Boolean);
        });

        // Template browsing
        panel.querySelector('.cb-img-browse-btn')?.addEventListener('click', () => this._browseTemplates());
        panel.querySelector('.cb-item-picker-close')?.addEventListener('click', () => {
            this._showTemplatePicker = false;
            this._renderPanel();
        });
        panel.querySelectorAll('.cb-img-thumb').forEach(btn => {
            btn.addEventListener('click', () => this._selectTemplate(btn.dataset.id));
        });

        // ── Frame tab ──
        panel.querySelectorAll('.cb-frame-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this._state.framePreset = btn.dataset.frame;
                this._renderCanvasPlane();
                this.markDirty('Change frame');
                this._renderPanel();
            });
        });

        // Background toggle + color
        const bgToggle = panel.querySelector('.cb-bg-toggle');
        const bgColor  = panel.querySelector('.cb-bg-color');
        if (bgToggle) {
            bgToggle.addEventListener('change', () => {
                this._state.backgroundColor = bgToggle.checked ? (bgColor?.value || '#1a1a2e') : null;
                if (bgColor) bgColor.disabled = !bgToggle.checked;
                this._renderCanvasPlane();
                this.markDirty('Toggle background');
            });
        }
        if (bgColor) {
            const handler = () => {
                if (bgToggle?.checked) {
                    this._state.backgroundColor = bgColor.value;
                    this._renderCanvasPlane();
                    this.markDirty('Change background');
                }
            };
            bgColor.addEventListener('input', handler);
            bgColor.addEventListener('change', handler);
        }

        // Anchor point
        for (const axis of ['x', 'y']) {
            const inp = panel.querySelector(`.cb-num[data-key="anchor-${axis}"]`);
            if (inp) inp.addEventListener('change', () => {
                this._state.anchorPoint[axis] = parseFloat(inp.value) || 0;
                this.markDirty('Move anchor');
            });
        }
        panel.querySelector('.cb-anchor-center')?.addEventListener('click', () => {
            const frame = FRAME_PRESETS.find(f => f.id === this._state.framePreset) || FRAME_PRESETS[0];
            this._state.anchorPoint = { x: frame.w / 2, y: frame.h / 2 };
            this.markDirty('Center anchor');
            this._renderPanel();
        });

        // ── Shapes tab ──
        // Add primitive
        panel.querySelectorAll('.cb-prim-add').forEach(btn => {
            btn.addEventListener('click', () => {
                const primId = btn.dataset.prim;
                const defaults = DEFAULT_2D[primId] || { cx: 256, cy: 256 };
                const newEl = {
                    primitiveId: primId,
                    params: { ...defaults, fill: 'primary', opacity: 1 },
                    zIndex: this._state.elements.length,
                };
                this._state.elements.push(newEl);
                this._selectedIdx = this._state.elements.length - 1;
                this._renderCanvasPlane();
                this.markDirty(`Add ${primId}`);
                this._renderPanel();
            });
        });

        // Select element
        panel.querySelectorAll('.cb-el-select').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx);
                this._selectedIdx = (this._selectedIdx === idx) ? -1 : idx;
                this._renderPanel();
            });
        });

        // Deselect
        panel.querySelector('.cb-el-deselect')?.addEventListener('click', () => {
            this._selectedIdx = -1;
            this._renderPanel();
        });

        // Element position
        for (const key of ['el-cx', 'el-cy']) {
            const inp = panel.querySelector(`.cb-num[data-key="${key}"]`);
            if (inp) inp.addEventListener('change', () => {
                if (this._selectedIdx < 0) return;
                const paramKey = key.replace('el-', '');
                this._state.elements[this._selectedIdx].params[paramKey] = parseFloat(inp.value) || 0;
                this._renderCanvasPlane();
                this.markDirty('Move shape');
            });
        }

        // Shape params
        panel.querySelectorAll('.cb-shape-param').forEach(inp => {
            inp.addEventListener('change', () => {
                if (this._selectedIdx < 0) return;
                this._state.elements[this._selectedIdx].params[inp.dataset.key] = parseFloat(inp.value);
                this._renderCanvasPlane();
                this.markDirty(`Change ${inp.dataset.key}`);
            });
        });

        // Fill role
        panel.querySelector('.cb-el-fill')?.addEventListener('change', e => {
            if (this._selectedIdx < 0) return;
            this._state.elements[this._selectedIdx].params.fill = e.target.value;
            this._renderCanvasPlane();
            this.markDirty('Change fill');
        });

        // Opacity
        panel.querySelector('.cb-el-opacity')?.addEventListener('input', e => {
            if (this._selectedIdx < 0) return;
            this._state.elements[this._selectedIdx].params.opacity = parseFloat(e.target.value);
            this._renderCanvasPlane();
        });
        panel.querySelector('.cb-el-opacity')?.addEventListener('change', () => this.markDirty('Change opacity'));

        // Layer up/down
        panel.querySelectorAll('.cb-el-up').forEach(btn => {
            btn.addEventListener('click', () => {
                const i = parseInt(btn.dataset.idx);
                if (i <= 0) return;
                [this._state.elements[i - 1], this._state.elements[i]] =
                    [this._state.elements[i], this._state.elements[i - 1]];
                this._selectedIdx = i - 1;
                this._renderCanvasPlane();
                this.markDirty('Move shape forward');
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
                this._renderCanvasPlane();
                this.markDirty('Move shape backward');
                this._renderPanel();
            });
        });

        // Delete element
        panel.querySelectorAll('.cb-el-delete').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!confirm('Delete this shape?')) return;
                this._state.elements.splice(parseInt(btn.dataset.idx), 1);
                this._selectedIdx = -1;
                this._renderCanvasPlane();
                this.markDirty('Delete shape');
                this._renderPanel();
            });
        });

        // ── Colours tab ──
        // Swatch toggle
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

        // Palette swatch click
        panel.querySelectorAll('.cb-pal-swatch').forEach(sw => {
            sw.addEventListener('click', () => {
                if (!this._activeColorTarget) return;
                const hex = sw.dataset.hex;
                this._state.colorAssignments[this._activeColorTarget] = hex;
                const el = panel.querySelector(`.cb-color-swatch[data-property="${this._activeColorTarget}"]`);
                if (el) el.style.background = hex;
                this._renderCanvasPlane();
                this.markDirty('Change colour');
            });
        });

        // Quick palettes
        panel.querySelectorAll('.cb-quick-palette').forEach(btn => {
            btn.addEventListener('click', () => {
                const colors = JSON.parse(btn.dataset.colors);
                COLOR_ROLES.forEach((role, i) => {
                    if (colors[i]) this._state.colorAssignments[role] = colors[i];
                });
                this._renderCanvasPlane();
                this.markDirty('Apply palette');
                this._renderPanel();
            });
        });

        // Randomize
        panel.querySelector('.cb-randomize-colors')?.addEventListener('click', () => {
            if (!this._palette || this._palette.length === 0) return;
            for (const role of COLOR_ROLES) {
                const rand = this._palette[Math.floor(Math.random() * this._palette.length)];
                this._state.colorAssignments[role] = rand.hex;
            }
            this._renderCanvasPlane();
            this.markDirty('Randomize colours');
            this._renderPanel();
        });
    }

    // ═══════════════════════════════════════════════════════════════
    //  TEMPLATE BROWSING
    // ═══════════════════════════════════════════════════════════════

    async _browseTemplates() {
        if (!this._templates) await this._loadTemplates();
        this._showTemplatePicker = true;
        this._renderPanel();
    }

    async _loadTemplates() {
        try {
            const res = await fetch(EMOJI_MANIFEST_URL);
            if (!res.ok) return;
            const manifest = await res.json();
            const batches  = manifest.batches || [];

            const categories = [];
            for (const batch of batches) {
                const items = [];
                for (const file of (batch.files || [])) {
                    try {
                        const r = await fetch(`global_assets/images/emojis/${file}`);
                        if (r.ok) items.push(await r.json());
                    } catch { /* skip */ }
                }
                if (items.length > 0) categories.push({ name: batch.name, items });
            }

            this._templateCategories = categories;
            this._templates = categories.flatMap(c => c.items);
        } catch (e) {
            console.warn('Failed to load image templates:', e);
            this._templates = [];
            this._templateCategories = [];
        }
    }

    _selectTemplate(id) {
        if (!this._templates) return;
        const tmpl = this._templates.find(t => t.id === id);
        if (!tmpl) return;

        if (this.asset) {
            this.asset.name = tmpl.name;
            this.asset.tags = [...(tmpl.tags || [])];
            this.asset.payload = structuredClone(tmpl.payload);
        }

        const ed = tmpl.payload?._editor || {};
        const ca = ed.color_assignments || tmpl.payload?.color_assignments || {};
        this._state.elements         = structuredClone(ed.elements || []);
        this._state.colorAssignments = { primary: '#888888', ...ca };
        this._state.backgroundColor  = tmpl.payload?.background_color || null;

        this._showTemplatePicker = false;
        this._selectedIdx = -1;
        this._renderCanvasPlane();
        this._renderPanel();
        this.markDirty('Select template');
    }

    // ═══════════════════════════════════════════════════════════════
    //  STATE
    // ═══════════════════════════════════════════════════════════════

    _getState() {
        return {
            elements:         structuredClone(this._state.elements),
            colorAssignments: { ...this._state.colorAssignments },
            backgroundColor:  this._state.backgroundColor,
            framePreset:      this._state.framePreset,
            anchorPoint:      { ...this._state.anchorPoint },
        };
    }

    _applyState(state) {
        this._state = {
            elements:         structuredClone(state.elements || []),
            colorAssignments: { ...state.colorAssignments },
            backgroundColor:  state.backgroundColor,
            framePreset:      state.framePreset || '1:1',
            anchorPoint:      { ...(state.anchorPoint || { x: 256, y: 256 }) },
        };
        this._selectedIdx = -1;
        this._renderCanvasPlane();
    }

    destroy() {
        if (this._canvasTexture) {
            this._canvasTexture.dispose();
            this._canvasTexture = null;
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
