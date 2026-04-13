/**
 * boneConstraints.js — Post-animation bone rotation clamping.
 *
 * Runs after the animation mixer updates each frame to enforce
 * rotation limits on specific bones. This prevents unrealistic poses
 * on the blocky character (e.g., head spinning 180°, spine bending
 * too far, arms clipping through body).
 *
 * Uses quaternion slerp toward rest pose when a bone exceeds its
 * angular limit — soft clamping instead of hard cutoff.
 */

import * as THREE from 'three';

const _euler = new THREE.Euler();
const _qRest = new THREE.Quaternion();

// ── Rotation Limits (degrees) ────────────────────────────
// Each entry: { x: [min, max], y: [min, max], z: [min, max] }
// All values in degrees. null = unconstrained on that axis.

const BONE_LIMITS = {
    mixamorigHead: {
        x: [-30, 30],   // nod
        y: [-45, 45],   // turn
        z: [-20, 20],   // tilt
    },
    mixamorigNeck: {
        x: [-20, 20],
        y: [-30, 30],
        z: [-15, 15],
    },
    mixamorigSpine2: {
        x: [-20, 20],
        y: [-25, 25],
        z: [-15, 15],
    },
    mixamorigSpine1: {
        x: [-15, 15],
        y: [-20, 20],
        z: [-10, 10],
    },
    mixamorigSpine: {
        x: [-10, 10],
        y: [-15, 15],
        z: [-8, 8],
    },
    // Shoulder limits — prevent extreme raises
    mixamorigLeftShoulder: {
        x: [-30, 30],
        y: [-20, 20],
        z: [-45, 10],
    },
    mixamorigRightShoulder: {
        x: [-30, 30],
        y: [-20, 20],
        z: [-10, 45],
    },
};

const DEG = Math.PI / 180;

/**
 * Clamp a value between min and max.
 */
function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

/**
 * Soft-clamp an Euler angle.
 * If within limits, return as-is. If outside, smoothly blend
 * toward the limit boundary.
 */
function softClamp(angle, minDeg, maxDeg) {
    const minRad = minDeg * DEG;
    const maxRad = maxDeg * DEG;
    return clamp(angle, minRad, maxRad);
}

/**
 * BoneConstraints enforces rotation limits on character bones.
 */
export class BoneConstraints {
    /**
     * @param {Object} bones — Map of bone name → THREE.Bone
     * @param {number} [strength=0.8] — How strongly to enforce constraints (0 = off, 1 = hard clamp)
     */
    constructor(bones, strength = 0.8) {
        this.bones = bones;
        this.strength = strength;
        this._constrainedBones = [];

        // Find matching bones from the BONE_LIMITS map
        for (const [limitName, limits] of Object.entries(BONE_LIMITS)) {
            // Try to find the bone — limitName uses sanitized format
            for (const [boneKey, bone] of Object.entries(bones)) {
                const sanitized = bone.name || '';
                if (sanitized === limitName || sanitized.endsWith(limitName)) {
                    this._constrainedBones.push({ bone, limits });
                    break;
                }
            }
        }
    }

    /**
     * Apply rotation constraints. Call this AFTER animationManager.update()
     * each frame.
     */
    update() {
        if (this.strength <= 0) return;

        for (const { bone, limits } of this._constrainedBones) {
            // Get current rotation as Euler
            _euler.setFromQuaternion(bone.quaternion, 'XYZ');

            let clamped = false;

            if (limits.x) {
                const cx = softClamp(_euler.x, limits.x[0], limits.x[1]);
                if (cx !== _euler.x) { _euler.x = cx; clamped = true; }
            }
            if (limits.y) {
                const cy = softClamp(_euler.y, limits.y[0], limits.y[1]);
                if (cy !== _euler.y) { _euler.y = cy; clamped = true; }
            }
            if (limits.z) {
                const cz = softClamp(_euler.z, limits.z[0], limits.z[1]);
                if (cz !== _euler.z) { _euler.z = cz; clamped = true; }
            }

            if (clamped) {
                // Blend between original and clamped based on strength
                _qRest.setFromEuler(_euler);
                bone.quaternion.slerp(_qRest, this.strength);
            }
        }
    }

    /**
     * Set constraint strength.
     * @param {number} s — 0 (off) to 1 (hard clamp)
     */
    setStrength(s) {
        this.strength = Math.max(0, Math.min(1, s));
    }
}
