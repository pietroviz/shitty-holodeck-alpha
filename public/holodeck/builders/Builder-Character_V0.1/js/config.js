// ── Default Colors (4 zones, top → bottom) ───────────
export const DEFAULT_COLORS = {
    scalp:  '#8b2020',   // top cap — hair zone
    skin:   '#ffcc88',   // face zone
    torso:  '#7b4daa',   // main body / clothing
    bottom: '#3a2870',   // bottom cap — pants / skirt
};

// ── Character Base Dimensions ──────────────────────────
export const CHARACTER = {
    floatHeight: 0.15,          // consistent hover distance above ground
    boxSegments: 4,             // RoundedBoxGeometry segment count (smoothness)
    cornerRadius: 0.13,         // matches scalp & bottom zone height (24px in diagram)
};

// ── Head Dimensions (separate mesh) ───────────────────
export const HEAD = {
    depthRatio:     1.0,        // head depth relative to head width
    cornerRadius:   0.12,       // rounded corners on head box
    segments:       4,          // RoundedBoxGeometry segments
    neckGap:        0.02,       // fixed gap between body top and head bottom
    scalpFraction:  0.17,       // top 17% of head is scalp color zone
};

// ── Color Zone Heights (fixed — only Torso stretches) ──
export const COLOR_ZONES = {
    scalpHeight:  0.13,   // fixed height of scalp cap (= corner radius)
    skinHeight:   0.62,   // fixed height of face/skin area (111px in diagram)
    bottomHeight: 0.13,   // fixed height of bottom cap (= corner radius)
    // torsoHeight = totalHeight - scalpHeight - skinHeight - bottomHeight (computed at runtime)
};

// ── Face Rig Dimensions ────────────────────────────────
export const FACE_RIG = {
    size: 0.46,  // fixed square: 0.42 × 1.10 = 0.46 (10% larger)
};

// ── Face Feature Dimensions ──────────────────────────
export const FACE_FEATURES = {
    eye: {
        scleraDiameter: 0.138,       // 30px in 100px=0.46 diagram
        pupilDiameter:  0.069,       // half of sclera
        scleraColor:    '#ffffff',
        pupilColor:     '#1a1a1a',
        // X offset from center, keyed by body width preset
        xOffsetByWidth: {
            narrow: 0.078, moderate: 0.120, wide: 0.161,
        },
        // Y offset above center, keyed by body height preset
        yOffsetByHeight: {
            squat: 0.037, medium: 0.078, tall: 0.120,
        },
    },
    mouth: {
        width:  0.147,               // 32px
        height: 0.023,               // 5px
        color:  '#1a1a1a',
        cornerRadius: 0.0115,        // half height → full pill ends
        // Y offset below center, keyed by body height preset
        yOffsetByHeight: {
            squat: 0.037, medium: 0.078, tall: 0.120,
        },
    },
};

// ── Face Placement Presets ─────────────────────────────
export const FACE_PLACEMENT_PRESETS = {
    high: { offset:  0.10, label: 'High' },   // subtle shift up
    mid:  { offset:  0.00, label: 'Mid' },     // centered (default)
    low:  { offset: -0.10, label: 'Low' },     // subtle shift down
};

// ── Hand Dimensions ───────────────────────────────────
export const HAND = {
    // Base dimensions at Moderate body width (0.652) — 30% bigger than original
    baseWidth:  0.234,   // X — widest dimension (was 0.18 × 1.30)
    baseHeight: 0.182,   // Y — shorter (was 0.14 × 1.30)
    baseDepth:  0.130,   // Z — thickness (was 0.10 × 1.30)
    cornerRadius: 0.059, // aggressively rounded (was 0.045 × 1.30)
    segments: 3,         // RoundedBoxGeometry segments
    referenceBodyWidth: 0.652, // scale factor reference (new moderate width)
};

// ── Body Size Presets (body mesh only — head is independent) ─
export const BODY_HEIGHT_PRESETS = {
    squat:   { height: 0.50, label: 'Squat' },
    medium:  { height: 0.72, label: 'Medium' },
    tall:    { height: 0.95, label: 'Tall' },
};

