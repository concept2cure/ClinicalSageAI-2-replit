# D3 — 19 of the 96 unreviewed unkeyed tables classified, by citation not judgement

`ci:unkeyed-request-tables:unreviewed` is the gate CI's own comment calls the
reachable one, and the one that mattered:

> `:unreviewed` is "every table that lacks [a tenant key] has at least been
> CLASSIFIED global / derived / exempt" — which is reachable much sooner and is
> **the one that would have caught the 2026-09-10 disclosures, because all
> three would have sat in that baseline unclassified.**

The baseline's own header says the same: *"'unreviewed' is a DEFECT awaiting
triage, not a category."* It stood at **96**.

## What made 19 of them answerable without a judgement call

`db/migrations/20260813_child_table_parent_scoped_rls.sql` holds a spec list of
`[child, fk column, parent, parent key, parent tenant column]`, and its own
comment says where the list comes from: *"Derived from pg_constraint against
the provisioned schema, not hand-typed."* For each entry it creates
`tenant_isolation_policy` `FOR ALL` with `FORCE ROW LEVEL SECURITY`, admitting
a row only where the parent's tenant column matches `app.current_org_id`.

So a table in that spec is not an un-policed table that happens to lack a
tenant column. It is a child whose tenant is its parent's, with an enforced
policy saying so. **`derived` is a citation for those, not an opinion** — which
is why this tranche could be done at the bar the nine existing reviewed entries
set (creating migration, key chain, reading path) without guessing at any of
them.

The 19, each with the key chain now recorded in the baseline:

| table | keyed through | to | tenant |
|---|---|---|---|
| `ai_generation_runs` | `thread_id` | `ai_threads.id` | `organization_id` |
| `ai_messages` | `thread_id` | `ai_threads.id` | `organization_id` |
| `ai_retrieval_chunks` | `retrieval_run_id` | `ai_retrieval_runs.id` | `organization_id` |
| `approval_checkpoints` | `workflow_run_id` | `workflow_runs.id` | `organization_id` |
| `c2c_correspondence_issues` | `correspondence_id` | `c2c_correspondence.id` | `organization_id` |
| `c2c_document_sections` | `document_id` | `c2c_documents.id` | `org_id` |
| `c2c_milestone_sections` | `milestone_db_id` | `c2c_milestones.id` | `org_id` |
| `chat_messages` | `thread_id` | `chat_threads.id` | `organization_id` |
| `ctd_nonclinical_studies` | `program_id` | `ctd_programs.id` | `organization_id` |
| `document_audit_logs` | `document_id` | `unified_documents.id` | `organization_id` |
| `embedding_audit_log` | `atom_id` | `lumen_data_atoms.id` | `organization_id` |
| `lumen_atom_citations` | `atom_id` | `lumen_data_atoms.id` | `organization_id` |
| `lumen_atom_conflicts` | `atom_a_id` | `lumen_data_atoms.id` | `organization_id` |
| `lumen_atom_quality_scores` | `atom_id` | `lumen_data_atoms.id` | `organization_id` |
| `lumen_atom_versions` | `atom_id` | `lumen_data_atoms.id` | `organization_id` |
| `pdev_program_activities` | `program_id` | `regulatory_programs.id` | `organization_id` |
| `pdev_readiness_snapshots` | `program_id` | `regulatory_programs.id` | `organization_id` |
| `program_milestones` | `program_id` | `regulatory_programs.id` | `organization_id` |
| `vigilance_events` | `program_id` (text, no FK) | `regulatory_programs.id` | `organization_id` |

`vigilance_events` is recorded with its own clause: it belongs to that file's
TEXT-program-id class (ledger L201, 2026-09-24), where the key names a
`regulatory_programs` row by text with no foreign key and the keys are compared
as text.

## Measured, not asserted

Reading a spec file proves what a migration intends. `measured.txt` reads the
result out of a **deploy-shaped database** (`c2c_dbtest`, installed by
`install-fresh.mjs` + `deploy-migrate.mjs`; 953 `tenant_isolation_policy` rows
in all): every one of the 19 comes back `policy | rls | forced`.

