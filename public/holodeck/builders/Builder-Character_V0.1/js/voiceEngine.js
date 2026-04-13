import {
    VISEMES, LETTER_MAP, DIGRAPH_MAP,
    VOICE_PRESETS, VOICE_DEFAULTS,
} from './config.js';

// ═══════════════════════════════════════════════════════
// VOICE ENGINE — meSpeak TTS + Audio Effects + Viseme Engine
// Ported from VoiceBox V2 into an ES module for the Character Builder.
// ═══════════════════════════════════════════════════════

// ── Text → Viseme Conversion ─────────────────────────

function wordToVisemes(word) {
    const lower = word.toLowerCase().replace(/[^a-z]/g, '');
    if (!lower.length) return [];
    const result = [];
    let i = 0;
    while (i < lower.length) {
        if (i + 1 < lower.length) {
            const digraph = lower[i] + lower[i + 1];
            if (DIGRAPH_MAP[digraph]) {
                result.push(DIGRAPH_MAP[digraph]);
                i += 2;
                continue;
            }
        }
        result.push(LETTER_MAP[lower[i]] || 'REST');
        i++;
    }
    return result;
}

// ── Amplitude Envelope ───────────────────────────────
// Pre-computes RMS energy from the audio buffer in small windows.
// Drives jawOpen in real-time for tight lip sync.

class AmplitudeEnvelope {
    constructor() {
        this.envelope = [];
        this.windowMs = 15;
        this.durationMs = 0;
        this.ready = false;
    }

    analyze(audioBuffer) {
        const sampleRate = audioBuffer.sampleRate;
        const samples = audioBuffer.getChannelData(0);
        const windowSamples = Math.floor((this.windowMs / 1000) * sampleRate);
        const numWindows = Math.ceil(samples.length / windowSamples);

        this.envelope = new Float32Array(numWindows);
        this.durationMs = (samples.length / sampleRate) * 1000;

        let maxRms = 0;
        for (let w = 0; w < numWindows; w++) {
            const start = w * windowSamples;
            const end = Math.min(start + windowSamples, samples.length);
            let sumSq = 0;
            for (let i = start; i < end; i++) {
                sumSq += samples[i] * samples[i];
            }
            const rms = Math.sqrt(sumSq / (end - start));
            this.envelope[w] = rms;
            if (rms > maxRms) maxRms = rms;
        }

        if (maxRms > 0) {
            for (let i = 0; i < numWindows; i++) {
                this.envelope[i] /= maxRms;
            }
        }

        this.ready = true;
    }

    getSmoothedEnergy(timeMs, radiusMs = 10) {
        if (!this.ready) return 0;
        const centerIdx = timeMs / this.windowMs;
        const radiusIdx = radiusMs / this.windowMs;
        const lo = Math.max(0, Math.floor(centerIdx - radiusIdx));
        const hi = Math.min(this.envelope.length - 1, Math.ceil(centerIdx + radiusIdx));
        if (lo > hi) return 0;
        let sum = 0;
        for (let i = lo; i <= hi; i++) sum += this.envelope[i];
        return sum / (hi - lo + 1);
    }

    findSoundRegions(silenceThreshold = 0.05, minGapMs = 40) {
        if (!this.ready) return [];
        const regions = [];
        let inSound = false;
        let regionStart = 0;
        const minGapWindows = Math.ceil(minGapMs / this.windowMs);
        let silenceCount = 0;

        for (let i = 0; i < this.envelope.length; i++) {
            if (this.envelope[i] > silenceThreshold) {
                if (!inSound) {
                    regionStart = i * this.windowMs;
                    inSound = true;
                }
                silenceCount = 0;
            } else {
                silenceCount++;
                if (inSound && silenceCount >= minGapWindows) {
                    regions.push({
                        startMs: regionStart,
                        endMs: (i - silenceCount + 1) * this.windowMs,
                    });
                    inSound = false;
                }
            }
        }
        if (inSound) {
            regions.push({ startMs: regionStart, endMs: this.durationMs });
        }
        return regions;
    }

    clear() {
        this.envelope = [];
        this.durationMs = 0;
        this.ready = false;
    }
}

