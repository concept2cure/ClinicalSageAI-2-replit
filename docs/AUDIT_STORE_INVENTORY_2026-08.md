# Audit store inventory — 2026-08

Phase 4 D5, deliverable 2 of 2. Deliverable 1 was the writer sweep (commit `da639e4`):
raw-`INSERT` writers into `audit_logs` re-pointed through `auditService` so their rows
are hash-chained and HMAC-sealed, plus `server/services/audit/domain-history-link.ts`.
This document is the map that sweep was working from, written down.

**Every claim below carries a `file:line` or a migration name.** Where the evidence is
absence (a table nothing writes), the grep that found nothing is given so a reviewer can
re-run it. Where two stores serve genuinely different semantics, that is stated and no
merge is recommended.

---

## 1. Summary

### 1.1 Verdict counts

| Verdict | Meaning | Count |
|---|---|---|
| **CANONICAL** | `audit_logs` — the reference substrate everything else is measured against | 1 |
| **(a) DUPLICATE** | Records `audit_logs` semantics (who / what / when / old→new) in a second table. Merge candidates, **not** delete candidates — rows exist and readers depend on them | 3 |
| **(b) DOMAIN HISTORY** | Carries payload the flat audit schema cannot express. **Keep**; must become chain-reachable | 23 |
| **(c) DEAD — no writer** | Originally 43. **Re-verified from scratch 2026-09-01 (ledger L13): 24 of the 43 failed.** 19 survive; 13 of those are dropped by `db/migrations/20260901_drop_dead_audit_tables.sql`, 6 are withheld (§5.1) | ~~43~~ 19 |
| **(c) DEAD — no reader** | Rows land; nothing in the app ever reads them back. Delete only with owner sign-off (§5.2) | 11 |
| | **Total audit-ish tables** | **81** |

Scope and the exact greps that produced this population: §7.

### 1.2 The headline finding: there are two canonical audit substrates, not one

`audit_logs` and `audit_events` are both live, both hash-chained, both HMAC-sealed, both
immutable at the DB layer — and they share almost no writers, no readers, and no chain.

| | `audit_logs` | `audit_events` |
|---|---|---|
| Creator | `migrations/0000_sweet_joseph.sql:174`, also `db/migrations/20260129_add_org_industry_stripe_audit_logs.sql:7` | `migrations/0000_sweet_joseph.sql:139` |
| Chain columns | `sha256_chain`, `payload_hash` — `migrations/20260527_mutation_primitives.sql:81` | `record_hash`, `previous_hash`, `sequence_number` — `db/migrations/20260222_audit_events_hash_chain.sql:19-33` |
| Seal | `hmac_seal` — `migrations/20260609_audit_hmac_seal.sql:21` | `hmac_seal` — `db/migrations/20260617_audit_events_hmac_seal.sql:64` |
| Chain computed by | **Application** — `server/services/audit/chain.ts:59` takes `SELECT … FOR UPDATE` on the prior row inside the caller's transaction | **Database trigger** — `trg_audit_events_hash_chain`, `db/migrations/20260222_audit_events_hash_chain.sql:96-103`, with `pg_advisory_xact_lock` per org |
| Chain scope | One global chain across all tenants (`chain.ts:59`, no tenant predicate) | One chain **per organization** (`…hash_chain.sql:64`) |
| Immutability | `db/migrations/20260617_audit_logs_immutability.sql:91,132,158` | `db/migrations/20260222_audit_events_immutability.sql` |
| Scoping column | `tenant_id` (integer, NOT NULL) | `organization_id` (integer, NOT NULL, FK to `organizations`) |
| Distinctive columns | `table_name` / `record_id` / `target` / `target_type` / `reason` / `ana_action_id` | `requires_signature` / `signature_status` / `signed_by` / `signature_meaning` / `regulatory_significant` / `gxp_relevant` / `changed_fields` |
| Production writers | `auditService.ts:275` (+ every service routed through it), `c2c/actions.ts:315`, `c2c/projects.ts:688`, `c2c/commitments.ts:232`, `pharmacovigilanceService.ts:1258` | 17 sites — `audit-trail-routes.ts:259,319,404`, `project-hierarchy.ts:303,425`, `scim.ts:301`, `orchestration-checkpoints.ts:283`, `ectd-documents.ts:342`, `ind.ts:287`, `coauthor.ts:251`, `ai-claims-routes.ts:203`, `batch-draft-routes.ts:454`, `ivdr-binder-routes.ts:102`, `ivdr-pack-worker.ts:110`, `part11-compliance.ts:249`, `chainIntegrityMonitor.ts:183`, `signedAuditExport.ts:299` |
| Production readers | `mdx-audit.ts:49` (the MDX Audit Log surface), `regulatory-programs.service.ts:316,582`, `pm-settings.router.ts:378`, `DecisionLineageService.ts:288,388`, `pdev-provenance-trace.ts:293`, `audit-archive.service.ts:90`, `chain.ts:187,240` | `audit-trail-routes.ts:107,118,457`, `audit-trail-ledger.routes.ts:173`, `admin/audit-siem.ts:133,182`, `part11-compliance.ts:634`, `project-home-routes.ts:257`, `securityHealth.ts:340`, `attestation-report.service.ts:136`, `signedAuditExport.ts:119,189` |
| UI surface | `client/src/concept2cure/mdx/hooks/usePathwayTabsData.ts` → `/api/mdx/audit` | `client/src/concept2cure/v2/surfaces/Part11Console.tsx` → `/api/audit-trail/ledger` |

**Consequence, stated plainly:** the MDX Audit Log surface and the Part 11 Console show
**disjoint event sets**. Neither is wrong; neither is complete. A regulator asking "show me
everything that happened to this record" gets a different answer depending on which screen
they are shown. `chain.ts:295` reads `audit_events` while `chain.ts:59` reads `audit_logs`,
so even the integrity tooling straddles both.

This is **not** a case where merge is obviously right, and it is not recommended blind. The
two stores encode different integrity models (global app-computed chain vs per-org
DB-trigger chain) — reconciling them means choosing one chain semantics and rewriting the
other's verifier, not moving rows. What **is** recommended, and is cheap: a decision record
naming one store as the substrate of reference, and a bridge so events written to one are
discoverable from the other. Until then this document is the map of which is which.

### 1.3 Chain-linkage status of the (b) tables — the follow-up list

`server/services/audit/domain-history-link.ts` exists to give each (b) table a canonical
`audit_logs` entry naming the domain table and row, so the chain becomes a complete index.

