# Project workspace ownership merge: UI integration

Read-only review and verification on root's merged runtime `6eeab18fb`, preserving incoming canonical `f0e0ff863`. All five UI-owned runtime/test files remained frozen; no source correction was needed.

## Composed boundary review

ProjectHome adopts one actual actor/session and passes it into a keyed ProjectWorkspace. The resolved merge retains local `metadataEpoch` state, its metadata/activity read dependencies, the metadata read's session/epoch key, the single Settings header mount and the Reports door. The workspace owner key does not include metadataEpoch, title or stage, so a verified settings save refreshes recorded metadata/activity without remounting the selected stage. Account/session/project ownership changes retire the workspace and its local drafts/reads; source-pin retirement remains in ProjectHome's owner transition.

The recorded-profile cards retain their independent exact bearer/tenant/shell/receipt checks. The merge changes neither their GET contract nor the distinction between saved profile instructions, authored project instructions and ProjectSkills. Incoming action supersession keeps the existing bus and aliases; the new tests exercise newer successful same-action choices, refusal/throw preservation, independent queued actions and retry-timer ownership.

## Frozen-tree executions

Node 22, `NODE_OPTIONS=--max-old-space-size=4096`, standard repository Vitest configuration. All executions exited 0.

| Evidence | Result | Duration |
| --- | --- | --- |
| `ui-home-ownership-focused.txt` | **81 passed / 5 files** | 15.95s |
| `ui-home-ownership-retained.txt` | **120 passed / 12 files** | 29.67s |
| `incoming-home-ownership-actions.txt` | **22 passed / 2 files** | 8.73s |

The first two repeat the existing 201-case selection, including generic/IVD settings-save stage retention, scoped profile ownership and current MDx/project consumers. They are not additional cases beyond the prior UI qualification. They retain the same two focused and nine parent/MDx React `act(...)` warnings.

The separate incoming cohort comprises `projectHomeOwnershipBoundary.test.tsx` (**10**) and `surfaceActionSupersession.test.ts` (**12**). It emits no stderr or React warnings. Its 22 cases remain separate from repeated PM counts and are not described as authored by this UI agent. No failed or skipped cases were reported.

These are synthetic API/auth/component checks, not deployment or agency acceptance. No Git mutation, build, whole-project TypeScript, provider call or source/test edit was performed by the UI agent. Root owns final source binding, build/compiler and ordinary publication gates.
