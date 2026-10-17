# O05 history-protection operator remedy

The existing GitHub ruleset [11855901 — JMSMITH](https://github.com/concept2cure/ClinicalSageAI-2-replit/rules/11855901)
was read through the public REST API on 2026-10-14. It remains disabled, its
include and exclude branch arrays are empty, and its two rules are `deletion`
and `non_fast_forward`. The complete ruleset list contains only that ruleset;
the effective rules for `concept2cure-v2` are empty. Retained live **read-only**
evidence: `governance-ruleset-before.json`, `governance-rulesets-list.json`, and
`governance-branch-rules-before.json`.

The implementation follows the prior `governance-history-contract.md` and the
current launch DoD P-3. `scripts/ops/activate-history-ruleset.mjs` prepares and,
in an authenticated administrator environment with explicit `--apply`, updates
only that existing ID. It preserves JMSMITH, both guards and the empty bypass
list, makes enforcement active, and adds the explicit canonical branch ref.
It creates no overlapping ruleset and adds no branch checks or pull-request
requirements. It refuses unexpected policy, observed drift and overlap; retains
the before/payload/readback; and reports enforcement only after the applied
branch-rule listing confirms both guards with the expected ID. Repetition
after verified application performs no PUT.

The superseded `docs/runbooks/protected-release-setup.md` is corrected: its
prior PR/ten-required-check instructions contradicted the one-branch model.
The reviewed operator procedure now matches the deployment gate in P-3. It
documents the lack of an atomic GitHub ruleset compare-and-set and asks operators
to avoid concurrent settings edits.

## Local qualification and live limit

`governance-history-tests.log`: **10/10 Node tests** passed against the captured
snapshot and injected transport. They cover preserving the real captured
policy, adding the exact ref, missing-guard/idempotency behavior, refusal of
wrong identities/exclusions/additional controls/overlap, no writes on dry run or
failed reads, drift refusal, existing-ID-only PUT, complete policy readback,
effective branch-rule IDs and refusal after an accepted PUT without effective
guards. `governance-history-lint.log` is empty (zero errors or warnings), and
scoped `git diff --check` is clean.

`governance-offline-plan.log` and `governance-planned/payload.json` hold the exact
reviewable request. The offline command explicitly reports **verified: false**
and cannot apply it. Available connected GitHub tools have no ruleset mutation
operation, and no repository-administration credential was supplied. No live
PUT or GitHub setting change was attempted. **Live history protection remains
externally blocked**, pending this supported administrator command and readback:

```bash
node scripts/ops/activate-history-ruleset.mjs --apply \
  --evidence-dir /tmp/c2c-history-protection-applied
```

Production-environment reviewer and secret push protection are separate P-3
controls; this work does not claim to modify or verify them.
