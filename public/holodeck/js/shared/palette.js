/**
 * palette.js — Single source of truth for all colors in the Holodeck.
 *
 * Every builder, bridge, and scene should import from here instead
 * of hardcoding hex values. When the palette expands (seasonal themes,
 * user prefs, etc.) only this file changes.
 *
 * Hex strings are for CSS / panel HTML.
 * Numeric (0x) values are for Three.js constructors.
 */

// ─────────────────────────────────────────────────────────────────
//  UI PALETTE  (CSS hex strings — use in panel HTML, style props)
// ─────────────────────────────────────────────────────────────────

export const UI = Object.freeze({
    accent:        '#00D9D9',
    accentDark:    '#00B8B8',
    bgDark:        '#1A2332',
    panelBg:       '#1E2530',
    panelRaised:   '#2A3240',
    textPrimary:   '#FFFFFF',
    textDim:       '#5A6676',
    textDark:      '#2A3240',
    overlayDark:   'rgba(0,0,0,0.5)',
    overlayHover:  'rgba(0,0,0,0.6)',
    uiHover:       'rgba(255,255,255,0.08)',
    uiHover2:      'rgba(255,255,255,0.12)',
    danger:        '#D95763',
});

// ─────────────────────────────────────────────────────────────────
//  3D SCENE PALETTE  (0x numbers — use in Three.js constructors)
// ─────────────────────────────────────────────────────────────────

export const SCENE = Object.freeze({
    /** Main holodeck viewport background. */
    shellBg:         0x5A5A5A,

    /** Builder viewport background. */
    builderBg:       0x1A1A2E,

    /** Ground plane beneath builder subjects. */
    ground:          0x3a3a5e,

    /** Ground grid primary lines. */
    gridMajor:       0x555577,

    /** Ground grid secondary lines. */
    gridMinor:       0x444466,

    /** 5×5 perimeter outline (bright). */
    perimeter:       0xC8C8C8,

    /** Inner grid lines inside the 5×5 stage. */
    innerGrid:       0xB0B0B0,

    /** Ambient light color. */
    ambient:         0xffffff,

    /** Key light color. */
    keyLight:        0xffffff,

    /** Fill light color (cool tint). */
    fillLight:       0x8888ff,
});

// ─────────────────────────────────────────────────────────────────
//  MESH DEFAULTS  (0x numbers — for preview objects in builders)
// ─────────────────────────────────────────────────────────────────

export const MESH = Object.freeze({
    /** Default character body color. */
    characterBody:   0x5B7FBF,

    /** Default character head color. */
    characterHead:   0x5B7FBF,

    /** Default scalp / hair color. */
    scalp:           0x3a2c1a,

    /** Default skin color. */
    skin:            0xf0c8a0,

    /** Default environment ground (grass-like). */
    envGround:       0x4a7c3f,

    /** Default object material. */
    objectDefault:   0x6F6F6F,

    /** Fallback / error magenta. */
    fallback:        0xff00ff,
});

// ─────────────────────────────────────────────────────────────────
//  LIGHTING PRESETS
// ─────────────────────────────────────────────────────────────────

export const LIGHT = Object.freeze({
    ambientIntensity:  0.6,
    keyIntensity:      1.2,
    keyPosition:       [5, 8, 5],
    fillIntensity:     0.3,
    fillPosition:      [-3, 2, -3],
});
