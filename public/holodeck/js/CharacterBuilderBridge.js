/**
 * CharacterBuilderBridge.js
 *
 * Swaps the holodeck's Three.js scene for the Character Builder's scene and
 * renders a simplified edit panel into the shell's #panel-inner element.
 *
 * Usage:
 *   const bridge = new CharacterBuilderBridge(sceneContainer, panelEl);
 *   bridge.onSave   = (asset) => { ... };
 *   bridge.onCancel = () => { ... };
 *   await bridge.init(existingAsset); // null = new character
 *   // ... later:
 *   bridge.destroy();
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createCharacter }   from '../builders/Builder-Character_V0.1/js/character.js';
import { BlinkController }   from '../builders/Builder-Character_V0.1/js/eyeRig.js';
import { preloadProps }      from '../builders/Builder-Character_V0.1/js/accessories.js';
import {
    HEADWEAR_MANIFEST,
    GLASSES_MANIFEST,
    FACIAL_HAIR_MANIFEST,
} from '../builders/Builder-Character_V0.1/js/config.js';
import {
    dbSave,
    createAsset,
} from '../builders/Builder-Character_V0.1/js/db.js';

/* ── SVG helpers (minimal subset needed for the bridge panel) ── */
function svg(d, w = 20, h = 20) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
}
const X_ICON = svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>');

export class CharacterBuilderBridge {
    constructor(sceneContainer, panelEl) {
        this.container   = sceneContainer;
        this.panelEl     = panelEl;

        this._character        = null;
        this._renderer         = null;
        this._scene            = null;
        this._camera           = null;
        this._controls         = null;
        this._blinkController  = null;
        this._ro               = null;
        this._raf              = null;
        this._currentAsset     = null;
        this._pendingName      = '';    // tracks name input between re-renders

        /** Called with the saved asset object after a successful save. */
        this.onSave   = null;
        /** Called when the user cancels without saving. */
        this.onCancel = null;
    }

    /* ── Public ──────────────────────────────────────────── */

    /**
     * Set up the builder scene and panel.
     * @param {Object|null} existingAsset  — pass null to create a new character.
     */
    async init(existingAsset = null) {
        this._currentAsset = existingAsset || null;
        this._pendingName  = existingAsset?.name || 'New Character';

        // Show loading placeholder in panel immediately
        this._showLoading();

        // Build Three.js scene first so the canvas is visible while assets load
        this._setupScene();

        // Preload accessory prop assets (same step as builder's main.js)
        await preloadProps([
            ...HEADWEAR_MANIFEST,
            ...GLASSES_MANIFEST,
            ...FACIAL_HAIR_MANIFEST,
        ]);

        // Create and optionally restore character
        this._character = createCharacter();
        this._scene.add(this._character.container);

        if (existingAsset?.state) {
            this._character.setState(existingAsset.state);
        }

        // Blink controller
        this._blinkController = new BlinkController();
        this._blinkController.register(
            this._character.leftEye,
            this._character.rightEye,
        );
        this._character.onRebuild = () => {
            this._blinkController.clear();
            this._blinkController.register(
                this._character.leftEye,
                this._character.rightEye,
            );
        };

        this._startRenderLoop();
        this._renderPanel();
    }

    /**
     * Tear down the builder: cancel RAF, disconnect observer, dispose renderer.
     */
    destroy() {
        if (this._raf)      cancelAnimationFrame(this._raf);
        if (this._ro)       this._ro.disconnect();
        if (this._controls) this._controls.dispose();
        this._blinkController?.clear();

        if (this._renderer) {
            this._renderer.dispose();
            const el = this._renderer.domElement;
            if (this.container.contains(el)) this.container.removeChild(el);
        }
    }

    /* ── Private: scene ──────────────────────────────────── */

    _setupScene() {
        const c = this.container;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x2a2a3e);
        this._scene = scene;

