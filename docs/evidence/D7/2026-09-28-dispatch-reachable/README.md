# P11-28b — an IND/NDA/BLA/MAA sequence can be dispatched from the Submission Center

**Rows:** D7 (the dispatch step on the path to one real sequence), D5 (the ceremony).
**Finding:** `docs/evidence/reviews/2026-09-28/ectd-lane-second-pass/part11-ux.md`, P11-28b.
**Date:** 2026-09-28.

## The defect

The Dispatch button read `gate`, which for IND/NDA/BLA/MAA requires a §11.70
release signature to already exist. On the submissions spine the signature it
accepts is the sequence's own dispatch-intent signature — recorded by the
Dispatch click itself (`runGoverned` signs, then dispatches). So the only
control that creates the signature was hidden until the signature existed. No
such sequence could be dispatched from the product's own screen; D7's test
sequence (an IND, for a biotech sponsor) could not get past `frozen`.

## Why the fix is on the server

Whether signing now satisfies the requirement depends on the resolver's spine
precedence: the orchestrator's verdict stands unless it is `unsigned`, and only
then is the sequence's signature consulted. Re-deriving that in the client is
how P11-28a (Freeze reading the wrong verdict) happened.

- `release-signature-status.ts` — the resolver reports `decidedBy`
  (`orchestrator` | `sequence`); pure `signingNowResolvesRelease` is true only
  for a sequence-spine `unsigned` or `revoked`. Never for `invalid` (on a
  frozen sequence that is tamper evidence; a fresh signature would paper over
  it), `undetermined`, or any orchestrator verdict.
- `assess-dispatch-readiness.ts` — pure `composeStepVerdicts` is now the only
  place `gate`, `freezeGate` and the new `dispatchGateOnSigning` are composed,
  so membership is testable.
- `SubmissionSeqWorkspaces.tsx` — Dispatch reads `dispatchGateOnSigning`
  (fail-closed on absence). When the signature is what the click supplies, the
  label reads "Sign the release and dispatch" (§11.50: the meaning of the act).

Nothing the server enforces is relaxed: the dispatch transition takes a fresh
assessment after the sign call has recorded the signature and enforces full
`gate` (`submission-service.ts` Gate 2). Checked separately: the release
signature's digest excludes `status` (amended 2026-09-21), so it still verifies
at transmit after dispatch.

## Also fixed — copy my own P11-28a fix left false

- "Freeze and dispatch stay locked while the gate blocks" rendered over a live
  Freeze button. The lock note now names the step that is actually locked.
- The "move it to Validated" freeze instruction was gated on the dispatch
  verdict — the step-verdict defect's third instance. Now reads `freezeGate`.
- The header had two states; a gate whose only blocker is the signature the
  click records read "Dispatch blocked". It now reads "Dispatch gate clear
  except for the release signature — the dispatch e-signature applies it".

The P11-28a tests asserted the button and never read the words around it.

## Falsification — 12 probes, each reverted

| Probe | Failed |
|---|---|
| S1 spine precedence dropped from `signingNowResolvesRelease` | 6 — incl. the real-resolver orchestrator-`revoked` case |
| S2 `invalid` treated as resolvable | 3 — incl. `composeStepVerdicts` membership |
| S3 `dispatchGateOnSigning` composed without the other gates | 3 membership tests |
| S4 resolver stops reporting `decidedBy: 'sequence'` | 1 |
| C1 Dispatch back on `gate` (the defect) | 1 — the positive case |
| C2 fail-closed `?.` guard removed | 8 — the component throws |
| C3 lock note back on `!gate.cleared` | 3 |
| C4 freeze instruction back on `gate` | 1 |

S1 first ran **without** the orchestrator-`revoked` case and was caught only by
the truth table: the orchestrator cases written first (`awaiting`, tampered,
undetermined) pass either way, since those verdicts are never resolvable. The
harmful case is an orchestrator `revoked` — resolvable on the other spine — so
it was added through the real resolver and now fails S1.

Two client failures during writing were the test's own: `/dispatch/i` also
matched "Run dispatch QC". The selector names the governed control.

## Results

- server: `release-signature-status.test.ts` + `assess-dispatch-readiness.gates.test.ts` — 66 passed
- client: dispatch/freeze/honesty/readiness suites — 30 passed
- `tsc --noEmit` clean on the touched files

## Not done

- Not exercised against a live server or real PostgreSQL end to end; the
  server path is proven by the resolver through mocked spines, the pure
  composition, and reading Gate 2. A pglite case driving
  sign → dispatch for an IND is owed.
- `transmit` UI gating was not re-examined.
- Separation of duties (signer ≠ author) remains unconfirmed; the route comment
  says `/api/c2c/actions/sign` enforces it, which was not verified here.
