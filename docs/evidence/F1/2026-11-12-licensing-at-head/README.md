# The licensing lane at HEAD, re-verified and walked in the running app, 2026-11-12

**Package:** F1 (repairs). **Head walked:** `concept2cure-v2` at `a9b5af187`, then `922e6519c`.
**Session:** `…session_01E8jsM2jDdKs9JfiUg5GRNT`, the human-testing handoff row in `docs/work-orders/README.md` §0.

The lane is licensing and entitlements:

- the rail's locks and the locked-app dialog;
- a member asking for an app, and the administrators' and the owner's queue;
- the platform owner's console (packaging, workspaces, trials, enforcement, Decisions);
- the launch catalog every new organisation receives.

It was built in September and October. This is its re-verification before human testing, in the production posture: a database built from empty, the `app_service` role, `RLS_ENFORCE=on` and `LAUNCH_SCOPE_ENFORCE=on`.

## What already exists

Nothing here is new. Every change completes or repairs one of these files.

| Piece | Path | What it does |
|---|---|---|
| The rail's locks, the locked-app dialog | `client/src/concept2cure/v2/navEntitlements.tsx`, `Shell.tsx` | A lock and "not included in your subscription" on each app the plan does not cover. The dialog offers a member **Ask an administrator**, and an administrator **Compare subscriptions** (`navEntitlements.tsx:281-292`) |
| The verdict behind them | `server/services/entitlements/navigation-entitlements.ts`, `launch-scope.ts`, `master-admin.ts`, `shared/constants/launch-scope.ts` | One rule for the rail, the API gate and the console |
| Access requests | `server/routes/module-access-requests.ts`, mounted twice: per user, and for the owner under the system scope (`server/routes/admin/master-access-requests.ts`) | One handler for both answers, in one transaction under a row lock (W1 H1–H3, 2026-09-22) |
| The owner's console | `client/src/concept2cure/v2/surfaces/MasterLicensing.tsx` and `surfaces/licensing/*` | Packaging, Tenants, Access requests, Enterprise requests, Trials, Feature flags, Enforcement and Decisions |
| Decisions | `server/routes/admin/licensing-history.ts` and `LicensingHistoryPanel.tsx` | Selects rows on the *presence* of `masterAdminAction`, so a new governed action appears without a change to it (its invariant 1) |
| The workspace's own queue | `client/src/concept2cure/v2/surfaces/AccessRequests.tsx` | The customer administrator's view of their people's requests |
| Signup's launch catalog | `server/routes/auth.ts`, `server/routes/tenants-simple.ts` | Provisions the launch modules inside the new organisation's tenant scope (W1 #1 and #2) |

Searches run for this re-verification:

- `masterAdminAction` and `accessRequestAction` across `server/`;
- `.ml-tabs` and `.ml-lic` across `client/src`;
- `flex-shrink` across the v2 CSS tests;
- `Compare subscriptions` across `client/src`;
- the lane's coordination rows in `docs/work-orders/README.md` and `.design/claude-convergence/COORDINATION.md`.

## What was found, and what was done

| # | Found | Kind | Done | Proof |
|---|---|---|---|---|
| 1 | `launch-scope.test.ts` still asserted that training had left the shell. P-127 (`1207a3c307`) brought it back as Help & training | stale pin, trunk red | asserts P-127: a shell surface, in no app (`922e6519c`) | `01-unit-before.txt` (502/503), then 48/48 |
| 2 | `signup-launch-catalog.dbtest.ts`: since `2dc105c1b7` admitted the eTMF in the professional band, a new free signup's rail shows `etmf:tier` | stale pin | lists `etmf:tier`, `requiredTier: 'professional'`, and no etmf grant (`922e6519c`) | `02-db-before.txt` (229/230), `03-pins-after.txt` (16/16) |
| 3 | **In the running app, the console's tab strip was 1px tall.** A scroll container's automatic minimum height is 0, so in `.ml-lic`'s column it shrank to its border. Only Packaging was reachable; Tenants, Access requests, Trials, Enforcement and Decisions could not be opened | defect, owner blocked | `flex-shrink:0` on `.ml-tabs` | `shots/03b-tabs-clip.png` → `03c-tabs-clip-after.png`; `04-tab-strip-red-green.txt` |
| 4 | At 390px the console column was 915px wide: `.page-full` is a row, so the column's minimum was the tables' 760–900px `min-width`. Text, the find box and the tables were cut off | defect | `min-width:0` on `.ml-lic`; each table already scrolls in its own `.ml-scroll` | `shots/32-console-390-light.png` → `33-console-390-after-light.png`; column 915 → 390px, tab strip 883 → 358px, desktop column unchanged (1104px) |
| 5 | **An owner's approval that turned a module on never appeared in Decisions.** The answer was audited under `accessRequestAction` with no `masterAdminAction`, and Decisions selects on the latter | defect, Part 11 record incomplete | `ownerDecisionToken` adds `access_request.approved` / `access_request.declined` when the platform owner answers; the panel names both | `05-decisions-red-green.txt` (2 red, then 54/54); `shots/31-owner-decisions-shows-approval.png` |

The two pins (#1, #2) belonged to lanes that landed earlier the same day. The training pin had been handed to S13 in `COORDINATION.md` at 12:36; it was fixed after that note's eight hours, and the note says so.

## The walk, as three people

Each step was run in Chromium against the server, not in a simulated DOM. The screenshots are in `shots/`.

| Step | Who | Seen |
|---|---|---|
| Sign in, Home | owner | Every rail entry open (`01`) |
| Account menu | owner | Platform licensing, Access requests, Usage & limits and Help & training (`02`) |
| Each console tab | owner | Honest states: "No requests waiting", "Nothing has been measured on this server", "Record chain verified". No API call answered 4xx/5xx (`03`, `05`, `07`, `09`, `10`) |
| Self-serve signup | customer admin | A new organisation on Free with 12 launch grants, CMC not among them. A password containing the person's name is refused, and the form says why |
| Rail | customer admin | Communication, CMC / Module 3, Biostatistics and Risk-based monitoring locked (`13`) |
| Locked CMC | customer admin | "Included from Professional", **Compare subscriptions**, no request button (`14`) |
| Invite a member | customer admin | Setup link shown (no SMTP) |
| Locked CMC, ask | member | **Ask an administrator**, then "It is with your administrators" (`17`, `20`, `30`) |
| Queue, approve | owner | Governed action: reason plus `yes` (`21`, `22`); grant on, row `approved`, audited |
| Reload | member | CMC unlocked; it opens Projects with "CMC / Module 3 opens inside a project" (`24`) |
| Trial, Risk-based monitoring, 14 days | owner | "The Free plan does not include this module. The workspace loses access when this ends." (`26`) |
| Decline Communication | owner, member | "Declined on <date>. Reason given: …"; still locked, can ask again (`34`) |
| Decisions | owner | The trial and the owner's approval, each with reason and chain verdict (`31`, after repair #5) |
| The workspace's queue | customer admin | "Everything asked for so far has been answered." (`28`) |

## Still owed, reported rather than fixed here

- **The packaging table at phone width** scrolls sideways inside its own box: five tier options per row do not fit in 358px. That is the console's existing design (`.ml-scroll`), not a defect, but a design package may want a narrow layout.
- **The "dark" captures render light.** The app follows its own theme setting rather than the operating system's colour scheme. That is outside this lane.
- **An organisation administrator's answer** is not in the platform owner's Decisions, by design. It is in that workspace's Access requests history, and in the audit trail under `accessRequestAction`.
- **S13's other two reds** (`hostilePayloadProbe` "training", `homeStartHere`) stay with S13, as `COORDINATION.md` records.

## Files

| File | What it shows |
|---|---|
| `00-provision.txt` | The database from empty: 474/474 migration files, the RLS sweeps |
| `01-unit-before.txt` | 30 unit files at `a9b5af187`: the one red |
| `02-db-before.txt` | 8 real-database files at `a9b5af187`: the one red |
| `03-pins-after.txt` | The signup pin after `922e6519c` |
| `04-tab-strip-red-green.txt` | Repair #3, measured, then pinned red and green |
| `05-decisions-red-green.txt` | Repair #5: two owner cases red, then 54/54 |
| `shots/` | The walk, 1440×900 unless named 390 |

## The same night: an adversarial review, and a second walk by agents

Two workflows checked the work above before testers rely on it.

1. **A review of the four commits** (`922e6519c`, `a683684eb7`, `6fd195ef88`, `fd545f72cf`): four lenses (CSS layout, the audit token, Part 11 and security, docs and tests), then one skeptic per finding told to refute it.
2. **A walk of the paths not yet exercised, in the running app.** Four walkers ran in parallel. Each had its own owner account (`owner2`–`owner5`, named in `MASTER_ADMIN_EMAILS` and `PLATFORM_ADMIN_EMAILS`) and its own new customer, and restored anything deployment-wide it changed. Then Enforcement was walked alone, because Refusing affects every request. One skeptic re-ran each of the six most severe findings on its own fresh sign-up.

The database had been built at `a9b5af187` and was re-deployed at HEAD first (474/474, a clean replay). As in the first walk, the server ran with `ALLOW_DEV_AUTH=1`, so sign-up skipped the e-mailed confirmation and sign-in skipped the code.

### Fixed in this lane, red first

| Commit | Found | Proof |
|---|---|---|
| `d5907d7768` | Decisions showed an owner's access-request answer as raw tokens and ids, among them "Decided by master admin: No" on the owner's own workspace. A regression from `6fd195ef88`, confirmed by the review's skeptic | Reader fixed in `licensing-history.ts`, the requester named by e-mail through a guarded join. Unit 25/26 then 26/26; real DB 54/55 then 55/55. Live: `shots/40-decisions-access-request-readable.png` |
| `2be04b835e` | (a) The owner's workspace verdict ignored the release boundary: "Included in their plan" with Turn off for 7 modules the customer could not open, and Grant that changed nothing for about 35. (b) At 390px the page scrolled sideways to 509–823px, from absolutely positioned `.ml-vh` labels. (c) The Category filter split 'Submissions' and 'submissions'. (d) The Apply plan outcome vanished in about 200ms. (e) The plan-tier note said the opposite of what happens | Real DB 41/42 then 42/42; client 3 red then 21/21. Live: `shots/41-tenant-verdict-launch-scope.png`, `35-console-390-tenant-after.png` (page 390px) |
| `cd31e62018` | Subscription & features called CMC, Biostatistics, Risk-based monitoring and Communication "not in this release". The catalog flag read `LAUNCH_MODULE_IDS`; the rail reads `isLaunchSurface` | Real DB 57/58 then 58/58. Live: no "not in this release" on the page (`shots/42-features-in-release-apps.png`) |
| `46d8ef9d94` | The owner's Access requests table got the base three-column grid, because of a specificity tie. Enterprise requests lost their line breaks | CSS pins red then green. Live: every row's columns at the same x; the message on 7 lines (`shots/36-…`, `37-…`) |
| `e316f69777` | **Switching to Refusing refused the licensed product to every customer.** The project page, conversations, the admin console, the membership inbox and the bell were refused, because shell surfaces with no catalog row read as "not licensed", and `NEVER_GATED` was skipped under a broader claim | Gate 2 red then 21/21; real DB 136/136; `ci:launch-scope` and `ci:launch-scope-api` green. Live with Refusing on: `/api/chat/threads`, `/api/tenant-users/invitations/mine`, `/api/mdx/notifications/unread-count` and `/api/c2c/projects` answered 200; `/api/cmc/module3-board` answered 403 `MODULE_NOT_LICENSED` |
| `ec4331a26b` | The enforcement report called requests served while observing "Refused". Its rows kept record ids. "Since this server last restarted" after a manual clear | 2 red then 73/73 |

ESLint warning counts are unchanged per file. Typecheck: 0 errors.

### Handed on, not fixed here

These are in files another session holds, or that another lane edited within 24 hours. Each is named in `.design/claude-convergence/COORDINATION.md` with its file and line:

- **Client administration (`01T2woo…`).** That session holds `module-access-requests.ts`, `surfaces/licensing/**`, `module-subscriptions.ts`, `TenantContext.tsx`, `LicensingSurface.tsx` and `UsageBilling.tsx`.
  - **S1c**, confirmed by three independent runs. An organisation administrator's approval grants above the plan, and it reverses the owner's turn-off.
  - **A Free workspace's administrator can turn a launch app off and never back on.**
  - **The owner's account switches to the newest customer's organisation after a reload.** The switcher cannot undo it (`shots/38-owner-org-switcher.png`); signing out and in can.
  - Free organisations get Standard seat limits.
  - "Status: Incomplete" on a Free workspace.
  - `requester_name` is never stored.
  - Usage caps nothing enforces.
  - Decisions' "Not set" for Unrestricted.
  - The onboarding review's spacing.
  - A disclosure: `6fd195ef88` edited two files inside that hold without asking.
- **The F1 readable-text sweep (`011DpxUy…`):** the lock dialog's footer at 390px (`app-v2.css`, edited by that lane today).
- **RBM:** `rbm-launch-claim.test.ts` is red at HEAD, independently of this lane.
- **Shell:** "Subscription & billing" opens a page titled "Compare subscriptions".

Journey 10 now warns testers about the account switch and the one-way turn-off, does not have them approve a request above the plan, and adds `ALLOW_DEV_AUTH=1` to the set-up.

### Still owed in this lane

- **The Enforcement console cannot return the mode to "inherited from the deployment".** Once a mode is chosen, a `platform_settings` row stays, and the deployment's `MODULE_ENFORCEMENT` is ignored without notice. The walk left that row behind; it was deleted by hand in the test database. A way back needs a route and a control in `EnforcementModeControl.tsx`, which is held.
- From the walk, not fixed:
  - At 1024px the tab strip and the workspace list scroll with no visible cue.
  - The governed dialog does not return focus on close, and its inputs have no label (`_shared/components/GovernedConfirmDialog.tsx`, shared app-wide).
  - The admin console calls a module refusal "not an admin" (`AdminAccess.tsx`, held).
  - The project page calls a licensing refusal "the conversation store didn't respond" (`ProjectHome.tsx`).
