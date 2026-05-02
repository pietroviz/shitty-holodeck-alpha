/**
 * animationRig.js — Plays a trimmed Mixamo-style animation on a procedural
 * character group.
 *
 * Animation source format (see scripts/split-mixamo-animations.js)
 *   {
 *     duration: number (seconds),
 *     loop: boolean,
 *     emotion: 'happy' | 'angry' | ...,
 *     intent:  'idle'  | 'talk',
 *     tracks: [
 *       { name: 'root.quaternion',  times: [...], values: [...] },
 *       { name: 'torso.quaternion', times: [...], values: [...] },
 *       { name: 'head.quaternion',  times: [...], values: [...] },
 *     ]
 *   }
 *
 * Each track's `name` is `<joint>.<property>`. Joints are looked up by
 * name on the attached character group; tracks targeting a joint that
 * doesn't exist are silently skipped (forwards-compat for v2 head/torso
 * subgroups).
 *
 * v1 only handles `quaternion` properties. position / scale are easy to
 * add later — clone the slerp branch with vec3-lerp.
 *
 * The rig is layered ON TOP of the existing synthetic idle bob in the
 * sim tick loop: animateStoryHeads sets container.position.y (idle
 * breathing) before the rig runs, then the rig writes container.quaternion
 * (Mixamo body sway) without touching position. They coexist cleanly.
 */

import * as THREE from 'three';

const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _qc = new THREE.Quaternion();

// ── Per-joint calibration offsets ────────────────────────────────
// Mixamo's bind pose is T-pose: arms extending horizontally. Our characters
// rest with arms hanging at their sides. To make Mixamo arm-bone quaternions
// land correctly on our armGroups (whose rest pose is arm-down), we
// pre-multiply each frame's quaternion by an offset that rotates "arm
// horizontal" → "arm down".
//
// Left arm: T-pose +X (out to camera-left), rest -Y (down). Rotate -π/2 around Z.
// Right arm: T-pose -X (out to camera-right), rest -Y (down). Rotate +π/2 around Z.
// Head + root + torso don't need offsets — Mixamo's rest matches ours
// (head looks +Z forward, hips upright).
const _CALIBRATION = {
    armL: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2)),
    armR: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0,  Math.PI / 2)),
};

export class AnimationRig {
    constructor() {
        this._joints   = {};   // name → THREE.Object3D
        this._anim     = null; // current animation state
        this._t        = 0;    // current time in seconds
        this._isPlaying = false;
    }

    /**
     * Bind to a character. The 'root' joint is the target group itself.
     * Optional namedJoints map supplies additional handles ('head',
     * 'torso', etc.) — pass whatever subgroups exist on this character.
     * For v1 procedural meshes we just use root.
     */
    attach(targetGroup, namedJoints = null) {
        this._joints = { root: targetGroup };
        if (namedJoints) Object.assign(this._joints, namedJoints);
    }

    /** Begin playing an animation from t=0. Pass the asset's payload.state. */
    play(animState) {
        this._anim = animState || null;
        this._t = 0;
        this._isPlaying = !!animState;
    }

    stop() {
        this._isPlaying = false;
        this._anim = null;
    }

    isPlaying() { return this._isPlaying; }
    currentEmotion() { return this._anim?.emotion || null; }
    currentIntent()  { return this._anim?.intent  || null; }
    /** True if this animation has finished and is non-looping. */
    isFinished() {
        return !!this._anim && !this._anim.loop && this._t >= (this._anim.duration || 0);
    }

    /** Advance the animation by deltaSeconds and apply tracks. */
    update(deltaSeconds) {
        if (!this._isPlaying || !this._anim) return;
        const dur = this._anim.duration || 1;

        this._t += deltaSeconds || 0;
        let t = this._t;

        if (t >= dur) {
            if (this._anim.loop) {
                t = t % dur;
                this._t = t;
            } else {
                t = dur;             // hold final pose
                this._isPlaying = false;
            }
        }

        for (const track of (this._anim.tracks || [])) {
            this._applyTrack(track, t);
        }
    }

    /** Reset every bound joint to identity quaternion. */
    resetJoints() {
        for (const joint of Object.values(this._joints)) {
            if (joint && joint.quaternion) joint.quaternion.identity();
        }
    }

    dispose() {
        this._joints = {};
        this._anim = null;
        this._isPlaying = false;
    }

    // ── internals ──────────────────────────────────────────────────

    _applyTrack(track, t) {
        if (!track || !track.name) return;
        const dot = track.name.indexOf('.');
        if (dot < 0) return;
        const jointName = track.name.slice(0, dot);
        const property  = track.name.slice(dot + 1);

        const joint = this._joints[jointName];
        if (!joint) return;

        const times  = track.times;
        const values = track.values;
        if (!times || !values || times.length === 0) return;

        const i = _findKeyIndex(times, t);
        const j = Math.min(i + 1, times.length - 1);

        if (property === 'quaternion') {
            const stride = 4;
            _qa.set(values[i*stride], values[i*stride+1], values[i*stride+2], values[i*stride+3]);
            if (j !== i) {
                _qb.set(values[j*stride], values[j*stride+1], values[j*stride+2], values[j*stride+3]);
                const span = times[j] - times[i];
                const u    = span > 0 ? (t - times[i]) / span : 0;
                _qa.slerp(_qb, u);
            }
            // Per-joint calibration: take Mixamo bind orientation
            // (T-pose) into our procedural rest orientation. No-op for
            // joints not in the table.
            const cal = _CALIBRATION[jointName];
            if (cal) {
                _qc.copy(cal).multiply(_qa);
                joint.quaternion.copy(_qc);
            } else {
                joint.quaternion.copy(_qa);
            }
        }
        // position.x/y/z and scale.x/y/z support can drop in here when
        // animations carrying them ship.
    }
}

/** Largest index where times[i] <= t. Binary search. */
function _findKeyIndex(times, t) {
    let lo = 0, hi = times.length - 1;
    if (t <= times[0]) return 0;
    if (t >= times[hi]) return hi;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (times[mid] <= t) lo = mid;
        else hi = mid;
    }
    return lo;
}

// ── Animation library helpers ────────────────────────────────────
// Once loadGlobalAssets('Animations') has been called, the runtime can
// pick semantically by emotion+intent without knowing exact ids.

/**
 * Pick an animation from a list matching emotion + intent. Falls back
 * progressively: exact match → same intent any emotion → first available.
 */
export function pickAnimation(animations, { emotion, intent }) {
    if (!Array.isArray(animations) || animations.length === 0) return null;
    const exact = animations.filter(a =>
        a?.payload?.state?.emotion === emotion &&
        a?.payload?.state?.intent  === intent
    );
    if (exact.length) return exact[Math.floor(Math.random() * exact.length)];
    const sameIntent = animations.filter(a => a?.payload?.state?.intent === intent);
    if (sameIntent.length) return sameIntent[Math.floor(Math.random() * sameIntent.length)];
    return animations[0];
}

/** Pull the underlying state object the rig wants. */
export function animationState(animationAsset) {
    return animationAsset?.payload?.state || animationAsset?.state || animationAsset || null;
}
