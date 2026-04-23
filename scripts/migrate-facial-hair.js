#!/usr/bin/env node
// One-shot: migrate stock character facialHairStyle from legacy prop_* IDs
// to the new 2D styles, with some variety swaps to showcase the new options.

const fs   = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', 'public', 'holodeck', 'global_assets', 'characters');

// Per-character mapping. Legacy id is listed for the record; the new style
// is what ends up in the file.
const MAP = {
    // Fantasy
    'char_grimjaw_the_barbarian.json': 'viking_beard',  // was prop_full_beard
    'char_brother_cedric.json':        'chin_curtain',  // was prop_goatee
    'char_thorin_stonebreaker.json':   'long_beard',    // was prop_long_beard
    'char_paladin_auric.json':         'goatee',        // was prop_goatee
    'char_grogg_the_ogre.json':        'soul_patch',    // was prop_soul_patch
    'char_ragnar_wolfblood.json':      'viking_beard',  // was prop_full_beard
    'char_zephyr_the_bard.json':       'pencil',        // was prop_soul_patch
    'char_captain_blacktide.json':     'handlebar',     // was prop_mustache

    // Creatures
    'char_luna_fang.json':             'full_beard',    // was prop_full_beard
    'char_thunderhoof.json':           'full_beard',    // was prop_full_beard
    'char_grasha_the_orc.json':        'soul_patch',    // was prop_soul_patch
    'char_elder_troll.json':           'long_beard',    // was prop_long_beard
    'char_oakbeard.json':              'viking_beard',  // was prop_long_beard — name = epic beard
    'char_infernal_damien.json':       'goatee',        // was prop_goatee
    'char_count_drakul.json':          'pencil',        // was prop_goatee — Dracula thin 'stache

    // Internet
    'char_moderator_max.json':         'chevron',       // was prop_mustache
    'char_content_creator_chris.json': 'soul_patch',    // was prop_soul_patch
    'char_tech_bro_tyler.json':        'soul_patch',    // was prop_soul_patch
    'char_troll_terrence.json':        'full_beard',    // was prop_full_beard
    'char_podcast_pat.json':           'full_beard',    // was prop_full_beard
    'char_crypto_chad.json':           'goatee',        // was prop_goatee

    // Sci-fi
    'char_rebel_leader_ash.json':      'goatee',        // was prop_goatee
    'char_asteroid_miner_kofi.json':   'walrus',        // was prop_mustache — rough miner
    'char_bounty_hunter_rex.json':     'goatee',        // was prop_goatee
    'char_xenobiologist_orin.json':    'full_beard',    // was prop_full_beard
    'char_diplomat_chen.json':         'pencil',        // was prop_mustache — refined

    // Television
    'char_captain_cosmos.json':        'goatee',        // was prop_goatee
    'char_rod_sterling.json':          'pencil',        // was prop_mustache — classic mid-century
    'char_professor_pendleton.json':   'walrus',        // was prop_mustache — professor trope
    'char_survival_sam.json':          'full_beard',    // was prop_full_beard
    'char_sitcom_steve.json':          'chevron',       // was prop_mustache — dad 'stache
    'char_crime_boss_carlo.json':      'goatee',        // was prop_goatee
    'char_gameshow_gary.json':         'pencil',        // was prop_soul_patch — showbiz
    'char_detective_matsuda.json':     'goatee',        // was prop_goatee
};

function walk(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full));
        else if (entry.name.endsWith('.json')) out.push(full);
    }
    return out;
}

const files = walk(ROOT);
let updated = 0, skipped = 0, missing = [];

for (const full of files) {
    const name = path.basename(full);
    const want = MAP[name];
    if (!want) continue;

    const raw = fs.readFileSync(full, 'utf8');
    const data = JSON.parse(raw);
    const props = data.payload?.state;
    if (!props || !('facialHairStyle' in props)) {
        missing.push(name);
        continue;
    }
    const before = props.facialHairStyle;
    if (before === want) { skipped++; continue; }
    props.facialHairStyle = want;

    // Preserve trailing newline + exact 2-space indent to match existing files.
    const endNL = raw.endsWith('\n') ? '\n' : '';
    fs.writeFileSync(full, JSON.stringify(data, null, 2) + endNL);
    console.log(`${name}: ${before} -> ${want}`);
    updated++;
}

for (const name of Object.keys(MAP)) {
    if (!files.some(f => path.basename(f) === name)) {
        console.warn(`WARN: ${name} in MAP but not found on disk`);
    }
}

console.log(`\n${updated} updated, ${skipped} already current, ${missing.length} missing facialHairStyle field.`);
if (missing.length) console.log('Missing:', missing);
