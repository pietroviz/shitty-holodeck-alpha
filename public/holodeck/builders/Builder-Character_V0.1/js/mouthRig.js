import * as THREE from 'three';
import { MOUTH_RIG, VISEMES } from './config.js';

// ── Canvas Mouth Renderer ────────────────────────────
// Draws mouth components (interior, teeth, tongue, lips) via Canvas2D,
// then maps the canvas as a CanvasTexture onto a Three.js plane.
// Viseme parameters drive the mouth shape each frame.

const SIZE = MOUTH_RIG.canvasSize; // 256
const HALF = SIZE / 2;

// VoiceBox mouth operates in a ~120×80 unit space centered at origin.
// We scale to fill the center of our 256px canvas.
const SCALE = SIZE / 120; // ≈2.13

export class MouthRig {
    constructor() {
        // Canvas & texture
        this.canvas = document.createElement('canvas');
        this.canvas.width = SIZE;
        this.canvas.height = SIZE;
        this.ctx = this.canvas.getContext('2d');
        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.minFilter = THREE.LinearFilter;
        this.texture.magFilter = THREE.LinearFilter;

        // Three.js plane
        this.geometry = new THREE.PlaneGeometry(MOUTH_RIG.planeSize, MOUTH_RIG.planeSize);
        this.material = new THREE.MeshBasicMaterial({
            map: this.texture,
            transparent: true,
            depthWrite: false,
            side: THREE.FrontSide,
        });
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.name = 'mouthRigPlane';

        // Current viseme params (interpolated)
        this.currentParams = { jawOpen: 0, lipWidth: 0.45, lipRound: 0, tongueUp: 0, teethShow: 0 };

        // Appearance
        this.lipColor = MOUTH_RIG.lipColor;
        this.lipThickness = MOUTH_RIG.lipThickness;

        // Dirty flag for efficient redraws
        this._dirty = true;

        // Initial render
        this._render();
    }

    /**
     * Position and add the mouth plane to the given parent group.
     * @param {THREE.Group} anchorGroup — face anchor parented to Spine2
     * @param {number} cy — Y offset from Spine2 to face center
     * @param {number} mouthYOffset — additional Y offset to move mouth below face center
     * @param {number} faceZ — Z position (front of body surface)
     */
    attach(anchorGroup, cy, mouthYOffset, faceZ) {
        this.mesh.position.set(0, cy - mouthYOffset, faceZ + 0.002);
        anchorGroup.add(this.mesh);
    }

    /**
     * Update mouth with new viseme parameters.
     * Only redraws the canvas if params have changed.
     */
    update(params) {
        if (!params) return;

        // Check for changes
        let changed = false;
        for (const key of Object.keys(this.currentParams)) {
            if (params[key] !== undefined && Math.abs(params[key] - this.currentParams[key]) > 0.001) {
                this.currentParams[key] = params[key];
                changed = true;
            }
        }

        if (changed || this._dirty) {
            this._render();
            this.texture.needsUpdate = true;
            this._dirty = false;
        }
    }

    /**
     * Render mouth to canvas using Canvas2D.
     * Translates VoiceBox's MouthRenderer formulas to canvas drawing calls.
     */
    _render() {
        const ctx = this.ctx;
        const p = this.currentParams;

        // Clear to transparent
        ctx.clearRect(0, 0, SIZE, SIZE);

        ctx.save();
        // Move origin to center of canvas, apply scale
        ctx.translate(HALF, HALF);
        ctx.scale(SCALE, SCALE);

        // Compute mouth dimensions from viseme params
        const openRx = 30 + p.lipWidth * 20 - p.lipRound * 12;
        const openRy = 2 + p.jawOpen * 28;

        // ── Dark interior ────────────────────────────
        ctx.beginPath();
        ctx.ellipse(0, 0, openRx, openRy, 0, 0, Math.PI * 2);
        ctx.fillStyle = MOUTH_RIG.interiorColor;
        ctx.fill();

        // ── Clip to mouth opening for teeth & tongue ─
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(0, 0, openRx, openRy, 0, 0, Math.PI * 2);
        ctx.clip();

        // ── Tongue ───────────────────────────────────
        const tongueY = 8 - p.tongueUp * 16;
        const tongueRx = openRx * 0.6;
        const tongueRy = 10 + p.jawOpen * 8;
        ctx.beginPath();
        ctx.ellipse(0, tongueY, tongueRx, tongueRy, 0, 0, Math.PI * 2);
        ctx.fillStyle = MOUTH_RIG.tongueColor;
        ctx.fill();

        // ── Teeth ────────────────────────────────────
        const teethW = openRx * 1.6;
        const jawGate = Math.min(1, p.jawOpen * 8);
        const teethOpacity = p.teethShow > 0.05 ? jawGate : 0;

        if (teethOpacity > 0.01) {
            // Upper teeth
            const upperH = 6 + p.teethShow * 14;
            ctx.globalAlpha = teethOpacity;
            ctx.beginPath();
            _roundRect(ctx, -teethW / 2, -openRy - 2, teethW, upperH, 2);
            ctx.fillStyle = MOUTH_RIG.upperTeethColor;
            ctx.fill();

            // Lower teeth
            const lowerTeethW = teethW * 0.85;
            const lowerH = 5 + p.teethShow * 8;
            ctx.globalAlpha = teethOpacity * 0.9;
            ctx.beginPath();
            _roundRect(ctx, -lowerTeethW / 2, openRy - 4 - p.teethShow * 6, lowerTeethW, lowerH, 2);
            ctx.fillStyle = MOUTH_RIG.lowerTeethColor;
            ctx.fill();

            ctx.globalAlpha = 1;
        }

        ctx.restore(); // Remove clip

        // ── Lip outline ──────────────────────────────
        const halfStroke = this.lipThickness / 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, openRx + halfStroke, openRy + halfStroke, 0, 0, Math.PI * 2);
        ctx.strokeStyle = this.lipColor;
        ctx.lineWidth = this.lipThickness;
        ctx.stroke();

        ctx.restore(); // Remove translate/scale
    }

    /**
     * Set REST viseme (used when not speaking).
     */
    setRest() {
        this.update(VISEMES.REST);
    }

    /**
     * Update lip color at runtime.
     */
    setLipColor(hex) {
        this.lipColor = hex;
        this._dirty = true;
        this._render();
    }

    /**
     * Update lip stroke thickness at runtime.
     */
    setLipThickness(val) {
        this.lipThickness = val;
        this._dirty = true;
        this._render();
    }

    dispose() {
        this.geometry.dispose();
        this.material.dispose();
        this.texture.dispose();
        if (this.mesh.parent) {
            this.mesh.parent.remove(this.mesh);
        }
    }
}

// ── Helper: rounded rect path (canvas doesn't have native roundRect in all browsers) ──
function _roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}
