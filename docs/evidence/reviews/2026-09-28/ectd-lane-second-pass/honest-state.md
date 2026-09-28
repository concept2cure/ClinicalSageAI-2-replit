# Honest-state lens — eCTD / Submission Center lane, 2026-09-28

Head reviewed: `c1cd656b2` (`concept2cure-v2`). Read-only.
Lens: `.claude/agents/honest-state-auditor.md`, invoked by name.
Prior review read first: `docs/evidence/reviews/2026-09-24/honest-state.md`.

One of the three lenses the 2026-09-24 review recorded as owed on this lane.

**No findings.**

## Method

Read end-to-end, both branches of every read: `SubmissionCenter.tsx`,
`EctdCompile.tsx`, `SubmissionSeqWorkspaces.tsx`, `VaultPlaceIntoSubmission.tsx`,
`filingTarget.tsx`, `dataConnect.tsx`, `fixtures/submission.ts`. Traced the new
`/api/region-profiles/:region` path client → `server/routes/region-profiles.ts`
→ `region-profile-service.ts` → mount (`register-governance-routes.ts:66`,
auth-gated). Traced the release-signature refusal chain client
(`refusalTitle` / `isIntegrityFailure`) → `signed-package-export.ts`
(`resolveSignedPackageForExport`, `refusalHttpStatus`) →
`submission-package-orchestrator.ts` (`findActiveReleaseSignature`).

Ran rather than asserted — which is why this clean result is worth something:

- `npm run ci:internals-in-copy` → clean, 0 baselined.
- `npm run check:microcopy` → clean, 387 files.
- `node scripts/ci/check-ungated-fixture-fallback.mjs --list` → 0 findings. The
  `?? FIXTURE_*` / ternary detector confirms `fixtures/submission.ts` now carries
  only enum and tone maps — no tenant-shaped sample rows. Matches the 2026-09-24
  note that `SC_SEQUENCES_RAW` / `SC_FINDINGS_RAW` / `SC_SHADOW_RAW` /
  `SC_CROSSREGION_RAW` were deleted.
- `PROBE_ONLY='submission-center,ectd-compile' npx vitest run …/hostilePayloadProbe.test.tsx`
  → 3/3. Neither surface throws under any of the eight hostile payload shapes.
- `npx vitest run …/submissionCenterHonesty.test.tsx` → 10/10.

Adversarial re-check of a 2026-09-24 closure in this lane: the release-signature
panel's §11.50 fields (`EctdCompile.tsx:1457-1481`) route through
`signatureMeaningLabel`, which renders "Not recorded" for a missing meaning and
the raw token — not a guess — for an unrecognised one. **Closure holds.**

## Mechanisms verified sound

Each because the concrete false sentence was checked to be unproducible, not
because the code looked careful.

- **Region profile: 404 vs failed read vs empty.** `SubmissionCenter.tsx:1200-1222`
  checks `profile.status === 404` **before** `profile.error`, so an unprofiled
  region ("no region profile is registered for Health Canada") can never be
  conflated with a failed HTTP read. That ordering is load-bearing because
  `useLiveData` sets `error` on every non-OK status including 404. Test-backed.
- **Sequence-list race in the lead action.** `:912-928` — the "Plan the
  submission" CTA, which opens the Planner claiming zero sequences, is gated on
  `seqState === 'not-assessed'` via `assessmentStateFor`, not on
  `seqs.rows.length === 0`, which is also true while loading and on a failed
  read. The comment documents the prior bug.
- **Shadow review: "no findings" vs "never completed".**
  `SubmissionSeqWorkspaces.tsx:964-977` requires positive evidence
  (`run.status === 'complete'`) before "recorded no findings"; a running or
  failed run says explicitly that this is the absence of a result, not a clear one.
- **Imported eValidator report.** `EctdCompile.tsx:600-608` gates the clean-report
  sentence on `assessmentRan: Array.isArray(r.findings) && Boolean(r.reportSha256)`,
  not on emptiness.
- **Validation failed vs zero findings.** `:1290-1297` renders "Validation did
  not run… This is NOT a clean result", structurally separate from the
  0-findings panel.
- **Dispatch gate fails closed on a failed read.** `SubmissionSeqWorkspaces.tsx:1235-1241`
  — freeze/dispatch stay unavailable and the panel says "the gate fails closed"
  when the assessment does not respond, rather than defaulting either way.
- **Signature check could not run vs revoked.** `signed-package-export.ts:362-382`
  separates `signature-unverifiable` (lookup threw, 503) from
  `signature-revoked` (lookup ran, found nothing, 409), in status and in copy
  ("has NOT been found revoked"). The client reproduces the discrimination.
- **Denominators.** Readiness percentages render only once `statusState === 'ready'`
  and `status.modules` is a real guarded array (`EctdCompile.tsx:1184-1191`). No
  truncation or capping in this lane's client code.

## Considered and deliberately not raised

`EctdCompile.tsx` `refusalTitle()` has no case for `run-not-found` and falls
through to the generic "The signed package could not be read". That default is
still **true**, the case looks unreachable from this UI (the orchestrator-run
read and the signed-package read share a `runId` and org), and it is a
specificity gap rather than a fabrication. Recorded here rather than filed as a
finding.

## Not covered

- `submission-package-orchestrator.ts` (3,432 lines) and the rest of
  `server/services/ectd/*` beyond the call chains these surfaces actually
  invoke.
- `scripts/verify-submission-center.mjs` — read, not executed; it needs a
  running DB-backed server. The reviewing session confirmed this independently:
  it exits asking for `LOGIN_EMAIL` / `LOGIN_PASSWORD`. That check belongs to
  staging, which is owed with D1.
- A11y, design-system and Part 11 procedural aspects (other lenses).
- Any surface outside this lane.
