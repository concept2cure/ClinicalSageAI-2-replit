# Native executor and existing admission controls

## What already exists

The classic `executeAgenticLoop` already propagates gateway failures after its
canonical result budget, source guards, receipt settlement and exact framing.
`context-budget.ts` already estimates the complete gateway request, and
`context-window-admission.test.ts` already checks real gateway admission before
provider dispatch. These controls qualify those existing boundaries; passing
baseline results are not red evidence for the new route/client error carriers.

## Qualification

Baseline: `30afd3bd17a90c8de4a44098354d9de3a34cb4bc`.
Canonical Vitest run: **3 files, 15 tests passed**. The two new files had zero
lint findings before freeze. All 24 selected baseline input pins matched before
and after the run, and neither frozen test changed.

- Three native executor controls preserve the same canonical context error on
  initial refusal without tools/receipts, preserve a follow-up refusal after
  raw callbacks, exact framing/history/operator staging and an admitted source
  receipt, and retain normal completion for a fitting follow-up.
- Nine pure controls exercise existing request estimation for framing and
  headers, history, narration, operator turns, tool/input schemas, structured
  output schema, text blocks and output reserve, plus a fitting control.
- Three existing real gateway controls refuse an oversized request before SDK
  dispatch, select a fitting fallback without a skipped-provider health penalty,
  and retain the ordinary fitting path.

Frozen SHA-256 values:

- `context-window-executor-carry.test.ts`:
  `1a31b8138f91871ba6dd0c3c4a1c25c5263ae7198d891467e0b080a7c871f4f0`
- `context-window-round-cost.test.ts`:
  `769fb1bbae6d8ea3b3c34b8e4610e6aed92b0dbb26ee5c8fc7072cf35721a116`

[Freeze and input hashes](freeze.json), [exact baseline command](baseline-command.txt),
[raw baseline output](baseline.txt), [structured result](baseline-summary.json),
[lint command](lint-before-freeze-command.txt) and
[raw lint output](lint-before-freeze.txt) retain the qualification evidence.

## Limits

The native executor gateway is scripted; it establishes error propagation and
host staging, not actual gateway admission or provider delivery. Source access
and verification use the existing synthetic actor/source fixture; receipts use
the existing in-memory Vault. Actual host guards and settlement run, but these
are not live source-access or durable database proofs. A receipt that exists
before follow-up refusal remains history; no rollback is claimed.

The separate existing gateway controls use the real admission path with an
accepting dispatch spy, so the oversized case proves no SDK dispatch without a
network call. Estimator controls qualify approximate policy, not exact tokens,
serialized provider payload size or agency acceptance.
