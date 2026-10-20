# Preserve the recipient of device submissions

W1 / D2, under the existing device document authoring contract.

## What already exists

`server/services/regulatory/registry/submittabilityCoverage.ts` contains the one
`submissionChannelFor` function. It already honors portal formats, Notified Body
files and the distinction between EMA centralized procedures and medicinal
DCP/NCA filings. It does not yet guard the corrected EU device national-authority
or reference-laboratory recipients, or the Japanese registered certification
body: those fall through to a regional gateway they do not establish.

`server/services/regulatory/market-support.ts` already composes the channel
verdict with package/outline support and renders a product sentence through
`channelLine`. Its FDA diagnostic is deliberately technical and unproven; the
product sentence currently repeats implementation terminology from that detail.

The existing portal-channel and market-support suites exercise both paths. This
correction extends their recipient scope and presentation; it adds no connector,
submission capability or transport. The underlying refusal/diagnostic remains
authoritative.

## Result and qualification

The existing channel function now leaves unmodelled EU device/IVD recipients and
registered certification bodies unconnected, after honoring explicit portals and
the existing Notified Body rule. It names the recipient and directs the applicant
to confirm the actual filing requirement and recipient-specified channel.
Medicinal DCP/NCA filings continue to use their existing CESP route.

The FDA product sentence explains unverified onboarding, submission requirements
and an accepted test submission in plain language. The structured diagnostic
retains its technical detail, and channel state remains `unproven`. No readiness,
acceptance or agency transmission is inferred.

- [Meaningful RED](red.json): four executed failures (42 unrelated tests skipped),
  with stable source pins. The three recipient cases inherited a gateway; the
  product sentence repeated AS2 implementation detail. Exact
  [portal-test source](red-submittability-portal-channels.test.ts.txt) and
  [market-test source](red-market-support.test.ts.txt) match their recorded hashes.
- [Current green](current-tests.json): 46/46 across both complete suites, with
  all six source/dependency pins stable and current. Positive controls preserve
  medicinal DCP, FDA IND, CTIS, IRIS, centralised EMA and Notified Body behavior.
- [Strict lint](lint.json): four changed source/test files, zero errors and warnings.
- [First green](first-green-before-test-layout.json) and
  [initial lint](candidate-lint.json) retain the test-placement warning. Moving
  the added FDA case to a separate describe removed that warning; product bytes
  were unchanged between the two green runs.
- [Summary](summary.json) binds counts and scope. Counts overlap the root combined
  replay and must not be summed.

This is deterministic channel classification and presentation. It does not
qualify a connector, verify agency protocol/current filing requirements, produce
an official artifact or perform an actual submission.
