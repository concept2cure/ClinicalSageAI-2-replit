# CSR STF source verification: discovery and qualification

W1 / D2, 2026-10-30, canonical `concept2cure-v2`. Continue the explicit open STF item on the work-order row for Claude session `01471vSKg1KXj3ijXDiyvXGX`, following the accepted CSR expertise publication at `90e5c3a1a`. Evidence: `docs/evidence/D2-CSR/2026-10-30-stf-source-verification/README.md`.

## What already exists

Discovery baseline before this correction:

- `server/services/ectd/stf-generator.ts` owns STF XML, dataset tag checks and the shared `STF_DOCUMENT_FILE_TAGS` list. Its document list is labelled recall, permits `study-report`, and warns on unknown tags. The XML layout and dataset roles also have explicit evidence limitations; verifying a document role alone cannot promote those claims to source-verified.
- `server/services/csr/csr-assembly-plan.ts` owns the CSR body/table/narrative role, supplied appendix and patient listing role mappings. `CSR_BODY_FILE_TAG` is `study-report`; its comment records an unresolved lead that the official role is `study-report-body`. `assertKnownFileTags` checks only the same recall list, so it cannot independently establish validity.
- `server/services/csr/csr-assembly.ts` emits the body, tables, narratives and appendix leaves and their STF using these existing owners. `csr-assembly-run.ts` persists their role metadata; `csr-assembly-placement.ts` carries it into the canonical submission leaf writer. Extend/fix these paths, not another assembler or store.
- `shared/schema/submissions.ts`, `migrations/20261012_submission_leaf_stf_study_tagging.sql` and `server/services/ectd/core-to-packager.ts` already carry `study_id`/`stf_file_tag` to packaging. Some package/golden fixtures already use `study-report-body` while generator/CSR fixtures use `study-report`. No schema or historical submitted-data rewrite is required for discovery.
- `shared/regulatory/regulatory-basis.ts` owns source provenance and its `regulator-text` qualification. Only the actual official source read at a pinned URL/version/date can upgrade a basis. Search snippets and previous memory remain recall.
- Existing generator, package, CSR assembly/run/placement, STF coverage and qualification tests cover these seams; extend them with an independent source-based oracle and actual packaged XML captures. FDA/ICH acceptance and other unverified XML/DTD claims are separate.

Searches covered STF/file-tag/valid-values/study-report-body across existing services, schema/migrations, routes, tests and CSR evidence. Deleted-file history (`git log --all --diff-filter=D` for stf, csr-assembly and study-tag names) found no matching deleted owner in this checkout. This is not a claim about unobserved history.

## Bounded continuation

First obtain and read the official ICH STF specification/valid values, preserving URL, version, retrieval result and hash. Verify applicability to the existing eCTD 3.2.2/STF path and every CSR role in use. If verified, correct the existing role owner and its carried outputs with failing-first tests. Preserve historical records, signatures, evidence admission, existing source/version checks, packaging refusals and unknown-role behavior unless a verified specification requires a bounded correction. A source read does not certify complete package/DTD/agency validation. No new surface, model, integration, grant or filing action. No provider calls.

Root owns global test/build/compiler/publication jobs. Worker scopes will be disjoint and no source changes are authorized before the source and contract are confirmed.

## Status

Source verification and the scoped correction are implemented. The original 201 checks in 22 files passed at canonical base `be078603b00397bb86c8244b634aeff3338c5ae0`; scoped lint has zero errors and no warning growth; client/server/audit-verifier builds passed. Disjoint incoming CSR/Vault changes have been synchronized to `1ce6adc681c984f1669715d37fda774f11203059`. The combined source passes **276 checks in 27 files**, with zero failed/skipped, and scoped lint again has zero errors and no warning growth. The combined client/server/audit-verifier builds also passed. The normal canonical compiler/publication gates are pending below. No complete-filing or agency acceptance is claimed.

## Confirmed source and implementation contract

The official FDA-hosted PDF is now accessible (HTTP 200, 114803 bytes, SHA-256 63132c3751682193f6f13db125ee03583b740680851c0f0e6412561438b482da). It identifies itself as ICH STF v2.6.1, 3 June 2008, 22 pages. §III.B p8 assigns `study-report-body`, info-type `ich`, to E3 1 and 3–15. All 21 existing CSR appendix roles match pp8–9. The same body role covers §14 tables and §14.3.3 narratives by that E3 range; no separate narrative role is specified. `study-report` is absent. Source observations are factual identifiers/page anchors, not an agency acceptance verdict.

