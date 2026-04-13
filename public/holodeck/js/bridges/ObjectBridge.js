import { BaseBridge } from './BaseBridge.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { UI }       from '../shared/palette.js';
import { standard } from '../shared/materials.js';
import { renderProp } from '../shared/propRenderer.js';

export class ObjectBridge extends BaseBridge {
    constructor(sceneContainer, panelEl, options = {}) {
        super(sceneContainer, panelEl, options);
        this.displayName = '3D Object';
        this.storeName   = 'objects';

        const d = this.asset?.payload?.state || this.asset?.state || {};
        const ed = this.asset?.payload?._editor || this.asset?._editor || {};

        // Color assignments — either from editor or from state overrides
        const colorAssignments = ed.color_assignments
            || this.asset?.payload?.color_assignments
            || d.colorAssignments
            || {};

        this._state = {
            objectColor: d.objectColor || colorAssignments.primary   || '#6F6F6F',
            roughness:   d.roughness   ?? 0.5,
            // Track all color role assignments
            colorAssignments: d.colorAssignments || { ...colorAssignments },
            // Editor elements carried forward (read-only reference)
            _hasEditor: !!(ed.elements?.length),
        };

        this._propGroup = null;
        this._orbitControls = null;
    }

    _buildScene() {
        this._camera.position.set(3, 2.5, 4);
        this._camera.lookAt(0, 0.5, 0);
        this._camera.fov = 50;
        this._camera.updateProjectionMatrix();

        // Orbit controls for inspecting the object
        this._orbitControls = new OrbitControls(this._camera, this._renderer.domElement);
        this._orbitControls.enableDamping = true;
        this._orbitControls.dampingFactor = 0.08;
        this._orbitControls.target.set(0, 0.5, 0);
        this._orbitControls.minDistance = 1;
        this._orbitControls.maxDistance = 12;

        // Try to render using prop data (_editor elements)
        const ed = this.asset?.payload?._editor || this.asset?._editor || {};
        const elements = ed.elements || [];

        if (elements.length > 0) {
            // Render the full prop with its element data
            this._renderPropElements();
        } else {
            // Fallback: simple box for new objects without element data
            this._renderFallbackBox();
        }

        // 1m reference square is inherited from BaseBridge._setupBaseScene()
    }

    /** Render the object using its _editor element data via propRenderer. */
    _renderPropElements() {
        // Remove any existing prop group
        if (this._propGroup) {
            this._scene.remove(this._propGroup);
            this._propGroup.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
        }

        // Build a synthetic propData structure for renderProp()
        const ed = this.asset?.payload?._editor || this.asset?._editor || {};
        const propData = {
            id: this.asset?.id || 'object',
            payload: {
                _editor: {
                    elements: ed.elements || [],
                    color_assignments: { ...this._state.colorAssignments },
                },
                color_assignments: { ...this._state.colorAssignments },
            },
        };

        this._propGroup = renderProp(propData);
        this._propGroup.userData.role = 'propGroup';
        this._scene.add(this._propGroup);

        // Auto-frame: compute bounding box and adjust camera
        const box = new THREE.Box3().setFromObject(this._propGroup);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = this._camera.fov * (Math.PI / 180);
        let cameraZ = (maxDim / 2) / Math.tan(fov / 2);
        cameraZ = Math.max(cameraZ * 1.5, 2);  // Add some padding

        this._camera.position.set(cameraZ * 0.7, center.y + cameraZ * 0.4, cameraZ * 0.7);
        this._camera.lookAt(center);
        if (this._orbitControls) {
            this._orbitControls.target.copy(center);
        }
    }

