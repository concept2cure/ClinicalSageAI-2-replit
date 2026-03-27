# Anthropic Drafting Sequence Spec

**Date:** 2026-03-27
**Purpose:** Define the single human-legible drafting sequence to Anthropic quality standards.

---

## 1. The Single Drafting Sequence

```
Project Home (AnA) → Open Tools → Create/Resume/Generate → EditorPanel → Review → Verify → Publish → Return
```

### What the user sees at each step:

**Step 1: Project Home**
- Center: AnA conversational interface (full mode)
- Top: light project strip (name, type, readiness one-liner: "3 of 12 sections ready")
- Suggested actions: "Draft a document", "Open recent", "Check readiness"
- One obvious button: "Open Tools"
- NOT a dashboard. NOT a module launcher. Conversation first.

**Step 2: Tools**
- A curated workbench with 10 clear capabilities (see §2 below)
- User picks an action: resume, create, generate, browse vault, check readiness
- Every making action → EditorPanel

**Step 3: EditorPanel (Draft stage)**
- Document open in TipTap editor
- Header shows: document title, CTD section, status badge ("Draft")
- Left: optional dossier tree or outline
- AI available: slash commands (/ai-rewrite, /ai-expand, /ai-summarize, /ai-regulatory, /ai-references)
- Batch AI panel for multi-section operations
- Clear "next action": Submit for Review button

**Step 4: EditorPanel (Review stage)**
- Status badge changes: "In Review"
- Comments panel opens automatically or is prominently available
- Compare panel available (diff with previous version)
- Reviewer assignment visible
- Clear "next action": Approve or Request Changes

**Step 5: EditorPanel (Verify stage)**
- Provenance panel: where content came from, what AI generated it
- Evidence linkage: which claims link to source documents
- Inconsistency detection: contradictions across sections
- Compliance scanner: regulatory requirement alignment
- Clear "next action": Publish / Export

**Step 6: Publish**
- Governed status progression: approved → locked
- Export options: DOCX, PDF, eCTD ZIP
- Signature capture (21 CFR Part 11)
- Submission-readiness handoff: document placed in dossier, section marked complete

**Step 7: Return**
- User returns to project home or Tools
- AnA greets with updated context: "Section 2.5 is now approved. 4 of 12 sections ready."

---

## 2. Tools Landing Contents

| # | Tool | Source Component | What User Sees | Action |
|---|------|-----------------|---------------|--------|
| 1 | Resume document | Recent artifacts sorted by `updatedAt` | Card with title, last edit time, status badge | Click → opens in EditorPanel |
| 2 | Recent documents | Same query, full list | Scrollable list of project artifacts | Click → opens in EditorPanel |
| 3 | Create new document | NewDocumentDialog | Title input + optional template picker | Creates blank artifact → EditorPanel |
| 4 | Document Builder | FullDocumentBuilder | 5-step wizard (type → agencies → info → generate → review) | Generates content → "Open in Editor" → EditorPanel |
| 5 | Templates | Template tree from ProjectWorkspaceShell | Browse templates by CTD section | Click template → creates artifact → EditorPanel |
| 6 | Dossier Map | DossierMap component | Visual CTD module hierarchy with section status | Click section → opens placed artifact or starts new |
| 7 | Vault / Data Room | VaultPage + Ask panel | File upload, browse, search, Ask questions | Upload evidence, ask AI questions about project data |
| 8 | Review | ReviewReadiness | Quality compliance surface, pending reviews | View review queue, take action on pending items |
| 9 | Submit | SubmissionReadiness | Readiness checklist with section status + export | Assemble and export submission package |
| 10 | HAQ Manager | New panel (to build) | Ingest questions, draft responses, review | Structured HAQ response workflow |

**Key rule:** FullDocumentBuilder is item #4 — one tool among ten. NOT the default landing.

---

## 3. EditorPanel Lifecycle Stages

The editor's 18 inspector panels regroup into 4 visible lifecycle stages:

### Draft
**What's visible:** Editor toolbar, AI slash commands, batch AI panel, outline, dossier placement
**Inspector panels active:** `intelligence`, `batch-ai`, `dataroom`, `ana-memory`
**Status badge:** "Draft" (gray)
**Dominant action:** Write / generate / structure content

### Review
**What's visible:** Comments thread, reviewer assignments, version compare, redline view
**Inspector panels active:** `comments`, `review`, `reviewers`, `compare`, `versions`
**Status badge:** "In Review" (orange)
**Dominant action:** Comment / approve / request changes

### Verify
**What's visible:** Provenance chain, evidence linkage, inconsistency flags, compliance results
**Inspector panels active:** `provenance`, `inconsistency`, `proof`, `compliance-scanner`, `crossref`
**Status badge:** "In Review" or "Approved" (context-dependent)
**Dominant action:** Trace sources / confirm evidence / resolve contradictions

### Publish
**What's visible:** Status progression controls, export buttons, signature capture, submission readiness
**Inspector panels active:** `submission-readiness`, `ga-readiness`, `health`, `audit`
**Status badge:** "Approved" (green) → "Locked" (dark)
**Dominant action:** Export / sign / lock / submit

### How stages become visible
A **stage indicator** in the editor header or toolbar groups the 4 stages:
```
[ Draft ] → [ Review ] → [ Verify ] → [ Publish ]
```
The active stage is highlighted. Clicking a stage opens the relevant inspector panel group. This replaces the current 18-panel flat list with a structured 4-stage workflow.

---

## 4. Delta From Current State

| Current | After |
|---------|-------|
| `documents` layout mode renders FullDocumentBuilder as the entire view | Tools landing shows 10 capabilities; FullDocumentBuilder is one item |
| 18 inspector panels in a flat list | 4 lifecycle stages grouping the panels logically |
| Status shown as small badge, easy to miss | Status + stage indicator prominent in editor header |
| "Work" tab label | "Tools" tab label |
| SubmissionApps creates artifact without opening editor | All creation paths auto-navigate to EditorPanel |

---

## 5. Anthropic Quality Standards Applied

| Standard | How It's Met |
|----------|-------------|
| One emotionally primary surface at a time | Project Home = AnA only. Tools = workbench only. Editor = editing only. |
| Progressive disclosure | Home → Tools → Editor → Review → Verify → Publish. Each step adds complexity only when needed. |
| Strong center of gravity | AnA on home. Editor when editing. Stage indicator when progressing. |
| Single dominant next action per stage | Draft: "Submit for Review". Review: "Approve". Verify: "Publish". Publish: "Export". |
| Conversation first, tools second | Project home IS AnA. Tools requires explicit navigation. |
| Editing first when editing starts | Editor takes full center pane. Inspector is secondary rail. |
| Lifecycle clarity without enterprise noise | 4 stages, not 18 panels. Clear progression, not control surface. |
| Context available, not screaming | CTD section, status, version in header — not dense metrics grids. |
