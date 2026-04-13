/**
 * prompt.js — Keyword-based character prompt parser.
 *
 * Parses free-text descriptions and returns a config delta
 * that the UI layer applies to the character.
 */

// ── Color Name → Hex Mapping ─────────────────────────────

const COLORS = {
    red: '#cc3333', darkred: '#8b2020', crimson: '#dc143c', scarlet: '#ff2400',
    orange: '#e87020', darkorange: '#cc5500',
    yellow: '#ddcc33', gold: '#d4a843', golden: '#d4a843',
    green: '#44aa44', darkgreen: '#2d6b2d', lime: '#88cc22', olive: '#808000',
    teal: '#338888', cyan: '#22bbbb', aqua: '#00cccc',
    blue: '#3355cc', darkblue: '#1a2a6c', navy: '#1a1a5e', skyblue: '#5599dd', lightblue: '#88bbdd', royal: '#4444cc',
    purple: '#7b4daa', darkpurple: '#3a2870', violet: '#8844cc', indigo: '#4b0082', magenta: '#cc33aa', lavender: '#9977cc',
    pink: '#e83e8c', hotpink: '#ff69b4', lightpink: '#ffaacc', rose: '#e8667a',
    brown: '#8b5e3c', darkbrown: '#4a3728', tan: '#c4a882', chocolate: '#7b4b2a', coffee: '#6f4e37',
    white: '#eeeeee', cream: '#f5e6cc', ivory: '#fffff0', beige: '#d4b896',
    grey: '#888888', gray: '#888888', darkgrey: '#444444', darkgray: '#444444', lightgrey: '#bbbbbb', lightgray: '#bbbbbb', silver: '#c0c0c0',
    black: '#222222',
    // Skin tones
    pale: '#ffe0bd', fair: '#ffcc99', light: '#ffcc88', medium: '#d4a06a', olive: '#c4a46a', dark: '#8d5524', deep: '#654321', ebony: '#3c2415',
    peach: '#ffcba4',
};

// ── Skin Tone Keywords ───────────────────────────────────

const SKIN_TONES = {
    pale: '#ffe0bd', fair: '#ffcc99', light: '#ffcc88', peach: '#ffcba4',
    tan: '#d4a06a', medium: '#c68642', olive: '#c4a46a',
    brown: '#8d5524', dark: '#654321', deep: '#5c3317', ebony: '#3c2415',
};

// ── Keyword → Delta Mappings ─────────────────────────────

