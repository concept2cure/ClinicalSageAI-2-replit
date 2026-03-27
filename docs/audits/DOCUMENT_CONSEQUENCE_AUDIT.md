# Document Consequence Audit (2026-03-26)

> Status: ACTIVE
> Canonical: Yes
> Supersedes: —
> Superseded By: —
> Related Reports: BETA_READINESS_MASTER.md; LAUNCH_GATE_DOCUMENT_CONSEQUENCE_REPORT.md


## Scope
- Proposal acceptance + generated document consequence visibility in governed artifact lifecycle.

## Implemented
- Proposal accept now persists status and attempts governed artifact/version writeback via existing compute governance path (`registerArtifactWithGovernance`).
- Proposal reject now persists status durably.
- Conversation OS dashboard sub-surface shows latest plan/scout/proposal state and supports accept/reject actions.

## Governing Consequence Coverage
- Accepted proposals in project/user-scoped calls now return `governedConsequence` payload including artifact id/version/status/placement + provenance/audit references.
- Compute lane behavior was preserved.

## Remaining Caveats
- Governed writeback currently requires numeric `projectId` and `userId`; non-numeric inputs fall back to proposal-status durability without artifact writeback.
- Additional beta-visible generated-doc entry points outside conversation OS were not expanded in this tranche.
