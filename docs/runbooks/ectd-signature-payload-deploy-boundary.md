# eCTD Signature Payload — Deploy-Boundary Re-Sign Runbook

Status: **Action required at the deploy that ships the real-packager orchestrator.**
Owner: Regulatory Operations (re-sign) + Platform (deploy sequencing).
Touched code: `server/services/submission-package-orchestrator.ts`
(`assembleForValidation`, `computeBoundPayloadDigest`, `resumeAwaitingSignature`),
`server/services/ectd/orchestrator-real-package.ts`,
`server/services/submission-sign-release.ts`.

## What changed

The submission orchestrator used to hand the validator a **derived stand-in leaf
manifest** (one leaf per composed section, MD5 over a JSON payload, `filePath`
like `m3/<slug>/content.xml`, `mimeType: text/xml`). It now assembles a **real
eCTD package** (`assembleRealPackage`): real PDF leaves with real hrefs
(`m3/<sectionDashed>/<slug>.pdf`), MD5 over the actual PDF bytes,
`mimeType: application/pdf`, and real `fileSize`.

The Part-11 signature binds `computeBoundPayloadDigest`, whose first component is
`sha256(JSON.stringify(assembly.leaves))`. Because every leaf's `filePath`,
`checksum`, `mimeType`, and `fileSize` changed shape, **the leaf-manifest digest
computed after this deploy differs from the one computed before it** for all 12
packager-buildable regions (US/EU/JP/CA + UK/CH/AU/CN/BR/IN/KR/SG). This is
correct — the bytes that would ship genuinely changed — but it has two
operational consequences at the deploy boundary.

> Non-buildable regions (a region the packager cannot build a backbone for) still
> use the `buildDerivedManifest` fallback, which keeps the old
> `content.xml`/`text/xml`/JSON-MD5 shape, so their digest is unchanged. In
> practice the orchestrator's `RegionCode` is one of the 12 buildable regions, so
> assume every in-flight run is affected.

## Consequence 1 — in-flight `awaiting-signature` runs

A run parked in `awaiting-signature` **before** the deploy has a persisted
`bound_payload_digest` computed from the old stand-in leaves. On resume after the
deploy, `resumeAwaitingSignature` re-derives the assembly with the **new** real
leaves, recomputes the digest, and compares
(`recomputedDigest !== persistedPayload.payloadDigest`). The mismatch forces the
step to `failed` with `error: signature_payload_drift`. **The original signature
can never be released** — this is the drift control working as designed (the
package that would ship is not the package that was signed).

## Consequence 2 — already-signed submissions re-validated after deploy

`findActiveReleaseSignature` is keyed on `bound_payload_digest`. A submission
signed before the deploy has a signature row under the **old** digest. A fresh
re-validation after the deploy computes the **new** digest, misses that row, and
the run re-enters `awaiting-signature`.

## Operator action (do this as part of the deploy)

1. **Freeze new signature requests** for eCTD submissions briefly around the
   deploy window (feature flag or maintenance notice), so no run collects a
   soon-to-be-invalid signature.
2. **Enumerate affected runs** — any orchestrator run in `awaiting-signature`,
   and any submission whose most recent action was a release signature that has
   not yet transmitted:

   ```sql
   -- in-flight awaiting-signature runs
   SELECT id, application_number, sequence_number, region, status, updated_at
   FROM submission_orchestrator_runs
   WHERE status = 'awaiting_signature';

   -- signed-but-not-transmitted submissions (adjust to your signature table)
   SELECT es.submission_id, es.bound_payload_digest, es.signed_at
   FROM electronic_signatures es
   LEFT JOIN ectd_transmissions t ON t.submission_id = es.submission_id
   WHERE t.id IS NULL;
   ```

3. **Re-sign after deploy.** For each affected run, re-run
   `package.assemble` → `package.validate` → sign-payload-prep (the orchestrator
   does this automatically on resume) so a **new** `bound_payload_digest` is
   produced from the real leaves, then obtain a fresh Part-11 signature against
   it. The prior signature stays in the audit trail (never delete it); it simply
   no longer matches the current package, which is the correct record of "the
   package changed and was re-signed."
4. **Do NOT** attempt to migrate old digests forward. The old digest was computed
   over a stand-in manifest that does not correspond to any real shippable
   package; forging a match would defeat the §11.70 binding.

## Verification

- After deploy, a resumed pre-deploy `awaiting-signature` run reports
  `signature_payload_drift` (expected) until re-signed.
- After re-sign, `computeBoundPayloadDigest` matches the new signature row and
  `package.sign` clears.
- The deterministic re-render means a run assembled and signed **entirely
  post-deploy** produces a stable digest across suspend/resume — see
  `server/services/ectd/__tests__/orchestrator-real-package.test.ts`
  ("DETERMINISTIC across re-renders").

## Known related gap (separate work)

`useAI: true` runs have a **pre-existing** resume-drift bug independent of this
deploy: resume re-derives deterministic `composeFullModule3` sections instead of
the AI-refined set that was signed, so the drift check fails on every resume.
That is a signature/persistence-model fix (persist the signed package and hydrate
on resume rather than re-derive), tracked separately — not addressed by this
runbook. Until it lands, do not use `useAI: true` for a submission that will be
parked in `awaiting-signature`.
