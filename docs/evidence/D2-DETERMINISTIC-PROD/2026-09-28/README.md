# D2 — deterministic AI responses reachable in production, 2026-09-28

**Row moved:** D2, "zero fixture imports reachable in production"
(`docs/LAUNCH_DEFINITION_OF_DONE.md`). **State after this change:** refused at
three layers — boot, request and deploy preflight — each shown failing on the
unfixed code first. Local only; the staging run is owed with D1.

## The defect

`AI_GATEWAY_DETERMINISTIC=true` (legacy alias `DETERMINISTIC_MODE=true`) makes
the AI gateway answer every request with a fixed response. The gateway read it
with no `NODE_ENV` condition (`server/services/ai-gateway/gateway.ts`,
`getDefaultConfig`). The keyless-production fallback beside it was already
fenced, but the explicit flag was not. `/readyz` reported such a process
ready: `server/startup/ana-readiness-state.ts:47` names the state
`deterministic` and lets it pass by design.

So a production deployment carrying the flag, for example from an environment
file copied out of CI, would have served placeholder text wherever a regulatory
user expected model output, while every health check read green. That text can
be accepted into a governed draft. `red-unfixed-gateway.txt` shows it: in
production, a request to "Draft section 2.7.3" returned

> `**AnA (Demo Mode):** I'm running without an AI provider. …`

as the answer, with no error.

