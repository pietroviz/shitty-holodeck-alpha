/**
 * eyeRig.js — Canvas2D morphable eye renderer on a Three.js plane.
 *
 * Each eye is a 128×128 transparent canvas drawn with:
 *   sclera ellipse/roundedRect → iris circle → pupil circle → specular highlight
 * Parameters like openness, squint, lookX/Y, irisColor, pupilSize, shape
 * can be animated for expressions (blink, wink, surprise, etc.).
 */

import * as THREE from 'three';
import { EYE_RIG, EYE_SHAPES } from './config.js';

const SIZE = EYE_RIG.canvasSize;   // 128
const HALF = SIZE / 2;

export class EyeRig {
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
        this.geometry = new THREE.PlaneGeometry(EYE_RIG.planeSize, EYE_RIG.planeSize);
        this.material = new THREE.MeshBasicMaterial({
            map: this.texture,
            transparent: true,
            depthWrite: false,
            side: THREE.FrontSide,
        });
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.name = 'eyeRigPlane';

        // Morphable parameters
        this.params = {
            openness:  1.0,            // 0 = closed, 1 = wide open
            squint:    0.0,            // 0–1, narrows vertically
            brow:      0.0,            // -1 to 1 (negative = sad, positive = angry)
            lookX:     0.0,            // -1 to 1, horizontal gaze
            lookY:     0.0,            // -1 to 1, vertical gaze
            irisColor: EYE_RIG.irisColor,
            pupilSize: EYE_RIG.pupilSize,
            irisSize:  EYE_RIG.irisSize,
            shape:     'circle',
        };

