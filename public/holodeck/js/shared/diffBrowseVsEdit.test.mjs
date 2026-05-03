/**
 * diffBrowseVsEdit.test.mjs — diagnostic that loads each theme on disk and
 * compares the *browse* path's compiled theme against the *edit* path's
 * compiled theme for that same asset. They MUST be identical; if anything
 * diverges (especially anything affecting pitch — layer patterns, register,
 * scale, or section layer set), we surface it here and fail.
 *
 * Browse path  : assetToTheme(asset)                       → compileTheme
 * Edit path    : _loadState(asset) → _asCompilableTheme    → compileTheme
 *
 * The bridge's transforms are inlined here so Node can run this without
 * dragging in the THREE.js scene graph.
 *
 * Run:  node public/holodeck/js/shared/diffBrowseVsEdit.test.mjs
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetToTheme } from './musicCompiler.js';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const THEMES_DIR = path.resolve(__dirname, '../../global_assets/music/themes');

let failed = 0;
function expect(label, cond, detail) {
    if (cond) { console.log(`  ✓ ${label}`); return; }
    failed++;
    console.error(`  ✗ ${label}`);
    if (detail !== undefined) console.error('     ', JSON.stringify(detail, null, 2));
}

/* ── Inlined copies of the bridge's transforms.
      Keep these in sync with public/holodeck/js/bridges/MusicBridge.js. ── */

function clamp01(v) {
    const n = +v;
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
}
function clampRange(v, lo, hi) {
    const n = +v;
    if (!Number.isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, n));
}

function _defaultLayer(l = {}) {
    return {
        role:        l.role     ?? 'melody',
        pattern:     l.pattern  ?? 'choose(c4,e4,g4)',
        feel:        Array.isArray(l.feel) && l.feel.length >= 3 ? l.feel : ['unset','unset','unset'],
        register:    Number.isInteger(l.register) ? clampRange(l.register, -3, 3) : 0,
        densityBase: clamp01(l.densityBase ?? 0.5),
    };
}

function _withDefaults(s) {
    const out = {
        modulation: s.modulation ?? null,
        id:         s.id         ?? null,
        name:       s.name       ?? null,
        pack:       s.pack       ?? 'game_boy',
        scaleKey:   s.scaleKey   ?? 'C',
        scaleMode:  s.scaleMode  ?? 'major',
        cps:        s.cps        ?? 0.55,
        valence:    clamp01(s.valence    ?? 0.6),
        complexity: clamp01(s.complexity ?? 0.5),
        speed:      clampRange(s.speed   ?? 1.0, 0.5, 2.0),
        variety:    clamp01(s.variety    ?? 0.4),
        groove:     s.groove     ?? 'straight',
        texture:    s.texture    ?? 'clean',
        mood:       s.mood       ?? '',
        coverColor: s.coverColor ?? '#5b9bd5',
        layers:     Array.isArray(s.layers) ? s.layers.map(_defaultLayer) : [],
        sections:   Array.isArray(s.sections) && s.sections.length >= 1
                      ? s.sections
                      : [{ id: 'A', layers: [] }],
        seeds:      s.seeds      ?? { pattern: 0, variation: 0 },
    };
    if (typeof s.scale === 'string' && s.scale.includes(':')) {
        const [k, m] = s.scale.split(':', 2);
        out.scaleKey  = k;
        out.scaleMode = m;
    }
    if (out.sections[0].layers.length === 0 && out.layers.length > 0) {
        const allRoles = out.layers.map(l => l.role);
        out.sections = [{ id: 'A', layers: allRoles.slice() }];
    }
    return out;
}

