import type { SqlMethod } from '../executor';

export type WorkerRequest =
  | { id: number; type: 'open' }
  | { id: number; type: 'exec'; sql: string; params: unknown[]; method: SqlMethod };

export type WorkerResponse =
  | { id: number; ok: true; rows?: unknown; persistent?: boolean; reason?: string }
  | { id: number; ok: false; error: string };
