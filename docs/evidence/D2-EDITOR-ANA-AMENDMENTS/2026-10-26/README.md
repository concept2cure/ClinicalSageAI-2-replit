# W1 / D2 — Complete existing AnA editor amendments

## What already exists

- `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx` is the sole existing workbench. Its saved authoring context, AnA conversation and version/model-checked `EditorBridge.propose` are reachable; the bridge already issues scoped application receipts. It does not supply a versioned insertion proposal.
- `client/src/concept2cure/v2/editor/AuthoringOversightActions.tsx` and `authoringOversight.ts` connect saved section/document/evidence review and targeted fixes to the existing AnA conversation. Prompts already require complete paged saved reads, deterministic critique, exact template guidance, filing context, original-record limits and project evidence. Structured fixes describe replacements/deletions only.
- `shared/authoring/remedies.ts` parses bounded, explicit `authoring-remedy` JSON and rejects unknown fields, incomplete versions and blank quotes. `editor/AuthoringRemedies.tsx` renders the existing cards, opens the proper section, applies through the bridge and observes application state. Neither represents an addition.
- `editor/suggestions.ts` owns tracked changes, exact quote resolution, context disambiguation, reversible markdown placement, mark ownership, application IDs and selection preservation. Its `proposeReplacement` only strikes a nonempty quote then inserts replacement text. Generic `insertSuggestedContent` already writes attributed drafts at the person's selection; it cannot safely substitute for a precise versioned insertion remedy.
- `editor/RichSectionEditor.tsx` owns hydration, Restore/Discard admission, source/read-only refusal, content serialization and proposal lifecycle. It already exposes the same `proposeReplacement` command; no second handle, editor or writer is needed.
- `server/services/ana/authoring-read-tools.ts` reads the actual saved outline and section text with versions, pending-change labels and paging. `server/services/authoring/machine-claim-verify.ts` parses the same remedy schema to verify quoted/replacement words against recorded AnA answers; extending that parser reaches the existing attribution verifier.
- The existing draft/accept paths already supply whole-section generation. RichSectionEditor's empty-section drafting request targets the current section; Workbench's no-document CTA appropriately requests a new document. Those are unchanged.
- Existing tests cover replacement/deletion, fidelity, model/base refusal, scoped receipts and the actual Workbench-to-conversation-to-remedy flow. They will be extended with insertions; no parallel host is introduced.

Searches covered editor/proposal/amend/audit/rewrite/insert names in client surfaces, server routes, authoring and AnA services, shared contracts, stored-record/migration paths, and `git log --all --diff-filter=D` for authoring, remedies, suggestions and insertion names. Historical editor/router removals do not supply a missing canonical insertion remedy. Current canonical branch fetched at `e9ee6b110ed01b7f28ab3e5cf2133871c5f13348`, clean and 0/0; current client-journey handoff read. No current API/tool/table for applying versioned insertion remedies was found beyond the one proposal path above.

## Contract

Complete the existing AnA tracked-remedy path, W1 / D2. The user's requested writing, amendment and auditing are connected through the existing editor, conversation, saved-document readers and project evidence. This increment supplies the missing insertion operation; it does not assert full human-operation parity or regulatory completeness.

- Optional `operation`: `replace` (legacy default), `insert-before`, `insert-after`, `insert-empty`. Retain the existing `quote` and `replacement` fields; replacement carries proposed addition text for insertion operations.
- Before/after requires a nonempty exact quote, genuine saved base and nonempty addition. Existing quote ambiguity/context/pending-change checks apply. Anchor text is not deleted. A one-paragraph addition is inline; structured blocks are admitted only at the named textblock's boundary, and own their inserted structure so rejecting restores the original. No automatic repositioning, flattened fallback or document-wide search for a convenient substitute. Every new structured block must contain attributable text so rejection can remove it; markless tables and mixed markless/ordinary additions refuse atomically. A no-op produces no success receipt.
- Empty insertion requires explicit operation, an exactly empty quote, no prefix/suffix, nonempty proposed text, and a live document consisting of a single truly empty paragraph. Existing text, pending changes, tables, atoms, citations, media or other structure refuses. No caret guessing and no silently replacing a nonempty section.
- Every operation passes the same existing model, target section, saved hash/time, editor hydration, Restore/Discard and editable-mode checks. Keep application ID, turn attribution, scoped receipts and review lifecycle. Selection remains mapped, with no forced focus/scroll.
- Invalid operations and combinations refuse in the shared parser and editor command. Legacy replacement/deletion stays compatible. The bounded parser is reused by server attribution verification.
- The existing card markup/classes convey Anchor/Addition or Empty section/Addition, never falsely show deletion of an insertion's quote. Existing oversight prompts explain exact operations, source-supported additions and missing evidence. Template/market expertise stays grounded in the existing canonical references and readers, not an invented specialist or unverified scientific claim.
- Move the existing pure quote/context resolver out of over-limit `suggestions.ts` into `editor/proposalAnchor.ts`, retaining one implementation and unchanged lookup semantics. The existing `suggestions.ts` export/command stays the application door. This pays for the insertion logic without growing its existing line-count warning; it is an internal extraction, not a second proposal controller.
- No auto-save, auto-accept, approval, filing or signing. No new editor, surface, tool, controller, API, schema, dependency or CSS. No provider or agency calls/deployment; local automated qualification only.

