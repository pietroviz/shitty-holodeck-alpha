#!/usr/bin/env node
/**
 * Batch-1: 25 over-the-top stock environments across 9 category folders.
 * Rewrites manifest.json to include these + any existing env files already
 * on disk (so orphan legacy envs get re-registered).
 *
 * Run: node scripts/generate-env-batch-1.js
 */

const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..', 'public', 'holodeck', 'global_assets', 'environments');
const NOW  = new Date().toISOString();

// Category folder → user-facing display name
const CATEGORY_LABELS = {
  templates:          'Templates',
  nature:             'Nature & Wild',
  dreamscapes:        'Dreamscapes',
  fantasy:            'Fantasy Realms',
  'sci-fi':           'Sci-Fi Frontiers',
  urban:              'Urban Life',
  'home-interiors':   'Home Interiors',
  'office-interiors': 'Work Spaces',
  'holy-places':      'Sacred Places',
  playful:            'Playful Spaces',
};

// Compact spec → full env JSON. Every field is a knob we actually render.
// State keys: groundColor, stageColor, wallColor, groundSize, walls (height 0..3),
// windowStyle (none|single|double|triple), windowColor, windowOpacity,
// skyTop/Mid/Bot, fxPreset (flat|day|dusk|night),
// sunColor, sunElevation, sunVisible,
// ambientColor, ambientIntensity, dirColor, dirIntensity,
// fogEnabled, fogColor, fogDensity,
// weather (none|snow|rain|leaves),
// orbVisible, orbColor, orbIntensity, orbHeight, orbFlicker.

