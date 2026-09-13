#!/usr/bin/env node
/**
 * Applies pending migrations, then exits. Run from the container entrypoint
 * BEFORE the server starts listening — running migrations from inside a route
 * handler means concurrent requests racing each other on a single SQLite file.
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const dbPath = process.env.CHEFMIND_DB_PATH ?? './data/chefmind.db';
const migrationsFolder = resolve(process.env.CHEFMIND_MIGRATIONS_DIR ?? './drizzle');

mkdirSync(dirname(dbPath), { recursive: true });
mkdirSync(process.env.CHEFMIND_UPLOAD_DIR ?? './data/uploads', { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

try {
  migrate(drizzle(sqlite), { migrationsFolder });
  console.log(`[chefmind] Migrationen angewendet: ${dbPath}`);
} catch (err) {
  console.error('[chefmind] Migration fehlgeschlagen:', err);
  process.exit(1);
} finally {
  sqlite.close();
}
