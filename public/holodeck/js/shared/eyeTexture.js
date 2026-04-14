/**
 * eyeTexture.js — Shared canvas-based eye texture generator.
 *
 * Creates a CanvasTexture with sclera, iris, pupil, and specular highlight,
 * supporting multiple eye shapes (circle, tallPill, widePill, roundedSquare, etc.).
 */

import * as THREE from 'three';

// ── Eye shape configs ──
const SHAPES = {
    circle:        { rxMul: 1.0,  ryMul: 1.0,  rounded: false },
    tallPill:      { rxMul: 0.62, ryMul: 1.12, rounded: false },
    widePill:      { rxMul: 1.2,  ryMul: 0.58, rounded: false },
    roundedSquare: { rxMul: 0.88, ryMul: 0.88, rounded: true  },
    tallOval:      { rxMul: 0.72, ryMul: 1.08, rounded: false },
    wideOval:      { rxMul: 1.15, ryMul: 0.68, rounded: false },
};

// ── Eyelash configs ──
const LASH_STYLES = {
    thin:     { count: 4, length: 0.22, curve: 0.15, width: 1.5 },
    natural:  { count: 5, length: 0.28, curve: 0.20, width: 1.8 },
    thick:    { count: 6, length: 0.30, curve: 0.18, width: 2.5 },
    dramatic: { count: 7, length: 0.38, curve: 0.25, width: 2.0 },
    bottom:   { count: 3, length: 0.15, curve: 0.10, width: 1.5, bottomOnly: true },
};

/**
 * Create a canvas-based eye texture.
 * @param {string} irisColor — CSS color for the iris (e.g. '#4a7a8c')
 * @param {string} shape — eye shape key (e.g. 'circle', 'tallPill')
 * @param {string} [eyelashStyle] — eyelash style key (e.g. 'thin', 'dramatic', or 'none'/undefined)
 * @param {string} [eyelashColor] — CSS color for eyelashes (defaults to '#1a1a1a')
 * @returns {THREE.CanvasTexture}
 */
