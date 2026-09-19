# AnA UI Forensic Audit — 2026-09-06

**Phase 1 of the AnA UI Master Work Order.** Authority: `ana-ui-design-constitution` (design guidance), `ana-chatgpt-parity-ui` (execution), `ana-ui-master-work-order` (phasing). Measured against the working tree at `c6cf9f54` on `concept2cure-v2`. Supersedes the factual sections of `ANA_UI_FORENSIC_AUDIT_2026-07-28.md`; carries that audit's recorded product decision forward unchanged.

---

## 0. The standing constraint this audit works under

`ANA_UI_FORENSIC_AUDIT_2026-07-28.md` §0 records a **product-owner decision (2026-07-28)**: the rail is not to be collapsed to the constitution's five destinations (PR #1187 did it and was reverted in full), and three serif chrome elements stay serif. Its wording: *"Where this repository and that document disagree about what the user sees, the repository wins. A future reader should not treat §4 as an outstanding defect to be closed."*

Nothing in the tree since then reverses that. This audit therefore measures the constitution's **structural, behavioural, responsive and regression** criteria in full, and reports the **IA (§4) and shell-typography (§12)** criteria as *measured against a decision*, not as defects to close. Re-opening either is the product owner's call and is put to them explicitly in the work order.

---

## 1. Answers to the fourteen questions

### Q1. What file owns the top-level shell?

One owner, three files, one direction:

```
client/src/main.tsx:42-59            providers + <App/>
client/src/App.jsx:85-106            outer <Switch>: auth aliases, /client-portal redirects, catch-all → ZenRouter
client/src/concept2cure/router/ZenRouter.tsx:158-182   uiV2Owns → <PortalAuthProvider><ProtectedZenApp/> (persists across nav)
client/src/concept2cure/v2/V2App.tsx:736-862           the frame: .c2c-v2.shell grid, rail | main | ana
client/src/concept2cure/v2/Shell.tsx                   Rail (:142), TopBar (:373), AnaRail (:521), CmdK (:1500)
```

Routing is internal to V2App: `/concept2cure/<seg>` → surface id via `v2/routing.ts:11-17` and `DEEP_LINK_ALIASES` (`registryModel.ts:1031-1060`); `nav()` = `setLocation(locationForSurface(id))` (V2App.tsx:280-284).

**Verdict: one shell owner. Law 6 satisfied.**

### Q2. How many alternate shell files exist?

**Zero routable.** Only two `<Switch>`es in the client (`App.jsx:85`, `ZenRouter.tsx:187`); ZenRouter's handles auth entry and redirects only; its catch-all redirects to `/concept2cure` (:237). The two former second applications are now hosted surfaces that render no chrome of their own: `concept2cure/mdx/MdxSurfaceHost.tsx:5-27` ("There is one shell. It is v2's") and `concept2cure/pdev/App.tsx:108-135`. `client-portal` is a surface inside the shell (`surfaceViews.ts:383`); `/client-portal` URLs redirect (`App.jsx:93-94`).

Every file the constitution names for demotion is absent: `ZenApp.tsx`, `ZenSidebar.tsx`, `zen-app-constants.ts`, `AnaPersistentPanel.tsx`, `ProjectWorkspaceShell.tsx`, `EditorPanel.tsx`, `GlobalOperatingShell.tsx`, `IndustryWorkspaceShell.tsx`, `ToolPanel.tsx`.

### Q3. How many nav maps exist?

**One source, `v2/registryModel.ts`**, read by `Shell.tsx:46-53`. It carries four rail arrays and two orthogonal tier axes:

| Rail section (as labelled) | Constant | Items |
|---|---|---|
| Client categories (segment toggles, not destinations) | `CLIENT_CATEGORIES` `:306-315` | Medical Device & IVD · Biotech & Pharma · Diagnostics · CRO / Research · Health Systems |
| Workspace | `RAIL_CORE` `:93-99` | Project management · Vault · Submission Center · Tasking · Reporting & analytics |
| Science & intelligence | `RAIL_SPECIALIST` `:101-105` | CMC / Module 3 · Risk-based monitoring · FDA CRL library (flag-gated) |
| Explore | `RAIL_EXPLORE` `:107-113` | AnA Command · AnA Memory · Apps catalog · Artifacts Center · Conversation |
| Quick access | `RAIL_QUICK` `:115-121` | Recent Documents → document-authoring · My Tasks → tasks · Starred Items → projects |

