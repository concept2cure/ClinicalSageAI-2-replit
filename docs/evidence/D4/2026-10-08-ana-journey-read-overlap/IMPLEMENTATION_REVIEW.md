# Independent scoped audit and implementation review — W3/D4

The scoped read-only reviewer confirmed four independent sequential reads in
client-journey.ts and the registered in-scope get_client_journey tool's pooled
call path. The mounted greeting fallback also uses this helper only when a
project reference is present, no requested enrichment matched, and common
project/workflow context is empty; it does not run for every projectless greeting.

Pool instrumentation captures tenant scope per statement and uses a separately
acquired client with BEGIN, local tenant settings, one query, COMMIT/ROLLBACK and
release. Starting four pooled statements introduces no shared session state. A
supplied PoolClient may serialize on its single connection; no extra parallel
connection or transaction change is introduced for that case.

No material implementation blocker was found. Four async IIFEs are invoked in
original lexical order, keep their own query/result try-catch and update disjoint
invocation-local fields. Both synchronous throws and rejections remain contained.
Stage resolution and readiness override occur only after all reads settle. SQL,
parameters, defaults and output formatting are unchanged. No cross-turn cache.

Eleven new tests prove pre-settlement admission, out-of-order completion, the
scripted slowest-read wait, all partial and total failures, readiness/segment
overrides, empty rows/age clamp, tenant isolation and later fresh calls. Tests
that inspect mock call arguments explicitly type those arguments. The reviewer
made no edits and ran no tests, build or compiler processes. No production
latency benchmark was inferred.