> **Correction to the sweep.** As of `da639e4`, `linkDomainHistory` has **zero call sites**:
> `grep -rn "domain-history-link\|linkDomainHistory" --include=*.ts . | grep -v node_modules`
> returns only the module's own definition. The `linked: true` flags the module carried for
> `workflow_history`, `document_audit_logs` and `device_audit_trail` described intent, not
> state. They have been corrected to `false` in the same slice as this document. **Every (b)
> table below is currently chain-orphaned.**

The wiring list is `DOMAIN_HISTORY_TABLES` in that module — 23 entries, all
`linked: false` — ordered here by effort (writer-site count = number of edits).

**It is not the same 23 as the (b) set in §4**, and the difference is deliberate: the
wiring list drops three (b) tables that record no governance (noted at the end of this
section) and adds three tables that do — `regulatory_audit_logs` (verdict (a), §3.3) and
`charter_audit_events` / `document_audit_trail` (verdict (c) no-reader, §5.2, but still
receiving governed writes). Membership is "records a governed domain event", not "carries
verdict (b)".

| # | Table | Writer sites to wire | Where |
|---|---|---|---|
| 1 | `charter_audit_events` | 1 | `routes/charters.ts:717` |
| 2 | `authoring_audit_trail` | 1 | `authoring.router.ts:533` |
| 3 | `coauthor_validation_history` | 1 | `realTimeValidationService.ts:207` |
| 4 | `stab_audit` | 1 | `server/src/routes/stability.router.ts:254` |
| 5 | `rule_execution_log` | 1 | `rules-engine/engine.ts:372` |
| 6 | `impact_propagation_log` | 1 | `reactive-dependency-service.ts:442` |
| 7 | `org_lifecycle_state_history` | 1 | `lifecycle/org-lifecycle.ts:217` |
| 8 | `ivdr_validation_parameter_history` | 1 | `ivdr-routes.ts:494` |
| 9 | `ivdr_evidence_result_history` | 1 | `ivdr-routes.ts:727` |
| 10 | `ivdr_cdx_status_history` | 1 | `ivdr-routes.ts:912` |
| 11 | `cognitive_audit.semantic_audit_log` | 1 | `cognitive-audit.service.ts:136` |
| 12 | `cognitive_audit.electronic_signatures` | 1 | `cognitive-audit.service.ts:542` |
| 13 | `cognitive_audit.compliance_attestations` | 1 | `cognitive-audit.service.ts:787` |
| 14 | `cognitive_audit.audit_replay_sessions` | 1 | `cognitive-audit.service.ts:395` |
| 15 | `document_audit_trail` | 1 live | `DocumentOrchestrationService.ts:437` (the second writer, `unifiedDocumentIngestion.js:1316`, is broken and callerless — §6.1) |
| 16 | `device_audit_trail` | 2, one partial | `part11ComplianceService.ts:355` **already emits an `audit_logs` row** at `:374`, but with `resourceType: entityType` — the row exists and is chained, it just does not name the domain table, so a coverage query keyed on `table_name` cannot see it. `medicalDeviceService.ts:876` emits nothing |
| 17 | `authoring_export_history` | 2 | `authoring.router.ts:4232`, `ana-ri/command-executor.ts:3186` |
| 18 | `section_status_log` | 2 | `artifact-tagger.ts:290`, `project-sections.ts:861` |
| 19 | `specification_audit_log` | 3 | `api/cmc/specificationRoutes.ts:159,268,367` |
| 20 | `ectd_submission_status_history` | 3 | `ectd-submission-agent.ts:100,314,447` |
| 21 | `document_audit_logs` | 7 | `ModuleIntegrationService.ts:118,390,437,482,506,532`, `workflow/ApprovalOrchestrator.ts:646` |
| 22 | `workflow_history` | 7 | `WorkflowService.ts:391,473,501,544,624,636,920` |
| 23 | `regulatory_audit_logs` | 8 | §3.3 — reclassified **(a)**, kept on this list because linking is the cheap interim step for a store with 8 writers and no integrity fields at all |

Items 1–15 are one-line additions after the domain insert. Items 21–23 warrant a helper
inside their own service rather than seven or eight call-site edits.

**Three (b) tables are deliberately *not* on the wiring list**, and the membership rule is
stated in the module: `ana_outcome_log` (`ana-capability-registry.ts:845`) and
`regulatory_intel.confidence_calibration_log` (`confidence-calibration-service.ts:249`) are
ML feedback, not governance evidence; `qms_internal_audits` (`qms.service.ts:163`,
`mdx-qms.ts:759`) is an internal-audit *schedule*, a business record that matched the name
regex. Chain-linking them would inflate the ledger with non-governed events.

---

## 2. CANONICAL — `audit_logs`

| Field | Value |
|---|---|
| Creator | `migrations/0000_sweet_joseph.sql:174`; idempotent re-create `db/migrations/20260129_add_org_industry_stripe_audit_logs.sql:7` |
| Drizzle | `shared/schema.ts:334` (`auditLogs`) — note the ORM definition **omits** every integrity column; they are SQL-only |
| Integrity | `sha256_chain`, `payload_hash`, `occurred_at`, `actor_id`, `target*`, `reason`, `ana_action_id` (`migrations/20260527_mutation_primitives.sql:81`); `hmac_seal` (`migrations/20260609_audit_hmac_seal.sql:21`); UPDATE/DELETE/TRUNCATE blocked (`db/migrations/20260617_audit_logs_immutability.sql:91,132,158`) |
| One row = | One governed action: actor, verb, target, payload digest, chain link to the prior row |
| Writers | `auditService.ts:275` — the sanctioned path, computes chain + seal in its own transaction. Transactional writers that legitimately hand-roll the INSERT because they must be atomic with a domain write: `c2c/actions.ts:315`, `c2c/projects.ts:688`, `c2c/commitments.ts:232`, `pharmacovigilanceService.ts:1258` — all four call `computeAuditChainSealed` first (`actions.ts:305`, `projects.ts:679`, `commitments.ts:228`, `pharmacovigilanceService.ts:1252`) |
| Readers | §1.2 |
| Verdict | **CANONICAL** |

**One unchained writer remains** — `server/prisma/client.js:67`. The prisma-compat shim's
`audit_log.create` INSERTs nine columns and no chain, no seal, no `occurred_at`. It is not a
live gap: `grep -rn "audit_log\.create"` across `server/ client/ scripts/ tests/` returns no
production caller (only `server/prisma/__tests__/tenant-guards.test.ts:31`, which exercises
`findMany`). It is a loaded footgun for the next person who reaches for the shim, and should
either be deleted or routed through `auditService`.

---

