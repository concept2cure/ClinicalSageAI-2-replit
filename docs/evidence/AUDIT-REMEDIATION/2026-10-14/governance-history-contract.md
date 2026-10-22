# O05: activate the existing history-protection ruleset

Contract published 2026-10-14 before the operator automation. P-3 in
`docs/LAUNCH_DEFINITION_OF_DONE.md:124` is authoritative: the one product branch
accepts direct pushes, CI qualifies the commit at deployment, and GitHub blocks
force pushes and branch deletion. This remedy adds no pull-request or required
status-check rule. The old `protected-release-setup.md` instructions are
superseded where they prescribed those incompatible requirements.

Read-only GitHub evidence captured here shows repository ruleset **11855901**,
**JMSMITH**, disabled, with exactly `deletion` and `non_fast_forward` rules,
no bypass actors, and empty include/exclude branch conditions. Enabling it
alone would not explicitly target the product branch. The desired request
updates that existing ID only, preserves its name/rules/bypass actors, sets
enforcement to `active`, and adds `refs/heads/concept2cure-v2` to its include
conditions. No overlapping ruleset is created and no other repository setting
is changed.

The operator helper is read-only by default. An explicit `--apply`:

1. Reads repository/default branch, that exact ruleset, and currently applied
   rules for the product branch.
2. Refuses another repository/id/target, unknown disabled rule types,
   exclusions whose applicability cannot be safely determined, or an already
   applicable history-protection rule from a different ruleset.
3. Emits the exact writable payload and before snapshot. Immediately before
   PUT it rereads the existing ruleset and refuses policy drift.
4. PUTs only that existing ID if a change is necessary. It then rereads the
   ruleset and the applied branch rules, checking the full writable policy and
   both history guards with that ruleset ID. A second successful invocation is
   idempotent and performs no PUT.

No admin credential is supplied or obtained by this work. The available
connected GitHub tools do not expose ruleset mutation. Thus the automation and
payload can be prepared and tested locally, but this work cannot truthfully
claim live enforcement until an authorized administrator runs the supported
GitHub CLI apply/readback procedure and retains its evidence.
