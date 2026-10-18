# Regional reporting catalog applicability

Status: Approved for implementation on concept2cure-v2. Verification evidence is filed separately after the scoped checks.
Workstream: W1 / D2, Reporting & analytics. Publication owner: /root.

## Concrete repair

The overview marks market reports runnable from product segment, engine scope,
registry enablement and an open project. A pharma/biotech lead can therefore
advertise FDA IND, FDA NDA/BLA, EMA MAA and Japan JNDA together. Execution reads
the project's recorded registry and rejects wrong jurisdiction/kind with 422.
Move that same applicability decision into the overview before Run is offered.
Do not widen supported engines or infer a filing from a title.

Pre-implementation source evidence:

- server/routes/insights-canvas-routes.ts:432–463: catalogFor never reads filing.
- server/routes/insights-canvas-routes.ts:310–312: lead filing/agency/pdufa null.
- client/src/concept2cure/v2/surfaces/InsightsCatalogPanel.tsx:154–159: trusts runnable.
- client/src/concept2cure/v2/surfaces/InsightsCatalogPanel.tsx:89–97: Run affordance.
- server/services/report-os/regional/filing-readiness.ts:175–197: recorded filing input.
- server/services/report-os/regional/filing-readiness.ts:385–399: market/kind refusal.
- server/routes/report-os.ts:1628–1630: execution refusal becomes 422, no saved run.

## Exact existing supported bindings

Import these records; do not copy them into a new enum or infer from report names:

| Report type | Jurisdiction | Application kinds |
| --- | --- | --- |
| usa_fda.ind_safety_readiness | US | ind |
| usa_fda.nda_bla_filing_readiness | US | nda, bla |
| ema.maa_readiness_assessment | EU | maa |
| japan_pmda.jnda_shonin_readiness | JP | jnda |

The canonical source is regional/filing-types.ts REGIONAL_FILING_TYPES.
Its REGISTRY_TO_KIND maps US_IND→ind, US_NDA→nda, US_BLA→bla,
US_ANDA→anda, EU_MAA→maa, JP_MKT_APPROVAL→jnda. Derive jurisdiction from
REGIONAL_MODULE1 / MODELED_JURISDICTIONS as the existing engine does.
REGION_TO_JURISDICTION verifies the deployed report row's declared region.

Authoritative input remains projects.metadata.registryId, or the recorded
metadata.submissionType resolved through the canonical submission-type bridge.
An explicit registryId remains authoritative; do not replace an unknown explicit
ID with a different legacy submissionType. Both supplied values, if present,
must resolve to the same registry ID. Reject conflicting or malformed data as
context unavailable; no default US IND/NDA and no title, code, product-type or
UI filter inference. Unknown canonical entries are unavailable. A known entry
outside REGISTRY_TO_KIND is a positively unsupported filing, not missing data.

## Read model

For regional types only, a shared pure validator returns:

| State | runnable | Reason code | Meaning |
| --- | --- | --- | --- |
| available | true | null | Deployed region, recorded jurisdiction and kind agree |
| filing-context-required | false | REGIONAL_FILING_CONTEXT_REQUIRED | Authorized project has no recorded registry/submission type |
| not-applicable | false | REGIONAL_REPORT_MARKET_MISMATCH / REGIONAL_REPORT_KIND_MISMATCH / REGIONAL_FILING_NOT_MODELED | A real recorded filing is outside this report's binding |
| context-unavailable | false | REGIONAL_FILING_CONTEXT_UNAVAILABLE / REGIONAL_FILING_CONTEXT_INVALID / REGIONAL_TYPE_MARKET_INCONSISTENT | Read failed, malformed/conflicting metadata, or deployed declaration drift |

Each result has a human-readable availabilityReason and a stable reasonCode. Missing filing context says: “Record the program’s filing type before running this market readiness assessment. No market readiness was assessed.” Client copy does not expose metadata field names.
Only available may enable Run. These states say whether a computation applies;
they make no claim of readiness, content completeness, market offer, validation,
scientific review, signature, seal or regulatory approval.

Precedence preserves existing conditions: unregistered, disabled and absent
program/scope-required remain their own current states. Entitlement is an
independent field; a plan upgrade cannot make the wrong filing applicable.
Nonregional reports and their account/document scopes remain unchanged.

