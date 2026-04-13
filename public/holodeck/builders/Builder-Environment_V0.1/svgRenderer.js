/**
 * SVG Renderer for 2D Assets → Canvas Textures
 *
 * Converts 2D asset elements (from ImageBox format) into an SVG string,
 * then rasterizes to a canvas for use as Three.js textures.
 */

import * as THREE from 'three';

// ─────────────────────────────────────────────────────────
//  GEOMETRY HELPERS
// ─────────────────────────────────────────────────────────

function polygonPoints(cx, cy, r, sides, rotationDeg = 0) {
  const points = [];
  const rotRad = (rotationDeg * Math.PI) / 180;
  for (let i = 0; i < sides; i++) {
    const angle = rotRad + (2 * Math.PI * i) / sides - Math.PI / 2;
    points.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return points.join(' ');
}

function starPath(cx, cy, outerR, innerR, points, rotationDeg = 0) {
  const path = [];
  const rotRad = (rotationDeg * Math.PI) / 180;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = rotRad + (Math.PI * i) / points - Math.PI / 2;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    path.push(i === 0 ? `M${x},${y}` : `L${x},${y}`);
  }
  return path.join(' ') + ' Z';
}

function blobPath(cx, cy, r, points, smoothing = 0.4, seed = 0) {
  const rng = (i) => 0.75 + 0.5 * Math.abs(Math.sin(seed * 137.5 + i * 47.3));
  const pts = [];
  for (let i = 0; i < points; i++) {
    const angle = (2 * Math.PI * i) / points - Math.PI / 2;
    const radius = r * rng(i);
    pts.push({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
  }
  const n = pts.length;
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const cp1x = p1.x + (p2.x - p0.x) * smoothing;
    const cp1y = p1.y + (p2.y - p0.y) * smoothing;
    const p3 = pts[(i + 2) % n];
    const cp2x = p2.x - (p3.x - p1.x) * smoothing;
    const cp2y = p2.y - (p3.y - p1.y) * smoothing;
    d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return d + ' Z';
}

// ─────────────────────────────────────────────────────────
//  SVG ELEMENT RENDERERS
// ─────────────────────────────────────────────────────────

const RENDERERS = {
  circle(p) {
    return `<circle cx="${p.cx}" cy="${p.cy}" r="${p.r}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${p.strokeWidth || 0}"/>`;
  },
  ellipse(p) {
    const t = p.rotation ? ` transform="rotate(${p.rotation},${p.cx},${p.cy})"` : '';
    return `<ellipse cx="${p.cx}" cy="${p.cy}" rx="${p.rx}" ry="${p.ry}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${p.strokeWidth || 0}"${t}/>`;
  },
  rect(p) {
    const x = p.cx - p.w / 2;
    const y = p.cy - p.h / 2;
    const t = p.rotation ? ` transform="rotate(${p.rotation},${p.cx},${p.cy})"` : '';
    return `<rect x="${x}" y="${y}" width="${p.w}" height="${p.h}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${p.strokeWidth || 0}"${t}/>`;
  },
  square(p) {
    const s = p.size || 200;
    const x = p.cx - s / 2;
    const y = p.cy - s / 2;
    const t = p.rotation ? ` transform="rotate(${p.rotation},${p.cx},${p.cy})"` : '';
    return `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${p.strokeWidth || 0}"${t}/>`;
  },
  'rounded-rect'(p) {
    const x = p.cx - p.w / 2;
    const y = p.cy - p.h / 2;
    const t = p.rotation ? ` transform="rotate(${p.rotation},${p.cx},${p.cy})"` : '';
    return `<rect x="${x}" y="${y}" width="${p.w}" height="${p.h}" rx="${p.rx}" ry="${p.rx}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${p.strokeWidth || 0}"${t}/>`;
  },
  triangle(p) {
    const pts = polygonPoints(p.cx, p.cy, p.r, 3, p.rotation);
    return `<polygon points="${pts}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${p.strokeWidth || 0}"/>`;
  },
  pentagon(p) {
    const pts = polygonPoints(p.cx, p.cy, p.r, 5, p.rotation);
    return `<polygon points="${pts}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${p.strokeWidth || 0}"/>`;
  },
  hexagon(p) {
    const pts = polygonPoints(p.cx, p.cy, p.r, 6, p.rotation);
    return `<polygon points="${pts}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${p.strokeWidth || 0}"/>`;
  },
  diamond(p) {
    const pts = polygonPoints(p.cx, p.cy, p.r, 4, 0);
    return `<polygon points="${pts}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${p.strokeWidth || 0}"/>`;
  },
  'star-4'(p) {
    const d = starPath(p.cx, p.cy, p.r, p.r * (p.innerRatio || 0.4), 4, p.rotation);
    return `<path d="${d}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${p.strokeWidth || 0}"/>`;
  },
  'star-5'(p) {
    const d = starPath(p.cx, p.cy, p.r, p.r * (p.innerRatio || 0.4), 5, p.rotation);
    return `<path d="${d}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${p.strokeWidth || 0}"/>`;
  },
  'star-6'(p) {
    const d = starPath(p.cx, p.cy, p.r, p.r * (p.innerRatio || 0.4), 6, p.rotation);
    return `<path d="${d}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${p.strokeWidth || 0}"/>`;
  },
  ring(p) {
    return `<circle cx="${p.cx}" cy="${p.cy}" r="${p.r}" fill="none" stroke="${p.fill}" stroke-width="${p.thickness || 8}"/>`;
  },
  cross(p) {
    const h = (p.thickness || 20) / 2;
    const d = `M${p.cx-h},${p.cy-p.r} L${p.cx+h},${p.cy-p.r} L${p.cx+h},${p.cy-h} L${p.cx+p.r},${p.cy-h} L${p.cx+p.r},${p.cy+h} L${p.cx+h},${p.cy+h} L${p.cx+h},${p.cy+p.r} L${p.cx-h},${p.cy+p.r} L${p.cx-h},${p.cy+h} L${p.cx-p.r},${p.cy+h} L${p.cx-p.r},${p.cy-h} L${p.cx-h},${p.cy-h} Z`;
    const t = p.rotation ? ` transform="rotate(${p.rotation},${p.cx},${p.cy})"` : '';
    return `<path d="${d}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${p.strokeWidth || 0}"${t}/>`;
  },
  arc(p) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const x1 = p.cx + p.r * Math.cos(toRad(p.startAngle || 0));
    const y1 = p.cy + p.r * Math.sin(toRad(p.startAngle || 0));
    const x2 = p.cx + p.r * Math.cos(toRad(p.endAngle || 180));
    const y2 = p.cy + p.r * Math.sin(toRad(p.endAngle || 180));
    const span = ((p.endAngle - p.startAngle) + 360) % 360;
    const largeArc = span > 180 ? 1 : 0;
    return `<path d="M${x1},${y1} A${p.r},${p.r} 0 ${largeArc},1 ${x2},${y2}" fill="none" stroke="${p.fill}" stroke-width="${p.thickness || 8}" stroke-linecap="round"/>`;
  },
  blob(p) {
    const d = blobPath(p.cx, p.cy, p.r, p.points || 8, p.smoothing || 0.4, p.seed || 0);
    return `<path d="${d}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${p.strokeWidth || 0}"/>`;
  },
  line(p) {
    const rad = ((p.angle || 0) * Math.PI) / 180;
    const len = p.length || 100;
    const dx = (len / 2) * Math.cos(rad);
    const dy = (len / 2) * Math.sin(rad);
    return `<line x1="${p.cx-dx}" y1="${p.cy-dy}" x2="${p.cx+dx}" y2="${p.cy+dy}" stroke="${p.fill}" stroke-width="${p.thickness || 3}" stroke-linecap="${p.linecap || 'round'}"/>`;
  },
};

// ─────────────────────────────────────────────────────────
//  RESOLVE COLOUR TOKENS
// ─────────────────────────────────────────────────────────

function resolveColor(token, colorMap) {
  if (!token || token === 'none') return 'none';
  if (token.startsWith('#') || token.startsWith('rgb')) return token;
  return colorMap[token] || '#888888';
}

function resolveParams(params, colorMap) {
  const resolved = { ...params };
  if (resolved.fill) resolved.fill = resolveColor(resolved.fill, colorMap);
  if (resolved.stroke) resolved.stroke = resolveColor(resolved.stroke, colorMap);
  return resolved;
}

// ─────────────────────────────────────────────────────────
//  RENDER ASSET TO SVG STRING
// ─────────────────────────────────────────────────────────

/**
 * Build a complete SVG string from a 2D asset's elements.
 * @param {Object} asset - Full asset JSON with payload._editor.elements
 * @returns {string} Complete SVG markup
 */
export function assetToSVG(asset) {
  const payload = asset.payload;
  const elements = payload._editor?.elements || [];
  const colorMap = payload._editor?.color_assignments || payload.color_assignments || {};
  const vb = payload.viewBox || '0 0 512 512';
  const bg = resolveColor(payload.background_color, colorMap);

  // Sort by zIndex
  const sorted = [...elements].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

  let inner = '';
  if (bg && bg !== 'none') {
    inner += `<rect x="0" y="0" width="512" height="512" fill="${bg}"/>`;
  }

  for (const el of sorted) {
    const renderer = RENDERERS[el.primitiveId];
    if (!renderer) {
      console.warn(`No 2D renderer for: ${el.primitiveId}`);
      continue;
    }
    const params = resolveParams(el.params || {}, colorMap);
    inner += renderer(params);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${inner}</svg>`;
}

// ─────────────────────────────────────────────────────────
//  RENDER SVG TO CANVAS TEXTURE
// ─────────────────────────────────────────────────────────

const textureCache = new Map();

/**
 * Render a 2D asset to a Three.js CanvasTexture (tiling-ready).
 * @param {Object} asset - Full asset JSON
 * @param {number} size - Canvas resolution (square, default 512)
 * @returns {Promise<THREE.CanvasTexture>}
 */
export async function assetToTexture(asset, size = 512) {
  const cacheKey = asset.id + '_' + size;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const svgStr = assetToSVG(asset);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, size, size);
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      textureCache.set(cacheKey, texture);
      resolve(texture);
    };
    img.onerror = () => {
      console.warn('Failed to rasterize SVG for:', asset.id);
      resolve(null);
    };
    const blob = new Blob([svgStr], { type: 'image/svg+xml' });
    img.src = URL.createObjectURL(blob);
  });
}

/**
 * Clear the texture cache (call when assets change).
 */
export function clearTextureCache() {
  for (const tex of textureCache.values()) {
    tex?.dispose();
  }
  textureCache.clear();
}
