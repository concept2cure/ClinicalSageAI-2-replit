# Next Agent Instructions — Continuation Playbook

> **Updated:** 2026-02-06 | **Status:** Phase 4 split into clean PRs

---

## Current State

### Open PRs (merge in order)

| PR                                                                       | Branch                        | Scope                                           | Status  |
| ------------------------------------------------------------------------ | ----------------------------- | ----------------------------------------------- | ------- |
| [#110](https://github.com/concept2cure/ClinicalSageAI-2-replit/pull/110) | `phase4/orchestration-schema` | Schema DDL only (6 tables, RLS, indexes, views) | 🟡 Open |
| [#112](https://github.com/concept2cure/ClinicalSageAI-2-replit/pull/112) | `phase4/orchestration-runner` | Runner + API + tests (no schema)                | 🟡 Open |
| [#113](https://github.com/concept2cure/ClinicalSageAI-2-replit/pull/113) | `phase4/orchestration-seeds`  | Seed workflow templates (no code)               | 🟡 Open |
| [#114](https://github.com/concept2cure/ClinicalSageAI-2-replit/pull/114) | `docs/roadmap-phase4`         | Roadmap docs + index (no runtime)               | 🟡 Open |

**Merge order:** #110 → #112 → #113 → #114 (schema first, then code, then data, then docs)

### What Has Been Built

| Component                                                         | Status | Location                                                 | PR   |
| ----------------------------------------------------------------- | ------ | -------------------------------------------------------- | ---- |
| Orchestration schema (6 tables, RLS, indexes, views)              | ✅     | `db/migrations/20260206_phase4_orchestration_kernel.sql` | #110 |
| SQL query module                                                  | ✅     | `shadow_service/shadow_service/sql_orchestration.py`     | #112 |
| Pydantic models                                                   | ✅     | `shadow_service/shadow_service/models_orchestration.py`  | #112 |
| Runner service (start, advance, claim, complete, fail, A8 bridge) | ✅     | `shadow_service/shadow_service/orchestration_runner.py`  | #112 |
| FastAPI router (9 endpoints)                                      | ✅     | `shadow_service/shadow_service/router_orchestration.py`  | #112 |
| Router registered in main.py                                      | ✅     | `shadow_service/shadow_service/main.py`                  | #112 |
| Unit tests                                                        | ✅     | `shadow_service/tests/test_orchestration.py`             | #112 |
| Seed workflow templates (IND Intake + DOCX Gen)                   | ✅     | `db/migrations/20260207_phase4_seed_templates.sql`       | #113 |
| Roadmap documentation                                             | ✅     | `docs/roadmap/`                                          | #114 |

### Base State

- **`main`** has all 6 prior PRs (#104-#109) merged
- All Phase 4 branches fork from `main` + schema commit

---

## What to Do Next

### Immediate: Merge Phase 4 PRs

1. Merge #110 (schema) — verify CI, merge
2. Rebase #112 onto updated main, fix any conflicts, merge
3. Rebase #113 onto updated main, merge
4. Merge #114 (docs — no conflicts expected)

### Phase 4.2 Hardening Checklist (before merging #112)

- [ ] **Auth gate** orchestration endpoints (admin token or service auth — same as A8 ops)
- [ ] **Audit trail** on every state transition includes `request_id` + `actor` headers
- [ ] **DB session GUC** — verify `set_config('app.current_program_id', ...)` is called before every RLS-scoped query
- [ ] **Error handling** — runner functions catch DB errors and return meaningful HTTP status codes

### Phase 5: Evidence Fabric

See [EVIDENCE_FABRIC.md](./EVIDENCE_FABRIC.md) for full spec. Key tasks:

1. **Schema migration** — `evidence` schema with sources, claims, claim_links, compliance_scores
2. **Claim extraction service** — AI-powered extraction from source documents
3. **Traceability engine** — Link management + RTM generation
4. **API endpoints** — Source ingestion, claim management, RTM export
5. **Tests** — Claim linking, propagation, scoring accuracy

### Phase 6: DOCX Factory

See [DOCX_FACTORY.md](./DOCX_FACTORY.md) for full spec. Key tasks:

1. **Template registry** — DOCX/Jinja2 templates for eCTD sections
2. **Rendering engine** — python-docx + Jinja2 pipeline
3. **Artifact versioning** — Content-hashed output with provenance
4. **Export packaging** — eCTD XML generation
5. **Integration** — Wire `document_gen` step type to renderer

---

## Agent Working Protocol

### Branch Naming Convention

```
phase{N}/{feature-slug}
```

Examples: `phase5/evidence-fabric`, `phase6/docx-factory`

### PR Convention

Each phase ships in 1-3 PRs:

1. **Schema PR** — Database migration only
2. **Kernel PR** — Backend services + API + tests
3. **Seed PR** — Templates/seed data (if separate from kernel)

### File Organization

```
db/migrations/YYYYMMDD_{name}.sql          — Schema migrations
shadow_service/shadow_service/             — Backend Python services
shadow_service/shadow_service/sql_{mod}.py — Parameterized SQL queries
shadow_service/shadow_service/models_{mod}.py — Pydantic models
shadow_service/shadow_service/router_{mod}.py — FastAPI routers
shadow_service/tests/test_{mod}.py         — Unit/integration tests
docs/roadmap/                              — Planning docs
```

### Commit Message Convention

```
feat(schema): Phase N description
feat(api): Phase N.M description
test(orchestration): add XYZ coverage
docs(roadmap): add Phase N spec
```

### Code Style

- **SQL:** Parameterized `$1, $2, ...` for asyncpg — NEVER string interpolation
- **Python:** Type hints on all public functions, `async/await` for DB calls
- **RLS:** Always set `app.current_program_id` GUC per-connection before queries
- **Events:** Emit `step_run_events` for every status transition
- **Idempotency:** All schema DDL uses `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`
- **Tests:** Mock `db.acquire_connection` for unit tests, use real DB for integration

### Database Patterns

```python
# RLS context — set before any program-scoped query
async def _set_rls(conn, program_id):
    await conn.execute(SET_PROGRAM_CONTEXT, str(program_id))

# Connection lifecycle — acquire/release pattern
conn = await db.acquire_connection()
try:
    await _set_rls(conn, program_id)
    async with conn.transaction():
        # ... queries ...
finally:
    await db.release_connection(conn)
```

---

## Key Existing Infrastructure

### Database Schemas

| Schema          | Purpose                           | RLS GUC                  |
| --------------- | --------------------------------- | ------------------------ |
| `core`          | Programs, projects                | `app.current_program_id` |
| `identity`      | Organizations, users              | `app.current_org_id`     |
| `vault`         | Review batches, sensitive data    | `app.current_program_id` |
| `prose`         | Smart fragments, document content | —                        |
| `truth`         | Clinical truth store              | —                        |
| `audit`         | Immutable audit log               | —                        |
| `orchestration` | Workflow engine (Phase 4)         | `app.current_program_id` |

### Shadow Service Routers

| Router                 | Prefix           | Domain                    |
| ---------------------- | ---------------- | ------------------------- |
| `router_drift`         | `/drift`         | Configuration drift       |
| `router_regulatory`    | `/regulatory`    | Regulatory operations     |
| `router_ectd`          | `/ectd`          | eCTD management           |
| `router_governance`    | `/governance`    | Purge/approval workflows  |
| `router_aiml`          | `/aiml`          | AI/ML governance          |
| `router_cybersecurity` | `/cybersecurity` | SBOM/VEX                  |
| `router_transparency`  | `/transparency`  | Data transparency         |
| `router_training`      | `/training`      | Training compliance       |
| `router_orchestration` | `/orchestration` | Workflow engine (Phase 4) |

---

## Warnings & Gotchas

1. **Dual PK systems** — `public.*` uses INTEGER PKs (Drizzle), `core/vault/orchestration.*` uses UUID. Don't mix.
2. **Soft FKs** — Cross-schema FKs (orchestration → core.programs, orchestration → vault.review_batches) are added conditionally. Migrations can run in any order.
3. **Lite mode** — Shadow service can run without a database (`_lite_mode = True`). All DB-dependent routes return 503 in this mode.
4. **RLS leakage** — `set_config` is transaction-local (`TRUE` param). Always use `acquire_connection` + `try/finally release_connection` to prevent session bleed.
5. **Immutable events** — `orchestration.step_run_events` has an immutability trigger. UPDATE/DELETE will raise an exception. INSERT only.
