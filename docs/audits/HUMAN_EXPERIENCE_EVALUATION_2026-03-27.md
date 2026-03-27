# Human Experience Evaluation

**Date:** 2026-03-27
**Evaluator perspective:** VP Regulatory Affairs at a Series B biotech, first-time user
**Standard:** Anthropic Drafting Sequence Spec + Architecture Directive §5

---

## 1. First Impression — Project Home

**What user sees:** ProjectHomeDashboard — project name, type badge, readiness one-liner, AnA chat below.

| Check | Assessment |
|-------|-----------|
| Feels conversational? | **YES** — AnA is the center of gravity. Not a dashboard. |
| AnA's presence obvious? | **YES** — persistent panel is always visible |
| "Open Tools" discoverable? | **PARTIALLY** — sidebar "Tools" tab exists, but no prominent "Open Tools" button in the home strip itself |
| Readiness one-liner useful? | **YES** — "X of Y artifacts ready · Z in review" gives instant orientation |

**Strengths:** Calm, professional, not overwhelming. The readiness line tells the user immediately where they stand.

**Weakness:** The "Open Tools" action could be more prominent. A first-time user might not notice the sidebar tab labeled "Tools" — it competes with 4 other tabs (Overview, Vault, Review, Submit). Consider adding a visible "Open Tools" button or suggested action chip in the home strip.

---

## 2. Tools Discovery

**What user sees:** ToolsLanding — 4 groups (Continue, Create, Manage, Finalize), 9 tool cards.

| Check | Assessment |
|-------|-----------|
| Calm and clear? | **YES** — clean layout, no visual clutter |
| "Resume" quick? | **YES** — recent artifacts with status badges at the top |
| Builder vs New Document clear? | **PARTIALLY** — "New Document" starts blank/template, "Document Builder" is the multi-step wizard. Labels are distinct but descriptions could be sharper. |
| 4 groups intuitive? | **YES** — Continue → Create → Manage → Finalize maps to the workflow mentally |
| Workbench or catalog? | **Workbench** — 9 items, each with clear one-line description. No app-store feeling. |

**Strengths:**
- The 4-group structure (Continue/Create/Manage/Finalize) mirrors the document lifecycle and guides discovery
- Recent documents at top = instant resume capability
- Status badges on recent artifacts = instant orientation
- HAQ Response in Finalize = logical placement

**Weakness:**
- When there are no recent documents, the EmptyState takes up space that could show a more helpful first-time prompt
- "Vault / Data Room" doesn't explain the "Ask" capability — consider "Data Room · Ask AI about your evidence"

---

## 3. Editor Experience

**What user sees:** EditorPanel with TipTap editor, lifecycle pipeline (Draft → In Review → Approved → Published), inspector ribbon with 4 groups (Draft/Review/Verify/Publish).

| Check | Assessment |
|-------|-----------|
| 4 lifecycle stages make sense? | **YES** — Draft/Review/Verify/Publish is intuitive for regulatory professionals |
| Lifecycle pipeline visually clear? | **YES** — colored stage buttons with progress indicators (line 2454-2523) |
| "Where am I" obvious? | **YES** — current stage is highlighted with pulse animation + color |
| "Next action" obvious? | **MOSTLY** — clicking the next stage advances status. Could be clearer as a call-to-action. |

**Strengths:**
- The lifecycle pipeline (Draft → In Review → Approved → Published) is the best UX element in the editor — it makes the workflow tangible
- Inspector ribbon grouped as Draft/Review/Verify/Publish directly mirrors the pipeline stages
- AI slash commands (rewrite, expand, summarize, regulatory, references) are productivity multipliers
- Batch AI panel for multi-section operations is powerful

**Weakness:**
- 4 inspector ribbon groups with 4-5 items each = 18 buttons visible simultaneously. Even grouped, this is dense. Consider showing only the current stage's panels by default, with other stages collapsed.
- The "Verify" stage concept is excellent but may confuse users who don't distinguish between "Review" (peer review) and "Verify" (source tracing). Consider tooltip or first-time explanation.

---

## 4. HAQ Manager

**What user sees:** Ingest area (paste questions), question list (left), detail panel (right).

