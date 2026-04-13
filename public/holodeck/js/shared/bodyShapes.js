import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CHARACTER } from './charConfig.js';

const SHAPE_GENERATORS = {
    roundedBox(bodyWidth, bodyMeshHeight) {
        return new RoundedBoxGeometry(bodyWidth, bodyMeshHeight, bodyWidth, CHARACTER.boxSegments, CHARACTER.cornerRadius);
    },
    cylinder(bodyWidth, bodyMeshHeight) {
        return new THREE.CylinderGeometry(bodyWidth / 2, bodyWidth / 2, bodyMeshHeight, 24, 8);
    },
    capsule(bodyWidth, bodyMeshHeight) {
        const r = bodyWidth / 2;
        const middleLen = Math.max(0, bodyMeshHeight - bodyWidth);
        return new THREE.CapsuleGeometry(r, middleLen, 8, 24);
    },
    cone(bodyWidth, bodyMeshHeight) {
        const rBottom = bodyWidth / 2;
        return new THREE.CylinderGeometry(rBottom * 0.55, rBottom, bodyMeshHeight, 24, 8);
    },
    invertedCone(bodyWidth, bodyMeshHeight) {
        const rTop = bodyWidth / 2;
        return new THREE.CylinderGeometry(rTop, rTop * 0.55, bodyMeshHeight, 24, 8);
    },
    hexagon(bodyWidth, bodyMeshHeight) {
        return new THREE.CylinderGeometry(bodyWidth / 2, bodyWidth / 2, bodyMeshHeight, 6, 8);
    },
    sphere(bodyWidth, bodyMeshHeight) {
        const rx = bodyWidth / 2, ry = bodyMeshHeight / 2;
        const geo = new THREE.SphereGeometry(1, 24, 16);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            pos.setXYZ(i, pos.getX(i) * rx, pos.getY(i) * ry, pos.getZ(i) * rx);
        }
        pos.needsUpdate = true;
        geo.computeVertexNormals();
        return geo;
    },
    barrel(bodyWidth, bodyMeshHeight) {
        const segments = 16;
        const rBase = bodyWidth / 2;
        const points = [];
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const y = (t - 0.5) * bodyMeshHeight;
            const bulge = 1.0 + 0.25 * Math.sin(t * Math.PI);
            points.push(new THREE.Vector2(rBase * bulge, y));
        }
        return new THREE.LatheGeometry(points, 24);
    },
};

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

export function generateBodyGeometry(shapeKey, bodyWidth, bodyMeshHeight) {
    const generator = SHAPE_GENERATORS[shapeKey];
    if (!generator) {
        console.warn(`Unknown body shape "${shapeKey}", falling back to roundedBox`);
        return SHAPE_GENERATORS.roundedBox(bodyWidth, bodyMeshHeight);
    }
    return generator(bodyWidth, bodyMeshHeight);
}