That the predicate actually isolates is **already proven and is not re-proven
here** — `tests/db/child-table-parent-scoped-rls.dbtest.ts` does it against a
real engine as a NON-superuser, which is the only posture in which the question
means anything ("a SUPERUSER bypasses RLS unconditionally … so asserting
isolation from a superuser connection is a test that can only mislead"). Citing
it is the zero-duplication answer.

## Result

`ci:unkeyed-request-tables:unreviewed` **96 → 77**. The per-PR sibling
`ci:unkeyed-request-tables` still passes, and the gate's own selftest still
reports "the gate fails on the case it exists to catch, and only on that case".

**The remaining 77 need one reason each (WO-13).** None of them is in the
parent-scoped spec, so none can be answered by citation — each needs its DDL,
its per-request reader and a decision. The method this tranche used is written
down here so the next session starts from the citation set rather than from
scratch: intersect the baseline's `unreviewed` entries with the spec list in
`20260813_child_table_parent_scoped_rls.sql` first, then work the remainder by
hand.

---

# Second pass: all 105 decided, and what the sweep found on the way

`ci:unkeyed-request-tables:unreviewed` is at **zero**. Three of the eight
nightly zero-baseline gates now pass (`tenant-isolation`, `proof-tier`,
`unkeyed-request-tables:unreviewed`), where one did this morning.

## How each of the 105 was decided, and on what authority

| how | n | authority |
|---|---|---|
| citation, single-level RLS spec | 19 | `20260813_child_table_parent_scoped_rls.sql` specs list, machine-derived from `pg_constraint` |
| citation, chained (grandchild) spec | 5 | the same file's `chained` list (ledger L202/L203) |
| read back off a live deploy-shaped database | 12 | `pg_policies` / `information_schema` on `c2c_dbtest` |
| reachability sweep + DDL + the reading statement | 57 | the sweep below |
| already reviewed before today | 9 | prior sessions |
| **not decided** | **0** | |

**4 of the 12 live-verified entries do not belong in this baseline at all.**
`knowledge_graph_edges`, `knowledge_graph_nodes`, `lumen_knowledge_graph_edges`
and `regulatory_twin_simulations` each carry `organization_id` **and**
`tenant_isolation_policy` on a deploy-shaped database. They are listed because
**the gate reads the creating migration and not a later `ALTER`**, so a tenant
column added afterwards reads as absent. That is a gate blind spot, recorded in
each entry; `regulatory_harmonization.audit_log` is a second shape of the same
problem — it carries `user_organization`, a tenant-ish column under a name
outside the gate's four canonical ones.

## The sweep, and the one thing it found

For each of the final 57: every reader under `server/`, which of those are
router files that `server/bootstrap/*` and `server/startup/*` **actually
mount**, and whether any such mounted reader contains no tenant key at all.

Three candidates came back. Two are the same production-fenced test harness
(`assembly_docs`, `assembly_audit_logs` → `server/routes/test-assembly.ts`,
mounted only under `testRoutesEnabled`, which `startup/env.ts:20-24` records as
*"Fenced OFF in production by default"*). One was a false match: `templates`'
other candidate, `ana-cortex-ft.ts`, does not query that table — the grep hit
the word in another context.

**And one real exposure, found before the sweep and fixed:** `citation_chains`,
read by `GET /api/graphrag/citation-trace/:documentId` with the request path
parameter as the anchor, on a table with no tenant column, RLS off and zero
policies, behind `authenticateToken` alone. Full account and fix:
`docs/evidence/D3/2026-10-12-graphrag-citation-trace/`. That is a fourth
instance of the class the baseline's header warns about, and it was sitting here
as "unreviewed" — which is the case for working this gate rather than carrying
it.

## Three findings recorded rather than fixed

- **`capa_records` and `q_submissions`** are the TEXT-program-id shape and are
  **not** in the parent-scoped spec, so their isolation rests on the reading
  route's join rather than on a policy. Adding them to that spec is the
  structural fix.
- **`compliance.access_controls` / `compliance.data_integrity_checks`** —
  `cortexComplianceService.ts` names `org_id, user_id, permission, granted_by,
  expires_at`; the live table has **none** of them, so every statement fails
  42703. This is exactly the class WO-14 documents for the Cortex family
  (*"the service names 27 columns the shape lacks, across six tables"*) and is
  two more tables for its table. WO-14 is open pending the founder's
  Route A / Route B decision.
- **`knowledge_documents`** — `sage-plus-service.ts` searches `content ILIKE`
  with no tenant predicate. Not reachable today: the only mounted entry into
  that module is `routes/health.ts`, which imports `healthCheck` alone. A
  latent risk, not a live one — but the day that search is mounted it must be
  org-scoped, as the `citation_chains` read beside it had to be.

`ci:unkeyed-request-tables:strict` — "no per-request table lacks a tenant key",
the end state rather than the triage — remains at 105 and is unaffected by this
work, which was always about deciding each one rather than re-keying them.

---

# Third pass: the two findings I had recorded rather than fixed are now fixed

The second pass left `capa_records` and `q_submissions` as findings — the
text-program-id shape, in no spec, isolated only by their reading routes' joins
— because adding a policy looked like it could silently empty two
customer-facing lists. **That caution was based on a wrong reading of the
policy, and measuring it settled the matter.**

## What I had wrong

Both tables' readers import the **shared** pool (`server/db/runtime.ts`), and
that pool sets no session scope — `applySessionScope` is called only from
`middleware/establishRequestTenantScope.ts` and `db/withTenantConnection.ts`.
I reasoned from that to "a policy would evaluate `app.current_org_id` on a
connection where it is unset and return zero rows", i.e. the CAPA list and the
Q-submission list would go empty.

Wrong, and the policy says so in its first arm:

```sql
NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
OR <the parent predicate>
```

On a connection with no GUCs, `app.rls_enforce` is empty, `NULLIF` gives NULL,
and `NULL IS DISTINCT FROM 'on'` is **true** — the policy admits every row. It
is inert exactly where the readers are unscoped, and binds exactly where a
request has established a scope. That is the platform's designed posture, and I
should have measured it before concluding.

## Measured, four cases, as a non-superuser

`measured.txt`, on `c2c_dbtest` as `app_service` — a superuser bypasses RLS
unconditionally and would prove nothing:

| case | rows visible | meaning |
|---|---|---|
| no GUCs set | **2** (both organisations) | inert — today's shared-pool readers unaffected |
| `rls_enforce=on`, no organisation | **0** | fail closed |
| `rls_enforce=on`, organisation A | **1** (A's only) | isolates |
| `rls_enforce=on`, organisation B | **1** (B's only) | isolates |

## The change

Both tables joined the spec list in
`db/migrations/20260813_child_table_parent_scoped_rls.sql` — its text-program-id
class — with a dated amendment note in the file, as RULE 1 requires of an
in-place amendment. The migration took the **text-comparison** path its own
2026-09-08 amendment added, announcing it:

> `WARNING: [child-rls] capa_records → regulatory_programs: key or tenant
> column type does not fit the integer-tenant predicate — policied by text
> comparison instead` … `NOTICE: capa_records scoped to
> regulatory_programs(organization_id)`

`ci:migration-set-order` and `ci:migration-drop-safety` both still pass at 374
migrations. Nothing was removed from that file.

`capa_records` was also already correct at the application level and had been
repaired once before: `routes/mdx-postmarket.ts` joins `regulatory_programs`
INNER and filters on `p.organization_id`, after a `LEFT JOIN` with
`OR p.organization_id IS NULL` had returned every orphaned CAPA to every
tenant. So this is defence in depth on that path, and the first line of defence
on `q_submissions`' five readers.
