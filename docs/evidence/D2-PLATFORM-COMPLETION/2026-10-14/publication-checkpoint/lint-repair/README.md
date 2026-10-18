# Publication warning repair

W1 / D2, canonical branch, 2026-10-14. The normal pre-push gate refused the
23391d074 checkpoint for net two new warnings: three added and one removed.
The failed push log is preserved; no branch publication occurred in that run.
The warning baseline and caps are unchanged.

A protocol assertion helper retains all 109 assertions; 26 route cases pass
with zero forced lint warnings. Source Tracer extracts only the typed refusal
response boundary. Its older harness lacked the now-required request executor
and actual requester: the original four failures are retained, the adapted
harness and three typed-refusal controls pass all ten cases. Vault extracts
its existing target/source refusal helpers; restoring the imports/helpers
produces the exact original service bytes. Ingestion SQL, reservation, storage,
hash, audit and phase order are unchanged. The original type-binding harness
returned a placeholder for canonical actor queries; its three failures remain
separate from the corrected actual actor/anchor/sharing recorder. Five ingest
neighbours pass 57 cases including a current-viewer refusal against a stale
editor token. Forced Vault lint retains only its two original warnings.

The production build passes in 19.55 seconds with server output complete.
These focused runs use mocks or PGlite as their suites specify and do not
establish native RLS or regulated content qualification. Manifest records
pin this phase's six sources and unmodified raw log digests; filed logs trim
trailing blank lines and end with one newline. Final pre-push/compiler and
publication results remain pending.
