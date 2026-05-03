#!/usr/bin/env node
/**
 * Generates 8 curated sim templates that the homepage random-landing
 * loader picks from. Each template is a hand-paired (env + music + 3 chars
 * + short script) combo that holds together thematically — so the homepage
 * doesn't read as "random soup" even when the picker rolls a different
 * sim every page load.
 *
 * Run: node scripts/generate-sim-templates.js
 *
 * Schema is the same `simulation_state` shape used by SimulationBridge —
 * envId, musicId, cast[], beats[], cameraStyle, postFx. cameraStyle is
 * 'speaker_cuts' across the board so cuts fire on speaker change in the
 * homepage playback.
 */

const fs   = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..', 'public', 'holodeck', 'global_assets', 'simulations');
const NOW  = new Date().toISOString();

// ── Beat helper ───────────────────────────────────────────────────
// Tight inline beats — enough to establish the vibe + give the camera
// cuts something to chew on. Each beat is a single conversational
// exchange (3–5 lines), most beats touch CHAR_A/B/C so cuts fire
// regularly. Function/emotion/tension match the corpus convention.
function beat(id, lines, opts = {}) {
    return {
        id,
        characters: ['CHAR_A', 'CHAR_B', 'CHAR_C'],
        location:   opts.location  || 'LOCATION_A',
        function:   opts.function  || 'arrival',
        emotion:    opts.emotion   || 'curious',
        tension:    opts.tension   ?? 3,
        lines: lines.map(([speaker, text]) => ({ speaker, text })),
    };
}

// ── The 8 curated templates ───────────────────────────────────────
// Each sim picks an env that matches its tone, a music track from the
// matching mood, and three characters whose archetypes make the trio
// read as a natural ensemble. Beats are deliberately short so the
// homepage feels alive without making the visitor sit through dialogue.

