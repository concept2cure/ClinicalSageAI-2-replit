# Final Document Workflow Architecture Directive

**Date:** 2026-03-27
**Branch:** `concept2cure-v2`
**Status:** Planning approved for execution handoff
**Purpose:** Final architecture directive for Concept2Cure document creation, drafting, editing, review, verification, publishing, and dossier-completion UX.

---

## 1. Executive Judgment

Concept2Cure is **not behind Weave because of missing machinery**. It is behind because the machinery is still too exposed, too fragmented, and too architecture-shaped in the UI.

Claude’s competitive and gap reports are directionally correct:
- Weave’s public story is a unified regulatory authoring system spanning Data Room, drafting, dossier management, review/verification, submission building, and HAQ workflow.
- Concept2Cure already has much of the underlying capability, and in several areas exceeds Weave materially (device workflows, biostats, precedent intelligence, risk scoring, protocol design, multi-agency intelligence). See:
  - `docs/audits/WEAVE_BIO_GAP_ANALYSIS.md`
  - `docs/reports/weave-bio-competitive-analysis.md`
- The real gap is **productization, staging, and sequence clarity**.

The current repo truth supports that conclusion:
- Project home was split across competing modes.
- Document creation has been fragmented across too many entry points.
- `EditorPanel` is already the canonical power surface, but the drafting lifecycle is still not legible enough.
- `ProjectWorkspaceShell` contains serious operating-system capability, but still exposes too many control layers at once.
- `FullDocumentBuilder` was incorrectly acting like a document world instead of a creation tool.

**Bottom line:** the next sprint must not be a feature hunt. It must be a full document-system convergence and exposure sprint.

---

## 2. Non-Negotiable Product Model

These are now locked:

1. **AnA is the single visible guide identity**
2. **Project home is conversational first**
3. **Productivity Tools is secondary and intentional**
4. **EditorPanel is the canonical editing surface**
5. **Every document creation flow must converge into EditorPanel**
6. **No duplicate document worlds**
7. **No dead-end builders**
8. **No silent handoffs**
9. **No fake buttons or fake lifecycle states**
10. **No control-layer pileups that force the user to mentally assemble the product**

---

## 3. What We Must Match 1:1 From Weave’s Visible Use Cases

Based on the committed competitor analysis, Weave’s visible promise is effectively:

1. AI-native drafting
2. AI template-driven authoring
3. Data Room with semantic search and AI ask/search
4. Dossier Manager as a connected source of truth
5. Submission Builder with eCTD-aware assembly
6. Review with comments, redlines, source tracing, and version restore
7. Verification / source traceability / QC
8. Governed publishing/export (DOCX and eCTD-ready structure)
9. HAQ response workflow
10. Cross-functional collaboration in one connected authoring environment

Concept2Cure must reach **use-case parity** across those visible buckets inside its own UX.

We do **not** need to become a visual clone of Weave.
We **do** need to become at least equal in visible workflow coverage and better in specialist depth.

---

## 4. What Concept2Cure Already Has Under the Hood That Must Be Surfaced

These are not speculative. They exist or are materially present in the repo and prior audits:

### Already Strong / Keep
- `EditorPanel` as the real editing engine
- governed artifact workflow
- provenance / audit / compare / signatures / export plumbing
- `ProjectWorkspaceShell` as the operational machine room
- `ReviewReadiness`
- `SubmissionReadiness`
- `VaultPage`
- app-generated draft logic
- dossier / CTD / section placement logic
- IND / eCTD / CMC infrastructure
- medical-device workflows
- deep research / intelligence / precedent systems

### Present But Still Poorly Exposed
- multiple draft creation paths that already converge or can converge
- editor lifecycle capabilities
- governed review/approval chain
- document placement into submission structure
- readiness and submission completion logic
- review and verification signals

### Needs Product Surfacing / Expansion
- Data Room / Ask UX on top of existing vault + deep research
- HAQ response visible workflow
- unified submission-builder story inside Tools
- explicit Draft → Review → Verify → Publish lifecycle staging
- better exposure of comments/redlines/version restore/source trace inside the editor experience

---

## 5. Why the Current UX Is Still Short of Anthropic Quality

Anthropic would not leave the user to infer system logic from layered chrome.

### Current weakness areas
1. **Too many visible control strata** inside the workspace shell
2. **Too many legacy route concepts** still shaping user flow
3. **Too many document entry points without one dominant drafting story**
4. **Lifecycle capabilities exist, but are not staged clearly enough**
5. **The machine room is too visible too early**

