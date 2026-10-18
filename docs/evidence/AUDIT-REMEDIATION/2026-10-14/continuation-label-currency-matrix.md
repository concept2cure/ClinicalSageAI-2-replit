# F22 continuation: recorded label currency matrix

Only `global.label_currency_matrix` gains a canonical computation in this continuation. It uses the existing domain engine and shared manual/scheduled dispatch, existing report stores and existing launch Reporting UI. The authoritative inventory becomes 61 definitions, 23 engine-backed, 5 unavailable predictions and 33 uncomputed types. An engine-backed definition is not a claim that a tenant has the required data or that the full report is qualified for regulatory use.

The provider issues one parameterized SQL statement over the deployed `rim_products`, `rim_registrations`, `rim_labels` and `lifecycle_obligations` schema. Its four arrays share one PostgreSQL MVCC snapshot and database observation timestamp. Every child requires its own organization predicate and a nondeleted parent in that same organization; productless obligations remain explicitly unlinked. Soft-deleted rows and malformed links to foreign/deleted products cannot disclose parent data. No new source, store, schema, dependency or guessed programme relationship is introduced.

The calculation preserves every recorded label version and status. It counts approved records in the exact product/normalized-market/label-type slot, flags duplicate approved records and never ranks version strings or selects a current winner. It exposes missing versions, absent/future approval dates, duplicate market registrations, labels without matching registrations and registered markets without labels. A global core data sheet stays a separate unassigned/core row and never fills another market or type. The canonical schema has no J-Label type: that limitation is explicit, with an additional gap for recorded Japanese registrations. Unknown markets are not assigned a CCDS requirement.

Registration status, registration number, approval date and renewal date are copied as recorded. Independent lifecycle obligations retain their product, region, classification, status, due date and submitted date. Date standing compares the recorded due date with the observed UTC day using the canonical obligation-urgency function and terminal-status policy. An obligation is never inferred to concern a particular label; its region is never converted into a country or a legal noncompliance conclusion.

**Legal currency remains unknown.** These tables contain no effective-date, expiry or current agency-authorized-text attestation. Every run therefore carries the explicit critical blocker and is ineligible for finalization, even when its recorded facts are populated. Confidence is null, with no invented risk score, forecast or completeness percentage. Empty required inputs yield a missing provider and explicit critical source gaps. Source query failures reject rather than create an apparently successful empty report.

The actual computation covers the organization. Account/program/project scopes retain their existing ownership and project-sharing checks, while provider output and rendered/PDF documents disclose organization-wide coverage. Client-workspace narrowing is refused before source reads. Existing RIM read endpoints already permit organization members and viewers to read these organization records; this work does not create a finer-grained or broader privacy policy.

The dedicated renderer has explicit columns, including nullable market, approval date, version and source IDs. It avoids the generic register renderer's first-row column inference, so a null first row cannot hide later populated values. The canonical gaps evaluation/rendering recognizes this matrix and does not contradict its actual gaps with a generic "not evaluated" sentence. JSON, the existing Insights canvas and the PDF contain the matrix, products, registrations, independent obligations, provenance and method limits. Old runs without the matrix marker keep their existing rendering; an unsupported matrix schema is refused.

Qualification uses synthetic records only:

- `server/services/report-os/__tests__/label-currency-matrix.pglite.test.ts`: actual deploy RIM/lifecycle DDL; positive rows, soft deletion, foreign/malformed parent links, duplicate approvals, retained versions, null-first columns, empty/unreadable sources, actual shared dispatcher, confidence/critical blocker propagation, rendered document, PDF text and final-status refusal.
- `client/src/concept2cure/v2/__tests__/insightsLabelCurrencyMatrix.test.tsx`: mounts the existing Insights canvas, runs this catalog type, and displays the real calculation/renderer output with nullable-first columns, dates, versions, independent obligations and explicit unknown currency.
- `tests/db/report-label-matrix.dbtest.ts`: actual provisioned PostgreSQL, `app_service` without superuser/BYPASSRLS and FORCE RLS on all four source tables; positive tenant data and foreign isolation; real JWT-authenticated create/readback routes, real workspace refusal, real finalization refusal, and real scheduled generation that atomically saves the matrix, tenant notification and cursor.

The native scheduling fixture uses JavaScript Date precision, matching the canonical subscription writer. An initial fixture using SQL `now()` microseconds correctly failed the existing optimistic cursor comparison after conversion to JavaScript milliseconds; the fixture was corrected without weakening the production comparison. The UI fixture initially matched two legitimate Approval-date headers and was narrowed to the actual matrix section. Neither initial failed fixture run is qualification evidence.

Native verification command (all credentials and records are task-local synthetic fixtures):

```bash
PATH=/workspace/audit/node-v22.23.3-linux-x64/bin:$PATH \
NODE_OPTIONS=--max-old-space-size=4096 \
NODE_EXTRA_CA_CERTS=/workspace/audit/remediation-pg-tls/combined-trust.pem \
PGSSLROOTCERT=/workspace/audit/remediation-pg-tls/server.crt \
TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55432/c2c_audit_remedies?sslmode=verify-full' \
DATABASE_URL='postgresql://postgres@127.0.0.1:55432/c2c_audit_remedies?sslmode=verify-full' \
APP_DATABASE_URL='postgresql://app_service@127.0.0.1:55432/c2c_audit_remedies?sslmode=verify-full' \
RLS_ENFORCE=on AUDIT_HMAC_KEY=synthetic-label-matrix-native-fixture \
node node_modules/vitest/vitest.mjs run --config vitest.db.config.ts \
  tests/db/report-label-matrix.dbtest.ts --reporter=default
```

Task-local raw results are `/workspace/audit/continuation-label-matrix-first.log`, `continuation-label-matrix-ui.log`, `continuation-label-matrix-native.log`, `continuation-label-matrix-lint.log` and the final broader regression log. The control tower owns final typecheck/build, integrated evidence and final ledger disposition. This completes a genuine recorded-fact matrix with explicit uncomputed legal currency; it does not complete the other 33 missing report engines or certify label currency.

Frozen-source verification passed **234 tests in 23 unit/PGlite/UI/renderer/worker regression files** (`continuation-label-matrix-final-regressions.log`) and **5 native database tests** (`continuation-label-matrix-native.log`). The latter includes the actual scheduled write/notification/cursor transaction and authenticated finalization refusal. Scoped lint passed with zero errors and two pre-existing domain-provider size/complexity warnings; the new provider/renderer add no lint warning. `git diff --check` passed. No further native fixture process remains running from this workstream.
