# Logging Migration Plan (console -> pino)

Goal: migrate repository logging to the new `pino`-based logger in `server/utils/logger.ts`.

Plan

1. Add a codemod script `scripts/migrate-logging-to-pino.mjs` (conservative, dry-run first).
2. Run dry-run and review replacements in a PR. Apply only safe, non-invasive replacements at first.
3. Create follow-up PRs to handle imports, adapters, and more complex patterns (e.g., format strings, structured logs).

Usage

- Dry run: `node scripts/migrate-logging-to-pino.mjs --dir .`
- Apply: `node scripts/migrate-logging-to-pino.mjs --apply --dir .`

Notes

- The initial codemod only replaces `console.log/warn/error/debug` with `logger.info/warn/error/debug`.
- It does not add or remove imports; the recommended workflow is to run the codemod in dry-run, then manually add `import { logger } from 'server/utils/logger'` or similar where needed.
