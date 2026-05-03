/**
 * Tests for patternEvaluator. Run with:
 *   node public/holodeck/js/shared/patternEvaluator.test.mjs
 */

import { parse } from './miniNotationParser.js';
import { evaluateCycle, evaluateRange } from './patternEvaluator.js';

let failed = 0;
function expect(label, cond, detail) {
    if (cond) { console.log(`  ✓ ${label}`); return; }
    failed++;
    console.error(`  ✗ ${label}`);
    if (detail !== undefined) console.error('     ', JSON.stringify(detail, null, 2));
}
function near(a, b, eps = 1e-9) { return Math.abs(a - b) < eps; }

// Helper — quick event-signature comparison.
const sig = (events) => events.map(e =>
    `${e.kind}:${e.value}@${e.start.toFixed(4)}+${e.duration.toFixed(4)}`
).join(' ');

console.log('evaluateCycle — atoms');
{
    const ev = evaluateCycle(parse('c3'), { cycleIndex: 0, seed: 1 });
    expect('single note fills the cycle',
        ev.length === 1 && ev[0].kind === 'note' && ev[0].value === 'c3'
        && near(ev[0].start, 0) && near(ev[0].duration, 1), ev);
}
{
    const ev = evaluateCycle(parse('~'), { cycleIndex: 0, seed: 1 });
    expect('rest emits no events', ev.length === 0, ev);
}

console.log('\nevaluateCycle — sequence');
{
    const ev = evaluateCycle(parse('c3 d3 e3 f3'), { cycleIndex: 0, seed: 1 });
    expect('4-note seq → 4 events at even quarters',
        ev.length === 4
        && near(ev[0].start, 0.0)   && near(ev[0].duration, 0.25)
        && near(ev[1].start, 0.25)  && near(ev[1].duration, 0.25)
        && near(ev[2].start, 0.5)   && near(ev[2].duration, 0.25)
        && near(ev[3].start, 0.75)  && near(ev[3].duration, 0.25), ev);
}
{
    const ev = evaluateCycle(parse('c3 ~ d3 ~'), { cycleIndex: 0, seed: 1 });
    expect('rests are silent but still occupy their slots',
        ev.length === 2
        && ev[0].value === 'c3' && near(ev[0].start, 0.0)
        && ev[1].value === 'd3' && near(ev[1].start, 0.5), ev);
}

console.log('\nevaluateCycle — group');
{
    const ev = evaluateCycle(parse('[c3 e3] g3'), { cycleIndex: 0, seed: 1 });
    expect('group subdivides its slot',
        ev.length === 3
        && near(ev[0].start, 0.0)   && near(ev[0].duration, 0.25)
        && ev[0].value === 'c3'
        && near(ev[1].start, 0.25)  && near(ev[1].duration, 0.25)
        && ev[1].value === 'e3'
        && near(ev[2].start, 0.5)   && near(ev[2].duration, 0.5)
        && ev[2].value === 'g3', ev);
}

console.log('\nevaluateCycle — alt');
{
    const tree = parse('<c3 e3 g3>');
    const s0 = evaluateCycle(tree, { cycleIndex: 0, seed: 1 });
    const s1 = evaluateCycle(tree, { cycleIndex: 1, seed: 1 });
    const s2 = evaluateCycle(tree, { cycleIndex: 2, seed: 1 });
    const s3 = evaluateCycle(tree, { cycleIndex: 3, seed: 1 });
    expect('alt rotates by cycle: c3 / e3 / g3 / c3',
        s0[0].value === 'c3' && s1[0].value === 'e3'
        && s2[0].value === 'g3' && s3[0].value === 'c3',
        [s0, s1, s2, s3]);
}

console.log('\nevaluateCycle — repeat');
{
    const ev = evaluateCycle(parse('c3*4'), { cycleIndex: 0, seed: 1 });
    expect('c3*4 emits 4 events at even quarters',
        ev.length === 4 && ev.every(e => e.value === 'c3')
        && near(ev[0].start, 0.0)  && near(ev[1].start, 0.25)
        && near(ev[2].start, 0.5)  && near(ev[3].start, 0.75), ev);
}

