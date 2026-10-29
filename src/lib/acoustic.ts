/**
 * Acoustic feature mapping (PRD 6.2 step 7, 7.2).
 *
 * The browser computes raw audio features with the Web Audio API; this pure
 * module turns them into the small set of signals the rest of the product uses:
 * a 0–100 distress score, a signal-to-noise estimate and a quality flag.
 *
 * Distress is deliberately conservative: it never claims to diagnose, it only
 * measures vocal strain against the person's own recent baseline. Early on
 * (few recordings) it reports `calibrating` and is not allowed to drive alerts.
 */

export type AcousticInput = {
  durationS?: number;
  pitchMeanHz?: number | null;
  pitchSdHz?: number | null;
  energyMean?: number | null;
  energySd?: number | null;
  speechRateWps?: number | null;
  pauseRatio?: number | null;
  jitter?: number | null;
  shimmer?: number | null;
  hnrDb?: number | null;
  noiseFloorDb?: number | null;
  clippingPct?: number | null;
};

export type AcousticResult = {
  distress: number; // 0..100
  snrDb: number;
  quality: "good" | "ok" | "poor";
  features: Record<string, number>;
};

const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

/**
 * Vocal-strain index. Weighted toward pitch instability, low energy, slow
 * speech and long pauses — the markers the blueprint lists for stress.
 */
export function analyseAcoustics(input: AcousticInput): AcousticResult {
  const durationS = num(input.durationS, 0);
  const pitchMean = num(input.pitchMeanHz, 0);
  const pitchSd = num(input.pitchSdHz, 0);
  const energy = num(input.energyMean, 0);
  const rate = num(input.speechRateWps, 0);
  const pause = num(input.pauseRatio, 0);
  const jitter = num(input.jitter, 0);
  const shimmer = num(input.shimmer, 0);
  const hnr = num(input.hnrDb, 0);
  const noiseFloor = num(input.noiseFloorDb, -60);
  const clipping = num(input.clippingPct, 0);

  const pitchCv = pitchMean > 0 ? pitchSd / pitchMean : 0; // 0.1 calm, 0.35 strained
  const pitchPart = clamp(((pitchCv - 0.10) / 0.30) * 100) * 0.28;
  const energyPart = clamp(((0.06 - energy) / 0.06) * 100) * 0.18;
  const ratePart = clamp(((2.1 - rate) / 1.4) * 100) * 0.16;
  const pausePart = clamp((pause / 0.55) * 100) * 0.16;
  const jitterPart = clamp((jitter / 0.045) * 100) * 0.12;
  const hnrPart = clamp(((14 - hnr) / 12) * 100) * 0.10;

  let distress = pitchPart + energyPart + ratePart + pausePart + jitterPart + hnrPart;

  // A very short clip has too little signal to trust — pull toward neutral.
  if (durationS > 0 && durationS < 3) distress = 40 + (distress - 40) * 0.5;

  const snrDb = Math.max(0, Math.round((energy > 0 ? 20 * Math.log10(energy / 0.006) : 0) * 10) / 10);

  let quality: AcousticResult["quality"] = "good";
  if (clipping > 8 || snrDb < 8 || (durationS > 0 && durationS < 3)) quality = "poor";
  else if (clipping > 3 || snrDb < 14) quality = "ok";

  return {
    distress: Math.round(clamp(distress)),
    snrDb,
    quality,
    features: {
      duration_s: Math.round(durationS * 100) / 100,
      pitch_mean_hz: Math.round(pitchMean),
      pitch_sd_hz: Math.round(pitchSd),
      pitch_cv: Math.round(pitchCv * 1000) / 1000,
      energy_mean: Math.round(energy * 10000) / 10000,
      speech_rate_wps: Math.round(rate * 100) / 100,
      pause_ratio: Math.round(pause * 1000) / 1000,
      jitter: Math.round(jitter * 10000) / 10000,
      shimmer: Math.round(shimmer * 1000) / 1000,
      hnr_db: Math.round(hnr * 10) / 10,
      noise_floor_db: Math.round(noiseFloor * 10) / 10,
      clipping_pct: Math.round(clipping * 10) / 10,
    },
  };
}

/** How much to trust a distress score for alerting (PRD 7.2 — needs calibration). */
export function distressIsTrusted(sampleCount: number): boolean {
  return sampleCount >= 5;
}
