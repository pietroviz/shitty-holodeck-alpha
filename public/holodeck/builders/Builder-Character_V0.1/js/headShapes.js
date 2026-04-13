import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { HEAD } from './config.js';

/**
 * Head shape generators.
 * Each returns a BufferGeometry with bottom edge at Y=0, extending up to headHeight.
 * Also returns frontZ for face anchor positioning.
 */

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
        depth: depth,
        bevelEnabled: true,
        bevelThickness,
        bevelSize,
        bevelSegments: 3,
        curveSegments: 12,
    };
    const geo = new THREE.ExtrudeGeometry(shape2D, extrudeSettings);
    // ExtrudeGeometry extrudes from Z=0 to Z=depth, bevel adds bevelThickness on each end.
    // Total Z span: -bevelThickness to depth + bevelThickness
    // Center it so front is at +(depth/2 + bevelThickness)
    const totalDepth = depth + bevelThickness * 2;
    geo.translate(0, 0, -totalDepth / 2 + bevelThickness);
    return { geometry: geo, actualFrontZ: totalDepth / 2 };
}

// ── Shape Generators ─────────────────────────────────────

const SHAPE_GENERATORS = {

    roundedBox(headWidth, headHeight) {
        const headDepth = headWidth * HEAD.depthRatio;
        const geo = new RoundedBoxGeometry(
            headWidth, headHeight, headDepth,
            HEAD.segments, HEAD.cornerRadius
        );
        geo.translate(0, headHeight / 2, 0);
        return { geometry: geo, frontZ: headDepth / 2 };
    },

    sphere(headWidth, headHeight) {
        const headDepth = headWidth * HEAD.depthRatio;
        const rx = headWidth / 2;
        const ry = headHeight / 2;
        const rz = headDepth / 2;
        const geo = new THREE.SphereGeometry(1, 24, 18);
        // Scale to ellipsoid
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            pos.setXYZ(i,
                pos.getX(i) * rx,
                pos.getY(i) * ry,
                pos.getZ(i) * rz,
            );
        }
        pos.needsUpdate = true;
        geo.computeVertexNormals();
        geo.translate(0, headHeight / 2, 0);
        return { geometry: geo, frontZ: rz };
    },

    cylinder(headWidth, headHeight) {
        const headDepth = headWidth * HEAD.depthRatio;
        const rx = headWidth / 2;
        const rz = headDepth / 2;
        // Cylinder along Y axis
        const geo = new THREE.CylinderGeometry(rx, rx, headHeight, 24, 1);
        // Scale Z to make it elliptical depth
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const z = pos.getZ(i);
            pos.setZ(i, z * (rz / rx));
        }
        pos.needsUpdate = true;
        geo.computeVertexNormals();
        geo.translate(0, headHeight / 2, 0);
        return { geometry: geo, frontZ: rz };
    },

    cone(headWidth, headHeight) {
        const headDepth = headWidth * HEAD.depthRatio;
        const rx = headWidth / 2;
        const rz = headDepth / 2;
        // Wider at bottom, tapers to point at top
        const geo = new THREE.CylinderGeometry(rx * 0.15, rx, headHeight, 24, 1);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const z = pos.getZ(i);
            pos.setZ(i, z * (rz / rx));
        }
        pos.needsUpdate = true;
        geo.computeVertexNormals();
        geo.translate(0, headHeight / 2, 0);
        return { geometry: geo, frontZ: rz * 0.7 };
    },

    diamond(headWidth, headHeight) {
        const headDepth = headWidth * HEAD.depthRatio;
        const hw = headWidth / 2;
        const hh = headHeight / 2;
        // Diamond = two pyramids meeting at equator
        // Use LatheGeometry for a clean diamond
        const points = [
            new THREE.Vector2(0, -hh),
            new THREE.Vector2(hw, 0),
            new THREE.Vector2(0, hh),
        ];
        const geo = new THREE.LatheGeometry(points, 24);
        // Scale Z for depth
        const pos = geo.attributes.position;
        const rz = headDepth / 2;
        for (let i = 0; i < pos.count; i++) {
            const z = pos.getZ(i);
            pos.setZ(i, z * (rz / hw));
        }
        pos.needsUpdate = true;
        geo.computeVertexNormals();
        geo.translate(0, headHeight / 2, 0);
        return { geometry: geo, frontZ: rz };
    },

    hexagon(headWidth, headHeight) {
        const headDepth = headWidth * HEAD.depthRatio;
        const hw = headWidth / 2;
        const hh = headHeight / 2;
        // Hexagonal cross-section extruded, scaled to headHeight
        const shape = makePolygonShape(6, hw, Math.PI / 6);
        // Scale shape Y to match height
        const pts = shape.getPoints();
        const bounds = { minY: Infinity, maxY: -Infinity };
        for (const p of pts) {
            bounds.minY = Math.min(bounds.minY, p.y);
            bounds.maxY = Math.max(bounds.maxY, p.y);
        }
        const shapeH = bounds.maxY - bounds.minY;
        const scaleY = headHeight / shapeH;
        const scaledShape = new THREE.Shape();
        for (let i = 0; i < pts.length; i++) {
            const x = pts[i].x;
            const y = pts[i].y * scaleY;
            if (i === 0) scaledShape.moveTo(x, y);
            else scaledShape.lineTo(x, y);
        }
        const { geometry: geo, actualFrontZ } = extrudeShape(scaledShape, headWidth, headHeight, headDepth);
        geo.translate(0, headHeight / 2, 0);
        return { geometry: geo, frontZ: actualFrontZ };
    },

    star(headWidth, headHeight) {
        const headDepth = headWidth * HEAD.depthRatio;
        const hw = headWidth / 2;
        const hh = headHeight / 2;
        // 5-point star, scaled to fit
        const shape = makeStarShape(5, hw, hw * 0.42, -Math.PI / 2);
        // Scale Y to headHeight
        const pts = shape.getPoints();
        const bounds = { minY: Infinity, maxY: -Infinity };
        for (const p of pts) {
            bounds.minY = Math.min(bounds.minY, p.y);
            bounds.maxY = Math.max(bounds.maxY, p.y);
        }
        const shapeH = bounds.maxY - bounds.minY;
        const scaleY = headHeight / shapeH;
        const scaledShape = new THREE.Shape();
        for (let i = 0; i < pts.length; i++) {
            const x = pts[i].x;
            const y = pts[i].y * scaleY;
            if (i === 0) scaledShape.moveTo(x, y);
            else scaledShape.lineTo(x, y);
        }
        const { geometry: geo, actualFrontZ } = extrudeShape(scaledShape, headWidth, headHeight, headDepth);
        geo.translate(0, headHeight / 2, 0);
        return { geometry: geo, frontZ: actualFrontZ };
    },

    triangle(headWidth, headHeight) {
        const headDepth = headWidth * HEAD.depthRatio;
        const hw = headWidth / 2;
        // Triangle: wide at bottom, point at top
        const shape = new THREE.Shape();
        shape.moveTo(0, headHeight);        // top point
        shape.lineTo(-hw, 0);               // bottom-left
        shape.lineTo(hw, 0);                // bottom-right
        shape.lineTo(0, headHeight);         // close
        const { geometry: geo, actualFrontZ } = extrudeShape(shape, headWidth, headHeight, headDepth);
        // Already has bottom at Y=0
        return { geometry: geo, frontZ: actualFrontZ };
    },
};

/**
 * Available head shape keys.
 */
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

/**
 * Generate a head geometry for the given shape key.
 * @returns {{ geometry: THREE.BufferGeometry, frontZ: number }}
 */
export function generateHeadGeometry(shapeKey, headWidth, headHeight) {
    const generator = SHAPE_GENERATORS[shapeKey];
    if (!generator) {
        console.warn(`Unknown head shape "${shapeKey}", falling back to roundedBox`);
        return SHAPE_GENERATORS.roundedBox(headWidth, headHeight);
    }
    return generator(headWidth, headHeight);
}