export const BODY_WIDTH_PRESETS = {
    narrow:   { width: 0.476, label: 'Narrow' },
    moderate: { width: 0.652, label: 'Moderate' },
    wide:     { width: 0.85, label: 'Wide' },
};

// ── Head Size Presets (independent from body) ────────────
export const HEAD_HEIGHT_PRESETS = {
    squat:   { height: 0.44, label: 'Squat' },
    medium:  { height: 0.58, label: 'Medium' },
    tall:    { height: 0.72, label: 'Tall' },
};

export const HEAD_WIDTH_PRESETS = {
    narrow:   { width: 0.40, label: 'Narrow' },
    moderate: { width: 0.55, label: 'Moderate' },
    wide:     { width: 0.72, label: 'Wide' },
};

// ── Base Bone Positions ────────────────────────────────
export const BASE_BONES = {
    spine: {
        'mixamorig:Spine':       0.10,
        'mixamorig:Spine1':      0.12,
        'mixamorig:Spine2':      0.12,
        'mixamorig:Neck':        0.10,
        'mixamorig:Head':        0.08,
        'mixamorig:HeadTop_End': 0.25,
    },

    arms: {
        shoulder: { x: 0.05, y: 0.05 },
        upperArm: { x: 0.084 },
        foreArm:  { x: 0.175 },
        hand:     { x: 0.154 },
    },

    legs: {
        hip:      { x: 0.05, y: -0.024 },  // tight, hidden inside body (20% longer)
        upperLeg: { y: -0.096 },            // stubby — stays inside body (20% longer)
        lowerLeg: { y: -0.096 },            // stubby — stays inside body (20% longer)
        foot:     { y: 0, z: 0.02 },        // tiny
        toe:      { z: 0.01 },              // tiny
    },
};

// ── Bone Hierarchy ─────────────────────────────────────
export const BONE_HIERARCHY = {
    'mixamorig:Hips': ['mixamorig:Spine', 'mixamorig:LeftUpLeg', 'mixamorig:RightUpLeg'],
    'mixamorig:Spine': ['mixamorig:Spine1'],
    'mixamorig:Spine1': ['mixamorig:Spine2'],
    'mixamorig:Spine2': ['mixamorig:Neck', 'mixamorig:LeftShoulder', 'mixamorig:RightShoulder'],
    'mixamorig:Neck': ['mixamorig:Head'],
    'mixamorig:Head': ['mixamorig:HeadTop_End'],

    'mixamorig:LeftShoulder': ['mixamorig:LeftArm'],
    'mixamorig:LeftArm': ['mixamorig:LeftForeArm'],
    'mixamorig:LeftForeArm': ['mixamorig:LeftHand'],

    'mixamorig:RightShoulder': ['mixamorig:RightArm'],
    'mixamorig:RightArm': ['mixamorig:RightForeArm'],
    'mixamorig:RightForeArm': ['mixamorig:RightHand'],

    'mixamorig:LeftUpLeg': ['mixamorig:LeftLeg'],
    'mixamorig:LeftLeg': ['mixamorig:LeftFoot'],
    'mixamorig:LeftFoot': ['mixamorig:LeftToeBase'],
    'mixamorig:LeftToeBase': ['mixamorig:LeftToeBase_End'],

    'mixamorig:RightUpLeg': ['mixamorig:RightLeg'],
    'mixamorig:RightLeg': ['mixamorig:RightFoot'],
    'mixamorig:RightFoot': ['mixamorig:RightToeBase'],
    'mixamorig:RightToeBase': ['mixamorig:RightToeBase_End'],
};

// ── Eye Rig Dimensions ──────────────────────────────
export const EYE_RIG = {
    canvasSize: 128,
    planeSize: 0.15,          // Three.js units — slightly larger than old sclera (0.138)
    irisColor: '#4a7a8c',     // muted teal-blue default
    pupilColor: '#0a0a0a',
    scleraColor: '#ffffff',
    pupilSize: 0.35,          // relative to iris radius
    irisSize: 0.65,           // relative to sclera radius
    highlightColor: '#ffffff',
    highlightSize: 0.12,      // relative to sclera radius
};