## 3. Verdict (a) — duplicates of `audit_logs` semantics

Merge candidates. **None is a delete candidate**: all three hold rows and have readers.

### 3.1 `audit_events`
Covered in full at §1.2. **(a)** by column semantics (actor, entity, action, old→new, reason),
but with a Part 11 signature block (`requires_signature`, `signature_status`, `signed_by`,
`signature_meaning`) that `audit_logs` has no column for. Merging in either direction loses
something. See the recommendation at the end of §1.2.

### 3.2 `audit.tamper_proof_log` — intentional mirror, not accidental duplication
| Field | Value |
|---|---|
| Creator | `db/migrations/20260813_audit_tamper_proof_log.sql:64` |
| Integrity | `chain_hash`, `previous_hash`, `content_hash`, `sequence_number`, `signature`; UPDATE/DELETE trigger `trg_prevent_audit_mutation` (asserted at `tests/db/part11-audit-store.dbtest.ts:123`) |
| Writer | `server/lib/tamper-proof-audit.ts:301`, reached from `auditService.ts` step 2 of its dual-write (`auditService.ts:1-12` header) |
| Readers | `tamper-proof-audit.ts:347,494,516`; startup fail-closed check `server/startup/audit-enforcement.ts:56` |
| Verdict | **(a) by content, by design.** Every row duplicates an `audit_logs` row on purpose — this is the tamper-evident mirror. Do not merge; do not delete. Listed so the duplication is not mistaken for drift |

### 3.3 `regulatory_audit_logs` — the largest genuine duplicate
| Field | Value |
|---|---|
| Creator | `migrations/0000_sweet_joseph.sql:4997` |
| Drizzle | `shared/schema.ts:12569` (`regulatoryAuditLogs`) |
| Integrity | **None.** No hash, no chain, no seal, no immutability trigger (column scan of the DDL at `0000_sweet_joseph.sql:4997-5020`) |
| One row = | One regulatory-entity change: `entity_type`/`entity_id`, `action`, `action_category`, `previous_value`/`new_value`, `change_reason`, actor + IP + session, `is_gxp_relevant`, `requires_justification` |
| Writers (8) | `compute/exportGovernance.ts:188`, `compute/artifactWriteback.ts:118`, `ana/verifiedSealService.ts:344`, `ana/submission-chat-apply-rewrite.ts:727`, `ai-actions/action-registry.ts:511`, `routes/orchestration.ts:641`, `routes/concept2cure.ts:341`, `routes/concept2cure.ts:6496` |
| Readers (12) | `compute/computeService.ts:298`, `ana/submission-chat-proposal-store.ts:402`, `ana/submission-chat-timeline.ts:175`, `export/docx-ledger-collector.ts:259`, `ai-actions/action-history.ts:68,83`, `orchestration/continuity-service.ts:151`, `orchestration/cross-object-resolver.ts:248,295,392,598`, `routes/orchestration.ts:428`, `routes/concept2cure.ts:1686,11408` |
| Verdict | **(a) DUPLICATE** |

**Why (a) and not (b), against the earlier call.** `domain-history-link.ts` originally listed
this table as (b). Reading the DDL column by column, every field maps onto `audit_logs`
without loss: `entity_type`→`table_name`, `entity_id`→`record_id`, `previous_value`/
`new_value`→`old_values`/`new_values`, `change_reason`→`reason`, and the two GxP booleans fit
`new_values`. There is no domain payload here that the flat schema cannot express — it is
`audit_logs` with a different column vocabulary and, critically, **no chain and no seal**.
Eight writers put GxP-relevant governance evidence into a table with no tamper-evidence at
all. That is the single largest integrity gap this inventory found.

Ordering note for whoever takes it: 8 writers / 12 readers is a real migration, not a
repoint. The cheap intermediate step is chain-linking it (§1.3 mechanism) so the events are
at least *discoverable* from the sealed chain while the table itself stays put.

---

## 4. Verdict (b) — domain history, keep, must become chain-reachable

One row of each of these carries something `audit_logs` cannot hold. Force-merging destroys
information; the fix is reachability, not consolidation.

