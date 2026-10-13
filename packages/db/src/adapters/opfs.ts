// Browser adapter: SQLite WASM in a Web Worker with the OPFS `opfs-sahpool` VFS
// (docs/adr/002-storage.md). Only provides the SQL executor; everything else is SqliteStorage.
import type { SqlExecutor } from '../executor';
import { SqliteStorage } from '../sqlite-storage';
import type { WorkerRequest, WorkerResponse } from './opfs-protocol';

type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;

type Pending = { resolve: (r: WorkerResponse & { ok: true }) => void; reject: (e: Error) => void };

export interface OpfsStorage extends SqliteStorage {
  /** Why data is not persistent (OPFS unavailable), if so. */
  readonly fallbackReason?: string;
}

/** Opens the app database. Never rejects because of OPFS: it falls back to memory instead. */
export async function createOpfsStorage(): Promise<OpfsStorage> {
  const worker = new Worker(new URL('./opfs.worker.ts', import.meta.url), { type: 'module' });
  const pending = new Map<number, Pending>();
  let nextId = 1;

  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const res = event.data;
    const p = pending.get(res.id);
    if (!p) return;
    pending.delete(res.id);
    if (res.ok) p.resolve(res);
    else p.reject(new Error(res.error));
  };
  worker.onerror = (event) => {
    const err = new Error(`SQLite worker error: ${event.message}`);
    for (const p of pending.values()) p.reject(err);
    pending.clear();
  };

  const call = (req: WithoutId<WorkerRequest>) =>
    new Promise<WorkerResponse & { ok: true }>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      worker.postMessage({ ...req, id } as WorkerRequest);
    });

  const opened = await call({ type: 'open' });
  const exec: SqlExecutor = async (sql, params, method) => {
    const res = await call({ type: 'exec', sql, params, method });
    return { rows: res.rows as unknown[] };
  };
  const storage = new SqliteStorage(exec, opened.persistent === true, async () =>
    worker.terminate(),
  );
  return Object.assign(storage, { fallbackReason: opened.reason });
}
