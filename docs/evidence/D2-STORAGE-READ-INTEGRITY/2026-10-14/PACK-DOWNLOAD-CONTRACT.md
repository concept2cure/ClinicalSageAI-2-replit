# D2 Pack artifact download integrity contract

14 October 2026. Extends the successful storage-read invariant without a new store or dependency.

- An IVDR stored artifact is bound to the requested organization's pack row and the selected format's recorded vault version, SHA-256 and byte length. Validate actual bytes against this authoritative pack record independently of storage sidecar consistency.
- Missing/foreign packs and missing stored versions remain 404. A present version that fails integrity or has no valid recorded artifact identity returns HTTP409, code PACK_ARTIFACT_INTEGRITY_FAILED; no content or successful PACK_DOWNLOADED audit event is emitted.
- Successful headers use the digest of the bytes actually served. Log PACK_DOWNLOADED only after integrity verification; this remains a server preparation event, not a client receipt.
- If a pack names a stored original manifest and that original is missing, refuse it. Never substitute snapshot data for those original bytes.
- Preserve the existing legacy snapshot fallback only when no original manifest version was recorded. Verify its canonical JSON against both the snapshot row's hash and the pack's snapshot hash before rendering. The returned checksum describes the actual rendered JSON, not the original manifest.
- Malformed/unsupported format values return400 before reaching storage. No provider keys, expected/actual hashes, private paths or client file content appear in error responses.
- Reuse storage-provider's named error/validator and shared/canonical-json. No migrations, permission widening, approvals, signing, transmission, production key or dependency changes.

Tests use the actual injected-pool router and controlled storage fixtures. They show valid controls, same-size corruption, jointly changed sidecar+bytes, pack-size edits, absent digests, provider refusal, unavailable original, tenant/missing boundaries and success-audit ordering. They do not establish PostgreSQL/RLS or live cloud qualification.

