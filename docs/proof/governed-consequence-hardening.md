# Governed Consequence Hardening

## Hardening moves in this pass
- Centralized consequence-state ownership in `useDocumentConsequenceState`.
- Preserved consequence row generation via `buildDocumentConsequenceRows`.
- Prepared clearer review package and status-normalization follow-on work by separating state concerns.

## Deterministic consequence-open behavior
- Consequence panel state ownership is now explicit and isolated, reducing cross-state drift.

## Review-package readiness
- Existing consequence context (artifact/version/status + refs) remains available for packaging in dedicated follow-on action layer.

- Accepted proposal rows now expose a **Review package** action that copies artifact/version/status/placement/provenance/audit plus latest consequence lineage for reviewer handoff.
- Governance state display is normalized into explicit labels (Generated, Accepted and governed, Review in flight, Locked / Finalized).
