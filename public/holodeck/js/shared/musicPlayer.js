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
};
