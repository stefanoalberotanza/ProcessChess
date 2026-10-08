import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { nodeSqliteExecutor } from './adapters/memory';
import { bundleMigrations } from './migrations-bundle';
import { migrations } from './migrations.generated';
import { runMigrations } from './migrator';

const drizzleDir = join(import.meta.dirname, '../drizzle');

describe('bundled migrations', () => {
  it('migrations.generated.ts is up to date with drizzle/ (run db:generate)', () => {
    const expected = bundleMigrations((f) => readFileSync(join(drizzleDir, f), 'utf8'));
    expect(readFileSync(join(import.meta.dirname, 'migrations.generated.ts'), 'utf8')).toBe(
      expected,
    );
    expect(migrations.map((m) => m.tag)).toEqual([
      '0000_init',
      '0001_archive_and_line_pass',
      '0002_opening_lab',
    ]);
  });
});

describe('runMigrations', () => {
  it('applies every migration once and records it in __migrations', async () => {
    const sqlite = new DatabaseSync(':memory:');
    const exec = nodeSqliteExecutor(sqlite);
    expect(await runMigrations(exec, migrations, () => 42)).toEqual([
      '0000_init',
      '0001_archive_and_line_pass',
      '0002_opening_lab',
    ]);
    expect(await runMigrations(exec)).toEqual([]);
    const rows = sqlite.prepare('SELECT tag, applied_at FROM __migrations ORDER BY tag').all();
    expect(rows).toEqual([
      { tag: '0000_init', applied_at: 42 },
      { tag: '0001_archive_and_line_pass', applied_at: 42 },
      { tag: '0002_opening_lab', applied_at: 42 },
    ]);
    const cols = sqlite.prepare("SELECT name FROM pragma_table_info('collection')").all();
    expect(cols.map((c) => c.name)).toContain('archived_at');
  });

  it('applies only pending migrations on an existing database', async () => {
    const sqlite = new DatabaseSync(':memory:');
    const exec = nodeSqliteExecutor(sqlite);
    await runMigrations(exec, migrations.slice(0, 1));
    expect(await runMigrations(exec)).toEqual(['0001_archive_and_line_pass', '0002_opening_lab']);
  });

  it('rolls back a failing migration and leaves it pending', async () => {
    const sqlite = new DatabaseSync(':memory:');
    const exec = nodeSqliteExecutor(sqlite);
    const bad = [{ tag: 'x', statements: ['CREATE TABLE t (a)', 'NOT SQL'] }];
    await expect(runMigrations(exec, bad)).rejects.toThrow(/Migration x failed/);
    expect(
      sqlite.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 't'").get(),
    ).toEqual({ n: 0 });
    expect(sqlite.prepare('SELECT count(*) AS n FROM __migrations').get()).toEqual({ n: 0 });
  });
});
