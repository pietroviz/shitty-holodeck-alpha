/**
 * envGeometry.js — Single source of truth for stage grid + camera geometry.
 *
 * Owns the 5×5 stage grid, world coordinates, the default camera, and the
 * camera-corridor math. Every consumer (EnvironmentBridge, previewRenderer,
 * envScene, plus character/voice/music/object builders) imports from here so
 * a grid or camera change ripples once, not three+ times.
 *
 * Coordinate convention (Three.js native):
 *   +X = right        (camera right = audience right)
 *   −X = left         (camera left  = audience left)
 *   +Z = backward     (toward the audience / camera)
 *   −Z = forward      (away from the camera, deeper into the stage)
 *   +Y = up
 *   −Y = down
 *
 * Cell schema:
 *   New canonical form  →  {x, y, z}   integers, centred at origin
 *                            x: −2..+2  (left ←→ right)
 *                            y: 0       (always for v1; reserved for tiers)
 *                            z: −2..+2  (forward ←→ backward)
 *   Legacy form         →  "N3"        BINGO string (still parsed for
 *                                       backward-compat during migration)
 *   cellToWorld() accepts either form and returns a world-space {x, y, z}.
 */

// ── Stage size ────────────────────────────────────────────────────
// One world unit = one metre. 5×5 stage = 25 cells, 5 m × 5 m.
export const STAGE_SIZE = 5;
export const STAGE_HALF = STAGE_SIZE / 2;

// Integer cell-coord bounds (inclusive). Centre is (0, 0, 0).
export const CELL_MIN = -2;
export const CELL_MAX =  2;

// ── Direction labels ──────────────────────────────────────────────
// Plain world-directional vocabulary — matches the user-facing UI.
// Use these constants in builder UIs so a future grid expansion doesn't
// require relabelling every dropdown.
export const DIRECTIONS = Object.freeze({
    forward:  { axis: 'z', sign: -1, label: 'Forward'  },
    backward: { axis: 'z', sign: +1, label: 'Backward' },
    left:     { axis: 'x', sign: -1, label: 'Left'     },
    right:    { axis: 'x', sign: +1, label: 'Right'    },
    up:       { axis: 'y', sign: +1, label: 'Up'       },
    down:     { axis: 'y', sign: -1, label: 'Down'     },
});

// ── Default camera ────────────────────────────────────────────────
// Square-on framing — camera dead-centre on the X axis, looking forward
// (toward −Z) at chest height. This replaces the old 45° diamond view.
//
// Each builder either uses this exactly or scoots forward/backward along Z
// for tighter / wider framing — but always square-on.
//
// pos    — world-space camera position
// target — world-space lookAt point
// fov    — vertical field of view in degrees
export const DEFAULT_CAMERA = Object.freeze({
    pos:    [0, 3.9, 5.2],   // x=centre, y=4 m up, z=5.2 m back from origin
    target: [0, 0.9, 0],     // looking at chest height, centre of stage
    fov:    50,
});

/**
 * Build a per-builder camera by sliding the default forward/backward along Z.
 * Negative `forwardOffset` pulls the camera *closer* to the stage (tighter
 * framing for portraits / heads); positive pushes it back (wider for envs).
 *
 * Example:
 *   cameraFor({ forwardOffset: -3.0 })  // close head/portrait shot
 *   cameraFor({ forwardOffset: +1.5 })  // wide environment shot
 */
export function cameraFor({ forwardOffset = 0, heightOffset = 0, targetY } = {}) {
    return {
        pos:    [DEFAULT_CAMERA.pos[0],
                 DEFAULT_CAMERA.pos[1] + heightOffset,
                 DEFAULT_CAMERA.pos[2] + forwardOffset],
        target: [DEFAULT_CAMERA.target[0],
                 (targetY ?? DEFAULT_CAMERA.target[1]),
                 DEFAULT_CAMERA.target[2]],
        fov: DEFAULT_CAMERA.fov,
    };
}

// ── BINGO grid (legacy, still supported during migration) ─────────
// Old format: column letter (B/I/N/G/O) + row number (1..5).
// Kept here so cellToWorld() can parse either format until every env JSON
// has migrated to the integer schema.
export const BINGO_COLS = 'BINGO';

/** Build a legacy BINGO cell label like "N3" from (col, row) integers. */
export function cellLabel(col, row) {
    return BINGO_COLS[col] + (row + 1);
}

