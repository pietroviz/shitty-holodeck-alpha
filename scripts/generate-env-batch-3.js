#!/usr/bin/env node
/**
 * Batch-3: 40 new environments pushing toward the 200-env goal. Bias
 * toward variety, usefulness, and bizarre comedy. Uses the same spec
 * shape as batch-1 / batch-2 (state + props + groundObjects).
 *
 * Run: node scripts/generate-env-batch-3.js
 */

const fs   = require('fs');
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

  // ═══ FANTASY (5) ═══

  { folder:'fantasy', id:'env_goblin_market', name:'Goblin Market',
    tags:['fantasy','market','chaotic','green'],
    description:'A lantern-lit night market where goblins haggle over stolen silver and suspicious mushrooms.',
    state:{
      groundColor:'#2a3e28', stageColor:'#4a5e38', wallColor:'#3a2a24',
      groundSize:21, walls:2, windowStyle:'double', windowColor:'#ffb848', windowOpacity:0.5,
      skyTop:'#0a1028', skyMid:'#1a2848', skyBot:'#3a4068',
      fxPreset:'night',
      ambientColor:'#7aa068', ambientIntensity:0.9,
      dirColor:'#ffb060', dirIntensity:0.5,
      fogEnabled:true, fogColor:'#1a2820', fogDensity:0.04,
      orbVisible:true, orbColor:'#ffa040', orbIntensity:1.8, orbHeight:2.3, orbFlicker:true,
    },
    props:[
      { id:'prop_tent', cell:'N1', scale:1.1 },
      { id:'prop_potion_bottle_batch', cell:'N3', scale:1.0 },
      { id:'prop_cauldron_batch', cell:'B3', scale:1.0 },
      { id:'prop_lamppost_batch', cell:'B5', scale:1.0 },
      { id:'prop_lamppost_batch', cell:'O5', scale:1.0 },
    ],
    ground:[
      { id:'prop_crate', mode:'scatter', density:'high' },
      { id:'prop_magic_mushroom_batch', mode:'scatter', density:'med' },
      { id:'prop_barrel', mode:'scatter', density:'med' },
    ]},

  { folder:'fantasy', id:'env_fairy_dentist_office', name:"Fairy Dentist's Office",
    tags:['fantasy','bizarre','pink','clinical'],
    description:'A sickly-sweet pastel clinic where enormous tools float above a single velvet chair.',
    state:{
      groundColor:'#f8d8e8', stageColor:'#fce8f2', wallColor:'#f4c0d8',
      groundSize:17, walls:3, windowStyle:'double', windowColor:'#ffe8f4', windowOpacity:0.55,
      skyTop:'#f4b8d4', skyMid:'#fcd4e4', skyBot:'#ffe8f0',
      fxPreset:'dawn',
      ambientColor:'#ffd4e4', ambientIntensity:1.3,
      dirColor:'#ffffff', dirIntensity:0.9,
      fogEnabled:false,
      orbVisible:true, orbColor:'#ffffff', orbIntensity:2.0, orbHeight:2.7, orbFlicker:false,
    },
    props:[
      { id:'prop_chair_batch', cell:'N3', scale:1.2 },
      { id:'prop_desklamp_batch', cell:'N2', scale:1.2 },
      { id:'prop_potion_bottle_batch', cell:'B3', scale:0.9 },
      { id:'prop_potion_bottle_batch', cell:'O3', scale:0.9 },
      { id:'prop_pottedplant_batch', cell:'B1', scale:1.0 },
    ],
    ground:[
      { id:'prop_flower_batch', mode:'tile', density:'low' },
      { id:'prop_mug_batch', mode:'scatter', density:'low' },
    ]},

  { folder:'fantasy', id:'env_witches_book_club', name:"Witches' Book Club",
    tags:['fantasy','cozy','purple','occult'],
    description:'Bubbling cauldrons between tall bookshelves, candles dripping onto thick purple rugs.',
    state:{
      groundColor:'#2a1a3a', stageColor:'#3a254a', wallColor:'#4a3560',
      groundSize:17, walls:3, windowStyle:'double', windowColor:'#a060c8', windowOpacity:0.5,
      skyTop:'#100418', skyMid:'#240a34', skyBot:'#482060',
      fxPreset:'night',
      ambientColor:'#8040b8', ambientIntensity:0.8,
      dirColor:'#c070ff', dirIntensity:0.4,
      fogEnabled:true, fogColor:'#1a0824', fogDensity:0.04,
      orbVisible:true, orbColor:'#a060ff', orbIntensity:1.8, orbHeight:2.5, orbFlicker:true,
    },
    props:[
      { id:'prop_cauldron_batch', cell:'N3', scale:1.1 },
      { id:'prop_bookshelf_batch', cell:'N1', scale:1.1 },
      { id:'prop_sofa_batch', cell:'B3', scale:1.0 },
      { id:'prop_chair_batch', cell:'O3', scale:1.0 },
      { id:'prop_candle_batch', cell:'I2', scale:1.3 },
    ],
    ground:[
      { id:'prop_candle_batch', mode:'scatter', density:'med' },
      { id:'prop_potion_bottle_batch', mode:'scatter', density:'low' },
      { id:'prop_magic_mushroom_batch', mode:'scatter', density:'low' },
    ]},

  { folder:'fantasy', id:'env_unicorn_stable', name:'Unicorn Stable',
    tags:['fantasy','pastel','rainbow','stable'],
    description:'A sunlit stable of bleached oak with ribbons, flowers, and a slightly smug rainbow arch.',
    state:{
      groundColor:'#d8c8a8', stageColor:'#e8d8b8', wallColor:'#f4e4c8',
      groundSize:19, walls:3, windowStyle:'triple', windowColor:'#fff0d8', windowOpacity:0.5,
      skyTop:'#a8d0e8', skyMid:'#d8e8f0', skyBot:'#fff0f8',
      fxPreset:'dawn',
      sunColor:'#fff8e0', sunElevation:45, sunVisible:true,
      ambientColor:'#fce4d0', ambientIntensity:1.2,
      dirColor:'#ffffff', dirIntensity:1.0,
      fogEnabled:false,
      orbVisible:false,
    },
    props:[
      { id:'prop_rainbow_arch', cell:'N1', scale:1.2 },
      { id:'prop_fence_post', cell:'B3', scale:1.0 },
      { id:'prop_fence_post', cell:'O3', scale:1.0 },
      { id:'prop_planter', cell:'B5', scale:1.0 },
      { id:'prop_planter', cell:'O5', scale:1.0 },
    ],
    ground:[
      { id:'prop_flower_batch', mode:'scatter', density:'high' },
      { id:'prop_grass_patch_batch', mode:'scatter', density:'med' },
      { id:'prop_fence_post', mode:'tile', density:'low' },
    ]},

  { folder:'fantasy', id:'env_dragon_hr_department', name:'Dragon HR Department',
    tags:['fantasy','bureaucratic','bizarre','office'],
    description:'A tired desk covered in policy binders, a waiting bench, and an alarming pile of skulls in the corner.',
    state:{
      groundColor:'#3a2014', stageColor:'#5a3a24', wallColor:'#4a2e18',
      groundSize:17, walls:3, windowStyle:'single', windowColor:'#ff9040', windowOpacity:0.45,
      skyTop:'#1a0a04', skyMid:'#3a1408', skyBot:'#802810',
      fxPreset:'dusk',
      ambientColor:'#a04020', ambientIntensity:0.9,
      dirColor:'#ff8040', dirIntensity:0.6,
      fogEnabled:true, fogColor:'#2a1008', fogDensity:0.04,
      orbVisible:true, orbColor:'#ffa040', orbIntensity:1.5, orbHeight:2.3, orbFlicker:true,
    },
    props:[
      { id:'prop_table_batch', cell:'N3', scale:1.1 },
      { id:'prop_chair_batch', cell:'N2', scale:1.0 },
      { id:'prop_park_bench', cell:'B3', scale:1.0 },
      { id:'prop_skull_batch', cell:'O5', scale:1.1 },
      { id:'prop_treasure_chest_batch', cell:'B5', scale:0.9 },
    ],
    ground:[
      { id:'prop_skull_batch', mode:'scatter', density:'med' },
      { id:'prop_pictureframe_batch', mode:'scatter', density:'low' },
    ]},

  // ═══ SCI-FI (5) ═══

  { folder:'sci-fi', id:'env_space_laundromat', name:'Abandoned Space Laundromat',
    tags:['sci-fi','decay','neon','liminal'],
    description:'Banks of cracked machines humming under dying fluorescents, a single sock drifting past the window.',
    state:{
      groundColor:'#5a6068', stageColor:'#7a8088', wallColor:'#a4b0b8',
      groundSize:17, walls:3, windowStyle:'triple', windowColor:'#80e8d0', windowOpacity:0.4,
      skyTop:'#080a14', skyMid:'#141830', skyBot:'#2a3050',
      fxPreset:'night',
      ambientColor:'#80d4c0', ambientIntensity:0.9,
      dirColor:'#b0f8e0', dirIntensity:0.5,
      fogEnabled:true, fogColor:'#1a2030', fogDensity:0.04,
      orbVisible:true, orbColor:'#90e8d0', orbIntensity:1.6, orbHeight:2.8, orbFlicker:true,
    },
    props:[
      { id:'prop_chestdrawers_batch', cell:'N1', scale:1.1 },
      { id:'prop_chestdrawers_batch', cell:'B1', scale:1.1 },
      { id:'prop_chestdrawers_batch', cell:'O1', scale:1.1 },
      { id:'prop_park_bench', cell:'N3', scale:1.0 },
      { id:'prop_trash_can', cell:'B5', scale:1.0 },
    ],
    ground:[
      { id:'prop_chestdrawers_batch', mode:'tile', density:'low' },
      { id:'prop_mug_batch', mode:'scatter', density:'low' },
    ]},

  { folder:'sci-fi', id:'env_ai_therapist_pod', name:'AI Therapist Pod',
    tags:['sci-fi','minimalist','calm','white'],
    description:'A seamless white pod with a soft floating orb and exactly one very uncomfortable chair.',
    state:{
      groundColor:'#e8e8ec', stageColor:'#f4f4f8', wallColor:'#d0d0d8',
      groundSize:15, walls:3, windowStyle:'single', windowColor:'#b0d8ff', windowOpacity:0.55,
      skyTop:'#c8d4e8', skyMid:'#e0e8f0', skyBot:'#f8f8fc',
      fxPreset:'dawn',
      ambientColor:'#f4f4f8', ambientIntensity:1.4,
      dirColor:'#ffffff', dirIntensity:1.1,
      fogEnabled:false,
      orbVisible:true, orbColor:'#a0e0ff', orbIntensity:2.0, orbHeight:2.5, orbFlicker:false,
    },
    props:[
      { id:'prop_chair_batch', cell:'N3', scale:1.1 },
      { id:'prop_desklamp_batch', cell:'I3', scale:1.0 },
      { id:'prop_pottedplant_batch', cell:'O2', scale:1.0 },
      { id:'prop_magic_orb_batch', cell:'N1', scale:1.2 },
    ],
    ground:[
      { id:'prop_rug_batch', mode:'tile', density:'low' },
    ]},

  { folder:'sci-fi', id:'env_cryo_dmv', name:'Cryo-DMV',
    tags:['sci-fi','bureaucratic','cold','waiting'],
    description:'A freezing chrome waiting area where the number display hasn’t changed in forty-seven years.',
    state:{
      groundColor:'#c8d4dc', stageColor:'#e0ecf0', wallColor:'#8ab0c0',
      groundSize:19, walls:3, windowStyle:'triple', windowColor:'#d8e8f0', windowOpacity:0.55,
      skyTop:'#b8d4e0', skyMid:'#d8e8f0', skyBot:'#eff4f8',
      fxPreset:'dawn',
      ambientColor:'#d4e4ec', ambientIntensity:1.3,
      dirColor:'#e8f0f8', dirIntensity:0.7,
      fogEnabled:true, fogColor:'#c8d8e0', fogDensity:0.05,
      orbVisible:true, orbColor:'#d8f0ff', orbIntensity:1.4, orbHeight:2.8, orbFlicker:false,
    },
    props:[
      { id:'prop_park_bench', cell:'B3', scale:1.0 },
      { id:'prop_park_bench', cell:'O3', scale:1.0 },
      { id:'prop_park_bench', cell:'N3', scale:1.0 },
      { id:'prop_table_batch', cell:'N1', scale:1.0 },
      { id:'prop_street_sign', cell:'B5', scale:1.0 },
    ],
    ground:[
      { id:'prop_trash_can', mode:'scatter', density:'med' },
      { id:'prop_pictureframe_batch', mode:'tile', density:'low' },
    ]},

  { folder:'sci-fi', id:'env_jelly_planet_surface', name:'Jelly Planet Surface',
    tags:['sci-fi','alien','bizarre','wet'],
    description:'A wobbling purple landscape of glistening domes under two impossibly close moons.',
    state:{
      groundColor:'#6a2870', stageColor:'#8a3890', wallColor:'#5a2060',
      groundSize:25, walls:0, windowStyle:'none',
      skyTop:'#200830', skyMid:'#401458', skyBot:'#803088',
      fxPreset:'night',
      ambientColor:'#a048b8', ambientIntensity:1.0,
      dirColor:'#f080f8', dirIntensity:0.7,
      fogEnabled:true, fogColor:'#501860', fogDensity:0.04,
      orbVisible:true, orbColor:'#ff80ff', orbIntensity:2.0, orbHeight:2.8, orbFlicker:false,
    },
    props:[
      { id:'prop_boulder', cell:'N1', scale:1.3 },
      { id:'prop_boulder_stack', cell:'B3', scale:1.1 },
      { id:'prop_magic_orb_batch', cell:'N3', scale:1.1 },
      { id:'prop_magic_orb_batch', cell:'O3', scale:1.0 },
      { id:'prop_magic_orb_batch', cell:'O5', scale:0.9 },
    ],
    ground:[
      { id:'prop_boulder', mode:'scatter', density:'med' },
      { id:'prop_magic_orb_batch', mode:'scatter', density:'high' },
      { id:'prop_mushroom_batch', mode:'scatter', density:'low' },
    ]},

  { folder:'sci-fi', id:'env_robot_repair_shop', name:'Robot Repair Shop',
    tags:['sci-fi','grimy','industrial','tools'],
    description:'A grease-streaked workshop of scaffolds and crates, a half-built chassis slumped on the floor.',
    state:{
      groundColor:'#3a3a40', stageColor:'#5a5a60', wallColor:'#4a4850',
      groundSize:19, walls:3, windowStyle:'triple', windowColor:'#ff8030', windowOpacity:0.45,
      skyTop:'#0a0a10', skyMid:'#18181c', skyBot:'#302828',
      fxPreset:'night',
      ambientColor:'#ff7030', ambientIntensity:0.7,
      dirColor:'#ffa060', dirIntensity:0.4,
      fogEnabled:true, fogColor:'#18181c', fogDensity:0.04,
      orbVisible:true, orbColor:'#ff8040', orbIntensity:1.6, orbHeight:2.4, orbFlicker:true,
    },
    props:[
      { id:'prop_scaffold', cell:'N1', scale:1.1 },
      { id:'prop_crate', cell:'B3', scale:1.1 },
      { id:'prop_crate', cell:'O3', scale:1.1 },
      { id:'prop_barrel', cell:'I3', scale:1.0 },
      { id:'prop_barrel', cell:'G3', scale:1.0 },
    ],
    ground:[
      { id:'prop_crate', mode:'scatter', density:'high' },
      { id:'prop_barrel', mode:'scatter', density:'med' },
      { id:'prop_traffic_cone', mode:'scatter', density:'low' },
    ]},

  // ═══ NATURE (5) ═══

  { folder:'nature', id:'env_lightning_meadow', name:'Lightning-Struck Meadow',
    tags:['nature','storm','wildflowers','drama'],
    description:'A windswept field of crooked dead trees between fresh purple wildflowers, a storm still rolling off.',
    state:{
      groundColor:'#4a6848', stageColor:'#6a8850', wallColor:'#3a4830',
      groundSize:27, walls:0, windowStyle:'none',
      skyTop:'#202838', skyMid:'#484a60', skyBot:'#80708a',
      fxPreset:'dusk',
      ambientColor:'#7088a0', ambientIntensity:0.9,
      dirColor:'#d8c8f0', dirIntensity:0.6,
      fogEnabled:true, fogColor:'#3a4050', fogDensity:0.03,
      orbVisible:false,
    },
    props:[
      { id:'prop_dead_tree', cell:'N1', scale:1.3 },
      { id:'prop_dead_tree', cell:'B2', scale:1.1 },
      { id:'prop_dead_tree', cell:'O5', scale:1.1 },
      { id:'prop_stump_batch', cell:'N3', scale:1.0 },
      { id:'prop_boulder', cell:'B5', scale:1.0 },
    ],
    ground:[
      { id:'prop_flower_batch', mode:'scatter', density:'high' },
      { id:'prop_grass_patch_batch', mode:'scatter', density:'high' },
      { id:'prop_dead_tree', mode:'scatter', density:'low' },
    ]},

  { folder:'nature', id:'env_bioluminescent_swamp', name:'Bioluminescent Swamp',
    tags:['nature','glow','swamp','night'],
    description:'Still black water under glowing green mushrooms, fireflies hanging between twisted roots.',
    state:{
      groundColor:'#1a2a20', stageColor:'#2a3a26', wallColor:'#1a2218',
      groundSize:23, walls:0, windowStyle:'none',
      skyTop:'#040810', skyMid:'#0a1a14', skyBot:'#1a3830',
      fxPreset:'night',
      ambientColor:'#60ff9a', ambientIntensity:0.7,
      dirColor:'#80ffa0', dirIntensity:0.3,
      fogEnabled:true, fogColor:'#081810', fogDensity:0.07,
      orbVisible:true, orbColor:'#70ffa0', orbIntensity:2.0, orbHeight:2.2, orbFlicker:true,
    },
    props:[
      { id:'prop_pond_batch', cell:'N3', scale:1.3 },
      { id:'prop_dead_tree', cell:'B2', scale:1.2 },
      { id:'prop_dead_tree', cell:'O2', scale:1.2 },
      { id:'prop_log_batch', cell:'B5', scale:1.0 },
      { id:'prop_magic_mushroom_batch', cell:'O5', scale:1.2 },
    ],
    ground:[
      { id:'prop_magic_mushroom_batch', mode:'scatter', density:'high' },
      { id:'prop_log_batch', mode:'scatter', density:'med' },
      { id:'prop_pond_batch', mode:'scatter', density:'med' },
    ]},

  { folder:'nature', id:'env_giant_mushroom_forest', name:'Giant Mushroom Forest',
    tags:['nature','mushrooms','vivid','whimsical'],
    description:'Towering red-capped mushrooms taller than pines, dappled light spilling through their stems.',
    state:{
      groundColor:'#3a4820', stageColor:'#5a6c28', wallColor:'#2a3818',
      groundSize:25, walls:0, windowStyle:'none',
      skyTop:'#60a048', skyMid:'#a0c868', skyBot:'#d8e4b8',
      fxPreset:'dawn',
      sunColor:'#f8ffd8', sunElevation:40, sunVisible:true,
      ambientColor:'#a0c870', ambientIntensity:1.1,
      dirColor:'#f0ffd0', dirIntensity:0.9,
      fogEnabled:true, fogColor:'#5a7030', fogDensity:0.02,
      orbVisible:false,
    },
    props:[
      { id:'prop_magic_mushroom_batch', cell:'N1', scale:1.6 },
      { id:'prop_magic_mushroom_batch', cell:'B2', scale:1.4 },
      { id:'prop_magic_mushroom_batch', cell:'O2', scale:1.4 },
      { id:'prop_log_batch', cell:'N3', scale:1.0 },
      { id:'prop_stump_batch', cell:'B5', scale:1.0 },
    ],
    ground:[
      { id:'prop_mushroom_batch', mode:'scatter', density:'high' },
      { id:'prop_grass_patch_batch', mode:'scatter', density:'high' },
      { id:'prop_flower_batch', mode:'scatter', density:'med' },
    ]},

  { folder:'nature', id:'env_waterlily_dell', name:'Waterlily Dell',
    tags:['nature','pond','still','green'],
    description:'A sheltered hollow of mossy stones and a wide pond scattered with pale pink lilies.',
    state:{
      groundColor:'#3a5a2a', stageColor:'#5a7a3a', wallColor:'#2a3a1e',
      groundSize:21, walls:0, windowStyle:'none',
      skyTop:'#70a8d0', skyMid:'#a8d0e4', skyBot:'#dcecf0',
      fxPreset:'dawn',
      sunColor:'#fff8d8', sunElevation:50, sunVisible:true,
      ambientColor:'#b0d8a8', ambientIntensity:1.2,
      dirColor:'#f0ffd8', dirIntensity:1.0,
      fogEnabled:true, fogColor:'#c8dcd0', fogDensity:0.02,
      orbVisible:false,
    },
    props:[
      { id:'prop_pond_batch', cell:'N3', scale:1.5 },
      { id:'prop_stump_batch', cell:'B3', scale:1.0 },
      { id:'prop_rock_large_batch', cell:'O2', scale:1.0 },
      { id:'prop_log_batch', cell:'B5', scale:1.0 },
      { id:'prop_oak_tree_batch', cell:'O5', scale:1.2 },
    ],
    ground:[
      { id:'prop_flower_batch', mode:'scatter', density:'med' },
      { id:'prop_grass_patch_batch', mode:'scatter', density:'high' },
      { id:'prop_rock_small_batch', mode:'scatter', density:'med' },
    ]},

  { folder:'nature', id:'env_apple_orchard', name:'Apple Orchard',
    tags:['nature','orchard','autumn','warm'],
    description:'Orderly rows of laden apple trees in late-afternoon gold, fallen fruit in the grass.',
    state:{
      groundColor:'#5a6828', stageColor:'#7a8838', wallColor:'#4a5020',
      groundSize:25, walls:0, windowStyle:'none',
      skyTop:'#d8a868', skyMid:'#f0c890', skyBot:'#fce0b0',
      fxPreset:'dusk',
      sunColor:'#ffc870', sunElevation:22, sunVisible:true,
      ambientColor:'#f0d090', ambientIntensity:1.2,
      dirColor:'#ffc880', dirIntensity:1.1,
      fogEnabled:true, fogColor:'#e8c888', fogDensity:0.02,
      orbVisible:false,
    },
    props:[
      { id:'prop_oak_tree_batch', cell:'N1', scale:1.3 },
      { id:'prop_oak_tree_batch', cell:'B2', scale:1.2 },
      { id:'prop_oak_tree_batch', cell:'O2', scale:1.2 },
      { id:'prop_oak_tree_batch', cell:'N5', scale:1.2 },
      { id:'prop_park_bench', cell:'I3', scale:1.0 },
    ],
    ground:[
      { id:'prop_grass_patch_batch', mode:'scatter', density:'high' },
      { id:'prop_oak_tree_batch', mode:'tile', density:'low' },
      { id:'prop_flower_batch', mode:'scatter', density:'med' },
    ]},

  // ═══ URBAN (5) ═══

  { folder:'urban', id:'env_haunted_karaoke_bar', name:'Haunted Karaoke Bar',
    tags:['urban','nightlife','haunted','neon'],
    description:'A sticky-floored karaoke joint where the pink neon flickers and something sings along in the empty booth.',
    state:{
      groundColor:'#2a1030', stageColor:'#48184a', wallColor:'#382040',
      groundSize:17, walls:3, windowStyle:'double', windowColor:'#ff40a0', windowOpacity:0.5,
      skyTop:'#08040a', skyMid:'#200a28', skyBot:'#481040',
      fxPreset:'night',
      ambientColor:'#c040a0', ambientIntensity:0.8,
      dirColor:'#ff60c0', dirIntensity:0.5,
      fogEnabled:true, fogColor:'#20081a', fogDensity:0.05,
      orbVisible:true, orbColor:'#ff50a0', orbIntensity:1.9, orbHeight:2.4, orbFlicker:true,
    },
    props:[
      { id:'prop_sofa_batch', cell:'B3', scale:1.0 },
      { id:'prop_sofa_batch', cell:'O3', scale:1.0 },
      { id:'prop_table_batch', cell:'N3', scale:1.0 },
      { id:'prop_skull_batch', cell:'N1', scale:0.9 },
      { id:'prop_floorlamp_batch', cell:'B5', scale:1.0 },
    ],
    ground:[
      { id:'prop_mug_batch', mode:'scatter', density:'med' },
      { id:'prop_chair_batch', mode:'scatter', density:'low' },
    ]},

  { folder:'urban', id:'env_24hr_bodega', name:'24hr Bodega',
    tags:['urban','bodega','late-night','neon'],
    description:'A cramped corner shop lit by buzzing tubes, crates stacked past the ceiling and a resident cat on the counter.',
    state:{
      groundColor:'#707068', stageColor:'#888878', wallColor:'#909088',
      groundSize:15, walls:3, windowStyle:'triple', windowColor:'#80ff80', windowOpacity:0.5,
      skyTop:'#0a0a14', skyMid:'#181824', skyBot:'#282838',
      fxPreset:'night',
      ambientColor:'#a0e0a0', ambientIntensity:1.0,
      dirColor:'#c0f0c0', dirIntensity:0.5,
      fogEnabled:false,
      orbVisible:true, orbColor:'#a0ffc0', orbIntensity:1.6, orbHeight:2.8, orbFlicker:true,
    },
    props:[
      { id:'prop_chestdrawers_batch', cell:'N1', scale:1.1 },
      { id:'prop_table_batch', cell:'N3', scale:1.0 },
      { id:'prop_crate', cell:'B3', scale:1.0 },
      { id:'prop_crate', cell:'O3', scale:1.0 },
      { id:'prop_bookshelf_batch', cell:'B1', scale:1.0 },
    ],
    ground:[
      { id:'prop_crate', mode:'tile', density:'med' },
      { id:'prop_barrel', mode:'scatter', density:'low' },
      { id:'prop_mug_batch', mode:'scatter', density:'low' },
    ]},

  { folder:'urban', id:'env_rooftop_pigeon_coop', name:'Rooftop Pigeon Coop',
    tags:['urban','rooftop','pigeons','tar'],
    description:'A tar-paper rooftop crowded with wire coops, a cracked fire pit, and a forest of TV antennas.',
    state:{
      groundColor:'#3a3832', stageColor:'#5a5048', wallColor:'#4a4038',
      groundSize:19, walls:1, windowStyle:'none',
      skyTop:'#b0a0b0', skyMid:'#d0c0c8', skyBot:'#e8d8c8',
      fxPreset:'dusk',
      sunColor:'#ffb880', sunElevation:20, sunVisible:true,
      ambientColor:'#d0b8b0', ambientIntensity:1.1,
      dirColor:'#ffd0a0', dirIntensity:0.9,
      fogEnabled:true, fogColor:'#b8a898', fogDensity:0.03,
      orbVisible:false,
    },
    props:[
      { id:'prop_nest', cell:'N1', scale:1.2 },
      { id:'prop_scaffold', cell:'B3', scale:1.0 },
      { id:'prop_fire_pit', cell:'N3', scale:1.0 },
      { id:'prop_tent', cell:'O3', scale:0.9 },
      { id:'prop_crate', cell:'B5', scale:1.0 },
    ],
    ground:[
      { id:'prop_crate', mode:'scatter', density:'med' },
      { id:'prop_trash_can', mode:'scatter', density:'low' },
      { id:'prop_nest', mode:'scatter', density:'med' },
    ]},

  { folder:'urban', id:'env_taco_truck_lot', name:'Taco Truck Parking Lot',
    tags:['urban','food','night','warm'],
    description:'A cracked asphalt lot ringed with strung lights, a grease-stained truck and folding chairs around a fire pit.',
    state:{
      groundColor:'#3a3a38', stageColor:'#5a5048', wallColor:'#484438',
      groundSize:21, walls:1, windowStyle:'none',
      skyTop:'#0c0818', skyMid:'#1c1830', skyBot:'#483058',
      fxPreset:'night',
      ambientColor:'#8060a0', ambientIntensity:0.8,
      dirColor:'#ffb060', dirIntensity:0.4,
      fogEnabled:false,
      orbVisible:true, orbColor:'#ffa840', orbIntensity:1.8, orbHeight:2.6, orbFlicker:true,
    },
    props:[
      { id:'prop_fire_pit', cell:'N3', scale:1.1 },
      { id:'prop_chair_batch', cell:'B3', scale:1.0 },
      { id:'prop_chair_batch', cell:'O3', scale:1.0 },
      { id:'prop_chair_batch', cell:'I3', scale:1.0 },
      { id:'prop_lamppost_batch', cell:'N1', scale:1.1 },
    ],
    ground:[
      { id:'prop_trash_can', mode:'scatter', density:'med' },
      { id:'prop_crate', mode:'scatter', density:'low' },
      { id:'prop_traffic_cone', mode:'scatter', density:'low' },
    ]},

  { folder:'urban', id:'env_graffiti_skate_park', name:'Graffiti Skate Park',
    tags:['urban','skate','graffiti','day'],
    description:'Concrete bowls painted neon and tagged twice over, cones and barrels stacked for makeshift ramps.',
    state:{
      groundColor:'#5a5a60', stageColor:'#787882', wallColor:'#8a5090',
      groundSize:23, walls:1, windowStyle:'none',
      skyTop:'#88a8d8', skyMid:'#b8d0e8', skyBot:'#e8ecf4',
      fxPreset:'dawn',
      sunColor:'#fff4d0', sunElevation:55, sunVisible:true,
      ambientColor:'#d0d4dc', ambientIntensity:1.2,
      dirColor:'#ffffff', dirIntensity:1.1,
      fogEnabled:false,
      orbVisible:false,
    },
    props:[
      { id:'prop_traffic_cone', cell:'B3', scale:1.1 },
      { id:'prop_traffic_cone', cell:'O3', scale:1.1 },
      { id:'prop_barrel', cell:'N3', scale:1.1 },
      { id:'prop_crate', cell:'N1', scale:1.0 },
      { id:'prop_fence_post', cell:'B5', scale:1.0 },
    ],
    ground:[
      { id:'prop_traffic_cone', mode:'scatter', density:'med' },
      { id:'prop_barrel', mode:'scatter', density:'med' },
      { id:'prop_fence_post', mode:'tile', density:'low' },
    ]},

  // ═══ DREAMSCAPES (4) ═══

  { folder:'dreamscapes', id:'env_escher_staircase', name:'Escher Staircase',
    tags:['dreamscape','geometry','mc-escher','surreal'],
    description:'An impossible atrium of stone steps that meet in directions that stop making sense if you stare.',
    state:{
      groundColor:'#a09888', stageColor:'#c0b8a4', wallColor:'#847c70',
      groundSize:19, walls:3, windowStyle:'double', windowColor:'#e0d8c8', windowOpacity:0.4,
      skyTop:'#807a70', skyMid:'#a89c88', skyBot:'#c8bca8',
      fxPreset:'dusk',
      ambientColor:'#c0b0a0', ambientIntensity:1.0,
      dirColor:'#e0d0b0', dirIntensity:0.8,
      fogEnabled:true, fogColor:'#9c9488', fogDensity:0.04,
      orbVisible:false,
    },
    props:[
      { id:'prop_column', cell:'B2', scale:1.2 },
      { id:'prop_column', cell:'O2', scale:1.2 },
      { id:'prop_obelisk', cell:'N1', scale:1.1 },
      { id:'prop_stone_statue', cell:'N3', scale:1.0 },
      { id:'prop_bridge', cell:'B5', scale:1.0 },
    ],
    ground:[
      { id:'prop_column', mode:'tile', density:'med' },
      { id:'prop_boulder', mode:'scatter', density:'low' },
    ]},

  { folder:'dreamscapes', id:'env_upside_down_diner', name:'Upside-Down Diner',
    tags:['dreamscape','diner','surreal','pastel'],
    description:'A spotless mint-green diner where the tables and chairs all bolt upward into a tiled ceiling.',
    state:{
      groundColor:'#a8d8c8', stageColor:'#c8f0e0', wallColor:'#e0f4e8',
      groundSize:17, walls:3, windowStyle:'triple', windowColor:'#fff8a0', windowOpacity:0.5,
      skyTop:'#fcd878', skyMid:'#fff0a8', skyBot:'#fff8d8',
      fxPreset:'dawn',
      ambientColor:'#f0f0c8', ambientIntensity:1.3,
      dirColor:'#fff4b0', dirIntensity:0.9,
      fogEnabled:false,
      orbVisible:true, orbColor:'#fffcb0', orbIntensity:1.5, orbHeight:2.8, orbFlicker:false,
    },
    props:[
      { id:'prop_table_batch', cell:'B2', scale:1.0 },
      { id:'prop_table_batch', cell:'O2', scale:1.0 },
      { id:'prop_chair_batch', cell:'B3', scale:1.0 },
      { id:'prop_chair_batch', cell:'O3', scale:1.0 },
      { id:'prop_floorlamp_batch', cell:'N1', scale:1.1 },
    ],
    ground:[
      { id:'prop_mug_batch', mode:'scatter', density:'high' },
      { id:'prop_chair_batch', mode:'tile', density:'low' },
    ]},

  { folder:'dreamscapes', id:'env_sea_of_balloons', name:'Sea Of Balloons',
    tags:['dreamscape','balloons','sky','bright'],
    description:'An impossibly blue sky packed shoulder-to-shoulder with drifting coloured orbs as far as the horizon.',
    state:{
      groundColor:'#a8d4e8', stageColor:'#c8e4f0', wallColor:'#80b8d8',
      groundSize:25, walls:0, windowStyle:'none',
      skyTop:'#60a8e8', skyMid:'#a0d0f0', skyBot:'#e0f0f8',
      fxPreset:'dawn',
      sunColor:'#fffce4', sunElevation:60, sunVisible:true,
      ambientColor:'#d0e4f0', ambientIntensity:1.3,
      dirColor:'#ffffff', dirIntensity:1.0,
      fogEnabled:true, fogColor:'#b8d8ec', fogDensity:0.02,
      orbVisible:true, orbColor:'#ff80a0', orbIntensity:1.8, orbHeight:2.8, orbFlicker:false,
    },
    props:[
      { id:'prop_magic_orb_batch', cell:'N1', scale:1.3 },
      { id:'prop_magic_orb_batch', cell:'B2', scale:1.1 },
      { id:'prop_magic_orb_batch', cell:'O2', scale:1.1 },
      { id:'prop_magic_orb_batch', cell:'N3', scale:1.0 },
      { id:'prop_cloud_batch', cell:'B5', scale:1.2 },
    ],
    ground:[
      { id:'prop_cloud_batch', mode:'scatter', density:'high' },
      { id:'prop_magic_orb_batch', mode:'scatter', density:'high' },
    ]},

  { folder:'dreamscapes', id:'env_liminal_hallway', name:'Liminal Hotel Hallway',
    tags:['dreamscape','liminal','corridor','yellow'],
    description:'An endless hotel corridor lit by humming fluorescents, the carpet always the same ugly paisley.',
    state:{
      groundColor:'#a84848', stageColor:'#c45858', wallColor:'#e0c888',
      groundSize:21, walls:3, windowStyle:'none',
      skyTop:'#806830', skyMid:'#a88840', skyBot:'#d0a858',
      fxPreset:'night',
      ambientColor:'#d8b068', ambientIntensity:1.1,
      dirColor:'#ffd890', dirIntensity:0.6,
      fogEnabled:true, fogColor:'#a08048', fogDensity:0.05,
      orbVisible:true, orbColor:'#ffe4a0', orbIntensity:1.6, orbHeight:2.8, orbFlicker:true,
    },
    props:[
      { id:'prop_floorlamp_batch', cell:'B1', scale:1.0 },
      { id:'prop_floorlamp_batch', cell:'O1', scale:1.0 },
      { id:'prop_pictureframe_batch', cell:'B3', scale:1.1 },
      { id:'prop_pictureframe_batch', cell:'O3', scale:1.1 },
      { id:'prop_pottedplant_batch', cell:'N1', scale:1.0 },
    ],
    ground:[
      { id:'prop_pictureframe_batch', mode:'tile', density:'low' },
      { id:'prop_pottedplant_batch', mode:'scatter', density:'low' },
    ]},

  // ═══ HOLY-PLACES (3) ═══

  { folder:'holy-places', id:'env_cat_shrine', name:'Cat Shrine',
    tags:['holy','cat','cosy','offerings'],
    description:'A small stone shrine overflowing with offerings of mugs, flowers, and one unimpressed cat statue.',
    state:{
      groundColor:'#9a9484', stageColor:'#c4bca8', wallColor:'#a89880',
      groundSize:17, walls:1, windowStyle:'none',
      skyTop:'#c8b488', skyMid:'#e0cc9c', skyBot:'#f4e0b0',
      fxPreset:'dusk',
      sunColor:'#ffd480', sunElevation:28, sunVisible:true,
      ambientColor:'#e4c890', ambientIntensity:1.1,
      dirColor:'#ffcc88', dirIntensity:1.0,
      fogEnabled:true, fogColor:'#c4a878', fogDensity:0.03,
      orbVisible:true, orbColor:'#fff0b0', orbIntensity:1.3, orbHeight:2.2, orbFlicker:true,
    },
    props:[
      { id:'prop_shrine', cell:'N1', scale:1.2 },
      { id:'prop_stone_statue', cell:'N3', scale:1.0 },
      { id:'prop_pottedplant_batch', cell:'B3', scale:1.0 },
      { id:'prop_pottedplant_batch', cell:'O3', scale:1.0 },
      { id:'prop_candle_batch', cell:'B5', scale:1.1 },
    ],
    ground:[
      { id:'prop_mug_batch', mode:'scatter', density:'high' },
      { id:'prop_flower_batch', mode:'scatter', density:'med' },
      { id:'prop_candle_batch', mode:'scatter', density:'low' },
    ]},

  { folder:'holy-places', id:'env_suburban_cult_basement', name:'Suburban Cult Basement',
    tags:['holy','cult','basement','candles'],
    description:'A carpeted basement cleared for ritual — folding chairs in a circle, a ring of candles, suspiciously fresh flowers.',
    state:{
      groundColor:'#7a5a48', stageColor:'#9a7a60', wallColor:'#a08058',
      groundSize:15, walls:3, windowStyle:'single', windowColor:'#ffa040', windowOpacity:0.35,
      skyTop:'#0c0810', skyMid:'#1a1220', skyBot:'#2a1c28',
      fxPreset:'night',
      ambientColor:'#a06040', ambientIntensity:0.7,
      dirColor:'#ffa060', dirIntensity:0.4,
      fogEnabled:true, fogColor:'#1a1018', fogDensity:0.05,
      orbVisible:true, orbColor:'#ffa040', orbIntensity:1.7, orbHeight:2.2, orbFlicker:true,
    },
    props:[
      { id:'prop_candle_batch', cell:'N3', scale:1.2 },
      { id:'prop_chair_batch', cell:'B2', scale:1.0 },
      { id:'prop_chair_batch', cell:'O2', scale:1.0 },
      { id:'prop_chair_batch', cell:'B5', scale:1.0 },
      { id:'prop_skull_batch', cell:'N1', scale:0.9 },
    ],
    ground:[
      { id:'prop_candle_batch', mode:'tile', density:'med' },
      { id:'prop_flower_batch', mode:'scatter', density:'low' },
    ]},

  { folder:'holy-places', id:'env_roadside_saint', name:'Roadside Saint Shrine',
    tags:['holy','roadside','mexico','candles'],
    description:'A small wildflower-rimmed shrine at the edge of a dirt road, guttering candles lit by unseen hands.',
    state:{
      groundColor:'#a88c5c', stageColor:'#c8a880', wallColor:'#a88058',
      groundSize:21, walls:0, windowStyle:'none',
      skyTop:'#e8b068', skyMid:'#f4cc88', skyBot:'#ffe0b0',
      fxPreset:'dusk',
      sunColor:'#ffa850', sunElevation:18, sunVisible:true,
      ambientColor:'#e8b078', ambientIntensity:1.1,
      dirColor:'#ffbc70', dirIntensity:1.0,
      fogEnabled:true, fogColor:'#cc9868', fogDensity:0.03,
      orbVisible:true, orbColor:'#ffb060', orbIntensity:1.4, orbHeight:2.0, orbFlicker:true,
    },
    props:[
      { id:'prop_shrine', cell:'N1', scale:1.1 },
      { id:'prop_candle_batch', cell:'N3', scale:1.1 },
      { id:'prop_candle_batch', cell:'I3', scale:1.0 },
      { id:'prop_candle_batch', cell:'G3', scale:1.0 },
      { id:'prop_sunflower', cell:'B3', scale:1.0 },
    ],
    ground:[
      { id:'prop_flower_batch', mode:'scatter', density:'high' },
      { id:'prop_grass_patch_batch', mode:'scatter', density:'med' },
      { id:'prop_candle_batch', mode:'scatter', density:'low' },
    ]},

  // ═══ HOME-INTERIORS (5) ═══

  { folder:'home-interiors', id:'env_hoarder_living_room', name:"Hoarder Grandma's Living Room",
    tags:['home','clutter','warm','chaotic'],
    description:'Towers of frames, teetering lamps, every surface stacked — warm, suffocating, beloved.',
    state:{
      groundColor:'#6a4e34', stageColor:'#a48060', wallColor:'#b8967c',
      groundSize:15, walls:3, windowStyle:'double', windowColor:'#ffc868', windowOpacity:0.5,
      skyTop:'#4a3020', skyMid:'#805030', skyBot:'#c08058',
      fxPreset:'dusk',
      ambientColor:'#d49878', ambientIntensity:1.1,
      dirColor:'#ffb868', dirIntensity:0.8,
      fogEnabled:false,
      orbVisible:true, orbColor:'#ffb060', orbIntensity:1.6, orbHeight:2.2, orbFlicker:false,
    },
    props:[
      { id:'prop_sofa_batch', cell:'N3', scale:1.0 },
      { id:'prop_chestdrawers_batch', cell:'B1', scale:1.0 },
      { id:'prop_bookshelf_batch', cell:'O1', scale:1.0 },
      { id:'prop_floorlamp_batch', cell:'B3', scale:1.0 },
      { id:'prop_table_batch', cell:'O3', scale:1.0 },
    ],
    ground:[
      { id:'prop_pictureframe_batch', mode:'scatter', density:'high' },
      { id:'prop_mug_batch', mode:'scatter', density:'high' },
      { id:'prop_pottedplant_batch', mode:'scatter', density:'med' },
    ]},

  { folder:'home-interiors', id:'env_goth_teen_bedroom', name:'Goth Teen Bedroom',
    tags:['home','goth','dark','teen'],
    description:'Black-walled refuge of dripping candles, a shrine of skulls, and a bed dressed entirely in mourning.',
    state:{
      groundColor:'#181418', stageColor:'#281a28', wallColor:'#201820',
      groundSize:15, walls:3, windowStyle:'single', windowColor:'#a060c0', windowOpacity:0.45,
      skyTop:'#06040a', skyMid:'#1a0820', skyBot:'#3a1448',
      fxPreset:'night',
      ambientColor:'#602080', ambientIntensity:0.7,
      dirColor:'#8040a0', dirIntensity:0.4,
      fogEnabled:true, fogColor:'#100814', fogDensity:0.05,
      orbVisible:true, orbColor:'#8040c0', orbIntensity:1.6, orbHeight:2.2, orbFlicker:true,
    },
    props:[
      { id:'prop_bed_batch', cell:'N1', scale:1.0 },
      { id:'prop_skull_batch', cell:'N3', scale:1.0 },
      { id:'prop_candle_batch', cell:'B3', scale:1.1 },
      { id:'prop_candle_batch', cell:'O3', scale:1.1 },
      { id:'prop_bookshelf_batch', cell:'B1', scale:1.0 },
    ],
    ground:[
      { id:'prop_candle_batch', mode:'scatter', density:'high' },
      { id:'prop_skull_batch', mode:'scatter', density:'low' },
    ]},

  { folder:'home-interiors', id:'env_prepper_pantry', name:'Doomsday Prepper Pantry',
    tags:['home','pantry','prepper','stocked'],
    description:'Floor-to-ceiling shelves of labelled crates and barrels under a single caged bulb.',
    state:{
      groundColor:'#585040', stageColor:'#787060', wallColor:'#68604c',
      groundSize:15, walls:3, windowStyle:'none',
      skyTop:'#0a0806', skyMid:'#181410', skyBot:'#2a2218',
      fxPreset:'night',
      ambientColor:'#a89878', ambientIntensity:0.8,
      dirColor:'#f0d8a0', dirIntensity:0.5,
      fogEnabled:false,
      orbVisible:true, orbColor:'#ffe4a0', orbIntensity:1.3, orbHeight:2.4, orbFlicker:false,
    },
    props:[
      { id:'prop_bookshelf_batch', cell:'N1', scale:1.1 },
      { id:'prop_bookshelf_batch', cell:'B1', scale:1.1 },
      { id:'prop_bookshelf_batch', cell:'O1', scale:1.1 },
      { id:'prop_barrel', cell:'B3', scale:1.0 },
      { id:'prop_crate', cell:'O3', scale:1.0 },
    ],
    ground:[
      { id:'prop_crate', mode:'tile', density:'med' },
      { id:'prop_barrel', mode:'scatter', density:'med' },
      { id:'prop_mug_batch', mode:'scatter', density:'low' },
    ]},

  { folder:'home-interiors', id:'env_catio_sunporch', name:'Catio Sunporch',
    tags:['home','cosy','plants','cats'],
    description:'A glassed-in sunporch thick with plants and cushions, motes of dust drifting through afternoon light.',
    state:{
      groundColor:'#c8a880', stageColor:'#e0c494', wallColor:'#a88a5c',
      groundSize:17, walls:3, windowStyle:'triple', windowColor:'#fff0c0', windowOpacity:0.55,
      skyTop:'#a0c8e8', skyMid:'#d0e4f0', skyBot:'#fff0d8',
      fxPreset:'dawn',
      sunColor:'#fffce0', sunElevation:50, sunVisible:true,
      ambientColor:'#f0d8b0', ambientIntensity:1.3,
      dirColor:'#fff0c0', dirIntensity:1.1,
      fogEnabled:false,
      orbVisible:false,
    },
    props:[
      { id:'prop_sofa_batch', cell:'N3', scale:1.0 },
      { id:'prop_pottedplant_batch', cell:'B1', scale:1.1 },
      { id:'prop_pottedplant_batch', cell:'O1', scale:1.1 },
      { id:'prop_pottedplant_batch', cell:'B5', scale:1.0 },
      { id:'prop_table_batch', cell:'I3', scale:0.9 },
    ],
    ground:[
      { id:'prop_pottedplant_batch', mode:'scatter', density:'high' },
      { id:'prop_rug_batch', mode:'tile', density:'low' },
      { id:'prop_mug_batch', mode:'scatter', density:'low' },
    ]},

  { folder:'home-interiors', id:'env_art_studio_loft', name:'Art Studio Loft',
    tags:['home','art','creative','bright'],
    description:'An airy loft of splattered floors, leaning canvases, and half-full coffee mugs on every surface.',
    state:{
      groundColor:'#d8c8a8', stageColor:'#eaddb8', wallColor:'#e8dcc0',
      groundSize:19, walls:3, windowStyle:'triple', windowColor:'#f8ecc0', windowOpacity:0.6,
      skyTop:'#b8c8d8', skyMid:'#d8e0e8', skyBot:'#f4ede0',
      fxPreset:'dawn',
      sunColor:'#ffffff', sunElevation:60, sunVisible:true,
      ambientColor:'#f0ecd8', ambientIntensity:1.3,
      dirColor:'#ffffff', dirIntensity:1.0,
      fogEnabled:false,
      orbVisible:false,
    },
    props:[
      { id:'prop_pictureframe_batch', cell:'N1', scale:1.2 },
      { id:'prop_bookshelf_batch', cell:'B1', scale:1.0 },
      { id:'prop_chair_batch', cell:'N3', scale:1.0 },
      { id:'prop_table_batch', cell:'O3', scale:1.0 },
      { id:'prop_floorlamp_batch', cell:'B5', scale:1.0 },
    ],
    ground:[
      { id:'prop_pictureframe_batch', mode:'scatter', density:'high' },
      { id:'prop_mug_batch', mode:'scatter', density:'med' },
      { id:'prop_pottedplant_batch', mode:'scatter', density:'low' },
    ]},

  // ═══ OFFICE-INTERIORS (4) ═══

  { folder:'office-interiors', id:'env_dystopian_call_centre', name:'Dystopian Call Centre',
    tags:['office','call-centre','grey','fluorescent'],
    description:'Endless rows of identical desks under cold strip lighting, headsets waiting for the next shift.',
    state:{
      groundColor:'#98928a', stageColor:'#b8b0a8', wallColor:'#a09888',
      groundSize:23, walls:3, windowStyle:'triple', windowColor:'#e0e8ec', windowOpacity:0.4,
      skyTop:'#50545a', skyMid:'#787c80', skyBot:'#a0a4a8',
      fxPreset:'dawn',
      ambientColor:'#d0d4d8', ambientIntensity:1.2,
      dirColor:'#e0e4e8', dirIntensity:0.7,
      fogEnabled:false,
      orbVisible:true, orbColor:'#e8ecee', orbIntensity:1.4, orbHeight:2.8, orbFlicker:false,
    },
    props:[
      { id:'prop_table_batch', cell:'B1', scale:1.0 },
      { id:'prop_table_batch', cell:'N1', scale:1.0 },
      { id:'prop_table_batch', cell:'O1', scale:1.0 },
      { id:'prop_chair_batch', cell:'B3', scale:1.0 },
      { id:'prop_chair_batch', cell:'N3', scale:1.0 },
    ],
    ground:[
      { id:'prop_table_batch', mode:'tile', density:'high' },
      { id:'prop_chair_batch', mode:'tile', density:'med' },
      { id:'prop_mug_batch', mode:'scatter', density:'low' },
    ]},

  { folder:'office-interiors', id:'env_nap_pod_farm', name:'Startup Nap Pod Farm',
    tags:['office','startup','nap','pods'],
    description:'A millennial-pink open plan packed with rows of sleek pod beds and aspirational potted plants.',
    state:{
      groundColor:'#f0c4b4', stageColor:'#f8d8cc', wallColor:'#e8a890',
      groundSize:21, walls:3, windowStyle:'triple', windowColor:'#fff0e4', windowOpacity:0.55,
      skyTop:'#fcb888', skyMid:'#ffd4b0', skyBot:'#ffe8d8',
      fxPreset:'dawn',
      sunColor:'#fff0d0', sunElevation:45, sunVisible:true,
      ambientColor:'#ffd8c0', ambientIntensity:1.3,
      dirColor:'#ffffff', dirIntensity:1.0,
      fogEnabled:false,
      orbVisible:false,
    },
    props:[
      { id:'prop_bed_batch', cell:'B1', scale:1.0 },
      { id:'prop_bed_batch', cell:'N1', scale:1.0 },
      { id:'prop_bed_batch', cell:'O1', scale:1.0 },
      { id:'prop_pottedplant_batch', cell:'B3', scale:1.0 },
      { id:'prop_pottedplant_batch', cell:'O3', scale:1.0 },
    ],
    ground:[
      { id:'prop_bed_batch', mode:'tile', density:'high' },
      { id:'prop_pottedplant_batch', mode:'scatter', density:'med' },
    ]},

  { folder:'office-interiors', id:'env_mgmt_purgatory', name:'Middle-Management Purgatory',
    tags:['office','purgatory','beige','grid'],
    description:'An endless beige grid of cubicle walls under humming fluorescents, not a single window in sight.',
    state:{
      groundColor:'#706860', stageColor:'#908478', wallColor:'#c4b898',
      groundSize:23, walls:3, windowStyle:'none',
      skyTop:'#2a2820', skyMid:'#484038', skyBot:'#706858',
      fxPreset:'night',
      ambientColor:'#b8a888', ambientIntensity:1.0,
      dirColor:'#d8c490', dirIntensity:0.5,
      fogEnabled:true, fogColor:'#604f38', fogDensity:0.04,
      orbVisible:true, orbColor:'#e4d098', orbIntensity:1.3, orbHeight:2.8, orbFlicker:false,
    },
    props:[
      { id:'prop_fence_post', cell:'B1', scale:1.1 },
      { id:'prop_fence_post', cell:'N1', scale:1.1 },
      { id:'prop_fence_post', cell:'O1', scale:1.1 },
      { id:'prop_table_batch', cell:'N3', scale:1.0 },
      { id:'prop_chair_batch', cell:'I3', scale:1.0 },
    ],
    ground:[
      { id:'prop_fence_post', mode:'tile', density:'high' },
      { id:'prop_table_batch', mode:'tile', density:'med' },
      { id:'prop_pottedplant_batch', mode:'scatter', density:'low' },
    ]},

  { folder:'office-interiors', id:'env_mailroom_basement', name:'Mailroom Basement',
    tags:['office','mailroom','basement','parcels'],
    description:'A cramped sub-basement mailroom stacked with parcels, a single dented mailbox overseeing it all.',
    state:{
      groundColor:'#605448', stageColor:'#80705c', wallColor:'#5a4c3c',
      groundSize:15, walls:3, windowStyle:'single', windowColor:'#f8d068', windowOpacity:0.35,
      skyTop:'#0a0804', skyMid:'#1a140c', skyBot:'#302418',
      fxPreset:'night',
      ambientColor:'#b09878', ambientIntensity:0.9,
      dirColor:'#ffc878', dirIntensity:0.5,
      fogEnabled:true, fogColor:'#1a140c', fogDensity:0.05,
      orbVisible:true, orbColor:'#ffc878', orbIntensity:1.4, orbHeight:2.4, orbFlicker:true,
    },
    props:[
      { id:'prop_mailbox', cell:'N1', scale:1.1 },
      { id:'prop_crate', cell:'B3', scale:1.0 },
      { id:'prop_crate', cell:'O3', scale:1.0 },
      { id:'prop_chestdrawers_batch', cell:'B1', scale:1.0 },
      { id:'prop_chestdrawers_batch', cell:'O1', scale:1.0 },
    ],
    ground:[
      { id:'prop_crate', mode:'tile', density:'high' },
      { id:'prop_barrel', mode:'scatter', density:'low' },
    ]},

  // ═══ PLAYFUL (4) ═══

  { folder:'playful', id:'env_therapy_goat_pen', name:'Therapy Goat Pen',
    tags:['playful','goats','pastoral','wholesome'],
    description:'A fenced patch of clover, hay bales, and one extremely relaxed goat munching her way through a crate.',
    state:{
      groundColor:'#5a7038', stageColor:'#7a9048', wallColor:'#6a5a38',
      groundSize:21, walls:0, windowStyle:'none',
      skyTop:'#a0c8e0', skyMid:'#d0e0ec', skyBot:'#f0f0d8',
      fxPreset:'dawn',
      sunColor:'#fff0c0', sunElevation:48, sunVisible:true,
      ambientColor:'#d8dcb0', ambientIntensity:1.3,
      dirColor:'#fff8d0', dirIntensity:1.0,
      fogEnabled:false,
      orbVisible:false,
    },
    props:[
      { id:'prop_fence_post', cell:'B3', scale:1.0 },
      { id:'prop_fence_post', cell:'O3', scale:1.0 },
      { id:'prop_fence_post', cell:'N5', scale:1.0 },
      { id:'prop_log_batch', cell:'N3', scale:1.0 },
      { id:'prop_crate', cell:'B5', scale:0.9 },
    ],
    ground:[
      { id:'prop_grass_patch_batch', mode:'scatter', density:'high' },
      { id:'prop_fence_post', mode:'tile', density:'med' },
      { id:'prop_flower_batch', mode:'scatter', density:'med' },
    ]},

  { folder:'playful', id:'env_birthday_aftermath', name:'Birthday Party Aftermath',
    tags:['playful','birthday','aftermath','chaotic'],
    description:'Streamers drooping, cake smashed on the floor, balloons still bobbing — nobody left to clean up.',
    state:{
      groundColor:'#f0c8d8', stageColor:'#fadde8', wallColor:'#c08098',
      groundSize:17, walls:3, windowStyle:'double', windowColor:'#fff0a0', windowOpacity:0.5,
      skyTop:'#ea8ca0', skyMid:'#ffc0c8', skyBot:'#fff0d8',
      fxPreset:'dusk',
      ambientColor:'#ffb8c8', ambientIntensity:1.2,
      dirColor:'#fff0a0', dirIntensity:0.9,
      fogEnabled:false,
      orbVisible:true, orbColor:'#ffb060', orbIntensity:1.5, orbHeight:2.3, orbFlicker:false,
    },
    props:[
      { id:'prop_table_batch', cell:'N3', scale:1.0 },
      { id:'prop_chair_batch', cell:'B3', scale:1.0 },
      { id:'prop_chair_batch', cell:'O3', scale:1.0 },
      { id:'prop_magic_orb_batch', cell:'B1', scale:1.0 },
      { id:'prop_magic_orb_batch', cell:'O1', scale:1.0 },
    ],
    ground:[
      { id:'prop_magic_orb_batch', mode:'scatter', density:'high' },
      { id:'prop_mug_batch', mode:'scatter', density:'med' },
      { id:'prop_trash_can', mode:'scatter', density:'low' },
    ]},

  { folder:'playful', id:'env_ball_pit_lounge', name:'Ball Pit Lounge',
    tags:['playful','ball-pit','vivid','playroom'],
    description:'A sunken lounge half-drowning in a sea of primary-coloured balls, with beanbags floating on top.',
    state:{
      groundColor:'#3068c8', stageColor:'#3080e0', wallColor:'#7030a8',
      groundSize:19, walls:3, windowStyle:'triple', windowColor:'#fff080', windowOpacity:0.5,
      skyTop:'#2040a0', skyMid:'#5070c8', skyBot:'#a0c0f0',
      fxPreset:'dawn',
      ambientColor:'#a0c0f8', ambientIntensity:1.3,
      dirColor:'#ffffff', dirIntensity:1.0,
      fogEnabled:false,
      orbVisible:true, orbColor:'#ffe850', orbIntensity:1.8, orbHeight:2.8, orbFlicker:false,
    },
    props:[
      { id:'prop_sofa_batch', cell:'N3', scale:1.1 },
      { id:'prop_magic_orb_batch', cell:'B3', scale:1.1 },
      { id:'prop_magic_orb_batch', cell:'O3', scale:1.1 },
      { id:'prop_magic_orb_batch', cell:'N1', scale:1.0 },
      { id:'prop_magic_orb_batch', cell:'B5', scale:1.0 },
    ],
    ground:[
      { id:'prop_magic_orb_batch', mode:'scatter', density:'high' },
      { id:'prop_magic_orb_batch', mode:'tile', density:'high' },
      { id:'prop_cloud_batch', mode:'scatter', density:'low' },
    ]},

  { folder:'playful', id:'env_haunted_playground', name:'Haunted Playground',
    tags:['playful','haunted','abandoned','overgrown'],
    description:'A rusted swing set in fog, stumps and logs crooked at odd angles, something watching from the slide.',
    state:{
      groundColor:'#3a4a38', stageColor:'#586858', wallColor:'#4a4638',
      groundSize:21, walls:0, windowStyle:'none',
      skyTop:'#202a30', skyMid:'#384848', skyBot:'#5a6058',
      fxPreset:'night',
      ambientColor:'#708078', ambientIntensity:0.8,
      dirColor:'#b0b890', dirIntensity:0.4,
      fogEnabled:true, fogColor:'#3a4840', fogDensity:0.08,
      orbVisible:true, orbColor:'#b0d880', orbIntensity:1.4, orbHeight:2.4, orbFlicker:true,
    },
    props:[
      { id:'prop_scaffold', cell:'N1', scale:1.1 },
      { id:'prop_dead_tree', cell:'B3', scale:1.2 },
      { id:'prop_stump_batch', cell:'N3', scale:1.0 },
      { id:'prop_log_batch', cell:'O3', scale:1.0 },
      { id:'prop_fence_post', cell:'B5', scale:1.0 },
    ],
    ground:[
      { id:'prop_stump_batch', mode:'scatter', density:'high' },
      { id:'prop_log_batch', mode:'scatter', density:'med' },
      { id:'prop_grass_patch_batch', mode:'scatter', density:'high' },
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
console.log(`Wrote ${BATCH.length} batch-3 envs with stage + ground dressing.`);
console.log(`Manifest: ${total} envs across ${Object.keys(categories).length} categories.`);
