#!/usr/bin/env node
/**
 * Batch-2: dress the 23 legacy stock environments (first-generation seeds
 * that pre-date batch-1). Mirrors the batch-1 spec shape exactly — state +
 * props (PROP_A..PROP_E) + groundObjects — using themed assets from the
 * existing object library. Skips env_default (intentionally blank template).
 *
 * Run: node scripts/generate-env-batch-2.js
 */

const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..', 'public', 'holodeck', 'global_assets', 'environments');
const NOW  = new Date().toISOString();

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

// Shared emitter — handles cell-coord schema (BINGO → {x,y,z}) and
// scale-class detection from the env's name/tags.
const { emitEnv } = require('./lib/env-emit.js');

const BATCH = [

  // ═══ DREAMSCAPES (3) ═══
  { folder:'dreamscapes', id:'env_cloud_palace', name:'Cloud Palace',
    tags:['dreamscape','clouds','ethereal','white'],
    description:'A palace of columns and fountains floating in a lavender sea of clouds.',
    state:{
      groundColor:'#d4d0ea', stageColor:'#efeaff', wallColor:'#b8b0dc',
      groundSize:21, walls:2, windowStyle:'double', windowColor:'#e8e0ff', windowOpacity:0.55,
      skyTop:'#c8bcdc', skyMid:'#e4d4ec', skyBot:'#ffffff',
      fxPreset:'dawn',
      sunColor:'#ffe8fa', sunElevation:65, sunVisible:true,
      ambientColor:'#e0d4f0', ambientIntensity:1.3,
      dirColor:'#ffffff', dirIntensity:0.7,
      fogEnabled:true, fogColor:'#e4d8ec', fogDensity:0.03,
      orbVisible:true, orbColor:'#fff4ff', orbIntensity:1.5, orbHeight:2.8, orbFlicker:false,
    },
    props:[
      { id:'prop_fountain', cell:'N3', scale:1.2 },
      { id:'prop_column', cell:'B1', scale:1.1 },
      { id:'prop_column', cell:'O1', scale:1.1 },
      { id:'prop_column', cell:'B5', scale:1.1 },
      { id:'prop_column', cell:'O5', scale:1.1 },
    ],
    ground:[
      { id:'prop_cloud_batch', mode:'scatter', density:'high' },
      { id:'prop_column', mode:'scatter', density:'low' },
    ]},

  { folder:'dreamscapes', id:'env_infinite_library', name:'Infinite Library',
    tags:['dreamscape','library','warm','wood'],
    description:'Endless bookshelves of dark wood lit by pools of amber lamplight.',
    state:{
      groundColor:'#3a2a1e', stageColor:'#5a3e24', wallColor:'#4a3222',
      groundSize:19, walls:3, windowStyle:'none',
      skyTop:'#120a06', skyMid:'#2a1a0e', skyBot:'#6a4a26',
      fxPreset:'dusk',
      ambientColor:'#8a6030', ambientIntensity:0.7,
      dirColor:'#ffb858', dirIntensity:0.5,
      fogEnabled:true, fogColor:'#3a2010', fogDensity:0.04,
      orbVisible:true, orbColor:'#ffb060', orbIntensity:1.8, orbHeight:2.4, orbFlicker:true,
    },
    props:[
      { id:'prop_bookshelf_batch', cell:'N1', scale:1.2 },
      { id:'prop_table_batch', cell:'N3', scale:1.0 },
      { id:'prop_chair_batch', cell:'I3', scale:1.0 },
      { id:'prop_floorlamp_batch', cell:'B1', scale:1.0 },
      { id:'prop_floorlamp_batch', cell:'O1', scale:1.0 },
    ],
    ground:[
      { id:'prop_bookshelf_batch', mode:'tile', density:'med' },
      { id:'prop_pictureframe_batch', mode:'scatter', density:'low' },
    ]},

  { folder:'dreamscapes', id:'env_mirror_lake', name:'Mirror Lake',
    tags:['dreamscape','water','still','silver'],
    description:'A perfectly still silver lake reflecting a pale dawn sky.',
    state:{
      groundColor:'#6a94a8', stageColor:'#a8c4d2', wallColor:'#5a8090',
      groundSize:23, walls:0, windowStyle:'none',
      skyTop:'#b8c8d4', skyMid:'#d4e0e8', skyBot:'#e8eef2',
      fxPreset:'dawn',
      sunColor:'#fff8e8', sunElevation:15, sunVisible:true,
      ambientColor:'#c0d0dc', ambientIntensity:1.1,
      dirColor:'#ffe8d0', dirIntensity:0.8,
      fogEnabled:true, fogColor:'#c8d4dc', fogDensity:0.04,
      orbVisible:false,
    },
    props:[
      { id:'prop_stone_statue', cell:'N1', scale:1.3 },
      { id:'prop_pond_batch', cell:'N3', scale:1.0 },
      { id:'prop_rock_large_batch', cell:'B5', scale:1.0 },
      { id:'prop_rock_large_batch', cell:'O5', scale:1.0 },
    ],
    ground:[
      { id:'prop_rock_small_batch', mode:'scatter', density:'med' },
      { id:'prop_pond_batch', mode:'scatter', density:'low' },
      { id:'prop_flower_batch', mode:'scatter', density:'med' },
    ]},

  // ═══ FANTASY (3) ═══
  { folder:'fantasy', id:'env_dragon_lair', name:"Dragon's Lair",
    tags:['fantasy','cave','dark','treasure'],
    description:'A smouldering black cavern piled with gold, bones, and guttering torches.',
    state:{
      groundColor:'#1a0c0c', stageColor:'#3a1a12', wallColor:'#2a1410',
      groundSize:19, walls:3, windowStyle:'none',
      skyTop:'#0a0404', skyMid:'#1a0a06', skyBot:'#5a2010',
      fxPreset:'night',
      ambientColor:'#5a1a08', ambientIntensity:0.5,
      dirColor:'#ff6020', dirIntensity:0.4,
      fogEnabled:true, fogColor:'#1a0806', fogDensity:0.07,
      orbVisible:true, orbColor:'#ff8030', orbIntensity:2.2, orbHeight:2.4, orbFlicker:true,
    },
    props:[
      { id:'prop_treasure_chest_batch', cell:'N3', scale:1.2 },
      { id:'prop_skull_batch', cell:'B2', scale:1.0 },
      { id:'prop_gravestone_batch', cell:'O2', scale:1.0 },
      { id:'prop_torch_batch', cell:'B5', scale:1.1 },
      { id:'prop_torch_batch', cell:'O5', scale:1.1 },
    ],
    ground:[
      { id:'prop_rock_large_batch', mode:'scatter', density:'high' },
      { id:'prop_skull_batch', mode:'scatter', density:'low' },
    ]},

  { folder:'fantasy', id:'env_enchanted_grove', name:'Enchanted Grove',
    tags:['fantasy','forest','magical','green'],
    description:'A moonlit grove where glowing mushrooms and spirit orbs hover between ancient oaks.',
    state:{
      groundColor:'#1a3a22', stageColor:'#2a5030', wallColor:'#1a2a1e',
      groundSize:23, walls:0, windowStyle:'none',
      skyTop:'#0a1a28', skyMid:'#1a3a4a', skyBot:'#3a6a5a',
      fxPreset:'night',
      ambientColor:'#4a8a7a', ambientIntensity:0.9,
      dirColor:'#a0f8c0', dirIntensity:0.6,
      fogEnabled:true, fogColor:'#1a3a2e', fogDensity:0.05,
      orbVisible:true, orbColor:'#a0ffd0', orbIntensity:1.9, orbHeight:2.5, orbFlicker:true,
    },
    props:[
      { id:'prop_magic_portal_batch', cell:'N1', scale:1.2 },
      { id:'prop_magic_mushroom_batch', cell:'B3', scale:1.1 },
      { id:'prop_magic_mushroom_batch', cell:'O3', scale:1.1 },
      { id:'prop_magic_orb_batch', cell:'N3', scale:1.0 },
      { id:'prop_totem_pole_batch', cell:'B5', scale:1.0 },
    ],
    ground:[
      { id:'prop_oak_tree_batch', mode:'scatter', density:'med' },
      { id:'prop_mushroom_batch', mode:'scatter', density:'high' },
      { id:'prop_flower_batch', mode:'scatter', density:'med' },
    ]},

  { folder:'fantasy', id:'env_floating_islands', name:'Floating Islands',
    tags:['fantasy','sky','crystal','ruins'],
    description:'Shards of emerald rock adrift in a pastel sky, connected by rainbow bridges.',
    state:{
      groundColor:'#3a7a58', stageColor:'#5a9a78', wallColor:'#4a8a68',
      groundSize:21, walls:0, windowStyle:'none',
      skyTop:'#bce0f0', skyMid:'#d8ecf6', skyBot:'#ffdcf0',
      fxPreset:'dawn',
      sunColor:'#fff4e8', sunElevation:55, sunVisible:true,
      ambientColor:'#d0e8f0', ambientIntensity:1.2,
      dirColor:'#ffffff', dirIntensity:0.9,
      fogEnabled:true, fogColor:'#d4e4ec', fogDensity:0.02,
      orbVisible:false,
    },
    props:[
      { id:'prop_rainbow_arch', cell:'N3', scale:1.3 },
      { id:'prop_ruins', cell:'N1', scale:1.1 },
      { id:'prop_crystal_cluster_batch', cell:'B2', scale:1.2 },
      { id:'prop_crystal_cluster_batch', cell:'O2', scale:1.2 },
    ],
    ground:[
      { id:'prop_cloud_batch', mode:'scatter', density:'high' },
      { id:'prop_rock_large_batch', mode:'scatter', density:'low' },
    ]},

  // ═══ HOLY PLACES (2) ═══
  { folder:'holy-places', id:'env_ancient_temple', name:'Ancient Temple',
    tags:['holy','temple','stone','sand'],
    description:'Weathered sandstone columns and silent stone heads under a brass-coloured sky.',
    state:{
      groundColor:'#9a7a4e', stageColor:'#c8a068', wallColor:'#a88868',
      groundSize:21, walls:3, windowStyle:'triple', windowColor:'#ffd898', windowOpacity:0.4,
      skyTop:'#dcb86a', skyMid:'#f0d490', skyBot:'#ffe8b0',
      fxPreset:'dusk',
      sunColor:'#ffb860', sunElevation:22, sunVisible:true,
      ambientColor:'#e0b870', ambientIntensity:1.0,
      dirColor:'#ffd080', dirIntensity:1.1,
      fogEnabled:true, fogColor:'#c8a068', fogDensity:0.03,
      orbVisible:false,
    },
    props:[
      { id:'prop_obelisk', cell:'N3', scale:1.2 },
      { id:'prop_column', cell:'B2', scale:1.0 },
      { id:'prop_column', cell:'O2', scale:1.0 },
      { id:'prop_stone_head', cell:'B5', scale:1.0 },
      { id:'prop_stone_head', cell:'O5', scale:1.0 },
    ],
    ground:[
      { id:'prop_ruins', mode:'scatter', density:'med' },
      { id:'prop_column', mode:'scatter', density:'low' },
      { id:'prop_rock_large_batch', mode:'scatter', density:'med' },
    ]},

  { folder:'holy-places', id:'env_zen_garden', name:'Zen Garden',
    tags:['holy','garden','minimal','grey'],
    description:'Raked grey gravel, moss stones, and a single shrine under a soft pale sky.',
    state:{
      groundColor:'#c8c4b8', stageColor:'#e0dcd0', wallColor:'#8a8678',
      groundSize:19, walls:1, windowStyle:'none',
      skyTop:'#d4d8dc', skyMid:'#e8ecf0', skyBot:'#f4f4ec',
      fxPreset:'dawn',
      ambientColor:'#e0ddd5', ambientIntensity:1.2,
      dirColor:'#fff4e0', dirIntensity:0.8,
      fogEnabled:false,
      orbVisible:false,
    },
    props:[
      { id:'prop_shrine', cell:'N1', scale:1.1 },
      { id:'prop_pond_batch', cell:'N3', scale:1.0 },
      { id:'prop_stone_statue', cell:'B5', scale:0.9 },
      { id:'prop_pottedplant_batch', cell:'O5', scale:0.9 },
    ],
    ground:[
      { id:'prop_rock_small_batch', mode:'scatter', density:'high' },
      { id:'prop_grass_patch_batch', mode:'scatter', density:'med' },
      { id:'prop_bush_batch', mode:'scatter', density:'low' },
    ]},

  // ═══ HOME INTERIORS (2) ═══
  { folder:'home-interiors', id:'env_cozy_living_room', name:'Cozy Living Room',
    tags:['home','cozy','warm','living-room'],
    description:'A warm-wood living room with a deep sofa, amber lamps, and scattered cushions.',
    state:{
      groundColor:'#5a3a24', stageColor:'#a47858', wallColor:'#c8a078',
      groundSize:17, walls:3, windowStyle:'double', windowColor:'#ffd890', windowOpacity:0.5,
      skyTop:'#2a1810', skyMid:'#5a3a24', skyBot:'#a06848',
      fxPreset:'dusk',
      ambientColor:'#d4a878', ambientIntensity:1.1,
      dirColor:'#ffc888', dirIntensity:0.8,
      fogEnabled:false,
      orbVisible:true, orbColor:'#ffb060', orbIntensity:1.4, orbHeight:2.2, orbFlicker:false,
    },
    props:[
      { id:'prop_sofa_batch', cell:'N2', scale:1.0 },
      { id:'prop_table_batch', cell:'N4', scale:0.9 },
      { id:'prop_rug_batch', cell:'N3', scale:1.2 },
      { id:'prop_floorlamp_batch', cell:'B2', scale:1.0 },
      { id:'prop_pictureframe_batch', cell:'O2', scale:1.0 },
    ],
    ground:[
      { id:'prop_pottedplant_batch', mode:'scatter', density:'low' },
      { id:'prop_chair_batch', mode:'scatter', density:'low' },
    ]},

  { folder:'home-interiors', id:'env_modern_kitchen', name:'Modern Kitchen',
    tags:['home','kitchen','clean','white'],
    description:'Crisp white cabinetry, chrome accents, and a single potted herb on a sunlit counter.',
    state:{
      groundColor:'#dcdcd8', stageColor:'#f0f0ec', wallColor:'#e8e8e4',
      groundSize:17, walls:3, windowStyle:'triple', windowColor:'#d4e8f4', windowOpacity:0.35,
      skyTop:'#c8d8e4', skyMid:'#e0eaf0', skyBot:'#f4f6f8',
      fxPreset:'dawn',
      ambientColor:'#f0f4f8', ambientIntensity:1.3,
      dirColor:'#ffffff', dirIntensity:1.0,
      fogEnabled:false,
      orbVisible:false,
    },
    props:[
      { id:'prop_chestdrawers_batch', cell:'N1', scale:1.0 },
      { id:'prop_table_batch', cell:'N3', scale:1.0 },
      { id:'prop_chair_batch', cell:'I3', scale:0.9 },
      { id:'prop_chair_batch', cell:'G3', scale:0.9 },
      { id:'prop_pottedplant_batch', cell:'B1', scale:0.8 },
    ],
    ground:[
      { id:'prop_chair_batch', mode:'scatter', density:'low' },
      { id:'prop_pottedplant_batch', mode:'scatter', density:'low' },
    ]},

  // ═══ NATURE (4) ═══
  { folder:'nature', id:'env_desert_dunes', name:'Desert Dunes',
    tags:['nature','desert','sand','hot'],
    description:'Rolling golden dunes under a bleached sky, cacti tracing long sharp shadows.',
    state:{
      groundColor:'#d4a864', stageColor:'#e8c080', wallColor:'#b88848',
      groundSize:23, walls:0, windowStyle:'none',
      skyTop:'#f4d898', skyMid:'#f8e4b0', skyBot:'#ffedcc',
      fxPreset:'day',
      sunColor:'#fff4d0', sunElevation:55, sunVisible:true,
      ambientColor:'#f0d890', ambientIntensity:1.2,
      dirColor:'#fff0c8', dirIntensity:1.4,
      fogEnabled:true, fogColor:'#e8d098', fogDensity:0.02,
      orbVisible:false,
    },
    props:[
      { id:'prop_tall_cactus', cell:'N3', scale:1.3 },
      { id:'prop_tent', cell:'B1', scale:1.0 },
      { id:'prop_boulder', cell:'O1', scale:1.1 },
      { id:'prop_dead_tree', cell:'B5', scale:1.0 },
    ],
    ground:[
      { id:'prop_cactus_batch', mode:'scatter', density:'med' },
      { id:'prop_rock_small_batch', mode:'scatter', density:'med' },
      { id:'prop_tall_cactus', mode:'scatter', density:'low' },
    ]},

  { folder:'nature', id:'env_forest_clearing', name:'Forest Clearing',
    tags:['nature','forest','green','peaceful'],
    description:'A sun-dappled clearing ringed by pine and oak, with moss-covered stumps and wildflowers.',
    state:{
      groundColor:'#3a6a2e', stageColor:'#5a8a3e', wallColor:'#2a4a22',
      groundSize:23, walls:0, windowStyle:'none',
      skyTop:'#6ab4f0', skyMid:'#a8d0f0', skyBot:'#c8e4d8',
      fxPreset:'day',
      sunColor:'#fff8d0', sunElevation:60, sunVisible:true,
      ambientColor:'#b8d8a0', ambientIntensity:1.1,
      dirColor:'#fff4c8', dirIntensity:1.1,
      fogEnabled:true, fogColor:'#a8c890', fogDensity:0.02,
      orbVisible:false,
    },
    props:[
      { id:'prop_stump_batch', cell:'N3', scale:1.1 },
      { id:'prop_log_batch', cell:'B3', scale:1.0 },
      { id:'prop_log_batch', cell:'O3', scale:1.0 },
      { id:'prop_mushroom_batch', cell:'I4', scale:1.0 },
      { id:'prop_flower_batch', cell:'G4', scale:1.0 },
    ],
    ground:[
      { id:'prop_pine_tree_batch', mode:'scatter', density:'high' },
      { id:'prop_oak_tree_batch', mode:'scatter', density:'med' },
      { id:'prop_flower_batch', mode:'scatter', density:'med' },
    ]},

  { folder:'nature', id:'env_mountain_peak', name:'Mountain Peak',
    tags:['nature','alpine','snow','cold'],
    description:'Wind-scoured granite peaks under a steel-blue sky, snow drifting across bare rock.',
    state:{
      groundColor:'#c4cad2', stageColor:'#e4e8ec', wallColor:'#9ca4ac',
      groundSize:23, walls:0, windowStyle:'none',
      skyTop:'#4a6a8c', skyMid:'#88a4c0', skyBot:'#d0dce4',
      fxPreset:'day',
      sunColor:'#fff4e8', sunElevation:40, sunVisible:true,
      ambientColor:'#c8d4e0', ambientIntensity:1.0,
      dirColor:'#ffffff', dirIntensity:1.2,
      fogEnabled:true, fogColor:'#c0cad4', fogDensity:0.03,
      orbVisible:false,
      weather:'snow',
    },
    props:[
      { id:'prop_mountain', cell:'N1', scale:1.3 },
      { id:'prop_boulder', cell:'B3', scale:1.2 },
      { id:'prop_boulder', cell:'O3', scale:1.2 },
      { id:'prop_pine_tree_batch', cell:'B5', scale:1.0 },
      { id:'prop_nest', cell:'O5', scale:0.9 },
    ],
    ground:[
      { id:'prop_rock_large_batch', mode:'scatter', density:'high' },
      { id:'prop_rock_small_batch', mode:'scatter', density:'high' },
      { id:'prop_pine_tree_batch', mode:'scatter', density:'low' },
    ]},

  { folder:'nature', id:'env_ocean_shore', name:'Ocean Shore',
    tags:['nature','beach','sand','blue'],
    description:'Warm pale sand meeting an endless teal sea, palm fronds ticking in the breeze.',
    state:{
      groundColor:'#e8d6a4', stageColor:'#f0e0b4', wallColor:'#5a94b0',
      groundSize:23, walls:0, windowStyle:'none',
      skyTop:'#4aa4d0', skyMid:'#9cd4e8', skyBot:'#f4e8c4',
      fxPreset:'day',
      sunColor:'#fff0c0', sunElevation:45, sunVisible:true,
      ambientColor:'#d4e4e8', ambientIntensity:1.2,
      dirColor:'#fff4d8', dirIntensity:1.2,
      fogEnabled:true, fogColor:'#c8dce4', fogDensity:0.02,
      orbVisible:false,
    },
    props:[
      { id:'prop_palm_tree', cell:'N1', scale:1.3 },
      { id:'prop_palm_tree', cell:'B1', scale:1.2 },
      { id:'prop_anchor', cell:'N3', scale:1.0 },
      { id:'prop_wave', cell:'B5', scale:1.1 },
      { id:'prop_wave', cell:'O5', scale:1.1 },
    ],
    ground:[
      { id:'prop_palm_tree', mode:'scatter', density:'low' },
      { id:'prop_rock_small_batch', mode:'scatter', density:'med' },
      { id:'prop_wave', mode:'scatter', density:'med' },
    ]},

  // ═══ OFFICE INTERIORS (2) ═══
  { folder:'office-interiors', id:'env_corner_office', name:'Corner Office',
    tags:['office','executive','clean','view'],
    description:'A polished corner office with a big desk, soft lamps, and a city view glowing outside.',
    state:{
      groundColor:'#3a3a42', stageColor:'#5a5a64', wallColor:'#7a7a84',
      groundSize:17, walls:3, windowStyle:'triple', windowColor:'#a8c4dc', windowOpacity:0.35,
      skyTop:'#1a2a3c', skyMid:'#4a6484', skyBot:'#a8c0d4',
      fxPreset:'dusk',
      ambientColor:'#c0d0dc', ambientIntensity:1.0,
      dirColor:'#ffffff', dirIntensity:0.8,
      fogEnabled:false,
      orbVisible:true, orbColor:'#fff0d0', orbIntensity:1.2, orbHeight:2.4, orbFlicker:false,
    },
    props:[
      { id:'prop_chestdrawers_batch', cell:'N1', scale:1.1 },
      { id:'prop_table_batch', cell:'N3', scale:1.1 },
      { id:'prop_chair_batch', cell:'N4', scale:1.0 },
      { id:'prop_desklamp_batch', cell:'I3', scale:1.0 },
      { id:'prop_pottedplant_batch', cell:'B1', scale:1.0 },
    ],
    ground:[
      { id:'prop_pottedplant_batch', mode:'scatter', density:'low' },
      { id:'prop_pictureframe_batch', mode:'scatter', density:'low' },
    ]},

  { folder:'office-interiors', id:'env_startup_loft', name:'Startup Loft',
    tags:['office','loft','industrial','warm'],
    description:'Exposed brick, warm Edison bulbs, and a patchwork of sofas and whiteboards.',
    state:{
      groundColor:'#5a4a3a', stageColor:'#8a6a4a', wallColor:'#a46a48',
      groundSize:19, walls:2, windowStyle:'triple', windowColor:'#e8c078', windowOpacity:0.4,
      skyTop:'#2a1a10', skyMid:'#5a3a20', skyBot:'#9a6430',
      fxPreset:'dusk',
      ambientColor:'#e0a860', ambientIntensity:1.0,
      dirColor:'#ffc080', dirIntensity:0.9,
      fogEnabled:false,
      orbVisible:true, orbColor:'#ffb060', orbIntensity:1.6, orbHeight:2.6, orbFlicker:false,
    },
    props:[
      { id:'prop_sofa_batch', cell:'B2', scale:1.0 },
      { id:'prop_sofa_batch', cell:'O2', scale:1.0 },
      { id:'prop_table_batch', cell:'N3', scale:1.0 },
      { id:'prop_bookshelf_batch', cell:'N1', scale:1.1 },
      { id:'prop_floorlamp_batch', cell:'N5', scale:1.0 },
    ],
    ground:[
      { id:'prop_chair_batch', mode:'scatter', density:'med' },
      { id:'prop_pottedplant_batch', mode:'scatter', density:'low' },
    ]},

  // ═══ SCI-FI (3) ═══
  { folder:'sci-fi', id:'env_alien_landscape', name:'Alien Landscape',
    tags:['sci-fi','alien','strange','purple'],
    description:'A violet world of glass crystal spires and floating orbs under twin moons.',
    state:{
      groundColor:'#3a1e5a', stageColor:'#5a2e84', wallColor:'#2a1040',
      groundSize:23, walls:0, windowStyle:'none',
      skyTop:'#140832', skyMid:'#2a1068', skyBot:'#68288a',
      fxPreset:'night',
      ambientColor:'#784aa8', ambientIntensity:0.9,
      dirColor:'#c080ff', dirIntensity:0.7,
      fogEnabled:true, fogColor:'#281048', fogDensity:0.04,
      orbVisible:true, orbColor:'#e0a0ff', orbIntensity:2.0, orbHeight:2.8, orbFlicker:true,
    },
    props:[
      { id:'prop_crystal_cluster_batch', cell:'N3', scale:1.3 },
      { id:'prop_obelisk', cell:'N1', scale:1.1 },
      { id:'prop_magic_orb_batch', cell:'B2', scale:1.0 },
      { id:'prop_magic_orb_batch', cell:'O2', scale:1.0 },
      { id:'prop_stone_head', cell:'B5', scale:1.0 },
    ],
    ground:[
      { id:'prop_crystal_cluster_batch', mode:'scatter', density:'med' },
      { id:'prop_magic_mushroom_batch', mode:'scatter', density:'high' },
      { id:'prop_rock_large_batch', mode:'scatter', density:'low' },
    ]},

  { folder:'sci-fi', id:'env_neon_district', name:'Neon District',
    tags:['sci-fi','cyberpunk','neon','rain'],
    description:'A rain-slicked cyberpunk alley glowing with magenta signs and guttering lamp-posts.',
    state:{
      groundColor:'#0a0818', stageColor:'#1a1430', wallColor:'#2a1848',
      groundSize:19, walls:3, windowStyle:'triple', windowColor:'#ff50a4', windowOpacity:0.65,
      skyTop:'#050410', skyMid:'#18082a', skyBot:'#50188c',
      fxPreset:'night',
      ambientColor:'#4a20a0', ambientIntensity:0.8,
      dirColor:'#ff80d4', dirIntensity:0.5,
      fogEnabled:true, fogColor:'#181030', fogDensity:0.06,
      orbVisible:true, orbColor:'#ff40a0', orbIntensity:2.4, orbHeight:2.4, orbFlicker:true,
      weather:'rain',
    },
    props:[
      { id:'prop_lamppost_batch', cell:'B1', scale:1.1 },
      { id:'prop_lamppost_batch', cell:'O1', scale:1.1 },
      { id:'prop_dumpster', cell:'N1', scale:1.0 },
      { id:'prop_traffic_cone', cell:'B3', scale:0.9 },
      { id:'prop_street_sign', cell:'O3', scale:1.0 },
    ],
    ground:[
      { id:'prop_lamppost_batch', mode:'scatter', density:'med' },
      { id:'prop_trash_can', mode:'scatter', density:'med' },
      { id:'prop_barrel', mode:'scatter', density:'low' },
    ]},

  { folder:'sci-fi', id:'env_space_station', name:'Space Station',
    tags:['sci-fi','station','metal','cold'],
    description:'A sterile chrome-and-grey docking bay with warning lights and stacked cargo crates.',
    state:{
      groundColor:'#2a3038', stageColor:'#484e58', wallColor:'#5a6068',
      groundSize:19, walls:3, windowStyle:'triple', windowColor:'#40a0e0', windowOpacity:0.45,
      skyTop:'#08080c', skyMid:'#14182a', skyBot:'#2a384c',
      fxPreset:'night',
      ambientColor:'#8098b8', ambientIntensity:0.9,
      dirColor:'#d0e4ff', dirIntensity:0.7,
      fogEnabled:false,
      orbVisible:true, orbColor:'#60b0ff', orbIntensity:1.6, orbHeight:2.6, orbFlicker:true,
    },
    props:[
      { id:'prop_crate', cell:'B1', scale:1.0 },
      { id:'prop_crate', cell:'O1', scale:1.0 },
      { id:'prop_barrel', cell:'N3', scale:1.0 },
      { id:'prop_scaffold', cell:'B5', scale:1.1 },
      { id:'prop_scaffold', cell:'O5', scale:1.1 },
    ],
    ground:[
      { id:'prop_crate', mode:'tile', density:'low' },
      { id:'prop_barrel', mode:'scatter', density:'med' },
    ]},

  // ═══ URBAN (4) ═══
  { folder:'urban', id:'env_city_plaza', name:'City Plaza',
    tags:['urban','plaza','stone','fountain'],
    description:'A wide granite plaza with a central fountain, benches, and a warm late-afternoon glow.',
    state:{
      groundColor:'#8a8a8c', stageColor:'#c0b8a8', wallColor:'#a0968a',
      groundSize:23, walls:1, windowStyle:'none',
      skyTop:'#d0b088', skyMid:'#f0c890', skyBot:'#ffdcb0',
      fxPreset:'dusk',
      sunColor:'#ffb870', sunElevation:25, sunVisible:true,
      ambientColor:'#e0c8a0', ambientIntensity:1.0,
      dirColor:'#ffd090', dirIntensity:1.1,
      fogEnabled:true, fogColor:'#c0a888', fogDensity:0.02,
      orbVisible:false,
    },
    props:[
      { id:'prop_fountain', cell:'N3', scale:1.2 },
      { id:'prop_park_bench', cell:'B3', scale:1.0 },
      { id:'prop_park_bench', cell:'O3', scale:1.0 },
      { id:'prop_lamppost_batch', cell:'B1', scale:1.1 },
      { id:'prop_stone_statue', cell:'O1', scale:1.0 },
    ],
    ground:[
      { id:'prop_lamppost_batch', mode:'scatter', density:'low' },
      { id:'prop_park_bench', mode:'scatter', density:'low' },
      { id:'prop_planter', mode:'scatter', density:'med' },
    ]},

  { folder:'urban', id:'env_rainy_alley', name:'Rainy Alley',
    tags:['urban','alley','rain','dark'],
    description:'A wet grey alley choked with dumpsters and steam, a single fire-pit glowing at the end.',
    state:{
      groundColor:'#2a2a2e', stageColor:'#3a3a3e', wallColor:'#4a484a',
      groundSize:17, walls:3, windowStyle:'single', windowColor:'#c8d8e8', windowOpacity:0.3,
      skyTop:'#080810', skyMid:'#18182a', skyBot:'#282840',
      fxPreset:'night',
      ambientColor:'#5a687a', ambientIntensity:0.7,
      dirColor:'#a8b8c8', dirIntensity:0.4,
      fogEnabled:true, fogColor:'#1a1a22', fogDensity:0.06,
      orbVisible:true, orbColor:'#ff8040', orbIntensity:1.4, orbHeight:2.0, orbFlicker:true,
      weather:'rain',
    },
    props:[
      { id:'prop_dumpster', cell:'B1', scale:1.0 },
      { id:'prop_dumpster', cell:'O1', scale:1.0 },
      { id:'prop_fire_pit', cell:'N1', scale:1.0 },
      { id:'prop_trash_can', cell:'B3', scale:1.0 },
      { id:'prop_barrel', cell:'O3', scale:1.0 },
    ],
    ground:[
      { id:'prop_trash_can', mode:'scatter', density:'med' },
      { id:'prop_crate', mode:'scatter', density:'med' },
    ]},

  { folder:'urban', id:'env_rooftop_bar', name:'Rooftop Bar',
    tags:['urban','rooftop','night','warm'],
    description:'A candlelit rooftop with a skyline of pinpoint lights glittering under a deep indigo sky.',
    state:{
      groundColor:'#2a2028', stageColor:'#8a6848', wallColor:'#5a4038',
      groundSize:19, walls:1, windowStyle:'none',
      skyTop:'#08081c', skyMid:'#1c1838', skyBot:'#483054',
      fxPreset:'night',
      ambientColor:'#7048a0', ambientIntensity:0.7,
      dirColor:'#ffb060', dirIntensity:0.4,
      fogEnabled:false,
      orbVisible:true, orbColor:'#ffb870', orbIntensity:1.7, orbHeight:2.6, orbFlicker:true,
    },
    props:[
      { id:'prop_table_batch', cell:'N3', scale:1.0 },
      { id:'prop_chair_batch', cell:'I3', scale:0.9 },
      { id:'prop_chair_batch', cell:'G3', scale:0.9 },
      { id:'prop_floorlamp_batch', cell:'B1', scale:1.0 },
      { id:'prop_pottedplant_batch', cell:'O1', scale:1.0 },
    ],
    ground:[
      { id:'prop_chair_batch', mode:'scatter', density:'low' },
      { id:'prop_pottedplant_batch', mode:'scatter', density:'low' },
    ]},

  { folder:'urban', id:'env_subway_platform', name:'Subway Platform',
    tags:['urban','subway','concrete','fluorescent'],
    description:'A long concrete platform under cold fluorescents, tiled walls and echoing benches.',
    state:{
      groundColor:'#5a5a60', stageColor:'#787880', wallColor:'#686870',
      groundSize:19, walls:3, windowStyle:'triple', windowColor:'#e0f0e8', windowOpacity:0.3,
      skyTop:'#1a1a20', skyMid:'#2a2a32', skyBot:'#4a4a52',
      fxPreset:'night',
      ambientColor:'#c8d4dc', ambientIntensity:1.0,
      dirColor:'#e8f0e8', dirIntensity:0.6,
      fogEnabled:false,
      orbVisible:true, orbColor:'#d8e8d8', orbIntensity:1.3, orbHeight:2.8, orbFlicker:false,
    },
    props:[
      { id:'prop_park_bench', cell:'B3', scale:1.0 },
      { id:'prop_park_bench', cell:'O3', scale:1.0 },
      { id:'prop_trash_can', cell:'N1', scale:1.0 },
      { id:'prop_street_sign', cell:'B1', scale:1.0 },
      { id:'prop_fire_hydrant', cell:'O1', scale:1.0 },
    ],
    ground:[
      { id:'prop_trash_can', mode:'scatter', density:'med' },
      { id:'prop_fence_post', mode:'tile', density:'low' },
    ]},
];

