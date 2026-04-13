/**
 * Simbox 3D Primitive Shape Library
 *
 * Shape definitions (metadata, defaults, param schemas) live in individual
 * JSON files under assets/primitives/3d/. This module loads them at init,
 * pairs each one with its Three.js geometry builder function, and exposes
 * the same public API pattern that the 2D prototype (ImageBox) used.
 *
 * Usage:
 *   import { loadPrimitives, PRIMITIVES, getPrimitive, buildMesh } from './primitives.js';
 *   await loadPrimitives();
 *   const shape = getPrimitive('star');
 *   const mesh = shape.buildGeometry({ outerRadius: 0.6, innerRadius: 0.25, depth: 0.2, points: 5 });
 */

import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────
//  GEOMETRY HELPERS
// ─────────────────────────────────────────────────────────────────

/** Create a star-shaped 2D path for extrusion */
function starShape(outerR, innerR, points) {
  const shape = new THREE.Shape();
  const step = Math.PI / points;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = i * step - Math.PI / 2;
    const x = r * Math.cos(angle);
    const y = r * Math.sin(angle);
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

/** Create a heart-shaped 2D path for extrusion */
function heartShape(size) {
  const s = size;
  const shape = new THREE.Shape();
  shape.moveTo(0, -s * 0.5);
  shape.bezierCurveTo(0, -s * 0.7, -s * 0.6, -s * 0.9, -s * 0.6, -s * 0.45);
  shape.bezierCurveTo(-s * 0.6, -s * 0.1, -s * 0.35, s * 0.1, 0, s * 0.5);
  shape.bezierCurveTo(s * 0.35, s * 0.1, s * 0.6, -s * 0.1, s * 0.6, -s * 0.45);
  shape.bezierCurveTo(s * 0.6, -s * 0.9, 0, -s * 0.7, 0, -s * 0.5);
  return shape;
}

/** Create a wedge geometry (triangular cross-section extruded along Z) */
function wedgeGeometry(width, height, depth) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -height / 2);
  shape.lineTo(width / 2, -height / 2);
  shape.lineTo(-width / 2, height / 2);
  shape.closePath();
  const extrudeSettings = { depth: depth, bevelEnabled: false };
  const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geo.translate(0, 0, -depth / 2);
  return geo;
}

/** Create a tube (hollow cylinder) geometry via LatheGeometry */
function tubeGeometry(outerRadius, innerRadius, height) {
  const inner = Math.min(innerRadius, outerRadius - 0.01);
  const pts = [
    new THREE.Vector2(inner, -height / 2),
    new THREE.Vector2(outerRadius, -height / 2),
    new THREE.Vector2(outerRadius, height / 2),
    new THREE.Vector2(inner, height / 2),
  ];
  return new THREE.LatheGeometry(pts, 32);
}

/** Create a rounded box via ExtrudeGeometry with bevel */
function roundedBoxGeometry(w, h, d, r) {
  r = Math.min(r, w / 2, h / 2);
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 + r, -h / 2);
  shape.lineTo(w / 2 - r, -h / 2);
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  shape.lineTo(w / 2, h / 2 - r);
  shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  shape.lineTo(-w / 2 + r, h / 2);
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  shape.lineTo(-w / 2, -h / 2 + r);
  shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const extrudeSettings = {
    depth: d,
    bevelEnabled: true,
    bevelThickness: r,
    bevelSize: r,
    bevelSegments: 3,
  };
  const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geo.translate(0, 0, -d / 2);
  return geo;
}

// ─────────────────────────────────────────────────────────────────
//  GEOMETRY BUILDERS — keyed by primitive id
//
//  Each function takes a params object and returns a THREE.BufferGeometry.
//  These contain the actual shape-building logic that can't live in JSON.
// ─────────────────────────────────────────────────────────────────

