import { BaseBridge } from './BaseBridge.js';
import * as THREE from 'three';
import { SCENE, UI }  from '../shared/palette.js';
import { standard }    from '../shared/materials.js';
import { renderProp }  from '../shared/propRenderer.js';
import { renderImage } from '../shared/imageRenderer.js';
import { ObjectBridge } from './ObjectBridge.js';
import { ImageBridge }  from './ImageBridge.js';
import { loadGlobalAssets } from '../assetLoader.js';
import { setRef, getRef, removeRef } from '../db.js';
import { MusicEngine } from '../shared/musicEngine.js';

export class EnvironmentBridge extends BaseBridge {
    constructor(sceneContainer, panelEl, options = {}) {
        super(sceneContainer, panelEl, options);
        this.displayName = 'Environment';
        this.storeName   = 'environments';

        const d = this.asset?.payload?.state || this.asset?.state || {};
        this._state = {
            groundColor:     d.groundColor     || '#4a6741',
            skyTopColor:     d.skyTopColor      || '#87ceeb',
            skyHorizonColor: d.skyHorizonColor  || '#e0f6ff',
            wallCount:       d.wallCount        ?? 0,
            musicId:         d.musicId          || '',
        };

        // Music state
        this._musicAssets = null;   // loaded lazily
        this._musicEngine = null;

        // Props state
        this._showPropPicker = false;
        this._propTemplates  = null;
        this._propBrowseOpen = false;
        this._propGroups     = [];  // THREE.Group instances for placed props

        // Images state
        this._showImagePicker = false;
        this._imageTemplates  = null;
        this._imageBrowseOpen = false;
        this._imageSprites    = [];  // THREE.Mesh instances for placed images
    }

    _buildScene() {
        this._camera.position.set(5.2, 3.9, 5.2);
        this._camera.lookAt(0, 0, 0);

        // Sky gradient background
        this._updateSky();

        // Green ground overlay (5×5 stage area)
        const envGround = new THREE.Mesh(
            new THREE.PlaneGeometry(5, 5),
            standard(new THREE.Color(this._state.groundColor)),
        );
        envGround.rotation.x = -Math.PI / 2;
        envGround.position.y = 0.002;
        envGround.receiveShadow = true;
        envGround.userData.role = 'envGround';
        this._scene.add(envGround);

        // Perimeter outline
        const pts = [[-2.5,0.01,-2.5],[2.5,0.01,-2.5],[2.5,0.01,2.5],[-2.5,0.01,2.5],[-2.5,0.01,-2.5]]
            .map(p => new THREE.Vector3(...p));
        const outline = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(pts),
            new THREE.LineBasicMaterial({ color: parseInt(UI.accent.slice(1), 16) }),
        );
        this._scene.add(outline);

        // Walls
        this._renderWalls();