1. Root owns `ectd/stf-generator.ts`, the existing append-only `ind/ctd/regulatory-basis.ts` (constant `ICH_STF_SPEC_261`), generator/source checks and related existing generator/route tests. Correct the known invalid document role in the existing list; keep the mixed list's remaining provenance at recall and existing unknown/dataset behavior. Reject the exact source-proven invalid `study-report` in generation with a clear deliberate-correction message, without silently normalizing persisted metadata. Pin specific source provenance without upgrading unverified regional/dataset/XML/DTD claims.
2. The CSR-plan worker owns `csr/csr-assembly-plan.ts` and pure/current-output assembly/narrative tests, plus a focused source-values test. Change the existing body/table/narrative role, carry `ICH_STF_SPEC_261` as scoped CSR-role provenance, and use an independently pinned source oracle for all 21 appendix roles. No source registry, assembler, migration or historical rewrite.
3. The carryover worker owns `csr/csr-assembly-placement.ts`, `csr/csr-placement-lifecycle.ts` and their three existing PGlite tests (`csr-assembly-packaged`, `csr-assembly-run`, `csr-assembly-lifecycle`). Refuse retained mismatching role metadata before claim/writes and instruct reassembly; preserve stored output/hashes. Recognize the exact old body role in historical predecessor reads only, so corrected output replaces the prior part instead of silently duplicating it. Preserve unknown/unowned history decisions. Capture actual packaged STF XML and an already-placed old role refusal. Do not auto-invoke the existing audited study-tagging metadata edit or modify sent packages.
4. Root serializes all test/lint/build/compiler/publication jobs. Tests are authored and frozen before genuine RED runs, then source changes; include positive/negative controls and historical-byte preservation. Sources and final dependency inputs are pinned. Provider, native agency acceptance, deployment, broad DTD vendoring/qualification and unrelated regional `info-type` correction remain outside this bounded CSR continuation.

A separate finding remains: the 2008 table lists regional roles with info-type `us`, while the current generator always emits `ich`. Do not promote or silently extend this slice to every regional/dataset tag. DTD assets also have their own existing approval/qualification rules.

## Implemented correction and retained history

`CSR_BODY_FILE_TAG` and its table/narrative uses now emit `study-report-body`. All 13 supplied appendix roles and 8 listing roles already agreed with the official table and remain unchanged. The focused tests pin those values independently of the production maps. `CSR_STF_ROLE_BASIS` reuses the one appended `ICH_STF_SPEC_261` basis; the generator's mixed list retains recall provenance for unverified entries.

The generator refuses the exact unsupported `study-report` value for a new, append or replacement document. It does not rewrite its input, infer a replacement for an unknown value, or change the existing dataset rules. Deleting a historical leaf remains possible without emitting its obsolete role. Packaging an already placed old role fails without rewriting its leaf or assembly. A retained assembly with a wrong, missing or unknown output role is refused before claims or leaf writes, with a reassembly instruction. Historical predecessor discovery recognizes the exact old role read-only, using the recorded appendix identity to distinguish body, tables and narratives. Unowned shared-role leaves still require the user's keep/withdraw decision.

## Qualification sequence and attribution

All jobs were serialized by the root on Node 22. Workers changed disjoint approved files and ran no test/build/compiler/provider/publication jobs.

1. `root-red-inputs/` and `plan-red-inputs/` pin the inputs before production correction. The initial root test assumed the deletion summary counted emitted leaves; the summary actually counts the input. That unrelated assumption was removed, and the first run is retained as `csr-stf-root-red-counter-assumption.log.gz`. The corrected root/plan cohort then failed as intended: **38 failed / 38 passed, 76 checks in 5 files** (`csr-stf-plan-red.log.gz`). Existing appendix values were positive controls, not 21 newly discovered errors.
2. With the core spelling corrected and before placement/history changes, the interaction cohort was **4 failed / 95 passed, 99 checks in 8 files** (`csr-stf-core-green-carryover-red.{log,json}.gz`). Three stale-role cases incorrectly placed, and the mixed-history query omitted old-role predecessors. The core-role cohort and positive packaged controls passed. `carryover-red-inputs/` pins that production/test state.
3. The first broader run was **7 failed / 194 passed, 201 checks in 22 files**, retained with `integration-attempt1-source-freeze.json`. Failures exposed current-positive fixtures still using the old role, an unknown-tag fixture now using a known tag, two invalid fake PDFs refused by the real byte guard, and the missing native XML tool. Only current-positive fixtures were corrected; historical-role fixtures and package/byte assertions remain. Existing `minimalPdf` supplies real fixture PDFs. No refusal was mocked away or baseline changed.
4. Native `xmllint` was provisioned without root/global installation or a repository dependency by downloading the Debian package through signed bookworm APT metadata and extracting it under `/tmp`. `xml-tool.json` pins its version, SHA-256 and package provenance. No agency DTD was acquired or vendored. The final original cohort was **201 passed, zero failed/skipped, 22 files**. `final-source-freeze.json` pins its 37 inputs at base `be078603b00397bb86c8244b634aeff3338c5ae0`; `test-files.txt` names every suite. The packaged tests inspect the actual captured STF XML, and the existing native XML checks ran with the real CLI.
5. Original scoped ESLint: **19 files, zero errors, warning delta zero**. The client, server and audit-chain-verifier builds passed at the same base. Logs are retained below; this original result does not claim changed incoming dependencies were tested.

