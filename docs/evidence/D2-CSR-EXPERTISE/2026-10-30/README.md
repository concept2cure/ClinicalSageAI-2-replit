# CSR generation and expertise improvements

W1 / D2. Contract: docs/design/CSR_EXPERTISE_IMPROVEMENTS_2026-10-30.md.

## What already exists

Discovery notes below describe the audit base438287ed1; corrections are described in the bounded changes and verification sections.

- `csr-builder.ts` owns the sole CSR drafting path and canonical E3 targets. It receives rendered section requirements and guards numerical claims; an empty retained evidence pack currently fails usableEvidence and is dropped, allowing metadata-only acceptance of unsupported qualitative findings.
- `ind/ctd/csr-e3-guidance.ts`, `csr-e3-writing.ts` and `ana/medical-writing-csr.ts` own the 119-heading record and report-wide scientific writing rules. Section writing is in the brief; the builder does not currently include the report-wide rules. Newly added ethics/SAP model sentences assume approval, compliance and pre-unblinding finalization without records.
- `ana/intelligence-questions/flows/csr-report.ts` is registered and reachable. Sensitivity analysis is currently branched around primary failure; two absolute nonzero event counts are labelled high rates without a denominator.
- `csr/csr-job-runner.ts`, `cortex-authoring-reader.ts` and `cortex-authoring-context.ts` own persisted jobs, retained evidence and per-section source admission. Source is loaded before drafting; a late reply and fully populated resume need current-source checks. Program identity must match the numeric target, not merely share its protocol number.
- `csr/project-scope.ts` and `report-os/project-access.ts` own current actor/project policy. resolveCsrScope's forWrite currently does not reach canAccessReportProject, and its Drizzle actor branch lacks the active user/tenant checks in its SQL branch.
- Incoming Oct28–30 work already provides ADaM-backed tables, source-cell reconciliation, patient narratives, CSR assembly/placement, restart recovery, scientific review/release and instruction-based revision/alternatives. Existing CSR_END_TO_END_2026-10-29.md and its slice evidence are credited; retired legacy/model-figure endpoints are not restored.
- `DocumentWorkbench`, CSR card, governed source/review/export/import controls and existing model approval/qualification gates remain the product owners. No alternate editor, CSR engine, knowledge bank or scientific calculator is introduced.

## Catch-up and retained work

Canonical code was fast-forwarded from1c846bdf6 to438287ed1, then throughf0e0ff863 and13be18d3d using normal canonical integration. A concurrently completed CSR continuation through90e5c3a1a was reconciled by normal merge with local source256c794eb; canonical-csr-reconciliation.json records the retained behaviors and fixture corrections. The incoming current-approval/conduct guards and all substantive controls remain, with their original evidence under resumed-codex/. Incoming work includes core prompt-owner/project-action fixes and Vault archive/upload review safeguards. The initial control contract was committed/pushed as47ce1d3d9 before production edits. resume-state.json, paused-filing-source-manifest.json and the byte-verified paused/ snapshots preserve the earlier unfinished filing work; historical Oct27 RED evidence remains in its original packet. Incoming Oct29 filing integration is credited, not represented as the paused work's completion.

## Bounded changes

- The existing CSR builder supplies report-wide writing expertise to both drafting paths and quotes all whitelisted study metadata at user priority. Its bounded conduct-claim refusal gate also checks actual model replies; this is additional defense, not proof that every possible assertion is correct. Mapped result headings require usable retained results; absent/empty evidence stays needs-data with template origin and no model cost. Missing tables and context-budget omissions remain distinct in lineage.
- Existing writing guidance describes source-supported ethics, consent, GCP and actual SAP timing, including missing/late/waived records. Sentence patterns distinguish superiority, noninferiority, equivalence and Bayesian methods without computing decisions or inventing criteria.
- The same registered interview reaches robustness questions after either primary outcome, preserves therapeutic-area branches and distinguishes sensitivity, supplementary and exploratory analyses. Nonzero AE counts produce neutral review information rather than an inferred high rate. The robustness node moved unchanged to a small factory to retain the repository's file-size ceiling; later reconciliation adds the canonical warning that a per-protocol analysis can target another estimand.
- Inherited fallbacks now keep recorded plans distinct from actual conduct and remove unsupported severity, fixed safety thresholds, narrative availability, eligibility/unmet-need and statistical-design assumptions. Source gaps remain visible; useful recorded sample size, duration and comparator survive.
- Current active actor/tenant and exact source-project admission apply to writes. Queued jobs require current source approval, recheck evidence/access after long calls and on populated resumes, protect cancelled job states/progress and retain saved work on refusal. The existing route writer helper delegates to the shared read/write scope owner. Read-only history access stays distinct from build/review/cancel permission.
- Regenerated the existing text-contrast sheet for its already-present QMS successor selector. The sole DocumentWorkbench and existing UI tokens/navigation remain the owners. Six CSR human scenarios were added to the existing worksheet as Not run.