        const camera = new THREE.PerspectiveCamera(45, c.clientWidth / c.clientHeight, 0.1, 100);
        camera.position.set(0, 1.3, 3.5);
        this._camera = camera;

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(c.clientWidth, c.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled    = true;
        renderer.shadowMap.type       = THREE.PCFSoftShadowMap;
        renderer.toneMapping          = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure  = 1.0;
        c.appendChild(renderer.domElement);
        this._renderer = renderer;

        // Orbit controls (same settings as standalone builder)
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 1.0, 0);
        controls.enableDamping  = true;
        controls.dampingFactor  = 0.08;
        controls.minDistance    = 1.5;
        controls.maxDistance    = 10;
        controls.update();
        this._controls = controls;

        // Lighting
        scene.add(new THREE.AmbientLight(0xffffff, 0.6));

        const dir = new THREE.DirectionalLight(0xffffff, 1.2);
        dir.position.set(5, 8, 5);
        dir.castShadow                  = true;
        dir.shadow.mapSize.width        = 1024;
        dir.shadow.mapSize.height       = 1024;
        dir.shadow.camera.near          = 0.5;
        dir.shadow.camera.far           = 20;
        dir.shadow.camera.left          = -3;
        dir.shadow.camera.right         = 3;
        dir.shadow.camera.top           = 3;
        dir.shadow.camera.bottom        = -3;
        scene.add(dir);

        const fill = new THREE.DirectionalLight(0x8888ff, 0.3);
        fill.position.set(-3, 2, -3);
        scene.add(fill);

