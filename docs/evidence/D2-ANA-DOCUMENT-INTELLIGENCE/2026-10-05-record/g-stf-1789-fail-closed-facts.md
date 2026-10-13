# g-stf-1789-fail-closed: regulatory facts relied on (2026-10-05)

Findings 36 (`stf-naming-and-file-tags`, the TRC 1789 part) and 56
(`drugs-vault-study-data-trc-checks`, slice A: 1789 without dataset work).

This environment's egress policy refuses fda.gov, so no PDF was opened.
"Regulator text (search)" means the passage was read in web-search results
that quote the FDA-hosted document, on 2026-10-05. Everything else is labelled
recall.

| # | Fact | Basis | Source / checked | Where used |
|---|---|---|---|---|
| F1 | eCTD validation 1789 fires when "a file has been submitted in a study section without providing an STF file". | Regulator text (search) | https://www.fda.gov/media/165675/download, https://fda.gov/media/160970/download, https://www.fda.gov/media/135247/download (2026-10-05) | `auditStfCoverage` (ectd4-validator.ts): one finding per uncovered file. |
| F2 | STFs are not required for 4.3 Literature references, 5.2 Tabular listings, 5.4 Literature references and 5.3.6 Postmarketing reports. Otherwise an STF must be provided for any file or group of files belonging to a study in Modules 4 and 5. | Regulator text (search) | Same three documents (2026-10-05) | `STF_NOT_REQUIRED_SECTIONS`, `requiresStfReference`. All other Module 4/5 sections are in scope, including 4.1 and 5.1 and leaves filed at the 4.2 and 5.3 headings. |
| F3 | 1789 is a high-severity study-data Technical Rejection Criterion (effective 2021-09-15). It is a separate rule from 1734, 1735 and 1736. | Regulator text (search), already recorded | `g-study-data-trc-requirements-facts.md` F5; `g-stf-name-tags-and-shape-facts.md` F3 | A US sequence is refused (`ValidationError`, ruleId `FDA-TRC-1789`), not warned. |
| F4 | 1789 accounts for about 20% of study-data errors, 87% of them on INDs. | Regulator text (search) | https://www.fda.gov/media/165675/download (2026-10-05) | Context only: why refusing it at packaging matters most for INDs. Not encoded. |
| R1 | A leaf deleted in the sequence ships no file, so it needs no STF reference. | Recall, consistent with F1 ("a file has been submitted") | Not read | `auditStfCoverage` skips `operation: 'delete'`. |
| R2 | Whether a non-US region requires an STF for v3.2.2 study files. (Recall: the EU accepts STFs but does not require them, and Japan does not use them.) | Recall, **not encoded** | Not read | Outside the US the coverage gap is a **warning**, the package is built, and the count goes on `bundle.stf.untagged`. The platform makes no claim that the region requires an STF. |
| R3 | An unknown region, or no region, is held to FDA's rule. | Platform policy (fail closed), not a regulator fact | — | `auditStfCoverage`: `canonicalRegionOf(region)` undefined → error. |

## What the code did before (evidence)

- `regional-packager.ts:1092-1094` (HEAD 6becd3fd) kept only leaves that already
  had `studyId` and `stfFileTag` before calling `generateStfFiles`. An untagged
  5.3.5.1 report shipped with no STF, and `bundle.stf.untagged` was always 0.
  Red: the test `FDA: an untagged 5.3.5.1 report refuses the package` packaged
  successfully.
- `ectd-validator-hardening.ts:502` read `(leaf as any).studyId || leaf.lifecycleOperator`.
  Any lifecycle operator id counted as a study id. The severity was `'warning'`
  and the rule cited the STF specification, not 1789. Red: a 5.3.5.1 leaf with
  `lifecycleOperator: 'new'` and no study id produced no finding.
- `qualify.ts:471-473` reported `untagged > 0` as a warning, over a count that
  could not be non-zero.

## Not done here (owed elsewhere)

