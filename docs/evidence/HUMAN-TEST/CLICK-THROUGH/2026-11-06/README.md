# Click-through of the Codespace UI: every control on every screen (2026-11-06)

The founder, 2026-11-06: "make sure that everything in the user interface, when it does load in the code space today,
works. If I click on something, it needs to do what I anticipate it to do. I don't want to see something trying to
load that doesn't load, any errors."

Lead session `session_011DpxUyQmE1enma4gTjcfBy`. This goes past the demo-day sweep
(`docs/evidence/D2-CSR/2026-11-06-demo-day-ui-sweep/`), which opened 74 screens as each demo person. This run clicked
every control on them, so the founder meets what this run met first. The click-through is **not finished**: see "Coverage"
and "To pick up".

## What already exists (RULE 3)

Nothing was built for this, apart from the two scripts beside this file.
- The data is what the founder's Codespace builds, made by its own scripts here:
  `.devcontainer/post-create.sh` (`c2c_write_state`, `c2c_ensure_database`, `c2c_provision`, `c2c_seed_accounts`),
  then `.devcontainer/post-start.sh`. That gives every demo pack, the three demo people and the prepared CDISC CSR
  study.
- The app was driven through its own screens, signed in through `POST /api/auth/dev-login` as Ana Author, the identity
  a Codespace signs in as.
- `clickcrawl.cjs` and `crawlsum.cjs` (this folder) are Playwright scripts. The 2026-11-06 container was replaced
  before they could be committed, so these are rebuilt from the session's record, with every fix the runs needed.

## How to rerun it

1. **The Codespace's data in a sandbox.**
   - Run `source .devcontainer/post-create.sh` and call its four functions above. Set:
     - `C2C_CODESPACE_STATE` to a scratch folder;
     - `C2C_DB_NAME=c2c_cs`;
     - `PGHOST` to your PostgreSQL socket.
   - Run a copy of `post-start.sh` with `PORT=5300`, and make two changes in the copy:
     - its line 14 sources the real `post-create.sh` path;
     - its `c2c_start_postgres || …` line becomes `true` when the container already runs PostgreSQL. A Codespace
       does not need either change.
   - Put the CDISC pilot files in `$C2C_CODESPACE_STATE/cdisc-pilot/`, or let `scripts/cre/fetch-cdisc-pilot-adam.mjs`
     fetch them. **Never copy a `csr-demo-state.json` from another database into it.** The CSR preparation reads it as
     its own progress and skips its steps.
2. **Up to three runs in parallel, one per area,** as the same person. A fourth sign-in as that person, and any check
   you run beside them, must sign out (`POST /api/auth/logout`); an account holds five sessions.

   ```
   FULL_PROGRAMS=<csr>,<lmn201>,<c2c101>,<mdx> ALLOW='^/concept2cure/(projects|project-home|document-authoring|protocol-dev|conversation-thread|project-)' \
     node clickcrawl.cjs http://127.0.0.1:5300 ana.author@concept2cure.pro out/A seeds-A.json
   FULL_PROGRAMS=<csr>,<lmn201> ALLOW='^/concept2cure/(communication-center|vault|submission-center|tasks)' \
     node clickcrawl.cjs http://127.0.0.1:5300 ana.author@concept2cure.pro out/B seeds-B.json
   FULL_PROGRAMS=<csr>,<lmn201> ALLOW='^/concept2cure($|\?|/(cmc|rbm|quality|insights|admin-console|features|access-requests|usage|licensing|onboarding|biostatistics))' \
     DISCOVER=1 node clickcrawl.cjs http://127.0.0.1:5300 ana.author@concept2cure.pro out/C seeds-C.json
   node crawlsum.cjs out/A out/B out/C
   ```

   A seeds file is a JSON list of `{ "url": "/concept2cure/vault?program=<uuid>" }`. Seed each area's screens for each
   full project. The rail's addresses with a project open are `communication-center`, `vault`, `submission-center`,
   `tasks`, `cmc`, `biostatistics`, `rbm`, `quality` and `insights`.
3. **Memory.** The pre-push typecheck needs about 11.5 GB. On a 15 GB container, stop the runs and the app before
   pushing (two pushes failed out of memory on 2026-11-06).

