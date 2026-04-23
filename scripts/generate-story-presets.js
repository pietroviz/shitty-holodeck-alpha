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
// 25 total — 5 "origin" presets + 20 curated for variety across the 12 locations,
// all 4 relationship types, all 4 emotional arcs, and all 3 tension levels.
const PRESETS = [
    // ── Original five ───────────────────────────────────────────
    { corpus_id: '0001', filename: 'story_sanctuary_refuge.json',     name: 'Sanctuary Refuge',     tags: ['sanctuary', 'mentor', 'rise_then_fall', 'medium'] },
    { corpus_id: '0003', filename: 'story_arena_conflict.json',       name: 'Arena Under Pressure', tags: ['arena', 'reluctant', 'falling', 'high'] },
    { corpus_id: '0006', filename: 'story_wild_descent.json',         name: 'Wild Descent',         tags: ['wild', 'falling', 'high'] },
    { corpus_id: '0005', filename: 'story_home_strangers.json',       name: 'Strangers at Home',    tags: ['home', 'strangers', 'rise_then_fall', 'medium'] },
    { corpus_id: '0020', filename: 'story_crossroads_arrival.json',   name: 'Crossroads Arrival',   tags: ['crossroads', 'allies', 'rising', 'low'] },

    // ── Twenty more, curated for variety ────────────────────────
    { corpus_id: '0002', filename: 'story_ruin_walkthrough.json',        name: 'Ruin Walkthrough',           tags: ['ruin', 'mentor', 'steady_with_spike', 'low'] },
    { corpus_id: '0004', filename: 'story_trap_rivals.json',             name: 'Cornered Rivals',            tags: ['trap', 'rivals', 'falling', 'low'] },
    { corpus_id: '0007', filename: 'story_vantage_list_wrong.json',      name: 'The List Is Wrong',          tags: ['vantage', 'mentor', 'falling', 'medium'] },
    { corpus_id: '0008', filename: 'story_arena_say_the_thing.json',     name: 'Say The Thing And Leave',    tags: ['arena', 'allies', 'rise_then_fall', 'medium'] },
    { corpus_id: '0010', filename: 'story_arena_everyone_staring.json',  name: 'Everyone Is Staring',        tags: ['arena', 'mentor', 'falling', 'low'] },
    { corpus_id: '0011', filename: 'story_home_whole_thing_wrong.json',  name: 'The Whole Thing Is Wrong',   tags: ['home', 'allies', 'falling', 'high'] },
    { corpus_id: '0012', filename: 'story_commons_something_weird.json', name: 'Something Weird East Side',  tags: ['commons', 'allies', 'rise_then_fall', 'high'] },
    { corpus_id: '0013', filename: 'story_home_classroom.json',          name: 'Home Classroom',             tags: ['home', 'mentor', 'rising', 'medium'] },
    { corpus_id: '0014', filename: 'story_ruin_rivals_list.json',        name: 'Not On The List',            tags: ['ruin', 'rivals', 'rise_then_fall', 'low'] },
    { corpus_id: '0015', filename: 'story_arena_watching_us.json',       name: 'Everyone Is Watching Us',    tags: ['arena', 'rivals', 'rising', 'low'] },
    { corpus_id: '0016', filename: 'story_arena_allies_falter.json',     name: 'Arena Drops Its Nerve',      tags: ['arena', 'allies', 'falling', 'medium'] },
    { corpus_id: '0017', filename: 'story_passage_checklist.json',       name: 'Passage Checklist',          tags: ['passage', 'allies', 'rising', 'medium'] },
    { corpus_id: '0018', filename: 'story_ruin_haunted_cafeteria.json',  name: 'Haunted Cafeteria Vibes',    tags: ['ruin', 'mentor', 'rise_then_fall', 'low'] },
    { corpus_id: '0019', filename: 'story_threshold_snack_offer.json',   name: 'Threshold Snack Offer',      tags: ['threshold', 'strangers', 'falling', 'high'] },
    { corpus_id: '0021', filename: 'story_commons_usual_spot.json',      name: 'Commons Seat Trouble',       tags: ['commons', 'strangers', 'falling', 'medium'] },
    { corpus_id: '0022', filename: 'story_hideout_schedule_fight.json',  name: 'Hideout Schedule Fight',     tags: ['hideout', 'reluctant', 'steady_with_spike', 'low'] },
    { corpus_id: '0023', filename: 'story_arena_coach_before.json',      name: 'Coach Before The Arena',     tags: ['arena', 'mentor', 'steady_with_spike', 'medium'] },
    { corpus_id: '0024', filename: 'story_threshold_crossing_together.json', name: 'Crossing Together',      tags: ['threshold', 'allies', 'rise_then_fall', 'medium'] },
    { corpus_id: '0025', filename: 'story_hideout_huddle.json',          name: 'Hideout Huddle',             tags: ['hideout', 'allies', 'rising', 'high'] },
    { corpus_id: '0026', filename: 'story_crossroads_three_paths.json',  name: 'Three Paths',                tags: ['crossroads', 'allies', 'steady_with_spike', 'low'] },
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
