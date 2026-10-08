# AnA speed and client experience — fixed batch

Workstream: W3 / D4. Target: `concept2cure-v2` in `concept2cure/ClinicalSageAI-2-replit`.
Synchronized base: `185b6f089d58f4bb9f1cead26d9aef9a403f4576`.
Validated local source checkpoint: `034afaac71686b7c75125a8514affa5027cde950`. Publication includes this source and its qualification evidence; `source-files.json` pins the six unchanged implementation and regression files.
Published fixed batch: `c77a594b087f8b2f5205cdf4ff6a0d47ec54f1c7`.

## Changes

| Existing path | Repair |
| --- | --- |
| `server/routes/ana-ri/stream.ts` | Start scoped memory after conversation admission, history loading and saving succeed; overlap independent optional context reads. |
| `server/services/ana-ri/chat-context-builder.ts` | Start memory behind the existing caller and organization access check while route context loads. |
| `client/src/concept2cure/components/ana/renderSafeMarkdown.ts` | Promote cache hits to most recently used so viewed answers survive incoming streaming prefixes. |

Both context paths still await memory before building the model input and attach failure handling immediately. Scoped IDs, input limits, fallback behavior, sanitizer allowlists and the 200-entry cache bound are preserved. Three focused regression files accompany the repairs. No tools, models, surfaces, policies, dependencies or visual redesign were added.

## Validation

- Node `22.23.3`: **126 focused regression cases passed across nine files** — 45 backend cases and 81 renderer, sanitizer and figure cases. The new regressions failed before repair; red and green logs are adjacent to this record.
- Production client and server build: passed (`production-build.log`).
- Full-project canonical compiler: TypeScript exit 0, **zero errors** against the unchanged zero-error baseline. The complete unmodified pre-push hook passed, including tracked imports, no ESLint errors and **no growth in warning counts** (`prepush-qualification.txt`).
- AnA surface-context, document canvas path and native-canvas guards: passed. Independent review confirmed preserved admission, ownership and prompt-wait sequencing.
- Rendering checks cover active-history reuse, eviction of unread answers, malicious HTML on cache hits, authored figures and identical output. No layout changed; browser widths and frame rates were not measured for this batch.

## Measured improvement

- Controlled canonical context assembly: **300 ms → 180 ms** for a 180 ms optional read plus 120 ms memory read. This proves overlapping waits, not production model or database latency (`backend-benchmark.md`).
- Real Markdown parser and sanitizer, 80 viewed answers and 600 streaming prefixes: **1,000 → 680 parses and sanitizations**, **32% fewer**, with identical history and streaming output and the same 200-entry limit. Timings are host-dependent microbenchmarks, not a client SLA (`markdown-cache-benchmark.json`).

## Qualification follow-up

The first publication exposed three bounded qualification defects. The follow-up
repairs their fixtures and QA logging; it adds no AnA features. All six files in
`source-files.json` retain their recorded SHA256 values.

| Qualification defect | Follow-up repair and evidence |
| --- | --- |
| Program-list proof fixture omitted caller identity required by the existing handler: 12 passes / 1 failure. | Supply real caller identity and verify owner visibility, colleague exclusion, cross-tenant exclusion, foreign program exclusion and unidentified caller exclusion: **13 / 13 pass**. See `ownership-qualification/`. |
| Launch-scope self-test removed a module already retired by the current CPO catalog decision, so it no longer seeded a launch violation. | Remove the still-launch `ectd-compile` in the test copy and assert mutation occurred. The unchanged gate rejects all three seeded violations and passes the real tree. See `launch-scope-qualification/`. |
| Remote Semgrep found seven dynamic format strings in the existing send-for-review QA reproduction script. | Use literal formats with the tag as data. Fail-first AST check catches all seven; repaired check and **28 output cases** pass. See `semgrep-qualification/formatstring-report.md`. |

Local Semgrep is unavailable. The AST/output check does not replace its remote
gate. No baseline, gate, allowlist, catalog, migration, production dependency or
product behavior changed in the follow-up.

The exact first-publication workflow results are recorded in
`qualification-followup/remote-first-publication.json`: browser smoke, CodeQL
and agent validation passed; security contracts, full-history secret scan and
dependency/security scan passed within the unfinished CI workflow. Semgrep
failed on the seven QA-script calls above. The CI proof-tier and launch-scope
self-test steps failed on the fixture defects above; the overall CI run had no
final verdict at observation time.

Follow-up source checkpoint: `3d57c2416eb92680977b99cd66e74b8e8a9e927a`
(local validation checkpoint). The complete Node 22 proof tier passed with
**1,313 tests across 118 files**, exit 0, in 587.05 seconds. See
`qualification-followup/proof-tier-green.txt` and `qualification-files.json`.
The complete unchanged pre-push hook passed at that checkpoint: **exit 0**,
canonical TypeScript **zero errors**, no ESLint errors, no warning growth and
all tracked imports resolved. See `qualification-followup/prepush-green.txt`
and `prepush-verdict.json`. The initial follow-up transcript stopped before a
compiler verdict and was not counted as a pass (`prepush-incomplete.txt`);
the complete rerun finished in 50.907 seconds. No additional compiler
preparation or configuration change was needed. Transcript normalization
removes trailing terminal padding and blank lines, preserving commands and
verdicts.

The publication snapshot adds only this qualification record and its evidence
to the validated checkpoint. The connected publisher verifies every uploaded
blob, the exact local Git tree and the remote-head lease before updating
`concept2cure-v2`. Its final remote SHA and per-commit CI state are reported
with delivery; a pending remote run has no green verdict.

## Release boundaries

Publication means source delivery to the authorized canonical branch. GitHub CI results and any separately gated production rollout must be reported from their own evidence; local checks do not establish an AWS deployment or platform-wide qualification.

## Publication qualification

The complete canonical pre-push hook passed at the implementation commit, exit 0. An initial whole-project compiler attempt was killed by the 8 GB worker limit (`typecheck-resource-limit.txt`). The existing compiler-owned preparation workflow then checked all pending source diagnostics in bounded batches, preserving genuine errors and missing entries. The unchanged full-project gate subsequently completed successfully. Transcript text removes terminal padding and trailing blank lines; commands and verdicts are preserved. No compiler configuration, baseline or gate changed; `compiler-preparation.json` records the preparation, which is not itself a verdict.

Publication target is the authorized canonical branch. Shell Git lacked write credentials, so the connected GitHub publisher delivers the same validated source snapshot after the complete unmodified pre-push hook passed. The publisher verifies the exact Git tree and uses the current remote head as a lease before updating the branch. Remote branch confirmation and GitHub check status are supplied with the delivery. This batch does not dispatch a separate AWS production deployment.
