/**
 * TTS adapter. The spoken reply itself is produced in the browser by
 * SpeechSynthesis (real, offline, multilingual). This adapter exists so a cloud
 * voice can be swapped in when TTS_API_KEY is set, and so the Console can show
 * which voice the app is using.
 */

import { recordOutbox, type OutboxRow } from "./index";

export type TtsResult = { mode: "browser" | "cloud"; text: string; lang: string; row?: OutboxRow };

const VOICE_BY_LANG: Record<string, string> = {
  en: "en-IN",
  hi: "hi-IN",
  bn: "bn-IN",
  ta: "ta-IN",
};

export function voiceFor(lang: string): string {
  return VOICE_BY_LANG[lang] ?? "en-IN";
}

export function synthesize(text: string, lang: string): TtsResult {
  if (!process.env.TTS_API_KEY) {
    return { mode: "browser", text, lang: voiceFor(lang) };
  }
  const row = recordOutbox({
    channel: "tts",
    to: null,
    subject: "Cloud TTS",
    body: text,
    meta: { lang: voiceFor(lang) },
  });
  return { mode: "cloud", text, lang: voiceFor(lang), row };
}
