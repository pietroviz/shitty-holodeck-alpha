/**
 * Simbox 2D Primitive Shape Library
 *
 * Shape definitions (metadata, defaults, param schemas) live in individual
 * JSON files under assets/primitives/2d/. This module loads them at init,
 * pairs each one with its SVG renderer function, and exposes the same
 * public API that the rest of the app relies on.
 *
 * Usage:
 *   import { loadPrimitives, PRIMITIVES, getPrimitive, buildSVGElement } from './primitives.js';
 *   await loadPrimitives();                       // call once at startup
 *   const shape = getPrimitive('star-5');
 *   const svgStr = shape.toSVGElement({ cx: 256, cy: 256, r: 120, fill: 'accent-primary' });
 */

// ─────────────────────────────────────────────────────────────────
//  GEOMETRY HELPERS
// ─────────────────────────────────────────────────────────────────

// Convert a token name to a CSS var reference, or pass through if it's 'none' or a raw value
function tok(value) {
  if (!value || value === 'none') return 'none';
  if (value.startsWith('#') || value.startsWith('rgb') || value.startsWith('hsl')) return value;
  return `var(--${value})`;
}

// Generate a regular polygon path
function polygonPoints(cx, cy, r, sides, rotationDeg = 0) {
  const points = [];
  const rotRad = (rotationDeg * Math.PI) / 180;
  for (let i = 0; i < sides; i++) {
    const angle = rotRad + (2 * Math.PI * i) / sides - Math.PI / 2;
    points.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return points.join(' ');
}

// Generate a star path
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

// Generate a rounded star/blob path using bezier curves
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

// ─────────────────────────────────────────────────────────────────
//  SVG RENDERERS — keyed by primitive id
//
//  Each function takes a params object and returns an SVG element
//  string. These contain the actual drawing logic that can't live
//  in JSON.
// ─────────────────────────────────────────────────────────────────

const RENDERERS = {
  circle(p) {
    return `<circle cx="${p.cx}" cy="${p.cy}" r="${p.r}" fill="${tok(p.fill)}" stroke="${tok(p.stroke)}" stroke-width="${p.strokeWidth}"/>`;
  },

  ellipse(p) {
    const t = p.rotation ? ` transform="rotate(${p.rotation},${p.cx},${p.cy})"` : '';
    return `<ellipse cx="${p.cx}" cy="${p.cy}" rx="${p.rx}" ry="${p.ry}" fill="${tok(p.fill)}" stroke="${tok(p.stroke)}" stroke-width="${p.strokeWidth}"${t}/>`;
  },

  rect(p) {
    const x = p.cx - p.w / 2;
    const y = p.cy - p.h / 2;
    const t = p.rotation ? ` transform="rotate(${p.rotation},${p.cx},${p.cy})"` : '';
    return `<rect x="${x}" y="${y}" width="${p.w}" height="${p.h}" fill="${tok(p.fill)}" stroke="${tok(p.stroke)}" stroke-width="${p.strokeWidth}"${t}/>`;
  },

  square(p) {
    const s = p.size || 200;
    const x = p.cx - s / 2;
    const y = p.cy - s / 2;
    const t = p.rotation ? ` transform="rotate(${p.rotation},${p.cx},${p.cy})"` : '';
    return `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="${tok(p.fill)}" stroke="${tok(p.stroke)}" stroke-width="${p.strokeWidth}"${t}/>`;
  },

  'rounded-rect'(p) {
    const x = p.cx - p.w / 2;
    const y = p.cy - p.h / 2;
    const t = p.rotation ? ` transform="rotate(${p.rotation},${p.cx},${p.cy})"` : '';
    return `<rect x="${x}" y="${y}" width="${p.w}" height="${p.h}" rx="${p.rx}" ry="${p.rx}" fill="${tok(p.fill)}" stroke="${tok(p.stroke)}" stroke-width="${p.strokeWidth}"${t}/>`;
  },

  triangle(p) {
    const pts = polygonPoints(p.cx, p.cy, p.r, 3, p.rotation);
    return `<polygon points="${pts}" fill="${tok(p.fill)}" stroke="${tok(p.stroke)}" stroke-width="${p.strokeWidth}"/>`;
  },

  pentagon(p) {
    const pts = polygonPoints(p.cx, p.cy, p.r, 5, p.rotation);
    return `<polygon points="${pts}" fill="${tok(p.fill)}" stroke="${tok(p.stroke)}" stroke-width="${p.strokeWidth}"/>`;
  },

  hexagon(p) {
    const pts = polygonPoints(p.cx, p.cy, p.r, 6, p.rotation);
    return `<polygon points="${pts}" fill="${tok(p.fill)}" stroke="${tok(p.stroke)}" stroke-width="${p.strokeWidth}"/>`;
  },

  diamond(p) {
    const pts = polygonPoints(p.cx, p.cy, p.r, 4, 0);
    return `<polygon points="${pts}" fill="${tok(p.fill)}" stroke="${tok(p.stroke)}" stroke-width="${p.strokeWidth}"/>`;
  },

  'star-4'(p) {
    const d = starPath(p.cx, p.cy, p.r, p.r * p.innerRatio, 4, p.rotation);
    return `<path d="${d}" fill="${tok(p.fill)}" stroke="${tok(p.stroke)}" stroke-width="${p.strokeWidth}"/>`;
  },

  'star-5'(p) {
    const d = starPath(p.cx, p.cy, p.r, p.r * p.innerRatio, 5, p.rotation);
    return `<path d="${d}" fill="${tok(p.fill)}" stroke="${tok(p.stroke)}" stroke-width="${p.strokeWidth}"/>`;
  },

  'star-6'(p) {
    const d = starPath(p.cx, p.cy, p.r, p.r * p.innerRatio, 6, p.rotation);
    return `<path d="${d}" fill="${tok(p.fill)}" stroke="${tok(p.stroke)}" stroke-width="${p.strokeWidth}"/>`;
  },

  ring(p) {
    return `<circle cx="${p.cx}" cy="${p.cy}" r="${p.r}" fill="none" stroke="${tok(p.fill)}" stroke-width="${p.thickness}"/>`;
  },

  cross(p) {
    const h = p.thickness / 2;
    const d = `M${p.cx - h},${p.cy - p.r} L${p.cx + h},${p.cy - p.r} L${p.cx + h},${p.cy - h} L${p.cx + p.r},${p.cy - h} L${p.cx + p.r},${p.cy + h} L${p.cx + h},${p.cy + h} L${p.cx + h},${p.cy + p.r} L${p.cx - h},${p.cy + p.r} L${p.cx - h},${p.cy + h} L${p.cx - p.r},${p.cy + h} L${p.cx - p.r},${p.cy - h} L${p.cx - h},${p.cy - h} Z`;
    const t = p.rotation ? ` transform="rotate(${p.rotation},${p.cx},${p.cy})"` : '';
    return `<path d="${d}" fill="${tok(p.fill)}" stroke="${tok(p.stroke)}" stroke-width="${p.strokeWidth}"${t}/>`;
  },

  arc(p) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const x1 = p.cx + p.r * Math.cos(toRad(p.startAngle));
    const y1 = p.cy + p.r * Math.sin(toRad(p.startAngle));
    const x2 = p.cx + p.r * Math.cos(toRad(p.endAngle));
    const y2 = p.cy + p.r * Math.sin(toRad(p.endAngle));
    const span = ((p.endAngle - p.startAngle) + 360) % 360;
    const largeArc = span > 180 ? 1 : 0;
    return `<path d="M${x1},${y1} A${p.r},${p.r} 0 ${largeArc},1 ${x2},${y2}" fill="none" stroke="${tok(p.fill)}" stroke-width="${p.thickness}" stroke-linecap="round"/>`;
  },

  blob(p) {
    const d = blobPath(p.cx, p.cy, p.r, p.points, p.smoothing, p.seed);
    return `<path d="${d}" fill="${tok(p.fill)}" stroke="${tok(p.stroke)}" stroke-width="${p.strokeWidth}"/>`;
  },

  line(p) {
    const rad = (p.angle * Math.PI) / 180;
    const dx = (p.length / 2) * Math.cos(rad);
    const dy = (p.length / 2) * Math.sin(rad);
    return `<line x1="${p.cx - dx}" y1="${p.cy - dy}" x2="${p.cx + dx}" y2="${p.cy + dy}" stroke="${tok(p.fill)}" stroke-width="${p.thickness}" stroke-linecap="${p.linecap}"/>`;
  },
};

