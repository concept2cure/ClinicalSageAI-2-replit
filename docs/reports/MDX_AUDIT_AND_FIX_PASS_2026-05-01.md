# MDX module — full audit + fix pass

**Branch:** `concept2cure-v2` (post-merge of `claude/audit-mdx-backend-QvnNr`).
**Author:** Claude Code. **Date:** 2026-05-01.

Companion to `MDX_BETA_AUDIT_2026-05-01.md` and
`MDX_BETA_BACKEND_PROGRESS_2026-05-01.md`.

This pass audited every shipped piece of the MDX module — UI surfaces,
backend routes, services, schema, migrations, runner scripts, ops docs,
and tests — against the actual state of `concept2cure-v2` after the
8-commit BETA merge plus the 66 unrelated commits that landed in
parallel. Findings below; bugs that were fixable in this pass were
fixed and are flagged with **FIXED**.

## Method

1. Inventory: 28 MDX-related route files, 11 UI surfaces, 11 fixture
   files, 22 backend services touched by the BETA stream.
2. Static checks: grep for `as any`, `ts-ignore`, mid-file imports,
   missing exports, schema column references, hardcoded magic values.
3. Cross-reference: every audit-trail-coverage row against the actual
   route handler; every UI fixture type against backend DTO shape.
4. Read every file I shipped in the 8-commit BETA push end-to-end.
5. Verified migration SQL matches the Drizzle schema column-for-column.
6. Confirmed all referenced tables exist in the canonical schema.

## Findings

### Bug #1 — Mid-file `import` statements in audit-archive.service.ts (FIXED)

**Severity:** Medium. **Status:** FIXED.

`server/services/audit/audit-archive.service.ts` had three import
blocks scattered through the file: `crypto`/`Pool` at the top,
`fs`/`path` at line 147, `@aws-sdk/client-s3` at line 178. ES modules
require all imports at the top; while TypeScript hoists them, some
bundlers (esbuild for tests, Vite for build) trip on the pattern. Fixed
by consolidating all imports at the head of the file.

### Bug #2 — `Pool` / `PoolClient` imported as values, not types (FIXED)

**Severity:** Low. **Status:** FIXED.

`server/services/tenant-export/tenant-export.service.ts` imported
`Pool, PoolClient` from `pg` as values but used them only as type
annotations. Switched to `import type` so the production bundle
doesn't carry a runtime dependency it doesn't use.

### Bug #3 — `audit_events.entity_id` schema is INTEGER, code passed string (FIXED)

**Severity:** High — code path would 500 in production.
**Status:** FIXED.

`audit_events.entity_id` is `integer` in the schema. Two writers were
passing string literals:

- `scripts/run-chain-verify.mjs` passed `'cron_verify'` as `entity_id`.
- The pre-existing `server/services/audit/chainIntegrityMonitor.ts`
  passed `'chain_monitor'` as `entity_id` (this bug predated my work
  but lives in the same surface I touched).

Both would fail at runtime with `invalid input syntax for type
integer`. Fixed both to use `0` as the system-event sentinel and
move the human-readable scope into `entity_type`
(`audit_chain.cron_verify` / `audit_chain.monitor`).

### Bug #4 — Section number mismatch between Q-Sub commitments and eSTAR sections (FIXED)

**Severity:** High — would have left every cover-letter `§` block
unpopulated in production. **Status:** FIXED.

The eSTAR convention stores section numbers as decimals: `'3.0'`,
`'6.0'`, `'11.0'`. Q-Sub commitments and the cover-letter caller pass
the integer form: `'3'`, `'6'`, `'11'` (per the seed and the UI fixture
in `data/presub.ts`). My original `pullEstarSections` did an exact
match on `sectionNumber`, so the live cover-letter integration would
have come back with every requested section marked `missing` even
when the eSTAR was fully authored.

Fix: `pullEstarSections` now expands the requested set to include
both spellings (`'3'` ↔ `'3.0'`) and looks up by either form. New
test `section-pull.test.ts` covers the round-trip.

### Bug #5 — Q-Sub route accepts non-uuid programId, fails downstream as 500 (FIXED)

**Severity:** Medium — bad client input surfaces as opaque 500.
**Status:** FIXED.

`POST /api/q-sub` accepted any string as `programId`. Since
`regulatory_programs.id` is `uuid`, a non-uuid like `'p-1'` would
make Postgres throw `invalid input syntax for type uuid` at the
service-layer JOIN, which the route would map to a 500.

Fix: route now validates the uuid shape with a regex and returns
422 with a clean `programId must be a UUID` message before calling
the service. Added a regression test
(`returns 422 when programId is not a UUID`).

Side effect: tests using fixture ids like `'p-1'` were updated to
use real uuid-shaped ids (`aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1`).

### Gap #1 — UI commitment.dossierLink.sectionId type mismatch with backend DTO

**Severity:** Medium — will surface as TS error when UI wires live.
**Status:** Documented; UI-side fix deferred to Claude Code stream.

`client/src/concept2cure/mdx/data/presub.ts` types
`Commitment.dossierLink.sectionId: number`. The Q-Sub schema stores
`dossier_link_section_id` as `text` (the column has to support CTD-
style refs like `'3.2.S'` in the future). The `getQSubDetail` service
returns `sectionId` as the raw string.

