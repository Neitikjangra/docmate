/**
 * One-page 30-day doctor summary (PRD 10.2). Real PDF via pdf-lib, A4, single
 * page, only the categories the user consented to. English only — clinical
 * summaries for doctors are kept in English even when the app is in another
 * language; this is stated in the UI.
 */

import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";

export type SummaryInput = {
  personName: string;
  ageYears: number | null;
  sexAtBirth: string | null;
  conditions: string[];
  medicines: string[];
  rangeFrom: string;
  rangeTo: string;
  score: number | null;
  bandWord: string;
  components: { label: string; quality: number; weight: number }[];
  vitals: { label: string; value: string; date: string }[];
  symptoms: { label: string; count: number; last: string }[];
  alerts: { level: number; title: string; ruleId: string; date: string }[];
  predictions: { label: string; detail: string; confidence: string; dataDays: number }[];
  categories: string[];
  generatedAt: string;
};

const NIGHT = rgb(0.04, 0.06, 0.08);
const MUTED = rgb(0.45, 0.48, 0.47);
const MINT = rgb(0.43, 0.88, 0.81);
const TERRA = rgb(0.83, 0.44, 0.35);
const RED = rgb(0.85, 0.25, 0.23);

function levelColor(level: number) {
  return level >= 4 ? RED : level === 3 ? TERRA : MUTED;
}

class Writer {
  page: any;
  font: PDFFont;
  bold: PDFFont;
  y: number;
  left = 48;
  width: number;

  constructor(page: any, font: PDFFont, bold: PDFFont) {
    this.page = page;
    this.font = font;
    this.bold = bold;
    this.y = page.getHeight() - 48;
    this.width = page.getWidth() - 96;
  }

  wrap(text: string, size: number, font: PDFFont): string[] {
    const words = String(text).split(/\s+/);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const trial = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(trial, size) > this.width) {
        if (cur) lines.push(cur);
        cur = w;
      } else cur = trial;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  heading(text: string) {
    this.y -= 10;
    this.page.drawText(text.toUpperCase(), {
      x: this.left,
      y: this.y,
      size: 9,
      font: this.bold,
      color: MUTED,
    });
    this.y -= 6;
    this.page.drawLine({
      start: { x: this.left, y: this.y },
      end: { x: this.left + this.width, y: this.y },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });
    this.y -= 12;
  }

  line(text: string, opts?: { size?: number; bold?: boolean; color?: any; indent?: number }) {
    const size = opts?.size ?? 9.5;
    const font = opts?.bold ? this.bold : this.font;
    const color = opts?.color ?? NIGHT;
    const indent = opts?.indent ?? 0;
    const savedWidth = this.width;
    this.width = savedWidth - indent;
    for (const l of this.wrap(text, size, font)) {
      this.page.drawText(l, { x: this.left + indent, y: this.y, size, font, color });
      this.y -= size + 3.5;
    }
    this.width = savedWidth;
  }

  space(n = 6) {
    this.y -= n;
  }
}

export async function buildSummaryPdf(input: SummaryInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Docmate 30-day summary — ${input.personName}`);
  doc.setCreator("Docmate v1");
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(page, font, bold);

  page.drawRectangle({ x: 0, y: page.getHeight() - 8, width: page.getWidth(), height: 8, color: MINT });

  page.drawText("Docmate", { x: w.left, y: w.y - 6, size: 20, font: bold, color: NIGHT });
  page.drawText("30-day health summary", {
    x: w.left,
    y: w.y - 26,
    size: 10,
    font,
    color: MUTED,
  });
  w.y -= 44;
  w.line(`Generated ${input.generatedAt} · Range ${input.rangeFrom} to ${input.rangeTo}`, {
    size: 8.5,
    color: MUTED,
  });

  w.space(8);
  w.line(`${input.personName}${input.ageYears != null ? `, ${input.ageYears}y` : ""}${input.sexAtBirth ? ` · ${input.sexAtBirth}` : ""}`, { size: 13, bold: true });
  if (input.conditions.length) w.line(`Conditions: ${input.conditions.join(", ")}`, { color: MUTED });
  if (input.medicines.length) w.line(`Regular medicines: ${input.medicines.join(", ")}`, { color: MUTED });

  w.heading("Health score");
  w.line(
    input.score === null
      ? "Starting — fewer than two components have enough data in this window."
      : `${Math.round(input.score)} / 100 · ${input.bandWord}`,
    { size: 12, bold: true, color: input.score !== null && input.score < 60 ? TERRA : MINT },
  );
  for (const c of input.components) {
    w.line(`· ${c.label} (weight ${Math.round(c.weight * 100)}%) — ${Math.round(c.quality * 100)}% of target`, {
      size: 9,
      indent: 8,
      color: MUTED,
    });
  }

  if (input.categories.includes("alerts") && input.alerts.length) {
    w.heading("Alerts in this window");
    for (const a of input.alerts) {
      w.line(`L${a.level} · ${a.title}`, { bold: true, color: levelColor(a.level) });
      w.line(`${a.ruleId} · ${a.date}`, { size: 8.5, color: MUTED, indent: 8 });
    }
  }

  if (input.categories.includes("vitals") && input.vitals.length) {
    w.heading("Recent readings");
    for (const v of input.vitals.slice(0, 14)) {
      w.line(`· ${v.date} — ${v.label}: ${v.value}`, { size: 9, indent: 8 });
    }
  }

  if (input.categories.includes("journal_summaries") && input.symptoms.length) {
    w.heading("Symptom pattern");
    for (const s of input.symptoms.slice(0, 8)) {
      w.line(`· ${s.label} × ${s.count} (last ${s.last})`, { size: 9, indent: 8 });
    }
  }

  if (input.predictions.length) {
    w.heading("Pattern forecast");
    for (const p of input.predictions.slice(0, 5)) {
      w.line(`${p.label} · ${p.confidence} confidence · ${p.dataDays} days of data`, {
        size: 9,
        bold: true,
      });
      w.line(p.detail, { size: 8.5, color: MUTED, indent: 8 });
    }
  }

  const footerY = 54;
  page.drawLine({
    start: { x: w.left, y: footerY + 22 },
    end: { x: w.left + w.width, y: footerY + 22 },
    thickness: 0.5,
    color: rgb(0.85, 0.85, 0.85),
  });
  page.drawText(
    "Generated by Docmate from user-consented data. Not a diagnosis. Starting thresholds are for clinical review.",
    { x: w.left, y: footerY + 8, size: 7.5, font, color: MUTED, maxWidth: w.width },
  );
  page.drawText("Docmate is not an emergency service. In an emergency call 108.", {
    x: w.left,
    y: footerY - 4,
    size: 7.5,
    font: bold,
    color: TERRA,
  });

  return doc.save();
}
