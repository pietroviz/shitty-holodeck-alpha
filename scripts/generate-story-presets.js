#!/usr/bin/env node
/**
 * generate-story-presets.js
 *
 * Picks 5 curated corpus sequences and emits them as browsable story assets
 * under public/holodeck/global_assets/stories/presets/, then writes the
 * manifest that the asset loader uses.
 *
 * Presets are intentionally hand-chosen for variety (location + arc + tension).
 *
 * Run:  node scripts/generate-story-presets.js
 */

const fs   = require('fs');
const path = require('path');

const ROOT       = path.resolve(__dirname, '..');
const CORPUS     = path.join(ROOT, 'public', 'holodeck', 'global_assets', 'stories', 'corpus.json');
const PRESET_DIR = path.join(ROOT, 'public', 'holodeck', 'global_assets', 'stories', 'presets');
const DEFAULT_DIR = path.join(ROOT, 'public', 'holodeck', 'global_assets', 'stories', 'defaults');
const MANIFEST   = path.join(ROOT, 'public', 'holodeck', 'global_assets', 'stories', 'manifest.json');

// id-in-corpus → { filename, displayName, tags }
const PRESETS = [
    { corpus_id: '0001', filename: 'story_sanctuary_refuge.json',     name: 'Sanctuary Refuge',     tags: ['sanctuary', 'mentor', 'rise_then_fall', 'medium'] },
    { corpus_id: '0003', filename: 'story_arena_conflict.json',       name: 'Arena Under Pressure', tags: ['arena', 'reluctant', 'falling', 'high'] },
    { corpus_id: '0006', filename: 'story_wild_descent.json',         name: 'Wild Descent',         tags: ['wild', 'falling', 'high'] },
    { corpus_id: '0005', filename: 'story_home_strangers.json',       name: 'Strangers at Home',    tags: ['home', 'strangers', 'rise_then_fall', 'medium'] },
    { corpus_id: '0020', filename: 'story_crossroads_arrival.json',   name: 'Crossroads Arrival',   tags: ['crossroads', 'allies', 'rising', 'low'] },
];

function summarise(seq) {
    // first beat's first line makes a decent teaser
    const first = seq.beats?.[0]?.lines?.[0];
    if (first) return `${first.speaker}: "${first.text}"`;
    return seq.slug;
}

function main() {
    if (!fs.existsSync(CORPUS)) {
        console.error(`Missing ${CORPUS} — run parse-story-corpus.js first.`);
        process.exit(1);
    }
    if (!fs.existsSync(PRESET_DIR)) fs.mkdirSync(PRESET_DIR, { recursive: true });

    const bundle = JSON.parse(fs.readFileSync(CORPUS, 'utf8'));
    const byId = new Map(bundle.sequences.map(s => [s.corpus_id, s]));

    const written = [];
    for (const p of PRESETS) {
        const seq = byId.get(p.corpus_id);
        if (!seq) {
            console.warn(`  ! corpus_id ${p.corpus_id} not found; skipping`);
            continue;
        }
        const id = p.filename.replace(/\.json$/, '');

        // Build the story asset (shape mirrors other global assets)
        const asset = {
            id,
            type: 'story',
            name: p.name,
            tags: p.tags,
            meta: {
                origin: 'template',
                created: '2026-04-22T00:00:00.000Z',
                modified: '2026-04-22T00:00:00.000Z',
                version: 1,
                source_corpus_id: seq.corpus_id,
            },
            payload: {
                description: summarise(seq),
                format: 'story_state',
                state: {
                    cast: seq.cast,
                    relationship: seq.relationship,
                    relationship_between: seq.relationship_between,
                    location: seq.location,
                    tension_level: seq.tension_level,
                    emotional_arc: seq.emotional_arc,
                    age_target: seq.age_target,
                    beats: seq.beats,
                    beat_count: seq.beat_count,
                    conditioning_notes: seq.conditioning_notes,
                },
            },
        };

        const outPath = path.join(PRESET_DIR, p.filename);
        fs.writeFileSync(outPath, JSON.stringify(asset, null, 2));
        written.push({ id, name: p.name, corpus_id: seq.corpus_id });
        console.log(`  wrote ${p.filename}  ← corpus ${p.corpus_id}  (${seq.cast.map(c => c.archetype).join('/')})`);
    }

    // Write manifest — matches the shape used by other asset loaders
    // (hasManifest: true → categories { key: { name, count, files } })
    const manifest = {
        categories: {
            defaults: {
                name: 'Getting Started',
                count: 1,
                files: ['story_meta_default.json'],
                folder: 'defaults',
            },
            presets: {
                name: 'Presets',
                count: written.length,
                files: written.map(w => `${w.id}.json`),
                folder: 'presets',
            },
        },
    };
    fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
    console.log(`Wrote ${MANIFEST}`);
}

main();
