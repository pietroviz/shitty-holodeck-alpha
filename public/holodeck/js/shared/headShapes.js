import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { HEAD } from './charConfig.js';

// ── Helpers ──────────────────────────────────────────────

function makePolygonShape(sides, radius, rotation = 0) {
    const shape = new THREE.Shape();
    for (let i = 0; i <= sides; i++) {
        const angle = (i / sides) * Math.PI * 2 + rotation;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
    }
    return shape;
}

function makeStarShape(points, outerR, innerR, rotation = 0) {
    const shape = new THREE.Shape();
    const total = points * 2;
    for (let i = 0; i <= total; i++) {
        const angle = (i / total) * Math.PI * 2 + rotation;
        const r = i % 2 === 0 ? outerR : innerR;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
    }
    return shape;
}

function extrudeShape(shape2D, headWidth, headHeight, depth) {
    const bevelThickness = Math.min(depth * 0.15, 0.03);
    const bevelSize = Math.min(depth * 0.12, 0.025);
    const extrudeSettings = {
        depth,
        bevelEnabled: true,
        bevelThickness,
        bevelSize,
        bevelSegments: 3,
        curveSegments: 12,
    };
    const geo = new THREE.ExtrudeGeometry(shape2D, extrudeSettings);
    const totalDepth = depth + bevelThickness * 2;
    geo.translate(0, 0, -totalDepth / 2 + bevelThickness);
    return { geometry: geo, actualFrontZ: totalDepth / 2 };
}

// ── Shape Generators ─────────────────────────────────────