// ── Viseme Engine ────────────────────────────────────
// Hybrid approach: jawOpen from audio amplitude, lip shape from text→viseme.

class VisemeEngine {
    constructor() {
        this.queue = [];
        this.queueIndex = 0;
        this.elapsed = 0;
        this.playing = false;
        this.currentParams = { jawOpen: 0, lipWidth: 0.45, lipRound: 0, tongueUp: 0, teethShow: 0 };
        this.targetParams = { ...this.currentParams };
        this.currentKey = 'REST';
        this.durationMs = 0;

        this.ampEnvelope = new AmplitudeEnvelope();
        this.jawFromAudio = 0;

        // Tuning
        this.snappiness = 0.85;
        this.audioLeadMs = 40;
        this.jawGain = 1.2;
    }

    startSentence(text, durationMs, audioBuffer) {
        const words = text.split(/\s+/).filter(w => w.length > 0);
        this.durationMs = durationMs;

        if (audioBuffer) {
            this.ampEnvelope.analyze(audioBuffer);
        }

        const wordVisemes = [];
        for (let w = 0; w < words.length; w++) {
            wordVisemes.push(wordToVisemes(words[w]).map(key => ({ key, wordIdx: w })));
        }

        const soundRegions = this.ampEnvelope.findSoundRegions(0.06, 30);

        if (soundRegions.length > 0 && words.length > 0) {
            this.queue = this._remapToRegions(wordVisemes, soundRegions, durationMs);
        } else {
            const flat = [];
            for (let w = 0; w < wordVisemes.length; w++) {
                flat.push(...wordVisemes[w]);
                if (w < wordVisemes.length - 1) flat.push({ key: 'REST', wordIdx: -1 });
            }
            this.queue = this._distributeEvenly(flat, durationMs);
        }

        this.queueIndex = 0;
        this.elapsed = 0;
        this.playing = true;
    }

    _remapToRegions(wordVisemes, regions, durationMs) {
        const queue = [];
        const numWords = wordVisemes.length;
        const numRegions = regions.length;

        const assignments = [];
        for (let r = 0; r < numRegions; r++) assignments.push([]);

        if (numWords <= numRegions) {
            for (let w = 0; w < numWords; w++) {
                const r = Math.round(w * (numRegions - 1) / Math.max(numWords - 1, 1));
                assignments[r].push(w);
            }
        } else {
            for (let w = 0; w < numWords; w++) {
                const r = Math.min(numRegions - 1, Math.floor(w * numRegions / numWords));
                assignments[r].push(w);
            }
        }

        for (let r = 0; r < numRegions; r++) {
            const region = regions[r];
            const regionDur = region.endMs - region.startMs;
            const wordsHere = assignments[r];
            if (wordsHere.length === 0) continue;

            const regionVis = [];
            for (let i = 0; i < wordsHere.length; i++) {
                regionVis.push(...wordVisemes[wordsHere[i]]);
                if (i < wordsHere.length - 1) {
                    regionVis.push({ key: 'REST', wordIdx: -1 });
                }
            }

            const slotDur = regionDur / Math.max(regionVis.length, 1);
            let t = region.startMs;
            for (const rv of regionVis) {
                const dur = rv.key === 'REST' ? slotDur * 0.3 : slotDur;
                queue.push({ key: rv.key, time: t, duration: dur, wordIdx: rv.wordIdx !== undefined ? rv.wordIdx : -1 });
                t += dur;
            }

            if (r + 1 < numRegions) {
                const gapEnd = regions[r + 1].startMs;
                if (t < gapEnd) {
                    queue.push({ key: 'REST', time: t, duration: gapEnd - t, wordIdx: -1 });
                }
            }
        }

        if (queue.length > 0) {
            const lastItem = queue[queue.length - 1];
            const lastEnd = lastItem.time + lastItem.duration;
            if (lastEnd < durationMs - 50) {
                queue.push({ key: 'REST', time: lastEnd, duration: durationMs - lastEnd, wordIdx: -1 });
            }
        }

        return queue;
    }

