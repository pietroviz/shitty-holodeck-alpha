import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CHARACTER } from './config.js';

/**
 * Body shape generators.
 * Each returns a BufferGeometry centered at Y=0 (caller translates to bodyMeshCenterY).
 * All geometries must have enough vertices for smooth skinning.
 */

// ── Shape Generators ─────────────────────────────────────

const SHAPE_GENERATORS = {

    roundedBox(bodyWidth, bodyMeshHeight) {
        return new RoundedBoxGeometry(
            bodyWidth, bodyMeshHeight, bodyWidth,
            CHARACTER.boxSegments, CHARACTER.cornerRadius
        );
    },

    cylinder(bodyWidth, bodyMeshHeight) {
        const r = bodyWidth / 2;
        const geo = new THREE.CylinderGeometry(r, r, bodyMeshHeight, 24, 8);
        return geo;
    },

    capsule(bodyWidth, bodyMeshHeight) {
        const r = bodyWidth / 2;
        // CapsuleGeometry: radius, length (middle section), capSegs, radialSegs
        const middleLen = Math.max(0, bodyMeshHeight - bodyWidth);
        const geo = new THREE.CapsuleGeometry(r, middleLen, 8, 24);
        return geo;
    },

    cone(bodyWidth, bodyMeshHeight) {
        // Wider at bottom, narrower at top (like a torso taper)
        const rBottom = bodyWidth / 2;
        const rTop = rBottom * 0.55;
        const geo = new THREE.CylinderGeometry(rTop, rBottom, bodyMeshHeight, 24, 8);
        return geo;
    },

    invertedCone(bodyWidth, bodyMeshHeight) {
        // Wider at top (shoulders), narrower at bottom (waist)
        const rTop = bodyWidth / 2;
        const rBottom = rTop * 0.55;
        const geo = new THREE.CylinderGeometry(rTop, rBottom, bodyMeshHeight, 24, 8);
        return geo;
    },

    hexagon(bodyWidth, bodyMeshHeight) {
        // Hexagonal prism
        const r = bodyWidth / 2;
        const geo = new THREE.CylinderGeometry(r, r, bodyMeshHeight, 6, 8);
        return geo;
    },

    sphere(bodyWidth, bodyMeshHeight) {
        // Ellipsoid body
        const rx = bodyWidth / 2;
        const ry = bodyMeshHeight / 2;
        const geo = new THREE.SphereGeometry(1, 24, 16);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            pos.setXYZ(i,
                pos.getX(i) * rx,
                pos.getY(i) * ry,
                pos.getZ(i) * rx,
            );
        }
        pos.needsUpdate = true;
        geo.computeVertexNormals();
        return geo;
    },

    barrel(bodyWidth, bodyMeshHeight) {
        // Barrel: wider in the middle, narrower at top/bottom
        const segments = 16;
        const rBase = bodyWidth / 2;
        const points = [];
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const y = (t - 0.5) * bodyMeshHeight;
            // Sinusoidal bulge: max at middle, min at ends
            const bulge = 1.0 + 0.25 * Math.sin(t * Math.PI);
            points.push(new THREE.Vector2(rBase * bulge, y));
        }
        const geo = new THREE.LatheGeometry(points, 24);
        return geo;
    },
};

/**
 * Available body shape keys.
 */
export const BODY_SHAPE_OPTIONS = [
    { key: 'roundedBox',   label: 'Box' },
    { key: 'cylinder',     label: 'Cylinder' },
    { key: 'capsule',      label: 'Capsule' },
    { key: 'cone',         label: 'Taper' },
    { key: 'invertedCone', label: 'V-Shape' },
    { key: 'hexagon',      label: 'Hexagon' },
    { key: 'sphere',       label: 'Sphere' },
    { key: 'barrel',       label: 'Barrel' },
];

/**
 * Generate a body geometry for the given shape key.
 * Returns a BufferGeometry centered at origin.
 */
export function generateBodyGeometry(shapeKey, bodyWidth, bodyMeshHeight) {
    const generator = SHAPE_GENERATORS[shapeKey];
    if (!generator) {
        console.warn(`Unknown body shape "${shapeKey}", falling back to roundedBox`);
        return SHAPE_GENERATORS.roundedBox(bodyWidth, bodyMeshHeight);
    }
    return generator(bodyWidth, bodyMeshHeight);
}
