# Reconstructed analytical precision repair

Plan: F1. Existing deterministic analytical method validation and its AnA caller.
Base: `f9631c065af8760d8b879232385fb94663d19a24`.

## What already exists

- `server/services/analytical/method-validation.ts` computes linearity, precision and accuracy. Precision uses sample standard deviation divided by the absolute mean. The present zero-mean branch returns zero percent RSD and may report a pass for an undefined quantity; finite inputs can also overflow or underflow intermediate arithmetic.
- `server/services/ana/AnaToolExecutor.ts` registers `assess_analytical_method_validation` directly, returns a stated-input result, and maps finite/required-parameter errors to `needs_parameters`. It does not use `runStatsTool` for this calculator. That held executor is unchanged.
- `server/services/ana/tool-outcome.ts` recognizes the parameter response as a `needs_input` shortfall. A completed handler is not evidence that a numerical result was produced.
- Existing regression homes are `server/services/analytical/__tests__/method-validation.test.ts`, `server/services/ana/__tests__/analytical-method-tools.test.ts`, and `tests/services/tool-outcome.test.ts`.
- The CMC method-validation signing path is a separate governed record. This calculator repair does not qualify that path or expand the existing small-molecule US IND composer scope.

Discovery used `rg` for `method-validation`, `assessMethodValidation`, `assess_analytical_method_validation`, callers and method-validation surfaces. A bounded deleted-history search (`git log --all --diff-filter=D -n 6` on analytical/method-validation aliases) found legacy schema cleanup; no alternative retained calculator supersedes this one.

## Recovery and scope

The prior local commit and its bundle were absent after the executor reset. This reconstructs the recorded precision patch and regressions on the canonical base and executes them again. It does not claim recovery of the earlier commit object or reuse its test counts.

The guard uses the unrounded mean, refuses nonfinite intermediate or displayed results, and refuses a zero standard deviation from differing replicates (underflow). Equal nonzero replicates, negative means and ordinary small finite inputs retain their valid behavior. No numbers, tables or historical review receipts are rewritten.

## Validation

Fresh red execution reproduced 18 failures with 25 passes (`red.log`). Fresh repaired execution passed all 43 cases across the calculator, its AnA handler and the unchanged tool-outcome suite (`green.log`). The cases cover zero and cancelling means, overflow, underflow, valid equal replicates, negative means, small inputs, and an unrounded nonzero mean whose display rounds to zero. The AnA path returns a needs-input shortfall and no numerical result for invalid inputs.

Full repository publication gates remain separate. No high-risk model, analytical method approval, native database or browser qualification is claimed by these calculator tests.