16 destination buttons (14 unique targets) + 5 segment toggles = **21 rail buttons**. The rail is not segmented; every segment sees the same sections (`Shell.tsx:278-306`).

Tier axes that the rail does **not** read: structural `navTier` on every registry entry (`shared/constants/ui-surface-registry.ts:39-41`; `surfacesByTier` at `registryModel.ts:1068-1076` has no client consumer) and client-type `NAV_TIERS_V2` / `NAV_GROUP_OF` (`registryModel.ts:32-85`) used only by the TopBar breadcrumb (`Shell.tsx:396,424`). Per-segment module inventories (`SEGMENT_MODULES`, `registryModel.ts:534-730`) render inside project home, not the rail.

`NAV_HIDDEN` (`registryModel.ts:123-157`) keeps ~30 surfaces reachable by ⌘K/deep link only.

### Q4. Where are general chats rendered?

Two places, one protocol: the shell's AnA rail (`V2App.tsx:388` `useAnaChat` → `AnaRail`, `Shell.tsx:521-1478`) and the full-page thread `surfaces/ConversationThread.tsx` (its own `useAnaChat` at `:648`, seeded through `window.C2C_CONVO`, `ConversationThread.tsx:300`). The Home landing (`surfaces/Surfaces.tsx:107-239`) is a greeting plus a composer that seeds the thread and navigates to it — **the front door is chat-first.**

### Q5. Where are project chats rendered?

`surfaces/ProjectHome.tsx:832-848` (`.pj-convo` + `.pj-composer`): the composer does not stream in place; it seeds `window.C2C_CONVO` with the project and opens `conversation-thread` (`openThread`, `ProjectHome.tsx:570`), where `ConversationThread` reads `projectId` from `readShellProject()` (`:643-646`). One click from project landing to a project chat: **satisfied**.

### Q6. What file owns project landing?

`surfaces/ProjectHome.tsx` (`surfaceViews.ts:509`, `full: true`). First impression (`:1245-1378`): breadcrumb, `<h1>` + metadata chips, a lifecycle-stage tablist and band, then a two-column grid — left: a "Workspace" capability grid from `getSegmentModules` (`:872-890`), "Conversations" (`:894-902`, with the composer), "Module completion" bars, "Tasks & readiness", "Team & activity"; right: Memory, drafts, files. A dossier-readiness ring at `:1375-1378`.

**Measured against §10.3:** the three primary CTAs exist (ask, resume, new chat — via the Conversations panel), recent artifacts/files/tasks are present. The first impression is **capability grid + readiness ring**, i.e. dashboard-first rather than conversation-first. Not covered by the 2026-07-28 decision; **open, and escalated in the work order rather than changed unilaterally** — it is a product-shape decision of the same order as the rail.

### Q7. Does a Communication Center exist?

**Yes as a surface, no as a destination.** `surfaces/CommunicationCenter.tsx` (registered `surfaceViews.ts:385`) has four tabs — FDA loop, Agency inbox, Meetings & commitments, Authority profiles (`:555-572`) — backed by real reads (`/api/concept2cure/projects/:pid/agency-communications`, `/api/ha-interactions/*`, `/submission-center/items`). It is the **agency-communication** loop, not the constitution's inbox/tasks/reviews/submission-queue router. Reviews live in `review` / `review-threads`; the task board in `tasks`; submissions in `submission-center`.

Reachability: not in any rail array. Reached from `SEGMENT_MODULES` "Applications & filing" (project home / Apps), a cross-link in `FilingsCatalog.tsx:112`, ⌘K, or `/concept2cure/communication-center`.

### Q8. Where are apps surfaced?

Rail → "Apps catalog" (`apps`, `registryModel.ts:110`) → `Apps` in `surfaces/AdminSurfaces.tsx:1693`: live module catalog (`/api/module-subscriptions/catalog` + `/license`) with per-module enable toggles and licence verdicts — §10.5's management view. Three specialist apps are also promoted into the rail (`RAIL_SPECIALIST`). Daily invocation from the composer: **not present as `@app`** (see Q14).

