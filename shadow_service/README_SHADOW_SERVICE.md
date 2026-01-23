# Shadow Interrogation Service

**Regulatory-grade adversarial risk assessment for prose fragments.**

## What It Does

The Shadow Interrogation Service implements the "Shadow Agent Loop" that:

1. **Grounds prose against truth**: Links narrative text to verified clinical data points
2. **Computes drift**: Measures discrepancy between claimed values and source data
3. **Predicts IR questions**: Uses pgvector similarity search to find historical regulatory questions
4. **Determines risk status**: Classifies fragments as ALIGNED / DATA_DRIFT / IR_PREDICTED
5. **Creates audit trails**: Writes append-only logs for 21 CFR Part 11 compliance
6. **Provides heatmaps**: Rollup views for Command Center dashboards

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Shadow Interrogation Service                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐         │
│   │   Fragment   │    │    Truth     │    │  Precedent   │         │
│   │   CRUD       │    │   Store      │    │   Store      │         │
│   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘         │
│          │                    │                   │                  │
│          └────────────────────┼───────────────────┘                  │
│                              │                                       │
│                    ┌─────────▼─────────┐                            │
│                    │  Shadow Agent     │                            │
│                    │  ─────────────    │                            │
│                    │  • Load fragment  │                            │
│                    │  • Get truth links│                            │
│                    │  • Compute drift  │                            │
│                    │  • Find precedents│                            │
│                    │  • Classify risk  │                            │
│                    │  • Write audit    │                            │
│                    └─────────┬─────────┘                            │
│                              │                                       │
│                    ┌─────────▼─────────┐                            │
│                    │   Audit Log       │                            │
│                    │   (append-only)   │                            │
│                    └───────────────────┘                            │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Configure Environment

```bash
cp .env.example .env
# Edit .env with your Neon DATABASE_URL
```

### 2. Install Dependencies

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3. Seed Demo Data

```bash
python scripts/seed_demo.py
```

### 4. Start the Service

```bash
./scripts/run_dev.sh
# or
python run_shadow_mvp.py
```

### 5. Test the Loop

```bash
# Get a fragment ID from seed output, then:
curl -X POST http://localhost:8001/shadow/interrogate/{fragment_id} \
  -H "X-Actor: dev@yourco.com"

# View heatmap
curl http://localhost:8001/heatmap
```

## API Endpoints

### Core Operations

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Service health check |
| `/truth` | POST | Create truth datapoint |
| `/fragments` | POST | Create prose fragment |
| `/fragments/{id}` | PATCH | Update fragment (creates new version) |
| `/fragments/{id}/versions` | GET | Get version history |
| `/fragments/{id}/link-truth` | POST | Link fragment to truth datapoint |
| `/precedents` | POST | Create regulatory precedent |

### Shadow Interrogation

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/shadow/interrogate/{fragment_id}` | POST | Full interrogation with audit |
| `/shadow/interrogate-section` | POST | Batch interrogate section |
| `/shadow/gate-check` | GET | Submission readiness check |

### Command Center

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/heatmap` | GET | Full heatmap (sections + jurisdictions) |
| `/heatmap/sections` | GET | Section risk rollups |
| `/heatmap/jurisdictions` | GET | Jurisdiction summaries |
| `/heatmap/risky-fragments` | GET | Top risky fragments |

### Snapshots

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/snapshots` | GET/POST | List or create snapshots |
| `/snapshots/{id}` | GET/PATCH | Get or update snapshot status |
| `/snapshots/{id}/fragments` | GET/POST | Manage snapshot fragments |
| `/snapshots/{id}/gate` | GET | Get gate metrics |

### Workflow Automation (NEW)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/automation/snapshot` | POST | One-click: create → populate → interrogate → freeze |
| `/automation/batch-interrogate` | POST | Batch interrogate section (stale only or force all) |
| `/automation/snapshots/{id}/freeze` | POST | Freeze with gate check (or force with reason) |
| `/automation/snapshots/{id}/status` | GET | Get comprehensive workflow status |

## Workflow Automation

The automation endpoints provide "one-click" operations for Command Center workflows:

### Create Automated Snapshot

```bash
curl -X POST http://localhost:8001/automation/snapshot \
  -H "Content-Type: application/json" \
  -H "X-User: reg.writer@yourco.com" \
  -d '{
    "snapshot_name": "FDA-NDA-2024-Q1",
    "jurisdiction": "FDA",
    "section_patterns": ["m2.5%", "m2.7%"],
    "target_agency": "CDER",
    "dossier_type": "NDA",
    "auto_interrogate": true,
    "freeze_if_gate_passes": true
  }'
```

