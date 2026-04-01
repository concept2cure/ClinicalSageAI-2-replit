# Database / Query Layer Performance Audit

**Date**: March 31, 2026
**Scope**: `server/db.ts`, `server/routes/concept2cure.ts`, `server/routes/authoring.router.ts`, `server/services/**`
**ORM**: Drizzle ORM (node-postgres driver)

---

## 1. Pool Configuration (`server/db.ts`)

| Setting                               | Value                       | Assessment                                 |
| ------------------------------------- | --------------------------- | ------------------------------------------ |
| `max` (production)                    | **40**                      | ✅ Reasonable for 100–200 concurrent users |
| `max` (development)                   | **20**                      | ✅ Good                                    |
| `idleTimeoutMillis`                   | **30 000** (30s)            | ✅ Good (balanced for bursty traffic)      |
| `connectionTimeoutMillis`             | **5 000** (5s)              | ✅ Fail-fast                               |
| `statement_timeout`                   | **30 000** (30s)            | ✅ Kills runaway queries                   |
| `idle_in_transaction_session_timeout` | **60 000** (60s)            | ✅ Prevents abandoned txns                 |
| `allowExitOnIdle`                     | `!isProduction`             | ✅ Dev-only                                |
| SSL                                   | `getSslConfig(databaseUrl)` | ✅ Dynamic                                 |
| **Prepared statement caching**        | **NONE**                    | ⚠️ Every query is re-parsed                |
| **Connection retry**                  | 3 retries, 3s delay         | ✅ Good                                    |

### Missing

- **No prepared statement caching**: Drizzle + node-postgres parse every query from scratch. For hot queries (artifact lookups, project access checks), this adds ~1–2ms CPU per call. Drizzle supports `.prepare()` but it's unused anywhere in the codebase (0 hits for `.prepare(` in server/).
- **No connection warm-up**: Pool starts empty, first requests hit cold-connect latency (~50–100ms to Neon).

---

## 2. Connection Pool Monitoring

✅ **EXISTS** — Two endpoints expose pool stats:

| Endpoint                                             | Metrics                                            | Format     |
| ---------------------------------------------------- | -------------------------------------------------- | ---------- |
| `GET /api/metrics` (server/index.ts L443)            | `db_pool_total`, `db_pool_idle`, `db_pool_waiting` | Prometheus |
| `GET /api/health/deep` (server/routes/health.ts L96) | `connections`, `waiting`                           | JSON       |

---

## 3. Top N+1 Query Patterns (Worst 5)

### #1 — CRITICAL: Overdue Thread Escalation (concept2cure.ts L13828–13870)

```
for (const thread of overdueThreads) {         // unbounded
  const [existing] = await db.select()...       // SELECT per thread
  await db.insert(notifications).values(...)    // INSERT per thread
}
```

**Impact**: 2 queries × N overdue threads. No limit on overdue count. No transaction wrapping.
**Fix**: Batch SELECT via `inArray()`, then batch INSERT with `db.insert().values([...])`.

### #2 — CRITICAL: Overdue Task Escalation (concept2cure.ts L13899–13940)

```
for (const task of overdueTasks) {              // unbounded
  const [existing] = await db.select()...       // SELECT per task
  await db.insert(notifications).values(...)    // INSERT per task
}
```

**Impact**: Identical pattern to #1. 2 queries × N overdue tasks.
**Fix**: Same batch approach.

### #3 — HIGH: Cross-Reference Validation (concept2cure.ts L4216–4241)

```
for (const ref of references.slice(0, 50)) {
  const result = await pool.query(
    `SELECT id, title FROM concept2cure_artifacts WHERE ...`
  )                                             // 1 query per reference
}
```

**Impact**: Up to 50 sequential DB queries per validation request.
**Fix**: Collect all `targetSection` values, issue one query with `WHERE title ILIKE ANY(...)` or batch `IN (...)`.

### #4 — HIGH: Review Assignment (concept2cure.ts L7699–7730)

```
for (const reviewerId of numericIds) {
  const [inserted] = await db.insert(reviewAssignments).values({...}).returning()
}
```

**Impact**: N INSERT statements (one per reviewer). **No transaction wrapper** — partial assignment if one fails.
**Fix**: Wrap in `db.transaction()` and use `db.insert().values([...array])` for single round-trip.