// ── Eye Shape Presets ────────────────────────────────
export const EYE_SHAPES = {
    circle:        { label: 'Circle',      rxMul: 1.0,  ryMul: 1.0,  rounded: false },
    tallPill:      { label: 'Tall Pill',   rxMul: 0.62, ryMul: 1.12, rounded: false },
    widePill:      { label: 'Wide Pill',   rxMul: 1.2,  ryMul: 0.58, rounded: false },
    roundedSquare: { label: 'Rounded Sq',  rxMul: 0.88, ryMul: 0.88, rounded: true  },
    tallOval:      { label: 'Tall Oval',   rxMul: 0.72, ryMul: 1.08, rounded: false },
    wideOval:      { label: 'Wide Oval',   rxMul: 1.15, ryMul: 0.68, rounded: false },
};

// ── Mouth Rig Dimensions ─────────────────────────────
export const MOUTH_RIG = {
    planeSize: 0.30,          // Three.js units — square plane for mouth texture
    canvasSize: 256,          // power-of-2 canvas resolution
    interiorColor: '#2a1015', // dark mouth interior
    tongueColor: '#c44055',
    upperTeethColor: '#f0eee8',
    lowerTeethColor: '#e8e6e0',
    lipColor: '#d4626e',
    lipThickness: 3.5,        // stroke width in canvas units
};

// ── Viseme Definitions ───────────────────────────────
// Each viseme defines 5 blendable parameters (0–1 range).
// jawOpen is overridden at runtime by audio amplitude.
export const VISEMES = {
    REST: { jawOpen: 0.0,  lipWidth: 0.45, lipRound: 0.0, tongueUp: 0.0, teethShow: 0.0, label: 'Rest' },
    PP:   { jawOpen: 0.0,  lipWidth: 0.35, lipRound: 0.0, tongueUp: 0.0, teethShow: 0.0, label: 'P/B/M' },
    FF:   { jawOpen: 0.15, lipWidth: 0.4,  lipRound: 0.0, tongueUp: 0.0, teethShow: 0.6, label: 'F/V' },
    TH:   { jawOpen: 0.2,  lipWidth: 0.45, lipRound: 0.0, tongueUp: 0.8, teethShow: 0.4, label: 'TH' },
    DD:   { jawOpen: 0.25, lipWidth: 0.45, lipRound: 0.0, tongueUp: 0.6, teethShow: 0.3, label: 'D/T/N' },
    KK:   { jawOpen: 0.35, lipWidth: 0.45, lipRound: 0.0, tongueUp: 0.2, teethShow: 0.2, label: 'K/G' },
    LL:   { jawOpen: 0.2,  lipWidth: 0.45, lipRound: 0.0, tongueUp: 0.9, teethShow: 0.2, label: 'L' },
    RR:   { jawOpen: 0.2,  lipWidth: 0.4,  lipRound: 0.3, tongueUp: 0.5, teethShow: 0.1, label: 'R' },
    SS:   { jawOpen: 0.1,  lipWidth: 0.4,  lipRound: 0.0, tongueUp: 0.4, teethShow: 0.5, label: 'S/Z' },
    SH:   { jawOpen: 0.15, lipWidth: 0.3,  lipRound: 0.5, tongueUp: 0.3, teethShow: 0.3, label: 'SH/CH' },
    AA:   { jawOpen: 0.85, lipWidth: 0.55, lipRound: 0.0, tongueUp: 0.0, teethShow: 0.4, label: 'AH' },
    EE:   { jawOpen: 0.3,  lipWidth: 0.7,  lipRound: 0.0, tongueUp: 0.3, teethShow: 0.5, label: 'EE' },
    OO:   { jawOpen: 0.4,  lipWidth: 0.2,  lipRound: 0.9, tongueUp: 0.0, teethShow: 0.1, label: 'OO' },
    OH:   { jawOpen: 0.6,  lipWidth: 0.3,  lipRound: 0.6, tongueUp: 0.0, teethShow: 0.2, label: 'OH' },
    WW:   { jawOpen: 0.2,  lipWidth: 0.15, lipRound: 1.0, tongueUp: 0.0, teethShow: 0.0, label: 'W' },
    AW:   { jawOpen: 0.7,  lipWidth: 0.4,  lipRound: 0.4, tongueUp: 0.0, teethShow: 0.3, label: 'AW' },
};

