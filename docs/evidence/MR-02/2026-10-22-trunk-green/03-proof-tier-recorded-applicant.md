# 3 — Proof tier: three journeys never recorded the applicant FDA now requires

`ccd509c0` (2026-10-21, MR-10 applicant identity) made a US package name its
application and applicant from the record, never a placeholder. That means
four things:
- an agency application number (six bare digits);
- a sponsor bound from the `ind_sponsors` registry;
- that sponsor's D-U-N-S number;
- a regulatory contact (name, telephone, e-mail).

Freeze, export and release-signature resume all refuse without them. The
refusals are correct. Three golden journeys were never given the facts, so
each one failed at the gate.

| Journey | Red at HEAD | Fix (fixture or journey; no gate relaxed) |
|---|---|---|
| `drug-nda-ectd` | freeze 422 `DISPATCH_BLOCKED` (no application number, no bound sponsor, no D-U-N-S, no contact) | The journey records the facts as a sponsor does, through the real routes: `POST /api/ind-master-data/sponsors`, then `PUT /api/ind-forms/program-facts` binding the sponsor and application number `212345`, then a fresh freeze signature. **New known-bad step first:** the freeze with a valid signature is refused 422 `DISPATCH_BLOCKED` naming the applicant, and the sequence stays `validated`. The journey replays `20260609_ind_master_data`, `20261021_regulatory_programs_applicant_sponsor` and `20261008b_regulatory_programs_sponsor_address_ind_type` (the real migrations, in deploy order). The `blockedAsExpected` floor goes from 9 to 10. |
| `submission-export-package` | step 1 `PackageIdentityMissingError` (missing applicantSponsorId, applicantId, contact) | The fixture seeds an `ind_sponsors` row for org A (D-U-N-S and contact) and binds the org's programs to it, the pattern of `export-application-identity.pglite.test.ts`. The cross-tenant, region, unknown-sequence and unnumbered-program refusals are unchanged. |
| `submission-release-signature` | the release is signed (200), then the run fails: "Reassemble this FDA package with recorded applicant facts before requesting a release signature" | The frozen snapshot carries `recordedPackageIdentity`. The application number `NDA210001` becomes `210001`, because FDA application numbers are six bare digits (`regulatory-identifiers.ts` `fdaIdentifierProblems`). Every refusal step still refuses. |

**Red → green.** Each journey failed alone at HEAD and passes alone after its
fix. The whole proof tier re-run is recorded below.

## Found, not taken (applicant-identity lane, MR-10 Stage 4)

**The server signs a release it then refuses.**
`prepareOrchestratorRelease` → `verifyAwaitingReleasePayload`
(`server/services/submission-orchestrator-continuation.ts:46-63`) does not
apply the identity rule that `ccd509c0` added to resume. So a run that was
awaiting signature with no recorded identity gets a durable Part 11 signature
row and a 200. Only afterwards does continuation fail the run.

The rule should refuse before the signature is written. The fix is to export
a snapshot-level form of `packageSignIdentityRefusal` from
`submission-package-orchestrator.ts` and apply it in
`verifyAwaitingReleasePayload`, with a test that the signature row is never
written. This is a product change on another lane's code, so it is handed on,
not done here.