### #5 — HIGH: Citation Persistence (concept2cure.ts L3132–3180)

```
for (const link of citLinks) {
  await pool.query(`INSERT INTO ai_claim_citations ...`)   // per citation link
}
// ...later...
for (const cit of sourceCitationResults) {
  await pool.query(`INSERT INTO source_citations ...`)     // per citation
}
```

**Impact**: Up to (claims × citations) sequential INSERTs.
**Fix**: Use multi-row INSERT (`VALUES ($1...), ($2...), ...`) or Drizzle batch insert.

### Honorable Mentions

| Location     | Pattern                        | Max N     | Notes                                        |
| ------------ | ------------------------------ | --------- | -------------------------------------------- |
| L13965–14010 | Due-soon notification creation | unbounded | `createNotification()` per thread + per task |
| L1612–1680   | Section bootstrap INSERTs      | ~50       | ✅ Wrapped in transaction, but still serial  |
| L11820       | Thread reply notifications     | 2 max     | Low impact — only 2 targets                  |

---

## 4. `db.select().from(` — Missing Column Projections

**Total count: 29 occurrences** (21 in routes, 8 in services)

These SELECT \* queries fetch all columns even when only a few are needed:

| File                          | Line          | Table                          | Assessment                                                                                        |
| ----------------------------- | ------------- | ------------------------------ | ------------------------------------------------------------------------------------------------- |
| concept2cure.ts               | 1180          | `concept2cureArtifacts`        | ⚠️ HOT PATH — used by `getArtifactsFromDb()`, called from multiple routes. Fetches content blobs. |
| concept2cure.ts               | 1197          | `concept2cureArtifactVersions` | ⚠️ HOT PATH — fetches ALL version content for ALL artifacts in project                            |
| concept2cure.ts               | 10285         | `projectTasks`                 | ⚠️ List route — all columns for up to 500 tasks                                                   |
| concept2cure.ts               | 10325, 10413  | `projects`                     | Low risk — single row by PK                                                                       |
| projects-management.ts        | 118, 308, 389 | `projects`                     | Low risk — single row by PK                                                                       |
| tenants.ts                    | 70            | `organizations`                | ⚠️ ALL tenants, ALL columns, no limit                                                             |
| knowledge-base.ts             | 1076          | `cmcProjects`                  | Low risk — single row                                                                             |
| supplyChain.routes.ts         | 276, 585      | batches, deviations            | Low risk — single row                                                                             |
| authoring-actions.ts          | 516, 621      | `concept2cureArtifacts`        | Medium risk — artifact content blob                                                               |
| client-intelligence-memory.ts | 1176, 1194    | memory entries, documents      | Medium — could be large                                                                           |
| data-lineage-service.ts       | 443, 587, 588 | lineage records                | Medium — no limit                                                                                 |

### Worst Offender: `getArtifactsFromDb()` (L1179–1240)

This function is called from `/projects/:projectId/artifacts` (a frequently-hit list endpoint).
It runs **two unbounded SELECT \*** queries:

1. All artifact rows (including full `content` blobs)
2. All version rows for those artifacts (including full version `content`)

For a project with 50 artifacts × 10 versions each = fetching 500 full content blobs unnecessarily.

---

## 5. Missing `.limit()` on List/Collection Queries

| File                    | Line  | Query                             | Risk                                                                                  |
| ----------------------- | ----- | --------------------------------- | ------------------------------------------------------------------------------------- |
| concept2cure.ts         | 1180  | `getArtifactsFromDb` — artifacts  | **HIGH** — no limit, fetches all artifacts + content                                  |
| concept2cure.ts         | 1197  | `getArtifactsFromDb` — versions   | **HIGH** — no limit, fetches all versions + content                                   |
| concept2cure.ts         | 4800  | `/projects/all/artifacts-summary` | **MEDIUM** — all artifacts for org (only `status` column projected ✅, but unbounded) |
| concept2cure.ts         | 13828 | overdue threads escalation        | **MEDIUM** — unbounded SELECT for escalation processing                               |
| concept2cure.ts         | 13899 | overdue tasks escalation          | **MEDIUM** — same                                                                     |
| concept2cure.ts         | 13965 | due-soon threads                  | **MEDIUM** — same                                                                     |
| tenants.ts              | 70    | `db.select().from(organizations)` | **LOW** — admin-only, but no limit                                                    |
| data-lineage-service.ts | 443   | lineage records                   | **MEDIUM** — no limit on lineage query                                                |

