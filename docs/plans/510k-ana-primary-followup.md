# 510(k) Workspace AnA-Primary — Re-implementation Brief

> Originally implemented as commit `949c918` on a stale local branch (preserved at safety tag `pre-rebase-2026-04-26`). The original implementation referenced `AnaPersistentPanel`, which has since been deleted by the Phase 2 chat shell convergence (`f79b858`). This brief captures the intent so it can be re-implemented against the current `Ana` component.

## Why this exists

`client/src/concept2cure/pages/FDA510kWorkspacePage.tsx` is currently a 100-line wrapper around `Enhanced510kIntakeWorkflow` — the legacy 7-stage tab wizard. Users land in an empty form and AnA is hidden. This violates the chat-first contract that's now canonical for the rest of the product (Phase 2 chat shell, Home composer, eCTD co-authoring workbench).

## Intent

Make AnA the **default body** of the 510(k) workspace, with the structured form as a fallback view. Single chat surface (no second rail).

## Required changes

### 1. `FDA510kWorkspacePage.tsx`

Replace the current `Enhanced510kIntakeWorkflow`-only body with:

- **Default view** = `<Ana>` from `client/src/concept2cure/components/ana/` (the canonical chat shell). Seed it with:
  - 510(k)-aware project context (`productType=device`, current stage + completed steps from `GET /api/510k-workflow/:projectId`)
  - Suggested action pills:
    - Find predicate devices
    - Draft SE comparison
    - Compliance check (FDA 510(k) checklist)
    - Generate intended-use statement
    - Build performance-test plan
- **Slim 7-stage progress strip** at the top of the page (replaces the legacy `TabsList` chrome). Stage label + completion % read live from `/api/510k-workflow/:projectId`.
- **View toggle** in the header: AnA (default) ↔ Structured form. Toggling to Structured renders the existing `Enhanced510kIntakeWorkflow` — zero capability loss.
- Preserve `handleSave`, `handleComplete`, `onBackToProject` semantics exactly.

### 2. `EmbeddedModuleHosts.tsx` — `Embedded510kHost`

Currently wraps `FDA510kWorkspacePage` and adds an `EmbeddedAssistantRail` (right-rail second chat). Once the page hosts `Ana` inline, **remove the rail** for 510(k) only — single chat surface rule.

PMA and CER hosts unchanged (separate workstreams; convert when their AnA-primary briefs land).

## Out of scope

- PMA and CER workspace conversions (separate follow-ups)
- Any change to `Enhanced510kIntakeWorkflow` itself — keep as the structured-mode component
- New backend endpoints — `/api/510k-workflow/:projectId` already provides stage + completion %

## Acceptance

- 510(k) workspace lands in chat-first state by default; pills are clickable; chat streams against the canonical `/api/ana-ri/stream`
- Slim progress strip shows correct stage; updates as workflow progresses
- View toggle reveals the full 7-stage form with no data loss
- No second chat rail visible on 510(k) (PMA/CER rails still appear)
- No reference to deleted `AnaPersistentPanel`, `ZenChat`, or legacy `components/chat/` anywhere in the page or its host

## Reference (do not copy verbatim)

The original `949c918` diff lives at safety tag `pre-rebase-2026-04-26~9` (9 commits before tip). Useful for:

- Suggested-action pill IDs and copy
- The 7-stage progress strip styling intent
- The view-toggle UX pattern

The implementation must **not** import `AnaPersistentPanel` or any deleted `components/chat/` module — those were removed by the Phase 2 convergence and don't exist on `concept2cure-v2` anymore.
