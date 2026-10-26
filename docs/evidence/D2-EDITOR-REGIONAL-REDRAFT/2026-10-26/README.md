# Existing editor regional redraft completion — W1 / D2

| Scope | Owner | Status |
| --- | --- | --- |
| Existing queue/review/panel input retention | Root | Completed; final inputs frozen |
| Focused panel input regression | ana_drafting_usecase | 20/20 passed; settled byte qualification |
| Actual source-first editor regeneration | next_authoring_usecase | 13/13 passed; settled byte qualification |
| Git, checks and human handoff | Root | Code published; normal gates passed; 114 human cases Not run |

Contract: docs/design/EDITOR_REGIONAL_REDRAFT_2026-10-26.md.

## What already exists

- `client/src/concept2cure/v2/editor/assemblyDraftQueue.ts` generates each eligible saved section through the canonical draft transport with the verified plan region, bounded template-reference JSON and trimmed author requirements. It retains only draft/body/reason/refusal; these request inputs are lost at review.
- `editor/authoringDraftTransport.ts` owns the existing AiDraftReviewState/AiDraftReviewSession contracts, exact scoped generation, selected-source manifest and reviewed acceptance. Extend that review buffer; do not introduce another session/store or infer inputs from optional provider metadata.
- `editor/useAuthoringDraftReview.ts` owns the one panel's state, current request lane, failure preservation, unknown acceptance and exact saved-section recovery. It appends only session.sources to generation; it currently has no retained drafting-option buffer.
- `surfaces/AuthoringAiDraft.tsx` has the existing Tone, Region, Context and Requirements controls and explicit Draft again/Discard/Accept actions. Four mount-local state fields start professional/FDA/empty/empty; the controls are hidden when a retained candidate exists, so regeneration silently uses those defaults. Reuse these exact controls and layout.
- `editor/useAuthoringAssemblyBuild.ts` retains review sessions by exact section/source selection and supplies them to the sole `editor/DocumentWorkbench.tsx` panel. Workbench keys that panel by section and does not pass a region prop. The coordinator/session update and all ownership/acceptance guards remain canonical and unchanged.
- Existing `v2/__tests__/authoringAiDraftAssembly.test.tsx` covers controlled buffer retention and refusal; `editor/__tests__/sourceFirstAssemblyFlow.test.tsx` already walks chooser → exact editor → build → manual regeneration, but checks only selected source manifests. Existing standalone authoringAiDraft and termination tests cover defaults and failed regeneration.
- `server/routes/authoring.router.ts` accepts region/context/requirements as supplied; the existing section-generation service and lineage-backed accept path remain authoritative. No server/provider change is needed or proposed.
- Existing authoringOversight prompts/actions and Workbench remedies already carry saved project/document/section/template identity. No oversight rewrite is needed.

Root and two independent read-only audits searched current generation inputs, session/slot/review consumers, all panel callers, initial and retry request construction, server draft owners, shared contracts, template and source references, tests and deleted draft/assembly/AuthoringAiDraft history. No competing input-retention path was found. The same editor is extended. Root read design SKILL/HANDOFF/README/tokens and the managed runtime/network policy; no deployment or live provider/agency operation is planned.

## Qualification contract

Add optional `generationInputs` to existing AiDraftReviewState, typed `AiDraftGenerationInputs` with tone, region, context and requirements strings. It is an editable buffer for the next draft, not a source manifest, approval, candidate provenance claim or receiving-market inference. Existing states without it remain compatible.

The queue captures a copied input snapshot before awaiting generation, using professional tone, its verified draftRegion, the exact bounded referenceContext and trimmed current requirements; seed the successful retained review with that snapshot. Later changes to the assembly form must not reseed a completed candidate. Keep template context separate from author requirements and selected sources. Queue retries retain their existing explicit semantics.

The existing panel derives its four existing controls from that review buffer, falling back to its existing professional / initialRegion-or-FDA / empty context / empty requirements defaults only when no retained inputs exist. Every explicit control edit updates the same review buffer. Use a latest-state merge in the existing review hook so synchronous edits to different fields cannot overwrite each other. Both standalone and controlled reviews use this one path. Retain options across Close/reopen, section switches and explicit Discard whenever the coordinator retains that review; no durable reload promise is introduced.

The review hook snapshots the actually invoked inputs when an explicit generation begins. A failed or refused generation preserves the prior candidate/body/reason and the chosen options. Candidate/source/context guards, unknown-acceptance holds and no automatic acceptance remain intact. Sources come only from the existing owned reviewSession.sources; generation inputs must not carry or replace source/section/project authority. A context/owner change must still suppress late results. Manual overrides are explicit and are not continuously reset from mutable assembly fields or optional draft metadata.

Root owns production authoringDraftTransport.ts, assemblyDraftQueue.ts, useAuthoringDraftReview.ts and AuthoringAiDraft.tsx; design, human checklist, integration/global gates and normal Git publication. ana_drafting_usecase owns a new focused v2/__tests__/authoringDraftInputs.test.tsx and packet tests/. next_authoring_usecase owns sourceFirstAssemblyFlow.test.tsx and packet workbench/. No concurrent production edits or worker Git/compiler/build/global checks.

Retain meaningful existing-export UI/HTTP RED with source/test snapshots and raw exits before production edits. Then qualify focused and actual editor/source regressions, appropriate existing integration suites, strict zero-growth lint, production build, the seven existing editor/UI/size gates and the normal pre-push TypeScript baseline-zero check. No dependencies/baselines, editor/surface, control, layout/CSS, route, schema, provider or global store changes. Local/Codespaces, concept2cure-v2 only; normal direct commits/pushes, no PR/branch/worktree/force/bypass. Automated synthetic HTTP does not mark human or live-provider/agency acceptance passed.

