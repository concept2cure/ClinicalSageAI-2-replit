# P-39 step 2: one commitment store

Row: D2 (W1). Decision P-39 step 2 (`docs/LAUNCH_DEFINITION_OF_DONE.md`) says:

> "**`c2c_commitments`** (`/api/c2c/commitments`), onto `regulatory_commitments`: an AI extraction with an ungoverned
> create."

Each store "moves onto its canonical record and is retired in the same change (zero duplication), with the deletion
record the working agreement requires". This change does that, and it unblocks G3 (P-54: "Commitments converge (step
2) before the correspondence family (step 3)").

## What already exists

### The store being retired: `c2c_commitments`

- **Table.** `migrations/20260603_commitments.sql`. It has text ids, `direction`, `authority`, `title`, `source_quote`,
  `groundedness`, `needs_review` and `status` (`proposed`…). It has no keys, no CHECKs and no `deleted_at`.
- **Routes.** `server/routes/c2c/commitments.ts`, mounted at `/api/c2c/commitments` in
  `server/bootstrap/register-inline-routes.ts`:
  - `GET /`;
  - `POST /`, a create with no reason and no audit row;
  - `POST /extract`, a model extraction through the AI gateway that writes each item as `proposed`, with no reason or
    audit;
  - `PATCH /:id/status`, which takes a reason but no status whitelist, and whose audit was written after the change, on
    another connection, best-effort;
  - `POST /contradictions`, a model check;
  - `POST /:id/promote-to-task`, which builds a task spec and creates no task.
- **Service.** `server/services/commitments/commitments-service.ts`. Its only importer is the route.
- **Reach.**
  - No client caller: nothing in `client/` calls `/api/c2c/commitments`.
  - No AnA tool and no MCP tool.
  - The namespace is unmapped in the launch scope, so production refuses it (`launchScopeApiVerdict` →
    `'unmapped'`; `readUnattributedApiMode` enforces by default). The 2026-09-25 route inventory records no caller
    (`docs/evidence/D2-API-SCOPE/2026-09-25/stage3-route-inventory.json`).
- **Seeds.** Nothing writes the table.

### The canonical store: `regulatory_commitments`

- **Table.**
  - Created in `migrations/20260610_ha_interactions_commitments.sql`.
  - `20261018b` added project, letter and question keys.
  - `20261019` added fulfilment evidence, a record guard and the signed-fulfilment trigger.
- **Create**, governed with a reason and a ledger row:
  - `POST /api/ha-interactions/commitments` (`server/routes/ha-interactions.ts`) for an organisation commitment;
  - `POST /api/concept2cure/projects/:projectId/agency-communications/:eventId/questions/:questionId/commitments`
    (`server/routes/c2c/agency-responses.ts`) for a commitment made in an answer to an agency letter.
- **Fulfilment.** `server/routes/commitment-fulfil-route.ts`: PMR, PMC and REMS are signed, and the others are resolved
  with a reason.
- **Client.**
  - `CommunicationCenter.tsx`, Meetings & commitments: list and create.
  - `AgencyResponses.tsx`: a commitment from an answer.
  - `CommitmentFulfilment.tsx`: fulfil.
- **AnA.** `create_regulatory_commitment`, `review_commitment_portfolio`, `fulfill_regulatory_commitment`.

### Searches run

- `c2c_commitments`, `c2c/commitments`, `commitments-service`, `/extract`, `promote-to-task` and `contradictions` in
  `client/`, `server/`, `scripts/`, `tests/` and `shared/`.
- `regulatory_commitments` across the same.
- `git log --all --diff-filter=D -- '*ommitment*'`. It shows four earlier commitment extractors, each deleted:
  - `client/src/components/CommitmentExtractor.jsx`
  - `server/services/_deprecated/RealCommitmentExtractor.js`
  - `server/services/_deprecated/CommitmentIntelligenceService.js` with `CommitmentIntelligenceHub.jsx`
  - `server/services/intelligence/proactive-commitment-engine.ts`

## The decision

Each capability of the retired store, and where it goes:

| Capability | Outcome | Where the user does it now |
|---|---|---|
| Record a commitment | Already canonical, and governed | `CommunicationCenter.tsx` (organisation) and `AgencyResponses.tsx` (made in an answer), through the two governed creates above. |
| Move its status | Already canonical, and governed or signed | `CommitmentFulfilment.tsx` → `commitment-fulfil-route.ts`. |
| Extract commitments from a document with a model | **Not carried over** | A person records each commitment where it is made. |
| Model check of outbound contradictions | **Not carried over** | — |
| Promote to task | **Not carried over.** It created no task, only a spec. | — |

**Why the extraction is not carried over, so the next session does not rebuild it a fifth time.**
- A model proposing the commitment list puts a model in charge of a governed record's content, which RULE 2 refuses.
- G3 (`docs/design/PARITY_WEAVE_VEEVA_BASICS_2026-10-29.md`) set the rule for the letter's questions: "the
  extraction makes no model call", the letter's text is proposed verbatim, and a person confirms each through the
  existing POST.
- If a commitment proposal from a letter is wanted, it follows G3's design on the letter's text, through
  `regulatory_commitments`' existing creates. It is never a second store.

## What changed

- **Deleted.**
  - `server/routes/c2c/commitments.ts`;
  - `server/services/commitments/commitments-service.ts` and its two tests;
  - `tests/routes/c2c-commitments.test.ts`;
  - the mount in `register-inline-routes.ts`.
- **Ledger-gap test.** The case in `governed-ledger-gap-surfaced.test.ts` that pinned the retired route's
  `auditWriteFailed` is removed. The `submission-ops` case stays.
- **Baselines.** Their entries for the deleted files are removed: `tenant-resolvers-baseline.json`,
  `sql-interpolation-baseline.json` and `docs/reports/requestdb-coverage-baseline.json`.
- **`migrations/20261029i_c2c_commitments_read_only.sql`.**
  - The table refuses INSERT, UPDATE and TRUNCATE, as `20261019b` did for `reg_questions`.
  - DELETE stays open, so a tenant's offboarding purge (P-58) can remove its rows.
  - The rows are kept as history.
  - The file is registered in the migration set.

## Proof

- **`tests/schema-contract/c2c-commitments-read-only.pglite.test.ts`**, run on the real DDL from
  `20260603_commitments.sql`, with a row written before the file:
  - the file is in the set after its creator;
  - INSERT, UPDATE and TRUNCATE are refused;
  - the old row is unchanged;
  - a replay with the creator changes nothing;
  - DELETE stays open.
- **Mutation:** deleting the INSERT/UPDATE trigger fails two cases. Restoring it makes them pass.
- **Gates:**
  - `ci:migration-set-order`: OK, 446 migrations, sweep last;
  - `ci:migration-drop-safety`: OK;
  - `governed-ledger-gap-surfaced.test.ts`: passes with the bundle case;
  - `tsc --noEmit`: no error.
- **No reference left:** a search for `commitments-service` and `routes/c2c/commitments` in `server/`, `client/`,
  `shared/`, `tests/` and `scripts/` finds nothing, apart from the notes recording the retirement.