const BUILDERS = {
  box(p) {
    return new THREE.BoxGeometry(p.width, p.height, p.depth);
  },

  sphere(p) {
    return new THREE.SphereGeometry(p.radius, 32, 24);
  },

  cylinder(p) {
    return new THREE.CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, 32);
  },

  cone(p) {
    return new THREE.ConeGeometry(p.radius, p.height, 32);
  },

  torus(p) {
    return new THREE.TorusGeometry(p.radius, p.tube, 24, 48);
  },

  capsule(p) {
    // Build capsule from cylinder + two hemispheres
    const cylH = p.length;
    const geo = new THREE.CapsuleGeometry(p.radius, cylH, 16, 32);
    return geo;
  },

  hemisphere(p) {
    return new THREE.SphereGeometry(p.radius, 32, 24, 0, Math.PI * 2, 0, Math.PI / 2);
  },

  wedge(p) {
    return wedgeGeometry(p.width, p.height, p.depth);
  },

  pyramid(p) {
    // A 4-sided cone
    return new THREE.ConeGeometry(p.baseWidth * 0.707, p.height, 4);
  },

  prism(p) {
    // Triangular prism = 3-sided cylinder
    return new THREE.CylinderGeometry(p.radius, p.radius, p.height, 3);
  },

  tube(p) {
    return tubeGeometry(p.outerRadius, p.innerRadius, p.height);
  },

  'rounded-box'(p) {
    return roundedBoxGeometry(p.width, p.height, p.depth, p.bevelRadius);
  },

  star(p) {
    const shape = starShape(p.outerRadius, p.innerRadius, Math.round(p.points));
    const extrudeSettings = {
      depth: p.depth,
      bevelEnabled: true,
      bevelThickness: p.depth * 0.1,
      bevelSize: p.depth * 0.05,
      bevelSegments: 2,
    };
    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geo.translate(0, 0, -p.depth / 2);
    return geo;
  },

  heart(p) {
    const shape = heartShape(p.size);
    const extrudeSettings = {
      depth: p.depth,
      bevelEnabled: true,
      bevelThickness: p.depth * 0.15,
      bevelSize: p.depth * 0.1,
      bevelSegments: 3,
    };
    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geo.translate(0, 0, -p.depth / 2);
    return geo;
  },
};

// ─────────────────────────────────────────────────────────────────
//  PRIMITIVE REGISTRY
// ─────────────────────────────────────────────────────────────────

const PRIMITIVE_FILES = [
  'box', 'sphere', 'cylinder', 'cone', 'torus',
  'capsule', 'hemisphere', 'wedge', 'pyramid', 'prism',
  'tube', 'rounded-box', 'star', 'heart',
];

export let PRIMITIVES = [];

/**
 * Load all primitive definitions from JSON and attach geometry builders.
 * Call once at app startup before using any other export.
 */
export async function loadPrimitives(basePath = './assets/primitives/3d') {
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
      const builder = BUILDERS[def.id];
      if (!builder) {
        console.warn(`No geometry builder found for primitive: ${def.id}`);
      }
      return {
        ...def,
        buildGeometry: builder || (() => new THREE.BoxGeometry(1, 1, 1)),
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

/**
 * Build a complete Three.js Mesh from an element descriptor.
 * @param {Object} element - { primitiveId, params: { px, py, pz, rx, ry, rz, fill, metalness, roughness, opacity, ...shapeParams } }
 * @param {Object} colorMap - { primary: '#hex', secondary: '#hex', tertiary: '#hex' }
 * @returns {THREE.Mesh}
 */
export function buildMesh(element, colorMap = {}) {
  const prim = getPrimitive(element.primitiveId);
  if (!prim) {
    console.warn(`Unknown primitive: ${element.primitiveId}`);
    return new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0xff00ff }));
  }

  // Merge defaults with provided params
  const p = { ...prim.defaults, ...element.params };

  // Build geometry
  const geometry = prim.buildGeometry(p);

  // Resolve fill color from token
  let color = '#888888';
  if (p.fill && colorMap[p.fill]) {
    color = colorMap[p.fill];
  } else if (p.fill && p.fill.startsWith('#')) {
    color = p.fill;
  }

  // Build material
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    metalness: p.metalness ?? 0.1,
    roughness: p.roughness ?? 0.7,
    transparent: (p.opacity ?? 1) < 1,
    opacity: p.opacity ?? 1,
  });

  const mesh = new THREE.Mesh(geometry, material);

  // Apply transforms
  mesh.position.set(p.px || 0, p.py || 0, p.pz || 0);
  mesh.rotation.set(
    (p.rx || 0) * Math.PI / 180,
    (p.ry || 0) * Math.PI / 180,
    (p.rz || 0) * Math.PI / 180
  );

  return mesh;
}