## Verification

The decisive reconciled selection is reconciled-regression-tests.json; reconciled-accepted-source-freeze.json pins3,011 statically resolved implementation/test/build inputs. Smaller phases and prior canonical/727-check runs overlap and must not be summed.

| Check | Result |
| --- | --- |
| Reconciled CSR/editor/AnA/Vault qualification |854 distinct checks across71 suites qualified through the full run and one corrected fixture repeat; see bridge below |
| Scoped lint |29 files,0 errors,8 existing warnings,0 warning growth; reconciled-lint.json |
| Existing editor/UI/repository gates |7/7 passed; reconciled-editor-gates.json |
| Reconciled production build |Passed; reconciled-build.json |
| Final compiler gate |Passed through normal source push:0 errors, unchanged zero baseline; source-push.json |

The full reconciled run passed853/854 checks:70 suites passed, and one case failed in a20-case suite because an unbound discussion-results section cannot reach the model under the stricter source policy. Its late-permission control now uses non-result section9.1, preserves the bound-results branch and explicitly proves both call the model. The whole20-case suite re-passed. All production inputs and all other test inputs are byte-identical between runs:834 passing checks from the other70 suites plus20 from the corrected suite qualify854 distinct checks. reconciled-qualification-bridge.json records exact before/after test pins; no production guard was weakened, no skipped test is counted and overlapping tests are not added twice.

Genuine RED outputs are retained for access, missing evidence, job/source revalidation, cancellation and inherited fallback claims. The new progress-race control was additionally proved against a deliberately weakened initial-progress writer, then the guard restored; see progress-race-negative-note.json. Fixture calibration is explicit in expertise/README.md, generation/README.md, resumed-codex/README.md and named correction JSON. Initial compiler/UI failures were corrected without baseline growth. Original inline historical receipt pins stay authoritative where a snapshot filename was reused; freeze-reconciliation.json retains the original lint pins separately. Earlier final/release bridges and receipts remain historical; the reconciled qualification supersedes them.

## Later editor-source convergence

Normal merge6747c4470 preserves the next accepted editor source/session safeguards throughbe078603b. The backend inputs qualified above are byte-identical. All12 affected editor suites pass87 checks on this merged source; eight repeat CSR suites and four exercise new editor ownership controls, so87 is not added to854 as a distinct count. publication-editor-bridge.json records all changed input hashes and the unchanged backend comparison. The final committed scope is publication-qualified-inputs.json (3,015 inputs), with the refreshed publication-build.json and publication-editor-gates.json. The normal source push passed all hooks, including0 TypeScript errors and no lint-warning growth; source-push.json retains compiler and accepted transport output.

## Limits

Models are mocked; these checks do not qualify live-provider behavior, native PostgreSQL concurrency/RLS, clinical/statistical correctness, human acceptance or agency acceptance. Existing review, signature, source/manual, model approval/PQ and release controls stay authoritative. No live provider, deployment or agency action was performed. Paused filing-completion evidence is historical unfinished work, not completed coverage.

## Status

Source accepted directly on concept2cure-v2 at6747c4470 through normal hooks. All3,015 qualified inputs are checked against actual accepted Git blobs; source-publication.json and accepted-source-git-proof.json identify the exact revision. The final evidence commit adds this qualification and complete artifact manifest without changing production source. Human clinical/statistical review and worksheet cases164–169 remain unrun. Publication and qualification JSON will identify the exact accepted source and evidence.