| Table | Creator migration | One row = | Integrity fields | Writers → Readers |
|---|---|---|---|---|
| `workflow_history` | **none** (Drizzle-only, `shared/schema/unified_workflow.ts:207`; `migrations/0004_workflow_performance_indexes.sql:35` indexes it) | One approval-workflow transition (`workflow_started` / `step_approved` / `step_rejected` / `workflow_completed` / `workflow_rejected`) with per-step actor and comments | — | `WorkflowService.ts:391,473,501,544,624,636,920` → `WorkflowService.ts:855`, `ApprovalOrchestrator.ts:592` |
| `document_audit_logs` | **none** (Drizzle-only, `shared/schema/unified_workflow.ts:123`; indexed at `migrations/0004_workflow_performance_indexes.sql:31`) | One unified-document lifecycle event tied to a document + version | — | `ModuleIntegrationService.ts:118,390,437,482,506,532`, `ApprovalOrchestrator.ts:646` → `DecisionLineageService.ts:250` |
| `device_audit_trail` | `migrations/0000_sweet_joseph.sql:2347` | One device/510(k) record change **with an applied e-signature** | `electronic_signature`, `signature_meaning`, `signature_timestamp`, `data_integrity_check` | `part11ComplianceService.ts:355`, `medicalDeviceService.ts:876` → `part11ComplianceService.ts:401`, `DocumentDataCenterService.ts:27` |
| `ivdr_validation_parameter_history` | `migrations/001_create_ivdr_tables.sql:61` | The prior value of one IVDR validation parameter, with reason | — | `ivdr-routes.ts:494` → `ivdr-routes.ts:565` |
| `ivdr_evidence_result_history` | `migrations/001_create_ivdr_tables.sql:112` | The prior value of one IVDR evidence result | — | `ivdr-routes.ts:727` → `ivdr-routes.ts:781` |
| `ivdr_cdx_status_history` | `migrations/001_create_ivdr_tables.sql:149` | One companion-diagnostic status transition | — | `ivdr-routes.ts:912` → `ivdr-routes.ts:938` |
| `ectd_submission_status_history` | `db/migrations/082_ectd_submission_agent.sql:173` | One eCTD submission status transition | — | `ectd-submission-agent.ts:100,314,447` → `ectd-submission-agent.ts:383` |
| `org_lifecycle_state_history` | `migrations/20260521_org_lifecycle_state.sql:64` | One organization lifecycle transition (immutable log per `org-lifecycle.ts:5`) | — | `org-lifecycle.ts:217` → `org-lifecycle.ts:109` |
| `authoring_audit_trail` | `db/migrations/20260725_authoring_audit_trail.sql:22` | One section-level authoring operation with before/after content | `content_hash_before`, `content_hash_after` | `authoring.router.ts:533` → `authoring.router.ts:5429`, `tests/golden-journeys/ind-authoring.journey.test.ts:610` |
| `authoring_export_history` | `db/migrations/20260730_authoring_runtime_ddl.sql:89` | One document export event | — | `authoring.router.ts:4232`, `command-executor.ts:3186` → `authoring.router.ts:4304,4337,4367,4419` |
| `coauthor_validation_history` | `migrations/0000_sweet_joseph.sql:1626` | One validation run's findings for a document section | — | `realTimeValidationService.ts:207` → `realTimeValidationService.ts:640` |
| `specification_audit_log` | `db/migrations/20260730_cmc_evidence_tables.sql:114` | One CMC specification change with prev/new values | — | `specificationRoutes.ts:159,268,367` → `specificationRoutes.ts:412` |
| `section_status_log` | `db/migrations/20260220_ind_section_tracking.sql:62` | One IND section status transition | — | `artifact-tagger.ts:290`, `project-sections.ts:861` → `project-sections.ts:1226` |
| `stab_audit` | `db/migrations/026_stability_step4.sql:2` | One stability-study action with a JSON payload | — | `stability.router.ts:254` → `stability.router.ts:1642` |
| `rule_execution_log` | `migrations/0000_sweet_joseph.sql:5294` **and** `db/migrations/20260216_enterprise_4pillar_expansion.sql:123` (two creators — see §6.3) | One rules-engine execution with its outcome | — | `rules-engine/engine.ts:372` → `engine.ts:245`, `project-rules.ts:411,432` |
| `impact_propagation_log` | `db/migrations/20260323_reactive_dependency_layer.sql:68` | One dependency-impact propagation event | — | `reactive-dependency-service.ts:442` → `reactive-dependency-service.ts:360` |
| `ana_outcome_log` | `migrations/0013_ana_intelligence_system.sql:47` | One ANA capability outcome + lessons learned (ML feedback, not governance — matched the regex on `_log`) | — | `ana-capability-registry.ts:845` → `ana-session-bootstrap.ts:61` |
| `regulatory_intel.confidence_calibration_log` | `db/migrations/20260322_regulatory_precedent_intelligence.sql:260` | One predicted-vs-actual calibration observation (ML, not governance) | — | `confidence-calibration-service.ts:249` → `confidence-calibration-service.ts:275,315` |
| `cognitive_audit.semantic_audit_log` | `db/migrations/064_gcc_cognitive_audit_schema.sql:79` | One AI reasoning step with its prompt and semantic content | `record_hash`, `previous_record_hash`, `system_prompt_hash` (own chain, `cognitive-audit.service.ts:108`) | `cognitive-audit.service.ts:136` → `:260,267,330,459` |
| `cognitive_audit.audit_replay_sessions` | `db/migrations/064_gcc_cognitive_audit_schema.sql:217` | One deterministic replay of a recorded reasoning session | — | `cognitive-audit.service.ts:395` → `:443` |
| `cognitive_audit.compliance_attestations` | `db/migrations/064_gcc_cognitive_audit_schema.sql:331` | One attestation over a set of cognitive audit records | `signature_ids` | `cognitive-audit.service.ts:787` → `:866` |
| `cognitive_audit.electronic_signatures` | `db/migrations/064_gcc_cognitive_audit_schema.sql:290` | One e-signature over cognitive audit content | `signed_data_hash`, `signature_meaning`, `signature_method` | `cognitive-audit.service.ts:542` → `:623,748` |
| `qms_internal_audits` | `migrations/20260511_qms_and_labeling.sql:95` | **Not an audit trail.** One scheduled internal QMS audit (ISO 13485 §8.2.4) — the plan, not the record of a change. Matched the name regex only | — | `qms/qms.service.ts:163`, `mdx-qms.ts:759` → `qms.service.ts:172,249`, `mdx-qms.ts:235,743` |

Reachability of the `cognitive_audit.*` writers was checked, not assumed:
`cognitive-audit.service.ts` is instantiated at `langgraph-orchestrator.service.ts:124`,
exported at `cognitive-ecosystem/index.ts:29`, and consumed by the route module
`server/routes/cognitive-ecosystem.ts:37`.

---

## 5. Verdict (c) — dead

### 5.1 No writer — the delete list, re-verified and executed (ledger L13)

**Status: executed 2026-09-01, at 13 of the 43 rows published below.**
`db/migrations/20260901_drop_dead_audit_tables.sql` (registered in
`C2C_MIGRATION_FILES`, immediately before the two tenant-isolation steps that
must stay last). Guard: `scripts/ci/check-dead-audit-tables.mjs`
(`npm run ci:dead-audit-tables`), pinned by
`scripts/ci/dead-audit-tables-baseline.json` and self-tested against PGlite by
`scripts/ci/check-dead-audit-tables.selftest.mjs`.

#### 5.1.0 The count was wrong. 24 of 43 are not dead.

The list below was published as "43 dead — delete list for a later slice". Every
row was re-derived from scratch before anything was dropped, and **24 failed
re-verification.** The reason is one methodological gap stated in the original
evidence line:

> `grep -rniE "INSERT INTO <name>|insert\(<drizzleConst>\)" server client shared scripts tests`

That grep never opened `db/migrations/`. These are Part 11 stores, and in this
codebase Part 11 stores are written by **PL/pgSQL** — `SECURITY DEFINER`
functions and `BEFORE INSERT` hash-chain triggers that live in the migration
that creates the table. A repo-wide grep of TypeScript cannot see any of them.

The clearest instance is the one the document argued hardest:

> `compliance.audit_trail` … Its only writer is the in-migration PL/pgSQL
> function at `080_…:631`; `grep -rn "log_audit_event" server` returns nothing

The function is not called `log_audit_event`. It is
`compliance.write_audit_entry`, `server/services/cortexComplianceService.ts:166`
calls it on every governed write, `compliance.create_electronic_signature`
calls it again at `080_…:720`, and `080_…:631` is the `INSERT INTO
compliance.audit_trail` it performs. A grep for the wrong identifier returning
nothing is not evidence of absence.

**Failed re-verification — removed from the delete list.** Each row names the
specific finding that disqualifies it.

