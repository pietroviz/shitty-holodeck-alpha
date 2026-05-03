/**
 * musicEngine.js — thin compatibility shim over musicPlayer.
 *
 * Historically this file owned its own audio graph (oscillators, sequences,
 * legacy-format adapter, etc.). Phase-1 refactor (V0.10) collapsed all
 * playback into a single shared singleton — see musicPlayer.js for the
 * actual logic. This class survives only because SimulationBridge and
 * EnvironmentBridge.legacy still construct `new MusicEngine()` for their
 * own scenes; they get the same one-engine guarantee as everything else
 * by routing through musicPlayer under the hood.
 *
 * Public API preserved:
 *   const e = new MusicEngine();
 *   await e.init();
 *   e.onEnd = () => {};
 *   e.play(asset);                  // asset = stored music asset (v2 envelope)
 *   e.stop(fadeSec);                // fadeSec ignored — musicPlayer has its own ramps
 *   e.destroy();
 *   e.isPlaying                     // getter
 *
 * Legacy (pre-v2) assets are no longer in the manifest, so the previous
 * note-by-note synth path was removed. If a caller hands us an asset that
 * isn't v2, we log and skip — there's no data path that should reach this.
 */

import { musicPlayer } from './musicPlayer.js?v=1';
import { assetToTheme, isV2MusicAsset } from './musicCompiler.js?v=2';

export class MusicEngine {
    constructor() {
        this._onEnd = null;
    }

    async init() {
        return musicPlayer.init();
    }

    get isPlaying() { return musicPlayer.isPlaying(); }
    set onEnd(cb)   { this._onEnd = cb; }

    async play(asset) {
        if (!isV2MusicAsset(asset)) {
            console.warn('[MusicEngine] non-v2 asset ignored — playback skipped:', asset?.id);
            return;
        }
        const theme = assetToTheme(asset);
        if (!theme) return;
        return musicPlayer.play(theme, { onEnd: this._onEnd });
    }

    /** Compatibility — legacy callers passed a fadeSec; we no-op it because
     *  musicPlayer manages its own gain ramps inside compileTheme. */
    stop(/* fadeSec */) {
        musicPlayer.stop();
    }

    destroy() {
        musicPlayer.stop();
        this._onEnd = null;
    }
}
