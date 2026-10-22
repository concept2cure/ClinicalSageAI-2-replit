# Human testing — known issues at head and launch-catalog journeys

**For:** everyone running human tests of the launch catalog from 2026-10-13.
**Head:** `concept2cure-v2` at `94b4f9238`. **Source:** the cold market-readiness
evaluation, every finding re-verified at this head —
[`docs/work-orders/MR-00-market-readiness-roadmap.md`](../work-orders/MR-00-market-readiness-roadmap.md).

This page does not replace the existing testing documents. Use them as they are:

| Need | Use |
|---|---|
| Set up a database, seed it, run the app | [`docs/LOCAL_TESTING.md`](../LOCAL_TESTING.md) §1–3. For the database, `npm run db:provision` (owner + app-role URLs, see `scripts/db/provision.mjs`) is the one-command path this evaluation ran from empty in 24 s; the guide's `install-fresh` + `apply-c2c-migrations` steps also work. Seed with `scripts/seed-admin.mjs` + `scripts/seed-local-testing.ts`, or `npm run db:seed` for the IND eCTD demo workspace |
| Personas, scope, cadence | [`HUMAN_BETA_PROGRAM_V1.md`](HUMAN_BETA_PROGRAM_V1.md) |
| Failure logging format, severity rubric, stop-test conditions | [`HUMAN_BETA_CHECKLIST_V1.md`](HUMAN_BETA_CHECKLIST_V1.md) |
| Go / no-go sign-off | [`docs/qa/ga-human-user-testing-checklist.md`](../qa/ga-human-user-testing-checklist.md) |

What this page adds: the issues a tester **will** hit at this head, so they are
not logged as new, the workaround where one exists, and the work order that
fixes each; and one journey per launch app with what "working" looks like.

## Before you start

- **Test the seven launch apps only:** Projects, Vault, Authoring, Submission
  Center (including its Validation and Dispatch tabs, which replaced Submission
  Readiness on 2026-10-17, and the IND forms screen), QMS controlled documents,
  CMC / Module 3 and Reporting & analytics — plus AnA as it serves them. Anything that says "This app is built but is not part of the current
  release" is out of scope. Do not log it, unless a launch-app button sent you
  there — that is a navigation defect (MR-15) and should be logged.
- **AnA needs a model key.** Without `ANTHROPIC_API_KEY` the composer, threads
  and uploads work but AnA does not answer (`503 GATEWAY_UNAVAILABLE`). That is
  expected, not a defect.
- **Use invited accounts, not public sign-up.** See the sign-up issue below.
- **Do not use real customer or patient data.** The repository is public and
  several data-protection controls listed below are open.
- **Log against the work order.** When an issue matches a row below, add a +1
  with your environment and timestamp to that row's work order instead of a new
  report. When it does not, log it with the checklist's format and name the
  launch app.

## A fresh test environment — the recipe, verified at `aa4ee1e29`

Every step below was run on 2026-10-18 at `concept2cure-v2` `aa4ee1e29` on an
empty PostgreSQL 16 database with pgvector; timings are from that run
([evidence](../evidence/reviews/2026-10-13-market-readiness/smoke-at-head.md)).
That run needed one extra step, a `deploy-migrate` after seeding, because the
seeded organisation had no workspace (HT-01). `969d1e727` fixed that the same
day, and the steps below without it were re-run from empty at `d0cde23b9` plus
the fix, through program creation
([evidence](../evidence/W1/2026-10-18-seeded-workspace/)).
**Use `969d1e727` or later.** At `94b4f9238` (13 Oct) a fresh database cannot be
provisioned at all; between `2ef129e54` and `969d1e727` it can, but creating a
program needs the extra `deploy-migrate`.

```bash
git fetch origin && git checkout concept2cure-v2 && git merge --ff-only origin/concept2cure-v2
git rev-parse --short HEAD          # record this SHA on every defect report
npm ci

# 1. Database from empty — 36 s, 408/408 migrations (needs pgvector on the server)
createdb c2c_test
export DATABASE_OWNER_URL=postgres://postgres:<pw>@127.0.0.1:5432/c2c_test
export APP_SERVICE_DB_PASSWORD=<choose one>
export APP_DATABASE_URL=postgres://app_service:$APP_SERVICE_DB_PASSWORD@127.0.0.1:5432/c2c_test
npm run db:provision

# 2. A sign-in account, its organisation and the organisation's workspace
DATABASE_URL=$DATABASE_OWNER_URL ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='<pick one>' \
  node scripts/seed-admin.mjs

# 3. Optional sample program (BX-301 Oncology IND) and two conversations
DATABASE_URL=$DATABASE_OWNER_URL npx tsx scripts/seed-local-testing.ts

# 4. Run it — /healthz answers within a minute
DATABASE_URL=$APP_DATABASE_URL RLS_ENFORCE=on NODE_ENV=development PORT=5000 LOG_LEVEL=debug \
  JWT_SECRET=$(openssl rand -hex 32) ANTHROPIC_API_KEY=<optional> npx tsx server/index.ts
```

Sign in at `http://localhost:5000`. If a second factor is asked for, it is an
emailed code; with no SMTP configured in development the server prints it to its
own log as `[email-service] Dev OTP code`, at debug level. Keep `LOG_LEVEL=debug`
on the command line: `.env.example` sets `LOG_LEVEL=info`, which hides that line
and leaves you waiting on the code screen (GTM-05). (At `aa4ee1e29` the seeded account was
asked for one; at `d0cde23b9` it was not.) `/readyz` reports every dependency `ok` except
`ana`, which stays `down` until `ANTHROPIC_API_KEY` is set.

What was proven on that run: provisioning, boot, sign-in with the second
factor, creating an IND program, uploading a PDF to its Vault (text extracted,
CTD placement proposed as 3.2.P.8), and creating a 3.2.P document from its
template. Exporting a draft is refused by design until it is approved or frozen.

**The compose stacks scan uploads from `fb95b9680` on.** `docker-compose.beta.yml`
and `docker-compose.yml` run in production mode. Before that commit they had no
virus scanner, so every upload was refused (CAT1-01, SEC-01). Each now runs the
same pinned clamd as production. The first `docker compose up` waits up to five
minutes while clamd loads its signatures, and the host needs about 8 GB of RAM.
The recipe above runs in development mode, which skips the scan and logs a
warning; that is the intended local behaviour.

## Unblocked since 13 October — exercise these, and log any regression

These stopped a journey on or after 13 October. On 2026-10-18 they no longer do: fixed, or fixed far enough that the journey completes. Run them first; a failure here is a regression, not a known issue.

