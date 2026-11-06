# Human test J5 — the rail's other destinations (2026-11-06)

Session `01QoxbLcjX1N…`, started by `011Dpx…`. Plan: F1. Walked in the running app as four people — a project
manager, a QA lead, a CMC scientist and a clinical operations lead — at 1440×900 and 390×844, with Playwright, every
screenshot looked at. Shots are in `shots/`.

## What already exists (RULE 3)

Every destination walked here exists, and every fix below completes an existing file:

- **Tasks**: `client/src/concept2cure/v2/surfaces/TaskBoard.tsx` (board, My tasks, assignment, Advance).
- **Communication**: `surfaces/CommunicationCenter.tsx`, `AgencyInbox.tsx`, `AgencyResponseEditor.tsx`; the letter's
  questions are found by the deterministic splitter in `shared/agency/**`.
- **Quality**: `client/src/concept2cure/quality/` (`SopRegister.tsx`, `QmsRecords.tsx`, `qmsCapaRegister.tsx`,
  `app.css`); QMS approvers in `surfaces/AdminQmsApprover.tsx`.
- **CMC / Module 3**: `surfaces/CmcModule.tsx`, `CmcModule3Build.tsx`.
- **Risk-based monitoring**: `surfaces/Rbm.tsx`, `RbmSurfacesA.tsx`, `rbmWrites.tsx`; the deterministic seed and
  compute writes in `server/routes/mdx-rbm.ts` and `mdx-rbm-data.ts`.
- **Biostatistics**: `surfaces/Biostatistics.tsx`, `BiostatWorkbench.tsx`.
- **Reporting & analytics**: `surfaces/Insights.tsx` and its panels.
- **Settings**: the account menu in the shell; `AccountOnboardingSettings.tsx`, `OrganizationSwitcher.tsx`,
  `switchOrganization.ts`; Admin console, Subscription & features, Usage, Subscription & billing.

Nothing new was built. No screen, route, service, table or tool was added.

## Setup and test accounts

- Postgres 16 with pgvector on this machine. `node scripts/db/install-fresh.mjs` with `APP_SERVICE_DB_PASSWORD`
  set (it mints the runtime role `app_service`: NOSUPERUSER, NOBYPASSRLS), then `node scripts/db/deploy-migrate.mjs`.
  Both exit 0.
- Server on port 5200 as `app_service`, with `RLS_ENFORCE=on`, `LAUNCH_SCOPE_ENFORCE=on`, `NODE_ENV=development`,
  `ALLOW_DEV_AUTH=1` and `ALLOWED_ORIGINS=http://localhost:5200,http://127.0.0.1:5200`. **No model key**, so AnA's
  replies are refused by design; that is not counted as a defect.
- Accounts, from `scripts/seed-admin.mjs` (`ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD`), all in the organisation
  "Concept2Cure Therapeutics", all with the password `J5-test-pass!`, all signed in through the real sign-in page:

  | Person | Email | Plays |
  |---|---|---|
  | Priya Manager (PM) | `pm@j5.test` | project manager, author, administrator |
  | Quinn Lead (QA) | `qa@j5.test` | QA lead, QMS approver, signer |
  | Carl Scientist (CMC) | `cmc@j5.test` | CMC scientist |
  | Olivia Ops (Clinical ops) | `clinops@j5.test` | clinical operations lead |

- Demo data: `DEMO_SEED_EMAIL=pm@j5.test npm run demo:seed -- --pack biotech --plan enterprise`. This is the biotech
  pack, with its work-areas content (tasks, CMC specifications, stability and batches, the FDA information request,
  the study design and four SOPs). 199 records were created, and the audit chain is intact (`meta.chain.ok=true`).
- `fonts-noto-core` and `fonts-noto-cjk` are installed, so the reporting PDFs render.
- **One setup step a tester must take first.** The seeded accounts are administrators, not Approvers, so nobody can
  approve a controlled document until an administrator names a QMS approver. Do it in **Admin → Members → (the
  person) → Designate as QMS approver**, with a reason. That is the product's rule, not a defect.

## What a tester can do now, step by step (each verified in the running app)

### Settings (PM)
1. Open the account menu (your name, bottom left). It shows Account, What AnA remembers, Admin, Subscription &
   features, Access requests, Usage & limits, Subscription & billing and Set up a workspace.