## Verification and publication

Before production edits, demonstrate actual insertion failures against the current command/parser/host. Retain all RED and GREEN receipts with source hashes; distinguish fixture/setup failures. Test reversible inline/block/empty changes, anchors and ambiguity, pending overlaps, unsupported structure, untouched selection, reload/reject/accept, model/base/read-only refusal and actual editor application. Qualify shared server machine-word attribution. Run scoped lint with no warning growth, existing editor/UI/size gates, build, and normal pre-push compiler baseline 0 sequentially. Publish directly to `concept2cure-v2` with normal hooks; no PR or deployment. Human acceptance remains pending and is added to the existing Codespaces checklist.

## Results

Insertion qualification: **262 distinct tests across 11 suites pass**, no declared input drift (`insertion-integration.json`). The nine original/reused suites contribute 182; focused additions 65; actual Workbench/conversation flow 15. Repeated worker/candidate runs are not counted again.

Preserved prepatch failures: root parser/prompt/machine-attribution checks 5 failed / 20 passed; command checks 20 failed / 33 passed; actual host 6 failed / 9 passed. Candidate epochs retain a duplicate-whitespace fixture calibration and card-label overassertion separately. Root's first integration exposed one real legacy refusal regression (blank quote changed from not-found); the existing assertion was preserved and production ordering corrected. Independent edge review then reproduced 5 failures / 57 passes: unsupported list-edge flattening and markless table success. Release command checks 65/65 and final combined 262 are against the corrected implementation. No original product assertion was weakened.

Final insertion lint has zero errors and the same eight existing `suggestions.ts` warnings; its counted lines shrink **1227→1158**. New helper, parser, cards, prompts and scoped root fixtures have zero warnings. Intermediate extra complexity warnings were resolved without suppressions or baseline changes; raw receipts are retained. The pure existing anchor resolver was moved once, not duplicated.

All **124 human checklist cases remain Not run**, including new 119–124. No live provider/agency, native-database browser, deployment, complete regulatory oversight, full human-operation parity or customer acceptance is claimed. Context correction, final build/gates and normal publication are recorded below when settled.

## Contextual expertise follow-through — existing section guidance

### What already exists

- `server/services/lumen-context/sections.ts` holds the legacy US/IND section playbooks. Its `buildSectionSpecificPrompt(sectionCode)` interprets bare numbers 1–5 as CTD module numbers, with FDA/IND recommendations, without a document scope.
- `server/routes/ana-ri/stream.ts` and `server/services/ana-ri/chat-context-builder.ts` both append that playbook using a client authoring/route section code. Both already prefetch `openDocumentRegistryId` through the canonical `server/services/ana-ri/open-document.ts` saved-template reader. The latter verifies recorded template identity before a surface label and reports unread/unknown state. The existing OPEN DOCUMENT brief supplies exact type/outline/basis; saved review readers supply section-scoped limits. These must remain the subject-matter context.
- `server/services/lumen-context-builder.ts` also calls the same helper in `buildContextAwarePrompt`, reached by `server/routes/cortex-unified.ts`. That path has no canonical open-document read, so its section number cannot authorize an automatic US/IND playbook.
- `server/services/ana/AnaDocumentDraftingService.ts` already has regional/device drafting requirement resolution. This correction does not create another drafting engine or replace it. A generic FDA supplement alongside correct regional guidance remains misleading and must be suppressed.
- Existing actual chat/stream and open-document tests supply fixtures to prove caller wiring. Current and deleted section/context/playbook names were searched; there is no existing scope guard at these three call sites.

### Corrective contract

Extend the existing helper with a scope argument, admitting its US/IND playbook only for exact canonical registry `US_IND`. Missing, unknown, unread, global component, protocol, device, lab, Canada, EU or Japan scope returns null; no region inference from a code/title/module/project. Both canonical chat doors pass their already-prefetched open-document registry. The Cortex convenience path passes null because it has no verified document scope; do not silently trust its client submission label. Preserve the OPEN DOCUMENT brief and existing exact template/section reference readers, without new API/tool/provider/model/surface. Test real helper output and all three caller wiring; preserve a meaningful prepatch RED. This removes misleading context, not a guarantee of all-market regulatory correctness or full human-operation parity.


## Context correction qualification

`context/RED-result.json` records **27 failed / 86 passed** against the old helper: wrong-scope and missing-scope outputs, both actual chat callers, and the actual Cortex convenience path. Final context checks pass **113/113 across six suites**, with exact input snapshots and no drift. Existing CTD/CSR content assertions are unchanged and now state their US IND scope explicitly.

