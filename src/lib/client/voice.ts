"use client";

/**
 * On-device acoustic feature extraction (PRD 6.2 step 7, 7.2).
 *
 * The browser collects raw time-domain frames from the AnalyserNode; this module
 * turns them into the small feature vector `analyseAcoustics` expects. Audio
 * never leaves the device — only the numbers do.
 *
 * Pitch is found with normalised autocorrelation over the human pitch range
 * (70–400 Hz), which is cheap enough to run on a low-end phone without a worker.
 */

import type { AcousticInput } from "@/lib/acoustic";

/** Below this autocorrelation peak the frame is treated as unvoiced/breathy. */
const VOICED_R = 0.32;
/** Below this RMS we are hearing room noise, not a voice. */
const VOICED_RMS = 0.008;

function rmsOf(buf: Float32Array): number {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

function peakOf(buf: Float32Array): number {
  let p = 0;
  for (let i = 0; i < buf.length; i++) {
    const a = buf[i] < 0 ? -buf[i] : buf[i];
    if (a > p) p = a;
  }
  return p;
}

/** Fundamental frequency + periodicity of one frame. */
function pitchOf(buf: Float32Array, sampleRate: number): { hz: number | null; r: number } {
  const minLag = Math.max(2, Math.floor(sampleRate / 400));
  const maxLag = Math.min(buf.length - 2, Math.floor(sampleRate / 70));
  if (maxLag <= minLag) return { hz: null, r: 0 };

  let mean = 0;
  for (let i = 0; i < buf.length; i++) mean += buf[i];
  mean /= buf.length;

  let energy = 0;
  for (let i = 0; i < buf.length; i++) {
    const d = buf[i] - mean;
    energy += d * d;
  }
  if (energy < 1e-7) return { hz: null, r: 0 };
  const norm = energy / buf.length;

  let best = 0;
  let bestLag = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    const n = buf.length - lag;
    for (let i = 0; i < n; i++) s += (buf[i] - mean) * (buf[i + lag] - mean);
    const r = (s / n) / norm;
    if (r > best) {
      best = r;
      bestLag = lag;
    }
  }
  if (!bestLag || best <= 0) return { hz: null, r: best };
  return { hz: sampleRate / bestLag, r: best };
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

function sd(a: number[]): number {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(mean(a.map((v) => (v - m) * (v - m))));
}

const round = (v: number, places: number) => {
  const f = 10 ** places;
  return Math.round(v * f) / f;
};

/**
 * Turn captured frames into the acoustic feature vector.
 * `durationS` is measured by the caller so a clip that is far too short can be
 * recognised as unreliable downstream.
 */
export function extractAcoustics(
  frames: Float32Array[],
  sampleRate: number,
  durationS: number,
): AcousticInput {
  const n = frames.length;
  if (!n) return { durationS: round(durationS, 1) };

  const rms: number[] = [];
  const peaks: number[] = [];
  const pitch: (number | null)[] = [];
  const corr: number[] = [];

  for (const f of frames) {
    const r = rmsOf(f);
    rms.push(r);
    peaks.push(peakOf(f));
    const p = pitchOf(f, sampleRate || 48000);
    const voiced = p.r >= VOICED_R && r > VOICED_RMS && p.hz != null;
    pitch.push(voiced ? (p.hz as number) : null);
    corr.push(voiced ? p.r : 0);
  }

  const noiseFloor = Math.min(...rms);
  const sorted = [...rms].sort((a, b) => a - b);
  const loudRef = sorted[Math.min(n - 1, Math.floor(n * 0.8))] ?? 0;
  const speechFloor = Math.max(noiseFloor * 2.5, loudRef * 0.25, 0.006);
  const pauseRatio = rms.filter((v) => v < speechFloor).length / n;
  const clippingPct = (peaks.filter((p) => p >= 0.995).length / n) * 100;

  const voiced = pitch.filter((p): p is number => p != null);
  const voicedRms = rms.filter((_, i) => pitch[i] != null);
  const voicedCorr = corr.filter((c) => c > 0);

  let jitter: number | null = null;
  if (voiced.length >= 3) {
    const js: number[] = [];
    for (let i = 1; i < voiced.length; i++) js.push(Math.abs(voiced[i] - voiced[i - 1]) / voiced[i - 1]);
    jitter = mean(js);
  }

  let shimmer: number | null = null;
  if (voicedRms.length >= 3) {
    const ss: number[] = [];
    for (let i = 1; i < voicedRms.length; i++) {
      ss.push(Math.abs(voicedRms[i] - voicedRms[i - 1]) / Math.max(1e-4, voicedRms[i - 1]));
    }
    shimmer = mean(ss);
  }

  const meanCorr = voicedCorr.length ? mean(voicedCorr) : null;
  const hnrDb =
    meanCorr == null
      ? null
      : Math.max(
          -5,
          Math.min(
            25,
            10 * Math.log10(Math.max(1e-3, meanCorr) / Math.max(1e-3, 1 - Math.min(0.995, meanCorr))),
          ),
        );

  return {
    durationS: round(durationS, 1),
    pitchMeanHz: voiced.length ? Math.round(mean(voiced)) : null,
    pitchSdHz: voiced.length >= 2 ? Math.round(sd(voiced)) : null,
    energyMean: round(mean(rms), 4),
    energySd: round(sd(rms), 4),
    pauseRatio: round(pauseRatio, 3),
    jitter: jitter != null ? round(jitter, 4) : null,
    shimmer: shimmer != null ? round(shimmer, 3) : null,
    hnrDb: hnrDb != null ? round(hnrDb, 1) : null,
    noiseFloorDb: round(20 * Math.log10(Math.max(1e-5, noiseFloor)), 1),
    clippingPct: round(clippingPct, 1),
  };
}

/** Speaking rate, estimated from the transcript the recogniser gave us. */
export function speakingRate(transcript: string, durationS: number): number | null {
  if (durationS < 1) return null;
  const words = transcript.trim().split(/\s+/).filter(Boolean).length;
  if (!words) return null;
  return round(words / durationS, 2);
}
