# A read's project-access check takes no row locks, so the editor's Sources rail reads inside READ ONLY (F1, 2026-11-09)

**Found by** the project-page session (S12, `01FTWcmX…`) on the seeded demo stack. `GET
/api/authoring/sections/:sectionId/sources` answered 503 `NATIVE_SOURCE_ACCESS_UNAVAILABLE` for every section of
C2C-101, so the editor's Sources rail said "Couldn't load this section's sources". S12 caught the hidden error once with
temporary logging:

> Postgres **25006** `cannot execute SELECT FOR SHARE in a read-only transaction`

## What already exists (RULE 3), and the chain

1. **The route opens a read-only transaction.** `authoring.router.ts` opens `BEGIN READ ONLY` for the sources list
   and calls `listSectionSources`.
2. **It admits native Quality sources.** `record-source.ts` `createNativeRecordAdmission` calls
   `readQualityProjectEvidence`. That calls `canReadDocument` and then `authorizeQmsContentRead`
   (`qms/controlled-document-content.ts`), which calls `authorizeAuthoringProgram(…, { forWrite: false })`.
3. **The role read locks unconditionally.** `authoring-program-access.ts` `currentRole` always ran `… FOR SHARE OF ou,
   u, o`. Its `forWrite` flag changed only the role check, not the lock.
4. **Every other lock on this path is already conditional.**
   - `canAccessReportProject` locks only when `forWrite`.
   - `programInOrganization` locks only when `forShare` or `forUpdate`.
   - `readProgramAnchorRow` takes no lock.
5. **Three wrappers each hid the cause.**
   - `authorizeAuthoringProgram` turned the refusal into 503 `PROJECT_ACCESS_UNAVAILABLE`.
   - `QmsContentRefusedError` passed it on.
   - `nativeAdmissionFailure` turned it into the generic 503.

   None of them logged anything.

**Effect.** Any project with a Quality controlled document bound to an authored document had a dead Sources rail.

## The change

**The lock.** `currentRole` takes `FOR SHARE OF ou, u, o` only for a write. That is `forWrite`, which is `true` unless
a caller says otherwise, so every existing writer still holds what it decided on. A read takes no locks: it has
nothing to hold, and in READ ONLY Postgres refuses any lock. This is the same gating the Vault's catalogue admission
applies (`document-catalog-admission.ts`, `hold`). The two statements are separate literals, so nothing is
interpolated into SQL (`ci:sql-interpolation` OK).

**The log.** `authorizeAuthoringProgram`'s 503 now logs its cause server-side: program, tenant, `forWrite`, the
database code and the message. The person still sees only "could not be verified"; the response body carries no
error text. The next refusal of this kind is seen in the log, not found by luck.

## Verified by making it fail

`server/services/authoring/__tests__/authoring-program-access.pglite.test.ts` runs on real Postgres (PGlite) and adds
four cases inside `BEGIN READ ONLY`:
- the owner, a use member and a pending reviewer are each admitted to read;
- a write is still refused there. It still asks for its lock and is never admitted unlocked.

| File | What it shows |
|---|---|
| `red-at-head.txt` | Before the change the three read cases fail. Each is rejected with 503 `PROJECT_ACCESS_UNAVAILABLE`, as on the demo stack. The write case and the nine existing cases pass. |
| `green.txt` | After the change: 13 of 13. |

**Every suite that touches program access, Quality evidence, record sources or section sources** (41 files, 500
cases), plus the nine whose fakes match the `FOR SHARE OF ou` text (145 cases), runs with no change in results.
- The only failures are PDF exports, which fail the same way before the change because the PDF fonts are missing in
  this container:
  - `quality-evidence-report`: 2 cases;
  - `report-os-audit-recording`: 7 cases.

**What it leaves to S12.** One source that cannot be verified must not take the section's whole list down. That part
is in S12's lane and lands on top of this one.
