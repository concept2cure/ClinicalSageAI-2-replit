# Citation, propagation and decision audit outcomes

This O01 continuation repairs the five remaining assigned audit sites: two in
`document-binder.ts`, one in `fact-propagation.ts`, one in
`DecisionLineageService.ts`, and the per-packet staleness writer. It also carries
their actual outcomes through the existing callers. No store or dependency was
added, and no deferred capability was enabled.

## Supplemental mutations

Section binding and structured fact propagation now return their actual
`AuditRowOutcome`. Persistent artifact and post-market citation scans do the
same; preview scans omit audit metadata because no audit was attempted. The
existing REST routes return these results intact. AnA's citation-scan projection
now preserves the outcome. AnA's governed fact-change result also preserves the
actual cascade packet receipts, alongside its existing aggregate audit outcome.

Packet staleness preserves the safety flag when its supplemental audit fails.
Only rows actually changed by `UPDATE ... RETURNING` receive audit attempts and
per-packet receipts. The update requires the current status to remain RENDERED,
and binds the packet to a live program in the caller's organization. Zero changed
rows produce no fabricated successful audit. Multiple actual outcomes aggregate
with the existing canonical helper; a later successful row cannot conceal an
earlier missing row. Existing audit action names are preserved, including
`document.DEFENSE_PACKET_STALE_DETECTED`.

Actual packet receipts survive the change router, publish result, governed fact
change, sentinel item/report, and direct sweep summary. The fact-change aggregate
includes both its own audit and actual downstream packet audits. Publish success
continues to describe completed propagation; a missing supplemental audit does
not falsely report that the safety work failed.

## Real packet store and admission

Native inspection found that `public.defense_packets`, named by the old ORM,
does not exist. The registered migration creates `predicate.defense_packets`,
which has `program_id` and no `organization_id`. The service now uses that actual
store with parameterized joins to the live canonical program's organization.
There is no parallel public table or invented fixture schema.

The regulatory-graph packet guard derives the actual program from that same
store, then reuses the canonical Shadow program admission: current account and
membership, unique project anchor, private-project access, and the existing
governed write role for mutations. Predicate-change requests receive the same
admission before mutation. `assertShadowProgramAccess` was extracted from the
existing middleware without changing its policy. The root session separately
added the real predicate tables to canonical parent-scoped FORCE RLS; native
qualification below runs after that replay. Both database isolation and explicit
live-parent/private-project admission remain relevant.

## A decision entry is the mutation

`recordDecision` formerly returned an invented DEC identifier and the route said
`recorded: true` even when neither audit store acknowledged a write. The result
now reports the actual acknowledgment and whether the queryable chained store
accepted it. The DEC UUID always identifies an **attempt**, and supplied details
cannot override it. Failure wording does not claim that an action completed.

The coordinated route returns 201 only for a queryable entry. Otherwise it
returns 503 with the actual recorded/queryable flags, attempt identifier and
exact receipt URL; it does not automatically retry. Tamper-proof-only storage is
distinguished from a readable lineage entry. Exact tenant/attempt readback uses
the actual `audit_logs.new_values` field without the graph's 100-row window,
returns a minimal receipt, and distinguishes a confirmed empty observation from
an unavailable read. General graph audit reads now bind both entity type and
record ID and retain the actual numeric entity ID.

## Evidence

- Six new decision-contract cases failed against the earlier implementation.
  The red receipt is `/workspace/audit/continuation-provenance-audit-red.log`.
- **73 tests passed in eight targeted files**: decision acknowledgments and
  existing lineage regressions, actual AnA projection, change router, publish,
  staleness and the sweep's direct/timer projections.
- **14 native database cases passed** through the actual authenticated routes,
  TLS `app_service`, current membership, request ALS and lazy request clients.
  No test installs tables, policies, grants or triggers.
- Native cases verify real section bindings, divergent artifact/post-market
  scans, structured claim value/verification updates, actual packet status and
  audit readback, foreign/private/viewer refusal, zero-change retries, and
  verification-outage containment without a dependency write. A real governed
  fact change and on-demand sentinel demonstrate packet receipts surviving their
  HTTP results even when the audit tenant boundary refuses persistence.
- Decision cases prove actual actor attribution, entity-type/tenant isolation,
  minimal exact receipt recovery, bounded refusal/rejection, and a deliberately
  suppressed acknowledgment **after a real commit**: the POST is unconfirmed,
  while its exact receipt subsequently finds the actual row. This control proves
  why an unconfirmed acknowledgment must not be called absence.
- Audit-refusal cases use the real store tenant boundary. Unexpected sink throws,
  acknowledgment loss and the packet-read outage are explicitly scoped seams;
  they do not replace authentication, business SQL or deployed row security.
- Scoped lint has zero errors; monolith and complexity warnings remain. Scoped
  whitespace checks pass. No full TypeScript check was run by this subagent;
  the root owns integrated verification.

Other local receipts are `/workspace/audit/continuation-provenance-unit.log`,
`continuation-provenance-native.log`, and `continuation-provenance-lint.log`.
All data is synthetic. No external AI, Shadow execution or agency was contacted.

## Boundaries retained

The sweep is an opt-in standalone job, not automatically registered at boot. Its
direct result now carries receipts and its existing timer warns about actual
missing packet audits. There is no durable job-result store for this prototype;
this change does not invent one or activate scheduling. Existing organization
fan-outs for evidence and risk-vocabulary safety flags retain their actor/system
policy; they are not a new general private-project mutation authorization.
Legacy evidence integer program fields remain soft labels: native claim tests
exercise the actual UUID fact binding and integer claim ID without claiming a
new namespace bridge. Signature application and clinical/regulatory content
qualification are outside these audit-outcome repairs.

## Integration correction: background tenant admission

The tenant-entry-point guard rejected the changed job digest. Its previous
exception said there was no tenant fan-out, but this sweep actually loops
programs and can heal claims and mark packets stale. That exception could not be
truthfully refreshed. The job now uses system scope only to discover candidate
IDs and resolve their actual live `regulatory_programs` organization. Before
work, it enters the canonical role-null organization job scope and asks
`getTenantAccessPosture` plus `backgroundWorkPermitted`. Missing/deleted programs,
denied/read-only tenants, and unverifiable tenant posture receive distinct skip
counts; a bounded summary retains the first 100 skip reasons. Skips do no work
and do not become false scan errors. Completed programs and real scan errors
remain distinct, and existing packet receipts survive.

All nine focused job tests pass, including the actual async scope, allowed and
denied/read-only cases, null/thrown posture, missing/deleted-parent admission,
bounded skip details and the original audit projections. The added native case
uses real canonical tenant posture and SQL, restricting only candidate discovery
to three synthetic fixture programs. It observes one active program processed
under role-null tenant RLS, one suspended tenant skipped, and one deleted program
skipped without changing its binding. No other estate fixtures are swept.

`ci:tenant-entry-points` now passes without a baseline edit by this subagent;
the root owns removal of the obsolete exception. Focused job lint has zero
errors or warnings. Receipts are
`/workspace/audit/continuation-drift-tenant-{unit,guard,lint}.log` and the updated
native log above. This uses existing lifecycle policy and does not activate the
standalone scheduler or add a durable job-result store.