## Authorized read

Overview resolves the canonical anchor and access before reading any filing
metadata. Use the actual requestPgClient(req), session userId and organizationId;
never getPool fallback, manufactured requests or a posted organization/actor.

For the selected lead, mint getCurrentAccessibleProgramScope(q, { organizationId,
userId, programId }) on that same executor, verify the canonical project still
equals lead.projectId, and select metadata with exact project/org/program bind
values. Return nothing for sibling projects. Before supplying filing/agency or
applicability, requireProgramScopeStillCurrent on the same executor and identity.
Use canonical typed refusals for missing/denied/reconciled/changed project scope;
never convert those into missing filing metadata. A storage read failure for a
positively authorized project produces the generic context-unavailable state,
without raw SQL/error details. Missing request context remains a typed failure.

Return recorded registryId, filing label and agency only from a successfully
validated authorized registry entry. pdufa remains null: there is no source for
an action date in this increment. Read metadata once per lead, not once per type.

Execution continues to read current metadata and recheck applicability before
metrics or saving the run. Extract the existing engine's metadata decode and
type/market/kind checks into one pure helper consumed by both paths. Do not ship
two independent validators. Execution must not trust cached overview verdicts
or client registry overrides. This increment does not claim permissions are
serialized against every independent project-sharing writer through commit.

## Existing UI consumption

Extend CanvasReportType, client ReportType and LibraryReportType availabilityState
with the three unavailable states above; preserve computedScopes and computedScope.
Pass the backend reason and optional reasonCode through catalogFrom/library mapping.
CatalogPanel already places non-runnable types outside actionable cards. Keep its
existing layout, typography, icons, cream/terracotta theme and role-aware behavior.
Add the new states to the existing Availability filter; render their explicit
reason in the current note treatment. Keep the Region filter as discovery: it
does not change a recorded filing or authorize a different market's assessment.
Keep genuinely uncomputed catalog definitions in Not computed in this release.
Do not move wrong-market reports into that category: their engine exists.

No new surface, chart, modal, dependency, AI call, readiness calculation, CMC
composition expansion, market coverage expansion or data migration is needed.

## Scoped implementation files

1. server/services/report-os/regional/filing-applicability.ts (new pure helper).
2. server/services/report-os/regional/filing-readiness.ts (delegate existing checks).
3. server/routes/insights-canvas-routes.ts (authorized one-lead read + annotations).
4. client/src/concept2cure/v2/surfaces/Insights.tsx (propagate typed states/reason).
5. client/src/concept2cure/v2/surfaces/insightsLibraryShared.tsx (state union).
6. client/src/concept2cure/v2/surfaces/InsightsCatalogPanel.tsx (filter values/reasons).
7. Pure validator, overview and catalog tests; existing engine refusals retained.

## Required evidence before repository evidence/publication

First make the old catalog fail the expected wrong-filing contract. Then verify:

- EU_MAA: EMA available; FDA IND/NDA-BLA and JP not applicable.
- US_IND: IND available; NDA/BLA, EMA and JP not applicable.
- US_NDA and US_BLA: NDA/BLA available; IND not applicable.
- JP_MKT_APPROVAL: JNDA available; FDA/EMA not applicable.
- US_ANDA: known modeled kind, but no one of these four report bindings matches.
- Known US_510K/device filing: not applicable to Module 1 reports, no eCTD guess.
- Empty metadata: filing-context-required. Malformed/conflicting/unknown explicit
  metadata: context-unavailable. Failed query: unavailable, not missing context.
- Report registry region drift: unavailable, not a different jurisdiction's run.
- No lead: existing scope-required. Nonregional account/document types unchanged.
- Current requester, cross-org, foreign project, revoked membership and changed
  sharing: refusal before private filing/title exposure, same actual executor.
- Region filter and role/plan changes do not change the recorded registry.
- Catalog displays exact reasons, filters them, and makes no POST for nonmatches.
- Engine rechecks changed metadata after overview and refuses without creating
  partial run/audit/seal/signature records. Existing engine controls remain green.

File evidence under docs/evidence/D2-PLATFORM-COMPLETION/<actual date>/ only after
actual scoped tests. Keep /tmp drafts and unexecuted test plans labeled as such.
Root owns compiler, index, commit, branch synchronization and publication.