### Q9. Where do settings live?

There is no `settings` surface. Settings are the **bottom-left account menu** (`Shell.tsx:176-201`, `ACCT_ITEMS`): Admin, Licensing, Access requests (org-admin gated, `:135-139`), Usage & limits, Billing, View all plans, Set up a workspace, Codebase coverage, Get help, Log out. The code comment says this mirrors Claude's placement deliberately. Admin-tier surfaces (`setup`, `audit-trail`, `part11-console`, `identity-console`) are ⌘K/deep-link only.

### Q10. What controls shell typography, colours, borders, spacing?

`design-system/colors_and_type.css` (604 lines) is the canonical token source, pinned by `tests/ui/token-authority.test.ts`, which walks the real import graph from `main.tsx` and fails on any other sheet declaring a token, on the canonical sheet imported twice, or on two reachable sheets disagreeing about a value. `client/src/index.css` is an alias shim; `v2/styles/app-v2.css` holds layout metrics only (`--rail`, `--ana`).

| Token | Value | Constitution |
|---|---|---|
| `--font-sans` `:454` | system-ui stack; `.c2c-v2` chrome is sans at 13px (`app-v2.css:72-77`) | ✓ |
| `--font-serif` `:463` | Lora → Georgia; used by `.prose-reading`, `.doc-content`, and four chrome classes (`.pj-title`, `.ana-ctx-section`, `.ana-msg.ana .bd`, `.ana-greet-t`) | chrome serif **retained by the 2026-07-28 decision** |
| `--accent-main-100` `:84` | `#d97757` ("THE brand color") | terracotta accent **retained**; it is the accent, not the shell atmosphere |
| `--bg-000/050/100` `:69-76` | `#faf9f5 / #f5f4ee / #f0eee6` (warm cream) | not neutral stone; part of the same brand decision |
| motion `:243-248` | 100/200/300 ms, `--ease` `cubic-bezier(.4,0,.2,1)`, `--ease-spring` is a no-overshoot decel | ✓; `scripts/ci/check-design-system-compliance.mjs` forbids spring/bounce |

Residue outside the token layer inside `v2/`: one literal fallback `var(--accent-100, #d97757)` in `surfaces/AdminSurfaces.tsx:3412` (the token is always defined, so the literal never paints; removed in this pass). `Lora` appears only as `var(--font-serif,'Lora',…)` fallbacks in `device-v2.css` and `research-v2.css` document-page classes.

### Q11. What legacy shell files must be demoted?

None remain. See Q2.

### Q12. What routes or nav ids violate the new top-level IA?

Against §4 literally: **Vault**, **Submission Center**, **Reporting & analytics** (analytics dashboard), **Artifacts Center**, **Recent Documents → document-authoring** (an editor entry) and the **brand-mark button → document-authoring** (`Shell.tsx:265-272`, "Document workspace") are top-level. **Chats** is present but third-section ("Conversation" under Explore, and the Home composer). **Communication Center** and **Settings** are not rail destinations.

**All of the above is the navigation the product owner confirmed on 2026-07-28.** Recorded, not actioned.

### Q13. How many `LayoutMode` values exist?

The enum no longer exists in any shell file. Surface layout is two booleans on `surfaceViews.ts` entries: `full` (~50 surfaces) and `ownsConversation` (6: client-portal, conversation-thread, document-authoring, ectd-coauthor, insights, rbm). The work order's "22+ → 5-7" target is void.

### Q14. What is the state of `AnaPersistentPanel` mode logic?

The component is gone. Its successor, `AnaRail`, has two states: open (380px) or a 32px seam (`data-ana-open`, `app-v2.css:1284-1285`); it is omitted entirely on the six `ownsConversation` surfaces, each of which draws its own conversation (the `surfaceViews.ts` union makes "hide the rail and still ask it" a compile error). There is no compact mode. **Resolved.**

