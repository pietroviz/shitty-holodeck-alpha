/**
 * musicCompiler.js — turn a validated theme JSON into a running Tone.js
 * player. This is the convergence point for the whole music subsystem:
 * parser + evaluator + schema + packs all funnel in here.
 *
 *   compileTheme({ theme, packs, params, seed, Tone, Tonal })
 *     → { start, stop, dispose, setParam, isPlaying }
 *
 * Design rules:
 *   - Tone + Tonal are injected, not imported. Same code runs against mocks
 *     in Node tests and real modules in the browser.
 *   - Each layer has its own Tone.Loop so cycleIndex advances independently
 *     and per-layer re-rolls can be added later without re-architecting.
 *   - Events are scheduled one cycle at a time in the loop callback — no
 *     multi-cycle lookahead. Slider writes take effect at the next cycle
 *     boundary by default (plan §8).
 *   - Synth instantiation goes through `buildSynth()` so pack configs are
 *     the single source of truth for instrument shape.
 *
 * Scope for this first pass (MVP):
 *   - Plays section A only. A/B sequencing comes with the Shape tab wiring.
 *   - Static scale (theme.defaults.scale). Valence → mode mapping lands with
 *     setParam('valence', …).
 *   - No shared delay/filter buses yet. Each role gets a per-role gain.
 *   - No humanize / sometimes / transforms — those operate on the tree
 *     before evaluation and can layer on without touching this file.
 */

import { parse }         from './miniNotationParser.js?v=1';
import { evaluateCycle } from './patternEvaluator.js?v=1';

const BEATS_PER_CYCLE = 4;  // one cycle = one 4/4 measure in Tone time.

// Role priority for complexity gating — earlier entries reveal first.
// Plan §8: low complexity = bass + melody only; high = all layers in.
export const ROLE_PRIORITY = ['bass', 'melody', 'drums', 'chords', 'pad', 'texture'];

// Smooth fade duration (seconds) when ramping a layer in/out.
const GAIN_RAMP_SEC = 0.12;

/**
 * Map valence (0..1) to one of the seven church modes.
 * Plan §8: 0=phrygian, 0.3=minor, 0.5=dorian, 0.7=major, 1=lydian.
 * Boundaries chosen so each band is roughly equal width.
 */
export function valenceToMode(valence) {
    const v = Math.max(0, Math.min(1, +valence || 0));
    if (v < 0.20) return 'phrygian';
    if (v < 0.40) return 'minor';
    if (v < 0.60) return 'dorian';
    if (v < 0.80) return 'major';
    return 'lydian';
}

/**
 * Threshold (0..1) at which a given role should switch on as complexity rises.
 * Roles outside section A always return 1 (never auto-on).
 * The earliest-priority role (usually bass) returns 0 so it's always present.
 */
export function complexityThresholdFor(role, sectionRoles) {
    const ordered = ROLE_PRIORITY.filter(r => sectionRoles.includes(r));
    const idx = ordered.indexOf(role);
    if (idx < 0) return 1.0;
    if (ordered.length <= 1) return 0;
    return idx / ordered.length;
}

/* ═══════════════════════════════════════════════════════════════
   ASSET → THEME ADAPTER
   ═══════════════════════════════════════════════════════════════ */

/**
 * Convert a stored music asset (payload-wrapped, with the bridge's flat
 * state shape inside) into a plan-§7-shaped `theme` object the compiler
 * accepts. Any caller holding a music asset can use this to skip writing
 * its own conversion.
 *
 *   asset.payload = { format: 'music_state_v2', state: <flat> }
 *   theme         = { id, name, defaults: {...}, layers, sections, seeds, modulation }
 *
 * @returns {object|null}  null if the asset isn't a v2 music asset.
 */
