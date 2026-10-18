# Selected-source assembly: native impact

No additional native replay is required by the incoming selected-source assembly delta. [native-impact.json](native-impact.json) records the exact source paths, callsite assessment and historical pin intersections. This is a read-only impact record; root records focused tests, compiler and publication outcomes separately.

The actual comparison is `87824205c33c4bc3e586060f61eab62ffb26a852..e62320e0a9555188a08ce426d7c16c72d372d824`. The merge base is also the incoming commit's parent. A raw `b90ad42c5..e62320e0a` two-way diff includes local retained native fixtures, PG15 and other fixes absent from the incoming branch; those differences are not incoming changes.

The incoming delta changes no native test, canonical migration or PG15 processing implementation. Native36 does not call assembly preview/commit or section AI draft/accept. Workflow19's import, document/section seeding and ordinary `POST /sections` paths remain byte-unchanged, as do the Vault ingest/lifecycle/submission paths exercised by the subsequent61-case slice. The shared evidence-spine change adds an optional executor to `getSource`, defaulting to the same pool; existing two-argument callers retain identical SQL and adaptation behavior. The new assembly reader supplies the third argument.

| Historical execution | Recorded pins | Incoming file-level intersections |
| --- | --- | --- |
| 311 cases /36 native files | 4,630 | 3 |
| Affected workflow19 /one file | 4,900 | 6 |
| Company/Vault61 /six files | 7,364 | 7, including one default test |

These file-level intersections do not alter an exercised native call path. Retain the original [native311 evidence](../audit-integration/final-qualification.md) and [assembly/workflow19/company61 phase boundaries](../assembly-integration/qualification-summary.json) with their execution anchors. Do not relabel historical manifests as universally matching the merged source. Focused default coverage should exercise selected-source assembly and AI acceptance; this record establishes no new test result or full canonical CI qualification.

No database, test or compiler command, production edit or publication operation was performed by this assessment. Human witnessing remains unexecuted.
