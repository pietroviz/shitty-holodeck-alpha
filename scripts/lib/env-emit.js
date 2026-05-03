/**
 * env-emit.js — Shared helpers for the env generator scripts.
 *
 * One source of truth for:
 *   • Cell-coord schema emission (legacy "N3" strings → {x,y,z} integers)
 *   • Scale-class hints driven by env name keywords ("giant mushroom forest"
 *     → giant mushrooms; "doll's house diner" → tiny everything).
 *   • Default-shape props/ground arrays so generators stay short and readable.
 *
 * Generator authors keep writing cell:'N3' for ergonomics; this lib normalises
 * to the new schema on emit. When the next grid pass adds Y-tiers or sub-cells,
 * the generators don't need to know — they just call the helpers here.
 */

const PROP_SLOTS   = 5;
const GROUND_SLOTS = 3;

const BINGO = 'BINGO';

/** Parse a BINGO cell string → {x, y, z} or null. Pass-through if already an object. */
function toCell(input) {
    if (input == null) return null;
    if (typeof input === 'object') return input;
    if (typeof input !== 'string' || input.length < 2) return null;
    const letterIdx = BINGO.indexOf(input[0].toUpperCase());
    const num       = parseInt(input.slice(1), 10);
    if (letterIdx < 0 || num < 1 || num > 5) return null;
    return { x: letterIdx - 2, y: 0, z: num - 3 };
}

// ── Cast-zone avoidance ──────────────────────────────────────────
// CAST_LAYOUT places three characters in the inner 3×3 of the BINGO grid.
// Stage props 'placed' into that zone end up between or in front of cast.
// Any inner cell maps to a perimeter equivalent that preserves thematic
// position (centre → back-centre, char-spot → far flank, etc.).
const CAST_ZONE_MAP = {
    '0,0':   [ 0, -2],
    '0,-1':  [ 0, -2],
    '0,1':   [ 0,  2],
    '-1,-1': [-2, -2],
    '-1,0':  [-2,  0],
    '-1,1':  [-2,  2],
    '1,-1':  [ 2, -2],
    '1,0':   [ 2,  0],
    '1,1':   [ 2,  2],
};

function avoidCastZone(cell) {
    if (!cell) return cell;
    const remap = CAST_ZONE_MAP[`${cell.x},${cell.z}`];
    if (!remap) return cell;
    return { x: remap[0], y: 0, z: remap[1] };
}

