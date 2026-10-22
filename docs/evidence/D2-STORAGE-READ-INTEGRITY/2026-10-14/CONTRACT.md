# D2 — storage read integrity

Bounded storage workstream, 2026-10-14. Baseline `87b27c897c5d1be20b0527009bcaf425ebbf3af6` on `concept2cure-v2`.

## Contract approved by the control tower

`IStorageProvider.get(versionId, organizationId)` keeps its existing signature and successful `StorageGetResult` shape. A successful read must return exactly the content whose SHA-256 and byte length the parsed storage metadata records.

- Check existing organization ownership and local path rules before integrity validation. Foreign versions and unavailable files keep their existing missing/null outcome.
- Retain existing malformed-JSON behavior: local corrupt sidecars return null; S3 JSON parse failures propagate. No bytes are returned in either case.
- A parsed, owned metadata record must state a 64-digit hexadecimal SHA-256 and a nonnegative safe integer byte length. Missing or malformed values throw `StorageIntegrityError`, `code: STORAGE_INTEGRITY_FAILED`, `reason: invalid_metadata`.
- A valid recorded byte length unequal to the loaded bytes throws the same named error with `reason: size_mismatch`.
- Same-size changed content and a changed recorded digest throw the same named error with `reason: digest_mismatch`.
- Valid reads, including zero bytes, preserve their result shape. Use the existing `computeSha256`; add no dependency, store, or provider.

The check compares loaded bytes with storage metadata. It does not authenticate a jointly altered sidecar and file against an approved filing. The control tower owns IVDR pack binding to authoritative recorded version/hash/size separately. Signed URLs do not return bytes through `get` and are outside this bounded contract.

## Red-first evidence

`server/services/storage/__tests__/storage-read-integrity.test.ts` exercises the real local provider and the real S3 provider with an in-memory S3 transport. It changes stored bytes after `put`, including a same-size replacement; changes recorded size/digest independently; supplies missing/malformed metadata; and preserves foreign/missing/malformed-JSON controls. The fake transport has no verification code. Expected failures must be recorded before implementation.

No schema, client surface, model call, deployment, branch, commit or push is part of this slice.
