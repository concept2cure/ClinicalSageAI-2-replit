# Reuse saved source references in the existing editor

W1 / D2; canonical `concept2cure-v2`; initial source `e62320e0a`.
The [contract](../../../../design/SAVED_ASSEMBLY_SOURCES_2026-10-18.md)
extends the existing build disclosure and source reader. No new editor,
stylesheet, schema, dependency, provider or deployment.

The confirmed starting gap: document-level source intent was persisted by a
source-based build, but a remounted editor offered no verified way to reuse it.
The general audit rail is capped and does not establish current source access.

**Check saved sources** is an explicit read. **Use saved sources** rechecks the
same saved record and selects its source identities only in a clean editable
context with the draft review closed. Another explicit preview is required.
New catalogue selections, edited buffers, retained reviews and unresolved
write outcomes take precedence. No candidate or old build plan is reconstructed.

## Qualification

- [Backend](backend/README.md): 89/89 signed-JWT HTTP/PGlite cases: 27 new saved
  reference cases, 48 existing assembly cases and 14 selected-source AnA cases.
  The first missing-feature response was 404; the verified all-preserved read
  now returns the exact recorded manifest. GETs execute no writes.
- [Independent SQL review](backend-review/README.md): 16/16 scenarios using the
  exact production candidate-ordering CTE, including numeric order, orphan or
  duplicate records, damaged source markers and foreign tenants. This separately
  qualifies ordering SQL, not the route, ACLs or native concurrency.
- [Orchestration](orchestration/README.md): 60/60 cases, including 36 new lifecycle
  and transport checks. New helper/UI files have zero lint errors or warnings;
  Workbench retains its 13 pre-existing warnings.
- [Independent editor](independent/README.md): 12/12 actual Workbench flows with
  synthetic HTTP, including reopen, explicit read versus reuse, fresh preview in
  both build modes, source/actor/project changes and preserved manual review.
- [Browser](browser/README.md): 10/10 cases across desktop/touch, light/dark and
  both build modes; historical references remain distinct from active selection.
  Closed/reopened retained reviews preserve edited body and reason. Read-only
  inspection and changed-record refusal pass. Wheel navigation reaches the last
  source and returns to the existing action. No console/page errors occurred.
- [Final production build](release/publish-sync/build.json),
  [zero-error official compiler](release/publish-sync/typecheck.json) and
  [nine editor/design/security gates](release/publish-sync/static-gates.json)
  passed on the integrated canonical base.
- [Initial combined root replay](release/integration.json): 296/296 across 16 files,
  covering the new response boundary, controller, actual editor and HTTP reads,
  existing source entry/build/import/acceptance and incoming batch scheduling.
- [Final combined root replay](release/publish-sync/integration.json): 353/353
  across 20 files, adding the incoming project-schedule route, AnA reason,
  preservation and transaction suites. The source pins remained unchanged
  throughout both replays, builds and compiler runs.
- [Final warning ratchet](release/publish-sync/warning-ratchet.json) reports
  no changed per-file warning counts across the 21 changed lintable product,
  test and retained fixture files. No compiler or warning baseline was increased.

Counts above overlap and must not be summed as distinct tests. Each packet
retains original missing-feature failures, fixture corrections, exact source
pins, logs and scope limits. No earlier failures are relabeled as passes.
The [root checks index](release/checks.json) records current source bindings
and the separate automated and unrun human-testing scopes.

Canonical advanced through the disjoint batch-concurrency validation changes
from `e62320e0a` to `61a14c5d9` before root checks. Source references use the
existing section-draft source resolver; the batch scheduling changes introduce
no second source reader or editor. The root test run includes both incoming
concurrency suites. It then advanced to `aad0eb124` through
[reviewed project-schedule changes](release/publish-sync/incoming-review.json),
without a collision in the editor or its source, access and audit contracts.
The final compiler, build, gates and 353-case replay ran after that fast-forward.
Root receipts qualify the final integrated bytes; owner receipts identify their
exact pre/post source pins, which [still match](release/publish-sync/owner-pins.json).
The last fast-forward to `6d919391e` changed only the two automated repository
health reports; all qualified source and configuration bytes stayed unchanged.

The [local guide](../../../../testing/CODESPACES_EDITOR_HUMAN_TESTING_2026-10-14.md)
now has 37 human cases, all **Not run**. Live providers, native PostgreSQL
concurrency/RLS, exports, deployment and agency transmission are not qualified
by synthetic client or PGlite checks.

The saved-record check verifies the selected trail/payload, local sequenced
envelope/link and current source/document/project admission. It is neither a
whole tenant-chain walk nor a serializable cross-table snapshot. Read checkpoints
cover the qualified late-change seams; access can change after a response.
Explicit reuse, fresh preview and later commit/generation/acceptance each retain
their separate current checks. The stored selection remains historical intent,
not evidence of scientific support or filing suitability.
