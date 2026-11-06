# Human test J1: sign-in, Home, Projects, New project and the project page (2026-11-06)

Package F1. Started by `011Dpx…` as one of five human-test journeys (J2 Vault, J3 editor and review, J4 Submission
Center, J5 the rail's other destinations). Walked in the running app as two personas, a **biotech regulatory lead**
(an IND) and a **device RA manager** (a 510(k) and a diagnostic 510(k)), at **1440×900** and **390×844**, with every
screenshot looked at. Each defect a tester would hit was written down, fixed in the existing code with a test that is
red without the fix, and checked again in the app.

**Result:** `walk.cjs` passes end to end, 25 steps, with **0 API responses of 4xx or 5xx and 0 page errors**
(`walk.json`). It found 16 defects, and all 16 are fixed (below). Four more are written down for their owners.

## What a tester can do now (verified by `walk.cjs`, screenshots in `shots/`)

1. **Sign in** at `/concept2cure/login` with e-mail and password (the form, not dev-login). Both personas land on Home.
   A new organisation can sign up at `/concept2cure/signup`. A password the policy refuses now returns to the
   password field.
2. **Home.** It shows a greeting, AnA's composer, "Set up your organisation" (company details, team, first project)
   and "Your projects". Each project row names its client type in words ("Medical device & IVD", "Biotech"). With no
   project, Home explains a project's six steps and says "for example an IND or a 510(k)". `shots/*-home.png`.
3. **The composer.** A message opens a conversation. With no model key, AnA answers "No AI provider is configured for
   this deployment, so AnA cannot answer. This is a server setting, not your connection." That is the refusal by
   design (`shots/desk-biotech-ana-no-model-key.png`), not a defect.
4. **Projects.** The grid's cards each carry the S11 schedule line ("On schedule · Planning by …", "14 tasks past due ·
   …"). Search matches by title or code, and a search with no match says so. The filters are client, client type and
   pathway, each with its counts. The list view shows seven columns. At 1440 its cells wrap. At 390 the table scrolls
   sideways inside its own frame and the page itself does not. `shots/*-projects-*.png`.
5. **New project, IND** (biotech lead): choose the filing, then configure it (client workspace, name, product,
   indication, product type, target date, objective), then review and create. The review reads "Client type Biotech"
   and shows the objective. The project opens. `shots/desk-ind-new-*.png` (first run).
6. **New project, 510(k)** and **510(k) for IVD** (device RA manager). The wizard opens "Tailored for Medical Devices",
   with the Medical Devices and Diagnostics & IVD tabs. It asks for device class, review panel, predicate and
   characteristics. Its objective placeholder names "510(k) clearance". The review reads "Client type Medical device
   & IVD".
7. **The project page, all six steps**, for the IND, the 510(k) and the IVD 510(k). The title stays at x=294 on every
   step (x=30 at 390).
   - **Plan:** "Due for you", what the filing needs, the program plan with its schedule line and workstreams, Team and
     Tasks. The IVD 510(k) has no work breakdown, and the plan says so in words: "This project's filing, 510(k) for
     IVD, has none yet."
   - **Evidence:** the project's files and the data room. The IND library is offered for the IND only.
   - **Author:** the documents, module completion and the records.
   - **Review:** reviews, Quality records, tasks and approvals.
   - **Submit:** the IND has its market. A device project reads "No submission recorded to this project yet", beside
     "Assemble the eSTAR".
   - **Respond:** add the agency's letter, see the open communications, and start a response sequence.
   - At 390, no control runs past the screen's edge on any step.
8. **About card:** client, product, indication, the device facts for a device project, the **objective** with its
   version and "Ask AnA to propose it" / "Edit", and the work areas.
9. **Project settings** opens over the page (description, priority, target date, archive). A change is reviewed, saved
   under a governed reason with "yes" typed, and the header shows it at once and after a reload ("High priority",
   `actions/01`).
10. **The objective's Edit** records a new version with its source and reason ("Version 2", `actions/02`).
11. **Assign** on a document the filing needs creates a task for a person with a due date. It appears under "Due for
    you", on the project's task board and in the person's tasks (`actions/03`).
12. Home's "Record your company details" and "Invite your team" open the admin console on its settings and members
    tabs. A Projects card opens its project.

## Defects found, and their fixes

Every fix is on `concept2cure-v2` with `Plan: F1` and a `Completes:` trailer. "Before" screenshots are in `before/`.

| # | Step | Expected | Actual (before) | Fix | Test (red without the fix) |
|---|---|---|---|---|---|
| 1 | Device project: header, Home row, New project review | The client type in words | "MDX" (a stored key); the review row read "Workstream MDX" (`before/01`) | `4959d6cd`: `WS_LABEL` everywhere; the review row is "Client type" | `j1ClientTypeInWords.test.tsx` |
| 2 | Home, device company | An example for every client | "One regulatory filing, for example an IND" (`before/11`) | `4959d6cd`: "an IND or a 510(k)" | same |
| 3 | New project, objective (510(k)) | A placeholder that fits a device | "What the study set out to show, e.g. that the primary endpoint is met" (`before/12`) | `4959d6cd`: names "510(k) clearance"; the edit form's subtitle no longer says "study" | same |
| 4 | Project page, switching steps | The page stays where it is | Title, composer and tabs jumped 61px sideways on Review and Respond (`before/02`) | `b3509fdc`: `.pj` claims the shell's flex row | `j1PageLayout.test.ts`; walk measures x on every step |
| 5 | Projects list, 1440 | Each cell in its column | The lead's e-mail ran over the target date (`before/03`) | `b3509fdc`: cells wrap | same |
| 6 | Projects list, 390 | Readable rows | The project name squeezed to a word a line; four columns cut off, unreachable (`before/04`) | `b3509fdc`: the table scrolls in its frame | same |
| 7 | Sign-up, step 4 | A refused password is shown at the password | "Password must not contain your name…" on the legal step, three steps after the field (`before/05`) | `1a232259`: back to step 1, sentence under the field | `signupPasswordRefusal.test.tsx` |
| 8 | Sign-up, success | Points to where the app opens | "Start with Deep Research … or open document authoring" (`before/06`) | `1a232259`: "Open Concept2Cure and create your first project" | same |
| 9 | 510(k) project, Evidence | No IND library on a device filing | "Vault · Data room · IND documents" (`before/07`) | `6d349696`, `b4251795`: `indLibrary` on the files panel | `j1EvidenceDeviceLanes.test.tsx` |
| 10 | 510(k) project, Submit | True words for a device filing | "No market for this project yet" on a 510(k) to FDA (`before/08`) | `7ae11d8f`: "No submission recorded to this project yet …" | `projectHomeSubmitStage.test.tsx` (3 cases) |
| 11 | New project, then the project page | No 429 | Each open fired 174 `market-support` reads; three opens in a minute exhausted the 600/min per-user API allowance and the next project page's reads (its objective among them) answered **429** | `559f36bd`: one shared read per path, kept 5 minutes; first open 87 reads, a second 0 | `registryPickerOffers.test.tsx` |
| 12 | IVD 510(k), Plan | No contradiction or key | "…available for … 510(k)s … This project's filing (us_510k_ivd) has none yet" (`before/09`) | `a3dcd54d`: "This project's filing, 510(k) for IVD, has none yet." | `projectProgramPlan.test.tsx` |
| 13 | Project page at 390, Author / Review / Submit | Every control on screen | Section buttons ended at 398–456px, off the screen, for both personas (`before/10`) | `75dba130`: at ≤640px the head and its actions wrap | `j1PageLayout.test.ts`; walk checks every step |

| 14 | Project settings, opened | No warning about something that did not happen | "Current saved settings loaded. This read does not confirm an earlier uncertain save or audit." to a tester who had saved nothing (`before/16`) | `4d817e64`: said only on a reload after a save that could not be confirmed | `ProjectSettings.test.tsx` |
| 15 | Plan, a document after Assign | The two lines agree | "Assigned to reg.lead…, due Nov 20, 2026" then "Work: Define product profile · due Jan 29, 2027 · no owner" (`before/15`) | see the commit list below: the line names the producing task's owner, "task owner: none" | `projectHomePlan.test.tsx` |
| 16 | New project at 390 | Every client type's tab reachable | The filing tabs were 661px wide and clipped: "Diagnostics & IVD" and "Cross-Cutting Documents" could not be reached (`before/14`) | see the commit list below: the row scrolls in place (`actions/04`) | `j1PageLayout.test.ts` |

Defect 13 was found on the second walk, by the edge check added to it; 14 to 16 on a third pass through the actions the
walk only opened: saving settings, editing the objective, assigning, and New project at 390.

Suites that also ran green: 84 editor and Evidence suites; 20 wizard and picker suites; 15 Home, wizard and sign-up
suites; Submit and dispatch-readiness. A 99-file run of the Home, Project and project-home suites showed 4 failures in
unrelated files (`adminApiKeyCreate`, `authoringPlaceWholeDocument`, `ectdModuleReadiness`,
`indFormsPanelAttachmentVerdict`). All 4 pass when run alone: they time out under that load. The pre-push gates
(typecheck, the ESLint ratchet, one-design-plan, one-product) passed on every push. The ratchet refused one: a
complexity rise in `ProjectFilesPanel`, fixed in `b4251795`.

## Written down for their owners, not fixed here

- **→ S11 (`services/regulatory`, `pyramid.routes.ts`):** a 510(k) for IVD (`us_510k_ivd`) gets no work breakdown,
  because the route gives a filing only its exact catalogue type's plan ("never given another type's plan"). Whether
  an IVD 510(k) takes the 510(k) breakdown (its `program_type` is `k510`) is that rule's owner's call. The plan now
  says so in words (fix 12).
- **→ J3 (editor):** the editor's own files rail (`ProjectFilesPanel` beside a document) still offers "IND documents"
  for a device project's document. The prop exists now (`indLibrary`); the editor would pass it the same way.
- **→ coordinator (`app-v2.css`, held):** at 1440 the top bar's notification count sat over the bell icon. Fixed by
  the coordinator in `e25a18a6` ("The bell's count sits on the button's corner").
- **→ coordinator (`app-v2.css`):** `.rpk-tabs` itself does not scroll; fixed for New project in
  `project-home-v2.css` (`.npw .rpk-tabs`). Any other screen that shows the filing picker at phone width needs the same.
- **→ coordinator:** sign-up (`ZenSignup.tsx`) is drawn in an older style: a black "C2C" mark, black buttons and a
  sans heading. Sign-in has the serif heading and terracotta button. That is a redesign, not a J1 fix.
- **Known, not a defect:** a device project shows "No market yet" in its About card's status line. Device filings
  carry no eCTD submission record by design (the MDX journey's founder question 1).

## Known limits

- **No model key.** AnA's replies (Home's composer, "Ask AnA to propose it", the project composer) are refused with
  the honest message above. That is by design and not counted.
- A 510(k)'s schedule spans about three weeks (Mar 9 to Mar 31, 2027 for a Mar 31 target, `shots/desk-510k-step-plan.png`):
  the engine's device tasks carry hours, not durations (S11's README, "Found on the way").