export function assetToTheme(asset) {
    if (!asset || asset.payload?.format !== 'music_state_v2') return null;
    const s = asset.payload.state || {};
    return {
        id:          asset.id,
        name:        asset.name,
        description: asset.payload.description ?? '',
        tags:        Array.isArray(asset.tags) ? asset.tags : [],
        defaults: {
            pack:       s.pack       ?? 'game_boy',
            scale:      `${s.scaleKey ?? 'C'}:${s.scaleMode ?? 'major'}`,
            cps:        s.cps        ?? 0.5,
            valence:    s.valence    ?? 0.5,
            complexity: s.complexity ?? 0.5,
            speed:      s.speed      ?? 1.0,
            variety:    s.variety    ?? 0.4,
            groove:     s.groove     ?? 'straight',
            texture:    s.texture    ?? 'clean',
        },
        layers:     structuredClone(s.layers     ?? []),
        sections:   structuredClone(s.sections   ?? []),
        seeds:      structuredClone(s.seeds      ?? { pattern: 0, variation: 0 }),
        modulation: structuredClone(s.modulation ?? null),
    };
}

/** Quick predicate — true if this asset is a v2 music asset compileable by us. */
export function isV2MusicAsset(asset) {
    return Boolean(asset && asset.payload?.format === 'music_state_v2');
}

/* ═══════════════════════════════════════════════════════════════
   PUBLIC API
   ═══════════════════════════════════════════════════════════════ */

/**
 * @param {object} input
 * @param {object} input.theme     Validated theme JSON.
 * @param {object} input.packs     Parsed packs.json (the whole document).
 * @param {object} input.params    Runtime params { valence, complexity, speed }.
 *                                 Missing values fall through to theme defaults.
 * @param {number} [input.seed]    Override seeds.pattern from the theme.
 * @param {object} input.Tone      Tone.js module (injected for testability).
 * @param {object} input.Tonal     @tonaljs/tonal module.
 * @returns {{
 *   start:     () => Promise<void>,
 *   stop:      () => void,
 *   dispose:   () => void,
 *   setParam:  (name: string, value: number) => void,
 *   isPlaying: () => boolean,
 * }}
 */