### Anthropic-quality standard for this product
1. One emotionally primary surface at a time
2. Progressive disclosure
3. Strong center of gravity
4. Single dominant next action per stage
5. Conversation first, tools second
6. Editing first when editing starts
7. Lifecycle clarity without enterprise noise
8. Context available, not screaming

This is the bar for the implementation sprint.

---

## 6. Final Target Architecture

## A. Project Home = AnA Home

When a user opens a project, the home must feel like:
- AnA as primary
- light project strip / status line only
- a few truthful suggested actions
- one obvious “Open Tools” entry

The project home should **not** feel like a dashboard, module launcher, or control center.

### Visible elements allowed on project home
- project name / type
- readiness one-liner
- recent document snippet(s) or resume card
- next action suggestions
- Open Tools button

### Visible elements forbidden on project home
- stacked workbench bars
- multiple registries
- dense metrics grids
- parallel nav systems
- module catalogs

---

## B. Tools = Secondary Productivity Workbench

Tools must become the one secondary place users go when they want to stop talking and start making.

### Tools must expose exactly these capabilities clearly
1. Resume document
2. Recent documents
3. Create new document
4. Document Builder
5. Templates
6. Dossier Map
7. Vault / Data Room
8. Review
9. Submit
10. HAQ Manager (when implemented/exposed)

### Tools should feel like
- a curated workbench
- not a dashboard
- not an app store
- not a hidden legacy route
- not just the FullDocumentBuilder

### Required mental model
Project Home = **conversation**
Tools = **making / continuing work**

---

## C. The Single Drafting Sequence

This must become explicit in UI and code:

**Project Home (AnA)**
→ **Open Tools** or pick a suggested action
→ **Create / Resume / Generate**
→ **EditorPanel**
→ **Review**
→ **Verify**
→ **Publish / Export / Submission readiness**
→ **Return to project context**

No alternate emotional path should compete with that sequence.

---

## D. EditorPanel = Canonical Editing Surface

Every creation path must land in `EditorPanel`:
- blank document
- template-based document
- builder-generated document
- AnA-generated draft
- precedent-driven draft
- app-generated draft
- section-scaffold draft
- existing artifact open

No exceptions.

### What the user must always understand while in the editor
1. what document is open
2. what section / dossier location it belongs to
3. what state it is in
4. what next stage exists
5. where review is
6. where verification is
7. where publish/export is
8. how to get back

### Editor UX rule
Capabilities can remain rich.
Visible workflow must become simpler.

---

## E. Draft / Review / Verify / Publish Must Become Explicit Stages

These are not just tabs or internal states. They are the visible authoring lifecycle.

### Draft
- writing
- AI generation
- edits
- structure
- section placement

### Review
- comments
- reviewer state
- redline / compare
- approval readiness

### Verify
- source traceability
- provenance
- support/confidence
- contradiction / inconsistency visibility
- evidence linkage

### Publish
- governed status progression
- export/finalization
- lock / approved state
- DOCX / PDF / eCTD outputs
- submission-readiness handoff

These stages must be visible as one system.
Not hidden across unrelated controls.

---

## F. Dossier / Submission Completion Must Be Legible

The user must understand:
- where the current document belongs
- what section/module it maps to
- what nearby dossier content is missing
- whether the section is ready
- whether the broader submission is ready
- how the document advances toward filing

This is the area where Concept2Cure can match Weave’s Dossier Manager / Submission Builder story while going beyond it with cross-dossier intelligence later.

---

## G. Data Room / Ask Must Be Surfaced as a First-Class Document Support Loop

The competitive analysis is right that this is a critical visible gap.

Concept2Cure already has the ingredients:
- vault / files
- deep research / intelligence
- source-aware responses

These must be productized into a clear **Data Room / Ask** loop:
- upload files/evidence
- search semantically
- ask questions over project materials
- cite sources
- use answers to draft or verify content

This does not need to be a separate world.
It belongs under Tools and in editor-side support flows.

---

## H. HAQ Response Workflow Must Become Visible

Claude’s gap analysis is right: Weave’s HAQ Manager is a visible, differentiated workflow, and Concept2Cure currently has backend-adjacent pieces but not the fully surfaced user flow.

This must become a visible workflow inside the same system:
- ingest HAQs
- organize questions
- draft responses
- tie responses to source materials and prior documents
- review/approve/finalize response packets

