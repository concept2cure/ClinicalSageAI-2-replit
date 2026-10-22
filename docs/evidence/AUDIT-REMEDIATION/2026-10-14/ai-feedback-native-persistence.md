# AI feedback: native persistence and audit outcomes

Verified on 2026-10-14 against the canonical deploy-replayed, disposable loopback PostgreSQL database. The test owns only synthetic fixture organizations 94910 and 94911. It does not install or alter schema, roles, grants, policies, triggers or production data.

The actual `context-intelligence` router was mounted behind its existing authentication and tenant middleware. Genuine signed test sessions established async tenant scope and `LazyRequestDbClient`. The runtime connection was `app_service`, with `rolsuper=false` and `rolbypassrls=false`. Both `ai_feedback` and `regulatory_audit_logs` had enabled and forced row-level security. The test positively observed the shared instrumented pool's tenant ALS during the real feedback INSERT; this is not a claim that shared-pool access fails within authenticated request scope.

**Result: 7 tests passed in 3.11 seconds.** ESLint reported zero errors and one function-length warning in the test suite callback. The native runner was Vitest 4.1.7 under Node 22.23.3, using `vitest.db.config.ts` (which does not mock PostgreSQL).

| Proof | Observed result |
| --- | --- |
| Authenticated runtime posture | Correct tenant GUC, `member` policy role, matching ALS tenant, and genuine lazy request client. A separate unscoped runtime connection could not read the tenant's feedback. |
| Positive and negative feedback | Both boolean values persisted with the actual returned row ID and verified actor. Body-supplied foreign organization/user values did not choose attribution. Parameterized opaque labels containing SQL punctuation remained literal text. |
| Regulatory audit | Successful feedback produced an actual `FEEDBACK` / `ai_response` row in `regulatory_audit_logs`, attributed to the verified tenant and user. The response correctly reported `persisted:true,chained:false`; this store is not the chained `audit_logs` store. |
| Validation | Missing/invalid booleans, blank or oversized labels and oversized comments returned 400 without feedback rows, audit rows or success receipts. |
| Foreign isolation and refusal | Another tenant could persist its own feedback, which the first tenant could not read. A validly signed token claiming an organization without membership was refused. A genuine request connection's attempted foreign-tenant INSERT was rejected by PostgreSQL with SQLSTATE `42501`. Anonymous feedback was refused. |
| Proved business refusal and recovery | Retargeting only this fixture's feedback INSERT to the foreign tenant caused a real deployed-RLS rejection (`42501`). The route returned `503 FEEDBACK_NOT_RECORDED`, without feedback, audit, fabricated receipt or raw database detail. Removing the control restored feedback and audit persistence. |
| Unconfirmed completion | The test let PostgreSQL complete a real autocommitted INSERT, then suppressed its completion signal. The route returned `503 FEEDBACK_SAVE_UNCONFIRMED`, without claiming rollback or returning an invented receipt/audit. Owner inspection confirmed the row existed. This is an acknowledgment-loss control, not a physical network-outage qualification. |
| Postcommit audit refusal and recovery | Only this fixture's audit INSERT was retargeted to the foreign tenant, producing a genuine `42501`. Feedback remained committed and its real ID was returned, with `meta.auditTrail.persisted:false` and `AUDIT_ROW_NOT_PERSISTED`. Removing the control restored actual audit persistence. |

The failure seam wraps the existing runtime pool query executor only for the named INSERT tables, this run's unique synthetic message prefix and organization 94910. It delegates the changed parameter to real PostgreSQL and restores the executor after the suite. It does not replace a SQL result with a mock, weaken RLS, or change the production route. The completion-loss control suppresses a result only after the genuine INSERT finishes. Harness-only scope/read/direct-write endpoints are defined solely inside the test.

Run with the owner URL supplied as `DATABASE_URL` (or `TEST_DATABASE_URL`) and the provisioned least-privileged application URL as `APP_DATABASE_URL`:

```sh
npx vitest run --config vitest.db.config.ts tests/db/ai-feedback-persistence.dbtest.ts
```

The deployed migration is a prerequisite. The test never creates the feedback table. Feedback labels are bounded opaque labels; these tests do not claim native message/conversation ownership binding, model training, a live AI-provider call, or qualification of the optional project learning signal. Raw SQL/error parameters are intentionally omitted from this evidence document.
