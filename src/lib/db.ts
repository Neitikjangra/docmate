import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ensureSeed } from "./seed";

export type Row = Record<string, any>;

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "docmate.db");
const AUDIO_DIR = path.join(DATA_DIR, "audio");
const SCHEMA_PATH = path.join(process.cwd(), "src", "db", "schema.sql");

type GlobalCache = typeof globalThis & {
  __docmateDb?: Database.Database;
  __docmateBooted?: boolean;
};

const g = globalThis as GlobalCache;

export function uid(prefix = ""): string {
  const id = crypto.randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function localDate(d: Date | string = new Date()): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() + days);
  return localDate(d);
}

export function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00").getTime();
  const db_ = new Date(b + "T00:00:00").getTime();
  return Math.round((db_ - da) / 86400000);
}

export function audioDir(): string {
  if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });
  return AUDIO_DIR;
}

export function getDb(): Database.Database {
  if (g.__docmateDb) return g.__docmateDb;

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  audioDir();

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = OFF");
  const schema = fs.readFileSync(SCHEMA_PATH, "utf8");
  db.exec(schema);
  try { db.exec("ALTER TABLE persons ADD COLUMN blood_group TEXT"); } catch {}
  try { db.exec("ALTER TABLE persons ADD COLUMN bp_top INTEGER"); } catch {}
  try { db.exec("ALTER TABLE persons ADD COLUMN bp_bottom INTEGER"); } catch {}
  try { db.exec("ALTER TABLE doctors ADD COLUMN clinic TEXT"); } catch {}
  g.__docmateDb = db;
  return db;
}

/** Run once per process: seed the rule store, doctor directory and demo family. */
export function boot(): Database.Database {
  const db = getDb();
  if (g.__docmateBooted) return db;
  g.__docmateBooted = true;
  try {
    ensureSeed(db);
  } catch (err) {
    console.error("[docmate] seed failed", err);
  }
  return db;
}

export function all<T = Row>(sql: string, params: any[] = []): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

export function one<T = Row>(sql: string, params: any[] = []): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

export function run(sql: string, params: any[] = []): Database.RunResult {
  return getDb().prepare(sql).run(...params);
}

export function insert(table: string, row: Row): Row {
  const keys = Object.keys(row);
  const sql = `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys
    .map(() => "?")
    .join(", ")})`;
  run(sql, keys.map((k) => normalize(row[k])));
  return row;
}

export function update(table: string, id: string, patch: Row): void {
  const keys = Object.keys(patch).filter((k) => k !== "id");
  if (!keys.length) return;
  const sql = `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`;
  run(sql, [...keys.map((k) => normalize(patch[k])), id]);
}

export function normalize(v: any): any {
  if (v === undefined || v === null) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

export function j<T = any>(value: any, fallback: T): T {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "object") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
