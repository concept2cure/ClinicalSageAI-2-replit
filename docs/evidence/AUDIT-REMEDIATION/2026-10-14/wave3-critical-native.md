# Wave 3 — native safety and screening history proof

`tests/db/wave3-critical-history.dbtest.ts`: **17/17 native cases pass** against the existing canonical provisioned PostgreSQL installation. The test uses genuine access-token authentication, AsyncLocalStorage tenant scope, LazyRequestDbClient, and TLS app_service connections. Its control endpoint proves the runtime is neither a superuser nor BYPASSRLS. No `pg`, admission policy, domain writer, chained audit writer, table definition, or trigger is mocked or altered. Query wrappers delegate all successful queries to the genuine instrumented runtime pool and inject only the stated failure or timing condition.

The actual provisioned adverse_events tenant key is INTEGER after canonical migration convergence, although the earlier PV creating migration used TEXT. The case ID, project reference, seriousness JSON representation, and narrative are TEXT. Tests insert the actual columns and prove the saved seriousness value is JSON (`["hospitalization","life_threatening"]`), not a PostgreSQL array string.

A narrative-only save also preserves an actual NULL seriousness assessment; it does not silently turn unknown seriousness into an assessed empty list. The matching mounted UI tests prove the field is omitted until the reviewer explicitly edits it.

Safety proof: a posted narrative is returned in the successful save and exact authenticated GET; the current case row and its canonical audit row have identical `xmin`. The retained audit payload contains the actual old and new narrative. An injected audit INSERT failure rolls the case and chain position back. A confirmed COMMIT followed by display-read failure still returns `saved:true` and a recovery GET. Lost COMMIT acknowledgement is exercised both before delivery and after actual durability: both return explicit uncertainty, perform no fake rollback, and exact readback distinguishes whether the row and its single audit entry exist. Private and foreign cases are omitted/refused, a viewer cannot save, and a real UUID programme resolves through the actual integer-project bridge.

Screening proof: first and revised decisions are persisted to the existing corpus-linked store with the actual canonical source name (`LITERATURE_SOURCE_NAME`, `PubMed`), reloaded, and linked to same-transaction audit rows. History failure rolls the decision back. Both COMMIT uncertainty cases recover through the actual screening GET without a duplicate write. Foreign corpus entries, foreign and private programmes, and viewers are refused. Membership removal after genuine auth is injected at business BEGIN and both critical writers refuse the now-revoked user.

Concurrency proof exercises both first screening and later revisions. The first request pauses after obtaining the real `literature_entries` parent row lock; a second authenticated request is observed waiting on that lock in `pg_stat_activity`. After release, each retained audit preimage is the preceding committed decision, including the formerly nonexistent first decision. The final current row matches the final history transition. The entire retained synthetic tenant hash chain and every HMAC seal verify with the existing task fixture keys.

The task-only synthetic organizations are 94720 and 94721, with unique target records per invocation. Audit rows are retained; no immutable record is deleted and no protection is disabled. The secret values are injected from the existing outside-repository task fixture by `/workspace/audit/run-wave3-critical.py` without printing or changing them. This is synthetic local qualification of history and permission semantics; it does not qualify clinical content, agency transmission, or an external service.

The native run is in `wave3-critical-proof/green.txt`; focused lint has zero errors and one complexity warning in the deliberately fault-injecting test function. Earlier local test failures were fixture mistakes (the wrong case for the PubMed source name, and removing membership before a second route's independent authentication); they did not indicate product failures and are not represented as accepted red evidence. The route workstream separately retains its actual pre-fix negative controls.

Catalog snapshot `wave3-critical-proof/catalog.txt` records the 15 actual critical column types and 14 existing public domain/identity/sharing/audit tables. Every recorded public table has enabled and forced RLS; app_service has the deployed SELECT/INSERT grants. These differ from the separate legacy predicate-schema stores documented in the Shadow proof, which initially had no RLS. The control tower repaired those parent policies in the existing canonical migration; the final Shadow proof verifies FORCE RLS on all three as well as the explicit exact-parent BFF SQL. The suite neither broadens those grants nor creates a policy.

The real-database test-isolation guard passes (176 files). The broader unrun-test inventory reports three unrelated `.mjs` test files without a recognized runner; that result is retained in `wave3-critical-proof/unrun-guard.txt` and was escalated to the control tower. This workstream does not suppress it or claim the whole-repository guard suite is green.

Owned implementation/test files for the combined child scope:

- `server/routes/defense-packet.ts`
- `server/routes/se-matrix.ts`
- `server/services/defense-packet/request-contract.ts`
- `server/routes/__tests__/defense-shadow-contracts.test.ts`
- `server/routes/__tests__/se-matrix-5xx-containment.test.ts`
- `server/routes/__tests__/defense-shadow-binding.dbtest.ts`
- `tests/db/wave3-critical-history.dbtest.ts`

No source file for either critical history writer was edited by this child. The lead owns its source corrections and negative controls. Reproduction: supply the disposable owner URL via TEST_DATABASE_URL, the verified-TLS non-superuser runtime URL via APP_DATABASE_URL, RLS_ENFORCE=on, and the established synthetic AUDIT_HMAC_KEY/AUDIT_HMAC_SECRET; then run Node 22 Vitest with `--config vitest.db.config.ts tests/db/wave3-critical-history.dbtest.ts`. The task-local runner above provides those existing values without exposing them.

Final current-source receipt: `wave3-route-proof/native-final.txt` contains all 35 cases in one run after the canonical 387-file replay (17 critical history and 18 Shadow including six final canonical-freshness cases). The earlier 16-case receipt remains the initial checkpoint. No immutable fixture history was removed between runs.
