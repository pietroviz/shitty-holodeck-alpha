'use client';

/**
 * Phase 1 step 1 spike: verify Tone.js + Tonal.js load in Next.js 16 and
 * produce sound. Not linked anywhere — reach it at /spike/tone.
 *
 * What this exercises:
 *   - Dynamic import of `tone` (the heavy one).
 *   - Dynamic import of `@tonaljs/tonal` (music-theory helpers).
 *   - Tone.MembraneSynth for a kick drum (confirms drum-optimized synth works).
 *   - Tone.Synth with an envelope for a melody note.
 *   - Tonal.Scale.get to pull notes for a key.
 *   - Tone.Transport.scheduleOnce at a cycle boundary (the parameter-write model).
 */

import { useRef, useState } from 'react';

export default function ToneSpike() {
    const [status, setStatus]   = useState<string>('idle');
    const [error,  setError]    = useState<string | null>(null);
    const [scale,  setScale]    = useState<string[]>([]);
    const playing = useRef(false);

    const bootAndPlay = async () => {
        try {
            setStatus('loading tone + tonal…');
            const Tone  = await import('tone');
            const Tonal = await import('@tonaljs/tonal');

            setStatus('Tone.start()…');
            await Tone.start();

            // Tonal: resolve a scale into note names.
            const cMajor = Tonal.Scale.get('C major').notes; // ['C','D','E','F','G','A','B']
            setScale(cMajor);

            setStatus('building synths…');
            const kick   = new Tone.MembraneSynth({ pitchDecay: 0.05, octaves: 8 }).toDestination();
            const lead   = new Tone.Synth({
                oscillator: { type: 'square' },
                envelope:   { attack: 0.005, decay: 0.1, sustain: 0.3, release: 0.2 },
            }).toDestination();

            setStatus('scheduling…');
            Tone.Transport.bpm.value = 120;
            // Kick on every quarter note of one bar.
            const kickLoop = new Tone.Loop((time: number) => {
                kick.triggerAttackRelease('C2', '8n', time);
            }, '4n').start(0);

            // Melody plays the C major scale once.
            cMajor.forEach((n, i) => {
                Tone.Transport.scheduleOnce((time) => {
                    lead.triggerAttackRelease(`${n}4`, '8n', time);
                }, `0:${i}:0`);
            });

            // Stop after 2 bars.
            Tone.Transport.scheduleOnce(() => {
                kickLoop.stop();
                Tone.Transport.stop();
                kick.dispose();
                lead.dispose();
                playing.current = false;
                setStatus('finished');
            }, '2:0:0');

            Tone.Transport.start();
            playing.current = true;
            setStatus('playing');
        } catch (e) {
            setError(e instanceof Error ? `${e.name}: ${e.message}` : String(e));
            setStatus('error');
        }
    };

    const stop = async () => {
        if (!playing.current) return;
        const Tone = await import('tone');
        Tone.Transport.stop();
        Tone.Transport.cancel();
        playing.current = false;
        setStatus('stopped');
    };

    return (
        <main style={{ padding: 40, fontFamily: 'monospace', color: '#ddd', background: '#0b0b14', minHeight: '100vh' }}>
            <h1 style={{ fontSize: 18, marginBottom: 16 }}>Tone.js + Tonal.js spike</h1>
            <p style={{ marginBottom: 12 }}>status: <strong>{status}</strong></p>
            {scale.length > 0 && (
                <p style={{ marginBottom: 12 }}>C major scale (via Tonal): {scale.join(' ')}</p>
            )}
            {error && (
                <pre style={{ color: '#ff6b6b', background: '#1a0a0a', padding: 12, borderRadius: 6, whiteSpace: 'pre-wrap' }}>
                    {error}
                </pre>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button onClick={bootAndPlay} style={btn}>Play kick + C major scale</button>
                <button onClick={stop} style={btn}>Stop</button>
            </div>
        </main>
    );
}

const btn: React.CSSProperties = {
    padding: '10px 16px',
    background: '#1a2a3a',
    color: '#9ce',
    border: '1px solid #345',
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: 'inherit',
};
