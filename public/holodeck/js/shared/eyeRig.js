import * as THREE from 'three';
import { EYE_RIG, EYE_SHAPES, EYELASH_STYLES } from './charConfig.js';

const SIZE = EYE_RIG.canvasSize;
const HALF = SIZE / 2;

export class EyeRig {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.canvas.width = SIZE;
        this.canvas.height = SIZE;
        this.ctx = this.canvas.getContext('2d');
        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.minFilter = THREE.LinearFilter;
        this.texture.magFilter = THREE.LinearFilter;

        this.geometry = new THREE.PlaneGeometry(EYE_RIG.planeSize, EYE_RIG.planeSize);
        this.material = new THREE.MeshBasicMaterial({
            map: this.texture, transparent: true, depthWrite: false, side: THREE.FrontSide,
        });
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.name = 'eyeRigPlane';

        this.params = {
            openness: 1.0, squint: 0.0, brow: 0.0,
            lookX: 0.0, lookY: 0.0,
            irisColor: EYE_RIG.irisColor,
            pupilSize: EYE_RIG.pupilSize,
            irisSize: EYE_RIG.irisSize,
            shape: 'circle',
            eyelashStyle: 'none',
            eyelashColor: '#1a1a1a',
        };
        this._dirty = true;
        this._render();
    }

    attach(parent, x, y, z) {
        this.mesh.position.set(x, y, z);
        parent.add(this.mesh);
    }

    update(newParams) {
        if (!newParams) return;
        let changed = false;
        for (const key of Object.keys(newParams)) {
            if (this.params[key] !== undefined && this.params[key] !== newParams[key]) {
                this.params[key] = newParams[key];
                changed = true;
            }
        }
        if (changed) { this._dirty = true; this._render(); }
    }

    setIrisColor(hex) {
        if (this.params.irisColor === hex) return;
        this.params.irisColor = hex;
        this._dirty = true; this._render();
    }

    setPupilSize(val) {
        val = Math.max(0.15, Math.min(0.7, val));
        if (this.params.pupilSize === val) return;
        this.params.pupilSize = val;
        this._dirty = true; this._render();
    }

    setShape(key) {
        if (!EYE_SHAPES[key] || this.params.shape === key) return;
        this.params.shape = key;
        this._dirty = true; this._render();
    }

    setEyelashStyle(style) {
        if (this.params.eyelashStyle === style) return;
        this.params.eyelashStyle = style;
        this._dirty = true; this._render();
    }

    setEyelashColor(color) {
        if (this.params.eyelashColor === color) return;
        this.params.eyelashColor = color;
        this._dirty = true; this._render();
    }

    _roundedRectPath(ctx, cx, cy, halfW, halfH, r) {
        const x = cx - halfW, y = cy - halfH, w = halfW * 2, h = halfH * 2;
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

    _render() {
        if (!this._dirty) return;
        this._dirty = false;
        const ctx = this.ctx;
        const p = this.params;
        const shape = EYE_SHAPES[p.shape] || EYE_SHAPES.circle;

        ctx.clearRect(0, 0, SIZE, SIZE);
        const cx = HALF, cy = HALF;
        const baseRadius = HALF * 0.78;
        const scleraRx = baseRadius * shape.rxMul;
        const effectiveOpen = Math.max(0.05, p.openness * (1 - p.squint * 0.6));
        const scleraRy = baseRadius * shape.ryMul * effectiveOpen;

        ctx.save();
        if (shape.rounded) {
            const cornerR = Math.min(scleraRx, scleraRy) * 0.45;
            this._roundedRectPath(ctx, cx, cy, scleraRx, scleraRy, cornerR);
            ctx.fillStyle = EYE_RIG.scleraColor; ctx.fill();
            this._roundedRectPath(ctx, cx, cy, scleraRx, scleraRy, cornerR);
            ctx.clip();
        } else {
            ctx.beginPath();
            ctx.ellipse(cx, cy, scleraRx, scleraRy, 0, 0, Math.PI * 2);
            ctx.fillStyle = EYE_RIG.scleraColor; ctx.fill(); ctx.clip();
        }

        const irisRadius = baseRadius * p.irisSize;
        const maxShift = baseRadius * 0.25;
        const irisX = cx + p.lookX * maxShift;
        const irisY = cy - p.lookY * maxShift;

        ctx.beginPath();
        ctx.arc(irisX, irisY, irisRadius, 0, Math.PI * 2);
        ctx.fillStyle = p.irisColor; ctx.fill();

        const pupilRadius = irisRadius * p.pupilSize;
        ctx.beginPath();
        ctx.arc(irisX, irisY, pupilRadius, 0, Math.PI * 2);
        ctx.fillStyle = EYE_RIG.pupilColor; ctx.fill();

        const hlRadius = baseRadius * EYE_RIG.highlightSize;
        const hlX = irisX + irisRadius * 0.25;
        const hlY = irisY - irisRadius * 0.3;
        ctx.beginPath();
        ctx.arc(hlX, hlY, hlRadius, 0, Math.PI * 2);
        ctx.fillStyle = EYE_RIG.highlightColor;
        ctx.globalAlpha = 0.7; ctx.fill(); ctx.globalAlpha = 1.0;
        ctx.restore();

        // Eyelid outline
        if (shape.rounded) {
            const cornerR = Math.min(scleraRx, scleraRy) * 0.45;
            this._roundedRectPath(ctx, cx, cy, scleraRx, scleraRy, cornerR);
        } else {
            ctx.beginPath();
            ctx.ellipse(cx, cy, scleraRx, scleraRy, 0, 0, Math.PI * 2);
        }
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)'; ctx.lineWidth = 2; ctx.stroke();

        // Upper lid shadow
        if (effectiveOpen < 0.95) {
            if (shape.rounded) {
                const cornerR = Math.min(scleraRx, scleraRy) * 0.45;
                ctx.beginPath();
                ctx.moveTo(cx - scleraRx, cy);
                ctx.lineTo(cx - scleraRx, cy - scleraRy + cornerR);
                ctx.quadraticCurveTo(cx - scleraRx, cy - scleraRy, cx - scleraRx + cornerR, cy - scleraRy);
                ctx.lineTo(cx + scleraRx - cornerR, cy - scleraRy);
                ctx.quadraticCurveTo(cx + scleraRx, cy - scleraRy, cx + scleraRx, cy - scleraRy + cornerR);
                ctx.lineTo(cx + scleraRx, cy);
            } else {
                ctx.beginPath();
                ctx.ellipse(cx, cy, scleraRx, scleraRy, 0, Math.PI, Math.PI * 2);
            }
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)'; ctx.lineWidth = 3; ctx.stroke();
        }

        // ── Eyelashes ──
        const lashCfg = EYELASH_STYLES[p.eyelashStyle];
        if (lashCfg && p.eyelashStyle !== 'none') {
            ctx.strokeStyle = p.eyelashColor || '#1a1a1a';
            ctx.lineWidth = lashCfg.width || 1.8;
            ctx.lineCap = 'round';
            const baseR = HALF * 0.78;

            if (!lashCfg.bottomOnly) {
                const count = lashCfg.count;
                const spread = Math.PI * 0.7;
                const startAngle = -Math.PI / 2 - spread / 2;
                for (let i = 0; i < count; i++) {
                    const t = count === 1 ? 0.5 : i / (count - 1);
                    const angle = startAngle + t * spread;
                    const sx = cx + Math.cos(angle) * scleraRx;
                    const sy = cy + Math.sin(angle) * scleraRy;
                    const len = baseR * lashCfg.length * (1 - 0.3 * Math.abs(t - 0.5));
                    const curveAmt = baseR * lashCfg.curve;
                    const ex = sx + Math.cos(angle) * len;
                    const ey = sy + Math.sin(angle) * len;
                    const cpx = sx + Math.cos(angle) * len * 0.6 - curveAmt * Math.sin(angle) * 0.3;
                    const cpy = sy + Math.sin(angle) * len * 0.6 - curveAmt;
                    ctx.beginPath();
                    ctx.moveTo(sx, sy);
                    ctx.quadraticCurveTo(cpx, cpy, ex, ey);
                    ctx.stroke();
                }
            }

            if (lashCfg.bottomOnly || p.eyelashStyle === 'dramatic') {
                const bCount = lashCfg.bottomOnly ? lashCfg.count : Math.max(2, lashCfg.count - 2);
                const bSpread = Math.PI * 0.5;
                const bStart = Math.PI / 2 - bSpread / 2;
                const bLen = baseR * (lashCfg.bottomOnly ? lashCfg.length : lashCfg.length * 0.5);
                for (let i = 0; i < bCount; i++) {
                    const t = bCount === 1 ? 0.5 : i / (bCount - 1);
                    const angle = bStart + t * bSpread;
                    const sx = cx + Math.cos(angle) * scleraRx;
                    const sy = cy + Math.sin(angle) * scleraRy;
                    const len = bLen * (1 - 0.3 * Math.abs(t - 0.5));
                    const ex = sx + Math.cos(angle) * len;
                    const ey = sy + Math.sin(angle) * len;
                    ctx.beginPath();
                    ctx.moveTo(sx, sy);
                    ctx.lineTo(ex, ey);
                    ctx.stroke();
                }
            }
        }

        this.texture.needsUpdate = true;
    }

    dispose() {
        this.geometry.dispose();
        this.material.dispose();
        this.texture.dispose();
        if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
    }
}