| Table | Why it is NOT dead |
|---|---|
| `audit_trail` | Two live readers, not one: `routes/part11-compliance.ts:618-619` (raw SQL) **and** `routes/ana-features.ts:277-280` (Drizzle `.from(auditTrail)`, intelligence feed). Carries a parent-scoped RLS policy through `leaf_id → leaves` (`20260813_child_table_parent_scoped_rls.sql:91`) and is asserted in `tests/db/child-table-parent-scoped-rls.dbtest.ts:184` |
| `compliance.audit_trail` | Live writer chain server → `compliance.write_audit_entry()` → `INSERT` (`080_…:166 call, :631 insert, :720 e-signature path`); live readers `cortexComplianceService.ts:218,242`; immutability trigger `080_…:137` |
| `regulatory_harmonization.audit_log` | Live reader `grdheService.ts:1451` (`getAuditLog`); DB writer `regulatory_harmonization.log_audit()` at `081_…:1510`; `BEFORE INSERT` hash-chain trigger `081_…:1325-1328`; partitioned parent of three monthly partitions; a view reads it at `081_…:1305` |
| `ana_kernel_decision_log` | Live reader: `SELECT final_decision, enforced_decision, COUNT(*) … FROM ana_kernel_decision_log` (`server/src/control-plane/persistent-queries.ts:42`), plus the hash-chain verifier at `:106`. Hash + immutability triggers from `20260325_ana_kernel_log_immutability_hashchain.sql` |
| `auth_audit_log` | Seed-script writer: `INSERT INTO auth_audit_log (…)` at `scripts/seed-ga-demo.mjs:420`; retention `DELETE` in the purge function at `_consolidated/001_auth_security_tables.sql:239` |
| `analytical_audit_trail` | Three trigger-function `INSERT`s at `_consolidated/001_analytical_methods_schema.sql:276,291,307` |
| `cortex.calibration_log` | `INSERT` at `075_gcc_epistemic_intelligence.sql:782` |
| `fhir.resource_history` | `INSERT`s at `058_gcc_fhir_resources.sql:589,618` (the FHIR versioning path) |
| `authoring_audit_events` | A member of the Part-11 authoring subsystem, which is judged **as a unit**: `scripts/db/authoring-subsystem.mjs:162` provisions it and `server/db/ensureCoreTables.ts:176` gates readiness on it. Dropping it makes `/readyz` report the subsystem PARTIAL, which fails readiness closed. Named by three contract tests |
| `proof_audit_logs` | `tests/migrations/proofAuditLogs.test.ts` asserts the table, its columns, its two immutability triggers and its RLS; `scripts/verify-migration.mjs` verifies the same; it holds an entry in `scripts/ci/model-migration-agreement-baseline.json` |
| `audit.concomitant_audit_logs` | Read by three views in `006_gcc_dashboard_views.sql` (`:82,:227,:355`) — a durable `_gcc_` file; inbound FK `_legacy/008_…:96`; `UPDATE` + trigger `_legacy/010_…:383,421` |
| `audit.config_bundles` | Writer `INSERT` `_legacy/011_…:173`; inbound FKs from `_legacy/011:117,134`, `_legacy/013:64,272`, `_legacy/033:34`, `_legacy/034:67`; immutability + attribution triggers; a view at `_legacy/011:210` |
| `audit.dataset_snapshots` | Inbound FKs `_legacy/033_…:33`, `_legacy/034_…:66` |
| `audit.e_signatures` | Immutability + attribution triggers `_legacy/009_…:194,211`; read by four views/joins `_legacy/009_…:307,373,390,488`; chain trigger `_legacy/035_…:175`; `UPDATE` `_legacy/010_…:474` |
| `audit.entity_chain_events` | Self-referencing FK; immutability trigger `_legacy/035_…:36`; writer `INSERT` at `_legacy/035_…:75` |
| `audit.event_log` | `INSERT` + `UPDATE` at `054_gcc_part11_audit.sql:281,332`; three more `INSERT`s at `057_gcc_product_master.sql:561,570,585`; views at `054_…:610,626` and `056_gcc_test_runner.sql:452`; named in `tests/schema-contract/uuid-tenant-isolation.contract.test.ts:121` |
| `audit.idempotency_keys` | `SELECT :97`, `INSERT :118`, `DELETE :144` — all in `019_gcc_idempotency_ratelimit.sql` |
| `audit.purge_approvals` | Immutability trigger `018_gcc_purge_workflow.sql:248`; status trigger `:478`; read at `:328,370,436,508,546` |
| `audit.purge_requests` | `UPDATE` at `018_…:453,462,468`; inbound FKs from `audit.purge_approvals` (`:211`) and `audit.tombstones` (`:262`); views |
| `audit.rate_limit_buckets` | `INSERT :257`, two `UPDATE`s `:272,280` in `019_gcc_idempotency_ratelimit.sql` |
| `audit.shadow_run_groups` | Inbound FK `_legacy/007_…:75`; `UPDATE` `_legacy/010_…:486`; views `_legacy/007:180`, `_legacy/011:201,206` |
| `audit.signature_log` | `INSERT` at `054_gcc_part11_audit.sql:542` |
| `audit.submission_events` | Immutability + attribution triggers `_legacy/009_…:548,566`; `UPDATE` `_legacy/010_…:498` |
| `audit.tombstones` | Immutability trigger `018_gcc_purge_workflow.sql:306`; view join `:549` |

A second, structural correction: §5.1's framing implied the `audit.*` rows were
inert infrastructure to be "triaged with their owning subsystem". They are not
inert. Eight of them (`event_log`, `signature_log`, `idempotency_keys`,
`rate_limit_buckets`, `purge_requests`, `purge_approvals`, `tombstones`,
`concomitant_audit_logs`) are written or read by files on the **durable** `_gcc_`
apply path that `scripts/db/install-fresh.mjs` step 6/8 runs.

One stale citation, corrected: `program_activity_log`'s note pointed at
`routes/programs.ts:512`. That file does not exist. `program_activity_log` has
**zero** code references of any kind, which strengthens rather than weakens the
finding — the entry stays on the delete list.

#### 5.1.1 Dropped

Thirteen entries, all of which survived re-verification with zero writers, zero
readers, no inbound foreign key, and no dependent view or trigger anywhere in
`server/ client/ shared/ scripts/ tests/ db/ migrations/`:

