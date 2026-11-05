# AnA memory acceptance: full-content identity and phrase polarity

Repository: `concept2cure/ClinicalSageAI-2-replit`  
Branch: `concept2cure-v2`  
Baseline: `ccc797bd708528dbc50523c52b4125b011ef7eb8`  
Plan: F1; launch row D2 repair evidence, not closure.  
Completes: `server/services/ana-ri/memory-acceptance.ts`.

## What already exists

- `server/services/ana-ri/memory-acceptance.ts`: the existing acceptance gate, content bounds, scoring thresholds, deduplication and eight phrase-pair contradiction checks. This is the only production file changed.
- `server/services/memory-consolidation-job.ts`: calls this gate before promoting conversation summaries. It compares up to 50 recent active/pending-review entries in the selected organization/project, rejects duplicate candidates and quarantines contradiction matches. Its persistence, confidence treatment, tenant scope, concurrency guard and scheduling are unchanged.
- `server/services/ana-ri/index.ts`: exports this same gate; no parallel memory system.
- `tests/ana-single-brain.test.ts`: existing high-confidence, length, duplicate and contradiction cases. This file and its other subsystems are unchanged.
- `server/services/lumen-context/intelligence-prefix.ts`: the previously repaired recall cache; unchanged by this batch.

Connected searches covered `evaluateMemoryCandidate`, `dedupe_key` and the existing recall invalidator; the acceptance module, consolidation caller, existing tests, repository rules, plan ledger and coordination record were read. No hold on this production path appeared in the inspected coordination record. F1 is open. Git remote access failed because container DNS could not resolve GitHub; the full checkout, deleted-history audit and repository dependency runtime were unavailable. The complete baseline bytes were checked against Git blob `87ac36d8e473b559fe3797ad1a1fdcca9ee74360` before execution.

## Defects reproduced and repaired

1. **Different facts were classified as duplicates.** Identity was a 32-bit hash of only the first 200 normalized characters. Two summaries could share their objective and references but have different conclusions, measurements or source identifiers afterward; the later candidate was rejected before contradiction review. Different short strings could also collide. Admission now requires equality of the complete normalized content and category. The diagnostic fingerprint is a versioned SHA-256 of the unambiguous category/content tuple. Existing comparison records supply their content, not stored fingerprints; no key migration is needed. Existing case/whitespace equivalence and category distinctions are retained.
2. **Matching negative assessments could contradict themselves.** Substring matching read `complete` inside `incomplete` and `compliant` inside `non-compliant`. Whole-phrase boundaries now exclude word fragments, including Unicode letters, marks, numbers and underscore. Only a matched negative phrase is masked before checking for a separate positive assertion. Ordinary whitespace/case differences no longer hide a configured phrase. A conflict notice quotes the actual opposing phrase instead of sometimes quoting the same side twice.

The eight configured pairs, confidence function, numeric thresholds and final acceptance-disposition logic are byte-for-byte unchanged; their hashes are recorded. A genuine configured conflict still reaches human review, true duplicates are still rejected, and removing a false conflict does not raise a candidate's confidence.

This is not semantic contradiction detection or scientific evidence qualification. Different subjects, time periods, unconfigured negations and indirect claims remain outside this lexical check's ability to resolve. The caller's 50-entry comparison window remains. No existing memory records are rewritten, deleted, restored or automatically cleared for review. No new route, service, tool, store, schema, model, screen or dependency.

## Executed verification

The same 57-case suite executed the complete original and repaired production module using Node 22.16.0 and TypeScript 5.8.3:

| Version | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Baseline | 30 | 27 | 0 |
| Repaired | 57 | 0 | 0 |

The suite does not copy the implementation or substitute the acceptance logic. It uses synthetic text and no database, provider, clock or evidence-service mocks. Cases cover long shared prefixes, changed conclusions/numbers/sources, a known short-text hash collision, all eight phrase pairs in both directions, matching assessments, phrase boundaries, whitespace, conflict attribution, disposition thresholds, length limits and provenance preservation.

A strict semantic TypeScript check of this production file passed with ES2022/NodeNext and the preinstalled Node type declarations (25.1.0, not the repository lockfile). The test runner's syntax check passed. `case-results.tsv` contains every case. `execution.json` records source, suite and raw-log hashes. `raw-results.tar.xz` contains the actual before/after TAP logs and the focused typecheck result; these are not CI logs.

Repository Vitest suites, whole-repository typechecking, full build, pre-push hooks, database/consolidation integration, authenticated UI/chat and hosted deployment were not run. The prior commit's Tier 5 workflow remained queued when inspected. This repair is not a production-release qualification or proof that the entire memory pipeline is correct.

## Reproduction and publication

```sh
node --test tests/services/ana/memory-acceptance-fidelity.test.cjs
C2C_MEMORY_SOURCE_ROOT=/path/to/baseline node --test tests/services/ana/memory-acceptance-fidelity.test.cjs
npx vitest run tests/ana-single-brain.test.ts
```

The baseline snapshot requires the single original production file. The Node runner uses installed TypeScript; `C2C_TS_PATH` may select an existing installation. Nothing is downloaded. The focused check used `tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --types node --typeRoots <installed-ts-node>/node_modules/@types --skipLibCheck server/services/ana-ri/memory-acceptance.ts`.

Publish against the current base tree with an expected-head, non-force update; verify the changed-file set and remote readback. Direct GitHub writes do not execute local pre-push hooks. This evidence does not itself prove publication. No PR, alternate branch, reset, migration or backfill. Rollback is an ordinary revert.
