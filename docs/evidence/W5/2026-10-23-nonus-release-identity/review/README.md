# Independent review and persisted signature proof

The existing canonical `writeMutation('sign')` PGlite integration fixture now
includes EU and JP markets on an FDA-home project. It applies the actual P-44
column migration and uses the actual recorded identity reader, sequence binder,
governed action writer and electronic-signature persistence. No captured proof
is mocked. These cases supplement the core worker's fail-first evidence; this
cohort was executed against the in-progress implementation, not replayed against
the historical binder.

`persisted-writer.txt`: **15/15 passed**, including the existing 13 checks and the
two regional cases. The new checks prove:

- the signature manifest stores the actual market number, applicant name and
  sponsor pointer; the FDA home number is not borrowed;
- FDA-only DUNS/contact fields are null and changes to those unused fields do
  not invalidate a non-US approval;
- changing the market number changes the content binding while preserving the
  exact sequence-content digest;
- the original stored manifest, digest and attribution hash remain unchanged;
- the next governed signature captures the new facts with a valid attribution
  hash.

Direct fixture writes model drift. The governed market-number writer and its
fixed-number policy are exercised by separate existing actual-writer cohorts.
This test does not replace a human ceremony or agency qualification.

`persisted-writer-inputs.json` records the command, contemporaneous HEAD and
SHA-256 pins before/after execution. Relevant source inputs were unchanged during
that run. The run includes uncommitted implementation and is not a full-repository
test claim. `persisted-writer-eslint.json` records zero errors and one existing
outer-describe length warning; no warning allowance was changed.

## Adversarial review

Read-only boundary review found five concrete gaps, all corrected in the reviewed
source. `reviewed-source-inputs.json` pins that review; the root session owns final
compiler/build/cohort and canonical publication evidence.

1. Unbound non-US applicant names come from `organizations.name`, which the
   prior program/sponsor locks did not protect. The staged identity helper now
   takes organization SHARE first, then submission SHARE or UPDATE, followed by
   the caller's sequence lock and program/sponsor locks. Freeze requests UPDATE
   directly and never upgrades a shared submission lock.
2. Legacy leaf-only signature staleness previously skipped manifest attribution
   hash validation. Renewal now requires the intact legacy manifest hash;
   malformed or missing hashes keep the invalid verdict.
3. Release preparation could request a new signature for an intact historical
   awaiting snapshot with no captured identity, then fail only during resume.
   It now reuses the canonical orchestrator sign-identity refusal before a new
   signature can be recorded. Historical completed export integrity retains its
   original optional-proof digest recipe.
4. The existing MCP sequence-status caller omitted its actual region. It now
   passes the recorded sequence region into strict current-release coverage.
5. The typed application number was compared only with an unlocked early read.
   The transmit claim now compares it with the captured number under identity
   locks, preventing a valid later signature from shipping different-number
   bytes under the request's earlier typed number.

The remaining reviewed paths retain fail-closed behavior: actual sequence parent
and canonical region corroborate current coverage; unknown regions cannot gain a
leaf-only release; known-region claim proof supplies assembly inputs and is echoed
and compared again before gateway entry; unsent renewal preserves independent
signing, gate evaluation, dispatch-state CAS and spent-signature checks. There is
no new region vocabulary, approval engine, store or agency-enforcement default.

No further blocking defect was identified in this scoped source review. This is
not agency qualification or human acceptance. Optional non-FDA regional applicant
IDs retain their existing request-owned contract and are not claimed to have a
new canonical record authority. Actual agency DTD/vocabulary conformance,
transport qualification and witnessed human use remain separate work.
