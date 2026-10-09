/**
 * The one place the server reads `.env` files. Import it for its side effect,
 * as the FIRST import of every entrypoint and of any module that reads the
 * environment at import time:
 *
 *   import './config/load-env-files';
 *
 * Order: `.env.local` first, then `.env`, both `override: false`. The first
 * file to define a key wins, and a value already in the process environment —
 * a shell export, a host-injected secret — beats both. `.env.local` is the
 * git-ignored, machine-local file `npm run up` writes; a developer's local
 * database must beat whatever `.env` names.
 *
 * Why a module rather than two calls at the top of server/index.ts: ESM
 * evaluates every static import before the importing module's body. Calls
 * written at the top of index.ts ran AFTER server/db/runtime.ts had built the
 * pool, and runtime.ts loaded `.env` on its own to cope — so `.env` won every
 * key both files define and `.env.local` never reached the pool. `npm run dev`
 * hid it (scripts/startup.sh exports `.env.local`'s URLs first); every other
 * entrypoint connected to `.env`'s database. An import is evaluated in order,
 * so this module runs before anything imported after it.
 *
 * Production images exclude both files (.dockerignore); there the environment
 * is injected by the host and this module is a no-op.
 */
import { config as dotenvConfig } from 'dotenv';

export const ENV_FILES = ['.env.local', '.env'] as const;

for (const path of ENV_FILES) {
  dotenvConfig({ path, override: false, quiet: true });
}
