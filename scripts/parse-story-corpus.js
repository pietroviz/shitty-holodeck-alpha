#!/usr/bin/env node
/**
 * parse-story-corpus.js
 *
 * Reads _refs/Builder-Story_V0.1/corpus/*.nar.md and emits a single bundled JSON
 * at public/holodeck/global_assets/stories/corpus.json.
 *
 * The bundle shape:
 *   { version: 1, generated: <ISO>, count: N, sequences: [ StoryPayload, ... ] }
 *
 * Each StoryPayload matches the `payload.state` shape the StoryBridge will use
 * for rendering + nearest-match lookup.
 *
 * Run:  node scripts/parse-story-corpus.js
 */

const fs = require('fs');
const path = require('path');

const CORPUS_DIR = path.resolve(__dirname, '..', '_refs', 'Builder-Story_V0.1', 'corpus');
const OUT_FILE   = path.resolve(__dirname, '..', 'public', 'holodeck', 'global_assets', 'stories', 'corpus.json');

// ─── helpers ──────────────────────────────────────────────────────────

/** Split markdown into logical blocks separated by `---` lines. */
function splitBlocks(md) {
    return md.split(/^---\s*$/m).map(s => s.trim()).filter(Boolean);
}

/** Parse the seed block (the "## Seed" section). */
function parseSeed(block) {
    const seed = {
        cast: [],
        relationship: null,
        relationship_between: null,
        location: null,
        tension_level: null,
        emotional_arc: null,
        beat_count: null,
        age_target: null,
    };

    // cast lines: "  - `<CHAR_A>`: ⚡ Edge | loves: X | fears: Y — voice hint: Z"
    const castRe = /-\s+`<(CHAR_[A-Z])>`:\s+(\S+)\s+([^|]+?)\s*\|\s*loves:\s*([^|]+?)\s*\|\s*fears:\s*([^—\n]+?)(?:\s*—\s*voice hint:\s*(.+?))?$/gm;
    let m;
    while ((m = castRe.exec(block)) !== null) {
        seed.cast.push({
            slot: m[1],
            emoji: m[2],
            archetype: m[3].trim(),
            loves: m[4].trim(),
            fears: m[5].trim(),
            voice_hint: (m[6] || '').trim() || null,
        });
    }

    // relationship: "- relationship: mentor_student (between `<CHAR_A>` and `<CHAR_B>`)"
    const relM = block.match(/-\s*relationship:\s*([a-z_]+)(?:\s*\(between\s*`<(CHAR_[A-Z])>`\s*and\s*`<(CHAR_[A-Z])>`\))?/i);
    if (relM) {
        seed.relationship = relM[1];
        if (relM[2] && relM[3]) seed.relationship_between = [relM[2], relM[3]];
    }

    // location: "- location: `<LOCATION_A>` — sanctuary (safe, restorative, ...)"
    const locM = block.match(/-\s*location:\s*`<(LOCATION_[A-Z])>`\s*—\s*([a-z_]+)(?:\s*\(([^)]+)\))?/i);
    if (locM) {
        seed.location = {
            slot: locM[1],
            type: locM[2],
            notes: (locM[3] || '').trim() || null,
        };
    }

    const tenM = block.match(/-\s*tension_level:\s*(\S+)/i);
    if (tenM) seed.tension_level = tenM[1].trim();

    const arcM = block.match(/-\s*emotional_arc:\s*(\S+)/i);
    if (arcM) seed.emotional_arc = arcM[1].trim();

    const bcM = block.match(/-\s*beat_count:\s*(\d+)/i);
    if (bcM) seed.beat_count = parseInt(bcM[1], 10);

    const ageM = block.match(/-\s*age_target:\s*(.+)/i);
    if (ageM) seed.age_target = ageM[1].trim();

    return seed;
}

