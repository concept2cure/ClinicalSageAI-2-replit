# ADR-0016: Reach MDX features through the client project

## Status

Accepted — 2026-10-23. Authorized by the founder's request to fold device and diagnostic disciplines into core MDX project workflows, with 510(k) and CER responsibilities kept distinct. Implementation and publication use `concept2cure-v2` only.

## Context

The platform has engineering, clinical, quality, diagnostic and publishing capabilities, but individual licensing modules have been presented as separate applications. Some MDX views also selected a program implicitly or substituted an unrelated document when the requested filing was absent.

## What already exists

- `shared/regulatory/work-packages.ts` compiles one deterministic, shared-evidence plan across filings.
- `v2/surfaces/ProjectHome.tsx` owns the project evidence, document, review, submission and response workflow.
- `v2/surfaces/WorkflowCatalog.tsx` and `v2/catalogWorkflows.ts` organize discovery and existing feature access. They remain the single catalog.
- `mdx/MdxSurfaceHost.tsx` hosts existing MDX features in the shared shell.
- `server/services/pathway-engines/estar/estar-content-leaves.ts` reads governed project documents and sections; document preview reuses that store.

Client paths above are relative to `client/src/concept2cure/`. The full inventory and deletion-history search limits are recorded in the linked design and evidence.

## Decision

Reach and extend these implementations. Projects contains the core MDX workstreams; the catalog presents MDX as a project workflow with individually governed feature access. Existing module ids, pricing decisions, approval authority and grant behavior remain in force.

The project record and its recorded filings tailor the plan. Regulatory Affairs leads a 510(k); Clinical Affairs and qualified evaluators lead MDR clinical evaluation. IVDR diagnostics use scientific validity, analytical and clinical performance, PER and PMPF. Clinical evaluation and engineering exchange evidence without a dependency on US clearance.

Select only the explicit project and exact document class. Missing CER/PER documents remain missing. Reads enforce current project access and never borrow organization-wide section content. Shared organization registers are labeled as such; the project workflow uses its own evidence and documents.

## Consequences

- Clients begin with their project and can reach existing evidence, authoring, review and filing features from workstreams with accountable disciplines and handoffs.
- Evidence requirements are reused across filings; conclusions and document identities stay filing-specific.
- A work-package plan does not assert completed work, named personnel, approval, regulatory compliance or readiness. Existing governed records supply those facts.
- No new application shell, workflow store, document store, entitlement bundle or production dependency is introduced.
- Older unanchored FDA records require their recorded project relationship before preview. This replaces an unsafe permissive fallback.

## Alternatives considered

Keeping individual app tiles preserves scattered navigation and was rejected by the founder. A parallel workflow or authoring engine would duplicate existing capabilities and was rejected in favor of completing their reach and scope.

## References

- [MDX workflow design](../design/MDX_PROJECT_WORKFLOW_2026-10-23.md)
- [Implementation evidence](../evidence/D2-MDX-PROJECT-WORKFLOW/2026-10-23/README.md)
- [Canonical project identity](0011-canonical-project-identity-space.md)
