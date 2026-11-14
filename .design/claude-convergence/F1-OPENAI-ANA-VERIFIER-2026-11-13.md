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

## Review follow-through: bound authentication too

Independent review found the existing timeout covered only the AnA stream, not
its preceding dev-login fetch/JSON body. A stalled login can therefore outlive
--timeout-ms. Retain RED HTTP fixtures that stall before auth headers or after
headers; apply the same existing timeout to that fetch, without changing auth
policy, token handling or credentials. The stream still verifies current full
transport completion; this work does not shorten post_done handling.
