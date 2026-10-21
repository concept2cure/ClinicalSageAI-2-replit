# Source-first assembly UI evidence

The final focused replay passes **97/97 across five files** under Node22.23.3 and `vitest.config.ts`, after the final Workbench warning cleanup. [ui-summary.json](ui-summary.json) records the phase boundaries, source pins and verified archive hashes.

| Phase | Result | Boundary |
| --- | --- | --- |
| Initial fixture integration | 95 passed, 2 failed | An assertion-placement mistake affected two source-flow tests. [Original JSON](task-handoff-source-first-ui-first-red.json.gz) and [log](task-handoff-source-first-ui-first-red.log.gz) remain unchanged. |
| Corrected fixtures, before final cleanup | 97 passed, 5 files | [Intermediate result](task-handoff-source-first-ui-pre-cleanup.json.gz) completed before the pause arrived; it does not qualify the subsequent cleanup. |
| Final source replay | 97 passed, 5 files | [Final JSON](task-handoff-source-first-ui-final.json.gz), [log](task-handoff-source-first-ui-final.log.gz), [five paths](task-handoff-source-first-ui-final-files.txt.gz) and [exact command](task-handoff-source-first-ui-final-command.txt.gz). |

The final run began at `8157fbfe0` plus the frozen staged cleanup and corrected fixtures, then completed at `6562dd67aeb13edd17a1d9c62f214163a4e8e6a3`. All **34 before/after source, test and configuration hashes** match that final commit: [before](task-handoff-source-first-ui-final-before-pins.json.gz), [after](task-handoff-source-first-ui-final-after-pins.json.gz). The four owned files have [zero lint warnings/errors](task-handoff-source-first-owned-lint.json.gz).

The [fixture diff](task-handoff-source-first-fixtures-reconciliation.patch.gz) preserves real auth exports and adopts matching synthetic credentials; the [original fixture pins](task-handoff-source-first-fixtures-before-pins.json.gz) match incoming `e62320e0a`. The pending source13 handoff is refused while source12 remains held. After strict saved-record and actual-host recovery, source13 requires an explicit retry. The receipt, no-second-commit and no-generation assertions remain.

These are focused hook, selected-source, chooser, actual Workbench flow and draft-review checks with synthetic HTTP/accounts. They do not constitute a new full717 UI run, native replay, live-provider proof, publication or human acceptance. Other root and backend executions remain separate. Every gzip has zero mtime, no embedded filename, and a verified byte-for-byte decompression match.
