/**
 * primitives.js — Shared 3D primitive geometry library.
 *
 * Consolidated from the duplicate primitives.js files in
 * Builder-Object_V0.1/ and Builder-Environment_V0.1/.
 * All bridges and builders that need shapes should import from here.
 *
 * Usage:
 *   import { BUILDERS, starShape, heartShape, buildMesh } from '../shared/primitives.js';
 *   const geo = BUILDERS.star({ outerRadius: 0.6, innerRadius: 0.25, depth: 0.2, points: 5 });
 */

import * as THREE from 'three';
import { standard, fallback } from './materials.js';

// ─────────────────────────────────────────────────────────────────
//  GEOMETRY HELPERS
// ─────────────────────────────────────────────────────────────────

/** Star-shaped 2D path for extrusion. */
export function starShape(outerR, innerR, points) {
    const shape = new THREE.Shape();
    const step  = Math.PI / points;
    for (let i = 0; i < points * 2; i++) {
        const r     = i % 2 === 0 ? outerR : innerR;
        const angle = i * step - Math.PI / 2;
        const x     = r * Math.cos(angle);
        const y     = r * Math.sin(angle);
        if (i === 0) shape.moveTo(x, y);
        else         shape.lineTo(x, y);
    }
    shape.closePath();
    return shape;
}

/** Heart-shaped 2D path for extrusion. */
export function heartShape(size) {
    const s     = size;
    const shape = new THREE.Shape();
    shape.moveTo(0, -s * 0.5);
    shape.bezierCurveTo(0, -s * 0.7, -s * 0.6, -s * 0.9, -s * 0.6, -s * 0.45);
    shape.bezierCurveTo(-s * 0.6, -s * 0.1, -s * 0.35, s * 0.1, 0, s * 0.5);
    shape.bezierCurveTo(s * 0.35, s * 0.1, s * 0.6, -s * 0.1, s * 0.6, -s * 0.45);
    shape.bezierCurveTo(s * 0.6, -s * 0.9, 0, -s * 0.7, 0, -s * 0.5);
    return shape;
}

/** Wedge geometry (triangular cross-section extruded along Z). */
export function wedgeGeometry(width, height, depth) {
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, -height / 2);
    shape.lineTo(width / 2, -height / 2);
    shape.lineTo(-width / 2, height / 2);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    geo.translate(0, 0, -depth / 2);
    return geo;
}

/** Tube (hollow cylinder) geometry via LatheGeometry. */
export function tubeGeometry(outerRadius, innerRadius, height) {
    const inner = Math.min(innerRadius, outerRadius - 0.01);
    const pts   = [
        new THREE.Vector2(inner,       -height / 2),
        new THREE.Vector2(outerRadius, -height / 2),
        new THREE.Vector2(outerRadius,  height / 2),
        new THREE.Vector2(inner,        height / 2),
    ];
    return new THREE.LatheGeometry(pts, 32);
}

/** Rounded box via ExtrudeGeometry with bevel. */
export function roundedBoxGeometry(w, h, d, r) {
    r = Math.min(r, w / 2, h / 2);
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2 + r, -h / 2);
    shape.lineTo(w / 2 - r,  -h / 2);
    shape.quadraticCurveTo(w / 2,  -h / 2,     w / 2,      -h / 2 + r);
    shape.lineTo(w / 2,       h / 2 - r);
    shape.quadraticCurveTo(w / 2,   h / 2,     w / 2 - r,   h / 2);
    shape.lineTo(-w / 2 + r,  h / 2);
    shape.quadraticCurveTo(-w / 2,  h / 2,    -w / 2,        h / 2 - r);
    shape.lineTo(-w / 2,     -h / 2 + r);
    shape.quadraticCurveTo(-w / 2, -h / 2,    -w / 2 + r,  -h / 2);
    const geo = new THREE.ExtrudeGeometry(shape, {
        depth: d,
        bevelEnabled:    true,
        bevelThickness:  r,
        bevelSize:       r,
        bevelSegments:   3,
    });
    geo.translate(0, 0, -d / 2);
    return geo;
}

