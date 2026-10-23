# W5 / D7 signed package identity snapshots

Snapshot worker scope on canonical `concept2cure-v2`, baseline
`dd749f3e56f1d9055b19067e90680d70bf9a9fb9`. Root owns commits and publication.

## What already exists

- `run-package-identity.ts` reads the canonical submission identity and marks
  incomplete assembly as dry; this work carries its existing proof for every
  recognized region using the canonical regional projection.
- `submission-package-orchestrator.ts` already hashes optional version-1 proof,
  freezes it in the signed snapshot and hydrates it on resume. The existing sign
  boundary now requires complete projected proof for recognized regions and
  refuses unknown regions. Historical digest recipes remain unchanged.
- `signed-manifest-covers-sequence.ts` already compares leaf correspondence and
  FDA identity. Its existing identity comparison now applies to all recognized
  regions and checks actual same-tenant sequence parent and region before proof
  can establish current coverage. FDA DUNS/contact requirements stay FDA-only.
- `release-signature-status.ts` already reaches that comparison and falls back to
  the existing sequence authorization when an intact historical package does not
  cover current facts. Unknown signed/current regions cannot borrow a recognized
  region from one another to clear current sequence coverage.
- `signed-package-export.ts` already propagates captured proof and recomputes its
  frozen digest; no production change was necessary. Focused EU export and
  tamper cases exercise that same engine.

## Executed verification

Node `v22.23.3`, `NODE_OPTIONS=--max-old-space-size=4096`, existing
`vitest.config.ts`. Logs are exact executed output; negative-test diagnostics
are expected. Input hashes identify the source and focused tests exercised.

- `red-tests.txt`: 4 files, **53 failed / 54 passed**, before production edits.
  Demonstrates missing non-US proof, proof-free fresh/resumed signing, mutable
  current facts, wrong parent/region and unknown-region bypass. FDA historical
  digest and existing tamper checks remained passing. `red-inputs.sha256` pins
  these inputs.
- `red-status-export-tests.txt`: 2 files, **3 failed / 44 passed**, before the
  release-status production change. The three failures expose borrowed regions;
  historical EU export integrity already passes. Inputs are in
  `red-status-export-inputs.sha256`.
- `green-tests.txt`: **7 files / 161 tests passed**, after warning refactoring.
  Inputs are in `green-inputs.sha256`. Includes every recognized non-US run and
  coverage projection, recorded number/name gaps, FDA DUNS/contact completeness,
  unprojected/malformed proof, identity drift, actual parent/region mismatch,
  proof-free historical coverage refusal, resumed authorization, intact historical
  export and frozen-proof tampering. The FDA historical digest constant remains
  passing.
- `scoped-lint.txt`: exit 0, **0 errors / 15 existing warnings**. The three newly
  introduced function-length/complexity warnings were removed by factoring the
  sequence row check and dividing test groups; no suppression or baseline change.
- `git diff --check`: passed.

Commands use the existing Vitest engine directly; the seven-file cohort is:

```text
server/services/ectd/__tests__/applicant-snapshot-coverage.test.ts
server/services/ectd/__tests__/run-package-identity.test.ts
server/services/__tests__/sign-payload-snapshot.test.ts
tests/unit/submission-package-orchestrator-moves-3-5-6.test.ts
server/services/ectd/__tests__/release-signature-covers-sequence.test.ts
server/services/ectd/__tests__/signed-package-export.test.ts
tests/unit/orchestrator-dry-run-identity.test.ts
```

This is scoped automated evidence, not a full-suite, browser, human-witness or
agency-acceptance result. Root owns integrated database/browser/build/compiler and
publication verification. No dependency, schema, agency default or UI was changed
in this worker scope.

## Existing release preparation caller completion

Independent caller review found that
`submission-orchestrator-continuation.ts::verifyAwaitingReleasePayload` verified
the frozen digest, seal and signer envelope but did not call the existing
orchestrator identity sign refusal. The existing sign-release route also asked
for the password/MFA ceremony before preparing that frozen record. This allowed
a proof-free historical non-US awaiting run to acquire a fresh signature before
resume refused it.

The same `packageSignIdentityRefusal` is now exported with a narrow structural
input and called by the existing continuation verifier after integrity checks.
Unusable captured facts return **409 `SIGNATURE_PACKAGE_IDENTITY_REQUIRED`** with
reassembly instructions. The sign-release route prepares the record after its
existing authentication/authority checks and before the ceremony. Independent
signer factors, source guards, active-signature checks and persistence remain on
their existing paths. Completed historical export integrity is unchanged.

- `continuation-red-tests.txt`: **10 failed / 24 passed**, using real matching
  production digests and HMAC seals before adding the shared identity gate.
- `release-route-red-tests.txt`: **4 failed / 24 passed**, exposing the missing
  refusal and password ceremony before preflight failure.
- `continuation-green-tests.txt`: **4 files / 112 tests passed**: continuation,
  release route, signed snapshot hydration and signed export. This includes
  complete FDA fixture continuity, proof-free EU/JP/US refusal, malformed and
  unprojected proof, unknown region, legacy continuation refusal, and complete
  non-US proof without FDA DUNS/contact. Route regression cases use the actual
  frozen-payload verifier and real digest, and assert no ceremony, signature
  lookup/write or continuation on a proof refusal.
- Matching `continuation-red-inputs.sha256`, `release-route-red-inputs.sha256`
  and `continuation-green-inputs.sha256` pin executed inputs. The earlier
  seven-file green cohort predates the helper's structural export; this later
  cohort verifies it together with the caller completion.
- `continuation-scoped-lint.txt`: exit 0, **0 errors / 12 existing warnings**,
  with no added warning or suppression. `git diff --check` passed.

No compiler or build was run by this worker; root owns those integrated checks.