export function makeEyeTexture(irisColor, shape, eyelashStyle, eyelashColor) {
    const SIZE = 128, HALF = 64;
    const canvas = document.createElement('canvas');
    canvas.width = SIZE; canvas.height = SIZE;
    const ctx = canvas.getContext('2d');

    const sh = SHAPES[shape] || SHAPES.circle;
    const baseR = HALF * 0.78;
    const rx = baseR * sh.rxMul;
    const ry = baseR * sh.ryMul;

    // Sclera
    ctx.save();
    if (sh.rounded) {
        const cr = Math.min(rx, ry) * 0.45;
        _roundedRect(ctx, HALF, HALF, rx, ry, cr);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        _roundedRect(ctx, HALF, HALF, rx, ry, cr);
        ctx.clip();
    } else {
        ctx.beginPath();
        ctx.ellipse(HALF, HALF, rx, ry, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.clip();
    }

    // Iris
    const irisR = baseR * 0.65;
    ctx.beginPath();
    ctx.arc(HALF, HALF, irisR, 0, Math.PI * 2);
    ctx.fillStyle = irisColor || '#808080';
    ctx.fill();

    // Pupil
    const pupilR = irisR * 0.35;
    ctx.beginPath();
    ctx.arc(HALF, HALF, pupilR, 0, Math.PI * 2);
    ctx.fillStyle = '#0a0a0a';
    ctx.fill();

    // Specular highlight
    ctx.beginPath();
    ctx.arc(HALF + irisR * 0.25, HALF - irisR * 0.3, baseR * 0.12, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fill();

    ctx.restore();

    // Outline
    if (sh.rounded) {
        const cr = Math.min(rx, ry) * 0.45;
        _roundedRect(ctx, HALF, HALF, rx, ry, cr);
    } else {
        ctx.beginPath();
        ctx.ellipse(HALF, HALF, rx, ry, 0, 0, Math.PI * 2);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // ── Eyelashes ──
    const lash = LASH_STYLES[eyelashStyle];
    if (lash) {
        const lashCol = eyelashColor || '#1a1a1a';
        ctx.strokeStyle = lashCol;
        ctx.lineWidth = lash.width || 1.8;
        ctx.lineCap = 'round';

        // Top lashes (unless bottomOnly)
        if (!lash.bottomOnly) {
            const count = lash.count;
            const spread = Math.PI * 0.7; // arc range across top
            const startAngle = -Math.PI / 2 - spread / 2;
            for (let i = 0; i < count; i++) {
                const t = count === 1 ? 0.5 : i / (count - 1);
                const angle = startAngle + t * spread;
                // Start point on sclera edge
                const sx = HALF + Math.cos(angle) * rx;
                const sy = HALF + Math.sin(angle) * ry;
                // End point extending outward
                const len = baseR * lash.length * (1 - 0.3 * Math.abs(t - 0.5));
                const curveAmt = baseR * lash.curve;
                const ex = sx + Math.cos(angle) * len;
                const ey = sy + Math.sin(angle) * len;
                // Control point curves lashes upward
                const cpx = sx + Math.cos(angle) * len * 0.6 - curveAmt * Math.sin(angle) * 0.3;
                const cpy = sy + Math.sin(angle) * len * 0.6 - curveAmt;
                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.quadraticCurveTo(cpx, cpy, ex, ey);
                ctx.stroke();
            }
        }

        // Bottom lashes
        if (lash.bottomOnly || eyelashStyle === 'dramatic') {
            const bCount = lash.bottomOnly ? lash.count : Math.max(2, lash.count - 2);
            const bSpread = Math.PI * 0.5;
            const bStart = Math.PI / 2 - bSpread / 2;
            const bLen = baseR * (lash.bottomOnly ? lash.length : lash.length * 0.5);
            for (let i = 0; i < bCount; i++) {
                const t = bCount === 1 ? 0.5 : i / (bCount - 1);
                const angle = bStart + t * bSpread;
                const sx = HALF + Math.cos(angle) * rx;
                const sy = HALF + Math.sin(angle) * ry;
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

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
}

// ── Eyebrow configs ──
const BROW_STYLES = {
    thin:    { thickness: 0.08, arch: 0.15, taper: 0.6 },
    natural: { thickness: 0.12, arch: 0.20, taper: 0.5 },
    thick:   { thickness: 0.18, arch: 0.18, taper: 0.4 },
    bushy:   { thickness: 0.24, arch: 0.12, taper: 0.3 },
    arched:  { thickness: 0.12, arch: 0.35, taper: 0.5 },
    angry:   { thickness: 0.15, arch: -0.15, taper: 0.4 },
    flat:    { thickness: 0.14, arch: 0.0,  taper: 0.5 },
};

/**
 * Create a canvas-based eyebrow texture (transparent plane).
 * @param {string} browStyle — e.g. 'natural', 'thick', 'arched'
 * @param {string} browColor — CSS color for the eyebrow
 * @param {boolean} [mirror=false] — true for the right eyebrow (flipped)
 * @returns {THREE.CanvasTexture}
 */
export function makeEyebrowTexture(browStyle, browColor, mirror) {
    const brow = BROW_STYLES[browStyle];
    if (!brow) return null;

    const SIZE = 96, HALF = 48;
    const canvas = document.createElement('canvas');
    canvas.width = SIZE; canvas.height = SIZE;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, SIZE, SIZE);

    // Draw eyebrow as a tapered curved shape
    const startX = SIZE * 0.08;
    const endX = SIZE * 0.92;
    const midX = SIZE * 0.4; // Arch peak is 40% across
    const baseY = HALF + SIZE * 0.1;
    const archH = SIZE * brow.arch; // Positive = up, negative = angry
    const thick = SIZE * brow.thickness;
    const taperEnd = brow.taper; // End thickness multiplier

    ctx.fillStyle = browColor || '#4a3728';

    if (mirror) {
        ctx.save();
        ctx.translate(SIZE, 0);
        ctx.scale(-1, 1);
    }

    ctx.beginPath();
    // Upper edge (arched)
    ctx.moveTo(startX, baseY - thick / 2);
    ctx.quadraticCurveTo(midX, baseY - archH - thick / 2, endX, baseY - thick * taperEnd / 2);
    // Lower edge (back)
    ctx.lineTo(endX, baseY + thick * taperEnd / 2);
    ctx.quadraticCurveTo(midX, baseY - archH + thick / 2, startX, baseY + thick / 2);
    ctx.closePath();
    ctx.fill();

    if (mirror) ctx.restore();

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
}

// ── Rounded rect helper ──
function _roundedRect(ctx, cx, cy, halfW, halfH, r) {
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
