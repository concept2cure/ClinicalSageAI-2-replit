# F02 — current-version QMS training compliance

Workstream W3/W4; launch rows D2/D5. Contract: [qms-contract.md](qms-contract.md).

The production compliance read now requires a nonexpired acknowledgment for the
effective document's exact version. Both counts use the same distinct current
organization roster, excluding accounts whose `users.status` is not `active`.
Removed memberships no longer contribute acknowledgments. Historical records
remain untouched, including expired and previous-version evidence.

The reusable query is `server/services/qms/training-compliance.ts`. Integration
is a direct import of `QMS_CURRENT_TRAINING_COMPLIANCE_SQL` by the existing
`GET /api/mdx/qms/training/compliance` route; its parameters, response fields,
trainable document types, ordering and 200-document limit remain unchanged.
`last_cycle` now describes the effective version's newest acknowledgment by a
current member, including an expired cycle, rather than a prior version.

Regression evidence used Node 22.23.3 and real PostgreSQL through PGlite, with
canonical organization/user/membership/QMS DDL. The initial module contained
the existing inline query from audited head `920b230`; the same six tests ran
before and after the query correction:

- [Red run](qms-training-red.txt): 6/6 failed. After v1 training and revision to
  effective v2, the query incorrectly returned `current: 1` instead of `0`.
- [Green run](qms-training-green.txt): 6/6 passed. Coverage includes exact
  version, fresh v2 acknowledgment, retained v1 history, expiration, duplicate
  acknowledgments, active/removed/foreign membership, organization isolation,
  zero roster, and effective/trainable-document filtering.
- Scoped ESLint passed (exit 0); [output](qms-training-lint.txt).
- Production query module TypeScript check passed (exit 0);
  [output](qms-training-module-typecheck.txt).

Commands:

```sh
/workspace/audit/node-v22.23.3-linux-x64/bin/node node_modules/vitest/vitest.mjs run --config vitest.config.ts server/services/qms/__tests__/training-compliance.pglite.test.ts
/workspace/audit/node-v22.23.3-linux-x64/bin/node node_modules/eslint/bin/eslint.js server/services/qms/training-compliance.ts server/services/qms/__tests__/training-compliance.pglite.test.ts
/workspace/audit/node-v22.23.3-linux-x64/bin/node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --module esnext --moduleResolution bundler --target ES2020 --types node server/services/qms/training-compliance.ts
```

Limits: this proves the read contract against real SQL, not HTTP authentication,
runtime RLS, signing or production deployment. A focused TypeScript invocation
including the shared test harness lacks the application's Express request
augmentation and reports six `orgMembership.ts` `Request.user` diagnostics;
[captured output](qms-training-typecheck.txt). No diagnostic names the changed
query or regression. The lead owns application-wide type checking.

No migration, training-record mutation, dependency change, network operation,
installation or commit was made in this scope.
