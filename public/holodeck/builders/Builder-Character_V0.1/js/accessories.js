/**
 * accessories.js — Asset-based headwear, glasses, and facial hair.
 *
 * All accessories are loaded from JSON prop assets.
 * Each function returns a THREE.Group positioned in the appropriate local space.
 */

import * as THREE from 'three';
import { renderProp } from './propRenderer.js';

// ── Prop Data Cache ──────────────────────────────────────

const propCache = {};

/**
 * Preload prop JSON files from a manifest array.
 * Each entry: { id, path }
 */
export async function preloadProps(manifest) {
    const fetches = manifest.map(async (entry) => {
        try {
            const resp = await fetch(entry.path);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            propCache[entry.id] = await resp.json();
        } catch (err) {
            console.warn(`Failed to load prop "${entry.id}":`, err);
        }
    });
    await Promise.all(fetches);
}

// Backward-compat alias
export const preloadHeadwear = preloadProps;

// ── Reference scale for prop assets ──────────────────────
const PROP_REF_WIDTH = 1.1;
// Face accessories (glasses, facial hair) are designed at a smaller reference
const FACE_PROP_REF_WIDTH = 0.55;
// Facial hair props are designed at a much smaller scale
const FACIAL_HAIR_REF_WIDTH = 0.18;

// ── Headwear (Hair & Hats from assets) ───────────────────

/**
 * Create a headwear mesh from a cached prop asset.
 */
export function createHeadwearMesh(propId, color, headWidth, headTopY) {
    if (!propId || propId === 'none') return null;

    const propData = propCache[propId];
    if (!propData) {
        console.warn(`Headwear prop "${propId}" not found in cache`);
        return null;
    }

    const scale = headWidth / PROP_REF_WIDTH;
    const group = renderProp(propData, { primaryColor: color, scale });
    group.name = `headwear_${propId}`;
    group.position.y = headTopY;

    return group;
}

// ── Glasses (from assets) ────────────────────────────────

/**
 * Create glasses mesh from a cached prop asset.
 * Positioned relative to the face anchor group (eye-level).
 *
 * @param {string} propId — The prop asset ID (e.g. 'prop_round_glasses')
 * @param {string} color — Primary color override (hex)
 * @param {number} headWidth — Current head mesh width (for scaling)
 * @param {number} eyeY — Y position of eyes in face anchor local space
 * @param {number} faceZ — Z position of face surface
 * @returns {THREE.Group|null}
 */
export function createGlassesMesh(propId, color, headWidth, eyeY, faceZ) {
    if (!propId || propId === 'none') return null;

    const propData = propCache[propId];
    if (!propData) {
        console.warn(`Glasses prop "${propId}" not found in cache`);
        return null;
    }

    const scale = headWidth / FACE_PROP_REF_WIDTH;
    const group = renderProp(propData, { primaryColor: color, scale });
    group.name = `glasses_${propId}`;

    // Position at eye level, on face surface
    group.position.set(0, eyeY, faceZ + 0.01);

    return group;
}

// ── Facial Hair (from assets) ────────────────────────────

/**
 * Create facial hair mesh from a cached prop asset.
 *
 * @param {string} propId — The prop asset ID (e.g. 'prop_mustache')
 * @param {string} color — Primary color override (hex)
 * @param {number} headWidth — Current head mesh width (for scaling)
 * @param {number} mouthY — Y position of mouth in face anchor local space
 * @param {number} faceZ — Z position of face surface
 * @returns {THREE.Group|null}
 */
export function createFacialHairMesh(propId, color, headWidth, mouthY, faceZ) {
    if (!propId || propId === 'none') return null;

    const propData = propCache[propId];
    if (!propData) {
        console.warn(`Facial hair prop "${propId}" not found in cache`);
        return null;
    }

    const scale = headWidth / FACIAL_HAIR_REF_WIDTH;
    const group = renderProp(propData, { primaryColor: color, scale });
    group.name = `facialHair_${propId}`;

    // Position at mouth level, on face surface
    // Props are designed with Y=0 at mouth center — nudge down slightly
    group.position.set(0, mouthY - 0.02, faceZ + 0.01);

    return group;
}

// ── Dispose Helper ───────────────────────────────────────

export function disposeAccessory(group) {
    if (!group) return;
    group.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (child.material.map) child.material.map.dispose();
            child.material.dispose();
        }
    });
    if (group.parent) group.parent.remove(group);
}
