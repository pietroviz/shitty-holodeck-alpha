/**
 * charConfig.js — Character builder constants, presets, and dimensions.
 * Shared module extracted from Builder-Character_V0.1/js/config.js.
 */

// ── Default Colors (4 zones, top → bottom) ───────────
export const DEFAULT_COLORS = {
    scalp:  '#8b2020',
    skin:   '#ffcc88',
    torso:  '#7b4daa',
    bottom: '#3a2870',
};

// ── Character Base Dimensions ──────────────────────────
export const CHARACTER = {
    floatHeight: 0.15,
    boxSegments: 4,
    cornerRadius: 0.13,
};

// ── Head Dimensions (separate mesh) ───────────────────
export const HEAD = {
    depthRatio:     1.0,
    cornerRadius:   0.12,
    segments:       4,
    neckGap:        0.02,
    scalpFraction:  0.17,
};

// ── Color Zone Heights ──────────────────────────────────
export const COLOR_ZONES = {
    scalpHeight:  0.13,
    skinHeight:   0.594,
    bottomHeight: 0.156,
};

// ── Face Feature Dimensions ──────────────────────────
export const FACE_FEATURES = {
    eye: {
        scleraDiameter: 0.138,
        pupilDiameter:  0.069,
        scleraColor:    '#ffffff',
        pupilColor:     '#1a1a1a',
        xOffsetByWidth: {
            narrow: 0.078, moderate: 0.120, wide: 0.161,
        },
        yOffsetByHeight: {
            squat: 0.037, medium: 0.078, tall: 0.120,
        },
    },
    mouth: {
        width:  0.147,
        height: 0.023,
        color:  '#1a1a1a',
        cornerRadius: 0.0115,
        yOffsetByHeight: {
            squat: 0.037, medium: 0.078, tall: 0.120,
        },
    },
};

// ── Face Placement Presets ─────────────────────────────
export const FACE_PLACEMENT_PRESETS = {
    high: { offset:  0.10, label: 'High' },
    mid:  { offset:  0.00, label: 'Mid' },
    low:  { offset: -0.10, label: 'Low' },
};

// ── Hand Dimensions ───────────────────────────────────
export const HAND = {
    baseWidth:  0.234,
    baseHeight: 0.182,
    baseDepth:  0.130,
    cornerRadius: 0.059,
    segments: 3,
    referenceBodyWidth: 0.652,
};

// ── Body Size Presets ────────────────────────────────────
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

// ── Head Size Presets ───────────────────────────────────
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
        hip:      { x: 0.05, y: -0.024 },
        upperLeg: { y: -0.096 },
        lowerLeg: { y: -0.096 },
        foot:     { y: 0, z: 0.02 },
        toe:      { z: 0.01 },
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
    planeSize: 0.15,
    irisColor: '#808080',
    pupilColor: '#0a0a0a',
    scleraColor: '#ffffff',
    pupilSize: 0.35,
    irisSize: 0.65,
    highlightColor: '#ffffff',
    highlightSize: 0.12,
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

// ── Eyelash Style Presets ────────────────────────────
export const EYELASH_STYLES = {
    none:      { label: 'None' },
    thin:      { label: 'Thin',     count: 4, length: 0.22, curve: 0.15 },
    natural:   { label: 'Natural',  count: 5, length: 0.28, curve: 0.20 },
    thick:     { label: 'Thick',    count: 6, length: 0.30, curve: 0.18, width: 2.5 },
    dramatic:  { label: 'Dramatic', count: 7, length: 0.38, curve: 0.25, width: 2.0 },
    bottom:    { label: 'Bottom',   count: 3, length: 0.15, curve: 0.10, bottomOnly: true },
};

// ── Eyebrow Style Presets ────────────────────────────
export const EYEBROW_STYLES = {
    none:       { label: 'None' },
    thin:       { label: 'Thin',      thickness: 0.08, arch: 0.15, taper: 0.6 },
    natural:    { label: 'Natural',   thickness: 0.12, arch: 0.20, taper: 0.5 },
    thick:      { label: 'Thick',     thickness: 0.18, arch: 0.18, taper: 0.4 },
    bushy:      { label: 'Bushy',     thickness: 0.24, arch: 0.12, taper: 0.3 },
    arched:     { label: 'Arched',    thickness: 0.12, arch: 0.35, taper: 0.5 },
    angry:      { label: 'Angry',     thickness: 0.15, arch: -0.15, taper: 0.4 },
    flat:       { label: 'Flat',      thickness: 0.14, arch: 0.0,  taper: 0.5 },
};

