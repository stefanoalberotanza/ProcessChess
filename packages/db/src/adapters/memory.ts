import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { SqlExecutor } from '../executor';
import { SqliteStorage } from '../sqlite-storage';

/** `SqlExecutor` over a node:sqlite database (Node ≥ 22.13). */
export function nodeSqliteExecutor(sqlite: DatabaseSync): SqlExecutor {
  return async (sql, params, method) => {
    const stmt = sqlite.prepare(sql);
    const args = params as SQLInputValue[];
    if (method === 'run') {
      stmt.run(...args);
      return { rows: [] };
    }
    stmt.setReturnArrays(true);
    if (method === 'get') {
      return { rows: (stmt.get(...args) as unknown as unknown[] | undefined) ?? [] };
    }
    return { rows: stmt.all(...args) as unknown as unknown[][] };
  };
}

/**
 * In-memory SQLite storage for tests, on Node's built-in `node:sqlite` (no native dependency).
 * Node-only: never import it from the web app.
 */
export function createMemoryStorage(): SqliteStorage {
  const sqlite = new DatabaseSync(':memory:');
  return new SqliteStorage(nodeSqliteExecutor(sqlite), false, async () => sqlite.close());
}
