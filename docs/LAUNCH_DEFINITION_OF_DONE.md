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
| **D1** Hosted production — *code side done 2026-09-21: `npm run db:provision` proven on an empty database, PDF/A toolchain in the image; `docs/evidence/W2/`. Owed: AWS account, IAM, DNS, secrets, the apply itself* | One AWS environment from `terraform/environments/production`, image promoted by `.github/workflows/deploy-aws.yml`, `/readyz` 200 with schema, ana, redis, worker all `ok`. | Readiness JSON + `terraform apply` log | Claude + founder (account, DNS, IAM) |
| **D2** Launch catalog — *local green 2026-09-20, see `docs/evidence/W1/2026-09-20/`; staging owed with D1* | Six apps on by default for a new organisation: Projects, Vault, Authoring, Submission Center, Submission Readiness, QMS controlled documents. Every other surface behind a flag that is off in production. Zero fixture imports reachable in production; `ci:fixture-fallback` and `ci:no-mock-in-prod-routes` set to block. | Fresh-org screenshots on staging; a CI run showing the gate block on a reintroduced fixture | Claude |
| **D3** Tenant isolation proven — *app_service role and boot as non-superuser proven locally (`docs/evidence/W2/`); the staging run is owed with D1* | Runtime connects as the non-superuser app role (`APP_SERVICE_DB_PASSWORD` set); `RLS_ENFORCE=on`; the two-tenant isolation contract passes against staging with the production image. | Contract-test log from staging | Claude |
| **D4** Validation package | CSA-aligned: validation plan, URS per launch app, risk assessment, IQ, OQ with executed Playwright evidence, traceability matrix generated from tests, summary report. Signed by the founder and one qualified contractor. | Signed PDFs under `docs/evidence/validation/` | Claude drafts and executes; humans sign |
| **D5** Part 11 evidence — *signer modes and KMS envelope implemented and tested against a fake KMS, second signature route deleted, audit-chain verifier proven (`docs/evidence/W3b/`). Owed: the KMS key, one live signed release, the production verifier run* | `AUDIT_HMAC_KEY` and `MFA_ENCRYPTION_KEY` in KMS; a KMS-backed signer behind the existing signer seam; the second non-compliant signature route deleted; audit-chain verifier run on production and its output filed. | Verifier output; route deletion commit | Claude |
| **D6** Security posture — *policy set, SIG-Lite questionnaire and trust statement drafted; AI gates fail closed in production (`docs/evidence/W3b/`, `W2/`). Owed: SOC 2 platform, pen test, Anthropic BAA, signatures* | SOC 2 Type II observation window open on a compliance platform; third-party pen test with findings closed; standard security questionnaire answered; Anthropic BAA signed; per-tenant data-retention and residency statement published. | Pen-test report; questionnaire; trust page | Claude + founder (subscriptions, signatures) |
| **D7** One real sequence — *engineering half closed 2026-09-20: one AS2 transport for ESG and ICSR, typed refusal for the unverified REST path, PDF/A OutputIntent fixed (`docs/evidence/W5/`). Owed: DTDs and other agency artifacts (downloads refused by the sandbox proxy), agency accounts, the test submission* | eCTD DTDs vendored (B3); external validator seam live or FDA-criteria fallback declared (B4); ESG transport gap closed (B16); one test sequence accepted by FDA's test environment for a real sponsor with the ack chain filed. | Ack chain; preflight 15/15 | Claude builds; founder holds accounts |
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
