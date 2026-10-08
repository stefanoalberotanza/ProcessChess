export type SqlMethod = 'run' | 'all' | 'values' | 'get';

/**
 * The only thing an adapter provides: run one SQL statement. Same contract as Drizzle's
 * `sqlite-proxy` callback: `run` → no rows, `get` → one row as an array of values (or
 * undefined), `all`/`values` → rows as arrays of values.
 */
export type SqlExecutor = (
  sql: string,
  params: unknown[],
  method: SqlMethod,
) => Promise<{ rows: unknown[] }>;
