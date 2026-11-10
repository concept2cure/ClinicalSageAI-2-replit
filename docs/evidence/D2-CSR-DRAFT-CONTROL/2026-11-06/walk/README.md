# Running-app walk of the CSR drafting lane's shipped screens, 2026-11-06

RULE 4: a screen is not done until it was opened in the running app and used. This lane shipped several pieces with
tests only:
- P-72 slices 1a and 1b (`ae12195a5`, `a06ae96c8`);
- CSR drafting slices 3–4 (`0f4bc4f2c`);
- folds F4 and F6 (`970bc3637`).

This walk opens each of them. The account's monthly spend limit stopped its first run after sign-in. The lead resumed
it alone the same evening, from the same database and scripts (second part, below).

## What already exists

- Five human-test lanes walked the product on 2026-11-06. Their records are `docs/evidence/HUMAN-TEST/README.md` and
  J1–J5:
  - J1 covers sign-in, Home, Projects, New project and the project page;
  - J3 covers the one editor;
  - J5 covers the rail's other destinations, Reporting included.
- None of them names the drafting panel's alternatives, revise or passage controls, the device section of Reporting,
  the Client Review Room on a device project's Review step, or the pre-auth lookups' new owner. Those are this walk's
  subject.
- This walk reuses J3's pattern: `walk-scripts/common.cjs.txt`, with Playwright and a sign-in through the emailed code.

## How it ran

- **Database.** A fresh `lanew` on the local PostgreSQL 16, built by the repository's own path: install-fresh,
  `deploy-migrate`, seed-admin and `demo:seed` (`provision.mjs` exit 0). `pgvector` 0.6.0 was installed first.
- **Server.** It ran as the runtime role `app_service`, with `RLS_ENFORCE=on`, `LAUNCH_SCOPE_ENFORCE=on`, no model key
  and dev sign-in off, so sign-in takes the emailed code. The command is `walk-scripts/start-server.sh.txt`, with the
  password redacted.
- **Credentials.** Personas are the seeded local accounts. Their passwords are read from the environment and are not
  committed.

## Walked: sign-in and the password-reset request (P-72 slice 1a), at 1440 and 390 px

`ae12195a5` removed the custom `SET` clause from `user_id_for_email`, `user_id_for_reset_token` and
`invitations_for_member`, re-owned them by the NOLOGIN role `c2c_platform_scope`, and gave each read policy that
role's arm. Sign-in and the reset request reach the first of these through `server/services/auth/pre-auth-account.ts`.

| Step | Seen | Server log |
|---|---|---|
| Sign in as the seeded owner | "Verify it's you", with the code sent to the masked address (`shots/a-1440-light-code-screen.png`) | The password check passed; a login code was issued (dev: logged, SMTP not configured) |
| Forgot password, same address | "Check your email" (`shots/a-1440-light-forgot.png`, `…-reset-sent.png`) | A reset link with a token was issued for that account |
| Sign in as a member of a second organization (`nadia.empty@harbor-lane.example`) | The same code screen (`shots/a-1440-light-nadia-code-screen.png`) | A login code was issued |
| A wrong password | "Incorrect email or password. If you were invited and have not set a password yet, open the link in your invitation or reset your password." (`shots/a-1440-light-wrong-password.png`) | Refused; no code issued |
| A wrong code | "Invalid or expired verification code. Each code works once; if you just used it, wait for the next." (`shots/a-1440-light-wrong-code.png`) | Refused |
| The same screens at 390 px | Sign-in, the code screen, forgot and reset sent fit the width, with nothing clipped (`shots/a-390-light-*.png`) | — |

Apart from the two deliberate refusals, no permission error, 4xx or 5xx was logged on these paths. So the re-owned lookups answer in the running app, as the
runtime role with RLS enforced, on a database the migration set built.

**One thing seen, for the shell's owner:** the sign-in pages rendered the light page under the dark colour scheme
too, byte-identical at 1440 px and a few bytes apart at 390 px. So the dark captures were dropped. Whether the sign-in
page should follow the system scheme is D1's to decide. It may simply not offer dark mode.

## Second part (the lead, 2026-11-06, evening): the drafting panel, the folds and the chain verdict

The same database and personas were used, with upstream merged to `e5a1536fa`. The server ran as `app_service`, with
RLS and the launch gate on and no model key (`/readyz`: `ana: down, no_provider`). Step logs:
`walk-panel-1440.json.txt`, `walk-panel-390.json.txt` and `walk-folds.json.txt`. Scripts: `walk-scripts/`.

