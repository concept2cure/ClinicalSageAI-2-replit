# Installation Qualification Protocol
## Cortex Prime AI System

---

**Document ID:** IQ-CORTEX-001  
**Version:** 1.0.0-DRAFT  
**Classification:** GxP Critical  
**Status:** ⚠️ DRAFT - REQUIRES VALIDATION REVIEW BEFORE PRODUCTION USE

---

## Document Control

| Version | Date | Author | Description | Approved By |
|---------|------|--------|-------------|-------------|
| 1.0.0-DRAFT | 2025-01-24 | Engineering | Initial draft | PENDING |

**Reference Documents:**
- VMP-CORTEX-001: Validation Master Plan
- DS-CORTEX-001: Design Specification
- RA-CORTEX-001: Risk Analysis

---

## 1. Purpose

This Installation Qualification (IQ) Protocol verifies that the Cortex Prime AI System and all its components are installed correctly according to approved specifications and manufacturer recommendations.

---

## 2. Scope

### 2.1 System Components

| Component | Version | Category |
|-----------|---------|----------|
| PostgreSQL Database | 15.x | Infrastructure |
| pgvector Extension | 0.5.x | Database Extension |
| Node.js Runtime | 20.x LTS | Runtime |
| Cortex Schema (073-080) | 1.0.0 | Custom Application |
| Compliance Schema (080) | 1.0.0 | Custom Application |

### 2.2 Migrations Under IQ

| Migration | Description | GxP Impact |
|-----------|-------------|------------|
| 073_cortex_prime_unified_brain | Core 5-table brain | HIGH |
| 074_gcc_regulatory_intuition_engine | Regulatory patterns | HIGH |
| 075_gcc_epistemic_intelligence | Uncertainty quantification | HIGH |
| 076_gcc_causal_inference_engine | Causal reasoning | HIGH |
| 077_gcc_self_evolving_intelligence | Learning system | CRITICAL |
| 078_gcc_cross_domain_transfer | Knowledge transfer | HIGH |
| 079_gcc_unified_functions_views | Integration layer | MEDIUM |
| 080_gcc_21cfr_part11_compliance | Compliance infrastructure | CRITICAL |

---

## 3. Prerequisites Checklist

| # | Prerequisite | Verified | Date | Initials |
|---|--------------|----------|------|----------|
| 3.1 | Database server provisioned per specification | ☐ | | |
| 3.2 | Network connectivity verified | ☐ | | |
| 3.3 | Storage allocation meets requirements | ☐ | | |
| 3.4 | Backup systems configured | ☐ | | |
| 3.5 | Security certificates installed | ☐ | | |
| 3.6 | Access credentials secured | ☐ | | |
| 3.7 | Development environment isolated | ☐ | | |

---

## 4. Installation Verification Tests

### 4.1 Infrastructure Verification

#### IQ-001: Database Server Installation

**Objective:** Verify PostgreSQL database server is correctly installed.

| Step | Action | Expected Result | Actual Result | Pass/Fail |
|------|--------|-----------------|---------------|-----------|
| 1 | Connect to database server | Connection successful | | ☐ |
| 2 | Execute: `SELECT version();` | PostgreSQL 15.x | | ☐ |
| 3 | Verify max_connections >= 100 | Value >= 100 | | ☐ |
| 4 | Verify shared_buffers >= 256MB | Value >= 256MB | | ☐ |

```sql
-- Verification Query
SELECT version();
SHOW max_connections;
SHOW shared_buffers;
```

**Results:**
- PostgreSQL Version: _________________
- max_connections: _________________
- shared_buffers: _________________

**Executed By:** _________________ **Date:** _________

---

#### IQ-002: pgvector Extension Installation

**Objective:** Verify pgvector extension is correctly installed.

| Step | Action | Expected Result | Actual Result | Pass/Fail |
|------|--------|-----------------|---------------|-----------|
| 1 | Check extension exists | Extension listed | | ☐ |
| 2 | Verify version | 0.5.x or higher | | ☐ |
| 3 | Test vector operations | No errors | | ☐ |

```sql
-- Verification Query
SELECT * FROM pg_extension WHERE extname = 'vector';

-- Test vector operation
SELECT '[1,2,3]'::vector <-> '[4,5,6]'::vector AS distance;
```

**Results:**
- pgvector Version: _________________
- Vector operation result: _________________

**Executed By:** _________________ **Date:** _________

---

### 4.2 Schema Installation Verification