const TEMPLATES = [

    // 1. Mushroom Forest Council ──
    {
        id:   'sim_mushroom_council',
        name: 'Mushroom Forest Council',
        tags: ['fantasy','nature','elder','council'],
        description: 'Three forest folk weigh in on a problem the trees have been gossiping about.',
        envId:   'env_giant_mushroom_forest',
        musicId: 'curious_wandering',
        cast: [
            { slot:'CHAR_A', charId:'char_oakbeard',         archetype:'Anchor' },
            { slot:'CHAR_B', charId:'char_pixie_dust',       archetype:'Bloom'  },
            { slot:'CHAR_C', charId:'char_willow_moonwhisper', archetype:'Edge' },
        ],
        beats: [
            beat('council_1', [
                ['CHAR_A', "The mushrooms have been whispering. Something's wrong upstream."],
                ['CHAR_B', "Wrong how? Is it the water? It's always the water."],
                ['CHAR_C', "It's not the water. The trees know. They're waiting for us to ask."],
            ], { function:'arrival', emotion:'wary', tension:4 }),
            beat('council_2', [
                ['CHAR_C', "We have to walk to the spring before sundown."],
                ['CHAR_A', "Then we walk."],
                ['CHAR_B', "I'll bring the lantern. And snacks. Snacks are non-negotiable."],
            ], { function:'plan', emotion:'resolute', tension:3 }),
        ],
    },

    // 2. Neon District After Midnight ──
    {
        id:   'sim_neon_standoff',
        name: 'Neon District After Midnight',
        tags: ['cyberpunk','urban','tense','noir'],
        description: 'Three operators in a rain-slick alley, working out who got burned.',
        envId:   'env_neon_district',
        musicId: 'tense_standoff',
        cast: [
            { slot:'CHAR_A', charId:'char_hacker_zero',     archetype:'Edge'   },
            { slot:'CHAR_B', charId:'char_cyborg_kai',      archetype:'Glitch' },
            { slot:'CHAR_C', charId:'char_bounty_hunter_rex', archetype:'Anchor' },
        ],
        beats: [
            beat('neon_1', [
                ['CHAR_A', "Someone tipped them off. The whole drop was a setup."],
                ['CHAR_B', "Wasn't me. I run clean. You know that."],
                ['CHAR_C', "Doesn't matter who. Matters what we do in the next ten minutes."],
            ], { function:'conflict', emotion:'wary', tension:6 }),
            beat('neon_2', [
                ['CHAR_A', "We split up. Different exits. Meet at the third spot in an hour."],
                ['CHAR_C', "Third spot's compromised."],
                ['CHAR_B', "Then we go to the fourth."],
            ], { function:'plan', emotion:'resolute', tension:5 }),
        ],
    },

    // 3. Cozy Living Room Catch-up ──
    {
        id:   'sim_cozy_catchup',
        name: 'Cozy Living Room Catch-up',
        tags: ['cozy','home','friendship','quiet'],
        description: 'Old friends, new tea, one small confession that changes the room.',
        envId:   'env_cozy_living_room',
        musicId: 'cozy_fireside',
        cast: [
            { slot:'CHAR_A', charId:'char_influencer_aria', archetype:'Edge'  },
            { slot:'CHAR_B', charId:'char_sitcom_steve',    archetype:'Bloom' },
            { slot:'CHAR_C', charId:'char_podcast_pat',     archetype:'Anchor' },
        ],
        beats: [
            beat('cozy_1', [
                ['CHAR_C', "I quit the podcast."],
                ['CHAR_A', "Wait, what — when?"],
                ['CHAR_B', "...Are we surprised, though?"],
            ], { function:'reveal', emotion:'tender', tension:4 }),
            beat('cozy_2', [
                ['CHAR_C', "Last week. I haven't told anyone yet. You're the first."],
                ['CHAR_A', "Okay. Okay. Tea first. Then you tell us everything."],
            ], { function:'support', emotion:'warm', tension:2 }),
        ],
    },

    // 4. Cathedral of Echoes ──
    {
        id:   'sim_kelp_cathedral',
        name: 'Cathedral of Echoes',
        tags: ['underwater','mystical','prophecy','awe'],
        description: 'Three pilgrims at the edge of a kelp cathedral. Something ancient is listening.',
        envId:   'env_kelp_cathedral',
        musicId: 'ocean_deep',
        cast: [
            { slot:'CHAR_A', charId:'char_coral_the_merfolk',  archetype:'Anchor' },
            { slot:'CHAR_B', charId:'char_brother_cedric',     archetype:'Bloom'  },
            { slot:'CHAR_C', charId:'char_xenobiologist_orin', archetype:'Edge'   },
        ],
        beats: [
            beat('cathedral_1', [
                ['CHAR_A', "Stand still. It's awake."],
                ['CHAR_C', "What is — the cathedral?"],
                ['CHAR_B', "Cathedrals don't wake up. Things inside them do."],
            ], { function:'arrival', emotion:'awed', tension:5 }),
            beat('cathedral_2', [
                ['CHAR_A', "Whatever you ask now, ask carefully. It's been a long time since anyone asked."],
            ], { function:'invocation', emotion:'reverent', tension:4 }),
        ],
    },

    // 5. Cryo-DMV Existential Crisis ──
    {
        id:   'sim_cryo_dmv',
        name: 'Cryo-DMV Existential Crisis',
        tags: ['scifi','comedy','bureaucracy','deadpan'],
        description: 'Three thawed-out humans waiting in line at a frozen department of motor vehicles.',
        envId:   'env_cryo_dmv',
        musicId: 'industrial_pulse',
        cast: [
            { slot:'CHAR_A', charId:'char_unit_7_android',    archetype:'Anchor' },
            { slot:'CHAR_B', charId:'char_judge_fontaine',    archetype:'Edge'   },
            { slot:'CHAR_C', charId:'char_dr_elara_quantum',  archetype:'Bloom'  },
        ],
        beats: [
            beat('dmv_1', [
                ['CHAR_B', "How long have we been in this line."],
                ['CHAR_A', "Local time, four hours. Subjective time, eleven years."],
                ['CHAR_C', "I think I had a child while we were in this line."],
            ], { function:'observation', emotion:'deadpan', tension:2 }),
            beat('dmv_2', [
                ['CHAR_A', "Now serving number eight thousand and one."],
                ['CHAR_B', "I'm number eight thousand and forty-seven."],
                ['CHAR_C', "I'm just here because I love a queue."],
            ], { function:'comedic', emotion:'resigned', tension:1 }),
        ],
    },

    // 6. Goblin Market Haggle ──
    {
        id:   'sim_goblin_haggle',
        name: 'Goblin Market Haggle',
        tags: ['fantasy','market','scrappy','comedy'],
        description: 'Three travellers trying not to get fleeced by a goblin selling questionable wares.',
        envId:   'env_goblin_market',
        musicId: 'sneaky_operator',
        cast: [
            { slot:'CHAR_A', charId:'char_gronk_the_goblin',   archetype:'Edge'   },
            { slot:'CHAR_B', charId:'char_paladin_auric',      archetype:'Anchor' },
            { slot:'CHAR_C', charId:'char_zephyr_the_bard',    archetype:'Bloom'  },
        ],
        beats: [
            beat('haggle_1', [
                ['CHAR_A', "Ten gold for the bottle. Cures whatever ails you. Probably."],
                ['CHAR_B', "Ten gold could cure a famine. We'll give you two."],
                ['CHAR_C', "I'll throw in a song. My songs are worth at least one gold each."],
            ], { function:'conflict', emotion:'arch', tension:3 }),
            beat('haggle_2', [
                ['CHAR_A', "Three gold. And the song. Final offer. Don't push me."],
                ['CHAR_B', "Done."],
                ['CHAR_C', "Excellent. I'll start with the long one."],
            ], { function:'resolution', emotion:'wry', tension:2 }),
        ],
    },

    // 7. Office Standoff ──
    {
        id:   'sim_office_standoff',
        name: 'Office Standoff',
        tags: ['office','dystopian','tension','corporate'],
        description: 'Three colleagues in a windowless conference room. Someone is about to be fired.',
        envId:   'env_dystopian_call_centre',
        musicId: 'frantic_pursuit',
        cast: [
            { slot:'CHAR_A', charId:'char_commander_vasquez',  archetype:'Edge'   },
            { slot:'CHAR_B', charId:'char_tech_bro_tyler',     archetype:'Glitch' },
            { slot:'CHAR_C', charId:'char_news_anchor_nkechi', archetype:'Anchor' },
        ],
        beats: [
            beat('office_1', [
                ['CHAR_A', "The numbers are not the numbers we agreed on."],
                ['CHAR_B', "The numbers are the numbers I gave you. They're correct."],
                ['CHAR_C', "Both of you stop. Walk me through it from the top."],
            ], { function:'conflict', emotion:'cold', tension:6 }),
            beat('office_2', [
                ['CHAR_A', "If they're correct, someone else is wrong. And we have to name them by Friday."],
                ['CHAR_C', "Friday. Not today. Today we just understand the problem."],
            ], { function:'plan', emotion:'measured', tension:5 }),
        ],
    },

    // 8. Karaoke Heartbreak ──
    {
        id:   'sim_karaoke_heartbreak',
        name: 'Karaoke Heartbreak',
        tags: ['urban','melancholy','confession','late-night'],
        description: 'Three regulars at a haunted karaoke bar. Someone\'s about to sing the wrong song on purpose.',
        envId:   'env_haunted_karaoke_bar',
        musicId: 'distant_memory',
        cast: [
            { slot:'CHAR_A', charId:'char_soap_star_sandra',   archetype:'Bloom'  },
            { slot:'CHAR_B', charId:'char_streamerking',       archetype:'Edge'   },
            { slot:'CHAR_C', charId:'char_chef_ramona',        archetype:'Anchor' },
        ],
        beats: [
            beat('karaoke_1', [
                ['CHAR_A', "I'm going to sing it. The one you said not to."],
                ['CHAR_C', "Don't. He's not even here."],
                ['CHAR_B', "Maybe that's the point."],
            ], { function:'reveal', emotion:'ache', tension:5 }),
            beat('karaoke_2', [
                ['CHAR_A', "Three minutes. Three minutes and then I never have to sing it again."],
                ['CHAR_C', "Okay. We'll be right here."],
            ], { function:'support', emotion:'tender', tension:4 }),
        ],
    },

];

