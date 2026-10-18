# Remaining Data Room, catalogue and AnA needs

Assessment date: 2026-10-18. Product: Concept2Cure / AnA 1.0 RI.
Clients: biotech, pharma, medical devices and diagnostics in the US, Europe,
Japan, Canada and Australia. Source baseline:
`e62320e0a9555188a08ce426d7c16c72d372d824`, including selected-source assembly.
This refresh supersedes stale gap statements in the October 14 study. It does
not certify a production deployment, scientific result, or agency acceptance.
The [source manifest](remaining-needs-2026-10-18-source-manifest.json) records
33 source-file SHA256 bindings and distinguishes the subsequent scheduler fix.

## Priorities

| Order | Remaining need and client benefit | Present evidence and boundary | Smallest useful next delivery |
| --- | --- | --- | --- |
| 1 | **Refuse known unfinished output at the editor candidate boundary.** Prevent an interrupted draft being offered as usable regulatory content. | Source audit: the actual Authoring draft route parses nonempty gateway content and parks a server-owned candidate without checking the gateway finish reason. The generic BatchDraft cutoff fix is delivered, but does not cover this separate path. | Reuse the canonical termination classifier before candidate creation; preserve honest failure/turn records. Freeze a test of the actual generate → candidate → accept path with `max_tokens`/`length`, explicit cutoff, unknown and normal controls. Define legacy candidate handling separately; a source manifest proves input identity, not output completion. |
| 2 | **Carry Stop through nested source reads and model work.** Reduce wasted processing and make cancellation reliable during long dossier work. | Source audit: the tool's existing signal stops the outer wait, but batch source loading, draft requests and later service waves do not receive it. The gateway already supports cancellation. | Propagate the existing trusted signal, check before reads/dispatch/waves and after awaits, and suppress late successful outcomes. Hold wave one, abort, then prove no later dispatch or read occurs; preserve completed siblings with explicit cancelled outcomes and intentional retry policy. |
| 3 | **Improve multilingual, table and neighboring-context retrieval.** Help reviewers find the evidence that supports a safety or performance claim. | Japanese embedded-term selection is reproduced; passage search drops the expanded context already produced upstream. Exact Unicode coordinates are fixed. Current source-first assembly shares the selector. | Japanese compound/mixed-script fixtures with expert relevance labels; then a result/header/denominator split across chunks, retaining exact locators, hashes, budgets and withdrawal checks. Do not concatenate expanded text without defining overlap and coordinate identity. |
| 4 | **Retain extraction evidence and bound OCR work.** Make scanned dossier processing inspectable and predictable. | Capture currently retains text/method/counts but discards available page spans and confidence. Automatic fallback supplies no explicit page budget, and the OCR facade omits the rasterizer's pixel cap. Japanese OCR accuracy is unqualified. | Page/pixel/time budgets, honest partial-coverage receipts, page/confidence/engine identity, and adjudicated multilingual numeric/table fixtures. Keep original-file and extraction identity together; report unprocessed pages explicitly. |
| 5 | **Qualify exact filing pathways in each market.** Give clients an accurate answer about preparation, validation and transmission for their application. | The registry and drafting context are broader than qualified packaging/transmission. Current eCTD backbone readiness identifies flat EU/Japan/Canada backbones and an Australian placeholder; PMDA and Canada deliberately refuse unverified transport. Credentials alone do not establish a protocol. | One matrix keyed by product, application, jurisdiction, format version, validator and channel. For each claimed pathway, bind validator results and authorized test acknowledgements to exact package bytes. Preserve applicant upload where no sourced API exists. Include EU trial, medicine, MDR and IVDR distinctions rather than one generic Europe label. |
| 6 | **Complete the scientific dataset deliverable beyond intake.** Connect study evidence to submission-ready study-data packages and reproducible claims. | XPT v5 structure intake, Dataset-JSON profiling and ZIP intake are delivered. Native `m5/datasets` production and actual-byte CDISC conformance remain separate gaps; readiness currently reads declared metadata and excludes SEND. | A scoped study-data package contract for actual dataset bytes, study paths, Define-XML, reviewer guides and applicable standards. Negative controls for missing TS/DM/ADSL and broken references; do not label structural profiling as value-level conformance. Respect the recorded D7 scope boundary. |
| 7 | **Bind generated-output status to trusted save authority.** Make output provenance and completion status survive client edits and retries. | Existing candidates/turn records and source revalidation are real controls. Generic accept still receives caller-supplied finish metadata; omission is not proof of completion. This is a design need, not evidence that all current provenance or authorization is broken. | A server-owned per-section receipt bound to output hash, finish status, actor/tenant/project, target/base version and source snapshot. Specify edited-output, replay, expiry and manual/legacy policies before enforcing a new save gate. Reuse the candidate/turn infrastructure. |
| 8 | **Finish operational and customer qualification.** Demonstrate that working code supports a real regulated customer workflow. | D1–D10 define the required evidence. Local tests and stored implementation evidence do not establish live deployment, production signer operation, independent assurance, signed validation or a real sponsor acknowledgement. These external outcomes were not verified in this session. | Reconcile each row with current deployed evidence: hosted smoke/restore and isolation, model PQ/validation signatures, signing/audit operation, security/legal approvals, a real test sequence and paid pilot. Attach artifact/version/date/owner; do not infer missing production credentials from this development environment. |
| 9 | **Measure differentiation and extend scientific coverage deliberately.** Build a defensible advantage from correct, reviewable evidence rather than more generated prose. | Existing source lineage, deterministic checks and governed lifecycle are foundations. No independent comparative outcome benchmark was executed here. CMC composition intentionally covers small-molecule US IND Module 3; broader biologic/marketing/non-US composition is a scope extension. | Benchmark the same tasks and permissions across products, then choose one bounded extension: an assay-specific performance report, biologic quality section, device configuration impact analysis, or regional application pack. Require deterministic scientific calculations and expert acceptance before widening automatic composition. |