| Finding, as found on 13 October | Now | Fixed by | How to exercise it |
|---|---|---|---|
| CAT1-01 — AWS production task now runs a clamd sidecar, so Vault uploads are scanned there; the compose stacks (including the 'Human Testing & QA' beta stack) have no scanner and refuse every upload, and /readyz does not check AV | partially fixed | fb95b9680 | Fixed after the re-check by fb95b9680 (MR-08 Stage 1), for the compose stacks: docker-compose.yml and docker-compose.beta.yml now run the Terraform-pinned clamd, and the app waits for it. Use fb95b9680 or later. The first `docker compose up` waits up to 5 minutes while clamd loads its signature database, and the host needs about 8 GB of RAM for app plus scanner. On Apple silicon the scanner runs under emulation and starts more slowly. Expected: an EICAR test file is refused (400 FILE_SCAN_REJECTED) and a clean PDF is filed (201). Not yet observed on a running compose stack: the app image could not be built where the fix was made. So if uploads on the compose stack still return 503 FILE_SCAN_UNAVAILABLE, report it with the SHA and `docker compose logs clamav`. Under the documented local setup (NODE_ENV=development), the scan is still skipped with a warning. `npm start` (NODE_ENV=production) now refuses to boot without a scanner; docs/LOCAL_TESTING.md shows how to run one. |
| CAT2-21 — Read-and-understood training: the any-user /api/qms write is gone; acknowledgments are still version-blind, accepted on non-effective documents, unassigned, unsigned, and have no UI | partially fixed | f6e9ff399, a80d2fa65, fa39bd5d8, e1f3fd425 | The read-and-understood journey completes in the UI only if document access is granted before approval. You need three accounts. seed-admin creates only the admin. Use Admin and access to add an editor (member or manager) and a reader (viewer). With no SMTP configured, the admin is shown a setup link to hand over. Steps: (0) Make sure a program exists in Projects. 'New controlled document' requires one. (1) As the editor, go to Quality and use 'New controlled document' (SOP, WI or policy). Choose the program, give a reason, then click 'Create and open'. Type real text into the sections in the document workbench and save. 'Edit controlled text' does not appear on these documents; it applies only to legacy unbound register rows. (2) Before review, open 'Access' in the workbench and grant the reader the Viewer document role, with a reason. If the approver is not an org admin, also grant them Approver. Once a revision is approved, its access is sealed and nobody can add grants, not even an admin. (3) Back in the register, click 'Send for review' and give a reason. (4) As an org admin who is not the author, or as an approver- or reviewer-role user holding the Approver grant, click Approve and sign with your password. On the docker-compose production stacks, the signer must first enrol an authenticator in Account and enter its code. (5) As the reader, click 'Read and acknowledge' on the register row or 'My acknowledgement' on the coverage row. Read the text, tick 'I have read and understood this released revision.' and click 'Acknowledge this revision'. The receipt shows, and coverage moves for that exact version only. Known issues: - A member or viewer with no grant on the document gets 'You do not have permission to read this authored document' and cannot acknowledge. Coverage still counts them in 'N of the active organization roster'. - Revise creates a new authored copy that only the reviser can access. Re-grant readers before approving v2. Acknowledgements of v1 stop counting once v2 is approved. - The act is a personal attestation, not an e-signature. - Asking AnA to record training returns a redirect to this reader. |
| UX-01 — Email-verification link still lands behind the protected shell; self-serve signup cannot complete on any non-dev deployment | fixed | e1f3fd425 | Fixed at 8ca7e74ca. You need a stack that requires verification and can send mail. - Compose: docker-compose.yml or docker-compose.beta.yml. APP_URL must be an https address that your TLS proxy actually serves, and ALLOWED_ORIGINS must include it. A plain-http APP_URL boots, but sign-up answers "Sign-up is not available right now." - Local: NODE_ENV=development without ALLOW_DEV_AUTH=1, and SMTP_HOST, SMTP_USER and SMTP_PASS all set (SMTP_PORT defaults to 465 with implicit TLS). Without SMTP, the docs/LOCAL_TESTING.md recipe gives the same 503 at sign-up. Steps: 1. In a signed-out or private browser window, sign up at /concept2cure/signup. 2. Open the e-mailed link /concept2cure/verify-email#token=… in a browser that is still signed out. A browser signed in as another account goes to the app and does not verify. 3. Expected: "Your e-mail address is confirmed" and a Sign in button. There is no redirect to the login page, and the token is cleared from the address bar. 4. Sign in. Like every sign-in on these stacks, this needs the 6-digit code e-mailed to you. Also check: before verifying, a sign-in attempt shows the unverified error with a "Request a new confirmation link" button. That button opens the verify page with a "Send a new link" form; the page text reads "This link is not valid or has expired…". It must not loop back to sign-in. Limits: 5 sign-ups and 10 verify or resend requests per hour per IP in production. With NODE_ENV=development and ALLOW_DEV_AUTH=1, including the Codespaces guide, sign-up skips verification by design and this path does not appear. Do not judge it on the Vite dev server (npm run dev): React StrictMode runs the verify page twice there, so the account is activated but the page then shows 'This link is not valid or has expired'. That is a development-build artifact, not a failure of the fix. |
| OPS-02 — Canonical branch still red: 0 green in the last 1000 CI runs, HEAD cannot provision a fresh database, nothing gates landing (deploy-time CI gate added) | partially fixed | 2ef129e54, e1f3fd425 | The 94b4f9238 blocker is gone. On an empty database at 8ca7e74ca, `npm run db:provision` completes. It was re-verified locally on 2026-10-18 on PostgreSQL 16 with pgvector: 408/408 migrations, including the child-table deny-all FORCE amendment, with the readiness contract holding as app_service. A second deploy-migrate replay was also clean. Prerequisites: - The server needs pgvector (postgresql-16-pgvector locally; the compose stacks' pgvector/pgvector:pg15 image already has it). - The owner role needs superuser rights, or at least CREATE ROLE and CREATE EXTENSION. - Set DATABASE_OWNER_URL, APP_SERVICE_DB_PASSWORD, and APP_DATABASE_URL pointing at app_service on the same host and database. - Then run `ADMIN_EMAIL=… ADMIN_PASSWORD=… node scripts/seed-admin.mjs`. On the docker-compose.yml and docker-compose.beta.yml stacks the app container does not provision the database. Before signing in, run `npm run db:provision` from a checkout against the published db port, using 127.0.0.1 URLs for that run. Do not run install-fresh.mjs alone as the compose comment suggests: without deploy-migrate the schema is incomplete. CI has not yet run on 8ca7e74ca. If provisioning fails, report the failing file and the SHA. What still degrades testing: trunk has no green CI run at all. Lint, Test, Coverage and Integration are red on every run, and Semgrep is red too. Some defects a tester finds may already be known failing tests, and any SHA under test is unproven. Record the exact commit SHA with every defect report. |
| SEC-01 — Virus scanner: clamd now runs beside the API in Terraform and the Data Room upload fails closed, but the production-mode docker-compose stacks still have no scanner, so every upload there returns 503 | partially fixed | fb95b9680 | Fixed after the re-check by fb95b9680 (MR-08 Stage 1), for the compose stacks: docker-compose.yml and docker-compose.beta.yml now run the Terraform-pinned clamd, and the app waits for it. Use fb95b9680 or later. The first `docker compose up` waits up to 5 minutes while clamd loads its signature database, and the host needs about 8 GB of RAM for app plus scanner. On Apple silicon the scanner runs under emulation and starts more slowly. Expected: an EICAR test file is refused (400 FILE_SCAN_REJECTED) and a clean PDF is filed (201). Not yet observed on a running compose stack: the app image could not be built where the fix was made. So if uploads on the compose stack still return 503 FILE_SCAN_UNAVAILABLE, report it with the SHA and `docker compose logs clamav`. Under the documented local setup (NODE_ENV=development), the scan is still skipped with a warning. `npm start` (NODE_ENV=production) now refuses to boot without a scanner; docs/LOCAL_TESTING.md shows how to run one. |
| HT-01 — Organisations created by scripts/seed-admin.mjs cannot create programs (NO_CLIENT_WORKSPACE) until deploy-migrate runs again | fixed | 969d1e727 | Fixed by 969d1e727: on that commit or later, seed-admin gives the organisation its workspace and no extra step is needed. On an older checkout, run `node scripts/db/deploy-migrate.mjs` (owner database URL) once after seeding. |

## Issues that stop a journey (4)

A tester cannot complete the journey until these are fixed or worked around.
Do not log them again; add your +1 to the work order.

#### Submission Center

| Finding | Severity (pilot) | What you will see — and the workaround, if any | Fixed by |
|---|---|---|---|
| CAT2-04 — STF rewritten to the study-identifier / doc-content→index.xml#ID shape, but its DOCTYPE cannot resolve, its DTD is neither shipped nor validated, and the new 1789 gate blocks FDA sequences with study reports because the UI cannot record a study id or file-tag | P0 | Same as at 94b4f9238. Place a nonclinical or clinical study report (for example 4.2.3.2 or 5.3.5.1) in an FDA sequence, then compile, freeze or dispatch it. The step is refused with 'FDA validation 1789 (technical rejection): N file(s) in Module 4/5 study sections would be referenced by no Study Tagging File … Give each its study id and STF file-tag'. Submission Center has no field for either value. Workarounds: - In FDA sequences, use only Module 1-3 leaves or leaves at 4.3, 5.2, 5.3.6 or 5.4. - On staging, set submission_leaves.study_id and stf_file_tag directly in the database (use 'study-report-body'). - Use AnA's package_ectd_for_region tool, which builds a package outside the sequence path. Even when the gate passes, the STF it ships is not DTD-valid or DTD-checked. Do not count a package with STFs as conformant. _Re-checked at `8ca7e74ca` on 2026-10-18: partially fixed._ | MR-10 |
| CAT2-05 — FDA ESG still cannot deliver a conformant message or record FDA's acknowledgments: no S/MIME AS2, no MDN verification, no ACK1-3 ingestion, no center routing; SFTP dependency still absent | P0 | On the documented local setup and the docker stacks there are no FDA ESG credentials. Transmit is now reached only through Submission Center → sequence → Dispatch → Transmit: since 8b75e6b5b, Gateway Transmittals is a read-only log. Transmit returns 'Not transmitted — FDA ESG has no <environment> credentials configured for this organization. Nothing was sent; the attempt is recorded.' Without a real transmittal and the agency's signed MDN, the new 'record signed AS2 receipt' upload on a transmittal row cannot be exercised. ACK2/ACK3 and center acceptance never appear. Workaround: test up to assemble, dispatch-readiness and package download, and keep transmit and acknowledgement out of scope. Only a tester with FDA ESG test-environment (staging) credentials, the FDA certificates and OpenSSL could try a real AS2 send. Even then the result is unqualified until FDA UAT is done. Never put production ESG credentials on staging. _Re-checked at `8ca7e74ca` on 2026-10-18: partially fixed (e1f3fd425)._ | MR-10 |
| CAT2-07 — Sequences filed outside the platform still cannot be imported, so replace, append and delete against an existing application are impossible | P1 | Testers still cannot file a replace, append or delete against an existing application. A sequence filed outside the platform cannot be imported, and in-system filed history accrues only after a real gateway transmit with a verified MDN, which CAT2-05 blocks on test deployments. Symptoms: a follow-up on the package path gets 409 NO_PRIOR_SEQUENCE ('File sequence 0000 first'). On the sequence spine, a declared replace is skipped or refused for lack of a filed leaf. Partial workaround, validation only and not fileable: the eCTD compile screen's 'rehearsal' option (EctdCompile.tsx:1004-1070, from 84e935e9b) compiles and exports a follow-up against the latest recorded compile of earlier unfiled sequences. History labels it 'rehearsal — prior not filed'. Use it to inspect the replace/append/delete operations in index.xml. Otherwise test 0000 originals and new-only follow-ups, and leave filed lifecycle to unit tests. _Re-checked at `8ca7e74ca` on 2026-10-18: still open._ | MR-10 |

#### AnA

| Finding | Severity (pilot) | What you will see — and the workaround, if any | Fixed by |
|---|---|---|---|
| AI-01 — The gateway now enforces the PQ rule in production, but no model has passed PQ, so production AI drafting is refused | P0 | Still blocks on the docker-compose and beta-compose stacks and on any AWS staging environment, all of which run NODE_ENV=production. Authoring editor AI drafting (generate, expand, rewrite), section, IB and CSR generation, the MCP drafting tool, and AnA 'draft and save to Vault/editor' are refused with 'No performance-qualified model is available for high-risk regulatory drafting in this environment.' Chat and review-style AnA turns still answer. Workaround: run the documented local setup (npx tsx server/index.ts with NODE_ENV=development) with ANTHROPIC_API_KEY set. A PQ-pending approved model then serves drafting, and the ledger records pq_status 'pending'. Do not add a production bypass. On the local dev setup this journey does not block. _Re-checked at `8ca7e74ca` on 2026-10-18: partially fixed (5e8a3cc5f, 8ee5a12dd)._ | MR-13 |

## Issues you will see but can work past (67)

Visible defects or wrong results; the journey still completes.

#### Sign-up, account and admin

| Finding | Severity (pilot) | What you will see — and the workaround, if any | Fixed by |
|---|---|---|---|
| GTM-02 — Signup still shows non-binding inline ToS that promises HIPAA protections and a 3-month minimum; acceptance is never sent or recorded; legal URLs fall through to the app | P1 | On /concept2cure/signup the tester scrolls an inline 'Concept2Cure, Inc. — Terms of Service' that claims 'HIPAA protections for health data' and a '3-month minimum commitment', plus an 'AI Model Improvement' toggle that changes nothing. 'Full terms available at concept2cure.com/concept2cure/legal/terms' is plain text. Opening that URL, or the Terms/Privacy links in any verification or invitation email footer, redirects to the app (login or workspace) instead of a legal page. Signup still completes. Workaround: none needed to continue testing. Log these as one known legal-copy defect, not separate bugs. | MR-16 |
| GTM-05 — Retention mail now uses the one mailer, and logins with no SMTP are refused openly. Sender-domain authentication (SES identity, DKIM, SPF, DMARC) is still unmanaged, the default sender is .pro, and a dead second mailer remains | P1 | Unchanged since 94b4f9238. Local (NODE_ENV=development): what happens depends on your .env. - With ALLOW_DEV_AUTH=1, which scripts/setup-local-db.sh writes, password sign-in skips the code entirely. - Otherwise, with SMTP unset, the code appears only as a debug-level JSON log line ("[email-service] Dev OTP code", field "code"). That line is hidden when LOG_LEVEL=info, which is what .env.example sets. If your .env was copied from .env.example, set LOG_LEVEL=debug or ALLOW_DEV_AUTH=1. Otherwise you will wait on the code screen. - If you do set SMTP locally, the code is emailed instead of logged. With SMTP_FROM left blank, it comes from noreply@concept2cure.pro. Docker-compose stacks: both refuse to start unless SMTP_HOST, SMTP_USER, SMTP_PASS and SMTP_FROM are set (docker-compose.yml:219-223, docker-compose.beta.yml:221-225), so the .pro default never applies there. They only check that the values are present, not that they work. - The send is not awaited. A wrong host, port or password, a sender address your provider will not send from (for example an unverified SES identity), or an SES-sandbox recipient fails after the screen has already said the code was sent. Resend says the same. - The only trace is "Failed to send login OTP email" in the server log. - If SMTP works but the sender domain has no SPF, DKIM or DMARC, the code can go to spam or be quarantined. Workaround: - Use a sender address on a domain verified with your SMTP provider. - Before the session, run `node scripts/ops/verify-otp-delivery.mjs <inbox>` once per tester inbox, from the repo root with the same .env the stack uses. - Testers should check spam. Personal Gmail is more forgiving than corporate M365 gateways. _Re-checked at `8ca7e74ca` on 2026-10-18: partially fixed._ | MR-16 |
| GTM-07 — There is still no human support channel. 'Get help' opens AnA, the support mailbox is a placeholder, and the security contact switches between .pro and .com | P1 | A tester who hits a problem and clicks 'Get help' (account menu or header) gets an AnA conversation, not a person or a ticket form, and the product has no other way to report a bug. Error panels show a request reference to quote, but say nowhere where to quote it. Workaround: give testers an out-of-band channel (the test team's Slack or issue tracker) and ask them to paste the request reference from the error panel, the page URL and the time. | MR-16 |
| UX-05 — Plan cards and onboarding still advertise out-of-catalog features from two client-side price copies; Professional is still priced below Standard | P1 | Symptom: account menu > 'View all plans' (or 'View plans' on any locked app) shows plan cards listing '510(k) Module', 'CER Generation', 'Custom AI Models', 'On-Prem Option' and 'SLA Guarantee', none of which are launch apps. In per-user mode, Professional costs less per user than Standard but claims 'Everything in Standard'. Account menu > 'Set up a workspace' > step 5 'Modules' lists those same features as 'Modules provisioned for the <tier> tier', while the rail and the Apps catalog show what is actually provisioned. Workaround: none needed to finish the journeys. Testers should log it as a known content defect awaiting a founder pricing decision, and should not click 'Choose <plan>' against a live Stripe key. | MR-16 |
| GTM-14 — Org admin console mostly chat prompts | P2 | client AdminAccess.tsx:413,531,532,552,689 still call ask() for Audit a member, Grant access, Audit activity, Edit scopes, Change setting. | MR-16 |
| GTM-15 — No email for governed workflow notifications | P2 | server/services/notifications/notification-service.ts:14-16 still only claims email fan-out; no mailer/sendEmail call in services/notifications/. | MR-16 |
| GTM-19 — MCP connector isn't ready for directory submission | P2 | MCP_ENABLED now in terraform/stack/main.tf:275 and GA probe tool gone from server/mcp/tools/readiness.ts; docsUrl /concept2cure/connector (server/mcp/config.ts:140) has no server or client route, and server/mcp/auth/consent.ts has no privacy/terms link. | MR-16 |
| GTM-22 — Polish (Codebase coverage menu, brand drift, deletion cert, support access) | P3 | client/src/concept2cure/v2/Shell.tsx:375 still lists 'Codebase coverage'; server/routes/public-api.ts:232-246 still 'ClinicalSageAI Public API' and csai_ keys. | MR-16 |

#### Navigation, first run and Projects

| Finding | Severity (pilot) | What you will see — and the workaround, if any | Fixed by |
|---|---|---|---|
| CAT1-06 — Projects still have no membership or project roles: reads are org-wide, and program mutations are lead-or-manager only | P2 | Symptoms: - The New project wizard and Project home say 'Team assignment isn't available yet'. - The Team panel lists only the lead (and any typed names, which are not linked to an account). - Every org member sees every project and its Vault; there is no way to restrict a project. - A tester with the 'member' org role who is not the project lead gets 403 when pinning or unpinning evidence, adopting, or anchoring a submission to the project. Workaround: in Admin Access, give testers the manager or approver role (with a reason), or have the project lead perform those actions. | MR-15 |
| CAT1-10 — Project lifecycle UI missing | P2 | There is no PATCH route in server/routes/c2c/projects.ts. Projects.tsx and ProjectHome.tsx only mention archive and close-out in comments, and the client has no fetch caller for them. | MR-15 |
| CAT1-11 — Parallel project and document stores | P2 | TaskBoard.tsx and other v2 surfaces still reference /api/projects or /api/concept2cure/projects (see taskBoardEveryStore test). No consolidation onto the regulatory_programs UUID was found. | MR-15 |
| CAT1-19 — No email notifications and no document deep links | P2 | routing.ts now carries a conversation id in the URL (conversationIdFromLocation) but still no project/document id; notification-service.ts only mentions email in comments, with no send path. | MR-15 |
| UX-02 — Rail rebuilt as one list, but only five of the eight launch apps have an entry (no Authoring, Submission Readiness or CMC), and it still opens icon-only | P2 | Testers told to open Authoring or Submission Readiness will find no rail entry. To reach Authoring, open a document from Vault or Project home, press ⌘K and type 'authoring', or use the account menu > Apps catalog. To reach Submission Readiness, open a project and use the Markets panel's 'Open readiness', or ⌘K 'readiness'. The rail opens as icons only on first run; the expand toggle is at its foot. | MR-15 |
| UX-03 — Home quick actions, client-type defaults and the 510(k) copy are now scoped, but 'Browse all capabilities', the account menu's 'Codebase coverage' and ⌘K still offer out-of-release doors | P2 | With launch-scope enforcement on (production default, or LAUNCH_SCOPE_ENFORCE=on): most cards under Home > 'Browse all capabilities', and the account menu's 'Codebase coverage', open 'This app is built but is not part of the current release' with a 'Back to Projects' button. ⌘K shows locked rows with a reason. With enforcement off (default on local and staging when NODE_ENV is not production), these doors open the out-of-scope apps for real, so testers may file bugs against apps that are not in the launch. Set LAUNCH_SCOPE_ENFORCE=on on the test deployment. Workaround: navigate from the rail and Project home only. | MR-15 |
| UX-08 — No-program empty states lack CTA; project/program noun split | P2 | Vault.tsx:1522 now has 'Go to Projects' action; EctdCompile.tsx:1176 empty state still has title/hint only; copy still mixes 'Open a program' and 'Open a project'. | MR-15 |
| UX-09 — Error states don't distinguish 403/404/5xx | P2 | dataConnect.tsx now carries status in DataResult (:113,:157) and ListState.status (:399); per-surface status-specific copy not verified across the ~13 hint={x.error} sites. | MR-15 |
| UX-10 — Hand-rolled data layer without cache/refetch | P2 | useLiveData/useLiveRows remain the custom fetch hooks in dataConnect.tsx; no TanStack backing seen. | MR-15 |
| UX-11 — Contrast failures from --text-500 as text | P2 | --text-500 still #b0aea5 (design-system/colors_and_type.css:81) and used 48 times in v2/styles/app-v2.css. | MR-15 |
| UX-15 — Unknown deep link shows developer scaffold | P2 | client/src/concept2cure/v2/V2App.tsx:1133 still falls back to KitSurfaceScaffold; Surfaces.tsx:544 still renders 'Help me install the ... surface'. | MR-15 |
| UX-18 — Nav-verdict fetch failure re-exposes out-of-scope surfaces | P2 | navEntitlements.tsx:15-20 still 'NO VERDICT => NO LOCK'; no client-side LAUNCH_SURFACE_IDS fallback exists (only an optional launchScope flag at :70). | MR-15 |
| UX-07 — Home ignores tenant client type | P3 | V2App.tsx:914 reads tenantClientType and uses it for welcome (:1098), but Home still gets segment={prefs.segment} (:1107), default 'biopharma' (:178). | MR-15 |
| UX-23 — Microcopy lapses | P3 | v2/surfaces/DispatchReadiness.tsx:285 still says 'I cannot clear it'; v2/fixtures/admin-data.ts:146 still hard-codes '142 pure-function regulatory tools'; Surfaces.tsx:186-187 still falls back to 'Good morning, there'; shared/navigation/demo-scripts.ts:219 still offers 'Sales demonstration'. | MR-15 |

#### Vault

| Finding | Severity (pilot) | What you will see — and the workaround, if any | Fixed by |
|---|---|---|---|
| CAT1-05 — Vault admission: allowlist widened, but no .xpt/.zip/.pptx, a 50 MB in-memory cap, and extraction/OCR/chunking still run inside the request | P1 | Symptoms: - The Vault file picker does not offer .xpt, .zip or .pptx. Choosing one anyway returns 'File type .xpt is not allowed. Accepted: …' (400). - A file over 50 MB returns 'The file exceeds the 50 MB ingest limit.' (413). - A large scanned PDF keeps the upload spinner running while it is OCR'd in the request. On staging behind the ALB this can end in a 504 even though the document was admitted. Refresh the Vault before retrying, or the retry may be treated as a re-upload or next version. Workaround: test with text-layer PDFs and DOCX under 50 MB, and keep datasets outside the Vault. | MR-08 |
| CAT1-01 — AWS production task now runs a clamd sidecar, so Vault uploads are scanned there; the compose stacks (including the 'Human Testing & QA' beta stack) have no scanner and refuse every upload, and /readyz does not check AV | P2 | Unblocked since 13 October: how to run it, and what is still limited, is in the first table above. _Re-checked at `8ca7e74ca` on 2026-10-18: partially fixed (fb95b9680)._ | MR-08 |
| CAT1-04 — Vault versioning works now (server-assigned check-in, version list, compare, conflict offers 'upload as new version'); restore and check-out/check-in are still missing | P2 | Uploading a revised file works ('Upload new version' in the version list, or 'Upload as a new version of …' on a name clash). A tester who tries to restore an earlier version by uploading its file again gets 409 'These exact bytes are already version N of this document. Nothing was saved.' There is no restore button and no check-out. Workaround: none for an exact restore. Download the earlier version, and an edited copy uploads as a new version. | MR-08 |
| CAT1-14 — No data room, ZIP export, DOCX preview | P2 | Grep found no zip, share-link or data-room routes in the server/routes/vault* files. | MR-08 |
| SEC-01 — Virus scanner: clamd now runs beside the API in Terraform and the Data Room upload fails closed, but the production-mode docker-compose stacks still have no scanner, so every upload there returns 503 | P2 | Unblocked since 13 October: how to run it, and what is still limited, is in the first table above. _Re-checked at `8ca7e74ca` on 2026-10-18: partially fixed (fb95b9680)._ | MR-08 |
| CAT1-17 — Upload UX gaps | P3 | Vault.tsx:1394 now has a multiple file input, and ProjectHome.tsx:617 has onDrop. No webkitdirectory folder upload or Vault drop zone was found. | MR-08 |

#### Authoring

| Finding | Severity (pilot) | What you will see — and the workaround, if any | Fixed by |
|---|---|---|---|
| CAT1-02 — Every Authoring PDF export is still the plain-text 'Do not file' fallback (no Puppeteer driver, no Chromium); it is now labelled to the user and refused by File to Vault | P1 | Export → PDF downloads a plain-text PDF. Page one says 'Plain-text rendering … Do not file this rendering as the formatted document', and the toast is an error. File to Vault with the default PDF option fails with 'The PDF renderer is not available here; this would file a plain-text rendering. Nothing was filed. Word (.docx) is filed with its formatting.' Workaround: choose Word (.docx) in Export and in File to Vault. This happens on every PDF until the renderer is replaced, so log it once, not per occurrence. | MR-09 |
| CAT1-08 — The editor's AI draft still retrieves org-wide Data Room atoms and never reads the project's Vault | P1 | Requires a configured AI provider. Symptoms: - A tester uploads a study report to the project's Vault, opens a section in the editor and clicks 'Draft <section> from Data Room sources'. The draft reports that no Data Room source met the relevance threshold (not grounded), or it cites chat/Data Room uploads from any project in the organisation. The Vault upload is never cited. - Citations never show a Vault document or page. Workaround: ask AnA, in the open project, to draft the section (its passage search reads the project's Vault), then send it to the editor through the canvas. | MR-09 |
| CAT1-09 — Controlled DOCX export still has no document-control header/footer, page x of y, TOC or house style, and defaults to A4; only the uncontrolled working copy got a DRAFT banner header/footer | P1 | Freeze or approve an Authoring document, then choose Download > 'Controlled export (Word)'. The .docx opens with no header or footer, no page numbers, no table of contents, Word default styles and an A4 page. 'Controlled export (PDF)' is also A4 with no page numbers. 'Working copy (Word)' shows the bold 'DRAFT — uncontrolled copy · <id> · v<N> · <STATUS> · downloaded … by …' line at the top and bottom of each page, but still no page numbers or TOC. The journey completes. Log this as one known gap rather than a bug per document. Workaround: add the header, footer and TOC by hand in Word, but the edited file no longer matches the export-history record's SHA-256. | MR-09 |
| CAT1-16 — Draft Word export blocked; templates not applied to authoring exports | P2 | server/routes/authoring.router.ts:6585-6597 still returns 409 for unsealed documents. renderDocxWithTemplate is still called only from server/routes/c2c/templates.ts:296. | MR-09 |
| CAT1-18 — Place-into-filing is non-atomic client orchestration | P2 | AuthoringPlaceIntoFiling.tsx:276-300 still does takeFilingCopy (snapshot) then a separate PUT /api/submissions/sequences/:id/leaves; failures are surfaced (needsReconciliation) but can leave an orphan snapshot. | MR-09 |
| CAT1-20 — Template gaps; templates seeded at startup not migrations | P2 | server/startup/services.ts:409-422 still seeds template-seeds.ts at boot, non-blocking; there is no seed in C2C_MIGRATION_FILES. No CSR E3, DSUR or 2.7.4 template exists. | MR-09 |
| UX-16 — Editor lacks Word-parity features | P2 | client/src/concept2cure/v2/editor/ has no footnote/TOC/spellCheck implementation (only a paste-fidelity test mentions footnote). | MR-09 |
| UX-17 — Review Approve styled like Part 11 signature; model confidence shown | P2 | Review.tsx:256 still uses esign-modal; Review.tsx:1014-1015 still renders 'NN% confidence' tone from item.conf (now titled 'AnA confidence'). | MR-09 |

#### Submission Center

| Finding | Severity (pilot) | What you will see — and the workaround, if any | Fixed by |
|---|---|---|---|
| CAT2-01 — Agency DTDs, stylesheets and the STF DTD are still not vendored, so no package is ever DTD-validated (the FDA region-conformance over-claim is gone) | P0 | Every eCTD Compile result in Submission Center is 'not submission-ready' with the blocker 'The package references eCTD DTDs that are not bundled under util/dtd/ — it is not self-contained. Vendor the ICH/regional DTDs before transmission.' The zip still builds and downloads. Workaround: treat the message as expected. On staging, pointing ECTD_DTD_DIR at a folder holding the official DTD and XSL files clears the message, but it does not prove the XML is valid. DTD validity is not visible anywhere in the product. | MR-10 |
| CAT2-02 — FDA us-regional.xml: applicant name, id element, contact wrappers, application-containing-files and heading order are fixed; the sequence path still writes a placeholder DUNS, no contacts, untyped phones, flat Module 1 headings and forms in the wrong place | P0 | In eCTD Compile, the regional backbone shown for an FDA sequence reads <id>UNASSIGNED-ORG-<org id></id> and has no <applicant-contacts>. No field on the project or the sequence records the D-U-N-S number or the regulatory contact. Compile still produces a zip. Workaround: none on the sequence path. For packages assembled in Gateway Transmittals, the 'Regulatory identifiers' form there does record the DUNS and contact. | MR-10 |
| CAT2-10 — Device (eSTAR/EUDAMED) packages are still built as an invalid <ectd:index> zip by buildECTDZip and can be transmitted to FDA ESG; the official eSTAR PDF is download-only | P1 | Symptom: in Gateway Transmittals, Assemble on a 510(k)/eSTAR-family (or MDR/IVDR/CER-family) package reports success ('Bundle assembled … leaves · sha256 …'). The bundle is a flat zip of section PDFs with a non-standard index.xml, not the FDA eSTAR PDF. A Transmit attempt is refused only for missing ESG credentials, never for the wrong format. The official eSTAR is produced only in the hidden 510(k) workbench, as a download. Workaround: none inside the launch catalog. Testers should not count device filing through Gateway Transmittals as passing, and should log any 'assembled' device bundle as this known defect. | MR-10 |
| CAT2-13 — Non-FDA Module 1 backbones are still invented; they are now honestly labelled and partly fenced, but still selectable and buildable in Submission Center | P2 | In Submission Center > New submission, a tester can pick EU (EMA), PMDA, Health Canada, MHRA or any of the other 8 regions. The option text now reads e.g. 'EU (EMA) · Flat Module 1, no channel'. The tester can then create sequence 0000 and assemble a package whose <cc>-regional.xml is a flat or placeholder Module 1, flagged only as a warning ('NOT an EU-conformant Module 1 backbone'). Workaround: test with FDA (US) only and treat any non-FDA package as non-conformant by design. | MR-10 |

#### Submission Center — validation and dispatch

| Finding | Severity (pilot) | What you will see — and the workaround, if any | Fixed by |
|---|---|---|---|
| AI-04 — Model-produced figures: Shadow Review scores and the Vault classifier are fixed; Submission Twin and several mounted routes still store or show model figures, and there is no ci:model-figure gate | P1 | Submission Twin (device and diagnostics segments, 'Submit & file' > Submission Twin) shows a readiness score near 50, minus penalties, for a package with no readiness snapshot, and ranks claims by model-assigned confidence. Testers should log any number there as unverified and use Submission Center / Submission Readiness for readiness. Shadow Review gate scores now come from finding severities (fixed). The other affected endpoints have no UI caller, so testers will not see them. | MR-11 |
| CAT2-09 — Gateway Transmittals' Transmit (package spine) still skips Submission Readiness. Submission Center now has a gated sequence-transmit UI. | P1 | Symptom: the two Transmit buttons gate differently. Submission Center → sequence → Dispatch tab → 'Package and transmit' refuses with 'Dispatch gate blocks transmit' until readiness is clear. Gateway Transmittals → Assemble → Transmit never consults Submission Readiness. Locally (no ESG credentials) its only refusal is the credential/'not configured' 412. On a staging environment with FDA ESG test credentials, it would send a package whose readiness is blocked. Workaround: run the governed transmit journey only from Submission Center's Dispatch tab. Treat Gateway Transmittals' Transmit as ungated and record any send from it as a defect, not a pass. | MR-11 |
| CAT2-16 — Submission Readiness: required Module 1 is now an error, but an imported validator report still never reaches the gate, the rule corpus is unversioned, and dispatch still needs an AI Shadow Review | P2 | (1) A tester who imports a LORENZ eValidator JSON report with errors in eCTD Compile still sees the Submission Readiness external gate as 'not assessed'. The imported errors are not counted, and the sequence can read dispatch-clear on the other gates. (2) Dispatch requires a completed Shadow Review. In a test environment with no AI provider key configured, Shadow Review fails ('Shadow review could not be completed') and Dispatch stays blocked with 'No completed Shadow Review has run for this sequence'. Workaround: configure the AI gateway provider key in the test environment, run Shadow Review once, and read imported eValidator results in eCTD Compile directly. | MR-11 |
| CAT2-15 — New shadow-review runs record only the deterministic severity aggregate; legacy v1.0 model-influenced scores are still shown unlabelled in Submission Center | P3 | Only visible on a database holding shadow-review runs from before 2026-10-05, or seeded by the GA demo pack. In those cases, Submission Center > sequence > Shadow Review shows an older RTF/CRL number with no note that it may be the model's estimate. The Shadow Review surface says seeded runs kept 'the reviewer model's own estimate', which is untrue for seed rows. Workaround: re-run the lens; new runs are aggregate-only and are labelled correctly. | MR-11 |

#### QMS

| Finding | Severity (pilot) | What you will see — and the workaround, if any | Fixed by |
|---|---|---|---|
| CAT2-18 — QMS still has no version history: a revision overwrites the effective controlled document in place, and no version is ever superseded | P0 | Steps: approve an SOP, then use Revise (it goes through AnA and needs a confirmation). The row becomes Draft v2.0, the 'effective' count drops by one, and the SOP disappears from Training compliance. The UI has no history view and cannot show v1.0 or its approval. Workaround: none in the product. Before revising, testers should note the approved version and signature details. Log the 'no effective version during revision' behaviour as known, not as tester error. | MR-12 |
| CAT2-19 — Effective date still carries over from the prior version and can be supplied (including backdated) outside the signed digest | P1 | After Revise, the Draft or In-review v2.0 row still shows v1.0's date in the Effective column. After v2.0 is approved, the Effective date stays at v1.0's date instead of the signing date. The Approve dialog has no effective-date field. Workaround: none. Testers can take the true approval time from the signature confirmation. | MR-12 |
| CAT2-21 — Read-and-understood training: the any-user /api/qms write is gone; acknowledgments are still version-blind, accepted on non-effective documents, unassigned, unsigned, and have no UI | P1 | Unblocked since 13 October: how to run it, and what is still limited, is in the first table above. _Re-checked at `8ca7e74ca` on 2026-10-18: partially fixed (f6e9ff399, a80d2fa65, fa39bd5d8, e1f3fd425)._ | MR-12 |
| P11-03 — QMS controlled documents: draft-to-effective and unsigned-effective holes closed, but the signature still covers no SOP content, versions are overwritten on revise, retirement is signed 'APPROVED', and the register shows no signature | P1 | Testers can create, send for review, approve and retire SOPs. Visible defects: the register never shows who approved a document, when, or with what meaning (only a transient toast); the Retire dialog's only meaning is 'approval'; after Revise (via AnA) the previous approver/approval date disappear from the row and the earlier version cannot be opened; there is no place to write or view the SOP body in the register (clicking the number only asks AnA). Workaround for verifying signatures: Reporting -> controlled documents compliance report (CSV) lists the standing approval signature per document. | MR-12 |
| CAT2-22 — Periodic review is incomplete | P2 | client/src/concept2cure/quality/data.ts:103 still has const TODAY='2026-06-04'. SopRegister.tsx:378 flags rows with isReviewOverdue(d.nextReviewDate) against that date, not the server's overdue value. No review-complete action exists in server/routes/mdx-qms.ts. | MR-12 |
| CAT2-26 — QMS writes only through the assistant | P2 | SopRegister.tsx and ChangeControl.tsx still route create, revise and transition actions through onAsk(...) prompts (17 call sites, for example SopRegister.tsx:216,227,450 and ChangeControl.tsx:162,173,433). There are no governed forms. | MR-12 |

#### AnA

| Finding | Severity (pilot) | What you will see — and the workaround, if any | Fixed by |
|---|---|---|---|
| AI-02 — Production now gets an Anthropic drafting key, but /readyz and the deploy smoke ignore PQ, and Bedrock/Vertex are still undeployable | P1 | On a NODE_ENV=production staging deployment, /readyz and the boot banner say AnA is ready, but Authoring AI drafting is refused (see AI-01). Testers should not take the readiness page as proof that drafting works. Check the drafting journey directly, or test it on an `npm run dev` instance. | MR-13 |
| AI-05 — Editor AI grounding: a deterministic figure check now exists but is advisory; accept is not blocked, ungrounded drafting still proceeds, and the legacy edit-section route still marks any [SRC-n] sentence SUPPORTED | P1 | In Authoring, open a section and choose 'Draft from sources'. The check panel lists figures 'not found' in the Data Room sources, but 'Accept and record citations' stays enabled and saves them. With no relevant Data Room documents, or during a retrieval outage, a draft is still generated, labelled 'no Data Room sources above the relevance threshold' or 'WITHOUT Data Room evidence'. Workaround: log every not-found row as a defect and edit the figure before accepting, and upload source documents to the project Vault before drafting. Under NODE_ENV=production drafting is refused outright (no PQ-passed model, AI-01), so exercise this on a local non-production build with a provider key. | MR-13 |
| AI-06 — No regulatory text corpus ships; a 24-entry guidance manifest now names the targets, but nothing is verified, downloaded or ingested | P1 | When a tester asks AnA about FDA or ICH guidance content, the guidance-search tool says no FDA guidance index is connected, citations show as recall or 'not checked against the regulator's text', and the substance comes from model knowledge. Workaround: upload the needed guidance PDFs into the test project's Vault so Data Room retrieval grounds the answer, and log guidance-currency questions as a known limitation, not a defect. | MR-13 |
| AI-16 — MCP connector not ready for Connectors Directory | P3 | terraform/stack/main.tf:275 now sets MCP_ENABLED=true, and server/mcp/index.ts:117 closes registration when MCP_CLIENT_REDIRECT_ALLOWLIST is empty. server/mcp/config.ts:140 docsUrl /concept2cure/connector still has no client route (no match in client/src), and there is no privacy-policy or support URL. | MR-13 |
| ARCH-07 — AnA's DOCX tools now ship with a pinned Python runtime, and run_python_script runs only in a hardened container. Residuals: no runtime probe, unavailable tools still offered to the model, a dead ingestion fallback | P3 | Images built from Dockerfile.optimized (docker-compose.yml, docker-compose.beta.yml, AWS) have working DOCX tools. On a bare `npm run dev` without python-docx and lxml installed, insert_document_content, surgical_docx_xml_edit, validate_docx and insert_clause_template fail with a worker error ('ModuleNotFoundError: docx'). run_python_script says it is not available unless Docker is reachable and ANA_ENABLE_CONTAINER_EXEC=true. Workaround: `python3 -m venv .docx && .docx/bin/pip install python-docx==1.2.0 lxml==6.1.1`, then set ANA_DOCX_PYTHON=$PWD/.docx/bin/python, or test against the compose-built image. | MR-13 |

#### Signatures and audit trail (all apps)

| Finding | Severity (pilot) | What you will see — and the workaround, if any | Fixed by |
|---|---|---|---|
| CAT1-07 — Authoring approval: a document's author can still approve it with one signature, and no review is required | P1 | Symptoms: - A tester with an admin, approver or reviewer org role who created a document can open E-sign, choose Approval and sign. The document immediately becomes APPROVED and frozen, with one signature and no review. - Filing that document to the Vault then reports that the Authoring approval was not carried (the author signed), so Authoring says Approved while the Vault version is unapproved. Workaround: run the approval journey with separate accounts (author with the member role, reviewer, approver) and log self-approval acceptance as a known defect. | MR-06 |
| P11-05 — Authoring trail is now append-only, boot-gated and exportable per document; the signature stores are still missing from the boot gate, the per-document export and the signature register | P2 | Sign, freeze or e-sign a document in Authoring, then run Reporting & analytics > Audit & compliance reports > Electronic signature register. The Authoring signatures are not listed, and the report does not say they are excluded. In the document's 'Export record' JSON, the SIGN/FREEZE/E-SIGN events have no chain entry (integrity intact = null) and there is no signatures section. Workaround: read the signatures on the document's Signatures panel (GET /api/authoring/docs/:docId/signatures) or in the org-wide signed audit export, which carries the authoring.document.sign/freeze/e-sign chained rows. | MR-06 |
| P11-15 — Ceremony inconsistencies | P3 | Not re-checked in this light pass beyond spot greps; items (meaning spellings, reason floors, app-clock timestamps) are polish-level. | MR-06 |

#### Permissions (all apps)

| Finding | Severity (pilot) | What you will see — and the workaround, if any | Fixed by |
|---|---|---|---|
| SEC-02 — First-run setup is now gated by the deployment's SETUP_TOKEN in production and is race-safe; it still mints an admin (possibly platform-admin) session without MFA, and the compose stacks cannot use it | P3 | Terraform staging: the operator must create the first admin with `POST /api/setup/initialize`, sending header `X-Setup-Token: <value of the setup_token secret>` (terraform output first_run_setup). Without the header the response is 403 SETUP_TOKEN_INVALID. There is no UI for this step. docker-compose.yml/beta: first-run setup always returns 403 SETUP_CLOSED because compose does not pass SETUP_TOKEN. Workaround: from the host checkout run `DATABASE_URL=postgresql://postgres:$DB_PASSWORD@localhost:${DB_PORT:-5432}/concept2cure ADMIN_EMAIL=<you> ADMIN_PASSWORD=<strong> NODE_ENV=production node scripts/seed-admin.mjs`, or add `SETUP_TOKEN` (32+ characters) to a local docker-compose.override.yml app environment and call the endpoint with the header. Under `npm run dev` with no SETUP_TOKEN the route is open. | MR-07 |

#### Data and search (all apps)

| Finding | Severity (pilot) | What you will see — and the workaround, if any | Fixed by |
|---|---|---|---|
| DATA-11 — Test data seeded into every fresh production database | P1 | db/migrations/055_gcc_test_scenarios.sql still inserts *-test.example.com users/orgs (lines 29-66) and matches the *_gcc_* glob applied by install-fresh step 6 (scripts/db/install-fresh.mjs:56). | MR-17 |
| DATA-12 — Reference corpora not deployed | P2 | Not re-checked in depth at HEAD; settle by provisioning a fresh DB via install-fresh and counting knowledge_entries/guidance rows. | MR-17 |

#### Platform

| Finding | Severity (pilot) | What you will see — and the workaround, if any | Fixed by |
|---|---|---|---|
| OPS-02 — Canonical branch still red: 0 green in the last 1000 CI runs, HEAD cannot provision a fresh database, nothing gates landing (deploy-time CI gate added) | P0 | Unblocked since 13 October: how to run it, and what is still limited, is in the first table above. _Re-checked at `8ca7e74ca` on 2026-10-18: partially fixed (2ef129e54, e1f3fd425)._ | MR-02 |
| OPS-17 — CloudFront and the ALB now both wait 60 s, but eCTD compile/assemble still run synchronously and 7 SSE producers plus the MCP transport send no heartbeat, so anything over 60 s is still cut off | P1 | Local runs have no CloudFront or ALB, so testers will not see this there. On a staging deployment behind CloudFront: in the Submission Center, 'Compile' (eCTD Compile surface), 'Assemble test package' or Gateway package 'Assemble' on a package big enough to take more than 60 s shows a Gateway Timeout or generic request error. The server finishes and records the compile anyway. Workaround: use small packages (a few leaves) when testing on staging. After a timeout, open the compile history (GET /api/ectd-compile/:projectIdent/history, shown on the compile surface) rather than re-running. Log a timeout as 'edge timeout', not as a compile failure. AnA chat is not affected because its stream (ana-ri) sends a heartbeat every 15 s. | MR-03 |
| ARCH-01 — Out-of-scope route families are still mounted and bundled in production, behind one HTTP gate; deploy refuses LAUNCH_SCOPE_ENFORCE=off but not UNATTRIBUTED=report | P2 | On a local deployment started with `npm run dev`, NODE_ENV is not production, so LAUNCH_SCOPE_ENFORCE defaults to OFF (launch-scope.ts:48). The rail and Apps catalog then show surfaces outside the launch catalog, their APIs answer, and AnA offers hidden-app tools. Testers will exercise screens that production refuses and may file bugs against them. Workaround: set LAUNCH_SCOPE_ENFORCE=on and LAUNCH_SCOPE_API_UNATTRIBUTED=enforce in the test environment's .env, or test on the AWS staging stack (ECS sets NODE_ENV=production). A 403 LAUNCH_SCOPE on a non-catalog screen is then expected behaviour, not a defect. | MR-14 |
| ARCH-14 — Parallel implementations (auth, chat, pricing, flags, storage) | P2 | server/storage.ts and server/prisma/client.js still exist at HEAD; no evidence of consolidation of the cited clusters. | MR-14 |
| ARCH-21 — Out-of-scope client code bundled; LaunchScopeGate renders on missing verdict | P3 | client/src/concept2cure/v2/LaunchScopeGate.tsx:35 still renders children when !verdict, and client/src/concept2cure/v2/surfaces/CmcModule.tsx is still present and bundled. The server gate remains the real control. | MR-14 |
| UX-14 — Multiple UI generations inside one shell | P3 | client/src/concept2cure/mdx and pdev still exist; quality/App.tsx still a tabbed shell with its own topbar (header comment :4). | MR-14 |

## Launch-catalog journeys

One journey per launch app (the catalog in `shared/constants/launch-scope.ts` on 2026-10-18: Projects, Vault, Authoring, Submission Center — which absorbed Submission Readiness on 2026-10-17 — QMS controlled documents, CMC / Module 3, Reporting & analytics), in the order a regulatory team would use them, on
one program so each step builds on the last. "Working" describes what a sound
result looks like; anything else is a finding. Each journey lists the known
issues above that it runs into, so you can tell new from known.

### 1. Projects — set up a program

1. Sign in with an invited account. Complete the second factor if one is asked for.
2. Open **Projects** and create a program: name, product, filing type IND.
3. Open the program's home. Check sponsor, product, indication and IND number.
4. Open **Tasks**, create a task with an assignee and a due date, then complete it.

**Working:** the program appears in the list straight away, its home shows only
values you entered (anything unset reads "not recorded", never a placeholder),
the activity feed records each action with your name and a time, and the task
moves through its states without a reload.

Known issues on this journey (bold = stops it): CAT1-06, CAT1-10, CAT1-11, CAT1-19, GTM-02, GTM-05, GTM-07, GTM-14, GTM-15, GTM-19, GTM-22, UX-02, UX-03, UX-05, UX-07, UX-08, UX-09, UX-10, UX-11, UX-15, UX-18, UX-23.

### 2. Vault — file the evidence

1. Open **Vault** for the program and upload two PDFs and one DOCX.
2. Accept or move the proposed filing location (CTD placement) for each.
3. Search for a phrase that appears inside one document.
4. Upload a revised copy of one document as a new version; open its version list.
5. Open a document's history and check the audit entries and chain verdict.
6. Download a document and compare its checksum with the original.

**Working:** each upload is scanned and accepted or refused with a reason;
search finds text inside documents; the new version keeps its lineage; history
names who did what and when; a failed read shows an error, never an empty list.

Known issues on this journey (bold = stops it): CAT1-01, CAT1-04, CAT1-05, CAT1-14, CAT1-17, SEC-01.

### 3. Authoring — draft, review, sign, export

1. Open **Authoring** and create a document from a CTD template (for example
   Module 2.5 or 3.2.S).
2. Edit a section: add a table, a cross-reference and a citation to a Vault
   document. Save, reload, confirm nothing was lost.
3. With a model key set, ask AnA to draft a section from the program's Vault
   evidence. Check every factual statement resolves to a cited Vault passage.
4. Ask a second account to review and comment; resolve the comments.
5. Sign as approver: reason, password and second factor.
6. Export to DOCX and to PDF; file the document into the Vault.

**Working:** saves survive a reload; drafted statements cite sources you can
open; the author cannot approve their own document; the signature shows printed
name, date/time and meaning; exports are formatted (not plain text); the filed
copy appears in the Vault with its signature intact.

Known issues on this journey (bold = stops it): **AI-01**, AI-02, AI-05, AI-06, AI-16, ARCH-07, CAT1-02, CAT1-08, CAT1-09, CAT1-16, CAT1-18, CAT1-20, UX-16, UX-17, SEC-22.

### 4. Submission Center — assemble a sequence

1. Open **Submission Center** for the program's IND and its sequence 0000.
2. Place the approved document and two Vault PDFs into Module 1–3 leaves.
3. Compile the sequence and download the package.
4. Open the package: `index.xml`, `us-regional.xml`, `index-md5.txt`.

**Working:** leaves sit under the right CTD headings; the package compiles with
correct checksums; any leaf that cannot be packaged blocks compilation with a
reason. Do **not** transmit to a real agency endpoint during testing.

Known issues on this journey (bold = stops it): **CAT2-04**, **CAT2-05**, **CAT2-07**, CAT2-01, CAT2-02, CAT2-10, CAT2-13.

### 5. Submission Center — validate and dispatch (formerly Submission Readiness)

Submission Readiness was folded into Submission Center on 2026-10-17; its verdict now lives in the sequence's **Validation** and **Dispatch** tabs.

1. Open the sequence's **Validation** and **Dispatch** tabs.
2. Note what it reports before any review has run ("not assessed"), then after.
3. Remove a required Module 1 document and re-check.

**Working:** "not assessed" is never shown as clear; every verdict names the
rule that produced it; a missing required document is reported; no figure on the
screen comes from the model.

Known issues on this journey (bold = stops it): AI-04, CAT2-09, CAT2-15, CAT2-16.

### 6. QMS — control an SOP

1. Open **QMS** and create an SOP; send it for review; approve it with a signature.
2. Start a revision of the effective SOP.
3. Acknowledge the SOP as a trainee from a second account.
4. Retire an SOP with a signature.

**Working:** the approved version stays effective and retrievable while a
revision is in draft; each signature shows its own meaning (approval,
retirement); training acknowledgments count only against the current version.

Known issues on this journey (bold = stops it): CAT2-18, CAT2-19, CAT2-21, CAT2-22, CAT2-26, P11-03.

### 7. CMC / Module 3 — compose small-molecule Module 3 for a US IND

Not audited as a launch app by this evaluation (it joined the catalog on
2026-10-12, after the audit basis). Test it against its own boundary:

1. Compose Module 3 (3.2.S and 3.2.P) for a small-molecule US IND program.
2. Try a biologic, a marketing application and a non-US clinical-trial
   application.

**Working:** the in-scope case composes with every figure traceable to a
recorded source; each out-of-scope case is refused by name, not silently
degraded (`services/cmc/composition-scope.ts`).

### 8. Reporting & analytics

Not audited as a launch app by this evaluation (it joined the catalog on
2026-09-26 and was not one of the audited lanes). Open the program's reports;
every figure should be computed from recorded data, and an unavailable source
should read as unavailable, never as zero.

### 9. Across every app

- **Permissions:** repeat one write from each app as a **viewer**. Every write
  should be refused.
- **Audit trail:** for one record in each app, the audit trail shows who, what,
  when and why, and the signed export opens.
- **Honest state:** cut the network mid-load once per app. You should see an
  error with a retry, never an empty list or a zero.
- **Navigation:** every launch app is reachable in one click from the rail;
  nothing in the rail or on Home leads to "not in this release".

Known issues on this journey (bold = stops it): ARCH-01, ARCH-14, ARCH-21, CAT1-07, DATA-11, DATA-12, UX-14, OPS-02, OPS-17, P11-05, P11-15, SEC-02, SEC-21, SEC-23, SEC-24, SEC-25, SEC-26, SEC-27, SEC-28.
