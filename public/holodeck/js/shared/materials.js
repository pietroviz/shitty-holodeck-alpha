/**
 * materials.js — Reusable Three.js material factory.
 *
 * Instead of every bridge creating its own MeshStandardMaterial
 * with hardcoded colors, import pre-built materials from here.
 * All colors come from palette.js so changes propagate everywhere.
 *
 * Materials are created fresh each call (Three.js materials can't
 * safely be shared across scenes that might dispose independently).
 */

import * as THREE from 'three';
import { SCENE, MESH } from './palette.js';

// ─────────────────────────────────────────────────────────────────
//  SCENE MATERIALS
// ─────────────────────────────────────────────────────────────────

/** Ground plane beneath builder subjects. */
export function groundMaterial() {
    return new THREE.MeshStandardMaterial({
        color: SCENE.ground,
        roughness: 1.0,
    });
}

/** Grid helper colors (returns { major, minor } for GridHelper). */
export function gridColors() {
    return { major: SCENE.gridMajor, minor: SCENE.gridMinor };
}

// ─────────────────────────────────────────────────────────────────
//  MESH MATERIALS
// ─────────────────────────────────────────────────────────────────

/**
 * Standard PBR material with sensible defaults.
 * @param {number|string} color — hex int (0xRRGGBB) or CSS string ('#RRGGBB')
 * @param {Object}        opts  — optional overrides: roughness, metalness, transparent, opacity
 */
export function standard(color, opts = {}) {
    return new THREE.MeshStandardMaterial({
        color,
        roughness:   opts.roughness   ?? 0.7,
        metalness:   opts.metalness   ?? 0.1,
        transparent: opts.transparent ?? false,
        opacity:     opts.opacity     ?? 1.0,
    });
}

/** Default object preview material (neutral grey). */
export function objectDefault(opts = {}) {
    return standard(MESH.objectDefault, opts);
}

/** Fallback / error material (magenta). */
export function fallback() {
    return standard(MESH.fallback);
}

// ─────────────────────────────────────────────────────────────────
//  TWO-ZONE SHADER MATERIAL
// ─────────────────────────────────────────────────────────────────

/**
 * MeshStandardMaterial with a vertical color split via onBeforeCompile.
 * Used for scalp/skin on heads and torso/bottom on bodies.
 * @param {string} topHex    — CSS hex for top color zone
 * @param {string} bottomHex — CSS hex for bottom color zone
 * @param {number} splitY    — local Y coordinate of the color boundary
 * @param {number} [blend=0] — optional blend zone half-width (unused for now)
 */
export function createTwoZoneMaterial(topHex, bottomHex, splitY, blend = 0) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0.05 });
    const tc = { value: new THREE.Color(topHex) };
    const bc = { value: new THREE.Color(bottomHex) };
    const su = { value: splitY };
    mat.onBeforeCompile = (sh) => {
        sh.uniforms.uTopColor = tc;
        sh.uniforms.uBottomColor = bc;
        sh.uniforms.uSplitY = su;
        sh.vertexShader = sh.vertexShader.replace(
            '#include <common>',
            '#include <common>\nvarying float vModelY;'
        );
        sh.vertexShader = sh.vertexShader.replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\nvModelY = position.y;'
        );
        sh.fragmentShader = sh.fragmentShader.replace(
            '#include <common>',
            '#include <common>\nuniform vec3 uTopColor;\nuniform vec3 uBottomColor;\nuniform float uSplitY;\nvarying float vModelY;'
        );
        sh.fragmentShader = sh.fragmentShader.replace(
            '#include <color_fragment>',
            '#include <color_fragment>\nvec3 zoneColor = vModelY >= uSplitY ? uTopColor : uBottomColor;\ndiffuseColor.rgb *= zoneColor;'
        );
    };
    mat.userData.topColor = tc;
    mat.userData.bottomColor = bc;
    mat.userData.splitY = su;
    return mat;
}