Fix path:
- Backend keeps the wider `text` type — it's correct for CTD refs.
- UI type should be `string | number` (or just `string`) when the UI
  switches from the fixture to the live BFF.

This isn't a backend bug, but it's a contract gap that will trip the
UI port. Owning team: Claude Code stream. Tracked here so it doesn't
get lost.

### Gap #2 — UI surfaces are fixture-only, all 11

**Severity:** Expected for this point in the BETA plan.
**Status:** Documented.

Every MDX surface (Overview, ProjectHome, K510Surface, PmaSurface,
CerSurface, PrecedentSurface, PreSubManager, EstarEditor, PmaEditor,
CerEditor, CerWorkbench) reads from `data/*` fixtures and makes zero
live API calls. The live BFF is wired and tested per the audit-trail
contract test; the UI port to live data is the Claude Code stream's
next chunk of work.

### Gap #3 — UI workbench surfaces (Tasks/Vault/Validation/Submissions/Templates)

**Severity:** Low — these are deliberate stubs.
**Status:** Documented.

`App.tsx` switch references `TasksSurface`, `VaultSurface`,
`ValidationSurface`, `SubmissionsSurface`, `TemplatesSurface`. These
ARE exported from `workbench/Workbench.tsx` (verified) — the
references resolve correctly. But the current routing in `App.tsx`
short-circuits via `MDX_STUBS[activeNav]` so the switch cases are
unreachable. That's intentional ("In design — do not pre-build" per
the BETA audit). Flagging so future readers know it's deliberate, not
dead code.

### Audit-trail coverage — no remaining gaps

Every BETA-scope governed mutation is now logged to `audit_logs` via
`auditService.logAction`:

- Q-Sub family ✓
- E-signature ✓
- Evidence Sufficiency ✓
- eSTAR sections (create/edit/approve/delete) ✓
- GSPR mappings ✓
- Post-market documents (create/update/validate/approve/supersede) ✓
- 510(k) workflow (transition/preflight/transmit) ✓
- Predicate intelligence proxy (candidate status, SE matrix) ✓
- Regulatory correspondence (ingest) ✓
- Authoring section save (dual-write) ✓
- Vault upload ✓
- Reviewer simulation ✓
- Tenant export + attestation ✓

Cross-cutting test
`server/__tests__/security/audit-trail-contract.test.ts` is the
regression net.

Only `correspondence.response.compile` remains ✗ — gated on Claude
Design brief #2, will land alongside the surface.

### Tenant-isolation contract — covers Q-Sub, evidence-sufficiency, post-market

Three contract tests verify cross-tenant access is refused on every
verb. Future expansion: regulatory-correspondence, predicate-intel,
510k-workflow. None of these are urgent — the per-route tenant gates
are already in place; the contract tests are the regression net.

### Schema integrity

- Q-Sub migration (`migrations/20260501_q_sub.sql`) matches
  `shared/schema/q-sub.ts` column-for-column. Mirrored to
  `db/migrations/` for the bash runner.
- All referenced tables exist (`regulatory_programs`, `q_submissions`,
  `q_sub_questions`, `q_sub_commitments`, `q_sub_meetings`,
  `q_sub_timeline_entries`, `cerv2_510k_sections`,
  `evidence_sufficiency_assessments`, `post_market_documents`,
  `gspr_program_mappings`, `audit_events`, `audit_logs`,
  `electronic_signatures`).

### Route mounts

All BETA-introduced routes mounted in `server/bootstrap/`:

- `/api/q-sub` → `register-document-routes.ts` line 200
- `/api/_ops/predicate-intelligence` → line 205
- `/api/tenant-export` → line 210

No double-mount conflicts.

## Tests added/updated this pass

- `section-pull.test.ts` — new tests for the `'3'` ↔ `'3.0'` resolution.
- `q-sub.test.ts` — new test asserting non-uuid `programId` returns 422;
  fixture ids updated to real uuids.
- `audit-trail-contract.test.ts` — fixture programId updated.
- `tenant-isolation-q-sub.contract.test.ts` — fixture ids updated to
  uuid shape with explanatory comment.

## What's still open after this pass

None of these gate BETA — they're follow-up items.

1. **`correspondence.response.compile` audit row** — gated on Claude
   Design brief #2.
2. **UI live-wire of all 11 MDX surfaces** — gated on Claude Code stream.
3. **Operations dashboard widget for chain-verify reports** — frontend
   gated on Claude Design.
4. **HSM/KMS-backed attestation signing** — explicit GA-track item.
5. **`commitment.dossierLink.sectionId` UI type widening to
   `string | number`** — UI-side, deferred.
6. **Tenant-isolation contract test expansion** to regulatory-
   correspondence, predicate-intel, 510k-workflow — backend-side, low
   priority since per-route tenant gates already verified.

## Verification I could not run in this environment

- `npm test` — no `node_modules` in this environment.
- `npm run typecheck` — same.
- `npm run audit:archive` against a live DB.
- `npm run audit:verify:24h` against a live DB.
- The Q-Sub migration applied to a real Postgres.

The fixes in this pass are correct by inspection but should be
verified by CI on the merge commit `65cadb3` plus this audit-pass
commit.
