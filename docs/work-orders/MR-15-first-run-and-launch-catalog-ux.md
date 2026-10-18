# MR-15 — First-run experience and a navigation that matches the launch catalog

| | |
|---|---|
| Phase | Phase 0 (Stage 1) · Phase 1 (Stages 2–3) · Phase 2 (Stage 6 if the pilot tenant is a consultancy or CRO; otherwise Phase 3) · Phase 3 (Stages 4, 5, 7, 8, 9) · Backlog (Stage 10) |
| Highest open severity at head | P1 (UX-01) |
| Human testing | Blocks: self-serve sign-up → verify e-mail → sign in, on any deployment with dev-auth off. The mailed link redirects to sign-in and drops the token (UX-01). Degrades: Authoring, Submission Readiness and CMC / Module 3 have no rail entry and the rail opens icon-only (UX-02); "Browse all capabilities", the account menu and ⌘K open out-of-release apps, and with enforcement off on local and staging they open for real (UX-03, UX-18); a medtech or CRO tenant's Home says "Biotech & Pharma" (UX-07); no-project empty states give no next step (UX-08); 403, 404 and 500 look alike with a useless "Try again" (UX-09); lists go stale until remounted (UX-10); an unknown link shows a developer scaffold (UX-15); a member who is not the lead gets 403 pinning evidence or anchoring a submission, and "Team assignment isn't available yet" (CAT1-06); no project edit, archive or close (CAT1-10); TaskBoard and Communication Center use other project id spaces (CAT1-11); a review request cannot link to a document (CAT1-19); low-contrast text (UX-11); microcopy lapses (UX-23). |
| Owner | engineering (the founder answers six scope questions; Stages 2 and 6 cannot finish without them) |
| Effort | S + M + M + L + L + L + M + M + M + L. About 16–20 engineer-weeks in total. Stages 1–3, which unblock testing and shape the pilot's first day, take about 2–3 weeks. |
| Depends on | MR-02 (required checks, so the gates added here hold; Stage 9 runs in CI), MR-14 (scope contraction removes the out-of-scope kits that Stages 2 and 10 currently filter or move), MR-16 (support contact and the SMTP provider for Stages 3 and 7; UX-05 pricing), MR-06 (CAT1-07 project-designated approvers build on Stage 6), MR-08 (Vault reads gated in Stage 6), F-3, F-4, F-10, F-18 |
| Findings | 25 total — open 17 · partially fixed 7 · fixed 1 (HT-01, `969d1e727`, added from the 2026-10-18 smoke) · refuted 0 · unverifiable 0 |
| Basis | cold audit at `92ccdba1`; every status re-verified at `94b4f9238` on 2026-10-13 — [evidence](../evidence/reviews/2026-10-13-market-readiness/) · [findings register](MR-findings-2026-10-13.json). The branch moves about 1,500 commits a day: re-confirm each finding at the current head before starting its stage. |

