import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import * as schema from './schema';

/**
 * Server-side only. This is enforced by the `no-restricted-imports` boundary in
 * eslint.config.mjs rather than the `server-only` package, because that package
 * throws under plain Node and would break every CLI script (seed, migrate,
 * backup) that legitimately needs the same database and service layer.
 */

export const DB_PATH = process.env.CHEFMIND_DB_PATH ?? './data/chefmind.db';

function createDb() {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const sqlite = new Database(DB_PATH);

  // WAL lets readers and a writer coexist; busy_timeout turns the rare write
  // collision into a short wait instead of a thrown SQLITE_BUSY.
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('synchronous = NORMAL');
  // SQLite does NOT enforce foreign keys by default — without this every
  // onDelete: 'cascade' in the schema is decorative.
  sqlite.pragma('foreign_keys = ON');

  return drizzle(sqlite, { schema });
}

type Db = ReturnType<typeof createDb>;

// Next's dev server re-evaluates modules on hot reload. A bare module-level
// `new Database(...)` would leak a file handle on every edit.
const globalForDb = globalThis as unknown as { __chefmindDb?: Db };

export const db: Db = globalForDb.__chefmindDb ?? createDb();
if (process.env.NODE_ENV !== 'production') globalForDb.__chefmindDb = db;

export { schema };
