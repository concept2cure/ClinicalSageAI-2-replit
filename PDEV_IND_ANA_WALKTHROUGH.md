# PDEV → IND: AnA conversation walkthrough

> Demonstrates the CIRM-slide claim — "AnA drives the whole PDEV → IND workflow through natural conversation" — concretely, turn by turn.
>
> Each turn shows: **what the user says → which of the 20 PDEV commands AnA selects → the params it fills → the service it calls → what comes back → how AnA replies.**
>
> The commands, their metadata, and the dispatch are defined in `server/services/ana-ri/pdev-command-handlers.ts`; they reach the LLM tool-use surface through `COMMAND_REGISTRY` in `server/services/ana-ri/command-executor.ts`. Read-only verbs run immediately; governed mutations require an explicit `confirm: "yes"` + a `reason` (the chat layer captures these across a confirm turn via the pending-action store).

This is a documentation artifact. It does not change behaviour; it shows the behaviour already shipped (#534) plus the terminal IND-clearance transition added in this PR.

---

## Scenario

A VP Regulatory at a biotech is preparing the IND for **OR-801** (refractory anemia). The program already exists as a `regulatory_programs` row with id `or-801-uuid`. The numeric project id behind it is `99`. We follow the program from "where do we stand" through IND clearance.

Roles in play: the VP (`regulatory_lead`), a nonclinical reviewer (`regulatory`), and AnA.

---

### Turn 1 — situational awareness (read)

> **VP:** "Where does OR-801 stand for IND, and what's blocking us?"

- **Intent:** status + blockers → two read commands.
- **AnA calls:** `pdev.program.readiness` with `{ programId: "or-801-uuid" }`.
- **Service:** `pdevReadinessService.computeReadiness()` → per-workstream rollups + findings.
- **Returns:** `overall.readinessScore = 38`, findings include 3 `blocker` entries (e.g. "Module 3 CMC package depends on cmc.gmp_readiness which is drafting").
- **AnA replies:**
  > "Overall PDEV readiness is 38%. Three IND-blocking items: GMP readiness is still drafting (blocks the Module 3 package), the GLP tox summary has no owner, and the Pre-IND briefing book is not started. CMC is your weakest workstream at 30%. Want me to open CMC or start a draft?"

No confirmation needed — read-only.

---

### Turn 2 — drill into a workstream (read)

> **VP:** "Show me CMC."

- **AnA calls:** `pdev.program.workstream` with `{ programId, workstream: "cmc" }`.
- **Service:** `pdevOrchestrator.getProgramView()` filtered to CMC.
- **Returns:** rollup (`completed 4 / total 14`, readiness 30) + 14 activity rows with states.
- **AnA replies:**
  > "CMC: 4 of 14 activities complete, readiness 30%. Drafting now: drug-substance manufacturing, GMP readiness. Not started: batch records, comparability. The blocker on the Module 3 package traces to GMP readiness. Should I draft the GMP readiness memo?"

---

### Turn 3 — generate a governed AI draft (mutation)

> **VP:** "Draft the GMP readiness memo."

- **AnA recognises a governed mutation.** First turn returns a confirmation request (no `confirm` yet):
  > "This will generate an AI draft for `cmc.gmp_readiness` and file it as a governed artifact. Reply with a reason to confirm."
- **VP:** "Go ahead — reason: prepping the Module 3 package for the Pre-IND."
- **AnA calls:** `pdev.activity.ai_draft` with `{ programId, activityKey: "cmc.gmp_readiness", projectId: 99, confirm: "yes", reason: "prepping the Module 3 package for the Pre-IND" }`.
- **Service:** `pdevAiDraftingService.generateActivityDraft()` → `generateStructuredResponse` produces the text → `executeGovernedAnaOperation` runs the quality gate, decision lineage, and persists to `concept2cure_artifacts` with `provenance.pdevActivityKey = cmc.gmp_readiness` → activity state advances to `ai_draft_generated`.
- **Returns:** `{ artifactId: "artifact_8fz1", qualityGrade: "B", documentCode: "cmc-gmp-readiness-memo", ectdSection: "3.2.A.1" }`.
- **Audit:** `pdev_ai_draft_generated` (dual-write hash chain).
- **AnA replies:**
  > "Drafted the GMP readiness memo (quality gate B, 740 words). Filed against `cmc-gmp-readiness-memo`, mapped to eCTD Module 3 §3.2.A.1. The activity moved to ai-draft-generated. It still needs evidence and review before it can be approved."

---

### Turn 4 — attach evidence (mutation)

> **VP:** "Attach the CDMO facility qualification report — evidence id ev-7714 — and note it supports the readiness claim."

- **AnA calls:** `pdev.activity.evidence_attach` with `{ programId, activityKey: "cmc.gmp_readiness", evidenceObjectId: "ev-7714", linkType: "supports", rationale: "CDMO facility qualification supports GMP readiness", confirm: "yes", reason: "<the VP's note>" }`.
- **Service:** `pdevEvidenceAttachService.attach()` → creates an `evidence_links` row (`targetType = pdev_activity`), advances state to `evidence_linked`.
- **Audit:** `pdev_evidence_attached`.
- **AnA replies:**
  > "Attached ev-7714 to GMP readiness as supporting evidence. The activity is now evidence-linked and ready for review."

---

### Turn 5 — try to approve too early (the dependency gate fires)

> **VP:** "Approve the Module 3 CMC package."

- **AnA calls:** `pdev.activity.set_state` with `{ programId, activityKey: "regulatory.module_3_cmc", state: "approved", confirm: "yes", reason: "..." }`.
- **Service:** `checkStateTransition()` runs first. `regulatory.module_3_cmc` depends on `cmc.gmp_readiness`, `cmc.batch_records`, `cmc.stability_program` — not all completed.
- **Returns:** `{ success: false, error: "DEPENDENCY_BLOCKERS", data: { blockers: [...] } }`.
- **AnA replies:**
  > "I can't approve the Module 3 package yet — three dependencies aren't complete: GMP readiness (evidence-linked), batch records (not started), stability program (drafting). Want me to walk those to completion first, or override with a documented justification?"

This is the dependency gate doing its job — no silent bad state.

---

### Turn 6 — start a real approval chain (mutation)

> **VP:** "Start the approval chain for the GMP readiness memo to approved. Reason: tox and stability data are clean and RA has reviewed."

- **AnA calls:** `pdev.workflow.kickoff` with `{ programId, activityKey: "cmc.gmp_readiness", targetState: "approved", confirm: "yes", reason: "tox and stability data are clean and RA has reviewed" }`.
- **Service:** `pdevWorkflowBridge.kickoff()` → creates a `workflow_runs` row (`workflowType = pdev_activity_approval`) + 2 `approval_checkpoints` (reviewer, then approver); the activity is held at `human_review_required`.
- **Audit:** `pdev_workflow_kickoff`.
- **AnA replies:**
  > "Started a 2-step approval chain for GMP readiness → approved. Step 1 (workstream reviewer) is awaiting review; step 2 (regulatory approver) follows. The activity is held at human-review-required until both clear. Workflow run `wf-3120`."

---

### Turn 7 — reviewer clears step 1 (mutation, different actor)

> **Nonclinical reviewer:** "Approve my checkpoint on wf-3120 — reason: facility qual and batch summary check out."

- **AnA calls:** `pdev.workflow.decide` with `{ workflowRunId: "wf-3120", checkpointId: "cp-1", decision: "approve", confirm: "yes", reason: "facility qual and batch summary check out" }`.
- **Service:** `pdevWorkflowBridge.recordDecision()` → `decideCheckpointOutcome` returns `outcome: advanced` → step 1 marked `approved`, step 2 activated.
- **Audit:** `pdev_workflow_checkpoint_approved`.
- **AnA replies:**
  > "Step 1 approved. Step 2 (regulatory approver) is now awaiting review."

---

### Turn 8 — approver clears step 2, activity completes (mutation)

> **VP:** "Approve the final checkpoint — reason: signed off, ready for the package."

- **AnA calls:** `pdev.workflow.decide` with `{ workflowRunId: "wf-3120", checkpointId: "cp-2", decision: "approve", confirm: "yes", reason: "signed off, ready for the package" }`.
- **Service:** `recordDecision()` → `decideCheckpointOutcome` returns `outcome: completed` → workflow run `completed` → `cmc.gmp_readiness` moves to `approved`.
- **Audit:** `pdev_workflow_completed`.
- **AnA replies:**
  > "Chain complete. GMP readiness is approved. That clears one of the three Module 3 dependencies — batch records and stability are still outstanding."

---

### Turn 9 — check IND assembly readiness (read)

> **VP:** "How ready is each module for IND?"

- **AnA calls:** `pdev.program.ind_assembly` with `{ programId }`.
- **Service:** `pdevIndAssemblyService.getReadiness()` → M1–M5 mandatory-document presence.
- **Returns:** `overallReadiness = 64`, Module 3 at 70% with 4 mandatory blockers.
- **AnA replies:**
  > "IND assembly readiness is 64%. Module 1 is at 90%, Module 2 at 60%, Module 3 at 70% (4 mandatory documents still missing), Module 4 at 55%, Module 5 at 50%. This is a readiness view, not eCTD publishing. You're not ready to compile yet."

---

### Turn 10 — roll up FDA Pre-IND feedback (read then mutation)

> **VP:** "We got our Pre-IND minutes back. What commitments need to land in PDEV?"

- **AnA calls:** `pdev.fda_feedback.proposals` with `{ programId }`.
- **Service:** `pdevFdaFeedbackRollupService.proposeRollup()` → matches unrolled `q_sub_commitments` to activities by token overlap.
- **Returns:** 2 commitments, each with a proposed activity + confidence.
- **AnA replies:**
  > "Two open FDA commitments. cm-1142-1 ('provide 6-month stability') best matches `cmc.stability_program` (confidence 0.74). cm-1142-2 ('justify starting dose') matches `nonclinical.dose_selection_rationale` (0.81). Apply both?"
> **VP:** "Yes — reason: post-Pre-IND triage."
- **AnA calls:** `pdev.fda_feedback.apply` with the two mappings + `confirm: "yes"` + reason.
- **Service:** `applyRollup()` → appends each commitment to its activity's notes, advances them to `agency_feedback_received`, marks commitments `rolled_in`.
- **Audit:** `pdev_fda_feedback_rolled_up` per mapping.
- **AnA replies:**
  > "Applied both. Stability program and dose-selection rationale now carry the FDA commitment text and are flagged agency-feedback-received."

---

### Turn 11 — provenance for an auditor (read)

> **Quality auditor:** "Where did the nonclinical Module 2.4 summary come from?"

- **AnA calls:** `pdev.activity.provenance` with `{ programId, activityKey: "nonclinical.ind_enabling_summary" }`.
- **Service:** `pdevProvenanceTraceService.trace()` → stitches activity state + evidence + artifacts + lineage + audit.
- **Returns:** 1 artifact (`artifact_xyz`, sha256 hash), 3 evidence objects, 4 lineage edges, 12 audit events.
- **AnA replies:**
  > "The Module 2.4 summary traces to artifact `artifact_xyz` (sha256:dead…), generated from 3 evidence objects via AI generation (model claude, confidence 88). Twelve audit events touch it, from draft through approval. Want the PDF traceability export?"

---

### Turn 12 — compile once ready (high-consequence mutation)

After the remaining Module 3 / 4 / 5 dependencies are walked to approved (turns omitted — same pattern as 6–8), readiness clears the threshold.

> **VP:** "Compile the IND eCTD assembly for submission 99. Reason: all blockers cleared, RA and QA sign-off complete this week."

- **AnA calls:** `pdev.ind_assembly.compile` with `{ programId, submissionId: 99, confirm: "yes", reason: "<≥30 chars>" }`. (This command enforces a 30-char reason floor — the most consequential PDEV verb.)
- **Service:** `pdevEctdCompileService.compile()` → confirms readiness ≥ threshold → invokes the existing `generateEctdPackage`.
- **Returns:** `{ status: "compiled", package: { filename, sizeBytes, stats } }`.
- **Audit:** `pdev_ectd_compiled`.
- **AnA replies:**
  > "Compiled the IND eCTD assembly — `ectd_OR-801_seq0000.zip`, 14.2 MB, 312 files across 5 modules. Readiness was 96% at compile. This is assembly readiness; the existing eCTD pipeline produced the package."

If readiness were below threshold, the service returns `refused_low_readiness` and AnA reports the blocker list instead, offering the audit-flagged force path.

---

### Turn 13 — close the loop: IND clearance (terminal transition)

After submission and the FDA 30-day review window, the VP records clearance.

> **VP:** "FDA cleared the IND. Mark ind clearance as submitted. Reason: FDA safe-to-proceed letter received, no clinical hold."

- **AnA calls:** `pdev.activity.set_state` with `{ programId, activityKey: "regulatory.ind_clearance", state: "submitted", confirm: "yes", reason: "FDA safe-to-proceed letter received, no clinical hold" }`.
- **Service:** writes the activity state, then `applyIndClearanceIfTerminal()` fires because the activity is the clearance activity reaching a completing state → `regulatory_programs.status = 'approved'`, `approvalDate = now`, `metadata.indClearedAt` set.
- **Audit:** `pdev_activity_state_change` + `pdev_ind_cleared`.
- **AnA replies:**
  > "IND clearance recorded. OR-801 has reached its terminal state — the program is marked cleared (approved), clearance-dated today. That's the singular expected PDEV outcome. The program is ready to hand off to CLIN2."

This closes the CIRM slide's single outcome: **IND Clearance.**

---

## Coverage map: every PDEV command exercised

| Turn | Command | Class |
|---|---|---|
| 1 | `pdev.program.readiness` | read |
| 2 | `pdev.program.workstream` | read |
| 3 | `pdev.activity.ai_draft` | governed |
| 4 | `pdev.activity.evidence_attach` | governed |
| 5 | `pdev.activity.set_state` (gated) | governed |
| 6 | `pdev.workflow.kickoff` | governed |
| 7 | `pdev.workflow.decide` (advance) | governed |
| 8 | `pdev.workflow.decide` (complete) | governed |
| 9 | `pdev.program.ind_assembly` | read |
| 10 | `pdev.fda_feedback.proposals` + `pdev.fda_feedback.apply` | read + governed |
| 11 | `pdev.activity.provenance` | read |
| 12 | `pdev.ind_assembly.compile` | governed (30-char reason floor) |
| 13 | `pdev.activity.set_state` → IND clearance terminal | governed |

Not shown but available in the same conversational style: `pdev.registry.list`, `pdev.program.get`, `pdev.program.fda_interactions`, `pdev.program.contradictions`, `pdev.activity.evidence_list`, `pdev.activity.evidence_detach`, `pdev.readiness.snapshot`, `pdev.workflow.status`. That is the full set of 20 PDEV commands.

---

## What governs every mutation in this transcript

- **Confirmation + reason** on every governed verb (the chat layer captures them across a confirm turn via the pending-action store).
- **Tenant isolation** — every service joins `regulatory_programs.organization_id` before reading or writing.
- **Dependency gate** — promotion into a completed state is refused unless the registry `dependsOn` chain is satisfied (turn 5), or force-overridden with an audit flag.
- **Dual-write tamper-proof audit** — every action emits an `agent.ana.pdev.*` (AnA-initiated) or `pdev_*` (route-initiated) audit event with actor, reason, and resource identity.
- **Quality gate** — AI drafts that grade `rejected` are refused before persistence (turn 3).
- **Honest labels** — IND assembly compile is "assembly readiness", not new eCTD publishing (turn 12); the program reaching `approved` denotes IND clearance, recorded with `indClearedAt` (turn 13).
