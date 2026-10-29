/**
 * Per-person memory (PRD 7.3, 8.5).
 *
 * A tiny deterministic embedding (hashed token bag → 64 dims, L2 normalised) so
 * recall is cosine similarity over *this person's* past entries only. There is
 * no shared index and no cross-person lookup anywhere in this module.
 */

import { all, insert, uid, nowIso } from "./db";

const DIMS = 64;

const STOP = new Set([
  "the", "a", "an", "and", "or", "is", "am", "are", "was", "were", "i", "me", "my", "to", "of",
  "in", "on", "it", "this", "that", "hai", "ho", "raha", "rahi", "me", "mein", "ka", "ki", "ke",
  "bahut", "aur", "ho", "gaya", "gayi",
]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

function hash(token: string): number {
  let h = 2166136261;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function embed(text: string): number[] {
  const v = new Array<number>(DIMS).fill(0);
  const toks = tokens(text);
  for (const tk of toks) v[hash(tk) % DIMS] += 1;
  // bigrams add a little word-order signal
  for (let i = 1; i < toks.length; i++) v[hash(toks[i - 1] + " " + toks[i]) % DIMS] += 0.5;
  const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0));
  return norm === 0 ? v : v.map((x) => x / norm);
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) dot += a[i] * b[i];
  return dot;
}

export function remember(
  personId: string,
  sourceType: string,
  sourceId: string | null,
  text: string,
): void {
  if (!text || text.trim().length < 3) return;
  insert("memory_vectors", {
    id: uid("vec"),
    person_id: personId,
    source_type: sourceType,
    source_id: sourceId,
    text,
    vector_json: JSON.stringify(embed(text)),
    created_at: nowIso(),
  });
}

export type RecallHit = { id: string; text: string; sourceType: string; sourceId: string | null; score: number; createdAt: string };

export function recall(personId: string, query: string, k = 3): RecallHit[] {
  const rows = all<{
    id: string;
    source_type: string;
    source_id: string | null;
    text: string;
    vector_json: string;
    created_at: string;
  }>(`SELECT * FROM memory_vectors WHERE person_id = ? ORDER BY created_at DESC LIMIT 500`, [
    personId,
  ]);
  const q = embed(query);
  return rows
    .map((r) => {
      let vec: number[] = [];
      try {
        vec = JSON.parse(r.vector_json);
      } catch {
        vec = [];
      }
      return {
        id: r.id,
        text: r.text,
        sourceType: r.source_type,
        sourceId: r.source_id,
        score: cosine(q, vec),
        createdAt: r.created_at,
      };
    })
    .filter((h) => h.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