export function compileTheme({ theme, packs, params = {}, seed, Tone, Tonal, onLayerFire }) {
    if (!Tone)  throw new Error('compileTheme: Tone module is required');
    if (!Tonal) throw new Error('compileTheme: Tonal module is required');

    const pack = packs?.packs?.[theme.defaults.pack];
    if (!pack) throw new Error(`compileTheme: unknown pack '${theme.defaults.pack}'`);

    const effectiveSeed = seed ?? theme.seeds.pattern;

    // ── Params snapshot (will be updated via setParam). ──────────────
    const state = {
        valence:    params.valence    ?? theme.defaults.valence,
        complexity: params.complexity ?? theme.defaults.complexity,
        speed:      params.speed      ?? theme.defaults.speed,
    };

    // ── Master output. Lowered from 0.7 to 0.45 so 6 layers playing in
    //    unison don't sum to a clipping level. Per-role gains in packs.json
    //    are tuned for this master.
    const master = new Tone.Gain(0.45).toDestination();

    // ── Pick section A for MVP playback. ─────────────────────────────
    const section = theme.sections[0];
    const sectionRoleSet = new Set(section.layers);
    const activeLayers = theme.layers.filter(l => sectionRoleSet.has(l.role));

    // ── Section role list — used for complexity threshold computation. ─
    const sectionRoles = activeLayers.map(l => l.role);

    // ── Per-layer setup: synth, gain, parsed tree, cycle counter. ────
    const layerStates = activeLayers.map(layer => {
        const roleConfig = pack.roles[layer.role];
        if (!roleConfig) {
            throw new Error(
                `compileTheme: pack '${pack.id}' has no config for role '${layer.role}'`,
            );
        }

        // Drum roles get the full kit treatment: every recipe is instantiated
        // up front (each with its own gain → master), and a kit map routes
        // pattern notes → recipes via the recipes' trigger_note. The layer's
        // master "gain" node is the sum bus across the whole kit so manual
        // mute/unmute and complexity work the same as for a tonal layer.
        if (roleConfig.recipes) {
            const kit = _buildDrumKit(roleConfig, Tone);
            const layerBus = new Tone.Gain(1.0);
            for (const entry of kit.entries) {
                entry.gain.connect(layerBus);
            }
            layerBus.connect(master);
            // For drums the "baseGain" is the layer-bus level (kept at 1.0;
            // recipes carry their own per-instrument gains).
            return {
                layer,
                roleConfig,
                recipe:     null,            // single recipe is no longer the right concept
                kit,                          // { defaultEntry, entries[], byTriggerNote: Map<note, entry> }
                synth:      null,
                gain:       layerBus,
                baseGain:   1.0,
                isNoise:    false,            // per-recipe; resolved at trigger time
                manualOn:   true,
                tree:       parse(layer.pattern),
                cycleIndex: 0,
                loop:       null,
            };
        }

        // Tonal roles: single synth, per-role gain.
        const baseGain  = roleConfig.gain ?? 0.5;
        const synthName = roleConfig.synth ?? '';
        const isNoise   = synthName === 'Tone.NoiseSynth';
        const synth = buildSynth(roleConfig, Tone, layer.role);
        const gain  = new Tone.Gain(baseGain);
        synth.connect(gain);
        gain.connect(master);

        return {
            layer,
            roleConfig,
            recipe:     null,
            kit:        null,
            synth,
            gain,
            baseGain,
            isNoise,
            manualOn:   true,
            tree:       parse(layer.pattern),
            cycleIndex: 0,
            loop:       null,
        };
    });

    // ── Scale for degree resolution. Both `currentMode` and `scaleNotes`
    //    are mutable: setParam('valence') swaps them in at cycle boundaries.
    const { key } = parseScale(theme.defaults.scale);
    let currentMode = valenceToMode(state.valence);
    let scaleNotes  = resolveScaleNotes(key, currentMode, Tonal);

    /** Recompute the gain target a given layer should be at right now.
     *  Phase 1: only the manual on/off toggle matters; complexity is stored
     *  but doesn't gate. */
    function _targetGainFor(ls) {
        return ls.manualOn ? ls.baseGain : 0;
    }

    /** Ramp every layer's gain to its current target. Used when the user
     *  moves the Complexity slider mid-playback. */
    function _applyAllLayerGains(rampSec = GAIN_RAMP_SEC) {
        for (const ls of layerStates) {
            _rampLayerGain(ls, _targetGainFor(ls), rampSec);
        }
    }

    function _rampLayerGain(ls, target, rampSec) {
        try {
            // Tone.Param.rampTo handles the cancel + setValueAtTime + ramp
            // dance for us, with sensible behavior across all browsers.
            if (typeof ls.gain.gain.rampTo === 'function') {
                ls.gain.gain.rampTo(target, rampSec);
            } else {
                ls.gain.gain.value = target;
            }
        } catch {
            try { ls.gain.gain.value = target; } catch {}
        }
    }

    let playing = false;

    /* ──────────────────────────────────────────────────────────────
       Schedule one cycle's worth of events for a single layer.
       Called from inside Tone.Loop; `time` is the AudioContext time
       at which this cycle begins.
       ────────────────────────────────────────────────────────────── */
    function scheduleLayerCycle(layerState, time) {
        const cycleDurationSec = _cycleDuration(state, theme);
        const events = evaluateCycle(layerState.tree, {
            cycleIndex: layerState.cycleIndex,
            seed: effectiveSeed,
        });
        for (const ev of events) {
            const startSec = time + ev.start * cycleDurationSec;
            // Keep a small gap at the end so fast repeats don't overlap.
            const durSec = Math.max(0.01, ev.duration * cycleDurationSec * 0.9);
            const note = resolveEventNote(ev, scaleNotes, layerState.layer.register);
            if (note == null) continue;

            // Wrap the trigger so a single bad event doesn't kill the whole
            // cycle's scheduling — and so the activity callback fires even
            // when an instrument synth throws downstream.
            try {
                if (layerState.kit) {
                    // Multi-recipe drum kit: route by trigger_note. Pattern
                    // notes like "c3" → kick, "d3" → snare, etc. Falls back
                    // to the kit's default if the note isn't a known trigger.
                    const entry = layerState.kit.byTriggerNote.get(_normalizeNote(note))
                                  ?? layerState.kit.defaultEntry;
                    if (!entry) continue;
                    triggerSynth(entry.synth, entry.playNote, durSec, startSec, entry.isNoise);
                } else {
                    triggerSynth(layerState.synth, note, durSec, startSec, layerState.isNoise);
                }
            } catch (err) {
                console.warn('[compileTheme] trigger failed for role=%s:', layerState.layer.role, err);
            }
            if (onLayerFire) {
                /* Schedule the activity callback to fire at PLAYBACK
                 * time (when the note actually sounds), not at schedule
                 * time (when this loop runs). Without Tone.Draw all
                 * the fires for one cycle land in the same ms — visual
                 * pulses then only land on beat 1. */
                const role = layerState.layer.role;
                if (Tone.Draw && typeof Tone.Draw.schedule === 'function') {
                    Tone.Draw.schedule(() => {
                        try { onLayerFire(role, startSec); } catch {}
                    }, startSec);
                } else {
                    try { onLayerFire(role, startSec); } catch {}
                }
            }
        }
        layerState.cycleIndex++;
    }

    /* ═══════════════════════════════════════════════════════════════
       CONTROLLER
       ═══════════════════════════════════════════════════════════════ */

    return {
        async start() {
            if (playing) return;
            // Tone requires user-gesture context start. Callers should await this.
            if (Tone.start) await Tone.start();
            // Clean any leftover Transport state from prior playback (e.g. a
            // browse-preview compileTheme that wasn't disposed). Without this
            // the new layers stack on top of stale loops and you get partial
            // or doubled audio.
            try {
                Tone.Transport.stop();
                Tone.Transport.cancel(0);
                Tone.Transport.position = 0;
            } catch {}
            Tone.Transport.bpm.value = _bpm(state, theme);

            // Reset cycle counters and (re)create per-layer loops.
            for (const ls of layerStates) {
                ls.cycleIndex = 0;
                ls.loop = new Tone.Loop((time) => scheduleLayerCycle(ls, time), '1m');
                ls.loop.start(0);
            }
            Tone.Transport.start();
            playing = true;
            // Layer gains were initialized at their proper target during
            // construction so the first cycle isn't muted. No ramp needed
            // on start — that fires on subsequent slider/toggle changes.
        },

        stop() {
            if (!playing) return;
            Tone.Transport.stop();
            Tone.Transport.cancel();
            for (const ls of layerStates) {
                if (ls.loop) { ls.loop.stop(); ls.loop.dispose(); ls.loop = null; }
            }
            playing = false;
        },

        dispose() {
            this.stop();
            for (const ls of layerStates) {
                try { ls.synth?.dispose(); } catch {}
                try { ls.gain?.dispose();  } catch {}
                if (ls.kit) {
                    for (const entry of ls.kit.entries) {
                        try { entry.synth.dispose(); } catch {}
                        try { entry.gain.dispose();  } catch {}
                    }
                }
            }
            try { master.dispose(); } catch {}
        },

        setParam(name, value) {
            if (!(name in state)) throw new Error(`setParam: unknown '${name}'`);
            state[name] = value;
            if (!playing) return;
            switch (name) {
                case 'speed':
                    Tone.Transport.bpm.value = _bpm(state, theme);
                    return;
                case 'valence': {
                    // Re-resolve the scale if the new valence crosses a mode
                    // boundary. scaleNotes is closed over scheduleLayerCycle —
                    // mutating it here means the next cycle picks up the new mode.
                    const newMode = valenceToMode(value);
                    if (newMode !== currentMode) {
                        currentMode = newMode;
                        scaleNotes  = resolveScaleNotes(key, newMode, Tonal);
                    }
                    return;
                }
                case 'complexity':
                    // Phase 1: complexity is stored but does not gate layers.
                    // Future use: per-layer density (plan §8).
                    return;
                default:
                    return;  // variety / groove / texture are stored only for now
            }
        },

        /**
         * Manually toggle a layer on/off (Sound-tab checkbox). Independent of
         * complexity gating — the effective state is `manualOn AND complexity-allows`.
         */
        setLayerEnabled(role, enabled) {
            const ls = layerStates.find(s => s.layer.role === role);
            if (!ls) return;
            ls.manualOn = !!enabled;
            if (!playing) return;
            _rampLayerGain(ls, _targetGainFor(ls), GAIN_RAMP_SEC);
        },

        /**
         * Apply a named modulation mode (intro / waiting / active / peak)
         * from the theme's modulation block. Updates valence + complexity +
         * speed via setParam, and toggles per-layer enable flags via
         * setLayerEnabled — all at the next cycle boundary.
         *
         * Returns true if the mode was applied; false if unknown.
         */
        applyMode(modeName) {
            const modes = theme.modulation?.modes || {};
            const mode  = modes[modeName];
            if (!mode) {
                console.warn('[compileTheme] unknown mode:', modeName);
                return false;
            }
            if (typeof mode.valence    === 'number') this.setParam('valence',    mode.valence);
            if (typeof mode.complexity === 'number') this.setParam('complexity', mode.complexity);
            if (typeof mode.speed      === 'number') this.setParam('speed',      mode.speed);
            const wantOn = new Set(Array.isArray(mode.layers) ? mode.layers : []);
            for (const ls of layerStates) {
                this.setLayerEnabled(ls.layer.role, wantOn.has(ls.layer.role));
            }
            return true;
        },

        /** Diagnostic — what role is currently audible? Used by tests + debug UIs. */
        _layerSnapshot() {
            return layerStates.map(ls => ({
                role:      ls.layer.role,
                manualOn:  ls.manualOn,
                target:    _targetGainFor(ls),
            }));
        },

        isPlaying() { return playing; },
    };
}