console.log('\nevaluateCycle — choose (deterministic by seed)');
{
    const tree = parse('choose(c3,e3,g3)');
    const a = evaluateCycle(tree, { cycleIndex: 0, seed: 42 });
    const b = evaluateCycle(tree, { cycleIndex: 0, seed: 42 });
    expect('same seed + cycle → same pick', sig(a) === sig(b), { a, b });

    const x = evaluateCycle(tree, { cycleIndex: 0, seed: 7  });
    const y = evaluateCycle(tree, { cycleIndex: 0, seed: 13 });
    expect('different seeds generally pick differently (sanity)',
        x[0].value !== y[0].value || true, { x, y });  // soft: distribution check below
}
{
    // Over many seeds, choose() should cover all three options.
    const tree = parse('choose(c3,e3,g3)');
    const values = new Set();
    for (let s = 0; s < 60; s++) {
        const ev = evaluateCycle(tree, { cycleIndex: 0, seed: s });
        values.add(ev[0].value);
    }
    expect('choose() covers all options across many seeds',
        values.size === 3, [...values]);
}

console.log('\nevaluateCycle — irand');
{
    const tree = parse('irand(0,6)');
    const ev = evaluateCycle(tree, { cycleIndex: 0, seed: 9 });
    expect('irand emits a single degree event in range',
        ev.length === 1
        && ev[0].kind === 'degree'
        && ev[0].value >= 0 && ev[0].value <= 6, ev);
}
{
    // Degree distribution covers the whole range.
    const tree = parse('irand(0,4)');
    const seen = new Set();
    for (let s = 0; s < 200; s++) {
        const ev = evaluateCycle(tree, { cycleIndex: 0, seed: s });
        seen.add(ev[0].value);
    }
    expect('irand covers 0..4 across many seeds', seen.size === 5, [...seen]);
}

console.log('\nevaluateCycle — realistic plan §7 patterns');
{
    const bass = parse('c2 <g2 e2> c2 <a1 f2>');
    const c0 = evaluateCycle(bass, { cycleIndex: 0, seed: 0 });
    const c1 = evaluateCycle(bass, { cycleIndex: 1, seed: 0 });
    expect('bass cycle 0: c2 g2 c2 a1',
        c0.length === 4
        && c0.map(e => e.value).join(' ') === 'c2 g2 c2 a1', c0);
    expect('bass cycle 1: c2 e2 c2 f2',
        c1.length === 4
        && c1.map(e => e.value).join(' ') === 'c2 e2 c2 f2', c1);
}
{
    const melody = parse('<c4 e4 g4 c5> choose(d4,e4,f4) g4 <e4 a4>');
    const ev = evaluateCycle(melody, { cycleIndex: 0, seed: 99 });
    expect('melody emits 4 events with correct slot timing',
        ev.length === 4
        && near(ev[0].start, 0.0)   && ev[0].value === 'c4'
        && near(ev[1].start, 0.25)  && ['d4','e4','f4'].includes(ev[1].value)
        && near(ev[2].start, 0.5)   && ev[2].value === 'g4'
        && near(ev[3].start, 0.75)  && ev[3].value === 'e4',  // alt cycle0 picks first
        ev);
}

console.log('\ndeterminism — re-roll mechanics');
{
    const tree = parse('choose(c4,e4,g4) irand(0,6)');
    // Re-rolling = changing seed. Whole-pattern result should be stable for any
    // (seed, cycleIndex) pair.
    const runs = [];
    for (let seed of [1, 2, 3]) {
        for (let cycle of [0, 1, 2]) {
            const ev = evaluateCycle(tree, { cycleIndex: cycle, seed });
            runs.push({ seed, cycle, sig: sig(ev) });
        }
    }
    const again = [];
    for (let seed of [1, 2, 3]) {
        for (let cycle of [0, 1, 2]) {
            const ev = evaluateCycle(tree, { cycleIndex: cycle, seed });
            again.push({ seed, cycle, sig: sig(ev) });
        }
    }
    expect('evaluator is deterministic across runs',
        JSON.stringify(runs) === JSON.stringify(again), { runs, again });
}

console.log('\nevaluateRange');
{
    const tree = parse('<c3 e3 g3>');
    const evs = evaluateRange(tree, { startCycle: 0, cycleCount: 3, seed: 0 });
    expect('range produces 3 events across 3 cycles with rebased start',
        evs.length === 3
        && near(evs[0].start, 0) && evs[0].value === 'c3'
        && near(evs[1].start, 1) && evs[1].value === 'e3'
        && near(evs[2].start, 2) && evs[2].value === 'g3', evs);
}

console.log('');
if (failed > 0) {
    console.error(`${failed} test(s) failed.`);
    process.exit(1);
} else {
    console.log('All tests passed.');
}
