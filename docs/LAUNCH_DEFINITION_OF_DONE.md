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
| **D1** Hosted production — *code side done 2026-09-21: `npm run db:provision` proven on an empty database, PDF/A toolchain in the image; `docs/evidence/W2/`. Owed: AWS account, IAM, DNS, secrets, the apply itself. 2026-09-23: the application side holds; the Terraform side did not. `terraform validate` had never run, and production failed it (fixed in `b6d7a7d7b`, which also adds the KMS release-signing key: SOP-SEC-001 §2a). Ten more blockers stand between it and a booting task, among them `DATABASE_URL` wired to a JSON credential, an illegal RDS database name, the preflight's required variables absent, and an ECS health check calling `wget`, which the image lacks; three of them are founder decisions (AI placement, Redis, worker). Ordered brief: `docs/evidence/W2/2026-09-23/README.md`. 2026-09-24, B9 (`docs/evidence/W2/2026-09-24-b9/`): the ALB answers CloudFront alone (origin-facing prefix list + origin secret header), and the way in through CloudFront works. Before, every `/api/*` request would have failed its origin certificate check, API 403/404 came back as `200 index.html` (so `/readyz` read green for any deployment), and `/readyz`, `/collab`, SCIM and the connector had no route. Production trusts two hops; the smoke test reads `/readyz` through the public URL and fails closed. Offline proof only (mocked-provider `terraform test`, each check shown failing first); nothing applied. Adds to the founder list: a custom domain that both certificates cover, and the origin secret. 2026-09-24, B1–B3 and B5: built twice in parallel (`docs/evidence/W2/2026-09-24-b1-b5/`, `docs/evidence/W2/2026-09-23b/`) and reconciled into one: the task definition carries every name deploy-aws.yml's preflight requires (read from the workflow by `terraform test`), composed `verify-full` URLs replace the RDS JSON secret, the database name is legal, and the health check probes `/healthz`, not `/readyz` (a readiness probe replaces tasks it cannot heal). `.github/workflows/terraform-tests.yml` runs the tests and the pipeline's own preflight against the rendered task definition on every push. The RDS CA is vendored (`docs/evidence/W2/2026-09-24-rds-ca/`); the bundle itself had been dropped by `.gitignore`'s `*.pem`, so trunk named a missing file until 2026-09-24 (`2026-09-23b/rds-ca-vendored-bundle-missing.txt`). Found and fixed the same day (`2026-09-23b/`): the production image could not load its own bundle (`vite`, a devDependency, imported at load time); minting `app_service` as the RDS master always failed, and its password went to CloudWatch in plaintext; a crash exited 0; the preflight checked one revision and deploy rolled another. 2026-09-24, B8, same day (`docs/evidence/W2/2026-09-24-b8/`): staging is now production's composition. There is one `terraform/stack` with two thin roots, so staging cannot drift from what it proves. Staging runs at smaller sizes with its own names and signing key, and passes the same boot-contract test. A test also reads the six names deploy-aws.yml targets and checks production creates them. deploy-aws.yml still deploys to production only. Still blocked: no path provisions the empty RDS database (next), deploy IAM, the apply itself. Founder: B4, B6+B7, audit trail on first boot, document storage* | One AWS environment from `terraform/environments/production`, image promoted by `.github/workflows/deploy-aws.yml`, `/readyz` 200 with schema, ana, redis, worker all `ok`. | Readiness JSON + `terraform apply` log | Claude + founder (account, DNS, IAM) |
| **D2** Launch catalog — *local green 2026-09-20, see `docs/evidence/W1/2026-09-20/`; staging owed with D1. 2026-09-23: every self-serve signup answered 500 under `RLS_ENFORCE=on` after `a264e291a` (the default client workspace written from the pre-auth scope); fixed in the writer, shown on real PostgreSQL 8/16 red → 16/16 green (`docs/evidence/W1/2026-09-23-workspace/`)* | Six apps on by default for a new organisation: Projects, Vault, Authoring, Submission Center, Submission Readiness, QMS controlled documents. Every other surface behind a flag that is off in production. Zero fixture imports reachable in production; `ci:fixture-fallback` and `ci:no-mock-in-prod-routes` set to block. | Fresh-org screenshots on staging; a CI run showing the gate block on a reintroduced fixture | Claude |
| **D3** Tenant isolation proven — *app_service role and boot as non-superuser proven locally (`docs/evidence/W2/`); all six OQ protocols pass locally with `RLS_ENFORCE=on` as `app_service`, after F-14 — Vault refused every upload under that role — was fixed (`docs/evidence/W3/2026-09-22/`). 2026-09-24: governed decisions added to the two-tenant contract (`docs/evidence/D3/2026-09-24-governed-decisions/`), run as `app_service` with RLS enforcing on a from-blank install, 23/23; the positive control found every listed decision answering 404 on fetch (two ids for one decision, fixed), and one mutation showed the database had already been refusing a cross-tenant write this effort had reported as live. Same day, Report OS (`docs/evidence/D3/2026-09-24-report-os-tenant/`), 37/37: seven of its request schemas took the tenant from the request and now take it from the session; RLS contained all but one leak, a program group holding another tenant's project, since memberships carry no RLS policy. An UPDATE crossed too (`docs/evidence/D3/2026-09-24-update-boundary/`, 39/39): with RLS enforcing, a traceability item could be re-pointed at another tenant's QMP, because RLS checks the row's organization and not a foreign key. 2026-09-24, signed approvals and Submission Center (`docs/evidence/D3/2026-09-24-signatures-and-runs/`): `electronic_signatures` and `submission_orchestrator_runs` added, 43/43 with the Report OS cases; each shown failing with only its own table's policy removed (A lists B's signatures, B's runs are edited and deleted, a forged row lands). Signatures had been excluded because §11.70 makes a fixture undeletable; they are in without disabling the trigger. The contract's forge handler turned out to test `risk_items` for any domain without its own branch, so a new domain could pass having tested nothing; shown passing with signatures' RLS off, and now a compile error (an exhaustive `Record<Domain, Forge>`). And an edit could approve (`docs/evidence/D3/2026-09-24-governed-edit/`, 46/46): any member's PATCH could mark a PCCP plan or post-market document approved and locked without its gate, or re-parent it onto another tenant's program, with RLS enforcing; the staging run is owed with D1* | Runtime connects as the non-superuser app role (`APP_SERVICE_DB_PASSWORD` set); `RLS_ENFORCE=on`; the two-tenant isolation contract passes against staging with the production image. | Contract-test log from staging | Claude |
| **D4** Validation package — *drafted and executed locally: VMP, six URS, RA, IQ, six OQ protocols, TM-001 generated from the runs, VSR-001 §1–§16 (`docs/validation/`, `docs/evidence/W3/`, `WA`–`WF`). Latest local run 2026-09-23c, at one commit carrying every fix (`bfdb0a08`), on an installation provisioned from empty, in the production posture *and* with production authentication — RLS enforcing, non-owner runtime role, dev-login refused, every identity signing in and signing with password + TOTP (`docs/evidence/W3/2026-09-23c/`): IQ 12/0/3; OQ 100 pass / 0 fail / 1 deviation of 101; TM-001 69 of 70 requirements pass, 0 uncovered (URS-AUTH-012 partial, no provider). The 2026-09-23 run and the sweep after it found F-18 to F-22, all fixed (VSR-001 §13). This run found F-23 (the readiness review reported an all-clear for a project it could not read; fixed, proven on real PostgreSQL as the non-superuser role) and P-11 (the records misstated 22 steps' assurance kind; fixed, and gated in CI) (VSR-001 §14). The sweep after it found F-24 to F-33 and three signing sites that took the session's word, all fixed and each shown failing first: every signature re-verifies through one ceremony, an account taken out of use can do nothing (URS-PROJ-012, OQ-PROJ-18), and the PIN, F-15 and Submission Readiness decisions are taken (VSR-001 §16). F-6 closed (VSR-001 §11). Owed: staging execution with the production image and a real second account, a PQ-passed provider for the model step (2026-09-22: only registry-approved models may now serve drafting or review — enforced at every gateway selection point, where before nothing read the approval; 0 of 4 approved models have a PQ, shown as a blocker in `ga-readiness-report.mjs`; 2026-09-23: the PQ is executable (`npm run pq:run`) and a "passed" claim is checked against its record, but the protocol is a draft awaiting owner approval, the gold bank is below its floor and there is no product provider key; tools and routes that store model-authored content refuse an unapproved serving model, and every remaining pin to an unapproved model is listed with its reason behind a CI gate; `docs/evidence/MODEL-GOVERNANCE/`), signatures* | CSA-aligned: validation plan, URS per launch app, risk assessment, IQ, OQ with executed Playwright evidence, traceability matrix generated from tests, summary report. Signed by the founder and one qualified contractor. | Signed PDFs under `docs/evidence/validation/` | Claude drafts and executes; humans sign |
| **D5** Part 11 evidence — *signer modes and KMS envelope implemented and tested against a fake KMS, second signature route deleted (`docs/evidence/W3b/`); audit chain made one chain per tenant with `chain_seq` ordering after the concurrency and RLS defects were reproduced on real Postgres, local verifier 262/262 OK, ledger surface reads the chained store and shows the server verdict (`docs/evidence/WA/`); QMS approval and authoring e-sign proven end to end with a credentialed second signer (`WB`, `WF`). 2026-09-23: every signing path re-verifies the signer through one ceremony (`server/services/part11/reverify-signer.ts`: the account's standing, its lockout, the password, the enrolled second factor) and records what it verified; the Authoring PIN and a second verifier are deleted; the release, the AnA rewrite and the document lock no longer take the session's word (VSR-001 §16.3). 2026-09-24: an exported signature manifest verifies each printed hash against the content it is printed on, and a sealed record that no signature covers is refused (F-40, VSR-001 §17, `docs/evidence/DOCUMENT-FIDELITY/2026-09-24/`). Owed: the KMS key, one live signed release, the production verifier run* | `AUDIT_HMAC_KEY` and `MFA_ENCRYPTION_KEY` in KMS; a KMS-backed signer behind the existing signer seam; the second non-compliant signature route deleted; audit-chain verifier run on production and its output filed. | Verifier output; route deletion commit | Claude |
| **D6** Security posture — *policy set, SIG-Lite questionnaire and trust statement drafted; AI gates fail closed in production (`docs/evidence/W3b/`, `W2/`). 2026-09-23: three sign-in defects closed, each reproduced on real PostgreSQL as the non-superuser role before its fix (VSR-001 §13.9). `/api/users/login` issued sessions without the second factor (MFA bypass). Logout never ended a session (July audit AUTH-03). The enterprise sign-in recorded nothing. Later on 2026-09-23 (`docs/evidence/D6/2026-09-23/`, VSR-001 §15), each shown failing on real PostgreSQL before its fix: a TOTP code, an emailed code and a reset token are each accepted once, including under concurrency; the session states the account's real second factor; the client address in signature and audit rows is the one the load balancer saw, never the one the client wrote (`ci:client-ip-single-source`); a session alone can no longer replace an enrolled authenticator (F-26); the TOTP secret no longer reaches a third-party QR service; reset links are never built on the request's Host. W3, same day (VSR-001 §16), each shown failing first: a suspended or deprovisioned account signs nothing, cannot sign in, and every session it holds ends (F-28, F-29; OQ-PROJ-18); a wrong factor at signing counts against the account, and an unreadable lockout refuses (F-27, F-30); each user behind the load balancer has their own sign-in allowance (F-24); a platform administrator reaches Master Administration on the platform role alone (F-31). Open for the owner: recovery codes are unredeemable and a TOTP account can sign in with an emailed code. The ALB reachable from the internet is fixed in Terraform 2026-09-24 (W2 B9, `docs/evidence/W2/2026-09-24-b9/`): CloudFront alone, `TRUST_PROXY_HOPS=2`; live once D1 is applied. Owed: SOC 2 platform, pen test, Anthropic BAA, signatures* | SOC 2 Type II observation window open on a compliance platform; third-party pen test with findings closed; standard security questionnaire answered; Anthropic BAA signed; per-tenant data-retention and residency statement published. | Pen-test report; questionnaire; trust page | Claude + founder (subscriptions, signatures) |
| **D7** One real sequence — *engineering half closed 2026-09-20: one AS2 transport for ESG and ICSR, typed refusal for the unverified REST path, PDF/A OutputIntent fixed (`docs/evidence/W5/`). 2026-09-24: the FDA regional backbone no longer defaults the application type to NDA or codes an IND as an IND safety report. It states the identity it was given or refuses to build (F-38, VSR-001 §17). The DTD hosts are still refused by the environment's egress policy (403 on CONNECT to www.fda.gov and admin.ich.org, one attempt each). Owed: DTDs and other agency artifacts (downloads refused by the sandbox proxy), agency accounts, the test submission* | eCTD DTDs vendored (B3); external validator seam live or FDA-criteria fallback declared (B4); ESG transport gap closed (B16); one test sequence accepted by FDA's test environment for a real sponsor with the ack chain filed. | Ack chain; preflight 15/15 | Claude builds; founder holds accounts |
| **D8** Connector for Claude — *built and proven locally 2026-09-21: 19 tools, OAuth 2.1 with PKCE, tenant scoping under RLS (`docs/evidence/W7/`). Owed: staging, a second machine's client, the directory submission* | Remote MCP server in `server/mcp/` (streamable HTTP, OAuth 2.1 + PKCE) exposing 15–20 hand-curated tools with exact scope, governed flag and annotations; privacy policy, docs, support contact; submitted to the Connectors Directory; skills pack public. | Transcript of a second machine's Claude client calling the readiness tool against staging; submission acknowledgement | Claude |
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
  For launch that is Claude Opus 5 (primary) and one validated fallback. Kimi,
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
