/**
 * propRenderer.js — Renders prop JSON assets as THREE.Group meshes.
 * Shared module extracted from Builder-Character_V0.1/js/propRenderer.js.
 */

import * as THREE from 'three';

const PRIM_FACTORIES = {
    box(p) {
        return new THREE.BoxGeometry(p.width || p.sx || 1, p.height || p.sy || 1, p.depth || p.sz || 1);
    },
    sphere(p) {
        return new THREE.SphereGeometry(p.radius || 0.5, 16, 12);
    },
    cylinder(p) {
        const r = p.radius ?? 0.5;
        return new THREE.CylinderGeometry(p.radiusTop ?? r, p.radiusBottom ?? r, p.height || 1, 16);
    },
    cone(p) {
        return new THREE.ConeGeometry(p.radius || 0.5, p.height || 1, 16);
    },
    torus(p) {
        return new THREE.TorusGeometry(p.radius || 0.5, p.tubeRadius || p.tube || 0.15, 12, 24);
    },
    capsule(p) {
        return new THREE.CapsuleGeometry(p.radius || 0.3, p.length || 1, 8, 12);
    },
    hemisphere(p) {
        return new THREE.SphereGeometry(p.radius || 0.5, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    },
    pyramid(p) {
        return new THREE.ConeGeometry((p.baseWidth || 1) / 2, p.height || 1, 4);
    },

    /* ── Additional primitives used by global assets ── */

    /** Wedge — triangular prism (right-angle wedge extruded along depth). */
    wedge(p) {
        const w = p.width || 1, h = p.height || 1, d = p.depth || 0.5;
        const shape = new THREE.Shape();
        shape.moveTo(-w / 2, -h / 2);
        shape.lineTo( w / 2, -h / 2);
        shape.lineTo( 0,      h / 2);
        shape.closePath();
        return new THREE.ExtrudeGeometry(shape, {
            depth: d, bevelEnabled: false,
        }).translate(0, 0, -d / 2);   // center along z
    },

    /** Rounded box — box with small bevel on edges. */
    'rounded-box'(p) {
        const w = p.width || p.sx || 1, h = p.height || p.sy || 1, d = p.depth || p.sz || 1;
        const bevel = Math.min(w, h, d) * 0.12;
        const hw = w / 2 - bevel, hh = h / 2 - bevel;
        const shape = new THREE.Shape();
        shape.moveTo(-hw, -h / 2);
        shape.lineTo( hw, -h / 2);
        shape.quadraticCurveTo( w / 2, -h / 2,  w / 2, -hh);
        shape.lineTo( w / 2,  hh);
        shape.quadraticCurveTo( w / 2,  h / 2,  hw,     h / 2);
        shape.lineTo(-hw,  h / 2);
        shape.quadraticCurveTo(-w / 2,  h / 2, -w / 2,  hh);
        shape.lineTo(-w / 2, -hh);
        shape.quadraticCurveTo(-w / 2, -h / 2, -hw,    -h / 2);
        return new THREE.ExtrudeGeometry(shape, {
            depth: d, bevelEnabled: false,
        }).translate(0, 0, -d / 2);
    },

    /** Star — extruded star polygon. */
    star(p) {
        const pts = p.points || 5;
        const outer = p.outerRadius || 0.5;
        const inner = p.innerRadius || outer * 0.4;
        const d = p.depth || 0.1;
        const shape = new THREE.Shape();
        for (let i = 0; i < pts * 2; i++) {
            const angle = (i / (pts * 2)) * Math.PI * 2 - Math.PI / 2;
            const r = i % 2 === 0 ? outer : inner;
            const x = Math.cos(angle) * r;
            const y = Math.sin(angle) * r;
            if (i === 0) shape.moveTo(x, y);
            else shape.lineTo(x, y);
        }
        shape.closePath();
        return new THREE.ExtrudeGeometry(shape, {
            depth: d, bevelEnabled: false,
        }).translate(0, 0, -d / 2);
    },

    /** Tube — hollow cylinder (annular cross-section extruded upward). */
    tube(p) {
        const outer = p.outerRadius || p.radius || 0.5;
        const inner = p.innerRadius || outer * 0.7;
        const h = p.height || 1;
        const segs = 32;
        const shape = new THREE.Shape();
        // Outer circle
        for (let i = 0; i <= segs; i++) {
            const a = (i / segs) * Math.PI * 2;
            const x = Math.cos(a) * outer, y = Math.sin(a) * outer;
            if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
        }
        // Inner hole (wound in reverse)
        const hole = new THREE.Path();
        for (let i = 0; i <= segs; i++) {
            const a = (i / segs) * Math.PI * 2;
            const x = Math.cos(a) * inner, y = Math.sin(a) * inner;
            if (i === 0) hole.moveTo(x, y); else hole.lineTo(x, y);
        }
        shape.holes.push(hole);
        const geo = new THREE.ExtrudeGeometry(shape, {
            depth: h, bevelEnabled: false,
        });
        // Rotate so extrusion goes along Y axis, center vertically
        geo.rotateX(-Math.PI / 2);
        geo.translate(0, h / 2, 0);
        return geo;
    },
};

function resolveColor(fillToken, colorAssignments, overrideColor) {
    if (overrideColor && fillToken === 'primary') return overrideColor;
    if (colorAssignments && colorAssignments[fillToken]) return colorAssignments[fillToken];
    return '#888888';
}

export function renderProp(propData, options = {}) {
    // Support both normalized schema (payload._editor) and legacy/direct shapes
    const payload = propData.payload || {};
    const editor  = payload._editor || propData._editor || propData.state?._editor || {};
    const elements = editor.elements || [];
    const colorAssignments = editor.color_assignments || payload.color_assignments || {};

    const group = new THREE.Group();
    group.name = propData.id || 'prop';
    group.userData.propId = propData.id;

    const sorted = [...elements].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

    for (const el of sorted) {
        const factory = PRIM_FACTORIES[el.primitiveId || el.primitive || el.type];
        if (!factory) continue;

        // Support both nested params ({ params: { ... } }) and flat element format
        const p = el.params || el;
        const geometry = factory(p);
        const color = resolveColor(p.fill || 'primary', colorAssignments, options.primaryColor);
        const material = new THREE.MeshStandardMaterial({
            color, metalness: p.metalness ?? 0.1, roughness: p.roughness ?? 0.7,
            transparent: (p.opacity ?? 1) < 1, opacity: p.opacity ?? 1,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = el.id || '';
        mesh.castShadow = true;
        mesh.position.set(p.px || 0, p.py || 0, p.pz || 0);
        const deg = Math.PI / 180;
        mesh.rotation.set((p.rx || 0) * deg, (p.ry || 0) * deg, (p.rz || 0) * deg);
        group.add(mesh);
    }

    if (options.scale) group.scale.setScalar(options.scale);
    return group;
}

export async function loadAndRenderProp(url, options = {}) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to load prop: ${url}`);
    const propData = await resp.json();
    return renderProp(propData, options);
}
