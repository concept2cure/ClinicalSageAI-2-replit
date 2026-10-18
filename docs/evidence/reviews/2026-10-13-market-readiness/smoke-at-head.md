# Fresh-environment smoke for human testing

Run on 2026-10-18 against `concept2cure-v2` at **`aa4ee1e29`** (exported with
`git archive`, its own `npm ci`), PostgreSQL 16.13 + pgvector 0.6.0, an empty
database, `NODE_ENV=development`, no model key. The earlier runs are kept for
comparison.

| Step | `94b4f9238` (2026-10-13) | `eeabd3cab` (2026-10-13) | `aa4ee1e29` (2026-10-18) |
|---|---|---|---|
| `npm run db:provision` on an empty database | **fails**, exit 7: `db/migrations/20260813_knowledge_graph_tenant_keys.sql — column n.organization_id does not exist` (172/375 applied) | passes: 375/375, 29.7 s | passes: **408/408, 36.3 s**, `/readyz` schema contract holds |
| Boot `npx tsx server/index.ts` | — | `/healthz` 200 after ~56 s | `/healthz` 200; `/readyz`: database, schema, storage `ok`; ana `down` (no provider — expected without `ANTHROPIC_API_KEY`) |
| `scripts/seed-admin.mjs` then `POST /api/auth/login` + `POST /api/auth/mfa/verify` (dev prints the emailed code to the server log) | — | session issued | session issued |
| `POST /api/c2c/projects` (create an IND program) | — | — | **refused**: `PROJECT_RECORD_UNAVAILABLE / NO_CLIENT_WORKSPACE` (see HT-01) |
| … after `node scripts/db/deploy-migrate.mjs` (2.9 s) | — | — | **created** (`HT Smoke IND`) |
| `POST /api/vault/ingest` (a 1-page PDF, `documentType=REPORT`) | — | — | **ingested**; text extracted; deterministic filing proposal `3.2.P.8`, confidence high; scan bypassed with a logged warning (non-production) |
| `POST /api/authoring/docs` from the `3.2.P Drug Product` template | — | — | **created** in the program |
| `POST /api/authoring/docs/:id/export` on the draft | — | — | refused by design: only an approved or frozen document exports as a filing artifact |

## HT-01 — organisations created by `scripts/seed-admin.mjs` cannot create programs

`seed-admin.mjs` (the account step in `docs/LOCAL_TESTING.md` §2) writes an
organisation, user and membership but no default client workspace. Every
program create then fails with `NO_CLIENT_WORKSPACE`
(`server/services/c2c/organization-default-workspace.ts` explains why the
anchor will not invent one). `scripts/seed-local-testing.ts` does not create it
either. The repair sweep `migrations/20260923_organization_default_client_workspace.sql`
does — it runs on every `deploy-migrate`, but the seeded organisation did not
exist when provisioning ran.

**Workaround for testers:** run `node scripts/db/deploy-migrate.mjs` (owner URL)
once after seeding. **Fix:** have `seed-admin.mjs` create the workspace through
the canonical writer, or run the repair sweep as its last step; filed under
MR-15 in the findings register.

**Fixed the same day by `969d1e727`.** `seed-admin.mjs` and `seed-founder.mjs`
now execute that repair migration themselves (`scripts/seed/organization-workspace.mjs`),
and so do the GA demo seeder and five of its parts, which each had their own
INSERT. Re-run from empty at `d0cde23b9` plus the fix: 409 `NO_CLIENT_WORKSPACE`
with trunk's `seed-admin.mjs`, then 201 and an anchored program with the fixed
one, on the same running app. Evidence:
[`docs/evidence/W1/2026-10-18-seeded-workspace/`](../../W1/2026-10-18-seeded-workspace/).
