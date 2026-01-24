# Concept2Cure v3.0 Enterprise Architecture Implementation

## Overview

This document describes the implementation of the Concept2Cure v3.0 Enterprise Architecture for Life Sciences regulatory submissions. The architecture is native to **eCTD v4.0/HL7 RPS** and leverages **Neon (Serverless Postgres)** for optimal performance and compliance.

## Architecture Highlights

### 1. Domain Registry Layer (Migration 050)
- **Schema:** `common_standards`
- **Purpose:** The "physics" of regulatory compliance - immutable rules from agencies

**Tables Created:**
- `global_regulatory_authorities` - 11 global agencies (FDA, EMA, PMDA, Health Canada, NMPA, etc.)
- `controlled_vocabularies` - eCTD v4.0 CV master list with OIDs
- `cv_terms` - Individual CV values with hierarchy and legacy v3.2.2 mapping
- `clinical_study_types` - 15 types (Phase 1-4, FIH, Pivotal, Device, IVD, etc.)
- `submission_types` - 16 types (IND, NDA, BLA, ANDA, 510K, PMA, DE_NOVO, EUA, etc.)
- `therapeutic_areas` - 16 areas (Oncology, CNS, Rare Disease, etc.)
- `document_types` - 28 types including medical device and IVD-specific

**Key Features:**
- Medical device and IVD support flags on regulatory authorities
- Full support for 510(k), PMA, De Novo, and EUA submissions
- Helper functions: `get_validation_criteria()`, `get_cv_terms()`, `get_required_modules()`

### 2. Multi-Tenant Identity Core (Migration 051)
- **Schema:** `identity`
- **Purpose:** Sponsor/CRO relationship management with delegated access

**Tables Created:**
- `organizations` - Multi-tenant with SSO, Part 11 signatures, data residency
- `users` - Part 11 compliant with signature authority, MFA tracking
- `org_relationships` - Sponsor/CRO contracts with granular permissions
- `user_program_access` - User-level program permissions

**ENUMs:**
- `org_business_model` - 8 types (BIO_PHARMA_SPONSOR, CRO_PARTNER, DEVICE_MANUFACTURER, IVD_DIAGNOSTICS, etc.)
- `access_level` - 4 levels (READ_ONLY, CONTRIBUTOR, MANAGER, ADMIN)
- `user_role` - 11 roles (ADMIN, RA_LEAD, RA_SPECIALIST, CLINICAL_OPS, CMC_SPECIALIST, etc.)

**SECURITY DEFINER Functions:**
- `check_org_access(target_org_id)` - Direct + delegated access check
- `check_org_write_access(target_org_id)` - Write permission check
- `check_signing_authority(target_org_id)` - Part 11 signing authority check
- `set_app_context()` - Session context for RLS

### 3. eCTD v4.0 Context of Use Graph Model (Migration 052)
- **Schema:** `ectd_v4`
- **Purpose:** HL7 RPS-compliant graph model replacing folder hierarchy

**Core Tables:**
- `regulatory_submissions` - The application container (IND, NDA, 510k, etc.)
- `submission_units` - Sequences sent to agencies
- `documents` - Reusable content objects with checksums
- `context_of_use_elements` - The graph nodes linking documents to eCTD structure
- `keyword_definitions` - Sender-Defined Keywords (v4.0 flex factor)
- `cou_relationships` - Graph edges for replacement chains

**Key v4.0 Features:**
- **Context Group Code** - Replaces folder paths (e.g., 'm3-2-s-drug-substance')
- **Priority Number** - Document ordering (no folders in v4.0)
- **Lifecycle Status** - ACTIVE, REPLACED, SUSPENDED (replaces "delete")
- **Document Reuse** - One document, many contexts across submissions

**Functions:**
- `get_submission_tree(unit_id)` - Recursive CTE for virtual tree reconstruction
- `get_document_reuse(document_id)` - Shows all contexts referencing a document
- `transition_cou_lifecycle()` - Manages lifecycle transitions

### 4. Row-Level Security (Migration 053)
- **Purpose:** Multi-tenant isolation using SECURITY DEFINER pattern

**RLS Enabled Tables:**
- `ectd_v4.regulatory_submissions`
- `ectd_v4.submission_units`
- `ectd_v4.documents`
- `ectd_v4.context_of_use_elements`
- `ectd_v4.keyword_definitions`
- `identity.users`

**Pattern:** 
```sql
-- Session context (PgBouncer compatible)
SELECT identity.set_app_context(user_id, org_id);

-- RLS policy uses SECURITY DEFINER function
CREATE POLICY rls_select ON table FOR SELECT
    USING (identity.can_access_org(org_id));
```

### 5. Part 11 Audit Trail (Migration 054)
- **Schema:** `audit`
- **Purpose:** 21 CFR Part 11 compliant immutable audit trail

**Tables Created:**
- `event_log` - Immutable audit trail with 30+ event categories
- `signature_log` - Electronic signature records with cryptographic hashes

**Event Categories:**
- Data: CREATE, UPDATE, DELETE, ARCHIVE
- Lifecycle: LIFECYCLE_TRANSITION, DOCUMENT_UPLOAD, DOCUMENT_REPLACE
- Security: LOGIN_SUCCESS, LOGIN_FAILURE, PASSWORD_CHANGE, MFA_ENABLED
- Signatures: SIGNATURE_APPLIED, SIGNATURE_INVALIDATED, ATTESTATION_RECORDED
- Submission: SUBMISSION_CREATED, VALIDATION_STARTED, SUBMISSION_PUBLISHED

