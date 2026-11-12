# Inventory: app shell, Home, Projects, the project page and Tasks

Investigated 2026-11-10 on `concept2cure-v2` at HEAD `8c7664b35`, compared with the baseline `bd1338c25` (committed 2026-10-30 20:29 UTC). For surfaces deleted earlier, the tree before each deleting commit is used. The repository was only read. Revert tests ran in a `--shared --no-checkout` clone in the scratchpad, using `git merge-tree`.

## Summary of findings

1. **Since the baseline, very little in this area was deleted outright.** Under `client/src/concept2cure/v2` three files went: `surfaces/ProjectComingLater.tsx`, `surfaces/CsrSourceInputControls.tsx` (CSR, not in this area) and `fixtures/etmf.ts` (eTMF, not in this area). The visible loss comes from moving things:
   - **Home.** The project list and open work now sit below a chat composer that starts 22vh down the page.
   - **Projects.** The portfolio figures and each card's readiness, stage and lead are shown only in List view. Grid is the default and the choice is not remembered.
   - **Project page.** The step guidance, the readiness ring, Records, Activity and Section tracking were collapsed into closed disclosures or dropped.
   - **Top bar.** The visible search field, Help, the organisation name and the "No project open" chip were removed.
2. **The rail did not shrink after the baseline. It grew from 9 to 11 entries** (Submission Center and Biostatistics were added). Vault, Tasks and Quality became openable without a project (`shared/navigation/index.ts`).
   - The big rail cut was `d97388005` (2026-10-25, founder decision P-47), which is before the baseline. It took the rail from 12 entries to 8.
3. **The larger "built but not shown" gap in project management is server-side.** Several complete PM engines have no client caller, or have a client that the launch-scope gate locks. In production most of them are refused with **403 `LAUNCH_SCOPE`**. The verdicts come from the repo's own `launchScopeApiVerdict` in `server/services/entitlements/launch-scope-api.ts`; see section 3. The main ones:
   - section-level milestones, timeline, owners and deadlines: `/api/project-sections`;
   - the program engine: `/api/mission-control` (38 endpoints);
   - a submission-ops command centre with due-soon, hotspots, workload, blockers and approval bottlenecks;
   - the Sentinel deadline and cross-project risk analyzers, which run on a timer and are never shown;
   - project tasks tied to submission milestones: `/api/concept2cure/projects/:id/tasks`.
4. **Post-login landing.** Sign-in sends the user to `/concept2cure` (`auth/ZenLogin.tsx:225`, `components/concept2cure-auth/Concept2CureLogin.tsx:305`). `routing.ts` resolves that to `home` in both the baseline and HEAD. What changed is what Home shows: `4a5cc0d22` (2026-10-31, "Home and sidebar take Claude's shape").
   - Before: greeting and client type, the setup checklist, **Your projects**, **Your tasks**, Ask AnA, Recent conversations.
   - After: greeting, then the composer "How can I help with your filing today?", then setup, projects and tasks underneath, with `padding-top:max(40px,22vh)` (`styles/surfaces-v2.css:46`).
   - The sidebar now opens with **New conversation** and **Search**, then the places, then **Recents**. Recents lists three projects, then conversations; when there are none it says "Your conversations appear here." (`Shell.tsx` RailRecents).

---

## 1. Timeline of commits that removed or hid capability in this area

Commits marked **(pre-baseline)** are included because they are folds in this area within the 2026-10-26 campaign. "Founder" marks a change the commit message says the founder directed.

