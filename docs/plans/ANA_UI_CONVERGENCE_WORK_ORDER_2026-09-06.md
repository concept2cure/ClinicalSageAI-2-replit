# AnA UI Convergence Work Order — 2026-09-06

**Phase 2–5 of the AnA UI Master Work Order**, scoped by `docs/audits/ANA_UI_FORENSIC_AUDIT_2026-09-06.md`. Every row below names a file that exists today.

---

## 0. The frame this work order sits in

The constitution's shell-architecture goals are **met**: one shell owner, one nav source, no legacy shell routable, the editor canonical, `AnaPersistentPanel` mode logic gone, `LayoutMode` gone. The constitution's IA goal (§4, five destinations) and shell-typography goal (§12, no serif chrome) were implemented in PR #1187 and **reverted by the product owner on 2026-07-28**. That decision is treated here as binding until the owner re-opens it.

So this work order has three kinds of rows:

- **Do now** — defects and gaps that no decision covers.
- **Escalate** — product-shape choices that the constitution asks for and the recorded decision does not settle; put to the owner, not made unilaterally.
- **Closed by decision** — constitution items the owner declined; listed so a future reader does not re-open them by accident.

---

## 1. Authority map

| Concern | Current owner | Future owner | Action |
|---|---|---|---|
| App shell | `v2/V2App.tsx` | same | **keep** |
| Chrome (rail / topbar / AnA rail / ⌘K) | `v2/Shell.tsx` | same | **keep**; AnA rail gains a phone drawer (CSS + scrim) |
| Sidebar (nav source) | `v2/registryModel.ts` RAIL_* | same | **keep** (2026-07-28 decision) |
| Chats view | `AnaRail` + `surfaces/ConversationThread.tsx` | same | keep |
| Projects view | `surfaces/Projects.tsx` | same | keep |
| Project landing | `surfaces/ProjectHome.tsx` | same | keep; **escalate** conversation-first re-ordering |
| Communication Center | `surfaces/CommunicationCenter.tsx` | same | keep; **do now:** make it a `navigate_to` target |
| Apps view | `surfaces/AdminSurfaces.tsx#Apps` | same | keep |
| Settings view | account menu (`Shell.tsx:176-201`) + admin surfaces | same | keep (mirrors Claude's placement by design) |
| Composer | `Shell.tsx:1122-1180` (rail), `ConversationThread.tsx:886`, `Surfaces.tsx:226` (home), `ProjectHome.tsx:842` (stub), `EctdCoauthor.tsx:816` | one shared composer | **escalate** consolidation; `@app` / slash autocomplete **missing** (see §4) |
| Shell tokens | `design-system/colors_and_type.css` | same | keep; **do now:** remove the one literal `#d97757` fallback in v2 |
| `LayoutMode` enum | absent | — | void |
| `AnaPersistentPanel` mode | absent (`AnaRail` open/seam only) | — | resolved |
| ToolPanel drawer | absent | — | resolved |
| Surface state registry | absent | `config/ui-surface-registry.json` | **do now:** create; rewrite `scripts/audit-ui-authority.ts` to audit the real shell; wire `npm run audit:ui-authority` |

---

## 2. Do now — exact edits

| # | File | Edit | Proof |
|---|---|---|---|
| D1 | `client/src/concept2cure/v2/styles/app-v2.css` | Inside the existing `@media (max-width: 640px)` block: when `data-ana-open="true"`, collapse grid column 3 to `0` and paint `.ana` as a fixed right-side drawer (`width: min(380px, 92vw)`, `z-index: 61`) above a new `.ana-scrim`; keep `.ana-seam` as the closed state. Desktop rules untouched. | Playwright walk at 390/430: `.ana` and its composer inside the viewport; `document.documentElement.scrollWidth === innerWidth` |
| D2 | `client/src/concept2cure/v2/V2App.tsx` | Render `.ana-scrim` (tap-closes AnA) beside the existing `.rail-scrim`; extend the phone-width Escape handler to close AnA too. | same walk; the scrim only exists ≤640px |
| D3 | `shared/navigation/index.ts` | Add `communication-center` to `NAVIGATION_TARGETS` (project scope). | `scripts/audit-ui-authority.ts` destination check; `shared/navigation` tests |
| D4 | `client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx:3412` | `var(--accent-100, #d97757)` → `var(--accent-100)` (token always defined; zero pixel change). | grep `#d97757` in `v2/` returns nothing |
| D5 | `client/index.html` | Drop the Poppins font request if present (no rule consumes it; `--font-sans` is the system stack). | audit script Poppins check |
| D6 | `config/ui-surface-registry.json` (new), `scripts/audit-ui-authority.ts` (rewrite), `package.json` (`audit:ui-authority`) | Registry of shell/nav/token/view/hosted/legacy files with status; the script checks each, the single-owner rule, the `ownsConversation` budget, rail limits, the five destinations' reachability, and Poppins. | script shown failing on the pre-fix tree (3 findings), then green |

---

## 3. Escalate — the product owner's calls

| # | Question | Constitution says | Today | If yes |
|---|---|---|---|---|
| E1 | Re-order project landing so the conversation panel leads (title → "Ask AnA about this project / Resume / New chat" → recent chats/artifacts/files → capability grid → readiness)? | §10.3: no KPI hero, conversation-first | `ProjectHome.tsx:1245-1378`: lifecycle band + capability grid first; conversation panel mid-column | move `.pj-convo` above the capability grid; readiness ring to the aside; ~40 lines, no data change |
| E2 | Consolidate the five composers onto one `Composer` component? | §10.1 one composer | five markups sharing `useChatUpload` | extract from `Shell.tsx:1122-1180`; the thread and home adopt it; project home stub keeps its seed-and-navigate behaviour |
| E3 | Build inline `@app` / slash autocomplete in the composer? | §10.1 required | `+` menu sends a message ("Show slash commands and skills") — no parser | popover over `UI_SURFACES` (apps group) and `ana_capability_registry.slash_command`; insert token; server already carries `slash_command` per capability |
| E4 | Re-open the rail IA (five destinations) or the serif chrome? | §4, §12 | declined 2026-07-28 | re-apply PR #1187's collapse; this work order does not |

---

## 4. Route and nav table

| Old nav / route | Problem (per §4) | New destination | Action |
|---|---|---|---|
| Workspace › Vault / Submission Center / Reporting & analytics | forbidden top-level (Vault, Submit, Analytics) | — | **closed by decision** |
| Explore › Artifacts Center | forbidden top-level (Documents) | — | closed by decision |
| Quick access › Recent Documents → `document-authoring`; brand mark → `document-authoring` | editor as top-level entry | — | closed by decision |
| Explore › Conversation | Chats not first | — | closed by decision (Home is chat-first regardless) |
| `communication-center` | not a rail item; **not a `navigate_to` target** | same surface | D3 adds the target; rail placement closed by decision |
| Settings | no rail item | account menu | intended (Claude parity) |
| `/concept2cure/mdx`, `/concept2cure/pdev` | were second apps | hosted surfaces | already done |
| `/client-portal` | second world | redirect → `/concept2cure` | already done |

No zombie routes: `ZenRouter.tsx:237` catch-all redirects everything else to `/concept2cure`.

---

## 5. Viewport test plan

Widths: 1440, 1280, 1024, 834, 768, 430, 390. Surfaces: home, conversation-thread, projects, project-home, communication-center, apps, tasks, submission-center, review, document-authoring, biostatistics. Method: Playwright + the pre-installed Chromium against the dev server, signed in through `POST /api/auth/dev-login` against a locally provisioned auth schema. Per page: grid columns, rail/AnA/main boxes, composer boxes and whether any is off-screen, `scrollWidth` vs viewport, page errors, screenshot. Before and after D1/D2.

---

## 6. Acceptance criteria (copied from the design doc §18, marked)

**Structural** — one shell owner ✓ · one nav source ✓ · one chats view / one projects view / one project landing ✓ · one Communication Center ✓ (agency loop) · one apps view ✓ · one settings surface ✓ (account menu) · editor canonical ✓.

**Behavioural** — new general chat in one click ✓ (Home composer, rail composer) · new project chat in one click ✓ (`ProjectHome` composer) · resume recent chat ✓ (thread history) · file attach from composer ✓ · `@app` invocation ✗ (E3) · project context visible ✓ (TopBar breadcrumb, `readShellProject`) · review/task/submission routing via Communication Center ✗ — those live in `review`, `tasks`, `submission-center`; the Communication Center is the agency loop (E1/E3-adjacent product question, recorded).

**Visual** — clean sans shell typography ✓ with four serif chrome classes retained by decision · neutral palette ✗ warm-cream brand palette retained by decision · border/radius/spacing consistent ✓ (token-authority gate) · no dashboard-card hero on project landing ✗ (E1).

**Responsive** — all widths checked (validation report) · sidebar drawer ✓ · AnA drawer ✓ after D1 · no mobile composer breakage ✓ after D1.

**Regression** — editor opens ✓ · artifact lifecycle reachable ✓ · review reachable ✓ · submission reachable ✓ · no dead routes ✓ · no shell-escape ✓ (validation report).
