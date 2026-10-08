/**
 * `pnpm --filter @processchess/db db:generate --name <change>`: runs drizzle-kit generate with
 * the given arguments, then rebuilds migrations.generated.ts.
 */
import { execFileSync } from 'node:child_process';

execFileSync('drizzle-kit', ['generate', ...process.argv.slice(2)], { stdio: 'inherit' });
execFileSync('tsx', [new URL('./build-migrations.ts', import.meta.url).pathname], {
  stdio: 'inherit',
});
