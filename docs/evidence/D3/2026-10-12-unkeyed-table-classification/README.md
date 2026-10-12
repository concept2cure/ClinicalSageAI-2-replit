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
