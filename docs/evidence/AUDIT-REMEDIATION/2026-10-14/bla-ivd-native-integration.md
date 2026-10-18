# BLA and IVD native request integration

The newly connected BLA and IVD saved-work paths have been qualified against the local provisioned PostgreSQL schema, with canonical JWT authentication, tenant AsyncLocalStorage (ALS), the request-pinned client, and `RLS_ENFORCE=on`. The runtime role is genuinely non-superuser, has no `BYPASSRLS`, and the authenticated request does not use the `app_super_admin` policy arm. All three assessment/document tables have enabled and forced row-level security.

## Confirmed defect and remedy

An admitted writer could lose their persisted write role during the request and still save a BLA or IVD governed record if they remained programme lead. The transaction helper refreshed membership, but its lead check ignored the refreshed role. This contradicted the `GOVERNED_WRITE_ROLES` rule already applied by both mounted routers.

The native regression uses the real signed access token and authentication, then a test-only scheduling seam changes the persisted membership after successful admission and before the real router. Before the fix, BLA returned 200 and persisted a new governed assessment for the viewer lead; the red evidence is `/workspace/audit/bla-ivd-native-inflight-role-red.log`. `requireGovernedProgramWriteTx` now applies the canonical write-role set to its fresh membership read before checking programme lead/manager authority. Native proof verifies both BLA and IVD return 403, persist neither row, retain ordinary member-lead writes, and reject foreign-program writes.

The earlier between-request downgrade hypothesis was not the observed defect: the global authentication boundary reads the membership role afresh and already refuses that case. The native proof and remedy address the in-flight authority change.

## Explicit request contracts

BLA list/detail reads, IVD list/detail/document reads, and IVD stored-assessment drift inputs now use `requestPgClient(req)`. The IVD list services accept the same optional query executor already supported by their other persistence methods, retaining defaults for explicitly scoped non-HTTP callers. Missing request context refuses rather than silently falling back.

The shared HTTP `signGovernedAct` wrapper now passes that request client to the canonical signing-authority and signer-reverification factories, and reuses it for the domain, audit and signature transaction. Component/meaning validation still runs first. Authority/credential refusals start no domain transaction; wrong-password accounting is durable on the pinned connection. No alternate identity, provider, role, or signing policy was introduced.

This is a contract-consistency remedy, not a claim that every prior global reader was dead in production. `poolInstrumentation.ts` actively applies tenant ALS scope to global pooled statements and transactions under enforcement. A fixture with a pinned client but without the canonical ALS context is insufficient evidence of a full production failure. The isolated adapter tests intentionally exercise the explicit request-client contract; the native tests include both canonical contexts.

## Validation

- `server/routes/__tests__/governed-signed-act.request-context.test.ts`: 5 cases; 4 failed before the wrapper change and all pass afterward. Red log: `/workspace/audit/bla-sign-wrapper-context-red.log`.
- `server/routes/__tests__/bla-ivd-request-readers.test.ts`: 9 cases for pinned list/detail/drift reads and missing-context refusal. The SQL engines and adapters are real; the auth fixture and query executor are controlled seams.
- Combined focused route run: 100 tests in 5 files pass, including existing domain signing, viewer-write and error-disclosure regressions. Log: `/workspace/audit/bla-ivd-request-unit-final.log`.
- Fresh-role narrowing follow-up: the transaction helper explicitly refuses missing/non-string roles before its canonical allowlist check. Seven focused cases cover absent/null/empty/viewer roles, member lead/non-lead and foreign programme refusal. Log: `/workspace/audit/bla-ivd-fresh-role-narrowing-final.log`. The native five-case proof was rerun after this change.
- `tests/db/bla-ivd-request-connection.dbtest.ts`: 5 native cases pass. Real routes save and refresh BLA/IVD records and generated drafts; exact foreign records and foreign-program saves refuse; actual bcrypt refusal durably increments the account counter; an accepted BLA signature commits its signed status, governed audit and signature row and survives readback. No PG/auth/domain/signature implementation is mocked. Log: `/workspace/audit/bla-ivd-native-request-final.log`.
- Scoped lint: zero errors, one existing parameter-count warning. Log: `/workspace/audit/bla-ivd-request-lint.log`.

Native execution uses trusted local TLS, `app_service` for runtime queries, and the owner connection only for synthetic fixtures/catalog/assertions. A synthetic audit HMAC key is explicitly configured for this local proof. It exercises the actual public-schema FORCE RLS tables, not a PGlite replica. Permanent synthetic signature/audit fixture rows remain as evidence in the disposable audit database. This is not a deployed production, live provider, or agency transport qualification.

## Pending policy decision

BLA/IVD saved reads retain their existing organisation-wide read policy and optional programme filters. `program-access.ts` explicitly documents this policy until programme/project membership convergence. No private-programme ACL was invented here. Alignment with the stronger anchored authoring/source privacy policy remains a product/governance decision and should stay visible in the launch-gap register.

ReportOS was audited separately with attention to its canonical ALS path. Global SQL/ORM call sites alone do not justify a broad request-client rewrite or a false-empty defect claim. The lead audit retains ownership of the full-context ReportOS result and any confirmed follow-up.