| Check | Assessment |
|-------|-----------|
| Ingest → Parse flow intuitive? | **YES** — paste text, click "Ingest Questions", questions appear parsed |
| AI Draft Response clear? | **YES** — prominent button with Sparkles icon, loading spinner during drafting |
| "Open in Editor" natural? | **YES** — converges to EditorPanel where the response enters the governed lifecycle |
| Split-pane easy to use? | **YES** — standard master/detail pattern, familiar from email clients |

**Strengths:**
- The workflow (ingest → parse → draft → review → editor) is linear and obvious
- Question numbering (Q1, Q2...) helps track progress
- Sources shown under draft response build confidence
- "Open in Editor" converges to the canonical editing surface (no dead-end)

**Weakness:**
- Questions are client-side only — navigating away loses all work. Needs backend persistence (flagged in AnA audit).
- No bulk "Draft All" button — user must click "AI Draft Response" on each question individually
- No way to re-order or categorize questions after ingestion

---

## 5. Navigation Coherence

| Path | Assessment |
|------|-----------|
| Home → Tools → Editor → Back | **GOOD** — sidebar tabs provide consistent navigation |
| Editor → Review → Verify → Publish | **GOOD** — lifecycle pipeline enables direct transitions |
| HAQ → Editor → Back to HAQ | **ISSUE** — "Open in Editor" navigates away from HAQ. No way to return to the HAQ list without re-navigating through Tools. |
| Sidebar tabs logical? | **MOSTLY** — Overview/Tools/Vault/Review/Submit makes sense. But "Review" in sidebar vs "Review" stage in editor could confuse. |

**Recommendation:** After "Open in Editor" from HAQ, the browser back button or a breadcrumb should return to the HAQ Manager state.

---

## 6. Anthropic Quality Check

| Standard | Grade | Notes |
|----------|-------|-------|
| One primary surface at a time | **A** | Home = AnA. Tools = workbench. Editor = editing. Never competing. |
| Progressive disclosure | **A-** | Home → Tools → Editor → Review → Verify → Publish. Good sequence. Inspector ribbon is dense but grouped. |
| Strong center of gravity | **A** | AnA on home. Editor when editing. Clear at every step. |
| Single dominant next action | **B+** | Lifecycle pipeline makes next stage obvious. But within a stage, 4-5 inspector panels compete for attention. |
| Conversation first, tools second | **A** | Project home IS AnA. Tools requires deliberate navigation. |
| Editing first when editing starts | **A** | Editor takes full center pane. Inspector is secondary rail. |
| Lifecycle clarity without enterprise noise | **B+** | 4 stages are clear. But 18 panels across 4 groups is still enterprise-level complexity. |
| Context available, not screaming | **A-** | CTD section, status, version in header. Not noisy. Readiness one-liner is good. |

**Overall Anthropic Quality Score: B+/A-**

---

## 7. Specific Issues to Fix

| # | Issue | Severity | Recommendation |
|---|-------|----------|---------------|
| 1 | No "Open Tools" button on project home | Medium | Add a visible CTA in ProjectHomeDashboard or as a suggested action |
| 2 | Vault label doesn't mention "Ask" | Low | Rename to "Data Room · Ask AI about your evidence" |
| 3 | Inspector ribbon shows all 18 panels simultaneously | Medium | Default to showing only current stage's panels |
| 4 | "Review" in sidebar vs "Review" in editor lifecycle | Low | Consider renaming sidebar tab to "Quality" or "Approvals" |
| 5 | HAQ → Editor has no return path | Medium | Add breadcrumb or state preservation |
| 6 | No bulk "Draft All" in HAQ Manager | Low | Future enhancement |
| 7 | HAQ questions lost on navigation | High | Backend persistence (Phase 2) |

---

## Summary

**The product feels like one coherent system.** The drafting sequence (Home → Tools → Editor → Review → Verify → Publish) is legible and calm. AnA is unambiguously the primary surface. Tools is correctly secondary. The editor's lifecycle pipeline is the standout UX element.

**Key strength:** The transition from "talking about work" (AnA) to "doing work" (Tools/Editor) feels natural and intentional.

**Key weakness:** The inspector ribbon density. 18 panels grouped into 4 stages is better than a flat list, but a first-time user will still feel the enterprise weight. Progressive collapse of non-active stages would solve this.

**Verdict: Ready for serious buyer demo with the caveat that inspector ribbon needs polish.**
