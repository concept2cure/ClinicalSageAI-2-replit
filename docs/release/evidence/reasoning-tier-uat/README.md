# Reasoning Tier UAT Evidence Store

This folder holds immutable human UAT evidence used for Reasoning Tier GA decisions.

## Required structure

`<cycle-id>/<run-id>.md`

`<cycle-id>/CYCLE_SUMMARY.md`

Example:

`cycle-01/2026-04-02_uat-01_run-01.md`

## Authoring rules

- Start each run from `docs/release/REASONING_TIER_UAT_EVIDENCE_TEMPLATE.md`.
- Do not include PII; use participant aliases.
- Attach or link supporting payload/audit artifacts for every pass/fail claim.


## Validation commands

- `npm run -s ci:reasoning-tier-uat-evidence` (non-strict; warns if no run files yet)
- `npm run -s ci:reasoning-tier-uat-evidence:strict` (requires at least one run file)

- In strict mode, each cycle folder must include `CYCLE_SUMMARY.md`.

- `cycle-sample/` is an illustrative example only; replace with real UAT evidence in release runs.
