/**
 * imageRenderer.js — Renders 2D image asset elements onto an HTML Canvas.
 *
 * Mirrors the propRenderer pattern but for 2D SVG-like primitives:
 * circle, ellipse, rect, rounded-rect, square, triangle, line, arc,
 * diamond, hexagon, pentagon, ring, cross, star-4, star-5, star-6.
 *
 * Each element has: { primitiveId, params: { cx, cy, fill, stroke, ... }, zIndex }
 */

/* ══════════════════════════════════════════════════════════
   COLOR RESOLUTION
   ══════════════════════════════════════════════════════════ */

function resolveColor(fillToken, colorAssignments) {
    if (!fillToken || fillToken === 'none') return 'transparent';
    if (fillToken.startsWith('#')) return fillToken;
    return (colorAssignments && colorAssignments[fillToken]) || '#888888';
}

/* ══════════════════════════════════════════════════════════
   2D PRIMITIVE DRAW FUNCTIONS
   Each receives (ctx, params, colorAssignments).
   ══════════════════════════════════════════════════════════ */

function _applyStroke(ctx, p, colorAssignments) {
    const stroke = resolveColor(p.stroke, colorAssignments);
    if (stroke !== 'transparent' && p.strokeWidth > 0) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = p.strokeWidth || 2;
        ctx.stroke();
    }
}

const DRAW = {
    circle(ctx, p, ca) {
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, p.r || 10, 0, Math.PI * 2);
        ctx.fillStyle = resolveColor(p.fill, ca);
        ctx.fill();
        _applyStroke(ctx, p, ca);
    },

    ellipse(ctx, p, ca) {
        ctx.save();
        ctx.translate(p.cx, p.cy);
        if (p.rotation) ctx.rotate(p.rotation * Math.PI / 180);
        ctx.beginPath();
        ctx.ellipse(0, 0, p.rx || 10, p.ry || 10, 0, 0, Math.PI * 2);
        ctx.fillStyle = resolveColor(p.fill, ca);
        ctx.fill();
        _applyStroke(ctx, p, ca);
        ctx.restore();
    },

    rect(ctx, p, ca) {
        ctx.save();
        ctx.translate(p.cx, p.cy);
        if (p.rotation) ctx.rotate(p.rotation * Math.PI / 180);
        const w = p.w || p.width || 20, h = p.h || p.height || 20;
        ctx.fillStyle = resolveColor(p.fill, ca);
        ctx.fillRect(-w / 2, -h / 2, w, h);
        if (p.stroke && p.stroke !== 'none' && p.strokeWidth > 0) {
            ctx.strokeStyle = resolveColor(p.stroke, ca);
            ctx.lineWidth = p.strokeWidth;
            ctx.strokeRect(-w / 2, -h / 2, w, h);
        }
        ctx.restore();
    },

    square(ctx, p, ca) {
        // Square is just rect with equal sides
        const s = p.size || p.r * 2 || 20;
        DRAW.rect(ctx, { ...p, w: s, h: s }, ca);
    },

    'rounded-rect'(ctx, p, ca) {
        ctx.save();
        ctx.translate(p.cx, p.cy);
        if (p.rotation) ctx.rotate(p.rotation * Math.PI / 180);
        const w = p.w || 20, h = p.h || 20, r = p.rx || 5;
        const x = -w / 2, y = -h / 2;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.fillStyle = resolveColor(p.fill, ca);
        ctx.fill();
        _applyStroke(ctx, p, ca);
        ctx.restore();
    },

    triangle(ctx, p, ca) {
        _drawPolygon(ctx, p, ca, 3);
    },

    diamond(ctx, p, ca) {
        _drawPolygon(ctx, p, ca, 4, 45); // rotated square → diamond
    },

    pentagon(ctx, p, ca) {
        _drawPolygon(ctx, p, ca, 5);
    },

    hexagon(ctx, p, ca) {
        _drawPolygon(ctx, p, ca, 6);
    },

    line(ctx, p, ca) {
        const len = p.length || 20;
        const angle = (p.angle || 0) * Math.PI / 180;
        const dx = Math.cos(angle) * len / 2;
        const dy = Math.sin(angle) * len / 2;
        ctx.beginPath();
        ctx.moveTo(p.cx - dx, p.cy - dy);
        ctx.lineTo(p.cx + dx, p.cy + dy);
        ctx.strokeStyle = resolveColor(p.fill, ca);
        ctx.lineWidth = p.thickness || 2;
        ctx.lineCap = 'round';
        ctx.stroke();
    },

    arc(ctx, p, ca) {
        const startRad = (p.startAngle || 0) * Math.PI / 180;
        const endRad = (p.endAngle || 180) * Math.PI / 180;
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, p.r || 20, startRad, endRad);
        ctx.strokeStyle = resolveColor(p.fill, ca);
        ctx.lineWidth = p.thickness || 3;
        ctx.lineCap = 'round';
        ctx.stroke();
    },

    ring(ctx, p, ca) {
        const r = p.r || 20;
        const thickness = p.thickness || 4;
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = resolveColor(p.fill, ca);
        ctx.lineWidth = thickness;
        ctx.stroke();
    },

    cross(ctx, p, ca) {
        const r = p.r || 15;
        const t = p.thickness || 4;
        ctx.save();
        ctx.translate(p.cx, p.cy);
        if (p.rotation) ctx.rotate(p.rotation * Math.PI / 180);
        ctx.fillStyle = resolveColor(p.fill, ca);
        ctx.fillRect(-r, -t / 2, r * 2, t);
        ctx.fillRect(-t / 2, -r, t, r * 2);
        ctx.restore();
    },

    'star-4'(ctx, p, ca) {
        _drawStar(ctx, p, ca, 4);
    },

    'star-5'(ctx, p, ca) {
        _drawStar(ctx, p, ca, 5);
    },

    'star-6'(ctx, p, ca) {
        _drawStar(ctx, p, ca, 6);
    },
};