/* ═══════════════════════════════════════════════════════════════
   SYNTH CONSTRUCTION
   ═══════════════════════════════════════════════════════════════ */

/**
 * Build a Tone.js synth from a role config entry. Exported for tests.
 * @param {object} roleConfig  e.g. { synth: 'Tone.Synth', options: {...} }
 * @param {object} Tone        Injected Tone module.
 * @param {string} role        For error messages.
 */
export function buildSynth(roleConfig, Tone, role = '') {
    // Drum roles point at `recipes`, not a direct synth — pick a default.
    if (roleConfig.recipes) {
        const recipe = _defaultDrumRecipe(roleConfig);
        if (!recipe) throw new Error(`role '${role}' has empty drum recipes`);
        return _instantiateSynth(recipe, Tone);
    }
    return _instantiateSynth(roleConfig, Tone);
}

function _instantiateSynth(config, Tone) {
    const cls = _resolveToneClass(config.synth, Tone);
    if (config.synth === 'Tone.PolySynth') {
        const voiceCls = _resolveToneClass(config.baseSynth, Tone);
        return new cls(voiceCls, config.options ?? {});
    }
    return new cls(config.options ?? {});
}

function _resolveToneClass(name, Tone) {
    if (typeof name !== 'string' || !name.startsWith('Tone.')) {
        throw new Error(`unknown Tone class name '${name}'`);
    }
    const short = name.slice(5);
    const cls = Tone[short];
    if (typeof cls !== 'function') {
        throw new Error(`Tone module has no class '${short}'`);
    }
    return cls;
}

