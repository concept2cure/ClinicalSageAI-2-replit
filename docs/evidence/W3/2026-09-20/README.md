# W3 evidence — CSA validation package baseline, run date 2026-09-20 (executed 2026-09-21 00:22–00:33 UTC)

**Row moved:** D4 (validation package). **State after this session:** the package exists as executable protocols with generated records and a generated traceability matrix; every document is **DRAFT — UNSIGNED**. The launch catalog is **not** validated by this run — see counts and findings below and `docs/validation/VSR-001-VALIDATION-SUMMARY-REPORT.md`.

## What was executed, and how

| Command | What it did | Output here |
|---|---|---|
| `npm run validation:iq` (`scripts/validation/run-iq.mjs`) | 15 installation checks against the checkout, the local PostgreSQL and the server on port 5200 | `IQ/iq-results.json`, `IQ/IQ-001-execution-record.md`, `IQ/db-schema.json`, `IQ/db-role-denied-tables.json`, `IQ/db-grants-before.txt`, `IQ/readyz.json`, `IQ/navigation-summary.json`, `IQ/security-headers.json` |
| `npm run validation:oq` (`tests/validation/run-all.mjs` → `tests/validation/oq/<app>/run.mjs`) | 90 OQ steps over the six launch apps, driving the real app through its API and in Chromium 141 (`playwright-core` 1.63.0, `/opt/pw-browsers/chromium-1194`), authenticated through `POST /api/auth/dev-login` | `OQ-<APP>/result.json`, `OQ-<APP>/OQ-00N-execution-record.md`, `OQ-<APP>/steps/*.api-N.json` (every request/response, secrets redacted), `steps/*.png` (full-page screenshots), `steps/*.server-log-excerpt.json` where a 500 was attributed to IQ-DEV-001 |
| `npm run validation:traceability` (`scripts/validation/build-traceability.mjs`) | generated `docs/validation/TM-001-TRACEABILITY-MATRIX.md` + `.json` from URS-001…006, RA-001 and the records above | matrix in `docs/validation/` |
| `npm run validation:oq:selftest`, `npm run validation:traceability:selftest` | proved the verdict machinery and the matrix gate fail on the cases they exist to catch | `selftests.txt` |

Server: `npx tsx server/index.ts` with `NODE_ENV=development ALLOW_DEV_AUTH=1 PORT=5200 SKIP_DB_STARTUP_TEST=true LAUNCH_SCOPE_ENFORCE=on ALLOWED_ORIGINS=http://localhost:5200,http://127.0.0.1:5200` (port 5200 is not in the hard-coded dev CORS list, `server/middleware/enterprise-security.ts:60`). Database: `clinicalsage` on 127.0.0.1:5432, runtime role `c2c`. No AI provider, no Redis, no gateway credentials. Test identity: jonmichaelpsmith@gmail.com, organisation 2. Git: `concept2cure-v2` at the commit recorded in each `result.json` (read from `.git/HEAD`; no git command was run).

## Counts

| Protocol | Steps | Pass | Fail | Deviation | Not executed |
|---|---|---|---|---|---|
| IQ-001 | 15 | 9 | 0 | 6 | 0 |
| OQ-001 Projects | 16 | 13 | 2 | 1 | 0 |
| OQ-002 Vault | 12 | 7 | 3 | 2 | 0 |
| OQ-003 Authoring | 22 | 9 | 1 | 1 | 11 |
| OQ-004 Submission Center | 15 | 13 | 1 | 1 | 0 |
| OQ-005 Submission Readiness | 9 | 6 | 1 | 2 | 0 |
| OQ-006 QMS | 16 | 14 | 1 | 1 | 0 |
| **OQ total** | **90** | **62** | **9** | **8** | **11** |

Requirements (TM-001): 67 — 43 pass, 2 partial, 7 fail, 15 open, 0 uncovered.

### Counts after the corrective actions — full re-execution 2026-09-21 16:26–16:31 UTC (control tower, trunk ad69500f + the OQ-VAULT-08b protocol correction)