const KEYWORD_MAP = {
    // ── Body height ──
    short: { heightPreset: 'squat' },
    squat: { heightPreset: 'squat' },
    stubby: { heightPreset: 'squat' },
    medium: { heightPreset: 'medium' },
    tall: { heightPreset: 'tall' },
    lanky: { heightPreset: 'tall', widthPreset: 'narrow' },

    // ── Body width ──
    thin: { widthPreset: 'narrow' },
    slim: { widthPreset: 'narrow' },
    skinny: { widthPreset: 'narrow' },
    narrow: { widthPreset: 'narrow' },
    moderate: { widthPreset: 'moderate' },
    wide: { widthPreset: 'wide' },
    broad: { widthPreset: 'wide' },
    stocky: { widthPreset: 'wide', heightPreset: 'squat' },
    chunky: { widthPreset: 'wide' },
    beefy: { widthPreset: 'wide' },

    // ── Body shapes ──
    blocky: { bodyShape: 'roundedBox' },
    round: { bodyShape: 'sphere' },
    cylindrical: { bodyShape: 'cylinder' },
    tapered: { bodyShape: 'cone' },
    athletic: { bodyShape: 'invertedCone' },
    muscular: { bodyShape: 'invertedCone', widthPreset: 'wide' },
    barrel: { bodyShape: 'barrel' },
    capsule: { bodyShape: 'capsule' },

    // ── Head shapes ──
    roundhead: { headShape: 'sphere' },
    boxhead: { headShape: 'roundedBox' },
    diamond: { headShape: 'diamond' },
    star: { headShape: 'star' },
    starhead: { headShape: 'star' },
    cone: { headShape: 'cone' },
    conehead: { headShape: 'cone' },
    trianglehead: { headShape: 'triangle' },
    hexhead: { headShape: 'hexagon' },
    hexagonal: { headShape: 'hexagon' },

    // ── Head size ──
    bighead: { headHeightPreset: 'tall', headWidthPreset: 'wide' },
    smallhead: { headHeightPreset: 'squat', headWidthPreset: 'narrow' },

    // ── Hair styles ──
    bald: { hairStyle: 'none' },
    afro: { hairStyle: 'prop_afro' },
    mohawk: { hairStyle: 'prop_mohawk' },
    bow: { hairStyle: 'prop_hair_bow' },
    hairbow: { hairStyle: 'prop_hair_bow' },

    // ── Hat styles ──
    nohat: { hatStyle: 'none' },
    baseball: { hatStyle: 'prop_baseball_cap' },
    cap: { hatStyle: 'prop_baseball_cap' },
    cowboy: { hatStyle: 'prop_cowboy_hat' },
    crown: { hatStyle: 'prop_crown' },
    tophat: { hatStyle: 'prop_top_hat' },
    wizard: { hatStyle: 'prop_wizard_hat' },
    santa: { hatStyle: 'prop_santa_hat' },
    pirate: { hatStyle: 'prop_pirate_hat' },
    sunhat: { hatStyle: 'prop_sun_hat' },
    tiara: { hatStyle: 'prop_tiara' },
    graduation: { hatStyle: 'prop_grad_cap' },
    gradcap: { hatStyle: 'prop_grad_cap' },
    helmet: { hatStyle: 'prop_helmet' },
    army: { hatStyle: 'prop_army_helmet' },
    knight: { hatStyle: 'prop_knight_helm' },
    viking: { hatStyle: 'prop_viking_helmet' },
    bunny: { hatStyle: 'prop_bunny_ears' },
    fox: { hatStyle: 'prop_fox_ears' },

    // ── Glasses styles ──
    glasses: { glassesStyle: 'prop_round_glasses' },
    roundglasses: { glassesStyle: 'prop_round_glasses' },
    squareglasses: { glassesStyle: 'prop_square_glasses' },
    sunglasses: { glassesStyle: 'prop_sunglasses' },
    shades: { glassesStyle: 'prop_sunglasses' },
    monocle: { glassesStyle: 'prop_monocle' },
    heartglasses: { glassesStyle: 'prop_heart_glasses' },
    eyepatch: { glassesStyle: 'prop_eye_patch' },
    patch: { glassesStyle: 'prop_eye_patch' },
    noglasses: { glassesStyle: 'none' },

    // ── Facial hair styles ──
    mustache: { facialHairStyle: 'prop_mustache' },
    moustache: { facialHairStyle: 'prop_mustache' },
    beard: { facialHairStyle: 'prop_full_beard' },
    fullbeard: { facialHairStyle: 'prop_full_beard' },
    goatee: { facialHairStyle: 'prop_goatee' },
    soulpatch: { facialHairStyle: 'prop_soul_patch' },
    longbeard: { facialHairStyle: 'prop_long_beard' },
    wizardbeard: { facialHairStyle: 'prop_long_beard' },
    cleanshaven: { facialHairStyle: 'none' },
    shaven: { facialHairStyle: 'none' },

    // ── Eye shapes ──
    roundeyes: { eyeShape: 'circle' },
    tallpill: { eyeShape: 'tallPill' },
    widepill: { eyeShape: 'widePill' },
    squareeyes: { eyeShape: 'roundedSquare' },

    // ── Face placement ──
    highface: { facePlacement: 'high' },
    lowface: { facePlacement: 'low' },
};

// ── Multi-word Phrase Mappings ────────────────────────────

