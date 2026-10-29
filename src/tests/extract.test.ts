import { describe, expect, it } from "vitest";
import { extract } from "@/lib/nlu/extract";

describe("deterministic multilingual extraction", () => {
  it("detects a red-flag symptom in English", () => {
    const x = extract("I have chest pain since yesterday");
    // "chest pain" is a red-flag phrase in the lexicon
    expect(x.redFlags).toContain("chest_pain");
    expect(x.redFlagLabels).toContain("chest pain");
    expect(x.intent).toBe("emergency");
    expect(x.hasContent).toBe(true);

    // a dedicated chest symptom key is surfaced for its own symptom phrase
    const chest = extract("I have chest discomfort since yesterday");
    expect(chest.symptoms.map((s) => s.key)).toContain("chest_discomfort");
    expect(chest.redFlags).toContain("chest_pain");
  });

  it("detects non-English scripts and extracts the same symptom", () => {
    const hi = extract("मुझे सिर दर्द है");
    expect(hi.language).toBe("hi");
    expect(hi.symptoms.map((s) => s.key)).toContain("headache");

    const bn = extract("আমার মাথা ব্যথা");
    expect(bn.language).toBe("bn");

    const ta = extract("எனக்கு தலைவலி");
    expect(ta.language).toBe("ta");
  });

  it("extracts the symptom from Hinglish (romanised) phrasing", () => {
    const x = extract("mujhe pet me dard ho raha hai");
    expect(x.symptoms.map((s) => s.key)).toContain("abdominal_pain");
  });

  it("parses a blood-pressure sentence", () => {
    const x = extract("BP 150 by 95");
    const bp = x.vitals.find((v) => v.type === "bp");
    expect(bp).toBeTruthy();
    expect(bp?.value.systolic).toBe(150);
    expect(bp?.value.diastolic).toBe(95);
    expect(x.intent).toBe("vital_log");
  });

  it("extracts sleep hours and a stress signal", () => {
    const x = extract("I slept 5 hours and feel stressed");
    expect(x.sleepHours).toBe(5);

    // stress comes from the STRESS_EVENTS lexicon (arguments, work pressure, ...)
    const stressed = extract("I slept 5 hours and there was an argument at home");
    expect(stressed.sleepHours).toBe(5);
    expect(stressed.stress).toBeGreaterThanOrEqual(4);
  });

  it("is pure: identical input yields a deep-equal result", () => {
    const input = "mujhe pet me dard ho raha hai";
    expect(extract(input)).toEqual(extract(input));

    const en = "BP 150 by 95";
    expect(extract(en)).toEqual(extract(en));
  });
});