As a subsequent increment in this continuation, the concurrency defect found
during assessment is repaired in `4684ff1d490ae3b1c618d2565cbf36795160e9b1`,
after the assessment baseline. Invalid values are rejected before
work; omission defaults to 3; valid positive integers are capped at 5. Its
fail-first qualification is recorded in
[D2-BATCH-CONCURRENCY](../../evidence/D2-BATCH-CONCURRENCY/2026-10-18/README.md).
It is excluded from the remaining-needs list above.

## Evidence anchors and limits

These are code observations at the baseline, except the explicitly identified
pure Japanese selector probe. They are not newly executed end-to-end tests of
the remaining features. Line numbers describe that baseline and can move.

| Finding | Current implementation anchors |
| --- | --- |
| Editor termination | `server/routes/authoring.router.ts:3943` sends a 3,000-token drafting call; `:3978` parses content; `:4060` creates the candidate. `server/services/clinical-regulatory-evidence/draft-candidate-store.ts` retains generator/source/base metadata but has no per-section finish attestation. |
| Nested cancellation | `server/services/ana/AnaToolExecutor.ts:15851` batch handler, `:15877` source loop, `:15889` service call, `:16027` outer signal. `server/services/ana/AnaDocumentDraftingService.ts:630` request shape, `:859` gateway request, `:1148` batch waves. |
| Japanese selection | `server/services/ana/draft-source-window.ts:38` terms and `:81` boundary rule. Probe: late `治療中の有害事象発現率は12％でした。`, query `有害事象`, cap 500 → opening `[0,500]`; passage beginning at 37501 (query occurrence 37505). Spaced-Japanese and English controls select `[37501,38001]`. `server/services/authoring/authoring-assembly-sources.ts:108` reuses this selector. |
| Retrieval context | `server/services/advancedRAGPipeline.ts:838` expansion and `:1251` expandedContent; `server/services/ragRouter.ts:259` response; `server/services/vault/document-passage-search.ts:344` promise and `:376` content-only mapping. Catalogue search uses English indexing and a 900,000-character bound in `server/services/clinical-regulatory-evidence/data-room-search.ts`. |
| OCR/capture | `server/services/ocr/extractDocumentText.ts:33` extraction shape and `:91` fallback; `server/services/clinical-regulatory-evidence/data-room-processing.ts:129` retained capture fields; `server/services/ocr/ocrService.ts:127` forwarding; `server/services/ocr/pdfRasterizer.ts:47` maxPixels and `:75` page defaults. |
| Regional qualification | `server/services/ectd/regional-backbone-readiness.ts`; `server/services/submission-gateways/pmda-gateway.ts`; `server/services/submission-gateways/health-canada-gateway.ts`; canonical `market-support.ts`; external-validator adapter and gate. The source manifest lists full paths and SHA256 bindings. |
| Dataset/CMC boundaries | `dataset-profile.ts`, `document-intake-formats.ts`, `cdisc-package-readiness.ts`, `leaf-source-resolver.ts`; `docs/design/DATA_ROOM_CATALOG_AND_CLINICAL_DATA_2026-10-08.md:116` intake decision and `:122` packaging assessment; `server/services/cmc/composition-scope.ts:7` and `:164` scope/refusal. |
| Other termination loss | `server/services/ana/AnaDocumentDraftingService.ts:1200` quick completion and `:1215` return; `server/routes/ana-intelligence.ts:515` response. The reachable quick API also drops finish metadata; no current client caller was found. Cover it in the scoped termination work, without claiming a demonstrated generic BatchDraft regression. |
| Generic save authority | `server/routes/batch-draft-routes.ts:489`; `server/routes/ana-intelligence.ts:397` turn outputs; `server/services/authoring/authoring-from-draft.ts:191`. Source authority/current-access checks remain separate controls that must be preserved. |

