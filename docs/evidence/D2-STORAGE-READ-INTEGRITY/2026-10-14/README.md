# D2 — loaded storage bytes agree with the recorded digest and size

Date: 2026-10-14. Workstream: governed source integrity. Baseline: `87b27c897c5d1be20b0527009bcaf425ebbf3af6`, `concept2cure-v2`.

The local and S3 providers returned their sidecar's SHA-256 alongside whatever bytes were loaded. A changed file of the same size therefore downloaded with its original digest and looked intact. Both providers now verify loaded bytes using one `assertStoredContentIntegrity` implementation in `storage-provider.ts`, using the existing SHA-256 utility.

The successful result and method signature stay the same. An owned, parsed record with missing/malformed digest or size, a size mismatch, or a digest mismatch throws `StorageIntegrityError` with a stable code and reason. No changed bytes are returned. Existing foreign-owner, local-path, missing-object and malformed-JSON outcomes are preserved. Valid zero-byte files remain readable.

`CONTRACT.md` records the control tower's approved boundary. This checks bytes against storage metadata; matching a filing to its authoritative approved version/hash/size belongs to the IVDR route workstream. Signed URLs do not run through a byte-returning `get` and are outside this change.

The coordinated route work is now implemented under [PACK-DOWNLOAD-CONTRACT.md](PACK-DOWNLOAD-CONTRACT.md). Actual stored bytes must also match the selected format's tenant-scoped pack-row SHA-256 and byte length, even when storage metadata was changed to agree with a changed file. PostgreSQL BIGINT decimal lengths are handled without coercing missing/malformed identities into valid lengths. All four formats return a named HTTP409 on integrity failure; a missing recorded original manifest returns404 instead of a snapshot substitute. Legacy fallback, only for packs without a recorded original manifest, checks both canonical snapshot hashes and emits the actual rendered-byte checksum. Audit success is attempted only after validation, retaining the existing best-effort audit emitter; no durable-audit or client-receipt claim follows.

## Evidence

| File | Result |
|---|---|
| `01-red.txt` | Before production edits: 22 defect cases failed and 8 controls passed. Real local files and fake S3 object bytes were changed after `put`; both unmodified providers returned them instead of refusing. |
| `02-green.txt` | Integrity, tenant-isolation and S3-lookup suites: 58/58 passed. Same-size corruption, changed size, independent digest/size edits and missing/malformed identities are refused. |
| `03-eslint.txt` | ESLint on the three changed production files and new test: exit 0, no diagnostics. |
| `04-typecheck.txt` | Focused TypeScript compile of those four files and their imports: exit 0, no diagnostics. This is not the repository-wide typecheck. |
| `05-storage-regressions.txt` | All storage test files, including production bundle/provider selection and durability posture: 5 files, 69/69 passed. |
| `06-pack-download-red.txt` | Baseline route: 17 failing defect cases, 5 passing controls. Changed artifacts, absent identity, missing original and checksum/audit behavior expose the gap. |
| `07-pack-download-review-red.txt` | Expanded suite against the initial fix: 5 failing cases, 32 controls. This caught PostgreSQL BIGINT string handling and missing snapshot-query organization scope before the final correction. |
| `08-combined-green.txt` | Final combined suite: 6 files, 106/106 passed (69 storage and 37 route tests). |
| `09-download-eslint.txt` | Final route and new route test: exit0, no errors, four pre-existing route warnings. No warning in the new test or newly introduced rule category. |
| `10-download-typecheck.txt` | Focused compile of route/test and their imports: exit0, no diagnostics. |
| `11-independent-review.txt` | Independent integrity/control-flow review found no blocker; limits and corrected lint finding are recorded. |
| `12-eslint-baseline.json` | HEAD route lint baseline: the same four pre-existing warning categories. |

The new S3 tests mock only the transport; the provider and verification logic are real. They make no AWS or model call. Local tests use a dedicated high-numbered organization directory and remove only that subtree.

The route tests exercise the real injected-pool router with mocked database/storage boundaries, independently expected digests and request outcomes. This is evidence for the local invariant, not a real PostgreSQL/RLS, cloud recovery, release approval or agency-channel qualification. This slice improves D2; the launch row as a whole is not declared green.

## Commands

Tooling: Node 22.23.3 at `/home/agent/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node`; repository locked dependencies installed by the control tower.

Final combined test command:

```sh
NODE_OPTIONS='--max-old-space-size=4096' /home/agent/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node node_modules/vitest/vitest.mjs run --config vitest.config.ts server/routes/__tests__/ivdr-pack-download-integrity.test.ts server/services/storage/__tests__
```

```sh
NODE_OPTIONS='--max-old-space-size=4096' /home/agent/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node node_modules/vitest/vitest.mjs run --config vitest.config.ts server/services/storage/__tests__/storage-read-integrity.test.ts
NODE_OPTIONS='--max-old-space-size=4096' /home/agent/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node node_modules/vitest/vitest.mjs run --config vitest.config.ts server/services/storage/__tests__/storage-read-integrity.test.ts server/services/storage/__tests__/storage-tenant-isolation.test.ts server/services/storage/__tests__/s3-provider-lookup.test.ts
/home/agent/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node node_modules/eslint/bin/eslint.js server/services/storage/storage-provider.ts server/services/storage/local-provider.ts server/services/storage/s3-provider.ts server/services/storage/__tests__/storage-read-integrity.test.ts
NODE_OPTIONS='--max-old-space-size=4096' /home/agent/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --esModuleInterop --skipLibCheck --types node,vitest/globals server/services/storage/storage-provider.ts server/services/storage/local-provider.ts server/services/storage/s3-provider.ts server/services/storage/__tests__/storage-read-integrity.test.ts
NODE_OPTIONS='--max-old-space-size=4096' /home/agent/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node node_modules/vitest/vitest.mjs run --config vitest.config.ts server/services/storage/__tests__
```

No dependency, schema, surface, store, provider, branch, commit, push or deployment added by this workstream.
