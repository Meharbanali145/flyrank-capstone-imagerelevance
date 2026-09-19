import Database from "better-sqlite3";
import path from "node:path";

const DB_FILE = path.resolve("data", "app.db");

export function getDb() {
  const db = new Database(DB_FILE);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

/**
 * Creates all tables and indexes if they don't already exist. Safe to
 * call on every startup - idempotent.
 */
export function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      subject TEXT NOT NULL,
      caption TEXT NOT NULL,
      confidence REAL NOT NULL,
      needs_review INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_images_category ON images(category);

    CREATE TABLE IF NOT EXISTS image_embeddings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_id INTEGER NOT NULL UNIQUE REFERENCES images(id) ON DELETE CASCADE,
      caption_embedding TEXT NOT NULL,
      subject_embedding TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      image_id INTEGER REFERENCES images(id) ON DELETE SET NULL,
      decision TEXT NOT NULL,
      similarity REAL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_suggestions_post ON suggestions(post_id);

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_text TEXT NOT NULL,
      candidate_file TEXT NOT NULL,
      decision TEXT NOT NULL CHECK (decision IN ('approve', 'reject')),
      reviewer TEXT,
      note TEXT,
      reviewed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_reviews_decision ON reviews(decision);
  `);
}