const BATCH = [

  // ═══ NATURE & WILD (3) ═══
  { folder:'nature', id:'env_kelp_cathedral', name:'Kelp Cathedral',
    tags:['nature','underwater','magical','teal'],
    description:'An impossible emerald-teal cavern of kelp fronds swaying in filtered abyssal light.',
    state:{
      groundColor:'#0a3a46', stageColor:'#14576c', wallColor:'#1d7a8c',
      groundSize:21, walls:2, windowStyle:'none',
      skyTop:'#02232a', skyMid:'#0b5566', skyBot:'#1ea98f',
      fxPreset:'night',
      ambientColor:'#2fd6c8', ambientIntensity:0.9,
      dirColor:'#88fff0', dirIntensity:0.6,
      fogEnabled:true, fogColor:'#0a4858', fogDensity:0.06,
      orbVisible:true, orbColor:'#7cffe8', orbIntensity:1.8, orbHeight:2.6, orbFlicker:true,
    }},
  { folder:'nature', id:'env_lava_cliffs', name:'Lava Cliffs',
    tags:['nature','volcanic','epic','molten'],
    description:'Black obsidian cliffs bleeding veins of molten orange into a choking ash sky.',
    state:{
      groundColor:'#141015', stageColor:'#ff5a1e', wallColor:'#2a1f25',
      groundSize:23, walls:1, windowStyle:'none',
      skyTop:'#1a0a08', skyMid:'#7a2418', skyBot:'#ff8a2e',
      fxPreset:'dusk',
      sunColor:'#ff5020', sunElevation:8, sunVisible:true,
      ambientColor:'#6a2418', ambientIntensity:0.7,
      dirColor:'#ff7a30', dirIntensity:1.3,
      fogEnabled:true, fogColor:'#3a1a12', fogDensity:0.05,
      orbVisible:true, orbColor:'#ff6020', orbIntensity:2.2, orbHeight:2.4, orbFlicker:true,
    }},
  { folder:'nature', id:'env_frost_basin', name:'Frost Basin',
    tags:['nature','ice','winter','pastel'],
    description:'A powder-blue snowbowl under a cotton-candy sunrise with drifting flurries.',
    state:{
      groundColor:'#e8f2ff', stageColor:'#c8d8ee', wallColor:'#a0b4d0',
      groundSize:21, walls:0, windowStyle:'none',
      skyTop:'#7a4a9c', skyMid:'#f0a8cc', skyBot:'#fcdcc0',
      fxPreset:'day',
      sunColor:'#fff0f8', sunElevation:25, sunVisible:true,
      ambientColor:'#d8e4ff', ambientIntensity:1.1,
      dirColor:'#fff4fa', dirIntensity:1.0,
      fogEnabled:true, fogColor:'#e0ecff', fogDensity:0.03,
      weather:'snow',
      orbVisible:false,
    }},

  // ═══ DREAMSCAPES (3) ═══
  { folder:'dreamscapes', id:'env_gravity_well', name:'Gravity Well',
    tags:['dream','surreal','gradient','purple'],
    description:'A floor of violet glass spirals downward into a mint-green event horizon.',
    state:{
      groundColor:'#3a1a5c', stageColor:'#6a30a8', wallColor:'#a860e0',
      groundSize:19, walls:2, windowStyle:'none',
      skyTop:'#1a0530', skyMid:'#7030b8', skyBot:'#8cffc8',
      fxPreset:'night',
      ambientColor:'#9050d8', ambientIntensity:1.0,
      dirColor:'#c0ffe8', dirIntensity:0.6,
      fogEnabled:true, fogColor:'#3a1060', fogDensity:0.04,
      orbVisible:true, orbColor:'#8cffc8', orbIntensity:2.0, orbHeight:2.8, orbFlicker:false,
    }},
  { folder:'dreamscapes', id:'env_pool_of_mirrors', name:'Pool of Mirrors',
    tags:['dream','reflection','silver','mauve'],
    description:'A still silver lagoon reflecting a mauve twilight — no horizon, just echoes.',
    state:{
      groundColor:'#c0b8d0', stageColor:'#e8e4f0', wallColor:'#9890b0',
      groundSize:21, walls:0, windowStyle:'none',
      skyTop:'#3c2860', skyMid:'#8c6ca8', skyBot:'#d8c4e8',
      fxPreset:'dusk',
      sunColor:'#e4d4f0', sunElevation:5, sunVisible:false,
      ambientColor:'#b8a8c8', ambientIntensity:1.0,
      dirColor:'#d8c4e8', dirIntensity:0.7,
      fogEnabled:true, fogColor:'#9080a0', fogDensity:0.04,
      orbVisible:true, orbColor:'#e8d8f4', orbIntensity:1.2, orbHeight:2.2, orbFlicker:false,
    }},
  { folder:'dreamscapes', id:'env_corridor_of_clocks', name:'Corridor of Clocks',
    tags:['dream','surreal','sepia','cyan'],
    description:'An endless sepia hallway ticking under cyan-bulb lamps; time pools on the floor.',
    state:{
      groundColor:'#6a5038', stageColor:'#a88048', wallColor:'#4c3a24',
      groundSize:17, walls:3, windowStyle:'triple', windowColor:'#44eaf0', windowOpacity:0.55,
      skyTop:'#1a1208', skyMid:'#5a3818', skyBot:'#b07838',
      fxPreset:'night',
      ambientColor:'#b88850', ambientIntensity:0.8,
      dirColor:'#44eaf0', dirIntensity:0.7,
      fogEnabled:true, fogColor:'#2a1a08', fogDensity:0.05,
      orbVisible:true, orbColor:'#44eaf0', orbIntensity:1.8, orbHeight:2.4, orbFlicker:true,
    }},

  // ═══ FANTASY REALMS (3) ═══
  { folder:'fantasy', id:'env_dragons_anvil', name:"Dragon's Anvil",
    tags:['fantasy','dragon','forge','obsidian'],
    description:'A black-obsidian forge floor cracked by cinder-red light under a starless ember sky.',
    state:{
      groundColor:'#0e0a0a', stageColor:'#2a0a06', wallColor:'#1a0f0f',
      groundSize:21, walls:3, windowStyle:'single', windowColor:'#ff4820', windowOpacity:0.7,
      skyTop:'#080404', skyMid:'#440a06', skyBot:'#a04020',
      fxPreset:'night',
      ambientColor:'#3c1810', ambientIntensity:0.6,
      dirColor:'#ff5020', dirIntensity:0.9,
      fogEnabled:true, fogColor:'#1a0a06', fogDensity:0.07,
      orbVisible:true, orbColor:'#ff4820', orbIntensity:2.6, orbHeight:2.2, orbFlicker:true,
    }},
  { folder:'fantasy', id:'env_elven_canopy', name:'Elven Canopy',
    tags:['fantasy','elven','forest','gold'],
    description:'An emerald cathedral of trees spangled with golden leaves and dust-shafted light.',
    state:{
      groundColor:'#204018', stageColor:'#c89040', wallColor:'#3a6028',
      groundSize:23, walls:0, windowStyle:'none',
      skyTop:'#102818', skyMid:'#3c7040', skyBot:'#a8d878',
      fxPreset:'day',
      sunColor:'#fff0a0', sunElevation:55, sunVisible:true,
      ambientColor:'#88b060', ambientIntensity:1.1,
      dirColor:'#fff0a0', dirIntensity:1.4,
      fogEnabled:false,
      weather:'leaves',
      orbVisible:true, orbColor:'#ffd868', orbIntensity:1.0, orbHeight:2.6, orbFlicker:false,
    }},
  { folder:'fantasy', id:'env_rift_of_whispers', name:'Rift of Whispers',
    tags:['fantasy','bioluminescent','violet','teal'],
    description:'A mossy chasm floor glowing bioluminescent violet and teal — every rock sings quietly.',
    state:{
      groundColor:'#1a0830', stageColor:'#6020a0', wallColor:'#300a50',
      groundSize:19, walls:2, windowStyle:'double', windowColor:'#20f0c8', windowOpacity:0.7,
      skyTop:'#080418', skyMid:'#2a0840', skyBot:'#7020c8',
      fxPreset:'night',
      ambientColor:'#6820a8', ambientIntensity:0.9,
      dirColor:'#20f0c8', dirIntensity:0.8,
      fogEnabled:true, fogColor:'#180828', fogDensity:0.06,
      orbVisible:true, orbColor:'#20f0c8', orbIntensity:2.4, orbHeight:2.8, orbFlicker:true,
    }},

  // ═══ SCI-FI FRONTIERS (3) ═══
  { folder:'sci-fi', id:'env_neon_docking_bay', name:'Neon Docking Bay',
    tags:['sci-fi','neon','pink','teal'],
    description:'A chrome hangar slathered in hot-pink and arctic-teal holos — boarding in T-minus.',
    state:{
      groundColor:'#18202a', stageColor:'#ff2a88', wallColor:'#283240',
      groundSize:21, walls:3, windowStyle:'triple', windowColor:'#2affe8', windowOpacity:0.8,
      skyTop:'#060812', skyMid:'#281830', skyBot:'#ff2a88',
      fxPreset:'night',
      ambientColor:'#2affe8', ambientIntensity:1.0,
      dirColor:'#ff2a88', dirIntensity:1.2,
      fogEnabled:true, fogColor:'#0a0c18', fogDensity:0.03,
      orbVisible:true, orbColor:'#ff2a88', orbIntensity:2.4, orbHeight:2.8, orbFlicker:false,
    }},
  { folder:'sci-fi', id:'env_deadstar_terminus', name:'Deadstar Terminus',
    tags:['sci-fi','dystopia','rust','void'],
    description:'A rusted-iron platform ringed by a starless black void — the last stop on a decaying line.',
    state:{
      groundColor:'#4a2818', stageColor:'#8c4020', wallColor:'#2a1810',
      groundSize:21, walls:3, windowStyle:'single', windowColor:'#ff8040', windowOpacity:0.35,
      skyTop:'#020204', skyMid:'#0a0608', skyBot:'#1a1008',
      fxPreset:'night',
      ambientColor:'#5a2c14', ambientIntensity:0.5,
      dirColor:'#ff8040', dirIntensity:0.6,
      fogEnabled:true, fogColor:'#080608', fogDensity:0.08,
      orbVisible:true, orbColor:'#ff6020', orbIntensity:1.6, orbHeight:2.4, orbFlicker:true,
    }},
  { folder:'sci-fi', id:'env_hydroponic_dome', name:'Hydroponic Dome',
    tags:['sci-fi','biopod','green','clean'],
    description:'Racks of chlorophyll-bright plantings under arc-white grow lamps — the farm ship lives.',
    state:{
      groundColor:'#f0fff0', stageColor:'#30c848', wallColor:'#e4f4e8',
      groundSize:19, walls:3, windowStyle:'triple', windowColor:'#a8ffb0', windowOpacity:0.55,
      skyTop:'#d8f4dc', skyMid:'#a0e4a8', skyBot:'#f4fff4',
      fxPreset:'day',
      sunColor:'#ffffff', sunElevation:80, sunVisible:false,
      ambientColor:'#ffffff', ambientIntensity:1.4,
      dirColor:'#e8ffe0', dirIntensity:1.2,
      fogEnabled:false,
      orbVisible:false,
    }},

  // ═══ URBAN LIFE (2) ═══
  { folder:'urban', id:'env_night_noodle_lane', name:'Night Noodle Lane',
    tags:['urban','lanterns','rain','crimson'],
    description:'A narrow crimson-lantern alley, rain sizzling off steam carts — chopsticks click.',
    state:{
      groundColor:'#181010', stageColor:'#3a1a1a', wallColor:'#2a1214',
      groundSize:19, walls:3, windowStyle:'double', windowColor:'#ff3040', windowOpacity:0.6,
      skyTop:'#080404', skyMid:'#301014', skyBot:'#601820',
      fxPreset:'night',
      ambientColor:'#441820', ambientIntensity:0.8,
      dirColor:'#ff4050', dirIntensity:0.6,
      fogEnabled:true, fogColor:'#2a1014', fogDensity:0.05,
      weather:'rain',
      orbVisible:true, orbColor:'#ff4050', orbIntensity:2.0, orbHeight:2.6, orbFlicker:true,
    }},
  { folder:'urban', id:'env_sunbleached_plaza', name:'Sunbleached Plaza',
    tags:['urban','plaza','terracotta','dusty'],
    description:'A terracotta square baking under a peach sun, dust motes drifting between arches.',
    state:{
      groundColor:'#d88860', stageColor:'#b46840', wallColor:'#f0c090',
      groundSize:23, walls:2, windowStyle:'triple', windowColor:'#fff0c8', windowOpacity:0.5,
      skyTop:'#c86040', skyMid:'#f0a060', skyBot:'#ffe8b8',
      fxPreset:'day',
      sunColor:'#ffd890', sunElevation:35, sunVisible:true,
      ambientColor:'#f4c090', ambientIntensity:1.1,
      dirColor:'#ffd4a0', dirIntensity:1.3,
      fogEnabled:true, fogColor:'#e0b890', fogDensity:0.015,
      orbVisible:false,
    }},

  // ═══ HOME INTERIORS (3) ═══
  { folder:'home-interiors', id:'env_grandmas_gilded_den', name:"Grandma's Gilded Den",
    tags:['home','vintage','rust','gold'],
    description:'A rust-velvet sitting room dripping with gold trim, doilies, and the smell of butter.',
    state:{
      groundColor:'#7a3828', stageColor:'#c88040', wallColor:'#a04028',
      groundSize:17, walls:3, windowStyle:'double', windowColor:'#ffd880', windowOpacity:0.45,
      skyTop:'#2a1008', skyMid:'#5a2818', skyBot:'#a85024',
      fxPreset:'night',
      ambientColor:'#c06030', ambientIntensity:0.9,
      dirColor:'#ffb860', dirIntensity:0.7,
      fogEnabled:false,
      orbVisible:true, orbColor:'#ffb458', orbIntensity:1.4, orbHeight:2.2, orbFlicker:false,
    }},
  { folder:'home-interiors', id:'env_bathtub_jungle', name:'Bathtub Jungle',
    tags:['home','bathroom','steam','green'],
    description:'A cream-tile bathroom overrun by palm leaves, warm steam fogging the mirror.',
    state:{
      groundColor:'#f4ece0', stageColor:'#e0d4c0', wallColor:'#88b460',
      groundSize:15, walls:3, windowStyle:'single', windowColor:'#a8d4c8', windowOpacity:0.55,
      skyTop:'#c8dcc0', skyMid:'#e4f0d8', skyBot:'#f4faec',
      fxPreset:'flat',
      ambientColor:'#f4ece0', ambientIntensity:1.3,
      dirColor:'#ffffff', dirIntensity:0.5,
      fogEnabled:true, fogColor:'#e8f0e0', fogDensity:0.03,
      orbVisible:false,
    }},
  { folder:'home-interiors', id:'env_attic_of_forgotten_toys', name:'Attic of Forgotten Toys',
    tags:['home','attic','warm','dusty'],
    description:'A honey-lit attic crowded with boxes and stuffed bears, dust suspended in beams.',
    state:{
      groundColor:'#6a4830', stageColor:'#8c5a3a', wallColor:'#b48040',
      groundSize:15, walls:3, windowStyle:'single', windowColor:'#ffc860', windowOpacity:0.6,
      skyTop:'#2a1808', skyMid:'#603808', skyBot:'#c47830',
      fxPreset:'dusk',
      sunColor:'#ffc860', sunElevation:15, sunVisible:true,
      ambientColor:'#8c5830', ambientIntensity:0.9,
      dirColor:'#ffc860', dirIntensity:1.1,
      fogEnabled:true, fogColor:'#4a2810', fogDensity:0.03,
      orbVisible:true, orbColor:'#ffc060', orbIntensity:1.3, orbHeight:2.0, orbFlicker:false,
    }},

  // ═══ WORK SPACES (2) ═══
  { folder:'office-interiors', id:'env_ink_basement', name:'Ink Basement',
    tags:['work','basement','lamp','noir'],
    description:'A mint-green banker-lamp basement stacked with manuscripts, beige walls, one desk.',
    state:{
      groundColor:'#2a2410', stageColor:'#6a5840', wallColor:'#8c7848',
      groundSize:15, walls:3, windowStyle:'none',
      skyTop:'#080c08', skyMid:'#1a2818', skyBot:'#3a5030',
      fxPreset:'night',
      ambientColor:'#40603c', ambientIntensity:0.7,
      dirColor:'#68c46c', dirIntensity:0.5,
      fogEnabled:false,
      orbVisible:true, orbColor:'#68e46c', orbIntensity:1.8, orbHeight:1.6, orbFlicker:false,
    }},
  { folder:'office-interiors', id:'env_potters_clay_hut', name:"Potter's Clay Hut",
    tags:['work','studio','terracotta','dust'],
    description:'A sun-warmed clay studio: wheel and shelves of pots in every shade of red earth.',
    state:{
      groundColor:'#a85830', stageColor:'#884020', wallColor:'#d4906c',
      groundSize:15, walls:3, windowStyle:'double', windowColor:'#ffd8a0', windowOpacity:0.5,
      skyTop:'#6a2010', skyMid:'#c05828', skyBot:'#f0a868',
      fxPreset:'dusk',
      sunColor:'#ffb470', sunElevation:25, sunVisible:true,
      ambientColor:'#c48058', ambientIntensity:1.0,
      dirColor:'#ffc488', dirIntensity:1.1,
      fogEnabled:true, fogColor:'#a86840', fogDensity:0.02,
      orbVisible:false,
    }},

  // ═══ SACRED PLACES (2) ═══
  { folder:'holy-places', id:'env_moon_altar', name:'Moon Altar',
    tags:['sacred','ritual','violet','milky'],
    description:'A circle of milky stones under a violet moon, silver pools glimmering in the ground.',
    state:{
      groundColor:'#d8d0e8', stageColor:'#b0a4c8', wallColor:'#8870a0',
      groundSize:21, walls:1, windowStyle:'none',
      skyTop:'#200840', skyMid:'#503888', skyBot:'#b898d8',
      fxPreset:'night',
      sunColor:'#d8c4ec', sunElevation:60, sunVisible:true,
      ambientColor:'#6848a0', ambientIntensity:0.8,
      dirColor:'#b898e8', dirIntensity:0.6,
      fogEnabled:true, fogColor:'#30184c', fogDensity:0.03,
      orbVisible:true, orbColor:'#d8c4ec', orbIntensity:1.8, orbHeight:2.6, orbFlicker:false,
    }},
  { folder:'holy-places', id:'env_sandstone_labyrinth', name:'Sandstone Labyrinth',
    tags:['sacred','labyrinth','ochre','sun'],
    description:'An ochre maze carved under a blood-red sun — stone corridors hum with heat.',
    state:{
      groundColor:'#c87c38', stageColor:'#a85820', wallColor:'#e0a060',
      groundSize:21, walls:3, windowStyle:'none',
      skyTop:'#501810', skyMid:'#b04420', skyBot:'#f08838',
      fxPreset:'dusk',
      sunColor:'#ff4828', sunElevation:15, sunVisible:true,
      ambientColor:'#c06038', ambientIntensity:1.0,
      dirColor:'#ff7040', dirIntensity:1.2,
      fogEnabled:true, fogColor:'#783018', fogDensity:0.025,
      orbVisible:false,
    }},

  // ═══ PLAYFUL SPACES (4) ═══
  { folder:'playful', id:'env_bowling_arcade', name:'Bowling Arcade',
    tags:['playful','arcade','neon','carpet'],
    description:'A purple-carpet bowling alley pulsing with yellow neon and pinball cackles.',
    state:{
      groundColor:'#3018a8', stageColor:'#a04cff', wallColor:'#281860',
      groundSize:21, walls:3, windowStyle:'double', windowColor:'#ffe020', windowOpacity:0.65,
      skyTop:'#0a0430', skyMid:'#3818a0', skyBot:'#ffe020',
      fxPreset:'night',
      ambientColor:'#6028d4', ambientIntensity:0.9,
      dirColor:'#ffe020', dirIntensity:0.8,
      fogEnabled:true, fogColor:'#180838', fogDensity:0.04,
      orbVisible:true, orbColor:'#ffe020', orbIntensity:2.2, orbHeight:2.8, orbFlicker:true,
    }},
  { folder:'playful', id:'env_pillow_fort_nebula', name:'Pillow Fort Nebula',
    tags:['playful','cozy','pastel','fairy-lights'],
    description:'A marshmallow-pastel blanket fort glimmering with warm fairy lights — forever snug.',
    state:{
      groundColor:'#ffd4e0', stageColor:'#d88cb0', wallColor:'#f8b8d0',
      groundSize:17, walls:3, windowStyle:'triple', windowColor:'#ffe4b0', windowOpacity:0.55,
      skyTop:'#603868', skyMid:'#d080a8', skyBot:'#ffd0dc',
      fxPreset:'dusk',
      ambientColor:'#f4a8c8', ambientIntensity:1.2,
      dirColor:'#ffd8a0', dirIntensity:0.8,
      fogEnabled:false,
      orbVisible:true, orbColor:'#ffd890', orbIntensity:1.6, orbHeight:2.2, orbFlicker:true,
    }},
  { folder:'playful', id:'env_roller_rink_cosmos', name:'Roller Rink Cosmos',
    tags:['playful','disco','rink','cyan-pink'],
    description:'A mirror-ball roller rink: hot-pink and cyan shafts carve a starfield floor.',
    state:{
      groundColor:'#080828', stageColor:'#ff2890', wallColor:'#18184c',
      groundSize:23, walls:3, windowStyle:'triple', windowColor:'#28e4ff', windowOpacity:0.7,
      skyTop:'#040418', skyMid:'#181848', skyBot:'#ff2890',
      fxPreset:'night',
      ambientColor:'#28e4ff', ambientIntensity:0.9,
      dirColor:'#ff2890', dirIntensity:1.0,
      fogEnabled:true, fogColor:'#0a0a28', fogDensity:0.03,
      orbVisible:true, orbColor:'#28e4ff', orbIntensity:2.4, orbHeight:2.8, orbFlicker:true,
    }},
  { folder:'playful', id:'env_carnival_twilight', name:'Carnival Twilight',
    tags:['playful','carnival','amber','cotton-candy'],
    description:'A royal-blue fairground at twilight, gold lamps and candy-pink bunting everywhere.',
    state:{
      groundColor:'#2a2458', stageColor:'#ffb430', wallColor:'#ff6898',
      groundSize:23, walls:2, windowStyle:'double', windowColor:'#ffd860', windowOpacity:0.7,
      skyTop:'#0a0838', skyMid:'#4028a0', skyBot:'#ffac48',
      fxPreset:'dusk',
      sunColor:'#ffa030', sunElevation:10, sunVisible:true,
      ambientColor:'#604090', ambientIntensity:0.9,
      dirColor:'#ffbc58', dirIntensity:1.1,
      fogEnabled:true, fogColor:'#281848', fogDensity:0.02,
      orbVisible:true, orbColor:'#ffc058', orbIntensity:2.0, orbHeight:2.6, orbFlicker:true,
    }},
];