        // Render placed props and images from refs
        this._renderPlacedProps();
        this._renderPlacedImages();
    }

    /** Render all placed props from the asset's refs into the scene. */
    _renderPlacedProps() {
        // Clear existing prop groups
        for (const g of this._propGroups) {
            this._scene.remove(g);
            g.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
        }
        this._propGroups = [];

        if (!this.asset?.refs) return;

        // Find all prop refs (slot starts with 'prop_')
        const propRefs = this.asset.refs.filter(r => r.slot.startsWith('prop_'));

        for (const ref of propRefs) {
            const snap = ref.snapshot;
            if (!snap) continue;

            const ed = snap.payload?._editor || snap._editor || {};
            if (!ed.elements?.length) continue;

            try {
                const group = renderProp(snap);
                // Position props in a scattered pattern
                const idx = propRefs.indexOf(ref);
                const angle = (idx / propRefs.length) * Math.PI * 2;
                const radius = 1.2 + (idx % 3) * 0.6;
                group.position.set(
                    Math.cos(angle) * radius,
                    0,
                    Math.sin(angle) * radius,
                );
                group.userData.role = 'placedProp';
                group.userData.slot = ref.slot;
                this._scene.add(group);
                this._propGroups.push(group);
            } catch (e) {
                console.warn('[EnvironmentBridge] Failed to render prop:', ref.slot, e);
            }
        }
    }

    /* ── Placed Images ── */

    /** Render all placed images from the asset's refs into the scene as textured planes. */
    _renderPlacedImages() {
        // Clear existing image sprites
        for (const m of this._imageSprites) {
            this._scene.remove(m);
            if (m.geometry) m.geometry.dispose();
            if (m.material) {
                if (m.material.map) m.material.map.dispose();
                m.material.dispose();
            }
        }
        this._imageSprites = [];

        if (!this.asset?.refs) return;

        const imageRefs = this.asset.refs.filter(r => r.slot.startsWith('image_'));

        for (const ref of imageRefs) {
            const snap = ref.snapshot;
            if (!snap) continue;

            const ed = snap.payload?._editor || snap._editor || {};
            if (!ed.elements?.length) continue;

            try {
                const canvas = renderImage(snap, { width: 256, height: 256 });
                const texture = new THREE.CanvasTexture(canvas);
                texture.colorSpace = THREE.SRGBColorSpace;

                const material = new THREE.MeshBasicMaterial({
                    map: texture,
                    transparent: true,
                    side: THREE.DoubleSide,
                    depthWrite: false,
                });

                const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), material);

                // Position images in a ring, slightly offset from props
                const idx = imageRefs.indexOf(ref);
                const angle = (idx / Math.max(imageRefs.length, 1)) * Math.PI * 2 + Math.PI / 4;
                const radius = 1.6 + (idx % 3) * 0.5;
                plane.position.set(
                    Math.cos(angle) * radius,
                    0.42,   // hover slightly above ground
                    Math.sin(angle) * radius,
                );
                // Billboard: face the camera roughly
                plane.rotation.x = -Math.PI / 6;  // slight tilt

                plane.userData.role = 'placedImage';
                plane.userData.slot = ref.slot;
                this._scene.add(plane);
                this._imageSprites.push(plane);
            } catch (e) {
                console.warn('[EnvironmentBridge] Failed to render image:', ref.slot, e);
            }
        }
    }

    /** Get the list of placed image slots. */
    _getPlacedImages() {
        if (!this.asset?.refs) return [];
        return this.asset.refs.filter(r => r.slot.startsWith('image_'));
    }

    /** Add an image to the environment. */
    _addImage(imageAsset) {
        const slotId = 'image_' + Date.now().toString(36);
        setRef(this.asset, slotId, imageAsset);
        this._showImagePicker = false;
        this._renderPlacedImages();
        this._renderPanel();
    }

    /** Remove an image from the environment. */
    _removeImage(slot) {
        removeRef(this.asset, slot);
        this._renderPlacedImages();
        this._renderPanel();
    }

    /** Edit a placed image via ImageBridge drill-down. */
    _editImage(slot) {
        const ref = this.asset.refs?.find(r => r.slot === slot);
        if (!ref?.snapshot) return;
        this._editingImageSlot = slot;
        if (this.onDrillDown) {
            this.onDrillDown(ImageBridge, ref.snapshot, 'Edit Image');
        }
    }

    /** Browse image templates to add. */
    async _browseImageTemplates() {
        if (this._imageBrowseOpen) return;
        this._imageBrowseOpen = true;
        try {
            // Load emoji manifest for image templates
            const res = await fetch('global_assets/images/emojis/manifest.json');
            if (!res.ok) throw new Error('Failed to load manifest');
            const manifest = await res.json();
            const batches = manifest.batches || [];

            const items = [];
            for (const batch of batches) {
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
            }
            this._imageTemplates = items;
            this._imageBrowseOpen = false;
            this._showImagePicker = true;
            this._renderPanel();
        } catch (e) {
            console.warn('[EnvironmentBridge] Failed to load image templates:', e);
            this._imageBrowseOpen = false;
        }
    }

    /* ── Placed Props (getters/mutators) ── */

    /** Get the list of placed prop slots. */
    _getPlacedProps() {
        if (!this.asset?.refs) return [];
        return this.asset.refs.filter(r => r.slot.startsWith('prop_'));
    }

    /** Add a prop to the environment. */
    _addProp(propAsset) {
        const slotId = 'prop_' + Date.now().toString(36);
        setRef(this.asset, slotId, propAsset);
        this._showPropPicker = false;
        this._renderPlacedProps();
        this._renderPanel();
    }

    /** Remove a prop from the environment. */
    _removeProp(slot) {
        removeRef(this.asset, slot);
        this._renderPlacedProps();
        this._renderPanel();
    }

    /** Edit a placed prop via ObjectBridge drill-down. */
    _editProp(slot) {
        const ref = this.asset.refs?.find(r => r.slot === slot);
        if (!ref?.snapshot) return;
        // Store which slot we're editing so _onResume can update the right one
        this._editingPropSlot = slot;
        if (this.onDrillDown) {
            this.onDrillDown(ObjectBridge, ref.snapshot, 'Edit Prop');
        }
    }

    /** Browse object templates to add as props. */
    async _browsePropTemplates() {
        if (this._propBrowseOpen) return;
        this._propBrowseOpen = true;
        try {
            const objects = await loadGlobalAssets('3D Objects');
            this._propTemplates = objects;
            this._propBrowseOpen = false;
            this._showPropPicker = true;
            this._renderPanel();
        } catch (e) {
            console.warn('[EnvironmentBridge] Failed to load prop templates:', e);
            this._propBrowseOpen = false;
        }
    }

    _onResume(savedAsset) {
        if (savedAsset && this._editingPropSlot) {
            setRef(this.asset, this._editingPropSlot, savedAsset);
            this._editingPropSlot = null;
            this._renderPlacedProps();
        } else if (savedAsset && this._editingImageSlot) {
            setRef(this.asset, this._editingImageSlot, savedAsset);
            this._editingImageSlot = null;
            this._renderPlacedImages();
        }
    }

    _renderPanelBody() {
        const name = _esc(this.asset?.name || '');
        const s    = this._state;

        // Placed props list
        const placedProps = this._getPlacedProps();
        let propsListHtml = '';
        if (placedProps.length > 0) {
            propsListHtml = placedProps.map(ref => {
                const snap = ref.snapshot;
                const pName = _esc(snap?.name || 'Object');
                const pc = snap?.payload?.color_assignments?.primary || '#6F6F6F';
                return `<div class="cb-prop-item" data-slot="${_esc(ref.slot)}">
                    <div class="cb-prop-item-icon" style="background:${pc};"></div>
                    <span class="cb-prop-item-name">${pName}</span>
                    <button class="cb-prop-edit-btn" data-slot="${_esc(ref.slot)}" title="Edit">✎</button>
                    <button class="cb-prop-remove-btn" data-slot="${_esc(ref.slot)}" title="Remove">✕</button>
                </div>`;
            }).join('');
        } else {
            propsListHtml = `<p style="color: var(--text-dim); font-size: 11px; margin: 4px 0;">No props placed yet.</p>`;
        }

        // Prop picker
        let propPickerHtml = '';
        if (this._showPropPicker && this._propTemplates) {
            const grouped = {};
            for (const obj of this._propTemplates) {
                const cat = obj._category || obj.tags?.[0] || 'other';
                if (!grouped[cat]) grouped[cat] = [];
                grouped[cat].push(obj);
            }
            propPickerHtml = `<div class="cb-item-picker">
                <div class="cb-item-picker-header">
                    <span>Add Prop</span>
                    <button class="cb-prop-picker-close">✕</button>
                </div>
                ${Object.entries(grouped).map(([cat, items]) => `
                    <div class="cb-item-cat-title">${_esc(cat.charAt(0).toUpperCase() + cat.slice(1))}</div>
                    <div class="cb-item-grid">
                        ${items.map(obj => {
                            const pc = obj.payload?.color_assignments?.primary || '#6F6F6F';
                            return `<button class="cb-prop-thumb" data-prop-id="${_esc(obj.id)}" title="${_esc(obj.name)}">
                                <div class="cb-item-thumb-icon" style="background:${pc};"></div>
                                <div class="cb-item-thumb-name">${_esc(obj.name)}</div>
                            </button>`;
                        }).join('')}
                    </div>
                `).join('')}
            </div>`;
        }

        // Placed images list
        const placedImages = this._getPlacedImages();
        let imagesListHtml = '';
        if (placedImages.length > 0) {
            imagesListHtml = placedImages.map(ref => {
                const snap = ref.snapshot;
                const iName = _esc(snap?.name || 'Image');
                const pc = snap?.payload?.color_assignments?.primary ||
                           snap?.payload?._editor?.color_assignments?.primary || '#6F6F6F';
                return `<div class="cb-prop-item cb-image-item" data-slot="${_esc(ref.slot)}">
                    <div class="cb-prop-item-icon" style="background:${pc};border-radius:50%;"></div>
                    <span class="cb-prop-item-name">${iName}</span>
                    <button class="cb-image-edit-btn" data-slot="${_esc(ref.slot)}" title="Edit">✎</button>
                    <button class="cb-image-remove-btn" data-slot="${_esc(ref.slot)}" title="Remove">✕</button>
                </div>`;
            }).join('');
        } else {
            imagesListHtml = `<p style="color: var(--text-dim); font-size: 11px; margin: 4px 0;">No images placed yet.</p>`;
        }

        // Image picker
        let imagePickerHtml = '';
        if (this._showImagePicker && this._imageTemplates) {
            const grouped = {};
            for (const img of this._imageTemplates) {
                const cat = img._category || 'other';
                if (!grouped[cat]) grouped[cat] = [];
                grouped[cat].push(img);
            }
            imagePickerHtml = `<div class="cb-item-picker cb-img-picker">
                <div class="cb-item-picker-header">
                    <span>Add Image</span>
                    <button class="cb-image-picker-close">✕</button>
                </div>
                ${Object.entries(grouped).map(([cat, items]) => `
                    <div class="cb-item-cat-title">${_esc(cat.charAt(0).toUpperCase() + cat.slice(1))}</div>
                    <div class="cb-item-grid">
                        ${items.map(img => {
                            const pc = img.payload?.color_assignments?.primary ||
                                       img.payload?._editor?.color_assignments?.primary || '#6F6F6F';
                            return `<button class="cb-item-thumb cb-env-img-thumb" data-img-id="${_esc(img.id)}" title="${_esc(img.name)}">
                                <div class="cb-item-thumb-icon" style="background:${pc};border-radius:50%;"></div>
                                <div class="cb-item-thumb-name">${_esc(img.name)}</div>
                            </button>`;
                        }).join('')}
                    </div>
                `).join('')}
            </div>`;
        }

        return `
          <div class="cb-section">
            <input type="text" class="bridge-name-input cb-name-input"
                   value="${name}" placeholder="Environment name...">
          </div>
          <div class="cb-section">
            <div class="cb-section-title">Ground</div>
            ${_colorRow('Color', 'groundColor', s.groundColor)}
          </div>
          <div class="cb-section">
            <div class="cb-section-title">Sky</div>
            ${_colorRow('Top',     'skyTopColor',     s.skyTopColor)}
            ${_colorRow('Horizon', 'skyHorizonColor', s.skyHorizonColor)}
          </div>
          <div class="cb-section">
            <div class="cb-section-title">Walls</div>
            <div class="cb-color-row">
              <label class="cb-color-label">Count:</label>
              <select class="cb-select" data-property="wallCount">
                ${[0,1,2].map(n =>
                  `<option value="${n}" ${s.wallCount==n?'selected':''}>${n}</option>`
                ).join('')}
              </select>
            </div>
          </div>
          <div class="cb-section">
            <div class="cb-section-title">Music</div>
            <div class="cb-color-row">
              <label class="cb-color-label">Track:</label>
              <select class="cb-select" id="env-music-select" data-property="musicId">
                <option value=""${!s.musicId ? ' selected' : ''}>None</option>
                ${(this._musicAssets || []).map(m =>
                  `<option value="${_esc(m.id)}"${s.musicId === m.id ? ' selected' : ''}>${_esc(m.name)}</option>`
                ).join('')}
              </select>
            </div>
            ${s.musicId ? `<div class="cb-color-row" style="gap:6px;">
              <button class="cb-save-btn" id="env-music-preview" style="width:auto;padding:4px 12px;font-size:11px;">&#9654; Preview</button>
              <button class="cb-save-btn" id="env-music-stop" style="width:auto;padding:4px 12px;font-size:11px;">&#9632; Stop</button>
            </div>` : ''}
            ${!this._musicAssets ? `<p style="color:var(--text-dim);font-size:11px;margin:4px 0;cursor:pointer;" id="env-music-load">Loading tracks...</p>` : ''}
          </div>
          <div class="cb-section">
            <div class="cb-section-title">Props (${placedProps.length})</div>
            ${propsListHtml}
            <button class="cb-prop-browse-btn">+ Add Prop</button>
            ${propPickerHtml}
          </div>
          <div class="cb-section">
            <div class="cb-section-title">Images (${placedImages.length})</div>
            ${imagesListHtml}
            <button class="cb-img-browse-btn cb-env-img-browse-btn">+ Add Image</button>
            ${imagePickerHtml}
          </div>`;
    }

    _wirePanelEvents() {
        // Ground/sky color inputs
        this.panelEl.querySelectorAll('.cb-color[type="color"]').forEach(inp => {
            const handler = () => {
                this._state[inp.dataset.property] = inp.value;
                this._updateGround();
                // Live-update sky gradient when sky colors change
                if (inp.dataset.property === 'skyTopColor' || inp.dataset.property === 'skyHorizonColor') {
                    this._updateSky();
                }
            };
            inp.addEventListener('input', handler);
            inp.addEventListener('change', handler);
        });

        // Wall count select
        this.panelEl.querySelectorAll('.cb-select').forEach(sel => {
            sel.addEventListener('change', () => {
                const prop = sel.dataset.property;
                if (prop === 'musicId') {
                    this._state.musicId = sel.value;
                    this._stopMusic();
                } else if (prop === 'wallCount') {
                    this._state.wallCount = parseInt(sel.value);
                    this._renderWalls();
                } else {
                    this._state[prop] = parseInt(sel.value);
                }
            });
        });

        // Music preview / stop buttons
        this.panelEl.querySelector('#env-music-preview')?.addEventListener('click', () => this._previewMusic());
        this.panelEl.querySelector('#env-music-stop')?.addEventListener('click', () => this._stopMusic());

        // Lazy-load music assets when section first renders
        if (!this._musicAssets) this._loadMusicAssets();

        // Prop edit buttons
        this.panelEl.querySelectorAll('.cb-prop-edit-btn').forEach(btn => {
            btn.addEventListener('click', () => this._editProp(btn.dataset.slot));
        });

        // Prop remove buttons
        this.panelEl.querySelectorAll('.cb-prop-remove-btn').forEach(btn => {
            btn.addEventListener('click', () => this._removeProp(btn.dataset.slot));
        });

        // Browse props button
        this.panelEl.querySelector('.cb-prop-browse-btn')?.addEventListener('click', () => this._browsePropTemplates());

        // Prop picker close
        this.panelEl.querySelector('.cb-prop-picker-close')?.addEventListener('click', () => {
            this._showPropPicker = false;
            this._renderPanel();
        });

        // Prop template thumbnails
        this.panelEl.querySelectorAll('.cb-prop-thumb').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.propId;
                const item = this._propTemplates?.find(o => o.id === id);
                if (item) this._addProp(item);
            });
        });

        // ── Image event handlers ──

        // Image edit buttons
        this.panelEl.querySelectorAll('.cb-image-edit-btn').forEach(btn => {
            btn.addEventListener('click', () => this._editImage(btn.dataset.slot));
        });

        // Image remove buttons
        this.panelEl.querySelectorAll('.cb-image-remove-btn').forEach(btn => {
            btn.addEventListener('click', () => this._removeImage(btn.dataset.slot));
        });

        // Browse images button
        this.panelEl.querySelector('.cb-env-img-browse-btn')?.addEventListener('click', () => this._browseImageTemplates());

        // Image picker close
        this.panelEl.querySelector('.cb-image-picker-close')?.addEventListener('click', () => {
            this._showImagePicker = false;
            this._renderPanel();
        });

        // Image template thumbnails
        this.panelEl.querySelectorAll('.cb-env-img-thumb').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.imgId;
                const item = this._imageTemplates?.find(o => o.id === id);
                if (item) this._addImage(item);
            });
        });
    }

    /** Load global music assets for the music selector dropdown. */
    async _loadMusicAssets() {
        if (this._musicAssets) return;
        try {
            this._musicAssets = await loadGlobalAssets('Music');
        } catch {
            this._musicAssets = [];
        }
        this._renderPanel();
    }

    /** Preview the currently assigned music track. */
    async _previewMusic() {
        if (!this._state.musicId) return;
        if (!this._musicAssets) await this._loadMusicAssets();
        const track = this._musicAssets?.find(m => m.id === this._state.musicId);
        if (!track) return;
        if (!this._musicEngine) {
            this._musicEngine = new MusicEngine();
            await this._musicEngine.init();
        }
        this._musicEngine.play(track);
    }

    /** Stop music preview. */
    _stopMusic() {
        if (this._musicEngine) this._musicEngine.stop();
    }

    _updateGround() {
        this._scene.traverse(obj => {
            if (obj.userData.role === 'envGround') {
                obj.material.color.set(this._state.groundColor);
            }
        });
    }

    /** Build a gradient sky background from state colors. */
    _updateSky() {
        if (!this._scene) return;
        const canvas = document.createElement('canvas');
        canvas.width = 2; canvas.height = 256;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createLinearGradient(0, 0, 0, 256);
        grad.addColorStop(0, this._state.skyTopColor);
        grad.addColorStop(1, this._state.skyHorizonColor);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 2, 256);
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        // Dispose previous background texture if any
        if (this._scene.background?.isTexture) this._scene.background.dispose();
        this._scene.background = tex;
    }

    /** Render wall planes around the stage perimeter based on wallCount. */
    _renderWalls() {
        // Remove existing walls
        const toRemove = [];
        this._scene.traverse(obj => { if (obj.userData.role === 'envWall') toRemove.push(obj); });
        for (const w of toRemove) {
            this._scene.remove(w);
            if (w.geometry) w.geometry.dispose();
            if (w.material) w.material.dispose();
        }

        const count = this._state.wallCount || 0;
        if (count === 0) return;

        const wallH = 2.5;
        const wallW = 5;
        const wallMat = new THREE.MeshStandardMaterial({
            color: 0xcccccc, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide,
        });

        // Wall 1: back wall (z = -2.5)
        const back = new THREE.Mesh(new THREE.PlaneGeometry(wallW, wallH), wallMat);
        back.position.set(0, wallH / 2, -2.5);
        back.userData.role = 'envWall';
        back.receiveShadow = true;
        this._scene.add(back);

        // Wall 2: left wall (x = -2.5)
        if (count >= 2) {
            const left = new THREE.Mesh(new THREE.PlaneGeometry(wallW, wallH), wallMat.clone());
            left.position.set(-2.5, wallH / 2, 0);
            left.rotation.y = Math.PI / 2;
            left.userData.role = 'envWall';
            left.receiveShadow = true;
            this._scene.add(left);
        }
    }

    destroy() {
        this._stopMusic();
        if (this._musicEngine) { this._musicEngine.destroy(); this._musicEngine = null; }
        super.destroy();
    }

    _getState() {
        return { ...this._state };
    }

    _applyState(state) {
        this._state = { ...state };
    }
}

/* ── helpers ── */
function _esc(t) { return String(t).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[m]); }
function _colorRow(label, prop, val) {
    return `<div class="cb-color-row">
              <label class="cb-color-label">${label}:</label>
              <input type="color" class="cb-color" data-property="${prop}" value="${_esc(val)}">
            </div>`;
}