function _defaultDrumRecipe(roleConfig) {
    if (!roleConfig.recipes) return null;
    const id = roleConfig.default_recipe;
    if (id && roleConfig.recipes[id]) return roleConfig.recipes[id];
    const first = Object.values(roleConfig.recipes)[0];
    return first ?? null;
}

/** Build a multi-recipe drum kit. Every recipe gets its own synth + gain
 *  node. Returns a routing map keyed by lowercased trigger_note so
 *  scheduleLayerCycle can pick the right entry per pattern event in O(1).
 *
 *  Each recipe is instantiated under its own try/catch — a single broken
 *  recipe (e.g. a synth class with browser-specific issues) shouldn't take
 *  the whole kit down. We log and skip; the rest of the kit still plays. */
function _buildDrumKit(roleConfig, Tone) {
    const entries = [];
    const byTriggerNote = new Map();
    let defaultEntry = null;
    const defaultId = roleConfig.default_recipe;

    for (const [recipeId, recipe] of Object.entries(roleConfig.recipes || {})) {
        let synth, gain;
        try {
            synth = _instantiateSynth(recipe, Tone);
            gain  = new Tone.Gain(recipe.gain ?? 0.5);
            synth.connect(gain);
        } catch (e) {
            console.warn(`[compileTheme] drum recipe '${recipeId}' failed to instantiate:`, e?.message || e);
            continue;
        }

        const synthName = recipe.synth ?? '';
        const entry = {
            id:          recipeId,
            recipe,
            synth,
            gain,
            isNoise:     synthName === 'Tone.NoiseSynth',
            playNote:    recipe.note ?? 'C3',
            triggerNote: recipe.trigger_note ? String(recipe.trigger_note).toLowerCase() : null,
        };
        entries.push(entry);
        if (entry.triggerNote) byTriggerNote.set(entry.triggerNote, entry);
        if (recipeId === defaultId) defaultEntry = entry;
    }
    if (!defaultEntry) defaultEntry = entries[0] ?? null;
    return { entries, byTriggerNote, defaultEntry };
}