// ── Build file JSON ─────────────────────────────────────────────
function buildAsset(spec) {
  // emitEnv normalises cells to {x,y,z}, applies the env's scale class
  // multiplier, and stamps `scaleClass` onto the state.
  const { state } = emitEnv(spec);
  return {
    id: spec.id,
    type: 'environment',
    name: spec.name,
    tags: spec.tags,
    meta: {
      created: NOW,
      modified: NOW,
      origin: 'template',
      version: 2,    // schema v2: integer cell coords + scaleClass
    },
    payload: {
      description: spec.description,
      format: 'environment_state',
      state,
    },
  };
}

for (const spec of BATCH) {
  const catDir = path.join(BASE, spec.folder);
  if (!fs.existsSync(catDir)) fs.mkdirSync(catDir, { recursive: true });
  fs.writeFileSync(
    path.join(catDir, `${spec.id}.json`),
    JSON.stringify(buildAsset(spec), null, 2) + '\n',
  );
}

// Rebuild manifest
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
  JSON.stringify({ categories }, null, 4) + '\n',
);

const total = Object.values(categories).reduce((s, c) => s + c.count, 0);
console.log(`Wrote ${BATCH.length} batch-2 envs with stage + ground dressing.`);
console.log(`Manifest: ${total} envs across ${Object.keys(categories).length} categories.`);