function bridgeAsCompilableTheme(asset, state) {
    return {
        id:          asset?.id || state.id || 'untitled',
        name:        asset?.name || state.name || 'Untitled',
        description: asset?.payload?.description || state.description || '',
        tags:        asset?.tags?.length ? asset.tags : ['untitled'],
        defaults: {
            pack:       state.pack,
            scale:      `${state.scaleKey}:${state.scaleMode}`,
            cps:        state.cps,
            valence:    state.valence,
            complexity: state.complexity,
            speed:      state.speed,
            variety:    state.variety,
            groove:     state.groove,
            texture:    state.texture,
        },
        layers:     structuredClone(state.layers),
        sections:   structuredClone(state.sections),
        seeds:      structuredClone(state.seeds),
        modulation: structuredClone(state.modulation ?? null),
    };
}

/* ── Diff utilities ── */

function diffJSON(label, a, b) {
    const aJSON = JSON.stringify(a);
    const bJSON = JSON.stringify(b);
    return aJSON === bJSON ? null : { label, browse: a, edit: b };
}

function comparePitchSurfaceAreas(browseTheme, editTheme) {
    const diffs = [];
    // Field-by-field comparison of everything that can change pitch.
    const pairs = [
        ['defaults.scale',        browseTheme.defaults.scale,         editTheme.defaults.scale],
        ['defaults.valence',      browseTheme.defaults.valence,       editTheme.defaults.valence],
        ['defaults.cps',          browseTheme.defaults.cps,           editTheme.defaults.cps],
        ['defaults.speed',        browseTheme.defaults.speed,         editTheme.defaults.speed],
        ['seeds.pattern',         browseTheme.seeds?.pattern,         editTheme.seeds?.pattern],
        ['layers.length',         browseTheme.layers.length,          editTheme.layers.length],
        ['sections[0].layers',    browseTheme.sections[0]?.layers,    editTheme.sections[0]?.layers],
    ];
    for (const [path, b, e] of pairs) {
        const d = diffJSON(path, b, e);
        if (d) diffs.push(d);
    }
    // Per-layer: pattern + register specifically (these MUST match for pitch).
    const n = Math.max(browseTheme.layers.length, editTheme.layers.length);
    for (let i = 0; i < n; i++) {
        const bL = browseTheme.layers[i];
        const eL = editTheme.layers[i];
        if (!bL || !eL) {
            diffs.push({ label: `layers[${i}] missing on one side`, browse: bL, edit: eL });
            continue;
        }
        if (bL.role !== eL.role) {
            diffs.push({ label: `layers[${i}].role`, browse: bL.role, edit: eL.role });
        }
        if (bL.pattern !== eL.pattern) {
            diffs.push({ label: `layers[${i}].pattern (${bL.role})`, browse: bL.pattern, edit: eL.pattern });
        }
        if ((bL.register ?? 0) !== (eL.register ?? 0)) {
            diffs.push({ label: `layers[${i}].register (${bL.role})`, browse: bL.register, edit: eL.register });
        }
    }
    return diffs;
}

/* ── Run diff for every theme on disk. ── */

const files = fs.readdirSync(THEMES_DIR).filter(f => f.endsWith('.json')).sort();
console.log(`browse-vs-edit pitch diff for ${files.length} theme(s)\n`);

for (const file of files) {
    const asset = JSON.parse(fs.readFileSync(path.join(THEMES_DIR, file), 'utf8'));

    const browseTheme = assetToTheme(asset);
    const editState   = _withDefaults(asset.payload?.state || {});
    const editTheme   = bridgeAsCompilableTheme(asset, editState);

    const diffs = comparePitchSurfaceAreas(browseTheme, editTheme);
    expect(`${file}: pitch-surface fields identical between browse + edit paths`,
        diffs.length === 0, diffs.length > 0 ? diffs : undefined);
}

console.log('');
if (failed > 0) {
    console.error(`${failed} theme(s) diverge between browse + edit paths — see diffs above.`);
    process.exit(1);
} else {
    console.log('All pitch-surface fields match between browse + edit. If pitch still differs in-app, the divergence is downstream (synth options, runtime mutation, or active mode application).');
}
