# Existing sequence callers and dispatch authorization completion

## What already exists

`server/routes/ectd-compile.ts`, `server/services/ana/AnaToolExecutor.ts` and
`server/services/submission-service/submission-service.ts` already compile,
export and transmit through the canonical identity reader and packager. Their
real FDA path still supplied a placeholder DUNS and omitted contact details.
The existing signature verdict, sequence lock, compare-and-set send claim,
assembly blockers, gateway guard and chained transition audit are retained.

`server/routes/submissions.ts` already returns dispatch readiness and signer
independence. Its existing dispatch action and precheck only admitted frozen
sequences; there was no reopen/unfreeze path for a dispatched sequence whose
recorded applicant changed. The completion renews that existing FDA dispatch
authorization while preserving immutable leaves and frozen state. Generic
lifecycle transitions remain forward-only.

## Changes exercised

- Compile and AnA pass recorded FDA DUNS/contact values and refuse absent or
  invalid recorded facts. AnA tests inspect the real generated regional XML.
- Freeze/dispatch assess the FDA identity captured by the existing content
  binding. Program/sponsor share locks protect the under-lock digest check.
- Transmit compares the signature's capture/digest under its existing claim
  locks, assembles only that capture, and compares the assembly echo plus a
  fresh binding before gateway entry. The same immutable proof and bundle
  hash reach existing transmittal metadata and audit details. Non-FDA calls
  preserve usable supplied regional IDs and leave unknown IDs empty.
- Existing FDA dispatch authorization may be renewed only for explicitly
  unsent states (null/pending/rejected), with a fresh signature, current gates,
  an exact dispatch-status CAS and the existing chained audit. The spent
  signature ledger is checked again under the sequence lock, because renewing
  does not change the lifecycle status. In-flight/sent/acknowledged and unknown
  states refuse; non-FDA renewal is outside this slice.
- Existing readiness adds `dispatchAuthorization` from the same eligibility
  helper used by the action and precheck. It is advisory; signature and
  content gates remain authoritative at the write.

## Failing-first and diagnostic record

| Output | Result |
|---|---|
| `red-ana.txt` | 5 failed / 4 passed: actual FDA XML still had placeholder identity and incomplete identity was not refused |
| `red-transmit.txt` | 5 failed: caller override, changed facts and missing/mismatched assembly proof reached the gateway |
| `red-dispatch-renewal.txt` | 7 failed / 1 passed against the forward-only dispatched lifecycle |
| `red-renewal-spent-lock.txt` | 1 failed / 9 passed: a signature spent during checks could be consumed twice |
| `red-broad-compatibility.txt` | 3 failed / 5 passed: existing CAS source assertion and FDA dry-run fixtures predated the captured identity contract |
| `green-broad-compatibility.txt` | **12/12 in 2 files**: same CAS condition retained; non-FDA dry runs and complete/incomplete captured FDA facts exercised |
| `green-final-cohort.txt` | 259/259 in 19 files before the final spent-ledger correction |
| `green-final-canonical-callers.txt` | **260/260 in 19 files**, exit 0, after the correction and integrated canonical merge |
| `caller-type-boundaries-red.txt` | Normal full compiler refused two caller optional-value boundaries; the full normal gate output is retained in parent evidence |
| `green-type-boundaries.txt` | **31/31 in 3 files**, exit 0, after the two boundary corrections; lint has 0 errors and 7 unchanged warnings |
| `green-renewal-spent-lock.txt` | 21 passed / 10 failed: the new PGlite pool double accepted string SQL but not Drizzle's pg QueryConfig object |
| `green-renewal-spent-lock-normalized.txt` | 31/31 after normalizing QueryConfig text/values; the production guard remains unchanged |
| `green-canonical-callers.txt` | 250 passed / 10 failed in 19 files, the same test-double protocol defect above |

Oversized outputs retain a concise tail at their original `.txt` path and the
complete raw execution output in the adjacent `.txt.gz`. Intermediate failures
are retained rather than relabelled as a passing run. The final integrated
19-file replay is `green-final-canonical-callers.txt`; it completed with 260 passing cases in 19 files (346.59 seconds).

The controlled PGlite renewal tests use the actual signature binding,
packager, row mutation and chained audit; their readiness assessment is a
controlled positive fixture. Actual resolver compatibility, native PostgreSQL
interleaving, browser, compiler and canonical publication are separate parent
evidence. No licensed agency conformance, live agency transmission or human
witnessing is claimed by this caller cohort.

## Compiler boundary correction

The normal full compiler refused an optional dispatch status passed to a helper
and an optional submission program ID passed to the transmit claim. The helper
now accepts the actual optional type while retaining its strict status comparison
and refusal of missing/unknown dispatch state. The claim explicitly represents
an absent program ID as null, matching its existing captured metadata contract.
The focused renewal, readiness and transmit replay passed 31 cases in 3 files
(25.48 seconds); service lint reports no errors and 7 unchanged warnings.

`input-verification-before-type-fix.json` preserves the exact input hashes of the
260-case execution. `input-verification.json` pins the corrected current source
and names only the post-correction 31-case replay as its result. The compatibility
record similarly preserves its earlier 12-case execution inputs separately and
points to the post-correction replay. Parent evidence owns the subsequent full
compiler and canonical publication; no earlier cohort is represented as having
consumed the corrected source.