Composer capability (§10.1), measured in `Shell.tsx:1122-1180` and `ConversationThread.tsx:886-907`: multiline input ✓, attach via + menu and file input ✓ (real `POST /api/chat/upload`), drag/drop ✗, `@app` inline invocation ✗ (the + menu offers "Run a RIM tool" and "Slash commands & skills", both of which *send a message*; there is no mention parser or autocomplete), slash commands ✗ (same), insert template ✗, launch canvas/editor ✓ (Home quick actions; message actions in the thread), send ✓. Five composers exist (rail, thread, home, project home stub, eCTD co-author) sharing `useChatUpload`; they are not one component.

---

## 2. Responsive — the one structural defect found

`Shell.tsx` has no media queries; breakpoints live in `app-v2.css`.

- Rail: at `≤640px` the rail is forced collapsed and an expanded rail becomes a fixed 300px drawer over a scrim (`app-v2.css:1260-1281`), Escape-closable (`V2App.tsx:719-729`). ✓
- **AnA rail: no breakpoint at all.** `.ana` is `grid-column:3; height:100vh` with the column fixed at `var(--ana)` = 380px whenever `data-ana-open` is true (`app-v2.css:1251,1537`). On a 390px or 430px viewport the shell grid is `56px | 1fr | 380px`: the centre column is negative-width and the conversation rail alone exceeds the screen. This is the constitution's §6 mobile rule ("right context becomes a slide-over") unmet, and it is not part of any recorded decision. **Fixed in this pass** (see the work order and validation report).
- TopBar degrades at 1180px and 900px (`app-v2.css:1414,1955`). Surface grids collapse at 980px (`.pj-grid`), 760/1080px (project-home), 900/980px (ana-v2). `commcenter-v2.css` has no width breakpoint.

---

## 3. What is kept, demoted, redirected, deleted

| Concern | File | Status |
|---|---|---|
| Shell frame | `v2/V2App.tsx` | **Canonical** |
| Chrome (rail, topbar, AnA rail, ⌘K) | `v2/Shell.tsx` | **Canonical** |
| Nav source | `v2/registryModel.ts` | **Canonical**, per 2026-07-28 decision |
| Surface renderer map | `v2/surfaceViews.ts` | **Canonical** |
| Routing | `router/ZenRouter.tsx`, `v2/routing.ts` | **Canonical** |
| Tokens | `design-system/colors_and_type.css` | **Canonical**, gated by `tests/ui/token-authority.test.ts` |
| Chats | `AnaRail` + `surfaces/ConversationThread.tsx` | Canonical |
| Project landing | `surfaces/ProjectHome.tsx` | Canonical; shape escalated (Q6) |
| Communication Center | `surfaces/CommunicationCenter.tsx` | Canonical for agency comms; not the §10.4 router |
| Apps | `surfaces/AdminSurfaces.tsx#Apps` | Canonical |
| Settings | account menu (`Shell.tsx:176-201`) + admin surfaces | Canonical |
| Hosted former apps | `mdx/MdxSurfaceHost.tsx`, `pdev/App.tsx` | Refactored into children (done before this audit) |
| Constitution-named legacy shells | — | Deleted (absent) |
| `scripts/audit-ui-authority.ts` | | **Stale**: fails on absent `zen-app-constants.ts` and `ZenSidebar.tsx`; rewritten in this pass to audit the real shell |
| `config/ui-surface-registry.json` | | **Absent** since the work order named it; created in this pass |

---

## 4. Risk notes

- Any change to `RAIL_*`, the account menu, `.pj-title`/`.ana-*` serif rules or the accent token re-litigates the 2026-07-28 decision. This pass makes none of those changes.
- The AnA-rail mobile drawer changes layout below 640px only; desktop CSS is untouched and the grid rules above 640px are byte-identical.
- `scripts/audit-ui-authority.ts` is not wired into `package.json` or the pre-push hook; rewriting it cannot break CI. It is wired into `npm run audit:ui-authority` in this pass so it can be.
- The local database used for browser verification was provisioned from the auth tables only (the Drizzle push fails on this tree's known FK issue and pgvector is unavailable here). Surfaces that read other tables render their honest empty/error states; that is sufficient for shell, nav, composer and responsive verification and is stated in the validation report.