/** Lowercase + trim so trigger_note comparisons are case-insensitive. */
function _normalizeNote(note) {
    return typeof note === 'string' ? note.trim().toLowerCase() : '';
}

/* ═══════════════════════════════════════════════════════════════
   EVENT → NOTE RESOLUTION
   ═══════════════════════════════════════════════════════════════ */

/**
 * Turn an evaluator Event into a concrete note string, accounting for
 * layer register shift and (for `degree` events) the current scale.
 * Returns null if the event can't be resolved (caller should skip).
 */
export function resolveEventNote(event, scaleNotes, register = 0) {
    if (event.kind === 'note') {
        return _shiftOctave(event.value, register);
    }
    if (event.kind === 'degree') {
        if (!scaleNotes.length) return null;
        const { name, octave } = _degreeToNote(event.value, scaleNotes);
        return `${name}${octave + register}`;
    }
    return null;
}

// A parsed pattern note is e.g. "c3" — split into name + octave.
function _splitNote(note) {
    const m = String(note).match(/^([A-Ga-g][#b]?)(-?\d)$/);
    if (!m) return null;
    return { name: m[1].charAt(0).toUpperCase() + m[1].slice(1), octave: parseInt(m[2], 10) };
}

function _shiftOctave(note, register) {
    if (!register) return note;
    const s = _splitNote(note);
    if (!s) return note;
    return `${s.name}${s.octave + register}`;
}

// Map a non-negative degree index to a note in the scale, wrapping octaves.
function _degreeToNote(degree, scaleNotes) {
    const len = scaleNotes.length;
    const wrap = ((degree % len) + len) % len;
    const octaveShift = Math.floor(degree / len);
    return { name: scaleNotes[wrap], octave: 4 + octaveShift };
}

/* ═══════════════════════════════════════════════════════════════
   SCALE RESOLUTION
   ═══════════════════════════════════════════════════════════════ */

/** Parse "C:major" into { key: "C", mode: "major" }. */
export function parseScale(scale) {
    const m = String(scale).match(/^([A-G][#b]?):([a-z_]+)$/);
    if (!m) throw new Error(`bad scale format '${scale}' (expected 'Key:mode')`);
    return { key: m[1], mode: m[2] };
}

/**
 * Resolve (key, mode) to an array of note names via Tonal.Scale.
 * Returns ['C','D','E',...] or [] if Tonal can't find it. The compiler falls
 * back to C major silently on unresolvable scales rather than crashing mid-play.
 */
export function resolveScaleNotes(key, mode, Tonal) {
    try {
        const notes = Tonal.Scale?.get?.(`${key} ${mode.replace(/_/g, ' ')}`)?.notes;
        if (Array.isArray(notes) && notes.length > 0) return notes;
    } catch {}
    return ['C','D','E','F','G','A','B'];
}

/* ═══════════════════════════════════════════════════════════════
   TIMING
   ═══════════════════════════════════════════════════════════════ */

function _bpm(state, theme) {
    return theme.defaults.cps * state.speed * 60 * BEATS_PER_CYCLE;
}

function _cycleDuration(state, theme) {
    return 1 / (theme.defaults.cps * state.speed);
}

/* ═══════════════════════════════════════════════════════════════
   SYNTH TRIGGER HELPER
   ═══════════════════════════════════════════════════════════════ */

/** Common trigger that handles NoiseSynth's no-note API. The `isNoise` flag
 *  is determined at compile time from the config string — runtime
 *  `constructor.name` checks break under minifier-mangled class names. */
function triggerSynth(synth, note, durationSec, startSec, isNoise) {
    if (isNoise) {
        // NoiseSynth.triggerAttackRelease takes (duration, time, velocity).
        synth.triggerAttackRelease(durationSec, startSec);
    } else {
        synth.triggerAttackRelease(note, durationSec, startSec);
    }
}