- Dev mode (React StrictMode) doubles some reads. The request counts above are from the development server.

## Test accounts and setup

| Persona | Sign in | Organisation | How it was made |
|---|---|---|---|
| Biotech regulatory lead | `reg.lead@example.com` / `J1-Tester-Pass-2026!` | Concept2Cure Therapeutics (pharma), with the demo packs | The seeded demo admin (`DEMO_USER_EMAIL`, `DEMO_USER_PASSWORD`) |
| Device RA manager | `device.lead@example.com` / `Tq9-Harbor-Lantern!` | Northfield Medical (J1 test), client type `medtech` | Sign-up through `/concept2cure/signup` as "Medical Device Company" |

These are local test credentials on a disposable database, not secrets of any deployment.

```
# Postgres 16 with pgvector (apt-get install postgresql-16-pgvector), an empty database:
createdb c2c_j1
export DATABASE_URL=postgres://postgres:…@127.0.0.1:5432/c2c_j1
export APP_SERVICE_DB_PASSWORD=<12+ chars>          # mints the runtime role app_service
node scripts/db/install-fresh.mjs                    # "pgvector (extension "vector") present"
export APP_DATABASE_URL=postgres://app_service:<that password>@127.0.0.1:5432/c2c_j1
node scripts/db/deploy-migrate.mjs                   # "Schema migration complete"

# The server, as the runtime role, with the launch gate and RLS enforcing:
NODE_ENV=development ALLOW_DEV_AUTH=1 PORT=5100 RLS_ENFORCE=on LAUNCH_SCOPE_ENFORCE=on \
ALLOWED_ORIGINS=http://127.0.0.1:5100,http://localhost:5100 \
DEMO_USER_EMAIL=reg.lead@example.com DEMO_USER_PASSWORD='J1-Tester-Pass-2026!' \
JWT_SECRET=… SESSION_SECRET=… npx tsx server/index.ts

# The demo packs (biotech, mdx, lumen) into the lead's organisation:
DEMO_SEED_EMAIL=reg.lead@example.com node scripts/demo/launch-demo/seed.mjs --pack all --base-url http://127.0.0.1:5100 --plan enterprise
# (it rewrites docs/evidence/DEMO/*/manifest.json; those were restored, not committed)

# Then sign up the device persona in the browser, and run the walk:
node docs/evidence/HUMAN-TEST/J1/walk.cjs http://127.0.0.1:5100
```

The walk creates J1-WALK-IND, J1-WALK-510K and J1-WALK-DX through New project once, by name; later runs open them. The
sign-up limiter allows 5 sign-ups an hour per address, in memory, so a server restart clears it.
