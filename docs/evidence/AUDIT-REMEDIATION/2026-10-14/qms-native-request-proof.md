# Native QMS request-scope proof

Final source: `tests/db/mdx-qms-request-rls.dbtest.ts`. Final run: **9/9 passed**, one real-database Vitest file, 2026-10-14 06:56 UTC. ESLint: **0 errors, 1 test-group size warning**. Raw output is in `qms-native-request-green.txt` and `qms-native-request-lint.txt`.

The proof runs against the isolated, fully provisioned PostgreSQL 15 database `c2c_audit_remedies`, with the actual 386 migrations rather than a shadow schema. Trusted owner access creates only uniquely named synthetic fixture organizations, memberships, programs and projects. HTTP requests use signed local test access tokens, the real auth middleware, fresh database membership, canonical tenant AsyncLocalStorage, the actual LazyRequestDbClient and deployed session scoping. Runtime identity is asserted to be `app_service`, NOSUPERUSER and NOBYPASSRLS; its native connection uses TLS. The five relevant QMS/Authoring/training relations are asserted to have RLS and FORCE RLS enabled. No process-wide pg mock is loaded.

The workflow creates a controlled draft and actual Authoring sections/grants, reads the register and editor binding, enters review, approves with a distinct signer using actual password re-verification, reads its retained version and acknowledges current-version training. Database assertions verify exactly one approval signature, saved synthetic prose in the snapshot, and equality between the signature's bound payload digest and the version's 64-hex content digest. Native writes to reviewed Authoring text are refused by the controlled-document trigger; native snapshot mutation is refused. The register excludes prose. Training records and the canonical audit row are actually persisted, and compliance/readiness read the resulting current version.

Foreign exact editor/version IDs return 404; foreign training and program claims are refused. An unshared member is refused despite an admin role claim in its token: real auth uses persisted member authority. No foreign response exposes the synthetic text or Authoring UUID. A separate contract-only app supplies a synthetic identity and ALS but deliberately omits the request client; it fails closed with 500. That deliberately incomplete app is not evidence of a full authenticated production defect.

The controlled audit-failure seam wraps only the actual captured request client. After its real training INSERT has committed, that wrapper throws a typed 42501 error on the subsequent audit INSERT. The native business row increases by one, the rolled-back audit row count does not increase, and HTTP 201 truthfully reports a durable acknowledgment with `meta.auditTrail.persisted=false` and `AUDIT_ROW_NOT_PERSISTED`. Its warning is bounded and does not expose the injected error detail. A fresh request without the test seam records its real audit row and returns persisted/chained success. This is precise post-commit fault injection, not a claim that native database infrastructure was unavailable.

## Corrected diagnosis and preserved failures

A raw, uninstrumented app_service connection with enforcement enabled but no tenant ALS returns no owned rows. In contrast, both the actual instrumented global pool under canonical ALS and the actual LazyRequestDbClient return the owned row. Current `poolInstrumentation.runQueryScoped` stamps ambient ALS scope in a native transaction. Earlier source comments suggesting metric-only instrumentation are stale. The broad inference that global-pool imports make the full authenticated production pipeline inert was withdrawn; explicit request-client adaptation completes that caller contract rather than proving every previous full-auth path failed. ReportOS full-context native proof is separately delegated; this QMS proof does not qualify its APIs.

`qms-native-request-contract-red.txt` preserves the initial real workflow run: 7/8 passed and the foreign exact-version lookup returned safe empty 200[] instead of the expected unknown-parent 404. The production owner added the same-tenant parent check; the assertion was not weakened. Genuine owned unsigned drafts retain the established 200[] contract. `qms-native-request-fixture-setup-red.txt` preserves an earlier fixture parameter-type error and eight skipped workflow tests; that run is not qualification.

The earliest fixture cleanup borrowed a pre-existing owner-only database-test pattern that temporarily disabled selected immutability triggers within its cleanup transaction and removed only that invocation's synthetic signed rows. It did not alter customer or production rows, and the triggers were restored. That cleanup was inappropriate for this retained-record proof and was removed after review. The final source performs no fixture deletion, trigger disabling, policy removal or guard bypass: it closes connections and preserves uniquely named synthetic documents, signatures, versions, audit and training rows. Subsequent verification follows that preservation rule. The governed retention remedy remains an explicit refusal pending disposition review, not implemented signed-content erasure.

## Reproduction and limits

Use Node 22, the real-database Vitest project, the public local fixture trust file and password-free local synthetic trust connections:

```sh
PATH=/workspace/audit/node-v22.23.3-linux-x64/bin:$PATH \
TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55432/c2c_audit_remedies?sslmode=verify-full&sslrootcert=/workspace/audit/remediation-pg-tls/combined-trust.pem' \
APP_DATABASE_URL='postgresql://app_service@127.0.0.1:55432/c2c_audit_remedies?sslmode=verify-full&sslrootcert=/workspace/audit/remediation-pg-tls/combined-trust.pem' \
NODE_EXTRA_CA_CERTS=/workspace/audit/remediation-pg-tls/combined-trust.pem \
RLS_ENFORCE=on \
npx vitest run --config vitest.db.config.ts tests/db/mdx-qms-request-rls.dbtest.ts
```

The draft prose is seeded through the trusted owner fixture, so the proof does not qualify editor-save HTTP behavior. It uses local test JWTs and password authentication; real sign-in, identity-provider integration, MFA providers, production secret provisioning, live agency/provider transactions and browser interaction are outside its scope. The runner warns that AUDIT_HMAC_SECRET is absent and uses the development fallback: actual audit persistence/chained-path execution is proven, production audit-chain secret integrity is not. An existing pg client concurrent-query deprecation warning is preserved in the log; pg 9 compatibility is not asserted. No production route/service code was edited by this native-proof agent.