This is not the first move in the drafting convergence sprint, but it must be included in the parity roadmap and tools architecture.

---

## 7. What to Keep / Simplify / Merge / Demote / Expand / Remove

### Keep
- AnA first project home
- EditorPanel as canonical editor
- ProjectWorkspaceShell as the machine room
- governed document model
- dossier/placement logic
- ReviewReadiness
- SubmissionReadiness
- VaultPage
- real export/provenance/comparison infrastructure

### Simplify / Relabel
- Work → Tools (continue to complete this consistently)
- any labels that expose architecture instead of workflow stage
- editor lifecycle labels if they are too technical or fragmented

### Merge
- builder output into editor flow
- document creation options into one Tools landing
- review/verify/publish visibility into a single lifecycle story

### Demote
- machine-room complexity behind explicit tool invocation
- legacy layout concepts and route-era leftovers
- any secondary intelligence surface that competes with AnA home

### Expand
- Data Room / Ask
- HAQ Manager visible workflow
- table/figure AI generation if truly missing in the drafting UX
- ISS/ISE / briefing package / IB visibility if already underbuilt in surface layer

### Remove
- any dead-end screen
- any fake action
- any duplicate document world
- any control bar that does not earn its existence in the drafting sequence

---

## 8. Final Execution Order

This is the best execution order.

### Phase 1 — Competitive and Reality Mapping
Deliver:
- `WEAVE_PARITY_MATRIX_2026-03-27.md`
- `CURRENT_DOCUMENT_SYSTEM_REALITY_2026-03-27.md`
- `ANTHROPIC_DRAFTING_SEQUENCE_SPEC_2026-03-27.md`
- `DOCUMENT_SYSTEM_CONVERGENCE_DECISIONS_2026-03-27.md`

Purpose:
- freeze parity targets
- freeze repo truth
- freeze what will be kept / demoted / expanded

### Phase 2 — Real Tools Landing
Build the true Tools workbench.
FullDocumentBuilder becomes one tool inside it.

### Phase 3 — Canonical Creation Path Completion
Every creation path must land in `EditorPanel`.
No exceptions remain.

### Phase 4 — Editor Lifecycle Restructure
Regroup the visible editor flow so Draft / Review / Verify / Publish become obvious and calm.

### Phase 5 — Data Room / Ask Exposure
Productize vault + deep research into a usable, visible Ask/Data Room flow.

### Phase 6 — Submission / Dossier Completion Visibility
Make section readiness, dossier completeness, and publish/export handoff truly legible.

### Phase 7 — HAQ Workflow Exposure
Surface a visible HAQ Manager workflow inside Tools and document lifecycle.

### Phase 8 — Final Validation
Deliver:
- `DOCUMENT_SYSTEM_FINAL_VALIDATION_2026-03-27.md`

Validation must trace:
1. open project
2. talk to AnA
3. open Tools
4. resume/create/generate document
5. edit in EditorPanel
6. review/collaborate
7. verify/source-trace
8. publish/export
9. understand dossier/submission placement
10. return to project context

---

## 9. Final Work Order Standard for Claude Code

Claude must not be allowed to wander.

### Constraints
- use specialized subagents
- planning docs first
- implementation second
- no unrelated cleanup
- no extra design drift
- no preserving clutter because “enterprise”
- no fake parity claims without a visible parity matrix
- no stopping after one partial convergence pass

### Required final return from Claude after implementation
1. exact files changed
2. exact Weave-visible use cases now matched 1:1
3. exact document workflows now complete end-to-end
4. exact surfaces simplified / merged / demoted / expanded
5. exact remaining gaps, if any
6. typecheck result
7. commit hash
8. explicit stop-and-wait

---

## 10. Final Founder-Level Recommendation

The best plan is **not** “build everything Weave has first.”
The best plan is:

1. **Make the drafting sequence singular and human-legible**
2. **Surface the hidden strength already in the repo**
3. **Close the visible parity gaps in the order they affect user trust and buyer comparison**

That order is:
- Tools workbench
- editor lifecycle clarity
- Data Room / Ask
- dossier/submission completion visibility
- HAQ workflow

If this order is followed, Concept2Cure will not just look more coherent.
It will finally behave like one product with one drafting story, while still carrying more specialist power than Weave underneath.

---

## 11. Approval Direction

This document is the final architecture directive to hand to Claude Code.

No more code should be written until the parity matrix + current reality map + Anthropic drafting sequence spec + convergence decisions files are produced and reviewed against this directive.
