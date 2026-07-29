# IVDR Qualification Report

**Result: not qualified / no-go.** IVDR is now represented as a first-class client pathway (`ivdr`), is routed to the canonical diagnostics workbench, and cannot select a 510(k) program merely because it appears first.

## Deterministic clinical-performance calculation

The clinical-evidence result route now rejects missing, negative, fractional, non-numeric and unsafe counts before persistence. Sensitivity, specificity, PPV, NPV, accuracy and prevalence derive from one shared `ivdr-2x2-v1` calculation. A zero denominator is persisted and displayed as `null`, never `NaN`, infinity, or an invented zero percentage. The client recalculates from the persisted 2x2 source counts and excludes corrupt rows rather than trusting conflicting percentage fields. Unit, route and client-adapter tests cover normal, zero-denominator and invalid inputs.

The result mutation now fails closed without a real authenticated actor. Its tenant-scoped evidence update and immutable history insert are a single data-modifying CTE, so a missing/foreign evidence row creates neither current state nor orphan history and returns 404.

MDx IVDR classification and PER create/reassignment paths now validate supplied regulatory-program ownership before mutation. PER artifact links additionally require a `concept2cure_artifacts` row owned by the authenticated organization. Foreign identifiers return the same tenant-scoped 404 used for absent identifiers and tests assert that no regulated insert/update follows.

PER records must be created as `draft` and may transition only `draft → review → approved → superseded`. Approved and superseded content is immutable; revision content requires a new draft. Status updates include an optimistic current-status predicate so stale concurrent transitions return 409 instead of overwriting a newer state.

Outstanding mandatory evidence: live-database two-tenant qualification across every IVDR resource; actor/timestamp and durable audit events for PER transitions; explicit revision lineage; readiness derivation; human confirmation of AnA proposals; LoD/LoQ/precision criteria and unit validation; controlled output artifact/reopen/audit verification; and behavioral golden path.
