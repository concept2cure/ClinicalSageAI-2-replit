# Final Document System Project and Build Plan

**Date:** 2026-03-27
**Branch:** `concept2cure-v2`
**Status:** Approved planning spec for Claude Code execution
**Purpose:** Single source of truth for the next Concept2Cure document-system execution sprint.

---

## 1. Final Judgment

Claude’s latest note changes the execution order slightly, but **not** the architecture.

### What stays true
- Concept2Cure’s main gap is still **productization, staging, and workflow legibility**, not raw capability.
- The locked product model still stands:
  1. AnA is the single visible guide identity
  2. Project home is conversational first
  3. Tools is secondary and intentional
  4. EditorPanel is canonical
  5. Every document creation path must converge into EditorPanel
  6. No duplicate document worlds
  7. No dead-end builders
  8. Draft → Review → Verify → Publish must become explicit and calm

### What changes from Claude’s latest note
Claude is directionally right that:
- **A + C + D can run in parallel**
- **everything else flows from A**

For this plan, that means:

### Parallel planning tracks
**A. Weave parity matrix**
**C. Anthropic drafting-sequence spec**
**D. Convergence decisions**

can run in parallel.

### Sequential dependency
**B. Current document-system reality map** is still the keystone because it determines:
- what is actually true in the repo
- what existing flows are already converged
- what is only hidden vs truly missing
- what can be simplified vs what must be expanded

So the best interpretation is:
- A + C + D run in parallel
- B is treated as the repo-truth gate
- implementation begins only after A + B + C + D are all complete and reconciled

---

## 2. Strategic Positioning

Claude’s competitor summary is a valid execution assumption:

### Weave-visible categories we must match
1. IND drafting
2. Data Room / Ask
3. HAQ workflow
4. eCTD-aware submission builder
5. review / verification / source tracing
6. versioning / restore / collaboration
7. governed publish / export / dossier progression

### Where Concept2Cure is already stronger
Use this as positioning, not as an excuse to skip parity:
- biostatistics (7-module engine)
- precedent intelligence (CRL/RTF patterns)
- risk scoring (Foresight AI)
- protocol design (12 trial types)
- medical-device workflows (510(k)/PMA/CER)
- multi-agency coverage (FDA + EMA + PMDA + HC + TGA)
- AnA RI specialist intelligence
- real-time compliance / RIM

**Rule:** parity first in visible drafting workflow, superiority second in specialist depth.

---

## 3. The Final Product Story

Concept2Cure must feel like one regulated drafting system with one human-legible sequence.

## Primary story
**Project Home (AnA)**
→ **Open Tools** or choose suggested action
→ **Create / Resume / Generate document**
→ **EditorPanel**
→ **Review**
→ **Verify**
→ **Publish / Export / Submission readiness**
→ **Return to project context**

## Emotional hierarchy
- Home = conversation
- Tools = making / continuing work
- Editor = where work happens
- Review / Verify / Publish = visible lifecycle stages, not hidden controls

---

## 4. Project Plan

### Phase 0 — Freeze Truth (planning outputs only)
Claude must create and reconcile these 4 files before any implementation:

1. `docs/audits/WEAVE_PARITY_MATRIX_2026-03-27.md`
2. `docs/audits/CURRENT_DOCUMENT_SYSTEM_REALITY_2026-03-27.md`
3. `docs/plans/ANTHROPIC_DRAFTING_SEQUENCE_SPEC_2026-03-27.md`
4. `docs/plans/DOCUMENT_SYSTEM_CONVERGENCE_DECISIONS_2026-03-27.md`

### Parallelism rule
Run these in parallel where useful:
- Weave parity matrix
- Anthropic drafting sequence spec
- convergence decisions draft

But do not finalize any of them until the current-reality map is complete.

### Why this phase matters
Without this phase, Claude will drift into either:
- feature chasing
- UI theory detached from repo truth
- overpreserving architecture-shaped UX
- claiming parity where the repo only has backend fragments

---

### Phase 1 — Real Tools Workbench
Build the real Tools landing.

Tools must clearly expose:
- Resume document
- Recent documents
- Create new document
- Document Builder
- Templates
- Dossier Map
- Vault / Data Room
- Review
- Submit
- HAQ Manager entry (if still partial, clearly marked as structured response workflow, not fake)

**Rule:** FullDocumentBuilder becomes one option inside Tools, not the Tools destination.

---

### Phase 2 — Canonical Creation-Path Completion
Every document creation path must end in EditorPanel:
- blank
- template
- builder output
- AnA draft
- precedent draft
- app-generated draft
- section scaffold
- existing artifact open

No exceptions.

---

### Phase 3 — Editor Lifecycle Restructure
Make the editor workflow human-legible.

