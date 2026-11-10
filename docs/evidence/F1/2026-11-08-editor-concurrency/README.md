# Ordinary editor save: atomic section version check

Scope: **F1 / W1 / D2**, completing `server/routes/authoring.router.ts`'s existing
ordinary `PATCH /api/authoring/sections/:sectionId`. Inventory written before
production edits on 2026-11-08, against canonical source
`f9631c065af8760d8b879232385fb94663d19a24`.

## What already exists

| Existing path | Current behavior | Limit being repaired or retained |
| --- | --- | --- |
| `server/routes/authoring.router.ts` | Ordinary PATCH authenticates and authorizes, reads the section, checks an optional `expectedUpdatedAt`, validates governed content/reason/machine claims, then commits content, lineage, revision, filing and audit on one transaction client. | The timestamp comparison precedes `BEGIN`. Two overlapping requests can both pass it; the later parent/section lock does not repeat the version check. The audit before-image also comes from the pre-transaction read. |
| `server/services/authoring/document-lock.ts` | `reserveWritableSection` resolves the immutable parent, reserves it `FOR UPDATE`, refuses a sealed document, and touches its MVCC version before child writes. | This is the existing serialization boundary; no second lock service is needed. The ordinary save must read its authoritative section version after this reservation. |
| `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx` | `saveSectionContent` sends the loaded `updated_at` when present and adopts the returned row after success; failures retain the edited content and machine contribution claims. Rename and track-changes PATCHes omit the token. | Preserve the content-save conflict envelope. Track changes merges only the mode, leaving the editor's timestamp stale after its own metadata save. The lead subsequently assigned the narrow token send/adoption repair described below. |
| `client/src/concept2cure/v2/editor/authoringRefileSavedTextState.ts` and `server/services/authoring/authoring-refile-saved-section.ts` | Re-filing saved text supplies an expected timestamp through `filingOnly`; the route dispatcher sends it to its existing dedicated writer. | This is a different operation and remains unchanged. |
| `scripts/demo/launch-demo/lib.mjs` | The existing demonstration fixture writes ordinary section content without `expectedUpdatedAt`. | Omitted-token compatibility has a real caller; the repair must not silently require the token for every PATCH. Absence cannot prove that an editor loaded the latest text. |
| `server/routes/__tests__/authoring-atomic-mutations.test.ts` | Real HTTP router with mocked database dependencies checks that ordinary saves, freezes and signatures enlist their writes in a transaction and roll back a failed write. | Existing ordinary-save cases do not interleave a stale pre-read with a changed locked row. Extend this test home for the race, malformed-token policy and authoritative audit before-images. |
| `tests/db/authoring-section-concurrency.dbtest.ts` | Real PostgreSQL/router suite tests sequential stale/current saves and explicit omitted-token compatibility. | Its sequential saves do not expose the check-before-lock race. Extend the same home with two independently blocked requests, real lock observation, one winner and one conflict. Correct its obsolete claim that MDX uses this route. |
| `vitest.db.config.ts`, `tests/setup.db.ts` | Native suites exclude the process-wide `pg` mock, require a real disposable database, and fail rather than silently skip missing connectivity. | Native execution depends on the lead provisioning the database and dependencies; mocked results are not native proof. |
| `db/migrations/20260725_authoring_document_loop_tables.sql` and related authoring migrations | The existing section row has an `updated_at` timestamp, returned by current reads. | PostgreSQL can keep finer precision than a JavaScript `Date`. The ordinary save must advance its observable millisecond token even if saves occur in one millisecond or transaction start time predates a lock wait. No schema change is proposed. |

Inventory used `rg` over `client/src`, `server/api`, `server/routes`,
`server/services`, `shared/schema*`, `migrations`, `db/migrations` and `scripts`
for `authoring/sections/`, `expectedUpdatedAt`, `SECTION_CHANGED`,
`reserveWritableSection`, `reserveWritableDocument` and related test names.
Production-call searches excluded tests, fixtures, generated output and retired
code. The MDX drawer actually writes `/api/c2c/documents/:id/sections/:key`; it
is not an ordinary authoring-PATCH caller.

Deletion search: `git rev-parse --is-shallow-repository` returned `false`.
`git log --all --diff-filter=D -n 30` over the ordinary router, its authoring
test homes, authoring concurrency helpers and editor save-named files returned
no deletions. This was a bounded path search, not a repository-wide claim.

The root instructions and coordination holds were read. F1 is open with `**`
paths. Held AI draft/accept code, draft controls, saved-refresh/dirty-version
handoff code and all other workstreams remain untouched.

The lead explicitly approved a narrow additional client hunk before edits:
track-changes PATCH sends its loaded token when present; a successful metadata
response advances only the timestamp and only if the local section still has
the same token sent by that request. No returned content is adopted. Blindly
adopting a newer metadata timestamp without sending a version would bless
unseen concurrent content, so sending the token and conditional adoption are
one repair. This does not touch the held dirty/save-refresh mechanisms.
`client/src/concept2cure/v2/editor/__tests__/workbenchTrackChangesVersion.test.tsx`
exercises this existing callback through the real Workbench and TipTap canvas.

