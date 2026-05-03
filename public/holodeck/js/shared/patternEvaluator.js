/**
 * patternEvaluator.js — turns a parsed mini-notation tree into a list of
 * timed events for a single cycle. The compiler (musicCompiler.js) takes
 * these events and schedules them through Tone.Transport.
 *
 * Contract:
 *   evaluateCycle(tree, { cycleIndex, seed })  →  Event[]
 *
 *   where Event is one of:
 *     { kind: 'note',   value: 'c3', start: 0..1, duration: 0..1 }
 *     { kind: 'degree', value: N,    start: 0..1, duration: 0..1 }   // from irand
 *
 *   start and duration are normalized to the cycle (0 = cycle start,
 *   1 = cycle end). Rests produce no event — the list is sparse.
 *
 * Determinism:
 *   Same (tree, cycleIndex, seed) always produces the same events. That's
 *   what makes the re-roll mechanic work: bumping the seed regenerates a
 *   stable new take. A single seeded RNG is threaded through the walk;
 *   every choose() / irand() advances it in a deterministic order.
 */

// ─── Seeded PRNG — Mulberry32 ─────────────────────────────────────
//
// Small, fast, good-enough distribution for musical variation. Returns a
// function producing [0,1) floats. We mix the base seed with cycleIndex so
// different cycles in the same pattern give different results while still
// being reproducible.

function mulberry32(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function seedFor(baseSeed, cycleIndex) {
    // xorshift-style mix so consecutive cycles aren't trivially correlated.
    let s = (baseSeed | 0) ^ ((cycleIndex | 0) * 0x9E3779B1);
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return s >>> 0;
}

// ─── Evaluator ───────────────────────────────────────────────────

const MIN_DURATION = 1e-6;  // guard against zero-width slots from pathological trees

/**
 * @param {object} tree        Parsed tree from miniNotationParser.parse().
 * @param {object} opts
 * @param {number} opts.cycleIndex  Integer cycle counter (0, 1, 2, ...).
 * @param {number} opts.seed        Integer RNG seed.
 * @returns {Event[]}               Time-sorted, sparse event list for this cycle.
 */
export function evaluateCycle(tree, { cycleIndex = 0, seed = 0 } = {}) {
    const rng = mulberry32(seedFor(seed, cycleIndex));
    const events = [];
    _emit(tree, 0, 1, { cycleIndex, rng, events });
    events.sort((a, b) => a.start - b.start);
    return events;
}

function _emit(node, start, duration, ctx) {
    if (!node || duration < MIN_DURATION) return;

    switch (node.type) {
        case 'note':
            ctx.events.push({ kind: 'note', value: node.value, start, duration });
            return;

        case 'rest':
            return;

        case 'seq':
        case 'group': {
            // Both split the current slot evenly across children.
            const n = node.items.length;
            if (n === 0) return;
            const slot = duration / n;
            for (let i = 0; i < n; i++) {
                _emit(node.items[i], start + i * slot, slot, ctx);
            }
            return;
        }

        case 'alt': {
            // Pick by cycleIndex — rotates the pattern one element per cycle.
            // Empty alt groups emit nothing (defensive).
            const n = node.items.length;
            if (n === 0) return;
            const pick = ((ctx.cycleIndex % n) + n) % n; // handle negative cycleIndex
            _emit(node.items[pick], start, duration, ctx);
            return;
        }

        case 'repeat': {
            // count child plays evenly across the current slot.
            const n = node.count;
            const slot = duration / n;
            for (let i = 0; i < n; i++) {
                _emit(node.child, start + i * slot, slot, ctx);
            }
            return;
        }

        case 'choose': {
            // Seeded pick. Advances the RNG once whether the pick emits or not,
            // so deterministic ordering is maintained even if the chosen branch
            // is a rest.
            const n = node.items.length;
            if (n === 0) return;
            const pick = Math.floor(ctx.rng() * n);
            _emit(node.items[pick], start, duration, ctx);
            return;
        }

        case 'irand': {
            const range = node.max - node.min + 1;
            const value = node.min + Math.floor(ctx.rng() * range);
            ctx.events.push({ kind: 'degree', value, start, duration });
            return;
        }

        default:
            throw new Error(`patternEvaluator: unknown node type '${node.type}'`);
    }
}

/**
 * Convenience — evaluate a contiguous range of cycles and return all events
 * with `start` rebased to absolute cycle-fraction (0..N for N cycles).
 * The compiler uses this when scheduling a multi-cycle lookahead.
 */
export function evaluateRange(tree, { startCycle, cycleCount, seed = 0 }) {
    const all = [];
    for (let i = 0; i < cycleCount; i++) {
        const cycleIndex = startCycle + i;
        const cycleEvents = evaluateCycle(tree, { cycleIndex, seed });
        for (const ev of cycleEvents) {
            all.push({ ...ev, start: ev.start + i, cycleIndex });
        }
    }
    return all;
}