| Table | Creator | What existed at re-verification |
|---|---|---|
| `assumption_history` | `migrations/0010_operating_system_foundation.sql:162` | `shared/schema/operating-system.ts:258` only; the only other mention is a defensive `vi.mock` entry in `server/services/__tests__/operating-system.test.ts:51` that no service consumes |
| `auth_password_history` | `db/migrations/_consolidated/001_auth_security_tables.sql:87` | creator + `server/db/_deprecated_migrations/` copy only |
| `doc_activity_log` | `db/migrations/_consolidated/012_document_authoring_schema.sql:147` | creator only |
| `ind_protocol_history` | `db/migrations/_consolidated/protocol_schema.sql:16` | creator only |
| `program_activity_log` | `migrations/20260524_program_workbench_schema.sql:222` | `shared/schema/programs.ts:308` only. Not on the drizzle push surface |
| `qc_compliance_history` | `db/migrations/048_quality_step7.sql:35` | creator only |
| `relation_extraction_log` | `migrations/0006_regulatory_atoms.sql:335` | `shared/schema/regulatory-atoms.ts:393` only. Not on the drizzle push surface |
| `strategy_audit` | `db/migrations/028_strategy_core.sql:42` | creator only |
| `vault_document_audit_logs` | **no DDL anywhere** | Phantom. Named only as a target by three `_consolidated/` helper scripts. Included so a database that acquired it out of band is cleaned up; on every database this repo provisions the drop is a no-op |
| `audit.request_correlations` | `db/migrations/019_gcc_idempotency_ratelimit.sql:156` | creator + its four indexes only — the one table in `019_…` with no function touching it |
| `cortex.confidence_history` | `db/migrations/075_gcc_epistemic_intelligence.sql:328` | creator + its own RLS policy only |
| `predicate.proof_pack_audit_events` | `db/migrations/20260211_phase6_6e_proof_pack_exports.sql:70` | creator + the trust-chain `ALTER`s in `…6g` (which is on no durable apply path) + a comment in `…phase7_0a:61` |
| `regulatory_harmonization.mapping_rule_history` | `db/migrations/081_grdhe_regulatory_mapping_layer.sql:543` | creator + a self-referencing FK, which dies with the table |

**Safety posture — empty-only, and it fails soft.** Static analysis over this
repo can prove nothing *here* writes a table. It cannot prove nothing ever did:
a retired writer, a one-off backfill, an out-of-repo job, or a restore from a
database older than the code all produce an audit table with real records and no
live writer, and dropping that is a records-retention incident. Nothing in the
repo settles it — there is no fixture, no backfill migration and no production
note for any of the thirteen — so the migration settles it at run time instead.
Each table is dropped only when, on the database in front of it:

1. it exists and is an ordinary or partitioned table;
2. `count(*) = 0`;
3. no *other* table has a foreign key pointing at it;
4. `DROP TABLE … RESTRICT` succeeds — a view, matview or any other dependent
   object stops the drop rather than being destroyed with it.

Any table failing a condition is **kept**, with a `NOTICE` naming the reason, and
the migration still exits 0. A non-empty table therefore survives and needs owner
sign-off plus a retention disposition; re-running afterwards picks it up with no
edit. Verified against real PostgreSQL — `scripts/ci/check-dead-audit-tables.selftest.mjs`
provisions all thirteen, gives one a row, one an inbound FK and one a dependent
view, applies the real migration file twice, and asserts those three survive and
the other nine do not.

#### 5.1.2 Withheld — dead in code, but the DROP would not hold

Six entries survived re-verification and are still **not** dropped, because each
is declared as a `pgTable` on the **drizzle push surface** — `shared/schema.ts`
and the eight modules it `export *`s, which is exactly what `drizzle.config.ts`
hands `drizzle-kit push`. `install-fresh.mjs` step 2/8 runs that push, so a
SQL-only `DROP` produces a table that comes back on the next fresh install: a
deletion that does not delete, which is the failure mode this ledger row exists
to end, not to reproduce.

| Table | Declaration to remove first |
|---|---|
| `document_audit_log` | `shared/schema.ts:5214` (+ `insertDocumentAuditLogSchema`, `DocumentAuditLogEntry`, and the `auditLog: many(documentAuditLog)` relation at `:15046`) |
| `ai_audit_log` | `shared/schema.ts:14212` (+ `:14347`, `:14376`) |
| `qmp_audit_trail` | `shared/schema.ts:4552` (+ `:4580`, `:4586`, and `auditTrail: many(qmpAuditTrail)` at `:4736`) |
| `coauthor_import_history` | `shared/schema.ts:12077` (+ `:12149`, `:12155`) |
| `coauthor_status_history` | `shared/schema.ts:11659` (+ `:12063`, `:12069`) |
| `csr_extraction_log` | `shared/schema/csr-knowledge-db.ts:1307` (also RLS-enabled and policied by name in a hardcoded `DO` loop at `migrations/0005_csr_knowledge_database.sql:962,998`, which must lose the entry in the same change or the migration fails on replay) |

None of the six drizzle constants, insert schemas or inferred types is imported
anywhere outside its own declaring module — checked by name and by type name —
so the removal is mechanical. It is withheld here only because it is a typed
edit across `shared/schema.ts` and its `relations()` blocks, and it needs its own
type-check to be honest about. `scripts/ci/check-dead-audit-tables.mjs` carries
them in a `withheld` block as the burndown list; they move to `dropped` when the
declarations go.

A related caveat that does **not** block the thirteen: `assumption_history`,
`program_activity_log` and `relation_extraction_log` also have `pgTable`
declarations, in `shared/schema/operating-system.ts`, `programs.ts` and
`regulatory-atoms.ts`. Those modules are **not** reachable from
`drizzle.config.ts` (`shared/schema.ts` re-exports eight modules and none of them
is these), so push never creates them. The declarations remain, and a future
`db.select().from(programActivityLog)` would compile and then fail at run time —
which is precisely what the guard's per-table mention set is there to catch.

#### 5.1.3 Where the drop is durable, and where it is not

`scripts/db/deploy-migrate.mjs` — the production entrypoint — applies the
authoring subsystem and then `C2C_MIGRATION_FILES`, and deliberately does *not*
apply the `_gcc_` tree. So in production the drop runs on every deploy, after
every creator in the same set, and the tables stay gone. On a **fresh dev
install** `install-fresh.mjs` provisions from push + the root overlay + the
`_gcc_` tree without ever running the C2C set, so the tables are created and stay
until `apply-c2c` runs. That asymmetry is pre-existing architecture, not
something this migration introduces; it is written down here so the next reader
does not mistake it for a failed drop.

### 5.2 No reader — rows land, nothing reads them. Sign-off required, not a free delete.

These are not safe deletes: several are the *evidence of record* for a governed action. The
right fix for most is a reader, not a `DROP`.

