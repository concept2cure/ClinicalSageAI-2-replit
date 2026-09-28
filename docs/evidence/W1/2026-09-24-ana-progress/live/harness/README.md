# The live run's harness

Kept so the run can be repeated, not as product code.

- `fake-anthropic.mjs` — a local stand-in for the Messages API. It plays one fixed turn
  (declare a plan, search the project, mark a step done, draft an authoring document, finish the
  plan, answer) and calls only tools the server actually offered. The server reaches it through
  `ANTHROPIC_BASE_URL`; nothing else is stubbed.
- `run.mjs` — the Playwright run: attach a real file on Home, send, follow the turn to the
  conversation page, and check the progress UI against what the server did. Flags: `--live`
  (mid-turn checks), `--rail`, `--editor`.

The paths at the top of `run.mjs` point at the session's scratch directory (login response,
created project, the uploaded file); set them to your own. Server: Postgres 16 with pgvector,
`node scripts/db/install-fresh.mjs` then `node scripts/db/deploy-migrate.mjs`, then
`npx tsx server/index.ts` with the AGENTS.md variables plus `SEED_DEMO_USER=true`,
`RLS_ENFORCE=off` (local only), `ALLOWED_ORIGINS` for the port, and `ANTHROPIC_API_KEY` /
`ANTHROPIC_BASE_URL` pointing at the fake.
