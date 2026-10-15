# Citation query fixture typing follow-up

The root-owned whole compiler reported six fixture errors. This phase repairs the one `TS2345` in `source-usage.pglite.integration.test.ts`: the late-reservation refresh setup passed its actual fixture pool to the service, but that pool declared a fixed `Record<string, unknown>[]` result instead of the canonical `Queryable` generic result.

The fixture query now declares its row type parameter and passes it directly to the native `pglite.query<R>`. The object explicitly `satisfies Queryable`. No cast was added, and the SQL, query recording, current actor/parent checks, real membership deletion, checksums and late-withdrawal assertions are identical. The saved before file matches the exact source digest recorded by the earlier sealed citation proof.

The exact source-usage suite passes **45/45, zero skips, in 7.24s**. Scoped fixture ESLint has **zero errors and warnings**. The two reservation-time tests still permit the earlier admitted checksum read, refuse after the actual membership deletion with typed403, forbid later checksum/source/citation write locks and preserve complete citation history.

`fixture-type.patch` records the type-only change. The manifest pins the current fixture and canonical generic interface/service, the exact before snapshot, the root compiler failure log and the separate green/lint raw logs. New log copies normalize only trailing whitespace and EOF; exact raw files remain in `/tmp`.

The original167-case composite, original45 run and all older sealed evidence/pins were not rewritten. This follow-up runs no compiler, native database or provider and makes no compiler-zero, native RLS, COMMIT-concurrency, provider-performance or regulatory acceptance claim. The final whole compiler remains owned by the root session.