const PHRASE_MAP = [
    // Head shapes (multi-word)
    [/round\s*head/i, { headShape: 'sphere' }],
    [/box\s*head/i, { headShape: 'roundedBox' }],
    [/cone\s*head/i, { headShape: 'cone' }],
    [/triangle\s*head/i, { headShape: 'triangle' }],
    [/hex\s*head/i, { headShape: 'hexagon' }],
    [/star\s*head/i, { headShape: 'star' }],
    [/diamond\s*head/i, { headShape: 'diamond' }],

    // Body shapes
    [/v[\s-]*shape/i, { bodyShape: 'invertedCone' }],

    // Compound styles
    [/big\s*head/i, { headHeightPreset: 'tall', headWidthPreset: 'wide' }],
    [/small\s*head/i, { headHeightPreset: 'squat', headWidthPreset: 'narrow' }],
    [/wide\s*face/i, { faceWidthPreset: 'wide' }],
    [/narrow\s*face/i, { faceWidthPreset: 'narrow' }],
    [/tall\s*face/i, { faceHeightPreset: 'tall' }],
    [/short\s*face/i, { faceHeightPreset: 'squat' }],
    [/high\s*face/i, { facePlacement: 'high' }],
    [/low\s*face/i, { facePlacement: 'low' }],
    [/hair\s*bow/i, { hairStyle: 'prop_hair_bow' }],
    [/top\s*hat/i, { hatStyle: 'prop_top_hat' }],
    [/cowboy\s*hat/i, { hatStyle: 'prop_cowboy_hat' }],
    [/wizard\s*hat/i, { hatStyle: 'prop_wizard_hat' }],
    [/santa\s*hat/i, { hatStyle: 'prop_santa_hat' }],
    [/pirate\s*hat/i, { hatStyle: 'prop_pirate_hat' }],
    [/sun\s*hat/i, { hatStyle: 'prop_sun_hat' }],
    [/army\s*helmet/i, { hatStyle: 'prop_army_helmet' }],
    [/knight\s*helm/i, { hatStyle: 'prop_knight_helm' }],
    [/viking\s*helmet/i, { hatStyle: 'prop_viking_helmet' }],
    [/bunny\s*ears/i, { hatStyle: 'prop_bunny_ears' }],
    [/fox\s*ears/i, { hatStyle: 'prop_fox_ears' }],
    [/baseball\s*cap/i, { hatStyle: 'prop_baseball_cap' }],
    [/grad\s*cap/i, { hatStyle: 'prop_grad_cap' }],
    [/graduation\s*cap/i, { hatStyle: 'prop_grad_cap' }],
    [/round\s*glasses/i, { glassesStyle: 'prop_round_glasses' }],
    [/square\s*glasses/i, { glassesStyle: 'prop_square_glasses' }],
    [/heart\s*glasses/i, { glassesStyle: 'prop_heart_glasses' }],
    [/eye\s*patch/i, { glassesStyle: 'prop_eye_patch' }],
    [/soul\s*patch/i, { facialHairStyle: 'prop_soul_patch' }],
    [/long\s*beard/i, { facialHairStyle: 'prop_long_beard' }],
    [/full\s*beard/i, { facialHairStyle: 'prop_full_beard' }],
    [/wizard\s*beard/i, { facialHairStyle: 'prop_long_beard' }],
    [/clean[\s-]*shaven/i, { facialHairStyle: 'none' }],
    [/no\s*glasses/i, { glassesStyle: 'none' }],
    [/no\s*hat/i, { hatStyle: 'none' }],
    [/no\s*hair/i, { hairStyle: 'none' }],
    [/no\s*beard/i, { facialHairStyle: 'none' }],
    [/no\s*mustache/i, { facialHairStyle: 'none' }],
];

// ── Color Context Patterns ───────────────────────────────
// Matches "COLOR skin", "COLOR hair", "COLOR shirt", etc.

const COLOR_CONTEXT = [
    [/skin/i, 'skinColor'],
    [/scalp/i, 'scalpColor'],
    [/hair/i, 'hairColor'],
    [/shirt|torso|top|clothing|clothes/i, 'torsoColor'],
    [/pants|bottom|legs|shorts|skirt/i, 'bottomColor'],
    [/hat/i, 'hatColor'],
    [/glasses|frames|eyewear/i, 'glassesColor'],
    [/beard|mustache|facial/i, 'facialHairColor'],
    [/lip|mouth/i, 'lipColor'],
    [/eye|iris/i, 'eyeIrisColor'],
];