// ── Build file JSON ─────────────────────────────────────────────
function buildAsset(spec) {
  return {
    id: spec.id,
    type: 'environment',
    name: spec.name,
    tags: spec.tags,
    meta: {
      created: NOW,
      modified: NOW,
      origin: 'template',
      version: 1,
    },
    payload: {
      description: spec.description,
      format: 'environment_state',
      state: spec.state,
    },
  };
}

// ── Write files ────────────────────────────────────────────────
for (const spec of BATCH) {
  const catDir = path.join(BASE, spec.folder);
  if (!fs.existsSync(catDir)) fs.mkdirSync(catDir, { recursive: true });
  const filePath = path.join(catDir, `${spec.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(buildAsset(spec), null, 2) + '\n');
}

// ── Rebuild manifest by scanning every category folder ─────────
const categories = {};
const folders = fs.readdirSync(BASE, { withFileTypes: true })
  .filter(e => e.isDirectory())
  .map(e => e.name)
  .sort();

for (const folder of folders) {
  const dir = path.join(BASE, folder);
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .sort();
  if (!files.length) continue;
  const label = CATEGORY_LABELS[folder]
    || folder.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
  categories[folder] = { name: label, count: files.length, files };
}

fs.writeFileSync(
  path.join(BASE, 'manifest.json'),
  JSON.stringify({ categories }, null, 4) + '\n'
);

const total = Object.values(categories).reduce((s, c) => s + c.count, 0);
console.log(`Wrote ${BATCH.length} new batch-1 envs.`);
console.log(`Manifest now lists ${total} envs across ${Object.keys(categories).length} categories:`);
for (const [key, cat] of Object.entries(categories)) {
  console.log(`  ${key.padEnd(20)} ${String(cat.count).padStart(2)}  (${cat.name})`);
}
