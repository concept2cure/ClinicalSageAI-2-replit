# Launch definition of done — read this before any session does anything

**Status:** binding from 2026-09-20 until the launch rows below are green.
**Owner:** founder (control tower). **Companion rule:** `CLAUDE.md` Rule 2.
**Dashboard:** `node scripts/ops/ga-readiness-report.mjs` (4/40 on 2026-09-20)
and `node scripts/ops/submission-preflight.mjs` (2/15 on 2026-09-20).

"Commercially deployed" means every row D1–D10 is green with the evidence named
in the row filed under `docs/evidence/`. A session that cannot point to a row it
moved should not be running. A session reports **blocked**, not done, when it
cannot produce the row's evidence.

## The rows

| Row | Done means | Evidence | Who |
|---|---|---|---|
| **D1** Hosted production — *code side done 2026-09-21: `npm run db:provision` proven on an empty database, PDF/A toolchain in the image; `docs/evidence/W2/`. Owed: AWS account, IAM, DNS, secrets, the apply itself. 2026-09-23: the application side holds; the Terraform side did not. `terraform validate` had never run, and production failed it (fixed in `b6d7a7d7b`, which also adds the KMS release-signing key: SOP-SEC-001 §2a). Ten more blockers stand between it and a booting task, among them `DATABASE_URL` wired to a JSON credential, an illegal RDS database name, the preflight's required variables absent, and an ECS health check calling `wget`, which the image lacks; three of them are founder decisions (AI placement, Redis, worker). Ordered brief: `docs/evidence/W2/2026-09-23/README.md`. 2026-09-24, B9 (`docs/evidence/W2/2026-09-24-b9/`): the ALB answers CloudFront alone (origin-facing prefix list + origin secret header), and the way in through CloudFront works. Before, every `/api/*` request would have failed its origin certificate check, API 403/404 came back as `200 index.html` (so `/readyz` read green for any deployment), and `/readyz`, `/collab`, SCIM and the connector had no route. Production trusts two hops; the smoke test reads `/readyz` through the public URL and fails closed. Offline proof only (mocked-provider `terraform test`, each check shown failing first); nothing applied. Adds to the founder list: a custom domain that both certificates cover, and the origin secret. 2026-09-24, B1–B3 and B5: built twice in parallel (`docs/evidence/W2/2026-09-24-b1-b5/`, `docs/evidence/W2/2026-09-23b/`) and reconciled into one: the task definition carries every name deploy-aws.yml's preflight requires (read from the workflow by `terraform test`), composed `verify-full` URLs replace the RDS JSON secret, the database name is legal, and the health check probes `/healthz`, not `/readyz` (a readiness probe replaces tasks it cannot heal). `.github/workflows/terraform-tests.yml` runs the tests and the pipeline's own preflight against the rendered task definition on every push. The RDS CA is vendored (`docs/evidence/W2/2026-09-24-rds-ca/`); the bundle itself had been dropped by `.gitignore`'s `*.pem`, so trunk named a missing file until 2026-09-24 (`2026-09-23b/rds-ca-vendored-bundle-missing.txt`). Found and fixed the same day (`2026-09-23b/`): the production image could not load its own bundle (`vite`, a devDependency, imported at load time); minting `app_service` as the RDS master always failed, and its password went to CloudWatch in plaintext; a crash exited 0; the preflight checked one revision and deploy rolled another. 2026-09-24, B8, same day (`docs/evidence/W2/2026-09-24-b8/`): staging is now production's composition. There is one `terraform/stack` with two thin roots, so staging cannot drift from what it proves. Staging runs at smaller sizes with its own names and signing key, and passes the same boot-contract test. A test also reads the six names deploy-aws.yml targets and checks production creates them. deploy-aws.yml still deploys to production only. Still blocked: no path provisions the empty RDS database (next), deploy IAM, the apply itself. Founder: B4, B6+B7, audit trail on first boot, document-storage retention. 2026-09-24, vault storage (`docs/evidence/W2/2026-09-24-vault-storage/`): a deployment had nowhere durable to keep a filing's source documents. `STORAGE_PROVIDER=s3` threw in every production build (the SDK was loaded with `require()` in an ESM bundle), and the task definition named no store, so bytes went to the task's own disk and would be deleted with it. Now the provider loads, finds every object (it had stopped at the first 1000 keys bucket-wide) and reports a refused read as an error rather than a missing document. Production refuses to boot without a durable store, and the stack creates a private, versioned bucket per environment that only the task role can reach. The pipeline's own preflight refuses `local`, a missing bucket and a missing provider, and `/readyz` reports the store, so a task that cannot reach it is not ready. Each fix was shown failing first. How long deleted versions are kept is the retention decision above. 2026-09-24, TRIVY-01 (`docs/evidence/W2/2026-09-24-trivy/`): the deploy's blocking IaC scan failed on 16 HIGH/CRITICAL findings, so no tagged release could pass `security-gate`; each is fixed or excepted at its resource with a reason, the scan exited 0; red again on merge from `terraform/stack/vault_storage.tf` (AWS-0132 ×2), fixed by the vault-storage lane (`2fe4ec4b2`); exits 0 on trunk and CI's copy now blocks. Founder decision added: a WAF on CloudFront. 2026-09-24, SMTP (`docs/evidence/W2/2026-09-24-smtp/`): login OTP is the mandatory second factor and the stack carried no SMTP, so a deploy would boot, read ready, and admit no one; the stack now carries it (port 465 only) and the preflight refuses a task definition without it. Founder: an SMTP provider with a verified sending domain, then `pilot:verify-otp` to a real inbox* | One AWS environment from `terraform/environments/production`, image promoted by `.github/workflows/deploy-aws.yml`, `/readyz` 200 with schema and ana `ok`; redis and worker read `skipped` by decision B6 (2026-10-01, CPO: production runs without Redis and coordinates through Postgres; `docs/evidence/W2/2026-09-24-multi-task/u20-sessions-across-tasks.md`). | Readiness JSON + `terraform apply` log | Claude + founder (account, DNS, IAM) |
| **D2** Launch catalog — *local green 2026-09-20, see `docs/evidence/W1/2026-09-20/`; staging owed with D1. 2026-09-23: every self-serve signup answered 500 under `RLS_ENFORCE=on` after `a264e291a` (the default client workspace written from the pre-auth scope); fixed in the writer, shown on real PostgreSQL 8/16 red → 16/16 green (`docs/evidence/W1/2026-09-23-workspace/`). 2026-09-28, deterministic AI responses (`docs/evidence/D2-DETERMINISTIC-PROD/2026-09-28/`): `AI_GATEWAY_DETERMINISTIC=true` served fixed responses in production — "Draft section 2.7.3" answered `**AnA (Demo Mode):** …` with no error — while `/readyz` read ready. Production now refuses it at boot, per request and in the deploy preflight unless `AI_GATEWAY_ACCEPT_DETERMINISTIC=true` records the risk (the CI boot job does); each shown failing first. The fixed responses no longer mark claims about unread input `[KNOWN]` or `[INFERRED]` 2026-10-01: a Vault document takes its next version from the server (check-in by naming the document: version assigned 1.0 → 2.0, code and filing kept, predecessor linked), and the database refuses a version link outside its family or a second successor (VR-08, `docs/evidence/D2-VAULT-VERSIONS/2026-09-30-checkin/`). 2026-10-01: a document is one entry at its current version; every version is listed with its hash, downloads hash-verified, and is in the document's history; search shows current versions unless asked; a changed file uploaded under an existing name is offered as the next version (VR-09, `docs/evidence/D2-VAULT-VERSIONS/2026-10-01-version-list/`). The data room's capture record is append-only in the database, and its Filed chip names the Vault version the file became (VR-16, `docs/evidence/D2/2026-10-01-data-room-capture-immutable/`). Captured sources are filed into the Vault from the data room, through the one upload-to-Vault path AnA's tool also uses, with a result for every source; changed bytes are refused (VR-11a, `docs/evidence/D2-DATA-ROOM-FILE/2026-10-01/`). Suggested filings in a folder are confirmed together with one required reason, each with its own audit row, and one changed since it was listed is refused; the header counts what awaits confirmation (VR-11b, `docs/evidence/D2-DATA-ROOM-FILE/2026-10-01-confirm/`). A capture names who made it, and its capture, supersession and filing into the Vault are in the audit chain (VR-16b, `docs/evidence/D2/2026-10-01-data-room-capture-provenance/`). Any earlier version compares with the current one: bytes, recorded details and the changed lines (critique 15, `docs/evidence/D2-VAULT-VERSIONS/2026-10-01-compare/`). The Vault searches every project of the organisation at once, each hit naming its project (critique 15, `docs/evidence/D2-VAULT-LIBRARY/2026-10-01/`). A version names the documents that support it, that it references or that it is based on, in any project of the organisation; both ends list it, removal needs a reason, and each change is chained on both documents (critique 15, the replacement for `parentDocumentId`, `docs/evidence/D2-VAULT-RELATIONSHIPS/2026-10-01/`). Each version says which submission sequences and sections carry it, with the leaf's operation (VR-14a, `docs/evidence/D2-VAULT-WHERE-USED/2026-10-01/`), and which official eSTAR exports attached it, from the export's own record of its sources (VR-14c, `docs/evidence/D2-VAULT-WHERE-USED/2026-10-01-estar-uses/`). A version is annotated on a page or a passage of its text, replied to, resolved with a note or retracted by its author, each act chained and the record guarded in the database; the review and approval dialogs say what was open (critique 15, `docs/evidence/D2-VAULT-ANNOTATIONS/2026-10-01/`). 2026-10-11, biostatistics (`docs/evidence/D2-BIOSTATISTICS/2026-10-11/`): 163 checks of the statistical engines against published reference values found 37 wrong, all on parallel copies reachable from live routes while the canonical `server/services/stats/*` passed. Fixed against the published method and pinned by four new reference suites (74 tests; 69 of them fail against the previous code): Φ and Φ⁻¹ to full double precision (z(0.975) was off by 1.2e-6 and every sizing, power and boundary is built on them), TOST 69/group, crossover 32, AUC 10/group, real Dunnett, exact noncentral-t 64, binary 93/arm, Schoenfeld 247 events (the time-to-event sizer had labelled events as subjects), Lan–DeMets O'Brien–Fleming 2.963/1.969 and conditional power 0.8903 where the service answered 3.258/2.259 and 0.185. The engine now refuses rather than substituting a silent default (a hazard ratio of 0.5 for an effect ≥ 1, an 0.85 performance goal, 0.90/0.90/0.50 diagnostic accuracy). Five launch-reachable paths carried figures a model supplied, each closed: a model-drafted CSR §11.4 reached Module 2.5/2.7 as the study's primary result inside eCTD compile; AnA's M2.5/M2.7 tools composed from model-written `csrs[]` and now read the program's CSR records; statistical defensibility was a model's 0-100 scores and is now the deterministic judgment engine; figure generation asked a model for a Kaplan–Meier HR and 95% CI; the design optimizer invented sample sizes by endpoint keyword. Four engines that were both unreachable and wrong were deleted (10,247 lines), among them a Schoenfeld with a factor of 2 that halved every event count. Owed and named there: no pre-dispatch statistical gate, no statistical qualification package, and the `biostatistics` surface scrapped by `docs/SURFACE_DECISIONS_2026-10-08.md` but not yet removed. 2026-10-14, no example data (`docs/evidence/D2-NO-SAMPLE-MODE/2026-10-14/`): sample mode and its datasets are deleted, and `ci:fixture-fallback` refuses their return, shown blocking a reintroduced fixture. 2026-10-22, invented values (`docs/evidence/D2-NO-SAMPLE-MODE/2026-10-22/`): 155 commits from a codebase-wide inventory. A fact nobody recorded stays unrecorded instead of a default confidence, actor, year or submission type. A failed read is an error, not "none". A score covers only what was measured. Tenant and actor come from the session. Each is pinned by a test shown failing first. Owner decisions owed are listed there.* | Seven apps in the launch catalog: Projects, Vault, Authoring, Submission Center (with the IND lifecycle and forms tools as its features, P-32, and Submission Readiness, the one dispatch verdict per sequence, as its screen since P-36; P-33), QMS controlled documents, Reporting & analytics (the seventh by the founder's decision of 2026-09-26, landed 2026-10-01: `docs/evidence/D2-REPORTING-LAUNCH-APP/2026-09-30/`) and CMC / Module 3 (the eighth, decision P-28 under the founder's delegation of 2026-10-07, landed 2026-10-12: `docs/evidence/D2-CMC-LAUNCH-APP/2026-10-12/`). Six of the seven are granted to a new organisation by default (the modules granted are unchanged by P-36). CMC / Module 3 grants no module on purpose: its surface is inside the boundary, and the professional band the product owner set on 2026-08-24 still decides who holds it — a launch app's surface list lifts the launch-scope lock, and `applyLaunchScope` never widens a verdict. What it composes is small-molecule Module 3 for a US IND; a biologic, a marketing application or a non-US clinical-trial application is refused by name and authored in the editor instead (`services/cmc/composition-scope.ts`). Every other surface behind a flag that is off in production. Zero fixture imports reachable in production; `ci:fixture-fallback` and `ci:no-mock-in-prod-routes` set to block. | Fresh-org screenshots on staging; a CI run showing the gate block on a reintroduced fixture | Claude |
| **D3** Tenant isolation proven — *app_service role and boot as non-superuser proven locally (`docs/evidence/W2/`); all six OQ protocols pass locally with `RLS_ENFORCE=on` as `app_service`, after F-14 — Vault refused every upload under that role — was fixed (`docs/evidence/W3/2026-09-22/`). 2026-09-24: governed decisions added to the two-tenant contract (`docs/evidence/D3/2026-09-24-governed-decisions/`), run as `app_service` with RLS enforcing on a from-blank install, 23/23; the positive control found every listed decision answering 404 on fetch (two ids for one decision, fixed), and one mutation showed the database had already been refusing a cross-tenant write this effort had reported as live. Same day, Report OS (`docs/evidence/D3/2026-09-24-report-os-tenant/`), 37/37: seven of its request schemas took the tenant from the request and now take it from the session; RLS contained all but one leak, a program group holding another tenant's project, since memberships carry no RLS policy. (Corrected 2026-10-08: since `2ddbfb6a6c` memberships are policied through their group, though not through the project they name; the route's member check still guards the project.) An UPDATE crossed too (`docs/evidence/D3/2026-09-24-update-boundary/`, 39/39): with RLS enforcing, a traceability item could be re-pointed at another tenant's QMP, because RLS checks the row's organization and not a foreign key. 2026-09-24, signed approvals and Submission Center (`docs/evidence/D3/2026-09-24-signatures-and-runs/`): `electronic_signatures` and `submission_orchestrator_runs` added, 43/43 with the Report OS cases; each shown failing with only its own table's policy removed (A lists B's signatures, B's runs are edited and deleted, a forged row lands). Signatures had been excluded because §11.70 makes a fixture undeletable; they are in without disabling the trigger. The contract's forge handler turned out to test `risk_items` for any domain without its own branch, so a new domain could pass having tested nothing; shown passing with signatures' RLS off, and now a compile error (an exhaustive `Record<Domain, Forge>`). And an edit could approve (`docs/evidence/D3/2026-09-24-governed-edit/`, 46/46): any member's PATCH could mark a PCCP plan or post-market document approved and locked without its gate, or re-parent it onto another tenant's program, with RLS enforcing. 2026-09-24, the cortex query route (`docs/evidence/D3/2026-09-24-cortex-tenant-header/`): its tenant key was the client's `x-org-uuid` header and nothing else, since the router it is mounted under drops the session's uuid; RLS contained it for atoms but not for the vault, whose RLS the RAG pipeline scoped to whatever uuid its caller passed (see the RAG pipeline note). The key is the session's now, 6/6 with RLS on and off. Found on the way and handed on: `search_atoms_hybrid` fails on every install built from empty, so Authoring's AI draft and AnA chat retrieve no evidence. Six more writes RLS never refused (`docs/evidence/D3/2026-09-24-request-parents/`, 58/58): another tenant's complaint relinked, a preference row written for another user, an AnA profile planted onto a colleague, and three foreign-key pins, each shown landing with RLS on. And the writes only RLS was stopping (`docs/evidence/D3/2026-09-24-project-scope/`, 72/72): project intelligence read and written by project id alone, memory entries archived and verified by id, AnA's project update spreading the body (re-pointing a project at another tenant's workspace with RLS on), a bundle linked to another tenant's plan, a corpus ingest taking another org's report over, and `/api/users/me` reading the account for a password-only token. Each is shown leaking red and holding green with RLS off, since every policy passes all rows when enforcement is off. And the control plane (`docs/evidence/D3/2026-09-24-control-plane-access/`, 82/82): the kernel's process-wide log, every tenant's paths, tenant ids and actor ids, was readable and clearable by any role containing "admin" and by everyone outside production. It is now for platform operators, and an org's governed decisions for its own administrators. And the vault RAG pipeline (`docs/evidence/D3/2026-09-24-rag-pipeline-tenant/`): it wrote its caller's org uuid into the GUC vault RLS reads, so tenant A's session handed B's uuid read B's vault passage as `app_service` with RLS enforcing; it now refuses any uuid that is not the session's, 5/5 (unfixed 3 fail). And child tables (`docs/evidence/D3/2026-09-24-child-tables/`): 67 with no tenant column had row security off, four live paths reached other tenants' rows through them, and 66 now inherit their parent's isolation through the canonical child migration, the five grandchildren through their parent's own policy, and sixteen more outside `public` the same way, one of which was taking audit rows against any tenant's export job; a CI rule across every schema fails on any child left open. The staging run is owed with D1 2026-09-24, the Vault's write services (AnA client-files lane): a viewer could add files to the Vault or file them through AnA and authoring, and row-level security did not stop it, since the write policy scopes by program, not role. The shared services now check the scope's `organization_users` role; red then green on real PostgreSQL as `app_service` (`docs/evidence/D3/2026-09-24-vault-write-role/`). 2026-09-24, the vault's own authorization inputs (`docs/evidence/D3/2026-09-24-vault-program-ownership/`): a program's owner was resolved from GCC tables any tenant could write ahead of the canonical registry, and the delegate-grant table had no RLS, so one row written as `app_service` with RLS enforcing gave tenant A tenant B's vault to read and rewrite. No application writer reaches either table. Canonical registry first, sponsor-only grants; 6/6, and from empty 207/207 across the vault and fixture suites. 2026-09-25, the tables RLS decisions read (`docs/evidence/D3/2026-09-25-organizations-tenant-key/`): a sweep of every relation a policy or policy function reads found `public.organizations` without RLS and writable, and its uuid is the tenant key; a tenant gave another org its own uuid and read that org's vault. The key is now immutable, and the sweep is a live-database contract with self-tests, 13/13. Writes to the table's other columns stay open, handed on. 2026-09-26, `organizations` writes (`docs/evidence/D3/2026-09-26-organizations-writes/`): any tenant scope could rewrite any organization's tier, settings, Stripe ids and API key. Own-org-or-platform write policy, after moving five platform-staff override paths onto the system scope for cross-org edits (the policy alone made one answer success while writing nothing); 19/19. Found: `organization_users` has no RLS at all. 2026-09-26, memberships (`docs/evidence/D3/2026-09-26-memberships/`): `organization_users` had no RLS, so a member's scope placed its user in another tenant — whose route then admitted its token — and made its own member platform staff. Writes are now own-org-or-platform and staff roles platform-minted; signup, persona and cross-org admin writes moved into the membership's organization; 10/10. 2026-09-28/29 (`…01YZFCXR`), each red then green on a from-blank database as `app_service` with RLS enforcing: `public.users` was readable and rewritable from any tenant scope, credentials included — now scoped by membership, pre-auth and system scopes keep sign-in (`docs/evidence/D3/2026-09-28-users-rls/`); a member's scope could write itself a `super_admin` platform grant, which the console then admitted — writes are platform-only (`docs/evidence/D3/2026-09-28-platform-role-grants/`); generated drafts were readable and rewritable across tenants — scoped to their program (`docs/evidence/D3/2026-09-28-drafting-tasks/`); an invitation to another organization could not be accepted under enforcement — a member-only definer lookup, then the inviting organization's scope (`docs/evidence/D3/2026-09-28-invitation-acceptance/`); a blank database's first deploy left a child table unscoped — the child scope now runs in the isolation tail, and CI checks coverage after the first deploy (`docs/evidence/D3/2026-09-29-child-scope-first-deploy/`); `GET /api/users/:id` read any account in the pre-auth scope behind a default-org check — it now looks up by membership in the caller's organization (`docs/evidence/D3/2026-09-29-pre-auth-scope/`); and the audit trail and displays lost, or dropped, people who had left — named through `actor_name`, members and past actors only (`docs/evidence/D3/2026-09-29-actor-names/`). 2026-10-04: the pre-auth scope read and wrote every account, credentials included — it now reaches only the one account the request is bound to, so a steered handler reads nothing at the database (`docs/evidence/D3/2026-10-04-pre-auth-narrowing/`); `user_presence` (IP address, current page) was readable and writable from any scope — members read, only the person writes (`docs/evidence/D3/2026-10-04-user-presence/`); five legacy digest routes took the target user from the request, one with a path-traversal write — removed, replacements by path (`docs/evidence/D3/2026-10-04-digest-routes/`). 2026-09-29, SECURITY DEFINER functions (`docs/evidence/D3/2026-09-29-definer-functions/`): each one the runtime role can call runs past RLS; 73 swept, none reachable on a launch path with a caller-chosen tenant, and a new one now fails `tests/db` until it is reviewed with a reason. 2026-09-30 (`docs/evidence/D3/2026-09-30-definer-revoke/`): the runtime role's grant recipe now revokes EXECUTE on every unreviewed SECURITY DEFINER function (48), so an unreviewed one fails closed on every deploy; the whole `tests/db` tier 843/843 after the revoke.* | Runtime connects as the non-superuser app role (`APP_SERVICE_DB_PASSWORD` set); `RLS_ENFORCE=on`; the two-tenant isolation contract passes against staging with the production image. | Contract-test log from staging | Claude |
| **D4** Validation package — *drafted and executed locally: VMP, six URS, RA, IQ, six OQ protocols, TM-001 generated from the runs, VSR-001 §1–§18 (`docs/validation/`, `docs/evidence/W3/`, `WA`–`WF`). Latest local run 2026-09-27, at one commit (`89ee3a81`), on an installation provisioned from empty, in the production posture *and* with production authentication, the auth boundary enforcing as in production. Every identity but the run identity was created through user administration: the run identity added each colleague; each set its own password through the activation link and enrolled its own authenticator (`docs/evidence/W3/2026-09-27/`). IQ 12/0/3; OQ 101 pass / 0 fail / 2 deviation of 103; TM-001 69 of 71 requirements pass, 0 uncovered (URS-AUTH-012 partial, no provider; URS-SRDY-006 partial, its positive half outside the release). It found F-41, which that way of creating an account exposes: a colleague's sign-in and credential events were written outside its organisation. It also found F-42: the ledger named the account that acted by display name alone, and two accounts were "JM Smith". Both are fixed, each shown failing first, and three protocol steps now follow the product's week (VSR-001 §18). The 2026-09-23 run and the sweep after it found F-18 to F-22, all fixed (VSR-001 §13). This run found F-23 (the readiness review reported an all-clear for a project it could not read; fixed, proven on real PostgreSQL as the non-superuser role) and P-11 (the records misstated 22 steps' assurance kind; fixed, and gated in CI) (VSR-001 §14). The sweep after it found F-24 to F-33 and three signing sites that took the session's word, all fixed and each shown failing first: every signature re-verifies through one ceremony, an account taken out of use can do nothing (URS-PROJ-012, OQ-PROJ-18), and the PIN, F-15 and Submission Readiness decisions are taken (VSR-001 §16). F-6 closed (VSR-001 §11). Owed: staging execution with the production image and a second account created through user administration with a real mail server (done locally 2026-09-27), a PQ-passed provider for the model step (2026-09-22: only registry-approved models may now serve drafting or review — enforced at every gateway selection point, where before nothing read the approval; 0 of 4 approved models have a PQ, shown as a blocker in `ga-readiness-report.mjs`; 2026-09-23: the PQ is executable (`npm run pq:run`) and a "passed" claim is checked against its record, but the protocol is a draft awaiting owner approval, the gold bank is below its floor and there is no product provider key; tools and routes that store model-authored content refuse an unapproved serving model, and every remaining pin to an unapproved model is listed with its reason behind a CI gate; `docs/evidence/MODEL-GOVERNANCE/`), signatures 2026-09-24, Vault honest state (AnA client-files lane), each red on the unfixed code first: a refused upload kept its file while saying nothing was saved; spreadsheets were extracted to row 300, and a blank row or column hid the rest, while the catalog called them read in full; "N documents" counted rule-pack sections and a capped page, so URS-VAULT-004 now holds; passage search was unavailable in deep investigations; the index backfill could not run with RLS enforced (`docs/evidence/D4/2026-09-24-*`).* | CSA-aligned: validation plan, URS per launch app, risk assessment, IQ, OQ with executed Playwright evidence, traceability matrix generated from tests, summary report. Signed by the founder and one qualified contractor. | Signed PDFs under `docs/evidence/validation/` | Claude drafts and executes; humans sign |
| **D5** Part 11 evidence — *signer modes and KMS envelope implemented and tested against a fake KMS, second signature route deleted (`docs/evidence/W3b/`); audit chain made one chain per tenant with `chain_seq` ordering after the concurrency and RLS defects were reproduced on real Postgres, local verifier 262/262 OK, ledger surface reads the chained store and shows the server verdict (`docs/evidence/WA/`); QMS approval and authoring e-sign proven end to end with a credentialed second signer (`WB`, `WF`). 2026-09-23: every signing path re-verifies the signer through one ceremony (`server/services/part11/reverify-signer.ts`: the account's standing, its lockout, the password, the enrolled second factor) and records what it verified; the Authoring PIN and a second verifier are deleted; the release, the AnA rewrite and the document lock no longer take the session's word (VSR-001 §16.3). 2026-09-24: an exported signature manifest verifies each printed hash against the content it is printed on, and a sealed record that no signature covers is refused (F-40, VSR-001 §17, `docs/evidence/DOCUMENT-FIDELITY/2026-09-24/`). 2026-09-24, two exceptions to "every signing path" found and fixed. The shared `<EsignModal>` could verify no signer in any environment, because its fetch sent no bearer token; `ci:unauthenticated-fetch` now gates the class (`docs/evidence/D5-ESIGN-TOKEN/2026-09-24/`). And `/api/regulatory/documents` recorded sign-offs and approvals with no re-verification; it now uses the one ceremony, with the gate asked first (`docs/evidence/D5-LIFECYCLE-SIGNING/2026-09-24/`). 2026-09-26/29: the database refuses any change to a recorded Vault version's identity, hash or lineage (VR-06) and any deletion except the tenant purge's owner-run function, which also makes the purge erase the Vault it used to leave in place (VR-07; `docs/evidence/D5/2026-09-26-vault-record-immutability/`, `docs/evidence/D5/2026-09-29-vault-record-no-delete/`). 2026-09-30: a lifecycle review or approval on `/api/regulatory/documents` is a Part 11 `electronic_signatures` record, with printed name and meaning, bound to the Vault version's hash read by the server. It commits with its chained audit row and the stage change or not at all, and it cannot be signed by the document's creator or uploader (VR-12, `docs/evidence/D5-LIFECYCLE-SIGNING/2026-09-29-part11-records/`). 2026-09-26/10-01: every AnA turn is an append-only record chained per tenant, and comments, quoted passages and AI-suggestion decisions are on the authoring trail. Each comes with its verdict and an export an inspector checks offline. A reason is recorded only when a person gave one; this now covers AnA's 98 governed tools and every task event (`docs/evidence/D5-ANA-RECORD/2026-09-26/`, `…/2026-09-26-authoring/`). The runtime role holds no UPDATE, DELETE or TRUNCATE on the ten append-only record tables (P0-8, grant half). The tenant purge erases turn records only through a door the trigger admits, after the export returns them; each turn's chained audit row stays (`…/2026-10-01-erasure-and-grants/`). A review-thread comment on the Review surface is fixed once posted. A retraction is recorded, and every comment and retraction commits with its chained row. The GDPR erasure keeps review comments as part of the review record (`…/2026-10-01-review-comments/`). 2026-10-01: a Vault version is sent for review, reviewed and approved in the Vault, each sign-off an e-signature with the signer's own reason, bound to the version's bytes. The uploader, whoever sent it and the reviewer cannot approve it. Approving v2 supersedes v1 in the same transaction, and an approved version's details cannot be edited (VR-13, `docs/evidence/D5-VAULT-APPROVAL/2026-10-01/`). Every stored Vault version can be re-proven against its recorded SHA-256 on demand, each verdict a chained `vault.document.fixity` row (`docs/evidence/D5-VAULT-FIXITY/2026-10-01/`); its schedule is owed by the jobs lane. The deletion archive is deployed, append-only, tenant-scoped and erased by the tenant purge (critique 13, `docs/evidence/D5/2026-10-01-vault-archives/`). 2026-10-08: a filing section is approved only by the approver's signature. The Authoring approval (`/e-sign` as APPROVER, or the `/sign` that clears the last workflow step) moves the bound sections whose filing text is the text signed to `approved` in the signature's transaction, recorded through `recordGovernedAction`; any other meaning, and a `/sign` that decides no workflow step, moves nothing, and a rolled-back signature leaves them as they were. Text that is not the signed text does not stay approved: a save or a section PATCH that changes an approved section's text moves it to `drafted` and records the withdrawal; a locked section is not written. The old-store section PATCH refuses `approved` and `locked` with 409 `APPROVAL_REQUIRES_SIGNATURE`, and a save with text moves `todo` to `drafted` (spine F1, `docs/evidence/D2-ONE-ANA/2026-10-08/spine-f1-section-status/`). Owed: the KMS key, one live signed release, the production verifier run* | `AUDIT_HMAC_KEY` and `MFA_ENCRYPTION_KEY` in KMS; a KMS-backed signer behind the existing signer seam; the second non-compliant signature route deleted; audit-chain verifier run on production and its output filed. | Verifier output; route deletion commit | Claude |
| **D6** Security posture — *policy set, SIG-Lite questionnaire and trust statement drafted; AI gates fail closed in production (`docs/evidence/W3b/`, `W2/`). 2026-09-23: three sign-in defects closed, each reproduced on real PostgreSQL as the non-superuser role before its fix (VSR-001 §13.9). `/api/users/login` issued sessions without the second factor (MFA bypass). Logout never ended a session (July audit AUTH-03). The enterprise sign-in recorded nothing. Later on 2026-09-23 (`docs/evidence/D6/2026-09-23/`, VSR-001 §15), each shown failing on real PostgreSQL before its fix: a TOTP code, an emailed code and a reset token are each accepted once, including under concurrency; the session states the account's real second factor; the client address in signature and audit rows is the one the load balancer saw, never the one the client wrote (`ci:client-ip-single-source`); a session alone can no longer replace an enrolled authenticator (F-26); the TOTP secret no longer reaches a third-party QR service; reset links are never built on the request's Host. W3, same day (VSR-001 §16), each shown failing first: a suspended or deprovisioned account signs nothing, cannot sign in, and every session it holds ends (F-28, F-29; OQ-PROJ-18); a wrong factor at signing counts against the account, and an unreadable lockout refuses (F-27, F-30); each user behind the load balancer has their own sign-in allowance (F-24); a platform administrator reaches Master Administration on the platform role alone (F-31). Closed 2026-09-26, on both sign-in doors: a recovery code is redeemable once at the login challenge, and an authenticator account cannot finish sign-in with an emailed code (`fdc1e53e4`, `e93c7878f`, P1-38 `fc5f5d31f`; re-run 2026-10-01, 8/8). 2026-10-01 (`docs/evidence/D6/2026-10-01-purge-signed-tenant/`): the tenant purge completes on its real table list for a client that has done real work. It had failed for every client with a project, because workspaces were deleted before projects, and for every client with a signed or locked artifact, because those records refused the cascade. The signatures are erased through a database door; each signing's chained ledger row stays. The ALB reachable from the internet is fixed in Terraform 2026-09-24 (W2 B9, `docs/evidence/W2/2026-09-24-b9/`): CloudFront alone, `TRUST_PROXY_HOPS=2`; live once D1 is applied. 2026-09-28 (`docs/evidence/D6/2026-09-28-owner-grant/`, shown failing first and live): the platform-owner grant no longer names an address in source. It is decided inside platform administration, so it never exceeds what the Master Administration guard admits, and a single-sign-on e-mail never earns it (finding 43; INF-27, master-admin half). Closed 2026-10-01 (`b221cd641`): Terraform passes both owner allowlists to the container (`terraform/stack/main.tf` `owner_environment`, from `platform-owners.auto.tfvars`), and first-run setup needs the deployment's `SETUP_TOKEN` in production. 2026-10-05 (`docs/evidence/D6/2026-10-05-ci-and-gates/`, `2026-10-05-pm-decisions/`), each shown failing first: fifteen CI gates no longer read string literals as comments and skip the code after them; the tenant data return withholds credential material (OAuth tokens, gateway credentials, session keys), with a schema-wide guard against a new unclassified one; four org-keyed tables, client gateway credentials among them, are now reached by the tenant purge; Security Scan is green in CI (run 37252785865), and the full-history secret scan, run locally with CI's own command, finds no unrecorded credential (CI confirmation pending its runner backlog). Owed by the founder: revoke the two Neon owner passwords and the Hugging Face token committed to history (P0-17; runbook in `2026-10-05-pm-decisions/`). Owed: SOC 2 platform, pen test, Anthropic BAA, signatures* | SOC 2 Type II observation window open on a compliance platform; third-party pen test with findings closed; standard security questionnaire answered; Anthropic BAA signed; per-tenant data-retention and residency statement published. | Pen-test report; questionnaire; trust page | Claude + founder (subscriptions, signatures) |
| **D7** One real sequence — *engineering half closed 2026-09-20: one AS2 transport for ESG and ICSR, typed refusal for the unverified REST path, PDF/A OutputIntent fixed (`docs/evidence/W5/`). 2026-09-24: the FDA regional backbone no longer defaults the application type to NDA or codes an IND as an IND safety report. It states the identity it was given or refuses to build (F-38, VSR-001 §17). 2026-10-22: the IND reference lane (WO-9, BX-512) was clicked end to end at head on a deploy-shaped database, and a later Vault version now files as a `replace` of the version on file (P-42; `docs/evidence/W5/2026-10-21-ind-reference-lane/`). The DTD hosts are still refused by the environment's egress policy (403 on CONNECT to www.fda.gov and admin.ich.org, one attempt each). Owed: DTDs and other agency artifacts (downloads refused by the sandbox proxy), agency accounts, the test submission* | eCTD DTDs vendored (B3); external validator seam live or FDA-criteria fallback declared (B4); ESG transport gap closed (B16); one test sequence accepted by FDA's test environment for a real sponsor with the ack chain filed. | Ack chain; preflight 15/15 | Claude builds; founder holds accounts |
| **D8** Connector for Claude — *built 2026-09-21: 19 tools, OAuth 2.1 with PKCE (`docs/evidence/W7/`). Corrected 2026-09-30: that suite connected as a superuser, so RLS never bound it, and under enforced RLS no client could connect (the grant store wrote tenant-policied rows in the pre-auth scope); a signed-out session kept the connector; a connector token was a full /api session. Fixed in `3bdb50458` and proven as the runtime role with RLS on, with suspended and deprovisioned accounts refused with the reason (`docs/evidence/D8/2026-09-24-account-standing/`). 2026-10-01: the tools' tenant isolation proven as the runtime role — with a tool's own tenant filter removed, the database still refuses the other organisation's rows (`docs/evidence/D8/2026-10-01-connector-tenant-proof/`). Owed: staging, a second machine's client, the directory submission* | Remote MCP server in `server/mcp/` (streamable HTTP, OAuth 2.1 + PKCE) exposing 15–20 hand-curated tools with exact scope, governed flag and annotations; privacy policy, docs, support contact; submitted to the Connectors Directory; skills pack public. | Transcript of a second machine's Claude client calling the readiness tool against staging; submission acknowledgement | Claude |
| **D9** Commercial paper — *drafts complete under `docs/commercial/` (`docs/evidence/W6/`). Owed: lawyer review, the pricing decision* | Pilot agreement, subscription agreement, DPA, order form, pricing page, onboarding runbook, support policy. One lawyer review. | Files under `docs/commercial/` | Claude drafts; founder approves |
| **D10** One customer | A signed pilot with a fee and logo rights; a named regulatory user who has filed at least one governed document into a sequence on production. | Signed agreement; audit-trail entry for the filing | Founder only |

## Gates

- **Week 8:** D10 signed and D1 staging green. Without D10, sessions stop building
  and the founder spends four weeks only on conversations. Without green staging,
  W2 takes every session until it is.
- **Week 16:** the pilot user has filed on production and D7's sequence is
  accepted. If not, the launch date moves and the pilot and any investor are told.

## Rules that follow from the founder's notes (2026-09-20)

### Multi-model is a governance feature, not a marketing feature

The gateway (`server/services/ai-gateway/types.ts`) already routes to
`openai`, `anthropic`, `moonshot` (Kimi), `bedrock`, `vertex`, `azure` and
`local`. The approved-models registry
(`server/services/ai-governance/approved-models.ts`) carries Anthropic (5),
OpenAI (2, dated GPT-4o pins), Moonshot (3), Bedrock, Vertex (Claude only),
Azure and `local-default`. **Gemini has no generation lane and no approved
entry today**; adding it is a build item under W2's gateway scope, not a toggle.

- Every model a tenant can select is an entry in the approved-models registry
  with a pinned version, a rationale and an eval reference. Nothing else is
  selectable. This is what a GxP buyer is sold: *approved-model governance with
  evidence*, never "four models".
- Only models with a passed PQ against `server/eval/rag/` and
  `server/eval/doc-quality/` are approved for **high-risk regulatory drafting**.
  For launch that is Claude Opus 5.5 (primary, per the founder 2026-09-25; `docs/evidence/MODEL-GOVERNANCE/2026-09-25-opus-5-5/`) and one validated fallback, Opus 5. Kimi,
  Gemini, GPT and `local` ship as *available* with `riskTier` capped below
  high-risk until their PQ executes. More approved models means more validation
  surface; approve them one at a time, with evidence.
- Sensitive dispatch stays governed by `AI_PROVIDER_PLACEMENT_APPROVALS`. A
  tenant's residency or zero-data-retention policy decides which providers it
  may reach; the ladder never fails over across that boundary.
- Every gateway call is CI-enforced through `getGateway()`
  (`scripts/ci/check-gateway-bypass.mjs`). A new provider is added behind that
  seam or not at all.
- In the Claude connector (D8) and all Anthropic-facing material, Claude is the
  named model. Multi-model is how Veeva positions too; it is not a conflict.

### AnA is the regulatory operating system; the LLM is a swappable narrator

The platform's real strength is deterministic: eCTD packager, validators,
clocks, conformance checkers, the SE flowchart, the sample-size solvers, rule
packs, the tool registry. The direction is to keep moving truth into that layer
so that the model only frames, drafts and explains, and any approved model can
be substituted without changing an answer.

- **Numbers, verdicts and governed content come from engines, never from the
  model.** The rule already stated for AnA advisory applies platform-wide: the
  model calls the deterministic tool, renders its result, and adds language.
  A tool that asks the model for a figure is a defect.
- **The corpus is the OS's memory and it is empty until ingested.** Corpus
  ingestion (runbook B9) moves from advisory to launch-critical: a local
  regulatory-intelligence OS with empty precedent tables is a chat wrapper.
  Guidance freshness stays in the regulatory-currency registry with dated
  versions.
- **Retrieval is local by default.** pgvector, the eight-corpus embedding
  policy and the RAG router already exist; the local embedding lane must
  respect the per-corpus dimension contract before any on-prem tenant is
  accepted (see `LOCALAI_ONPREM_INFERENCE_PILOT_PLAN_2026-07-30.md` §4).
- **Local inference is for low-risk lanes until PQ.** `local-default` stays
  "not approved for high-risk regulatory drafting" until it passes the eval
  harness. "Limit the need for LLM" means fewer and cheaper model calls per
  governed action, not building a model.
- **Not in scope for launch, and not what "operating system" means here:** the
  regulatory digital twin, epistemic / causal / self-evolving engines,
  federated learning and the manufacturing digital twin. They stay in the tree
  behind flags and get no sessions until D1–D10 are green.

## Product decisions, 2026-10-01 (product owner, under the founder's delegation)

The founder delegated these to the product owner on 2026-10-01 ("make those decisions … as the product manager and
product owner"). Each is recorded with its reason so no later session re-opens it without new facts.

### P-1 — A password change ends every connector grant authorised before it

A password is changed in a regulated tenant most often because it may be known to someone else. A connector grant
authorised with that password is a credential derived from it: left alone, the remedy would leave it minting access
for the refresh token's 30 days. §11.300(b) and (d) ask that a compromised credential can be recalled; this recalls the
credentials made from it too. The cost to a legitimate user is one reconnection. The platform already ends sessions
and connector access tokens issued before a change (`verifyLiveToken`, D6 P0-4); grants now end on the same
comparison (`sessionPredatesPasswordChange`). Implemented in `server/mcp/auth/provider.ts`; evidence
`docs/evidence/D8/2026-10-01-product-decisions/`.

### P-2 — The connector ships at launch, enabled, and registers clients from Claude's origins only

D8 is one of the ten rows that define "commercially deployed", and the connector now meets the posture the rest of
the platform holds (account standing, revocation, token class, tenant isolation proven as the runtime role —
`docs/evidence/D8/`). So production runs with `MCP_ENABLED=true`, `MCP_PUBLIC_URL` set to the production origin, and
`MCP_CLIENT_REDIRECT_ALLOWLIST=https://claude.ai,https://claude.com`: the connector serves Claude, the client the
directory submission and the D8 evidence name. Production with no allowlist **refuses** every registration rather
than warning and admitting any https origin — a missing list is a configuration fault and it fails closed
(`server/mcp/index.ts`). Loopback redirects (local CLI clients) stay refused in production at launch; admitting them
is a later decision on its own evidence. The three values belong in `terraform/stack`'s boot environment and the
deploy preflight (W2), handed on in `docs/work-orders/README.md`.

### P-3 — Repository and release controls fit the one-branch model

- **No required-status-check ruleset on `concept2cure-v2`.** Under RULE 0 every change lands by a direct push, and a
  required check must pass before a push is accepted — which no commit can do before it is on the branch. Such a
  ruleset would refuse every push. P0-14's "required checks" is replaced by the next two items.
- **Apply now, in GitHub settings (founder; needs repository admin):** a ruleset on `concept2cure-v2` that blocks
  force-pushes and deletion (it costs nothing and protects the code's own history); secret scanning with push
  protection; and a required reviewer — the founder — on the `production` environment, so no deploy reaches
  production without a named human approving it (§11.10(k)(2), change control of the system itself).
- **The release gate is at deploy:** production deploys only a commit whose CI run on `concept2cure-v2` passed the
  release-evidence gate (Integration Tests, Boot Smoke, Blank DB Provisioning, Build and the security jobs included;
  these now run whatever Lint says, `17ba398e7`). `deploy-aws.yml` verifies that verdict for the tagged commit before
  `build-push` (W2, handed on). A release therefore needs a green trunk commit, which is the standard a regulated
  customer's auditor will ask about.

### P-4 — Uploads are scanned inside the API task, and a file the scanner could not finish is refused

A ClamAV sidecar runs in every API task (`terraform/modules/ecs-fargate`, image pinned by digest, `CLAMAV_HOST`
on loopback), the deploy preflight refuses a stack without it, and a scan that did not complete answers 422
`FILE_SCAN_INCOMPLETE` rather than admitting the file. No third-party scanning service sees a tenant's files, the
scanner scales with the API tasks, and it fails closed. The cost is memory: each API task is sized at 6 GB
(`api_memory`). Evidence `docs/evidence/D1/2026-10-01-production-blockers/`.

### P-5 — The first account is created by the deployment's operator, and the platform owner is named in Terraform

An open first-run setup lets whoever reaches a fresh deployment first become its administrator and inherit the owner
allowlists' cross-tenant access. In production `POST /api/setup/initialize` requires the deployment's `SETUP_TOKEN`
(generated by Terraform into Secrets Manager), and `platform_owner_emails` is required, lower-case, non-empty.
The owners are named (founder, 2026-10-01) in `terraform/environments/{production,staging}/platform-owners.auto.tfvars`. Still owed: the apply and the one setup call. Evidence `docs/evidence/D1/2026-10-01-production-blockers/`.

### P-6 — Every write to a co-author document states its reason; a document with saved history is not deleted

The editor's other two hosts already required a reason on every save, and three hosts of one editor hold one rule.
The replaced text is kept as a version and the change is an audit event in the same transaction. Deleting a document
with versions is refused (409), because its versions are its record. Evidence
`docs/evidence/D5/2026-10-01-coauthor-save-trail/`.

### P-7 — A tool with no engine says it is unavailable, and stays until its replacement exists (plan open decision 8)

`pdf_overlay` answers `unavailable` until the bind engine ships (plan WS13), and is deleted in the change that ships
`bind_pdf_package`. The PMDA and NMPA connectors refuse every search and fetch, say where to look by hand, and are
never offered as configured, until a licensed data source exists. Removing them now would delete a capability with no reachable replacement (working
agreement); an honest refusal costs nothing and fabricates nothing. Evidence `docs/evidence/D4/2026-09-30-honest-tools/`.

### P-8 — The deployment's own mailbox, calendar and CRM serve one named organisation (plan open decision 10)

The regulatory mailbox (`GMAIL_OAUTH_JSON`), the team calendar and the HubSpot CRM are each one account for the whole
deployment, and every organisation's AnA could read the mailbox and the CRM and write the calendar (ANA-03). They now
serve only the organisation `PLATFORM_INTEGRATIONS_ORGANIZATION_ID` names, read from the request's tenant scope;
every other organisation is told none is connected for it, and the account is not reached. Unset, no one reaches
them. Retiring them outright was the alternative; this keeps the operator's own use and a single-tenant deployment's.
A tenant's own mailbox or CRM, on its own credential, is a connector capability after launch.
`server/services/integrations/platform-integration-owner.ts`; evidence
`docs/evidence/D6/2026-10-01-platform-integrations-owner/`.

### P-9 — The FDA guidance index is the reviewed registry (plan open decision 11)

What AnA states about an FDA guidance — that it exists, its status, its date — comes from the currency registry's
reviewed entries, never from a live page. The fda.gov guidance datatable's stability and terms are unverified, and a
scrape that drifts would turn into a wrong fact without anyone noticing. A live fetcher (plan WS14) is post-launch and
feeds review; it never answers directly. Until then `fetch_fda_guidance_list` is `unavailable` and
`check_guidance_freshness` answers `unverified` on a miss (`docs/evidence/D4/2026-09-30-honest-tools/`).

### P-10 — No separate worker at launch (B7)

With no Redis (B6, `docs/evidence/W2/2026-09-24-multi-task/u20-sessions-across-tasks.md`), the Bull action queue has
nothing to consume, and scheduled jobs run once across the API tasks (`scheduledOnce`). So `worker_desired_count`
stays 0 and the deploy builds no worker image. A worker returns when a job has to be isolated from request latency
(the sandbox of plan WS16 is the first candidate), on its own evidence.

**Amended 2026-10-22 (NEW-1 of MR-03, decided under the CPO mandate): removed, not kept at zero.** The worker's ECS
service, task definition, log group and ECR repository are deleted from `terraform/`, with every variable and output
that fed them. Kept at zero, they were a hazard rather than an option. The task definition named no command, so one
change of `worker_desired_count` (whose production default was still 1) would boot a third copy of the API server,
outside the load balancer, from a repository nothing pushes to. Since MR-08 Stage 1 that copy could not boot anyway: a
production process with no scanner beside it fails the boot self-test. Nothing user-facing is removed. Background
work runs in the API's own schedulers (`server/index.ts`, `server/startup/services.ts`), once per window across tasks
(`server/db/scheduledOnce.ts`; `tests/db/scheduled-once-lease.dbtest.ts`, `scheduled-once-window.dbtest.ts`). A
worker that returns under this decision's condition comes back as a new service with its own entrypoint, its own
command and its own evidence, not by raising a count. `terraform/stack/tests/boot_contract.tftest.hcl` asserts one
service and one repository. Evidence: `docs/evidence/MR-03/2026-10-21-stage-1/`.

### P-11 — A WAF on CloudFront at launch (AWS-0011)

Security questionnaires will ask, and it costs about $10 a month. The web ACL on the distribution blocks with the IP
reputation and known-bad-inputs managed groups and a per-IP rate rule. AWS's common rule set runs in count mode for
two weeks, then blocks, with its body-size rule excluded on the upload and AnA paths (it refuses bodies over 8 KB).
A CloudFront web ACL lives in `us-east-1`, which both environments use. The Terraform is handed on to the holder of
`terraform/modules/cloudfront` (`docs/work-orders/README.md`); until it is applied, the ALB admits CloudFront alone
and the app applies its own limits.

### P-12 — No public-only connector scope at launch

P-2 admits only Claude's origins as connector clients. A public-only scope for third-party agents (plan WS9,
`c2c:public`) is built with the first such client, not before.

## Product decisions, 2026-10-08 (product owner, under the founder's delegation)

The founder delegated these on 2026-10-08 ("you can make these decisions without me"), while the client-journey
fixes from the browser QA walk of that day were landing (`docs/evidence/QA-2026-10-08/`).

### P-13 — Members may create a program

`canCreateProgram` (`server/services/c2c/program-access.ts`) refuses only read-only roles. A member creating a
regulated program is how a regulatory user starts work, and the organisation's role vocabulary is open, so an
allow-list would lock out every role nobody listed. Kept as it is. The program's lead is its creator, and mutating
another person's program still needs `canMutateProgram`.

### P-14 — A document is placed only into a submission anchored to its program

The filing picker already offers only the program's own submissions (`24e8cb5f4`). A direct API write of a
program's document into a submission that belongs to no program is now refused as well, with a named error. A
placement the server cannot judge is a placement into an unknown dossier; failing closed is the rule. A legacy
submission with no program is anchored first, through the Submission Center, and then accepts placements.

### P-15 — Documents already split across two codes are not merged

Before `38179495f`, the data room and the Vault derived different codes for one file, so some documents exist as two
version families (for example Vorelinib STB-0042). Merging them would rewrite recorded rows. They stay as recorded;
the shared code rule stops new splits, and a person retires the duplicate through the existing disposition flow.

### P-16 — The recorded type labels a document; the classifier's kind is the fallback

An edited type shows in the tree, list, uploads lane and header (`cc96676e3`). The classifier's evidence kind is
used only when the recorded type is empty or OTHER (the ingest's "not told" value), and it stays visible in the
filing block's "Looks like" line.

### P-17 — A project's record counts are its current records

Superseded versions, retired sources and withdrawn sources are not counted as records (`cc96676e3`), so the project
home agrees with the Vault tree and the Data room.

### P-18 — Signing authority is assigned, by role, to named people

The signing policy stays as the security review left it (admin, approver, reviewer; P1-44b): a manager's password does
not make a signature. The QA walk found the consequence: `approver` and `reviewer` could not be assigned, so only an
administrator could sign anything, and an administrator who authored a document could not approve it. An administrator
can now assign `approver` and `reviewer` in Admin Access, with a reason, like every membership change. An approver may do
everything a manager may, and sign; a reviewer may do everything a member may, and sign. An author still cannot approve
their own document. A deployment may still widen the policy with `ESIGNATURE_SIGNING_ROLES`.

### P-19 — Every program a client can open has its project record

Programs created after the dossier anchor existed (BX-256, Vorelinib in QA) have no `projects` row, so the schedule,
tasks and AnA's project context answer "no record" for them. Intake creates the anchor in the same transaction as the
program. Existing unanchored programs are anchored by an idempotent statement in the migration set (Rule 1), not by a
laptop script.

The fixer raised three questions about P-19, decided the same day:
- The New Project wizard records an active client-workspace choice, with its name on Configure and Review
  (PM-05, 2026-10-23; [evidence](evidence/D2-PM-CLIENT-INTAKE/2026-10-23/README.md)). With several active workspaces,
  intake requires an explicit choice (409 if missing), even with an organisation default; a sole active workspace
  remains compatible. The project anchor, dossier/submission links and audit commit together under that parent.
  This controls placement and preserves the existing project-sharing policy, including organisation-public visibility;
  it creates no client-portal or sharing grant. Legacy anchor callers retain their existing default-marker policy.
- When a backfilled program's recorded creator is not a user id, its project owner is left empty. Ownership grants
  access, so it is not inferred.
- The demo seeds use the code BX-204 for two different products. The seed's dossier-map project gets its own code;
  demo data must not depend on a code collision.

### P-20 — A safety report never infers what nobody stated

The onset date is stated either as a date or explicitly as unknown; a blank is refused. When expectedness is not
recorded, the expedited-reporting verdict is "not determined: expectedness not assessed", never "not reportable". A
missing determination produces no verdict at all, so it cannot become an unsent 15-day report.

Follow-up decisions on P-20, from the second IND pass (`d155ef099`):
- "Not determined" applies only where expectedness decides the outcome. An event recorded as non-serious, or as not
  suspected, is not expedited on those stated facts, and the verdict says so.
- Every IND submission carries a Form 1571, under 21 CFR 312. A continuing IND sequence is held to its 1.1 form even
  though it is not held to the original's Module 1 list.
- Save to dossier for a program with no project record answers 409, not 200 with `governed:false`.
- No screen matches a program to an application by name, including Dispatch readiness.
- The sponsor address and IND type are stored on the program, in additive columns under Rule 1. Today they are sent
  with each build.

### P-21 — Regulated choices start unstated

Every select whose value lands in a regulated record starts on "Not stated — choose" and sends nothing until chosen. This
covers safety-report determinations, the briefing-book meeting type, the LOA file type, the amendment category and the
forms panel's phase. The filing-target picker pre-selects a sequence only when exactly one is open.

### P-22 — Approval gates the release, not the technical validation

A Vault leaf whose version is not approved and current blocks Freeze, dispatch and transmit. At Validated it is reported
as a warning ("not yet approved"), not an error. Publishers validate while final approvals are still being collected, and
the release gates already refuse an unapproved leaf.

### P-23 — A signature serves only the act it was given for

A signature collected for a freeze or transmit that the server then refuses is void. It cannot be reused later when the
gate clears. Transmit checks a typed application number against the program's recorded one, as the export already does.

### P-25 — Each person manages their own account; administrators manage membership

The 2026-10-08 onboarding fix (`ddc8c0db5`) raised these:
- **An account panel is built.** A person can see their profile, change their password, and enrol or remove an
  authenticator from the shell's account menu. It is a shell surface, so it is inside the launch catalog. The server
  routes already exist (`/password/change`, `/mfa/setup`, `/mfa/enable`, `/mfa/disable`). Without the panel, the
  authenticator that ADR-0014 expects of signers cannot be enrolled anywhere in the product.
- **Removing a member is the organisation-level deactivation.** No "disabled but kept" membership state is added.
  Suspending an account globally stays a platform action.
- **A setup link is re-issued** by re-inviting a member who never activated, through the existing invite route. The
  link is never logged, in any environment.
- **Scopes are derived from the checks that enforce them.** Organisations do not edit them, and the "Edit scopes"
  control does not offer it. Approver and reviewer as SCIM groups come after launch.

Follow-up decisions on P-25, from the account panel (`e6fbacf33`):
- A person's name stays read-only in the panel. It is printed on their future signatures, and the route that writes
  it validates nothing and leaves no audit record.
- `GET /session` names no organisation when the session has none. It must not fall back to "Concept2Cure".
- Now that enrolment exists, ADR-0014 P1-2b is enforced for electronic signatures in production. A signer with no
  authenticator is refused, with "Enrol an authenticator in Account to sign. Nothing was signed."
- Wrong codes at `/mfa/enable` and `/mfa/disable` count against the per-account limit, as at `/mfa/verify`.
- `authService.updateProfile` points at a route that does not exist, and is removed.

### P-26 — A report shows only what an engine computed, for the program asked about

From the reporting fix (`4ac15bdd1`):
- **No program is picked for the person.** With none open, the canvas asks which program the report is for. The
  earlier "flagship" fallback chose by lowest id.
- **Confidence is a measured figure or nothing.** The executive digest does not require one, and finalizes on the
  readiness evaluator's verdict. The evidence & provenance trace does require one, so it stays below final until its
  confidence is the lineage engine's measured provenance completeness. That is a follow-up, and the registry change is
  a new version row, never an edit in place (Rule 1).
- **Packs list only types an engine computes.** Engine-less types are listed once, as "not computed in this release",
  rather than as tiles inside packs.
- **Registers are organisation-wide.** They live in Audit & compliance reports and are not offered on a program's
  canvas.
- An older run with no blockers that was never signed now renders below final and can be finalized. This is
  accepted: it was never final.

Follow-up decisions from the second Submission Center and IND/reporting passes (`d5176f241`, `aac603a1b`):
- **Registers.** The 16 research-compliance registers stay on the canvas, labelled organisation-wide, until each
  becomes a compliance-report definition, sealed and chained like the eight Part 11 reports. They are never left
  unreachable.
- **Trace finalisation.** A trace finalises at 70% measured provenance completeness. Machine-drafted text counts as
  having a recorded origin, as on Authoring's bar. Review state is a separate fact.
- **Pack copy.** A pack's description names only the reports it computes.
- **Form 356h.** Every submission to an NDA, BLA or ANDA carries a Form 356h, so a continuing sequence of those
  types is held to 1.1, as an IND sequence is to its 1571.
- **Protocol reviewers.** A protocol reviewer is assigned only if they hold signing authority, so an assignment
  cannot end at a 403.
- **EU application numbers** are recorded in dash form, as the export and package spine already require.
- **Malformed requests.** A request refused before anything is read voids no signature. Only a refused act does.
- **Report finalize** keeps one authority check: the ceremony's floor. The route's own copy is removed.

### P-27 — Only a person with signing authority signs, and a package carries only recorded identity

From the third Submission Center pass (`b86baf55e`):
- **AnA's e-signature tier requires signing authority.** A member or manager cannot place a document in the dossier,
  revert to a version or submit a document through AnA. Placement through the authoring route is not a signature and
  stays open to authors.
- **Task sign-off on an approval-gated task requires signing authority.** Members and managers are refused.
- **An inspection copy needs a recorded application number.** Until FDA assigns one, an IND's compile fails and says
  why. It does not print a placeholder.
- **The applicant's D-U-N-S number is recorded on the organisation.** A package that needs one is refused without
  it. Until that lands, packages on the sequence path still write `UNASSIGNED-ORG-n` there. That is a known gap,
  tracked as a follow-up.
- **AnA's `package_ectd_for_region` takes the sponsor and application number from the package-identity engine, not
  from model input** (Rule 2). The dry runs (packageability check, `assemble` dry run, orchestrator validation) may
  keep placeholders only because they produce no package. Their output says it is a dry run.
- **One signing-authority policy.** The remaining inline checks (`actions.ts` `signingAuthorityRefusal`,
  `cmc-signer`, and others) move onto `checkSigningAuthority` and are deleted.

Follow-up decisions from the P-27 pass:
- **Signed orchestrator snapshots made before P-27** keep the placeholder applicant inside their signed `index.xml`.
  They are not altered, because a signed record is never rewritten. The signed-package export marks them as not
  submittable. That is a follow-up.
- **An orchestrator run signs only against a recorded submission** whose project's application number matches the
  run's. Without one, a run validates as a dry run and cannot be signed.
- **The MDR/IVDR technical-file assemble and the `submission-ops` package spine** still write placeholder identity
  into real output. They move onto `package-identity.ts` next.
- **The signature record carries the membership role that authorised it**, not the role on the request. A follow-up
  in `esignature` and `document-lifecycle`.

### P-24 — AnA works like Claude, and the client sees the Summary of the work

The founder asked for this on 2026-10-08, with screenshots of Claude's per-task Summary. The design is
`docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md`, and its decisions are recorded there ("Decisions taken"). In short:
- `ANA-SUMMARY` is a founder-directed lane that moves no D-row.
- Order of work:
  - S1: reads deliver what they record.
  - S2: connector search defects.
  - S3: one step label table.
  - S4: the Summary, live and sealed.
  - S5: task attribution.
  - S6: Drive listing and import into the Vault, limited to admin-allowed folders.
- A turn keeps running when the phone locks. This is designed after S4.
- The Summary is visible to whoever can read the thread. The full record stays with the asker and administrators.
- Glyphs are neutral and name their source, with no third-party logos.
- One 5,000-character read window applies to every windowed read.
- Round budgets are unchanged.

### P-28 — CMC / Module 3 ships in the launch catalog, with a composition boundary

Under the founder's delegation of 2026-10-07, and the instruction to decide on client need and platform
readiness. CMC / Module 3 is the eighth launch app (`shared/constants/launch-scope.ts`). An IND without
Module 3 is not an IND, and nothing downstream had ever asked whether the CMC work was done: Projects opens a
"Draft IMPD / CMC (M3)" task for every IND programme, and a sequence carrying Module 1 alone read
dispatch-clear.

**What ships.** The registers (substance, product, methods, specifications, batches, stability, process
validation, change control, comparability, QbD), one deterministic compile, the contradiction sweep, the
fail-closed final-export gate, Part 11 section approvals, governed placement into the program's own IND
sequence, and the Module 3 audit chain. Numbers come from the engines; the model narrates.

**What it refuses, by name, with a 409** (`services/cmc/composition-scope.ts`): a biologically derived or ATMP
substance — ICH Q6B, Q5A(R2) and Q5C are not modelled and Q3A was being applied to biologics; a program the
person recorded as anything but a drug; an NDA, ANDA, BLA or MAA — the 3.2.R location statements are false for
a marketing application, there is no §3.2.S.4.5 / §3.2.P.5.6 justification, and 4-level granularity is
required; an EU or Health Canada CTA — an IMPD Quality part is not CTD Module 3; a Japanese CTN or J-NDA. Each
refusal names Document editor & authoring, Vault (DMS) and the Submission center.

**Entitlement is unchanged.** The app lists its surface and **no module**. A launch app's surface list lifts
the launch-scope lock and `applyLaunchScope` never widens a verdict, so the professional band the product
owner set on 2026-08-24 (`db/migrations/20260824_cmc_professional_tier.sql`), with its grandfather grants,
still decides who holds the module. Listing the module would have `provisionLaunchModules` write an explicit
grant for every new organisation, and a grant outranks tier permanently — overturning a pricing decision as a
side effect of a scope list. Pricing stays the founder's call.

**What is withheld.** The change simulator and the "Filing path by market" matrix are hidden, not deleted:
they are a client-side lookup that contradicts the server classifier and uses post-approval categories that
are wrong for an IND. `POST /api/cmc/variations/classify` and
`GET /api/cmc/projects/:id/process-capability` stay unclaimed — deterministic and sound, but no screen calls
them. An interview whose answers reach no record (protocol, CSR, 510(k), CER, SOP, NDA, BLA) is refused at
`start_intelligence_flow` where the boundary is enforced, because only the CMC specification flow commits.
Calling what CMC produces a "fileable, DTD-valid eCTD Module 3 sequence" is withheld until D7's F00/F02 land,
and calling it "validated" until OQ-008 executes in the W3 posture beside IQ and OQ-001…007 with a named
expert's signature on the reference-record verification.

**What this decision does not do.** It does not write OQ-008. The requirements
are specified (`docs/validation/URS-007-CMC-MODULE-3.md`, 20 requirements with
their sources), but `ci:validation-traceability` refuses a protocol that names
no runner — correctly, since a protocol its runner does not implement is not a
protocol — so no OQ-008 document is filed ahead of one. OQ-007 for Reporting &
analytics does not exist either, so "OQ-001…007" above names a set that is not
yet complete. Both are owed for row D4, with the runner, the local execution
and the expert's signature.

Evidence: `docs/evidence/D2-CMC-LAUNCH-APP/2026-10-12/`, and the slice records under
`docs/evidence/CMC-M3-GA/`.

### P-32 — The IND lifecycle and forms tools are features of Submission Center; agency questions follow when their approval is signed

Decided 2026-10-15 under the founder's delegation ("take them all yourself"), on the proposal in
`docs/design/WORKFLOW_DECISION_2026-10-08.md` §1 item 1. The beta sells the next sequence on a US commercial
IND; an amendment needs its 1571, its cover letter and, often, a Letter of Authorization, and the engines
that build them were behind a locked surface.

**What opens.** The `ind-checklist` (IND lifecycle and forms) surface joins the Submission Center app's
surface list (`shared/constants/launch-scope.ts`). **Modules are unchanged**,
as in P-28: a surface list lifts the launch-scope lock; listing a module would write a grant for every new
organisation and outrank the tier the product owner set. Only the API paths those screens call are claimed:
the `/api/ind-lifecycle` cover letter, briefing book, Letter of Authorization, right of reference, annual
report, amendment and 30-day clock routes; `/api/ind-forms`; `/api/ind-checklist`. Each claimed path has a
screen caller, which a test pins. The screen computes no verdict of its own: readiness is the verdict
`GET /api/ind-checklist` returns (computed by `evaluateIndReadiness` over the section state and lifecycle
issues), and the 30-day clock is `POST /api/ind-lifecycle/clock`; the browser copies of both engines are gone.

**Agency questions (`haq-manager`) stay locked, amended 2026-10-15 on implementation.** Approving a response
there records a status change with no Part 11 signature, reason or role check, and the response package to the
agency is assembled from those approvals. It opens when approval is a signed act. Answers to agency letters
are also third in the beta's job order (`WORKFLOW_DECISION_2026-10-08.md` §1). Its claim is narrowed to the one
prefix it calls and its catalog copy no longer says "signed".

**2026-10-18: approval is a signed act, on the project inbox (rows D2, D5).** The questions on an agency letter
are now `agency_communication_questions` on the project's inbox, worked in Communication and Project home's
Respond, both already in the catalog. A response is approved through the one signing ceremony
(`governed-signed-act.ts`), by someone other than its author, and the signature binds the question and the exact
response text (`agency-response-content-sha256`); approval is read from the signature table, so an edit after
signing ends it. The response package assembles only when every response is approved, through the audited export,
and a letter with recorded questions closes only then. Commitments made in a response name their letter and
question. The `/api/haq-manager` store is deleted; the `haq-manager` screen is a view of the same inbox, claims no
prefix and stays outside the catalog. Opening it as a second home is a catalog decision, not taken here.
Evidence: `docs/evidence/D2-CORRESPONDENCE-SIGNED-RESPONSES/2026-10-18/`. Map of the remaining RIM gaps and
duplicates: `docs/design/RIM_GAP_ANALYSIS_2026-10-18.md`.

**What stays shut, by name.** 15-day safety reporting and ICSR transmission (21 CFR 312.32): every
`/api/ind-lifecycle/safety-report*`, `/safety-reports*` and `/icsr-transmissions*` route is claimed by an
out-of-scope pharmacovigilance surface, so it is refused 403 `LAUNCH_SCOPE` even when unattributed paths are
only reported. The IND screen's safety-report card is hidden, not deleted. `/api/ind-master-data` has no
screen caller and is not claimed. The `/submission/:id/*` register routes stay unclaimed: a prefix cannot
admit them without admitting the safety routes beside them.

### P-33 — One dispatch verdict per sequence; Submission Readiness is that verdict, inside Submit

Decided 2026-10-15 under the same delegation, on `WORKFLOW_DECISION_2026-10-08.md` §1 item 2 and §4 Q3.
Agencies and buyers care whether the sequence passes, not what the screen is called. Submission Readiness
remains a catalog and entitlement entry; what it shows is the one verdict `assessSequenceDispatchReadiness`
computes, which the Submit tab and the Submission Center render.

`server/services/ind-lifecycle/ind-dispatch-gate.ts` is merged into the assessor and deleted. What it
checked and the assessor did not, and how each is carried:
- **A cross-reference with no Letter of Authorization on file** blocks, for every sequence of the IND, as
  the IND gate did.
- **An overdue IND safety report** is a warning, never a block: FDA does not refuse an amendment for a late
  safety report, and a safety-report sequence is never refused for its own lateness.
- **A clinical hold** (21 CFR 312.42) is stated as *not assessed* on every US IND sequence, visibly and
  without blocking. Nothing on the server records a hold, and the IND gate read it from the request body,
  so it blocked every sequence its caller did not describe — including the complete response that lifts a
  hold (312.42(e)). When a hold register exists, an active hold blocks dispatch of anything but a response.
- **Continuing-sequence completeness** (1.2 and the content the sequence type requires) comes from the same
  `validateSequenceLeaves` the IND routes used, not a copy.
- **Not carried, on purpose:** "already dispatched" (transmit requires a dispatched sequence with a clear
  gate, so it would make transmit unreachable) and "missing checksums" (the governed leaf route cannot set
  the column and the packager computes checksums from the bytes, so it would refuse every sequence the
  product builds).

The IND routes keep their paths and answer from the one assessor. A dispatch snapshot records which gate
produced it, so cockpit drift does not report every old row as drifted.

### P-34 — Shadow Review stays a dispatch gate, with a signed human waiver for a provider outage

Decided 2026-10-15 under the same delegation, on `WORKFLOW_DECISION_2026-10-08.md` §1 item 3. A
never-reviewed dossier is not cleared for dispatch, and an AI outage must not stop a regulatory deadline.

- A waiver is offered only when the sequence has **no completed Shadow Review**, and its **newest run failed
  because every AI provider failed or was overloaded**, recorded on the run as a closed failure code within
  the last 24 hours. A model reply that was not an assessment, a governance or placement refusal, a rate
  limit and "no provider configured" are not outages and are never waivable.
- The waiver is a Part 11 electronic signature on the sequence (`ectd-sequence:<id>`, intent
  `shadow-waiver`, meaning responsibility or approval) with its own reason, by a person with signing
  authority who did not author the sequence. It is used once, binds the leaf manifest it was signed over and
  **lapses when the leaves change**; a revoked or lapsed waiver blocks with its own sentence.
- **It never waives an unacknowledged critical finding.** It answers only "no review has run".
- The verdict shows the dispatch as cleared *not assessed by Shadow Review*: who waived it, under which
  signature, because of which failed run. The waiver, the failed run and the freeze and dispatch that rely on
  it are each in the audit chain.
- No AnA tool can waive.

### P-35 — A critical Shadow Review finding is closed by a named person's signature, never by silence

Decided 2026-10-15 under the same delegation, found while implementing P-34. The dispatch gate blocks on
every open critical Shadow Review finding across every run of the sequence, and nothing in the product could
ever close one: the finding's status column had `accepted`, `fixed` and `waived` in its vocabulary and no code
that wrote them. One critical therefore blocked a sequence for ever, even after the sponsor fixed the issue and
a later review found nothing.

- Each open critical finding is dispositioned on its own by a Part 11 signature on the sequence
  (`ectd-sequence:<id>`, intent `shadow-finding-disposition`, the finding named in the payload), with the
  signer's reason, by a person with signing authority who did not author the sequence:
  - **Risk accepted** (`accepted`): the finding stands and the signer accepts going forward with it;
    meaning approval or responsibility.
  - **Fixed** (`fixed`): the signer states what changed. Offered only when a completed Shadow Review ran after
    the finding's run; it does not need to be the clean one, because a model's silence is not proof.
- A later review never closes an earlier critical by itself. The disposition, its signature and its reason are
  in the audit chain and on the finding; the readiness view names who closed each critical and how.
- No AnA tool can disposition a finding. A non-critical finding is not gated and is not part of this act.

Each of P-32 to P-35 lands failing-first with its evidence under `docs/evidence/D2-FOUNDER-DECISIONS/2026-10-15/`.

### P-36 — Submission Readiness is a Submission Center screen, not an app

Decided 2026-10-17 by the founder, from the app audit of that day (`docs/evidence/D2-APP-AUDIT/2026-10-17/`).
The readiness screen reads the same per-sequence verdict as Submission Center's Validation and Dispatch tabs
(`/sequences/:id/dispatch-readiness`), and P-33 already shows that verdict inside Submit, so a separate app gave
one verdict two homes. The launch catalog goes from eight apps to seven: the `dispatch-readiness` surface and its
module move into Submission Center unchanged. The surfaces a client can reach and the modules a new organisation
is granted are the same sets as before (`server/services/entitlements/__tests__/launch-scope.test.ts`). The name
stays as a catalog and entitlement entry. The left rail is not changed: the founder kept Home, Apps catalog,
Tasking and Communication on it (request of 2026-10-16, reconfirmed 2026-10-17).

## Product decisions, 2026-10-18 (under the founder's delegation of that day)

The founder, on the open questions of `docs/design/RIM_GAP_ANALYSIS_2026-10-18.md`: "I will follow you guidance
and SME level intelligence and allow you do make these product level choices." Each is decided on what the launch
customer files (P-28: a sponsor composing small-molecule Module 3 for a US IND) and on Rule 2.

### P-37 — Regulatory information management at launch is the IND sponsor's RIM; registrations, labels and a multi-region planner wait for a marketing application

In the launch catalog, and finished in this order (gap analysis, "Next in-catalog work"): correspondence with the
agency and the signed answer to each question (P-32), the commitments made in those answers and their fulfilment,
submission assembly and the eCTD viewer Submission Center already has (`EctdCompile.tsx`, completed, not
rebuilt: CLAUDE.md RULE 3), and the dossier templates the project wizard
scaffolds.

**Not in the launch catalog: registrations and labels** (`server/routes/rim.ts`, `rim_*`). A launch customer holds
no marketing authorisation and has no approved label: the register would be empty for every one of them, and the
signed label approval would have nothing to approve. `migrations/20260610_rim_lite.sql` stays off the deploy path
and no session builds on it. **Not in the launch catalog: a multi-region submission planner.** P-28 refuses a non-US
clinical-trial application by name, so a plan across markets has one market. Both are reopened together with any
widening of the P-28 boundary to a marketing application or a non-US application, which is the founder's decision.
**A workflow designer** is new capability under Rule 2: the platform's governed acts (signatures, reasons, the
ledger) are fixed and validated, and a configurable one would need its own validation for every configuration.

### P-38 — Agency questions have one home: the letter they came in

`haq-manager` does not reopen as a screen. P-32's condition is met (approval is a signed act), but the same record
is worked on the letter, in Communication and in Project home's Respond, and a second screen would give one
capability two homes (the P-36 reasoning). Its catalog entry keeps no API prefix; the HAQ view inside Communication
reads the project inbox.

### P-39 — The duplicate correspondence and commitment stores converge in this order

Each store moves onto its canonical record and is retired in the same change (zero duplication), with the
deletion record the working agreement requires:

1. **`reg_questions`** (`/api/cmc/agency-questions`), onto `agency_communication_questions`. It is the one inside a
   launch app (CMC / Module 3), and closing a question there is a status update, not a signature.
   *2026-10-19:* converged, and the file made read-only rather than retired: CMC reads a program's Module 3 questions
   from the letters and opens each on its letter, writing none; `/api/cmc/agency-questions` answers 410 to a write and
   the database refuses one (`migrations/20261019b_reg_questions_read_only.sql`); its rows stay as history. The act
   that moves a row not closed there onto a letter is owed, deferred until a deployed estate shows such rows
   (`docs/evidence/D2-CMC-QUESTIONS-ONTO-INBOX/2026-10-19/`).
2. **`c2c_commitments`** (`/api/c2c/commitments`), onto `regulatory_commitments`: an AI extraction with an
   ungoverned create.
   *2026-10-29:* converged. The routes and the service had no client, no AnA tool and no MCP tool, and launch scope
   refused them in production; they are deleted. The table is read-only, and its rows stay as history
   (`migrations/20261029i_c2c_commitments_read_only.sql`). Recording a commitment and moving its status were already
   governed on `regulatory_commitments`. The model extraction is not carried over (RULE 2; G3's no-model rule)
   (`docs/evidence/D2-COMMITMENTS-CONVERGED/2026-10-29/`).
3. **The `c2c_correspondence` family** (`/api/regulatory-correspondence`), onto the project inbox, keeping its issue
   parser and response clock as the inbox's.
4. **`haq_session`**, **`lifecycle_obligations`** and the **`c2c_agency_meetings`** minutes, onto the inbox,
   `regulatory_commitments` and `ha_interactions` respectively.
   *2026-10-30 (under the founder's delegation; inventory in
   `docs/evidence/D2-HAQ-SESSION-RETIRED/2026-10-30/`):*
   - **`haq_session`: converged.** No client has called it since 2026-05-01. Its PUT was reachable in production and
     rewrote a session in place with no reason and no ledger row. `server/routes/c2c/haq-sessions.ts` is deleted, as
     `HAQ_SIGNED_ANSWERS_2026-10-15.md` §3 laid out, and `GET /reviews/pending` moved verbatim to `reviews.ts`. The
     rows stay as history. They are not moved: a session names no letter and the inbox does not invent one, and its
     model drafts and unsigned "finalized" statuses do not carry over (RULE 2).
   - **`lifecycle_obligations`: deferred, and the destination corrected.**
     - Its tables are on no applier, so no deployed database holds a row. Its route and surface are outside launch
       scope.
     - `regulatory_commitments` cannot hold a recurrence or its dated occurrences, so converging onto it would lose
       the capability.
     - It converges when post-approval lifecycle (variations, periodic reports, renewals) enters the catalog, onto a
       register that can hold a recurrence.
     - Owed by the Reporting lane: the `lifecycle.obligation_calendar` report reads these tables, so on a deployed
       database the run fails (an error, not an empty calendar). Install the tables or withdraw the report type.
   - **`c2c_agency_meetings` minutes: no data to move, and decided.**
     - Nothing in a deployed organisation writes them, and the route and surface are outside launch scope.
     - When Communication records a meeting (`ha_interactions`, whose governed create exists), its minutes are an inbox
       letter (`source_type` `meeting_minutes`, already in the vocabulary) linked to the interaction. Its agreements
       and commitments become that letter's questions and `regulatory_commitments` (`meeting_commitment`).
     - `c2c_agency_meetings` and the Agency Meetings surface retire in that change.

### P-40 — A sealed editing copy is revisable, and the refusal says so

Decided 2026-10-19 under the founder's delegation of 2026-10-13 (document creation and editing).

A QMS register entry at `draft` whose bound editing copy had been frozen or approved could go **nowhere**. It
could not be sent for review — correctly, because `decideAuthoringPermission` refuses an edit of an immutable
document ahead of every grant and bypass, which is what keeps the freeze meaningful. And it could not be revised:
`reviseControlledQmsDocument` admitted `effective`, `retired`, `superseded` and `in_review`, not `draft`. There is
no unfreeze anywhere (a freeze is the platform's one signing ceremony, DP-35 / P1-32) and no new-version route on
the authoring side at all, so the frozen message's own remedy — "Create a new version to make further changes" —
had nothing behind it.

**A `draft` whose editing copy is sealed is revisable, and nothing else about `draft` is.** A revision is what
"create a new version" means here: the sealed text is copied onto a new editing copy, the version is bumped, the
old document id is retained in `metadata.retainedAuthoringDocuments`, and the seal and every signature over it are
untouched. The condition is the seal, because without it this would be a free version bump on any draft — a new
door, not a remedy.

**The refusal names it.** `requireContentAccess` collapsed every permission outcome into 403
`QMS_DOCUMENT_PERMISSION_DENIED`, "You do not have permission to read or change this authored document" — said to
the owner-administrator of a sealed document, which is false and names no way forward. The decider already returns
`document-immutable` separately; that is now a 409 `QMS_DOCUMENT_SEALED` which says the text is sealed and points at
the controlled revision. Naming a remedy that did not exist would have repeated a mistake this lane had already
made once, so the two halves ship together.

**What was NOT changed, deliberately.** The seal still refuses the send-for-review and the rename; `IN_REVIEW`
remains a non-sealing status, because review is a state a document is edited during and the review board finds its
work by `upper(d.status) = 'IN_REVIEW'`. The two disagreeing definitions of which statuses seal content —
`LOCKED_DOCUMENT_STATUSES` (two) in `document-lock.ts` against `IMMUTABLE_DOCUMENT_STATUSES` (eight) in
`authoring-permissions.ts` — are recorded as open, not reconciled here: both are load-bearing in different places
and each list has mutants that open a real hole.

### P-41 — A PMR, PMC or REMS is recorded fulfilled by a signature that names what met it

Decided 2026-10-19 under the founder's delegation of 2026-10-18. Recording a postmarketing requirement, a
postmarketing commitment or a REMS as fulfilled takes the obligation off the overdue register and out of the annual
status report (21 CFR 314.81(b)(2)(vii), 601.70; FD&C 505(o)(3), 505-1). It is an attestation, so it is a Part 11
signed act, as the platform's comparable acts are (label approval, a QMS document becoming effective, the Shadow
dispositions of P-34 and P-35, an agency response's approval under P-32): meaning approval or responsibility, the
signer's reason, password and second factor, through the one ceremony (`server/routes/governed-signed-act.ts`
signGovernedAct). The signature names the dispatched sequence the agency received (sent or acknowledged), or the
Vault version that met it at its sha256, or both, and the date, and binds them
(`BINDING_BASIS.COMMITMENT_FULFILMENT_CONTENT`). The database holds it: a fulfilled PMR, PMC or REMS commits only with
such a signature written by the same transaction, by the person recorded, over the same evidence and date; a
commitment's type never changes, so a PMR cannot be retyped out of its signature; and a recorded fulfilment cannot
change or be hidden by an UPDATE (`migrations/20261019_commitment_fulfilment_evidence.sql`). It does not hold the
record against a hard DELETE by the runtime role, which the tenant purge needs; a delete guard needs a purge door
with it.
A meeting commitment or other is fulfilled by a governed write with a reason; what met it may be named. AnA cannot
sign, so its fulfil tool refuses a PMR, PMC or REMS and points to Communication, Meetings & commitments. There is no
separation of duties: the signer attests to the record, not to another person's work. Correcting a fulfilment
signed in error (§11.70 supersession, or a reopen) is owed. Evidence: `docs/evidence/D2-COMMITMENT-FULFILMENT/2026-10-19/`.

### P-42 — A later Vault version files as the `replace` of the version on file

Decided 2026-10-22 under the founder's delegation of 2026-10-18. It closes the question WO-9 §20 left open (D7, Click
6): how a revised document reaches a follow-up sequence as an eCTD `replace` of what was filed. A declared replace
bound to the filed leaf by section plus file name, and a Vault version's file name carries its own uuid, so version 2
of a filed document never matched version 1's leaf. Declared `replace`, it was left out ("no filed leaf named … to
supersede"). Placed as `new`, it shipped beside the filed version, and the agency would have held both as current.

**The recorded lineage is the binding.** The Vault records each version's predecessor at check-in (VR-08). The
database admits that link only within one document: same program, document code and organization, and one live
successor. A Vault leaf whose own file is not on file in its section binds to the one filed leaf there carrying a
recorded earlier version of the same document. Declared `replace`, or placed as `new`, it files as a `replace`;
declared `append`, it files as an `append`. Either way its `modified-file` names that leaf, and the new version ships
under its own name. A withdrawal naming the current version withdraws the earlier version that is on file. The
folded prior state takes the superseded leaf off file whatever its name, so the next sequence holds only the new
version, and the IND checklist's inventory counts it once.

**Never guessed.** Each of these leaves every version concerned out, named in `skipped`, which blocks transmit:

- two filed leaves carrying earlier versions;
- two versions of one document in one sequence;
- a version beside an act on its own filed predecessor.

A link the database rules refuse is not lineage. Withdrawing the filed version and placing the new one as `new` in
the same sequence is honoured as declared, in either placement order.

**Not changed.** No signature, approval or freeze. P-22 still holds freeze, dispatch and transmit until the leaf
names an approved, current version.

**Still open: authored documents.** An approved authored document is frozen and has no new-version route; P-40 covers
a QMS draft only. A revised authored section therefore cannot be filed as a `replace` of its filed leaf. It is
withdrawn and placed again, which is the decision for the founder with the authoring lane.

Code: `server/services/ectd/version-lineage-binding.ts` and its callers in `package-from-core.ts`,
`prior-sequence-loader.ts` and `ind-checklist-view-assembler.ts`. Evidence:
`docs/evidence/W5/2026-10-21-ind-reference-lane/`.

## Product decisions, 2026-10-22 (CPO, under the founder's mandate of 2026-10-01)

### P-43 — The hosted deployment refuses every operator override at boot; a self-hosted install keeps its written acceptances

The `*_ACCEPT_*` variables (`AUDIT_SEAL_ACCEPT_UNSEALED`, `AI_GOVERNANCE_ACCEPT_PERMISSIVE`, `STORAGE_ACCEPT_LOCAL_DISK`,
`CONCEPT2CURE_SIGNER_ACCEPT_HMAC`, `AI_GATEWAY_ACCEPT_DETERMINISTIC` and any later one) each switch a production
refusal off on the operator's written word. MR-03 SEC-18 proposed refusing them in every production boot. Done
literally, that would stop the canonical self-host install (`docker-compose.yml`, "the install SKU"): with no KMS and
no object store it runs on an HMAC signer and a local volume, and it says so through exactly these variables. The
hosted product never needs one: it has a KMS signer, an S3 vault and a sealed chain.

So the line is drawn by where the process runs, not by `NODE_ENV`:

- **Hosted (an ECS task).** The boot refuses any `*_ACCEPT_*` variable set to anything but `false`, and
  `AUDIT_REQUIRE_ENFORCE=false`. It recognises ECS by `ECS_CONTAINER_METADATA_URI_V4`, which the ECS agent sets in
  every task and a task definition cannot remove. The deploy preflight already refused these by name before a revision
  rolled (`deploy-aws.yml`); the boot now refuses them too, so a revision registered or edited outside the pipeline
  cannot run with one.
- **Self-hosted (compose, Helm, the CI single-container boots).** Each acceptance stays what it was: an explicit
  operator statement in the install's own configuration.
- **Everywhere in production:** `ENABLE_TEST_ROUTES` is refused, like the dev, mock and demo route flags before it.
  Nothing sets it, and test routes have no production use. `AUDIT_REQUIRE_ENFORCE` defaults to enforce: a production
  process whose tamper-proof audit trail is off refuses to boot unless the operator writes `AUDIT_REQUIRE_ENFORCE=false`,
  which only a self-hosted install may.

No CI escape variable is added. The CI boots are not ECS tasks, so they keep working without one, and an escape would
be one more override to guard. Evidence: `docs/evidence/MR-03/2026-10-22-stage-2/`.

### P-44 — A package carries its own market's application number; the project's number is its home market's

Decided 2026-10-22 under the founder's delegation of that day ("You decide and continue"). It answers the open question
of the package-identity rule's owner (`b86baf55`; FILING_SPINE F22): a project records one application number
(`regulatory_programs.application_number`), and every package read it, whatever its market.

That was a live defect, not a hypothetical one. The EU packager writes the number verbatim into `<procedure-number>`,
JP into `<application-number>` and CA into `<dossier-id>` (`regional-packager.ts`). So an MAA added to an NDA project
(F22) would be compiled, exported or transmitted under the US NDA number. AnA's `package_ectd_for_region` did the
same for any region it was asked for.

- **The project's number belongs to its home market**, the market of its primary agency. It is never written into
  another market's package.
- **A submission for another market carries the number its own agency assigned**, recorded on that submission
  (`submissions.application_number`). A home-market submission keeps reading the project's number, so there is one
  source for each number and no second copy of either.
- **Until a market's number is recorded, its packages refuse by name.** This covers compile, export, transmit and
  AnA's package tool. Nothing borrows another market's number. Dry runs keep their placeholder (P-27).
- **The number is recorded by one governed act.** It takes the project lead or an organisation manager, a stated
  reason, a chained audit row that names the old and new value, and the existing identifier rules (`usableIdentifier`;
  six digits when the market is FDA). A home-market submission is refused there: its number is the project's.
- **AnA packages a project's home market only, from the record.** For any other region it refuses and points to the
  submission that market's package is built from.
- Not decided here, and handed to the identity lane (MR-10 Stage 4): `REGULATORY_IDENTIFIER_PATTERN` refuses the slash
  that EMA's `EMEA/H/C/…` form carries, while rule EMA-CESP-002 expects it.

### P-45 — The Planner's multi-region compare (F21's remainder) waits until after D10

Decided 2026-10-22 under the same delegation. F21's remaining part is the Planner calling `POST /api/submissions/:id/plan`
with a "Compare with". The defect F21 existed for, the Cross-region model verdict (a model producing a verdict, Rule 2),
was retired on 2026-10-08. What remains would put a new multi-region comparison in front of a route that has no client
caller at head. That is new capability, and no launch row needs it (Rule 2). An added market's own Module 1 outline
(F22b) is where a filer now sees that market's sections. `WORKFLOW_DECISION_2026-10-08.md` §6 already places F21 after D10.

When it is taken, one rule applies from its design. A region the reasoning engine holds no rules for shows "No rule data
for <agency>" and no sections. Today `buildSubmissionStructure` answers such a region with FDA's sections, discloses
the substitution in a note, and still marks it `supported: true`. AnA's two tools that call the engine read that answer,
so F21's design owns correcting `supported` for a proxied region.

### P-46 — Vault saved views are both personal and organisation-wide; filters and counts are scheduled now

Decided by the founder, 2026-10-22. Asked "Should a saved view belong to one person or the whole organisation?", the
founder answered **"Both"**, in the same session as the direction to close the gap with Veeva ("Continue as we need to
close the gap between what we have and what Veeva offers here"). That direction also amended FD8 in
`docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md` §5: facets (VR-18) are no longer deferred, and the parity plan's
§6 exclusion of saved searches and views no longer holds for the Vault.

- **A personal view** is seen, renamed and deleted by its owner only.
- **An organisation view** is seen by every member of the organisation. Who may create, rename and delete one is set by
  the saved-views design, which must start from its What already exists section: the one saved-query store today is
  `saved_precedent_queries` (precedent-only, off the deploy path, and editable by any member).
- **A view stores parameters, never results or counts.** It holds the text, the metadata filters the search already
  validates, and whether it is one project's view or the library. A view naming a project or a folder is re-scoped
  when it runs. A project the reader can no longer open contributes nothing, and a folder must still be in that
  project's cabinet. A view can never hold a filter the search would refuse.
- **No fixture or browser-only store.** The deleted views (`ProjectsListFilters`, `AdvancedSearchPanel`) kept views in
  `localStorage` or fixtures. A Vault view is a tenant-scoped server record.
- Filters and facet counts on the one Vault search landed the same day (`docs/evidence/D2-VAULT-SEARCH/2026-10-22/`,
  `…-find-view/`, `…-facets/`).

## Product decisions, 2026-10-25 (founder)

- **Who may change an organisation view (left open above; answered 2026-10-29 by the saved-views design,
  `docs/design/VAULT_SAVED_VIEWS_2026-10-29.md` §3.3, as the founder's delegated product call).** Any member may
  save a personal view, viewers included, because a personal view is a search remembered. Publishing to the
  organisation, sharing a personal view, and changing a shared view's parameters take a writing role and are the
  creator's. An organisation manager may rename or delete any organisation view. The creator may always withdraw
  their own (make it personal, or delete it), even after losing a writing role. A view is a preference, not a
  governed record: no chained audit row, with the creator, last editor and time kept on the row. The day a view
  drives a governed act it becomes a governed record, audited and versioned.

### P-47 — A client starts at their projects; features live in the project, not in an app list

Decided by the founder on 2026-10-25, after testing the product as a client and finding they could not tell how
to use it: "I have no idea what we're doing with apps, what the apps do, how to use them, when to use them."
What was built are features within a client's regulatory project, not separate applications. The design, the
findings and what already existed are in `docs/design/CLIENT_JOURNEY_2026-10-25.md`; evidence in
`docs/evidence/D2-CLIENT-JOURNEY/2026-10-25/`.

- **The left rail** is the five places a client works in (Home, Projects, Tasks, Communication, Vault), then a
  *Work areas* group: CMC / Module 3, Quality, Reporting & analytics. This replaces the rail the founder kept on
  2026-10-16 and 2026-10-17 (P-36's last sentence). Tasking and My work are one entry. Submission Center opens
  from a project's Submit step. The rail starts open, with labels.
- **The module catalog** ("Workflows", formerly "Apps") is **Plan & features**: an organisation administrator's
  licensing view, in the account menu. Its entitlement logic and governed writes are unchanged; Home no longer
  links to it.
- **Home** is where a client starts: their projects, their tasks, Ask AnA, their recent conversations.
- **Risk-based monitoring and Biostatistics** are work areas by the founder's model and join the rail's *Work
  areas* when each is in the launch catalog. Not before (Rule 2).
- **Inside the project** (pass 2, the same day): a project with no documents opens on Evidence; each step states what
  to do now and offers the next step; Author offers CMC / Module 3 and Submit the IND forms for a US IND, each opened
  on the project.
- **Plan** (pass 3, the same day; founder decisions 3 and 4): the project's first step, and where a new project opens.
  It holds what the filing needs — for a US IND every deliverable of the IND plan of work by phase, each started from
  its template, the phases that a feature composes opening it (Module 3 → CMC / Module 3, Module 1 → IND forms); for a
  device filing its workstreams — with **Assign** writing one task for one person with a due date to the one task
  store, then the team and the project's tasks, moved from Author. No new store, catalogue or route.
- **Nothing in the catalogue is lost** (the founder, later the same day): "we must not lose any functionality that
  is in our apps catalog, but take all that and place it in the core product, and get away from calling the needed
  functionality and features apps." Every capability of every catalogue entry gets a home in the product — a place,
  a project step, a document's build, AnA, or administration — and a duplicate is folded into its canonical
  capability only after each of its functions is shown to exist there or is carried over (no retirement by
  deletion). "App" leaves the product's words for these capabilities. A capability is shown to a client in its home
  when it works on the client's real data; until then its home says it is coming, in words (fail closed).

Launch scope, module grants and every route are unchanged by this decision.

### P-48 — The QMS app holds the quality records a biotech keeps: CAPA, nonconformances, suppliers, internal audits, management reviews

Decided 2026-10-29 by the founder ("we need to offer everything www.weave.bio does and much more plus what Veeva
basics offers biotechs"). The QMS app was controlled documents and change control. Veeva QMS Basics also keeps
deviations, CAPA, the approved supplier list, internal audits and management review. The nonconformance register is
product-keyed (a product or material, a lot): a deviation with no product, such as a missed environmental-monitoring
reading, has no record of its own yet, and the QC deviation routes (`server/routes/qc.routes.ts`) are a stub with no
store. Whether deviations get their own record is open to the founder. The routes for all four
were already in `server/routes/mdx-qms.ts`, built with the device QMS. Their tables are on the deploy path
(`migrations/20260511_qms_and_labeling.sql`), they are tenant-scoped, writes need editor access, and every write
records its audit row. No screen called them. The launch scope refused them in production as "HIDDEN APP".

The four become tabs of Quality (`client/src/concept2cure/quality/QmsRecords.tsx`). Their paths leave
`LAUNCH_EXCLUDED_API` and fall under the quality surface's existing `/api/mdx/qms` claim. The catalog entry keeps its id,
surface and module (`qms`, `quality`), so no grant changes. CAPA is reached the same way. Its register already existed
(`server/routes/capa-mdr.ts`, tables `capa_records` and `capa_actions` from `migrations/20260504_capa_mdr.sql`). Its routes
were already in the launch scope through `device-postmarket`, a device-project feature of Projects since 2026-10-23, but
no Quality screen reached them. *(Corrected 2026-10-29: this entry first called that surface hidden.)* The quality
surface now also claims `/api/capa-mdr/capa`, so Quality reaches CAPA for every project type. Complaints, MDR and
vigilance stay with device post-market. The CAPA lifecycle map moves to
`shared/constants/capa-lifecycle.ts`, so the server enforces and the screen offers one set of moves. Evidence:
`docs/evidence/D2-ONE-ANA/2026-10-29/p48-quality-records/`.

### P-49 — Training on a controlled SOP is assigned by role and by name, opens at approval, and reaches the people assigned

Decided by the founder, 2026-10-29, answering MR-12's NEW-2 and NEW-3 and the distribution question in
`docs/design/PARITY_WEAVE_VEEVA_BASICS_2026-10-29.md` §8 item 8 (the recommendations, chosen as offered):

- **Assignment (NEW-2): roles, plus named people.** Each controlled document lists the job roles and any named people
  who must train on it. The organisation manages its own list of job roles; a role is a job function (QA,
  Manufacturing, Clinical Operations), not a permission role, so assigning by role never means "everyone with access".
  Curricula (sets of documents assigned to a role together) can be added later without moving data.
- **Training before the effective date (NEW-3): yes, once approved.** Between approval and the effective date is the
  training period. An acknowledgment of an approved version binds that version's digest and release signature, and it
  counts toward compliance from the moment that version is in force. Nothing counts toward a version that is not yet
  in force.
- **Distribution: the people assigned.** When a version is approved, each person it is assigned to (by role or by
  name) receives a task to read and acknowledge it, due by its effective date. The task uses the existing
  deadline-task infrastructure; there is no second scheduler. Nobody else is notified.
- **Compliance counts the assigned people.** The denominator is the distinct people assigned, the numerator their
  unexpired acknowledgments of the version in force. A document assigned to nobody reads "not assigned", never 0/N.

Not decided here: MR-12 NEW-4 (review quorum and the retirement meaning).

### P-50 — Training: a 14-day grace for late assignment, assignment grants reading the released version, and personal training status is QA's to see

Decided 2026-10-29 under the founder's delegation of that day ("You can make founder decisions"), answering the three
questions `docs/design/QMS_TRAINING_ASSIGNMENT_2026-10-29.md` §1.4 left open within P-49:

- **Q1, late assignment: 14 days.** Someone assigned after a version is already in force is due 14 days after they are
  covered (`TRAINING_LATE_ASSIGNMENT_GRACE_DAYS = 14`). A version approved ahead of its effective date keeps P-49's
  rule: due by the effective date. Due "today" would make every new hire overdue on their first day; Veeva offers
  "N days after assignment" for the same reason.
- **Q2, reading what you must train on: yes (the design's D3).** An active person covered by a live assignment may
  read, through the training reader only, the immutable signed snapshot of that document's version in force and of
  its pending version. It grants nothing on the editing copy, the editor, the versions route or the project. A task
  nobody can complete is not distribution.
- **Q3, who sees each person's training status: the person, administrators and designated QMS approvers.** Every
  other member sees the coverage counts ("x of y assigned"), not names. Training status is a personnel record; a
  colleague's lapse is QA's business, not the whole organisation's. The per-person reads (`GET /qms/training`, the
  expiry list G10, the outstanding-training list) apply this when compliance moves onto assignments (the design's
  slice 3).

### P-51 to P-57: decided under the founder's delegation of 2026-10-29

The founder delegated, on 2026-10-29: "make founder level decisions based on the best situation for the platform and
our paying clients and human users … we're not ready for ETMF or CTMS. You could park those completely … We're
focusing on completing what we have started and perfecting it all." These decide the questions that sessions had
left open (`docs/design/PARITY_WEAVE_VEEVA_BASICS_2026-10-29.md` §8,
`docs/work-orders/MR-12-qms-controlled-document-control.md` NEW-2 to NEW-4, and
`docs/evidence/D2-FILING-TYPE-TEMPLATES/2026-10-18/FOUNDER-DECISIONS-OWED-2026-10-26.md`). Training assignment,
training before the effective date and distribution (MR-12 NEW-2, NEW-3; parity §8 item 8) are P-49, the training
lane's, and are not decided again here. *(Corrected 2026-10-29: this block first carried its own training entry and
numbered the deviation decision P-49, then P-50; both numbers were taken by the training lane's P-49 and P-50 as these
landed, and those govern. The deviation decision is P-57.)* The
test for each was:
does it complete something already in the catalog, for the client who pays for it, without widening the catalog?
None widens it.

### P-51 — Review and approval follow the review-routing decision; retirement has its own meaning (NEW-4)

NEW-4 was decided on 2026-10-29 by the review-routing coordinator, under the founder's delegation of 2026-10-07
(`docs/design/REVIEW_ROUTING_2026-10-23.md` §4, with D-Q in §7). RR4 is building it. For a QMS controlled document:
- at least one approver holds the QMS approver designation, and that approver is not the author or a contributor;
- reviewers are optional; when any are named, all of them sign before the approval;
- sending for review is a governed act with a reason, not a signature.

That decision stands and is recorded here. *(Corrected 2026-10-29: this entry first read "review is a signed act; the
same person may review and approve", written before the review-routing decision was found. That decision governs.)*

What NEW-4 left open is retirement's meaning. Retirement is signed with its own meaning, `retirement` ("you withdraw
this document from use"), not `approval`. Stored retirements keep the meaning they were signed with. This unblocks
MR-12 Stage 5 step 3. Stage 7's review step is RR4's.

### P-52 — Controlled output: Letter, the FDA PDF specification, a default confidentiality line (MR-09 NEW)

- Page size is US Letter, because the launch boundary is a US IND (P-28).
- The PDF target is FDA's PDF specification for eCTD: PDF 1.4 to 1.7, fonts embedded, no security settings.
- The default footer reads "CONFIDENTIAL. Proprietary information of {organisation}. Do not distribute without
  permission." An organisation may change it.
- This unblocks CAT1-09 and template formatting (W5).

### P-53 — Parked, with no sessions

- eTMF;
- CTMS;
- safety case processing and E2B;
- EDC;
- an NDA workflow;
- re-admitting the Template Library;
- any widening of P-28's composition boundary.

Safety and EDC are "partner or integrate" when they return, and no partner is approached now. eTMF is not a source
for `assess_inspection_readiness`, which answers from stated inputs, labelled (2026-10-26 list, row 9).
(Parity §8 Q9, Q10, Q11.)

### P-54 — Lanes, order and scope corrections

- **Lanes released.**
  - The Weave-gap lane's items (G2, G3, G6, G15, and G11 and G17 with them) are released to the next free session.
  - The training-assignment lane is not released: it is active, and landed P-49 on 2026-10-29.
- **P-39's order stands.** Commitments converge (step 2) before the correspondence family (step 3), so G3's parser
  waits; zero duplication outranks speed.
- **Device post-market stays in Projects**, as P-48's correction of 2026-10-29 already reads (Q6).
- **SSO signing (MR-09 Stage 6) keeps its phase.** It moves to Phase 1 only if a signing customer signs in through SSO
  alone (Q12).
- **Support for D9** is the drafted Mon–Fri 08:00–18:00 US Eastern (Q13).
- **Claims policy confirmed (Q14):** no claim of doing everything Weave does, and §4's claims only with their basis.
- **The old IND briefing-book assembler goes.** Its replacement is `IndBriefingBookStart.tsx`, starting the US
  meeting-package templates (5894e1aaa). The server routes and service it called are deleted once a search shows
  they have no caller.
  *2026-10-30:* deleted. Agency Meetings, the last caller, opens the editor's meeting package instead
  (`docs/evidence/D2-BRIEFING-BOOK/2026-10-30-assembler-retired/`).

### P-55 — The Authoring questions of 2026-10-26 are decided as recommended

Rows 1 to 22 of `FOUNDER-DECISIONS-OWED-2026-10-26.md` are decided as each row recommends:
- a conditional heading may be recorded not applicable, with a reason and the approver's signature;
- R-1: 2.4 and 2.6 read `nonclinical_studies`, counting `in_reporting` for an IND and never `planned` or `cancelled`.
  The ingest path converges onto it;
- 2.6's tabulated summaries are a preparation worksheet;
- calculators over stated inputs stay, labelled `basis: 'stated'`;
- no standalone QOS, drug substance or drug product project;
- folds only after their functions are carried over, and the digital twin is retired;
- the M2, M4 and M5 QC rules are carried into Submission Readiness as named findings, not a score;
- and so on through row 22, each as its row recommends.

The guideline hosts in row 14, and §8 Q15's network access, are owner actions in the environment settings, not
decisions.

### P-56 — No model is approved until the PQ evidence exists

PQ-DRAFT-001 stays unapproved until P-31's items 4 and 6 land:
- item 4, gold-bank coverage for CMC / Module 3 and Module 2.5 to 2.7, authored from real source text and never
  invented. It is scheduled as a W3 slice;
- item 6, a product provider key, which is an owner action.

Then approval is a signature, with P-31 as its reasoning. Until then, production refuses governed drafting and every
drafting claim says "staging". Approving a model without its evidence would give a paying client a qualification
their own QA would reject. (Parity §8 Q1.)

### P-57 — Deviations are their own record in Quality

A GMP deviation is a departure from an approved procedure or instruction (21 CFR 211.192, 211.100(b); EU GMP
Chapter 1, 1.4(xiv)). It is often not product-keyed: a missed environmental-monitoring reading, a skipped step, an
out-of-window calibration. The nonconformance register is keyed to a product or material and a lot, so it cannot hold
one. Veeva QMS Basics keeps deviations, and P-48 already named them. The Quality app gains a deviation register:
- classification as minor, major or critical;
- what happened, where and when, and the procedure departed from;
- immediate action, investigation and root cause;
- the impact on product or batch, when there is one;
- a CAPA raised from it, through the existing `raiseCapaFrom`;
- closure as a signed decision, through the one signing ceremony.

The store is `qc_deviations`, as `shared/schema/qc-schemas.ts` has defined it since the QC module. No migration had
ever created it. `migrations/20261029g_qc_deviations.sql` creates it with `client_workspace_id` nullable, because a
Quality record is the organisation's, and appends it to `C2C_MIGRATION_FILES` before the final sweep pair (Rule 1). It
is public with `organization_id INTEGER NOT NULL`. *(Corrected on building: this entry first said "a new public table";
the existing definition is reached instead, under Rule 3.)*

The `/api/qc/deviations` routes (`server/routes/qc.routes.ts`) and both storage implementations behind them are deleted
in the same change: the in-memory one that answered 501, and a database one over the table that did not exist. They
would have become a second writer of the record. Their OOS stub stays, because OOS is not a deviation. The
nonconformance tab stops being described as deviations. (Parity §8 Q5; slice G16.)

### P-58 to P-69: decided under the founder's delegation of 2026-10-29 (regulated clients and longevity)

A second delegation the same day: "make the best decisions based on our highly regulated clients and their needs and
the longevity of our product for our clients, which are biotech, pharma, medical device, diagnostic, and so forth."
*(These were first written as P-51 to P-62 in a session working beside the block above, which took P-51 to P-57 as
both landed; they are renumbered, and the commits that introduced them name the old numbers.)*

### P-58 — A departing tenant's regulated records leave with the tenant, after custody passes to the customer

Decided 2026-10-29 under the founder's delegation of that day ("make the best decisions based on our highly
regulated clients and their needs and the longevity of our product"). The question came from
`docs/evidence/D6-TENANT-PURGE-BLOCKING-KEYS/2026-10-29/`: 18 tables are held out of the tenant purge
(`PURGE_REFERRERS_NOT_ERASED`), so a tenant holding a signature, an audit row or an approval cannot be purged at all.

- **Every held record is exported, then erased with the tenant.** That covers `electronic_signatures`,
  `document_audit_trail`, `immutable_report_records`, the account and outcome logs and receipts,
  `evidence_chain_records`, `data_lineage_records`, `governance_boundary_transitions`, `gate_approvals`,
  `cer_approvals`, the IVDR Part 11 histories, `reg_questions`, `review_routes` and their route tasks. The export
  carries each chain's integrity verdict and each signature's manifest, so the customer can show an inspector that
  the copy is whole.
- **Custody is a signed act.** Before the purge erases a held record, the customer's administrator signs that they
  have received the export and taken custody of it. Where the organization's retention period has not elapsed for
  any record, the attestation names those records and the customer accepts the retention obligation.
- **The platform keeps one offboarding certificate per tenant**: the export manifest's hash, the counts per table,
  the custody signature and the purge time. No customer content.
- **A table whose trigger refuses DELETE is erased through a reviewed purge door** (SECURITY DEFINER, platform
  scope, `pending_deletion`, no active legal hold), as `purge_tenant_vault_seals` is. A session-settable setting is
  never a door.

Why: retention is the sponsor's and the manufacturer's obligation (21 CFR 312.57 and 312.62, 21 CFR 820.180 and ISO
13485 §4.2.5, EU GMP Annex 11 §17), and the platform is their processor. A customer can only keep their records for
years if they leave with a complete, verifiable copy. Records a vendor keeps after the customer has gone cannot be
inspected by that customer and remain a data-protection liability. Erasing them before custody passes would break
the customer's retention. So: export, sign for custody, then erase.

### P-59 — The review-route guard admits a role, not a session setting

`unified_tasks_route_rows_guard` (`migrations/20261023_review_routes.sql`) lets any session that sets
`c2c.review_route_writer = 'on'` past it, and the runtime role can set it (`guc-probe.txt` in the purge evidence). It
converges on the platform's pattern for append-only guards: a NOLOGIN role that only the route writer's path
assumes, as `ana_run_events_purger` does (`20261008f_ana_run_events.sql`). The file is amended in place (Rule 1), and
the tenant purge reaches route rows through a door (P-58), not the setting. Why: a signed review workflow is a
Part 11 record, and a control any session can switch off is not a control.

### P-60 — Design history and design changes are kept per product

Engineering's change-request panel reads the QMS change-control register (`qms_change_controls`) by a project key.
`change_requests`, which nothing writes, leaves the panel. The DHF panel reads the project's own document sections
(`c2c_document_sections`); the organization's one-kit store (`cerv2_510k_sections`) is not shown under a project.
Why: a device or diagnostics company runs several products, and their design history file and design changes are
per product (21 CFR 820.30(j), ISO 13485 §7.3.10). Change control has one register (zero duplication).

### P-61 — The device folds' five decisions (`docs/design/DEVICE_FOLDS_2026-10-29.md`)

1. **One device-filing store: `estar_submissions`.** It is on the deploy set and admits the project.
   `c2c_submission_packages`, whose creator is on no applier, is migrated behind `to_regclass` guards and retired.
2. **No organization-wide blocker list.** Blockers belong to a filing, from that filing's deterministic readiness
   (EstarFilingPanel). `device-validation` and its `c2c_blockers` list retire. Its "Pass" for low-severity
   blockers is not carried: a blocker is closed by fixing it or by a named person's signed waiver.
3. **Device analytics joins Reporting & analytics at its tier (standard).** Reporting is a central service for
   every client type (decision of 2026-09-26). It reads accessible projects only.
4. **Grant continuity, not new grants.** A subscription to a folded module entitles its holder to the fold's target,
   through one mapping in code that the entitlement resolver reads (`FOLDED_MODULE_SUCCESSORS`). No grant row is
   written and subscriptions are kept. This covers risk and design-controls into device-engineering, ivd-completeness
   into device-diagnostics, and every fold already made (device-vault and artifacts-center into vault,
   part11-console into audit-trail, ana-memory into conversation-thread, setup into admin-console, ectd-publishing
   into ectd-compile, billing into licensing). Why: a customer who paid for a capability keeps it when its screen
   moves.
5. **Device workstream into Projects** shows only figures computed from the project's own records; any strip figure
   no engine computes is dropped. The Client Review Room admits the project (`admitProject`) before anything is read
   or shared.

### P-62 — A project's CMC data has one home: the CMC / Module 3 register

The CMC data that `GET` and `PUT /api/concept2cure/projects/:projectId/cmc` keep in project metadata converges on
the CMC / Module 3 register (`server/api/cmc`). Its one reader (`server/routes/c2c/tasks.ts`) moves onto the
register, and the routes retire. Why: two CMC answers for one project is a filing risk (zero duplication).

### P-63 — Signed content is not edited in place

An approved or effective label, an approved translation and an accepted hazard refuse edits to the fields their
signature binds (the content-digest recipes of `84aada8f7`). A change is a new version or a reopening, signed in its
turn. "Changed since it was signed" stays as the detector for records signed before this rule. Why: a signature must
stay attached to what was signed (21 CFR 11.10(e) and 11.70), and controlled records change only under change
control (21 CFR 820.40, ISO 13485 §4.2.4).

### P-64 — A translation's approval binds the source it translates

The translation recipe (`labeling-translation`) moves to v2: it binds the source document's version and content
digest as well as the translation. Why: a translation is valid only against the text it translates; approving it
against a later source would be approving the wrong thing. RIM's label approval (`rim-product:`) binds content too
when RIM reopens (outside the launch catalog under P-37; no session now).

### P-65 — An audit-chain verdict is for those who may review the audit trail

`GET /api/part11/audit-trail/chain-integrity` takes the gate the ledger takes (`requireAuditReader`). Why: audit
trail review is a role-scoped duty, and both of Audit trail's verdicts should answer to one policy.

### P-66 — Three tenant-isolation hardenings

- An evidence citation may cite only its own organization's document. The Vault citation policy checks both ends
  (`20260911_vault_evidence_citations.sql`, amended in place, made conditional on `pg_get_constraintdef` and policy
  text). Until then, one organization can cite another's document, and that document's purge deletes the citing
  organization's row.
- The Vault child tables FORCE row-level security, so the table owner is no exception.
- The public CDI reference (`migrations/20261027_cdi_public_reference_seed.sql`) carries no tenant's study as its
  "fit" target. Today every tenant can see that a reference was tailored to NCT05330182. A new seed version drops
  the field (Rule 1: a seed is never corrected in place), and fit is computed for each project when it is read.

### P-67 — The GAMP 5 validation kit is reached in Settings, over the real route

The kit (`server/routes/validation-kit.ts`, with a recorded download) is reached on administration's Settings,
claiming only what its contents are. The unmounted `AdminConsole`, unmounted since `af973c5e8`, is deleted once the kit is reached
there (zero duplication). Why: a regulated customer must validate the system they use (21 CFR 11.10(a), EU GMP
Annex 11 §4), and a vendor validation package is what they ask for first. It must describe the deployed system
truthfully, or it is worse than none.

*Amended 2026-10-29, same day, on implementation:* "its contents" is the launch package and nothing else:
VMP-001, the documents that name it as their parent (URS, RA, IQ, OQ, VSR) and TM-001, each with the version and
status its own header records. The route listed every file in `docs/validation/`, so a customer was also handed
the CORTEX series (a second validation master plan, for the AI engines VMP-001 §3 puts out of scope), an internal
CI work order and a generated evidence pack. Those stay in the repository and are not offered as the customer's
package. The route's note no longer promises "executed and approved records … through QA at contract", which
nothing provides. One gap is the plan's own, and is its owner's to change: VMP-001 §5 lists URS-001…006 and
OQ-001…006, while URS-007 and OQ-008 (CMC / Module 3) name VMP-001 as their parent and are offered.

### P-68 — One subscription entry, one rate-limit source

A billing administrator's account menu has one entry, "Subscription & billing", opening Licensing
(INFORMATION_ARCHITECTURE.md §9); every member keeps "Usage & limits". The usage screen reads its rate-limit table
from `GET /api/billing/rate-limits` instead of a copy in the client.

*Amended 2026-10-29, same day:* that route served a hand-written per-tier grid that nothing enforces, and invented
"standard" for an organization with no tier. What the product applies is `server/config/platform-limits.ts`, per
identity and the same for every subscription. So the route returns the limits actually enforced, the usage screen
shows them as the same for every subscription, and the unenforced grid is deleted. Limits that differ by tier would
be a new enforcement capability (Rule 2), not a label.

### P-69 — Module enforcement stays off until no gated prefix denies everyone

`MODULE_ENFORCEMENT` is not switched to `enforce` while any gated prefix has only claimants without a catalog row
(38 of 283 on 2026-10-29, among them `/api/chat`, `/api/setup`, `/api/onboarding` and `/api/tenant-users`). A gate
that fails on such a prefix comes first; enforcement follows when it is green. Why: turning enforcement on today
would lock every customer out of AnA's own conversations.

### P-70 — No session setting lifts row-level security

`app.bypass_rls` is a custom setting any session can set, and it lifts every Vault policy (found 2026-10-29,
`docs/evidence/D6-ISOLATION-HARDENING/2026-10-29/`). The runtime role must not be able to switch tenant isolation off
from inside its own connection. Every policy that reads it converges on the platform scope the reviewed purge doors
already require (a role the runtime role cannot assume), and the settings readers that remain are deleted. A
code path that genuinely needs to read across tenants does it through a reviewed SECURITY DEFINER door or a role
granted only to that path, with its reason on the definer allowlist. Why: P-59's reasoning, at the scale of the whole
Vault: a control any session can switch off is not a control, and a regulated customer's isolation cannot rest on
every line of server code never issuing one `SET`.

*Amended 2026-10-29, same day, on implementation (`08619d5cc`):* the "platform scope the reviewed purge doors
already require" is not a role. It is two more session settings (`app.rls_enforce` not `'on'`, or `app_super_admin`).
Converging onto it would have moved the switch, not removed it, so the bypass and admin terms were deleted with no
replacement, and the deploy now fails if any policy or function reads either. The platform scope itself is P-72.

### P-71 — The product ships no customer's analysis

`server/data/public-csr-reference/` carries `lmn-target-profile.json` and `comparator-fit-matrix.json`: one
customer's target study (NCT05330182) and a comparator fit made for it. Nothing reads them. They leave the shipped
product; the evidence of the 2026-10-27 work keeps its copies as history. Public registry records stay in the
reference set when they are genuinely public and in scope for it, chosen by the therapeutic area, not by one
customer's programme. A customer's own targets and fits are that customer's project data, in their tenant. Why: a
sponsor's competitors use the same product, and what the product ships is visible to all of them.

### P-72 — Platform scope is a role, not a session setting

`app.rls_enforce` (read by about 1020 policies) and the `app_super_admin` arm (about 973) are custom settings the
runtime role can set, as `app.bypass_rls` was (P-70's inventory,
`docs/evidence/D6-NO-SESSION-RLS-BYPASS/2026-10-29/`). Today, only these stand in the way: the session pins in
`server/db/sessionScope.ts`, the gates and the SQL-interpolation freeze. No caller-controlled `SET` reaches the
database, but one injected or careless `SET` would lift tenant isolation for every table at once.

Platform scope moves onto a NOLOGIN role that the runtime role cannot become: not granted, or granted `WITH SET
FALSE` (PostgreSQL 16). It is entered only through reviewed SECURITY DEFINER doors on the definer allowlist. The
policies' setting arms are amended in place to role checks (Rule 1), and the deploy fails if any policy or function
still reads either setting.

Design comes first. It is an inventory of every path that sets either setting today, and the door each one moves
to, before any policy changes. The tenant selector itself (`app.current_org_id` and its kin) stays a session value
that the server pins per request; binding it cryptographically is not in scope.

Why: the reason given for P-59 and P-70. A control any session can switch off is not a control, and a regulated
customer's isolation is the product's first promise.

*Amended 2026-10-29, same day, on the design* (`docs/design/PLATFORM_SCOPE_AS_A_ROLE_2026-10-29.md`). Production
and staging run PostgreSQL 15, so the role is simply not granted to the runtime role; `WITH SET FALSE` is not used.
Its five questions are decided:

- **F1:** shadow mode is replaced by a login exemption for the migration applier and single-role dev
  (`CURRENT_USER = SESSION_USER` and membership of a NOLOGIN exemption role), never held by the runtime role.
- **F2:** `app_service` may call the platform doors now; a second runtime role is a per-door grant change later.
- **F3:** the purge's lifecycle columns are writable only through platform doors, and the database also holds
  `purge_eligible_at`, so no door erases before the retention window closes without a recorded override.
- **F4:** no PostgreSQL upgrade is needed.
- **F5:** if slice 0 shows that the tenant export lacks the Vault, its rows leave through a reviewed door
  (`platform_export_vault_rows`); no Vault policy is widened. Slice 0 measures this first, because a departing
  customer must get their Vault back (P-58).

One defence-in-depth point is in scope for slice 1: the request path passes the token's role claim to the database
verbatim. No assignable role is `app_super_admin`, and no route mints such a token, but the database must not take
the platform scope from a request's string.

### P-73 — Trial-application drafting covers every region, therapeutic area and modality; CMC composition does not widen with it

Decided by the founder on 2026-10-30. Asked to "build out all IND build and drafting capabilities across all
therapeutic areas and all geographical regions", the founder chose drafting first over widening everything at once.

- **Widened.** Section drafting and its requirements (AnA's drafting tools, the editor's "Draft from sources", and the
  canonical requirements resolver behind both) cover the trial application of each region, not only the US IND:
  - the EU CTA under CTR, filed in CTIS (Part I, Part II and the IMPD);
  - the UK MHRA CTA;
  - the Health Canada CTA, with the QOS-CE;
  - Japan's clinical trial notification;
  - Australia's CTN/CTA;
  - China's NMPA IND;
  - the remaining regions as the region profiles record them.
  They also cover every therapeutic area and modality the existing vocabularies hold.
- **What this changes for drafting.** A region, therapeutic area or modality that drafting reports as "unassessed"
  today becomes work to do. It does not become a reason to stop. The rules of `ANA_IND_COVERAGE_PLAN.md` still hold:
  - Requirements come from recorded sources, with dates.
  - An unknown fact stays a visible gap.
  - A declared label is never treated as qualified evidence.
- **Unchanged.** CMC / Module 3 composition stays small-molecule Module 3 for a US IND
  (`services/cmc/composition-scope.ts`, P-28). It widens only by a later decision, slice by slice, as biologic
  content (Q5A(R2), Q6B, Q5C), the EU IMPD quality part, the QOS-CE and regional 3.2.R are built and verified.
- **Unchanged.** Submission Center's packaging and transmission bounds, and the agency gateways, are not widened by
  this decision.

## How sessions run under this file

- One control-tower session, at most four scoped workers, each with one
  workstream (W1–W7 in the launch playbook) and one directory set. Workers
  commit to `concept2cure-v2` (Rule 0); the control tower reviews and merges.
- Every worker prompt names the evidence it must produce and the row it moves.
- Weekly: run the repo's Part 11 UX, honest-state, design-system and security
  auditors on the launch catalog; file their reports as periodic-review
  evidence under `docs/evidence/reviews/`.
- Nightly on staging: readiness probe, isolation contract, smoke suite; the
  delta is Monday's agenda.