## What is already delivered

Do not reopen these as absent capabilities:

- Exact original/extraction/excerpt identity, half-open UTF-16 spans and current
  source checks; genuine source-context issuer and dispatch checkpoints.
- Unicode offset correction, cutoff prose omission from AnA batch receipts,
  and generic BatchDraft error/accept/metadata handoff.
- Assembly from selected catalogue/project sources, exact admitted manifests
  and a visible source-selection notice, added by `e62320e0a`.
- Recovery claim/sweep infrastructure; XPT/Dataset-JSON/ZIP intake; official
  nIVD/IVD eSTAR 7.1 and PreSTAR 3.1 template pins. PreSTAR's measured mapping
  is limited and still requires request-specific qualification.

Implementation, qualification and revalidation records live under
`docs/evidence/D2-DRAFT-SOURCE-IDENTITY/`,
`D2-DRAFT-CONTEXT-CHECKPOINT/`, `D2-DRAFT-TRUNCATION-RECEIPT/`,
`D2-DRAFT-WINDOW-COORDINATES/`, `D2-BATCH-DRAFT-TERMINATION-HANDOFF/`
and `D2-EDITOR-INTEGRATION/2026-10-17/catalogue-source-assembly/`.
Their individual scopes and limits still apply.

## How to build and prove the moat

Use the existing source, candidate, turn, claim and lifecycle infrastructure.
Small contract-first changes, explicit trusted inputs, deterministic kernels,
bounded asynchronous work, and failing-boundary tests improve this platform
more safely than adding a parallel agent architecture or more model names.

For diagnostics, benchmark whether every sensitivity/specificity or agreement
claim can be reproduced from the correct assay version, specimen, intended-use
population, reference method, units, denominator, exclusions and confidence
interval method. For devices, carry configuration/risk/test lineage into the
applicable technical documentation. For drugs and biologics, carry study,
analysis population, endpoint, timepoint and quality evidence into the scoped
application. Build on existing checks rather than declare all of these absent.

The strongest testable differentiation hypotheses are:

1. Reuse a claim only when product/configuration/population/market context is
   compatible, and explain exactly why reuse is permitted or refused.
2. Recompute a submitted figure deterministically from governed input bytes,
   including missingness, units and denominator, with reviewer-approved methods.
3. Show which exact claims and filed outputs a changed source affects, without
   silently rewriting an approved artifact.
4. Reconstruct a filed snapshot with the original evidence, rules, calculations,
   review/signature history and validation/transport receipts.
5. Turn accepted reviewer corrections into permission-controlled regression
   cases, with consent/retention controls and no cross-client disclosure.

[The competitor study](competitors.md) already documents marketed source
tracing, change impact, connected product data and AI authoring in competing
products. The hypotheses above are comparison questions, not assertions that
competitors have not deployed them. Follow the
[benchmark plan](moat-benchmark-plan.md) with held-out adjudicated cases,
equal access to sources, versioned methods and measured reviewer correction
time, critical error rate, relevant-evidence recall and exact reconstruction.
Require tenancy/withdrawal/error controls as well as useful answers. Do not
promise regulatory acceptance or uniqueness from a demo or a model score.

## Execution order and publication

First close the actual editor cutoff boundary and cancellation propagation;
then qualify multilingual/context-preserving retrieval and extraction. In
parallel planning, maintain an honest product × application × market matrix
and reconcile launch evidence. Broader scientific/filing automation follows
bounded scope contracts and the repository's launch rules. Existing founder
authorization for intake is not revoked or requested again.

All implementation, tests and evidence go directly to `concept2cure-v2` with
normal hooks. Fetch before pushing, inspect incoming changes, preserve both
sets of intended behavior when resolving conflicts, rerun affected checks and
verify no unmerged files. Do not force push, open a PR, or leave deliverables
on another branch. A clean fast-forward is recorded as such; it is not claimed
as a conflict that was repaired.
