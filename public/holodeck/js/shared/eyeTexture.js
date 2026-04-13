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

/**
 * Create a canvas-based eye texture.
 * @param {string} irisColor — CSS color for the iris (e.g. '#4a7a8c')
 * @param {string} shape — eye shape key (e.g. 'circle', 'tallPill')
 * @returns {THREE.CanvasTexture}
 */
export function makeEyeTexture(irisColor, shape) {
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