`docs/ga-audit-plan.md` §7 had called for this refusal ("refuse to start if
`DETERMINISTIC_MODE=true` in production"). It had not been built.

## What changed

| Layer | Change | File |
|---|---|---|
| Shared rule | One reader for the flag and its acceptance; `assertDeterministicServingAllowed()` throws in production without the acceptance | `server/services/ai-gateway/deterministic-mode.ts` (new) |
| Request | `buildDeterministicResponse`, the one function every fixed response passes through, calls the rule. This covers the explicit mode, the development fallback, streaming, and the runtime `setDeterministicMode()` toggle. The gateway config reads the flag through the shared reader. | `server/services/ai-gateway/gateway.ts` |
| Boot | `assertDeterministicModePostureForProduction()`, fired on config load beside the AI-governance posture | `server/startup/ai-governance-posture.ts`, `server/config/environment.ts` |
| Deploy | The preflight refuses `AI_GATEWAY_DETERMINISTIC` and `DETERMINISTIC_MODE` by name in the task definition. The acceptance is already refused by the existing `*_ACCEPT_*` rule. | `.github/workflows/deploy-aws.yml` |
| CI boot job | Records `AI_GATEWAY_ACCEPT_DETERMINISTIC=true`, as it already does for the HMAC signer and local storage | `.github/workflows/ci.yml` |
| Docs | The three variables documented in `.env.example`; two stale entries removed from the env-var baseline (243 → 241, and its count corrected from 244); the bring-up runbook | `.env.example`, `docs/reports/env-var-docs-baseline.json`, `docs/operations/ana-ga-bringup-runbook.md` |

Boot order, in production:

1. Flag not set → boots.
2. `AI_GOVERNANCE_REQUIRE_ENFORCE=true` → refuses, acceptance or not.
3. No `AI_GATEWAY_ACCEPT_DETERMINISTIC=true` → refuses.
4. Accepted → boots, with one structured warning naming the risk.

**Why its own acceptance.** It is deliberately not
`AI_GOVERNANCE_ACCEPT_PERMISSIVE`. An operator who accepted a permissive PII
screen for a synthetic-data pilot has not thereby accepted fabricated drafting.
The storage and signer acceptances are per-risk for the same reason. Only the
literal `true` accepts, as with `STORAGE_ACCEPT_LOCAL_DISK`.

**Why the gateway enforces it too.** The boot gate is the primary control. The
request-time check is defence in depth, the way `pii-screen.ts` forces `block`
on an unaccepted production value. It also covers a runtime toggle that no
boot gate can see.

## The fixture text

While here, the fixed responses themselves were corrected. Five of them used
`[KNOWN]` and `[INFERRED]` — this platform's markers for verified and derived
facts — about input no model had read: "**[KNOWN]** Section headers present
and correctly numbered", "**[INFERRED]** Content completeness appears adequate".
The structured fixture reported `"status": "success"`. Each now says that
nothing was read or produced, and uses `[MISSING]` only where it is true.

For the record: `docs/work-orders/WO-16-fabrication-findings.json` #101
described this text, and the WO-16 sweep adjudicated it "refuted by both",
because the deterministic branch returns before the gateway's audit write, so
the fixture's `provider: 'anthropic'` never reaches the AI audit ledger. That
verdict stands. The text still made the claims, so it was corrected, and a
test pins it through the real gateway. `provider` is left as it is: the audit
consequence was refuted, and widening its type could not be verified here (see
below).

## Verified by making the check fail

| Check | Unfixed code | Fixed code |
|---|---|---|
| Gateway, production, flag on, no acceptance | `red-unfixed-gateway.txt`: served the fixed response | `green-fixed-gateway.txt`: refused, naming the acceptance |
| Config load under a full production posture | `red-unfixed-boot.txt`: 4 of 6 fail; the control and the accepted case pass, so the baseline was a valid production posture | `green-fixed-boot.txt`: 6/6, and all 43 environment tests pass |
| Fixed responses, each of 9 task types | `red-unfixed-fixtures.txt`: 5 carry `[KNOWN]`/`[INFERRED]`; structured output reports success | `green-fixed-all-new-tests.txt`: 17/17 |
| Deploy preflight (the pipeline's own shell, run by `scripts/ops/terraform-preflight-proof.mjs --td-json`) | `preflight-before.txt`: `td-with-deterministic.json` accepted | `preflight-after.txt`: refused, naming the variable; `td-passing.json` still accepted |
| No regression | — | `regression-suites.txt`: 57 files, 678 passed, across the gateway, startup and config suites and `tests/resolution/ai-gateway-demo-mode.test.ts` |
| Types | — | `typecheck-scoped.txt`: 0 errors over the gateway and config graphs, and the same check shown reporting a seeded error |
| CI gates | — | `ci-gates.txt`: `ci:gateway-bypass`, `check:microcopy`, `check:compliance-claims` pass |

`td-passing.json` is the filed `docs/evidence/W2/2026-09-23b/api-task-definition-before.json`
with the boot-contract variables added (synthetic secret ARNs), so that it
passes the preflight. `td-with-deterministic.json` differs from it only by
`AI_GATEWAY_DETERMINISTIC=true`.

## Not proven here

- **The full typecheck.** `ci:typecheck:no-regression` needs a 24 GB heap and
  this container has 15 GB. The scoped check covers every file changed, and is
  shown catching an error. CI runs the full one.
- **Staging.** Nothing ran against a deployed image. That is owed with D1.
- **Handed on — the env-var docs gate cannot see injected-env reads.**
  `scripts/ci/check-env-var-docs.mjs` matches only a literal `process.env.NAME`.
  Every posture module in the repository reads an injected `env` parameter, so
  that it can be tested, and so the gate cannot see any of them. Moving the
  gateway's read behind the shared function took `AI_GATEWAY_DETERMINISTIC` out
  of its sight too. The variables are documented in `.env.example` directly.
  The gate's blind spot is its own item.

## Found on the way, and fixed

`scripts/ops/terraform-preflight-proof.mjs --td-json <file>` wrote a synthetic
`taskDefinitionArn` back into the file it was given. Its own header documents
that mode as the one "used for the before/after evidence", so running it altered
the evidence it read. Running it here left a diff in
`docs/evidence/W2/2026-09-23b/api-task-definition-before.json`, which was
reverted. The augmented copy now goes to a temporary file
(`harness-mutated-input.txt`: the diff, then the same command leaving the file
byte-identical). `td-passing.json` and `td-with-deterministic.json` in this
folder were run before the fix and carry that ARN; both carry the same one, so
they still differ only by the flag.
