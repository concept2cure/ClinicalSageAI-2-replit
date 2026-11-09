# S12: one native source that cannot be verified no longer takes a section's Sources list down

**Package:** S12 (`clinical-regulatory-evidence/**`), with the rail's label in D4's editor (lines named to the
coordinating session first). **Ruling:** the coordinating session, 2026-11-09. **Plan:** S12, and D4 for the
editor. **Session:** `session_01FTWcmXm7At3ZXBE5VWn6oS`.

## What was found

On the local demo stack, every C2C-101 section's `GET /api/authoring/sections/:sectionId/sources` answered
503 `NATIVE_SOURCE_ACCESS_UNAVAILABLE` (`route-before.log`). The editor's Sources rail said "Couldn't load this
section's sources" on every section of the demo project.

**The cause** was found by logging it once on the running stack; the logging was then reverted. It is Postgres
**25006, `cannot execute SELECT FOR SHARE in a read-only transaction`**:

- `authoring.router.ts:2833` opens `BEGIN READ ONLY`, then calls `listSectionSources`.
- That calls `getCurrentReadableSourceScope`, which admits **every** source in the organization, not only the
  section's.
- A native Quality source's admission goes through `readQualityProjectEvidence`, then `canReadDocument`, then
  `authorizeQmsContentRead`, then `authorizeAuthoringProgram`.
- There, `currentRole` (`authoring/authoring-program-access.ts:31`) always takes `FOR SHARE OF ou, u, o`.
- Inside READ ONLY that lock is refused. The refusal is wrapped three times into the generic 503, and nothing logs it.

**That defect is not S12's.** It is reported to the coordinating session for the Quality or Authoring owner, with two
options:

- `currentRole` locks only when asked to hold, as `vault/document-catalog-admission.ts:34` does. This is the one
  recommended.
- The route drops `READ ONLY`.

## What changed (the ruling for S12)

The ruling: one native source that cannot be verified must not take down the section's list. That source is listed,
marked, with its reason code. It is never dropped silently and never used. The other sources are listed normally.

- **`source-read-access.ts`** gains an opt-in report mode, `getCurrentReadableSourceScope({ …, unverified: 'report' })`.
  It applies only to an evaluated list, on a caller-owned transaction.
  - Each native-origin source is admitted under a `SAVEPOINT`. A failed admission can abort the transaction, as the
    lock did, so the savepoint is rolled back, and the rest of the read continues.
  - A native source whose admission fails with a 503 or `NATIVE_SOURCE_CHANGED` is reported as `{ id, code }`. It is
    never admitted.
  - A denied or missing source is still omitted, as before, without disclosing it.
  - Without the option, nothing changes. The catalogue, search, citing and drafting still fail closed. The existing
    case "failed native verification still refuses the catalogue" passes.
- **`source-usage.service.ts` `listSectionSources`** uses report mode. A citation whose source was reported is listed
  with `state: 'unverifiable'` and `reasonCode`, and its source details are withheld (`source: null`) (`source-usage-projection.ts` `adaptSectionUsage`, beside the row adapter, so the service stays inside its line limit). The new state is
  documented on `UsageState`.
- **`editor/DocumentWorkbench.tsx` (D4)**, at the two places named to the coordinating session:
  - the `SectionSource` state union gains `'unverifiable'` and `reasonCode`;
  - `sourceStateLabel` gains a case: "Source could not be verified" (warn), with the hint "This source's current record
    could not be verified (<code>), so it is not used for drafting or citing. The citation remains recorded; nothing
    has been rewritten."

  The row already handles a null source.

## Red first

- **The service.** `__tests__/section-sources-unverifiable-native.pglite.test.ts` captures the native source through
  the real catalogue. It reads as the route does, inside `BEGIN READ ONLY` on one client. The failing verification
  takes a `FOR SHARE`, which aborts that transaction, as on the demo stack. Its three cases:
  1. One plain source and one native source that cannot be verified. The plain one is listed `current`. The native one
     is listed `unverifiable` with `NATIVE_SOURCE_ACCESS_UNAVAILABLE`, `source: null`, and no title or text.
  2. When the native source verifies, both are listed normally.
  3. A denied native source is still omitted (`unresolved`), never shown as unverifiable.

  On trunk's service, case 1 fails because the whole read is refused (`tests-red.log`). With the change, all three
  pass (`tests.log`). With the savepoint removed, case 1 fails: the aborted transaction then fails the program check
  (`mutations.log`).
- **The rail.** `__tests__/documentAuthoringSourcesRail.test.tsx` gains one case: an unverifiable citation beside a
  current one shows "Source could not be verified", with the reason in its hint, and the current one normally. It
  fails on trunk's editor and passes with the change, with all 15 passing (`ui-red.log`, `ui.log`).

## In the running app

- **The route.** On the restarted stack, before: section 2.5.3 and section 2.3 each answered 503
  (`route-before.log`). After: each answers 200. Section 2.3 lists its seven data-room citations, two current and
  five replaced since cited, and 2.5.3 lists none (`route-after.log`). The native source that fails is not cited by
  these sections, so with the change it simply no longer takes their lists down.
- **The rail.** `walk.cjs` opens "2.3 · Quality Overall Summary", section 2.3, and the Sources rail at 1440 light.
  The section's sources read answers 200, and the rail lists its citations with their states
  (`sources-rail-2.3-1440-light.png`).

## After fix (a) (the coordinating session's `37f520f3be`)

The coordinating session fixed the cause in the authoring lane: `currentRole` locks only for a write, and the 503
logs its cause. It landed at 04:28 UTC, before this change was pushed (`1696fca99` sits on top of it).

- **The test case still holds after (a).** Its failure is driven by the stubbed Quality reader, which aborts the
  caller's transaction with a statement and then rejects. It does not depend on `currentRole`'s lock. The test's
  comment now says so.
- **Running app, on trunk with both changes:**
  - section 2.5.3 answers 200 with no citations, and section 2.3 answers 200 with its seven (`route-after-fix-a.log`);
  - the server log has no `PROJECT_ACCESS_UNAVAILABLE`;
  - the rail walk passes again (`walk-after-fix-a.log`).

  With (a), C2C-101's native Quality source verifies again. This change's report mode keeps the list alive for the
  next native source that genuinely cannot be verified.

## After: the harness applies the files that alter its tables (2026-11-09)

The coordinating session found `test:proof-tier` red on trunk. `tests/schema-contract/authoring-migration-list-closure.contract.test.ts`
named this change's suite, `section-sources-unverifiable-native.pglite.test.ts`:

- it built `authoring_comments`, `user_pins` and `doc_revisions` without applying
  `db/migrations/20260730_authoring_comments_router_columns.sql` and
  `db/migrations/20260817_doc_revisions_immutable_ledger.sql`, which alter them;
- so the suite proved nothing against the shape those tables have in production.

The suite now applies both, right after the loop tables, as `vault-citation-changes.pglite.integration.test.ts`
does. Before the fix, the contract fails on that suite (`closure-red.log`). With it, the contract and the suite pass,
7 cases (`closure.log`).
