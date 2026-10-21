# Saved-source UI credential integration — recovered receipts

The final default Vitest run on 2026-10-18 completed **91/91 cases in four files** (41 saved-reference unit, 12 actual Workbench flow, 29 assembly-hook and 9 source-first flow). The complete raw report/log and original command/file list are retained. The final process exit code was not separately captured; the report is complete and reports success.

Source is `4c0c791c42aa72b49e4d23232437bc270ec592a5`. All 42 original before-pins match that commit’s SHA256 and Git blob IDs. **The immediate final after-snapshot was not retained** when the agent turn was interrupted. The [recovery comparison](recovery-comparison-2026-10-20.json) was performed on 2026-10-20 and labels that later timing explicitly. It records the recovered worktree/hash comparison without calling it an immediate post-run measurement.

The five credential controls first failed against the unmodified incoming saved-source controller/transport; 36 other cases were filtered out, not executed in that probe. The first integrated 91-case cohort at `aa4dd090f` had 90 passes and one failure, with 42 before/after source pins unchanged. That failure caught the historical saved-source display remaining visible after a late bearer mismatch even though reuse was refused. The final one-line correction restores the incoming redraw-on-alive behavior and keeps current-owner admission, response/cache/adoption checks and captured request headers intact. Its 91-case green replay is a distinct execution.

Owned five-file lint passed with zero errors and warnings. The retained reconciliation patch and initial owned-frozen pins describe the pre-final `aa4dd090f` composition; they are not relabeled as the final controller. [Summary and artifact digests](ui-summary.json) list every deterministic gzip receipt and its original bytes/hash. Original scratch artifacts remain untouched.

These are synthetic default UI regression checks. They do not establish a live provider, native database behavior, hosted CI success or witnessed human acceptance. Publication status and the combined qualification remain the parent packet’s responsibility.