/** Parse a single narreme beat block. */
function parseBeat(block) {
    // Header: "### narreme_001"
    const idM = block.match(/###\s*(narreme_\d+)/);
    if (!idM) return null;

    const beat = {
        id: idM[1],
        characters: [],
        location: null,
        function: null,
        emotion: null,
        tension: null,
        cue: null,
        lines: [],
        next: null,
    };

    // Characters: "🎭 `<CHAR_A>`, `<CHAR_B>`"
    const charM = block.match(/🎭\s*(.+)/);
    if (charM) {
        const chars = charM[1].match(/<(CHAR_[A-Z])>/g) || [];
        beat.characters = chars.map(s => s.replace(/<|>/g, ''));
    }

    // Location: "📍 `<LOCATION_A>`"
    const lM = block.match(/📍\s*`?<(LOCATION_[A-Z])>`?/);
    if (lM) beat.location = lM[1];

    const fM = block.match(/💭\s*function:\s*(.+)/);
    if (fM) beat.function = fM[1].trim();

    const eM = block.match(/😊\s*emotion:\s*(.+)/);
    if (eM) beat.emotion = eM[1].trim();

    const tM = block.match(/📊\s*tension:\s*(\d+)/);
    if (tM) beat.tension = parseInt(tM[1], 10);

    // Cues: music_box(...), environment_box(...), image_box(...), prop_box(...)
    // e.g. "🎵 music_box(mood=low_warm, tempo=slow)"
    const cueLine = block.match(/(?:🎵|🌲|🎨|🧸)\s*(\w+_box)\(([^)]*)\)/);
    if (cueLine) {
        const type = cueLine[1];
        const params = {};
        for (const kv of cueLine[2].split(',')) {
            const [k, v] = kv.split('=').map(s => s && s.trim());
            if (k) params[k] = v || '';
        }
        beat.cue = { type, params };
    }

    // Lines: "`<CHAR_A>`: \"text\""
    const lineRe = /`<(CHAR_[A-Z])>`:\s*"([^"]*)"/g;
    let lm;
    while ((lm = lineRe.exec(block)) !== null) {
        beat.lines.push({ speaker: lm[1], text: lm[2] });
    }

    // Next: "➡️ next: narreme_002" or "➡️ end"
    const nM = block.match(/➡️\s*(?:next:\s*(narreme_\d+)|end)/);
    if (nM) beat.next = nM[1] || 'end';

    return beat;
}

/** Parse one .nar.md file → StoryPayload. */
function parseFile(filePath) {
    const md = fs.readFileSync(filePath, 'utf8');
    const id = path.basename(filePath, '.nar.md'); // "0001"

    // Title line: "# Narreme Sequence: edge_anchor_anchor_mentor_sanctuary_risefall_01"
    const titleM = md.match(/^#\s*Narreme Sequence:\s*(.+)/m);
    const slug = titleM ? titleM[1].trim() : `seq_${id}`;

    const blocks = splitBlocks(md);

    let seed = null;
    const beats = [];
    let conditioningNotes = null;

    for (const block of blocks) {
        if (/^##\s*Seed/m.test(block)) {
            seed = parseSeed(block);
        } else if (/^###\s*narreme_/m.test(block)) {
            const b = parseBeat(block);
            if (b) beats.push(b);
        } else if (/^##\s*Conditioning Notes/m.test(block)) {
            const txt = block.replace(/^##\s*Conditioning Notes\s*/m, '').trim();
            conditioningNotes = txt || null;
        }
    }

    if (!seed) return null;

    return {
        corpus_id: id,
        slug,
        ...seed,
        beats,
        conditioning_notes: conditioningNotes,
    };
}

// ─── main ─────────────────────────────────────────────────────────────

function main() {
    if (!fs.existsSync(CORPUS_DIR)) {
        console.error(`Corpus dir not found: ${CORPUS_DIR}`);
        process.exit(1);
    }
    const files = fs.readdirSync(CORPUS_DIR)
        .filter(f => f.endsWith('.nar.md'))
        .sort();

    console.log(`Parsing ${files.length} narreme files from ${CORPUS_DIR}`);

    const sequences = [];
    let skipped = 0;
    for (const f of files) {
        try {
            const seq = parseFile(path.join(CORPUS_DIR, f));
            if (seq) sequences.push(seq);
            else skipped++;
        } catch (err) {
            console.warn(`  ! ${f} — parse error: ${err.message}`);
            skipped++;
        }
    }
    console.log(`  parsed: ${sequences.length}, skipped: ${skipped}`);

    const outDir = path.dirname(OUT_FILE);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const bundle = {
        version: 1,
        generated: new Date().toISOString(),
        count: sequences.length,
        sequences,
    };
    fs.writeFileSync(OUT_FILE, JSON.stringify(bundle, null, 2));
    console.log(`Wrote ${OUT_FILE} (${sequences.length} sequences, ${Math.round(fs.statSync(OUT_FILE).size / 1024)} KB)`);

    // Small summary for sanity
    const tuples = new Set();
    const arcs = new Set();
    const locations = new Set();
    for (const s of sequences) {
        const tup = s.cast.map(c => c.archetype).join('/');
        tuples.add(tup);
        if (s.emotional_arc) arcs.add(s.emotional_arc);
        if (s.location?.type) locations.add(s.location.type);
    }
    console.log(`Unique archetype tuples: ${tuples.size}`);
    console.log(`Emotional arcs: ${[...arcs].sort().join(', ')}`);
    console.log(`Locations: ${[...locations].sort().join(', ')}`);
}

main();