// ─────────────────────────────────────────────────────────────────
//  GEOMETRY BUILDERS — keyed by primitive id
//
//  Standardised segment counts:
//    Cylinder / Cone:  32 radial
//    Sphere:           32 width × 24 height
//    Torus:            24 tubular × 48 radial
//    Capsule:          16 cap × 32 radial
//    Lathe (tube):     32 segments
// ─────────────────────────────────────────────────────────────────

export const BUILDERS = {
    box(p)        { return new THREE.BoxGeometry(p.width, p.height, p.depth); },
    sphere(p)     { return new THREE.SphereGeometry(p.radius, 32, 24); },
    cylinder(p)   { return new THREE.CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, 32); },
    cone(p)       { return new THREE.ConeGeometry(p.radius, p.height, 32); },
    torus(p)      { return new THREE.TorusGeometry(p.radius, p.tube, 24, 48); },
    capsule(p)    { return new THREE.CapsuleGeometry(p.radius, p.length, 16, 32); },
    hemisphere(p) { return new THREE.SphereGeometry(p.radius, 32, 24, 0, Math.PI * 2, 0, Math.PI / 2); },
    wedge(p)      { return wedgeGeometry(p.width, p.height, p.depth); },
    pyramid(p)    { return new THREE.ConeGeometry(p.baseWidth * 0.707, p.height, 4); },
    prism(p)      { return new THREE.CylinderGeometry(p.radius, p.radius, p.height, 3); },
    tube(p)       { return tubeGeometry(p.outerRadius, p.innerRadius, p.height); },
    'rounded-box'(p) { return roundedBoxGeometry(p.width, p.height, p.depth, p.bevelRadius); },

    star(p) {
        const shape = starShape(p.outerRadius, p.innerRadius, Math.round(p.points));
        const geo   = new THREE.ExtrudeGeometry(shape, {
            depth: p.depth,
            bevelEnabled:    true,
            bevelThickness:  p.depth * 0.1,
            bevelSize:       p.depth * 0.05,
            bevelSegments:   2,
        });
        geo.translate(0, 0, -p.depth / 2);
        return geo;
    },

    heart(p) {
        const shape = heartShape(p.size);
        const geo   = new THREE.ExtrudeGeometry(shape, {
            depth: p.depth,
            bevelEnabled:    true,
            bevelThickness:  p.depth * 0.15,
            bevelSize:       p.depth * 0.1,
            bevelSegments:   3,
        });
        geo.translate(0, 0, -p.depth / 2);
        return geo;
    },
};

/** All known primitive IDs. */
export const PRIMITIVE_IDS = Object.keys(BUILDERS);

// ─────────────────────────────────────────────────────────────────
//  HIGH-LEVEL MESH BUILDER
// ─────────────────────────────────────────────────────────────────

/**
 * Build a complete Three.js Mesh from an element descriptor.
 * @param {Object} element  — { primitiveId, params: { width, height, depth, fill, ... } }
 * @param {Object} defaults — default params from the primitive's JSON definition
 * @param {Object} colorMap — { primary: '#hex', secondary: '#hex', ... }
 * @returns {THREE.Mesh}
 */
export function buildMesh(element, defaults = {}, colorMap = {}) {
    const builder = BUILDERS[element.primitiveId];
    if (!builder) {
        console.warn(`Unknown primitive: ${element.primitiveId}`);
        return new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), fallback());
    }

    const p = { ...defaults, ...element.params };

    const geometry = builder(p);

    // Resolve fill color
    let color = '#888888';
    if (p.fill && colorMap[p.fill])         color = colorMap[p.fill];
    else if (p.fill && p.fill.startsWith('#')) color = p.fill;

    const material = standard(new THREE.Color(color), {
        metalness:   p.metalness   ?? 0.1,
        roughness:   p.roughness   ?? 0.7,
        transparent: (p.opacity ?? 1) < 1,
        opacity:     p.opacity     ?? 1,
    });

    const mesh = new THREE.Mesh(geometry, material);

    mesh.position.set(p.px || 0, p.py || 0, p.pz || 0);
    mesh.rotation.set(
        (p.rx || 0) * Math.PI / 180,
        (p.ry || 0) * Math.PI / 180,
        (p.rz || 0) * Math.PI / 180,
    );

    return mesh;
}
