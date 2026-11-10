# Incoming project-authoring guard review

Reviewed at `2026-11-06T19:54:14.473318+00:00` for package F1. No scoped production blocker was found in the merge of `53b9f15d8fe96767c8dbe6def2d7e8c5e03db7aa` into local integration `637737bb13f51363e15a75d6f4a27bfcbeb8e408`, compared with `965084590ccf7a569248cc1c6df0455785f7a722`. Exact selected inputs are recorded in [incoming-53b-security-review.json](incoming-53b-security-review.json).

The canonical write guard is preserved. Source-copy creation and reuse request write admission through `authorizeAuthoringProgram`, including its current project permission; source/reference verification uses explicit read admission where intended. Reading a source cannot grant permission to create a target copy. Existing transactional creation and source revalidation remain in force.

The canonical list DTO includes `success: true` and each row's `program_id`. Requiring those facts on ordinary project reads is compatible with the real server. Two older scoped test fixtures omitted those fields; their DTOs should be corrected rather than weakening the permission or current-project guard. Organization-only listing remains separate from project creation authority. The incoming lineage writer/transaction hardening is retained without a baseline or gate bypass.

This is a read-only source/DTO integration review, not test, compiler or browser execution. The prior e533 review stays historical. Existing component/native pin manifests did not include the two incoming guards; unchanged selected pins alone are not proof of the newly exercised behavior. The lead agent owns fresh compatibility, native-walk and complete repository gate receipts.
