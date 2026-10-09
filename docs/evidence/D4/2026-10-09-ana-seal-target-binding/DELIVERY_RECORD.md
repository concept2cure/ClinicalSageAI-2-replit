# AnA persisted seal-target binding — W3 / D4

Canonical branch: concept2cure-v2. User handoff: 4eda1a3dddbd5b14d360fa4ae939426187b666cb. Remote base: b9a87ab1704b5a59e1293070748b3e99c940d5c1. This delivery also retains the previously completed verification-scope repair and its evidence; it had remained local after the prior handoff. No UI changes.

## Delivered behavior

Every supplied artifact identifier now resolves against the requesting tenant and owned project. When both PK and external ID are supplied, both must identify the same row. The project is checked through the canonical projectBelongsToTenant helper inside the seal transaction. An explicit missing, foreign or conflicting selector is refused; it cannot silently create a substitute artifact.

Every supplied version ID or number resolves against the selected artifact and organization. Supplied selector pairs must agree. The returned version comes from the stored row. The stored version text must exactly equal the submitted text, and its stored SHA-256 must match the freshly computed submitted-content hash. Missing, corrupt or stale hashes refuse.

The artifact is locked FOR UPDATE; the version is locked FOR SHARE for the seal transaction. Current artifact text must also match the submitted bytes before any writes. Source lineage is artifact-level today: sealing different historical bytes previously retired valid current-head sources and rewrote attribution. The new guard preserves those sources on both the existing-version and omitted-version paths. Historical versions whose bytes still equal the head are not rejected merely because their number differs.

Malformed selectors and unanchored version selectors are refused before acquiring the sealing pool. IDs/version/context are bounded to positive PostgreSQL integers. The HTTP handler preserves explicitly supplied malformed values for the central validation instead of dropping them and accidentally requesting fallback creation. Signer authority, re-authentication, feature gate, verification scope, sample/manifestation checks and atomic signature/provenance/audit persistence remain in place.

## Qualification and evidence

- Natural fail-first persisted-target suite: 78 failed and 8 passed before production edits (86 tests). A subsequent one-case addition and canonical uniqueness constraint are recorded in the final suite.
- Natural fail-first HTTP cases: 12 failed and 17 passed before target forwarding/validation edits.
- PostgreSQL integer-bound defect: 6 failed before the range check, with 87 unrelated cases intentionally excluded by the focused selector.
- Current-head source-lineage defect: both selected-version and omitted-version regressions failed before the guard. They seed a real live source span over the current text and compare all six governed tables before/after refusal.
- Final focused actual service/HTTP/unit selection: 138 passed. PGlite verifies persisted target binding and complete unchanged row state after refusal. HTTP signer/authority checks use fixtures.
- Broader AnA/IND/authoring/signing/project selection: 959 passed across 43 selected files, 0 failed/skipped, in 68.401 seconds. This is selected coverage, not the complete repository suite.
- Production build passed in 20.481 seconds on the final production bytes.
- Forced lint: 0 errors; no added warnings. Existing route and service each retain two warnings; modified tests have zero. A final test-only compacting change removed an over-500-line warning; that entire 95-case PGlite file passed again afterward. Production bytes did not change.

The full unchanged pre-push gate passed in 63.897 seconds. TypeScript reported 0 errors with tsc exit 0. The actual compiler/gate results are recorded in prepush.txt and prepush-summary.json. Native incremental-cache preparation does not establish the typecheck verdict. Commands, full results, selected paths, source pins and independent review are retained alongside this record. Normal pre-commit security checks passed. The client tree remains f4a50c306387585250e354c68e08a099362e3823.

## Limits and immediate follow-up

This repair binds the seal target/content and preserves declared verification limits; it does not authenticate scientific source qualification. The compatibility ok-only verification input is still caller-supplied. DOCX expected-text copying fidelity is not evidence review. The concrete next step reuses immutable AnA turn records and server-loaded persisted target hashes; see NEXT_STEP.md.

When no persisted selectors are supplied, the existing fallback remains, now behind owned-project validation. A selected artifact with no supplied version retains the existing version-1 insertion behavior; duplicate existing version 1 can fail rather than allocating a new number. Historical content differing from the current artifact is now refused because version-specific lineage is not supported here. No source qualification, model PQ, clinical SME evaluation, live signer/RLS qualification, regulator acceptance or production deployment is established by these tests. PGlite does not prove multi-connection PostgreSQL locking behavior.

Full IND hierarchy/content, applicability, therapeutic/modality depth and regulatory temporal qualification remain open in ANA_IND_COVERAGE_PLAN.md. These are not solved by increasing test or template counts.

Prior remote CI for 4eda1a3d remains unresolved: Tier 5 browser smoke failed during schema provisioning and Semgrep reported five blocking findings. Links/details are retained in the preceding ana-seal-verification-scope/PRIOR_REMOTE_CI.json. Local gates must not be described as remote CI success or commercial readiness. Remote checks for this publication are inspected and reported separately.
