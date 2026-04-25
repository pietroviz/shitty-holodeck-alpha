/**
 * musicEngine.js — Simple Web Audio synthesizer for music asset previews.
 *
 * Plays note patterns from music asset layers using basic oscillators.
 * Not a full Strudel interpreter — just enough for browse-panel previews.
 */

// ── Note frequency lookup ─────────────────────────────────────────
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NOTE_ALIASES = { 'Db':'C#','Eb':'D#','Fb':'E','Gb':'F#','Ab':'G#','Bb':'A#','Cb':'B' };

function noteToFreq(noteStr) {
    if (!noteStr || typeof noteStr !== 'string') return null;
    // Parse "A4", "C#3", "Eb5", etc.
    const match = noteStr.trim().match(/^([A-Ga-g][#b]?)(\d)$/);
    if (!match) return null;
    let name = match[1].charAt(0).toUpperCase() + match[1].slice(1);
    name = NOTE_ALIASES[name] || name;
    const octave = parseInt(match[2]);
    const semitone = NOTE_NAMES.indexOf(name);
    if (semitone < 0) return null;
    // A4 = 440 Hz, MIDI 69
    const midi = semitone + (octave + 1) * 12;
    return 440 * Math.pow(2, (midi - 69) / 12);
}

// ── Oscillator type by layer name heuristic ───────────────────────
function oscTypeForLayer(layerName) {
    const n = (layerName || '').toLowerCase();
    if (n.includes('drum') || n.includes('beat') || n.includes('perc')) return 'triangle';
    if (n.includes('bass'))  return 'sawtooth';
    if (n.includes('pad'))   return 'sine';
    if (n.includes('lead'))  return 'square';
    return 'sine';
}

// ── MusicEngine ───────────────────────────────────────────────────
export class MusicEngine {
    constructor() {
        this._ctx       = null;
        this._playing   = false;
        this._timers    = [];
        this._nodes     = [];  // { osc, gain } for cleanup
        this._masterGain = null;
        this._loopTimer  = null;
    }

    async init() {
        if (this._ctx) return;
        this._ctx = new (window.AudioContext || window.webkitAudioContext)();
        this._masterGain = this._ctx.createGain();
        this._masterGain.gain.value = 0.35;
        this._masterGain.connect(this._ctx.destination);
    }

    get isPlaying() { return this._playing; }

    /**
     * Play a music asset's layers with proper duration behavior.
     * @param {Object} asset — music asset (with payload.bpm, payload.layers, etc.)
     * @param {Object} opts  — { loop: undefined } (overrides duration_behavior if set)
     */
    play(asset, opts = {}) {
        // Hard-stop (no fade) so any in-flight oscillators are torn down
        // synchronously before we schedule new ones. A fade-out cleanup
        // runs in a setTimeout, which would otherwise fire AFTER the new
        // notes are queued in `_nodes` and silently kill them — and worse,
        // any conflicting masterGain ramps would compound.
        this.stop(0);
        if (!this._ctx) return;
        if (this._ctx.state === 'suspended') this._ctx.resume();

        const payload  = asset.payload?.state || asset.payload || {};
        const bpm      = payload.bpm || 120;
        const layers   = payload.layers || [];
        const fadeIn   = payload.fade_in ?? 0.5;
        const fadeOut  = payload.fade_out ?? 1.0;
        const behavior = opts.loop !== undefined
            ? (opts.loop ? 'loop' : 'play-once')
            : (payload.duration_behavior || 'loop');

        if (layers.length === 0) return;

        this._playing = true;

        // Fade in master gain — cancel any prior schedule first so we don't
        // stack ramps from a previous stop()/play() cycle.
        const t0 = this._ctx.currentTime;
        this._masterGain.gain.cancelScheduledValues(t0);
        this._masterGain.gain.setValueAtTime(0, t0);
        this._masterGain.gain.linearRampToValueAtTime(0.35, t0 + fadeIn);

        const beatDur = 60 / bpm; // seconds per beat
        this._schedulePass(layers, beatDur, this._ctx.currentTime);

        // Calculate total duration of one pass (max layer length)
        const maxNotes = Math.max(...layers.map(l => {
            const notes = (l.pattern || '').split(/\s+/).filter(Boolean);
            return notes.length;
        }));
        const passDuration = maxNotes * beatDur;

        if (passDuration <= 0) return;

        if (behavior === 'loop') {
            const scheduleNext = () => {
                if (!this._playing) return;
                this._schedulePass(layers, beatDur, this._ctx.currentTime);
                this._loopTimer = setTimeout(scheduleNext, passDuration * 1000 - 50);
            };
            this._loopTimer = setTimeout(scheduleNext, passDuration * 1000 - 50);
        } else if (behavior === 'play-once') {
            // Stop after one pass
            this._loopTimer = setTimeout(() => {
                this._playing = false;
                if (this._onEnd) this._onEnd();
            }, passDuration * 1000);
        } else if (behavior === 'fade-out') {
            // Play once, then fade out over fade_out seconds
            const fadeStartMs = Math.max(0, passDuration * 1000 - fadeOut * 1000);
            this._loopTimer = setTimeout(() => {
                if (!this._playing || !this._masterGain || !this._ctx) return;
                try {
                    this._masterGain.gain.cancelScheduledValues(this._ctx.currentTime);
                    this._masterGain.gain.setValueAtTime(this._masterGain.gain.value, this._ctx.currentTime);
                    this._masterGain.gain.linearRampToValueAtTime(0, this._ctx.currentTime + fadeOut);
                } catch {}
                this._loopTimer = setTimeout(() => {
                    this._playing = false;
                    if (this._onEnd) this._onEnd();
                }, fadeOut * 1000);
            }, fadeStartMs);
        }
    }

    /** Register a callback for when playback ends naturally (play-once / fade-out). */
    set onEnd(cb) { this._onEnd = cb; }

    _schedulePass(layers, beatDur, startTime) {
        for (const layer of layers) {
            const notes = (layer.pattern || '').split(/\s+/).filter(Boolean);
            const oscType = layer.oscType || oscTypeForLayer(layer.name);
            const layerGain = layer.gain ?? 0.5;

            for (let i = 0; i < notes.length; i++) {
                const freq = noteToFreq(notes[i]);
                if (!freq) continue;

                const noteStart = startTime + i * beatDur;
                const noteDur   = beatDur * 0.8; // slight gap between notes

                const osc  = this._ctx.createOscillator();
                const gain = this._ctx.createGain();

                osc.type = oscType;
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0, noteStart);
                gain.gain.linearRampToValueAtTime(layerGain * 0.5, noteStart + 0.02);
                gain.gain.linearRampToValueAtTime(layerGain * 0.3, noteStart + noteDur * 0.5);
                gain.gain.linearRampToValueAtTime(0, noteStart + noteDur);

                osc.connect(gain);
                gain.connect(this._masterGain);
                osc.start(noteStart);
                osc.stop(noteStart + noteDur + 0.05);

                this._nodes.push({ osc, gain });

                // Clean up nodes after they finish
                osc.onended = () => {
                    try { osc.disconnect(); gain.disconnect(); } catch {}
                };
            }
        }
    }

    /**
     * Stop playback with a quick fade-out.
     * @param {number} [fadeSec=0.15] — fade-out duration in seconds
     */
    stop(fadeSec = 0.15) {
        this._playing = false;
        if (this._loopTimer) { clearTimeout(this._loopTimer); this._loopTimer = null; }

        // Fade out
        if (this._masterGain && this._ctx) {
            try {
                this._masterGain.gain.cancelScheduledValues(this._ctx.currentTime);
                this._masterGain.gain.setValueAtTime(this._masterGain.gain.value, this._ctx.currentTime);
                this._masterGain.gain.linearRampToValueAtTime(0, this._ctx.currentTime + fadeSec);
            } catch {}
        }

        // Stop all oscillators after fade completes
        const cleanup = () => {
            for (const { osc, gain } of this._nodes) {
                try { osc.stop(); osc.disconnect(); gain.disconnect(); } catch {}
            }
            this._nodes = [];
        };
        if (fadeSec > 0) {
            setTimeout(cleanup, fadeSec * 1000 + 50);
        } else {
            cleanup();
        }
    }

    destroy() {
        this.stop();
        if (this._ctx) {
            try { this._ctx.close(); } catch {}
            this._ctx = null;
        }
    }
}
