# AnA seal verification scope — W3 / D4

Canonical branch: concept2cure-v2.
Initial base: 4eda1a3dddbd5b14d360fa4ae939426187b666cb.
Release base: b9a87ab1704b5a59e1293070748b3e99c940d5c1 (report-health-only advance).
No UI changes.

## Delivered behavior

The existing feature-gated seal endpoint copied only verification.ok and message
from the request. That erased plan_text_only and explicit artifact/source
limitations before the service decided whether to seal.

The route now preserves the raw optional scope, artifactVerified, sourceVerified
and sourceDiffPerformed fields. The central service refuses any supplied
non-undefined scope: there is no existing supported authoritative scoped receipt
in this path. It also refuses any supplied non-undefined verification flag that
is not exactly true. Planning-only, negative, null, malformed and unknown evidence
cannot be silently erased or upgraded by positive flags. The original ok:false
gate remains intact.

The central service refuses before acquiring its default sealing pool, connecting
or opening a transaction. The HTTP signing-authority and re-authentication checks
still precede it and may perform their own database reads. Feature gating,
signing authority, signer re-authentication,
manifestation/sample gates and existing persistence behavior remain intact.

## Qualification

All qualification passed on the frozen production/test bytes:

- Focused actual-route/actual-service suite: 36 passed in 3.635 seconds.
- Natural fail-first before production edits: 27 failed and 9 legacy/feature/
  signer invariants passed, in 3.712 seconds. The original
  service attempted its database boundary for limited verification, and the
  original route erased limitations instead of returning the scope refusal.
- Bounded AnA/IND/sealing/signing regression selection: 841
  passed across 42 selected files, 0 failed or skipped, in
  60.337 seconds.
- Production build passed in 18.674 seconds.
- Forced lint: 0 errors; unchanged route 2 and service 2 warnings; both new
  tests 0 warnings. Normal pre-commit and git diff --check passed.
- Full unchanged pre-push gate passed in 56.608 seconds.
  TypeScript: 0 errors, tsc exit 0.

The native compiler helper prepared the incremental cache only. The unchanged
hook and actual tsc result establish qualification. Independent review approved
the exact source pins and bounded contract. The production files are
byte-identical outside raw-field forwarding and the verification DTO/guard/pool
acquisition changes; persistence SQL is unchanged. Source hashes, raw commands,
results and the review are retained in this directory.

Focused route tests use authorization and re-authentication fixtures. They prove
real route-to-service refusal, not live signer identity or no HTTP-level DB reads.
The stopped-pool legacy cases prove transaction attempts, not persisted success;
existing transaction and PGlite lineage suites cover the preserved persistence
path. None establishes an authenticated artifact/source verification receipt.

Client tree remains f4a50c306387585250e354c68e08a099362e3823.
Publication uses a non-force expected-head update of concept2cure-v2. Remote CI
is separate from local qualification and is reported at delivery.

## Explicit limits and follow-up

This is negative-evidence preservation, not authenticated artifact/source
verification. The pre-existing unscoped ok-only path remains for compatibility.
A caller can omit limiting metadata or assert positive flags; these are not a
trusted receipt. This batch does not solve that authenticity gap or prove a
sealed document was scientifically correct, complete or verified against a
qualified underlying study source.

verify_docx_against_source extracts a tenant-workspace file but compares it with
caller/model-supplied expected_text or required_strings. No persisted authenticated
receipt binds that verdict to the artifact content/hash and qualified source
versions. The current client result parser also omits sourceDiffPerformed. No
current client caller of the feature-gated seal endpoint was found; absence in
source is not proof that external callers cannot reach it when enabled.

The service hashes input.content rather than retrieving the selected persisted
version's content/hash. Supplied existingVersionId and the combined
artifactPk/artifactExternalId path also need independent target/tenant validation.
Those existing target-binding gaps are separate open work; no comprehensive seal
security or tenant-isolation claim is made by this guard.

The broader IND hierarchy, applicability, therapeutic/modality, source and temporal
qualification plan remains open. Tests do not establish production deployment,
regulator acceptance, model qualification or full-repository test success.

## Prior remote CI findings

Remote runs for prior delivery 4eda1a3d were inspected before publication.
Browser smoke failed while provisioning: the installer left
20261008f_ana_run_events.sql unapplied because ana_runs was absent; a later seed
also found auth_users absent.
Semgrep reported five blocking findings outside this batch against baseline
661a2c93aff2f7799e8d55f7ab0f92d5ebfcac19. The affected migration/workflows,
provisioning scripts and flagged files are unchanged by this correction.
These remain separate unresolved release blockers, not local check failures
fixed by this batch. Run links and finding paths are in PRIOR_REMOTE_CI.json.
Remote CI must not be described as green.
