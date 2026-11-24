import { AudioAsset } from '../types/editor';

function encodeWavFromFloat32(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export function extractPeaks(samples: Float32Array, barCount = 64): number[] {
  const peaks: number[] = [];
  const step = Math.max(1, Math.floor(samples.length / barCount));
  let maxPeak = 0.01;
  for (let i = 0; i < barCount; i++) {
    const start = i * step;
    let peak = 0;
    for (let j = start; j < Math.min(samples.length, start + step); j += 4) {
      const abs = Math.abs(samples[j]);
      if (abs > peak) peak = abs;
    }
    peaks.push(peak);
    if (peak > maxPeak) maxPeak = peak;
  }
  return peaks.map((p) => Math.max(0.12, Math.min(1, p / maxPeak)));
}

export async function extractPeaksFromAudioFile(url: string): Promise<{ duration: number; peaks: number[] }> {
  try {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const decoded = await ctx.decodeAudioData(buf);
    const channel = decoded.getChannelData(0);
    const peaks = extractPeaks(channel, 72);
    const duration = decoded.duration;
    void ctx.close();
    return { duration, peaks };
  } catch {
    return {
      duration: 10,
      peaks: Array.from({ length: 48 }, (_, i) => 0.25 + 0.55 * Math.abs(Math.sin(i * 0.45))),
    };
  }
}

function generateTrackSamples(
  kind: 'lofi' | 'cinema' | 'percussion' | 'whoosh' | 'shutter' | 'riser',
  durationSec: number,
  sampleRate = 22050
): Float32Array {
  const length = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(length);

  if (kind === 'lofi') {
    const chords = [
      [220, 261.63, 329.63, 392.0], // Am7
      [174.61, 220, 261.63, 329.63], // Fmaj7
      [196.0, 246.94, 293.66, 349.23], // G6
      [164.81, 196.0, 246.94, 293.66], // Em7
    ];
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const bar = Math.floor(t / 2.0) % chords.length;
      const beatT = t % 0.5;
      const chord = chords[bar];
      let pad = 0;
      for (const freq of chord) {
        pad += Math.sin(2 * Math.PI * freq * t) * 0.14;
      }
      // Gentle kick every 0.5s
      const kickEnv = Math.exp(-beatT * 18);
      const kickFreq = 52 + 95 * Math.exp(-beatT * 32);
      const kick = Math.sin(2 * Math.PI * kickFreq * beatT) * kickEnv * 0.42;
      // Soft off-beat snare/hat
      const hatT = (t + 0.25) % 0.5;
      const hat = (Math.random() * 2 - 1) * Math.exp(-hatT * 45) * 0.12;
      const env = Math.min(1, t * 2) * Math.min(1, (durationSec - t) * 2);
      out[i] = (pad * 0.6 + kick + hat) * env * 0.75;
    }
  } else if (kind === 'cinema') {
    const notes = [110, 164.81, 220, 246.94, 329.63];
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      let val = 0;
      for (let n = 0; n < notes.length; n++) {
        const lfo = 0.5 + 0.5 * Math.sin(t * 0.4 + n);
        val += Math.sin(2 * Math.PI * notes[n] * t) * 0.12 * lfo;
      }
      const sub = Math.sin(2 * Math.PI * 55 * t) * 0.22;
      const env = Math.min(1, t * 0.8) * Math.min(1, (durationSec - t) * 1.2);
      out[i] = (val + sub) * env * 0.8;
    }
  } else if (kind === 'percussion') {
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const beat = t % 0.375; // 160bpm feel
      const step = Math.floor(t / 0.375) % 4;
      const kick = step === 0 || step === 2 ? Math.sin(2 * Math.PI * (55 + 110 * Math.exp(-beat * 35)) * beat) * Math.exp(-beat * 16) * 0.55 : 0;
      const clap = step === 1 || step === 3 ? (Math.random() * 2 - 1) * Math.exp(-beat * 26) * 0.32 : 0;
      const bass = Math.sin(2 * Math.PI * (step < 2 ? 73.42 : 82.41) * t) * Math.exp(-beat * 6) * 0.28;
      const env = Math.min(1, t * 4) * Math.min(1, (durationSec - t) * 3);
      out[i] = (kick + clap + bass) * env * 0.85;
    }
  } else if (kind === 'whoosh') {
    let lp = 0;
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const norm = t / durationSec;
      const env = Math.sin(Math.PI * norm);
      const cutoff = 0.04 + 0.28 * env;
      const noise = Math.random() * 2 - 1;
      lp = lp + cutoff * (noise - lp);
      out[i] = lp * env * 0.9;
    }
  } else if (kind === 'shutter') {
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const click1 = t < 0.06 ? (Math.random() * 2 - 1) * Math.exp(-t * 90) : 0;
      const click2 = t > 0.09 && t < 0.2 ? (Math.random() * 2 - 1) * Math.exp(-(t - 0.09) * 80) : 0;
      const mech = Math.sin(2 * Math.PI * 1200 * t) * Math.exp(-t * 45) * 0.3;
      out[i] = (click1 + click2 + mech) * 0.9;
    }
  } else if (kind === 'riser') {
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const norm = t / durationSec;
      const freq = 90 + Math.pow(norm, 2) * 780;
      const tone = Math.sin(2 * Math.PI * freq * t);
      const air = (Math.random() * 2 - 1) * norm * 0.25;
      out[i] = (tone * 0.45 + air) * Math.pow(norm, 0.8) * (1 - Math.pow(Math.max(0, norm - 0.92) / 0.08, 2)) * 0.85;
    }
  }

  return out;
}

export function createBuiltInAudioLibrary(): AudioAsset[] {
  const specs: {
    id: string;
    name: string;
    category: 'music' | 'sfx';
    kind: 'lofi' | 'cinema' | 'percussion' | 'whoosh' | 'shutter' | 'riser';
    duration: number;
    bpm?: number;
  }[] = [
    { id: 'audio-lofi', name: 'Midnight Alley Lo-Fi', category: 'music', kind: 'lofi', duration: 12, bpm: 120 },
    { id: 'audio-cinema', name: 'Alpine Horizon Pad', category: 'music', kind: 'cinema', duration: 12, bpm: 84 },
    { id: 'audio-perc', name: 'Kinetic Cut Beat', category: 'music', kind: 'percussion', duration: 12, bpm: 160 },
    { id: 'sfx-whoosh', name: 'Air Whoosh Transition', category: 'sfx', kind: 'whoosh', duration: 0.9 },
    { id: 'sfx-shutter', name: '35mm Film Shutter', category: 'sfx', kind: 'shutter', duration: 0.45 },
    { id: 'sfx-riser', name: 'Cinema Impact Riser', category: 'sfx', kind: 'riser', duration: 2.2 },
  ];

  return specs.map((spec) => {
    const samples = generateTrackSamples(spec.kind, spec.duration);
    const blob = encodeWavFromFloat32(samples, 22050);
    const src = URL.createObjectURL(blob);
    const peaks = extractPeaks(samples, spec.category === 'sfx' ? 28 : 68);
    return {
      id: spec.id,
      name: spec.name,
      category: spec.category,
      src,
      duration: spec.duration,
      bpm: spec.bpm,
      peaks,
    };
  });
}
