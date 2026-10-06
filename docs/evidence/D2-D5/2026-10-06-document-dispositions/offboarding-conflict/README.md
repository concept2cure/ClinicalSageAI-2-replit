# Governed offboarding retention conflict

W2/D2 and D5 continuation. The immutable disposition migration refuses deletion of protected source/extraction lineage with SQLSTATE `55000` and `DOCUMENT_DISPOSITION_WRITE_REFUSED:`. Tenant purge previously rolled back, then returned an opaque server error. It now translates only that exact known refusal, after the rollback attempt, into `DOCUMENT_DISPOSITION_RETENTION_CONFLICT`. The authenticated API returns HTTP 409 with a safe retention-review explanation and no purge-success fields. Unrelated errors keep the existing private 500 response. No data guard, retention override, physical storage deletion path, baseline or dependency was changed.

The new service regression fails when only the translation block is omitted (`service-negative.txt`). Restored code and route verification passed 2 files / 17 tests; neighboring offboarding and actual PGlite Vault scope/export checks passed 2 files / 35 tests: **4 unique files / 52 tests**. Those counts overlap earlier historical runs. The service tests use an instrumented pool to assert rollback before conflict, no COMMIT, no organization status change and no successful purge receipt. This does not qualify native concurrency or a successful full purge for retained source data.

Reproduce from the repo root:

```sh
NODE_OPTIONS='--max-old-space-size=4096 --require=./docs/evidence/D2-D5/2026-10-06-document-dispositions/offline-verification.cjs' npx vitest run --maxWorkers=1 server/services/tenant/__tests__/tenant-purge-audit.test.ts server/routes/__tests__/tenants-simple-purge-audit.test.ts server/services/tenant/__tests__/tenant-offboarding.test.ts server/services/tenant/__tests__/tenant-purge-vault-scope.pglite.integration.test.ts
```

Production client/server build passed (16.44s client); existing bundle-size warnings remain. ESLint has zero errors and the existing offboarding file-length warning. Semgrep 1.177.0, p/default + p/ci, timeout 30s, four explicit targets: 210 rules, zero findings, approximately 99.9% parsed lines, exit 0. One existing partial-parser warning covers two unchanged generic-import spans in the route test (lines44/48); production files have no parser warning. `semgrep.json` records that coverage limit. Full pre-push and publication are pending at this checkpoint. Live provider/verified-tenant/reviewer qualification remains blocked; no feature activation was performed.
