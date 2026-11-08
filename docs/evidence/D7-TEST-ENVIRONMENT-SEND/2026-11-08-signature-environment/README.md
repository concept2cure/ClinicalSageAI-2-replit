# F1: a transmit signature names the environment it was given for (row D7, 2026-11-08)

F1 slice 2's 2026-11-08 review found this defect (`../2026-11-01/README.md`, "Owed" item 1). The coordinating session
(`01JbQU…`) ordered it next, ahead of 3b slice 3 (c), because it is the one queued item where a signature could
authorize an act it did not mean.

## The defect

The transmit `sign` payload carried `{ intent, meaning }` only. A person signed in a dialog that said "sends the
package to the agency's test environment … a test send is not a filing". That person could then present the same
signature to `POST /api/submissions/sequences/:id/transmit` with `environment: 'production'`, through AnA, a script or
a hand-made request. Gate 1 accepted it and the sequence was filed.

A test send and a filing are different acts with different meanings: 21 CFR 11.50 (the meaning of a signature) and
11.70 (its link to the record). This gap is older than slice 2; slice 2's dialog made the test-only meaning explicit.

## What already exists (RULE 3)

- Gate 1, `governedSignatureVerdict` (`server/services/submission-service/submission-service.ts`), already takes a
  `payloadRefusal` hook (`SignaturePayloadRefusal`). The shadow-finding disposition uses it (P-35: which finding,
  closed how).
- `ENVIRONMENT_WORDS` (`server/services/submission-gateways/governed-transmit-checks.ts`) already gives the
  environments in words. It is now exported and reused, not copied.
- The client's one sign call, `SubmissionCenter.tsx`, already adds a disposition's fields to the payload.
- The sequence is already bound by the signature's target (`ectd-sequence:<id>`), and intent and meaning are already
  checked. The attempt id is minted when the claim is taken, after signing, so no signature can carry it.

## The change

- **Server.** The transmit Gate 1 passes `transmitEnvironmentRefusal(payload, environment)`:
  - a signature naming another environment is refused, naming both: "this signature was given for a send to the
    agency's test environment, not to the agency's production environment; sign again for this send";
  - a signature naming none is refused: "the signature does not name where the package goes …".

  Each refusal voids the signature as any refused step's does (P-23). The GOVERNED_REQUIRED instruction now names the
  environment the payload must carry. Signatures recorded before this carried no environment and are refused: each
  is single-use, so a fresh one is signed.
- **Client.** The transmit sign payload carries `environment`, from the panel's choice (`transmitEnvironmentField`).
- No migration, no new non-test file, no new route or token.

## Tests

- `refused-step-voids-signature.pglite.test.ts`, through the real transmit guard on PGlite:
  - the staging-then-production case now meets the environment refusal, which is shown;
  - so does the case where a failed staging send's signature is presented to production;
  - a new case: a filing signature presented for a test send is refused, a signature naming no environment is
    refused, and the sequence stays 'pending'.
- The fixture's `sign` takes payload fields (`_freeze-gate-fixture.ts`). Every transmit signature in the tests names
  the environment of its send: `refused-step-voids-signature`, `transmit-guard-refusal-releases-claim`,
  `transmit-recorded-identity`, `gateway-selection` and the lineage helper `founder-path-lineage.hops-filing.ts`.
- `submissionCenterLifecycleQa.test.tsx`: the sign POST names `environment` for a test send and for a filing.

| File | What it shows |
|---|---|
| `mutation-1-red-no-environment-in-gate-1.txt` | the code without the binding: the two environment cases fail. This is the red run |
| `mutation-2-red-client-signs-no-environment.txt` | the client without the payload field: both sign assertions fail |
| `green.txt` | 7 files, 124 of 125 pass |

In `green.txt` the one failure is `gateway-selection`'s "throws VALIDATION" (AUDIT_UNCONFIRMED). It fails identically
on clean HEAD, and the coordinating session is triaging it. Its positive control passes, with a signature naming
'staging'.

`tests/lineage/founder-path-lineage.pglite.test.ts` fails from hop 2 onwards (INDEPENDENT_CHECK_REQUIRED and missing
data, the same upstream failures as `placement-vault-leaf-parity`). Its transmit hop never gets a sequence, so it does
not reach this change. Its sign helper was updated so it will once the upstream hops pass.

## Plan

`Plan: F1`, `Completes: server/services/submission-service/submission-service.ts`. The holds are as
`.design/claude-convergence/COORDINATION.md` records them.
