# Concept2Cure v2 -> Claude North Star UI Gap Assessment

Date: 2026-03-31  
Branch reviewed: `cursor/critical-files-management-f38a`  
Primary evidence: `client/src/App.jsx`, `client/src/concept2cure/ZenApp.tsx`, `client/src/concept2cure/components/sidebar/ZenSidebar.tsx`, `client/src/components/navigation/UnifiedTopNavV3.jsx`, `client/src/component-registry.ts`, `docs/beta-work/stage-7-*.md`, Claude UI principles skill.

---

## Executive read

You are closer than it may feel.

The **core shell direction** (Concept2Cure canonical path, chat-first center of gravity, governed workspace) is already aligned with your North Star. The biggest gap is not missing capability, it is **UI coherence and surface honesty** across older module routes and legacy top-nav patterns.

### Current state in one line

**Strong internal anatomy, uneven outward experience.**

---

## What "Claude-like" means for this product

Based on your enforced principles, Claude-like here means:

1. One calm, consistent shell language.
2. Conversation-first, tools as secondary context.
3. Progressive disclosure instead of dense dashboard chrome.
4. Honest route/signage behavior (no implied worlds that do not exist).
5. Zero capability loss while reducing visible clutter.

This assessment uses that as the bar, not "visual similarity" alone.

---

## Where you are now (by module/surface)

## 1) Canonical shell + auth flow

### Status: **8/10 (good)**

What is strong:
- Canonical entry and fencing are in place:
  - `/`, `/concept2cure`, `/concept2cure/*` route into `ZenRouter`.
  - `/client-portal/*` fenced to `/concept2cure`.
  - login aliases fold to `/concept2cure/login`.
- Stage 7 pulse checks validate the heartbeat path (root, login redirect, portal fence, project route shell landing).

What still drifts from North Star:
- `App.jsx` remains a giant route museum (many paths exposed equally), which weakens "one obvious product story."

---

## 2) Workspace + governed documents + AnA integration

### Status: **7.5/10 (strong core, moderate UX drift)**

What is strong:
- `ZenApp` is the real orchestrator with governed workspace preserved.
- Real data-testid anchors and mode gates exist for:
  - intelligence (`workspace-ri-copilot`)
  - tools (`workspace-tools`)
  - review (`workspace-review`)
  - setup (`workspace-setup`)
  - vault (`workspace-vault`)
  - editor shell (`project-workspace-shell` via `ProjectWorkspaceShell`)
- Stage 6/7 work improved honesty and runtime reliability.

What still drifts:
- Legacy/parallel layout modes still coexist, so users can enter inconsistent UI worlds.
- Some nav labels have historically implied different destinations than actual mode mapping.

---

## 3) Top nav system(s)

### Status: **4.5/10 (largest visible coherence gap)**

What is strong:
- You started demoting misleading items (e.g., "Switch Module" -> canonical workspace).

What still drifts:
- Top-nav patterns still look and behave like legacy dashboard-era chrome:
  - too many badges/buttons competing for attention
  - gradient-heavy emphasis outside core shell style
  - route promotion that can outpace actual beta-safe story
- Multiple top-nav variants exist in codebase; this invites divergence.

---

## 4) Sidebar and primary navigation semantics

### Status: **6.5/10 (improving, not finished)**

What is strong:
- Sidebar is now more honest than before Stage 7.
- Workspace group reflects real high-value destinations.

What still drifts:
- A few labels/routes/modes still rely on fallback behavior or naming that can confuse users.
- Global nav and project nav semantics are not yet fully "one mental model."

---

## 5) Module surfaces (CERV2 / 510k / IVDR / biotech / reports / readiness / admin)

### Status: **5/10 (capability-rich, experience-fragmented)**

What is strong:
- Substantial module capability is present and mounted.
- Route coverage is broad.

What still drifts:
- From a beta UX perspective, too many module entry points are promoted at the same visual rank.
- Some surfaces are operationally real but design-language inconsistent with the Claude North Star.
- User cannot always tell which paths are "primary beta path" vs "internal/advanced/legacy."

---

## Gap summary (North Star delta)

Top 5 gaps to close:

1. **Single-shell clarity gap**  
   Too many first-class route surfaces in `App.jsx` for a coherent beta narrative.

2. **Navigation truth gap**  
   Label -> destination -> behavior consistency is improved, but not yet fully locked.

3. **Design language consistency gap**  
   Legacy top-nav/module chrome often breaks calm/Claude restraint.

4. **Progressive disclosure gap**  
   High density of visible controls competes with conversation-first flow.

5. **Primary vs secondary capability gap**  
   Everything is visible, but not everything should be equal prominence in beta.

---

## How to get there from here (no capability loss)

## Phase A: Lock the shell contract (highest leverage)

Objective: one truthful beta shell story.

Do:
- Keep `/concept2cure` as the only primary "home" destination.
- Treat non-canonical routes as compatibility fences or secondary deep links.
- Introduce a strict "primary nav allowlist" for beta.

Success criteria:
- A new user can always answer: "Where do I start?" in one click.
- No primary CTA lands in a legacy or ambiguous surface.

---

## Phase B: Unify navigation semantics

Objective: each label always maps to one intentional outcome.

Do:
- Define and enforce canonical nav dictionary:
  - label
  - nav id
  - layout mode
  - route (if applicable)
  - user-facing description
- Reject fallback-based mapping in primary surfaces.

Success criteria:
- No silent fallback to unrelated mode for primary nav items.
- Sidebar + top nav communicate the same information architecture.

---

## Phase C: Claude-style visual convergence pass

Objective: calm, restrained, consistent shell language.

Do:
- Remove high-chrome gradient emphasis from utility navigation.
- Normalize typography and spacing to your existing Claude principles.
- Collapse decorative duplication and over-signposted controls.
- Use governed registry components for all touched UI.

Success criteria:
- Users describe UI as "quiet and focused."
- Reduced visual competition around chat/workspace center.

---

## Phase D: Module exposure strategy (truthful promotion)

Objective: surface depth without overselling unfinished experiences.

Do:
- Classify all major modules as:
  - Primary beta path
  - Secondary (discoverable but demoted)
  - Internal-only (direct link only)
- Keep capability available, but tune **prominence** by readiness.

Success criteria:
- No route embarrassment during partner demos.
- Founders can narrate one coherent path, then branch to advanced capabilities.

---

## Recommended default partner demo path (right now)

1. `/` -> `/concept2cure/login`
2. sign in
3. `/concept2cure`
4. select project
5. workspace `Editor` (governed document shell)
6. optional `Intelligence` panel
7. optional `References` (vault/doc linkage)

This best represents your strongest truth: governed, intelligence-assisted regulatory authoring.

---

## Risks if you do not close the gap

- Users underestimate your real capability because UX looks fragmented.
- Trust erosion from occasional dead-signage/legacy-feeling transitions.
- Higher onboarding friction and lower perceived quality despite strong backend.

---

## Final assessment

You do **not** need a redesign from zero.

You need a disciplined convergence program:
- strict shell truth,
- strict nav semantics,
- strict visual restraint,
- strict module exposure governance.

If you execute those in order, Concept2Cure can feel materially closer to Claude while preserving the depth you already built.

That is the path to your North Star without regression.

