# Wave 3: route audit contracts

Approved scope: W6 governance and observability, audit finding O01. These repairs do not activate a surface outside the launch catalog. The parent session owns shared audit helpers, guard baselines and the aggregate ledger.

## Ordinary mutations and lineage downloads

`POST /api/program-journey`, its stage update, and `POST /api/market-access` retain their existing service writes, statuses and response fields. They carry the actual canonical `recordAuditRow` outcome in `meta.auditTrail`. A failed ancillary audit after a durable mutation must not become a failed mutation or invite a duplicate retry. Actor and organisation come from authenticated request context; payload actor/tenant fields cannot override them. The corresponding journey and market access surfaces currently read these stores but have no direct writer and remain outside the launch catalog.

`GET /api/decision-lineage/:entityType/:entityId/export` retains its bytes and content headers. It carries the actual canonical outcome through `setAuditRowHeaders`. The existing DecisionLineage export calls shared `apiRequest('GET', ...)`, whose audit-header warning handling is already qualified. This repairs the mounted API; it does not activate the DecisionLineage surface.

Tests must distinguish complete persistence, tamper-proof-only persistence, resolved failure and rejection. Validation, missing identity and source failure must not fabricate an audit for a completed act. A success followed by an audit failure must preserve its successful response and actual returned record/file. A later healthy request must report recovery.

## Sole prior-content history

Safety case saves and literature screening overwrite their current canonical row and rely on the audit row to retain the previous value. Their history is therefore part of the business transaction, not ancillary telemetry. Both use `writeChainedAuditRow` in the same transaction before commit. Safety retains the existing case row lock. Literature locks the actual org-scoped corpus entry before reading and replacing its screening decision, including the first decision, so concurrent writes preserve the correct pre-image.

An audit failure rolls back the current-row change. An uncertain COMMIT is reported as unconfirmed and requires readback before retry. A confirmed commit followed by failure to reassemble the display is reported as saved with an explicit readback shortfall. The exact SafetyNarrative save consumer must preserve those distinctions. Tests use the real database definitions for successful history, rollback, tenant boundaries and concurrent pre-images; mocked sequencing alone is insufficient.

Both transactions use the existing instrumented runtime pool under authenticated async tenant scope. A checked-out transaction connection permits `release(error)` to discard an uncertain COMMIT connection; the request connection's no-op connectable release is not claimed to do that. No additional pool or tenant context is created. The literature service adds an optional caller-transaction corpus-lock mode, preserving direct non-governed service-call compatibility. The sole mounted writer always selects that mode and enlists its audit before commit.

Safety reads now include the exact stored narrative and apply current canonical project admission to the stored TEXT project reference. Integer references use the canonical integer parser; UUID references require a live programme and one canonical project anchor. An unresolvable reference is never treated as an org-level record. The worklist filters denied rows before constructing DTOs; the new exact case read returns 404 for inaccessible records and discloses no private counts. Null project references retain the existing org-level read policy and require a governed write role to change. The deployed `seriousness_criteria` TEXT column is written as JSON, so the same criteria survive a native PostgreSQL round trip.

The SafetyNarrative consumer blocks repeat saves after an unconfirmed attempt. A successful exact read restores the stored case; an unconfirmed attempt additionally requires the reviewer to acknowledge that readback before allowing another version. A confirmed save whose display refresh failed is explicitly shown as saved. The source surface remains fenced outside the launch catalog.

## Shadow routes under investigation

The defense waiver currently changes no waiver store and reports `waiver_recorded: true` even if its sole best-effort audit fails. A truthful prewrite refusal is approved until a genuine canonical waiver mechanism is identified. No signature, clearance or waiver will be invented.

Other defense packet and SE matrix changes require a separate object-binding contract: admission of the URL programme must also authoritatively bind the requested packet/hash/render record to that programme and tenant. A shared Shadow admin credential and an unverified external response are not that authority. The child investigation owns these two files exclusively and will publish the binding contract before implementing it.

## Final canonical packet freshness read

The final reader of the undeployed public `defense_packets` ORM store is the living-file freshness aggregate. The approved follow-up reads the existing `predicate.defense_packets` through a mandatory actual request SQL client, joins its UUID programme to the live `public.regulatory_programs` organisation, and preserves the literal stored status, reason and update timestamp. The exact freshness route reuses `requireShadowProgramAccess` for fresh membership and private-project admission before the aggregate reads. Other graph admission regions are outside this change.

A successful query with no rows is empty; a failed canonical packet read is a bounded `503 FRESHNESS_SOURCE_UNAVAILABLE`, without a fabricated zero inventory. Parameterised queries, actual native schema/status readback, foreign/private/revoked membership refusals and a failed read must be proved. No new store, policy or launch activation is authorised by this repair.