This will:
1. Create a DRAFT snapshot
2. Add all fragments matching the patterns for FDA
3. Interrogate all added fragments
4. Freeze if gate check passes (no RED fragments, all linked)

### Batch Interrogate Section

```bash
# Only interrogate stale fragments (>24h or never assessed)
curl -X POST http://localhost:8001/automation/batch-interrogate \
  -H "Content-Type: application/json" \
  -d '{
    "section_pattern": "m2.7.3%",
    "jurisdiction": "FDA",
    "force_all": false
  }'

# Force re-interrogate everything
curl -X POST http://localhost:8001/automation/batch-interrogate \
  -H "Content-Type: application/json" \
  -d '{
    "section_pattern": "m2.%",
    "force_all": true
  }'
```

### Freeze Snapshot with Gate Check

```bash
# Normal freeze (requires gate pass)
curl -X POST http://localhost:8001/automation/snapshots/{snapshot_id}/freeze \
  -H "X-User: reg.director@yourco.com"

# Force freeze with override (audited)
curl -X POST http://localhost:8001/automation/snapshots/{snapshot_id}/freeze \
  -H "Content-Type: application/json" \
  -H "X-User: reg.director@yourco.com" \
  -d '{
    "force": true,
    "override_reason": "Approved by QA Director per waiver QA-2024-001"
  }'
```
| `/fragments/{id}/versions` | GET | Get version history |
| `/fragments/{id}/link-truth` | POST | Link fragment to truth datapoint |
| `/precedents` | POST | Create regulatory precedent |

### Shadow Interrogation

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/shadow/interrogate/{fragment_id}` | POST | Full interrogation with audit |
| `/shadow/interrogate-section` | POST | Batch interrogate section |

### Command Center

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/heatmap` | GET | Full heatmap (sections + jurisdictions) |
| `/heatmap/sections` | GET | Section risk rollups |
| `/heatmap/jurisdictions` | GET | Jurisdiction summaries |
| `/heatmap/risky-fragments` | GET | Top risky fragments |
| `/dashboard/section-rollup` | GET | Legacy: section rollup |
| `/dashboard/jurisdiction-rollup` | GET | Legacy: jurisdiction rollup |

### Snapshots

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/snapshots` | GET/POST | List or create snapshots |
| `/snapshots/{id}` | GET/PATCH | Get or update snapshot status |
| `/snapshots/{id}/fragments` | GET/POST | Manage snapshot fragments |
| `/snapshots/{id}/gate` | GET | Get gate metrics |

## Risk Classification

| Status | Meaning | Action |
|--------|---------|--------|
| `ALIGNED` | Low drift, no concerning precedents | Continue monitoring |
| `DATA_DRIFT` | Drift magnitude ≥ 20% | Review claimed values vs source |
| `IR_PREDICTED` | High similarity to historical IRs | Prepare proactive responses |

## Compliance Features

### 21 CFR Part 11 Support

- **Append-only audit logs**: No UPDATE/DELETE on `audit.concomitant_audit_logs`
- **Immutable version history**: Every fragment change creates a new version
- **Attribution tracking**: X-Actor, X-Change-Reason, X-Request-ID headers
- **Session settings**: app.user, app.reason, app.request_id passed to triggers

### Attribution Headers

```bash
curl -X POST http://localhost:8001/fragments \
  -H "X-Actor: reg.writer@yourco.com" \
  -H "X-Change-Reason: Updated efficacy claim per CSR v2" \
  -H "X-Request-ID: CR-2024-001" \
  -d '{"ectd_section_path": "m2.7.3-efficacy", "content_prose": "..."}'
```

## Testing

```bash
# Unit tests (no database required)
pytest -v -k "not integration"

# Integration tests (requires DATABASE_URL)
pytest -m integration -v
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | (required) | Neon connection string |
| `EMBEDDING_MODE` | `deterministic` | `deterministic` or `none` |
| `EMBEDDING_DIM` | `1536` | Embedding vector dimension |
| `DRIFT_THRESHOLD` | `0.20` | Threshold for DATA_DRIFT |
| `IR_SIMILARITY_THRESHOLD` | `0.78` | Threshold for IR_PREDICTED |
| `TOP_K_PRECEDENTS` | `5` | Number of precedents to retrieve |

## Database Dependencies

Requires migrations:
- 001-006: Core schemas (truth, prose, audit, adversarial)
- 007: Heatmap views
- 008: Submission snapshots

Run: `DATABASE_URL="..." ./scripts/db_migrate.sh`