| Date | Hash | Subject | What was removed or hidden, in plain words |
|---|---|---|---|
| 2026-10-23 | `c50f8810e` | Complete workflow discovery in the existing client catalog | **(pre-baseline)** Deleted `CapabilityBrowser.tsx`, Home's browsable list of capabilities. Converged onto `WorkflowCatalog.tsx` ("Subscription & features", which org admins reach from the account menu). |
| 2026-10-25 | `d97388005` | Start clients at their projects: a short rail, a start-here Home, Plan & features | **(pre-baseline, founder P-47)** Rail cut from 12 entries to 8. Gone from the rail: Workflows (87-feature catalog), Submission Center (re-added 10-31), My work, Conversation. Home lost the per-segment "actions" and "Explore workflows". |
| 2026-10-26 | `8b192f1e7` | Fold dossier screens into ProjectDossier and resolve project destinations | **(pre-baseline)** Deleted the `Dossier.tsx` (per-CTD-section readiness table) and `DossierMap.tsx` (M1–M5 module map) screens, and the `/api/dossier-readiness` and `/api/dossier-map` routes. Their content lives in `ProjectDossier.tsx` on the Author step. |
| 2026-10-26 | `b9975a914`, `37f2ed240` | Fold filing catalogue into core project workflow / Fold filing reference discovery into canonical intake and recorded Plan | **(pre-baseline)** Deleted `FilingsCatalog.tsx`, the standalone index of 113 filing types by segment and category, with a detail slide-over and "Start". Its tables moved into New project's RegistryPicker (`surfaces/AnaVerbs.tsx`), `v2/FilingReference.tsx` and Plan. |
| 2026-10-26 | `f9c84bdf1`, `ce8cae239`, `fb73f05f8` | converge project creation… / retire duplicate HTTP project creation paths / retire alternate project creators | **(pre-baseline)** Retired AnA's `create_project` command and 12 POST creators that nothing called. The server change is invisible to users; the wizard is the one creator. |
| 2026-10-29 | `2168fd569` | Fold device-tasks into Tasks, carrying the blocking flag | **(pre-baseline)** Deleted the device task workbench (TasksSurface in `mdx/workbench/Workbench.tsx`). `/api/submission-ops/workload` and `/unified-work` were left with no caller. |
| 2026-10-30 | `041880cbd` | Fold F5 item 2: no organization-wide blocker list… | **(pre-baseline)** Deleted the org-wide device blocker list (ValidationSurface) and its "Pass" on low-severity blockers. `/api/submission-ops/blockers` lost its claimant, so production refuses it. |
| 2026-10-31 | `970bc3637` | Folds F4 and F6: device analytics into Reporting, the device workstream into Projects | Deleted `mdx/surfaces/Overview.tsx`, the **device portfolio health page**: KPI cards for active projects (510(k), PMA and cleared split), average readiness with a bar, **Blockers open** (named) and **Submissions in flight**; a "Readiness report" AnA button; and per-project "Ask AnA" chips, owner initials and a next-blocker line. The two blocker and in-flight figures were dropped. |
| 2026-10-31 | `4a5cc0d22` | Home and sidebar take Claude's shape… | **(founder direction 10-31)** Home leads with the composer; Your projects and Your tasks pushed below it, with a 22vh top pad. Deleted Home's "Recent conversations" (moved to the sidebar Recents). |
| 2026-10-31 | `c927d2e66` | Home: stop destructuring the client type it no longer prints | Client type no longer shown beside the greeting. |
| 2026-11-01 | `7a9b896b9` | The sidebar opens with New conversation and names the organisation | The sidebar's first items became "New conversation" and "Search". Organisation access moved from the top bar to the sidebar foot. |
| 2026-11-01 | `eab679936` | Project home takes the shape of Claude's project page | **(founder 11-01)** Removed the PROJECT crumb and six uppercase header chips. Facts moved into an "About" card. |
| 2026-11-01 | `465bc23a8` | Project page: plain words, doors to the work areas, tabs that claim no progress | Deleted `ProjectComingLater.tsx` (roadmap lines). Step tracker nodes became tabs. Plan's "Your tasks" link removed. Plan's work-area select replaced by doors. The market gate detail moved behind a "Rule detail" disclosure. Also **adds** things that must be kept; see section 4. |
| 2026-11-01 | `91d52716b` | Biostatistics is reached from the project, not a new rail entry | Biostatistics taken off the rail. **Re-added by `5144702d2` on 2026-11-06**, so nothing is lost at HEAD. |
| 2026-11-01 | `78842ee08` | Projects reads like Claude's: one action, a quiet toolbar, calm cards | Removed: the header "Ask AnA: Which projects are at risk this week?"; the **portfolio figures above the list** (now only under the List view); the readiness **bar**, stage, lead, client-type chip and status chip on **cards**. The filter buttons with counts became selects. |
| 2026-11-01 | `6661f4690` | Projects and New project: say what is missing… drop the empty blocker | The list's always-empty Blocker column became Status. The wizard's step 2 stopped showing transmit caveats. |
| 2026-11-02 | `f7b11e77a` | The top bar names where you are, quietly… | Top bar lost: the visible **search box** ("Search, jump, or run a command ⌘K"), **Help**, the organisation name and mark, the root and category crumbs, the "No project open → choose one in Projects" chip, and the label on the "Task" button. |
| 2026-11-02 | `c6514fc80` | The command palette offers recent conversations, New task and Message a colleague | ⌘K lost its keyboard-hint footer and its "AnA" header; the rest is additive. |
| 2026-11-02 | `64ac5674a` | New project reads like the Projects page… | Removed the wizard's "Team members" field. It was a placeholder saying the feature "isn't available yet", so this is **not a capability loss**. |
| 2026-11-06 | `a9819177d` | Project page: AnA's composer leads, the steps are one quiet control, settings open as a drawer | Deleted **StageBand**, the per-step "**What to do now:** …" instruction and the "**Next step →**" button. The `PJ_LIFECYCLE[].now` text is no longer rendered anywhere. |
| 2026-11-06 | `6cd6d7c92` | Project page: the team is a card on every step, managed in a drawer… | The Team section left Plan. Roster and sharing controls now open in a drawer from "Manage". The capability is still there. |
| 2026-11-06 | `8225e3075` | Project page: Project knowledge is the same on every step… | "Records in this project" left Author's main column for the side card, where each store is a **closed** disclosure. |
| 2026-11-06 | `e84c4f1ef` | Project page: commitments… Activity is the Records card's last disclosure | The **Activity** (audit) feed left Author for a **closed** disclosure at the bottom of the side card. |
| 2026-11-08 | `d50c5f07e` | D3-4: the project page's step bodies… | Removed the **dossier readiness ring**. Deleted the **Tasks and approvals panel on the Review step** (it is now on Plan only). "How this is measured", **Artifact section status** and **Section tracking** became closed disclosures. |