> **Re-verified 2026-09-02 under the corrected method (§8, ledger L144).** The
> "reader evidence" column below was gathered by grepping the application
> languages only — the method that produced §5.1's 24 false "dead" verdicts. The
> same eleven were re-checked over `db/migrations/` and `migrations/` for
> `FROM|JOIN|REFERENCES|ON <name>` (creator, index, policy and comment lines
> excluded). All eleven hold. Three have database-side hits, none of them a
> reader: `charter_audit_events` has `BEFORE UPDATE`/`BEFORE DELETE` triggers
> (immutability guards); `document_audit_trail` is counted once in a `DO` block
> of `emergency_security_migration.sql` (`RAISE NOTICE`, one-off);
> `ai_provider_audit_log` is read by the view `ai_provider_cost_summary` and the
> functions `get_org_ai_usage` / `get_provider_health_metrics`, and nothing in
> the application references any of the three — the reader chain ends inside
> the database. Recorded per row.

| Table | Writers | Reader evidence | Note |
|---|---|---|---|
| `charter_audit_events` | `routes/charters.ts:717` | `grep -rniE "FROM charter_audit_events\|from\(charterAuditEvents\)" server client` → nothing; migrations: only `BEFORE UPDATE`/`BEFORE DELETE` immutability triggers (`20260629_charter_tables_rebuild.sql:359-364`) | **The sharpest case.** `charters.ts:745` states the row "IS the §11.10(e) coverage of record for the" charter domain. Written in-transaction with an `event_hash` — and unreadable through the application. Add a reader |
| `document_audit_trail` | `DocumentOrchestrationService.ts:437` (Drizzle), `unifiedDocumentIngestion.js:1316` (raw, broken — §6.1) | none in the application; migrations: one `COUNT(*)` into a `RAISE NOTICE` in `emergency_security_migration.sql:78` — a one-off diagnostic, not a reader | Also has a DDL collision — §6.2 |
| `contradiction_consequence_log` | 9 sites: `contradiction-consequence-service.ts:451,499,553,696`, `contradiction-engine-service.ts:606`, `contradiction-resolution-orchestrator.ts:460,547,592,617` | none | Most-written dead table in the repo |
| `ai.gateway_audit_log` | `ai-gateway/audit.ts:321` | `grep -rniE "FROM ai\.gateway_audit_log" server scripts` → nothing | The AI provenance ledger is **fail-closed on write** (`server/startup/…/aiProvenanceLedgerInvariant.test.ts:25`, `audit.ts:143-152`) and never read back. `scripts/ai-governance/generate-evidence-pack.ts:86` only *describes* it in prose |
| `innovation.guardrail_api_audit` | `compliance-guardrails-sdk-service.ts:1027` | only `tests/integration/innovation-platform.test.ts:842,935` | |
| `regulatory_harmonization.export_job_audit_log` | `grdhe/grdheService.ts:1013` | none (`081_…sql:1305` is a view definition, not app code) | |
| `assembly_audit_logs` | `AssemblyLine.ts:89` | none | Table is created at runtime by `routes/test-assembly.ts:31`; `server/db/ensureCoreTables.ts:70` already notes it is written only by AssemblyLine |
| `embedding_audit_log` | `enhancedEmbeddingService.ts:685` | none | |
| `sharepoint_audit_log` | `ESGSubmissionService.ts:513` | none | Has a `signature` column |
| `cer_version_history` | `cerGenerationService.ts:342` | none | CER version snapshots written and never surfaced |
| `ai_provider_audit_log` | `aiProviderRouter.ts:498` | none in the application; migrations: view `ai_provider_cost_summary` and functions `get_org_ai_usage`, `get_provider_health_metrics` (`20260125_ai_provider_audit_log.sql`) read it, and nothing references any of the three | The reader chain ends inside the database — a reader exists, unreachable |

---

## 6. Where the sweep's assumptions turned out wrong

### 6.1 A second audit call that writes nothing
`da639e4` fixed `ana-platform-controller`'s audit call, which named columns that do not
exist and swallowed the error. **The same defect exists at
`server/services/unifiedDocumentIngestion.js:1316`:**

```
INSERT INTO document_audit_trail (audit_id, document_version_id, action, performed_by, performed_at, details, tenant_id)
```

`audit_id` is defined by **no** migration for this table (`grep -rn "audit_id" migrations/ db/migrations/ | grep document_audit` → nothing; the two DDLs use `id`). The failure is
caught and logged at `:1332-1335` and processing continues, so the write silently no-ops.
Impact today is nil — `createAuditEntry` has no callers
(`grep -rn "createAuditEntry" server` returns only its own definition) — which makes it dead
*and* broken. Delete it or fix it; do not leave it as a template.

### 6.2 `document_audit_trail` has two incompatible DDLs
- `migrations/0000_sweet_joseph.sql:2610` — `id serial`, `organization_id`, `action_type`, `action_category`, `user_name`, `user_email`, `data_integrity_check`, … (matches `shared/schema.ts:1903` and the `DocumentOrchestrationService.ts:437` writer)
- `db/migrations/_consolidated/20250108_unified_documents_complete_schema.sql:147` and `…/20250108_add_versioning_audit_to_unified_documents.sql:152` — `id TEXT`, `document_version_id`, `performed_by`, `tenant_id`, FKs to `unified_documents`/`tenants`

Both are `CREATE TABLE IF NOT EXISTS`-shaped, so **whichever migration runs first wins** and
the other subsystem's writer is wrong against the physical table. Two names, one table, two
irreconcilable shapes.

### 6.3 `rule_execution_log` also has two creators
`migrations/0000_sweet_joseph.sql:5294` and
`db/migrations/20260216_enterprise_4pillar_expansion.sql:123`. Lower stakes than 6.2 — the
live writer/reader pair (`rules-engine/engine.ts:372` / `:245`) uses one shape — but the same
class of hazard.

### 6.4 Two governed history tables have no DDL migration at all
`workflow_history` and `document_audit_logs` exist only as Drizzle definitions
(`shared/schema/unified_workflow.ts:207,123`). No `CREATE TABLE` for either appears anywhere
in `migrations/` or `db/migrations/`. `migrations/0004_workflow_performance_indexes.sql:31,35`
creates **indexes on them**, which means that migration depends on `drizzle-kit push` having
run first. These are the two most-written (b) tables in §1.3.

### 6.5 `linkDomainHistory` was never called
See §1.3. The module shipped with its flags describing intent. Corrected in this slice.

### 6.6 `regulatory_audit_logs` was mis-classified (b)
See §3.3. On the column evidence it is (a) — and it is the largest unsealed governance store
in the repo.

---

## 7. How to keep this true

### 7.1 The invariant
> **Every write to a governed domain table emits exactly one `audit_logs` row that names
> that table and that row.**

