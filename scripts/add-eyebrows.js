#!/usr/bin/env node
/**
 * Batch-update stock character JSON files with eyebrow styles.
 * Run: node scripts/add-eyebrows.js
 */

const fs = require('fs');
const path = require('path');
const glob = require('child_process')
  .execSync('find public/holodeck/global_assets/characters -name "char_*.json" -not -path "*/custom/*"')
  .toString().trim().split('\n');

// Map character IDs to eyebrow styles
// Styles: none, thin, natural, thick, bushy, arched, angry, flat
const DATA = {
  // ═══ CREATURES ═══
  char_asterion:         'bushy',
  char_blobsworth:       'none',     // slime - no brows
  char_bones_mcgee:      'none',     // skeleton
  char_coral_the_merfolk: 'arched',
  char_count_drakul:     'arched',
  char_elder_troll:      'bushy',
  char_ember_dragonkin:  'angry',
  char_grasha_the_orc:   'thick',
  char_gronk_the_goblin: 'thin',
  char_infernal_damien:  'arched',
  char_iron_golem:       'none',     // golem - no brows
  char_luna_fang:        'natural',
  char_oakbeard:         'bushy',
  char_phantom_wraith:   'none',     // ghost
  char_phoenix_ember:    'arched',
  char_pixie_dust:       'thin',
  char_seraph:           'arched',
  char_shadow_whisper:   'none',     // shadow
  char_shambler:         'none',     // zombie
  char_thunderhoof:      'thick',

  // ═══ FANTASY ═══
  char_brother_cedric:        'natural',
  char_captain_blacktide:     'bushy',
  char_faye_windrunner:       'arched',
  char_gandara_the_wise:      'bushy',
  char_grimjaw_the_barbarian: 'angry',
  char_grogg_the_ogre:        'thick',
  char_lady_ironheart:        'natural',
  char_luna_starweaver:       'arched',
  char_morgana_hexweaver:     'arched',
  char_nyx_shadowstep:        'thin',
  char_paladin_auric:         'thick',
  char_pip_tinkersprocket:    'natural',
  char_ragnar_wolfblood:      'angry',
  char_seraphina_brightflame: 'arched',
  char_sylvaris:              'thin',
  char_the_necromancer:       'angry',
  char_thorin_stonebreaker:   'bushy',
  char_valkyrie_skald:        'natural',
  char_willow_moonwhisper:    'thin',
  char_zephyr_the_bard:       'natural',

  // ═══ INTERNET ═══
  char_bot_9000:                 'flat',
  char_content_creator_chris:    'natural',
  char_cosplay_queen_keiko:      'arched',
  char_crypto_chad:              'thick',
  char_digital_artist_zuri:      'natural',
  char_e_girl_sakura:            'arched',
  char_gamer_gio:                'natural',
  char_hacker_zero:              'flat',
  char_influencer_aria:          'arched',
  char_meme_lord_dave:           'natural',
  char_moderator_max:            'thick',
  char_podcast_pat:              'natural',
  char_social_media_manager_sal: 'natural',
  char_streamerking:             'thick',
  char_tech_bro_tyler:           'natural',
  char_tiktok_tiana:             'arched',
  char_troll_terrence:           'angry',
  char_virtual_vee:              'arched',
  char_vlogger_valentina:        'natural',

  // ═══ SCI-FI ═══
  char_ai_aria:              'flat',
  char_ambassador_zyloth:    'thin',
  char_asteroid_miner_kofi:  'thick',
  char_bounty_hunter_rex:    'angry',
  char_clone_trooper_delta:  'flat',
  char_commander_vasquez:    'natural',
  char_cyborg_kai:           'flat',
  char_diplomat_chen:        'natural',
  char_dr_elara_quantum:     'natural',
  char_engineer_mei_lin:     'natural',
  char_mech_pilot_yuki:      'natural',
  char_medic_nova:           'natural',
  char_navigator_luna:       'arched',
  char_pilot_jax:            'thick',
  char_quantum_ghost:        'none',
  char_rebel_leader_ash:     'thick',
  char_space_marine_okonkwo: 'thick',
  char_time_agent_sato:      'arched',
  char_unit_7_android:       'flat',
  char_xenobiologist_orin:   'natural',

  // ═══ TELEVISION ═══
  char_captain_cosmos:           'thick',
  char_cartoon_villainess:       'arched',
  char_chef_ramona:              'angry',
  char_crime_boss_carlo:         'bushy',
  char_detective_matsuda:        'natural',
  char_dr_priya_singh:           'natural',
  char_fashion_fatima:           'arched',
  char_forensic_dr_lee:          'natural',
  char_gameshow_gary:            'arched',
  char_judge_fontaine:           'thick',
  char_news_anchor_nkechi:       'natural',
  char_professor_pendleton:      'bushy',
  char_reality_quinn:            'arched',
  char_rod_sterling:             'natural',
  char_sitcom_steve:             'natural',
  char_soap_star_sandra:         'arched',
  char_sports_commentator_rio:   'thick',
  char_survival_sam:             'bushy',
  char_talk_show_tanya:          'arched',
  char_weather_wes:              'natural',
};

let updated = 0;
let skipped = 0;

for (const filePath of glob) {
  if (!filePath) continue;
  const raw = fs.readFileSync(filePath, 'utf8');
  const asset = JSON.parse(raw);
  const browStyle = DATA[asset.id];

  if (browStyle === undefined) {
    console.log(`  SKIP (no mapping): ${asset.id}`);
    skipped++;
    continue;
  }

  if (asset.payload?.state) {
    asset.payload.state.eyebrowStyle = browStyle;
    // Use scalp color as default brow color (natural look)
    if (browStyle !== 'none' && asset.payload.state.scalpColor) {
      asset.payload.state.eyebrowColor = asset.payload.state.scalpColor;
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(asset, null, 2) + '\n');
  updated++;
}

console.log(`\nDone! Updated ${updated} characters, skipped ${skipped}.`);
