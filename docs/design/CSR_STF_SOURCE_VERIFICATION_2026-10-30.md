# Verify the existing CSR Study Tagging File roles

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

## Confirmed source and implementation contract

The official FDA-hosted PDF is now accessible (HTTP 200, 114803 bytes, SHA-256 63132c3751682193f6f13db125ee03583b740680851c0f0e6412561438b482da). It identifies itself as ICH STF v2.6.1, 3 June 2008, 22 pages. §III.B p8 assigns `study-report-body`, info-type `ich`, to E3 1 and 3–15. All 21 existing CSR appendix roles match pp8–9. The same body role covers §14 tables and §14.3.3 narratives by that E3 range; no separate narrative role is specified. `study-report` is absent. Source observations are factual identifiers/page anchors, not an agency acceptance verdict.

1. Root owns `ectd/stf-generator.ts`, the existing append-only `ind/ctd/regulatory-basis.ts` (constant `ICH_STF_SPEC_261`), generator/source checks and related existing generator/route tests. Correct the known invalid document role in the existing list; keep the mixed list's remaining provenance at recall and existing unknown/dataset behavior. Reject the exact source-proven invalid `study-report` in generation with a clear deliberate-correction message, without silently normalizing persisted metadata. Pin specific source provenance without upgrading unverified regional/dataset/XML/DTD claims.
2. The CSR-plan worker owns `csr/csr-assembly-plan.ts` and pure/current-output assembly/narrative tests, plus a focused source-values test. Change the existing body/table/narrative role, carry `ICH_STF_SPEC_261` as scoped CSR-role provenance, and use an independently pinned source oracle for all 21 appendix roles. No source registry, assembler, migration or historical rewrite.
3. The carryover worker owns `csr/csr-assembly-placement.ts`, `csr/csr-placement-lifecycle.ts` and their three existing PGlite tests (`csr-assembly-packaged`, `csr-assembly-run`, `csr-assembly-lifecycle`). Refuse retained mismatching role metadata before claim/writes and instruct reassembly; preserve stored output/hashes. Recognize the exact old body role in historical predecessor reads only, so corrected output replaces the prior part instead of silently duplicating it. Preserve unknown/unowned history decisions. Capture actual packaged STF XML and an already-placed old role refusal. Do not auto-invoke the existing audited study-tagging metadata edit or modify sent packages.
4. Root serializes all test/lint/build/compiler/publication jobs. Tests are authored and frozen before genuine RED runs, then source changes; include positive/negative controls and historical-byte preservation. Sources and final dependency inputs are pinned. Provider, native agency acceptance, deployment, broad DTD vendoring/qualification and unrelated regional `info-type` correction remain outside this bounded CSR continuation.

A separate finding remains: the 2008 table lists regional roles with info-type `us`, while the current generator always emits `ich`. Do not promote or silently extend this slice to every regional/dataset tag. DTD assets also have their own existing approval/qualification rules.