| Screen | What the person sees | Verdict |
|---|---|---|
| The editor's ✻ AnA menu (`b-1440-ana-menu.png`) | "Draft with AnA", "Draft from sources" with its one-line note, and the Review asks | Works |
| "Draft from sources" on a device SOP section (`b-*-panel-ready.png`) | The panel opens inside the editor: tone, region, context, requirements, and "Draft section" with "Draft three alternatives" | Works, at 1440 and 390, with no horizontal overflow |
| "Draft section" with no model key (`b-*-draft-refused.png`) | "No AI provider is configured for this deployment, so this section cannot be drafted. This is a server setting, not your connection. Nothing was changed." No draft body appears, and nothing is faked | Honest refusal |
| "Draft three alternatives" with no model key (`b-*-alternatives-refused.png`) | The same single refusal, with no alternatives listed | Honest refusal |
| Reporting & analytics, organization with a device project (`c-1440-reporting.png`) | The reader first chooses the project the report is for. The device section counts the one device project the reader can open, gives a 24-month submission pace (0), and says "No AnA draft is recorded against a device project you can open, so there is no rate" | F4 works |
| Reporting, an organization with no projects (`c-1440-reporting-no-devices.png`) | "No project readiness yet", one sentence and one action | Honest empty state |
| `/concept2cure/device-analytics` | Lands on Reporting & analytics | F4's retired id resolves |
| Projects (`d-1440-projects.png`) | Calm cards, each with "Updated Nov 06" | F6's activity line works |
| `/concept2cure/device-workstream` | Lands on Projects | F6's retired id resolves |
| The device project's Review step (`d-1440-device-review-step.png`) | The Client Review Room, scoped to the project, with honest empty states for each group | F6 works |
| Decision lineage (`e-1440-decision-lineage.png`) | "Decision lineage: not in this release". `GET /api/decision-lineage/verify-chain` answers 403 `LAUNCH_SCOPE` | The P-72 1b verdict cannot be shown on screen in this release. It is proven at the route level (`a06ae96c8`) |

**Fixed here** (this lane's files, red first), then re-walked in the running app:

1. **Focus after a draft request.** After "Draft section" or "Draft three alternatives" ended, keyboard focus fell to the
   page, so a keyboard user lost their place. The control pressed now gets focus back, through the panel's existing
   `useFocusReturn`. Re-walked: focus is on "Draft section" after the refusal, at 1440 and 390.
2. **No internal id on screen.** The panel's title read "Draft **qms-purpose** from Data Room sources". A section is now
   named by its outline code ("2.3", "11.4.1") when it has one, or else by its title (`sectionShownName`). Re-walked:
   "Draft Purpose from Data Room sources".

**Found, for their owners** (recorded in COORDINATION.md):

1. **Drafting from sources is held on every section of the seeded biotech IND's Quality Overall Summary.** All 23
   sections of `[Demo · Biotech]` C2C-101's 2.3 read `draftingRegionState: unavailable`
   (`server/services/authoring/authoring-draft-region-projection.ts`, from `8013c9457`). So the panel says "The saved
   section reference could not be verified … its parent template cannot supply a receiving agency", with both draft
   buttons held (`b-1440-panel.png`). The device SOP reads `not-recorded` and drafts. The owner is the drafting-context
   work.
2. **`GET /api/authoring/sections/:id/sources` answers 503 `NATIVE_SOURCE_ACCESS_UNAVAILABLE`** ("Current Quality
   evidence could not be verified") on that QOS section, each time the editor opens it.
3. **At 1440, opening "Draft with AnA" with the Tasks drawer open squeezes the editor.** The conversation, the
   document rail, the editor and the drawer share the width, and the section title and text clip. This is the D4
   layout.
4. **At 390, the editor's bar wraps to four rows** (Freeze, E-sign, Place into filing, Re-file saved text) and covers
   the content beneath it, including the panel's refusal (`b-390-alternatives-refused.png`). This is D4 too: D4-3 moves
   these actions into an inspector.
5. **Trunk red: workbench suites since `53b179b99`.** It made `useScopedDocuments` refuse a project's document list
   unless it reads `success: true` and every row carries that project's `program_id`. The suites' fixtures answered the
   old shape, so the tree showed "Couldn't load documents" and no section title was found: 8 suites and 81 tests,
   identical with and without this lane's change. This lane fixed its own `workbenchDraftPassage`, and upstream
   `3d9879dfc` fixed the same suite, `workbenchFileToVault` and `workbenchProjectFiles`. Five remain red at the merge
   `6459c8b48`, 46 tests:
   - `authoringUnsavedWork`;
   - `workbenchA11ySweep`;
   - `workbenchAssignReview`;
   - `workbenchDocumentAccess`;
   - `workbenchRemedies`.

   They belong to the commit's owner.

## Still not walked

- Real drafting, and the CSR figure gate on a live draft. Both need a model key.
- Revise by instruction, and passage alternatives landing in the editor. Both need a draft first.
- Dark mode on the signed-in screens.
