/**
 * ImageBridge.js — 2D image asset editor bridge.
 *
 * Renders 2D image assets (emojis, sprites, textures) using Canvas2D
 * as a THREE texture mapped to a plane. Supports browsing global image
 * templates and editing color roles.
 */

import { BaseBridge } from './BaseBridge.js';
import * as THREE from 'three';
import { UI }       from '../shared/palette.js';
import { renderImage } from '../shared/imageRenderer.js';

const EMOJI_MANIFEST_URL = 'global_assets/images/emojis/manifest.json';

export class ImageBridge extends BaseBridge {
    constructor(sceneContainer, panelEl, options = {}) {
        super(sceneContainer, panelEl, options);
        this.displayName = '2D Image';
        this.storeName   = 'images';

        const payload = this.asset?.payload || {};
        const ed = payload._editor || this.asset?._editor || {};
        const colorAssignments = ed.color_assignments || payload.color_assignments || {};

        this._state = {
            colorAssignments: { ...colorAssignments },
            backgroundColor: payload.background_color || null,
            _hasEditor: !!(ed.elements?.length),
        };

        this._plane = null;
        this._canvasTexture = null;
        this._showTemplatePicker = false;
        this._templates = null;       // loaded emoji templates
        this._templateCategories = null;
    }

    _buildScene() {
        // Flat 2D camera setup — orthographic-like perspective
        this._camera.position.set(0, 0, 3);
        this._camera.lookAt(0, 0, 0);
        this._camera.fov = 45;
        this._camera.updateProjectionMatrix();

        // Brighter ambient for 2D viewing
        this._scene.traverse(obj => {
            if (obj.isAmbientLight) obj.intensity = 1.2;
            if (obj.isDirectionalLight) obj.intensity = 0.4;
        });

        this._renderCanvasPlane();
    }

