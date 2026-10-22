import { effects } from './effects.svelte';

export type Cue = 'right' | 'wrong' | 'name' | 'done' | 'lost';

interface Tone {
  /** Frequency in Hz. */
  freq: number;
  /** Start offset in seconds. */
  at: number;
  /** Length in seconds. */
  len: number;
  type?: OscillatorType;
}

const CUES: Record<Cue, Tone[]> = {
  right: [
    { freq: 660, at: 0, len: 0.09 },
    { freq: 880, at: 0.09, len: 0.14 },
  ],
  wrong: [{ freq: 130, at: 0, len: 0.22, type: 'sawtooth' }],
  name: [
    { freq: 523, at: 0, len: 0.1 },
    { freq: 659, at: 0.1, len: 0.1 },
    { freq: 784, at: 0.2, len: 0.2 },
  ],
  done: [
    { freq: 523, at: 0, len: 0.1 },
    { freq: 659, at: 0.1, len: 0.1 },
    { freq: 784, at: 0.2, len: 0.1 },
    { freq: 1047, at: 0.3, len: 0.3 },
  ],
  lost: [
    { freq: 392, at: 0, len: 0.15, type: 'triangle' },
    { freq: 330, at: 0.15, len: 0.15, type: 'triangle' },
    { freq: 262, at: 0.3, len: 0.3, type: 'triangle' },
  ],
};

let ctx: AudioContext | undefined;

/** Play a short synthesised cue; silent when effects are off or Web Audio is missing. */
export function playCue(cue: Cue): void {
  if (!effects.on || typeof AudioContext === 'undefined') return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    const start = ctx.currentTime + 0.01;
    for (const tone of CUES[cue]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tone.type ?? 'sine';
      osc.frequency.value = tone.freq;
      const from = start + tone.at;
      const to = from + tone.len;
      gain.gain.setValueAtTime(0.0001, from);
      gain.gain.exponentialRampToValueAtTime(0.15, from + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, to);
      osc.connect(gain).connect(ctx.destination);
      osc.start(from);
      osc.stop(to + 0.02);
    }
  } catch {
    // audio is a nicety: never break the session for it
  }
}