// ── Blink Controller ────────────────────────────────────

export class BlinkController {
    constructor() {
        this._pairs = [];
        this._timer = 0;
        this._nextBlink = this._randomInterval();
        this._blinking = false;
        this._blinkPhase = 0;
        this._blinkTime = 0;
        this._doubleBlink = false;
        this._doubleBlinkDone = false;
    }

    register(left, right) { this._pairs.push({ left, right }); }
    clear() { this._pairs = []; }

    _randomInterval() { return 2000 + Math.random() * 4000; }

    update(deltaMs) {
        if (this._pairs.length === 0) return;
        if (this._blinking) this._updateBlink(deltaMs);
        else {
            this._timer += deltaMs;
            if (this._timer >= this._nextBlink) this._startBlink();
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
        const CLOSE_MS = 80, HOLD_MS = 50, OPEN_MS = 80, GAP_MS = 150;
        let openness = 1.0;

        if (this._blinkPhase === 0) {
            const t = Math.min(1, this._blinkTime / CLOSE_MS);
            openness = 1.0 - t;
            if (t >= 1) { this._blinkPhase = 1; this._blinkTime = 0; }
        } else if (this._blinkPhase === 1) {
            openness = 0;
            if (this._blinkTime >= HOLD_MS) { this._blinkPhase = 2; this._blinkTime = 0; }
        } else if (this._blinkPhase === 2) {
            const t = Math.min(1, this._blinkTime / OPEN_MS);
            openness = t;
            if (t >= 1) {
                if (this._doubleBlink && !this._doubleBlinkDone) {
                    this._blinkPhase = 3; this._blinkTime = 0; this._doubleBlinkDone = true;
                } else { this._finishBlink(); return; }
            }
        } else if (this._blinkPhase === 3) {
            openness = 1.0;
            if (this._blinkTime >= GAP_MS) { this._blinkPhase = 0; this._blinkTime = 0; }
        }

        for (const pair of this._pairs) {
            pair.left.update({ openness });
            pair.right.update({ openness });
        }
    }

    _finishBlink() {
        this._blinking = false;
        this._timer = 0;
        this._nextBlink = this._randomInterval();
        for (const pair of this._pairs) {
            pair.left.update({ openness: 1.0 });
            pair.right.update({ openness: 1.0 });
        }
    }
}