Selected-section source-window relevance is a valid separate follow-up: authoring-assembly.ts omits the selected title/guidance from its query to the existing deterministic selector. Do not widen this regional redraft completion into that server/manifest change. Exact-target retry-summary wording is also separate.

## Qualified local increment

The existing AnA draft panel now keeps editable generation inputs in the same per-section review buffer that already owns candidate text and review reasons. The queue seeds that buffer from its actual region, bounded template reference and author requirements before review. Draft again uses that section's retained inputs; later edits to the assembly form cannot reseed earlier candidates. Manual control edits persist while the coordinator retains the review. Sources remain solely the owned review session's manifest, and acceptance retains the existing explicit action and lineage safeguards.

- Focused actual-panel suite: **20 passed** (`tests/SETTLED-GREEN-result.json`), after **11 meaningful pre-fix failures / nine passing controls**. Four exact regional requests, manual options, Close/Discard/section remounts, synchronous edits, failures and unknown/currentness holds are covered.
- Actual chooser → one Workbench → selected-source assembly → review/redraft: **13 passed** (`workbench/settled-green.json`), after **four meaningful pre-fix HTTP-body failures**. The four market cases cover FDA, EMA, PMDA and Health Canada; both existing deep-link consumption modes remain represented. Exact original and regenerated payloads include bounded template-reference JSON, author requirements and unchanged source receipt. Later build requirements are deliberately changed; no automatic acceptance, section PATCH or extra structural commit occurs.
- Root final integration: **143 passed / seven different suites** (`integration-final.json`). Existing standalone/controlled draft review, provider truncation, assembly build, mixed manual/AnA preservation, Workbench review and saved-source flows remain intact. The increment qualifies **176 distinct tests across nine suites**, without adding historical rerun totals.
- Strict lint is zero errors/warnings for the three changed transport/queue/hook files and both worker fixtures. AuthoringAiDraft has two legacy function-length/complexity warnings; comparison with its actual pre-change canonical blob proves **no warning-count or metric growth** (301→300 counted lines; complexity43→43). No lint baseline or suppression was changed. The final production build and seven existing editor/UI/size gates pass; post-merge global checks and normal pre-push TypeScript publication are recorded separately.
- `final-qualified-inputs.json` is the union of **55 declared final source/config/test inputs**. This is bounded qualification, not exhaustive dependency closure. Before/after final hashes remain stable.

No markup, stylesheet, control, editor, backend route/schema, dependency, provider configuration or global store was added. Automated tests use synthetic HTTP; no new browser/human/live-provider/agency qualification is claimed. Human worksheet cases111–114 were added as **Not run**; all114 human cases remain unexecuted observations. The retained options are editable next-request inputs, not immutable candidate provenance, scientific verification or approval. Retention does not promise survival across a page reload.

## Historical checks and final-byte review

Both worker RED epochs use existing exports and real panel/Workbench requests, not missing-symbol setup failures. The source-first fixture's first strict lint failure was only unqualified structuredClone; globalThis.structuredClone fixes that without changing assertions. Those raw epochs remain archived.

The first production strict lint attempt exposed the two pre-existing panel warnings. Root's first patch kept warning counts but raised the existing complexity metric43→44. Root changed only its fallback/input merge expression to spread defaults and retained values, keeping complexity43 and shortening the function. `lint-qualification.md`, initial snapshots/receipts and the final numeric-metric comparator retain this distinction. Both workers captured separate settled epochs and root reran the143-case integration after that final expression. Earlier green/gate receipts are historical, not summed or presented as the final source freeze.

Independent final read-only reviews found no blocking issue: generation inputs are copied before provider awaits, existing controls merge against the latest review state, optional metadata cannot infer a region, and source/owner/unknown-acceptance guards stay authoritative. The valid selected-section source-window query improvement remains a separate documented follow-up; it was not implemented in this slice.

## Accepted canonical publication

Source commit **424ca42d805802cec5e79dbb39aea6838e348048** was merged normally with incoming Rule2 commit33694a45a, producing **785b9fbb5b551ff11021d80873d04f305e7d2707**. All55 declared qualified inputs matched actual post-merge Git blobs. The incoming calculator/record-read work has no declared input overlap; root reran all seven whole-tree editor/UI/size gates and the production build after that merge, both passing without input drift (`gates-post-merge.json`, `build-post-merge.json`). The editor test source/config bytes remained unchanged; those test totals are not multiplied by merges.

`publication-code.json` / `publication-code.log.gz` retain the successful normal direct push, with every pre-push gate and the full TypeScript check: **zero errors against baseline zero**. The pushed-file ESLint warning ratchet also passed. A fresh authenticated fetch observed canonical origin at785b9fbb5b551ff11021d80873d04f305e7d2707 with local/remote0ahead/0behind. `accepted-code-verification.json` independently verifies the55 accepted source/config/test blobs and source-commit ancestry. No bypass, baseline increase, force, alternate branch, PR, provider call or deployment.

This documentation follow-up publishes the remaining receipts and artifact manifest. The final read-only check is `verify-publication.py --revision origin/concept2cure-v2 --require-artifacts`: it compares actual accepted Git blobs with every final qualified input and packet artifact, confirms filesystem equality and tracked coverage, and checks source-commit ancestry. Its final console result avoids recursively creating another receipt/commit.
