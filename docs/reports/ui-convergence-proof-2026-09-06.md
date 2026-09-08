# UI Convergence Proof — 2026-09-06

The one-page proof the master work order asks for. Every claim links to a measurement.

| Claim | Evidence |
|---|---|
| One shell owner | `router/ZenRouter.tsx:158-182` → `v2/V2App.tsx`; only two route switches in the client (`audit:ui-authority` §3) |
| One nav source | `v2/registryModel.ts` RAIL_* read by `v2/Shell.tsx:46-53` (audit §Q3) |
| No legacy shell routable | 9 constitution-named files verified absent (`config/ui-surface-registry.json` › legacy; audit script "deleted and file absent" × 9) |
| `LayoutMode` / `AnaPersistentPanel` / `ToolPanel` | absent; successor flags: 6 `ownsConversation` surfaces (limit 7) |
| Chat is the front door | Home = greeting + composer seeding `conversation-thread` (`before-1440-home.png`) |
| One click to a project chat | `ProjectHome.tsx:832-848` |
| Communication Center exists and AnA can reach it | `surfaces/CommunicationCenter.tsx`; `shared/navigation/index.ts` target added this pass |
| Settings exist | account menu, 8 labelled entries (audit §5) |
| Tokens have one owner | `design-system/colors_and_type.css`, pinned by `tests/ui/token-authority.test.ts` |
| Motion is calm | `scripts/ci/check-design-system-compliance.mjs` — no spring/bounce; `--ease-spring` has no overshoot |
| Responsive: rail | ≤640px drawer + scrim (pre-existing), verified at 430/390 |
| Responsive: AnA rail | ≤900px drawer + scrim (**this pass**): content column 0px → 374px at 430; composer off-screen → on-screen at 390 (`before-ana-*` / `after-ana-*` metrics and PNGs) |
| Regression | editor, review, submission, thread, biostatistics all render at 7 widths; 0 overflow, 0 page errors (`full-walk-metrics.json`) |
| Authority audit | `npm run audit:ui-authority`: 46 / 46 |

What is **not** claimed: five-destination IA, sans-only chrome, neutral palette (declined 2026-07-28); conversation-first project landing, one composer, inline `@app` (escalated E1–E3 in the work order); ChatGPT side-by-side (no reference reachable).
