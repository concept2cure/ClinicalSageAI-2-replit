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

Canonical code was fast-forwarded from1c846bdf6 to438287ed1, then throughf0e0ff863 and13be18d3d using normal canonical integration. Incoming work includes core prompt-owner/project-action fixes and Vault archive/upload review safeguards. The initial control contract was committed/pushed as47ce1d3d9 before production edits. resume-state.json, paused-filing-source-manifest.json and the byte-verified paused/ snapshots preserve the earlier unfinished filing work; historical Oct27 RED evidence remains in its original packet. Incoming Oct29 filing integration is credited, not represented as the paused work's completion.

## Bounded changes

- The existing CSR builder supplies report-wide writing expertise to both drafting paths and quotes all whitelisted study metadata at user priority. Mapped result headings require usable retained results; absent/empty evidence stays needs-data with template origin and no model cost. Missing tables and context-budget omissions remain distinct in lineage.
- Existing writing guidance describes source-supported ethics, consent, GCP and actual SAP timing, including missing/late/waived records. Sentence patterns distinguish superiority, noninferiority, equivalence and Bayesian methods without computing decisions or inventing criteria.
- The same registered interview reaches robustness questions after either primary outcome, preserves therapeutic-area branches and distinguishes sensitivity, supplementary and exploratory analyses. Nonzero AE counts produce neutral review information rather than an inferred high rate. The robustness node moved unchanged to a small factory to retain the repository's file-size ceiling.
- Inherited fallbacks now keep recorded plans distinct from actual conduct and remove unsupported severity, fixed safety thresholds, narrative availability, eligibility/unmet-need and statistical-design assumptions. Source gaps remain visible; useful recorded sample size, duration and comparator survive.
- Current active actor/tenant and exact source-project admission apply to writes. Queued jobs recheck evidence/access after long calls and on populated resumes, protect cancelled job states and retain saved work on refusal. Read-only history access stays distinct from build/review/cancel permission.
- Regenerated the existing text-contrast sheet for its already-present QMS successor selector. The sole DocumentWorkbench and existing UI tokens/navigation remain the owners. Six CSR human scenarios were added to the existing worksheet as Not run.

## Verification

The decisive integrated selection is release-regression-tests.json; release-source-freeze.json pins3002 statically resolved implementation/test/build inputs. Smaller phases overlap and must not be summed.

| Check | Result |
| --- | --- |
| Integrated CSR/editor/AnA/current Vault regression |727 passed across63 suites; release-regression.json; no input drift |
| Scoped lint |26 files,0 errors,8 existing warnings,0 warning growth; release-lint.json |
| Existing editor/UI/repository gates |7/7 passed; release-editor-gates.json |
| Production build |Passed; release-build.json |
| Full-program incremental TypeScript, unchanged zero baseline |0 errors; release-typecheck.json |

Genuine RED outputs are retained for access, missing evidence, job/source revalidation, cancellation and inherited fallback claims. Fixture calibration and corrections are explicit in expertise/README.md, generation/README.md and the named correction JSON files. The first compiler failure was11 instances of one PGlite/node-pg driver-envelope type mismatch in a new test fixture; the documented fixture-only bridge preserves real SQL and production types. The initial UI gate failures were corrected without baseline growth. Inline historical receipt pins remain authoritative where a snapshot filename was reused; freeze-reconciliation.json retains the original lint pins separately. The earlier final-qualification-bridge.json predates the final integration; the63-suite release receipt supersedes it.

## Limits

Models are mocked; these checks do not qualify live-provider behavior, native PostgreSQL concurrency/RLS, clinical/statistical correctness, human acceptance or agency acceptance. Existing review, signature, source/manual, model approval/PQ and release controls stay authoritative. No live provider, deployment or agency action was performed. Paused filing-completion evidence is historical unfinished work, not completed coverage.

## Status

The pre-overlap source passed its source checks. A concurrent CSR continuation through90e5c3a1a is being reconciled; these receipts are not claimed for that merged source. Root owns direct canonical publication with normal hooks and accepted-Git-blob verification. Human clinical/statistical review and worksheet cases164–169 remain unrun. Publication and qualification JSON will identify the exact accepted source and evidence.