/**
 * Parse a cell into world-space {x, y, z} centre, or null on failure.
 * Accepts:
 *   • Legacy BINGO string:   "N3", "b1", "O5"
 *   • New integer object:    {x: 0, y: 0, z: 0}
 *   • New integer array:     [0, 0, 0]   (also tolerated)
 */
export function cellToWorld(cell) {
    if (cell == null) return null;

    // New integer-object form — preferred going forward.
    if (typeof cell === 'object' && !Array.isArray(cell)) {
        const x = Number(cell.x);
        const z = Number(cell.z);
        const y = Number(cell.y ?? 0);
        if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(y)) return null;
        return { x, y, z };
    }

    // New integer-array form — tolerated for terseness.
    if (Array.isArray(cell)) {
        const [x = 0, y = 0, z = 0] = cell;
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
        return { x: Number(x), y: Number(y), z: Number(z) };
    }

    // Legacy BINGO string — converted via the original axis mapping:
    //   letterIdx 0..4 → x −2..+2
    //   number    1..5 → z −2..+2 (5 was "front", which is +z=backward toward camera)
    if (typeof cell === 'string' && cell.length >= 2) {
        const letterIdx = BINGO_COLS.indexOf(cell[0].toUpperCase());
        const num       = parseInt(cell.slice(1), 10);
        if (letterIdx < 0 || num < 1 || num > 5) return null;
        return { x: letterIdx - 2, y: 0, z: num - 3 };
    }

    return null;
}

/** Normalise any accepted cell form to the canonical {x, y, z} integer object. */
export function cellToCanonical(cell) {
    const w = cellToWorld(cell);
    if (!w) return null;
    return { x: Math.round(w.x), y: Math.round(w.y), z: Math.round(w.z) };
}

/** Inverse: world-space {x, z} (or {x, y, z}) → canonical cell {x, y, z}. */
export function worldToCell({ x, y = 0, z }) {
    return { x: Math.round(x), y: Math.round(y), z: Math.round(z) };
}

/** True if a canonical cell is inside the current stage bounds. */
export function isCellInBounds({ x, y = 0, z } = {}) {
    return (
        Number.isFinite(x) && Number.isFinite(z) &&
        x >= CELL_MIN && x <= CELL_MAX &&
        z >= CELL_MIN && z <= CELL_MAX &&
        y === 0   // v1: only the ground tier
    );
}

/** All 25 canonical cells on the y=0 tier, in row-major order. */
export const ALL_CELLS_CANONICAL = (() => {
    const out = [];
    for (let z = CELL_MIN; z <= CELL_MAX; z++) {
        for (let x = CELL_MIN; x <= CELL_MAX; x++) {
            out.push({ x, y: 0, z });
        }
    }
    return out;
})();

/** All 25 cell labels in row-major order — LEGACY BINGO strings. */
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
// "Corridor" = the world-space wedge between the camera and the stage.
// Tall ground props inside the corridor would block the audience's view, so
// the renderer hides them.
//
// PR 2a NOTE: CAM_DIR_X/Z are still the legacy diamond values (5.2, 5.2)
// because the actual cameras in EnvironmentBridge/previewRenderer haven't
// been switched to DEFAULT_CAMERA yet. PR 2b updates these to derive from
// DEFAULT_CAMERA.pos at the same time the cameras themselves move.
export const CAM_DIR_X = 5.2;
export const CAM_DIR_Z = 5.2;
export const CAM_CORRIDOR_HALF_ANGLE_RAD = Math.PI * 2 / 9;   // ±40°
export const CAM_CORRIDOR_COS = Math.cos(CAM_CORRIDOR_HALF_ANGLE_RAD);

const _CAM_LEN = Math.sqrt(CAM_DIR_X * CAM_DIR_X + CAM_DIR_Z * CAM_DIR_Z) || 1;
export const CAM_NX = CAM_DIR_X / _CAM_LEN;
export const CAM_NZ = CAM_DIR_Z / _CAM_LEN;

/**
 * True if a world-space (x, z) point lies inside the camera→stage view wedge,
 * outside the stage itself plus a small buffer.
 */
export function inCameraCorridor(x, z, stageHalf) {
    const len = Math.sqrt(x * x + z * z);
    if (len < stageHalf + 0.5) return false;
    const dot = (x * CAM_NX + z * CAM_NZ) / (len || 1);
    return dot > CAM_CORRIDOR_COS;
}
