# Help, training and support, the way Claude's are run (2026-11-10)

Package S13 (P-127). Owned by the walking session (`01QoxbLZhy…`).

The founder, 2026-11-10:

> "You now own training and help function and must do through AnA and must follow existing roadmap and rules and
> practices. Extend what we have, build technical documentation and training materials as you go. Assure it all is easy
> to access by any user at any time either through ana chat directly or through an help and support agent.. both must
> be offered."
>
> "Exactly like Anthropic does with Claude support, training, new client onboarding and ticket tracking. Use fable 5
> for this."

## 1. The model: how Claude's help works, and what each part is here

| Claude | What it does for a Claude user | Concept2Cure: the existing piece it extends |
|---|---|---|
| **Help Center** (support.claude.com) | Short articles in collections, searchable, each with "was this helpful?" | The help corpus (§3.1), served by the existing `/api/docs` mount, which today answers `{docs: []}` |
| **Ask Claude anything** | Claude itself can explain how Claude works | AnA, in any conversation: she searches the help corpus and cites the article (§3.2) |
| **Support assistant** ("Get help" → a chat that answers from the Help Center, then "talk to a person") | First-line support, grounded only in the articles; hands off with the conversation attached | AnA in **support mode**: the same conversation, opened from "Get help", with a support brief, the help corpus and the ticket tools only (§3.3) |
| **Tickets** (your conversations with support, their status, replies by email) | Ticket tracking for the customer; a queue for support staff | `support_tickets` / `support_ticket_messages` (tables exist since `0007_support_admin.sql`), reached by a request-scoped route (§3.4) |
| **Anthropic Academy** (courses and lessons) | Learning paths for new and advanced users | The `training` surface and the five Live Drive scripts in `shared/navigation/demo-scripts.ts` (two are already named training); courses are lessons of articles, each with "Show me" (§3.5) |
| **Onboarding for new teams** (admin setup guides, getting started) | Set up the organisation, invite the team, first project | Home's "Set up your organisation" (`HomeSetup.tsx`), the onboarding screens, `onboardingWelcome.ts`; they gain the getting-started course and the administrator's articles (§3.6) |
| **Release notes / status** | What changed | Not in this first package; `CHANGELOG.md` is developer-facing (§6) |

Two entrances, as the founder asked, both always available:

1. **AnA chat, directly.** Any composer. "How do I add a market?" is answered from the help corpus, with the article
   named and openable.
2. **The help and support agent.** Account menu → **Get help**, the top bar's **Help** (P-122 §3.4), and Help & training → "Ask support". It opens the
   conversation in support mode: it answers only about using Concept2Cure, from the articles; it can start a guided
   demo; and when it cannot resolve something it opens a ticket with the conversation attached, after the person
   confirms.

## 2. What already exists

