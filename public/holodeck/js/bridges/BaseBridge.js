/**
 * BaseBridge.js — Abstract base class for all builder bridges.
 *
 * Provides shared Three.js scene setup, panel header rendering
 * (back + title + undo), resize handling, auto-save with debounce,
 * and the suspend/resume/destroy lifecycle.
 *
 * Subclasses override:
 *   _buildScene()       — add objects, lights, camera position
 *   _renderPanelBody()  — return HTML string for panel content
 *   _wirePanelEvents()  — bind events after panel render
 *   _getState()         — return current editor state for saving
 *   _onResume(saved)    — handle a child bridge returning
 */

import * as THREE from 'three';
import { UI, SCENE, LIGHT }       from '../shared/palette.js';
import { groundMaterial, gridColors } from '../shared/materials.js';

/** Auto-save debounce delay (ms). */
const AUTOSAVE_DELAY = 800;

export class BaseBridge {
    constructor(sceneContainer, panelEl, options = {}) {
        this.container = sceneContainer;
        this.panelEl   = panelEl;

        this.asset      = options.asset || null;
        this.breadcrumb = options.breadcrumb || [];
        this.onSave     = options.onSave || (() => {});
        this.onCancel   = options.onCancel || (() => {});
        this.onDrillDown = options.onDrillDown || (() => {});

        this._scene     = null;
        this._camera    = null;
        this._renderer  = null;
        this._raf       = null;
        this._ro        = null;
        this._clock     = new THREE.Clock();

        /** Subclass display name (e.g. "Environment", "Character"). */
        this.displayName = 'Builder';

        /** Store name in IndexedDB (e.g. "characters", "environments"). */
        this.storeName = '';

        /* ── Auto-save & undo state ── */
        this._autoSaveTimer  = null;
        this._undoStack      = [];       // stack of { state, name } snapshots
        this._lastSavedJSON  = null;     // JSON string of last saved state (for dirty check)
        this._autoSaveStatus = '';       // '' | 'saving' | 'saved'
    }

    /* ══════════════════════════════════════════════════════════
       PUBLIC LIFECYCLE
       ══════════════════════════════════════════════════════════ */

    async init() {
        this._setupBaseScene();
        await this._buildScene();
        this._startRenderLoop();
        this._renderPanel();

        // Capture initial state for undo baseline and dirty checking
        const initState = this._getState();
        this._lastSavedJSON = JSON.stringify(initState);
        this._undoStack = [{ state: structuredClone(initState), label: 'Initial' }];
    }

    suspend() {
        // Flush any pending auto-save before going dormant
        if (this._autoSaveTimer) {
            clearTimeout(this._autoSaveTimer);
            this._autoSaveTimer = null;
            // Fire-and-forget: save current state so nothing is lost
            this._doAutoSave().catch(() => {});
        }
        // Pause animation
        if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
        // Hide renderer
        if (this._renderer?.domElement) {
            this._renderer.domElement.style.display = 'none';
        }
        // Hide panel content
        this.panelEl.style.display = 'none';
    }

    resume(savedAsset) {
        // Re-show renderer
        if (this._renderer?.domElement) {
            this._renderer.domElement.style.display = '';
        }
        // Re-show panel
        this.panelEl.style.display = '';
        // Restart animation
        this._startRenderLoop();
        // Let subclass handle the returned asset
        this._onResume(savedAsset);
        // Re-render panel to reflect any changes
        this._renderPanel();
    }

    destroy() {
        // Flush any pending auto-save synchronously before teardown
        if (this._autoSaveTimer) {
            clearTimeout(this._autoSaveTimer);
            this._autoSaveTimer = null;
            // Fire-and-forget final save (async but we can't block destroy)
            this._doAutoSave().catch(() => {});
        }
        if (this._raf) cancelAnimationFrame(this._raf);
        if (this._ro)  this._ro.disconnect();

        if (this._renderer) {
            this._renderer.dispose();
            const el = this._renderer.domElement;
            if (this.container.contains(el)) this.container.removeChild(el);
        }

        this._scene    = null;
        this._camera   = null;
        this._renderer = null;
    }

    /* ══════════════════════════════════════════════════════════
       SCENE SETUP
       ══════════════════════════════════════════════════════════ */

