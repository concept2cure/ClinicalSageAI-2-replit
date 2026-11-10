# Handoff: the Lumen demonstration data and the Lumen account (R1 session, 2026-11-06 to 11-10)

Session `session_01QoxbLdKp1MgbXvCfgSkkJr` (R1, then DATA at the founder's request) stops here. Everything below is on
`concept2cure-v2`. This note is for whoever picks it up: what exists, how to run it, what is open, and who to ask.

## What the founder asked (2026-11-06)

1. "Make sure everything has faux seeded demo examples with data, users, full story in data and use case examples
   built. RBM, QMS and more. Vault must have faux client data across it, and tasking too."
2. "Create an account for Lumen … use my email as the user and my name … a full account built out with use cases
   all across the board, specifically CSR report for their phase 2 study results … a biotech with multiple users …
   a user for Brian Finrow and Carl … and myself. And make sure when I launch my Codespace environment … all of
   that data and all those users … loads easily and simply."

Item 1 is done. Item 2 is half done: the seed can build the account, but the Codespace does not create it yet. See
"Open, in order".

## What exists (RULE 3), all through the product's own routes

The Lumen pack is `scripts/demo/launch-demo/packs/lumen.mjs`. It is idempotent: a second run finds everything except
the Vault filing below. It runs inside `--pack all`.

| Area | Module | What a person sees on LMN-201 |
|---|---|---|
| Tasks | `work-areas.mjs` `ensureTasks` (now takes `assignee`, `criticalPath` and `'completed'`), `lumen-content.mjs` `TASKS` | 16 tasks across To do, In progress, Blocked, In review and Done; "5 tasks stand between you and Database lock readiness checklist, and 1 task is overdue"; 3–5 tasks on each other project |
| People on tasks | `lumen.mjs` `castOf` / `castTasks` | The story's personas by name where the organisation has them; otherwise by role: author (who seeds), reviewer (`OQ_SIGNER_*`), approver (`OQ_APPROVER_*`) |
| Review | `lumen.mjs` `ensureIbReview` | The Investigator's Brochure out for review with the second person (needs `OQ_SIGNER_*`) |
| Communication and Respond | `lumen-content.mjs` `INFORMATION_REQUEST` | A FICTIONAL FDA information request: "1 agency communication needs a response", 3 questions |
| Submission Center | `lumen.mjs` `ensureLumenSequence` | Sequence 0000 on LMN-201, so the CSR's "Place into filing" has a sequence |
| Reporting | `lumen.mjs` `ensureLumenReports` | 4 computed reports run: executive digest, commitment register, IND safety readiness, eTMF completeness |
| Quality | `lumen-qms.mjs`, `lumen-qms-content.mjs` | 3 SOPs; 4 deviations; 4 CAPAs with 6 actions, linked to their sources; 5 suppliers; 3 nonconformances; 4 internal audits; a change control linked to its SOP, deviation and CAPA; 2 management reviews |
| Risk-based monitoring | `lumen-rbm.mjs`, `lumen-rbm-content.mjs` | RACT (approved with a second person), 8 KRIs over six monthly extracts, 3 QTLs, 6 signals, the plan and site-104 actions. Subject profiles now load: the 42P10 constraint was fixed in `e10d5e962` |
| Vault | `lumen-vault.mjs`, `lumen-vault-content.mjs` | 25 synthetic PDFs across the four projects, filed to CTD sections (Required documents counts them), reviewed, approved and sealed where the story says, with governed artifacts |
| A named organisation | `scripts/seed-admin.mjs` `ADMIN_ORG_NAME` | On this machine only, creates the organisation for `ADMIN_ORG_SLUG` if it does not exist |

Commits: `4fad016a5` (tasks, review, letter, sequence, reports), `dff867c6f` (Quality), `91d6a97da` (RBM), `893451f02`
(Vault, third person, owners by role), `98e664c40` (seed-admin).
Earlier: the demo-day UI sweep `f05919e54` (`docs/evidence/D2-CSR/2026-11-06-demo-day-ui-sweep/`).

## How to run it

Development organisation, as the Codespace does today:

```
npm run demo:seed -- --pack all --base-url http://127.0.0.1:5000 --email "$DEMO_SEED_EMAIL"
```

With no second or third person, every two-person step says "not executed" and nothing fails.

**A dedicated Lumen organisation.** This was tested on a local mirror; the Codespace does not do it yet.

1. Create the organisation and its three people. Run seed-admin.mjs three times as the database owner, with the same
   `ADMIN_ORG_SLUG=lumen-bioscience-demo` and `ADMIN_ORG_NAME="Lumen Bioscience (demo)"` each time. Names and
   addresses come from the environment, never from the repository.
2. Seed it as the author:

   ```
   OQ_SIGNER_EMAIL=<reviewer> OQ_SIGNER_PASSWORD=<pw> OQ_APPROVER_EMAIL=<approver> OQ_APPROVER_PASSWORD=<pw> \
     npm run demo:seed -- --pack lumen --base-url http://127.0.0.1:5000 --email <author>
   ```

   On the mirror this ran twice with exit 0. LMN-201 read back 16 uploads, 5 of 36 required sections, 3 governed
   artifacts and 1 seal. Tasks were split across the three people.

## Open, in order

1. **Wire the Lumen account into the Codespace.** This is what the founder asked for. `.devcontainer/**` is held by
   the Codespace session `01QoxbLaF…`. We agreed the following on 2026-11-06:
   - Identities come only from Codespaces secrets; no real person's name or address in the repository (the
     2026-10-15 rule).
   - The secrets are `C2C_FOUNDER_EMAIL` (required; skip the step with a log line if unset), `C2C_FOUNDER_NAME`,
     `C2C_LUMEN_REVIEWER_NAME` and `C2C_LUMEN_APPROVER_NAME`. Sign-in addresses are derived and non-deliverable
     (`…@lumen-demo.example`).
   - `post-create.sh`: a `c2c_seed_lumen_accounts` function through `seed-admin.mjs`, with the owner credential only
     inside `c2c_with_owner_env`, and its own done flag.
   - `post-start.sh`:
     - call that function when its flag is missing;
     - after the `--pack all` block, seed `--pack lumen` into the Lumen organisation as the founder, with
       `OQ_SIGNER_*` as the reviewer and `OQ_APPROVER_*` as the approver, and re-run it when `scripts/demo`
       changes, as the Codespace session already does for `--pack all`;
     - start the app with `VITE_DEV_LOGIN_EMAIL` set to the founder once the account exists, so "Demo access" lands
       in Lumen.
   - After the Lumen seed, call `c2c_set_idle_window "$C2C_FOUNDER_EMAIL" 120`, as the Codespace session asked
     (`fe3bdced`), so the founder's landing organisation keeps a session for 120 idle minutes.
   - The Codespace session has since released `.devcontainer/**`. Its next steps are in plan §3a, "L1 (rows D1/D2) —
     the founder's Codespace sets itself up".
   - Before pushing, run `npm run codespaces:doctor:test`.
