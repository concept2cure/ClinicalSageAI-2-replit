# Next Agent Instructions — Continuation Playbook

> **Updated:** 2026-02-06 | **Status:** Phases 4–5.3A complete, Phase 6 next

---

## Current State

### Merged PRs (most recent first)

| PR   | Branch                         | Scope                                                 | Status        |
| ---- | ------------------------------ | ----------------------------------------------------- | ------------- |
| #120 | `phase5/contradiction-scanner` | Contradiction Scanner — A8 batch + REST + eCTD fix    | 🔄 CI running |
| #119 | `phase5/idempotent-provenance` | Idempotent provenance — ON CONFLICT DO NOTHING        | ✅ Merged     |
| #118 | `phase5/event-bridge`          | Event Bridge — orchestration → evidence provenance    | ✅ Merged     |
| #117 | `phase5/evidence-fabric`       | Evidence Fabric — schema + service + 52 tests         | ✅ Merged     |
| #116 | `fix/ectd-headers`             | eCTD regulatory audit headers for Phase 4 migrations  | ✅ Merged     |
| #115 | `phase4/hardening`             | Auth gate, audit attribution, concurrency, pagination | ✅ Merged     |
| #114 | `docs/roadmap-phase4`          | Roadmap docs + index updates                          | ✅ Merged     |
| #113 | `phase4/orchestration-seeds`   | Seed workflow templates                               | ✅ Merged     |
| #112 | `phase4/orchestration-runner`  | Runner + API + tests                                  | ✅ Merged     |
| #110 | `phase4/orchestration-schema`  | Schema DDL (6 tables, RLS, indexes, views)            | ✅ Merged     |

