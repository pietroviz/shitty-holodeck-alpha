/**
 * musicSchema.js — validator for music theme JSON per plan §7/§12.
 *
 * Enforces both structural rules (field types, shape) and the musical rails
 * from §3 (layer caps, event density) and §12 (randomization per layer, feel
 * metadata depth, layer count range, drum references).
 *
 * Deliberately hand-rolled instead of pulling in ajv — the surface is small
 * enough that a dependency-free validator keeps the music subsystem isolated
 * and easy to port.
 *
 * Returns { ok, errors } where errors is a list of { path, message }. No
 * throwing; callers decide what to do with violations.
 */

import { parse, hasRandomization, MiniNotationError } from './miniNotationParser.js?v=1';
import { evaluateCycle } from './patternEvaluator.js?v=1';

// ─── Constants ─────────────────────────────────────────────────────

export const LAYER_ROLES = Object.freeze([
    'bass', 'melody', 'chords', 'pad', 'drums', 'texture',
]);

// Keep in sync with plan §6 (packs) and §10 Tab 2.
export const GROOVE_VALUES  = Object.freeze(['straight','swing','shuffle','dub','march','waltz']);
export const TEXTURE_VALUES = Object.freeze(['clean','lofi','crunchy','widescreen']);

// Hard caps (plan §3). These are *validator-enforced* — not advisory.
const MAX_LAYERS              = 6;
const MIN_LAYERS              = 3;  // plan §12: "Between three and six layers per theme."
const MIN_FEEL_DESCRIPTORS    = 3;
const MIN_SECTIONS            = 1;  // base loops use one section; modulation modes pick subsets.

// Modulation block — pairing-system handles. Each theme exposes 4 named
// intensity modes plus a 6-D feelVector for cosine-similarity matching.
const REQUIRED_MODE_NAMES   = ['intro', 'waiting', 'active', 'peak'];
const FEEL_VECTOR_DIM       = 6;

// Soft caps (plan §3). Emitted as warnings (not errors) since users may
// intentionally push these in rare cases.
const SOFT_EVENT_DENSITY_MAX  = 32;
const SOFT_NESTING_DEPTH_MAX  = 3;

const SLUG_RE  = /^[a-z0-9][a-z0-9_]*$/;
const SCALE_RE = /^[A-G][#b]?:[a-z_]+$/;  // e.g. "C:major", "Bb:dorian"

// ─── Validator ────────────────────────────────────────────────────

/**
 * Validate a theme JSON object.
 * @param   {unknown} theme
 * @returns {{ ok: boolean, errors: Array<{path: string, message: string}>, warnings: Array<{path: string, message: string}> }}
 */
export function validateTheme(theme) {
    const ctx = { errors: [], warnings: [] };
    _validateTopLevel(theme, ctx);
    return { ok: ctx.errors.length === 0, errors: ctx.errors, warnings: ctx.warnings };
}

function _validateTopLevel(theme, ctx) {
    if (!theme || typeof theme !== 'object' || Array.isArray(theme)) {
        return ctx.errors.push({ path: '', message: 'theme must be a JSON object' });
    }

    _requireString(theme.id,          'id',          ctx, { pattern: SLUG_RE, patternLabel: 'lowercase slug' });
    _requireString(theme.name,        'name',        ctx);
    _requireString(theme.description, 'description', ctx, { minLength: 1 });

    _requireStringArray(theme.tags, 'tags', ctx, { minLength: 1 });

    _validateDefaults(theme.defaults, ctx);
    _validateLayers(theme.layers, ctx);
    _validateSections(theme.sections, theme.layers, ctx);
    _validateSeeds(theme.seeds, ctx);
    _validateModulation(theme.modulation, theme.layers, ctx);
}

/**
 * Per-theme `modulation` block: feelVector (for cosine-similarity matching by
 * future scene-pairing systems) + named modes (intensity presets that any
 * runtime can apply to push the theme through intro / waiting / active / peak).
 */
function _validateModulation(modulation, layers, ctx) {
    if (!modulation || typeof modulation !== 'object') {
        return ctx.errors.push({
            path: 'modulation',
            message: 'required object — themes must declare feelVector + modes for the pairing layer',
        });
    }

    // ── feelVector ──
    if (!Array.isArray(modulation.feelVector) || modulation.feelVector.length !== FEEL_VECTOR_DIM) {
        ctx.errors.push({
            path: 'modulation.feelVector',
            message: `expected ${FEEL_VECTOR_DIM}-element number array (axes: brightness, intensity, warmth, epicness, tension, playfulness)`,
        });
    } else {
        modulation.feelVector.forEach((v, i) => {
            if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) {
                ctx.errors.push({
                    path: `modulation.feelVector[${i}]`,
                    message: 'expected number in [0, 1]',
                });
            }
        });
    }

    // ── modes ──
    if (!modulation.modes || typeof modulation.modes !== 'object') {
        return ctx.errors.push({
            path: 'modulation.modes',
            message: `required object with keys: ${REQUIRED_MODE_NAMES.join(', ')}`,
        });
    }
    const layerRoles = Array.isArray(layers)
        ? new Set(layers.map(l => l && l.role).filter(Boolean))
        : new Set();
    for (const modeName of REQUIRED_MODE_NAMES) {
        const mode = modulation.modes[modeName];
        const p = `modulation.modes.${modeName}`;
        if (!mode || typeof mode !== 'object') {
            ctx.errors.push({ path: p, message: 'required mode — every theme must define intro/waiting/active/peak' });
            continue;
        }
        _requireNumber(mode.valence,    `${p}.valence`,    ctx, { min: 0,    max: 1 });
        _requireNumber(mode.complexity, `${p}.complexity`, ctx, { min: 0,    max: 1 });
        _requireNumber(mode.speed,      `${p}.speed`,      ctx, { min: 0.25, max: 4 });
        _requireStringArray(mode.layers, `${p}.layers`, ctx, { minLength: 1 });
        if (Array.isArray(mode.layers)) {
            mode.layers.forEach((role, i) => {
                if (typeof role === 'string' && !layerRoles.has(role)) {
                    ctx.errors.push({
                        path: `${p}.layers[${i}]`,
                        message: `references role '${role}' not present in theme.layers`,
                    });
                }
            });
        }
    }
}

