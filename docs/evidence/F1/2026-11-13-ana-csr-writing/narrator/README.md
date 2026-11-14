# Source-faithful statistical wording

## What already exists

`server/services/ana/statistical-narrator.ts`, its `narrate_statistical_result` handler in `AnaToolExecutor.ts` and its existing definition in `evidence-literature-tool-defs.ts` already own this behavior. The Nov13 implementation still rounds values/p-values and infers significance/confirmation without sufficient context. No additional statistical engine or tool is added. Prior Oct30 regression intent is recovered as reference, then executed against actual Nov13 source before repair; that old commit is not claimed to be on canonical.

## Observed verification

The current-runtime RED phase produced 31 failed and seven passed cases across three files in 22.782 seconds. Failures expose precision changes, unsupported hypotheses, conflicting inputs, invented defaults and confirmatory standing. The actual registered-handler source-warning controls remain passing. The successor passes all 38 cases across the same three files in 17.355 seconds. Each execution retains its own ten unchanged selected source/configuration/test pins; phases are not pooled. [checks.json](checks.json) indexes exact phase results, while [archives.json](archives.json) hashes lossless commands, raw JSON/logs, snapshots, original sources and the reviewed reference patch.

The existing tool now preserves finite numeric values, requires explicit supported two-sided frequentist superiority context for inference, and additionally requires prespecification, nonexploratory status and multiplicity control for confirmatory wording. Invalid/conflicting inputs remain unassessed. Unsupported noninferiority, equivalence and Bayesian decisions remain descriptive; their inputs do not receive superiority-only conflict judgments. Unknown/nonfrequentist intervals are labelled reported intervals. Caller-supplied/source-verification warnings remain.

Numeric JSON cannot preserve presentation details such as trailing zeros. These cases verify wording/software contracts, not retained study truth, a new statistical method, live model quality, medical validation, training or clinical qualification. Full compiler/publication results are recorded separately after normal gates.