Not "every write is duplicated into `audit_logs`" — the domain payload stays where it lives.
The chain carries the *index entry*: `action = domain.<table>.<verb>`,
`table_name = <domain table>`, `record_id = <domain row id>`. That makes the sealed chain a
complete enumeration of what happened, with a pointer to the detail, and it makes coverage a
number rather than an opinion.

Two mechanisms satisfy it, and the choice is not stylistic:
- **`linkDomainHistory`** (`server/services/audit/domain-history-link.ts:166`) — for writes that do not need to be atomic with the ledger. Never throws; emits on its own connection. A link can outlive a rolled-back domain write, which is why the link row names the table and row id: a dangling pointer is detectable, a missing row is not.
- **`recordGovernedAction`** (`server/routes/c2c/actions.ts`) — for writes that must be atomic with the ledger. Writes `audit_logs` + `c2c_ana_actions` inside the caller's own transaction.

### 7.2 How a reviewer verifies it, in four steps

1. **Is the writer new?** `git diff --stat` on `migrations/` and a grep for `INSERT INTO` in the diff. Any new table matching `/audit|_history|_trail|_log$/` belongs in this document before it merges.
2. **Is it chained?** For a write to `audit_logs`, either it goes through `auditService.logAction`, or the diff contains a `computeAuditChainSealed` call before the INSERT. A raw INSERT into `audit_logs` with no chain call is a rejectable change — it produces a row that sits *in* the audit table but *outside* the chain, invisible to `chain.ts:187`.
3. **Is it reachable?** For a write to a (b) table, the diff contains a `linkDomainHistory` call, or the table is listed as a known orphan in §1.3.
4. **Does the count move?** Run the coverage report (§7.3). A (b) table whose domain row count grows while its `audit_logs` link count stays flat has an unwired writer.

### 7.3 Coverage report (added in this slice)

`scripts/audit/domain-history-coverage.ts` — read-only, no schema writes, no HTTP surface:

```
DATABASE_URL=… npx tsx scripts/audit/domain-history-coverage.ts        # table
DATABASE_URL=… npx tsx scripts/audit/domain-history-coverage.ts --json # machine-readable
```

For each table in `DOMAIN_HISTORY_TABLES` it prints the domain row count, the count of
`audit_logs` rows whose `table_name` equals it, and the coverage ratio. It enumerates the
**same exported constant** the writers import, so a table cannot appear "covered" in the
report without a writer that links it. Missing tables are reported as `absent`, not as an
error — the same script runs against a database where a subsystem was never provisioned.
Exit code is 0 always (diagnostic, not a gate) until the orphan list in §1.3 is worked down;
promote it to a CI ratchet at that point.

### 7.4 The HTTP affordance, deliberately deferred

An endpoint was scoped and **not** built: the natural home is
`server/routes/part11-compliance.ts`, which is owned by the concurrent Part 11 signature
slice, and a second home would fragment the Part 11 surface. Exact shape for whoever owns it
next:

```
GET /api/part11/audit-trail/domain-coverage?organizationId=<id>
→ 200 {
    generatedAt: string,
    tables: [{
      table: string,          // domain table name
      rowSemantics: string,   // from DOMAIN_HISTORY_TABLES
      owner: string,
      linked: boolean,        // writers emit a chain link
      domainRows: number | null,   // null when the table is absent
      linkedRows: number,          // audit_logs rows with table_name = table
      coverage: number | null      // linkedRows / domainRows, null when absent
    }],
    summary: { tables: number, linked: number, orphaned: number, absent: number }
  }
```

Same authz as the existing chain-integrity route; org-scoped; read-only. It must enumerate
`DOMAIN_HISTORY_TABLES` rather than a hand-written list, for the reason in §7.3.

---

## 8. Method, and the boundary of this inventory

**Population.** Table names matching `/audit|_history$|_trail$|_log$/`, from:

```
grep -rinoE "CREATE TABLE (IF NOT EXISTS )?[\"a-zA-Z0-9_.]+" migrations/ db/migrations/
grep -rnoE "pgTable\(\s*[\"'][a-zA-Z0-9_.]+[\"']" shared/ server/db/ db/
```

78 unique names from migrations, plus `workflow_history` and `document_audit_logs` (Drizzle
only, §6.4), plus `vault_document_audit_logs` (name only, §5.1) = **81**. Monthly partitions
(`…_y2026m01`, `analytical_audit_trail_y2025m08`) are folded into their parent.

**Writers / readers.** Per table: `INSERT INTO <name>` / `db.insert(<const>)` and
`FROM <name>` / `.from(<const>)` across `server/ client/ shared/ scripts/ tests/`. Test-only
references are called out as such and never counted as production traffic.

> **Corrected 2026-09-01 (ledger L13).** That scan stopped at the application
> languages, and it is why §5.1 shipped 24 false "dead" verdicts. In this
> codebase Part 11 stores are written by PL/pgSQL — `SECURITY DEFINER` functions
> and `BEFORE INSERT` hash-chain triggers defined in the same migration that
> creates the table — and no grep of `server/ client/ shared/` can see one. A
> liveness verdict now also requires, over `db/migrations/` and `migrations/`
> (including `_legacy/` and `_consolidated/`): `INSERT INTO`, `UPDATE`,
> `DELETE FROM`, `FROM`/`JOIN`, `REFERENCES <name>`, and `TRIGGER … ON <name>`.
> Grep for the identifier that is actually there: the row that argued hardest
> for deleting `compliance.audit_trail` cited a function name
> (`log_audit_event`) that does not exist in the file it cites — the writer is
> `compliance.write_audit_entry`.

**Deliberately out of scope.** Names ending in `_logs` that carry no `audit` and are not
governance records — `api_usage_logs`, `fda_integration_logs`, `ind_template_usage_logs`
(metering/telemetry) — and the large `*_events` family (`adverse_events`, `mdr_events`,
`stripe_events`, `vigilance_events`, `project_schedule_of_events`, …), which is domain data,
not audit. `audit_events` is in scope because it *is* an audit trail, by both name and
content.

**What this method cannot see.** A writer or reader outside this repository; a trigger-driven
write that no application SQL names (the `compliance.audit_trail` case in §5.1 is exactly
that — §5.1 recorded it as dead on exactly this blind spot, and the L13 re-check overturned
it); and a table that exists in a deployed database but in no migration. Confirm against
`information_schema` and live row counts before any `DROP`.
`db/migrations/20260901_drop_dead_audit_tables.sql` makes the row-count half of that
confirmation part of the migration rather than a step someone has to remember: it drops only
what is empty, and keeps anything with rows.