function _validateDefaults(d, ctx) {
    if (!d || typeof d !== 'object') {
        return ctx.errors.push({ path: 'defaults', message: 'required object' });
    }
    _requireString(d.pack, 'defaults.pack', ctx, { pattern: SLUG_RE });

    if (typeof d.scale !== 'string' || !SCALE_RE.test(d.scale)) {
        ctx.errors.push({ path: 'defaults.scale', message: 'expected "Key:mode" format, e.g. "C:major"' });
    }

    _requireNumber(d.cps,        'defaults.cps',        ctx, { min: 0.05, max: 4  });
    _requireNumber(d.valence,    'defaults.valence',    ctx, { min: 0,    max: 1  });
    _requireNumber(d.complexity, 'defaults.complexity', ctx, { min: 0,    max: 1  });
    _requireNumber(d.speed,      'defaults.speed',      ctx, { min: 0.25, max: 4  });
    _requireNumber(d.variety,    'defaults.variety',    ctx, { min: 0,    max: 1  });

    _requireEnum(d.groove,  'defaults.groove',  GROOVE_VALUES,  ctx);
    _requireEnum(d.texture, 'defaults.texture', TEXTURE_VALUES, ctx);
}

function _validateLayers(layers, ctx) {
    if (!Array.isArray(layers)) {
        return ctx.errors.push({ path: 'layers', message: 'required array' });
    }
    if (layers.length < MIN_LAYERS) {
        ctx.errors.push({ path: 'layers', message: `needs at least ${MIN_LAYERS} layers (plan §12)` });
    }
    if (layers.length > MAX_LAYERS) {
        ctx.errors.push({ path: 'layers', message: `exceeds max ${MAX_LAYERS} layers (plan §3)` });
    }
    const seenRoles = new Set();
    layers.forEach((layer, i) => _validateLayer(layer, i, seenRoles, ctx));
}

function _validateLayer(layer, i, seenRoles, ctx) {
    const p = `layers[${i}]`;
    if (!layer || typeof layer !== 'object') {
        return ctx.errors.push({ path: p, message: 'expected object' });
    }
    _requireEnum(layer.role, `${p}.role`, LAYER_ROLES, ctx);
    if (typeof layer.role === 'string') {
        if (seenRoles.has(layer.role)) {
            ctx.errors.push({ path: `${p}.role`, message: `duplicate role '${layer.role}'` });
        }
        seenRoles.add(layer.role);
    }
    _requireString(layer.pattern, `${p}.pattern`, ctx, { minLength: 1 });
    _requireStringArray(layer.feel, `${p}.feel`, ctx, { minLength: MIN_FEEL_DESCRIPTORS });
    _requireNumber(layer.register,    `${p}.register`,    ctx, { min: -3, max: 3, integer: true });
    _requireNumber(layer.densityBase, `${p}.densityBase`, ctx, { min: 0,  max: 1 });

    // Pattern-level structural checks.
    if (typeof layer.pattern === 'string') {
        let tree;
        try {
            tree = parse(layer.pattern);
        } catch (e) {
            const msg = e instanceof MiniNotationError ? e.message : String(e);
            ctx.errors.push({ path: `${p}.pattern`, message: `parse failed: ${msg}` });
            return;
        }
        if (!hasRandomization(tree)) {
            ctx.errors.push({
                path: `${p}.pattern`,
                message: 'must contain at least one choose() or irand() (plan §7 variability rail)',
            });
        }
        _checkSoftCaps(tree, p, ctx);
    }
}

