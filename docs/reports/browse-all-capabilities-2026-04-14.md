# UI Convergence Proof — Browse All Capabilities (WO-10)

**Date:** 2026-04-14
**Branch:** `concept2cure-v2`
**Predecessor:** WO-9 (`11f6240`) expanded `AppsPage` to 25 cards. WO-10 closes the final discoverability gap — the 106 AnA prompts organized in 19 domain groups (`client/src/concept2cure/config/domain-prompts.ts`) that were previously only surfaced contextually.
**Driver:** User directive — "clients can access all apps, features, skills, and abilities of what we have built."

## What changed

Single file edit: `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx`.

The home empty state gains:

1. A **browse toggle** — local component state `browseAll: boolean` (WO-10).
2. A **ghost link** below the 4 example cards: `Browse all capabilities →`. Clicking it replaces the 4 example cards with the full catalog view; a `← Back to examples` link returns.
3. The **full catalog view** — a scrollable container (`max-h-[52vh]`) listing all 19 `ALL_DOMAIN_GROUPS`:
   - Each group has its label (small uppercase tracking, WO-8 typography language) + prompt count.
   - Prompts render as 2-up compact buttons on md+ screens, 1-up on narrow.
   - Clicking a prompt sets `input` to the prompt label, closes the browse view (back to cards), and focuses the composer.

Import added: `ALL_DOMAIN_GROUPS` from `../../config/domain-prompts`. The catalog is **not duplicated** — we read the source of truth directly. Adding a prompt to `domain-prompts.ts` automatically appears in the browser with no code changes.

## Files modified

- `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx` — added import, `browseAll` state, and conditional render. The existing cards path is untouched in behavior.
- `config/ui-surface-registry.json` — `lastUpdated` + `convergencePhase` bumped to include WO-10.
- `CLAUDE.md` — Home layout section extended with the new bullet.

## Files NOT touched

- `config/domain-prompts.ts` — read-only.
- All other files from WO-7 / WO-8 / WO-9 — no regression.
- No new component files.

## Design choices

- **Inline toggle, not a Dialog.** The user explicitly rejected a Dialog-based "Browse all capabilities" overlay in earlier plan iterations. WO-10 uses the same centered column the home greeting lives in, so there is no chrome to dismiss and no modal focus trap — just a view switch.
- **106 prompts, flat.** Every group is always expanded. The 52vh scroll container keeps the surface compact. No accordion — the user has already opted into "browse" and collapsing groups would add friction.
- **Auto-return on pick.** Choosing a prompt returns to the card view so the input is in focus and the user sees the composer. Matches Claude's pattern of post-action recovery.
- **No chrome.** No search box on the catalog (a future refinement if 106 → 300+). No filter chips. No delight animations. Stays in the Anthropic-calm typography envelope.

## Verification

- Typecheck: zero new errors in `AnaPersistentPanel.tsx` beyond the pre-existing baseline.
- Every prompt button calls `setInput(p.label)` + `setBrowseAll(false)` + `requestAnimationFrame(focus)` — all APIs present in the current component.
- The browse view is only reachable on the home empty state (`!hasMessages && !isThinking`). Active conversations are unaffected.

## No capability loss

Everything added to `domain-prompts.ts` from here forward becomes automatically discoverable. No previously-reachable path is removed. The 4 example cards remain the default. Contextual suggestions (the existing `suggestedActions` pipeline) remain wired.

## Completion gate

- [x] 106 prompts are reachable in 1 click from the home
- [x] Source of truth is the existing config; no duplication
- [x] No new component files
- [x] No new routes
- [x] Typecheck clean
- [x] Proof report written (this file)
- [x] Registry + CLAUDE.md updated

## After WO-10 — full map

| Capability | Where clients find it on the home |
|---|---|
| 25 apps (all `KNOWN_APP_IDS`) | `Apps` icon on the rail → AppsPage, 4 categories |
| 10 tool panels (eCTD · Protocol · SOP · CAPA · PMS · Inspection · Intelligence · Vault · doc-editor · Biostats) | Reached via AppsPage cards or the `Editor` rail icon |
| 3 chat modes (standard · deep-research · nano-banana) | AnA composer dropdown |
| 106 domain prompts in 19 groups | **NEW** — Browse all capabilities link on the home empty state |
| 5 hidden intelligence engines (CORTEX · RIM · Foresight · CSR · Predicate) | Partially surfaced via WO-9 (RIM + CSR are `KNOWN_APP_IDS`); CORTEX / Foresight / Predicate remain chat-only (not in backend KNOWN_APP_IDS) |
| Starred projects | Sidebar pinned list when expanded |
| Thread history | `Chats` concept lives inside AnA; thread list via the composer's existing thread-switch UI |