**`main`** is at commit `b3943f02` (PR #119 merge). PR #120 is the active work item.

### What Has Been Built

| Component                                                         | Status | Location                                                  | PR   |
| ----------------------------------------------------------------- | ------ | --------------------------------------------------------- | ---- |
| **Phase 4: Orchestration Kernel**                                 |        |                                                           |      |
| Orchestration schema (6 tables, RLS, indexes, views)              | ✅     | `db/migrations/20260206_phase4_orchestration_kernel.sql`  | #110 |
| SQL query module                                                  | ✅     | `shadow_service/shadow_service/sql_orchestration.py`      | #112 |
| Pydantic models                                                   | ✅     | `shadow_service/shadow_service/models_orchestration.py`   | #112 |
| Runner service (start, advance, claim, complete, fail, A8 bridge) | ✅     | `shadow_service/shadow_service/orchestration_runner.py`   | #112 |
| FastAPI router (9 endpoints, auth-gated)                          | ✅     | `shadow_service/shadow_service/router_orchestration.py`   | #112 |
| Seed workflow templates (IND Intake + DOCX Gen)                   | ✅     | `db/migrations/20260207_phase4_seed_templates.sql`        | #113 |
| Hardening (auth, audit, concurrency, pagination)                  | ✅     | PR #115                                                   | #115 |
| Unit tests (45 tests)                                             | ✅     | `shadow_service/tests/test_orchestration.py`              | #112 |
| **Phase 5: Evidence Fabric**                                      |        |                                                           |      |
| Evidence schema (sources, claims, claim_links, provenance, etc.)  | ✅     | `db/migrations/20260206_phase5_evidence_fabric.sql`       | #117 |
| SQL query module (parameterized)                                  | ✅     | `shadow_service/shadow_service/sql_evidence.py`           | #117 |
| Pydantic models                                                   | ✅     | `shadow_service/shadow_service/models_evidence.py`        | #117 |
| Evidence runner (CRUD, detect_contradictions, score)              | ✅     | `shadow_service/shadow_service/evidence_runner.py`        | #117 |
| FastAPI router (13+ endpoints)                                    | ✅     | `shadow_service/shadow_service/router_evidence.py`        | #117 |
| Unit tests (52 tests)                                             | ✅     | `shadow_service/tests/test_evidence_fabric.py`            | #117 |
| **Phase 5.2: Event Bridge**                                       |        |                                                           |      |
| Bridge hooks (on_step_completed, on_step_failed, on_batch)        | ✅     | `shadow_service/shadow_service/event_bridge.py`           | #118 |
| Orchestration runner bridge integration                           | ✅     | `shadow_service/shadow_service/orchestration_runner.py`   | #118 |
| Unit tests (25 tests)                                             | ✅     | `shadow_service/tests/test_event_bridge.py`               | #118 |
| **Phase 5.2.1: Idempotent Provenance**                            |        |                                                           |      |
| Idempotency key + unique partial index                            | ✅     | `db/migrations/20260206_phase5_idempotent_provenance.sql` | #119 |
| INSERT ON CONFLICT DO NOTHING (11 params)                         | ✅     | `shadow_service/shadow_service/sql_evidence.py`           | #119 |
| `_compute_idempotency_key()` + `create_provenance` ON CONFLICT    | ✅     | `shadow_service/shadow_service/evidence_runner.py`        | #119 |
| Unit tests (41 tests)                                             | ✅     | `shadow_service/tests/test_idempotent_provenance.py`      | #119 |
| **Phase 5.3.A: Contradiction Scanner**                            |        |                                                           |      |
| Contradiction scans table + RLS                                   | ✅     | `db/migrations/20260206_phase5_contradiction_scanner.sql` | #120 |
| Scanner lifecycle (run_scan, get_scan, list_scans)                | ✅     | `shadow_service/shadow_service/contradiction_scanner.py`  | #120 |
| Router endpoints (POST/GET/GET by ID)                             | ✅     | `shadow_service/shadow_service/router_evidence.py`        | #120 |
| Unit tests (40 tests)                                             | ✅     | `shadow_service/tests/test_contradiction_scanner.py`      | #120 |
| **eCTD Compliance Fixes**                                         |        |                                                           |      |
| Fix 3 eCTD test failures (TSA timestamp, HSM docx save, any())    | ✅     | `ind_automation/compilers/ectd4_compiler.py` + tests      | #120 |

### Test Coverage

| Test File                       | Tests    | Phase          |
| ------------------------------- | -------- | -------------- |
| `test_orchestration.py`         | 45       | Phase 4        |
| `test_evidence_fabric.py`       | 52       | Phase 5        |
| `test_event_bridge.py`          | 25       | Phase 5.2      |
| `test_idempotent_provenance.py` | 41       | Phase 5.2.1    |
| `test_contradiction_scanner.py` | 40       | Phase 5.3.A    |
| **Total**                       | **203+** | **All phases** |

---

## What to Do Next

### Immediate: Merge PR #120

1. Wait for CI to pass (eCTD fix pushed, Lint/Test/Security/Build were already green)
2. Squash-merge PR #120 into main

### Phase 6: DOCX Factory

See [DOCX_FACTORY.md](./DOCX_FACTORY.md) for full spec. Key tasks:

1. **Schema migration** — `documents` schema: templates, template_sections, artifacts, artifact_versions, artifact_sections
2. **Template registry** — CRUD for DOCX/Jinja2 templates per submission type (IND, NDA, 510(k), BLA)
3. **Rendering engine** — python-docx + Jinja2 pipeline gathering inputs from Evidence Fabric
4. **Artifact versioning** — Content-hashed output with provenance, linked to step_runs
5. **Export packaging** — eCTD XML generation for submission
6. **Integration** — Wire `document_gen` step type in orchestration to the renderer
7. **Tests** — Template rendering, hash verification, version tracking, RLS isolation

### Suggested Phase 6 PR Split

| PR # | Branch                     | Scope                                    |
| ---- | -------------------------- | ---------------------------------------- |
| 1    | `phase6/documents-schema`  | Schema DDL: templates + artifacts tables |
| 2    | `phase6/template-registry` | Template CRUD + seed templates           |
| 3    | `phase6/render-engine`     | Jinja2 + python-docx rendering pipeline  |
| 4    | `phase6/artifact-store`    | Versioned storage with content_hash      |
| 5    | `phase6/export-packaging`  | eCTD XML assembly + submission packaging |

### Cleanup: Stale PRs

These older copilot-authored PRs may be stale and should be evaluated for closing:

| PR   | Branch                                        | Age |
| ---- | --------------------------------------------- | --- |
| #103 | `copilot/fix-ectd-header-compliance-a97ff...` | old |
| #86  | `copilot/fix-batch-worker-test-timeout`       | old |
| #83  | `copilot/fix-build-failures`                  | old |
| #75  | `copilot/fix-terminal-verify-ci`              | old |
| #69  | `copilot/fix-env-assessment-workflow`         | old |

---

## Agent Working Protocol

### Branch Naming Convention

```
phase{N}/{feature-slug}
```

Examples: `phase6/documents-schema`, `phase6/render-engine`

### PR Convention

Each phase ships in 1-5 PRs:

1. **Schema PR** — Database migration only
2. **Kernel PR** — Backend services + API + tests
3. **Seed PR** — Templates/seed data (if separate from kernel)
4. **Integration PR** — Wire to existing systems
5. **Export PR** — Output packaging

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
test(module): add XYZ coverage
docs(roadmap): add Phase N spec
fix(ectd): description of fix
```

### Code Style

- **SQL:** Parameterized `$1, $2, ...` for asyncpg — NEVER string interpolation
- **Python:** Type hints on all public functions, `async/await` for DB calls
- **RLS:** Always set `app.current_program_id` GUC per-connection before queries
- **Events:** Emit `step_run_events` for every status transition
- **Idempotency:** All schema DDL uses `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`
- **Tests:** Mock `db.acquire_connection` for unit tests, use real DB for integration
- **eCTD headers:** All migration SQL files need eCTD regulatory audit headers

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
| `evidence`      | Evidence Fabric (Phase 5)         | `app.current_program_id` |
| `documents`     | DOCX Factory (Phase 6, planned)   | `app.current_program_id` |

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
| `router_evidence`      | `/evidence`      | Evidence Fabric (Phase 5) |

---

## Warnings & Gotchas

1. **Dual PK systems** — `public.*` uses INTEGER PKs (Drizzle), `core/vault/orchestration/evidence.*` uses UUID. Don't mix.
2. **Soft FKs** — Cross-schema FKs are added conditionally. Migrations can run in any order.
3. **Lite mode** — Shadow service can run without a database (`_lite_mode = True`). All DB-dependent routes return 503 in this mode.
4. **RLS leakage** — `set_config` is transaction-local (`TRUE` param). Always use `acquire_connection` + `try/finally release_connection` to prevent session bleed.
5. **Immutable events** — `orchestration.step_run_events` has an immutability trigger. UPDATE/DELETE will raise an exception. INSERT only.
6. **Idempotent provenance** — `evidence.provenance` uses ON CONFLICT DO NOTHING with `idempotency_key`. Duplicate bridge events are safe.
7. **eCTD CI** — eCTD 4.0 Compliance Validation runs `ind_automation/tests/test_ectd4_compiler.py`. All migration SQL needs eCTD headers.
8. **Neon preview_db** — Known flaky CI check. Not blocking for merges.