2. **Account** shows your profile and invitations, and lists your organisations ("Concept2Cure Therapeutics
   (current)") with Switch organisation. This was broken until J5-02 (`shots/account-0.png`).
3. **Admin** lists the four members, with role, MFA and last seen. Open a member to designate them as a QMS
   approver, with a reason (`shots/a2-designated.png`).
4. **Subscription & features** shows Enterprise — biotech, 1 of 50 projects and 4 of 25 seats.
   **Subscription & billing** says plainly that billing is not set up (there is no Stripe customer).

### Tasks (PM, then clinical ops)
1. Tasks shows every task across your projects on a board (To do, In progress, Blocked, In review, Done), plus
   Critical path, Analytics and Table views.
2. **My tasks** narrows the board to your own work. It includes "Periodic review: C2C-SOP-001 v1.0", which Quality
   created when the SOP became effective (`shots/t1-my-tasks.png`).
3. Open a task. Its drawer shows the project, the assignee, who assigned it, the due date and where it came from.
4. **Change assignee**: choose a colleague, give a reason, then Save assignment. The drawer then shows "Assigned by
   Priya Manager (PM)", and the change is audited.
5. As the new assignee, use **Advance** to move the task to Done, at 100% progress (`shots/t3-task-advanced.png`).

### Communication (PM writes, QA approves)
1. Open C2C-101 from Projects, then Communication. The inbox shows the FDA information request: "Response required",
   urgency high, with "What the FDA is waiting on from you" above it (`shots/c1-communication.png`).
2. **Questions & responses** lists 3 numbered questions, "found in its text without AI". Use **Record** on
   question 1: it is pre-filled with the number and the verbatim text. Pick the discipline, give a reason, and
   record it.
3. **Write response**, then **Open response in editor**, gives a reason and creates a working copy. **Open working
   copy** (scroll down in the drawer) opens the one editor on "Response to 1". Type the answer, give a reason for
   the change, and press **Save** (`shots/c10-editor-saved.png`).
4. Back in Communication, use **Write response**, then **Refresh saved response**. The saved text is shown. Give a
   reason and choose **Use saved editor response**. The question now reads Draft.
5. As Quinn, **Approve response** opens the Part 11 signing dialog. Give a reason and your password, then **Sign
   and commit**. The receipt shows the signer, meaning, reason, time and hash. After a reload the register shows
   "1 approved" (`shots/c11-approve.png`).
6. **Meetings & commitments** shows the honest empty registers for health-authority meetings and PMR/PMC/REMS
   commitments, each with its Record button.

### Quality (PM authors, QA approves)
1. Quality opens on the SOP register: four SOPs in Draft, the KPIs, and the 9-type library.
2. As the PM, use **Send for review** on C2C-SOP-001. Name Quinn as QMS approver, set a due date, give a reason,
   and send. The row now reads "Under review — Waiting for Quinn Lead (QA)" (`shots/q4-route-sent.png`).
3. As Quinn, **Approve** opens the signing dialog ("The author cannot approve their own document"). Sign with a
   reason and your password. The SOP is Effective, "Approved by Quinn Lead (QA) … Meaning: Approval", with its next
   review a year out. A periodic-review task appears in Tasks (`shots/q6-after-sign.png`).
4. **Training** on an effective SOP: assign a job role or a person. Coverage counts acknowledgements of the version
   in force.
5. **Deviations → Record deviation**: give the number, date, what happened, the description, the type, the class and
   the category. DEV-2026-001 is recorded as Open (`shots/q9-deviation-recorded.png`).
6. **Raise CAPA**. With no project open, the form now says so before you fill it (J5-04,
   `shots/q10-capa-no-project.png`). With C2C-101 open, **Raise CAPA** on the deviation is pre-filled from it.
   CAPA-2026-0001 is raised, with its source "Deviation DEV-2026-001" (`shots/q10-capa-raised.png`).

### Risk-based monitoring (clinical ops writes, QA signs)
1. Open C2C-101, then Risk-based monitoring. The project has not started monitoring, and the screen offers **Start
   risk-based monitoring**, which records the ICH E6(R3) default RACT (J5-03, `shots/r1-rbm-not-started.png`).
2. The board then shows the engine's overall risk (High, from L × I banding), 8 CtQ factors with 5 critical, and
   what needs attention now (`shots/r1-rbm-started.png`).
3. **Key risk indicators → Seed the standard KRI library** gives 8 KRIs, each "not evaluated" until it has a
   reading. **Quality tolerance limits → Seed the default QTLs** gives 4 QTLs (`shots/r3-kris-seeded.png`).
4. **Monitoring plan → Generate from RACT** is refused until the RACT is signed: "approve the assessment first".
5. As Quinn, go to **Risk assessment (RACT) → Approve assessment** and sign. The RACT becomes active.
6. As Olivia, **Generate from RACT**. The plan is Hybrid, with 5 actions from the critical CtQ factors.
7. As Quinn, **Approve plan** and sign. The plan is active, "Approved by Quinn Lead (QA)" (`shots/r4-plan-approved.png`).

### Biostatistics (clinical ops)
1. With C2C-101 open, Biostatistics shows a worked example and the project's study design, C2C-101-201. Choose the
   design: the engine sizes it, "72 subjects · 90% power", two-proportion z-test, with the formula and inputs
   (`shots/b1-own-design.png`).
2. **Design calculators** lists 29 deterministic engines. For example, Assurance with δ 0.4, SD 0.15 and n 100 per
   arm gives assurance 0.724 and power at the prior mean 0.807, stamped "c2c-stats 1.0.0 · reproducible"
   (`shots/b2-assurance.png`).

### CMC / Module 3 (CMC scientist)
1. With C2C-101 open, **Study records** lists 5 specifications (Draft, each with Approve), 2 stability studies with
   their results and Q1E estimate, and 3 batches with yields, one deviation and Release (`shots/m2-Specifications.png`).
2. **Module 3 build** refuses this project by name: it records a biologic, and Module 3 is composed here only for a
   small-molecule drug (decision P-28). The refusal is honest, and it is the designed boundary
   (`shots/m2-module3-build.png`).

### Reporting & analytics (PM)
1. With C2C-101 open, Reporting says the project scores 0% on submission readiness, with 4 critical gaps. It offers
   the Nonclinical & CMC readiness pack.
2. **Build the Nonclinical & CMC readiness**, then **Run report**, runs the Nonclinical Study & SEND Status Summary
   against the governed record. Its status is partial, with "No nonclinical_studies records for this organization"
   named as the blocker (`shots/p3-report-result.png`).
3. **Export PDF** downloads `Nonclinical_Study_SEND_Status_Summary_run2.pdf` (24 KB). It names the run id, the
   scope, the status, when it was computed and who ran it.

## Defects found

| # | Step | Expected | Actual | Fix |
|---|---|---|---|---|
| J5-01 | Open `/concept2cure/settings`, or any address that names no screen | Home, or an honest "not found" | A developer scaffold under the heading Home: "Mounted routes", "Install path · kit → live", "Ports in the surface phase" (`shots/j5-01-before-unknown-address.png`) | **Fixed** `06bd659e`: such an address opens Home. Red-then-green in `projectDestinationShell.test.tsx`. |
| J5-02 | Account menu → Account | Your organisations listed | "Your organisations could not be read. Your session has changed. Reload this page", on every open. The read answered 200, but the client compared the account by object identity, and Account's own `/session` re-read replaces the user object | **Fixed** `768c55df` (`switchOrganization.ts`): the account is compared by id and organisation, under the same bearer. A real switch or sign-out is still caught. Red-then-green in `switchOrganization.test.ts`. Re-checked twice in the app. |
| J5-03 | Clinical ops opens RBM with C2C-101 open | A way to start monitoring | "No monitoring projects yet. Select risk-based monitoring when setting up a project": a dead end, because the flag is set only by New project. Every seed button ("Seed risk assessment", "Seed KRIs"…) asked AnA, which refuses with no model, though the deterministic writes existed | **Fixed** `3429a2d7`: "Start risk-based monitoring" runs the RACT seed for the open project, with the server's project check. The seed buttons run their engine writes. KRIs and QTLs offer the library seed while empty. Red-then-green in `rbmProjectContext.test.tsx` and `rbmSurfaceWrites.test.tsx`. Walked through to a signed plan. |
| J5-04 | QA lead, no project open, Quality → CAPA → Raise CAPA | Told before filling the form that a CAPA needs a project | The form said "Raised in the project you have open". After every field was filled, it refused: "open a project first" | **Fixed** `3835d4c8` (`qmsCapaRegister.tsx`): the form says "No project is open…" at the top, or names the project ("Raised in C2C-101, the project you have open"). Red-then-green in `QmsRecords.test.tsx`. Checked in the app. |
| J5-08 | RBM at 390 px | The project picker fits | The picker ran off the right edge (right edge at 487 px) | **Fixed** (`rbm-v2.css`, below 800 px): the picker is full width. Measured in the app: the page and picker are within 390 (`shots/w390-rbm.png`). |
| J5-10 | Quality at 390 px | The header reads normally | The description was squeezed to one word a line, "New controlled document" was cut off, and the library heading was squeezed the same way (`shots/w390-quality-before.png`) | **Fixed** (`quality/app.css`, below 640 px): the actions and the library meta wrap under their headings. This covers every Quality register (`shots/w390-quality-sop.png`, `w390-quality-library.png`). No text block under 60 px remains. |
| J5-09 (J2's D9) | Tasks at 390 px | Title, then the actions | A blank gap of about 250 px under the description (`shots/w390-tasks.png` before the fix). `app-v2.css` stacks `.tb .ph` as a column below 760 px, so the shared `> :first-child { flex: 1 1 420px }` became a 420 px height. The project filter also ran off the right edge (456 px) | **Fixed** (`styles/app-v2.css`, below 760 px, one small CSS-only commit, handed to J5 by the lead `011Dpx…` because the coordinating holder could not be reached). The header child takes its own height, and the filter fits. Measured in the app: no gap, page and filter within 390 (`shots/w390-tasks.png`). |
| J5-15 (J2's D4) | A reviewer opens a review-route task from Tasks (a Vault "Review: ADSL…" or a QMS "Approve: C2C-SOP-002…") | A way to the version, to read and sign it | The drawer offered only Advance and Archive. The server rightly refuses Advance on a route task (409, `ROUTE_TASK_OWNED_BY_ROUTE`), so the reviewer was stuck | **Fixed**. The board read (`server/routes/taskBoard.routes.ts`) now carries `reviewRoute` for each route task. That is the version a Vault route is on, resolved in one organisation-scoped lookup the way a task notice resolves it (`canonicalDocumentTarget`), or the controlled document of a QMS route. The drawer (`TaskBoard.tsx`) says the route completes the task, and offers "Open the version in the Vault" or "Open the controlled document" through the one record-opening path a notice uses, once the drawer has closed. It offers no Advance or Move back on such a task, on the card or in the drawer. Red-then-green in `server/routes/__tests__/taskBoard-review-route.test.ts` and `client/…/__tests__/taskBoardRouteTask.test.tsx`; all 173 Tasks client tests pass. In the app, as Quinn, the "Approve: C2C-SOP-002" task opened SOP-002, In review, in Quality (`shots/d4-route-task-drawer.png`, `d4-opened-document.png`). The Vault branch is covered by the two tests and uses the same opening path as a Vault notice, but no Vault route was created in this walk. |
| J5-05 | Communication → Write response → Open response in editor | Plain language, and the next step in view | The drawer shows the raw project UUID ("Target project: 46e5c864-…"), "Snapshot fingerprint", section codes `agency.context` and `agency.response`, and "Response to 1" rather than "Response to question 1". **Open working copy** sits below the fold after Create working copy, so the drawer looks finished with only Close showing (`shots/c6-editor.png`) | **→ RIM** (S10, Communication). `editor/SourceImportDialog.tsx` is shared with the editor (J3). |
| J5-07 | Communication, after **Use saved editor response** | A confirmation | Two warnings appear at once: "The registered response changed. For another amendment, preview…" and "The registered response changed. Refresh the saved response before saving". They describe the save the person just made, so it reads like a conflict | **→ RIM** (`AgencyResponseEditor.tsx`, `useAgencyResponseEditor.ts`). |
| J5-11 | Communication, a recorded question | The question as one paragraph | Its text keeps the letter's line break and indent ("26-week ⏎ cynomolgus") | **→ RIM** (S10 G3, the splitter's verbatim contract, held). |
| J5-06 | Tasks: open "Periodic review: C2C-SOP-001 v1.0" | "Came from: Quality" (the SOP's approval) | "Came from: Tasks created on this board", and the source chip counts it as a board task | **→ RIM** (S9, Tasks behaviour). |
| J5-12 | Biostatistics → Design calculators → Assess defensibility with Effect size blank | The field named as the person reads it | The toast says "Missing or invalid: effectSize", using the API's field token, and the toast fades | Remains. Low. `BiostatWorkbench.tsx` could map `data.errors[].field` to its label. |
| J5-13 | CMC as the CMC scientist on the biotech demo | Module 3 build shown | The build is refused, because C2C-101 is a monoclonal antibody (a biologic, P-28), so the demo cannot show the build | **→ the CMC session / the demo pack**: a small-molecule demo project would show it. The refusal itself is correct. |
| J5-14 | Quality library on a biotech organisation | Biotech wording | The "Quality manual" card says "… meets ISO 13485 and 21 CFR 820", which is device wording | Remains. Low, copy. |

Commits after `3835d4c8` are listed in the session's last push. The two CSS fixes are commits `J5-08`/`J5-10` on
trunk; search `git log --grep J5-08`.

## Known limits

- **No model key.** "Draft response with AnA", "Ask AnA", the RBM AnA starters and the narration are refused, as
  designed. Every deterministic action walked above works without a model.
- **Site risk**, central monitoring and patient profiles need site and subject data, and the demo pack seeds none.
  Their screens say so honestly ("never scored", "No source feeds are tracked").
- **MFA** was not exercised; the accounts use an emailed second factor that is never challenged on this local server.
  Signing is password-verified server-side.
- **Signers.** Every signing above used a second person: the author never approved their own document, and the
  product refuses that ("The author cannot approve their own document").
- **Not walked:** Log communication (a new letter by upload), a health-authority meeting and a commitment record,
  change control, nonconformances, suppliers, audits and management reviews, report schedules and bundles, and
  inviting a new member. Each screen was opened and showed its honest empty register, but none was driven
  end to end.
- **The server ran in development mode** (`NODE_ENV=development`, for dev sign-in to seed data). The testers'
  deployed environment runs production mode.
