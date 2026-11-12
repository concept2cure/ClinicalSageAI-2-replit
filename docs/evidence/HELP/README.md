# Help, training and support through AnA (P-127, package S13)

Founder decision P-127 (2026-11-12, `docs/LAUNCH_DEFINITION_OF_DONE.md`). Design: `docs/design/HELP_AND_SUPPORT_2026-11-10.md`.

The founder asked for help, training, new-client onboarding and ticket tracking run the way Anthropic runs Claude's. They
should be reachable by any user at any time, both through AnA in the conversation and through a help and support agent.

## What already exists

The full inventory, with every search run and every deleted predecessor, is §2 of the design. In short:

- **Get help** opened the conversation with no help context (`Shell.tsx`, `HELP_SURFACE`).
- **AnA's product tools** already existed: `navigationTools.ts` (`navigate_to`, `start_product_demo` and five Live
  Drive scripts), `describe_capabilities`, `get_client_journey`. There was no how-to corpus and no help search.
- **Training** listed empty enablement tables and was launch-locked (`surfaces/Training.tsx`, `deferred-capability-inventory.ts`).
- **`/api/docs`** answered `{docs: []}`; it was a stub (`server/routes/docs.ts`).
- **The support tables** (`migrations/0007_support_admin.sql`) were on install-fresh only. They had no route after
  `server/routes/support-admin.ts` was deleted (`3cc8547d2a`). `support_ticket_messages` had no tenant column.
- **Home's setup checklist** (`HomeSetup.tsx`) had three steps, for administrators only.
- **Deleted before, not restored:** HelpDrawer, TourOverlay, FirstRunGuide, HelpButton, TutorialGuide,
  InteractiveTour, KnowledgeBasePanel, OnboardingTour, TrainingManagement and support-admin.ts. No tours or coach marks.

Each item below completes one of these. No new screen was added.

## What was built

| Claude's | Here | Path |
|---|---|---|
| Help Center | 87 articles in 13 collections, from getting started to troubleshooting, with administration and a technical reference | `shared/help/articles/*.ts`, served by `server/routes/docs.ts` (`/api/docs`, `/search`, `/:slug`) |
| Claude answers how-to questions | AnA's `search_help_center` and `read_help_article` read the same corpus. They are pinned on a how-to turn, and the persona says to answer from the article and name it | `server/services/ana/help-support-tools.ts`, `server/routes/ana-ri/stream.ts`, `server/services/ana-ri/persona.ts` |
| The support agent | Get help (account menu and top bar) and Ask support open the conversation marked "From Help & training". That turn pins the help and ticket tools and adds the support brief | `surfaces/help/supportEntry.ts`, `Shell.tsx`, `stream.ts` (`isSupportTurn`, `SUPPORT_TURN_BRIEF`) |
| "Contact support" | AnA drafts a request (`open_support_ticket`, which records nothing) and opens it with `navigate_to`. The person reads it and sends it | `help-support-tools.ts`, `shared/navigation/index.ts` (the `training` params) |
| Ticket tracking | Your support requests: write, send, read the thread, reply (which reopens a resolved request), mark resolved, rate. An administrator sees the organisation's | `server/routes/support.ts` (`/api/support`), `surfaces/help/SupportRequests.tsx`; AnA's `list_my_support_tickets` |
| Academy | 3 courses: getting started for drug and biologic teams, the same for device and diagnostics teams, and administrator setup. Their lessons are articles plus Live Drive "Show me" demonstrations. Progress is not recorded, and the page says so | `shared/help/courses.ts`, `surfaces/Training.tsx` |
| Onboarding | Home offers the getting-started course for the client type: inside the administrator's checklist, and alone ("Get started") to other members until opened | `surfaces/HomeSetup.tsx` |
| Reachable | Help & training is in the launch shell, the registry, navigation and the account menu. It left the deferred inventory | `shared/constants/launch-scope.ts`, `ui-surface-registry.ui-v2.ts`, `shared/navigation/index.ts` |

