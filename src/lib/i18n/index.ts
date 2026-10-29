/**
 * Localisation (PRD 16.4). Adding a language = dropping one JSON file in this
 * folder and adding it to LANGS — no code change anywhere else.
 */

import en from "./en.json";
import hi from "./hi.json";
import bn from "./bn.json";
import ta from "./ta.json";

export type Lang = "en" | "hi" | "bn" | "ta";

export const LANGS: { code: Lang; label: string; native: string; asr: string }[] = [
  { code: "en", label: "English", native: "English", asr: "en-IN" },
  { code: "hi", label: "Hindi", native: "हिन्दी", asr: "hi-IN" },
  { code: "bn", label: "Bengali", native: "বাংলা", asr: "bn-IN" },
  { code: "ta", label: "Tamil", native: "தமிழ்", asr: "ta-IN" },
];

export const LANG_CODES: Lang[] = LANGS.map((l) => l.code);

const DICTS: Record<Lang, unknown> = { en, hi, bn, ta };

export function asrLocale(lang: string): string {
  return LANGS.find((l) => l.code === lang)?.asr ?? "en-IN";
}

function walk(dict: unknown, path: string[]): unknown {
  let cur: any = dict;
  for (const p of path) {
    if (cur && typeof cur === "object" && p in cur) cur = cur[p];
    else return undefined;
  }
  return cur;
}

/** Translate `key` (dot path) with `{var}` interpolation, falling back to English. */
export function t(lang: string, key: string, vars?: Record<string, string | number>): string {
  const path = key.split(".");
  const chosen = (lang as Lang) in DICTS ? (lang as Lang) : "en";
  let value = walk(DICTS[chosen], path);
  if (value === undefined) value = walk(DICTS.en, path);
  if (value === undefined) return key;
  let out = String(value);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
  }
  return out;
}

export function severityWord(lang: string, level: number): string {
  return t(lang, `card.level.${level}`);
}
