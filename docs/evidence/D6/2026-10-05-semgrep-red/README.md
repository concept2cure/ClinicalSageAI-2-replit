# D6: Semgrep red on every trunk push since 2026-10-01: 36 findings, cause by cause

**Row:** D6 (security gates), `docs/LAUNCH_DEFINITION_OF_DONE.md`.
**Date:** 2026-10-05.

## The red

`Semgrep / Analyze (Semgrep)` (`.github/workflows/semgrep.yml`) blocks what a
commit adds over the newest trunk commit whose run of that job passed. That
commit is `c064711c4` (2026-10-01 13:19), 711 commits back. Every later run has
failed. In run 37259089968 (head `e0653b224`) the blocking scan reported 36
findings that `c064711c4` did not have. A full scan reported 747; the other 711
predate the baseline and do not block.

While the job is red the baseline cannot move. So each finding added after
2026-10-01 stays red until someone fixes or reviews it. Each new one makes the
job harder to clear.

## Reproduced

The registry (`semgrep.dev`) is refused by this environment's proxy. So the
scan was reproduced with the same engine, `semgrep 1.177.0`, the version and
digest the workflow pins. It used the nine rules that fired, from their source
repository (`semgrep/semgrep-rules`), run under their registry ids.

- `red/ci-run-37259089968-blocking-scan.txt`: CI's own blocking-scan output.
- `red/semgrep-fired-rules-before.txt`: the local scan of the committed files.
  It reports the same 36 findings, file for file and line for line.

## Fixed: real defects (3)

| Finding | Defect | Fix |
|---|---|---|
| `gcm-no-tag-length`, `server/services/security/credential-cipher.ts:62` | Without `authTagLength`, Node 22's GCM decipher accepts a tag of 4 to 16 bytes and checks only that many. A tag cut to 4 bytes decrypted. Forging an organisation's connector or gateway credential ciphertext took about 2^32 tries, not 2^128. | `authTagLength: 16` on the cipher and the decipher. |
| Same defect, `server/services/mfaService.ts` (stored TOTP secrets) | Not among the 36: it predates the baseline, so it is one of the 711. It is the same one-line defect. | Same fix. `field-encryption.ts` already checked the tag length. |
| `detected-jwt-token`, two P1-47 evidence files | Signed HS256 tokens were committed in test output. They were signed with the test suite's secret and expired 2026-09-28. Gitleaks had already reviewed them (`.gitleaksignore`). | Elided in place: the evidence needs the assertion, not the token bytes. |

`server/services/security/__tests__/gcm-tag-length.test.ts` cuts each store's
tag to 4 and to 12 bytes:

- `red/gcm-tag-length.txt`: both cases fail. The shortened tag decrypted.
- `green/gcm-tag-length.txt`: 22 of 22 pass, including the gateway-accounts and
  MFA enrolment suites.

Every existing ciphertext was written with a 16-byte tag, so all of them still
decrypt.

## Fixed: a gate that missed an identifier containing `$`

`scripts/ci/check-canonicalizers.mjs:93` (`detect-non-literal-regexp`) put an
identifier into a regex unescaped. An identifier may contain `$`, which is a
regex anchor, and `\b` does not bound it. So `const $keys = Object.keys(o).sort()`
fed into the output was never found.

The identifier is now escaped and bounded by identifier characters. A new shape
case, `boundToADollarName`:

- `red/canonicalizers-dollar-name.txt`: fails, 10 of 11 pass.
- `green/canonicalizers-dollar-name.txt`: 11 of 11 pass.

The gate still finds its 7 baseline copies.

## Changed instead of marked

Five `console.warn` calls in two MCP dbtests (`unsafe-formatstring`) now pass
their tag as a `%s` argument.

## Reviewed false positives (25 findings), marked inline with the reason

Each one is marked `nosemgrep: <rule-id> -- <reason>`, as the workflow asks.

| Rule | Where | Why it is not a defect |
|---|---|---|
| `detect-non-literal-regexp` | `answer-grounding.ts` ×6, `answer-check-figures.ts`, `authoring-read-render.ts` ×3 | Each variable part is either escaped (`escapeRegExp`), a module constant (`LABELED_ID_PATTERNS`, `DOSE_UNIT_RE`, `DURATION_UNIT_RE`), or a capture already restricted to digits or to an ICH code. No pattern has a nested quantifier. |
| `detect-non-literal-regexp` | 8 test and self-test sites | The interpolated values are literals in the test. |
| `react-insecure-request` | 2 evidence harness scripts | `http://127.0.0.1`: the stand-in model server the harness started. |
| `insecure-object-assign` | D4 evidence `differential.ts` | An offline differential over fixed state combinations. |
| `hardcoded-jwt-secret` | `authEnterprise-second-factor-lockout.test.ts` | The test signs with a wrong secret to prove the token is refused. |
| `unknown-value-with-script-tag` | `section-generation-figures.test.ts` | The test feeds in a script tag on purpose and asserts no reader receives it. |
| `aws-cloudwatch-log-group-unencrypted` | `terraform/modules/embedding-service/main.tf` | A recorded decision: keyed as the api and worker log groups are, with the CloudWatch key. `terraform/stack/tests/boot_contract.tftest.hcl:1255` holds that. The api and worker groups carry the same finding among the 711. |

