# Compiler memory recovery

The first full unchanged pre-push attempt exhausted Node's 6656 MB heap while
checking the complete project. Its actual exit 1 and missing completion banner
are retained in `initial-prepush-qualification.*`. It established no typecheck
verdict.

The already-reviewed repository helper
`docs/evidence/D2-D5/2026-10-06-document-dispositions/typecheck-memory/c2c-ts-prewarm.cjs`
prepared TypeScript 5.6.3's native incremental cache. The helper Git blob,
runtime, full source checkpoint, arguments and cache path are pinned in
`preparation-command.json`. `preparation/` contains each process's exact
stdout/stderr and the cumulative native result summary.

Preparation used 10 sequential processes: a native signature/
invalidation seed followed by bounded actual semantic-diagnostic batches.
Maximum files per batch: 3000; soft RSS boundary: 6200 MB; Node heap cap:
6656 MB. The seed retained compiler-produced numeric missing-diagnostic IDs
for unchecked files. Subsequent actual diagnostics reduced pending entries
from 11874 to zero. Final cached diagnostic-error
file count: zero. No build-info records were invented or manually marked
clean. The helper checkpoints native compiler output and optionally collects
garbage between files, without changing diagnostic semantics.

The full configuration contains 6875 root files and
11934 compiler source files. Compiler options,
source roots, existing skipLibCheck, zero-error baseline and gate scripts are
unchanged. No concurrent compiler/cache writer ran. The same six production/
regression blobs stayed frozen throughout.

Preparation alone is not qualification. Afterward, the full unchanged
`.husky/pre-push` ran again at checkpoint `a8f59c24c74f1870d7590bb06424f42f0dbcbcae` against `4536fe4c2a4ad16a9722c9bfe61bc1a403426c06`
and completed with exit 0, its completion banner and
`errors found: 0 (tsc exit 0)`. The final hook took
67.617 seconds. The authoritative completed transcript
and verdict are `../prepush-qualification.txt` and
`../prepush-qualification.json`.

The existing helper's original toy/native-cache safeguards and implementation
are recorded in its adjacent README. These checks do not narrow the compiler
scope or waive the unchanged final gate.
