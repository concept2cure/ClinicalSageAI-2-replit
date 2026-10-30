# Exact agency-response source intake

## What already exists

`authoring-source-import.ts` and `workflow-source-import.ts` own admitted saved-source snapshots, fingerprint validation, exact edited-copy reuse and canonical Authoring creation/provenance. `shared/authoring/source-import.ts` currently has no agency-response kind. `response-service.ts` owns letter/questions/answer versions. Parent extracts the one existing communication visibility policy into a shared service; no second policy or response writer is introduced. Existing source-intake and provenance parsers must recognize the new exact source identity.

The source adapter reads the current DB actor/project and visible exact target-project letter before one bounded exact-question read. Two editable sections retain question context and answer separately; only the answer is intended for explicit parent-owned writeback. Approvals/signatures are not transferred; authorship/model qualification remain unknown. Closed/withdrawn sources refuse. No schema, model, provider or standalone editor.

Deleted-history searches are retained. Actual prepatch HTTP failures and source pins precede production changes. This fixture uses real HTTP/JWT, PGlite/current Authoring admission/writers and minimal read-only agency source tables, not a live provider or deployed database/RLS proof.

## Exact source and editor door

The new selector is `{kind:'agency-response',eventId,questionId}`. Source materialization uses current database membership/role, canonical program/project admission and the existing shared letter-visibility policy before reading the exact question. The fingerprint binds the letter identity/state, question/limits, actual answer text/revision and exact source/target scope. Empty answers are editable. Source text is escaped, unknown original authorship is retained, and no approval/signature is adopted. Existing reserve/reuse/create, immutable CREATE provenance and saved clause lineage remain authoritative.

`agency.context` and `agency.response` are shared section constants. The existing dialog accepts an optional `initialSectionCode`, validated against actual returned saved sections. This door can prefer the answer section; users can still explicitly choose question context. Other callers retain their first-section default.

## Retained observations

- `red.json`: actual prepatch HTTP intake, 7 failed / 1 passed, no drift. Positive preview/create paths received400 because the existing selector did not support agency responses. Other expected refusal statuses stopped at that same selector boundary; they are not separate content-leak demonstrations.
- `green.json`: 31 passed / 1 failed; the fixture incorrectly expected201 for an existing edited-copy reuse. `green-calibration.json` records the correction to canonical200. `corrected-green.json` then passed35/35. Later client exact-identity coverage passed36/36 in `final-green.json` and `qualified-green.json`; these are overlapping epochs, not additional independent tests.
- `response-door-red.json`: actual context-first/response-second result ignored the requested response section (1 failed / 1 passed / 14 skipped, no drift). Explicitly selecting context already worked.
- `response-door-green.json`: 37/37 across the actual HTTP/PGlite source suite and two existing client dialog suites, no drift. This covers exact event/question identity, current visibility before question content reads, malformed selectors, foreign project/organization, revoked current actor, closed/withdrawn state, empty answers, preserved real PATCH edits/reuse, source drift and explicit fresh-copy creation. It also covers preferred response opening and later explicit context selection.

Every run receipt records its exact argv, Node22 version, scoped source SHA-256 before/after, raw gzip hash and summary. The initial deleted-history output was empty for the searched scoped paths; the lead's wider Rule3 discovery remains authoritative. No dependency, schema, standalone editor, source-response writer, provider call or deployment was added by this intake slice.

`bridge-qualification.json` is the final combined observation: 49/49 across four distinct source, writeback and client suites, no drift. It includes actual questions HTTP readback and response-package409 for the saved, changed, unapproved answer. This final run subsumes the earlier37/37 and12/12 epochs. `bridge-lint.json` pins the final scoped lint; details retain the existing `writeHandoffStage` complexity warning separately from changed functions.

`bridge-lint-summary.json` reports zero errors and one existing warning across12 scoped files. Earlier lint details retain newly found adapter complexity and an oversized test grouping; the implementation was split into bounded helpers and the new agency case was given its own describe block, without changing lint rules/baselines. The unchanged `writeHandoffStage` function hash matches the first captured production epoch; original branch diff confirmation belongs to the lead.

The later corrective slice in `../machine-retention/README.md` supersedes the initial all-unknown response-origin behavior. It verifies canonical response revision/action/audit receipts, preserves positively known AnA origin through fresh copies and retained legacy amendments, and fails closed for unverifiable history. Original unknown source authorship remains unknown; the deterministic import sentinel is never treated as model origin.
