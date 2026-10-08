# Native compiler cache preparation

The first full unchanged publication hook hit the 6656 MB Node heap limit.
`initial-prepush-qualification.*` preserves its real failure and missing
completion banner. That attempt established no compiler verdict.

The existing reviewed TypeScript 5.6.3 helper is pinned by its Git blob in
`preparation-command.json`. It writes only the normal native incremental
cache under node_modules. Actual compiler signature/invalidation bookkeeping
retains numeric missing-diagnostic entries for unchecked sources; sequential
semantic-diagnostic calls check those sources and native build-info emission
preserves any remaining unchecked entries. No records are fabricated or
manually marked clean.

11 processes prepared the cache: a seed followed by bounded
actual diagnostic batches. Each batch allows up to 3000 files, with a 6200 MB
soft RSS boundary and the same 6656 MB heap cap. Native checkpoints and garbage
collection occur between files. Full results and exact stdout/stderr remain in
`preparation/`; the summary retains every diagnostic and GC event.

The final program has 6969 roots and
12028 compiler sources. Missing diagnostics fell
from 11968 to zero; cached diagnostic-error files
ended at zero. Source roots, compiler options, existing skipLibCheck, gates
and zero-error baseline are unchanged. No concurrent cache writer ran.

After a later concurrent filing-path UI delivery was preserved, the unchanged
hook again exhausted its heap while checking newly invalidated sources.
`post-remote-advance-failed-qualification.*` retains that failure;
`pre-remote-advance-qualification.*` retains the earlier successful gate.
The same helper then completed 11 additional bounded
processes, from 11970 missing diagnostics to
zero, with zero cached diagnostic-error files. Exact commands and native
results are in `post-remote-preparation-command.json` and
`post-remote-preparation/`. Final source/root counts are
12030 / 6971.
Both qualified backend files remained identical, and the final production
build was rerun successfully with the other session's UI update preserved.

Preparation is not qualification. The full unchanged publication hook then
completed at source checkpoint `45e87a5f1ff1ac62f29f3eac108d714656f881e9` against `9d8eda896bc7b2990f5699760e80f7b3e4bd5014`, exit 0,
completion banner observed, `errors found: 0 (tsc exit 0)`,
55.855 seconds. Its authoritative transcript/verdict are
`../prepush-qualification.*`. Both frozen source/test files stayed identical.

The helper implementation and its native-cache toy safeguards are documented
beside the existing repository helper under
`docs/evidence/D2-D5/2026-10-06-document-dispositions/typecheck-memory/`.