    _distributeEvenly(allVisemes, durationMs) {
        const queue = [];
        const slotDur = durationMs / Math.max(allVisemes.length, 1);
        let time = 0;
        for (const v of allVisemes) {
            const dur = v.key === 'REST' ? slotDur * 0.4 : slotDur;
            queue.push({ key: v.key, time, duration: dur, wordIdx: v.wordIdx !== undefined ? v.wordIdx : -1 });
            time += dur;
        }
        return queue;
    }

    stop() {
        this.playing = false;
        this.targetParams = { ...VISEMES.REST };
        this.currentKey = 'REST';
        this.jawFromAudio = 0;
        this.ampEnvelope.clear();
    }

    update(dtMs) {
        if (this.playing && this.queue.length > 0) {
            this.elapsed += dtMs;
            const lookupTime = this.elapsed + this.audioLeadMs;

            // Audio-driven jaw
            const rawEnergy = this.ampEnvelope.getSmoothedEnergy(this.elapsed, 8);
            this.jawFromAudio = Math.min(1, Math.max(0, rawEnergy * this.jawGain));

            // Viseme shape lookup
            let newIndex = this.queueIndex;
            while (newIndex < this.queue.length - 1 &&
                   lookupTime >= this.queue[newIndex + 1].time) {
                newIndex++;
            }
            this.queueIndex = newIndex;

            if (this.queueIndex < this.queue.length) {
                const item = this.queue[this.queueIndex];
                const v = VISEMES[item.key];
                if (v) {
                    const audioJaw = this.jawFromAudio;
                    const openness = Math.max(audioJaw, 0.05);

                    this.targetParams = {
                        jawOpen: audioJaw,
                        lipWidth: v.lipWidth,
                        lipRound: v.lipRound,
                        tongueUp: v.tongueUp * openness,
                        teethShow: v.teethShow,
                    };
                    this.currentKey = item.key;
                }
            }

            if (this.elapsed >= this.durationMs + 100) {
                this.stop();
            }
        }

        // Interpolation
        const dt = dtMs / 1000;
        const baseLerp = 1 - Math.exp(-14 * dt);
        const snapLerp = 1 - Math.exp(-120 * dt);
        const t = baseLerp + (snapLerp - baseLerp) * this.snappiness;

        for (const key of Object.keys(this.currentParams)) {
            this.currentParams[key] += (this.targetParams[key] - this.currentParams[key]) * t;
        }
    }

    getParams() {
        return { ...this.currentParams, visemeKey: this.currentKey };
    }
}

// ── Audio Effect Chain ───────────────────────────────
// Web Audio post-processing: brightness, reverb, wobble, breathiness,
// vocal fry, chorus, volume. Ported from VoiceBox V2.

class AudioEffectChain {
    constructor() {
        this.ctx = null;
        this.nodes = {};
        this.ready = false;
        this.values = { ...VOICE_DEFAULTS.effects };
    }

