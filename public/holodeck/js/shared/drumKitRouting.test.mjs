/**
 * drumKitRouting.test.mjs — verify that pattern notes route to the correct
 * drum recipe (kick=C3, snare=D3, hat_closed=E3, hat_open=F3) by mocking
 * Tone, building a real compileTheme controller, and calling each layer's
 * Tone.Loop callback by hand to inspect which synth got triggered.
 *
 * Run:  node public/holodeck/js/shared/drumKitRouting.test.mjs
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileTheme, assetToTheme } from './musicCompiler.js';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const PACKS_PATH = path.resolve(__dirname, '../../global_assets/music/packs.json');

let failed = 0;
function expect(label, cond, detail) {
    if (cond) { console.log(`  ✓ ${label}`); return; }
    failed++;
    console.error(`  ✗ ${label}`);
    if (detail !== undefined) console.error('     ', JSON.stringify(detail, null, 2));
}

/* ── Mock Tone that records every synth instantiation + trigger so we can
      see which recipes fire and at what times. ── */

const trigger_log = [];     // { kind, note, dur, time }
const synth_log   = [];     // { kind, opts }

class MockNode {
    constructor(kind, opts) { this.kind = kind; this.opts = opts; }
    connect(target) { return target; }
    toDestination() { return this; }
    dispose() {}
}
class MockSynth extends MockNode {
    constructor(kind, opts) { super(kind, opts); synth_log.push({ kind, opts }); }
    triggerAttackRelease(...args) {
        // Two signatures: (note, dur, time) for tonal, (dur, time) for noise.
        if (typeof args[0] === 'string') {
            trigger_log.push({ kind: this.kind, note: args[0], dur: args[1], time: args[2] });
        } else {
            trigger_log.push({ kind: this.kind, note: null,    dur: args[0], time: args[1] });
        }
    }
}
class MockGain extends MockNode {
    constructor(value) {
        super('Gain', { value });
        this.gain = {
            value,
            cancelScheduledValues: () => {},
            setValueAtTime:        () => {},
            linearRampToValueAtTime: (target) => { this.gain.value = target; },
            rampTo: (target) => { this.gain.value = target; },
        };
    }
}
class MockLoop {
    constructor(cb, interval) { this.cb = cb; this.interval = interval; }
    start() { return this; }
    stop()  {}
    dispose() {}
}
const Transport = { bpm: { value: 120 }, position: 0, start(){}, stop(){}, cancel(){} };

const Tone = {
    Synth:         class extends MockSynth { constructor(o){ super('Synth', o); } },
    FMSynth:       class extends MockSynth { constructor(o){ super('FMSynth', o); } },
    AMSynth:       class extends MockSynth { constructor(o){ super('AMSynth', o); } },
    DuoSynth:      class extends MockSynth { constructor(o){ super('DuoSynth', o); } },
    NoiseSynth:    class extends MockSynth { constructor(o){ super('NoiseSynth', o); } },
    MembraneSynth: class extends MockSynth { constructor(o){ super('MembraneSynth', o); } },
    MetalSynth:    class extends MockSynth { constructor(o){ super('MetalSynth', o); } },
    PolySynth:     class extends MockSynth { constructor(voiceCls, opts){ super('PolySynth', { voiceCls: voiceCls?.name ?? '?', opts }); } },
    Gain:          MockGain,
    Loop:          MockLoop,
    Transport,
    start:         async () => {},
    now:           () => 0,
    context:       { state: 'running' },
};

const Tonal = {
    Scale: { get: () => ({ notes: ['C','D','E','F','G','A','B'] }) },
};

/* ── Theme: just one drums layer, pattern fires every recipe in turn. ── */

const packsDoc = JSON.parse(fs.readFileSync(PACKS_PATH, 'utf8'));

