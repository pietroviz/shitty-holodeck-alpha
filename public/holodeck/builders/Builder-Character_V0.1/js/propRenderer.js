/**
 * propRenderer.js — Renders prop JSON assets as THREE.Group meshes.
 *
 * Converts the element-based prop format (composed of 3D primitives)
 * into Three.js geometry groups with proper materials.
 */

import * as THREE from 'three';

// ── Primitive Geometry Factories ──────────────────────────

const PRIM_FACTORIES = {
    box(p) {
        const w = p.width || p.sx || 1;
        const h = p.height || p.sy || 1;
        const d = p.depth || p.sz || 1;
        return new THREE.BoxGeometry(w, h, d);
    },

    sphere(p) {
        return new THREE.SphereGeometry(p.radius || 0.5, 16, 12);
    },

    cylinder(p) {
        const r = p.radius ?? 0.5;
        const rTop = p.radiusTop ?? r;
        const rBot = p.radiusBottom ?? r;
        const h = p.height || 1;
        return new THREE.CylinderGeometry(rTop, rBot, h, 16);
    },

    cone(p) {
        const r = p.radius || 0.5;
        const h = p.height || 1;
        return new THREE.ConeGeometry(r, h, 16);
    },

    torus(p) {
        const r = p.radius || 0.5;
        const tube = p.tubeRadius || p.tube || 0.15;
        return new THREE.TorusGeometry(r, tube, 12, 24);
    },

    capsule(p) {
        const r = p.radius || 0.3;
        const len = p.length || 1;
        return new THREE.CapsuleGeometry(r, len, 8, 12);
    },

    hemisphere(p) {
        const r = p.radius || 0.5;
        return new THREE.SphereGeometry(r, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    },

    pyramid(p) {
        const w = p.baseWidth || 1;
        const h = p.height || 1;
        return new THREE.ConeGeometry(w / 2, h, 4);
    },
};

// ── Color Resolution ─────────────────────────────────────

function resolveColor(fillToken, colorAssignments, overrideColor) {
    if (overrideColor && fillToken === 'primary') {
        return overrideColor;
    }
    if (colorAssignments && colorAssignments[fillToken]) {
        return colorAssignments[fillToken];
    }
    return '#888888';
}

// ── Build Group from Prop JSON ───────────────────────────

/**
 * Render a prop JSON definition into a THREE.Group.
 *
 * @param {Object} propData — The full prop JSON object
 * @param {Object} [options]
 * @param {string} [options.primaryColor] — Override the primary color
 * @param {number} [options.scale] — Uniform scale to apply
 * @returns {THREE.Group}
 */
export function renderProp(propData, options = {}) {
    const payload = propData.payload;
    const elements = payload._editor?.elements || [];
    const colorAssignments = payload._editor?.color_assignments || payload.color_assignments || {};

    const group = new THREE.Group();
    group.name = propData.id || 'prop';
    group.userData.propId = propData.id;

    // Sort elements by zIndex for consistent ordering
    const sorted = [...elements].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

    for (const el of sorted) {
        const factory = PRIM_FACTORIES[el.primitiveId || el.primitive];
        if (!factory) {
            console.warn(`Unknown primitive "${el.primitiveId || el.primitive}" in prop ${propData.id}`);
            continue;
        }

        const p = el.params || {};
        const geometry = factory(p);

        // Material
        const color = resolveColor(p.fill || 'primary', colorAssignments, options.primaryColor);
        const material = new THREE.MeshStandardMaterial({
            color,
            metalness: p.metalness ?? 0.1,
            roughness: p.roughness ?? 0.7,
            transparent: (p.opacity ?? 1) < 1,
            opacity: p.opacity ?? 1,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = el.id || '';
        mesh.castShadow = true;

        // Position
        mesh.position.set(p.px || 0, p.py || 0, p.pz || 0);

        // Rotation (degrees → radians)
        const deg = Math.PI / 180;
        mesh.rotation.set(
            (p.rx || 0) * deg,
            (p.ry || 0) * deg,
            (p.rz || 0) * deg
        );

        group.add(mesh);
    }

    // Apply scale if specified
    if (options.scale) {
        group.scale.setScalar(options.scale);
    }

    return group;
}

/**
 * Load a prop JSON file and render it.
 *
 * @param {string} url — Path to the prop JSON file
 * @param {Object} [options] — Same as renderProp options
 * @returns {Promise<THREE.Group>}
 */
export async function loadAndRenderProp(url, options = {}) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to load prop: ${url}`);
    const propData = await resp.json();
    return renderProp(propData, options);
}
