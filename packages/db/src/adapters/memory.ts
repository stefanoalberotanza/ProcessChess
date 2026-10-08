import { dirname, join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { migrate as migrateProxy } from 'drizzle-orm/sqlite-proxy/migrator';
import * as schema from '../schema';
import { SqliteStorage } from '../sqlite-storage';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../drizzle');

/**
 * In-memory SQLite storage for tests, on Node's built-in `node:sqlite`
 * (no native dependency). Node-only: never import it from the web app.
 */
export function createMemoryStorage(): SqliteStorage {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');

  const db = drizzle(
    async (sql, params, method) => {
      const stmt = sqlite.prepare(sql);
      const args = params as SQLInputValue[];
      if (method === 'run') {
        stmt.run(...args);
        return { rows: [] };
      }
      stmt.setReturnArrays(true);
      if (method === 'get') {
        const row = stmt.get(...args) as unknown as unknown[] | undefined;
        return { rows: row ?? [] };
      }
      return { rows: stmt.all(...args) as unknown as unknown[][] };
    },
    { schema },
  );

  const migrate = () =>
    migrateProxy(
      db,
      async (queries) => {
        for (const q of queries) sqlite.exec(q);
      },
      { migrationsFolder: MIGRATIONS_DIR },
    );

  return new SqliteStorage(db, migrate, async () => sqlite.close());
}