**Tenant isolation of tickets.** `0007_support_admin.sql` joins `C2C_MIGRATION_FILES` above the sweeps. It is amended in
place (RULE 1, dated note): `support_ticket_messages` gains `organization_id` from its ticket, made NOT NULL, plus a
same-organisation key `(ticket_id, organization_id)`. A message with no ticket stops the deploy. The route runs on the
request's connection, names the caller's organisation in every query, and commits every write together with its
chained audit row.

**Fable 5.** Articles were written by Fable 5 agents against the code, then reviewed. Fable 5 does not serve users: it is
not an approved model (RULE 2). Support turns use the approved routing.

## Evidence

**App walk:** `node docs/evidence/HELP/walk.cjs` ran against the running app (RLS and launch scope enforced) with two
personas, a biotech regulatory lead and a device RA manager, each at 1440×900 and 390×844, signed in through the
sign-in form. **48 steps, 0 failures, 0 API errors, 0 page errors** (`walk.json`, `shots/`). Each persona:

- opened Home's course step and got the course for their client type;
- opened Help & training from the account menu;
- searched (one hit, one miss offering support);
- opened a course and a lesson;
- sent a request, then replied to it, resolved it and rated it;
- sent the request AnA drafted;
- opened Get help and landed in the conversation marked "From Help & training".

No AnA turn was sent in the walk, and no model answer is shown as evidence.

**Tests:**

| Area | Test file | Count |
|---|---|---|
| Corpus | `shared/help/__tests__/help-corpus.test.ts` | 183 |
| `/api/docs` | `server/routes/__tests__/docs-help-center.test.ts` | 6 |
| `/api/support` against the real tables in PGlite, plus the migration's replay, upgrade and orphan stop | `server/routes/__tests__/support-requests.pglite.test.ts` | 9 |
| AnA tools, each navigate_to call resolved through the registry | `server/services/ana/__tests__/help-support-tools.test.ts` | 12 |
| Help & training | `client/.../__tests__/helpAndTraining.test.tsx` | 9 |
| Requests and Ask support | `supportRequests.test.tsx` | 7 |
| Home's course step | `homeSetup.test.tsx` | 9, 2 of them new |

**Seen failing:**

- With its organisation filter removed, the support route fails the cross-organisation test.
- `shellProtocolLeaveGuard` failed on the first Get help, which wrote the hand-off before the leave guard. That is fixed.
- `tool-authorization.test` and `ci:step-presentation` went red when the help tools were missing from the register.
  That is fixed in `ed0cbf1a95`.

**Commits** (`Plan: S13`, each with `Completes:`): `fc08765d2a`, `1207a3c307`, `558869f8ba`, `909dbc29a0`,
`ee78e60639`, `ed0cbf1a95`, `60d26540b0`, `a3f16b9522`, `eab1864e99`, `1179db55df`, `75624cff54`; and
`e3c5b7c598` (`Plan: L1`, the deploy-path baseline shrink the gate asked for).

## Not done, and why

- **Concept2Cure staff cannot yet answer a request in the product.** The design's staff queue (§3.4: the queue across
  organisations, assign, status, replies, internal notes) needs a cross-tenant read. That belongs with the existing
  support console, `server/routes/admin/master-admin.ts` (system scope, `requirePlatformAdmin`), and with a staff
  screen. Both lie outside this package's files, so the ledger needs those paths added under P-127 by the founder.
  Until then requests are recorded, numbered, tenant-isolated and audited, and the person sees "Support has not
  replied yet". The product never claims a reply.
- **E-mail on a reply** waits for the staff side (§3.4).
- **Course progress and certificates** are not recorded (§3.5). The page says so.
- **Article accuracy:** the articles were checked against the code. The walk opened the flows above, not every article's.
  The Fable agents left out flows they could not confirm, among them supported browsers, how an API key is presented,
  and self-service SSO configuration.
- **The admin agent found three inconsistencies.** The Team card moved off the Plan step, the menu label is "Admin" and
  the sign-out item is "Log out". The articles were corrected.
