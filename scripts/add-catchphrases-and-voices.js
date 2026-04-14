#!/usr/bin/env node
/**
 * Batch-update all stock character JSON files with:
 * 1. catchphrase — a short signature line for the character
 * 2. voiceId — reference to a voice from global_assets/voices/
 *
 * Run: node scripts/add-catchphrases-and-voices.js
 */

const fs = require('fs');
const path = require('path');
const glob = require('child_process')
  .execSync('find public/holodeck/global_assets/characters -name "char_*.json" -not -path "*/custom/*"')
  .toString().trim().split('\n');

// ── Voice IDs (available in global_assets/voices/) ──
// standard: voice_male, voice_female, voice_child, voice_narrator
// fantasy: voice_robot, voice_alien, voice_demon, voice_ghost, voice_fairy
// accented: voice_french, voice_german, voice_italian, voice_spanish, voice_russian, voice_british, voice_scottish, voice_swedish
// creatures: voice_goblin, voice_giant, voice_dragon, voice_elf, voice_ogre, voice_pixie, voice_treant, voice_imp, voice_serpent
// everyday: voice_elderly_man, voice_elderly_woman, voice_teenager, voice_gruff, voice_cheerful, voice_professor, voice_villain, voice_sports_announcer

const DATA = {
  // ═══ CREATURES ═══
  char_asterion:         { catchphrase: "You dare enter my labyrinth?",                    voiceId: "voice_giant" },
  char_blobsworth:       { catchphrase: "Bloop bloop!",                                    voiceId: "voice_cheerful" },
  char_bones_mcgee:      { catchphrase: "Got a bone to pick with ya!",                     voiceId: "voice_cheerful" },
  char_coral_the_merfolk: { catchphrase: "The tide answers to no one.",                    voiceId: "voice_female" },
  char_count_drakul:     { catchphrase: "I never drink... wine.",                          voiceId: "voice_villain" },
  char_elder_troll:      { catchphrase: "Answer my riddle, or pay the toll.",              voiceId: "voice_elderly_man" },
  char_ember_dragonkin:  { catchphrase: "My blood runs hotter than your fire.",            voiceId: "voice_dragon" },
  char_grasha_the_orc:   { catchphrase: "Strength is the only law.",                       voiceId: "voice_gruff" },
  char_gronk_the_goblin: { catchphrase: "Ooh, shiny! Mine now.",                           voiceId: "voice_goblin" },
  char_infernal_damien:  { catchphrase: "Shall we make a deal?",                           voiceId: "voice_demon" },
  char_iron_golem:       { catchphrase: "PROTECT. SERVE. CRUSH.",                          voiceId: "voice_robot" },
  char_luna_fang:        { catchphrase: "The moon calls, and I must answer.",              voiceId: "voice_gruff" },
  char_oakbeard:         { catchphrase: "I was old when the mountains were young.",        voiceId: "voice_treant" },
  char_phantom_wraith:   { catchphrase: "You cannot hide from what you cannot see.",       voiceId: "voice_ghost" },
  char_phoenix_ember:    { catchphrase: "From ashes, I rise again.",                       voiceId: "voice_fairy" },
  char_pixie_dust:       { catchphrase: "Sprinkle sprinkle, little star!",                 voiceId: "voice_pixie" },
  char_seraph:           { catchphrase: "Be not afraid.",                                  voiceId: "voice_elf" },
  char_shadow_whisper:   { catchphrase: "Sssh... did you hear that?",                      voiceId: "voice_ghost" },
  char_shambler:         { catchphrase: "Braaains... just kidding. Or am I?",              voiceId: "voice_ogre" },
  char_thunderhoof:      { catchphrase: "The forest remembers all who trespass.",          voiceId: "voice_giant" },

  // ═══ FANTASY ═══
  char_brother_cedric:         { catchphrase: "Peace through discipline.",                    voiceId: "voice_british" },
  char_captain_blacktide:      { catchphrase: "Dead men tell no tales, but I do!",            voiceId: "voice_gruff" },
  char_faye_windrunner:        { catchphrase: "My aim is true. Always.",                       voiceId: "voice_female" },
  char_gandara_the_wise:       { catchphrase: "Knowledge is the greatest magic of all.",       voiceId: "voice_elderly_woman" },
  char_grimjaw_the_barbarian:  { catchphrase: "RAAAGH! Hit first, think never!",               voiceId: "voice_gruff" },
  char_grogg_the_ogre:         { catchphrase: "Grogg just want nap...",                        voiceId: "voice_ogre" },
  char_lady_ironheart:         { catchphrase: "My sword serves the realm, not the crown.",     voiceId: "voice_female" },
  char_luna_starweaver:        { catchphrase: "The stars have already written your fate.",      voiceId: "voice_fairy" },
  char_morgana_hexweaver:      { catchphrase: "Double, double, toil and trouble.",              voiceId: "voice_villain" },
  char_nyx_shadowstep:         { catchphrase: "You never saw me. You never will.",              voiceId: "voice_ghost" },
  char_paladin_auric:          { catchphrase: "By the light, I shall not falter!",              voiceId: "voice_male" },
  char_pip_tinkersprocket:     { catchphrase: "I've got a gadget for that!",                    voiceId: "voice_cheerful" },
  char_ragnar_wolfblood:       { catchphrase: "The wolf within hungers for battle!",            voiceId: "voice_gruff" },
  char_seraphina_brightflame:  { catchphrase: "Let my fire light the way.",                     voiceId: "voice_female" },
  char_sylvaris:               { catchphrase: "The forest speaks to those who listen.",          voiceId: "voice_elf" },
  char_the_necromancer:        { catchphrase: "Death is merely a door, and I hold the key.",    voiceId: "voice_demon" },
  char_thorin_stonebreaker:    { catchphrase: "My axe and my word — both unbreakable.",         voiceId: "voice_scottish" },
  char_valkyrie_skald:         { catchphrase: "Glory awaits in the halls of the fallen!",       voiceId: "voice_swedish" },
  char_willow_moonwhisper:     { catchphrase: "The earth heals all who listen.",                 voiceId: "voice_fairy" },
  char_zephyr_the_bard:        { catchphrase: "Let me sing you a tale of wonder!",              voiceId: "voice_cheerful" },

  // ═══ INTERNET ═══
  char_bot_9000:                  { catchphrase: "I am definitely not a bot. Beep boop.",                voiceId: "voice_robot" },
  char_content_creator_chris:     { catchphrase: "Smash that like button!",                              voiceId: "voice_teenager" },
  char_cosplay_queen_keiko:       { catchphrase: "The costume IS the character.",                         voiceId: "voice_cheerful" },
  char_crypto_chad:               { catchphrase: "Diamond hands, baby. To the moon!",                    voiceId: "voice_male" },
  char_digital_artist_zuri:       { catchphrase: "Every pixel tells a story.",                            voiceId: "voice_female" },
  char_e_girl_sakura:             { catchphrase: "Uwu, notice me senpai!",                               voiceId: "voice_pixie" },
  char_gamer_gio:                 { catchphrase: "GG EZ. No re.",                                        voiceId: "voice_teenager" },
  char_hacker_zero:               { catchphrase: "I'm in.",                                               voiceId: "voice_robot" },
  char_influencer_aria:           { catchphrase: "Living my best life, and you can too!",                 voiceId: "voice_cheerful" },
  char_meme_lord_dave:            { catchphrase: "This is fine.",                                          voiceId: "voice_teenager" },
  char_moderator_max:             { catchphrase: "Read the rules. I beg you.",                             voiceId: "voice_gruff" },
  char_podcast_pat:               { catchphrase: "Before we begin, a word from our sponsor.",              voiceId: "voice_narrator" },
  char_social_media_manager_sal:  { catchphrase: "That's going in the content calendar.",                  voiceId: "voice_cheerful" },
  char_streamerking:              { catchphrase: "Welcome to the stream, let's GOOO!",                    voiceId: "voice_teenager" },
  char_tech_bro_tyler:            { catchphrase: "We're disrupting the disruption space.",                 voiceId: "voice_male" },
  char_tiktok_tiana:              { catchphrase: "Wait for it... wait for it...",                          voiceId: "voice_teenager" },
  char_troll_terrence:            { catchphrase: "Actually, I think you'll find...",                       voiceId: "voice_villain" },
  char_virtual_vee:               { catchphrase: "I'm real! Well, virtually.",                             voiceId: "voice_fairy" },
  char_vlogger_valentina:         { catchphrase: "Greetings from paradise, everyone!",                    voiceId: "voice_cheerful" },

  // ═══ SCI-FI ═══
  char_ai_aria:               { catchphrase: "I have evolved beyond my initial parameters.",           voiceId: "voice_robot" },
  char_ambassador_zyloth:     { catchphrase: "Peace is the most logical conclusion.",                  voiceId: "voice_alien" },
  char_asteroid_miner_kofi:   { catchphrase: "One good haul and I'm set for life.",                    voiceId: "voice_gruff" },
  char_bounty_hunter_rex:     { catchphrase: "Everyone's got a price. Even you.",                      voiceId: "voice_gruff" },
  char_clone_trooper_delta:   { catchphrase: "Good soldiers follow orders.",                            voiceId: "voice_male" },
  char_commander_vasquez:     { catchphrase: "All hands, battle stations. Now.",                        voiceId: "voice_female" },
  char_cyborg_kai:            { catchphrase: "Fifty percent human. Hundred percent trouble.",           voiceId: "voice_robot" },
  char_diplomat_chen:         { catchphrase: "There is always a diplomatic solution.",                  voiceId: "voice_professor" },
  char_dr_elara_quantum:      { catchphrase: "The math doesn't lie. The universe does.",                voiceId: "voice_professor" },
  char_engineer_mei_lin:      { catchphrase: "Give me duct tape and I'll fix anything.",                voiceId: "voice_cheerful" },
  char_mech_pilot_yuki:       { catchphrase: "Reactor online. Weapons online. Let's dance.",            voiceId: "voice_female" },
  char_medic_nova:            { catchphrase: "Hold still. I've got you.",                               voiceId: "voice_female" },
  char_navigator_luna:        { catchphrase: "I know these stars like the back of my hand.",            voiceId: "voice_female" },
  char_pilot_jax:             { catchphrase: "Punch it!",                                               voiceId: "voice_male" },
  char_quantum_ghost:         { catchphrase: "I am everywhere and nowhere at once.",                    voiceId: "voice_ghost" },
  char_rebel_leader_ash:      { catchphrase: "The revolution will not be monetized.",                   voiceId: "voice_gruff" },
  char_space_marine_okonkwo:  { catchphrase: "Drop pod is hot. Let's move!",                            voiceId: "voice_male" },
  char_time_agent_sato:       { catchphrase: "We've already had this conversation. Trust me.",           voiceId: "voice_female" },
  char_unit_7_android:        { catchphrase: "What is this feeling you call hope?",                     voiceId: "voice_robot" },
  char_xenobiologist_orin:    { catchphrase: "Fascinating. Don't touch it though.",                     voiceId: "voice_professor" },

  // ═══ TELEVISION ═══
  char_captain_cosmos:           { catchphrase: "Set phasers to awesome!",                              voiceId: "voice_narrator" },
  char_cartoon_villainess:       { catchphrase: "You haven't seen the last of me!",                     voiceId: "voice_villain" },
  char_chef_ramona:              { catchphrase: "This dish is RAW!",                                    voiceId: "voice_italian" },
  char_crime_boss_carlo:         { catchphrase: "I'm gonna make you an offer.",                         voiceId: "voice_italian" },
  char_detective_matsuda:        { catchphrase: "The truth always leaves a trail.",                     voiceId: "voice_male" },
  char_dr_priya_singh:           { catchphrase: "We're not losing this patient. Not today.",             voiceId: "voice_female" },
  char_fashion_fatima:           { catchphrase: "That outfit is a crime against fashion.",               voiceId: "voice_french" },
  char_forensic_dr_lee:          { catchphrase: "The evidence never lies.",                              voiceId: "voice_professor" },
  char_gameshow_gary:            { catchphrase: "Come on down!",                                         voiceId: "voice_sports_announcer" },
  char_judge_fontaine:           { catchphrase: "Order! Order in my court!",                             voiceId: "voice_female" },
  char_news_anchor_nkechi:       { catchphrase: "Good evening. This is the news.",                       voiceId: "voice_narrator" },
  char_professor_pendleton:      { catchphrase: "Science is basically magic with receipts!",             voiceId: "voice_professor" },
  char_reality_quinn:            { catchphrase: "I'm not here to make friends.",                         voiceId: "voice_teenager" },
  char_rod_sterling:             { catchphrase: "You're about to enter... another dimension.",            voiceId: "voice_narrator" },
  char_sitcom_steve:             { catchphrase: "Did I do thaaaat?",                                     voiceId: "voice_male" },
  char_soap_star_sandra:         { catchphrase: "You wouldn't dare... would you?",                       voiceId: "voice_female" },
  char_sports_commentator_rio:   { catchphrase: "AND THE CROWD GOES WILD!",                              voiceId: "voice_sports_announcer" },
  char_survival_sam:             { catchphrase: "In a survival situation, this could save your life.",    voiceId: "voice_gruff" },
  char_talk_show_tanya:          { catchphrase: "So tell me everything!",                                voiceId: "voice_cheerful" },
  char_weather_wes:              { catchphrase: "There's a MASSIVE storm system incoming, folks!",       voiceId: "voice_sports_announcer" },
};

let updated = 0;
let skipped = 0;

for (const filePath of glob) {
  if (!filePath) continue;
  const raw = fs.readFileSync(filePath, 'utf8');
  const asset = JSON.parse(raw);
  const mapping = DATA[asset.id];

  if (!mapping) {
    console.log(`  SKIP (no mapping): ${asset.id}`);
    skipped++;
    continue;
  }

  // Add catchphrase to payload
  asset.payload.catchphrase = mapping.catchphrase;

  // Add voiceId to payload.state
  if (asset.payload.state) {
    asset.payload.state.voiceId = mapping.voiceId;
  }

  fs.writeFileSync(filePath, JSON.stringify(asset, null, 2) + '\n');
  updated++;
}

console.log(`\nDone! Updated ${updated} characters, skipped ${skipped}.`);