// ── Character Archetype Presets ──────────────────────────

const ARCHETYPES = {
    wizard: {
        hatStyle: 'prop_wizard_hat', hatColor: '#4444aa',
        facialHairStyle: 'prop_long_beard', facialHairColor: '#cccccc',
        torsoColor: '#4444aa', bottomColor: '#333366',
        bodyShape: 'cone', heightPreset: 'tall',
    },
    knight: {
        hatStyle: 'prop_knight_helm', hatColor: '#888888',
        bodyShape: 'invertedCone', widthPreset: 'wide',
        torsoColor: '#888888', bottomColor: '#666666',
    },
    pirate: {
        hatStyle: 'prop_pirate_hat', hatColor: '#333333',
        glassesStyle: 'prop_eye_patch',
        facialHairStyle: 'prop_full_beard', facialHairColor: '#333333',
        torsoColor: '#cc3333', bottomColor: '#333333',
    },
    princess: {
        hatStyle: 'prop_tiara', hatColor: '#d4a843',
        hairStyle: 'prop_hair_bow', hairColor: '#d4a843',
        torsoColor: '#e83e8c', bottomColor: '#cc3399',
        bodyShape: 'cone',
    },
    king: {
        hatStyle: 'prop_crown', hatColor: '#d4a843',
        facialHairStyle: 'prop_full_beard',
        torsoColor: '#cc3333', bottomColor: '#8b2020',
    },
    queen: {
        hatStyle: 'prop_crown', hatColor: '#d4a843',
        torsoColor: '#7b4daa', bottomColor: '#5a3488',
    },
    soldier: {
        hatStyle: 'prop_army_helmet', hatColor: '#556633',
        bodyShape: 'invertedCone', widthPreset: 'wide',
        torsoColor: '#556633', bottomColor: '#445522',
    },
    viking: {
        hatStyle: 'prop_viking_helmet',
        facialHairStyle: 'prop_full_beard', facialHairColor: '#cc8844',
        bodyShape: 'invertedCone', widthPreset: 'wide',
        torsoColor: '#885533', bottomColor: '#664422',
    },
    santa: {
        hatStyle: 'prop_santa_hat',
        facialHairStyle: 'prop_full_beard', facialHairColor: '#eeeeee',
        torsoColor: '#cc3333', bottomColor: '#cc3333',
        bodyShape: 'barrel',
    },
    nerd: {
        glassesStyle: 'prop_square_glasses', glassesColor: '#222222',
        hatStyle: 'none', hairStyle: 'none',
        torsoColor: '#336699', bottomColor: '#444444',
    },
    hipster: {
        glassesStyle: 'prop_round_glasses', glassesColor: '#222222',
        facialHairStyle: 'prop_mustache',
        hairStyle: 'prop_mohawk',
        torsoColor: '#cc5500', bottomColor: '#333333',
    },
    clown: {
        hairStyle: 'prop_afro', hairColor: '#cc3333',
        bodyShape: 'barrel', widthPreset: 'wide',
        torsoColor: '#ddcc33', bottomColor: '#3355cc',
        headShape: 'sphere',
    },
    robot: {
        headShape: 'roundedBox', bodyShape: 'roundedBox',
        skinColor: '#aaaaaa', scalpColor: '#888888',
        torsoColor: '#888888', bottomColor: '#666666',
        glassesStyle: 'prop_square_glasses', glassesColor: '#44aaff',
    },
    alien: {
        headShape: 'diamond', headHeightPreset: 'tall',
        skinColor: '#88cc44', scalpColor: '#669933',
        bodyShape: 'cone', heightPreset: 'tall', widthPreset: 'narrow',
        torsoColor: '#446633', bottomColor: '#335522',
        eyeShape: 'tallPill', eyeIrisColor: '#000000',
    },
    zombie: {
        skinColor: '#88aa77', scalpColor: '#556644',
        torsoColor: '#555555', bottomColor: '#444444',
        eyeIrisColor: '#cccc44',
    },
    elf: {
        headShape: 'diamond', heightPreset: 'tall', widthPreset: 'narrow',
        hairStyle: 'prop_hair_bow', hairColor: '#cc9944',
        torsoColor: '#44aa44', bottomColor: '#336633',
        skinColor: '#ffe0bd',
    },
    dwarf: {
        heightPreset: 'squat', widthPreset: 'wide',
        bodyShape: 'barrel',
        facialHairStyle: 'prop_long_beard', facialHairColor: '#8b5e3c',
        hatStyle: 'prop_helmet', hatColor: '#888888',
        torsoColor: '#885533', bottomColor: '#664422',
    },
    cowboy: {
        hatStyle: 'prop_cowboy_hat', hatColor: '#8b5e3c',
        facialHairStyle: 'prop_mustache', facialHairColor: '#4a3728',
        torsoColor: '#c4a882', bottomColor: '#3a2870',
    },
    superhero: {
        bodyShape: 'invertedCone', widthPreset: 'wide', heightPreset: 'tall',
        torsoColor: '#cc3333', bottomColor: '#3355cc',
        headShape: 'roundedBox',
    },
    gentleman: {
        hatStyle: 'prop_top_hat', hatColor: '#222222',
        glassesStyle: 'prop_monocle', glassesColor: '#d4a843',
        facialHairStyle: 'prop_mustache',
        torsoColor: '#222222', bottomColor: '#333333',
    },
};

