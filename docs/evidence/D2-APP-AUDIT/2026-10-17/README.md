# App audit and first consolidation — 2026-10-17

Row moved: **D2** (launch catalog). Builds on `docs/SURFACE_DECISIONS_2026-10-08.md`: every launch
screen was re-read against HEAD `990a687c6` by four review agents (Projects/AnA, Documents,
Submissions/CMC, Quality/Reports/Settings), and the sharpest findings were verified by hand.

## What changed in this commit

| Change | Why | Proof |
|---|---|---|
| Communication: advancing an agency letter no longer writes `updated_at` | `concept2cure_agency_communications` (deploy path: `db/migrations/20260331_communication_center_scaffold.sql`) has no such column, so every triage and close failed | `server/routes/c2c/__tests__/communication-advance.pglite.test.ts` runs the real route on the real DDL. Before the fix: `400 column "updated_at" of relation "concept2cure_agency_communications" does not exist`. After: 200 twice, row reads `actioned` / `closed` |
| `migrations/20260610_ha_interactions_commitments.sql` joins `C2C_MIGRATION_FILES`, above the final sweeps | Communication's Meetings and Commitments tabs read these four tables, which only install-fresh created | Local PostgreSQL 16 + pgvector: `db:provision` from empty → OK. Dropped the four tables (a database provisioned before this change), ran `db:migrate:deploy`: **with the previous migration set, exit 0 and 0 tables** (the silent failure CLAUDE.md Rule 1 describes); **with this set, exit 0 and all four back, each with RLS on and one policy**. A second consecutive deploy: exit 0. `ci:migration-deploy-path` baseline shrunk by this one file |
| Communication's header copy no longer promises AnA will decompose deficiencies and walk resubmissions through the gateway | Nothing does that | Copy only |
| Launch catalog: eight apps → seven (decision P-36) | Submission Readiness read the same per-sequence verdict as Submission Center's Validation/Dispatch tabs | `dispatch-readiness` surface and module moved into Submission Center. Launch surface set and module set compared before/after: identical. New tests in `launch-scope.test.ts`; `ci:launch-scope` count pinned to 7 |
| Four Communication label/tone maps added to `scripts/ci/launch-scope-fixture-allowlist.json` with reasons | `ci:launch-scope` was red at HEAD since 2026-10-16 (Communication joined launch importing `CC_SOURCE_TYPES`, `CC_INTERACTION_TYPES`, `CC_TONE`, `CC_CLOSURE`); all four are vocabularies, not records | `ci:launch-scope` red at HEAD (4 findings) → green |
| `registryModel.test.ts` expects Tasking's screen action | Red at HEAD since 2026-10-16: the founder put Tasking on the rail and the test still expected only My work | 26/27 at HEAD → 27/27 |

The left rail is unchanged by the founder's choice (Home, Apps catalog, Tasking and Communication stay).

## Gates run

- `ci:launch-scope` and its selftest, `ci:launch-scope-api` (394 paths, none refused)
- `ci:migration-set-order`, `ci:migration-drop-safety`, `ci:migration-deploy-path`,
  `ci:migration-guard-order`, `ci:migration-reachability`, `ci:migration-prefix-collisions`,
  model/migration agreement
- vitest: `server/services/entitlements`, `shared/navigation`, `server/routes/c2c/__tests__`,
  `registryModel.test.ts`, `shellNav.test.tsx` — all pass
- Not run here: `delegated-credential-scope.dbtest.ts` (needs the DB test harness); its expected
  app list is updated to the seven apps

## Audit findings still open (not changed here)

Ordered by what a client meets first.

1. **Communication** and **Project home → Respond** are two unconnected agency inboxes: a letter
   uploaded in Respond lands in the data room. Merge Communication into Respond.
2. **Gateway transmittals** still offers a package-based transmit (`/api/submission-ops/packages`,
   assemble and transmit) beside the sequence's freeze-and-dispatch path. Make it a read-only log.
3. **FDA transmission** fails closed: the AS2 envelope is not S/MIME PKCS#7, the MDN is not
   verified, there is no ack poller (`server/services/submission-gateways/fda-esg.ts`).
4. **IND forms** (P-32) are not linked from the sequence; about nine buttons only prompt AnA.
5. **Protocol development** opens `rows[0]` only (`ProtocolDev.tsx`); no picker.
6. **Quality**: new document, revise, schedule review and change-control buttons only prompt AnA.
7. **Part 11 console**: §11.10 and SOC 2 tables are hard-coded `not_assessed`.
8. **Settings**: the Apps toggle writes no audit row; "Contact sales" shows a false
   "routed to sales" toast; the credit ledger has no spender; the Translation setting is read by nothing.
9. **Seven document stores** (`vault.documents`/`canonical_documents`, `authoring_documents`,
   `protocol_documents`, `coauthor_documents`, `concept2cure_artifacts`, `unified_documents`,
   `project_sections`); only the first two are written by the launch workflow.
10. **Deep research** (locked): the server writes `'complete'`, the screen waits for `'completed'`.
