# Child trace and grounding proof — baseline

## What already exists

- `server/services/ana/sub-agent.ts` runs the real governed child through
  `AnaToolExecutor.executeAgenticLoop`, retaining raw completion events.
- `server/services/ana/sub-agent-shape.ts` keeps raw steps inside a record-only
  trace and removes that trace from the parent/model view. The baseline has no
  tool-use correlation or exact staged-body fields on those steps.
- `server/services/ana/sub-agent-stream.ts` reconstructs grounding by reapplying
  the budget to each trace round before filtering successes. Baseline replay
  does not know private read placement, and completion order can differ from
  the host's original call order.
- `server/services/ana/sub-agent-limits.ts` already offers
  `search_document_passages` to governed children. It does **not** offer
  `read_project_document`; this proof does not widen that allowlist.
- `server/services/ana/__tests__/sub-agent.test.ts` already demonstrates the
  real-runner/scripted-gateway seam. `support/read-delivery-vault.ts` already
  provides the parser that unframes result bodies from captured requests.

The parent inventory and approved [contract](../CONTRACT.md) establish that
these existing seams are completed, without a new child loop or model path.

## Frozen proof

`server/services/ana/__tests__/sub-agent-passage-staging.test.ts` demonstrates
**22 intended failures and 5 passing controls, 27 tests** against unchanged
production. All 26 parent baseline inputs plus four directly used reference
inputs remained unchanged. Exact hashes, command, Node version and timestamps
are in `baseline-command.json`; actual exit and unchanged-input count are in
`baseline-result.json`. `frozen-test.json` binds the final test bytes.

Real child cases exercise `runSubAgent`, the actual executor/dispatch/budget
and framing, including its handoff flow on an empty private receipt map.
The passage handler is replaced with a
bounded synthetic response, and the model gateway is scripted. Canonical test
setup substitutes PostgreSQL; no provider or live source database is used.
The copied gateway requests are snapshots of host requests, not evidence of
provider delivery.

Independent assertions require server-authored call IDs and exact staged bodies,
raw-result retention, source locators intact in the first three admitted bodies,
and a complete withholding envelope for the fourth. A deterministic completion
gate makes the first call finish after another call, proving that staging cannot
be reconstructed from completion order. Separate rounds may reuse a call ID;
two different tools with the same ID in one round must not receive ambiguous
staging assignments. Payload-nested staging fields are untrusted data.

Pure reader cases cover exact modern staged content, withheld content, incomplete
or invalid field partners, same-round duplicate identities, mixed modern/legacy
rows, legacy passage/read-round suppression, and unchanged ordinary legacy
budgeting over failed siblings. The private-read mixed-round case is a recorded
trace fixture because `read_project_document` is outside the current child
allowlist. It does not qualify actual child receipt handling or expand access.

Passing controls establish that the currently offered passage handler executes,
failed modern rows contribute no evidence, nested fields are not adopted as
trace authority, ordinary legacy replay still accounts for failed siblings, and
malformed top-level results have no evidence. The child's report is excluded.

The final scoped ESLint summary reports zero errors and warnings. Raw test `.txt`
logs are byte-preserved. ESLint JSON is explicitly a summary, omitting duplicated
source fields and retaining the raw stdout hash. The first baseline/lint
iteration (one global-reference lint warning) and the subsequent correlation
fixture strengthening are retained as `initial-*` and `pre-correlation-*`.
No runtime assertion was relaxed to obtain the baseline failures or lint pass.

This proof does not qualify source admission, multilingual relevance, agency
acceptance, a hard aggregate round-size bound or provider-served delivery.
