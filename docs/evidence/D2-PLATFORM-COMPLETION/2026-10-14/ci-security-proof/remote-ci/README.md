# Remote CI read-only triage — 2026-10-14

Captured at 2026-10-14 01:15:27 UTC from GitHub Actions [CI run 38490851867](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38490851867), attempt 1, branch `concept2cure-v2`, SHA `317831f4596b966d4e4a857c4686fe8d119ad605`. The local baseline is `920b230bd1509a41347fe653605babdabea2ae78`; current uncommitted repairs postdate the remote run.

The latest captured Integration, Coverage, and Test steps are still running. Partial decoded Integration and Coverage logs each record **18 failing test markers across 2 files**: founder-path lineage (12), workflow-source import (6). These are **not final Vitest totals**. Test logs could not be decoded: the connector reported `Transport closed` twice, and the gh fallback returned no decoded body.

| Job | Link | Observed state | Evidence |
| --- | --- | --- | --- |
| Test | [115621021181](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38490851867/job/115621021181) | Running | Log unavailable; no count claimed |
| Integration Tests | [115621021152](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38490851867/job/115621021152) | Running; earlier provisioning step failed | 18 partial failing markers; real-database tests skipped |
| Coverage (ratchet) | [115621021157](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38490851867/job/115621021157) | Running | 18 partial failing markers; ratchet step pending |

## Remaining founder fixture mismatch

`tests/lineage/founder-path-lineage.pglite.test.ts` starts failing at hop 3, when AnA drafting returns “Current project access could not be verified. Nothing was changed.” The journey's own schema check records `[42P01] relation "project_visibility_settings" does not exist`. Its canonical creator is `db/migrations/20260401_project_sharing_visibility.sql`.

No authoring document is created, so later section, freeze, Vault, sequence, and walk failures follow missing recorded IDs. The retention check also observes differing codes/statuses after the incomplete journey. Provision the canonical sharing persistence in the founder fixture and re-run before deciding which downstream assertions need legitimate updates. Preserve the shrink-only lineage baseline and production access checks.

## Failures already addressed by current work

The six workflow-source materializer failures each say “The saved workflow source could not be verified. Nothing was imported.” The current owner already changed its fixture to add `document_span_lineage.usage` and `confidence`, and updated controlled export refusal expectations. This remote run predates those edits; cite the owner's current-source green proof separately.

Integration's deploy-shaped provisioning failed with: “required object contract not met: immutable_report_records incomplete — missing index on organization_id.” This matches root's existing `irr_org_idx` canonical-install repair. The remote real-database RLS step was skipped, so this run does not prove native tests passed.

Lint's schema proof/audit fixture/text-ramp failures and the full-history secret scan appear in the complete job metadata; their current repair proofs belong to the respective owners. The snapshot should not be interpreted as new failures after those local repairs.

## Evidence limits

`snapshot.json` contains only run/job identifiers, conclusions and safe failure metadata. Raw decoded logs stayed in tool memory and were not written into the repository. No test totals, coverage metric, final conclusion, or current-tree CI green status is claimed without a finished summary. The coverage test step deliberately uses `continue-on-error`; a failing assertion does not establish failure of the later coverage ratchet.

No production files, tests, workflow settings, secret-ignore entries, GitHub state, commits, or branch state were changed by this triage.