### Note: Some queries correctly have limits

- Task list (L10285): `.limit(500)` ✅
- Auth user lookups: `.limit(1)` ✅
- Most single-entity lookups: `.limit(1)` ✅

---

## 6. Transaction Gaps

**17 `db.transaction()` calls found** — good coverage in services. But these write loops lack transactions:

| Location                     | Operation                              | Risk                                                 |
| ---------------------------- | -------------------------------------- | ---------------------------------------------------- |
| concept2cure.ts L7699        | Review assignment INSERTs              | **HIGH** — partial assignment on failure             |
| concept2cure.ts L3132–3180   | ai_claims + ai_claim_citations INSERTs | **MEDIUM** — orphan claims if citations fail         |
| concept2cure.ts L13828–14010 | Escalation/notification creation       | **LOW** — duplicate notifications are idempotent-ish |
| concept2cure.ts L11820       | Thread reply notifications             | **LOW** — only 2 targets                             |

---

## 7. Recommendations (Priority Order)

### P0 — Critical (Fix This Week)

1. **Batch the escalation/notification N+1 loops** (L13828–14010)

   - Fetch all existing notifications in one `inArray()` query
   - Collect all new notifications into an array
   - Single `db.insert().values([...all])` call
   - Wrap in a transaction

2. **Batch cross-reference validation** (L4216)

   - Collect all target sections, issue one `WHERE ... IN (...)` query
   - Map results back to references client-side

3. **Wrap review assignments in a transaction** (L7699)
   ```typescript
   await db.transaction(async tx => {
     await tx.insert(reviewAssignments).values(allValues).returning();
   });
   ```

### P1 — High (Fix This Sprint)

4. **Add column projections to `getArtifactsFromDb()`** (L1179)

   - Select only needed columns (exclude `content` for list views)
   - Add `.limit(500)` safety cap
   - Consider pagination for `/projects/:projectId/artifacts`

5. **Add `.limit()` to all collection queries**

   - `organizations` table (tenants.ts L70): add `.limit(1000)`
   - `dataLineageRecords` queries: add `.limit(500)`
   - Escalation queries: add `.limit(200)` to bound processing

6. **Batch citation persistence** (L3132–3180)
   - Multi-row INSERT for `ai_claim_citations` and `source_citations`

### P2 — Medium (Track in Backlog)

7. **Introduce Drizzle prepared statements** for hot queries

   - `getArtifactsFromDb` (called on every artifact list view)
   - `verifyProjectAccess` (called on ~80% of routes)
   - User lookup by email (auth routes)

   ```typescript
   const getArtifacts = db.select({...}).from(artifacts).where(...).prepare('get_artifacts');
   ```

8. **Add connection pool warm-up** to `server/db.ts`

   - Pre-create 5 connections on startup:

   ```typescript
   pool.on('connect', () => {
     /* logged already */
   });
   // Warm up: issue N parallel SELECT 1
   await Promise.all(
     Array(5)
       .fill(null)
       .map(() => pool.query('SELECT 1'))
   );
   ```

9. **Convert in-app filtering to SQL WHERE clauses** (L10285–10300)

   - Task list fetches 500 rows then filters by status/priority in JS
   - Push `status`/`priority`/`category` filters into the SQL query

10. **Add slow-query logging**
    - Hook `pool.on('query')` or use pg `log_min_duration_statement`
    - Log queries exceeding 500ms

---

## Summary Dashboard

| Metric                         | Value                                  |
| ------------------------------ | -------------------------------------- |
| **Pool max (prod)**            | 40                                     |
| **Pool idle timeout**          | 30s                                    |
| **Statement timeout**          | 30s                                    |
| **Prepared statements**        | 0 (none)                               |
| **Pool monitoring**            | ✅ `/api/metrics` + `/api/health/deep` |
| **N+1 patterns found**         | **7** (3 critical, 2 high, 2 medium)   |
| **`SELECT *` (no projection)** | **29** occurrences                     |
| **Missing `.limit()`**         | **8** collection queries               |
| **Transaction gaps**           | **4** write loops without tx           |
| **`db.transaction()` usage**   | 17 call sites ✅                       |
