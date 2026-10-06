# Immutable disposition receipt retention

The published commit's blank-database job reported `document_data_dispositions` as a new unreachable table. `PURGE_RETAINED_RECORDS` now classifies this exact immutable receipt store under the existing audit-trail retention policy, with its reason beside the offboarding policy. The coverage gate reports retained evidence separately, rejects missing/invalid reasons and rejects direct or cascade purge reachability. The runtime also refuses a purge list containing the retained store before database access. The purge coverage baseline is unchanged.

This qualifies receipt classification and fail-closed reachability checks. It does not show that a whole tenant purge succeeds for a tenant with dispositions: existing source/extraction deletion guards may correctly refuse that purge. No guard is bypassed, no receipt is physically deleted, and no live-provider qualification is claimed.

From the repository root:

```sh
npm run ci:purge-coverage:selftest
node docs/evidence/D2-D5/2026-10-06-document-dispositions/purge-retention/direct-pglite-selftest.mjs
NODE_OPTIONS='--max-old-space-size=2048 --require=./docs/evidence/D2-D5/2026-10-06-document-dispositions/offline-verification.cjs' npx vitest run --config vitest.config.ts server/services/tenant/__tests__/tenant-purge-audit.test.ts --maxWorkers=1
```

The first command was blocked before executing cases because this host refused a Unix socket listener (`EPERM`); see `native-selftest-unavailable.txt`. The portable second command executes the original selftest's SQL, parser, catalog and baseline cases using direct embedded PGlite. Its native unavailable-server connectivity case is explicitly excluded. All **29 cases passed** (`direct-selftest.txt`), including unclassified receipts, unrelated content, invalid reasons, commented-out fake policy, and prohibited direct/cascade erasure. This is an embedded SQL result, not a native PostgreSQL CI gate result.

The runtime regression passed **1 suite / 7 tests** (`runtime.txt`), including bare and `public.`-qualified protected-table refusal before any database query. `eslint.txt` has zero errors and the existing offboarding file-length warning; the scripts are ignored by the repository ESLint config. The portable helper's syntax and ESLint check pass (`helper-eslint.txt`). `remote-failure.txt` preserves the actual GitHub failure and its source URL.
