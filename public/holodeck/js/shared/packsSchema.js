/**
 * packsSchema.js — lightweight validator for packs.json (plan §6).
 *
 * Packs are user-editable data so validation needs to be explicit. The
 * compiler trusts valid packs completely; the validator is the one place
 * that gets to fail loudly for malformed data.
 */

// Tone.js class names we accept today. Keep in sync with plan §4.
export const ALLOWED_SYNTHS = Object.freeze([
    'Tone.Synth',
    'Tone.FMSynth',
    'Tone.AMSynth',
    'Tone.DuoSynth',
    'Tone.PolySynth',
    'Tone.NoiseSynth',
    'Tone.MembraneSynth',
    'Tone.MetalSynth',
]);

export const TONAL_ROLES = Object.freeze(['bass', 'melody', 'chords', 'pad', 'texture']);

export function validatePacks(doc) {
    const errors = [];
    if (!doc || typeof doc !== 'object') {
        return { ok: false, errors: [{ path: '', message: 'packs.json must be an object' }] };
    }
    if (doc.$schema_version !== 1) {
        errors.push({ path: '$schema_version', message: 'expected $schema_version: 1' });
    }
    if (!doc.packs || typeof doc.packs !== 'object') {
        return { ok: false, errors: [...errors, { path: 'packs', message: 'required object' }] };
    }
    for (const [packId, pack] of Object.entries(doc.packs)) {
        _validatePack(pack, `packs.${packId}`, packId, errors);
    }
    return { ok: errors.length === 0, errors };
}

function _validatePack(pack, path, expectedId, errors) {
    if (!pack || typeof pack !== 'object') {
        return errors.push({ path, message: 'expected object' });
    }
    if (pack.id !== expectedId) {
        errors.push({ path: `${path}.id`, message: `id '${pack.id}' must match key '${expectedId}'` });
    }
    if (typeof pack.name !== 'string' || pack.name.length === 0) {
        errors.push({ path: `${path}.name`, message: 'required string' });
    }
    if (!pack.roles || typeof pack.roles !== 'object') {
        return errors.push({ path: `${path}.roles`, message: 'required object' });
    }

    // Tonal roles: need a synth + options.
    for (const role of TONAL_ROLES) {
        const r = pack.roles[role];
        if (!r) continue;  // pack is not required to define every role
        _validateTonalRole(r, `${path}.roles.${role}`, errors);
    }

    // Drums: a map of recipe name → synth config. `default_recipe` optional.
    const drums = pack.roles.drums;
    if (drums) {
        if (!drums.recipes || typeof drums.recipes !== 'object') {
            errors.push({ path: `${path}.roles.drums.recipes`, message: 'required object' });
        } else {
            for (const [recipeName, recipe] of Object.entries(drums.recipes)) {
                _validateDrumRecipe(recipe, `${path}.roles.drums.recipes.${recipeName}`, errors);
            }
            if (drums.default_recipe && !drums.recipes[drums.default_recipe]) {
                errors.push({
                    path: `${path}.roles.drums.default_recipe`,
                    message: `points at missing recipe '${drums.default_recipe}'`,
                });
            }
        }
    }
}

function _validateTonalRole(r, path, errors) {
    if (typeof r.synth !== 'string' || !ALLOWED_SYNTHS.includes(r.synth)) {
        errors.push({
            path: `${path}.synth`,
            message: `expected one of ${ALLOWED_SYNTHS.join(', ')}`,
        });
    }
    if (r.synth === 'Tone.PolySynth') {
        if (typeof r.baseSynth !== 'string' || !ALLOWED_SYNTHS.includes(r.baseSynth)) {
            errors.push({
                path: `${path}.baseSynth`,
                message: 'Tone.PolySynth requires a baseSynth naming the voice class',
            });
        }
    }
    if (r.options !== undefined && (r.options === null || typeof r.options !== 'object')) {
        errors.push({ path: `${path}.options`, message: 'expected object' });
    }
    if (r.gain !== undefined) {
        if (typeof r.gain !== 'number' || !Number.isFinite(r.gain) || r.gain < 0 || r.gain > 2) {
            errors.push({ path: `${path}.gain`, message: 'expected number 0..2' });
        }
    }
}

function _validateDrumRecipe(recipe, path, errors) {
    if (!recipe || typeof recipe !== 'object') {
        return errors.push({ path, message: 'expected object' });
    }
    if (typeof recipe.synth !== 'string' || !ALLOWED_SYNTHS.includes(recipe.synth)) {
        errors.push({
            path: `${path}.synth`,
            message: `expected one of ${ALLOWED_SYNTHS.join(', ')}`,
        });
    }
    if (recipe.options !== undefined && (recipe.options === null || typeof recipe.options !== 'object')) {
        errors.push({ path: `${path}.options`, message: 'expected object' });
    }
    if (recipe.note !== undefined && typeof recipe.note !== 'string') {
        errors.push({ path: `${path}.note`, message: 'expected string (note name)' });
    }
    if (recipe.gain !== undefined) {
        if (typeof recipe.gain !== 'number' || !Number.isFinite(recipe.gain) || recipe.gain < 0 || recipe.gain > 2) {
            errors.push({ path: `${path}.gain`, message: 'expected number 0..2' });
        }
    }
}
