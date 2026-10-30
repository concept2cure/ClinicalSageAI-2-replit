# D5: AnA's dispatch QC reads its verdict from the stored sequence (Rule 2, 2026-10-30)

Session `…01E8btkB`, D5 CSR-path lane. Found by the CSR path sweep's placement
finder and verified by hand. The sweep's verifiers did not run: they failed
on a billing error.

## What already exists

| Exists | Path | What it does | What was wrong |
|---|---|---|---|
| The deterministic gate | `server/services/ectd/assess-dispatch-readiness.ts` `assessSequenceDispatchReadiness` | Validation findings, Shadow Review, the agency-grade validation gate and the release signature, from server state. It is the gate freeze, dispatch and transmit enforce | — |
| The verdict function | `submission-ai-service.ts` `computeDispatchQcVerdict` / `runDispatchQc` | Uses the assessment when it is given; otherwise the hard gate over the counts it was given, with a warning | — |
| The route | `POST /api/submissions/:id/dispatch-qc` | Passes the assessment when it has a `sequenceId` | — |
| AnA's tool | `dispatch_qc_check` (`AnaToolExecutor.ts`, `submission-center-tool-defs.ts`) | "Decide whether dispatch may proceed" | It took `validation_errors` and `unresolved_shadow_criticals` from the model and never passed the assessment, so `clearedToDispatch` came from typed counts |
| AnA's read of the gate | `assess_dispatch_readiness` | The full assessment by sequence | — |

**What it allowed.** Asked "can the LMN-201 CSR amendment go?", AnA could
call the tool with zeros and answer "cleared to dispatch". Meanwhile the
platform's gate held the sequence, with no Shadow Review and no release
signature. That is a verdict from the model, which Rule 2 forbids.

## What changed

- `dispatch_qc_check` takes `sequence_id` (required) and an optional
  `submission_id`. It reads the assessment, and the assessment is the
  verdict. Counts in the call are ignored. Without a sequence it refuses and
  gives no verdict.
- The definition says so before AnA calls it. The capability manifest's entry
  carries the new description and inputs (the manifest round-trips
  byte-identical; nothing else changed).

## Evidence: seen failing first

| Check | Red (`red.txt`) | Green |
|---|---|---|
| Without a sequence: no verdict | fails: `clearedToDispatch: true` from the typed zeros | passes |
| With a sequence the gate holds: not cleared, `verdictSource: assess-dispatch-readiness`, the gate's blockers | fails: the assessment was never read | passes |
| The schema asks for `sequence_id` only | fails | passes |
| 25 files reading the definitions, the register, the inventory and the QC (`green.txt`) | — | 370/370 |

## Not done

- `assess_dispatch_readiness` and this tool read a sequence by organization.
  Neither checks the caller's project access (D6). This is unchanged and
  noted here.