**Part 11 Compliance:**
- Computer-generated timestamps (UTC)
- User identification captured at event time (denormalized)
- Record hash for tamper detection
- DELETE/TRUNCATE revoked - true immutability

### 6. Test Scenarios (Migration 055)
**Organizations Seeded:**
- CardioTech Medical Devices Inc. (DEVICE_MANUFACTURER)
- DiagnoSure Labs Inc. (IVD_DIAGNOSTICS)
- NeuroBio Therapeutics (BIO_PHARMA_SPONSOR)
- Stanford University Medical Center (ACADEMIC_INSTITUTION)
- GlobalTrials CRO (CRO_PARTNER)

**Submissions Created:**
- **510(k)** - CardioGuard Pro (Implantable Cardiac Defibrillator)
- **EUA** - DiagnoSure SARS-CoV-2 Rapid Test
- **IND** - NeuroBio NB-401 (Neuroplastin Modulator) with 3 sequences
- **IDE** - Stanford Neural Interface Study

**CRO Relationship:**
- NeuroBio (Sponsor) → GlobalTrials (CRO) - Active contract with full permissions

## Running Migrations

### Prerequisites
- Node.js 18+ with `pg` and `dotenv` packages
- PostgreSQL client (`psql`)
- Neon database with connection string in `.env`

### Execution
```bash
# Using Node.js runner
node run_concept2cure_migrations.js

# Using shell script
./run_ectd_v4_migrations.sh

# Manual execution
psql $DATABASE_URL -f db/migrations/050_gcc_ectd_v4_domain_registry.sql
psql $DATABASE_URL -f db/migrations/051_gcc_multi_tenant_identity.sql
psql $DATABASE_URL -f db/migrations/052_gcc_ectd_v4_cou_graph.sql
psql $DATABASE_URL -f db/migrations/053_gcc_rls_policies.sql
psql $DATABASE_URL -f db/migrations/054_gcc_part11_audit.sql
psql $DATABASE_URL -f db/migrations/055_gcc_test_scenarios.sql

# Run test suite
psql $DATABASE_URL -f db/migrations/056_gcc_test_runner.sql
```

## API Integration Points

### Setting User Context (Every Request)
```sql
SELECT identity.set_app_context(
    '660e8400-e29b-41d4-a716-446655440001'::UUID,  -- user_id
    '550e8400-e29b-41d4-a716-446655440010'::UUID   -- org_id
);
```

### Creating a Submission
```sql
INSERT INTO ectd_v4.regulatory_submissions (
    org_id, application_number, application_type,
    proprietary_name, authority_id, sponsor_name
) VALUES (
    current_setting('app.current_org_id')::UUID,
    'IND 999999',
    'IND',
    'Test Drug',
    'US_FDA',
    'Test Sponsor'
);
```

### Adding a Document to CoU
```sql
-- 1. Upload document
INSERT INTO ectd_v4.documents (org_id, title, storage_url, original_filename, mime_type, checksum_md5)
VALUES (...) RETURNING id;

-- 2. Create Context of Use
INSERT INTO ectd_v4.context_of_use_elements (
    submission_unit_id, context_group_code, priority_number,
    document_reference_id, lifecycle_status
) VALUES (
    'unit-uuid', 'm3-2-s-drug-substance', 1,
    'doc-uuid', 'ACTIVE'
);
```

### Applying Electronic Signature
```sql
SELECT audit.apply_signature(
    'ectd_v4.regulatory_submissions',  -- entity_type
    'submission-uuid'::UUID,           -- entity_id
    'IND 999888 - Original Application', -- description
    'APPROVAL',                        -- meaning
    'I approve this submission for FDA',  -- reason
    'MFA_TOTP'                         -- auth_method
);
```

### Querying Submission Tree
```sql
SELECT * FROM ectd_v4.get_submission_tree('submission-unit-uuid'::UUID);
```

## Compliance Mapping

| Requirement | Implementation |
|-------------|----------------|
| FDA 21 CFR Part 11.10(a) | Validated system with audit trail |
| FDA 21 CFR Part 11.10(e) | `audit.event_log` with immutable records |
| FDA 21 CFR Part 11.50 | `audit.signature_log` with e-signatures |
| FDA 21 CFR Part 11.70 | Signature/record linking via hash |
| ICH eCTD v4.0 | `context_of_use_elements` graph model |
| ICH M8 | Controlled vocabularies from `common_standards` |
| GDPR | Data residency tracking in `organizations` |
| SOC2 | Role-based access, audit trail |

## Files Created

| Migration | File | Purpose |
|-----------|------|---------|
| 050 | `050_gcc_ectd_v4_domain_registry.sql` | Domain Registry Layer |
| 051 | `051_gcc_multi_tenant_identity.sql` | Multi-Tenant Identity |
| 052 | `052_gcc_ectd_v4_cou_graph.sql` | eCTD v4.0 CoU Graph |
| 053 | `053_gcc_rls_policies.sql` | RLS Policies |
| 054 | `054_gcc_part11_audit.sql` | Part 11 Audit Trail |
| 055 | `055_gcc_test_scenarios.sql` | Test Data |
| 056 | `056_gcc_test_runner.sql` | Test Suite |
| - | `run_concept2cure_migrations.js` | Node.js Runner |
| - | `run_ectd_v4_migrations.sh` | Shell Runner |

## Next Steps

1. **Run migrations** against Neon database
2. **Verify test suite** passes all checks
3. **Integrate API layer** with context setting
4. **Implement validation branching** (Neon-specific feature)
5. **Enable Time Travel queries** for forensic audit

---
*Concept2Cure v3.0 Enterprise Architecture - January 2026*