> **Re-checked 2026-10-18 at `8ca7e74ca`** (every finding that stopped a tester's journey at `94b4f9238`). Start from this, not from the 13 October text below, for:
> - **UX-01**: fixed (e1f3fd425); for testers it now does not get in the way. Evidence at head: [findings register](MR-findings-2026-10-13.json), `UX-01.recheck`.

## Goal

A new user at a pilot sponsor accepts an invitation (or, once self-serve is on, signs up and confirms an e-mail), signs in and lands on a Home written for their kind of company. The rail lists exactly the launch catalog — Projects, Vault, Authoring, Submission Center, Submission Readiness, QMS controlled documents, Reporting & analytics and, where entitled, CMC / Module 3 — with text labels on first run. No shortcut anywhere opens an app that is not in this release, even when the entitlement fetch fails. Every empty state says what to do next, every error says whether it is a permission, a missing record or a server fault, and every link a colleague sends opens the project and document it names. Projects have members and roles, can be edited and closed, and have one identity across the product. The shell meets WCAG 2.2 AA on a published browser matrix, which a buyer's accessibility and validation reviewers can check.

## Why it matters

- **Self-serve sign-up dead-ends today.** On any deployment with dev-auth off, the verification link redirects to sign-in and drops the token; the account stays `pending_verification` for good and the login page's "verify" button loops. `POST /api/auth/signup` is mounted in production with no flag, so a pilot user's colleague who clicks "Create account" creates an org and an admin that can never activate.
- **The rail contradicts the sales story.** The product is sold as eight launch apps; the rail shows five. Authoring, the app that produces the pilot's Module 2/3 deliverable, has no rail entry. A tester told to "open Authoring" cannot find it.
- **Out-of-release doors produce false bug reports and a bad demo.** Between 11 and 45 capability cards per client type end on "This app is built but is not part of the current release". With launch-scope enforcement off — the default whenever `NODE_ENV` is not `production` — the same doors open the out-of-scope apps for real, and testers file bugs against code that is not in the launch.
- **A CRO or consultancy cannot use projects as sold.** Every org member reads every project and its Vault, and only the lead or an org manager can pin evidence or anchor a submission. F-18 recommends need-to-know as the default; the recommended consultancy channel pilot needs it before go-live.
- **An enterprise accessibility review fails on day one.** `<html lang>` follows the browser locale over English content (WCAG 3.1.1), the page title never changes (2.4.2), muted text runs at 1.9–2.1:1 contrast (1.4.3), and there is no supported-browser statement for the validation pack. About 2,600 nested CSS rules ship unlowered, so the editor, Vault and eCTD layouts collapse on Edge 109, which pharma VDI images still pin.
- **Each defect is cheap now and expensive after the pilot.** Stages 1–3 are S/M changes; the same defects in front of a paying customer cost trust that a $15k–$25k pilot cannot buy back.

## State at head

| Finding | Status at head | Severity (pilot) | Tester impact | Evidence at head |
|---|---|---|---|---|
| UX-01 | STILL_OPEN | P1 | Blocks | `client/src/concept2cure/router/ZenRouter.tsx:175-176` public regex omits `verify-email`; the `uiV2Owns` branch at `:181-188` returns `<ProtectedZenApp/>` before the `<Route>` at `:220`; `server/services/email-verification.ts:26,64` mails `/concept2cure/verify-email#token=` |
| UX-02 | PARTIALLY_FIXED | P2 | Degrades | `client/src/concept2cure/v2/registryModel.ts:141-150` `RAIL_CORE` has no `document-authoring`, `dispatch-readiness` or `cmc`; `V2App.tsx:175` `DEFAULT_PREFS.railCollapsed: true`; `CLIENT_CATEGORIES` (`registryModel.ts:346-355`) offered to every tenant |
| UX-03 | PARTIALLY_FIXED | P2 | Degrades | `surfaces/CapabilityBrowser.tsx:48-61` filters on search text only; `Shell.tsx:375` "Codebase coverage" → `coverage`; `Shell.tsx:717-718` ⌘K Jump-to is `UI_SURFACES.slice(0,8)` incl. `regulatory-workspace`; `registryModel.ts:884` "Submission readiness" opens `submission-center`; `SubmissionCenter.tsx:1111` 510(k) line unconditional |
| UX-18 | STILL_OPEN | P2 | Degrades | `client/src/concept2cure/v2/navEntitlements.tsx:15-20` "NO VERDICT => NO LOCK"; no client-side `LAUNCH_SURFACE_IDS` fallback (only an optional `launchScope` flag at `:70`) |
| UX-07 | PARTIALLY_FIXED | P3 | Degrades | `V2App.tsx:914` reads `tenantClientType` for the welcome (`:1098`) but Home gets `segment={prefs.segment}` (`:1107`), default `'biopharma'` (`:178`) |
| UX-08 | PARTIALLY_FIXED | P2 | Degrades | `Vault.tsx:1522` has "Go to Projects"; `EctdCompile.tsx:1176` empty state has title and hint only; copy mixes "Open a program" and "Open a project" |
| UX-15 | STILL_OPEN | P2 | Degrades | `V2App.tsx:1133` falls back to `KitSurfaceScaffold`; `Surfaces.tsx:544` renders "Help me install the … surface" |
| UX-19 | STILL_OPEN | P2 | Not observable | `Shell.tsx:74,376,599-605` "Get help" routes to AnA (`HELP_SURFACE`); no docs, support contact or status link |
| UX-23 | STILL_OPEN | P3 | Degrades | `DispatchReadiness.tsx:285` "I cannot clear it"; `v2/fixtures/admin-data.ts:146` "142 pure-function regulatory tools"; `Surfaces.tsx:186-187` "Good morning, there"; `shared/navigation/demo-scripts.ts:219` "Sales demonstration" |
| UX-09 | PARTIALLY_FIXED | P2 | Degrades | `dataConnect.tsx` carries `status` in `DataResult` (`:113,:157`) and `ListState.status` (`:399`); the ~13 `hint={x.error}` sites still render one generic title |
| UX-10 | STILL_OPEN | P2 | Degrades | `useLiveData`/`useLiveRows` in `dataConnect.tsx` remain custom fetch hooks with no cache, dedupe or refetch |
| CAT1-10 | STILL_OPEN | P2 | Degrades | No `PATCH` in `server/routes/c2c/projects.ts`; archive/unarchive/delete routes have no client caller; `Projects.tsx`/`ProjectHome.tsx` mention them only in comments |
| CAT1-11 | STILL_OPEN | P2 | Degrades | `TaskBoard.tsx` and other v2 surfaces still call `/api/projects` or `/api/concept2cure/projects` (integer ids; see the `taskBoardEveryStore` test) |
| CAT1-06 | STILL_OPEN | P2 | Degrades | `server/services/c2c/program-access.ts:22-28` "READ ROUTES ARE NOT GATED"; `:58-65` lead-or-manager mutation; `server/routes/c2c/projects.ts:603-640` org-only list; `Projects.tsx:707-712` "Team assignment isn't available yet"; no `regulatory_program_members` table |
| CAT1-19 | PARTIALLY_FIXED | P2 | Degrades | `client/src/concept2cure/v2/routing.ts` carries a conversation id (`conversationIdFromLocation`) but no project or document id; `server/services/notifications/notification-service.ts` has no e-mail send path |
| UX-04 | STILL_OPEN | P2 | Not observable (English testers) | `client/src/i18n/index.ts:35-40,61,67-68` writes the detected language to `document.documentElement.lang`; 0 of 226 v2 TSX files use `useTranslation` |
| UX-06 | STILL_OPEN | P2 | Not observable (evergreen browsers) | `vite.config.ts:76` `build.target: 'es2022'`, no `cssTarget`; 2,607 nested rules in 10 sheets; 5 `@keyframes` nested in `.c2c-v2{}` |
| UX-11 | STILL_OPEN | P2 | Degrades | `--text-500` is `#b0aea5` (`design-system/colors_and_type.css:81`), used 48 times in `v2/styles/app-v2.css` |
| UX-12 | PARTIALLY_FIXED | P2 | Not observable | Skip link (`V2App.tsx:1214`, `app-v2.css:97`) and account-menu keyboard handling (`Shell.tsx:240,:398`) added; no `document.title` update anywhere in client src |
| UX-20 | STILL_OPEN | P2 | Not observable | `.github/workflows/tier5-browser-smoke.yml:108,116` run only the authenticated smoke and `golden-customer-journey` specs |
| UX-13 | STILL_OPEN | P3 | Not observable | `client/src/component-registry.ts` absent; 0 `*.stories.tsx`; ~1,581 raw `<button>` in `client/src` |
| UX-24 | STILL_OPEN | P3 | Not observable | `V2App.tsx:174` `prefs.dark=false`, applied at `:1153-1198`; nothing outside `liveDriveDefaults.test.tsx:200` sets it; no `prefers-color-scheme` rule |
| UX-25 | STILL_OPEN | P3 | Not observable | `mdx/store/dossierStore.ts:196-204` seeds attributed to "Jordan Chen" and "Dr. Lee Hartman"; `v2/fixtures/project-home-data.tsx` exists; gated by `import.meta.env.PROD` so not rendered |
| CAT1-24 | STILL_OPEN | P3 | Not observable | `v2/fixtures/` holds configuration; `review-data.ts:128` lists `VERIFIER`; `misc-inline-routes.ts:90-126` `/vault/statistics` and `/vault/list`; `AnaToolExecutor.ts` 21,833 lines, `authoring.router.ts` 8,603 |

## Already done at head — do not redo

One finding is fully closed. These parts of partially fixed findings are also done and must not be rebuilt:

- **A seeded organisation can create a program (HT-01).** Found by the fresh-environment smoke at `aa4ee1e29`, fixed by `969d1e727` on 2026-10-18. `scripts/seed-admin.mjs`, `scripts/seed-founder.mjs` and the GA demo seeder run the deploy repair sweep through `scripts/seed/organization-workspace.mjs`, and no seed script inserts a workspace of its own (`tests/seed/seeded-organisation-gets-its-workspace.test.ts`). Evidence: `docs/evidence/W1/2026-10-18-seeded-workspace/`. A new seed script that writes an organisation calls that helper; it does not INSERT a workspace.
- **One rail list, no empty sections, no duplicate entry (UX-02).** `9a94754c6`: `registryModel.ts:141-150` `RAIL_CORE` and `Shell.tsx:230` render a single list; Quality is on the rail; "Projects" is the label; the logo opens Home (`Shell.tsx:204-216`). `beea5f91e` added Reporting & analytics to the launch scope.
- **Top-bar client-domain switcher removed (UX-02, UX-03, UX-12).** `25d79c99c`; client type is now only in the account menu (`Shell.tsx:370`). This also retires the lane report's "client-domain menu" keyboard item under UX-12.
- **Home quick actions and segment defaults scoped (UX-03).** `9ff77226c`: `Surfaces.tsx:448` filters with `!isLaunchScopeLocked(verdictFor(a.surface))`. `9a94754c6`: every `SEGMENTS[].defaultSurface` is in `LAUNCH_SURFACE_IDS`. `77d95ef2a`: `SubmissionCenter.tsx:1382-1385` gates the 510(k) hint on `available('device-510k')`; `LaunchScopeGate.tsx:46-50` offers "Back to Projects".
- **Vault no-project CTA (UX-08).** `Vault.tsx:1522` "Go to Projects". Copy the pattern; do not rewrite it.
- **HTTP status reaches the data layer (UX-09).** `dataConnect.tsx:113,157,399`. Stage 4 consumes it.
- **Skip link and account-menu keyboard pattern (UX-12).** `V2App.tsx:1214`, `app-v2.css:97`, `Shell.tsx:240,:398`.
- **Conversation id in the URL (CAT1-19).** `routing.ts` `conversationIdFromLocation`. Stage 7 extends the same parser.
- **Invitation activation works.** `server/services/password-setup-token.ts:50` builds `/concept2cure/password-reset?token=`, which the public regex already admits. It is the tester workaround for UX-01 and must stay working.

## Work, in order

### Stage 1 — Make the mailed verification link public, and switch self-serve sign-up off for the pilot (Phase 0 · S · engineering) — closes UX-01

1. Re-confirm UX-01 at the current head (statuses here are from 94b4f9238).
2. Write the failing test first: `client/src/concept2cure/router/__tests__/publicAuthRoutes.test.tsx` (jsdom). Copy the mocks from `client/src/concept2cure/v2/__tests__/deepLinkKeepsProgram.test.tsx:17-28` (`useAuth` unauthenticated; `../../auth` with `VerifyEmail` rendering a test id; `Concept2CureLogin`, `IdleSessionGuard`, `V2App`). Call `window.history.replaceState(null,'','/concept2cure/verify-email#token=<60+ char token>')`, render `<ZenRouter/>`, wait, and assert `window.location.pathname` stays `/concept2cure/verify-email` and the `VerifyEmail` test id renders. Run it at head: it must fail with the path `/concept2cure/login?returnTo=%2Fconcept2cure%2Fverify-email`. Keep the red output for the commit message.
3. Create `shared/constants/public-auth-paths.ts` exporting `PUBLIC_AUTH_SEGMENTS = ['login','signup','password-reset','verify-email'] as const`, `VERIFY_EMAIL_PATH = '/concept2cure/verify-email'`, `PASSWORD_SETUP_PATH = '/concept2cure/password-reset'`, and `isPublicAuthPath(location)` built from the segments as `^/(concept2cure/)?(seg|…)(/|\?|$)`.
4. `client/src/concept2cure/router/ZenRouter.tsx:175-176`: replace the inline regex with `isPublicAuthPath(location)` from `@shared/constants/public-auth-paths`. Leave the `<Route path="/concept2cure/verify-email">` at `:220` as it is; it becomes reachable.
5. One list for router and mailer: `server/services/email-verification.ts:26` re-exports `VERIFY_EMAIL_PATH` from the shared module instead of declaring it; `server/services/password-setup-token.ts:50` builds its URL from `PASSWORD_SETUP_PATH`.
6. Parity case in the same test file: `isPublicAuthPath(VERIFY_EMAIL_PATH)`, `isPublicAuthPath(PASSWORD_SETUP_PATH)` and `isPublicAuthPath('/concept2cure/login')` (the SSO hand-off base in `server/routes/sso.ts:111`) are true. Show it failing with `'verify-email'` removed from the list.
7. Re-run the step-2 test (green), `client/src/concept2cure/auth/__tests__/VerifyEmail.test.tsx` and `deepLinkKeepsProgram.test.tsx` (both still green).
8. F-3 (sign-up off for the pilot): add one server-read setting, e.g. `SELF_SERVE_SIGNUP_ENABLED`, default off in production. When off, `POST /api/auth/signup` (`server/routes/auth.ts:887`) returns 404 or 403 with a stable code, and `Concept2CureLogin`/`ZenSignup` hide the "Create account" link by reading the same setting from the server (not a client constant). Test: with the setting off, signup returns the refusal (red at head: 201). The verification route fix in steps 3–7 still ships, because existing `pending_verification` accounts and the GA re-enable need it.
9. End-to-end proof: `tests/e2e/signup-verify.e2e.spec.ts`, in a CI job with `ALLOW_DEV_AUTH` unset, `NODE_ENV` production-like, sign-up enabled for the job, and a Mailpit service container (`SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` pointed at it). Sign up through `/concept2cure/signup`, read the mail through the Mailpit HTTP API, open the link, see the confirmed state, sign in and land on `/concept2cure`. Negative case: a tampered token shows the not-confirmed message and offers a new link.
10. Tester configuration, same day: set `LAUNCH_SCOPE_ENFORCE=on` on every human-testing deployment (`server/services/entitlements/launch-scope.ts:8,44-45` default it off outside production), so testers see the launch catalog until Stage 2 lands. Record it in the test plan.

**Acceptance**
- The router test fails at head (redirect to `/concept2cure/login`) and passes after.
- The parity test fails when `'verify-email'` is removed from `PUBLIC_AUTH_SEGMENTS`.
- Grep shows one definition of `VERIFY_EMAIL_PATH`, imported by both `ZenRouter.tsx` and `email-verification.ts`.
- With dev-auth off and a mail sink, the Playwright spec signs up, opens the captured link, sees "confirmed", signs in and lands on the shell; a tampered token shows the invalid-or-expired message.
- With the sign-up setting off, `POST /api/auth/signup` is refused and no "Create account" link renders; the invitation path `/concept2cure/password-reset?token=` still activates an account.

### Stage 2 — One launch-scope predicate behind every navigation door (Phase 1 · M · mixed) — closes UX-02, UX-03, UX-18

The boundary is the one in `shared/constants/launch-scope.ts` (`LAUNCH_APPS`, `LAUNCH_SURFACE_IDS`). It includes Reporting & analytics and CMC / Module 3 (small-molecule US IND only, `services/cmc/composition-scope.ts`). This stage adds entries for in-scope apps and hides only what that file excludes.

1. Re-confirm UX-02, UX-03 and UX-18 at the current head (statuses here are from 94b4f9238).
2. Record the founder's IA answer (NEW decision below) in `docs/design/ONE_ANA_ONE_CANVAS.md` §5, which today routes Authoring through documents by design, and in the `RAIL_CORE` header comment at `client/src/concept2cure/v2/registryModel.ts:100-140`.
3. Write both failing gates first, and run them at head:
   - In `client/src/concept2cure/v2/__tests__/shellNav.test.tsx`, add "every launch app has a rail entry": for each app in `LAUNCH_APPS`, `RAIL_CORE.some(r => app.surfaces.includes(r.target ?? r.id))`. Must fail on `authoring`, `submission-readiness` and `cmc`.
   - Add `client/src/concept2cure/v2/__tests__/navSourcesInScope.test.tsx`. Mock `../navEntitlements` so `verdictFor(id)` returns `{ id, source: 'launch-scope', entitled: false }` for every id not in `LAUNCH_SURFACE_IDS`, and `null` otherwise. Collect target ids from (a) `RAIL_CORE`, (b) every `SEGMENTS[].defaultSurface`, (c) Home quick actions per segment, (d) `CapabilityBrowser` cards per segment, (e) `AccountMenu` items for an org admin and a platform admin, (f) ⌘K results for an empty query and for `'a'`. Assert none is outside `LAUNCH_SURFACE_IDS`. Must fail on (d) (45 of 57 for biopharma), (e) `coverage` and (f) `regulatory-workspace`.
   - Add a third case for UX-18: with `verdictFor` returning `null` for every id (fetch failed), the same enumeration still yields no out-of-scope id. Must fail at head.
4. Fail closed on launch scope (UX-18). In `client/src/concept2cure/v2/navEntitlements.tsx:15-20`, when a verdict is missing, apply the static launch-scope fact: an id not in `LAUNCH_SURFACE_IDS` is treated as launch-scope locked. Licence and tier locks may stay fail-open, because the server still refuses those APIs. Apply the same fallback in `surfaceAvailable.ts:5-8`.
5. One predicate for shortcuts. In `client/src/concept2cure/v2/surfaceAvailable.ts`, add `useSurfaceOfferable()` beside `useSurfaceAvailable()`; it also returns false when `isLocked(verdict)` for tier, disabled or industry. Shortcuts (quick actions, capability cards) use it. The Apps catalog and ⌘K keep showing tier locks with their reason.
6. Rail (UX-02). `registryModel.ts:141-150`: insert `{ id: 'document-authoring', label: 'Authoring', icon: 'penLine' }` after vault, `{ id: 'dispatch-readiness', label: 'Submission Readiness', icon: 'checkSquare' }` after submission-center, and `{ id: 'cmc', label: 'CMC / Module 3', icon: 'beaker' }` after quality, using icons that exist in `v2/icons.tsx`. `Shell.tsx:144-145` (`railVisible`) already hides a launch-locked or flag-off entry; a tier-locked CMC renders locked with the server's reason through `navItem` (`Shell.tsx:158-196`) — keep or hide per the founder. Rename "Quality" to the catalog name if the founder agrees. Update the "exactly the places, in order" case (`shellNav.test.tsx:130`), and `config/ui-surface-registry.json` and the UI authority audit if they mirror the nav.
7. Rail opens expanded. `V2App.tsx:175`: set `DEFAULT_PREFS.railCollapsed` to `false`. Phone widths still collapse (`V2App.tsx:1165-1174`) and stored prefs keep their value. Add a test: empty `localStorage` at 1280px renders the rail expanded with labels; show it failing at head first.
8. Capability browser (UX-03). `surfaces/CapabilityBrowser.tsx:48-61`: filter items with `useSurfaceOfferable()` before the text filter and drop empty groups. Change the subtitle at `:89` ("All modules built for this client category") to copy about this release. Replace the comment at `:120-127` with an honest empty state that offers "Open Projects".
9. `surfaces/Surfaces.tsx:448`: replace `!isLaunchScopeLocked(verdictFor(a.surface))` with `offerable(a.surface)`. This also stops offering "CMC Module 3" to orgs below its tier; it does not remove CMC for entitled orgs.
10. `registryModel.ts:884`: relabel the biopharma "Submission readiness" action (target `submission-center`) to "Submission Center", or retarget it to `dispatch-readiness` only if that screen opens without a selected project. Recheck the academic, regulatory and medical_writing contexts that fall back to these actions.
11. Account menu. `Shell.tsx:375`: offer "Codebase coverage" only when `platformAdmin && available('coverage')`, mirroring "Licensing" at `:358`. This is not a deletion; platform admins and ⌘K still reach it. If the founder fixes a tenant's client type (NEW decision), limit the Client type group (`clientType` item, `CLIENT_CATEGORIES` at `registryModel.ts:346-355`) to `organizations.client_type`, or move it to Admin settings.
12. Command palette. `Shell.tsx:688-760`: exclude launch-scope-locked surfaces from Jump-to (`:717-718`) and search (`:739`); keep tier and disabled locks with their reason. Build Jump-to from `RAIL_CORE` targets plus `LAUNCH_APPS` surfaces instead of `UI_SURFACES.slice(0,8)`.
13. F-10 (FDA only): `surfaces/SubmissionCenter.tsx:1111` adds the "510(k) surface" `availableActions` line only when `available('device-510k')`.
14. Add the three gates from step 3 to `scripts/ci/check-launch-scope.mjs` (or call them from it) so `ci:launch-scope` fails when any nav source gains an out-of-scope target. Run `ci:launch-scope`, `ci:surface-discoverability`, `audit:ui-authority`, `shellNav.test.tsx` and `filingPathNoDeadEnds.test.tsx`.

**Acceptance**
- "Every launch app has a rail entry" fails at head on authoring, submission-readiness and cmc, and passes after.
- `navSourcesInScope.test.tsx` fails at head on the capability browser, `coverage` and `regulatory-workspace`, and passes with 0 out-of-scope ids across rail, segment defaults, quick actions, capability cards, account menu and ⌘K — both with verdicts present and with every verdict `null`.
- A DOM test clicks each rail entry and lands on a surface in `LAUNCH_SURFACE_IDS`; the rail has no empty section and no duplicate target.
- A first run with no stored prefs at 1280px shows the rail expanded with text labels.
- Biopharma Home shows no "Submission readiness" button that opens Submission Center; an org below the CMC tier sees no "CMC Module 3" shortcut; an entitled org still reaches CMC / Module 3 from the rail.
- `ci:launch-scope`, `ci:surface-discoverability`, `filingPathNoDeadEnds` and `shellNav` are green.

### Stage 3 — First-run path: the tenant's Home, a next step on every empty state, honest not-found, help, and microcopy (Phase 1 · M · engineering) — closes UX-07, UX-08, UX-15, UX-19, UX-23

1. Re-confirm UX-07, UX-08, UX-15, UX-19 and UX-23 at the current head (statuses here are from 94b4f9238).
2. Home follows the tenant (UX-07). Failing test first: a medtech org with no stored segment preference renders medtech Home copy (red at head: "Biotech & Pharma"). Then in `V2App.tsx:1107` pass `segment={prefs.segmentChosen ? prefs.segment : resolveSegmentId(tenantClientType ?? prefs.segment)}`; `tenantClientType` is already read at `:914`. Add `segmentChosen` to prefs if it does not exist, set only when the user picks a segment.
3. Empty states with an action (UX-08). Failing DOM tests first: for `EctdCompile`, `DossierMap` and `DispatchReadiness` in the no-project state, assert an action button that navigates to Projects (red at head for `EctdCompile.tsx:1176`). Then pass the same `onNav('projects')` action used at `Vault.tsx:1522` (or `OPEN_PROGRAM_EVENT`, handled in `V2App.tsx`) to each. Standardise UI strings on "project": replace "Open a program" and similar user-visible copy; leave code identifiers and API names alone.
4. Not-found (UX-15). Failing test first: an unknown surface id renders a not-found panel with a link to Home (red at head: `KitSurfaceScaffold` with "Help me install the … surface", `Surfaces.tsx:544`). Then replace the fallback at `V2App.tsx:1133` with that panel. Do not delete `KitSurfaceScaffold` in this stage; if it then has no caller, its removal follows the working agreement (history search, named replacement: the not-found panel and this test).
5. Help and support (UX-19). Add a help menu in `Shell.tsx` (the entries at `:74,:376,:599-605`) with: product documentation URL, the support contact from MR-16, a status page link if one exists, and the build stamp (commit and build date) so a validation record can cite the exact build. "Ask AnA" stays as one entry, not the only one. Read the URLs and contact from server configuration; render an honest "Not configured" state rather than a placeholder address. Test: the menu renders the build stamp and the configured contact.
6. Microcopy (UX-23), one commit, following the `microcopy-tone` rules:
   - `DispatchReadiness.tsx:285`: third person ("Readiness cannot clear while these are open").
   - `Surfaces.tsx:186-187`: drop ", there" when the user has no name.
   - `v2/fixtures/admin-data.ts:146`: remove the hard-coded "142 pure-function regulatory tools" (a number not computed by an engine; Rule 2). Also fix the "ss11.10(e)" and "--" separators the lane report found at `:142-150`.
   - `shared/navigation/demo-scripts.ts:219`: hide the "Sales demonstration" script from customer roles; update `anaActionChips.test.tsx:196`.
   - Sweep user-visible "organisation" to "organization", and on-screen jargon ("surface", "tenant", "MDX", "spine") in launch surfaces.

**Acceptance**
- The medtech Home test fails at head and passes after; a user who chose a segment keeps it.
- Each named no-project empty state renders a working "Go to Projects" action (tests red at head for `EctdCompile`).
- An unknown deep link renders the not-found panel with a Home link (red at head).
- The help menu shows documentation, support contact and the build stamp, sourced from configuration.
- Grep finds none of the four UX-23 strings in launch surfaces.

### Stage 4 — Status-aware errors on a cached data layer (Phase 3 · L · engineering) — closes UX-09, UX-10

1. Re-confirm UX-09 and UX-10 at the current head (statuses here are from 94b4f9238).
2. Failing tests first: render a `useLiveRows` consumer (start with `Projects.tsx` and `Vault.tsx`) against 401, 403, 404 and 500 responses; assert four distinct titles and no "Try again" on 401/403. Red at head except where `Vault`'s `vaultReadFailure(status)` already does it.
3. Add one shared `statusCopy(status)` helper next to `dataConnect.tsx`, generalised from `vaultReadFailure`: 401 → sign in again; 403 → "You do not have access" with no retry; 404 → "Not found" with a way back; 5xx and network → "Something went wrong on our side" with retry. Route every `hint={x.error}` site (about 13) through it, and fix `Projects.tsx`'s `hint={live.error || "…"}` so the friendly copy shows. Never render an error as an empty list.
4. Reimplement `useLiveData`/`useLiveRows` on TanStack `useQuery`, keeping their public API and the `status` field, so the ~190 call sites do not change. Gain cache, dedupe and refetch-on-focus. Invalidate the relevant query keys after writes made through `apiRequest` and `liveMutateOrNull`.
5. Make an unhandled `apiRequest` failure reach `GlobalMutationErrors` (`lib/queryClient.ts:526-538`) when the call site does not handle it.
6. Failing test for staleness: change a record from a second client, refocus the window, and assert the list refreshes (red at head).

**Acceptance**
- 401/403/404/500 render distinct copy; no retry on 401/403 (red at head).
- `useLiveData` is backed by `useQuery` with an unchanged signature; the refetch-on-focus test fails at head and passes after.
- A grep gate fails if a new `hint={…error}` bypasses `statusCopy`.

### Stage 5 — Project lifecycle and one project identity (Phase 3 · L · engineering) — closes CAT1-10, CAT1-11

Do this before Stage 6: Stage 6 deletes the integer-id sharing API, which is safe only once nothing keys on integer project ids.

1. Re-confirm CAT1-10 and CAT1-11 at the current head (statuses here are from 94b4f9238).
2. Lifecycle (CAT1-10). Failing test first: `PATCH /api/c2c/projects/:id` with a changed sponsor returns 404 at head. Add the route to `server/routes/c2c/projects.ts`, behind `allowProgramMutation`, requiring a `reason` for governed fields (sponsor, application number, application type) and writing `writeChainedAuditRow` in the same transaction. In `ProjectHome.tsx`, add Edit, Archive and Close-out actions that call this route and the existing archive/unarchive/delete routes (`projects.ts`, around `:1881-1930` at the audit basis); each captures a reason, following the `regulatory-compliance-ux` pattern.
3. Project identity (CAT1-11). Inventory every client caller of `/api/projects` (`register-project-routes.ts:31-33`; `TaskBoard.tsx`, `CollabLauncher`) and `/api/concept2cure/projects` (`CommunicationCenter`), using the `taskBoardEveryStore` test as the starting list. Re-key each on the `regulatory_programs` UUID via `/api/c2c/projects`. If a table stores an integer project id, add a uuid column by amending its creating migration in place with a dated header note (Rule 1), backfill it inside a file in `C2C_MIGRATION_FILES` with a row-count assertion, and switch reads to it.
4. Delete the integer-id project routes once no caller remains. The commit names the replacement by path (`/api/c2c/projects`, `/api/c2c/projects/:id`) and the test that proves it reachable (`taskBoardEveryStore`, extended to assert no `/api/projects` or `/api/concept2cure/projects` call).
5. Document stores (`authoring_documents`, `coauthor_documents`, `concept2cure_artifacts`, `c2c_documents`, `vault.documents`, `public.documents`) are the second half of CAT1-11. They overlap MR-08 (Vault) and MR-09 (Authoring); file the inventory with a named canonical store per kind under `docs/evidence/MR-15/` and hand the convergence to those orders. Mark CAT1-11 PARTIALLY_FIXED until they land.

**Acceptance**
- `PATCH /api/c2c/projects/:id` edits a governed field only with a reason and writes one chained audit row (red at head: 404); Archive and Close-out work from ProjectHome.
- Grep of `client/src` finds no `/api/projects` or `/api/concept2cure/projects` caller; the extended `taskBoardEveryStore` test fails at head and passes after.
- The deleted routes' commit names `/api/c2c/projects` and the gating test.

### Stage 6 — Project membership, roles and need-to-know (Phase 2 if the pilot tenant is a consultancy or CRO, otherwise Phase 3 · L · mixed) — closes CAT1-06

1. Re-confirm CAT1-06 at the current head (statuses here are from 94b4f9238).
2. Founder decision (F-18 plus NEW): default visibility (`org` or `members`; F-18 recommends need-to-know), the project role set (proposed: lead, author, reviewer, approver, viewer), and whether org admins and managers see every project. Record it as a dated product decision in `docs/LAUNCH_DEFINITION_OF_DONE.md`.
3. Migration (Rule 1). Add `migrations/<date>_regulatory_program_members.sql`: `CREATE TABLE IF NOT EXISTS public.regulatory_program_members` with `id uuid primary key default gen_random_uuid()`; `organization_id INTEGER NOT NULL references organizations(id)`; `program_id uuid NOT NULL references regulatory_programs(id)`; `user_id INTEGER NOT NULL references users(id)`; `role text NOT NULL` with a CHECK on the decided set; `status text NOT NULL default 'active'` CHECK in (`invited`,`active`,`removed`); `invited_by INTEGER`; `reason text NOT NULL`; `created_at`/`updated_at timestamptz`; `UNIQUE(program_id, user_id)`; an index on `(organization_id, user_id)`. Add a trigger or composite FK asserting `regulatory_programs.organization_id = NEW.organization_id`. Backfill idempotently with `INSERT … SELECT id, organization_id, lead_user_id, 'lead', 'backfill: program lead' FROM regulatory_programs WHERE lead_user_id IS NOT NULL ON CONFLICT DO NOTHING`, and assert the row count inside the file. Register it in `scripts/db/migration-set.mjs` `C2C_MIGRATION_FILES` immediately after `migrations/20261012b_regulatory_programs_eu_device_classes.sql` and before `UUID_TENANT_ISOLATION_NONPUBLIC`, so `TENANT_ISOLATION_SWEEP` policies it. Run `ci:migration-set-order` and `ci:migration-drop-safety`.
4. Service. In `server/services/c2c/program-access.ts`, add `programMemberRole(db, programId, orgId, userId)` and `canReadProgram(...)`; extend `canMutateProgram` (`:58-65`) to admit active members with role lead or author. Keep `programInOrganization` as the single tenancy answer (`ci:program-ownership-single-source` stays green). Replace the "READ ROUTES ARE NOT GATED" header (`:22-28`) with the new rule.
5. Enforce reads under `members` visibility; non-members get 404, not 403:
   - `server/routes/c2c/projects.ts:603` list (an `EXISTS` membership predicate) and every `/:id` read;
   - `server/routes/c2c/project-vault.ts` reads at `:1101` (restrict the org-wide search to readable programs), `:1134`, `:1567`, `:1647`, `:1708`, `:1746`, `:1793`, `:2117`, `:2183`, `:2281`, `:2294`;
   - the authoring list by `client_program_id` (`server/routes/authoring.router.ts:1421`);
   - the lead-or-manager gates at `submission-service.ts:440` and `document-data-disposition/service.ts:69` use the extended `canMutateProgram`.
6. API. Add `POST /api/c2c/projects/:id/members`, `PATCH …/members/:userId` and `DELETE …/members/:userId`, each requiring a reason and writing `writeChainedAuditRow` in the same transaction. Rewrite `GET /:id/team` (`projects.ts:1185-1260`) to read the table, so team members are accounts, not free-text names.
7. UI. Replace the placeholder at `client/src/concept2cure/v2/surfaces/Projects.tsx:700-715` and the `useState<string[]>([])` at `:222-225` with a picker over org members (role plus reason). Add add, remove and re-role controls to the ProjectHome team panel.
8. Zero duplication. Retire the integer-id sharing API in the same change — `server/routes/concept2cure.ts:1716-2042` and `services/project-sharing-access.ts` — after Stage 5 shows nothing on the integer id space uses it. The commit names the replacement (`POST /api/c2c/projects/:id/members`) and its test.
9. Failing-first tests (`tests/db`, as `app_service` with `RLS_ENFORCE=on`), two users in one org: (a) a non-member GET of the project, its Vault and its authoring documents returns 404 under `members` (red at head: 200); (b) a non-lead member with the author role can pin evidence (red at head: 403); (c) removing a member without a reason returns 400; (d) the two-tenant contract stays green.

**Acceptance**
- Under `members`, a same-org non-member gets 404 on `GET /api/c2c/projects/:id`, the project's Vault list and download, and its authoring documents; the project is absent from the list and the org-wide Vault search. Red at head.
- A non-lead author can `POST /:id/evidence`. Red at head (403).
- Each membership add, remove and re-role requires a reason and writes one chained audit row in the same transaction.
- The concept2cure sharing/members routes are deleted and the commit names the replacement.
- The new table has `organization_id INTEGER NOT NULL`, an RLS policy after deploy, and passes `ci:migration-set-order`.

### Stage 7 — Links that open the document, and e-mail on assignment and review (Phase 3 · M · engineering) — closes CAT1-19

Depends on Stage 5 (one project identity), Stage 6 (a link must respect membership) and an SMTP provider (F-4, MR-16).

1. Re-confirm CAT1-19 at the current head (statuses here are from 94b4f9238).
2. Failing test first: opening `/concept2cure/<surface>/p/<projectUuid>/d/<documentId>` (or the shape the team picks) in a fresh session selects that project and opens that document (red at head: the project comes from `sessionStorage`, `shellProject.ts`).
3. Extend `client/src/concept2cure/v2/routing.ts` beside `conversationIdFromLocation` with project and document segments. The shell resolves the project from the URL first and falls back to `shellProject.ts` storage only when the URL has none. A link to a project the user cannot read shows the not-found panel from Stage 3, not an empty surface.
4. Add e-mail fan-out in `server/services/notifications/notification-service.ts` for assignment and review requests, using the deployment's SMTP configuration. The mail carries the deep link and a minimal subject; keep document content out of the mail body. Respect a per-user opt-out. If SMTP is not configured, record the in-app notification and log that e-mail was not sent; never report a send that did not happen.
5. Test with the Stage 1 Mailpit job: assign a reviewer, capture the mail, follow the link, land on the document.

**Acceptance**
- The deep-link test fails at head and passes after; a link survives a new tab and a sign-in round trip (`returnTo`).
- Assigning a reviewer sends one e-mail containing a working deep link (Mailpit capture).
- A deep link to an unreadable project renders not-found.

### Stage 8 — Accessibility and browser support an enterprise reviewer can sign (Phase 3 · M · engineering) — closes UX-04, UX-06, UX-11, UX-12

1. Re-confirm UX-04, UX-06, UX-11 and UX-12 at the current head (statuses here are from 94b4f9238).
2. Document language (UX-04), assuming English-only at launch (NEW decision; if another language is in scope this becomes an XL externalisation of the launch surfaces instead). Failing test first: `client/src/i18n/__tests__/documentLanguage.test.ts` sets `localStorage['c2c.language']='de'`, imports `@/i18n`, awaits `i18n.changeLanguage('de')`, and asserts `document.documentElement.lang === 'en'` (red at head: `de`). Then in `client/src/i18n/index.ts:35-40` and `:67-68`, stop writing the i18n language to `document.documentElement` (delete `applyDocumentLanguage` and its two calls, leaving `client/index.html:2` `lang="en"` authoritative, or make it always set `en`/`ltr`). Mark translated subtrees instead (WCAG 3.1.2): add `lang`/`dir` from `getLanguageDef(i18n.language)` (`client/src/i18n/languages.ts:60`) to the root of `client/src/concept2cure/auth/ZenAuthLayout.tsx` and of the dialog in `client/src/concept2cure/components/session/IdleSessionGuard.tsx`. In `client/src/index.css:1020-1043` change `html:lang(ja) …` rules to `:lang(ja) …` and delete the `:lang(ja) body` rules. Correct the docblock in `client/src/components/i18n/LanguageSwitcher.tsx:1-12`; keep the switcher on auth pages only. Extend the test: `ZenAuthLayout` root has `lang="de"` while `documentElement.lang` stays `en`. Run `node scripts/ci/check-i18n-integrity.mjs`.
3. CSS lowering and browser matrix (UX-06), against the matrix the founder confirms (NEW decision; proposed Chrome/Edge ≥ 109, Firefox ESR ≥ 115, Safari ≥ 15.4):
   - Write `scripts/ci/check-built-css-nesting.mjs` first. It parses every `dist/public/assets/*.css` with postcss and fails, printing file and selector, on any rule or `@keyframes` whose ancestor is a style rule; it refuses a stale or missing `dist`. Its `--self-test` feeds `.a{.b{color:red}}` and `.a{@keyframes k{to{opacity:1}}}` and asserts both fail. Add `ci:built-css-nesting` and `ci:built-css-nesting:selftest` to `package.json`.
   - Build at head and run it: it must exit non-zero with about 2,600 nested rules (2,607 in source across 10 sheets).
   - In `vite.config.ts` `build` (`:70-76`) add `cssTarget: ['chrome109','edge109','firefox115','safari15.4']` (or `cssMinify: 'lightningcss'` with the same targets); leave the JS `target: 'es2022'` unless the matrix needs lower.
   - Hoist the five nested `@keyframes` to top level, keeping their names: `ana-v2.css` `acspin`, `authoring-v2.css` `dc-open`, `ectd-v2.css` `ecRise`, `research-v2.css` `pg-fade` and `pg-pop`.
   - Rebuild; the gate exits 0. Wire it into the `build` job of `.github/workflows/ci.yml` after the Build step (`:2284-2285`), next to "Component class coverage"; run the self-test in the lint job. Do the full build on a machine sized for it.
   - Publish the matrix in the customer-facing system-requirements and validation material (MR-02's validation pack). File Chromium 109 (or Safari 16.0) screenshots of Vault, the Authoring editor and eCTD compile.
4. Contrast (UX-11). Add a stylelint rule that forbids `color: var(--text-500)` except on disabled, placeholder and decorative selectors; run it at head and show it failing on the 48 uses in `v2/styles/app-v2.css` (examples at basis: `.gov-audit-note`, `.tb-empty`, `.pj-card-foot`, `.art-kind`). Move informative text to `--text-300`/`--text-400`. Re-base `--text-400` on tinted surfaces where it falls below 4.5:1 (3.79:1 on bg-200 at basis) and fix the `--accent-main-100` hover link colour in `quality/app.css` (2.96:1 at basis).
5. SPA accessibility (UX-12). Failing tests first, then fix:
   - `document.title` per surface, set in the `V2App.tsx` route effect from the surface label ("Vault — Concept2Cure"); red at head (static title from `client/index.html:12`).
   - On route change, move focus to the page `h1` and announce the surface in a polite live region.
   - Re-confirm the basis items not checked at head: clickable sequence `<div>` rows in `SubmissionCenter.tsx` (around `:1498` at basis) become buttons or rows with keyboard handling; the `framer-motion` page transition in `ZenRouter.tsx` honours `prefers-reduced-motion`.
   - Add axe-core to the Playwright launch-surface run (every rail entry from Stage 2), plus a `de-DE` locale context asserting `document.documentElement.lang === 'en'`. Fail on serious or critical violations.

**Acceptance**
- `documentLanguage.test.ts` fails at head and passes; with locale de-DE, ja-JP or fr-FR, `documentElement.lang` is `en` on every shell surface, and the auth layout and idle dialog carry the chosen language.
- `ci:built-css-nesting` exits non-zero on a build without the target (about 2,600 rules) and 0 after; its self-test fails on both fixtures; the `ci.yml` build job runs it; a source scan finds 0 nested `@keyframes`.
- The stylelint contrast rule fails at head and passes after.
- Each launch surface sets its own `document.title` and moves focus on navigation; axe reports 0 serious or critical violations across the launch surfaces.
- The supported-browser matrix is published, with screenshots on its lowest version.

### Stage 9 — A UI-driven golden journey in CI (Phase 3 · M · engineering) — closes UX-20

Depends on Stages 1–3 and 5 (the journey must be walkable through the UI) and MR-02 (required checks, so a red run blocks).

1. Re-confirm UX-20 at the current head (statuses here are from 94b4f9238).
2. Write `tests/e2e/golden-journey-ui.e2e.spec.ts` that drives only the UI, no `browserApi` POSTs: sign in (invitation path) → create a project → upload to Vault → open in Authoring and draft a section → request review → compile in Submission Center → check Submission Readiness → open a QMS controlled document. Use the rail entries from Stage 2 to navigate.
3. Add it to `.github/workflows/tier5-browser-smoke.yml` beside the specs at `:108,:116`, on every push to `concept2cure-v2`.
4. Prove it fails: seed a regression (for example, revert the Stage 2 Authoring rail entry, or the Stage 1 router fix for the sign-up variant) and show the spec red; restore and show it green. File both runs.
5. List the ~30 specs in `tests/e2e/` that CI does not run; for each, either add it to a CI job or record why not in `docs/evidence/MR-15/`.

**Acceptance**
- The UI-only journey spec runs in CI on every push and passes.
- It fails on the seeded regression, with the red run filed.
- Every spec in `tests/e2e/` is either run in CI or listed with a reason.

### Stage 10 — Hygiene: honest design-system docs, dead theme code, shipped example records (Backlog · L · engineering) — closes UX-13, UX-24, UX-25, CAT1-24

Coordinate with MR-14, which may remove the `mdx` and `pdev` kits outright; do not move or rename files MR-14 is deleting.

1. Re-confirm UX-13, UX-24, UX-25 and CAT1-24 at the current head (statuses here are from 94b4f9238).
2. Example records (UX-25). Failing check first: build production and grep the bundle for "Jordan Chen" and "Dr. Lee Hartman" (present at head). Move the seed arrays in `mdx/store/dossierStore.ts:196-204`, `quality/data.ts` (around `:147-164` at basis) and `v2/fixtures/project-home-data.tsx` behind a dev-only dynamic import or into `__tests__` fixtures, so they are tree-shaken. Keep `anaDrafterNoFabrication.test.tsx` as the gate and show it failing on a re-introduced seed. Add the bundle grep to CI.
3. Fixtures and dead lists (CAT1-24). Rename `client/src/concept2cure/v2/fixtures/` to a name that says what it holds (configuration) and update imports. Remove `VERIFIER` from the unused `ESIGN_MEANINGS` lists (`v2/fixtures/review-data.ts:128`, and `registryModel.ts` around `:856` at basis) — the server rejects it (`authoring.router.ts`, around `:864` at basis). Remove the full-row debug log in `projects-management.ts` (around `:100` at basis). Delete the legacy `/api/vault/statistics` and `/api/vault/list` routes (`misc-inline-routes.ts:90-126`) only after a grep shows no caller; the commit names the replacement by path (the project Vault routes in `server/routes/c2c/project-vault.ts`) and a test that proves them reachable. The file sizes (`AnaToolExecutor.ts` 21,833 lines, `authoring.router.ts` 8,603) are tracked by MR-14; do not split them here.
4. Dark theme and compile-time flags (UX-24). Founder decision (NEW): keep dark mode or delete it. If kept, add a toggle in the settings surface that writes `prefs.dark`, plus a `prefers-color-scheme` default, and a test that toggling changes the applied theme. If deleted, delete the dark branch in `V2App.tsx:1150-1198` and its CSS; that is the removal of an unreachable but maintained capability, so the commit records the founder's decision. Collapse the compile-time client flags with two call sites into constants.
5. Design-system truth (UX-13). First correct the README to reality: remove the claims about `client/src/component-registry.ts` and "28 governed components", the raw-`<button>` ban, and the deleted `ZenApp` shell. Then, as the larger follow-on, build a small primitive set (Button, Field, Select, Dialog, Menu, Table, States) with Storybook stories, a type and spacing token ramp, and a stylelint/ESLint rule that forbids raw `<button>` on launch surfaces, migrating launch surfaces first.

**Acceptance**
- A production bundle contains neither example name; the CI grep fails when one is re-introduced.
- `v2/fixtures/` no longer exists; no `VERIFIER` in client e-sign lists; the debug log is gone; the legacy vault routes are deleted with a named replacement and test.
- Dark mode is either reachable by a user with a test, or deleted with the founder's decision cited.
- The design-system README matches the code (no reference to a missing file); the lint rule fails on a raw `<button>` added to a launch surface.

## Definition of done

- A new user completes invitation → sign-in, and (with sign-up enabled) sign-up → verify → sign-in, on a deployment with dev-auth off, and the Playwright specs prove both in CI.
- Every app in `LAUNCH_APPS` is one click from an expanded rail, and a CI gate proves that no navigation source — rail, segment default, quick action, capability card, account menu or ⌘K — targets a surface outside `LAUNCH_SURFACE_IDS`, including when the entitlement fetch fails.
- First-run screens follow the tenant's client type; every empty state names the next step; errors distinguish 401/403/404/5xx; unknown links render not-found; help shows support and the build stamp.
- Projects have one UUID identity, an audited lifecycle, members with roles, and need-to-know visibility when the founder chooses it; a colleague's link opens the named project and document.
- The launch surfaces pass axe with 0 serious or critical violations, carry `lang="en"` and a per-surface title, and render correctly on the published supported-browser matrix.
- A UI-only golden journey runs in CI on every push and has been shown failing on a seeded regression; every finding here is updated in `docs/work-orders/MR-findings-2026-10-13.json`.

## Founder decisions this order needs

- **F-3 — self-serve sign-up at launch** (recommended off). Blocks Stage 1 step 8 only; the verify-email route fix ships regardless.
- **F-18 — project visibility default** (recommended need-to-know). Blocks Stage 6, and decides whether it runs in Phase 2 (consultancy or CRO pilot) or Phase 3.
- **F-10 — FDA only, eCTD v3.2.2.** Confirms Stage 2 step 13 (no 510(k) claims outside an entitled device surface).
- **F-4 — SMTP provider and sending domain.** Blocks Stage 7's e-mail fan-out on a real deployment (Mailpit covers CI).
- **NEW — rail information architecture.** Does every `LAUNCH_APPS` entry get a rail entry, including Authoring (which `ONE_ANA_ONE_CANVAS.md` §5 routes through documents today) and a tier-locked CMC (shown locked or hidden)? Is "Quality" renamed to the catalog name? Are out-of-scope apps invisible, or listed as "later" in the Apps catalog only? Blocks Stage 2.
- **NEW — client-type picker scope.** Can a tenant see or switch to other client categories, or is it fixed by `organizations.client_type`? Blocks Stage 2 step 11.
- **NEW — project role set, and whether org admins and managers see every project.** Extends F-18. Blocks Stage 6.
- **NEW — launch languages.** English-only (S) or any other language (XL externalisation). Blocks Stage 8 step 2.
- **NEW — supported-browser and VDI matrix**, confirmed against the pilot customer's managed images at kickoff. Blocks Stage 8 step 3; if any pilot seat is below Chrome/Edge 112, Safari 16.5 or Firefox 117, move UX-06 to Phase 1.
- **NEW — dark mode: keep or delete.** Blocks Stage 10 step 4.

## Do not

- Do not fence, hide or delete CMC / Module 3 or Reporting & analytics while scoping navigation. Both are in the launch catalog; the boundary is `shared/constants/launch-scope.ts`, and the CMC composition boundary is `services/cmc/composition-scope.ts`. Hide only what that file excludes.
- Do not fix navigation scope in one surface at a time, or in the client only. One predicate (`useSurfaceAvailable`/`useSurfaceOfferable` over `LAUNCH_SURFACE_IDS`) and one enumerating gate in `ci:launch-scope`; the server's launch-scope 403 stays the authority, and the client fallback only stops the doors from appearing.
- Do not add a second public-route list, a second project API, or a membership store beside `regulatory_program_members`. Retire `/api/projects`, `/api/concept2cure/projects` and the integer-id sharing API in the same change that replaces them, naming the replacement by path.
- Do not remove a project column or table that a file in `C2C_MIGRATION_FILES` creates by appending a DROP; amend the creating migration in place with a dated header note. Do not seed membership or reference rows from a `scripts/seed-*.ts` — it never reaches a deployed database.
- Do not render an error as an empty list, put a placeholder support address in the help menu, or keep a hard-coded figure such as "142 tools" on screen. If a value is not configured or computed, say so.
- Do not delete `KitSurfaceScaffold`, the dark theme or the legacy vault routes as "unused" without the history search, the named replacement and its gate, or (for dark mode) the founder's decision.

## How to run this order

- Claim it with one line in `docs/work-orders/README.md` §0 before starting; release it when you stop.
- Commit to `concept2cure-v2` only; merge, never rebase.
- Show each acceptance check failing on the current code before the fix, then passing; file that evidence under `docs/evidence/MR-15/<date>/`.
- When a finding closes, update its `statusAtHead` in `docs/work-orders/MR-findings-2026-10-13.json` with the closing commit.