The S1, S11 and S12 commits in the same window add capability rather than remove it: objective, program plan, workstreams and schedule line, portfolio line, and work projects. They are listed in section 4.

---

## 2. Capabilities present before and absent or harder to reach at HEAD

How the server column was checked:
- "Mounted" was checked in the `server/bootstrap/*.ts` file named, and `server/startup/routes.ts` was checked to call that bootstrap function.
- "Prod" is the verdict of `launchScopeApiVerdict` for the path (`server/middleware/moduleEntitlementGate.ts:118`): **launch** is served; **out-of-scope** is always refused with 403 `LAUNCH_SCOPE`; **unmapped** is refused in production.
- No live HTTP calls were made.

Value is for a paying regulatory-affairs team (biotech, pharma or device).

### A. Post-login Home

| # | Capability (user's words) | Where it was | What is there now | Server API: route → handler; mount; prod | Value | Effort |
|---|---|---|---|---|---|---|
| A1 | "When I log in I see my projects and my open work" | `v2/surfaces/Surfaces.tsx@bd1338c25` Home: HomeSetup → **HomeProjects** (5 most recent: code, title, client type · stage · status) → **HomeTasks** → Ask AnA → Recent conversations | `Surfaces.tsx@HEAD`: greeting, then the composer, then the same three sections below it, the page starting 22vh down (`styles/surfaces-v2.css:46`, from `4a5cc0d22`). The sidebar leads with New conversation, Search and Recents. | `GET /api/c2c/projects` → `server/routes/c2c/projects.ts:590`; mounted `register-inline-routes.ts:841`; launch. Open work: `GET /api/task-management/my-work` → `taskManagement.routes.ts:1690`; mounted `register-advanced-platform-routes.ts:213`; launch. **Works.** | HIGH: the first thing a regulatory lead wants after sign-in is the state of their filings and what is due. This is the founder's complaint. | S |
| A2 | "Recent conversations on Home" | `surfaces/HomeSections.tsx@4a5cc0d22^` `HomeConversations` | Sidebar Recents (`Shell.tsx` RailRecents, up to 15) and ⌘K "Recent conversations". Moved, not lost. | `GET /api/chat/threads` → `server/routes/chat.ts:120` (`chat/threads.ts`); mounted `register-ai-routes.ts:49`; launch. Works. | LOW (relocated) | — |
| A3 | Client type next to the greeting | `Surfaces.tsx@bd1338c25` (`landing-segctx-cat`) | Nothing on Home. The account menu still sets the client type. | client only | LOW | S |

### B. Shell: top bar and rail

| # | Capability | Where it was | What is there now | Server | Value | Effort |
|---|---|---|---|---|---|---|
| B1 | A **visible search field** in the top bar ("Search, jump, or run a command ⌘K") | `v2/Shell.tsx@f7b11e77a^` TopBar `.tb-cmdk` | A "Search" row in the sidebar (`Shell.tsx` Rail), and ⌘K | client only | LOW–MED (discoverability for non-keyboard users) | S |
| B2 | **Help** button in the top bar | `Shell.tsx@f7b11e77a^` (opens `conversation-thread`) | Account menu → "Get help" only | client only | LOW | S |
| B3 | "**No project open → choose one in Projects**" chip; organisation name; category crumb | `Shell.tsx@f7b11e77a^` `ProjectChip`, `.tb-org`, `crumb-tier` | A project crumb only when a project is open, and nothing when none. Organisation name on the sidebar account line. | client only | LOW | S |
| B4 | Labelled "Task" button | `Shell.tsx@f7b11e77a^` `.tb-task` | Icon-only `.tb-newtask`, plus ⌘K "New task" | client only | LOW | S |
| B5 | Rail destinations | baseline `registryModel.ts@bd1338c25:166` had 9 entries: Home, Projects, Tasks, Communication, Vault / CMC, RBM, Quality, Reporting | HEAD `registryModel.ts:168` has 11 (adds Submission Center and Biostatistics). **No loss since the baseline.** | — | — | — |

### C. Projects (portfolio) and New project

