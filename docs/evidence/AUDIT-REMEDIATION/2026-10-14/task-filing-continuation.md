# Exact native filing handoff — F07 continuation

This completes the remaining F07 navigation gap within the existing Task Board and Submission Center. A tracked filing opens its actual native record, with its integer project and UUID programme kept separate. No table, dependency, grant, editing capability, standalone device workbench or agency transaction was added.

## Corrected canonical relationship

Native verification exposed a defect in the earlier remedy: `regulatory_programs.project_anchor_id` does not exist in the deployed schema. Its old PGlite fixture invented that column. That fixture's successful owner-mapping assertion is withdrawn as deployed-schema evidence, and its definition has been corrected.

The actual bridge is `projects.regulatory_program_id → regulatory_programs.id`. The existing `loadTaskHomePrograms` now reads that bridge on the request connection, checks both tenant columns and the live programme, then reuses `readProgramAnchorRow(..., requireUnique: true)` to refuse damaged duplicate anchors. A second anchor outside the requested subset still makes the result unavailable. No migration adds the phantom column. The unrelated notification fixture also had an unused phantom column removed; its real canonical project bridge remains.

## Read API and authority

`GET /api/task-management/filings/:filingId` returns `{ success: true, data: { filing, home } }`.

- `filing` contains the exact saved native UUID, catalogue/type/variant, title, status, decision, FDA tracking number, filed/review dates, stored artifact document ID and digest, notes and timestamps.
- `home` contains `source: filing`, the same `nativeId`, actual integer `projectId`, and a unique live `programId` UUID and programme title when available. It contains no canonical submission or sequence identity.

The canonical `getEstarSubmission` accepts the existing request Drizzle executor for this read; its other callers retain their existing default. The handoff rechecks active persisted organization membership and uses the canonical `canAccessReportProject` policy for the actual project. Private ownership, current shares and pending review access retain their existing meanings. A caller gains no access from a task card, URL or supplied programme.

Malformed identifiers return 400. Missing or foreign filings and missing or foreign projects return 404. Current membership or private-project refusals return 403. A database or access verification failure returns typed 503, without a record payload or an invented empty result. Unattached filings, accessible unanchored projects and retained filings under a deleted programme remain readable with a null programme; the current shell programme is preserved.

## UI behavior

Task Board reads the exact authorized record before switching the programme or navigating. It uses the returned UUID rather than stale card metadata. Refusals remain visible in the open task with retry. Closing a task invalidates its pending request, including when that same task is reopened before the old response arrives.

Submission Center accepts `filingId` through the existing one-shot navigation channel or one unambiguous copied query parameter. Same-surface handoffs work. A new channel handoff takes precedence over an old copied URL, and the initial URL does not replay after close or unrelated navigation. Malformed/duplicate identifiers do not trigger a filing read. A new submission form and entered title, an open signature ceremony, and in-flight mutations are preserved; the person is told to finish and retry the link.

The read-only detail performs a fresh exact-ID request, distinguishes loading, missing/refused, expired-session and unavailable states, and retries that UUID. A previous target cannot paint as the next filing or overwrite it after a slow response. Missing artifact bindings remain explicitly absent. Recorded hashes do not claim that this read verified document bytes or an agency receipt. The existing portfolio now has a reachable “Open recorded filing” control, with no integer-to-programme-name lookup.

## Evidence

The first new Task Board handoff suite failed all seven cases before the implementation (`/workspace/audit/task-filing-handoff-before.log`). Its authorized handoff, refusal/retry, malformed response and late-close tests subsequently passed; an additional close/reopen race is now covered. A detail-render negative control removed only the target ID gate and demonstrated the previous record painting before restoration (`/workspace/audit/tracked-filing-detail-red-render-gate.log`). The restored component passes 23 mounted cases.

The combined scoped regression run passed **147 tests in 13 files** (`/workspace/audit/continuation-filing-final-scoped.log`). A subsequent type check identified optional native-ID narrowing and two test fixture typing defects; these were corrected with runtime validation, actual required surface props and a real malformed JSON `Response`. The affected three-file follow-up passed **36 tests** (`/workspace/audit/continuation-filing-type-corrections.log`); these overlap the 147 and are not additional unique cases. Scoped ESLint has zero errors and 20 warnings, comprising large existing components and remaining complexity warnings; no suppression or rule change was added. Scoped whitespace checks pass.

The genuine authenticated native database proof passed **10 tests**; its before/after failure logs are documented in [task-filing-native-proof.md](task-filing-native-proof.md). Native checks use the actual deployed schema and a non-superuser, non-BYPASSRLS application role with FORCE RLS. The existing populated task board is covered as well as the new exact-record endpoint. Notification target callsites use the corrected same helper and have separate native smoke assertions. The program-ownership single-source guard passes. The concurrently executed SQL interpolation guard reported only the separate clinical-adapter workstream, with no finding in the filing source; root owns its final integrated disposition.

Root owns the final integrated type check, build, release checks, browser qualification and report disposition. These scoped proofs do not claim live agency qualification, deferred filing editing, or production deployment.
