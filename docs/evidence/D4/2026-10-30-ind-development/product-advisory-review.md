# Complete the existing recorded-product advisory

W3 / D4; lead-session review follow-up. This extends the shared advisory helper,
not the loader, editor route or nested drafting service owned by the lead.

## What already exists

- `server/services/ana/draft-product-context.ts` admits the actor's project,
  unique tracking anchor and current sharing policy before reading program and
  charter fields. It distinguishes absent/ambiguous charters, retains broad
  biologic modality uncertainty and rechecks access and the snapshot.
- `draft-product-advisory.ts` already presents recorded facts, caller advice,
  conflicts and the existing profile renderer. Its initial partial-record
  fallback incorrectly labels declared fallback values as recorded, and its
  early return omits phase/population/indication-only declarations.
- `therapeutic-area-profiles/index.ts` already accepts exact document kind and
  advisory product context, but the helper does not pass document kind yet.
- `clinical-regulatory-evidence/draft-candidate-store.ts` persists and parses
  generator metadata; the lead owns extending that existing contract to carry
  the helper's audit rather than dropping it.

## Accepted bounded correction

Preserve origins per field, retain declared-only declarations, pass a canonical
document kind and keep record-mode renderer facts restricted to the record.
Declared fallback knowledge is visibly separate, never called recorded or
qualified. Export one typed audit/parser contract for the existing candidate
store. No new table, registry, app or provider path.

Tests exercise partial records, ambiguous/missing charter advice, broad biologic,
conflicts/aliases, phase-only input, exact document identities versus arbitrary
titles, and malformed audit metadata. Red/green evidence and scoped lint follow.

## Verification and boundaries

- Helper red: 18 failed / 2 passed (`product-advisory-red.log`).
- Strict-enum coercion red: 2 failed / 20 passed
  (`product-advisory-enum-red.log`), before refusing non-string source/origins.
- Helper green: 22 / 22 (`product-advisory-green.log`).
- Helper plus existing declared-product/gateway-capture suite: 309 / 309
  (`product-advisory-affected.log`). Scoped ESLint: zero errors/warnings.
- Independent read-only review found no remaining helper blocker. Audit parsing
  verifies the bounded shape and internal consistency; it does not authenticate
  a source snapshot. The loader, retained candidate and live admission own that.

The helper now reports each field as recorded, declared or unassessed. A partial
record plus a declared fallback is explicitly mixed; the profile renderer receives
only recorded phase/modality/population in record mode. Separate quoted fallback
labels stay declared. A broad recorded biologic blocks caller sharpening. The
sixth argument carries canonical document kind; default inference is restricted
to exact registry identities and resolver-issued source markers, never a fuzzy
title. No raw indication/population is stored in the audit metadata.

## Captured real-service scenarios

`recorded-product-drafting-service.pglite.test.ts` exercises the actual drafting
service, product loader, requirements resolver, canonical anchor and project
sharing queries over real PGlite relations. Only the outbound gateway is mocked;
the mock executes the service's dispatch callback and records a separate model
effect. Its minimal schema is test-local, not a replacement implementation.

The captured cases cover omitted Canadian CTA resolution, conflicting recorded
product facts, explicit filing override, ambiguous charters, broad biologic,
foreign/private access and actual record/access mutations at dispatch and after
the provider response. Private access tests explicitly mark the project private:
the existing policy deliberately treats legacy empty settings as organization
public, where revoking one member would not remove their organization access.

The first 11 service cases passed. Exact protocol/CSR identity cases also pass.
Streaming tests then exposed a substantive remaining defect: post-provider
refusal could follow chunks already emitted to the caller. The recorded-context
streaming red shows exactly 3 failed / 14 passed (`product-service-stream-red.log`):
successful recorded streams emit before final checks, and changed-charter/access
streams emit two chunks before rejecting the final result. The ordinary
no-project live-streaming case passes. After the lead's buffering correction,
the same 17 cases pass (`product-service-green.log`), including all three former
stream failures. The service copies queued event metadata and releases recorded
events only after final source/product/cancellation checks; unscoped ordinary
streaming remains live. Scoped ESLint on the real-service test reports zero
errors/warnings.

Currentness claims in this slice are generation-only: admission, dispatch and
post-provider checks before returning prose or releasing buffered events.
Retaining a context audit in a candidate does not establish that product facts
are revalidated at acceptance. The existing accept path's Vault/assembly source
checks are separate; no claim of an additional product-context accept gate is
made here.

These are source/selection/currentness checks with a captured gateway, not model
qualification, SME review, remote deployment evidence or verified scientific
coverage. No provider was called.