// ─── Scale class ──────────────────────────────────────────────────
// Scan the env name + tags for size keywords and pick a multiplier.
// Multiplier is applied to default prop / ground-object scales so the
// thematic intent reads through without per-prop micromanagement.
//
// "Giant mushroom forest" → 2.0× — mushrooms (and anything else) read big.
// "Doll's house diner"    → 0.55× — everything is tiny relative to cast.
// "Cozy reading nook"     → 0.9×  — slightly smaller than default.
//
// The multiplier is also stored on the env state as `scaleClass` so the
// runtime renderer can lift its height-cap accordingly (otherwise giant
// mushrooms would be clamped back down to 1.5 m).
const SCALE_KEYWORDS = [
    // 2.0× — explicitly giant
    { test: /\b(giant|colossal|titanic|cathedral|monumental|towering)\b/i, scale: 2.0 },
    // 1.5× — "big" / "grand" / large architecture
    { test: /\b(huge|big|grand|enormous|vast)\b/i,                          scale: 1.5 },
    // 0.9× — cozy / compact / intimate
    { test: /\b(cozy|compact|intimate|nook|small|mini-?bar)\b/i,            scale: 0.9 },
    // 0.55× — explicitly tiny / miniature / doll's-house
    { test: /\b(doll(?:'s|s)?|miniature|tiny|fairy|mini)\b/i,               scale: 0.55 },
];

function getScaleClass({ name = '', tags = [] }) {
    const haystack = [name, ...(tags || [])].join(' ');
    for (const { test, scale } of SCALE_KEYWORDS) {
        if (test.test(haystack)) return scale;
    }
    return 1.0;
}

// ─── Prop / ground array emitters ─────────────────────────────────
// Generator authors write specs like:
//     props:[ { id:'prop_chair', cell:'N3', scale:1.0 }, ... ]
//     ground:[ { id:'prop_mushroom', mode:'scatter', density:'med' }, ... ]
// These helpers normalise the cell to {x,y,z} and apply the env's scaleClass
// so a "giant" env's props read big without per-item rework.
//
// Each slot's declared `scale` is multiplied by scaleClass (default 1.0).
// Empty slots are filled in to keep the on-disk shape stable.

function propArr(items = [], scaleClass = 1.0) {
    const out = [];
    const usedPerimeter = new Set();   // track collisions when relocating
    for (let i = 0; i < PROP_SLOTS; i++) {
        const it = items[i];
        if (!it) {
            out.push({
                assetId: 'none', mode: 'place', cell: null,
                scale: 1.0, density: 'med',
            });
            continue;
        }
        const mode = it.mode ?? 'place';
        let cell = toCell(it.cell);
        // Auto-relocate cast-zone cells in 'place' mode.
        if (mode === 'place' && cell) {
            const relocated = avoidCastZone(cell);
            if (relocated !== cell) {
                let key = `${relocated.x},${relocated.z}`;
                if (usedPerimeter.has(key)) {
                    // Walk perimeter clockwise to find a free cell.
                    const PERIM = [
                        [-2,-2],[-1,-2],[0,-2],[1,-2],[2,-2],
                        [2,-1],[2,0],[2,1],[2,2],
                        [1,2],[0,2],[-1,2],[-2,2],[-2,1],[-2,0],[-2,-1],
                    ];
                    const idx = PERIM.findIndex(([x,z]) => x === relocated.x && z === relocated.z);
                    for (let s = 1; s < PERIM.length; s++) {
                        const [nx, nz] = PERIM[(idx + s) % PERIM.length];
                        const nKey = `${nx},${nz}`;
                        if (!usedPerimeter.has(nKey)) {
                            cell = { x: nx, y: 0, z: nz };
                            key = nKey;
                            break;
                        }
                    }
                } else {
                    cell = relocated;
                }
                usedPerimeter.add(key);
            } else {
                usedPerimeter.add(`${cell.x},${cell.z}`);
            }
        }
        out.push({
            assetId: it.id,
            mode,
            cell,
            scale: +(((it.scale ?? 1.0) * scaleClass).toFixed(2)),
            density: it.density ?? 'med',
        });
    }
    return out;
}

function groundArr(items = [], scaleClass = 1.0) {
    const out = [];
    for (let i = 0; i < GROUND_SLOTS; i++) {
        const it = items[i];
        out.push(it
            ? {
                assetId: it.id,
                mode: it.mode ?? 'scatter',
                density: it.density ?? 'med',
                scale: +(((it.scale ?? 1.0) * scaleClass).toFixed(2)),
            }
            : { assetId: 'none', mode: 'scatter', density: 'med', scale: 1.0 });
    }
    return out;
}

// ─── Single-call entry ────────────────────────────────────────────
// Wraps all of the above. Generator-side usage:
//     const emitted = emitEnv(spec);
//     // emitted.state.props, emitted.state.groundObjects, emitted.state.scaleClass
function emitEnv(spec) {
    const sc = getScaleClass(spec);
    return {
        state: {
            ...(spec.state || {}),
            scaleClass:    sc,
            props:         propArr(spec.props, sc),
            groundObjects: groundArr(spec.ground, sc),
        },
        scaleClass: sc,
    };
}

module.exports = {
    PROP_SLOTS,
    GROUND_SLOTS,
    toCell,
    getScaleClass,
    propArr,
    groundArr,
    emitEnv,
};