## Verified by making it fail

- `green/semgrep-fired-rules-after.txt`: the same scan over the working tree
  reports **0 findings**.
- `green/semgrep-mutants.txt`: two mutants each bring back their finding.
  - A marker given the wrong rule id: a marker suppresses only the rule it names.
  - The `authTagLength` fix reverted: the GCM finding returns.

## A regression of mine, found and fixed here

Running every suite this change touched turned up 39 failures in eight files.
`founder-critical-path-proof` was already red on trunk. The other seven were
broken by my own `bea4192be` (D3 pre-auth narrowing, 2026-10-04).

That commit routed sign-in, reset and enterprise verify-password through
`public.user_id_for_email` (`db.execute`). Their db doubles had no `execute`, so
every request answered 500.

- **The six mocked suites:** their doubles now answer the lookup with the id of
  the row they already read.
- **The pglite suite:** it creates the function in its own schema.

`green/touched-suites.txt` covers the suites behind every touched file.

## Open, for its owner

- **Log keys (D1 / infrastructure).** Whether the application, worker and
  embedding log groups should move to a customer-managed KMS key. The contract
  test makes it one decision for all three.
- **The 711 pre-existing findings.** They do not block. Nobody has triaged them.

## The whole unit tier, after the push (2026-10-05)

`npx vitest run` over the merged tree: 3,374 of 3,398 files pass, 16 fail
(51 tests). Each failing file was rerun in isolation, on an export of HEAD
without the checkout's ignored `.env`, and on exports of earlier commits.

**Four were the checkout, not the code.** An ignored local `.env` (2026-09-28)
sets `RLS_ENFORCE=on` and a `DATABASE_URL`, and the test setup loads it. These
pass on a clean export:

- `document-consequence`
- `conversation-os`
- `transmit-guard-reports-checks`
- `CrossReferenceMapping.no-fabricated-content`

**Six were already red before this session's D3 work** (`dd73adb63`). Session
015w92's `1ca5c0727`, which landed while this was in progress, fixes them:

- `auditChainIntegritySweep`
- `mdx-esg-transmit-gateway`
- `test-assembly.routes`
- `scanned-pdf-native-canvas`
- `founder-critical-path-proof`
- `governed-reason-not-invented`

**Six were broken since, each fixed here.** Each was found by bisecting on
clean exports.

| Suite | Broken by | Cause | Fix |
|---|---|---|---|
| `session-open-contract` | mine, `proposal-seal.ts` (item 22) | The contract reads every `jwt.sign` payload literal, and the seal passed a variable. | The payload is an object literal at the call. |
| `audit-compliance-reports` | `fe916edf4` (D6 platform standing) | The test granted platform standing through the request role `support`, which that commit closed on purpose. | The tenant role `support` cannot run reports; the owner allowlist can. `canReadAuditTrail` is one of the synchronous `isPlatformAdmin` sites that do not read grant rows, which `fe916edf4` handed on as board item 3. |
| `unifiedTasks-governed` | `90b34d33c` (D2 CMC registers) | The Drizzle model reads `stability_studies.project_id`, and the suite's schema lacked it. | Fixed by `1ca5c0727` (session 015w92), which runs the whole migration. My parallel fix was withdrawn so there is one. |
| `deepening-tools` | `8d919b1f8` (writing gate) | `AnaToolDefinitions` now reaches the instrumented pool before the test's mock is set. | It is imported after the mock is set. |
| `device-blueprint` | `433200b94` (510(k) readiness) | It expected the old form `eSTAR 510(k) template`. | It expects the canonical `eSTAR (submitted via CDRH Portal)` and `FDA 3601`. |
| `workbenchAssignReview` | the calendar | Its due date was 2026-10-05, which is today, so the row read "due today". | The date is 2099-10-05. |

A note on method: an in-place `git bisect` over the main checkout named a
wrong commit, because the checkout's `.env` follows every step. These were
bisected on `git archive` exports instead.