#### IQ-003: Cortex Schema Creation

**Objective:** Verify cortex schema exists with correct ownership.

| Step | Action | Expected Result | Actual Result | Pass/Fail |
|------|--------|-----------------|---------------|-----------|
| 1 | Verify schema exists | Schema 'cortex' exists | | ☐ |
| 2 | Verify ownership | Correct owner | | ☐ |
| 3 | Verify grants | Permissions match spec | | ☐ |

```sql
-- Verification Query
SELECT schema_name, schema_owner 
FROM information_schema.schemata 
WHERE schema_name = 'cortex';

-- Check grants
SELECT grantee, privilege_type 
FROM information_schema.schema_privileges 
WHERE schema_name = 'cortex';
```

**Results:**
- Schema Owner: _________________
- Grants Verified: ☐ Yes ☐ No

**Executed By:** _________________ **Date:** _________

---

#### IQ-004: Core Tables Installation (Migration 073)

**Objective:** Verify all core Cortex tables are created correctly.

| Table | Exists | Column Count | Indexes | RLS Enabled | Pass/Fail |
|-------|--------|--------------|---------|-------------|-----------|
| cortex.atoms | ☐ | Expected: 15 | ☐ | ☐ | ☐ |
| cortex.edges | ☐ | Expected: 10 | ☐ | ☐ | ☐ |
| cortex.agents | ☐ | Expected: 12 | ☐ | ☐ | ☐ |
| cortex.traces | ☐ | Expected: 14 | ☐ | ☐ | ☐ |
| cortex.threads | ☐ | Expected: 13 | ☐ | ☐ | ☐ |
| cortex.atom_types | ☐ | Expected: 5 | ☐ | ☐ | ☐ |

```sql
-- Verification Query
SELECT table_name, 
       (SELECT COUNT(*) FROM information_schema.columns c 
        WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'cortex';

-- Check RLS
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'cortex';
```

**Executed By:** _________________ **Date:** _________

---

#### IQ-005: Regulatory Intuition Tables (Migration 074)

**Objective:** Verify regulatory intuition tables are created correctly.

| Table | Exists | Column Count | Indexes | Pass/Fail |
|-------|--------|--------------|---------|-----------|
| cortex.regulatory_signals | ☐ | Expected: 18 | ☐ | ☐ |
| cortex.rejection_patterns | ☐ | Expected: 16 | ☐ | ☐ |
| cortex.intuition_predictions | ☐ | Expected: 15 | ☐ | ☐ |
| cortex.soft_signals | ☐ | Expected: 12 | ☐ | ☐ |
| cortex.timeline_predictions | ☐ | Expected: 14 | ☐ | ☐ |

**Executed By:** _________________ **Date:** _________

---

#### IQ-006: Epistemic Intelligence Tables (Migration 075)

**Objective:** Verify epistemic intelligence tables are created correctly.

| Table | Exists | Column Count | Indexes | Pass/Fail |
|-------|--------|--------------|---------|-----------|
| cortex.uncertainty_estimates | ☐ | Expected: 14 | ☐ | ☐ |
| cortex.knowledge_gaps | ☐ | Expected: 12 | ☐ | ☐ |
| cortex.active_learning_queue | ☐ | Expected: 10 | ☐ | ☐ |
| cortex.confidence_triggers | ☐ | Expected: 11 | ☐ | ☐ |
| cortex.calibration_log | ☐ | Expected: 10 | ☐ | ☐ |
| cortex.confidence_history | ☐ | Expected: 8 | ☐ | ☐ |

**Executed By:** _________________ **Date:** _________

---

#### IQ-007: Causal Inference Tables (Migration 076)

**Objective:** Verify causal inference tables are created correctly.

| Table | Exists | Column Count | Indexes | Pass/Fail |
|-------|--------|--------------|---------|-----------|
| cortex.causal_graphs | ☐ | Expected: 12 | ☐ | ☐ |
| cortex.causal_effects | ☐ | Expected: 14 | ☐ | ☐ |
| cortex.counterfactual_scenarios | ☐ | Expected: 12 | ☐ | ☐ |
| cortex.interventions | ☐ | Expected: 13 | ☐ | ☐ |
| cortex.causal_discovery_runs | ☐ | Expected: 10 | ☐ | ☐ |
| cortex.mechanism_library | ☐ | Expected: 11 | ☐ | ☐ |

**Executed By:** _________________ **Date:** _________

---

