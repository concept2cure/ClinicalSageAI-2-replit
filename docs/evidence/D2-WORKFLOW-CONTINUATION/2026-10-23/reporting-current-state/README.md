# Reporting catch-up, 23 October 2026

Read-only source assessment of canonical `55f75b72fac95a387d3b72e82a1998a08ff5ef96`, compared with `30afd3bd17a90c8de4a44098354d9de3a34cb4bc` (419 subsequent commits). This records the existing implementation and the recent changes before continuation. It is not a new reporting feature delivery, a live application walkthrough, or global regulatory validation.

## What already exists

- `client/src/concept2cure/v2/surfaces/Insights.tsx` is the reporting canvas: it reads the server's governed catalog, runs eligible ReportOS types and renders the report document. `server/routes/report-os.ts` enforces organization/project ownership, applicability, entitlement and governed lifecycle rules.
- `server/services/report-os/report-engine.ts` maps **23 report-type IDs** to concrete engines: **17 domain registers**, one Executive Readiness Digest, one document Evidence & Provenance Trace and four regional filing-readiness types. These are engine mappings, not a claim that all 23 can run for every project or that their source data is present. Other catalog types return `REPORT_TYPE_NOT_COMPUTED`; the readiness digest is not substituted under another title.
- `server/services/report-os/regional/filing-types.ts` binds those four regional types to US IND, US NDA/BLA, EU MAA and Japan JNDA. The mapped filing-readiness jurisdictions are **US, EU and Japan**. This does not establish full CTD generation, all agency submission channels, or reporting coverage for other regions.
- `server/services/report-os/segment.ts` derives reporting applicability from the selected program's product type and the organization's recorded service/institution identity. The named segments are pharma, biotech, device, IVD, CRO, CDMO, academic and government. Consultancy and health-system needs are not separately enumerated reporting segments here; applicability alone does not validate every client workflow.
- `client/src/concept2cure/v2/surfaces/ReportEngine.tsx` is the existing protocol-analysis document producer. `ReportGovernance.tsx` is the existing intelligent-reports verify/seal/revoke surface. `surfaceViews.ts` mounts these separately from Insights. The `report-engine` registry notes in `shared/constants/ui-surface-registry.ts` describe immutable sealed reports while that surface's code describes protocol analysis: an existing expectation/metadata mismatch to assess in the running UI, not a reason to duplicate these capabilities.
- `server/services/report-os/lineage-trace-report.ts`, `sealing/run-seal.ts` and `pdf/bundle-pdf.ts` already supply provenance, integrity verification and PDF composition. The recent `RunSealVerdict` / `RunSealCheck` rename preserves the existing seal-verification logic.

## Changes since the previous synchronization

ReportOS's five plan refusal paths now distinguish an unread organization plan from a known insufficient plan and return `tier: null` for the unread state. Insights now carries that distinction into its run-refusal message rather than asking the customer to upgrade on an unknown plan.

The lineage report distinguishes an unread e-signature ledger from a known count of zero. It also identifies the actor and reason for administrator control actions. The analytics demo's similar-protocol lookup now receives the authenticated organization. The IND expedited-safety reporting clock delegates its due date to the canonical pharmacovigilance calculator. Post-market authoring rejects invalid or unordered reporting periods before a write. QMS tool input can carry a user-stated periodic review date rather than inventing one.

There was no ReportEngine or ReportGovernance UI redesign in this interval. The existing catalog is broader than the implemented reporting engines. Global coverage, source completeness, client-role navigation, approved-model authoring, final report export and the live demo remain separate acceptance questions; these source refinements do not close them.

## Review boundary

The review inspected the above paths, the bounded reporting delta and its focused regression definitions. A path-limited deleted-history search found no deleted versions of ReportEngine, ReportGovernance, the ReportOS route or the lineage renderer. Automated regression execution and canonical publication are recorded in the adjacent backend integration packet and the root delivery record, once complete. No permission, plan, model qualification, signature, source record or audit history was changed by this assessment.