2. **The Vault re-files on every run.** The second run counts `vault-filing: 21`. `ensureFiled` in `lumen-vault.mjs`
   trusts the ingest reply's `filing` on a re-upload. It should read the document's current filing before calling
   `POST …/file`. There is no data harm, only audit entries on each re-seed.
3. **QMS: SOPs stay draft and training stays empty.** That lasts until an administrator designates a QMS approver
   (`PUT /api/tenant-users/:org/:user/qms-approver`). It is an access grant, so it is left to the founder; the
   question is open with them. After it, a re-run routes and approves LMN-SOP-201/202 and assigns training. That path
   has not been run.
4. **biotech and mdx QMS with a signer.** `biotech-qms.mjs` `settleStatus` (and mdx's equivalent) approves a draft
   directly, and with `OQ_SIGNER_*` set the server answers 409 `QMS_INVALID_STATE`. It needs the author's
   `in_review` step first. Until that is fixed, the Codespace keeps the signer off `--pack all` (Codespace session's
   finding).
5. **RBM product defects still open** (handed over; not demo data):
   - Site risk and Site oversight read `site_intel.sites`, whose writer `server/api/site-intel/routes.ts` is mounted
     nowhere;
   - "New KRI" answers 500 (42P08, `CASE WHEN $11 IS NULL` in `server/routes/mdx-rbm.ts`).
6. **The CSR study's package identity** (asked by the lead `011Dpx…`). On "Xanomeline TTS Phase 2 (CDISCPILOT01)",
   Dispatch's inspection copy answers 409 `PACKAGE_IDENTITY_MISSING`. Record a fictional applicant identity through
   the product's routes: application number, sponsor record and FDA contact. Do it in the demo data, or in the
   Codespace's CSR preparation (`walk-prepare.cjs`, Codespace session).
7. **R1's remaining reach list.** `docs/evidence/DESIGN/R1/2026-11-01-inventory/` has 186 served-but-uncalled
   routes in no package. They need a reach-or-retire decision per route.

## Who to ask

- **Codespace setup** (`.devcontainer/**`, `scripts/ops/codespaces-*`): `session_01QoxbLaF89iYd7wC96owa7t`.
- **Design lead and CSR lane:** `session_011DpxUyQmE1enma4gTjcfBy`.
- **Coordination row:** `.design/claude-convergence/COORDINATION.md`. R1 and DATA hold nothing now.

## Data rules kept

- Nothing is real Lumen data.
- Every record carries the `[Demo · Lumen]` prefix or says FICTIONAL or SYNTHETIC.
- Letters say "NOT ISSUED BY FDA".
- Companies, sites and investigators are invented.
- No real person's identity is committed.