    init(ctx) {
        this.ctx = ctx;

        // Brightness
        this.nodes.brightness = ctx.createBiquadFilter();
        this.nodes.brightness.type = 'lowpass';
        this.nodes.brightness.frequency.value = 20000;
        this.nodes.brightness.Q.value = 0.7;

        // Reverb
        this.nodes.reverbDry = ctx.createGain();
        this.nodes.reverbDry.gain.value = 1;
        this.nodes.reverbWet = ctx.createGain();
        this.nodes.reverbWet.gain.value = 0;
        this.nodes.convolver = ctx.createConvolver();
        this._buildImpulseResponse(1.5);
        this.nodes.reverbMerge = ctx.createGain();

        // Wobble (tremolo)
        this.nodes.wobbleGain = ctx.createGain();
        this.nodes.wobbleGain.gain.value = 1;
        this.nodes.wobbleLfo = ctx.createOscillator();
        this.nodes.wobbleLfo.type = 'sine';
        this.nodes.wobbleLfo.frequency.value = 5;
        this.nodes.wobbleTremoloDepth = ctx.createGain();
        this.nodes.wobbleTremoloDepth.gain.value = 0;
        this.nodes.wobbleLfo.connect(this.nodes.wobbleTremoloDepth);
        this.nodes.wobbleTremoloDepth.connect(this.nodes.wobbleGain.gain);
        this.nodes.wobbleLfo.start();

        // Breathiness (pink noise)
        this.nodes.breathGain = ctx.createGain();
        this.nodes.breathGain.gain.value = 0;
        this.nodes.breathFilter = ctx.createBiquadFilter();
        this.nodes.breathFilter.type = 'bandpass';
        this.nodes.breathFilter.frequency.value = 2500;
        this.nodes.breathFilter.Q.value = 0.8;
        this._createNoiseSource();
        this.nodes.noiseSource.connect(this.nodes.breathFilter);
        this.nodes.breathFilter.connect(this.nodes.breathGain);

        // Vocal fry
        this.nodes.fryGain = ctx.createGain();
        this.nodes.fryGain.gain.value = 1;
        this.nodes.fryLfo = ctx.createOscillator();
        this.nodes.fryLfo.type = 'sine';
        this.nodes.fryLfo.frequency.value = 50;
        this.nodes.fryDepth = ctx.createGain();
        this.nodes.fryDepth.gain.value = 0;
        this.nodes.fryLfo.connect(this.nodes.fryDepth);
        this.nodes.fryDepth.connect(this.nodes.fryGain.gain);
        this.nodes.fryLfo.start();

        // Chorus
        this.nodes.chorusDry = ctx.createGain();
        this.nodes.chorusDry.gain.value = 1;
        this.nodes.chorusWet = ctx.createGain();
        this.nodes.chorusWet.gain.value = 0;
        this.nodes.chorusDelay = ctx.createDelay(0.1);
        this.nodes.chorusDelay.delayTime.value = 0.015;
        this.nodes.chorusLfo = ctx.createOscillator();
        this.nodes.chorusLfo.type = 'sine';
        this.nodes.chorusLfo.frequency.value = 1.5;
        this.nodes.chorusLfoDepth = ctx.createGain();
        this.nodes.chorusLfoDepth.gain.value = 0.003;
        this.nodes.chorusLfo.connect(this.nodes.chorusLfoDepth);
        this.nodes.chorusLfoDepth.connect(this.nodes.chorusDelay.delayTime);
        this.nodes.chorusLfo.start();
        this.nodes.chorusMerge = ctx.createGain();

        // Volume
        this.nodes.volume = ctx.createGain();
        this.nodes.volume.gain.value = 1;

        // Wire the chain
        this.nodes.brightness.connect(this.nodes.reverbDry);
        this.nodes.brightness.connect(this.nodes.reverbWet);
        this.nodes.reverbWet.connect(this.nodes.convolver);
        this.nodes.reverbDry.connect(this.nodes.reverbMerge);
        this.nodes.convolver.connect(this.nodes.reverbMerge);

        this.nodes.reverbMerge.connect(this.nodes.fryGain);
        this.nodes.fryGain.connect(this.nodes.wobbleGain);

        this.nodes.wobbleGain.connect(this.nodes.chorusDry);
        this.nodes.wobbleGain.connect(this.nodes.chorusWet);
        this.nodes.chorusWet.connect(this.nodes.chorusDelay);
        this.nodes.chorusDry.connect(this.nodes.chorusMerge);
        this.nodes.chorusDelay.connect(this.nodes.chorusMerge);

        this.nodes.breathGain.connect(this.nodes.chorusMerge);
        this.nodes.chorusMerge.connect(this.nodes.volume);
        this.nodes.volume.connect(ctx.destination);

        this.ready = true;
    }

    get input() { return this.nodes.brightness; }

    connectSource(source) {
        source.connect(this.input);
        if (this._vibratoDepth > 0) {
            const vibratoGain = this.ctx.createGain();
            vibratoGain.gain.value = this._vibratoDepth;
            this.nodes.wobbleLfo.connect(vibratoGain);
            vibratoGain.connect(source.detune);
        }
    }

    get _vibratoDepth() {
        return (this.values.wobble / 100) * 50;
    }

    setVolume(v) { if (this.ready) this.nodes.volume.gain.value = v; }

    setBrightness(val) {
        if (!this.ready) return;
        this.values.brightness = val;
        if (val <= 0) {
            this.nodes.brightness.type = 'lowpass';
            const t = (val + 100) / 100;
            this.nodes.brightness.frequency.value = 300 + t * 19700;
        } else {
            this.nodes.brightness.type = 'highpass';
            this.nodes.brightness.frequency.value = 20 + (val / 100) * 2980;
        }
    }