    _setupBaseScene() {
        const c = this.container;

        this._scene = new THREE.Scene();
        this._scene.background = new THREE.Color(SCENE.builderBg);

        this._camera = new THREE.PerspectiveCamera(50, c.clientWidth / c.clientHeight, 0.1, 1000);
        this._camera.position.set(5.2, 3.9, 5.2);
        this._camera.lookAt(0, 0, 0);

        this._renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        this._renderer.setSize(c.clientWidth, c.clientHeight);
        this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this._renderer.shadowMap.enabled   = true;
        this._renderer.shadowMap.type      = THREE.PCFSoftShadowMap;
        this._renderer.toneMapping         = THREE.ACESFilmicToneMapping;
        this._renderer.toneMappingExposure = 1.0;
        c.appendChild(this._renderer.domElement);

        // Ground
        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(10, 10),
            groundMaterial(),
        );
        ground.rotation.x    = -Math.PI / 2;
        ground.receiveShadow = true;
        this._scene.add(ground);

        // Grid
        const gc = gridColors();
        const grid = new THREE.GridHelper(10, 20, gc.major, gc.minor);
        grid.position.y = 0.001;
        this._scene.add(grid);

        // 1 m reference square (cyan outline on the floor)
        const refPts = [[-0.5,0.005,-0.5],[0.5,0.005,-0.5],[0.5,0.005,0.5],[-0.5,0.005,0.5],[-0.5,0.005,-0.5]]
            .map(p => new THREE.Vector3(...p));
        this._scene.add(new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(refPts),
            new THREE.LineBasicMaterial({ color: parseInt(UI.accent.slice(1), 16) }),
        ));

        // Lights
        this._scene.add(new THREE.AmbientLight(SCENE.ambient, LIGHT.ambientIntensity));
        const dir = new THREE.DirectionalLight(SCENE.keyLight, LIGHT.keyIntensity);
        dir.position.set(...LIGHT.keyPosition);
        dir.castShadow = true;
        this._scene.add(dir);
        const fill = new THREE.DirectionalLight(SCENE.fillLight, LIGHT.fillIntensity);
        fill.position.set(...LIGHT.fillPosition);
        this._scene.add(fill);

        // Resize observer
        this._ro = new ResizeObserver(() => {
            this._camera.aspect = c.clientWidth / c.clientHeight;
            this._camera.updateProjectionMatrix();
            this._renderer.setSize(c.clientWidth, c.clientHeight);
        });
        this._ro.observe(c);
    }

    _startRenderLoop() {
        if (this._raf) return; // already running
        let _dirtyCheckCounter = 0;
        const tick = () => {
            this._raf = requestAnimationFrame(tick);
            const delta = this._clock.getDelta();
            this._onTick(delta);
            this._renderer.render(this._scene, this._camera);

            // Periodic dirty-check every ~15 frames (~250ms at 60fps)
            if (++_dirtyCheckCounter >= 15) {
                _dirtyCheckCounter = 0;
                this._checkForChanges();
            }
        };
        tick();
    }

    /** Compare current state to last known; schedule auto-save if changed. */
    _checkForChanges() {
        try {
            const current = JSON.stringify(this._getState());
            const lastUndo = this._undoStack.length > 0
                ? JSON.stringify(this._undoStack[this._undoStack.length - 1].state)
                : this._lastSavedJSON;
            if (current !== lastUndo) {
                // State changed — push undo snapshot and schedule save
                this._undoStack.push({ state: structuredClone(this._getState()), label: 'Edit' });
                if (this._undoStack.length > 50) this._undoStack.shift();
                this._scheduleAutoSave();
            }
        } catch (_) { /* ignore serialization errors */ }
        // Refresh the autosave indicator every tick so dirty/saved/idle
        // transitions are reflected in the UI without a full panel rebuild.
        this._updateAutoSaveLabel();
    }

    /* ══════════════════════════════════════════════════════════
       PANEL RENDERING
       ══════════════════════════════════════════════════════════ */

    _renderPanel() {
        const title = this.asset
            ? `Edit ${this.displayName}`
            : `New ${this.displayName}`;

        // Persistent autosave status — always rendered under the title.
        const { cls, text } = this._autoSaveStatusView();
        const statusHtml = `<span class="bridge-autosave-label ${cls}">${text}</span>`;

        const canUndo = this._undoStack.length > 1;

        const bodyHtml = this._renderPanelBody();

        this.panelEl.innerHTML = `
            <!-- Header -->
            <div class="ph-row">
                <button class="ph-btn bridge-back-btn" aria-label="Back">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
                         fill="none" stroke="currentColor" stroke-width="2"
                         stroke-linecap="round" stroke-linejoin="round">
                        <path d="m15 18-6-6 6-6"/>
                    </svg>
                </button>
                <div class="ph-title-group">
                    <span class="ph-title">${title}</span>
                    ${statusHtml}
                </div>
                <button class="ph-btn bridge-undo-btn ${canUndo ? '' : 'disabled'}"
                        aria-label="Undo" ${canUndo ? '' : 'disabled'}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
                         fill="none" stroke="currentColor" stroke-width="2"
                         stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
                    </svg>
                </button>
            </div>

            <!-- Body -->
            <div class="cb-body">
                ${bodyHtml}
            </div>
        `;

        this._wireBaseEvents();
        this._wirePanelEvents();
    }

    _wireBaseEvents() {
        // Back button — flush auto-save then pop
        this.panelEl.querySelector('.bridge-back-btn')
            ?.addEventListener('click', () => this._backOut());

        // Undo button
        this.panelEl.querySelector('.bridge-undo-btn')
            ?.addEventListener('click', () => this._undo());
    }

    /* ── Back: flush any pending auto-save, then navigate back ── */
    async _backOut() {
        // Flush pending auto-save so nothing is lost
        if (this._autoSaveTimer) {
            clearTimeout(this._autoSaveTimer);
            this._autoSaveTimer = null;
            await this._doAutoSave();
        }
        // If state is dirty (never saved yet or changed since last save), do a final save
        const currentJSON = JSON.stringify(this._getState());
        if (currentJSON !== this._lastSavedJSON) {
            await this._doAutoSave();
        }
        this.onSave(this.asset);
    }

    /* ── Mark state dirty & schedule auto-save ── */
    markDirty(undoLabel) {
        // Push undo snapshot before the change takes effect
        // (caller should call markDirty AFTER updating state)
        const snap = structuredClone(this._getState());
        this._undoStack.push({ state: snap, label: undoLabel || 'Edit' });
        // Cap undo stack at 50
        if (this._undoStack.length > 50) this._undoStack.shift();

        this._scheduleAutoSave();
    }

    _scheduleAutoSave() {
        if (this._autoSaveTimer) clearTimeout(this._autoSaveTimer);
        this._autoSaveTimer = setTimeout(() => {
            this._autoSaveTimer = null;
            this._doAutoSave();
        }, AUTOSAVE_DELAY);
    }

    async _doAutoSave() {
        const state = this._getState();
        const stateJSON = JSON.stringify(state);
        // Skip if nothing changed since last save
        if (stateJSON === this._lastSavedJSON) return;

        this._autoSaveStatus = 'saving';
        this._updateAutoSaveLabel();

        const name = this.panelEl.querySelector('.bridge-name-input')?.value?.trim()
                     || this.asset?.name
                     || `New ${this.displayName}`;

        // Capture thumbnail
        let thumbnail = null;
        if (this._renderer && this._scene && this._camera) {
            this._renderer.render(this._scene, this._camera);
            thumbnail = this._renderer.domElement.toDataURL('image/jpeg', 0.8);
        }

        const description = state.description || '';
        const tags = Array.isArray(state.tags) ? state.tags : [];

        if (this.asset) {
            // Update existing asset — write to both payload.state and legacy state
            this.asset.name          = name;
            this.asset.tags          = tags;
            this.asset.meta.modified = Date.now();
            this.asset.meta.thumbnail = thumbnail;
            this.asset.meta.tags     = tags;
            if (this.asset.meta.version !== undefined) this.asset.meta.version++;

            // Normalized payload
            if (!this.asset.payload) {
                this.asset.payload = { description: '', format: `${this.asset.type || 'unknown'}_state`, state: {}, _editor: null };
            }
            this.asset.payload.state       = { ...state };
            this.asset.payload.description = description;

            // Legacy fallback — keep .state in sync during transition
            this.asset.state = { ...state };

            // Ensure refs array exists
            if (!this.asset.refs) this.asset.refs = [];
        } else {
            const { createAsset } = await import('../db.js?v=2');
            this.asset = createAsset(this.storeName.replace(/s$/, ''), state, name, {
                description,
            });
            this.asset.meta.thumbnail = thumbnail;
            this.asset.meta.tags      = tags;
            this.asset.tags           = tags;
            // Also set legacy .state for backwards compat
            this.asset.state = { ...state };
        }

        const { dbSave } = await import('../db.js?v=2');
        await dbSave(this.storeName, this.asset);

        this._lastSavedJSON  = stateJSON;
        this._autoSaveStatus = 'saved';
        this._updateAutoSaveLabel();

        // Fade out "Auto-saved" after 2s
        setTimeout(() => {
            if (this._autoSaveStatus === 'saved') {
                this._autoSaveStatus = '';
                this._updateAutoSaveLabel();
            }
        }, 2000);
    }

    /**
     * Compute the persistent autosave status view — always returns a label.
     * States:
     *   saving → "Saving…"
     *   saved  → "All changes saved"
     *   dirty  (pending debounced save) → "Unsaved — autosaving…"
     *   idle   → "All changes saved"  (or "Auto-saves as you edit" if no save yet)
     */
    _autoSaveStatusView() {
        if (this._autoSaveStatus === 'saving') {
            return { cls: 'saving', text: 'Saving…' };
        }
        if (this._autoSaveStatus === 'saved') {
            return { cls: 'saved', text: 'All changes saved' };
        }
        if (this._autoSaveTimer) {
            return { cls: 'dirty', text: 'Unsaved — autosaving…' };
        }
        // No timer pending, no recent save status → dirty check
        try {
            const cur = JSON.stringify(this._getState());
            if (this._lastSavedJSON && cur !== this._lastSavedJSON) {
                return { cls: 'dirty', text: 'Unsaved changes' };
            }
            if (this._lastSavedJSON) {
                return { cls: '', text: 'All changes saved' };
            }
        } catch (_) { /* ignore */ }
        return { cls: '', text: 'Auto-saves as you edit' };
    }

    /** Update just the auto-save label without re-rendering the whole panel. */
    _updateAutoSaveLabel() {
        const el = this.panelEl.querySelector('.bridge-autosave-label');
        const { cls, text } = this._autoSaveStatusView();
        if (el) {
            el.textContent = text;
            el.className = `bridge-autosave-label ${cls}`;
        } else {
            // Element missing — create it inside the title group if possible
            const titleGroup = this.panelEl.querySelector('.ph-title-group');
            if (titleGroup) {
                const span = document.createElement('span');
                span.className = `bridge-autosave-label ${cls}`;
                span.textContent = text;
                titleGroup.appendChild(span);
            }
        }
        // Update undo button state
        const undoBtn = this.panelEl.querySelector('.bridge-undo-btn');
        if (undoBtn) {
            const canUndo = this._undoStack.length > 1;
            undoBtn.classList.toggle('disabled', !canUndo);
            undoBtn.disabled = !canUndo;
        }
    }

    /* ── Undo ── */
    _undo() {
        if (this._undoStack.length <= 1) return;
        // Pop current state
        this._undoStack.pop();
        // Restore previous
        const prev = this._undoStack[this._undoStack.length - 1];
        this._applyState(structuredClone(prev.state));
        this._scheduleAutoSave();
        this._renderPanel();
    }

    /**
     * Apply a state snapshot to the editor.
     * Subclasses should override to update their internal _state and scene.
     * Default: copies properties onto asset.state.
     */
    _applyState(state) {
        if (this.asset) {
            this.asset.state = { ...state };
        }
    }

    /* ── Legacy _handleSave for any subclass that calls it directly ── */
    async _handleSave() {
        await this._doAutoSave();
        this.onSave(this.asset);
    }

    /* ══════════════════════════════════════════════════════════
       SUBCLASS HOOKS (override in each builder bridge)
       ══════════════════════════════════════════════════════════ */

    /** Add builder-specific objects to this._scene. */
    async _buildScene() { }

    /** Return HTML string for the panel body. */
    _renderPanelBody() {
        return `<div class="cb-section">
            <p style="color: var(--text-dim); text-align: center; padding: 20px 0;">
                ${this.displayName} Builder — coming soon
            </p>
        </div>`;
    }

    /** Bind builder-specific events after panel render. */
    _wirePanelEvents() { }

    /** Return the current editor state object. */
    _getState() { return this.asset?.payload?.state || this.asset?.state || {}; }

    /** Called each animation frame. */
    _onTick(delta) { }

    /** Called when a child bridge pops back. */
    _onResume(savedAsset) { }
}