// ── Build asset JSON ──────────────────────────────────────────────
function buildAsset(t) {
    return {
        id:   t.id,
        type: 'simulation',
        name: t.name,
        tags: t.tags,
        meta: {
            origin:   'template',
            created:  NOW,
            modified: NOW,
            version:  2,
        },
        payload: {
            description: t.description,
            format:      'simulation_state',
            state: {
                envId:    t.envId,
                musicId:  t.musicId,
                storyId:  null,
                cast:     t.cast,
                beats:    t.beats,
                cameraStyle: 'speaker_cuts',
                postFx:      'none',
            },
        },
    };
}

// ── Write files + manifest ────────────────────────────────────────
const folder = 'curated';
const folderDir = path.join(BASE, folder);
fs.mkdirSync(folderDir, { recursive: true });

const written = [];
for (const t of TEMPLATES) {
    const filename = `${t.id}.json`;
    fs.writeFileSync(
        path.join(folderDir, filename),
        JSON.stringify(buildAsset(t), null, 2) + '\n',
    );
    written.push(filename);
}

// Update the manifest. Keep `defaults` (the meta sim) and add/update curated.
const manifestPath = path.join(BASE, 'manifest.json');
let manifest = { categories: {} };
try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { /* fresh */ }
manifest.categories ||= {};
manifest.categories.curated = {
    name:   'Curated',
    count:  written.length,
    files:  written,
    folder,
};
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

console.log(`Wrote ${written.length} curated sim templates to ${folder}/.`);
for (const f of written) console.log(`  ${f}`);