#### IQ-008: Self-Evolving Intelligence Tables (Migration 077)

**Objective:** Verify self-evolving intelligence tables are created correctly.

| Table | Exists | Column Count | Indexes | Pass/Fail |
|-------|--------|--------------|---------|-----------|
| cortex.learning_experiences | ☐ | Expected: 14 | ☐ | ☐ |
| cortex.distilled_insights | ☐ | Expected: 13 | ☐ | ☐ |
| cortex.expertise_scores | ☐ | Expected: 11 | ☐ | ☐ |
| cortex.evolution_ledger | ☐ | Expected: 10 | ☐ | ☐ |
| cortex.prompt_evolution | ☐ | Expected: 12 | ☐ | ☐ |
| cortex.drift_detection | ☐ | Expected: 13 | ☐ | ☐ |
| cortex.federated_learning_state | ☐ | Expected: 10 | ☐ | ☐ |

**Executed By:** _________________ **Date:** _________

---

#### IQ-009: Cross-Domain Transfer Tables (Migration 078)

**Objective:** Verify cross-domain transfer tables are created correctly.

| Table | Exists | Column Count | Indexes | Pass/Fail |
|-------|--------|--------------|---------|-----------|
| cortex.domain_knowledge | ☐ | Expected: 14 | ☐ | ☐ |
| cortex.transfer_mappings | ☐ | Expected: 14 | ☐ | ☐ |
| cortex.transfer_episodes | ☐ | Expected: 12 | ☐ | ☐ |
| cortex.meta_transfer_model | ☐ | Expected: 11 | ☐ | ☐ |
| cortex.domain_similarity_cache | ☐ | Expected: 8 | ☐ | ☐ |
| cortex.transfer_templates | ☐ | Expected: 10 | ☐ | ☐ |

**Executed By:** _________________ **Date:** _________

---

#### IQ-010: 21 CFR Part 11 Compliance Tables (Migration 080)

**Objective:** Verify compliance infrastructure is created correctly.

| Table | Exists | Column Count | Immutable Trigger | RLS | Pass/Fail |
|-------|--------|--------------|-------------------|-----|-----------|
| compliance.audit_trail | ☐ | Expected: 24 | ☐ | ☐ | ☐ |
| compliance.electronic_signatures | ☐ | Expected: 22 | ☐ | ☐ | ☐ |
| compliance.access_controls | ☐ | Expected: 14 | N/A | ☐ | ☐ |
| compliance.validation_records | ☐ | Expected: 18 | N/A | ☐ | ☐ |
| compliance.change_control | ☐ | Expected: 26 | N/A | ☐ | ☐ |
| compliance.data_integrity_checks | ☐ | Expected: 14 | N/A | ☐ | ☐ |
| compliance.data_residency | ☐ | Expected: 14 | N/A | ☐ | ☐ |

**Executed By:** _________________ **Date:** _________

---

### 4.3 Function Installation Verification

#### IQ-011: Core Functions

**Objective:** Verify all required functions are installed.

| Function | Schema | Exists | Security Definer | Pass/Fail |
|----------|--------|--------|------------------|-----------|
| unified_search | cortex | ☐ | ☐ | ☐ |
| unified_search_fast | cortex | ☐ | ☐ | ☐ |
| traverse_reasoning | cortex | ☐ | ☐ | ☐ |
| assemble_context | cortex | ☐ | ☐ | ☐ |
| query | cortex | ☐ | ☐ | ☐ |
| health_check | cortex | ☐ | ☐ | ☐ |
| extract_regulatory_signals | cortex | ☐ | ☐ | ☐ |
| generate_intuition_prediction | cortex | ☐ | ☐ | ☐ |
| estimate_uncertainty | cortex | ☐ | ☐ | ☐ |
| estimate_causal_effect | cortex | ☐ | ☐ | ☐ |
| record_learning_experience | cortex | ☐ | ☐ | ☐ |
| run_distillation | cortex | ☐ | ☐ | ☐ |
| evolve | cortex | ☐ | ☐ | ☐ |
| find_transfer_candidates | cortex | ☐ | ☐ | ☐ |
| execute_transfer | cortex | ☐ | ☐ | ☐ |

```sql
-- Verification Query
SELECT 
    n.nspname as schema,
    p.proname as function_name,
    CASE WHEN p.prosecdef THEN 'YES' ELSE 'NO' END as security_definer
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname IN ('cortex', 'compliance');
```

