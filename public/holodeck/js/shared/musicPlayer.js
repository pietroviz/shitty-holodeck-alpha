/**
 * musicPlayer.js — single-source-of-truth music playback singleton.
 *
 * Browse-preview and the editor both go through this module so they're
 * guaranteed to produce identical audio for the same theme. There is exactly
 * ONE Tone runtime, ONE Tone.Transport, ONE master output and ONE active
 * controller at a time across the whole app.
 *
 * Public API:
 *
 *   await musicPlayer.init()                        // idempotent — load tone+tonal+packs
 *   await musicPlayer.play(theme, opts?)            // theme = plan-§7 shape (see musicCompiler.assetToTheme)
 *   musicPlayer.stop()
 *   musicPlayer.isPlaying()
 *   musicPlayer.setParam(name, value)               // 'valence' | 'complexity' | 'speed'
 *   musicPlayer.setLayerEnabled(role, enabled)
 *   musicPlayer.getLastFireByRole()                 // { bass: timestampMs, ... } — used by activity-indicator UIs
 *
 * If a second caller invokes play() while another theme is already playing,
 * the previous controller is disposed cleanly first. Stop is always safe.
 */

import { compileTheme } from './musicCompiler.js?v=2';

let _Tone        = null;
let _Tonal       = null;
let _packsDoc    = null;
let _initPromise = null;

let _controller       = null;
let _onEnd            = null;
let _lastFireByRole   = Object.create(null);
// Multi-subscriber event for "any layer just fired a note." Keyed off the
// internal onLayerFire compiler callback so every subscriber sees the same
// timing the audio actually heard. Used by beat-aware camera cuts and (in
// future) story-level SFX triggers — anything that wants to sync to the
// music's rhythm should subscribe here rather than poll getLastFireByRole.
let _layerFireSubs    = [];

/** Lazy-load tone + tonal + packs once. Subsequent calls await the same promise. */
function init() {
    if (_initPromise) return _initPromise;
    _initPromise = (async () => {
        const packsURL = new URL('../../global_assets/music/packs.json', import.meta.url);
        const [ToneMod, TonalMod, packsRes] = await Promise.all([
            import('tone'),
            import('@tonaljs/tonal'),
            fetch(packsURL).then(r => {
                if (!r.ok) throw new Error(`packs.json fetch failed: ${r.status} ${r.statusText}`);
                return r.json();
            }),
        ]);
        _Tone     = ToneMod;
        _Tonal    = TonalMod;
        _packsDoc = packsRes;
    })();
    return _initPromise;
}

/**
 * Start playing a theme. If another theme is already playing it is disposed
 * first. Resolves once Transport has been started.
 *
 * @param {object} theme   plan-§7 theme (use musicCompiler.assetToTheme on stored assets).
 * @param {object} [opts]
 * @param {object} [opts.params]   Override defaults: { valence, complexity, speed }.
 * @param {number} [opts.seed]     Override theme.seeds.pattern.
 * @param {Function} [opts.onEnd]  Called when the engine ends naturally (play-once / fade-out).
 */
async function play(theme, opts = {}) {
    await init();
    if (!_Tone || !_Tonal || !_packsDoc) {
        const err = new Error('audio init never resolved');
        console.error('[musicPlayer]', err);
        throw err;
    }

    // Swap out any prior controller before scheduling new loops.
    if (_controller) {
        try { _controller.dispose(); } catch {}
        _controller = null;
    }
    _lastFireByRole = Object.create(null);

    try {
        _controller = compileTheme({
            theme,
            packs:  _packsDoc,
            params: opts.params,
            seed:   opts.seed,
            Tone:   _Tone,
            Tonal:  _Tonal,
            onLayerFire: (role) => {
                _lastFireByRole[role] = (typeof performance !== 'undefined')
                    ? performance.now()
                    : Date.now();
                // Notify external subscribers (camera cuts, future SFX, etc.).
                // Each subscriber is wrapped so a thrown handler can't kill
                // the audio path or block other subscribers.
                for (const sub of _layerFireSubs) {
                    try { sub(role); }
                    catch (e) { console.warn('[musicPlayer] subscribeLayerFire handler threw:', e?.message || e); }
                }
            },
        });
        _onEnd = opts.onEnd ?? null;
        await _controller.start();
        console.info('[musicPlayer] playing %s (seed=%s)', theme.id || theme.name || '?', theme.seeds?.pattern);
    } catch (e) {
        console.error('[musicPlayer] compile/start failed:', e);
        _controller = null;
        // Re-throw so callers (MusicBridge) can surface the failure to the
        // user via the in-panel status line. Swallowing this previously meant
        // failures (Safari Tone.MetalSynth errors, pack misconfig, etc.) were
        // invisible — UI showed "playing" while nothing actually played.
        throw e;
    }
}

/** Stop the current controller (if any). Safe to call when nothing's playing. */
function stop() {
    if (!_controller) return;
    try { _controller.dispose(); } catch {}
    _controller    = null;
    _lastFireByRole = Object.create(null);
    if (_onEnd) {
        const cb = _onEnd; _onEnd = null;
        try { cb(); } catch {}
    }
}

function isPlaying() {
    return !!(_controller && _controller.isPlaying && _controller.isPlaying());
}

function setParam(name, value) {
    if (!_controller) return;
    try { _controller.setParam(name, value); } catch (e) {
        console.warn('[musicPlayer] setParam failed:', e?.message || e);
    }
}

function setLayerEnabled(role, enabled) {
    if (!_controller || !_controller.setLayerEnabled) return;
    try { _controller.setLayerEnabled(role, enabled); } catch (e) {
        console.warn('[musicPlayer] setLayerEnabled failed:', e?.message || e);
    }
}

/** Apply a named modulation mode from the playing theme. Returns false if no
 *  controller, or if the mode name isn't defined on the theme. */
function applyMode(modeName) {
    if (!_controller || !_controller.applyMode) return false;
    try { return _controller.applyMode(modeName); }
    catch (e) {
        console.warn('[musicPlayer] applyMode failed:', e?.message || e);
        return false;
    }
}

/** Diagnostic — when did each role last fire a note? Returns plain object. */
function getLastFireByRole() {
    return { ..._lastFireByRole };
}

/**
 * Subscribe to "any layer just fired a note" events. Handler receives
 * the role string ('bass' | 'drums' | 'melody' | 'pad' | 'chords' | ...).
 * Returns an unsubscribe function — callers MUST call it on teardown
 * to avoid leaking handlers across sim builds.
 *
 * Use this for anything that needs to sync to the music's rhythm:
 *   • Beat-aware camera cuts (filter to drums/bass for downbeats)
 *   • Story-level SFX triggers (fire a stinger on a specific role)
 *   • Visualisers, particle pulses, screen-shake on heavy hits
 *
 * Multiple subscribers coexist; each gets every event.
 */
function subscribeLayerFire(handler) {
    if (typeof handler !== 'function') return () => {};
    _layerFireSubs.push(handler);
    return () => {
        _layerFireSubs = _layerFireSubs.filter(h => h !== handler);
    };
}

/** Diagnostic — current layer state if a controller is alive. */
function getLayerSnapshot() {
    if (!_controller || !_controller._layerSnapshot) return [];
    try { return _controller._layerSnapshot(); } catch { return []; }
}

export const musicPlayer = {
    init,
    play,
    stop,
    isPlaying,
    setParam,
    setLayerEnabled,
    applyMode,
    getLastFireByRole,
    getLayerSnapshot,
    subscribeLayerFire,
};
