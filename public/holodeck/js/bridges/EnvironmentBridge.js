/**
 * EnvironmentBridge.js — Fresh minimal rebuild (April 2026).
 *
 * Rebuilt from scratch. Renders the canonical "Scene3D" look as the
 * blank-slate template:
 *   - Mid-grey backdrop (#5A5A5A)
 *   - 21×21 world grid
 *   - 5×5 stage perimeter (thick light-grey line) + inner grid lines
 *   - Ambient + single directional light (flat, even)
 *   - No placeholder cube — clean stage
 *
 * Panel is tab-based (File, Ground, Sky, Walls, Music). Only the File
 * tab is wired right now; other tabs are stubs we'll fill in together.
 *
 * See docs/environment-builder-notes.md for a running log of features
 * we may bring back from EnvironmentBridge.legacy.js.
 */

import * as THREE from 'three';
import { Line2 }        from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';

import { BaseBridge } from './BaseBridge.js?v=2';

// ── Tabs ────────────────────────────────────────────────────────
const TABS = [
    { id: 'file',   label: 'File',   icon: '📄' },
    { id: 'ground', label: 'Ground', icon: '▭'  },
    { id: 'sky',    label: 'Sky',    icon: '☁️' },
    { id: 'walls',  label: 'Walls',  icon: '▮'  },
    { id: 'music',  label: 'Music',  icon: '🎵' },
];

// Small HTML escape helper
const _esc = (s = '') =>
    String(s).replace(/[&<>"']/g, m => (
        { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]
    ));

export class EnvironmentBridge extends BaseBridge {
    constructor(sceneContainer, panelEl, options = {}) {
        super(sceneContainer, panelEl, options);
        this.displayName = 'Environment';
        this.storeName   = 'environments';

        // Minimal editable state. Anything the legacy builder tracked
        // (groundColor, sky, walls, music, props, images) is intentionally
        // NOT here — we'll reintroduce fields one at a time as we flesh
        // out tabs.
        this._state = {
            // Reserved for future use. Empty for now.
        };

        this._activeTab = 'file';

        // Holders for scene elements we own (so we can dispose cleanly)
        this._perimMat    = null;
        this._lineObjs    = [];
        this._extraLights = [];
    }

    // ═══════════════════════════════════════════════════════════════
    //  SCENE — overrides BaseBridge's default scene
    // ═══════════════════════════════════════════════════════════════