The first candidate context run retained one fixture failure: the stream harness returned a shared mutable orchestration object, carrying the previous test's appended prompt into a later null-scope test. Its local fixture now returns a fresh object for each turn, matching the real orchestrator; the prior raw epoch is retained. This was not a product bypass.

All four context production files retain their baseline lint counts and metrics: stream 25, shared chat builder 5, lumen builder 6, section playbooks 0. Six focused context test files have zero lint warnings/errors. The guard is one existing helper plus its three existing callers. It suppresses a mismatched supplement; it does not add another SME resolver or qualify live model answers.

## Canonical integration

A normal fetch found five incoming canonical commits through `7eec00355` (project-creation wizard convergence and unstated pediatric evidence). None overlaps the declared insertion inputs. The incoming AnA index, client surface-actions and shared action registry are runtime dependencies, so the combined checks, build and repository gates are repeated after the normal merge. Incoming work is retained without rewriting its history. Root owns this final integration and normal direct publication.


## Final combined local verification

After the normal merge, **497 distinct tests across 21 suites pass** (`integration-post-merge.json`), with no drift across the **75 declared source/config/test inputs**. This includes all insertion and context suites plus retained saved-document identity, earlier-template outline, saved/pending authoring-reader and regional drafting regressions. Worker repetitions are not added to that total. The original 54 declared inputs are unchanged by the 21 incoming runtime files.

All seven existing editor/UI/repository-size gates pass (`gates-post-merge.json`), without changing any baseline, entitlement, style rule or model gate. Both independent scoped reviews report no blocker in the completed contracts. The build and normal publication/compiler receipts are retained once finished. No deployment was attempted.


`build-post-merge.json` records a successful full client/server build (19.114s), no declared input drift. Read-only pre-publication verification matched all 75 declared files to actual Git blobs at `05c736c4cb74b3425e1d3876a9114f2d3fea91da`; the completed source commit is `f4c692b090fb6c4d2d012c1d149697e46df6b6fd`. Normal direct push runs every hook, including the full TypeScript baseline 0 check. Its actual outcome is recorded in `publication-code.json` after completion.


## Practical limits and next existing-path completions

The new insertion operations cover tracked text, headings, lists and tables supported by the existing markdown subset. They do not expose every rich-editor toolbar operation to AnA. Governed saving, accepting, approval, signing and filing retain their existing distinct controls and authority.

The scope guard uses the resolved **open document** registry. It does not choose a section-scoped assembly template when that section differs from its parent; the existing saved-review/template readers and section-specific oversight instructions remain necessary. This increment also does not automatically load recorded template guidance into the standalone `/sections/:sectionId/ai/draft` request. The worker's `workbench/deferred-context-audit.md` preserves that read-only finding; its original general chat-context finding was subsequently corrected in `context/`. Those are concrete candidates for continued completion of the existing paths, not a second editor or SME engine. Full human-operation parity and live subject-matter performance remain unqualified.


## Concurrent canonical documentation and normal retry

The first normal push passed every hook, including full TypeScript **0 errors**, then received a fetch-first refusal because canonical advanced during qualification. The exact original receipt and raw output are preserved together in `publication-attempt1/` (no hook bypass or forced update).

Fresh fetch found documentation-only commit `301ca385c8eb194cc0e29c8db360b65c25a81e3c`. Its new AGENTS placement direction, current handoff and canonical information architecture were read. They preserve the single editor/central-service ownership followed by this change. Normal merge `6c1c3fca879a7a02c66f7a897ce45d79cc273129` retains that direction. `docs-merge-input-verification.json` proves all 75 qualified source/config/test blobs unchanged, so the 497 tests, build and gates remain applicable. The normal retry still runs all push hooks.


## Accepted canonical publication

Normal direct source publication succeeded at **`6c1c3fca879a7a02c66f7a897ce45d79cc273129`** (source commit `f4c692b090fb6c4d2d012c1d149697e46df6b6fd`). `publication-code.json` and its raw gzip record every normal hook, no new lint errors/warnings, unchanged repository-size ceilings **56 /114**, and full TypeScript **0 errors**, followed by the successful update to `concept2cure-v2`.

Fresh authenticated fetch found **0 ahead /0 behind**. `accepted-code-verification.json` verifies all **75 actual Git source/config/test blobs** and source ancestry at the fetched canonical revision. The final artifact manifest hashes the entire evidence packet, including each earlier failure/calibration and the refused first publication. The following normal documentation publication carries these receipts and the updated local human-testing handoff; the read-only verifier checks its accepted revision without creating a recursive receipt.

The product remains local/Codespaces only. All124 human cases remain **Not run**; no live AnA/provider, agency or deployment result is asserted. This completed increment expands and corrects existing AnA editing; it does not establish all editor-action parity or qualified subject-matter performance.
