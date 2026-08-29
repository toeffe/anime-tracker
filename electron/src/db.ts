import fs from "fs";
import path from "path";
import { app } from "electron";
import Database from "better-sqlite3";

const SAVE_NAME = "tracker.db";

let db: Database.Database | null = null;
let dbPathResolved: string | null = null;

export function getDb(): Database.Database {
  if (!db) {
    throw new Error("Database not initialized. Call initDb() after app.whenReady().");
  }
  return db;
}

export function getDbPath(): string {
  if (!dbPathResolved) {
    throw new Error("Database not initialized. Call initDb() after app.whenReady().");
  }
  return dbPathResolved;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

function isWritableDir(dir: string): boolean {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, ".anime-tracker-write");
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

function preferredDataDir(): string {
  // electron-builder portable: folder the user actually put the .exe in
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return process.env.PORTABLE_EXECUTABLE_DIR;
  }
  if (app.isPackaged) {
    return path.dirname(process.execPath);
  }
  return path.join(process.cwd(), "data");
}

function copyIfPresent(from: string, to: string) {
  if (fs.existsSync(from) && !fs.existsSync(to)) {
    fs.copyFileSync(from, to);
  }
}

function migrateLegacySave(destDir: string) {
  const dest = path.join(destDir, SAVE_NAME);
  if (fs.existsSync(dest)) return;
  const legacyDir = app.getPath("userData");
  if (path.resolve(legacyDir) === path.resolve(destDir)) return;
  const legacy = path.join(legacyDir, SAVE_NAME);
  if (!fs.existsSync(legacy)) return;
  copyIfPresent(legacy, dest);
  copyIfPresent(`${legacy}-wal`, `${dest}-wal`);
  copyIfPresent(`${legacy}-shm`, `${dest}-shm`);
}

export function initDb(): Database.Database {
  const preferred = preferredDataDir();
  const dir = isWritableDir(preferred) ? preferred : app.getPath("userData");
  fs.mkdirSync(dir, { recursive: true });
  migrateLegacySave(dir);

  dbPathResolved = path.join(dir, SAVE_NAME);
  db = new Database(dbPathResolved);
  // One on-disk save file (no leftover -wal/-shm companions).
  db.pragma("journal_mode = DELETE");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('anime', 'movie')),
      title TEXT NOT NULL,
      poster_url TEXT,
      overview TEXT,
      status TEXT NOT NULL CHECK (status IN ('watching', 'completed', 'planned', 'dropped')),
      rating REAL,
      watched INTEGER NOT NULL DEFAULT 0,
      external_source TEXT,
      external_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS media_external_unique
      ON media(external_source, external_id)
      WHERE external_source IS NOT NULL AND external_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS seasons (
      id TEXT PRIMARY KEY,
      media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
      number INTEGER NOT NULL,
      title TEXT,
      episode_count INTEGER NOT NULL,
      rating REAL,
      external_id TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS seasons_external_unique
      ON seasons(external_id)
      WHERE external_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS seasons_media ON seasons(media_id);

    CREATE TABLE IF NOT EXISTS episodes (
      id TEXT PRIMARY KEY,
      season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
      number INTEGER NOT NULL,
      title TEXT,
      watched INTEGER NOT NULL DEFAULT 0,
      rating REAL
    );

    CREATE INDEX IF NOT EXISTS episodes_season ON episodes(season_id);
  `);

  const row = database.prepare("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1").get() as
    | { version: number }
    | undefined;
  if (!row) {
    database.prepare("INSERT INTO schema_migrations (version) VALUES (1)").run();
  }
}

export function withTransaction<T>(fn: () => T): T {
  return getDb().transaction(fn)();
}
