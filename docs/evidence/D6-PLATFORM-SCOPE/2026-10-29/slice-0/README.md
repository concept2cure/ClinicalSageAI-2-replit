# P-72 slice 0: what stands on the session's platform arm today, measured

- **Launch row:** D6, tenant isolation.
- **Decision:** P-72 (`docs/LAUNCH_DEFINITION_OF_DONE.md`, "### P-72" and its amendment), designed in `docs/design/PLATFORM_SCOPE_AS_A_ROLE_2026-10-29.md`.
- **Dates:** 2026-10-29 to 30.
- **Scope:** measurement only. This slice changes no product code, migration or test. Everything below was run on private scratch databases.
- **Status:** measured, with the gaps listed in "Not measured". The export fix and the purge residue are the offboarding-custody lane's (P-58/P-59). This folder measures around them and does not change them.

## In short

- **The tenant export returns no Vault today.** In the route's system scope, 8 tables return none of the organization's rows: 4 Vault tables and 4 knowledge-graph tables. The organization's own scope (tenant id and org uuid) returns all of them, with no policy change and no door. Already handed to the custody lane, which now runs the export in that scope (`server/services/tenant-export/company-export-snapshot.ts`, `inOrganizationScope`).
- **Without the platform arm (P), the system scope sees no tenant row.** That holds for 854 of the 871 tables that hold rows. It does not depend on whether the owner is a superuser. The organization's own scope is unchanged by removing P, on every table.
- **Removing P breaks these, silently in most cases:**
  - 15 of 41 platform code paths (2 more differ only in side statements or timestamps);
  - every console list;
  - login and password reset (on an owner that is not a superuser);
  - **all 11** purge doors and the purge's DELETE loop. The design said 10, because it took the Vault door for one that already runs in the organization's own scope. It erases nothing without P.
- **Cannot run today.**
  - The retention sweep never reads a Vault document under its production scope.
  - The audit-chain integrity sweep cannot verify, with or without P.
  - deploy-migrate cannot pass `migrations/20260928_users_membership_rls.sql` (file 320 of 455) on an applier that is not a superuser. That is the RDS shape.
- **Role claim.** No assignable role or minting route produces `app_super_admin`. One route sends the token's claim, not the current membership, to the database. A scope whose role string is `app_super_admin` reads other tenants today, and can write the role onto its own membership.

## What already exists

Rule 3. This slice builds nothing. It measured these existing pieces, read at `769a43b68` and `86c90e66f` plus the working tree.

