/**
 * envGeometry.js — Single source of truth for stage grid + camera geometry.
 *
 * Until this file existed, three different modules each carried their own
 * private copy of these constants and helpers (EnvironmentBridge, previewRenderer,
 * shared/envScene). Any change to the grid had to be made three times, and the
 * sim renderer's hardcoded triangle drifted out of sync with the env builder's
 * BINGO grid as a result.
 *
 * Everything stage- and camera-geometry related lives here. Consumers import
 * the constants and helpers directly — no more parallel definitions.
 *
 * Note: this is the consolidation pass only. The grid is still 5×5 BINGO
 * (camera at 45°). The next pass switches to integer (x,y,z) cell coords with
 * a square-on camera, but every change after this lands in this file alone.
 */

// ── Stage size ────────────────────────────────────────────────────
// One world unit = one metre. 5×5 stage = 25 cells, 5 m × 5 m.
export const STAGE_SIZE = 5;
export const STAGE_HALF = STAGE_SIZE / 2;

// ── BINGO grid ────────────────────────────────────────────────────
// Columns:  B(0) I(1) N(2) G(3) O(4)   left → right (−x → +x)
// Rows:     1               5          back → front (−z → +z)
//   B1 = back-left  (−2, −2)
//   O5 = front-right (+2, +2)
//   N3 = centre      ( 0,  0)
export const BINGO_COLS = 'BINGO';

/** Build a cell label like "N3" from (col, row) integers. */
export function cellLabel(col, row) {
    return BINGO_COLS[col] + (row + 1);
}

/** Parse a BINGO cell label → world-space {x, z} centre, or null on failure. */
export function cellToWorld(cell) {
    if (!cell || cell.length < 2) return null;
    const letterIdx = BINGO_COLS.indexOf(cell[0].toUpperCase());
    const num       = parseInt(cell.slice(1), 10);
    if (letterIdx < 0 || num < 1 || num > 5) return null;
    return { x: letterIdx - 2, z: num - 3 };
}

/** All 25 cell labels in row-major order: B1, I1, N1, G1, O1, B2, ... */
export const ALL_CELLS = (() => {
    const out = [];
    for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
            out.push(cellLabel(c, r));
        }
    }
    return out;
})();

// ── Camera corridor ────────────────────────────────────────────────
// Default camera position: (5.2, 3.9, 5.2) — 45° diamond view.
// "Corridor" = the wedge of world-space between the camera and the stage where
// tall props/walls would block the view. Used to dynamically hide ground objects
// taller than the cap and walls between camera + stage.
//
// The next pass squares the camera up to (0, 3.9, 5.2); when that happens the
// corridor math here updates and every consumer picks up the change.
export const CAM_DIR_X = 5.2;
export const CAM_DIR_Z = 5.2;
export const CAM_CORRIDOR_HALF_ANGLE_RAD = Math.PI * 2 / 9;   // ±40°
export const CAM_CORRIDOR_COS = Math.cos(CAM_CORRIDOR_HALF_ANGLE_RAD);

const _CAM_LEN = Math.sqrt(CAM_DIR_X * CAM_DIR_X + CAM_DIR_Z * CAM_DIR_Z);
export const CAM_NX = CAM_DIR_X / _CAM_LEN;
export const CAM_NZ = CAM_DIR_Z / _CAM_LEN;

/**
 * True if a world-space (x, z) point lies inside the camera→stage view wedge,
 * outside the stage itself plus a small buffer. Used to decide whether to hide
 * a tall prop or wall so it doesn't block the audience's view.
 */
export function inCameraCorridor(x, z, stageHalf) {
    const len = Math.sqrt(x * x + z * z);
    if (len < stageHalf + 0.5) return false;
    const dot = (x * CAM_NX + z * CAM_NZ) / (len || 1);
    return dot > CAM_CORRIDOR_COS;
}
