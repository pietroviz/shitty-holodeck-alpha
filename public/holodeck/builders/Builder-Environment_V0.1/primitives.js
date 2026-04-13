/**
 * Simbox 3D Primitive Shape Library
 * Adapted from PropBox-V1 for use in EnvironmentBuilder V2.
 *
 * Loads primitive definitions from global_assets/3D/primitives/3d/ JSON files,
 * pairs each with a Three.js geometry builder, and exposes buildMesh().
 */

import * as THREE from 'three';

// ─────────────────────────────────────────────────────────
//  GEOMETRY HELPERS
// ─────────────────────────────────────────────────────────

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

function wedgeGeometry(width, height, depth) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -height / 2);
  shape.lineTo(width / 2, -height / 2);
  shape.lineTo(-width / 2, height / 2);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

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
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: d,
    bevelEnabled: true,
    bevelThickness: r,
    bevelSize: r,
    bevelSegments: 3,
  });
  geo.translate(0, 0, -d / 2);
  return geo;
}

// ─────────────────────────────────────────────────────────
//  GEOMETRY BUILDERS — keyed by primitive id
// ─────────────────────────────────────────────────────────

const BUILDERS = {
  box(p) { return new THREE.BoxGeometry(p.width, p.height, p.depth); },
  sphere(p) { return new THREE.SphereGeometry(p.radius, 32, 24); },
  cylinder(p) { return new THREE.CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, 32); },
  cone(p) { return new THREE.ConeGeometry(p.radius, p.height, 32); },
  torus(p) { return new THREE.TorusGeometry(p.radius, p.tube, 24, 48); },
  capsule(p) { return new THREE.CapsuleGeometry(p.radius, p.length, 16, 32); },
  hemisphere(p) { return new THREE.SphereGeometry(p.radius, 32, 24, 0, Math.PI * 2, 0, Math.PI / 2); },
  wedge(p) { return wedgeGeometry(p.width, p.height, p.depth); },
  pyramid(p) { return new THREE.ConeGeometry(p.baseWidth * 0.707, p.height, 4); },
  prism(p) { return new THREE.CylinderGeometry(p.radius, p.radius, p.height, 3); },
  tube(p) { return tubeGeometry(p.outerRadius, p.innerRadius, p.height); },
  'rounded-box'(p) { return roundedBoxGeometry(p.width, p.height, p.depth, p.bevelRadius); },
  star(p) {
    const shape = starShape(p.outerRadius, p.innerRadius, Math.round(p.points));
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: p.depth,
      bevelEnabled: true,
      bevelThickness: p.depth * 0.1,
      bevelSize: p.depth * 0.05,
      bevelSegments: 2,
    });
    geo.translate(0, 0, -p.depth / 2);
    return geo;
  },
  heart(p) {
    const shape = heartShape(p.size);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: p.depth,
      bevelEnabled: true,
      bevelThickness: p.depth * 0.15,
      bevelSize: p.depth * 0.1,
      bevelSegments: 3,
    });
    geo.translate(0, 0, -p.depth / 2);
    return geo;
  },
};

// ─────────────────────────────────────────────────────────
//  PRIMITIVE REGISTRY
// ─────────────────────────────────────────────────────────

const PRIMITIVE_FILES = [
  'box', 'sphere', 'cylinder', 'cone', 'torus',
  'capsule', 'hemisphere', 'wedge', 'pyramid', 'prism',
  'tube', 'rounded-box', 'star', 'heart',
];

export let PRIMITIVES = [];

export async function loadPrimitives(basePath = './global_assets/3D/primitives/3d') {
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
    .map((def) => ({
      ...def,
      buildGeometry: BUILDERS[def.id] || (() => new THREE.BoxGeometry(1, 1, 1)),
    }));

  return PRIMITIVES;
}

export function getPrimitive(id) {
  return PRIMITIVES.find(p => p.id === id);
}

/**
 * Build a Three.js Mesh from an element descriptor.
 * Handles both PropBox format ({ primitiveId, params: {...} })
 * and batch format ({ type, px, py, pz, ... }).
 */
export function buildMesh(element, colorMap = {}) {
  // Normalize: batch format uses 'type' with flat params, editor format uses 'primitiveId' + params object
  let primId, params;
  if (element.primitiveId) {
    primId = element.primitiveId;
    params = element.params || {};
  } else {
    primId = element.type || element.primitiveId;
    // Flat format — everything is top-level
    const { id, type, primitiveId, fill, ...rest } = element;
    params = { fill: element.fill, ...rest };
  }

  const prim = getPrimitive(primId);
  if (!prim) {
    console.warn(`Unknown primitive: ${primId}`);
    return new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.5, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xff00ff })
    );
  }

  const p = { ...prim.defaults, ...params };

  const geometry = prim.buildGeometry(p);

  // Resolve fill color
  let color = '#888888';
  if (p.fill && colorMap[p.fill]) color = colorMap[p.fill];
  else if (p.fill && p.fill.startsWith('#')) color = p.fill;

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    metalness: p.metalness ?? 0.1,
    roughness: p.roughness ?? 0.7,
    transparent: (p.opacity ?? 1) < 1,
    opacity: p.opacity ?? 1,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(p.px || 0, p.py || 0, p.pz || 0);
  mesh.rotation.set(
    (p.rx || 0) * Math.PI / 180,
    (p.ry || 0) * Math.PI / 180,
    (p.rz || 0) * Math.PI / 180
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return mesh;
}

/**
 * Build a complete Three.js Group from a prop asset's elements array.
 */
export function buildPropGroup(asset) {
  const group = new THREE.Group();
  const colorMap = asset.payload?._editor?.color_assignments
    || asset.payload?.color_assignments
    || {};
  const elements = asset.payload?._editor?.elements || [];

  for (const el of elements) {
    const mesh = buildMesh(el, colorMap);
    mesh.userData.elementId = el.id;
    group.add(mesh);
  }

  return group;
}