// ── Parser ───────────────────────────────────────────────

/**
 * Parse a free-text character description and return a config delta.
 */
export function parsePrompt(text) {
    const lower = text.toLowerCase().trim();
    const result = {};

    // 1. Check archetypes first
    for (const [archetype, config] of Object.entries(ARCHETYPES)) {
        if (lower.includes(archetype)) {
            Object.assign(result, config);
        }
    }

    // 2. Check multi-word phrases
    for (const [pattern, delta] of PHRASE_MAP) {
        if (pattern.test(lower)) {
            Object.assign(result, delta);
        }
    }

    // 3. Check color + context patterns ("red shirt", "brown hair")
    const colorPattern = Object.keys(COLORS).join('|');
    const contextRegex = new RegExp(`(${colorPattern})\\s+(\\w+)`, 'gi');
    let match;
    while ((match = contextRegex.exec(lower)) !== null) {
        const colorHex = COLORS[match[1].toLowerCase()];
        const contextWord = match[2].toLowerCase();
        for (const [pattern, key] of COLOR_CONTEXT) {
            if (pattern.test(contextWord)) {
                result[key] = colorHex;
                break;
            }
        }
    }

    // Also check "CONTEXT COLOR" pattern ("skin dark", "hair blonde")
    const reverseRegex = new RegExp(`(\\w+)\\s+(${colorPattern})`, 'gi');
    while ((match = reverseRegex.exec(lower)) !== null) {
        const contextWord = match[1].toLowerCase();
        const colorHex = COLORS[match[2].toLowerCase()];
        for (const [pattern, key] of COLOR_CONTEXT) {
            if (pattern.test(contextWord)) {
                if (!result[key]) result[key] = colorHex;
                break;
            }
        }
    }

    // 4. Skin tone keywords (when used with "skin" context or standalone)
    for (const [tone, hex] of Object.entries(SKIN_TONES)) {
        const toneRegex = new RegExp(`(${tone})\\s*skin|skin\\s*(${tone})`, 'i');
        if (toneRegex.test(lower)) {
            result.skinColor = hex;
        }
    }

    // 5. Single keyword matches
    const words = lower.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
    for (const word of words) {
        const mapping = KEYWORD_MAP[word];
        if (mapping) {
            // Don't override more specific matches (phrases/archetypes)
            for (const [key, value] of Object.entries(mapping)) {
                if (!(key in result)) {
                    result[key] = value;
                }
            }
        }
    }

    return result;
}

/**
 * Get available archetype names for UI hints.
 */
export function getArchetypeNames() {
    return Object.keys(ARCHETYPES);
}