const SHAPE_GENERATORS = {
    roundedBox(headWidth, headHeight) {
        const headDepth = headWidth * HEAD.depthRatio;
        const geo = new RoundedBoxGeometry(headWidth, headHeight, headDepth, HEAD.segments, HEAD.cornerRadius);
        geo.translate(0, headHeight / 2, 0);
        return { geometry: geo, frontZ: headDepth / 2 };
    },

    sphere(headWidth, headHeight) {
        const headDepth = headWidth * HEAD.depthRatio;
        const rx = headWidth / 2, ry = headHeight / 2, rz = headDepth / 2;
        const geo = new THREE.SphereGeometry(1, 24, 18);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            pos.setXYZ(i, pos.getX(i) * rx, pos.getY(i) * ry, pos.getZ(i) * rz);
        }
        pos.needsUpdate = true;
        geo.computeVertexNormals();
        geo.translate(0, headHeight / 2, 0);
        return { geometry: geo, frontZ: rz };
    },

    cylinder(headWidth, headHeight) {
        const headDepth = headWidth * HEAD.depthRatio;
        const rx = headWidth / 2, rz = headDepth / 2;
        const geo = new THREE.CylinderGeometry(rx, rx, headHeight, 24, 1);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            pos.setZ(i, pos.getZ(i) * (rz / rx));
        }
        pos.needsUpdate = true;
        geo.computeVertexNormals();
        geo.translate(0, headHeight / 2, 0);
        return { geometry: geo, frontZ: rz };
    },

    cone(headWidth, headHeight) {
        const headDepth = headWidth * HEAD.depthRatio;
        const rx = headWidth / 2, rz = headDepth / 2;
        const geo = new THREE.CylinderGeometry(rx * 0.15, rx, headHeight, 24, 1);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            pos.setZ(i, pos.getZ(i) * (rz / rx));
        }
        pos.needsUpdate = true;
        geo.computeVertexNormals();
        geo.translate(0, headHeight / 2, 0);
        return { geometry: geo, frontZ: rz * 0.7 };
    },

    diamond(headWidth, headHeight) {
        const headDepth = headWidth * HEAD.depthRatio;
        const hw = headWidth / 2, hh = headHeight / 2, rz = headDepth / 2;
        const points = [
            new THREE.Vector2(0, -hh),
            new THREE.Vector2(hw, 0),
            new THREE.Vector2(0, hh),
        ];
        const geo = new THREE.LatheGeometry(points, 24);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            pos.setZ(i, pos.getZ(i) * (rz / hw));
        }
        pos.needsUpdate = true;
        geo.computeVertexNormals();
        geo.translate(0, headHeight / 2, 0);
        return { geometry: geo, frontZ: rz };
    },

    hexagon(headWidth, headHeight) {
        const headDepth = headWidth * HEAD.depthRatio;
        const hw = headWidth / 2;
        const shape = makePolygonShape(6, hw, Math.PI / 6);
        const pts = shape.getPoints();
        const bounds = { minY: Infinity, maxY: -Infinity };
        for (const p of pts) { bounds.minY = Math.min(bounds.minY, p.y); bounds.maxY = Math.max(bounds.maxY, p.y); }
        const scaleY = headHeight / (bounds.maxY - bounds.minY);
        const scaledShape = new THREE.Shape();
        for (let i = 0; i < pts.length; i++) {
            const x = pts[i].x, y = pts[i].y * scaleY;
            if (i === 0) scaledShape.moveTo(x, y); else scaledShape.lineTo(x, y);
        }
        const { geometry: geo, actualFrontZ } = extrudeShape(scaledShape, headWidth, headHeight, headDepth);
        geo.translate(0, headHeight / 2, 0);
        return { geometry: geo, frontZ: actualFrontZ };
    },

    star(headWidth, headHeight) {
        const headDepth = headWidth * HEAD.depthRatio;
        const hw = headWidth / 2;
        const shape = makeStarShape(5, hw, hw * 0.42, -Math.PI / 2);
        const pts = shape.getPoints();
        const bounds = { minY: Infinity, maxY: -Infinity };
        for (const p of pts) { bounds.minY = Math.min(bounds.minY, p.y); bounds.maxY = Math.max(bounds.maxY, p.y); }
        const scaleY = headHeight / (bounds.maxY - bounds.minY);
        const scaledShape = new THREE.Shape();
        for (let i = 0; i < pts.length; i++) {
            const x = pts[i].x, y = pts[i].y * scaleY;
            if (i === 0) scaledShape.moveTo(x, y); else scaledShape.lineTo(x, y);
        }
        const { geometry: geo, actualFrontZ } = extrudeShape(scaledShape, headWidth, headHeight, headDepth);
        geo.translate(0, headHeight / 2, 0);
        return { geometry: geo, frontZ: actualFrontZ };
    },

    triangle(headWidth, headHeight) {
        const headDepth = headWidth * HEAD.depthRatio;
        const hw = headWidth / 2;
        const shape = new THREE.Shape();
        shape.moveTo(0, headHeight);
        shape.lineTo(-hw, 0);
        shape.lineTo(hw, 0);
        shape.lineTo(0, headHeight);
        const { geometry: geo, actualFrontZ } = extrudeShape(shape, headWidth, headHeight, headDepth);
        return { geometry: geo, frontZ: actualFrontZ };
    },
};

export const HEAD_SHAPE_OPTIONS = [
    { key: 'roundedBox', label: 'Box' },
    { key: 'sphere',     label: 'Sphere' },
    { key: 'cylinder',   label: 'Cylinder' },
    { key: 'cone',       label: 'Cone' },
    { key: 'diamond',    label: 'Diamond' },
    { key: 'hexagon',    label: 'Hexagon' },
    { key: 'star',       label: 'Star' },
    { key: 'triangle',   label: 'Triangle' },
];

export function generateHeadGeometry(shapeKey, headWidth, headHeight) {
    const generator = SHAPE_GENERATORS[shapeKey];
    if (!generator) {
        console.warn(`Unknown head shape "${shapeKey}", falling back to roundedBox`);
        return SHAPE_GENERATORS.roundedBox(headWidth, headHeight);
    }
    return generator(headWidth, headHeight);
}