// ─────────────────────────────────────────────────────────────────
//  PRIMITIVE REGISTRY
//
//  Loaded at init from the JSON files, then each entry gets its
//  toSVGElement function attached from RENDERERS above.
// ─────────────────────────────────────────────────────────────────

// The list of JSON filenames to load — matches the 16 files in assets/primitives/2d/
const PRIMITIVE_FILES = [
  'circle', 'square', 'ellipse', 'rect', 'rounded-rect',
  'triangle', 'pentagon', 'hexagon', 'diamond',
  'star-4', 'star-5', 'star-6',
  'ring', 'cross', 'arc', 'line',
];

export let PRIMITIVES = [];

/**
 * Load all primitive definitions from JSON and attach renderers.
 * Call once at app startup before using any other export.
 */
export async function loadPrimitives(basePath = './assets/primitives/2d') {
  const results = await Promise.all(
    PRIMITIVE_FILES.map(async (name) => {
      try {
        const res = await fetch(`${basePath}/${name}.json`);
        return await res.json();
      } catch (err) {
        console.warn(`Failed to load primitive: ${name}`, err);
        return null;
      }
    })
  );

  PRIMITIVES = results
    .filter(Boolean)
    .map((def) => {
      const renderer = RENDERERS[def.id];
      if (!renderer) {
        console.warn(`No renderer found for primitive: ${def.id}`);
      }
      return {
        ...def,
        toSVGElement: renderer || (() => ''),
      };
    });

  return PRIMITIVES;
}

export function getPrimitive(id) {
  return PRIMITIVES.find(p => p.id === id);
}

export function getPrimitivesByCategory() {
  const cats = {};
  for (const p of PRIMITIVES) {
    if (!cats[p.category]) cats[p.category] = [];
    cats[p.category].push(p);
  }
  return cats;
}

// Resolve CSS token vars to hex values for thumbnail generation
export function resolveTokens(svgString, palette) {
  return svgString.replace(/var\(--([a-z0-9-]+)\)/g, (_, token) => palette[token] || '#888888');
}
