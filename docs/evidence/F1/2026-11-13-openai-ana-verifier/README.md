# F1: complete the existing AnA live-answer verifier

W1, launch D1/D2. Continue the existing OpenAI/Codespaces demo path at canonical
`d06fb86ec`. No app, UI, route, service, table, AnA tool, model, dependency,
credential or provider-governance change. F1 is open with paths **.

## What already exists

- `scripts/ops/verify-ana-answers.mjs` drives existing dev-login or an explicit
  token, then `/api/ana-ri/stream`, parses SSE and reports LIVE/FIXTURES/SILENT/
  UNREACHABLE. Its current classifier calls any nonempty non-demo text LIVE,
  even without done, provider/model metadata or a complete answer. It cannot
  require OpenAI specifically or request an existing admitted model/project.
- `package.json` already exposes it as `verify:ana`; repository code search
  found no other live parser/workflow consumer. Preserve the existing command,
  authentication paths and fixture-only CI mode; do not add another client.
- `server/routes/ana-ri/stream.ts` already accepts `model_override` and
  `project_id`; its normal done receipt includes provider, model and
  stoppedReason. The interview shortcut intentionally emits no-provider done;
  capped/cancelled paths can emit text with incomplete or stop-only metadata.
- `server/services/ana/tool-trace.ts` and `run-status.ts` already distinguish
  no_more_tools completion from answer_cut_off and other stopped outcomes.
- `server/services/ai-gateway/effort.ts::resolveModelOverride` admits existing
  enabled/approved registry IDs or wire models. `gateway.ts` already serves
  OpenAI GPT-4o/GPT-4o-mini for eligible tasks; placement, approval and PQ gates
  remain authoritative. A model request is not a promise it will be served.
- `server/services/ai-governance/approved-models.ts` already limits those OpenAI
  entries below high-risk drafting; this work cannot widen that scope.
- `scripts/ops/codespaces-doctor.mjs` already probes OpenAI authentication or an
  explicit billable minimal usage request, but that is not an AnA response.
- `.devcontainer/post-start.sh` already loads exported provider keys. The
  concurrent accepted `d06fb86ec` repairs changed supplied keys; its current
  owner retains that file/test scope. Existing startup/doctor suites pass61/61.
- Existing operator homes include the Codespaces handoff, Neon/OpenAI recovery
  guide and Lumen showcase. Their setup/presenter edits remain with their holder.

Discovery: source/caller/route/model/receipt searches, current plan/ledger and
coordination, and `git log --all --diff-filter=D` on verify-ana-answers / AnA
probe names found no deleted replacement. No second verifier is proposed.

## Bounded completion contract

Retain genuine failing real-child-CLI/local-HTTP-fixture cases before source
changes. LIVE needs nonempty answer text and one current terminal receipt with
nonblank provider/model and stoppedReason=no_more_tools. Missing, contradictory,
malformed or stopped receipts cannot establish a completed live answer. Preserve
well-formed fixture detection and --require-live refusal; fixtures prove no
provider call. Explicit --expect-provider checks the served receipt, not which
keys exist. Optional --model and --project-id forward only existing admitted
fields; no first-project selection and no policy bypass. Reject missing option
values instead of silently dropping an assertion. Keep explicit email/token
precedence, and allow existing configured demo identity variables before the
legacy hardcoded email when no explicit identity was given.

Run Node22 fixture regressions, current startup/doctor suites, scoped lint and
normal canonical hooks. No new key is created. Current workspace has no OpenAI
key and GitHub Codespaces access returns403; a live provider result remains
unverified until the existing key/authorized runtime becomes available. Protocol
fixtures must never be described as real OpenAI or hosted-Codespaces proof.

## Completed repair and verification checkpoint

The existing verifier now requires exactly one terminal receipt with nonblank
provider/model and current no_more_tools completion before reporting LIVE.
Missing metadata, shortcut replies, duplicate terminal frames, stopped/cut-off
answers and wrong-provider answers cannot establish completed live proof.
Explicit receipt tags still identify fixtures; merely discussing demo mode does
not turn a real receipt into a fixture. --expect-provider also refuses fixtures
without requiring another flag. Optional --model/project-id forward the existing
model_override/project_id fields; configured demo identities precede only the
legacy identity fallback. All newly valued options reject missing values before
network/auth traffic. The existing timeout also bounds login headers and body.

Genuine initial RED:21failed/8controls; timeout RED:2failed. Exact source/test
versions and raw logs are retained. Final combined GREEN:92/92 Node22 cases,
including31verifier and61existing startup/doctor cases. These protocol cases use
isolated local HTTP/SSE fixtures, not a real OpenAI provider. Scoped ESLint has
zero errors; new test has zero warnings and existing source warnings decrease
from2to1. No allowance or gate was changed. Independent read-only review found
no blocking issue; the subsequent timeout finding was reproduced and repaired.

Canonical provisioning was also run on a new disposable local PostgreSQL16.16
fixture, with a non-owner app_service runtime, RLS enforced and one fictional
Ana Author account. The actual npm launcher and public version/health return200;
database/schema/storage are ready. Readiness is honestly503/no_provider. The
real authenticated AnA endpoint refused503/GATEWAY_UNAVAILABLE and this verifier
correctly exited1/UNREACHABLE. That is negative qualification, not an OpenAI
success. Credentials, JWTs, database contents and full runtime logs stay private
outside Git; only bounded public/runtime metadata is retained here.

## Existing-key Codespace check

After the ordinary canonical pull/post-start finishes, use the existing exported
Codespaces key and the same runtime profile. Do not paste a key or JWT in chat.
The following asks one ordinary, non-writing AnA question and may incur provider
API usage; it preserves all server admission, placement, model/PQ and review rules.

```bash
set -a
. ~/.concept2cure-codespace/app.env
set +a
npm run verify:ana -- --model gpt-4o-mini --expect-provider openai --require-live \
  --question "Reply only OPENAI_DEMO_OK. Do not use tools or change records."
```

Use --email to choose an authorized account explicitly and --project-id to
supply its admitted project when checking project context. Model choice is a
governed request: the served receipt is authoritative. LIVE and an openai model
receipt establish only this turn; neither qualifies a CSR, signatures, scientific
review or the full hosted deployment. OpenAI's existing registered chat models
remain below the high-risk drafting boundary. Existing doctor --probe-openai
checks authentication; --probe-openai-usage separately checks a small billable
provider request. Neither replaces an actual AnA answer.

No OpenAI key is available in this coding environment and the GitHub integration
returns403 for hosted Codespaces. No real provider generation, API billing/model
availability or actual user Codespace verification is claimed. Those checks
remain pending the existing key/authorized runtime. No new key was created.
