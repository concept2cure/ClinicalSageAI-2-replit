# Audited merge checkpoints — 2026-10-17

W1 / D2. Completed automated evidence captured during the merge on `concept2cure-v2`. There is **no human witness or human acceptance**. Native runtime qualification remains pending; active native and backend-final logs are excluded.

## Source identity and limits

The local source base and HEAD at capture are `2d9d0d83e720c99ee75828e2567033af529d9f1e`. The in-progress merge takes incoming `c5d278add74085cb629c70fa9286d04e39664d9b`, including the large snapshot `e1f3fd425eb242c6509f64c9a7a9a8a1b61c62a0`. `archive-index.json` records matching index/worktree blob pins for the reviewed backend/processing files at archive capture. These pins describe the current merged working tree; they do not retroactively identify the exact tree for every historical run. UI checkpoint pins are preserved separately where supplied. This archive is not a merge commit or final qualification claim.

## What the checkpoints establish

| Evidence | Outcome and interpretation |
| --- | --- |
| `task-handoff-audit-backend.log.gz` and `.json.gz` | First merged backend run: 34 files, 716 cases, 686 passed and 30 failed. Kept as the first red result. The JSON suite counters include nested suites; the console reports file counts. |
| Backend fixture repairs after that run | Twenty-eight failures came from the stale project-create actor-query fixture; two came from source-context mock/export and real admission prerequisites. The fixture repair retains the three-parameter current preflight (`false` for pending-deletion admission), the locked two-parameter active-only check, the real authorizers, and the original refusal codes. The source-context fixture now obtains a genuine current-access scope and delegates real rechecks. Focused projects 30, authority 40 and HTTP-refusal 26 green runs were tool-transcript-only; no raw artifacts have been fabricated for them here. A current aggregate is still required. |
| `task-handoff-audit-deploy.log.gz` | Completed canonical five-step migration/readiness check. Includes grant audit of 1,305 application relations and the runtime-role readiness checks. This proves schema readiness, not completed native behavioral qualification. |
| `audit-merge-processing-pglite-20261017.log.gz` and `.json.gz` | 74 passed: 52 processing-recovery and 22 processing-timestamp cases, zero pending. The two-file ESLint report has zero errors and warnings. PGlite is separate from native PostgreSQL runtime qualification. |
| `c2c-audited-ui-primary.log.gz` → `c2c-audited-ui-primary-final.log.gz` | First UI merge checkpoint: 164 passed and six failed; subsequent primary checkpoint: 183 passed across six files. Copy contracts, copy text and explicit retry seams were reconciled. Run counts differ after added controls; do not sum them as one suite. |
| `c2c-audited-ui-extra-final.log.gz` | 14 passed across two additional identified-host/tracked-filing files. |
| `c2c-audited-identified-host-red.log.gz` | Deliberate guard bypass: two expected failures after removing the host-true check; the helper was restored. |
| `reader-audit-authoring-unsaved-red.log.gz` → `reader-audit-authoring-unsaved-final.log.gz` | Five expected failures while bypassing the unsaved-work helper, then 27 passed after restoration. |
| `c2c-notification-guard-red.log.gz` → `c2c-notification-owned-green.log.gz` | Nine expected refusal-control failures against the incoming helper/button; subsequent notification checkpoint has 55 passed across eight files. The separate authoring checkpoint has two passed after Workbench restoration. |
| UI lint and checkpoint pins | Notification lint: zero errors and three inherited TaskTray warnings. TaskBoard baseline: nine warnings. The primary lint capture is intermediate: zero errors and ten warnings, including an unused-import warning subsequently fixed. Its filename does not make it final. Worker source changes continued after these captures, so none is current-tree final UI qualification. |

The processing command used Node 22, `NODE_OPTIONS=--max-old-space-size=4096`, default `vitest.config.ts`, verbose/JSON reporters, and these files: `server/services/clinical-regulatory-evidence/__tests__/processing-timestamp.pglite.test.ts` and `server/services/clinical-regulatory-evidence/__tests__/data-room-processing-recovery.pglite.integration.test.ts`. Processing lint used `--max-warnings=0`.

## Archive integrity

All 19 raw files are preserved byte-for-byte inside gzip members with timestamp zero and no embedded source filename. `archive-index.json` records original paths, original SHA-256, gzip SHA-256 and byte counts. `SHA256SUMS` covers the archived files and metadata. Decompression round trips were checked. Automated scans found no credential assignments, provider keys, private keys, JWTs or authenticated connection URLs. Public documentation/XML namespace references and synthetic invalid-domain test strings remain part of the raw test output. No private environment files were copied.

No product changes, database commands, compiler runs, commits or human witnessing were performed by this archival task. The control tower owns subsequent final evidence additions.