    /** Fallback rendering: a simple editable box. */
    _renderFallbackBox() {
        const box = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            standard(new THREE.Color(this._state.objectColor), { roughness: this._state.roughness }),
        );
        box.position.set(0, 0.5, 0);
        box.userData.role = 'mainObject';
        this._scene.add(box);
    }

    _onTick(delta) {
        if (this._orbitControls) this._orbitControls.update();
    }

    _renderPanelBody() {
        const name = _esc(this.asset?.name || '');
        const s    = this._state;
        const desc = _esc(this.asset?.payload?.description || '');

        // Build color role rows from color assignments
        let colorRolesHtml = '';
        if (s._hasEditor && Object.keys(s.colorAssignments).length > 0) {
            const roles = Object.entries(s.colorAssignments);
            colorRolesHtml = roles.map(([role, color]) => `
                <div class="cb-color-row">
                  <label class="cb-color-label">${_esc(_capitalize(role))}:</label>
                  <input type="color" class="cb-color cb-role-color" data-role="${_esc(role)}" value="${_esc(color)}">
                </div>
            `).join('');
        } else {
            // Fallback for objects without editor data
            colorRolesHtml = `
                <div class="cb-color-row">
                  <label class="cb-color-label">Color:</label>
                  <input type="color" class="cb-color" data-property="objectColor" value="${_esc(s.objectColor)}">
                </div>
            `;
        }

        return `
          <div class="cb-section">
            <input type="text" class="bridge-name-input cb-name-input"
                   value="${name}" placeholder="Object name...">
          </div>
          <div class="cb-section">
            <textarea class="cb-desc-input" placeholder="Describe this object..."
                      rows="2" maxlength="200">${desc}</textarea>
          </div>
          <div class="cb-section">
            <div class="cb-section-title">Colors</div>
            ${colorRolesHtml}
          </div>
          <div class="cb-section">
            <div class="cb-section-title">Surface</div>
            <div class="cb-color-row">
              <label class="cb-color-label">Roughness:</label>
              <input type="range" class="cb-range" data-property="roughness"
                     value="${s.roughness}" min="0" max="1" step="0.01">
            </div>
          </div>`;
    }

    _wirePanelEvents() {
        // Color role inputs (for objects with _editor elements)
        this.panelEl.querySelectorAll('.cb-role-color').forEach(inp => {
            const handler = () => {
                const role = inp.dataset.role;
                this._state.colorAssignments[role] = inp.value;
                this._renderPropElements();
            };
            inp.addEventListener('input', handler);
            inp.addEventListener('change', handler);
        });

        // Legacy single-color input (for objects without _editor)
        this.panelEl.querySelectorAll('.cb-color[data-property="objectColor"]').forEach(inp => {
            const handler = () => {
                this._state.objectColor = inp.value;
                this._updateFallbackObject();
            };
            inp.addEventListener('input', handler);
            inp.addEventListener('change', handler);
        });

        // Roughness slider
        this.panelEl.querySelectorAll('.cb-range').forEach(inp => {
            const handler = () => {
                this._state.roughness = parseFloat(inp.value);
                this._updateFallbackObject();
                // Also update roughness on prop elements
                if (this._propGroup) {
                    this._propGroup.traverse(child => {
                        if (child.material) child.material.roughness = this._state.roughness;
                    });
                }
            };
            inp.addEventListener('input', handler);
            inp.addEventListener('change', handler);
        });

        // Description textarea
        this.panelEl.querySelector('.cb-desc-input')?.addEventListener('input', (e) => {
            if (this.asset?.payload) {
                this.asset.payload.description = e.target.value;
            }
        });
    }

    /** Update the fallback box (for objects without _editor data). */
    _updateFallbackObject() {
        this._scene.traverse(obj => {
            if (obj.userData.role === 'mainObject' && obj.material) {
                obj.material.color.set(this._state.objectColor);
                obj.material.roughness = this._state.roughness;
            }
        });
    }

    _getState() {
        return {
            objectColor:      this._state.objectColor,
            roughness:        this._state.roughness,
            colorAssignments: { ...this._state.colorAssignments },
            _hasEditor:       this._state._hasEditor,
        };
    }

    _applyState(state) {
        this._state = { ...state };
        // Re-render the prop if it has editor elements
        if (this._state._hasEditor && this._propGroup) {
            this._renderPropElements();
        }
    }

    destroy() {
        if (this._orbitControls) {
            this._orbitControls.dispose();
            this._orbitControls = null;
        }
        super.destroy();
    }
}

function _esc(t) { return String(t).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[m]); }
function _capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
