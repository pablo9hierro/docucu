/** Banco local SQLite (módulo nativo node:sqlite — sem dependências compiladas). */
import { DatabaseSync } from 'node:sqlite';
import { DB_FILE, ensureDirs } from './config';

let db: DatabaseSync | null = null;

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  format      TEXT NOT NULL,
  data        TEXT NOT NULL,
  thumb       TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS media (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL,
  file        TEXT NOT NULL,
  proxy       TEXT,
  duration    REAL NOT NULL DEFAULT 0,
  width       INTEGER NOT NULL DEFAULT 0,
  height      INTEGER NOT NULL DEFAULT 0,
  fps         REAL NOT NULL DEFAULT 0,
  has_audio   INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL,
  error       TEXT,
  thumbs      TEXT,
  waveform    TEXT,
  size        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exports (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL,
  status       TEXT NOT NULL,
  progress     REAL NOT NULL DEFAULT 0,
  file         TEXT,
  error        TEXT,
  settings     TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  finished_at  TEXT
);
`;

export function getDb(): DatabaseSync {
  if (db) return db;
  ensureDirs();
  db = new DatabaseSync(DB_FILE);
  db.exec(SCHEMA);
  return db;
}

export const now = () => new Date().toISOString();