| # | Capability | Where it was | What is there now | Server API | Value | Effort |
|---|---|---|---|---|---|---|
| C1 | **Portfolio dashboard figures** at the top of Projects: active projects, average dossier readiness (with how many it covers), filing within 60 days | `v2/surfaces/Projects.tsx@78842ee08^` `.pj-summary` above the toolbar | `Projects.tsx@HEAD` renders `.pj-summary` **only when `view === 'list'`**, below the table. The default is `useState('grid')` (`Projects.tsx:1314`) and is not persisted, so by default the figures are not shown. | `GET /api/c2c/projects` (with server counts) → `c2c/projects.ts:590`; mounted `register-inline-routes.ts:841`; launch. **Works.** | HIGH: a director's first question is "how is the portfolio doing?" | S |
| C2 | **Readiness bar, stage, lead, client type and status on every project card** | `Projects.tsx@78842ee08^` (`ph-bar-track`, `pj-card-m` code · stage · Lead, `rd-chip`s) | Cards show the title, one description line, the S11 plan line, code · last activity, and due date. Readiness, stage, lead and client type appear only as **List view** columns. | Same route; readiness per row from the dossier read. Works. | HIGH: progress at a glance across filings | S |
| C3 | "Ask AnA: **Which projects are at risk this week?**" on Projects | `Projects.tsx@78842ee08^` header button | Nothing on Projects. ⌘K's "Ask AnA" or the Home composer can be used. | `/api/ana-ri/*` (launch platform, `launch-scope-api.ts` `LAUNCH_PLATFORM_API`) | LOW–MED | S |
| C4 | Client-type and pathway **filter buttons showing counts** | `surfaces/ProjectPortfolioFilters.tsx@78842ee08^` (`.ws-switch` buttons) | `<select>`s with "(n)" in each option | same route | LOW | S |
| C5 | **Device portfolio health page**: active projects split 510(k), PMA and cleared; average readiness with a bar; **Blockers open (named)**; **Submissions in flight**; "Readiness report"; per-project "Ask AnA"; owner initials; next-blocker line; grid/list remembered | `client/src/concept2cure/mdx/surfaces/Overview.tsx@970bc3637^` (the `device-workstream` surface) | `device-workstream` is now an alias to Projects with the MDX filter (`registryModel.ts` `DEEP_LINK_ALIASES`, `ALIAS_APPLIES`). Status counts, the 24-month pace and the AnA draft acceptance rate are in the device section of Reporting & analytics (`v2/surfaces/InsightsDevicePortfolio.tsx`). **Blockers open and Submissions in flight were dropped** because they were browser-derived. | Old source `GET /api/regulatory-programs` → `server/routes/regulatory-programs.ts:62`; mounted `register-inline-routes.ts:1150`; launch; works. New `GET /api/insights-canvas/overview` → `insights-canvas-routes.ts:589`; mounted `register-clinical-intel-routes.ts:189`; launch. The blocker engine `/api/submission-ops/blockers` is **unmapped (refused in production)**. | MED: device RA teams lose one-glance portfolio health | M (blockers and in-flight need a deterministic engine, Rule 2) |
| C6 | Organization-wide device **blocker list**, with "Pass" for low severity | `client/src/concept2cure/mdx/workbench/Workbench.tsx@041880cbd^` ValidationSurface | Per-filing `EstarFilingPanel` readiness inside each device pathway screen. `device-validation` is an alias to Submission Center. The "Pass" is deliberately not carried. | `GET/PATCH /api/submission-ops/blockers` → `server/routes/submission-ops.ts:1247,1297`; mounted `register-inline-routes.ts:1149`; **unmapped, refused in production** | MED: cross-filing blocker triage | M |
| C7 | Organization-wide device **client review zone** | `mdx/surfaces/Overview.tsx@970bc3637^` `ClientReviewZone` | Per device project, on the Review step (`v2/surfaces/ProjectClientReview.tsx`) | `/api/mdx/client-review` → `server/routes/mdx-client-review.ts`; mounted `register-inline-routes.ts:1195`; launch | LOW (moved and now project-scoped) | — |
| C8 | **Filings catalog**: browse 113 filing types by segment and category, with detail and "Start" | `v2/surfaces/FilingsCatalog.tsx@b9975a914^` (`filings-catalog`) | Only inside New project (`surfaces/AnaVerbs.tsx` RegistryPicker), `v2/FilingReference.tsx` and Plan's lifecycle reference. There is no standalone browse view. | no API (data moved to `shared/`) | LOW–MED (pre-sales and strategy reference) | M |
| C9 | Wizard step 2 **transmit caveats** | `Projects.tsx@6661f4690^` | Not shown in the wizard | client only | LOW | S |

### D. The project page (`v2/surfaces/ProjectHome.tsx` and its steps)

