/**
 * Tests for musicSchema. Run with:
 *   node public/holodeck/js/shared/musicSchema.test.mjs
 */

import { validateTheme, LAYER_ROLES } from './musicSchema.js';
const LAYER_ROLES_COPY = LAYER_ROLES;

let failed = 0;
function expect(label, cond, detail) {
    if (cond) { console.log(`  ✓ ${label}`); return; }
    failed++;
    console.error(`  ✗ ${label}`);
    if (detail !== undefined) console.error('     ', JSON.stringify(detail, null, 2));
}

// Valid baseline theme — all fields in range, passes everything.
const VALID = () => ({
    id: 'birthday_party_v1',
    name: 'Birthday Party',
    description: 'Celebratory major-key bounce with playful lead.',
    tags: ['playful', 'celebratory', 'warm'],
    defaults: {
        pack: 'fm_90s', scale: 'C:major',
        cps: 0.55, valence: 0.8, complexity: 0.6, speed: 1.0, variety: 0.4,
        groove: 'straight', texture: 'clean',
    },
    layers: [
        {
            role: 'bass',
            pattern: 'c2 <g2 e2> c2 choose(a1,f2)',
            feel: ['warm', 'bouncy', 'low'],
            register: 0, densityBase: 0.5,
        },
        {
            role: 'melody',
            pattern: '<c4 e4 g4 c5> choose(d4,e4,f4) g4 <e4 a4>',
            feel: ['playful', 'high', 'stepwise'],
            register: 0, densityBase: 0.7,
        },
        {
            role: 'drums',
            pattern: 'c2 ~ c2 ~ choose(c2,~) ~ c2 ~',
            feel: ['groovy', 'tight', 'steady'],
            register: 0, densityBase: 0.6,
        },
    ],
    sections: [
        { id: 'A', layers: ['bass', 'drums', 'melody'] },
    ],
    seeds: { pattern: 42, variation: 7 },
    modulation: {
        feelVector: [0.7, 0.5, 0.6, 0.4, 0.3, 0.5],
        modes: {
            intro:   { valence: 0.7, complexity: 0.3, speed: 0.9, layers: ['bass'] },
            waiting: { valence: 0.7, complexity: 0.5, speed: 1.0, layers: ['bass', 'melody'] },
            active:  { valence: 0.7, complexity: 0.8, speed: 1.0, layers: ['bass', 'melody', 'drums'] },
            peak:    { valence: 0.7, complexity: 1.0, speed: 1.1, layers: ['bass', 'melody', 'drums'] },
        },
    },
});

console.log('validateTheme — valid baseline');
{
    const r = validateTheme(VALID());
    expect('baseline passes with no errors', r.ok && r.errors.length === 0,
        { errors: r.errors, warnings: r.warnings });
}

console.log('\nstructural errors');
{
    const r = validateTheme(null);
    expect('null is rejected', !r.ok && r.errors[0].path === '');
}
{
    const t = VALID(); delete t.id;
    const r = validateTheme(t);
    expect('missing id is reported', r.errors.some(e => e.path === 'id'));
}
{
    const t = VALID(); t.id = 'Invalid Slug!';
    const r = validateTheme(t);
    expect('non-slug id is reported',
        r.errors.some(e => e.path === 'id' && e.message.includes('slug')), r.errors);
}

console.log('\ndefaults range checks');
{
    const t = VALID(); t.defaults.valence = 1.5;
    const r = validateTheme(t);
    expect('valence > 1 is rejected',
        r.errors.some(e => e.path === 'defaults.valence' && e.message.includes('<= 1')),
        r.errors);
}
{
    const t = VALID(); t.defaults.scale = 'C-major';
    const r = validateTheme(t);
    expect('scale format requires colon',
        r.errors.some(e => e.path === 'defaults.scale'), r.errors);
}
{
    const t = VALID(); t.defaults.groove = 'bossa';
    const r = validateTheme(t);
    expect('groove must be in enum',
        r.errors.some(e => e.path === 'defaults.groove'), r.errors);
}