    async _buildScene() {
        // BaseBridge already added a ground plane, 10×10 GridHelper,
        // cyan 1m reference square, and a three-point-ish light rig.
        // Strip those out so the bridge scene matches Scene3D exactly.
        this._stripBaseSceneDefaults();

        // Scene background — mid grey, matching Scene3D
        this._scene.background = new THREE.Color(0x5A5A5A);

        // Camera pose — matches Scene3D
        this._camera.position.set(5.2, 3.9, 5.2);
        this._camera.lookAt(0, 0, 0);

        // 21×21 world-unit grid (thin, low-opacity)
        const gridHelper = new THREE.GridHelper(21, 21, 0x2F2F2F, 0x2F2F2F);
        gridHelper.material.opacity     = 0.3;
        gridHelper.material.transparent = true;
        this._scene.add(gridHelper);
        this._lineObjs.push(gridHelper);

        // 5×5 stage perimeter (Line2 so the stroke stays a consistent
        // thickness regardless of zoom / pixel ratio)
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
        this._perimMat = perimMat;
        this._lineObjs.push(perimLine);

        // Inner grid lines inside the 5×5 stage
        const innerMat = new THREE.LineBasicMaterial({
            color: 0xB0B0B0, opacity: 0.4, transparent: true,
        });
        for (let i = -1.5; i <= 1.5; i += 1) {
            const vLine = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(i, 0.01, -2.5),
                    new THREE.Vector3(i, 0.01,  2.5),
                ]), innerMat
            );
            const hLine = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(-2.5, 0.01, i),
                    new THREE.Vector3( 2.5, 0.01, i),
                ]), innerMat
            );
            this._scene.add(vLine);
            this._scene.add(hLine);
            this._lineObjs.push(vLine, hLine);
        }

        // Flat lighting — Scene3D-style: ambient + one directional.
        // BaseBridge's key/fill/ambient rig was removed in the strip
        // step above, so we own lighting here.
        const amb = new THREE.AmbientLight(0xffffff, 0.6);
        this._scene.add(amb);
        this._extraLights.push(amb);

        const dir = new THREE.DirectionalLight(0xffffff, 0.8);
        dir.position.set(5, 10, 5);
        this._scene.add(dir);
        this._extraLights.push(dir);

        // Keep perimeter line resolution in sync with viewport
        this._ro?.disconnect(); // remove BaseBridge's observer
        this._ro = new ResizeObserver(() => {
            this._camera.aspect = c.clientWidth / c.clientHeight;
            this._camera.updateProjectionMatrix();
            this._renderer.setSize(c.clientWidth, c.clientHeight);
            this._perimMat?.resolution.set(c.clientWidth, c.clientHeight);
        });
        this._ro.observe(c);
    }

    /**
     * Remove the default scene contents BaseBridge added so we can
     * render the Scene3D look cleanly. BaseBridge adds: a PlaneGeometry
     * ground mesh, a GridHelper, a cyan Line (1m square), an AmbientLight,
     * and two DirectionalLights. We clear all of those.
     */
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

    // ═══════════════════════════════════════════════════════════════
    //  STATE
    // ═══════════════════════════════════════════════════════════════

    _getState() {
        // Pass through description + tags (BaseBridge auto-save reads these).
        // No scene-specific fields yet — we'll add them as we wire tabs.
        return {
            ...this._state,
            description: this.asset?.payload?.description || '',
            tags:        this.asset?.tags || [],
        };
    }

    _applyState(state) {
        // Nothing scene-affecting to restore yet.
        // Reserved for when we add ground/sky/walls/etc.
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
                    <span class="cb-tab-icon">${t.icon}</span>${t.label}
                 </button>`
            ).join('')
        }</div>`;

        let body = '';
        if (tab === 'file')   body = this._renderFileTab();
        if (tab === 'ground') body = this._renderStubTab('Ground');
        if (tab === 'sky')    body = this._renderStubTab('Sky');
        if (tab === 'walls')  body = this._renderStubTab('Walls');
        if (tab === 'music')  body = this._renderStubTab('Music');

        return tabBar + `<div class="cb-tab-content">${body}</div>`;
    }

    // ── File tab (wired) ────────────────────────────────────────
    _renderFileTab() {
        const name = _esc(this.asset?.name || '');
        const desc = _esc(this.asset?.payload?.description || '');
        const tags = _esc((this.asset?.tags || []).join(', '));
        return `
          <div class="cb-section">
            <div class="cb-label">Name</div>
            <input type="text" class="bridge-name-input cb-name-input"
                   value="${name}" placeholder="Environment name..." maxlength="40">
          </div>
          <div class="cb-section">
            <div class="cb-label">Description</div>
            <textarea class="cb-desc-input" placeholder="Describe this environment..."
                      rows="3" maxlength="200">${desc}</textarea>
          </div>
          <div class="cb-section">
            <div class="cb-label">Tags</div>
            <input type="text" class="cb-tags-input"
                   value="${tags}" placeholder="e.g. template, outdoor, warm" maxlength="100">
          </div>`;
    }

    // ── Stub tab (placeholder) ──────────────────────────────────
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

        // ── File tab inputs ─────────────────────────────────────
        // Name
        panel.querySelector('.bridge-name-input')?.addEventListener('input', (e) => {
            if (this.asset) this.asset.name = e.target.value.trim();
            this._scheduleAutoSave();
        });

        // Description
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

        // Tags
        panel.querySelector('.cb-tags-input')?.addEventListener('input', (e) => {
            if (!this.asset) return;
            const tags = e.target.value
                .split(',')
                .map(t => t.trim())
                .filter(Boolean);
            this.asset.tags = tags;
            this._scheduleAutoSave();
        });
    }
}