        // Ground + grid
        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(10, 10),
            new THREE.MeshStandardMaterial({ color: 0x3a3a5e, roughness: 1.0 }),
        );
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);

        const grid = new THREE.GridHelper(10, 20, 0x555577, 0x444466);
        grid.position.y = 0.001;
        scene.add(grid);

        // 1 m reference square (cyan outline on the floor)
        const refPts = [[-0.5,0.005,-0.5],[0.5,0.005,-0.5],[0.5,0.005,0.5],[-0.5,0.005,0.5],[-0.5,0.005,-0.5]]
            .map(p => new THREE.Vector3(...p));
        scene.add(new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(refPts),
            new THREE.LineBasicMaterial({ color: 0x00D9D9 }),
        ));

        // Keep renderer sized to container
        this._ro = new ResizeObserver(() => {
            camera.aspect = c.clientWidth / c.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(c.clientWidth, c.clientHeight);
        });
        this._ro.observe(c);
    }

    _startRenderLoop() {
        const clock = new THREE.Clock();
        const tick  = () => {
            this._raf = requestAnimationFrame(tick);
            const delta = clock.getDelta();
            this._blinkController?.update(delta * 1000);
            this._controls?.update();
            this._renderer.render(this._scene, this._camera);
        };
        tick();
    }

    /* ── Private: panel ──────────────────────────────────── */

    _showLoading() {
        this.panelEl.innerHTML = `<div class="cb-loading">Loading character…</div>`;
    }

    _renderPanel() {
        const char  = this._character;
        const state = char.getState();
        const asset = this._currentAsset;

        this.panelEl.innerHTML = `
            <!-- Header -->
            <div class="ph-row">
                <button class="ph-btn cb-cancel-btn" id="cb-cancel-btn" aria-label="Cancel">${X_ICON}</button>
                <span class="ph-title">${asset ? 'Edit Character' : 'New Character'}</span>
                <div style="width:40px"></div>
            </div>

            <!-- Scrollable body -->
            <div class="cb-body">

                <!-- Name -->
                <div class="cb-section">
                    <label class="cb-label" for="cb-name">Name</label>
                    <input class="cb-name-input" id="cb-name" type="text"
                           value="${escHtml(this._pendingName)}"
                           placeholder="Character name…" maxlength="80" autocomplete="off">
                </div>

                <!-- Colors -->
                <div class="cb-section">
                    <div class="cb-section-title">Colors</div>
                    ${this._colorRow('cb-scalp',  'Hair / Scalp', state.scalpColor)}
                    ${this._colorRow('cb-skin',   'Skin',         state.skinColor)}
                    ${this._colorRow('cb-torso',  'Top / Torso',  state.torsoColor)}
                    ${this._colorRow('cb-bottom', 'Bottom',       state.bottomColor)}
                </div>

                <!-- Body size -->
                <div class="cb-section">
                    <div class="cb-section-title">Body</div>
                    ${this._presetRow('height', 'Height', ['squat','medium','tall'], state.heightPreset)}
                    ${this._presetRow('width',  'Width',  ['narrow','moderate','wide'], state.widthPreset)}
                </div>

                <!-- Head size -->
                <div class="cb-section">
                    <div class="cb-section-title">Head</div>
                    ${this._presetRow('headHeight', 'Height', ['squat','medium','tall'], state.headHeightPreset)}
                    ${this._presetRow('headWidth',  'Width',  ['narrow','moderate','wide'], state.headWidthPreset)}
                </div>

                <!-- Hint -->
                <p class="cb-hint">Open the full Character Builder for more options.</p>

            </div><!-- /.cb-body -->

            <!-- Footer -->
            <div class="cb-footer">
                <button class="cb-save-btn" id="cb-save-btn">Save Character</button>
            </div>
        `;

        this._wireEvents();
    }

    _colorRow(id, label, value) {
        return `
            <div class="cb-color-row">
                <span class="cb-color-label">${label}</span>
                <input class="cb-color" id="${id}" type="color" value="${value}">
            </div>`;
    }

    _presetRow(preset, label, keys, activeKey) {
        const btns = keys.map(k => `
            <button class="cb-preset${activeKey === k ? ' active' : ''}"
                    data-preset="${preset}" data-key="${k}">
                ${k.charAt(0).toUpperCase() + k.slice(1)}
            </button>`).join('');
        return `
            <div class="cb-preset-row">
                <span class="cb-preset-label">${label}</span>
                <div class="cb-preset-btns">${btns}</div>
            </div>`;
    }

    _wireEvents() {
        const panel = this.panelEl;
        const char  = this._character;

        // Cancel
        panel.querySelector('#cb-cancel-btn').addEventListener('click', () => {
            this.onCancel?.();
        });

        // Name — sync to local state without re-rendering
        const nameInput = panel.querySelector('#cb-name');
        nameInput.addEventListener('input', (e) => {
            this._pendingName = e.target.value;
        });

        // Color pickers (live preview as user drags)
        panel.querySelector('#cb-scalp') .addEventListener('input', (e) => char.setScalpColor(e.target.value));
        panel.querySelector('#cb-skin')  .addEventListener('input', (e) => char.setSkinColor(e.target.value));
        panel.querySelector('#cb-torso') .addEventListener('input', (e) => char.setTorsoColor(e.target.value));
        panel.querySelector('#cb-bottom').addEventListener('input', (e) => char.setBottomColor(e.target.value));

        // Preset buttons — rebuild character then re-render panel to update active states
        panel.querySelectorAll('.cb-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                this._pendingName = panel.querySelector('#cb-name').value; // preserve name
                const { preset, key } = btn.dataset;
                switch (preset) {
                    case 'height':     char.setHeightPreset(key);      break;
                    case 'width':      char.setWidthPreset(key);       break;
                    case 'headHeight': char.setHeadHeightPreset(key);  break;
                    case 'headWidth':  char.setHeadWidthPreset(key);   break;
                }
                this._renderPanel(); // re-render to update active highlights
            });
        });

        // Save
        panel.querySelector('#cb-save-btn').addEventListener('click', () => this._save());
    }

    async _save() {
        const state = this._character.getState();
        const name  = (this.panelEl.querySelector('#cb-name')?.value.trim()) || 'Untitled Character';

        // Capture thumbnail from current renderer frame
        const thumbnail = this._renderer.domElement.toDataURL('image/jpeg', 0.8);

        if (this._currentAsset) {
            this._currentAsset.name              = name;
            this._currentAsset.state             = { ...state };
            this._currentAsset.meta.modified     = Date.now();
            this._currentAsset.meta.thumbnail    = thumbnail;
            await dbSave(this._currentAsset);
        } else {
            this._currentAsset = createAsset(state, name);
            this._currentAsset.meta.thumbnail = thumbnail;
            await dbSave(this._currentAsset);
        }

        this.onSave?.(this._currentAsset);
    }
}

/* ── Utility ─────────────────────────────────────────────── */
function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
