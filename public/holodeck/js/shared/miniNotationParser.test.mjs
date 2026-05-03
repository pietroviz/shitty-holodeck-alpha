/**
 * Hand-runnable tests for miniNotationParser. Run with:
 *   node public/holodeck/js/shared/miniNotationParser.test.mjs
 * Exits non-zero on assertion failure.
 */

import {
    parse, collectLeaves, hasRandomization, MiniNotationError,
} from './miniNotationParser.js';

let failed = 0;
function expect(label, cond, detail) {
    if (cond) { console.log(`  ✓ ${label}`); return; }
    failed++;
    console.error(`  ✗ ${label}`);
    if (detail !== undefined) console.error('     ', JSON.stringify(detail, null, 2));
}
function deepEq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

console.log('parse — basic atoms');
expect('single note',
    deepEq(parse('c3'), { type: 'note', value: 'c3' }));
expect('note normalization lowercases',
    deepEq(parse('C3'), { type: 'note', value: 'c3' }));
expect('flat accidental',
    deepEq(parse('eb4'), { type: 'note', value: 'eb4' }));
expect('sharp accidental',
    deepEq(parse('f#2'), { type: 'note', value: 'f#2' }));
expect('rest',
    deepEq(parse('~'), { type: 'rest' }));

console.log('\nparse — sequences');
expect('two-note sequence',
    deepEq(parse('c3 d3'), { type: 'seq', items: [
        { type: 'note', value: 'c3' },
        { type: 'note', value: 'd3' },
    ]}));
expect('rest mixed with notes',
    deepEq(parse('c3 ~ d3'), { type: 'seq', items: [
        { type: 'note', value: 'c3' },
        { type: 'rest' },
        { type: 'note', value: 'd3' },
    ]}));
expect('extra whitespace tolerated',
    deepEq(parse('  c3   d3  '), { type: 'seq', items: [
        { type: 'note', value: 'c3' },
        { type: 'note', value: 'd3' },
    ]}));

console.log('\nparse — groups');
expect('group subdivision',
    deepEq(parse('[c3 e3] g3'), { type: 'seq', items: [
        { type: 'group', items: [
            { type: 'note', value: 'c3' },
            { type: 'note', value: 'e3' },
        ]},
        { type: 'note', value: 'g3' },
    ]}));
expect('nested group',
    deepEq(parse('[c3 [d3 e3]]'), {
        type: 'group', items: [
            { type: 'note', value: 'c3' },
            { type: 'group', items: [
                { type: 'note', value: 'd3' },
                { type: 'note', value: 'e3' },
            ]},
        ],
    }));

console.log('\nparse — alternation');
expect('angle alternation',
    deepEq(parse('<c3 e3 g3>'), {
        type: 'alt', items: [
            { type: 'note', value: 'c3' },
            { type: 'note', value: 'e3' },
            { type: 'note', value: 'g3' },
        ],
    }));
expect('alternation inside sequence',
    deepEq(parse('c3 <e3 g3> b3'), { type: 'seq', items: [
        { type: 'note', value: 'c3' },
        { type: 'alt', items: [
            { type: 'note', value: 'e3' },
            { type: 'note', value: 'g3' },
        ]},
        { type: 'note', value: 'b3' },
    ]}));

console.log('\nparse — repetition');
expect('simple repetition',
    deepEq(parse('c3*2'), {
        type: 'repeat', count: 2,
        child: { type: 'note', value: 'c3' },
    }));
expect('group repetition',
    deepEq(parse('[c3 e3]*3'), {
        type: 'repeat', count: 3,
        child: { type: 'group', items: [
            { type: 'note', value: 'c3' },
            { type: 'note', value: 'e3' },
        ]},
    }));

console.log('\nparse — calls');
expect('choose with note options',
    deepEq(parse('choose(c3,e3,g3)'), {
        type: 'choose', items: [
            { type: 'note', value: 'c3' },
            { type: 'note', value: 'e3' },
            { type: 'note', value: 'g3' },
        ],
    }));
expect('irand with bounds',
    deepEq(parse('irand(0,7)'), { type: 'irand', min: 0, max: 7 }));

console.log('\nparse — realistic example from plan §7');
const complex = parse('c2 <g2 e2> c2 <a1 f2>');
expect('bass pattern parses',
    complex.type === 'seq' && complex.items.length === 4
    && complex.items[1].type === 'alt'
    && complex.items[3].type === 'alt');
const melodyTree = parse('<c4 e4 g4 c5> choose(d4,e4,f4) g4 <e4 a4>');
expect('melody with choose parses',
    melodyTree.type === 'seq' && melodyTree.items.length === 4
    && melodyTree.items[1].type === 'choose');

console.log('\nparse — errors');
function throws(label, fn, expectedSubstr) {
    try {
        fn();
        failed++;
        console.error(`  ✗ ${label} — expected to throw`);
    } catch (e) {
        const ok = e instanceof MiniNotationError
            && (!expectedSubstr || e.message.includes(expectedSubstr));
        if (ok) console.log(`  ✓ ${label}`);
        else { failed++; console.error(`  ✗ ${label}`, e?.message); }
    }
}
throws('empty string', () => parse(''));
throws('whitespace only', () => parse('   '));
throws('unclosed group', () => parse('[c3 d3'));
throws('unclosed alt', () => parse('<c3 d3'));
throws('bare star', () => parse('*2'));
throws('star without count', () => parse('c3*'), 'repetition');
throws('star zero count', () => parse('c3*0'), '>= 1');
throws('unknown ident', () => parse('wiggle(c3)'), 'Unknown function');
throws('irand reversed', () => parse('irand(7,0)'), 'reversed');
throws('bad char', () => parse('c3 @ d3'));

console.log('\ncollectLeaves');
expect('flat seq leaves',
    collectLeaves(parse('c3 d3 ~')).length === 3);
expect('nested leaves',
    collectLeaves(parse('[c3 <e3 g3>] choose(a3,b3)')).length === 5);

console.log('\nhasRandomization');
expect('static pattern is flagged false',
    hasRandomization(parse('c3 d3 e3')) === false);
expect('pattern with choose is flagged true',
    hasRandomization(parse('c3 choose(d3,e3) f3')) === true);
expect('pattern with irand is flagged true',
    hasRandomization(parse('c3 irand(0,7)')) === true);
expect('choose nested inside group is flagged true',
    hasRandomization(parse('[c3 choose(d3,e3)]')) === true);

console.log('');
if (failed > 0) {
    console.error(`${failed} test(s) failed.`);
    process.exit(1);
} else {
    console.log('All tests passed.');
}