// ── Letter → Viseme Mapping ──────────────────────────
export const DIGRAPH_MAP = {
    'th': 'TH', 'sh': 'SH', 'ch': 'SH', 'wh': 'WW', 'ph': 'FF',
    'ng': 'KK', 'ck': 'KK', 'qu': 'WW', 'oo': 'OO', 'ee': 'EE',
    'ou': 'AW', 'ow': 'AW', 'aw': 'AW', 'au': 'AW', 'ai': 'AA',
    'ay': 'AA', 'ea': 'EE', 'oi': 'OH', 'oy': 'OH',
};

export const LETTER_MAP = {
    'a': 'AA', 'b': 'PP', 'c': 'KK', 'd': 'DD', 'e': 'EE',
    'f': 'FF', 'g': 'KK', 'h': 'KK', 'i': 'EE', 'j': 'SH',
    'k': 'KK', 'l': 'LL', 'm': 'PP', 'n': 'DD', 'o': 'OH',
    'p': 'PP', 'q': 'KK', 'r': 'RR', 's': 'SS', 't': 'DD',
    'u': 'OO', 'v': 'FF', 'w': 'WW', 'x': 'SS', 'y': 'EE',
    'z': 'SS',
};

// ── Voice Presets ────────────────────────────────────
export const VOICE_PRESETS = {
    'narrator':  { label: 'Narrator',  variant: 'm3',       pitch: 40, speed: 155, amplitude: 100, wordgap: 1,  reverb: 15, wobble: 0,  wobbleSpeed: 5,  brightness: 0,   breathiness: 0,  vocalFry: 0,  chorus: 10 },
    'male':      { label: 'Male',      variant: 'm2',       pitch: 35, speed: 170, amplitude: 110, wordgap: 0,  reverb: 0,  wobble: 0,  wobbleSpeed: 5,  brightness: 0,   breathiness: 0,  vocalFry: 0,  chorus: 0 },
    'female':    { label: 'Female',    variant: 'f2',       pitch: 60, speed: 170, amplitude: 100, wordgap: 0,  reverb: 0,  wobble: 0,  wobbleSpeed: 5,  brightness: 5,   breathiness: 10, vocalFry: 0,  chorus: 0 },
    'child':     { label: 'Child',     variant: 'f1',       pitch: 85, speed: 200, amplitude: 100, wordgap: 0,  reverb: 0,  wobble: 0,  wobbleSpeed: 5,  brightness: 10,  breathiness: 0,  vocalFry: 0,  chorus: 0 },
    'old-man':   { label: 'Old Man',   variant: 'croak',    pitch: 30, speed: 120, amplitude: 90,  wordgap: 3,  reverb: 10, wobble: 15, wobbleSpeed: 3,  brightness: -15, breathiness: 15, vocalFry: 15, chorus: 0 },
    'old-woman': { label: 'Old Woman', variant: 'f4',       pitch: 45, speed: 120, amplitude: 85,  wordgap: 3,  reverb: 10, wobble: 18, wobbleSpeed: 3,  brightness: -10, breathiness: 20, vocalFry: 10, chorus: 0 },
    'robot':     { label: 'Robot',     variant: 'klatt3',   pitch: 50, speed: 140, amplitude: 100, wordgap: 2,  reverb: 20, wobble: 0,  wobbleSpeed: 5,  brightness: 30,  breathiness: 0,  vocalFry: 0,  chorus: 30 },
    'alien':     { label: 'Alien',     variant: 'klatt2',   pitch: 90, speed: 200, amplitude: 80,  wordgap: 0,  reverb: 30, wobble: 12, wobbleSpeed: 6,  brightness: 20,  breathiness: 0,  vocalFry: 0,  chorus: 25 },
    'demon':     { label: 'Demon',     variant: 'm7',       pitch: 5,  speed: 90,  amplitude: 140, wordgap: 4,  reverb: 50, wobble: 15, wobbleSpeed: 2,  brightness: -25, breathiness: 0,  vocalFry: 25, chorus: 20 },
    'ghost':     { label: 'Ghost',     variant: 'whisperf', pitch: 60, speed: 130, amplitude: 40,  wordgap: 6,  reverb: 30, wobble: 15, wobbleSpeed: 4,  brightness: -20, breathiness: 20, vocalFry: 0,  chorus: 15 },
    'fairy':     { label: 'Fairy',     variant: 'f5',       pitch: 95, speed: 210, amplitude: 60,  wordgap: 0,  reverb: 25, wobble: 20, wobbleSpeed: 8,  brightness: 40,  breathiness: 12, vocalFry: 0,  chorus: 20 },
};