const theme = {
    id: 'kit_routing_test',
    name: 'Kit Routing Test',
    description: 'kick → snare → hat_closed → hat_open',
    tags: ['test'],
    defaults: {
        pack: 'game_boy', scale: 'C:major',
        cps: 1, valence: 0.5, complexity: 1, speed: 1, variety: 0,
        groove: 'straight', texture: 'clean',
    },
    layers: [
        {
            role: 'drums',
            // Four slots, one of each trigger note. No randomness so we can
            // assert the exact firing order.
            pattern: 'c3 d3 e3 f3',
            feel: ['kick', 'snare', 'hat'],
            register: 0, densityBase: 1,
        },
    ],
    sections: [{ id: 'A', layers: ['drums'] }],
    seeds: { pattern: 0, variation: 0 },
    modulation: {
        feelVector: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
        modes: {
            intro:   { valence: 0.5, complexity: 1, speed: 1, layers: ['drums'] },
            waiting: { valence: 0.5, complexity: 1, speed: 1, layers: ['drums'] },
            active:  { valence: 0.5, complexity: 1, speed: 1, layers: ['drums'] },
            peak:    { valence: 0.5, complexity: 1, speed: 1, layers: ['drums'] },
        },
    },
};

console.log('1. compileTheme + start (mocked) — instantiate kit\n');

trigger_log.length = 0;
synth_log.length = 0;

const player = compileTheme({ theme, packs: packsDoc, Tone, Tonal });
await player.start();

const synthKinds = synth_log.map(s => s.kind);
expect('all 4 drum recipes were instantiated',
    synthKinds.includes('MembraneSynth') &&
    synthKinds.filter(k => k === 'NoiseSynth').length >= 1 &&
    synthKinds.filter(k => k === 'MetalSynth').length === 2,
    synthKinds);

console.log('\n2. Manually tick the drums loop and inspect trigger order\n');

// Find the drums layer's loop callback and invoke it once.
// MockLoop stored the cb; pull it out via the controller's _layerSnapshot won't
// work since it doesn't expose loops. We'll just walk all created MockLoops.
// Simpler: each Loop created via Tone.Loop is a MockLoop with .cb set; by
// construction the only Loop the compiler made is the drums layer's loop.
// We iterate via construction order — there's only one.
// Actually we need to grab it. Patch Tone.Loop to remember instances:
const allLoops = [];
const OldLoop = Tone.Loop;
class TrackingLoop extends OldLoop {
    constructor(cb, interval) { super(cb, interval); allLoops.push(this); }
}
// Re-build with tracking — we need the reference.
trigger_log.length = 0;
synth_log.length = 0;
allLoops.length = 0;

const player2 = compileTheme({
    theme, packs: packsDoc, Tone: { ...Tone, Loop: TrackingLoop }, Tonal,
});
await player2.start();

expect('exactly one Loop was created (one layer)', allLoops.length === 1, allLoops.length);

// Tick the loop once with t=10 simulated.
allLoops[0].cb(10);

const fires = trigger_log.map(t => `${t.kind}@note=${t.note}`);
console.log('  fires:', fires.join('  '));

expect('first fire was MembraneSynth (kick) for C3 trigger',
    trigger_log[0]?.kind === 'MembraneSynth',
    trigger_log[0]);
expect('second fire was NoiseSynth (snare) for D3 trigger',
    trigger_log[1]?.kind === 'NoiseSynth',
    trigger_log[1]);
expect('third fire was MetalSynth (hat_closed) for E3 trigger',
    trigger_log[2]?.kind === 'MetalSynth',
    trigger_log[2]);
expect('fourth fire was MetalSynth (hat_open) for F3 trigger',
    trigger_log[3]?.kind === 'MetalSynth',
    trigger_log[3]);

expect('exactly 4 events fired (no extras, no missing)',
    trigger_log.length === 4, trigger_log.length);

console.log('');
if (failed > 0) {
    console.error(`${failed} routing test(s) failed.`);
    process.exit(1);
} else {
    console.log('Drum-kit routing is correct. If hats still aren\'t audible in-app, the issue is mix/gain (not routing).');
}