The command for the original green run was:

```sh
PATH="/tmp/csr-stf-xml-tools/runtime/usr/bin:$PATH" npm exec --yes --package=node@22 -- node node_modules/vitest/vitest.mjs run $(cat docs/evidence/D2-CSR/2026-10-30-stf-source-verification/test-files.txt) --reporter=verbose --reporter=json --outputFile.json=/tmp/csr-stf-final-tests-green.json
```

## Concurrent source integration

The original source-visit work was synchronized before the original 201-check green run. Later incoming canonical `1ce6adc681c984f1669715d37fda774f11203059` added source-bound CSR writing/late-job admission and Vault upload receipt verification. None of its 291 changed paths intersected the 19 staged STF source/test files or the original 37 pinned inputs. A normal fast-forward preserved both changes; the incoming paths were not rewritten.

The incoming CSR route does affect assembly admission: `requireCsrJobWriteAccess` now delegates to `requireCsrJobAccess(..., { forWrite: true })`. A separate read-only review found preserved current edit/archived-project checks, exact retained-source identity/lineage checks in the runner, and no rewriting of assembly roles, hashes or bytes. The route assembly tests mock access, so they alone do not prove authorization. The combined run therefore includes actual-policy project/headings access tests plus the runner evidence/revalidation tests. `synchronized-source-freeze.json` pins 77 inputs at the combined base, and `synchronized-test-files.txt` names all 27 suites. The original input hashes were verified unchanged after the fast-forward.

## Limits and remaining work

This closes the explicit source uncertainty about the CSR body and the existing 21 appendix roles. It does not qualify every mixed regional or modern dataset role, complete STF XML/DTD compliance, an agency corpus, clinical content, human witnessing or a released production model. The official table's regional `info-type=us` and the generator's generic `ich` behavior remain a separately scoped finding. DTD assets retain their existing approval rules. PQ-DRAFT-001, the other session handoffs and wider D7/agency decisions stay open. No model/provider call, live submission, deployment, native PostgreSQL qualification or historical-record migration was performed.

## Combined-source verification

At base `1ce6adc681c984f1669715d37fda774f11203059`, the original 22 suites plus the five named bridge suites pass: **276 passed, zero failed/skipped, 27 files, 96.95 seconds**. The source/test input hashes were verified unchanged after execution. The test command is the original green command above with `synchronized-test-files.txt` and output `/tmp/csr-stf-synchronized-tests.json`. The compressed synchronized test log/JSON preserve exact outcomes. Scoped lint against this base again reports **19 files, zero errors, warning delta zero**; the synchronized lint log/JSON are retained separately from the original base's results. No baseline was enlarged.

The additional actual-policy suites cover the incoming current access checks; the runner evidence/revalidation suites cover source identity, late replies, terminal status and saved result lineage. The actual package/assembly tests remain synthetic controlled fixtures, not a production study or agency verdict.


The combined build at `1ce6adc681c984f1669715d37fda774f11203059` passed (`csr-stf-synchronized-build.log.gz`). A further normal fast-forward brought in `0ad3a15ce`'s project-initiation/protocol UI and its own evidence. Review found no CSR/STF runtime or pinned-input overlap; all 77 qualified hashes still match. `publication-base.json` records the exact base and incoming paths. The final client/server/audit-verifier build passed at `0ad3a15ceed158232dfb1cb18e543820027c0488` (`csr-stf-publication-build.log.gz`); the original and combined test results retain their precise source attribution.


The independent final evidence review found no material source/count/history/base-attribution issue. The discovery inventory is explicitly labelled as the pre-correction baseline. The final build's existing chunk-size advisories are retained in the raw log; it exited successfully. The normal compiler/push gates and accepted source SHA will be recorded in the publication receipt after Git confirms acceptance.
