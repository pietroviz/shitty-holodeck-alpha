import { BaseBridge } from './BaseBridge.js';
import * as THREE from 'three';
import { standard } from '../shared/materials.js';

export class MusicBridge extends BaseBridge {
    constructor(sceneContainer, panelEl, options = {}) {
        super(sceneContainer, panelEl, options);
        this.displayName = 'Music';
        this.storeName   = 'music';

        const d = this.asset?.payload?.state || this.asset?.state || {};
        this._state = {
            bpm:   d.bpm   || 120,
            genre: d.genre || 'Electronic',
            mood:  d.mood  || 'Energetic',
        };

        this._meshes = [];
    }

    _buildScene() {
        this._camera.position.set(0, 3, 5);
        this._camera.lookAt(0, 0, 0);
        this._camera.fov = 75;
        this._camera.updateProjectionMatrix();

        // Rotating visualiser shapes
        const shapes = [
            { geo: new THREE.OctahedronGeometry(0.5), color: 0xff4444, pos: [0, 1.5, 0],    axis: [1,1,1]  },
            { geo: new THREE.BoxGeometry(0.4, 0.4, 0.4), color: 0x00ffff, pos: [1, 2, -1],   axis: [0,1,0.5] },
            { geo: new THREE.SphereGeometry(0.3, 32, 24), color: 0xffff00, pos: [-1.5, 1, 0.5], axis: [1,0,1] },
        ];

        for (const s of shapes) {
            const mesh = new THREE.Mesh(s.geo, standard(s.color));
            mesh.position.set(...s.pos);
            mesh.userData.rotAxis = new THREE.Vector3(...s.axis).normalize();
            this._scene.add(mesh);
            this._meshes.push(mesh);
        }
    }

    _onTick() {
        for (const m of this._meshes) {
            if (m.userData.rotAxis) m.rotateOnWorldAxis(m.userData.rotAxis, 0.005);
        }
    }

    _renderPanelBody() {
        const name = _esc(this.asset?.name || '');
        const s    = this._state;
        return `
          <div class="cb-section">
            <input type="text" class="bridge-name-input cb-name-input"
                   value="${name}" placeholder="Music name...">
          </div>
          <div class="cb-section">
            <div class="cb-section-title">Tempo</div>
            <div class="cb-color-row">
              <label class="cb-color-label">BPM:</label>
              <input type="number" class="cb-input" data-property="bpm"
                     value="${s.bpm}" min="40" max="300" step="1">
            </div>
          </div>
          <div class="cb-section">
            <div class="cb-section-title">Genre</div>
            <div class="cb-color-row">
              <input type="text" class="cb-input" data-property="genre"
                     value="${_esc(s.genre)}" placeholder="e.g. Electronic, Jazz...">
            </div>
          </div>
          <div class="cb-section">
            <div class="cb-section-title">Mood</div>
            <div class="cb-color-row">
              <input type="text" class="cb-input" data-property="mood"
                     value="${_esc(s.mood)}" placeholder="e.g. Energetic, Calm...">
            </div>
          </div>`;
    }

    _wirePanelEvents() {
        this.panelEl.querySelectorAll('.cb-input').forEach(inp => {
            const handler = () => {
                const prop = inp.dataset.property;
                this._state[prop] = inp.type === 'number' ? parseInt(inp.value) : inp.value;
            };
            inp.addEventListener('input', handler);
            inp.addEventListener('change', handler);
        });
    }

    _getState() {
        return { ...this._state };
    }

    _applyState(state) {
        this._state = { ...state };
    }
}

function _esc(t) { return String(t).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[m]); }