The user must understand:
- what document is open
- where it belongs
- what stage it is in
- where review happens
- where verification happens
- where publish/export happens
- how to get back

Make Draft / Review / Verify / Publish visible as one system.

---

### Phase 4 — Data Room / Ask
Productize vault + deep research into a visible document support loop:
- upload files
- semantic search
- ask questions
- trace answers to sources
- use results to draft or verify

---

### Phase 5 — Dossier / Submission Completion Visibility
Make section readiness, dossier completeness, and publish/export handoff clear.

The user must understand:
- section placement
- missing surrounding content
- section readiness
- dossier readiness
- submission progression

---

### Phase 6 — HAQ Workflow Exposure
Surface a visible HAQ workflow:
- ingest questions
- organize by response state
- draft responses
- tie to sources / prior materials
- review / finalize / export response package

---

### Phase 7 — Final Validation
Create:
- `docs/reports/DOCUMENT_SYSTEM_FINAL_VALIDATION_2026-03-27.md`

Validate:
1. open project
2. talk to AnA
3. open Tools
4. create/resume/generate document
5. edit in EditorPanel
6. review / collaborate
7. verify / trace
8. publish / export
9. understand dossier placement / readiness
10. return to project context

---

## 5. Build Plan

## Build Order (strict)

### Step A — Planning docs
Produce A + B + C + D first.
No production implementation before these are complete.

### Step B — Review against this file
Claude must reread this file and treat it as the execution governor.
If any subagent output conflicts with this file, this file wins unless the repo proves it impossible.

### Step C — Implement Phases 1–3 as one convergence block
These three belong together:
1. Tools workbench
2. canonical creation-path completion
3. editor lifecycle restructure

They should be executed as one coordinated drafting-system block because separating them creates more drift.

### Step D — Implement Phases 4–6 as parity/surfacing block
These three belong together:
4. Data Room / Ask
5. dossier / submission completion visibility
6. HAQ workflow exposure

### Step E — Final validation only after all above land
No self-congratulation before validation.

---

## 6. What Claude Must Preserve

Keep:
- AnA-first home
- EditorPanel as canonical editor
- governed artifact model
- ProjectWorkspaceShell as the machine room
- ReviewReadiness
- SubmissionReadiness
- VaultPage
- dossier / CTD / placement logic
- export / provenance / comparison infrastructure

---

## 7. What Claude Must Simplify, Merge, Demote, Expand, Remove

### Simplify
- labels that still expose architecture instead of workflow
- lifecycle terminology that feels too internal
- overexposed control bars

### Merge
- builder output into editor flow
- review/verify/publish into one staged lifecycle story
- multiple document-creation entry ideas into the Tools workbench

### Demote
- machine-room complexity behind explicit invocation
- route-era leftovers
- legacy secondary surfaces that compete with the main drafting story

### Expand
- Data Room / Ask
- HAQ workflow
- any missing visible collaboration / version restore / source tracing UX needed for real Weave-visible parity

### Remove
- dead-end screens
- fake buttons
- duplicate document worlds
- controls that do not earn their existence in the drafting sequence

---

## 8. Implementation Constraints

Claude must:
- use specialized subagents
- keep them tightly bounded
- synthesize only after subagent outputs complete
- avoid giant memo-writing detached from repo files
- avoid preserving clutter because “enterprise users can handle it”
- avoid claiming parity without proof in the parity matrix
- avoid stopping after one partial convergence pass

---

## 9. Required Final Deliverables

Claude must create all of these:

1. `docs/audits/WEAVE_PARITY_MATRIX_2026-03-27.md`
2. `docs/audits/CURRENT_DOCUMENT_SYSTEM_REALITY_2026-03-27.md`
3. `docs/plans/ANTHROPIC_DRAFTING_SEQUENCE_SPEC_2026-03-27.md`
4. `docs/plans/DOCUMENT_SYSTEM_CONVERGENCE_DECISIONS_2026-03-27.md`
5. `docs/reports/DOCUMENT_SYSTEM_FINAL_VALIDATION_2026-03-27.md`

And any implementation code required to make the document system actually converge.

---

## 10. Final Command Standard

Claude must return only:
1. exact files changed
2. exact Weave-visible use cases now matched 1:1
3. exact document workflows now complete end-to-end
4. exact surfaces simplified / merged / demoted / expanded
5. exact remaining gaps, if any
6. typecheck result
7. commit hash
8. explicit stop-and-wait for approval

---

## 11. Approval Direction

This file is the controlling project plan and build plan.

Claude must read this file first, summarize it into working memory for the session, and then execute against it.

If persistent memory inside Claude Code is desired across future sessions, Claude should also summarize the locked rules and execution order into the local project instruction surface it uses for memory (for example `CLAUDE.md` or the project memory file it is already using), but only after reading this file and without changing the architecture.
