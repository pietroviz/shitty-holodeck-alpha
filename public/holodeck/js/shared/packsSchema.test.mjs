/**
 * Smoke tests for packsSchema. Validates the real packs.json alongside
 * deliberately-broken variants. Run with:
 *   node public/holodeck/js/shared/packsSchema.test.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePacks } from './packsSchema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKS_PATH = path.resolve(__dirname, '../../global_assets/music/packs.json');

let failed = 0;
function expect(label, cond, detail) {
    if (cond) { console.log(`  ✓ ${label}`); return; }
    failed++;
    console.error(`  ✗ ${label}`);
    if (detail !== undefined) console.error('     ', JSON.stringify(detail, null, 2));
}

console.log('validatePacks — real packs.json');
const packsDoc = JSON.parse(fs.readFileSync(PACKS_PATH, 'utf8'));
{
    const r = validatePacks(packsDoc);
    expect('real packs.json passes', r.ok, r.errors);
}

console.log('\nvalidatePacks — rejects malformed');
{
    const r = validatePacks(null);
    expect('null rejected', !r.ok);
}
{
    const r = validatePacks({ $schema_version: 2, packs: {} });
    expect('wrong schema version reported',
        r.errors.some(e => e.path === '$schema_version'));
}
{
    const broken = structuredClone(packsDoc);
    broken.packs.game_boy.roles.bass.synth = 'Tone.Wobble';
    const r = validatePacks(broken);
    expect('unknown Tone class rejected',
        r.errors.some(e => e.path === 'packs.game_boy.roles.bass.synth'),
        r.errors);
}
{
    const broken = structuredClone(packsDoc);
    broken.packs.game_boy.roles.chords.baseSynth = undefined;
    delete broken.packs.game_boy.roles.chords.baseSynth;
    const r = validatePacks(broken);
    expect('PolySynth without baseSynth rejected',
        r.errors.some(e => e.path.includes('baseSynth')), r.errors);
}
{
    const broken = structuredClone(packsDoc);
    broken.packs.game_boy.roles.drums.default_recipe = 'cowbell';
    const r = validatePacks(broken);
    expect('default_recipe pointing at missing recipe rejected',
        r.errors.some(e => e.message.includes("missing recipe 'cowbell'")), r.errors);
}
{
    const broken = structuredClone(packsDoc);
    broken.packs.game_boy.id = 'wrong_id';
    const r = validatePacks(broken);
    expect('pack.id mismatch with key rejected',
        r.errors.some(e => e.path === 'packs.game_boy.id'), r.errors);
}
{
    const broken = structuredClone(packsDoc);
    broken.packs.game_boy.roles.bass.gain = 5;
    const r = validatePacks(broken);
    expect('gain out of range rejected',
        r.errors.some(e => e.path === 'packs.game_boy.roles.bass.gain'), r.errors);
}

console.log('');
if (failed > 0) {
    console.error(`${failed} test(s) failed.`);
    process.exit(1);
} else {
    console.log('All tests passed.');
}
