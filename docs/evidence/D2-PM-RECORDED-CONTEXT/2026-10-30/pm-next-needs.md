# Current Project Management and intelligence review

Reviewed canonical base `47ce1d3d9` and incoming `9c4085a39` (integrated at `944620356`). This is a repository/product review, not deployed customer acceptance. Implementation inventory is in [README.md](README.md#what-already-exists). No additional capability below is reported as completed merely because a service exists.

## What already exists

The core project workflow now has six steps (Plan, Evidence, Author, Review, Submit, Respond), persistent return to the selected step, connected biotech planning/document work and device/diagnostic pathways. `ProjectHome.tsx`, `ProjectPlan.tsx`, `ProjectBiotechPlan.tsx` and `ProjectMdxWorkflow.tsx` own that experience. Reporting has a project-header door; the Vault and dossier link current evidence and editing copies. Current project access checks account for private sharing and the exact saved client anchor.

`server/services/unified-work/unified-work-view.ts` already combines schedule tasks, review/correspondence, tracked filings and the canonical board. It orders blockers before deadlines, and carries per-store read outcomes plus a partial-count caveat. `ProjectWorkPanel` shows these rows; it is not a second task store. `server/services/projects/schedule-of-events/*` already retains milestone actuals during governed replanning and assesses schedule health.

`server/services/intelligence/{project-intelligence-service,recommendation-engine,readiness-scoring-engine,next-best-action-engine}.ts` already own recorded context and deterministic advice. Current readiness explicitly separates unmeasured dimensions from measured completeness, and next actions do not invent impact/effort estimates. `server/services/ana-ri/context-enrichment.ts` and the latest `lumen-context-builder.ts`, `lumen-instruction-engine.ts`, `module-intelligence.ts` compose existing AnA context. The latest prompt-owner and context-budget fixes were retained rather than replaced.

`server/services/tasking/task-planning.ts` already computes a board dependency path and workload advice; `taskManagement.routes.ts` and `taskBoard.routes.ts` expose/normalize them. The old August PM audit's claim that no critical-path engine exists is therefore stale. The current implementation also defaults an unrecorded task duration to eight hours; that is a candidate to correct and qualify before representing its result as a delivery forecast.

## Priorities and client value

| Order | Complete or improve the existing owner | Benefit / important boundary |
| --- | --- | --- |
| 1, this slice | Reach the existing profile in ProjectSide's Memory and profile-instruction cards; finish supported Project settings | Clients can inspect recorded assumptions and maintain agreed priority/target with an audit reason. Saved notes remain distinct from verified evidence; target edits do not silently replan actuals. |
| 2, after the formatter correction | Carry the existing unified-work read into ProjectHome's AnA surface context and a grounded project briefing | Answer “what blocks this project, who owns it and what is overdue?” from the same rows the user sees. Preserve source-read coverage, partial totals, current scope and exact record links. Reuse deterministic ordering; do not add an independent recommendation engine. |
| 3 | Qualify and reach existing dependency/workload calculations from Plan | Explain what a proposed delay affects. Distinguish recorded estimates from assumed durations, calendar targets from effort and a dependency path from a validated completion forecast. Retain actuals and require review before rescheduling. |
| 4 | Extend current project portfolio/reporting with an explainable client-project exception view | CRO/consultancy leaders can see projects needing attention without crossing sponsor scope. Reuse Projects' current client/pathway filters and Reporting's existing source-bound exports. Show unread projects as unavailable, never healthy. |
| 5 | Connect changed evidence to existing where-used, review, response-clock and assignment owners | Identify which filing sections or decisions need a person after a source changes. Reuse recorded lineage and current review standing, then propose the next governed task; never silently invalidate or approve documents. |

For biotech/pharma, prioritize CMC/nonclinical/clinical dependencies and the correct modality/agency rather than a generic IND checklist. For device teams, prioritize risk/design-control traceability, predicate rationale and the pathway's actual assembly. For IVD/CDx, prioritize analytical/clinical performance questions and recorded classifications, with device/drug co-development dependencies explicit. For CRO/consultancy, client ownership, handoffs and portfolio scope come first. The current registry also includes Health Systems and Academic/IIT; use their existing study/protocol/IRB owners and state what is recorded, without inferring committee approval or filing readiness. None of these variations should introduce a parallel project or intelligence application.

## Practical delivery order

Publish and qualify the bounded settings/context completion first. The next useful coding slice is item 2: an existing-work grounded briefing. Start with the canonical work response and its current access/partial-source contract, then test missing-store, stale session and cross-client cases before exposing recommendations. Additional model tools, providers or numerical forecasts are unnecessary to deliver that value.

## Product review correction retained

The independent niche review found that the existing AnA profile formatter (`context-enrichment.ts#enrichWithProjectSummary`) did not use the canonical risk/decision fields. It could print `[object Object]`, default severity to medium and mark any saved decision pending. This correction belongs before a grounded briefing: repair the existing formatter and retain provenance/unknown values, rather than assume that showing correct cards guarantees correct model context. The current delivery includes that bounded correction and its actual enrichment regression.

The next briefing must preserve unknown ownership: unified work currently carries ownerName, not a verified account ID. A name cannot grant assignment identity. Dependency qualification must also address the existing DFS visited-set treatment of converging paths, not only the unsourced eight-hour default, before publishing a delivery forecast.

A final current-source review also exposed completed/cancelled board tasks retaining dependency IDs and incorrectly contributing blockers. The existing unified-work adapter is now corrected, with three failing cases observed first and all26 pure/partial-source cases passing afterward. This removes a misleading briefing input; it does not complete the briefing or establish a delivery forecast.

Canonical catch-up through0ad3a15ce also retains the new entry from Plan into the existing Study and Protocol Design and eligible core work, with actual Plan/core/protocol regressions requalified alongside PM settings/context. This strengthens project initiation without a separate project or intelligence store. The briefing and dependency-qualification priorities above remain.

Canonical device catch-up through ed5c91058 also preserves the project-to-Engineering Risk and Design controls navigation, persisted design-control reads, current access and signed-risk safeguards. This directly serves device/diagnostic clients inside their existing project workflow. It does not turn historical profile notes into the controlled risk register; their sources and standing remain distinct.
