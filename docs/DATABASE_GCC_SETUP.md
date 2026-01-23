# Global Command Center (GCC) Database Setup

This document describes how to set up and manage the Concept2Cure Global Command Center database schema on Neon PostgreSQL with pgvector.

## Overview

The GCC schema provides:

| Schema | Purpose |
|--------|---------|
| `truth` | Scientific Ground Truth - immutable facts from CSR, SDTM/ADaM, lab data |
| `prose` | Regulatory Prose - versioned eCTD fragments with semantic embeddings |
| `adversarial` | Adversarial Simulation - historical regulator questions for IR prediction |
| `audit` | Audit Trail - append-only logs for 21 CFR Part 11 compliance |

## Prerequisites

- Neon PostgreSQL account with pgvector enabled
- `psql` command-line tool
- (Optional) Neon CLI for branch management

## Quick Start

### 1. Set Environment Variables

```bash
# From project root, source the .env file
source .env

# Or set DATABASE_URL directly
export DATABASE_URL="postgresql://user:pass@host:5432/db?sslmode=require"
```

### 2. Run Migrations

```bash
# Make the migration script executable
chmod +x scripts/db_migrate.sh

# Run migrations
./scripts/db_migrate.sh
```

### 3. Verify Installation

```bash
psql "$DATABASE_URL" -f scripts/db_verify.sql
```

## Neon Branching (Recommended)

For safe schema testing, create a Neon branch before applying migrations:

### Install Neon CLI

```bash
npm i -g neonctl
neon --version
```

### Authenticate

```bash
neon auth
# OR set API key
export NEON_API_KEY="your-api-key"
```

### Create Branch

```bash
# List projects
neon projects list

# Create branch from main
neon branches create \
    --name prod-v1-schema \
    --parent main \
    --project-id <your-project-id>
```

### Get Branch Connection String

```bash
neon connection-string prod-v1-schema --project-id <your-project-id>
```

### Apply Migrations to Branch

```bash
export DATABASE_URL="<branch-connection-string>"
./scripts/db_migrate.sh
psql "$DATABASE_URL" -f scripts/db_verify.sql
```

### Merge to Main

After verification, apply the same migrations to your main branch.

## Schema Details

### truth.clinical_truth_store

Stores immutable scientific datapoints from clinical studies.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `nct_id` | TEXT | ClinicalTrials.gov ID |
| `substance_id` | TEXT | ISO 11238 / UNII identifier |
| `metric_name` | TEXT | Metric name (Cmax, AUC, p_value, etc.) |
| `metric_value_float` | DOUBLE | Numeric value |
| `metric_value_text` | TEXT | Text value |
| `is_primary_endpoint` | BOOLEAN | Primary endpoint flag |
| `source_document_ref` | TEXT | Source document reference |
| `source_document_hash` | TEXT | SHA-256 hash for provenance |

**Constraints:**
- At least one of `metric_value_float` or `metric_value_text` must be present
- Composite uniqueness on fact tuple (no duplicate facts)
- **Append-only** - UPDATE/DELETE blocked by trigger

### prose.smart_fragments

Stores versioned eCTD module narrative fragments.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `ectd_section_path` | TEXT | eCTD section (m2.7.3-efficacy-summary) |
| `jurisdiction` | TEXT | Target jurisdiction (FDA, EMA, etc.) |
| `content_prose` | TEXT | Narrative text |
| `embedding` | VECTOR(1536) | Semantic embedding |
| `objectivity_score` | DOUBLE | 0-1 objectivity score |
| `confidence_rating` | TEXT | Conclusive/Interpretive/Ambiguous |
| `version_id` | INT | Version number |

**Indexes:**
- HNSW index on `embedding` for fast similarity search

### prose.fragment_truth_links

Maps prose claims to truth datapoints (the "claims ledger").

| Column | Type | Description |
|--------|------|-------------|
| `fragment_id` | UUID | FK to smart_fragments |
| `truth_id` | UUID | FK to clinical_truth_store |
| `claim_kind` | TEXT | supports/contradicts/efficacy/safety/etc. |
| `claim_span` | JSONB | Location in prose text |
| `extracted_claim_value` | JSONB | Claimed value for drift detection |

### adversarial.regulatory_adversarial_precedents

Historical regulator questions for IR prediction.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `agency_code` | TEXT | Regulatory agency (FDA, EMA, etc.) |
| `failure_mode` | TEXT | Clinical Gap, CMC Inconsistency, etc. |
| `historical_question` | TEXT | Actual regulator question |
| `precedent_vector` | VECTOR(1536) | Semantic embedding |
| `source_ref` | TEXT | Document reference |

**Indexes:**
- HNSW index on `precedent_vector` for similarity search

### audit.concomitant_audit_logs

Append-only audit trail for 21 CFR Part 11 compliance.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `fragment_id` | UUID | Optional FK to fragment |
| `agent_identity` | TEXT | SHADOW_AGENT/LUMEN_CORTEX/user |
| `risk_status` | TEXT | ALIGNED/DATA_DRIFT/IR_PREDICTED |
| `feedback_payload` | JSONB | AI analysis payload |
| `drift_magnitude` | DOUBLE | Drift score |
| `request_id` | TEXT | External request correlation |

**Immutability:**
- UPDATE and DELETE are blocked by database trigger
- Only INSERT operations are allowed
- This supports 21 CFR Part 11 audit trail requirements

## Shadow Interrogation Service

A Python FastAPI service that performs adversarial analysis using this schema.

### Start the Service

```bash
cd shadow_service
pip install -e .
uvicorn shadow_service.main:app --reload --port 8001
```

### API Documentation

Once running, visit http://localhost:8001/docs for interactive API docs.

### Key Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/truth` | POST | Insert truth datapoint |
| `/fragments` | POST | Create prose fragment |
| `/fragments/{id}/link-truth` | POST | Link fragment to truth |
| `/shadow/interrogate/{id}` | POST | Run adversarial analysis |
| `/audit/recent` | GET | View recent audit logs |

## Troubleshooting

### Extension Not Found

```sql
-- Verify pgvector is available
SELECT * FROM pg_available_extensions WHERE name = 'vector';

-- Enable if available
CREATE EXTENSION IF NOT EXISTS vector;
```

### Connection Issues

```bash
# Test basic connectivity
psql "$DATABASE_URL" -c "SELECT 1"

# Check SSL mode
psql "$DATABASE_URL?sslmode=require" -c "SELECT version()"
```

### Trigger Test

```sql
-- This should FAIL (proving immutability)
UPDATE audit.concomitant_audit_logs SET risk_status = 'TEST';
-- Expected: ERROR: COMPLIANCE VIOLATION: audit.concomitant_audit_logs is append-only
```

## Compliance Notes

This schema provides **database primitives** to support 21 CFR Part 11 compliance:

- ✅ Append-only audit logs (UPDATE/DELETE blocked)
- ✅ Timestamped entries (created_at)
- ✅ Agent/user attribution (agent_identity)
- ✅ Traceability (fragment ↔ truth links)
- ✅ Immutable truth store (optional)

**Note:** Full 21 CFR Part 11 compliance also requires:
- Validated SOPs
- User training documentation
- System validation protocols
- Access control policies
- Data retention policies
- Electronic signature procedures

This schema is the technical foundation; organizational controls complete the compliance picture.