Searched (an inventory sweep on 2026-11-10, recorded in full in this package's evidence README): help, help center,
support, support agent, ticket, training, course, lesson, tutorial, tour, walkthrough, onboarding, getting started,
how-to, faq, knowledge base, docs, documentation, user guide, glossary, explain, capability registry, demo, startTour,
onStartDemo, release notes, what's new, training records, certification, quiz; in `client/src/concept2cure/**`,
`server/routes/**`, `server/services/**` (AnA tools, prompts, skills), `shared/**`, `migrations/**`, `db/migrations/**`,
`.claude/skills/**`, `docs/**`; and `git log --all --diff-filter=D` on the same names.

| What | Path | What it does today | What it does not do |
|---|---|---|---|
| "Get help" | `client/src/concept2cure/v2/Shell.tsx:73-76, 719` (`HELP_SURFACE = 'conversation-thread'`) | Opens the AnA conversation from the account menu | No seed, no help context, no support mode |
| Guided tour and demos | `LiveDriveSwitch.tsx:33-158` ("Demos" → "Show me around", 5 demonstrations); `V2App.tsx:865-915`; `shared/navigation/demo-scripts.ts` (5 scripts: `training-orientation`, `training-submission-day`, `training-medtech`, two sales) | AnA drives the screens stop by stop | No course around them; the free tour is improvised |
| AnA tools that know the product | `server/services/ana/navigationTools.ts` (`list_app_screens`, `navigate_to`, `list_screen_actions`, `list_demo_scripts`, `start_product_demo`); `describe_capabilities`; `get_org_capabilities`; `get_client_journey`; `summarize_onboarding_readiness` | Screen map, actions, plan entitlements, where to start | No "how do I…" corpus; no help search; no ticket |
| AnA's wayfinding prompts | `server/services/ana-ri/onboarding-tour.ts`, `use-case-playbooks.ts`, `capability-registry.ts`, `persona.ts:418-431`, `context-enrichment.ts` (`/help`, `/guide`, `/tour`) | First-session welcome, playbooks, "when the user says help" | `/help` returns project status, not product how-to; playbooks name stale MDX surface keys |
| Per-screen how-to (MDX only) | `server/services/ana-ri/mdx-knowledge-pack.ts` | Purpose, affordances, common questions per device screen | Device screens only; nothing for the rest |
| Screen context | `surfaceContext.ts` (`usePublishSurfaceContext`, ~79 screens) | Each screen tells AnA what it shows and offers | Not documentation |
| Training screen | `surfaces/Training.tsx`; `shared/constants/ui-surface-registry.ui-v2.ts:1236` (`training`, `readiness: 'planned'`); `shared/constants/deferred-capability-inventory.ts:44` (deferred, `converge` → `quality`) | Lists learning paths and certifications from `/api/enablement/*` | Launch-locked; the tables are empty and nothing writes them |
| Enablement read | `server/routes/enablement.ts` at `/api/enablement`; tables `enablement_learning_paths`, `enablement_certifications` (`db/migrations/20260716_enablement.sql`) | Org-scoped SELECTs | No content, no writes |
| Docs mount | `server/routes/docs.ts` at `/api/docs` (`register-clinical-intel-routes.ts:170-171`) | Answers `{docs: []}` | Everything; it is a stub |
| Support tables | `shared/schema/support-admin.ts`; `migrations/0007_support_admin.sql`: `support_tickets`, `support_ticket_messages`, `support_articles`, `support_settings` | Created on a fresh install, tenant-isolated (forced RLS) except `support_ticket_messages` | No route since `server/routes/support-admin.ts` was deleted unmounted (`3cc8547d2a`, 2026-06-05); not on `C2C_MIGRATION_FILES` |
| Onboarding | `surfaces/Onboarding*.tsx`, `onboardingWelcome.ts`, `HomeSetup.tsx`, `onboarding-discovery-routes.ts`, `onboarding-proposals.ts` | Workspace setup, first-run starters, Home's 3-step checklist | No getting-started course; no administrator guide |
| GxP training of record | `client/src/concept2cure/quality/*Training*`, `server/routes/mdx-qms-training.ts`, `qms_training_records` | Read-and-understood SOP training, assignments, expiry | Product training is not GxP training; the two stay separate |
| Staff runbooks | `docs/beta/SUPPORT_RUNBOOK.md`, `docs/commercial/SUPPORT_POLICY.md`, `docs/beta/CUSTOMER_ONBOARDING_RUNBOOK.md`, `docs/commercial/ONBOARDING_RUNBOOK.md` | Internal process | Not in the product |

**Deleted before** (every one removed as orphaned or "not Claude Design", none migrated): `HelpDrawer.tsx`,
`TourOverlay.tsx`, `FirstRunGuide.tsx`, `HelpButton.jsx`, `TutorialGuide.jsx`, `InteractiveTour.jsx`,
`KnowledgeBasePanel.jsx`, `OnboardingTour.tsx`, `TrainingManagement.tsx`, `routes/help/*Help.tsx`,
`server/routes/support-admin.ts`. This package does not restore them. The design brief's anti-reference stands: **no
tours, overlays or coach marks**. Help is a conversation and a quiet page, as Claude's is.

**Why `support-admin.ts` is not restored.** It read the shared pool (no request-scoped tenant, so RLS was not in
force), let a customer delete tickets, and carried analytics and SLA administration nobody asked for. The tables are
reached instead by a small route on today's practice (§3.4); the deleted file stays deleted.

## 3. What is built, by slice

Every slice: tests red without it, walked in the running app at 1440 and 390, evidence under
`docs/evidence/HELP/`.

### 3.1 The help corpus (the Help Center's articles)

- Articles are files in the repository, `shared/help/articles/*.ts`, one module per collection, each article a slug,
  title, collection, a one-line summary, the client types and screens it applies to, and a Markdown body. They are
  reviewed like code and versioned with the product they describe; an article that names a screen or a button is
  tested against the screen registry, so it cannot describe a screen that no longer exists.
- Collections: Getting started; Projects and the plan; Evidence and the data room; Writing documents with AnA; Review,
  approval and e-signatures; Submission Center and eCTD; Respond to the agency; Vault; Quality; Work areas (CMC,
  risk-based monitoring, biostatistics, reporting); Administration (organisation, members and roles, SSO, security);
  Technical reference (data handling, audit trail and Part 11, API keys and the connector, export, system
  requirements); Troubleshooting.
- **Written from the product, not invented.** Each article is written from the screen's code and checked in the
  running app; a statement the product cannot back is not written. Writing uses Fable 5 agents (the founder's
  instruction), each article reviewed before commit.
- Served by the existing `/api/docs` mount (`server/routes/docs.ts`, completed): the list of collections and
  articles, one article, and a search. The corpus is platform reference data, the same for every organisation; the
  route answers the signed-in, and filters by the person's client type where an article says so.
- `support_articles` is not used for this corpus: a file reviewed with the code is the record. The table remains for
  an organisation's own articles, which is not in this package.

### 3.2 AnA answers from the corpus (entrance 1)

- Two AnA tools, `search_help_center` and `read_help_article`, read the corpus through the same module the route
  uses. Read-only, no model in the answer's facts: AnA narrates what the article says and names it ("Help: Add a
  market to a project"), and the conversation renders the citation as a link that opens the article.
- AnA's existing "when the user says help" block (`persona.ts`) and `/help` gain one instruction: a question about
  using Concept2Cure is answered from the help corpus first; if there is no article, she says so and offers support.

### 3.3 The help and support agent (entrance 2)

- "Get help" opens the conversation in **support mode** (a flag on the thread, set when it is opened from Get help or
  from Help & training's "Ask support"; the thread says "Support" in its header). Support mode is AnA with:
  - a support brief: answer only about using Concept2Cure; answer from the help corpus and cite it; never give
    regulatory advice in this mode; say when something is not known; offer a person;
  - a tool set limited to `search_help_center`, `read_help_article`, the demo and navigation tools, `get_org_capabilities`,
    `get_client_journey` and the ticket tools;
  - **Talk to a person**: `open_support_ticket` drafts the ticket (subject, category, what was tried, the conversation
    excerpt) and the person confirms before it is sent. Nothing is sent on AnA's own decision.
- The same model routing as AnA. **Fable 5** is not on the approved-models list
  (`server/services/ai-governance/approved-models.ts`); RULE 2 lets a model serve users only as an approved entry with
  a pinned version, rationale and evaluation reference. P-127 item 7 records the founder's request and the route to
  qualify it under P-118's protocol; until then, support mode uses the approved routing.

### 3.4 Tickets (tracking, for the customer and for support staff)

- A route on today's practice (request-scoped database, tenant from the session, RLS in force), mounted at
  `/api/support`:
  - the customer: open a ticket; list their organisation's tickets they may see (their own; an administrator sees the
    organisation's); read one with its public messages; reply; mark resolved; rate it;
  - Concept2Cure support staff (the platform operator role): the queue across organisations, assign, change status,
    reply, and internal notes (`is_internal`), which customers never read.
- Ticket numbers come from the existing sequence. Every status change and reply is audited.
- `support_ticket_messages` gains its tenant isolation (an `organization_id` from its ticket, and the policy), by an
  amendment to the creating migration (RULE 1), and `0007_support_admin.sql` joins `C2C_MIGRATION_FILES` so the
  tables reach every deployed database.
- E-mail: a reply notifies by e-mail where the deployment's e-mail is configured; otherwise the reply waits in Help &
  training and the bell, and the ticket says so. Nothing claims an e-mail was sent that was not.

### 3.5 Training (the Academy)

- Courses are data beside the articles (`shared/help/courses.ts`): a course is an ordered list of lessons; a lesson is
  an article, and, where one fits, a Live Drive script AnA can run ("Show me"). The two existing training scripts
  become the spine of "Getting started with Concept2Cure" (biotech and pharma) and "Getting started for device and
  diagnostics teams"; further courses follow the journeys (projects, writing with AnA, review and signatures,
  submission, responding to the agency, administration).
- No progress or certificate in this package: the enablement tables have no writer, and a completion record needs a
  store and rules (who may mark a lesson done; what a certificate attests). Proposed separately; the screen does not
  pretend to track.

### 3.6 Onboarding new clients

- Home's "Set up your organisation" gains one step, **Take the getting-started course**, for every member, opening the
  course for the person's client type.
- The administrator's collection (organisation details, inviting members, roles and job roles, SSO, security
  settings, API keys and the connector, data export) is linked from the setup steps that name each task.