// ── Mouth Rig Dimensions ─────────────────────────────
export const MOUTH_RIG = {
    planeSize: 0.30,
    canvasSize: 256,
    interiorColor: '#2a1015',
    tongueColor: '#c44055',
    upperTeethColor: '#f0eee8',
    lowerTeethColor: '#e8e6e0',
    lipColor: '#d4626e',
    lipThickness: 3.5,
};

// ── Viseme Definitions ───────────────────────────────
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

// ── Accessory Style Catalogs ────────────────────────────

export const HAIR_STYLES = {
    none:           { label: 'None' },
    prop_afro:      { label: 'Afro' },
    prop_mohawk:    { label: 'Mohawk' },
    prop_hair_bow:  { label: 'Hair Bow' },
};

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

export const GLASSES_STYLES = {
    none:                { label: 'None' },
    prop_round_glasses:  { label: 'Round' },
    prop_square_glasses: { label: 'Square' },
    prop_sunglasses:     { label: 'Sunglasses' },
    prop_monocle:        { label: 'Monocle' },
    prop_heart_glasses:  { label: 'Heart' },
    prop_eye_patch:      { label: 'Eye Patch' },
};

export const FACIAL_HAIR_STYLES = {
    none:       { label: 'None' },
    chevron:    { label: 'Chevron' },
    handlebar:  { label: 'Handlebar' },
    pencil:     { label: 'Pencil' },
    walrus:     { label: 'Walrus' },
    goatee:       { label: 'Goatee' },
    soul_patch:   { label: 'Soul Patch' },
    chin_curtain: { label: 'Chin Curtain' },
    viking_beard: { label: 'Viking Beard' },
    full_beard:   { label: 'Full Beard' },
    long_beard:   { label: 'Long Beard' },
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
    'narrator':  { label: 'Narrator',  variant: 'm3',       pitch: 40, speed: 155, amplitude: 100, wordgap: 1,  reverb: 0, wobble: 0,  wobbleSpeed: 5,  brightness: 0,   vocalFry: 0,  chorus: 0 },
    'male':      { label: 'Male',      variant: 'm2',       pitch: 35, speed: 170, amplitude: 110, wordgap: 0,  reverb: 0,  wobble: 0,  wobbleSpeed: 5,  brightness: 0,   vocalFry: 0,  chorus: 0 },
    'female':    { label: 'Female',    variant: 'f2',       pitch: 60, speed: 170, amplitude: 100, wordgap: 0,  reverb: 0,  wobble: 0,  wobbleSpeed: 5,  brightness: 0,   vocalFry: 0,  chorus: 0 },
    'child':     { label: 'Child',     variant: 'f1',       pitch: 85, speed: 200, amplitude: 100, wordgap: 0,  reverb: 0,  wobble: 0,  wobbleSpeed: 5,  brightness: 0,  vocalFry: 0,  chorus: 0 },
    'robot':     { label: 'Robot',     variant: 'klatt3',   pitch: 50, speed: 140, amplitude: 100, wordgap: 2,  reverb: 0, wobble: 0,  wobbleSpeed: 5,  brightness: 0,  vocalFry: 0,  chorus: 0 },
    'alien':     { label: 'Alien',     variant: 'klatt2',   pitch: 90, speed: 200, amplitude: 80,  wordgap: 0,  reverb: 0, wobble: 0, wobbleSpeed: 5,  brightness: 0,  vocalFry: 0,  chorus: 0 },
    'demon':     { label: 'Demon',     variant: 'm7',       pitch: 5,  speed: 90,  amplitude: 140, wordgap: 4,  reverb: 0, wobble: 0, wobbleSpeed: 5,  brightness: 0, vocalFry: 0, chorus: 0 },
    'ghost':     { label: 'Ghost',     variant: 'whisperf', pitch: 60, speed: 130, amplitude: 40,  wordgap: 6,  reverb: 0, wobble: 0, wobbleSpeed: 5,  brightness: 0, vocalFry: 0,  chorus: 0 },
    'fairy':     { label: 'Fairy',     variant: 'f5',       pitch: 95, speed: 210, amplitude: 60,  wordgap: 0,  reverb: 0, wobble: 0, wobbleSpeed: 5,  brightness: 0,  vocalFry: 0,  chorus: 0 },
};

export const VOICE_DEFAULTS = {
    params: { speed: 175, pitch: 50, volume: 100, amplitude: 100, wordgap: 0 },
    effects: { reverb: 0, wobble: 0, wobbleSpeed: 5, brightness: 0, vocalFry: 0, chorus: 0 },
};

// ── Prop scale references ──────────────────────────────
export const PROP_REF_WIDTH = 1.1;
export const FACE_PROP_REF_WIDTH = 0.55;
export const FACIAL_HAIR_REF_WIDTH = 0.18;
