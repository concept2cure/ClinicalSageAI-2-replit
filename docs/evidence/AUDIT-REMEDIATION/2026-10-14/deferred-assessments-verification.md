# D02 / D03 saved-assessment workflows — verification, 2026-10-14

Implemented in the current shared `concept2cure-v2` working tree; no commit, push, deployment, new production dependency or migration. BLA and IVD remain outside the launch catalog. The CMC launch remains US small-molecule IND.

## Delivered connections

* `NdaCockpit.tsx` mounts `BlaAssessmentWorkbench.tsx` in its existing BLA tab. Four native forms dispatch entered measurements, subject counts or explicit readiness facts to the existing analytical-similarity, Q5E comparability, immunogenicity and filing-risk engines. A complete-input form supports multiple attributes/arms. Unknown optional facts remain absent. The workbench reopens the actual program-filed saved row, displays its complete input/result snapshot and calls the existing Part 11 signature endpoint for that row.
* `bla-assessment-store.ts` contains the single extracted canonical assessment INSERT. A save requires a real actor, live owned program, title and governed reason. Current persisted active membership and program lead/manager authority are evaluated on its request transaction; save and governed audit commit or roll back together. The BLA sign route verifies the saved program and includes the actual kind, program, scientific input and result in its signed payload. Historical unfiled rows are not automatically assigned or signed.
* `IvdCompleteness.tsx` mounts `IvdAssessmentWorkbench.tsx` even when the completeness board is empty. The IVDR form requires eight explicit intended-purpose answers; the server recomputes the canonical classification and trace. The FSN form uses the existing actual-fact document builder and saves a draft. Neither a supplied verdict nor a requested final/transmitted status establishes a saved governed result.
* `ivd-governed-write.ts` runs the existing assessment/document writers and ledger atomically on the request connection with current program authority. Legacy IVD `save:true` calculator paths now surface save failures and retain their actual inputs, rather than returning successful unsaved results after a requested save fails. Pure previews remain unsaved.
* The exact `ivd-assessment` / `ivd-document` UUID source kinds enter the existing Authoring preview, fingerprint, governed association and create/import flow. `ivd-workflow-source.ts` reads only the actual retained tenant/program snapshot; it checks current private source access, target scope and withdrawal, preserves original unknown authorship/model qualification and metadata, and creates no original-source update. The existing writer returns the actual Authoring document/section identities; an artifact or saved-assessment id is never substituted for an editor document id.
* Source provenance, editor notices and immutable genesis lookup now admit the IVD source kinds accurately. The existing Authoring lifecycle still requires an assigned approved review and current full-copy REVIEWER signature; changed content/source or revoked access remains held. Source approvals and transmitted status do not transfer into the new working draft.
* `/api/ivd-assessments`, `/api/ivd-lifecycle` and `/api/ivd-completeness` are attributed narrowly to the existing deferred IVD surface. The Authoring adapter refuses deferred IVD while launch scope is enforced, before any source read; there is no production catalog activation through the otherwise accessible Authoring endpoint.

## Qualification

Final command: Node 22.23.3, targeted Vitest run of these 14 suites:

1. `client/src/concept2cure/v2/__tests__/deferredAssessmentWorkbenches.test.tsx`
2. `server/services/regulatory/__tests__/deferred-assessment-governance.pglite.test.ts`
3. `server/services/authoring/__tests__/workflow-source-import.pglite.test.ts`
4. `server/routes/__tests__/domain-sign-ceremony.routes.test.ts`
5. `server/routes/__tests__/ivd-assessments.error-envelope.test.ts`
6. `server/routes/biopharma/__tests__/bla-workbench-read.test.ts`
7. `server/services/regulatory/__tests__/ivd-assessments.test.ts`
8. `tests/mdx-ivd-diagnostic-routes.test.ts`
9. `server/services/authoring/__tests__/workflow-import-governance.pglite.test.ts`
10. `client/src/concept2cure/v2/__tests__/authoringHandoff.test.ts`
11. `client/src/concept2cure/v2/__tests__/cmcOverviewCompleteness.test.tsx`
12. `client/src/concept2cure/v2/__tests__/protocolAuditRemediation.test.tsx`
13. `server/services/protocol-development/__tests__/protocol-program-scope.pglite.test.ts`
14. `client/src/concept2cure/v2/editor/__tests__/workflowSourceImport.test.tsx`

**14 suites / 228 tests passed**, started 04:17:06 UTC, duration 29.83 seconds. Log: `/workspace/audit/deferred-final-qualified.log`. This includes source privacy/withdrawal/fingerprint verification, real SQL genesis/adoption checks, native form submission, exact working-copy navigation, current program authority, audit rollback, protected error envelopes and existing Protocol/CMC regressions. The protocol import now honors a newly filed protocol's own program before its first study design and refuses a disagreeing bound-design association.

Three controlled red probes reproduced old behavior, then the files were restored automatically:

* Removing the BLA program-authority check made the foreign-program refusal fail (`deferred-red-bla-program-scope.log`).
* Replacing the IVD persistence route with the initial audited HEAD version accepted supplied class A for actual companion-diagnostic facts whose canonical result is C (`deferred-red-ivd-forged-verdict.log`).
* Replacing the IVD calculator router with its initial version returned HTTP 200 on a requested save without the governed audit, rather than the required save refusal (`deferred-red-ivd-save-failure.log`).

Production-file lint: **0 errors**. New production files have no warnings. The remaining two warnings are pre-existing complexity in `provenance.ts:describeProvenance` and parameter count in `bla-workbench.ts:maybePersist`. Log: `/workspace/audit/deferred-lint-qualified.json`. Scoped `git diff --check` is clean.

The root integrated typecheck found three untyped shape-guard predicates and a spread-only saved-row return; those were corrected with actual type predicates and the runtime-validated saved id. Root owns the final integrated typecheck.

## Limits and handoff

These are local scoped qualification results, not a production activation, live external regulator transaction or real PostgreSQL signature execution. Transaction tests execute real PostgreSQL-compatible SQL through PGlite; the shared canonical audit/signature ceremony is covered by its existing scoped suites, with verifier/signature-write mocks where those suites declare them. The real-PostgreSQL domain signature fixture now supplies a real program-filed BLA assessment, but that DB-specific suite was not run in this lane.

Existing bounded-list contracts remain: BLA returns its latest 200 saved rows; IVD assessment lists default to 100 (maximum 500). This work adds accessible first-create, actual saved-record inspection and exact-copy lifecycle connections, not a historical-list pagination redesign.

Root owns the AnA dispatcher/tool-definition correction: its four BLA tools must be explicitly pure/unsaved and refuse unsupported persistence requests, or call the same canonical governed writer with a real program, title/reason and current actor. Advertised program ids may no longer silently imply a save.