| Protocol | Steps | Pass | Fail | Deviation | Not executed |
|---|---|---|---|---|---|
| IQ-001 (WD, 01:02 UTC) | 15 | 10 | 0 | 5 | 0 |
| OQ-001 Projects | 16 | 16 | 0 | 0 | 0 |
| OQ-002 Vault | 12 | 12 | 0 | 0 | 0 |
| OQ-003 Authoring | 24 | 22 | 1 | 1 | 0 |
| OQ-004 Submission Center | 15 | 15 | 0 | 0 | 0 |
| OQ-005 Submission Readiness | 9 | 9 | 0 | 0 | 0 |
| OQ-006 QMS | 20 | 20 | 0 | 0 | 0 |
| **OQ total** | **96** | **94** | **1** | **1** | **0** |

Requirements (TM-001, regenerated): 67 — 65 pass, 1 partial, 1 fail, 0 open, 0 uncovered.
The one fail is OQ-AUTH-17b (F-6, two review stores — a design decision, not fixed). The one
deviation is OQ-AUTH-16 (no AI provider; nothing simulated). Credentialed steps ran with the
local second signer (WF); staging execution with a real second account is still owed. The
findings this baseline surfaced (F-1 … F-12, IQ-DEV-001) and their dispositions are in
VSR-001 §4, §8, §9 and §10.

## Deviations (nothing was faked; each is recorded where it happened)

- **IQ-DEV-001 — open, blocks acceptance.** The runtime role `c2c` cannot read 264 tables (183 `public` tables owned by `postgres`). Symptoms: section creation in Authoring (→ 11 steps not executed), vault read model and Vault surface, QMS change control, program journey, contradiction scan all answer 500. The corrective `GRANT` is an owner-role action; the session attempted it and was **refused by the permission gate**, so it was not applied. `IQ/db-grants-before.txt` and `IQ/db-role-denied-tables.json` are the inventory.
- **IQ-DEV-002/003/005** — development boot contract (secrets unset, audit chain unsealed, RLS off, CSP report-only). Closed by executing on staging.
- **IQ-DEV-004** — no AI provider; `/readyz` correctly 503. OQ-AUTH-16 (AI draft) and OQ-SRDY-03 (dispatch QC, which turned out to call the model) are recorded as `AnA unavailable: no provider configured`.
- **OQ-SUBC-08** — the governed sign's positive case needs a password the runner does not hold (dev-login bypasses the password factor); the negative case (refused without re-auth) passed.

## Findings the run surfaced (see VSR-001 §4 for evidence lines and dispositions)

F-1 audit chain verifier reports the chain broken (409) · F-2 audit-trail ledger surface reads a store the launch apps never write · F-3 QMS approval needs no signature credential · F-4 `.exe` refusal returns 500 · F-5 per-IP rate limit hit by one browser session · F-6 authoring reviews invisible on the Review board · F-7 dossier map integer/UUID id mismatch · F-8 Dispatch Readiness gates the first submission, not the open program's · F-9 dispatch QC depends on a model call.

## What is owed

**To the founder (system owner):**
1. Apply (or have the operator apply) the IQ-DEV-001 grant, or re-provision the local database with `scripts/db/install-fresh.mjs`; then `npm run validation:iq && npm run validation:oq && npm run validation:traceability` and attach the fresh folder.
2. Decide F-1…F-9: change requests for the fixes, or a signed acceptance for any finding left open. F-1, F-2, F-3 bear on the Part 11 claim and D5.
3. Engage the qualified validation contractor named in D4; provide a real staging account with a password for OQ-SUBC-08.
4. Sign VMP-001, URS-001…006, RA-001, IQ-001, OQ-001…006, TM-001, VSR-001 once staging execution is green; file the signed PDFs under `docs/evidence/validation/`.

**To the validation contractor:**
1. Review the requirement set and risk assignment (URS/RA) against CSA and the customer's Part 11 policy — in particular whether PIN + session (Authoring) is an acceptable two-component signature and whether QMS approvals are meant to be signatures.
2. Witness one full re-execution on staging; review every unscripted/ad-hoc screenshot; initial the execution records.
3. Confirm the gates fail when they should (`selftests.txt`) and that TM-001 was regenerated after the last record.

## Not done in this session (by rule)

No product code was changed; no git command was run; no credential was guessed; no database grant was applied. Documents are drafts with empty signature blocks.