        this._dirty = true;
        this._render();
    }

    /**
     * Attach eye plane to a parent group at a specific position.
     */
    attach(parent, x, y, z) {
        this.mesh.position.set(x, y, z);
        parent.add(this.mesh);
    }

    /**
     * Update morphable parameters. Only redraws if something changed.
     */
    update(newParams) {
        if (!newParams) return;
        let changed = false;
        for (const key of Object.keys(newParams)) {
            if (this.params[key] !== undefined && this.params[key] !== newParams[key]) {
                this.params[key] = newParams[key];
                changed = true;
            }
        }
        if (changed) {
            this._dirty = true;
            this._render();
        }
    }

    /**
     * Change iris color at runtime.
     */
    setIrisColor(hex) {
        if (this.params.irisColor === hex) return;
        this.params.irisColor = hex;
        this._dirty = true;
        this._render();
    }

    /**
     * Change pupil size at runtime.
     */
    setPupilSize(val) {
        val = Math.max(0.15, Math.min(0.7, val));
        if (this.params.pupilSize === val) return;
        this.params.pupilSize = val;
        this._dirty = true;
        this._render();
    }

    /**
     * Change eye shape at runtime.
     */
    setShape(key) {
        if (!EYE_SHAPES[key] || this.params.shape === key) return;
        this.params.shape = key;
        this._dirty = true;
        this._render();
    }

    /**
     * Internal: draw a rounded rectangle path.
     */
    _roundedRectPath(ctx, cx, cy, halfW, halfH, r) {
        const x = cx - halfW;
        const y = cy - halfH;
        const w = halfW * 2;
        const h = halfH * 2;
        const radius = Math.min(r, halfW, halfH);
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + w - radius, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
        ctx.lineTo(x + w, y + h - radius);
        ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
        ctx.lineTo(x + radius, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    /**
     * Internal: render the eye onto the canvas.
     */
    _render() {
        if (!this._dirty) return;
        this._dirty = false;

        const ctx = this.ctx;
        const p = this.params;
        const shape = EYE_SHAPES[p.shape] || EYE_SHAPES.circle;

        // Clear
        ctx.clearRect(0, 0, SIZE, SIZE);

        const cx = HALF;
        const cy = HALF;

        // ── Sclera dimensions ──────────────────────────
        const baseRadius = HALF * 0.78;
        const scleraRx = baseRadius * shape.rxMul;
        const effectiveOpen = Math.max(0.05, p.openness * (1 - p.squint * 0.6));
        const scleraRy = baseRadius * shape.ryMul * effectiveOpen;

        // ── Draw sclera ────────────────────────────────
        ctx.save();
        if (shape.rounded) {
            // Rounded rectangle sclera
            const cornerR = Math.min(scleraRx, scleraRy) * 0.45;
            this._roundedRectPath(ctx, cx, cy, scleraRx, scleraRy, cornerR);
            ctx.fillStyle = EYE_RIG.scleraColor;
            ctx.fill();
            // Clip to sclera
            this._roundedRectPath(ctx, cx, cy, scleraRx, scleraRy, cornerR);
            ctx.clip();
        } else {
            // Ellipse sclera
            ctx.beginPath();
            ctx.ellipse(cx, cy, scleraRx, scleraRy, 0, 0, Math.PI * 2);
            ctx.fillStyle = EYE_RIG.scleraColor;
            ctx.fill();
            ctx.clip();
        }

        // ── Iris ───────────────────────────────────────
        const irisRadius = baseRadius * p.irisSize;
        const maxShift = baseRadius * 0.25;
        const irisX = cx + p.lookX * maxShift;
        const irisY = cy - p.lookY * maxShift;

        ctx.beginPath();
        ctx.arc(irisX, irisY, irisRadius, 0, Math.PI * 2);
        ctx.fillStyle = p.irisColor;
        ctx.fill();

        // ── Pupil ──────────────────────────────────────
        const pupilRadius = irisRadius * p.pupilSize;

        ctx.beginPath();
        ctx.arc(irisX, irisY, pupilRadius, 0, Math.PI * 2);
        ctx.fillStyle = EYE_RIG.pupilColor;
        ctx.fill();

        // ── Specular highlight ─────────────────────────
        const hlRadius = baseRadius * EYE_RIG.highlightSize;
        const hlX = irisX + irisRadius * 0.25;
        const hlY = irisY - irisRadius * 0.3;

        ctx.beginPath();
        ctx.arc(hlX, hlY, hlRadius, 0, Math.PI * 2);
        ctx.fillStyle = EYE_RIG.highlightColor;
        ctx.globalAlpha = 0.7;
        ctx.fill();
        ctx.globalAlpha = 1.0;

        ctx.restore();

        // ── Eyelid edges (outline) ─────────────────────
        if (shape.rounded) {
            const cornerR = Math.min(scleraRx, scleraRy) * 0.45;
            this._roundedRectPath(ctx, cx, cy, scleraRx, scleraRy, cornerR);
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
            ctx.lineWidth = 2;
            ctx.stroke();
        } else {
            ctx.beginPath();
            ctx.ellipse(cx, cy, scleraRx, scleraRy, 0, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // Upper eyelid shadow
        if (effectiveOpen < 0.95) {
            if (shape.rounded) {
                const cornerR = Math.min(scleraRx, scleraRy) * 0.45;
                // Draw top edge only
                ctx.beginPath();
                ctx.moveTo(cx - scleraRx, cy);
                ctx.lineTo(cx - scleraRx, cy - scleraRy + cornerR);
                ctx.quadraticCurveTo(cx - scleraRx, cy - scleraRy, cx - scleraRx + cornerR, cy - scleraRy);
                ctx.lineTo(cx + scleraRx - cornerR, cy - scleraRy);
                ctx.quadraticCurveTo(cx + scleraRx, cy - scleraRy, cx + scleraRx, cy - scleraRy + cornerR);
                ctx.lineTo(cx + scleraRx, cy);
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
                ctx.lineWidth = 3;
                ctx.stroke();
            } else {
                ctx.beginPath();
                ctx.ellipse(cx, cy, scleraRx, scleraRy, 0, Math.PI, Math.PI * 2);
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
                ctx.lineWidth = 3;
                ctx.stroke();
            }
        }

        this.texture.needsUpdate = true;
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

// ── Blink Controller ────────────────────────────────────
// Drives random synchronized blinks across all registered eye pairs.

export class BlinkController {
    constructor() {
        this._pairs = [];         // [{ left: EyeRig, right: EyeRig }]
        this._timer = 0;
        this._nextBlink = this._randomInterval();
        this._blinking = false;
        this._blinkPhase = 0;     // 0=closing, 1=hold, 2=opening
        this._blinkTime = 0;
        this._doubleBlink = false;
        this._doubleBlinkDone = false;
    }

    register(left, right) {
        this._pairs.push({ left, right });
    }

    clear() {
        this._pairs = [];
    }

    _randomInterval() {
        return 2000 + Math.random() * 4000;  // 2–6 seconds
    }

    update(deltaMs) {
        if (this._pairs.length === 0) return;

        if (this._blinking) {
            this._updateBlink(deltaMs);
        } else {
            this._timer += deltaMs;
            if (this._timer >= this._nextBlink) {
                this._startBlink();
            }
        }
    }

    _startBlink() {
        this._blinking = true;
        this._blinkPhase = 0;
        this._blinkTime = 0;
        this._doubleBlink = Math.random() < 0.15;
        this._doubleBlinkDone = false;
    }

    _updateBlink(deltaMs) {
        this._blinkTime += deltaMs;

        const CLOSE_MS = 80;
        const HOLD_MS = 50;
        const OPEN_MS = 80;
        const GAP_MS = 150;

        let openness = 1.0;

        if (this._blinkPhase === 0) {
            // Closing
            const t = Math.min(1, this._blinkTime / CLOSE_MS);
            openness = 1.0 - t;
            if (t >= 1) {
                this._blinkPhase = 1;
                this._blinkTime = 0;
            }
        } else if (this._blinkPhase === 1) {
            // Hold closed
            openness = 0;
            if (this._blinkTime >= HOLD_MS) {
                this._blinkPhase = 2;
                this._blinkTime = 0;
            }
        } else if (this._blinkPhase === 2) {
            // Opening
            const t = Math.min(1, this._blinkTime / OPEN_MS);
            openness = t;
            if (t >= 1) {
                // Check for double blink
                if (this._doubleBlink && !this._doubleBlinkDone) {
                    this._blinkPhase = 3; // gap before second blink
                    this._blinkTime = 0;
                    this._doubleBlinkDone = true;
                } else {
                    this._finishBlink();
                    return;
                }
            }
        } else if (this._blinkPhase === 3) {
            // Gap between double blinks
            openness = 1.0;
            if (this._blinkTime >= GAP_MS) {
                this._blinkPhase = 0;
                this._blinkTime = 0;
            }
        }

        // Apply openness to all registered eyes
        for (const pair of this._pairs) {
            pair.left.update({ openness });
            pair.right.update({ openness });
        }
    }

    _finishBlink() {
        this._blinking = false;
        this._timer = 0;
        this._nextBlink = this._randomInterval();
        // Restore fully open
        for (const pair of this._pairs) {
            pair.left.update({ openness: 1.0 });
            pair.right.update({ openness: 1.0 });
        }
    }
}
