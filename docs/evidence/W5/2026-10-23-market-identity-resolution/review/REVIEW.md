# Read-only market identity review

Reviewer: `market_resolution_review`, 2026-10-23. This is a review of the
developing change, not an executed test report or a claim of final publication.
No production file, branch, dependency, test baseline or signature record was
changed by this reviewer.

## What already exists

The canonical reader and version-1 capture are in
`server/services/ectd/package-identity.ts`; the one market-number act/read is
`server/services/submission-service/market-application-number.ts`. Existing
submission GET/POST routes reach `MarketApplicationNumber.tsx` from the Submit
market list. `shared/regulatory/region-identity.ts` already resolves all accepted
aliases. Compile, export, orchestrator, transmit, sequence binding, current
release coverage and company-document services call the submission reader.
AnA's project-only `recordedPackageIdentityOrRefusal` in `AnaToolExecutor.ts`
also calls `isHomeMarket`. Existing PGlite and AnA packaging tests are extended;
no alternate reader, editor or regional vocabulary is required.

## Findings raised during implementation

1. **Changing the comparison alone would open the market-number writer.** The
   old `marketOf` cast an unresolved region to `string` after relying on
   `isHomeMarket` to reject it as home. The developing writer explicitly refuses
   unknown submission regions and unknown home agencies, and derives authority
   and market after the submission UPDATE lock on the same transaction client.
2. **An unanchored read still looked like home.** The initial developing reader
   returned early without a runtime diagnosis for a missing program anchor;
   its GET then emitted `home: true`. Packages still refused for missing identity,
   but the UI hid the unresolved ownership. Raised to the control tower for
   correction or an explicit contract limit.
3. **AnA's refusal wording and fixtures need the new strict meaning.** Unknown
   home agency now safely fails `isHomeMarket`, but the old tool message calls
   the requested region "another market" and sends the person to Submission
   Center even though ownership cannot be resolved there either. The existing
   recorded-identity and withdrawal fixture helpers omit `homeAgency`; valid
   home-market successes need truthful agency facts, with deliberate unknown
   cases retained as refusals. Raised to the control tower before publication.

## Boundary and lock assessment

- Only recognized equal regions prove home. Unknown strings equal to each
  other never do. The shared resolver retains its established alias behavior.
- The approved contract treats only omitted/undefined override as submission
  fallback. Explicit null, blank or unknown region refuses. Actual sequence
  callers provide their sequence region; run identity already checks its region
  before reading, so no legitimate null fallback was found.
- An explicit known home sequence can prove the project number even when the
  submission's primary region is unknown. A non-home sequence must prove the
  submission's recognized matching market before reading its market number.
- Referenced foreign/deleted projects supply no home agency through the existing
  same-tenant live-program join; the developing reader withholds both numbers.
- The writer's submission UPDATE then project SHARE order is compatible with
  freeze's organization SHARE, submission UPDATE, sequence UPDATE, project SHARE
  order. The writer does not subsequently lock a sequence. Its fixing-sequence
  read runs while the parent UPDATE lock serializes freeze. The audit writer
  takes a per-tenant advisory chain lock, not an organization row lock. No new
  inversion was found in the inspected paths.
- Version-1 capture lists its fields explicitly and omits runtime diagnosis,
  home agency and market-selection metadata. Recognized identity bytes and
  historical records remain unchanged.
- The developing UI gives an unresolved reason precedence over contradictory
  home/number fields, offers no recording form, and rejects malformed reasons.

Injected PGlite connection tests can prove the authoritative read happens after
the injection and that refusals leave column/audit rows unchanged. They do not
prove native PostgreSQL row-blocking behavior. No tests or native lock probe were
executed by this reviewer; those receipts belong to the control tower's packet.

## Closure review

All three findings above are closed by inspection of the source pinned in
`review-inputs.json`:

- The writer checks recognized market/home facts and current lead authority
  after locking the submission UPDATE and its same-tenant live project SHARE,
  on the transaction client, before column/audit mutation.
- An unanchored reader now withholds the number and carries an unresolved
  diagnosis. Its final wording asks for anchoring before market resolution,
  rather than assuming that the project's number will be authoritative.
  The market-number GET therefore returns `home: false` and a reason, and the
  existing UI shows that reason without a number or a recording act.
- AnA explicitly refuses an unrecognized home agency before its existing
  cross-market branch. Its message asks for correction, never labels the
  requested market another market on an unknown premise. The existing valid
  packaging fixture helpers now name FDA; deliberate unknown-home cases remain
  refusal cases.

The final UI gives the diagnosis precedence over contradictory home/number
fields, validates its additive field, and removes an open form on an unresolved
reread. No new regional alias, identifier format, package-signature recipe,
dependency, schema, edit route or enforcement-default change was found. No
remaining blocker was identified in this scoped review. `git diff --check` on
the four production files passed. No test, native lock probe, build or compiler
was run by this reviewer, and this closure does not attest to later unpinned
changes, agency acceptance, human witnessing or publication.