export const VOICE_DEFAULTS = {
    params: { speed: 175, pitch: 50, volume: 100, amplitude: 100, wordgap: 0 },
    effects: { reverb: 0, wobble: 0, wobbleSpeed: 5, brightness: 0, breathiness: 0, vocalFry: 0, chorus: 0 },
};

// ── Animation Files ────────────────────────────────────
// Display names are derived from filenames automatically:
//   "animations/Dancing - Hiphop.fbx"            → "Dancing - Hiphop"
//   "animations/Idle~standing-subtle-sway.fbx"   → "Idle"
// Text after ~ is LLM context (hidden from UI). Just rename the FBX file to change the label.
// ── Headwear — Hair Styles (from asset library) ────
export const HAIR_STYLES = {
    none:           { label: 'None' },
    prop_afro:      { label: 'Afro' },
    prop_mohawk:    { label: 'Mohawk' },
    prop_hair_bow:  { label: 'Hair Bow' },
};

// ── Headwear — Hat Styles (from asset library) ─────
export const HAT_STYLES = {
    none:                 { label: 'None' },
    prop_baseball_cap:    { label: 'Baseball Cap' },
    prop_cowboy_hat:      { label: 'Cowboy Hat' },
    prop_crown:           { label: 'Crown' },
    prop_top_hat:         { label: 'Top Hat' },
    prop_wizard_hat:      { label: 'Wizard Hat' },
    prop_santa_hat:       { label: 'Santa Hat' },
    prop_pirate_hat:      { label: 'Pirate Hat' },
    prop_sun_hat:         { label: 'Sun Hat' },
    prop_tiara:           { label: 'Tiara' },
    prop_grad_cap:        { label: 'Grad Cap' },
    prop_helmet:          { label: 'Helmet' },
    prop_army_helmet:     { label: 'Army Helmet' },
    prop_knight_helm:     { label: 'Knight Helm' },
    prop_viking_helmet:   { label: 'Viking Helmet' },
    prop_bunny_ears:      { label: 'Bunny Ears' },
    prop_fox_ears:        { label: 'Fox Ears' },
};

// ── Headwear Manifest (for preloading) ─────────────
export const HEADWEAR_MANIFEST = [
    ...Object.keys(HAIR_STYLES).filter(k => k !== 'none'),
    ...Object.keys(HAT_STYLES).filter(k => k !== 'none'),
].map(id => ({
    id,
    path: `assets/objects/fashion/headwear/${id}.json`,
}));

// ── Glasses Styles (from asset library) ──────────────
export const GLASSES_STYLES = {
    none:                { label: 'None' },
    prop_round_glasses:  { label: 'Round' },
    prop_square_glasses: { label: 'Square' },
    prop_sunglasses:     { label: 'Sunglasses' },
    prop_monocle:        { label: 'Monocle' },
    prop_heart_glasses:  { label: 'Heart' },
    prop_eye_patch:      { label: 'Eye Patch' },
};

