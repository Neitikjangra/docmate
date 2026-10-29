import { describe, expect, it } from "vitest";
import {
  EMA_ALPHA,
  PENALTY_CAP,
  bandOf,
  computeScore,
  familyScore,
  smoothSeries,
  type ScoreInput,
} from "@/lib/score";

/** Local YYYY-MM-DD, matching db.localDate, without pulling the sqlite module. */
function today(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** A day where every component is present and at full quality. */
function perfectInput(now: Date): ScoreInput {
  return {
    vitals: [{ ts: now.toISOString(), type: "bp", systolic: 118, diastolic: 76 }],
    journal: [{ date: today(), sleepHours: 8, mood: 5, activityMinutes: 30 }],
    medicineEvents: [{ ts: now.toISOString(), status: "taken" }],
    distress: [],
    alerts: [],
    now,
  };
}

describe("score maths", () => {
  it("gives a perfect day a score of 100 with no penalty", () => {
    const now = new Date();
    const res = computeScore(perfectInput(now));
    expect(res.status).toBe("ok");
    expect(res.penalty).toBe(0);
    expect(res.dataComponents).toBe(5);
    expect(res.raw).toBe(100);
    expect(res.score).toBe(100);
  });

  it("keeps a low-quality day inside 0..100", () => {
    const now = new Date();
    const input: ScoreInput = {
      vitals: [],
      journal: [{ date: today(), mood: 1, activityMinutes: 0 }],
      medicineEvents: [{ ts: now.toISOString(), status: "missed" }],
      distress: [],
      alerts: [],
      now,
    };
    const res = computeScore(input);
    expect(res.status).toBe("ok");
    expect(Number.isFinite(res.raw)).toBe(true);
    expect(res.raw).toBeGreaterThanOrEqual(0);
    expect(res.raw).toBeLessThanOrEqual(100);
  });

  it("applies the level penalty and caps it at PENALTY_CAP", () => {
    const now = new Date();

    const applied = computeScore({
      ...perfectInput(now),
      alerts: [{ level: 3, created_at: now.toISOString(), status: "new" }],
    });
    expect(applied.penalty).toBe(8);
    expect(applied.penaltyCapped).toBe(false);
    expect(applied.raw).toBe(92);

    const capped = computeScore({
      ...perfectInput(now),
      alerts: [
        { level: 4, created_at: now.toISOString(), status: "new" },
        { level: 4, created_at: now.toISOString(), status: "new" },
      ],
    });
    expect(capped.penalty).toBe(PENALTY_CAP);
    expect(capped.penaltyCapped).toBe(true);
    expect(capped.raw).toBe(100 - PENALTY_CAP);
  });

  it("smooths a spike with EMA_ALPHA and never emits NaN", () => {
    const raw = [20, 100];
    const out = smoothSeries(raw, EMA_ALPHA);
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(raw[0]);
    // the smoothed spike sits strictly between the raw value and the previous smoothed value
    expect(out[1]).toBeGreaterThan(out[0]);
    expect(out[1]).toBeLessThan(raw[1]);
    expect(out.some((v) => Number.isNaN(v))).toBe(false);

    const long = smoothSeries([70, 70, 68, 66, 95, 64, 63], EMA_ALPHA);
    expect(long).toHaveLength(7);
    expect(long.every((v) => Number.isFinite(v))).toBe(true);
  });

  it("maps scores to the documented bands", () => {
    expect(bandOf(null)).toBe("starting");
    expect(bandOf(100)).toBe("steady");
    expect(bandOf(80)).toBe("steady");
    expect(bandOf(79)).toBe("okay");
    expect(bandOf(60)).toBe("okay");
    expect(bandOf(59)).toBe("slipping");
    expect(bandOf(40)).toBe("slipping");
    expect(bandOf(39)).toBe("attention");
    expect(bandOf(0)).toBe("attention");
  });

  it("computes the family score as 0.7*mean + 0.3*min", () => {
    const two = familyScore([80, 90]);
    expect(two.members).toBe(2);
    expect(two.mean).toBe(85);
    expect(two.lowest).toBe(80);
    expect(two.value).toBeCloseTo(0.7 * 85 + 0.3 * 80, 5);
    expect(two.value).toBe(83.5);

    const one = familyScore([77]);
    expect(one.members).toBe(1);
    expect(one.value).toBe(77);

    const none = familyScore([null, null]);
    expect(none.value).toBeNull();
    expect(none.members).toBe(0);
  });
});