    /** Render the 2D asset as a textured plane. */
    _renderCanvasPlane() {
        // Dispose old
        if (this._plane) {
            this._scene.remove(this._plane);
            if (this._plane.geometry) this._plane.geometry.dispose();
            if (this._plane.material) this._plane.material.dispose();
            if (this._canvasTexture) this._canvasTexture.dispose();
        }

        const ed = this.asset?.payload?._editor || this.asset?._editor || {};
        const elements = ed.elements || [];

        if (elements.length > 0) {
            // Build a synthetic asset with current color overrides
            const syntheticAsset = {
                payload: {
                    ...this.asset?.payload,
                    _editor: {
                        ...ed,
                        color_assignments: { ...this._state.colorAssignments },
                    },
                    color_assignments: { ...this._state.colorAssignments },
                    background_color: this._state.backgroundColor,
                },
            };

            const canvas = renderImage(syntheticAsset, { width: 512, height: 512 });
            this._canvasTexture = new THREE.CanvasTexture(canvas);
            this._canvasTexture.colorSpace = THREE.SRGBColorSpace;

            const material = new THREE.MeshBasicMaterial({
                map: this._canvasTexture,
                transparent: !this._state.backgroundColor,
                side: THREE.DoubleSide,
            });

            this._plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        } else {
            // Fallback: gray placeholder
            this._plane = new THREE.Mesh(
                new THREE.PlaneGeometry(2, 2),
                new THREE.MeshBasicMaterial({ color: 0x444444, side: THREE.DoubleSide }),
            );
        }

        this._plane.userData.role = 'imagePlane';
        this._scene.add(this._plane);

        // Subtle border outline
        const border = new THREE.LineLoop(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(-1, -1, 0.01),
                new THREE.Vector3( 1, -1, 0.01),
                new THREE.Vector3( 1,  1, 0.01),
                new THREE.Vector3(-1,  1, 0.01),
            ]),
            new THREE.LineBasicMaterial({
                color: parseInt(UI.accent.slice(1), 16),
                transparent: true, opacity: 0.3,
            }),
        );
        border.userData.role = 'border';
        this._scene.add(border);
    }

    _renderPanelBody() {
        const name = _esc(this.asset?.name || '');
        const desc = _esc(this.asset?.payload?.description || '');
        const s = this._state;

        // Color roles
        let colorRolesHtml = '';
        if (s._hasEditor && Object.keys(s.colorAssignments).length > 0) {
            colorRolesHtml = Object.entries(s.colorAssignments).map(([role, color]) => `
                <div class="cb-color-row">
                  <label class="cb-color-label">${_esc(_capitalize(role))}:</label>
                  <input type="color" class="cb-color cb-role-color" data-role="${_esc(role)}" value="${_esc(color)}">
                </div>
            `).join('');
        }

        // Background color toggle
        const bgColor = s.backgroundColor || '#1a1a2e';
        const bgChecked = s.backgroundColor ? 'checked' : '';
        const bgHtml = `
            <div class="cb-color-row">
              <label class="cb-color-label">Background:</label>
              <label style="display:flex;align-items:center;gap:6px;">
                <input type="checkbox" class="cb-bg-toggle" ${bgChecked}>
                <input type="color" class="cb-color cb-bg-color" value="${_esc(bgColor)}"
                       ${s.backgroundColor ? '' : 'disabled'}>
              </label>
            </div>
        `;

        // Template picker HTML (if open)
        let pickerHtml = '';
        if (this._showTemplatePicker && this._templateCategories) {
            const cats = this._templateCategories.map(cat => {
                const thumbs = cat.items.map(item => {
                    const primaryColor = item.payload?.color_assignments?.primary || '#888';
                    return `<button class="cb-item-thumb cb-img-thumb" data-id="${_esc(item.id)}" title="${_esc(item.name)}">
                        <div class="cb-item-thumb-icon" style="background:${_esc(primaryColor)};border-radius:50%"></div>
                        <div class="cb-item-thumb-name">${_esc(item.name)}</div>
                    </button>`;
                }).join('');
                return `<div class="cb-item-cat-title">${_esc(cat.name)}</div>
                        <div class="cb-item-grid">${thumbs}</div>`;
            }).join('');

            pickerHtml = `
                <div class="cb-item-picker cb-img-picker">
                    <div class="cb-item-picker-header">
                        <span>Choose Image</span>
                        <button class="cb-item-picker-close">✕</button>
                    </div>
                    ${cats}
                </div>`;
        }

        return `
          <div class="cb-section">
            <input type="text" class="bridge-name-input cb-name-input"
                   value="${name}" placeholder="Image name...">
          </div>
          <div class="cb-section">
            <textarea class="cb-desc-input" placeholder="Describe this image..."
                      rows="2" maxlength="200">${desc}</textarea>
          </div>
          ${colorRolesHtml ? `
          <div class="cb-section">
            <div class="cb-section-title">Colors</div>
            ${colorRolesHtml}
            ${bgHtml}
          </div>` : `
          <div class="cb-section">
            <div class="cb-section-title">Appearance</div>
            ${bgHtml}
          </div>`}
          <div class="cb-section">
            <button class="cb-item-browse-btn cb-img-browse-btn">Browse Templates</button>
            ${pickerHtml}
          </div>`;
    }

    _wirePanelEvents() {
        const panel = this.panelEl;

        // Color role inputs
        panel.querySelectorAll('.cb-role-color').forEach(inp => {
            const handler = () => {
                this._state.colorAssignments[inp.dataset.role] = inp.value;
                this._renderCanvasPlane();
                this.markDirty('Change color');
            };
            inp.addEventListener('input', handler);
            inp.addEventListener('change', handler);
        });

        // Background color toggle + picker
        const bgToggle = panel.querySelector('.cb-bg-toggle');
        const bgColor  = panel.querySelector('.cb-bg-color');
        if (bgToggle) {
            bgToggle.addEventListener('change', () => {
                if (bgToggle.checked) {
                    this._state.backgroundColor = bgColor?.value || '#1a1a2e';
                    if (bgColor) bgColor.disabled = false;
                } else {
                    this._state.backgroundColor = null;
                    if (bgColor) bgColor.disabled = true;
                }
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

        // Description
        panel.querySelector('.cb-desc-input')?.addEventListener('input', (e) => {
            if (this.asset?.payload) {
                this.asset.payload.description = e.target.value;
                this.markDirty('Edit description');
            }
        });

        // Browse templates button
        panel.querySelector('.cb-img-browse-btn')?.addEventListener('click', () => {
            this._browseTemplates();
        });

        // Template picker close
        panel.querySelector('.cb-item-picker-close')?.addEventListener('click', () => {
            this._showTemplatePicker = false;
            this._renderPanel();
        });

        // Template thumbnail clicks
        panel.querySelectorAll('.cb-img-thumb').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                this._selectTemplate(id);
            });
        });
    }

    /* ── Template Browsing ── */

    async _browseTemplates() {
        if (!this._templates) {
            await this._loadTemplates();
        }
        this._showTemplatePicker = true;
        this._renderPanel();
    }

    async _loadTemplates() {
        try {
            const res = await fetch(EMOJI_MANIFEST_URL);
            if (!res.ok) return;
            const manifest = await res.json();
            const batches = manifest.batches || [];

            const categories = [];
            for (const batch of batches) {
                const items = [];
                for (const file of (batch.files || [])) {
                    try {
                        const r = await fetch(`global_assets/images/emojis/${file}`);
                        if (r.ok) {
                            const asset = await r.json();
                            asset._category = batch.name;
                            items.push(asset);
                        }
                    } catch { /* skip */ }
                }
                if (items.length > 0) {
                    categories.push({ name: batch.name, items });
                }
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

        // Apply template data to the current asset
        if (this.asset) {
            this.asset.name = tmpl.name;
            this.asset.tags = [...(tmpl.tags || [])];
            this.asset.payload = structuredClone(tmpl.payload);
        }

        // Update state from the new template
        const ed = tmpl.payload?._editor || {};
        const ca = ed.color_assignments || tmpl.payload?.color_assignments || {};
        this._state.colorAssignments = { ...ca };
        this._state._hasEditor = !!(ed.elements?.length);
        this._state.backgroundColor = tmpl.payload?.background_color || null;

        this._showTemplatePicker = false;
        this._renderCanvasPlane();
        this._renderPanel();
        this.markDirty('Select template');
    }

    /* ── State Management ── */

    _getState() {
        return {
            colorAssignments: { ...this._state.colorAssignments },
            backgroundColor:  this._state.backgroundColor,
            _hasEditor:       this._state._hasEditor,
        };
    }

    _applyState(state) {
        this._state = { ...state };
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

function _esc(t) { return String(t).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[m]); }
function _capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
