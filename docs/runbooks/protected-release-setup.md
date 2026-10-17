# Product history protection and deploy governance

Repository: `concept2cure/ClinicalSageAI-2-replit`

Product/default branch: `concept2cure-v2`

Existing repository ruleset: [11855901 — JMSMITH](https://github.com/concept2cure/ClinicalSageAI-2-replit/rules/11855901)

Updated 2026-10-14 to follow the current single-branch policy in `AGENTS.md`,
`CLAUDE.md`, and P-3 in `docs/LAUNCH_DEFINITION_OF_DONE.md:124`. The prior version
of this runbook prescribed pull requests, a different branch policy and ten
required branch checks. Those instructions are superseded. Work continues by
direct push to the one product branch; the production deployment verifies the
qualified commit and requires the named reviewer on the production environment.
Branch rules protect history by blocking deletion and force pushes.

## Current evidence and exact intended change

The read-only audit found the existing ruleset disabled, with no included or
excluded refs, no bypass actors, and two rules: `deletion` and
`non_fast_forward`. The effective rule listing for `concept2cure-v2` was empty.
See [before snapshot](../evidence/AUDIT-REMEDIATION/2026-10-14/governance-ruleset-before.json)
and [effective branch rules](../evidence/AUDIT-REMEDIATION/2026-10-14/governance-branch-rules-before.json).

The remedy updates that existing ID. It preserves its name, rules and bypass
actors, activates it, and explicitly includes `refs/heads/concept2cure-v2`.
Merely turning on a ruleset whose include array is empty is insufficient evidence
that it applies to the product branch. No overlapping ruleset, pull-request
requirement, branch status-check requirement, bypass or default-branch change
is introduced.

The planned writable payload from the captured state is:

```json
{
  "name": "JMSMITH",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "exclude": [],
      "include": ["refs/heads/concept2cure-v2"]
    }
  },
  "rules": [{"type": "deletion"}, {"type": "non_fast_forward"}],
  "bypass_actors": []
}
```

## Administrator procedure

Use an authenticated GitHub CLI environment with repository Admin or a custom
role that can edit repository rules, and a token with repository-administration
access. Do not paste credentials into files or command arguments. This work
supplied no such credential, and the connected GitHub tools expose no ruleset
mutation operation; live enforcement remains pending an administrator apply and
readback.

1. Preview the current state and exact preserving payload:

   ```bash
   node scripts/ops/activate-history-ruleset.mjs \
     --evidence-dir /tmp/c2c-history-protection-preview
   ```

2. Review the emitted payload and retained snapshots. The helper refuses the
   wrong repository/id/default branch/target, existing exclusions or additional
   rule types requiring review, and an applicable history guard from another
   ruleset. It does not replace unknown controls. The audited empty bypass list
   must stay empty to cover administrators. Avoid concurrent settings edits;
   the helper detects observed drift immediately before PUT, but the GitHub
   ruleset API is not an atomic compare-and-set.

3. Apply the reviewed change to **11855901 only**, retaining evidence:

   ```bash
   node scripts/ops/activate-history-ruleset.mjs --apply \
     --evidence-dir /tmp/c2c-history-protection-applied
   ```

   The helper rereads the ruleset before mutation, PUTs only that existing ID
   when needed, then GETs both the ruleset and the effective branch rules. It
   reports success only if the entire writable policy matches and both guards
   are effective for the product branch with ruleset ID 11855901. If readback
   fails, settings may have changed but enforcement is **unverified**; retain
   the saved evidence and inspect GitHub. Repeating a verified invocation is
   idempotent and performs no PUT.

4. File `before.json`, `branch-rules-before.json`, `payload.json`, `readback.json`
   and `branch-rules-readback.json` from the apply directory as the operation's
   evidence. The applied branch-rule listing is required; an active badge or
   `protected: false` from classic branch protection alone does not settle
   ruleset behavior. Do not test the protection by deleting or force-pushing the
   product branch.

## Other P-3 release controls

The release gate is at deployment: `deploy-aws.yml` must verify a passing
release-evidence verdict for the tagged product-branch commit before build/push.
The production environment also requires the named human reviewer specified by
P-3. Secret scanning with push protection is a separate repository setting.
This helper neither changes nor claims verification of those controls; their
administrator evidence is retained separately.

## Local qualification

```bash
node --test scripts/ops/__tests__/activate-history-ruleset.test.mjs
node scripts/ops/activate-history-ruleset.mjs \
  --snapshot docs/evidence/AUDIT-REMEDIATION/2026-10-14/governance-ruleset-before.json
```

The offline command creates only a plan, explicitly reports `verified: false`,
and cannot be combined with `--apply`. Local transport tests prove policy
preservation, existing-ID-only updates, drift/overlap/refusal behavior,
idempotency and strict live-readback requirements. They do not activate GitHub
settings or replace administrator readback.