    setReverb(val) {
        if (!this.ready) return;
        this.values.reverb = val;
        const wet = val / 100;
        this.nodes.reverbDry.gain.value = 1 - wet * 0.5;
        this.nodes.reverbWet.gain.value = wet;
    }

    setWobble(val) {
        if (!this.ready) return;
        this.values.wobble = val;
        this.nodes.wobbleTremoloDepth.gain.value = (val / 100) * 0.6;
    }

    setWobbleSpeed(hz) {
        if (!this.ready) return;
        this.values.wobbleSpeed = hz;
        this.nodes.wobbleLfo.frequency.value = hz;
    }

    setBreathiness(val) {
        if (!this.ready) return;
        this.values.breathiness = val;
        this.nodes.breathGain.gain.value = (val / 100) * 0.35;
    }

    setVocalFry(val) {
        if (!this.ready) return;
        this.values.vocalFry = val;
        this.nodes.fryDepth.gain.value = (val / 100) * 0.7;
        this.nodes.fryLfo.frequency.value = 30 + (val / 100) * 50;
    }

    setChorus(val) {
        if (!this.ready) return;
        this.values.chorus = val;
        const wet = val / 100;
        this.nodes.chorusDry.gain.value = 1;
        this.nodes.chorusWet.gain.value = wet * 0.7;
        this.nodes.chorusLfoDepth.gain.value = 0.002 + wet * 0.005;
    }

    applyPresetEffects(preset) {
        this.setReverb(preset.reverb);
        this.setWobble(preset.wobble);
        this.setWobbleSpeed(preset.wobbleSpeed);
        this.setBrightness(preset.brightness);
        this.setBreathiness(preset.breathiness);
        this.setVocalFry(preset.vocalFry);
        this.setChorus(preset.chorus);
    }

    _createNoiseSource() {
        const sampleRate = this.ctx.sampleRate;
        const length = sampleRate * 2;
        const buffer = this.ctx.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < length; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
            b6 = white * 0.115926;
        }
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.start();
        this.nodes.noiseSource = source;
    }

    _buildImpulseResponse(duration) {
        const sampleRate = this.ctx.sampleRate;
        const length = sampleRate * duration;
        const impulse = this.ctx.createBuffer(2, length, sampleRate);
        for (let ch = 0; ch < 2; ch++) {
            const data = impulse.getChannelData(ch);
            for (let i = 0; i < length; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
            }
        }
        this.nodes.convolver.buffer = impulse;
    }
}

// ── meSpeak CDN Loader ───────────────────────────────

const CDN_ROOTS = [
    'https://cdn.jsdelivr.net/gh/btopro/mespeak@master',
];

function loadScript(url) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = url;
        s.onload = resolve;
        s.onerror = () => reject(new Error(`Script load failed: ${url}`));
        document.head.appendChild(s);
    });
}

function waitFor(conditionFn, timeout = 15000, interval = 100) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const check = () => {
            if (conditionFn()) return resolve();
            if (Date.now() - start > timeout) return reject(new Error('Timeout'));
            setTimeout(check, interval);
        };
        check();
    });
}

function loadVoicePromise(url) {
    return new Promise((resolve, reject) => {
        // eslint-disable-next-line no-undef
        meSpeak.loadVoice(url, (success, message) => {
            if (success) resolve(message);
            else reject(new Error(`Voice load failed: ${message}`));
        });
    });
}

// ── Voice Engine (public API) ────────────────────────

export class VoiceEngine {
    constructor() {
        this.isReady = false;
        this.isSpeaking = false;
        this.audioCtx = null;
        this.effectChain = new AudioEffectChain();
        this.visemeEngine = new VisemeEngine();
        this.currentSource = null;
        this.currentVoice = null;
        this.activeVariant = 'm3';
        this.activeCDN = null;
        this.voiceParams = { ...VOICE_DEFAULTS.params };
        this.onSpeakEnd = null;
    }