| Piece | Path | What it does today | What it does not |
|---|---|---|---|
| The platform scope | `server/db/tenantStore.ts:81` `runWithSystemTenantScope`; `server/middleware/establishRequestTenantScope.ts` (`SYSTEM_SCOPE_PREFIXES`, `establishRequestSystemScope`) | Sends tenant `'0'` and role `app_super_admin`. The P arm of 977 policies then admits every row. | It does not reach the Vault (no P arm there), the 4 knowledge-graph tables or 2 `regulatory_intel` tables. |
| The pool's per-statement scope | `server/db/poolInstrumentation.ts` (`tenantSetConfigSql`, `wrapClientForScope`) | Sets the scope LOCAL after BEGIN on a checked-out client. | It sets nothing for statements a checked-out client sends outside a transaction (item 1, the audit-chain sweep). |
| The tenant export | `server/routes/tenant-export.ts`; `services/tenant-export/tenant-full-export.service.ts` (`discoverTenantTables`, `exportTenantFull`); `company-export-snapshot.ts` | Discovers 872 tables and reads each with its own predicate. | In the system scope it returns 0 rows from the 8 tables above. |
| The purge | `server/services/tenant/tenant-offboarding.ts` (`purgeTenant`, `deleteTenantRows`, `PURGE_DOORS`, `PURGE_CHILD_TABLES`); `purge-held-doors.ts`; `migrations/20261029k_tenant_offboarding_custody.sql` (working tree) | 11 definer doors and a DELETE loop over 226 statements. | Without P it erases nothing and reports success (item 4). |
| The retention sweep | `server/jobs/retentionCron.ts:211` `runRetentionSweep` | Reads vault.documents, vault.retention_policies and vault.legal_holds in the system scope. | It never reads a Vault document there (item 3). |
| The pre-auth lookups | `user_id_for_email`, `user_id_for_reset_token` (`migrations/20260928_users_membership_rls.sql:96`, `:114`), `invitations_for_member` (`20260928_invitations_for_member.sql:78`), `actor_name` | Owner-owned definers. The first three enter P through a SET clause. | Without P, on an owner that is not a superuser, the first two return NULL. |
| The platform-staff trigger | `organization_users_staff_role_platform_only` (`migrations/20260926_organization_users_own_writes.sql`) | Refuses a staff role written from an ordinary tenant scope. | It decides by the two settings, so a session that sets the role string passes it. |
| The gates | `ci:session-scoped-rls-bypass` (`scripts/ci/check-session-scoped-rls-bypass.mjs`), `tests/db/no-session-rls-bypass.dbtest.ts` (P-70), `scripts/db/security-definer-allowlist.json` (46 entries) | Refuse the bypass settings P-70 removed. | They do not read `proconfig`, and they do not cover `app.rls_enforce` or `app.current_user_role` (the design's §4.4). |
| P-70's inventory method | `docs/evidence/D6-NO-SESSION-RLS-BYPASS/2026-10-29/probes.sql.txt`, `inventory.txt` | The live-catalog queries. | No proconfig, role-default or owner columns. `probes/00-inventory.sql.txt` adds them. |
| The catalog seeder | `tests/db/tenant-purge-row-seeder.ts` | Writes one row per table per organization from the catalog. Used here unchanged, with probe-only patches for uuid and text tenant keys. | |
| Operator scripts | `scripts/db/program-same-org-preflight.mjs`, `scripts/db-verify/verify-rls.ts` | See item 1, "Scripts". | |

**Searches run** (repository plus working tree):

- `runWithSystemTenantScope(`: 59 hits. 57 are calls, as the design counts. Two are comments: `services/billing.ts:717` and `securityHealth.ts:451`.
- `app_super_admin`, `current_user_role`, `rls_enforce`, `role: 'app_super_admin'` and `SYSTEM_SCOPE_PREFIXES`.
- `jwt.sign(`: every role written into a token.
- `req.user =` and `role: req.user`, `role: decoded.role`: every scope opened from a request role.
- Every writer of `organization_users` (`INSERT INTO`, `UPDATE`, `insert(organizationUsers)`, `update(organizationUsers)`), and `ASSIGNABLE_ORG_ROLES` and `VALID_ROLES`.
- Function `SET (app|c2c).` clauses in `migrations/` and `db/`.
- `PURGE_DOORS`, `HELD_RECORD_DOORS` and `purge_tenant_*`.
- Nothing that P-72 must not rebuild was found beyond the design's own list.

## Method

- **Server.** PostgreSQL 16.15 with pgvector, a private cluster on `127.0.0.1:55472` (`probes/pgstart.sh.txt`). It is not the custody lane's cluster.
  - PostgreSQL 15, production's major version, was not available. apt.postgresql.org and ftp.postgresql.org are refused by the egress proxy, and a source build was denied by this session's permission policy as running code from outside.
  - The only 15-specific behaviour this matters for is the function SET-clause rule in item 1. It has existed since 15. Measured on 16 only.
- **Build.** install-fresh then deploy-migrate from the tree at `769a43b68` plus the working tree. Both exited 0, leaving 453 journal rows and 1233 policies (`build.txt`).
  - "Upgraded" means: the seeded database replayed by deploy-migrate at `86c90e66f` plus the working tree, after the custody lane changed `20261029k`. That gave 454 journal rows and 1229 policies.
- **Two tenants.** A = 7 (`p72-a`) and B = 8 (`p72-b`), each with an admin, a programme and Vault documents. One row per table per organization came from the catalog seeder, covering 861 of 872 export tables (`seed-two-tenants.txt`).
- **Three transforms, each on a fresh scratch copy:**
  - **RDS-shaped owner** (`probes/41-rds-shaped-owner.sql.txt`). Every object `postgres` owned is handed to `c2c_rds_master`: LOGIN, CREATEROLE, NOSUPERUSER, NOBYPASSRLS, as production's applier. FORCE then holds the owner and every owner-owned definer, as on RDS.
  - **Arm removed** (`probes/40-neutralise-p-arm.sql.txt`). Each of the 977 P disjuncts becomes `false` through ALTER POLICY, which keeps each oid. Function bodies and SET clauses are untouched. The session still sets the role; only the policies stop honouring it.
  - **Superuser owner.** The CI shape, kept for comparison.
- **The runtime role is app_service** (NOSUPERUSER, NOBYPASSRLS). Each probe writes the same LOCAL settings `poolInstrumentation` writes, or runs the server's own code on the instrumented pool.

## Results

### Catalog inventory

From `inventory.txt` (first build).

- **Policies:** 1233.
  - S arm: read by 1029, all in the `NULLIF(…) IS DISTINCT FROM 'on'` form (0 in the COALESCE form).
  - P arm: 977, all compared with `app_super_admin`. 52 policies have S only; 0 have P only.
  - Admitted only through S or P: 4 policies (`license_requests_platform_access`, and the three `platform_role_grants_platform_*` write policies).
- **Tables:** 1128 have RLS enabled. 1007 are FORCEd, and 967 of those carry P.
- **Functions reading either setting:** 15 in the body, and 3 more through the SET clause (`invitations_for_member`, `user_id_for_email`, `user_id_for_reset_token`). That makes 18, as the design said. P-70's query sees only the 15.
- `pg_db_role_setting`: 0 rows name either setting.
- **Allowlisted definers:** 27 of the 46 are owned by the owner role, not by a purger or door role. They are listed in the file.
- `c2c_platform_scope` and `c2c_rls_exempt_login` do not exist yet.

### Item 2 (F5): the tenant export

Files: `f5-export-gap-per-table.txt`, `f5-export-functions.txt`, `f5-export-vault-sql.txt`, `f5-export-uuid-keyed.txt`.

- **Method.** For each of the 879 reads (872 discovered tables, the organization row and the company envelope's six), the export's own SQL text was run as app_service inside the export's REPEATABLE READ transaction. It ran under the system scope, under the organization's own scope, and against the owner's count.
- **Lost under the system scope, for both tenants:**
  - vault.documents: 4/5 rows exist, 0/0 returned;
  - vault.document_catalog, vault.document_read_receipts, vault.evidence_citations: 1/1 exist, 0/0 returned;
  - citation_chains, knowledge_graph_nodes, knowledge_graph_edges, lumen_knowledge_graph_edges: 1/1 exist, 0/0 returned.
- **The own scope (tenant id and org uuid) returns every row.** Without the org uuid, the Vault tables still return 0.
- **Across organizations,** the own scope admits only the two deliberate open reads, `organizations` and `organization_users`. The export's predicate keeps those out of the file.
- **Function level:** `GET /full`, composed as the route does, returns totalRows 861 under the system scope against 872 under the own scope for A, and 860 against 872 for B. 0 tables failed to read.
- **Causes:**
  - The Vault policies decide through `core.can_access_program` and then `identity.current_org_id()`. That needs `app.current_org_id` to hold the organization's uuid. **No project member is needed.**
  - The 4 knowledge-graph policies read `app.current_tenant_id` alone and have no S or P arm. These are the "stricter" policies the sweep's heal pass leaves alone.

### Item 1: which platform paths depend on P

**Table level** (`item1-table-visibility.txt`). This counts every RLS table as app_service in the system scope, on four copies: superuser or RDS-shaped owner, each with P and without.

- **Hidden without P:** 854 tables, 1724 rows. The same on both owner shapes; the owner's shape changes no table's count.
- **Still seen without P:**
  - `organizations` and `organization_users` (open reads);
  - organization-less reference rows in `cortex.confidence_triggers`, `innovation.guardrail_rules`, `innovation.readiness_criteria`, `innovation.workspace_roles` and `intelligent_docs.compliance_rules`;
  - most of `cmc_workflows` (12 of 14) and `cre_evidence_sources` (156 of 158).
- **Already blind with P:** the 8 export tables, plus `regulatory_intel.crl_trigger_patterns` (9 rows) and `rtf_trigger_patterns` (7 rows).
- **Tenant A's own scope gives identical counts** with P on the superuser copy and without P on the RDS-shaped copy (0 tables differ). So moving a path to its organization's own scope can be done before P is removed, and widens nothing.

**Paths** (`item1-paths-diff.txt`, with the raw captures `item1-paths-capture-*.jsonl.txt` and the data in `item1-path-data.txt`). Each entry point behind the 57 call sites was run with its own code on the instrumented pool, plus the explicit `app_super_admin` scopes and the startup probes: 41 in all. Every statement was captured, on the RDS-shaped copy with P and without. 17 behave differently; in 15 the outcome itself changes (the last two rows differ only in side statements or timestamps):

| Path (call site) | With P | Without P |
|---|---|---|
| Security-event audit (`middleware/enterprise-security.ts:987`, `auditService.ts:176`) | audit_logs row chained | audit_logs INSERT refused by RLS ("new row violates row-level security policy"); tamper-proof row only |
| `readLatestWindowResult` (organization A) (`db/scheduledOnce.ts:219`) | 1 row | 0 (null) |
| Task-due sweep (`jobs/taskDueSweep.ts:155`) | scanned 2, overdue notified 2 | scanned 0 |
| Drift sentinel (`jobs/driftSentinelSweep.ts:54`) | 2 programs, 2 drifts | 0 |
| CSR queue recovery (`jobs/csrQueueRecovery.ts:37`) | found 4 | found 0 |
| Report sweep (`report-os/scheduling/worker.ts:119`) | scanned 2 | 0 |
| Session-end stop (`ana/run-control.ts:1359`) | 1 run stopped | 0 |
| Run-control poll (`run-control.ts:1846`, `:1890`) | 2 rows | 0 |
| Orphan reaper (`run-control.ts:1533`) | 1 reaped | 0 |
| Chain monitor (`audit/chainIntegrityMonitor.ts:318`) | healthy over 2 entries | "unverified, no entries" |
| Expired-proposal sweep (`ana/submission-chat-sweep-scheduler.ts:57`) | 2 expired | 0 |
| IVDR pack claim (`workers/ivdr-pack-worker.ts:695`) | organization 7's job claimed | none |
| `verifyTenantChainOnAdminScope` (`audit/tenant-chain-verdict.ts:80`) | ok, rowsChecked 2 | **ok, rowsChecked 0** |
| `verifyTenantSealsOnAdminScope` (`audit/compliance-reports/integrity-checks.ts:38`) | valid, sealedRows 2 | **valid, sealedRows 0** |
| Retention sweep (`jobs/retentionCron.ts:212`) | legal holds read: 1 | 0. Scanned 0 in both (item 3) |
| Vault processing (`jobs/vaultProcessingSweep.ts:230`) | same result | same result; it already loops per organization in its own scope, so only side statements differ |
| Memory consolidation (`memory-consolidation-job.ts:110`) | no data to process | no data to process; results differ only by timestamps |

The other 24 are identical:

- the startup and catalog probes (`index.ts:170`, `lib/startup-invariants.ts:144`, `startup/authoringAuthorizationInvariant.ts:42`, `startup/audit-enforcement.ts:215`);
- the boot-time seed writers (`ana-capability-registry.ts:653`, `:719`, `intelligence/template-seeds.ts:692`, `featureToggleService.ts:327`). Their tables carry no tenant policy, so they suit the infrastructure scope;
- the feature-toggle reads; `embedding-corpus-policy.ts:380`, `:399`; the scheduled-once lease;
- organization-0 `session_activity` (`session-inactivity.ts:226`, admitted by the tenant arm, confirming the design's finding 8);
- Stripe's `stripe_events` (no RLS).

Inconclusive:

- digest idempotency: the probe's clock put the second window after the first tick;
- the gateway ledger write: the probe's request id was not a uuid;
- Bull schedules: no Redis;
- the owned-run heartbeat: no owned runs.

**The audit-chain integrity sweep cannot verify today, with or without P** (`jobs/auditChainIntegritySweep.ts:595`). Its `pool.connect()` client sends statements outside a transaction, and the pool sets no scope for those. `connectionIsTenantScoped` (`services/audit/chain.ts:708`) then reports "scoped to one tenant", and the sweep returns ok:false with 0 rows checked.

**Console** (`item1-console.txt`). The console's own SQL texts, on the RDS-shaped copy:

| Read | With P | Without P |
|---|---|---|
| `master-admin.ts:215` organization list | enabled modules 2, credits 1 per tenant | 0 and 0. Member counts stay 1, because `organization_users` is open |
| `access-management.ts:60` platform role grants | 1 | 0 |
| `master-enterprise-requests.ts:73` licence requests | 1 | 0 |
| `audit-siem.ts:133` B's audit events | 1 | 0 |
| `scim-tenants.ts:103` SCIM tenants | 2 | 0 |
| Platform grant INSERT … SELECT | 1 row | 0 rows, no error |

Every one fails silently.

**Pre-auth** (`item1-preauth.txt`):

- With the RDS-shaped owner and no P, `user_id_for_email` and `user_id_for_reset_token` return NULL. **Sign-in and password reset break.**
- On the superuser-owned copy they still work, so CI cannot show it.
- `invitations_for_member` and `actor_name` keep working in a tenant scope, through the tenant arm.

**Deploy and seeds** (`item1-deploy-replay.txt`):

- **Replay without P is green on the superuser applier.** The replay puts P back on 70 of the 977 policies, and the other 907 stay converted. The 70 are the creators that drop and re-create (55 `tenant_isolation_policy`, the D3 2026-09-2x family, 7 in clinical_ops, 1 in vault). This is the design's §4.1 point, counted.
- **On a non-superuser applier** (`c2c_rds_master`, owning everything), the replay halts:
  - first at `db/migrations/20260617_audit_logs_immutability.sql`, because the applier is not a member of `audit_archiver`. That is an artifact of this copy: the roles were created by `postgres`;
  - then, once the applier holds the door roles WITH ADMIN, at **`migrations/20260928_users_membership_rls.sql` (file 320 of 455)**: "permission denied to set parameter app.current_user_role".
- **Isolated:** a non-superuser cannot create a function whose SET clause names any custom setting. `SET app.p72_unrelated = 'x'` is refused too. The three SET clauses above are the only ones in `migrations/` and `db/`. Whether RDS's `rds_superuser` can create them is not established.
- This is a D1 risk. P-72 deletes these clauses anyway (design §3.5).

**Scripts** (`item1-scripts.txt`):

- `program-same-org-preflight.mjs` depends on S, not P. It is clean as the superuser owner. As the RDS-shaped owner it refuses `vault.documents` (exit 2), as P-70 recorded.
- `verify-rls.ts` never reaches its super-admin case: its fixture INSERT into `organizations` fails on `slug NOT NULL`. 4 checks pass and 3 fail, with P and without. It cannot assert the bypass today.

### Item 3: the retention sweep's Vault read

- Two expired Vault documents exist, one per tenant. A's is under a programme hold; B's hold was lifted with attribution.
- The production-shaped run **with P** scanned 0. vault.documents decides through `core.can_access_program`, and that is false for tenant `'0'` with no org uuid.
- The sweep has never read a Vault document under its production scope, so the Vault's retention has not run on a production-shaped database. Without P it also stops seeing legal holds (1 to 0).
- The design's finding 4 is confirmed.

### Item 4: the purge doors

Files: `item4-purge-summary.txt`, `item4-purge-*.json.txt`, `item4-purge-data.txt` and `item4-hold-precondition.txt`.

- **Method.** Organization B is pending deletion, its hold is lifted and its export custody is signed, all as the doors' own preconditions define it. The purge's erasure was run as `deleteTenantRows` issues it: 11 doors and 226 DELETE statements, in one transaction, as app_service, with each statement behind a savepoint. Organization A is the control.

| Run | Doors | DELETE loop | B's rows left (252 in 240 tables before) |
|---|---|---|---|
| RDS owner, P, system scope (**today**) | all 11 erase | 213 tables matched, 217 rows | 14 in 10 tables: **the 4 knowledge-graph tables** (the custody lane's residue, confirmed) plus 6 held up by keys in the seed |
| RDS owner, no P, system scope | 9 return zero counts as success; `purge_tenant_vault_records` erases nothing; `purge_tenant_source_read_receipts` refuses ("not pending deletion": its `FOR SHARE` on organizations needs the update policy) | 0 rows matched, **no error** | 252 in 240 |
| Superuser owner, no P, system scope (CI) | the same, except the two owner-owned doors (`vault_records`, `vault_seals`) still erase | 0 | 246 in 238 |
| RDS owner, no P, B's own scope, no role | all 11 refuse (their settings test) | 210 tables matched, 214 rows; 12 errors: 10 key or immutability errors on rows the refused doors left in place, and 2 refusals by the setting-reading company design and revision triggers | 38 in 30 |
| RDS owner, no P, B's own scope, settings test satisfied | **all 11 erase** | 217 tables matched, 221 rows | 10 in 6 tables: only the key chain held up by seed rows. **The 4 knowledge-graph tables are erased.** |

- A's rows changed in no run.
- **So all 11 doors and the loop depend on P on production's owner shape, not 10.** `purge_tenant_vault_records` sets `app.current_org_id` but leaves the tenant id at `'0'`. Without P, `regulatory_programs` (FORCEd, keyed by tenant id) then hides B's programme, both from the Vault policy's programme-to-organization lookup and from the door's own subquery.
- The CI shape hides this for the two owner-owned doors.
- In the organization's own scope with both tenant id and org uuid set, every door and every table erases, including the 4 knowledge-graph tables that survive today.
- **The legal-hold precondition also depends on P.** With an active hold on B, the system scope sees 0 holds without P, and the door's precondition passes silently. With P it refuses ("1 active legal hold").

The 5 key and immutability errors left in the P run and in the satisfied own-scope run are artifacts of the seed:

- `electronic_signatures`' custody row names a document version, through an optional key the seeder filled;
- one reference row of `cre_evidence_sources` names B's programme.

### Item 5: the JWT role-claim path

Files: `item5-jwt-claim-path.txt` (code, by line) and `item5-role-claim-db.txt` (database).

- Every authenticator except one replaces the token's claim with the membership row's role read on the request:
  - `server/auth.ts:296`;
  - `middleware/auth.ts` `applyOrganizationRole`;
  - `middleware/tenantContext.ts:333`.
- **`server/routes/authoring.router.ts:238` keeps `decoded.role`.** `enforceOrgMembership` sets `organizationRole`, not `role`. Then `:8276` re-enters `runWithTenantScope({ role: req.user.role })`, so that upload's statements carry the token's claim, a copy of the role at sign-in.
- All 12 minting sites copy a membership role or a constant.
- No assignable role is `app_super_admin`: `ASSIGNABLE_ORG_ROLES`, SCIM `VALID_ROLES`, invitations through the same enum, SSO and SCIM provisioning (`member`), setup and signup (`admin`). `organization_users.role` has no CHECK.
- No layer between the request and the database refuses the literal.
- **In the database, with P (today):**
  - A tenant-A scope whose role string is `app_super_admin` reads B's `unified_tasks`, `audit_logs`, users and legal holds, and updates B's task.
  - That scope also writes `app_super_admin` onto A's own membership. The trigger `organization_users_staff_role_platform_only` reads the setting, so it allows it, and every later sign-in would mint the role.
  - An ordinary admin scope is refused.
- **Without P:** the cross-tenant reads stop, but the self-grant still succeeds, because the trigger reads the setting in its body.

## Where this contradicts or extends the design

1. **§3.3 and F5.**
   - No project member is needed for the Vault: the org uuid admits it.
   - The gap is 8 tables, not the Vault alone.
   - The organization's own scope fixes all 8 with no door, so `platform_export_vault_rows` is not needed.
2. **Finding 5 and §3.2.**
   - It is 11 of 11 doors, not 10. The Vault door's "own scope" sets only the org uuid. Slice 2's own scope must set the tenant id and the org uuid inside every door.
   - Two of the doors' preconditions also stand on P: `source_read_receipts`' `FOR SHARE` lock, and the legal-hold count every door reads.
3. **§3.6.** The audit-chain integrity sweep is already broken: its client sends statements outside a transaction with no scope. This is not a P-72 move; it is a defect to fix.
4. **Silent success.** Two verifiers report ok over zero rows once P is gone. The console, the purge and the jobs all return zeros without an error.
5. **§3.1 and §5.** The deploy halts on a non-superuser applier at the three function SET clauses. The design's non-superuser applier lane cannot go green until slice 1 removes them.
6. **Finding 3 and the amendment's defence-in-depth point.** The claim path is narrower than "unfiltered everywhere": there is one verbatim route. But the trigger that guards minting can itself be switched by the setting.
7. **Smaller points.**
   - 57 call sites, confirmed.
   - The design names its evidence `D6-PLATFORM-SCOPE-ROLE/`; this folder follows the slice brief (`D6-PLATFORM-SCOPE/`).
   - The design asked for PostgreSQL 15 from blank and upgraded. This is 16.15 only, from blank, and one upgrade by replay.

## What slice 1 must therefore do first

1. **Delete the three function SET clauses** (`user_id_for_email`, `user_id_for_reset_token`, `invitations_for_member`), re-owning them by the platform role. Without this:
   - deploy-migrate cannot pass file 320 on a non-superuser applier;
   - removing P breaks sign-in on RDS.
2. **Move these to the organization's own scope (tenant id and org uuid) before any arm changes.** The measurement shows the own scope admits each tenant's rows on every table, with or without P.
   - the export (the custody lane, landing);
   - the retention sweep, as a per-organization loop. It has never run against the Vault in production, independent of P-72;
   - the purge doors and loop, with the tenant id set inside the Vault door (the custody lane's files);
   - the 17 paths in the table above.
3. **Make verification fail when it verified nothing** (the chain, seal and monitor verdicts), and fix the audit-chain sweep's connection scope. This must happen before P goes, so the removal cannot turn them silently green.
4. **Send the membership role, not the token's claim**, from `authoring.router.ts:8276`, and refuse `app_super_admin` from every per-user scope.
   - In slice 5, `organization_users_staff_role_platform_only` decides by `CURRENT_USER`, not by the setting.
5. **Only then add P' and S' beside P and S** (the design's slice 1 proper). The non-superuser applier lane can go green once step 1 has landed.

## Not measured, and why

- **PostgreSQL 15.** Not obtainable here; see Method. The SET-clause rule is 15+ by its release notes and was measured on 16.
- **A real upgrade from an older deployed version.** Only a replay of the seeded database at the current tree was measured.
- **Seeding gaps.** 11 of 872 export tables could not be seeded, because the seeder cannot satisfy their CHECKs (listed in `f5-export-gap-per-table.txt`). Every one has a SELECT policy with the P arm. The platform tables `platform_role_grants` and `license_requests` were seeded by hand (`probes/91-console-data.sql.txt`).
- **Not run:**
  - the 4 inconclusive paths above;
  - the SSO and SCIM routers and webhooks, by route;
  - `purgeTenant` itself: it is being changed by the custody lane, so its erasure was run as `deleteTenantRows` issues it.

## Reproduce

1. Use `probes/env.sh.txt`, `pgstart.sh.txt` and `build-db.sh.txt` (copied from the custody lane's, with their own port).
2. Seed with probes 10 and 30–34.
3. Transform with 41, then 40.
4. Run the probes in number order. 50 and 61 are run once per copy; 44, 52 and 62 summarise.

Each probe states its own scope and copy in its header.