## Repair contract

1. An omitted `expectedUpdatedAt` remains supported, including existing content
   fixture writes and metadata PATCHes. These writes are explicitly not proof
   that the caller read the current section; full stale-editor protection
   requires a token.
2. A supplied token must be a non-empty parseable timestamp string. Null,
   non-string, blank and invalid timestamps are rejected before a transaction;
   they cannot silently turn a protected save into an unconditional one.
3. A valid token is compared with the current section version while holding
   both the existing parent reservation and the section row lock. A mismatch
   returns the existing HTTP 409 `error.code: SECTION_CHANGED` shape and rolls
   back the parent touch without content/revision/lineage/filing/audit writes.
4. Successful writes retain the existing transaction and governance gates. The
   audit before-image comes from the locked section, including when a legacy
   caller deliberately omits the token.
5. Every ordinary save advances `updated_at` by at least one observable
   millisecond from its locked predecessor. `NOW()` alone is transaction-start
   time and cannot establish this property after a wait.

## Verification status

The repair and component checks are complete in this checkout. No prior
checkout, unpublished commit or test receipt is treated as present.

| Check | Observed result | Retained log |
| --- | --- | --- |
| Atomic mutation regression against unchanged server source | 11 failed, 8 passed. A post-read version change returned 200; invalid supplied tokens were ignored; the audit before-image came from the stale read; a vanished locked row was still written. | `unit-red.log` |
| Same atomic suite after the repair | 19 passed. Existing freeze/sign/revert atomicity cases remain green. | `unit-green.log` |
| Real Workbench/TipTap track-changes regression before the client hunk | 1 failed, 2 passed. The metadata PATCH omitted the loaded token. | `client-red.log` |
| Same Workbench/TipTap suite after the hunk | 3 passed: toggle then content save, stale-toggle refusal preserving text/token, delayed older metadata response after a newer content save. | `client-green.log` |
| Existing content/filing/audit, machine-attribution, binding and figure suites | 83 passed across four suites. | `adjacent-green.log` |
| Whitespace check on assigned paths | `git diff --check` passed. | Command exit 0 |
| Real PostgreSQL overlap and timestamp regression | 6 passed on native PostgreSQL 17.7 using app_service with RLS on. Two real connections queued behind the same parent lock; one saved and the other conflicted, leaving one revision/audit. Timestamp monotonicity passed. | `native.log` |

Commands were run with Node 22 from
`/workspace/scratch/3002d574f952/node22-runtime/node_modules/node/bin` first on
`PATH`. The component commands were:

```sh
node node_modules/vitest/vitest.mjs run --config vitest.config.ts server/routes/__tests__/authoring-atomic-mutations.test.ts
node node_modules/vitest/vitest.mjs run --config vitest.config.ts client/src/concept2cure/v2/editor/__tests__/workbenchTrackChangesVersion.test.tsx
node node_modules/vitest/vitest.mjs run --config vitest.config.ts server/routes/__tests__/authoringWritesBoundAndAudited.pglite.integration.test.ts server/routes/__tests__/authoring-save-governed-write.pglite.test.ts server/routes/__tests__/authoringBindingColumnStates.test.ts server/routes/__tests__/authoring-section-figure-refs.test.ts
```

Native command for the lead (with the existing disposable database variables
set in the same process tree as PostgreSQL):

```sh
node node_modules/vitest/vitest.mjs run --config vitest.db.config.ts tests/db/authoring-section-concurrency.dbtest.ts
```

## Source anchors and limits

- `server/routes/authoring.router.ts`: ordinary PATCH token validation and
  conflict response around 1642; timestamp advance around 1806; locked current
  row and atomic version check around 1886–1906; lineage and audit use that
  row's content/metadata around 1923, 2005 and 2036. No held AI draft/accept
  code changed.
- `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx`: only
  `toggleTrackChanges` around 3604–3654 changed. No held save/refresh/dirty-version
  mechanism changed, and no source text is adopted from a metadata response.
- The existing native test now observes two real queued writer connections
  before releasing the parent lock, requires one HTTP 200 and one HTTP 409,
  checks the winning text and exactly one additional revision/audit, and
  separately injects a future timestamp into the isolated QA row to verify
  monotonic visible tokens. It does not rewrite governed content or old
  history to manufacture a passing result.
- Compatibility for omitted tokens remains an explicit limitation: a caller
  that supplies no version still makes an unconditional save. The existing
  shared editor's content save sends its version, and the repaired track-change
  toggle now does too when one was loaded.
- The monotonic timestamp change applies to this ordinary PATCH. Other writer
  routes were not expanded or silently qualified by these tests.
- Full compiler, repository verification, hooks, build, native execution and
  publication remain the lead's work. The client checks are component evidence,
  not a claim that the running app was opened or an end-to-end collaborative
  CSR/filing scenario was qualified.