    async init() {
        let loaded = false;

        for (const root of CDN_ROOTS) {
            try {
                console.log(`[VoiceEngine] Trying CDN: ${root}`);
                await loadScript(`${root}/mespeak.js`);

                if (typeof meSpeak === 'undefined') {
                    throw new Error('meSpeak not defined after script load');
                }

                // eslint-disable-next-line no-undef
                meSpeak.loadConfig(`${root}/mespeak_config.json`);
                // eslint-disable-next-line no-undef
                await waitFor(() => meSpeak.isConfigLoaded(), 15000);

                this.activeCDN = root;
                loaded = true;
                console.log(`[VoiceEngine] Engine loaded from ${root}`);
                break;
            } catch (e) {
                console.warn(`[VoiceEngine] CDN ${root} failed:`, e.message);
            }
        }

        if (!loaded) throw new Error('Could not load meSpeak from any CDN');

        await this._loadVoice('en/en-us');
        this.isReady = true;
        console.log('[VoiceEngine] Ready!');
    }

    async _loadVoice(voicePath) {
        const roots = this.activeCDN
            ? [this.activeCDN, ...CDN_ROOTS.filter(r => r !== this.activeCDN)]
            : CDN_ROOTS;
        for (const root of roots) {
            try {
                await loadVoicePromise(`${root}/voices/${voicePath}.json`);
                this.currentVoice = voicePath;
                return;
            } catch (e) {
                console.warn(`[VoiceEngine] Voice load failed from ${root}:`, e.message);
            }
        }
        throw new Error(`Could not load voice: ${voicePath}`);
    }

    _getAudioCtx() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            this.effectChain.init(this.audioCtx);
        }
        return this.audioCtx;
    }

    setPreset(key) {
        const preset = VOICE_PRESETS[key];
        if (!preset) return;

        this.activeVariant = preset.variant;
        this.voiceParams.speed = preset.speed;
        this.voiceParams.pitch = preset.pitch;
        this.voiceParams.amplitude = Math.min(150, preset.amplitude);
        this.voiceParams.wordgap = preset.wordgap;

        this.effectChain.applyPresetEffects(preset);
    }

    async speak(text) {
        if (!this.isReady) return;
        if (this.isSpeaking) { this.stop(); return; }
        if (!text.trim()) return;

        this.isSpeaking = true;

        try {
            const ctx = this._getAudioCtx();
            if (ctx.state === 'suspended') await ctx.resume();

            const opts = {
                speed: this.voiceParams.speed,
                pitch: this.voiceParams.pitch,
                amplitude: this.voiceParams.amplitude,
                wordgap: this.voiceParams.wordgap,
                variant: this.activeVariant,
                rawdata: 'buffer',
            };

            // eslint-disable-next-line no-undef
            const wavBuffer = meSpeak.speak(text, opts);
            if (!wavBuffer) throw new Error('Speech synthesis returned no data');

            const audioBuffer = await ctx.decodeAudioData(wavBuffer.slice(0));
            const durationMs = audioBuffer.duration * 1000;

            // Start viseme engine
            this.visemeEngine.startSentence(text, durationMs, audioBuffer);

            // Play audio through effect chain
            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            this.effectChain.setVolume(this.voiceParams.volume / 100);
            this.effectChain.connectSource(source);

            if (this.currentSource) {
                try { this.currentSource.stop(); } catch (e) { /* ignore */ }
            }
            this.currentSource = source;

            source.onended = () => {
                this.currentSource = null;
                this._finishSpeaking();
            };

            source.start(0);
        } catch (err) {
            console.error('[VoiceEngine] Speak error:', err);
            this._finishSpeaking();
        }
    }

    _finishSpeaking() {
        this.isSpeaking = false;
        this.visemeEngine.stop();
        if (this.onSpeakEnd) this.onSpeakEnd();
    }

    stop() {
        if (this.currentSource) {
            try { this.currentSource.stop(); } catch (e) { /* ignore */ }
            this.currentSource = null;
        }
        this._finishSpeaking();
    }

    /**
     * Call each frame with delta time in milliseconds.
     */
    update(dtMs) {
        this.visemeEngine.update(dtMs);
    }

    /**
     * Returns current viseme blend parameters for the mouth rig.
     */
    getVisemeParams() {
        return this.visemeEngine.getParams();
    }
}
