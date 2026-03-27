# AnA Document Stack — Rollback Plan

## Immediate rollback levers
1. Disable feature flags by key (global or tenant-specific).
2. Unset force-on env var (`ANA_DOCUMENT_STACK_FORCE_ON`).
3. Keep existing export/proposal baseline paths active.

## Sidecar failure posture
- Intake: if sidecars unavailable, return controlled fallback output and provenance warnings.
- Quality: advisory warnings only unless policy explicitly hard-blocks.
- PDF validation: attach warning entry; do not break export by default.

## Data safety
- No direct sidecar writes to regulated tables.
- Existing governed consequence flow remains authoritative.

## Operational rollback sequence
1. Disable `pdf_validation` feature.
2. Disable `source_intake` feature for affected tenant.
3. Re-route to pre-existing parser pathways.
4. Retain provenance/audit logs for postmortem.
