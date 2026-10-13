/// <reference lib="webworker" />
// SQLite (official WASM build) in a dedicated worker, persisted with the `opfs-sahpool` VFS,
// which needs no COOP/COEP headers. Falls back to an in-memory database when OPFS is not
// available (old browsers, private windows, another tab already holding the pool).
import sqlite3InitModule, { type Database } from '@sqlite.org/sqlite-wasm';
import type { WorkerRequest, WorkerResponse } from './opfs-protocol';

const DB_FILE = '/processchess.sqlite3';
let db: Database | undefined;

async function open(): Promise<{ persistent: boolean; reason?: string }> {
  const sqlite3 = await sqlite3InitModule();
  try {
    const pool = await sqlite3.installOpfsSAHPoolVfs({
      name: 'processchess',
      directory: '.processchess',
    });
    db = new pool.OpfsSAHPoolDb(DB_FILE);
    return { persistent: true };
  } catch (e) {
    db = new sqlite3.oo1.DB(':memory:', 'c');
    return { persistent: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

function exec(sql: string, params: unknown[], method: string): unknown {
  if (!db) throw new Error('Database not open');
  const bind = params.length ? (params as never) : undefined;
  if (method === 'run') {
    db.exec({ sql, bind });
    return [];
  }
  const rows = db.exec({ sql, bind, rowMode: 'array', returnValue: 'resultRows' }) as unknown[][];
  return method === 'get' ? rows[0] : rows;
}

const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  let res: WorkerResponse;
  try {
    if (req.type === 'open') res = { id: req.id, ok: true, ...(await open()) };
    else res = { id: req.id, ok: true, rows: exec(req.sql, req.params, req.method) };
  } catch (e) {
    res = { id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  scope.postMessage(res);
};