- The internal onboarding runbooks stay internal; the in-product guidance is the articles.

### 3.7 Where it is seen

- **One page: Help & training**, the existing `training` surface, re-purposed and admitted to the launch catalog
  (P-127 item 3): search; "Ask support"; the collections; the courses for the person's client type; **Your requests**
  (tickets), and for support staff, the queue. Reached from the account menu ("Help & training") and from Get help's
  conversation. The `deferred-capability-inventory` entry for `training` changes from "converge into Quality" to this.
- Read in the page as Claude's Help Center reads: a column of text, quiet type, no cards, no coach marks. It keeps the
  learning paths and certifications it shows today (P-122 §2, zero capability loss).

## 4. What is added, and the decision that admits it

All under P-127, package S13. Each is in `approvedAdditions`.

| Kind | Name | Why it is not avoidable |
|---|---|---|
| ana-tool | `search_help_center`, `read_help_article` | No existing tool reads product help; `describe_capabilities` lists tools, not how to use screens |
| ana-tool | `open_support_ticket`, `list_my_support_tickets` | No existing tool reaches the ticket tables |
| route | `server/routes/support.ts` | The tables' only route was deleted unmounted and does not meet the request-scoped rule |
| mount | `/api/support` | — |
| surface admission | `training` → Help & training, in the launch catalog | No other screen holds help; RULE 4 forbids a new one, so the deferred one is reached |

No new table. No new screen. No new model.

## 5. Order of work

1. P-127 recorded (this design, the decision, the ledger). 2. The corpus and `/api/docs`. 3. AnA's two help tools and
the "answer from the corpus" instruction. 4. Help & training page with articles and courses; Get help. 5. Tickets:
migration path, route, page, staff queue. 6. Support mode and its two ticket tools. 7. Onboarding step. Articles are
written alongside every slice.

## 6. Not in this package

Release notes in the product; a public, signed-out help site; e-mail delivery where none is configured; course
progress and certificates; an organisation's own articles; Fable 5 serving users before it is qualified.