## What it found, and what became of each

| # | Found | Outcome |
|---|---|---|
| 1 | Admin → Subscription & billing → **Manage billing**: a red "Billing portal unavailable · Failed to create portal session" beside the page's own "Billing is not set up" | **Fixed**, `1f97ae5495` and `3a473d045e`. The status read says whether a billing record exists. With none, the button is unavailable and its note says "Billing is set up the first time a subscription is checked out." The portal answers 409 (no billing record) or 503 (no payment provider) in words. Walked in the app. |
| 2 | Rail → **Vault** with no project open landed on Projects | **Fixed by the founder's decision** (`5144702d21`, `adb1c00cba`). Vault is global on the rail and lists the projects' Vaults when none is open; the editor's "Project files" is "Vault"; Biostatistics joined the rail. Walked in the app. |
| 3 | A session ends after **15 minutes without a click** (`shared/auth/session-policy.ts`), so a founder talking to a client is asked to sign in again | **Open.** An administrator can raise it in Admin → Settings → Session policy. The Codespace session (`01QoxbLaF…`, holds `.devcontainer`) agreed to set the development organisation's `security.sessionTimeoutMinutes` to 120 in post-start. Not landed at 2026-11-08. |
| 4 | CSR study → Submission Center → Dispatch → **Download an inspection copy**: 409 PACKAGE_IDENTITY_MISSING, a long red refusal (no IND number, sponsor record, D-U-N-S or FDA contact recorded) | The gate is right. **Open** for demo data: sent to R1's DATA work (`01QoxbLdKp…`) to record the study's identity, clearly fictional, through the product's routes. Not landed at 2026-11-08. |
| 5 | Rail → **Biostatistics** from the 510(k) device project: `POST /api/ana-biostats/compute` 422 (the diagnostic preset has no margin, and none is assumed) | Not visible: the screen shows the worked example and its result. Console only. **Open, low.** |
| 6 | Opening another client's project by its address: the first two `GET …/intelligence` carry the previous client's `x-client-id` and answer 409 PROJECT_WORKSPACE_MISMATCH | Not visible: the reads that follow carry the right client and answer 200. Console only. **Open, low.** |
| 7 | Admin → Roles + scopes: 403 on `/api/admin/access/grants` | **Correct.** The screen says "Platform access is restricted"; it is the platform-administrator check. |
| 8 | CMC → Quality by design on the CSR study: 409 CMC_MODALITY_NOT_ESTABLISHED | **Correct.** The tab says the project records no drug substance and to record it in the CMC registers. |
| 9 | AnA's composer and starters, Submission Center → Shadow review: 503 | **Correct without a key.** Each says no AI provider is configured. With the founder's keys they run. |
| 10 | RBM → Monitoring plan → **Generate from RACT** on the CSR study: 409 on `POST /api/mdx/rbm-monitoring-plans/generate` | **Not yet checked.** Found as the container was replaced. Read the 409's message and what the screen shows. |
| — | Task board "Move back" / "Advance" timed out; 429s; 401s; "not found after reopen" | **The runs' own.** A disabled "Move back" in the first column; three browsers at one person's 600-a-minute ceiling; the five-session limit; screens remembering UI state. The scripts now handle each. |

## Coverage

Three runs on 2026-11-06 reached about 1,200 clicks over 41 stops each time. A share of the clicks could not find
their control again after the reload, so those clicks never ran:
- first run: 655 of 1,327;
- after returning each project step: 522 of 1,220;
- the remaining cause, screens remembering UI state, was fixed in the script before the third run.

The third run, with every fix above, was cut short when the container was replaced. **Its results were lost. No run
has yet covered every control.**

## To pick up

1. Rebuild the Codespace data (step 1) and run the three areas (step 2) to the end. Then fix each finding the way 1
   and 2 were fixed: test first, then walk it in the app.
2. Item 10 above.
3. Items 3 and 4 belong to the sessions named; check they landed before the founder's demo.
4. Repeat as Rhea Reviewer and Ava Approver. Their refusals differ by role, and each must read as a reason, never as
   an error.