console.log('\nlayer rules');
{
    const t = VALID(); t.layers = [t.layers[0]];
    const r = validateTheme(t);
    expect('too few layers rejected',
        r.errors.some(e => e.path === 'layers' && e.message.includes('at least 3')),
        r.errors);
}
{
    const t = VALID();
    // Clone bass 6 more times to exceed max. All will dup-role, but we want
    // to confirm the count check is independent.
    t.layers = Array.from({ length: 7 }, (_, i) => ({
        role: LAYER_ROLES_COPY[i % LAYER_ROLES_COPY.length],
        pattern: 'choose(c3,d3)',
        feel: ['a','b','c'],
        register: 0, densityBase: 0.5,
    }));
    const r = validateTheme(t);
    expect('too many layers rejected',
        r.errors.some(e => e.path === 'layers' && e.message.includes('max 6')),
        r.errors);
}
{
    const t = VALID();
    t.layers[1].role = 'bass'; // duplicate with layers[0]
    const r = validateTheme(t);
    expect('duplicate layer role rejected',
        r.errors.some(e => e.message.includes('duplicate role')), r.errors);
}
{
    const t = VALID();
    t.layers[0].feel = ['only', 'two'];
    const r = validateTheme(t);
    expect('feel with fewer than 3 descriptors rejected',
        r.errors.some(e => e.path === 'layers[0].feel'), r.errors);
}
{
    const t = VALID();
    t.layers[0].pattern = 'c2 d2 e2 f2';  // no choose/irand
    const r = validateTheme(t);
    expect('static pattern rejected (no randomization)',
        r.errors.some(e => e.path === 'layers[0].pattern' && e.message.includes('randomization') || e.message.includes('variability')),
        r.errors);
}
{
    const t = VALID();
    t.layers[0].pattern = 'c2 <no closing';  // parse error
    const r = validateTheme(t);
    expect('unparseable pattern rejected',
        r.errors.some(e => e.path === 'layers[0].pattern' && e.message.includes('parse failed')),
        r.errors);
}
{
    const t = VALID();
    t.layers[0].register = 5;
    const r = validateTheme(t);
    expect('register out of bounds rejected',
        r.errors.some(e => e.path === 'layers[0].register'), r.errors);
}

console.log('\nsection rules');
{
    const t = VALID();
    t.sections = [];
    const r = validateTheme(t);
    expect('zero sections rejected',
        r.errors.some(e => e.path === 'sections'), r.errors);
}
{
    const t = VALID();
    t.sections[0].layers = ['bass', 'wobble'];  // wobble not a layer role
    const r = validateTheme(t);
    expect('unknown section layer rejected',
        r.errors.some(e => e.path.includes('sections[0].layers[1]')),
        r.errors);
}
{
    const t = VALID();
    t.sections = [
        { id: 'A', layers: ['bass', 'drums', 'melody'] },
        { id: 'A', layers: ['bass', 'drums', 'melody'] },  // dup id
    ];
    const r = validateTheme(t);
    expect('duplicate section id rejected',
        r.errors.some(e => e.message.includes('duplicate section id')), r.errors);
}

console.log('\nseeds');
{
    const t = VALID();
    t.seeds = { pattern: 1.5, variation: 0 };
    const r = validateTheme(t);
    expect('non-integer seed rejected',
        r.errors.some(e => e.path === 'seeds.pattern'), r.errors);
}

console.log('\nwarnings (soft caps)');
{
    const t = VALID();
    // Force high event density via c3*40 (40 events in one cycle).
    t.layers[0].pattern = 'choose(c3,d3)*40';
    const r = validateTheme(t);
    expect('high density produces warning, not error',
        r.ok && r.warnings.some(w => w.message.includes('density')),
        { errors: r.errors, warnings: r.warnings });
}

console.log('\nmodulation block');
{
    const t = VALID(); delete t.modulation;
    const r = validateTheme(t);
    expect('missing modulation rejected',
        r.errors.some(e => e.path === 'modulation'), r.errors);
}
{
    const t = VALID();
    t.modulation.feelVector = [0.5, 0.5, 0.5];  // wrong dim
    const r = validateTheme(t);
    expect('feelVector wrong dim rejected',
        r.errors.some(e => e.path === 'modulation.feelVector'), r.errors);
}
{
    const t = VALID();
    t.modulation.feelVector[0] = 1.5;
    const r = validateTheme(t);
    expect('feelVector value out of range rejected',
        r.errors.some(e => e.path === 'modulation.feelVector[0]'), r.errors);
}
{
    const t = VALID(); delete t.modulation.modes.peak;
    const r = validateTheme(t);
    expect('missing peak mode rejected',
        r.errors.some(e => e.path === 'modulation.modes.peak'), r.errors);
}
{
    const t = VALID();
    t.modulation.modes.intro.layers = ['ukulele'];
    const r = validateTheme(t);
    expect('mode references unknown layer role',
        r.errors.some(e => e.path.startsWith('modulation.modes.intro.layers')), r.errors);
}
{
    const t = VALID();
    t.modulation.modes.peak.complexity = 2.0;
    const r = validateTheme(t);
    expect('mode complexity out of range rejected',
        r.errors.some(e => e.path === 'modulation.modes.peak.complexity'), r.errors);
}

console.log('');
if (failed > 0) {
    console.error(`${failed} test(s) failed.`);
    process.exit(1);
} else {
    console.log('All tests passed.');
}

