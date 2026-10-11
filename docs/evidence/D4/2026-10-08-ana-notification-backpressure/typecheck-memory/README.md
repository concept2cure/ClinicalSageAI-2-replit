# Compiler resource recovery

The initial unchanged full gate passed before synchronization; its actual
verdict remains under `../concurrent-sync/`. After preserving the other
session's filing-copy update and rerunning all 250 tests and the build, the
same full hook exhausted its 6656 MB heap. `failed-full-gate.*` preserves exit
1 and the missing completion banner. It established no compiler verdict.

The existing reviewed TypeScript 5.6.3 native-cache helper is pinned by Git
blob in `preparation-command.json`. A seed and bounded actual semantic
diagnostic calls used 10 sequential processes. Each batch
admits up to 3000 files, checks a 6200 MB soft RSS bound, and keeps the same
6656 MB heap cap. Native build-info emission and actual compiler invalidation
retain numeric unchecked-diagnostic entries until they are checked. No clean
records are fabricated. Every result/diagnostic and GC event remains in
`preparation/`. Missing entries fell from 11972 to
zero, with zero cached diagnostic-error files. Final roots/sources:
6973 / 12032.

No compiler option, tsconfig include, skipLibCheck setting, baseline or gate
was changed to reduce the check. The unchanged warning ratchet's two generated
predecessor files remained through preparation and the full hook; their
original publication-base contents were verified and their paths are recorded
in `preparation-command.json`. They are removed after the hook and never
published. No compiler, build or test cache writer ran concurrently.

`incomplete-capture.*` retains an additional full-hook attempt whose process
returned zero but whose captured transcript lacked both a TypeScript verdict
and the completion banner. It was classified incomplete, never passed. The
final retry captured the complete subprocess output separately before writing
its evidence; the repository hook itself was unchanged.

Preparation is not qualification. The final full unchanged `.husky/pre-push`
then completed at `835386ce7265fbd927e99ab3899e02d741d9ab60` against `7de37444e6a3272984ab5405e395dd4b4ca4de2b`: exit 0, completion banner
observed, TypeScript zero errors (tsc exit 0), 60.506
seconds. Its authoritative transcript/verdict are `../prepush-qualification.*`.
Both qualified backend files stayed identical throughout recovery. Helper
implementation and toy native-cache safeguards are documented beside the
existing helper under `docs/evidence/D2-D5/2026-10-06-document-dispositions/typecheck-memory/`.