/* ── Polygon helper ── */
function _drawPolygon(ctx, p, ca, sides, extraRotDeg = 0) {
    const r = p.r || 20;
    const rot = ((p.rotation || 0) + extraRotDeg - 90) * Math.PI / 180;
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
        const angle = rot + (i / sides) * Math.PI * 2;
        const x = p.cx + Math.cos(angle) * r;
        const y = p.cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = resolveColor(p.fill, ca);
    ctx.fill();
    _applyStroke(ctx, p, ca);
}

/* ── Star helper ── */
function _drawStar(ctx, p, ca, points) {
    const outer = p.r || 20;
    const inner = outer * (p.innerRatio || 0.4);
    const rot = ((p.rotation || 0) - 90) * Math.PI / 180;
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
        const angle = rot + (i / (points * 2)) * Math.PI * 2;
        const r = i % 2 === 0 ? outer : inner;
        const x = p.cx + Math.cos(angle) * r;
        const y = p.cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = resolveColor(p.fill, ca);
    ctx.fill();
    _applyStroke(ctx, p, ca);
}

/* ══════════════════════════════════════════════════════════
   PUBLIC API
   ══════════════════════════════════════════════════════════ */

/**
 * Render a 2D image asset's _editor.elements onto a Canvas.
 *
 * @param {Object} imageData — Full normalized asset object
 * @param {Object} [options] — { width, height, backgroundColor }
 * @returns {HTMLCanvasElement}
 */
export function renderImage(imageData, options = {}) {
    const payload   = imageData.payload || {};
    const editor    = payload._editor || imageData._editor || {};
    const elements  = editor.elements || [];
    const colorAssignments = editor.color_assignments || payload.color_assignments || {};

    // Parse viewBox or use natural size
    const vb = payload.viewBox || '0 0 512 512';
    const [vbX, vbY, vbW, vbH] = vb.split(/\s+/).map(Number);

    const canvasW = options.width  || vbW || 512;
    const canvasH = options.height || vbH || 512;

    const canvas = document.createElement('canvas');
    canvas.width  = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');

    // Background
    const bg = options.backgroundColor || payload.background_color;
    if (bg) {
        ctx.fillStyle = resolveColor(bg, colorAssignments);
        ctx.fillRect(0, 0, canvasW, canvasH);
    }

    // Scale if viewBox differs from canvas size
    const sx = canvasW / (vbW || canvasW);
    const sy = canvasH / (vbH || canvasH);
    ctx.save();
    ctx.scale(sx, sy);
    ctx.translate(-vbX, -vbY);

    // Sort by zIndex and draw
    const sorted = [...elements].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
    for (const el of sorted) {
        const drawFn = DRAW[el.primitiveId || el.type];
        if (!drawFn) continue;
        ctx.save();
        if (el.params?.opacity != null && el.params.opacity < 1) {
            ctx.globalAlpha = el.params.opacity;
        }
        drawFn(ctx, el.params || el, colorAssignments);
        ctx.restore();
    }

    ctx.restore();
    return canvas;
}

/**
 * Render an image asset to a data URL (PNG).
 */
export function renderImageToDataURL(imageData, options = {}) {
    const canvas = renderImage(imageData, options);
    return canvas.toDataURL('image/png');
}

/**
 * Render a small thumbnail (64×64) for the asset picker.
 */
export function renderThumbnail(imageData, size = 64) {
    return renderImage(imageData, { width: size, height: size });
}
