# W3 — the validation package executed under the production posture (2026-09-22)

**Row moved:** D4 (validation package). **Workstream:** W3.
**State:** D4 is **not green**. What local execution can supply is now
supplied in the posture production must run in. The rest is owed, listed in
VSR-001 §12.5 and at the end of this file.

## What was executed

| | |
|---|---|
| Database | `c2c_oq_w3_20260922b`, provisioned from empty: `C2C_DB_NAME=c2c_oq_w3_20260922b npm run up` at `6a0575213` |
| Server | `npx tsx server/index.ts`, booted from the env files `npm run up` wrote, with no database variable exported; `RLS_ENFORCE=on NODE_ENV=development ALLOW_DEV_AUTH=1 SKIP_DB_STARTUP_TEST=true LAUNCH_SCOPE_ENFORCE=on PORT=5200` |
| Runtime role | `app_service`: not superuser, no BYPASSRLS, owns no table (IQ-07). Server log: `RLS enforcement mode resolved {"mode":"on"}` |
| AI provider | none. OQ-AUTH-16 is a deviation, and nothing was simulated |
| Identities | author: user 2 `jonmichaelpsmith@gmail.com` (dev-login, org 1). Second signer: user 11 `oq-signer@validation.local` (org 1, admin), created in this database only by `scripts/seed-admin.mjs`. Password in the session scratchpad only; `transcripts/provision-signer.transcript.txt` is redacted |
| Commits | OQ `e2d910d6f`; IQ `32569d496` (differs from `e2d910d6f` only in `scripts/validation/run-iq.mjs` and IQ-001) |
| Runner | `OQ_SIGNER_EMAIL`, `OQ_SIGNER_PASSWORD`, `OQ_AUTHOR_EMAIL`, `VALIDATION_BASE_URL=http://localhost:5200`, `VALIDATION_RUN_DATE=2026-09-22`; `node tests/validation/run-all.mjs`; `RLS_ENFORCE=on node scripts/validation/run-iq.mjs` |

## Results

| Record | Pass | Fail | Deviation | Not executed |
|---|---|---|---|---|
| `IQ/` IQ-001 v0.3 | 11 | 0 | 4 | 0 |
| `OQ-PROJECTS/` | 16 | 0 | 0 | 0 |
| `OQ-VAULT/` | 12 | 0 | 0 | 0 |
| `OQ-AUTHORING/` | 23 | 0 | 1 | 0 |
| `OQ-SUBMISSION-CENTER/` | 15 | 0 | 0 | 0 |
| `OQ-SUBMISSION-READINESS/` | 9 | 0 | 0 | 0 |
| `OQ-QMS/` | 20 | 0 | 0 | 0 |

TM-001 is regenerated from this set: 67 requirements, 66 pass, 1 partial
(URS-AUTH-012, no provider), 0 fail. Transcripts are in `transcripts/`.

## Why this set exists

Every execution filed before it ran as role `c2c` on `clinicalsage`, with
`RLS_ENFORCE=off`. `c2c` owns 61 RLS-enabled tables without FORCE, and a table's
owner is exempt from its policies. Running the protocols the way D3 requires
production to run found a launch-app defect that the filed 12/0/0 Vault record
could not see.

| Folder | Shows |
|---|---|
| `vault-rls-before-after/before-e2d910d6f/` | F-14. Under `RLS_ENFORCE=on` as `app_service`, OQ-VAULT-03 ingest answered 500 `new row violates row-level security policy for table "documents"`; 4 pass, 1 fail, 7 not executed |
| `vault-rls-before-after/after-e2d910d6f/` | The same protocol after the fix: 12 / 0 / 0 |
| `vault-rls-before-after/dev-shadow-after-e2d910d6f/` | F-15, **open**. In shadow mode (`RLS_ENFORCE=off`, the `.env` default), ingest is still refused for the non-owner role. A tester on `npm run up` + `npm run dev` cannot upload to the Vault |
| `negative-tampered-chain/` | P-3. One audit row in a throwaway database was altered with triggers bypassed. OQ-PROJ-06b v0.1 passed over the broken chain; v0.2 fails it. The row was restored and `verify-chain` read ok over 23 rows |

## Changes made to get here

| Commit | What |
|---|---|
| `6a0575213` | F-16: the server read `.env` before `.env.local` for any entrypoint that skips `scripts/startup.sh`. That produced this session's first, false OQ-003 failure (500 `AUDIT_CHAIN_SCHEMA_MISSING` from a stale database). One env-file loader now |
| `a6bee4cf9` | P-5: the IQ runner resolves the environment as the server does; IQ-05 names the database |
| `e0c983cc1` | P-3: OQ-VAULT-08b and OQ-PROJ-06b require the chain verdict to verify |
| `e2d910d6f` | F-14: the route-level auth gate keeps the organisation UUID the `vault.*` policies key on |
| `32569d496` | P-4: IQ-07 raises IQ-DEV-006 when the runtime role owns RLS tables without FORCE |

## Owed, and not closable by another local run

1. Staging execution of IQ-001 and all six OQ protocols with the production
   image, a real second account created through user administration, and a
   witness.
2. A PQ-passed AI provider, for OQ-AUTH-16 / URS-AUTH-012.
3. A release signature applied by a real signer on the IND sequence.
4. F-1/F-2 verified on staging with the HMAC seal on.
5. The qualified contractor's review, and signatures.
6. **The F-15 decision** (VSR-001 §12.2): run development in the production
   posture, or make the GCC-lineage policy functions honour `app.rls_enforce`.
