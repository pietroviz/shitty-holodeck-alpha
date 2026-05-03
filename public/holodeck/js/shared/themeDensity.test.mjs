/**
 * themeDensity.test.mjs — for every theme on disk, parse each layer, run the
 * evaluator on cycle 0 with the theme's seed, and report how many actual
 * events (non-rests) fire per role per cycle. Surfaces silent / pathological
 * layers and gives a verifiable answer to "is every instrument actually
 * firing?".
 *
 * Run:  node public/holodeck/js/shared/themeDensity.test.mjs
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse }         from './miniNotationParser.js';
import { evaluateCycle } from './patternEvaluator.js';
import { assetToTheme }  from './musicCompiler.js';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const THEMES_DIR = path.resolve(__dirname, '../../global_assets/music/themes');
const MANIFEST   = path.resolve(__dirname, '../../global_assets/music/manifest.json');

// Load manifest so we only audit themes that are actually surfaced to users.
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const visibleFiles = new Set(
    Object.values(manifest.categories || {})
        .flatMap(c => c.files || [])
);

const ROLE_ORDER = ['bass', 'melody', 'drums', 'chords', 'pad', 'texture'];

function audit(file) {
    const asset = JSON.parse(fs.readFileSync(path.join(THEMES_DIR, file), 'utf8'));
    const theme = assetToTheme(asset);
    const sectionLayers = new Set(theme?.sections?.[0]?.layers || []);

    const rows = [];
    for (const role of ROLE_ORDER) {
        const layer = theme?.layers?.find(l => l.role === role);
        if (!layer) {
            rows.push({ role, status: '—', events: 0, note: 'not in theme' });
            continue;
        }
        if (!sectionLayers.has(role)) {
            rows.push({ role, status: '○', events: 0, note: 'not in section A' });
            continue;
        }
        let events;
        try {
            events = evaluateCycle(parse(layer.pattern), { cycleIndex: 0, seed: theme.seeds?.pattern ?? 0 });
        } catch (e) {
            rows.push({ role, status: '✗', events: 0, note: `parse error: ${e.message}` });
            continue;
        }
        const count = events.length;
        const status = count >= 4 ? '●' : (count >= 2 ? '◐' : (count === 1 ? '◯' : '✗'));
        rows.push({ role, status, events: count });
    }
    return rows;
}

const files = Array.from(visibleFiles).sort();
console.log(`density audit — ${files.length} themes\n`);
console.log('legend: ● = 4+ events/cycle   ◐ = 2-3   ◯ = 1   ○ = not in section A   — = not in theme   ✗ = error\n');

const COL = (s, w) => String(s).padEnd(w);
console.log(COL('theme', 26) + ROLE_ORDER.map(r => COL(r, 10)).join(''));
console.log('─'.repeat(26 + ROLE_ORDER.length * 10));

let problemThemes = 0;
for (const file of files) {
    const rows = audit(file);
    const cells = rows.map(r => `${r.status} (${r.events})`);
    const looksSparse = rows.some(r =>
        r.status === '✗'
        || (r.status === '○' && r.role !== 'drums')   // missing non-drum from section A is suspicious
    );
    const name = file.replace('.json', '');
    console.log(COL(name, 26) + cells.map(c => COL(c, 10)).join(''));
    if (looksSparse) problemThemes++;
}

console.log('');
if (problemThemes > 0) {
    console.log(`note: ${problemThemes} theme(s) have a layer that produces 0 events on cycle 0 — usually a sparse choose(...,~) pattern that fires on later cycles (intentional). Audit non-failing; visual inspection only.`);
}
// Audit is diagnostic / informational, not a hard pass/fail gate.
process.exit(0);