// ── Glasses Manifest (for preloading) ────────────────
export const GLASSES_MANIFEST = Object.keys(GLASSES_STYLES)
    .filter(k => k !== 'none')
    .map(id => ({ id, path: `assets/objects/fashion/glasses/${id}.json` }));

// ── Facial Hair Styles (from asset library) ──────────
export const FACIAL_HAIR_STYLES = {
    none:              { label: 'None' },
    prop_mustache:     { label: 'Mustache' },
    prop_full_beard:   { label: 'Full Beard' },
    prop_goatee:       { label: 'Goatee' },
    prop_soul_patch:   { label: 'Soul Patch' },
    prop_long_beard:   { label: 'Long Beard' },
};

// ── Facial Hair Manifest (for preloading) ────────────
export const FACIAL_HAIR_MANIFEST = Object.keys(FACIAL_HAIR_STYLES)
    .filter(k => k !== 'none')
    .map(id => ({ id, path: `assets/objects/fashion/facial_hair/${id}.json` }));

// ── Character Manifest (bundled characters to seed into DB) ──
export const CHARACTER_MANIFEST = [
    { id: 'char_tayne', path: 'assets/characters/char_tayne.json' },
    { id: 'char_gandara_the_wise', path: 'assets/characters/char_gandara_the_wise.json' },
    { id: 'char_thorin_stonebreaker', path: 'assets/characters/char_thorin_stonebreaker.json' },
    { id: 'char_sylvaris', path: 'assets/characters/char_sylvaris.json' },
    { id: 'char_lady_ironheart', path: 'assets/characters/char_lady_ironheart.json' },
    { id: 'char_grimjaw_the_barbarian', path: 'assets/characters/char_grimjaw_the_barbarian.json' },
    { id: 'char_nyx_shadowstep', path: 'assets/characters/char_nyx_shadowstep.json' },
    { id: 'char_seraphina_brightflame', path: 'assets/characters/char_seraphina_brightflame.json' },
    { id: 'char_brother_cedric', path: 'assets/characters/char_brother_cedric.json' },
    { id: 'char_captain_blacktide', path: 'assets/characters/char_captain_blacktide.json' },
    { id: 'char_willow_moonwhisper', path: 'assets/characters/char_willow_moonwhisper.json' },
    { id: 'char_zephyr_the_bard', path: 'assets/characters/char_zephyr_the_bard.json' },
    { id: 'char_valkyrie_skald', path: 'assets/characters/char_valkyrie_skald.json' },
    { id: 'char_grogg_the_ogre', path: 'assets/characters/char_grogg_the_ogre.json' },
    { id: 'char_luna_starweaver', path: 'assets/characters/char_luna_starweaver.json' },
    { id: 'char_ragnar_wolfblood', path: 'assets/characters/char_ragnar_wolfblood.json' },
    { id: 'char_pip_tinkersprocket', path: 'assets/characters/char_pip_tinkersprocket.json' },
    { id: 'char_morgana_hexweaver', path: 'assets/characters/char_morgana_hexweaver.json' },
    { id: 'char_paladin_auric', path: 'assets/characters/char_paladin_auric.json' },
    { id: 'char_faye_windrunner', path: 'assets/characters/char_faye_windrunner.json' },
    { id: 'char_the_necromancer', path: 'assets/characters/char_the_necromancer.json' },
    { id: 'char_rod_sterling', path: 'assets/characters/char_rod_sterling.json' },
    { id: 'char_chef_ramona', path: 'assets/characters/char_chef_ramona.json' },
    { id: 'char_detective_matsuda', path: 'assets/characters/char_detective_matsuda.json' },
    { id: 'char_dr_priya_singh', path: 'assets/characters/char_dr_priya_singh.json' },
    { id: 'char_sitcom_steve', path: 'assets/characters/char_sitcom_steve.json' },
    { id: 'char_reality_quinn', path: 'assets/characters/char_reality_quinn.json' },
    { id: 'char_gameshow_gary', path: 'assets/characters/char_gameshow_gary.json' },
    { id: 'char_soap_star_sandra', path: 'assets/characters/char_soap_star_sandra.json' },
    { id: 'char_news_anchor_nkechi', path: 'assets/characters/char_news_anchor_nkechi.json' },
    { id: 'char_weather_wes', path: 'assets/characters/char_weather_wes.json' },
    { id: 'char_captain_cosmos', path: 'assets/characters/char_captain_cosmos.json' },
    { id: 'char_judge_fontaine', path: 'assets/characters/char_judge_fontaine.json' },
    { id: 'char_survival_sam', path: 'assets/characters/char_survival_sam.json' },
    { id: 'char_fashion_fatima', path: 'assets/characters/char_fashion_fatima.json' },
    { id: 'char_talk_show_tanya', path: 'assets/characters/char_talk_show_tanya.json' },
    { id: 'char_professor_pendleton', path: 'assets/characters/char_professor_pendleton.json' },
    { id: 'char_crime_boss_carlo', path: 'assets/characters/char_crime_boss_carlo.json' },
    { id: 'char_cartoon_villainess', path: 'assets/characters/char_cartoon_villainess.json' },
    { id: 'char_sports_commentator_rio', path: 'assets/characters/char_sports_commentator_rio.json' },
    { id: 'char_forensic_dr_lee', path: 'assets/characters/char_forensic_dr_lee.json' },
    { id: 'char_streamerking', path: 'assets/characters/char_streamerking.json' },
    { id: 'char_influencer_aria', path: 'assets/characters/char_influencer_aria.json' },
    { id: 'char_meme_lord_dave', path: 'assets/characters/char_meme_lord_dave.json' },
    { id: 'char_tech_bro_tyler', path: 'assets/characters/char_tech_bro_tyler.json' },
    { id: 'char_e_girl_sakura', path: 'assets/characters/char_e_girl_sakura.json' },
    { id: 'char_podcast_pat', path: 'assets/characters/char_podcast_pat.json' },
    { id: 'char_hacker_zero', path: 'assets/characters/char_hacker_zero.json' },
    { id: 'char_vlogger_valentina', path: 'assets/characters/char_vlogger_valentina.json' },
    { id: 'char_crypto_chad', path: 'assets/characters/char_crypto_chad.json' },
    { id: 'char_digital_artist_zuri', path: 'assets/characters/char_digital_artist_zuri.json' },
    { id: 'char_moderator_max', path: 'assets/characters/char_moderator_max.json' },
    { id: 'char_tiktok_tiana', path: 'assets/characters/char_tiktok_tiana.json' },
    { id: 'char_bot_9000', path: 'assets/characters/char_bot_9000.json' },
    { id: 'char_content_creator_chris', path: 'assets/characters/char_content_creator_chris.json' },
    { id: 'char_social_media_manager_sal', path: 'assets/characters/char_social_media_manager_sal.json' },
    { id: 'char_cosplay_queen_keiko', path: 'assets/characters/char_cosplay_queen_keiko.json' },
    { id: 'char_gamer_gio', path: 'assets/characters/char_gamer_gio.json' },
    { id: 'char_virtual_vee', path: 'assets/characters/char_virtual_vee.json' },
    { id: 'char_troll_terrence', path: 'assets/characters/char_troll_terrence.json' },
    { id: 'char_commander_vasquez', path: 'assets/characters/char_commander_vasquez.json' },
    { id: 'char_unit_7_android', path: 'assets/characters/char_unit_7_android.json' },
    { id: 'char_ambassador_zyloth', path: 'assets/characters/char_ambassador_zyloth.json' },
    { id: 'char_bounty_hunter_rex', path: 'assets/characters/char_bounty_hunter_rex.json' },
    { id: 'char_cyborg_kai', path: 'assets/characters/char_cyborg_kai.json' },
    { id: 'char_space_marine_okonkwo', path: 'assets/characters/char_space_marine_okonkwo.json' },
    { id: 'char_dr_elara_quantum', path: 'assets/characters/char_dr_elara_quantum.json' },
    { id: 'char_pilot_jax', path: 'assets/characters/char_pilot_jax.json' },
    { id: 'char_engineer_mei_lin', path: 'assets/characters/char_engineer_mei_lin.json' },
    { id: 'char_medic_nova', path: 'assets/characters/char_medic_nova.json' },
    { id: 'char_xenobiologist_orin', path: 'assets/characters/char_xenobiologist_orin.json' },
    { id: 'char_ai_aria', path: 'assets/characters/char_ai_aria.json' },
    { id: 'char_time_agent_sato', path: 'assets/characters/char_time_agent_sato.json' },
    { id: 'char_clone_trooper_delta', path: 'assets/characters/char_clone_trooper_delta.json' },
    { id: 'char_mech_pilot_yuki', path: 'assets/characters/char_mech_pilot_yuki.json' },
    { id: 'char_asteroid_miner_kofi', path: 'assets/characters/char_asteroid_miner_kofi.json' },
    { id: 'char_rebel_leader_ash', path: 'assets/characters/char_rebel_leader_ash.json' },
    { id: 'char_navigator_luna', path: 'assets/characters/char_navigator_luna.json' },
    { id: 'char_diplomat_chen', path: 'assets/characters/char_diplomat_chen.json' },
    { id: 'char_quantum_ghost', path: 'assets/characters/char_quantum_ghost.json' },
    { id: 'char_gronk_the_goblin', path: 'assets/characters/char_gronk_the_goblin.json' },
    { id: 'char_grasha_the_orc', path: 'assets/characters/char_grasha_the_orc.json' },
    { id: 'char_elder_troll', path: 'assets/characters/char_elder_troll.json' },
    { id: 'char_bones_mcgee', path: 'assets/characters/char_bones_mcgee.json' },
    { id: 'char_phantom_wraith', path: 'assets/characters/char_phantom_wraith.json' },
    { id: 'char_count_drakul', path: 'assets/characters/char_count_drakul.json' },
    { id: 'char_luna_fang', path: 'assets/characters/char_luna_fang.json' },
    { id: 'char_shambler', path: 'assets/characters/char_shambler.json' },
    { id: 'char_infernal_damien', path: 'assets/characters/char_infernal_damien.json' },
    { id: 'char_seraph', path: 'assets/characters/char_seraph.json' },
    { id: 'char_pixie_dust', path: 'assets/characters/char_pixie_dust.json' },
    { id: 'char_coral_the_merfolk', path: 'assets/characters/char_coral_the_merfolk.json' },
    { id: 'char_thunderhoof', path: 'assets/characters/char_thunderhoof.json' },
    { id: 'char_asterion', path: 'assets/characters/char_asterion.json' },
    { id: 'char_ember_dragonkin', path: 'assets/characters/char_ember_dragonkin.json' },
    { id: 'char_blobsworth', path: 'assets/characters/char_blobsworth.json' },
    { id: 'char_iron_golem', path: 'assets/characters/char_iron_golem.json' },
    { id: 'char_oakbeard', path: 'assets/characters/char_oakbeard.json' },
    { id: 'char_phoenix_ember', path: 'assets/characters/char_phoenix_ember.json' },
    { id: 'char_shadow_whisper', path: 'assets/characters/char_shadow_whisper.json' },
];

export const DEFAULT_CHARACTER_ID = 'char_tayne';

export const ANIMATION_FILES = [
    'animations/Standing (Idle)~slight hand movement.fbx',
    'animations/Talking (Normal)~standing, arm movement, slight head movement.fbx',
    'animations/Talking (Calm)~standing, arm movement, slight head movement.fbx',
    'animations/Talking (Argue)~standing, agressive arms.fbx',
    'animations/Talking (Phone)~agreeable head movement, some hand movement and slow body rotation turning left and right.fbx',
    'animations/Dancing (Hip Hop)~90s style running on the spot.fbx',
    'animations/Dancing (Salsa)~lots of hips and arm movement.fbx',
    'animations/Dancing (Twerk)~lots of bum shaking.fbx',
];