| # | Capability | Where it was | What is there now | Server API | Value | Effort |
|---|---|---|---|---|---|---|
| D1 | Each step says **"What to do now"** in a sentence, with a **"Next step →"** button | `v2/surfaces/ProjectStages.tsx@a9819177d^` `StageBand` | A one-line blurb under the steps, plus the step's question as a composer suggestion chip. The `PJ_LIFECYCLE[].now` text (`fixtures/project-home-data.tsx:308–339`) is **rendered nowhere**. "Next" is the next tab. | none (static) | MED: guides a new team member through the filing | S |
| D2 | Steps drawn as a lifecycle tracker (icon nodes on a line) | `ProjectStages.tsx@465bc23a8^` | Segmented tabs. The baseline already stated it was not a progress meter. | none | LOW | S |
| D3 | **Dossier readiness ring** | `v2/surfaces/ProjectDossier.tsx@d50c5f07e^` (`Ring`, 104 px) | A text figure on the Filing card (every step) and a figure line leading Module completion on Author | `GET /api/c2c/projects/:id/dossier` → `c2c/projects.ts:1315`; launch; works | LOW | S |
| D4 | **Records in this project** (submissions, data-room sources, documents, Vault documents, study designs, filing documents) shown open on Author | `ProjectHome.tsx@bd1338c25` AuthorWorkspace → `ProjectRecords` | One **closed** disclosure per store in the side "Records" card (`ProjectSide.tsx`, `ProjectRecords.tsx`) | `GET /api/c2c/projects/:id/records` → `c2c/projects.ts:1630`; launch; works | MED | S |
| D5 | **Activity** (the project's audit feed) shown open on Author | `ProjectHome.tsx@bd1338c25` AuthorWorkspace "Activity" | The last **closed** disclosure of the Records card (`ProjectActivity`) | `GET /api/c2c/projects/:id/activity` → `c2c/projects.ts:1556`; launch; works | MED: GxP teams expect a visible trail | S |
| D6 | **Section tracking**, **Artifact section status** and "How this is measured", shown open | `ProjectDossier.tsx@d50c5f07e^` | Closed disclosures under Module completion on Author | `/api/c2c/projects/:id/dossier`; launch; works | MED: section-level progress | S |
| D7 | **Tasks and approvals on the Review step** | `ProjectHome.tsx@d50c5f07e^` (Review: `ProjectWorkPanel` "Tasks and approvals") | Plan only. Review shows reviews, Quality records and (device projects) the client review. | `GET /api/concept2cure/projects/:id/unified-work` → `server/routes/project-schedule-of-events.ts:179`; mounted `register-concept2cure-routes.ts:46`; launch; works | MED: approvers look for approvals on Review | S |
| D8 | Header chips (client type, filing type, region, indication, status, priority, phase) | `ProjectHome.tsx@eab679936^` `.pj-tags` | Byline tags (filing, region, indication, status, priority) plus About facts (client type, code, phase) | `/api/c2c/projects/:id` → `c2c/projects.ts:1284` | LOW | — |
| D9 | Team roster and sharing open on Plan | `ProjectHome.tsx@6cd6d7c92^` | A Team card on every step (with each person's open work), managed in a drawer | `/api/concept2cure/projects/:id/team`, `/sharing` | LOW (reachable; arguably better) | — |
| D10 | Plan "Your tasks" link | `ProjectPlan.tsx@465bc23a8^` `MyWorkLine` | `DueForYou` on Plan (`53105ae3b`) lists what is due for you. **Improved.** | — | — | — |
| D11 | Each Submit row's gate detail shown open | `ProjectMarkets.tsx@465bc23a8^` `MarketGateDetail` | One plain sentence per blocker, with the detail behind "Rule detail" (`surfaces/MarketBlockers.tsx:139`) | Submission readiness reads; launch | LOW | S |
| D12 | "Coming later" lines per step | `surfaces/ProjectComingLater.tsx@465bc23a8^` | Nothing | none | **Do not restore.** It promised features that did not exist ("never fabricate"). | — |
| D13 | Dossier and dossier map screens | `surfaces/Dossier.tsx`, `DossierMap.tsx@8b192f1e7^` | `ProjectDossier.tsx` on Author | `/api/dossier-readiness` and `/api/dossier-map` were deleted; the data is now `/api/c2c/projects/:id/dossier` | LOW (folded with parity) | — |

### E. Tasks

| # | Capability | Where it was | What is there now | Server API | Value | Effort |
|---|---|---|---|---|---|---|
| E1 | Board, Critical path, Analytics and Table views; dependencies; impact score; regulatory flag; auto-assign; start a workflow from a template | `surfaces/TaskBoard.tsx@bd1338c25` | **All present at HEAD** (`TaskBoard.tsx:1298`, `1343`, `1406`, `1861`, `1928`, `1973`). Since `958c213e0` the board follows the open project. | `/api/task-management/board` → `taskBoard.routes.ts` (mounted `register-regulatory-routes.ts:363`); `/api/tasks/tasks*` → `taskManagement.routes.ts` (mounted `register-core-routes.ts:238`); launch | — | — |
| E2 | The "Task sources" legend and store labels | `TaskBoard.tsx@958c213e0^` | "Came from", with plain source names | — | LOW | — |
| E3 | Device task workbench | `mdx/workbench/Workbench.tsx@2168fd569^` | Tasks, with the "Blocking the submission" flag carried | `/api/submission-ops/workload` (`submission-ops.ts:1410`): **unmapped, no caller** | LOW (the fold reached parity; the old screen miscounted) | — |
| E4 | "Your work" tray | `TaskTray.tsx@bd1338c25` | Same function. The overdue count is now in the badge. Cosmetic only (`14dce5e38`). | `/api/mdx/notifications` (launch platform) | — | — |

---

## 3. Server capabilities in this area with no client caller today

The method: route definitions were grepped in each router; the mount was checked in `server/bootstrap`; and `client/src` (excluding `__tests__`) was grepped for the prefix and sub-path. Each prod verdict is from `launchScopeApiVerdict`, run against the repo's own registry.

| Route(s) | Handler; mount | Prod verdict | What it does | Client history |
|---|---|---|---|---|
| `/api/project-sections` with `/initialize`, `/`, `/summary`, `/:code`, `/:code/status`, `/:code/assign`, `/:code/deadline`, `/:code/comments`, `/:code/history`, `/dependencies`, `/milestones` (GET/POST/PATCH/DELETE), **`/timeline`**, `/notifications`, `/notifications/read-all` | `server/routes/project-sections.ts` (1,395 lines); `register-document-routes.ts:213` | **out-of-scope** (claimed only by the locked `regulatory-workspace`): 403 | **Section-level project management**: CTD sections with status transitions, **owner assignment, deadlines**, comments, history, dependencies, **milestones and a timeline**, notifications | No client caller anywhere in history (`git log -S'/api/project-sections' -- client/src` is empty) |
| `/api/mission-control/*` (**38 endpoints**) | `server/routes/mission-control.ts`; `register-advanced-platform-routes.ts:192` | **out-of-scope**: 403 | The "PM engine": programs → destinations → route plans → artifacts → evidence → dependencies → decisions → reviews → risks; **readiness computed on the server across nine dimensions**; Part 11 provenance | Client `v2/surfaces/MissionControl.tsx` (784 lines) is mounted at `surfaceViews.ts:388` but is **outside the launch catalog**, so `LaunchScopeGate` blocks it and no rail or door reaches it. Locked before this window. |
| `/api/concept2cure/projects/:projectId/tasks` (GET/POST/PUT/DELETE), `/tasks/bulk`, `/tasks/summary`, `/tasks/assess`; `/api/concept2cure/submission-milestones`, `/:type` | `server/routes/c2c/tasks.ts`; `register-concept2cure-routes.ts:32` | project tasks: **launch**; submission-milestones: **unmapped** | A regulatory-aware **project task list tied to submission milestones**, a bulk generator over the milestone catalogue, a summary with a **health score**, and AnA's task assessment | None |
| `/api/submission-ops/*` with `/command-center`, `/due-soon`, `/hotspots`, `/approval-bottlenecks`, `/workload`, `/unified-work`, `/blockers` (+PATCH), `/digests`, `/automation/*`, `/packages/:id/milestones`, `/packages/:id/readiness-history`, `/policies`, `/packages/*` | `server/routes/submission-ops.ts`; `register-inline-routes.ts:1149` | `/packages*`: launch (claimed by vault, tasks and communication-center); everything else: **unmapped**, refused | A cross-portfolio **operations command centre**: work due soon, hotspots, approval bottlenecks, per-owner workload, blocker register, package milestones, readiness history, digests | **No client caller at all.** `client/src` mentions it only in comments (`GatewayTransmittals.tsx:10`, `registryModel.ts:987`). |
| `/api/sentinel/status`, `/findings`, `/findings/:id`, `/scan`, `/scan/:type`, `/config` | `server/routes/sentinel-routes.ts`; `register-project-routes.ts` (mountAll) | **unmapped** | Proactive monitoring with five analyzers: **deadline risk, cross-project resource and timeline conflicts**, regulatory change, quality drift, budget burn. The scheduler **runs at boot** (`register-project-routes.ts`) and writes `sentinel_findings`, but no UI shows them. | None |
| `/api/pm-settings/:organizationId` (GET, PUT, `/reset`, `/history`) | `server/src/routes/pm-settings.router.ts`; `register-core-routes.ts:231` | **unmapped** | The organization's project-management settings, with a history; Sentinel reads and writes `pm_settings` | None |
| `/api/project-hierarchy/programs`, `/:id/tree`, `/:id/ancestors`, `/:id/move`, `/:id/rollup`, `/flat` | `server/routes/project-hierarchy.ts`; `register-project-routes.ts` | launch (`project-home`) | A four-level hierarchy (program → project → study → sub-project) with **rollups** and move | Only `/:id/children` is called (`ProjectWorkTasks.tsx:256`, `ProjectCoreWork.tsx:335`) |
| `/api/project-home/:projectId` | `server/routes/project-home-routes.ts`; `register-regulatory-routes.ts:381` | **unmapped** | A project cockpit read-model: readiness, next actions, members, conversations, keyed on the numeric `projects.id` | `ProjectHome.tsx:71` says it is deliberately not called |
| `/api/project-modules/:projectId/modules*`, `/find`, `/org-stats` | `server/routes/project-modules.ts`; `register-project-routes.ts` | **unmapped** | Links platform modules to a project; per-project module summary; org statistics | None |
| `POST /api/c2c/projects/:id/unarchive` | `c2c/projects.ts:2419` | launch | **Restores an archived project** (archive gained a UI in `465bc23a8`) | None: there is no restore control |
| `GET /api/c2c/projects/:id/drafts` | `c2c/projects.ts:1348` | launch | The project's most recently updated drafted sections | None |
| `/api/tasks/tasks/analytics`, `/api/tasks/tasks/bulk-create` (also under `/api/task-management`) | `server/routes/taskManagement.routes.ts:1291` and the bulk-create handler | launch | Server task analytics; bulk task creation | None. TaskBoard's Analytics tab computes its figures from the loaded rows. |
| `/api/unified-tasks/*` (`/all`, `/dashboard/unified`, `/by-module/:m`, `/sync/:m`…) | `server/routes/unifiedTasks.routes.ts`; `register-advanced-platform-routes.ts:214` | **unmapped** | A cross-module unified task dashboard | None |
| `/api/operating-system/*` (assumptions, **decisions**, governance rules, contradiction links) | `server/routes/operating-system.ts`; `register-governance-routes.ts:33` | **unmapped** | A **decision log and assumption register** with approve, supersede and escalate | None |
| `GET /api/cro-portfolio` | `server/routes/cro-portfolio.routes.ts`; `register-inline-routes.ts:938` | **unmapped** | A CRO sponsor portfolio: sponsors → studies, submissions, milestones, team assignments | `surfaces/CroPortfolio.tsx` exists but is locked (outside the launch catalog) |
| `GET /api/program-journey` | `server/routes/program-journey.routes.ts`; `register-inline-routes.ts:985` | **out-of-scope** | A nine-stage project arc with readiness, clock, health-authority questions and blockers | `surfaces/BiopharmaJourney.tsx` exists but is locked. Home's shortcut was removed by `d97388005`. |
| `GET/PUT/DELETE /api/device-projects` | `server/routes/device-projects.ts`; `register-inline-routes.ts:124` | **unmapped** | Legacy device-project CRUD | None |
| `POST /api/device-cockpit/assess` | `server/routes/device-cockpit.ts`; `register-inline-routes.ts:214` | **unmapped** | A deterministic cross-pathway device readiness rollup (510(k), De Novo, PMA, MDR/IVDR) | None |
| `GET /api/tenant-stats/:id` | `server/routes/tenant-stats.ts`; `register-tenant-routes.ts:67` | **unmapped** | Organization usage statistics | None |

Not in this table: `/api/v1/pyramids/*` **is** reached, by Plan's program plan (`PyramidProject.tsx` → `/api/v1/pyramids/by-project`), although the `pyramid` surface itself is locked. The S11 global schedule exists in Reporting & analytics (`PyramidProject.tsx` "global schedule").

**No Gantt or timeline view has ever existed in the client** within the available history (since 2026-06-30). `git log -i -G gantt -- client/src` is empty. Schedule-shaped data exists only on the server (`/api/project-sections/timeline`, the milestone routes, critical path) and as the S11 schedule line.

---

## 4. Recommendation

### 4.1 What to restore first, as a paying customer would rank it

1. **Home shows "Your projects" and "Your tasks" first after sign-in** (A1). This is S.
   - In `v2/surfaces/Surfaces.tsx`, render `HomeSetup`, `HomeProjects` and `HomeTasks` above the composer again, or as a two-column layout beside it.
   - Drop `padding-top:max(40px,22vh)` from `.landing.home-start` (`styles/surfaces-v2.css:46`).
   - Keep the sidebar's New conversation, Search and Recents. They are additive.
2. **Projects is a portfolio dashboard again** (C1 and C2). This is S.
   - Show `.pj-summary` above the toolbar in both views.
   - Put back each card's readiness bar and stage · lead line, from `git show 78842ee08^:client/src/concept2cure/v2/surfaces/Projects.tsx` (the `pj-card` block).
   - Remember Grid or List (the deleted device Overview stored `mdx.viewMode`).
   - Keep the S11 `PortfolioLine`, last activity, the description line and the objective.
3. **Project page orientation** (D1, D4–D7). This is S.
   - Put back StageBand's "What to do now" sentence and "Next step" under the step control (`git show a9819177d^:…/ProjectStages.tsx`).
   - Open Records, Activity and Section tracking by default (`<details open>`), or move Activity back onto Author.
   - Render the approvals part of `ProjectWorkPanel` on Review again.
4. **Portfolio schedule, milestones and section deadlines** (section 3: project-sections, c2c/tasks, the critical path). This is M–L. It means reaching existing engines, not building new ones:
   - claim `/api/project-sections` for `project-home` in `shared/constants/ui-surface-registry*.ts`, so production stops refusing it;
   - give Section tracking on Author its assign, deadline and milestone controls;
   - check that `/tasks/assess` asks no model for a figure before exposing it (Rule 2).
5. **Portfolio risk** (C5, C6, and section 3's sentinel and submission-ops command centre). This is M. These are deterministic engines already running or mounted.
   - Claim the routes for `projects`.
   - Show **deadline risk, cross-project conflicts, due-soon, hotspots and approval bottlenecks** on Projects.
   - This also restores "Blockers open" and "Submissions in flight" from an engine (Rule 2), which the fold dropped.
6. **Small shell items** (B1 and B2: a visible search field and Help) and **Unarchive** (section 3). These are S.
7. **Mission Control, CRO portfolio and Project journey.** These are outside the launch catalog, so admitting them or converging their function onto Projects is a **founder decision** (CLAUDE.md Rule 2), not a session's.

### 4.2 Revert whole commits, or re-add components?

**Re-add components. Reverting whole commits is not viable.** Every candidate commit was tested with `git merge-tree --write-tree --merge-base=<C> HEAD <C>^` in the scratchpad clone, and all of them conflict with HEAD except one:

- `970bc3637` (12 files, including two **migration files amended in place under Rule 1**, so reverting would also re-run the catalog changes).
- `4a5cc0d22`, `7a9b896b9`, `f7b11e77a`, `c6514fc80`, `14dce5e38` (Shell.tsx and CSS).
- `eab679936`, `465bc23a8` (16 files), `a9819177d`, `6cd6d7c92`, `8225e3075`, `900e6eb44`, `e84c4f1ef`, `d50c5f07e` (ProjectHome.tsx and its parts).
- `78842ee08`, `6661f4690` (Projects.tsx).
- `91d52716b` (`launch-scope.ts`).
- The pre-baseline folds `d97388005`, `8b192f1e7`, `b9975a914`, `37f2ed240`, `2168fd569`, `041880cbd` and `776d9da46` conflict in 21–68 files each.

Commits that are safe to revert whole:
- **`c927d2e66`** reverts cleanly, but restores only a prop destructure, not the label.
- **`64ac5674a`**: its source reverts cleanly (only its own test file conflicts), but what it removed was a non-functional placeholder. **Do not revert.**
- In practice, **no commit in this area is worth reverting whole.**

How to re-add: take the deleted JSX blocks with `git show <commit>^:<path>`. Under Rule 3 the change is named "reach" or "complete" of the existing component, never "build":
- the `pj-summary` and `pj-card` blocks from `78842ee08^`;
- `StageBand` from `a9819177d^`;
- `HomeProjects` and `HomeTasks` ordering from `4a5cc0d22^`;
- Review's `ProjectWorkPanel` from `d50c5f07e^`;
- the device KPI layout from `mdx/surfaces/Overview.tsx@970bc3637^`, fed by an engine rather than browser derivation.

### 4.3 Commits that mix removals with changes that must be kept

| Commit | Keep | Removal to undo selectively |
|---|---|---|
| `970bc3637` | Device analytics now scoped to the projects the reader can open (the old `/api/mdx/analytics` counted every program with no access scoping: a security fix); last activity on cards; the Client Review Room per project; Rule-1 in-place migration amendments | Device portfolio KPIs, blockers and in-flight figures, "Readiness report", per-project Ask AnA |
| `4a5cc0d22`, `7a9b896b9`, `f7b11e77a`, `c6514fc80` | Sidebar Recents and Search; ⌘K finds projects and conversations; New task and Message a colleague in ⌘K; "What AnA remembers" in the account menu; phone-width drawer; the top bar naming a project opened by link (`7a1ee8fec`) | Home section order and the 22vh pad; the visible search field and Help |
| `465bc23a8` | **Governed archive** with a reason and the typed word; QMS controlled documents under "Quality documents"; plain-language market blockers; `projectWords.ts`; work-area doors (`ProjectCoreWork.tsx`) | (ComingLater must stay deleted) |
| `a9819177d` | Project settings drawer (focus trap, Escape); client type derived for a page opened by its address; fix for the title squeezed at 390 px; the **objective** under the header | StageBand guidance |
| `6cd6d7c92`, `900e6eb44`, `e84c4f1ef`, `8225e3075` | Team card on every step with each person's open work; work and inbox each read once; Filing card rows for Agency letters and **Commitments**; Project knowledge column | Records and Activity collapsed |
| `d50c5f07e` | Commitments listed on Respond with "Record fulfilment" (`CommitmentFulfilDialog`); Tasks handoff → Plan; StrictMode fix; Protocol on Evidence | Readiness ring; Review's approvals; closed disclosures |
| `78842ee08` | `aria-pressed` and `type="button"` accessibility; `enumWords`; `WS_LABEL` (used by the About card) | Card readiness, stage and lead; the summary strip in grid view; Ask AnA |

Must be kept untouched, all functional additions in this area:
- **S1 objective**: `aca429f6d`, `a3b7cb10c`, `19d3cf4a8`.
- **S11 program plan**: `a7d2c9b27`, `e160e7e74`, `53105ae3b`, `ce245917e`, `4fb1fec1f`.
- **S12 / P-111 work projects**: `804956d0d`, `122cc5786`, `3fc3fcc1f`, `d72eecc76`, `4dde2c338`, `08fedd83d`, `5805edd2f`, `a415d51f1`, `5a28e2768`, `67d770a71`, `0bdf6148a`, `91939f245`.
- **R1** data room door: `cb72dc452`.
- **QMS in projects**: `bd144ed16`.
- **Rail reachability fixes**: `5144702d2`, `b3c323ed8`, `59dc4f9f5`, `dd542da93`, `c5170db97`.
- **Tasks fixes**: `958c213e0`.

Any selective restore must be applied on top of these, never by reverting the D2 or D3 design commits they now depend on.