**Executed By:** _________________ **Date:** _________

---

#### IQ-012: Compliance Functions

**Objective:** Verify compliance functions are installed correctly.

| Function | Schema | Exists | Pass/Fail |
|----------|--------|--------|-----------|
| write_audit_entry | compliance | ☐ | ☐ |
| create_electronic_signature | compliance | ☐ | ☐ |
| verify_audit_chain | compliance | ☐ | ☐ |
| generate_record_hash | compliance | ☐ | ☐ |
| generate_chain_hash | compliance | ☐ | ☐ |

**Executed By:** _________________ **Date:** _________

---

### 4.4 Index Verification

#### IQ-013: Vector Indexes

**Objective:** Verify HNSW indexes for vector search are created.

| Index | Table | Type | Exists | Pass/Fail |
|-------|-------|------|--------|-----------|
| idx_atoms_embedding_3072 | cortex.atoms | HNSW | ☐ | ☐ |
| idx_atoms_embedding_1536 | cortex.atoms | HNSW | ☐ | ☐ |

```sql
-- Verification Query
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE schemaname = 'cortex' 
  AND indexname LIKE '%embedding%';
```

**Executed By:** _________________ **Date:** _________

---

### 4.5 Security Verification

#### IQ-014: Row-Level Security

**Objective:** Verify RLS is enabled on all required tables.

| Table | RLS Enabled | Policies Exist | Pass/Fail |
|-------|-------------|----------------|-----------|
| cortex.atoms | ☐ | ☐ | ☐ |
| cortex.edges | ☐ | ☐ | ☐ |
| cortex.traces | ☐ | ☐ | ☐ |
| cortex.threads | ☐ | ☐ | ☐ |
| compliance.audit_trail | ☐ | ☐ | ☐ |
| compliance.electronic_signatures | ☐ | ☐ | ☐ |

```sql
-- Verification Query
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname IN ('cortex', 'compliance')
  AND rowsecurity = true;

-- Check policies
SELECT * FROM pg_policies 
WHERE schemaname IN ('cortex', 'compliance');
```

**Executed By:** _________________ **Date:** _________

---

#### IQ-015: Audit Trail Immutability

**Objective:** Verify audit trail cannot be modified or deleted.

| Test | Action | Expected Result | Actual Result | Pass/Fail |
|------|--------|-----------------|---------------|-----------|
| 1 | Attempt UPDATE on audit_trail | Error raised | | ☐ |
| 2 | Attempt DELETE on audit_trail | Error raised | | ☐ |
| 3 | Verify trigger exists | Trigger active | | ☐ |

```sql
-- Test UPDATE (should fail)
UPDATE compliance.audit_trail SET event_type = 'TEST' WHERE id = (SELECT id FROM compliance.audit_trail LIMIT 1);
-- Expected error: "21 CFR Part 11 Violation: Audit trail records are immutable"

-- Test DELETE (should fail)
DELETE FROM compliance.audit_trail WHERE id = (SELECT id FROM compliance.audit_trail LIMIT 1);
-- Expected error: "21 CFR Part 11 Violation: Audit trail records are immutable"
```

**Results:**
- UPDATE Error Message: _________________
- DELETE Error Message: _________________

**Executed By:** _________________ **Date:** _________

---

## 5. IQ Summary

### 5.1 Test Results Summary

| Category | Total Tests | Passed | Failed | N/A |
|----------|-------------|--------|--------|-----|
| Infrastructure | | | | |
| Schema Installation | | | | |
| Table Installation | | | | |
| Function Installation | | | | |
| Index Installation | | | | |
| Security Verification | | | | |
| **TOTAL** | | | | |

### 5.2 Deviations

| Deviation # | Description | Severity | Resolution |
|-------------|-------------|----------|------------|
| | | | |
| | | | |

### 5.3 IQ Conclusion

☐ **PASSED** - All tests passed, system installed correctly  
☐ **PASSED WITH DEVIATIONS** - Minor deviations documented and resolved  
☐ **FAILED** - Critical/major deviations require resolution before OQ

---

## 6. Approval Signatures

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Executed By | _________________ | _________________ | ________ |
| Reviewed By | _________________ | _________________ | ________ |
| QA Approved | _________________ | _________________ | ________ |

---

**⚠️ DRAFT - REQUIRES VALIDATION REVIEW BEFORE PRODUCTION USE**

*This protocol is generated as a draft template. All tests must be executed and documented by qualified personnel.*
