/**
 * themeCorpus.test.mjs — walk every theme in global_assets/music/themes/ and
 * validate it. Catches schema drift and keeps the hand-authored corpus honest
 * while we iterate on the validator. Run with:
 *   node public/holodeck/js/shared/themeCorpus.test.mjs
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateTheme } from './musicSchema.js';
import { validatePacks } from './packsSchema.js';
import { assetToTheme }  from './musicCompiler.js';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const THEMES_DIR  = path.resolve(__dirname, '../../global_assets/music/themes');
const PACKS_PATH  = path.resolve(__dirname, '../../global_assets/music/packs.json');

let failed = 0;
function expect(label, cond, detail) {
    if (cond) { console.log(`  ✓ ${label}`); return; }
    failed++;
    console.error(`  ✗ ${label}`);
    if (detail !== undefined) console.error('     ', JSON.stringify(detail, null, 2));
}

// Load packs first — every theme must reference a pack that exists.
const packsDoc = JSON.parse(fs.readFileSync(PACKS_PATH, 'utf8'));
const packsResult = validatePacks(packsDoc);
expect('packs.json itself validates', packsResult.ok, packsResult.errors);
const knownPacks = new Set(Object.keys(packsDoc.packs));

const files = fs.readdirSync(THEMES_DIR)
    .filter(f => f.endsWith('.json'))
    .sort();

expect(`found ${files.length} theme file(s)`, files.length > 0);

console.log(`\nvalidating ${files.length} theme(s) from ${path.relative(process.cwd(), THEMES_DIR)}/`);
for (const file of files) {
    const abs = path.join(THEMES_DIR, file);
    let asset;
    try {
        asset = JSON.parse(fs.readFileSync(abs, 'utf8'));
    } catch (e) {
        failed++;
        console.error(`  ✗ ${file} — JSON parse error: ${e.message}`);
        continue;
    }

    // Theme files on disk are asset-wrapped (id/type/payload.state); unwrap
    // to the bare plan-§7 shape the validator expects.
    const theme = assetToTheme(asset);
    if (!theme) {
        failed++;
        console.error(`  ✗ ${file} — not a v2 music asset (missing payload.format='music_state_v2')`);
        continue;
    }

    const r = validateTheme(theme);
    if (r.ok) {
        const wmark = r.warnings.length > 0 ? ` (${r.warnings.length} warning${r.warnings.length === 1 ? '' : 's'})` : '';
        console.log(`  ✓ ${file}${wmark}`);
        for (const w of r.warnings) console.log(`     ⚠ ${w.path}: ${w.message}`);
    } else {
        failed++;
        console.error(`  ✗ ${file}`);
        for (const e of r.errors) console.error(`     ${e.path}: ${e.message}`);
    }

    if (theme.defaults?.pack && !knownPacks.has(theme.defaults.pack)) {
        failed++;
        console.error(`  ✗ ${file} — references unknown pack '${theme.defaults.pack}'`);
    }

    // Every layer's role must exist in the referenced pack (for tonal roles)
    // or be `drums` (drums resolves via recipes).
    const pack = packsDoc.packs[theme.defaults?.pack];
    if (pack && Array.isArray(theme.layers)) {
        for (const layer of theme.layers) {
            if (!pack.roles[layer.role]) {
                failed++;
                console.error(`  ✗ ${file} — layer role '${layer.role}' missing from pack '${pack.id}'`);
            }
        }
    }
}

console.log('');
if (failed > 0) {
    console.error(`${failed} check(s) failed.`);
    process.exit(1);
} else {
    console.log('Corpus clean.');
}
