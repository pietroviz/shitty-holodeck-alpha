/**
 * cameraShots.js — Shared camera-shot poses and cut policy for sim playback.
 *
 * One source of truth for "what camera should be doing right now" so the
 * SimulationBridge editor and the homepage random-sim playback (in
 * previewRenderer) stay in sync.
 *
 * Three v1 shots — wide, two_shot, close_up — derived from CAST_LAYOUT and
 * SIM_CAMERA in shared/envGeometry.js. Add new shots here; both playback
 * paths pick them up automatically.
 *
 * Designed to plug into a future beat-aware cut policy: pickShot() takes
 * (cameraStyle, speakingSlot) and returns the *target* shot. The caller
 * decides WHEN to apply it (immediately for hard cuts, on next beat for
 * music-aware cuts). The music thread can swap in a beat-locked picker
 * later without touching the renderer.
 */

import { CAST_LAYOUT, SIM_CAMERA } from './envGeometry.js?v=5';

// ── Shot identifiers ─────────────────────────────────────────────
// Frozen so a typo at a call site fails loud.
export const SHOTS = Object.freeze({
    wide:     'wide',
    two_shot: 'two_shot',
    close_up: 'close_up',
});

/**
 * Compute the camera pose for a shot at a given speaking slot.
 * Returns { pos: [x,y,z], target: [x,y,z], fov, durationMs } where
 * durationMs is the suggested tween length for transitions (0 = hard cut).
 *
 * Falls back to wide if shot or slot is unknown so a missing slot can
 * never strand the camera.
 */
export function computeShotPose(shot, slot) {
    if (shot === SHOTS.wide || !slot) {
        return {
            pos:    [...SIM_CAMERA.pos],
            target: [...SIM_CAMERA.target],
            fov:    SIM_CAMERA.fov,
            // Returning to wide is a deliberate move — tween it.
            durationMs: 600,
        };
    }

    const layout = CAST_LAYOUT[slot] || CAST_LAYOUT.CHAR_A;
    const [sx, , sz] = layout.pos;

    if (shot === SHOTS.close_up) {
        // Tight close-up — camera ~2 m forward of the speaker, lifted to
        // chest height, pulled in toward stage centre on the X axis so
        // off-axis flank speakers (B/C) still feel framed.
        return {
            pos:    [sx * 0.45, 1.55, sz + 2.05],
            target: [sx,        1.05, sz],
            fov:    38,
            // Hard cut by default — instantaneous, like a film edit.
            durationMs: 0,
        };
    }

    if (shot === SHOTS.two_shot) {
        // Frames the speaker + their nearest companion. CHAR_A has both
        // flanks; flank speakers (B/C) get framed together with CHAR_A
        // since A is the focal point of the trio.
        if (slot === 'CHAR_A') {
            // CHAR_A speaking — camera shoots over CHAR_B's shoulder so
            // the audience reads "A is talking, B is listening".
            return {
                pos:    [-1.4, 1.6, 2.6],
                target: [-0.2, 1.0, -0.5],
                fov:    50,
                durationMs: 0,
            };
        }
        // Flank speakers — camera off the opposite flank, looking across
        // the stage so the speaker AND CHAR_A are both in frame.
        const sign = slot === 'CHAR_C' ? -1 : 1;   // CHAR_C → camera left, CHAR_B → camera right
        return {
            pos:    [sign * 1.7, 1.6, sz + 2.6],
            target: [sx * 0.4,    1.0, sz - 0.3],
            fov:    50,
            durationMs: 0,
        };
    }

    // Unknown shot — wide fallback.
    return computeShotPose(SHOTS.wide, slot);
}

// ── Cut policy ────────────────────────────────────────────────────
// Given the env's camera style and the current speaker, return the shot
// name to apply right now. Speaker-change events drive the cuts; this
// just maps style → shot.
//
// The caller is responsible for actually applying the pose (and deciding
// hard-cut vs tween based on `pose.durationMs`).
//
// Future: a music-aware variant would also take a "next-beat-in-ms" arg
// and return either { shot, atMs } so the cut delays to the next beat.

const STYLES = Object.freeze({
    static_wide:  'static_wide',
    speaker_cuts: 'speaker_cuts',
    dolly_drift:  'dolly_drift',
});

export function pickShot(cameraStyle, speakingSlot) {
    if (cameraStyle === STYLES.speaker_cuts && speakingSlot) {
        return SHOTS.close_up;
    }
    // static_wide: never cut. dolly_drift: handled separately (camera moves
    // continuously rather than cutting). Both anchor to wide.
    return SHOTS.wide;
}

export const CAMERA_STYLES_LIST = Object.freeze([
    { id: 'static_wide',  label: 'Static wide — full triangle, no movement' },
    { id: 'speaker_cuts', label: 'Speaker cuts — close-up on whoever is speaking' },
    { id: 'dolly_drift',  label: 'Dolly drift — slow orbit around the stage' },
]);
