import type { Migration } from './migrations-bundle';
import { migrations as bundled } from './migrations.generated';
import type { SqlExecutor } from './executor';

const CREATE = `CREATE TABLE IF NOT EXISTS __migrations (
  tag TEXT PRIMARY KEY NOT NULL,
  applied_at INTEGER NOT NULL
)`;

/**
 * Applies pending migrations through the adapter's executor, each in its own transaction, and
 * records them in `__migrations`. Idempotent. Returns the tags applied by this call.
 */
export async function runMigrations(
  exec: SqlExecutor,
  migrations: readonly Migration[] = bundled,
  now: () => number = Date.now,
): Promise<string[]> {
  await exec(CREATE, [], 'run');
  const { rows } = await exec('SELECT tag FROM __migrations', [], 'all');
  const applied = new Set((rows as unknown[][]).map((r) => String(r[0])));
  const done: string[] = [];
  for (const m of migrations) {
    if (applied.has(m.tag)) continue;
    await exec('BEGIN', [], 'run');
    try {
      for (const statement of m.statements) await exec(statement, [], 'run');
      await exec('INSERT INTO __migrations (tag, applied_at) VALUES (?, ?)', [m.tag, now()], 'run');
      await exec('COMMIT', [], 'run');
    } catch (e) {
      await exec('ROLLBACK', [], 'run');
      throw new Error(`Migration ${m.tag} failed: ${(e as Error).message}`, { cause: e });
    }
    done.push(m.tag);
  }
  return done;
}
