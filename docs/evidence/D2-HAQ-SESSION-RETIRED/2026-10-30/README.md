# P-39 step 4: the HAQ session store is retired onto the project inbox; the obligations and minutes stores are decided

Row: D2 (W1). Decision P-39 step 4 (`docs/LAUNCH_DEFINITION_OF_DONE.md`), as amended 2026-10-30.

## What already exists

The launch verdicts below come from `launchScopeApiVerdict` run against the current prefix map. In production, an
out-of-scope or unmapped path is refused with 403.

### The three source stores

| Store | Tables, and whether an applier creates them | Writers | Client callers | In production |
|---|---|---|---|---|
| `haq_session` | `concept2cure_artifacts` rows with `type='haq_session'` (baseline). Keys are organization and project only. `content` is opaque JSON. | `PUT /api/concept2cure/projects/:id/haq-session` (`server/routes/c2c/haq-sessions.ts`). It rewrites `content` in place, with no version, no reason and no ledger row. | None since 2026-05-01: d04381632 removed `components/workflow/HAQManager.tsx`, and today's `HaqManager.tsx` is a view of the inbox. | **Reachable** (claimed by project-home). |
| `lifecycle_obligations` and `lifecycle_obligation_events` | `migrations/20260610_lifecycle_obligations.sql`, **on no applier** (`scripts/ci/migration-deploy-path-baseline.json`). Its parent table `rim_products` is on no applier either. | `/api/lifecycle/obligations` and its events (governed: a reason and the ledger). Also the AnA `create_lifecycle_obligation`, hidden in production. | `BiopharmaSpecialty.tsx` (`/renewals`), on a surface outside launch. | Refused. Reporting's `lifecycle.obligation_calendar` reads the tables. |
| `c2c_agency_meetings`, with `minutes` and `briefing_book` JSONB | `db/migrations/20260717_agency_meetings_store.sql`, on the applier. No project key; `program` is free text. | `POST /api/agency-meetings`, which always writes both JSON columns as NULL. Only the laptop demo seed writes minutes. | `AgencyMeetings.tsx`, a surface outside launch. | Refused. |

### The destinations

| Destination | Governed paths | Fit |
|---|---|---|
| Project inbox: `concept2cure_agency_communications`, `agency_communication_questions` | Letters through `communication-center.ts`. Questions, responses, Part 11 approval and the response package through `agency-responses.ts`. | Holds HAQ questions: number, text, discipline, severity, CTD section, signed response. A question needs a letter (`communication_event_id NOT NULL`). Has `source_type 'meeting_minutes'`. |
| `regulatory_commitments` | `createCommitmentTx` through Communication and through an inbox question; fulfilment by signature or reason. | No recurrence, no occurrences, a fixed type vocabulary, no product key. |
| `ha_interactions` and its questions | `POST /api/ha-interactions/*`, with a reason and the ledger. | No minutes text or document. Commitments go through `regulatory_commitments.source_interaction_id`. |

## What changed (step 4a, `haq_session`)

This carries out `docs/design/HAQ_SIGNED_ANSWERS_2026-10-15.md` §3.
- **Deleted** `server/routes/c2c/haq-sessions.ts` and its mount (`server/bootstrap/register-concept2cure-routes.ts`).
- **Moved verbatim** `GET /reviews/pending` to `server/routes/c2c/reviews.ts`. It keeps the same middleware chain and
  the same mount, so `tests/e2e/multi-user-review.e2e.ts` keeps its path.
- **Consequential edits:**
  - the parity test now pins that no router answers the HAQ session paths;
  - the write-gates fixture loses its PUT probe;
  - the lineage-save gate loses its NOT_PROSE entry;
  - `WIRED_FILES` in the bundles contract drops the file;
  - the requestdb coverage baseline drops the file.
- **The rows stay** as history in `concept2cure_artifacts`. They are not moved:
  - a session names no letter, and the inbox does not invent one;
  - its model-drafted responses and unsigned "finalized" statuses do not carry over (RULE 2).

**Deletion record (working agreement).** HAQ questions and their signed answers are delivered by the project inbox:
- `client/src/concept2cure/v2/surfaces/AgencyInbox.tsx`;
- `client/src/concept2cure/v2/surfaces/AgencyResponses.tsx`, in Communication and in Project home's Respond;
- `server/routes/c2c/agency-responses.ts`.

They are reachable in launch scope (`ci:launch-scope-api`; `/api/concept2cure/projects/:id/agency-communications` is
claimed by project-home). The deleted route had had no client since 2026-05-01.

## Decided (steps 4b and 4c)

These are recorded in P-39 step 4.
- **`lifecycle_obligations`: deferred, and its destination corrected.**
  - Its tables are on no applier, and `regulatory_commitments` cannot hold a recurrence.
  - It converges when post-approval lifecycle enters the catalog, onto a register that can hold a recurrence.
  - Owed by the Reporting lane: install the tables, or withdraw the `lifecycle.obligation_calendar` report type. Its
    run fails on a deployed database.
- **`c2c_agency_meetings` minutes: no data to move.**
  - When Communication records a meeting, its minutes are an inbox letter (`meeting_minutes`) linked to the
    `ha_interactions` row.
  - The agreements and commitments become that letter's questions and `regulatory_commitments`.
  - The meetings store and its surface retire then.

## Proof

- `green.txt`: 695 tests pass across three suites:
  - `server/routes/c2c/__tests__/c2c-router.parity.test.ts`;
  - `tests/artifact-change-invalidates-bundles.contract.test.ts`;
  - `server/routes/c2c/__tests__/project-write-gates.pglite.test.ts`.
- `mutation-route-restored.txt`: with a `PUT /projects/:projectId/haq-session` added back to the reviews router, the
  parity test fails. The file was then restored.
- Gates:
  - the requestdb coverage audit, `ci:sql-interpolation`, `ci:server-error-leaks` and `ci:launch-scope-api` pass;
  - `ci:lineage-save-gate` fails only on `server/services/csr/csr-narrative-store.ts`. It fails identically on HEAD
    without this change: an unguarded writer from the CSR lane (b265d6fc0), not this change's.