- ~~`server/services/submission-gateways/__tests__/cross-reference-packaging.test.ts:38`~~
  **Fixed 2026-10-12.** Its FDA fixture packaged a 5.3.5.1 study report with no
  study id — a sequence FDA would have thrown back — and now carries
  `studyId: 'STUDY-001', stfFileTag: 'study-report-body'`. The same applied to
  `ectd/__tests__/assemble-from-core.vault-uuid.pglite.test.ts`, whose m5.3.5.1
  row now carries `study_id` and `stf_file_tag` (its m2.5 row carries neither,
  because 2.5 is not a study section). Both green; the whole eCTD and
  submission-gateway surface is 1666/1666.
- ~~**No production packager caller sets `studyId`/`stfFileTag`.**~~ **Closed
  2026-10-12, in the same change.** The refusal shipped with no way to satisfy
  it: `submission_leaves` had no column for either field, and the
  `package_ectd_for_region` tool's leaf schema had no field for either, so both
  reachable packaging paths — the canonical compile over the submission spine
  (`ectd-export`, `ectd-compile`, `submissions` routes → `assemble-from-core` →
  `package-from-core`) and AnA's own packaging tool — would have dead-ended on
  every US sequence with a study report in it. A refusal nobody can satisfy is
  not a gate; it is a wall. The path now exists end to end:

  | Where | What |
  |---|---|
  | `migrations/20261012_submission_leaf_stf_study_tagging.sql` | `study_id` and `stf_file_tag` on `submission_leaves`, both `ADD COLUMN IF NOT EXISTS` (RULE 1: replayed every deploy, nothing dropped or rewritten), plus a partial index on `(sequence_id, study_id)`. In the set before the tenant sweeps; `ci:migration-set-order` and `ci:migration-drop-safety` both pass. |
  | `shared/schema/submissions.ts` | the two columns on the Drizzle model. |
  | `ectd/core-to-packager.ts` | `CoreLeaf` gains both; `SubmissionLeafRow` requires them, and the projection is typed `Required<CoreLeaf>`, so a field added to `CoreLeaf` does not compile until it is carried. `mapCoreLeafToEctdLeaf` puts them on the packager leaf, which is what `auditStfCoverage` reads. Neither is inferred: a leaf that names neither is refused **by name** rather than tagged by guess. |
  | `ana/AnaToolDefinitions.ts` | `study_id` and `stf_file_tag` on the tool's leaf, and the leaves description states validation 1789, that it applies to Module 4/5 study sections, and that 4.3, 5.2, 5.3.6 and 5.4 are exempt. |
  | `ana/AnaToolExecutor.ts` | both carried through to `packageEctdSubmission`, trimmed, absent when absent. |
  | `server/db/pglite-harness.ts` | the columns on the harness DDL — the Drizzle model selects them, so omitting them fails every assembler test with a missing-column error rather than a useful one. |

  Pinned by `server/services/ectd/__tests__/stf-1789-input-path.test.ts`, red
  first on all seven assertions, and mutation-proven: dropping the study id from
  the adapter, or nulling it in the projection, each turns the suite red.
- `validatePackage` (ectd4-validator.ts, `MISSING_STUDY_ID`, m5.3.* incl. 5.3.6,
  no M4) is still a separate study-id check. Folding it onto `auditStfCoverage`
  changes its finding code, which `tests/unit/ectd4-validator-extensions.test.ts:91`
  pins. That file is outside this step.
- `generateStfFiles` (stf-generator.ts) still counts leaves without a study id
  as `summary.untagged`. The packager no longer passes it any. The AnA
  `generate_stf` tool does, and gets a count without a 1789 verdict.
- `SubmissionBundle.stf` doc comment (`submission-gateways/types.ts:197-202`) and
  `EctdLeaf.studyId` doc (`ectd-packager/types.ts:50-55`) still say `stf.xml`.
- The TRC_1789 corpus row and the 1789 rule row in fda-technical-rules.ts belong
  to `g-acceptance-corpus-fold`. `FDA_STUDY_DATA_TRC.ref` still reads "(1734, 1736)".
