# GA Readiness Audit: Concept2Cure UI OS Restructure

**Date:** 2026-03-27
**Auditors:** 2 independent agents (Design Standards + Plan Compliance)
**Scope:** All Phase 1-3.5 work against Claude.ai product standard and locked instructions

---

## Two Verdicts

### Design Standards Agent (Claude.ai quality comparison)
**Overall: 6.5/10 — Not yet GA quality**

| File | Grade | Issue |
|------|:-----:|-------|
| ZenSidebar | 6/10 | Too busy. 9 badge colors. Nested conversations feel enterprise. |
| AppsPage | 7/10 | 16 cards + recommended = up to 22 items. Claude shows 3-5 at a time. |
| ArtifactsPage | **8/10** | Closest to Claude.ai. Minimal, search-first, calm. |
| VaultPage | 7/10 | Folder headers slightly admin-dashboard-y. |
| SetupPage | 7/10 | Clean cards. Settings-as-page is unusual for Claude but well executed. |
| ProjectHomeDashboard | 6/10 | Overloaded. Ring chart + pipeline + recent + nav cards = too much. |

### Plan Compliance Agent (instruction adherence)
**Overall: 88.5% — 11.5 of 13 instructions followed**

| Instruction | Grade |
|-------------|-------|
| Global rail: 6 items exactly | **PASS** |
| Project workflow separated | **PASS** |
| Apps real destination | **PASS** |
| Artifacts real destination | **PASS** |
| Documents not global | **PASS** |
| Vault not global | **PASS** |
| Reports redistributed | **PASS** |
| AnA sole identity | **FAIL** — Dr. Sage still in FirstRunExperience |
| First-time journey | INCOMPLETE — Phase 5 not started |
| Governed components | MOSTLY PASS — 1 raw input in sidebar |
| Query keys registered | **PASS** |
| apiRequest() used | **PASS** |
| No Coming Soon | PARTIAL — Vault upload button |

---

## Critical Gaps

### 1. NOT Claude.ai calm (Design Agent)

**Problem:** Multiple pages show 15+ items at once. Claude.ai shows 3-5 focused options.

**Specific issues:**
- ProjectHomeDashboard: readiness ring + pipeline bar + recent list + 4 nav cards = 4 competing UI patterns
- AppsPage: up to 22 visible items (6 recommended + 16 in groups)
- ZenSidebar: 9 different badge colors for submission types
- Nested conversations in project rows add cognitive load Claude.ai doesn't have

### 2. Dr. Sage still present (Compliance Agent)

**Problem:** `FirstRunExperience.tsx` still introduces Dr. Sage as a separate persona (lines 137-147). 16 Dr. Sage files still exist. Violates the locked "AnA is the single assistant identity" instruction.

**Note:** This is Phase 5 scope (onboarding rewrite). The current code was not touched in Phases 1-3.5. But the compliance agent correctly flags that the instruction is violated in the existing codebase.

### 3. Vault upload stubbed (Compliance Agent)

**Problem:** VaultPage upload button says "File upload coming soon" — violates CLAUDE.md "No Coming Soon placeholders."

---

## What Would Make This GA Quality

### Must-do (Design Agent top 5)

1. **Simplify ProjectHomeDashboard** — Replace ring chart + pipeline with a single readiness banner. Show recent artifacts OR nav cards, not both.
2. **Progressive disclosure on AppsPage** — Use tabs (Strategy / Builders / Studios) to show one group at a time. Remove or collapse Recommended into inline badges.
3. **Reduce sidebar color palette** — 9 badge colors → 2-3 max. Use monochrome with one accent.
4. **Remove nested conversations from sidebar** — Show only project names. Conversation history belongs in a dedicated view.
5. **Match ArtifactsPage quality everywhere** — ArtifactsPage (8/10) is the benchmark. All pages should match its minimalism.

### Must-do (Compliance Agent)

1. **Phase 5: Rewrite FirstRunExperience** — Remove Dr. Sage, agents, automation level. Implement 7-step value-first journey.
2. **Fix Vault upload** — Either connect to existing upload API or remove the button entirely.
3. **Replace sidebar raw `<input>`** with governed `<Input>` component.

---

## What's Strong

Both agents agreed on these strengths:
- **Navigation architecture is correct** — 6 global + 5 project tabs, properly separated
- **ArtifactsPage is near-shippable** — minimal, search-first, calm
- **Accessibility is consistent** — focus rings, aria-labels, keyboard support throughout
- **API integration is correct** — apiRequest(), registered queryKeys, DataStateWrapper
- **Phased implementation was disciplined** — dependencies respected, no scope creep

---

## Honest Assessment

**Is this GA quality?** No. It's a strong alpha/beta. The structural decisions are correct — the right things are in the right places. But the visual execution hasn't yet reached Claude.ai's level of restraint. There's too much on screen, too many colors, and too much competing information.

The gap is not architectural (that's solid). The gap is **editorial** — knowing what to take away.

**What it would take to reach GA:**
1. One more design pass focused purely on reduction (less cards, less colors, less density)
2. Phase 5 onboarding rewrite (Dr. Sage → AnA only)
3. Vault upload connected or removed

**Estimated effort:** 1-2 focused sprints beyond Phase 4 (onboarding).