function _checkSoftCaps(tree, pathBase, ctx) {
    const depth = _nestingDepth(tree);
    if (depth > SOFT_NESTING_DEPTH_MAX) {
        ctx.warnings.push({
            path: `${pathBase}.pattern`,
            message: `nesting depth ${depth} exceeds soft cap ${SOFT_NESTING_DEPTH_MAX}`,
        });
    }
    // Event density: evaluate cycle 0 with a neutral seed and count events.
    // Rough proxy — alt/choose may emit fewer on other cycles, so we take
    // the first-cycle event list as representative.
    const events = evaluateCycle(tree, { cycleIndex: 0, seed: 0 });
    if (events.length > SOFT_EVENT_DENSITY_MAX) {
        ctx.warnings.push({
            path: `${pathBase}.pattern`,
            message: `cycle density ${events.length} exceeds soft cap ${SOFT_EVENT_DENSITY_MAX}`,
        });
    }
}

function _nestingDepth(node, current = 0) {
    if (!node) return current;
    const containers = ['seq','group','alt','choose','repeat'];
    const childDepth = containers.includes(node.type)
        ? current + (node.type === 'repeat' ? 0 : 1)  // repeat doesn't count — it's a slot modifier
        : current;
    if (node.type === 'repeat') return _nestingDepth(node.child, childDepth);
    if (Array.isArray(node.items)) {
        return Math.max(childDepth, ...node.items.map(c => _nestingDepth(c, childDepth)));
    }
    return childDepth;
}

function _validateSections(sections, layers, ctx) {
    if (!Array.isArray(sections)) {
        return ctx.errors.push({ path: 'sections', message: 'required array' });
    }
    if (sections.length < MIN_SECTIONS) {
        ctx.errors.push({ path: 'sections', message: `needs at least ${MIN_SECTIONS} section` });
    }
    const layerRoles = Array.isArray(layers)
        ? new Set(layers.map(l => l && l.role).filter(Boolean))
        : new Set();
    const seenIds = new Set();
    sections.forEach((sec, i) => {
        const p = `sections[${i}]`;
        if (!sec || typeof sec !== 'object') {
            return ctx.errors.push({ path: p, message: 'expected object' });
        }
        _requireString(sec.id, `${p}.id`, ctx, { minLength: 1 });
        if (typeof sec.id === 'string') {
            if (seenIds.has(sec.id)) {
                ctx.errors.push({ path: `${p}.id`, message: `duplicate section id '${sec.id}'` });
            }
            seenIds.add(sec.id);
        }
        _requireStringArray(sec.layers, `${p}.layers`, ctx, { minLength: 1 });
        if (Array.isArray(sec.layers)) {
            sec.layers.forEach((role, j) => {
                if (typeof role === 'string' && !layerRoles.has(role)) {
                    ctx.errors.push({
                        path: `${p}.layers[${j}]`,
                        message: `references role '${role}' not present in theme.layers`,
                    });
                }
            });
        }
    });
}

function _validateSeeds(seeds, ctx) {
    if (!seeds || typeof seeds !== 'object') {
        return ctx.errors.push({ path: 'seeds', message: 'required object' });
    }
    _requireNumber(seeds.pattern,   'seeds.pattern',   ctx, { integer: true, min: 0 });
    _requireNumber(seeds.variation, 'seeds.variation', ctx, { integer: true, min: 0 });
}

// ─── Primitive checks ────────────────────────────────────────────

function _requireString(v, path, ctx, { minLength = 1, pattern, patternLabel } = {}) {
    if (typeof v !== 'string') {
        return ctx.errors.push({ path, message: 'required string' });
    }
    if (v.length < minLength) {
        return ctx.errors.push({ path, message: `string too short (min ${minLength})` });
    }
    if (pattern && !pattern.test(v)) {
        return ctx.errors.push({ path, message: `expected ${patternLabel || pattern.source}` });
    }
}

function _requireStringArray(v, path, ctx, { minLength = 0 } = {}) {
    if (!Array.isArray(v)) {
        return ctx.errors.push({ path, message: 'required array of strings' });
    }
    if (v.length < minLength) {
        return ctx.errors.push({ path, message: `needs at least ${minLength} items` });
    }
    v.forEach((item, i) => {
        if (typeof item !== 'string' || item.length === 0) {
            ctx.errors.push({ path: `${path}[${i}]`, message: 'expected non-empty string' });
        }
    });
}

function _requireNumber(v, path, ctx, { min, max, integer = false } = {}) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
        return ctx.errors.push({ path, message: 'required finite number' });
    }
    if (integer && !Number.isInteger(v)) {
        return ctx.errors.push({ path, message: 'expected integer' });
    }
    if (min !== undefined && v < min) {
        ctx.errors.push({ path, message: `must be >= ${min}` });
    }
    if (max !== undefined && v > max) {
        ctx.errors.push({ path, message: `must be <= ${max}` });
    }
}

function _requireEnum(v, path, allowed, ctx) {
    if (typeof v !== 'string' || !allowed.includes(v)) {
        ctx.errors.push({
            path,
            message: `expected one of: ${allowed.join(', ')}`,
        });
    }
}
