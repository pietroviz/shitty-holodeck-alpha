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

// ── Calibration approach ─────────────────────────────────────────
// Mixamo bone tracks are LOCAL rotations relative to a parent chain
// (Hips → Spine × N → Shoulder → Arm). Without that chain we can't
// reproduce Mixamo's world-space arm/head poses directly — applying
// LeftArm.quaternion alone makes the arm shoot off in some non-rest
// direction because the spine + shoulder rotations aren't there.
//
// Trick: every animation's FRAME 0 represents the actor's starting pose.
// inverse(frame0) * frame_t = the relative motion within the animation,
// independent of where the actor was standing. We then layer that
// relative motion on top of OUR character's rest pose:
//
//     joint.quaternion = jointRest * inverse(frame0) * frame_t
//
// At frame 0: relative motion is identity → joint stays at jointRest
// (our character's natural pose: arms by side, head forward, container
// turned 45° inward, etc.). Animation only contributes the actor's
// motion delta, never their absolute body orientation.
//
// This works for ALL joints uniformly — no per-joint hardcoded offsets.

export class AnimationRig {
    constructor() {
        this._joints   = {};   // name → THREE.Object3D
        this._rests    = {};   // name → THREE.Quaternion (joint's rest quaternion at attach)
        this._baseInv  = {};   // track-name → inverse(frame0 quaternion), per anim
        this._anim     = null; // current animation state
        this._t        = 0;    // current time in seconds
        this._isPlaying = false;
    }

    /**
     * Bind to a character. The 'root' joint is the target group itself.
     * Optional namedJoints map supplies additional handles ('head',
     * 'torso', 'armL', 'armR', etc.) — pass whatever subgroups exist
     * on this character.
     *
     * Each joint's CURRENT quaternion is snapshotted as its "rest" pose
     * (e.g. the container's inward 45° rotation, the arm group's identity).
     * Animation deltas compose onto this rest, so authoring rotations
     * (CHAR_B turned inward) survive playback.
     */
    attach(targetGroup, namedJoints = null) {
        this._joints = { root: targetGroup };
        this._rests  = { root: targetGroup.quaternion.clone() };
        if (namedJoints) {
            for (const [name, joint] of Object.entries(namedJoints)) {
                if (!joint) continue;
                this._joints[name] = joint;
                this._rests[name]  = joint.quaternion.clone();
            }
        }
    }

    /**
     * Begin playing an animation from t=0. For each quaternion track,
     * snapshot the inverse of its frame-0 value — this is the rotation
     * that "subtracts" the actor's starting pose so only relative motion
     * gets layered onto our character's rest.
     */
    play(animState) {
        this._anim = animState || null;
        this._t = 0;
        this._isPlaying = !!animState;
        this._baseInv = {};
        if (this._isPlaying) {
            for (const track of (this._anim.tracks || [])) {
                if (!track.values || track.values.length < 4) continue;
                if (!track.name?.endsWith('.quaternion')) continue;
                const q0 = new THREE.Quaternion(
                    track.values[0], track.values[1], track.values[2], track.values[3],
                );
                this._baseInv[track.name] = q0.invert();
            }
        }
    }

    stop() {
        this._isPlaying = false;
        this._anim = null;
        this._baseInv = {};
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

    /** Reset every bound joint to its rest quaternion (the snapshot from attach). */
    resetJoints() {
        for (const [name, joint] of Object.entries(this._joints)) {
            const rest = this._rests[name];
            if (joint && joint.quaternion) {
                if (rest) joint.quaternion.copy(rest);
                else      joint.quaternion.identity();
            }
        }
    }

    dispose() {
        this._joints = {};
        this._rests = {};
        this._baseInv = {};
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
            // Compose: rest * inverse(frame0) * frame_t. The middle term
            // is the relative motion within the animation; multiplying
            // by rest preserves authored rotations (inward-turned cast
            // containers, arm groups in arm-down orientation, etc.).
            const baseInv = this._baseInv[track.name];
            const rest    = this._rests[jointName];
            _qc.copy(_qa);
            if (baseInv) _qc.copy(baseInv).multiply(_qa);
            if (rest)    joint.quaternion.copy(rest).multiply(_qc);
            else         joint.quaternion.copy(_qc);
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
