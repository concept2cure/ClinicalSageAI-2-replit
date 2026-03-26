# Concept2Cure.RI

**The Cognitive Regulatory Ecosystem for Life Sciences**

[![Enterprise GA](https://img.shields.io/badge/status-Enterprise%20GA%20Hardening-blue)](https://github.com/concept2cure/Concept2Cure.RI-2-replit)
[![21 CFR Part 11](https://img.shields.io/badge/compliance-21%20CFR%20Part%2011-green)](docs/compliance/)
[![ISO 14971](https://img.shields.io/badge/risk%20analysis-ISO%2014971-green)](docs/compliance/)

---
## 🔒 **IMPORTANT: SINGLE BRANCH DEVELOPMENT**

**All work MUST be done on:** `concept2cure-v2`

- ❌ Do NOT create feature branches
- ❌ Do NOT work on `main` directly  
- ❌ Do NOT recreate auth, portal, or Cortex components
- ✅ See `.github/COPILOT_INSTRUCTIONS.md` for full rules

**Agents & Developers**: Read `.github/BRANCH_LOCK.md` before starting work.

---

## Overview

Concept2Cure.RI is an enterprise-grade regulatory intelligence platform that transforms how life sciences companies prepare, submit, and manage regulatory documentation.

### Key Capabilities

| Module | Description | Status |
|--------|-------------|--------|
| **CER Generator** | EU MDR/IVDR Clinical Evaluation Reports | ✅ Production |
| **510(k) eSTAR** | FDA 510(k) electronic submissions | ✅ Production |
| **eCTD CoAuthor** | Real-time collaborative document authoring | ✅ Production |
| **CMC Platform** | Chemistry, Manufacturing, Controls | ✅ Production |
| **Stability Studies** | ICH-compliant stability management | ✅ Production |
| **Cognitive Ecosystem** | LangGraph-powered AI agents | 🔄 Beta |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CORTEX PRIME (AI Brain)                   │
│  Knowledge Atoms │ Threads │ Agents │ Dual Embeddings        │
├─────────────────────────────────────────────────────────────┤
│                 COGNITIVE ECOSYSTEM (LangGraph)              │
│  Agent Runtime │ Workflows │ Human-in-the-Loop │ Checkpoints │
├─────────────────────────────────────────────────────────────┤
│              21 CFR PART 11 COMPLIANCE LAYER                 │
│  Audit Trails │ E-Signatures │ RBAC │ Hash Chains            │
└─────────────────────────────────────────────────────────────┘
```

---

## Quick Start

```bash
# Clone repository
git clone https://github.com/concept2cure/Concept2Cure.RI-2-replit.git
cd Concept2Cure.RI-2-replit

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env and set DATABASE_URL to your Neon connection string, e.g.:
#   DATABASE_URL=postgresql://neondb_owner:YOUR_PASSWORD@ep-YOUR-PROJECT-pooler.REGION.aws.neon.tech/neondb?sslmode=require
# (see .env.example for full details)

# Run database migrations
npm run db:migrate
# Optional: sync schema/table drift in local/dev
npm run db:push

# Start development server
npm run dev
```

---

## Testing

- `npm test` runs Jest + Vitest.
- Integration tests are gated behind `RUN_INTEGRATION_TESTS=true` and require a Postgres database via `TEST_DATABASE_URL` (or `DATABASE_URL`) with the GCC migrations applied (including the innovation platform schema). CI provisions a test database and runs these with the flag enabled.

- Phase 5 (Intelligent Document System) migrations are required for `tests/phase5/migration.test.ts`. In dev you can either apply the migration manually or let the test runner attempt to apply it when explicitly allowed:

  - Manual: run `node scripts/apply_phase5_migrations.mjs` with `DATABASE_URL` set.
  - Auto-apply (dev-only): set `APPLY_PHASE5_MIGRATIONS=true` and re-run `npm test` (the Phase 5 tests will attempt to apply `db/migrations/20260129_phase5_intelligent_document_system.sql` and re-run checks).

  **Safety:** Auto-apply is opt-in and intended for local/dev usage only. Never enable this in production or shared/staging environments without explicit coordination with the DB owner.

---

## Documentation

| Category | Description |
|----------|-------------|
| [Architecture](docs/architecture/) | Technical architecture and design decisions |
| [Compliance](docs/compliance/) | 21 CFR Part 11, ISO 14971, validation docs |
| [Deployment](docs/deployment/) | Deployment guides and infrastructure |
| [Modules](docs/modules/) | Module-specific documentation |
| [Guides](docs/guides/) | User and developer guides |

### Key Documents

- [Product Vision Roadmap](docs/PRODUCT_VISION_ROADMAP.md) - Strategic plan 2026-2030
- [Agent Architecture](docs/AGENT_ARCHITECTURE.md) - AI agent system design
- [Service Consolidation](docs/SERVICE_CONSOLIDATION_PLAN.md) - Codebase cleanup plan
- [Consolidation Summary](docs/CONSOLIDATION_SUMMARY.md) - Recent cleanup work
- [Local Infra Warnings](docs/guides/local-dev-infra-warnings.md) - Resolve expected local DB/Redis warnings
- [Repo Memory & Execution Discipline](docs/getting-started/REPO_MEMORY_EXECUTION_DISCIPLINE.md) - Required preflight and execution protocol before code changes

---

## Project Structure

```
Concept2Cure.RI/
├── client/              # React frontend
├── server/              # Express backend
│   ├── routes/          # API endpoints
│   ├── services/        # Business logic
│   │   └── cognitive-ecosystem/  # LangGraph agents
│   └── middleware/      # Express middleware
├── db/migrations/       # Database migrations
├── shared/              # Shared TypeScript schemas
├── docs/                # Documentation
├── scripts/             # Build, deploy, automation
│   ├── automation/      # Utility scripts
│   ├── build/           # Build scripts
│   ├── deploy/          # Deployment scripts
│   ├── import/          # Data import scripts
│   └── test/            # Test scripts
└── backend/             # Python services
```

---

## Technology Stack

### Backend
- **Runtime:** Node.js 20+
- **Framework:** Express.js
- **Database:** PostgreSQL 15 with pgvector
- **ORM:** Drizzle ORM
- **AI:** Kimi AI (Moonshot), multi-provider router

### Frontend
- **Framework:** React 18
- **Build:** Vite
- **Styling:** Tailwind CSS
- **State:** React Query

### Infrastructure
- **Cloud:** AWS (recommended), Azure, GCP
- **Container:** Docker
- **CI/CD:** GitHub Actions

---

## Compliance

Concept2Cure.RI is designed for regulated environments:

- **21 CFR Part 11** - Electronic records and signatures
- **EU Annex 11** - Computerized systems
- **ISO 14971** - Risk management for medical devices
- **HIPAA** - Health data protection
- **FHIR R4** - Healthcare interoperability

---

## API Overview

### Cognitive Ecosystem (New!)
```
POST /api/cognitive/agents         # Create agent session
POST /api/cognitive/workflows      # Start LangGraph workflow
POST /api/cognitive/fhir/validate  # FHIR R4 validation
POST /api/cognitive/dossiers       # Global dossier management
GET  /api/cognitive/health         # Health check
```

### Regulatory Modules
```
POST /api/cer/generate             # Generate CER
POST /api/510k/submissions         # 510(k) submission
POST /api/ectd/documents           # eCTD document management
POST /api/cmc/projects             # CMC project management
```

---

## Database Management

### Schema

The database schema is defined in `shared/schema.ts` using Drizzle ORM.

```bash
# View current schema
cat shared/schema.ts

# Generate migration from schema changes
npx drizzle-kit generate:pg
```

### Migrations

```bash
# Development: Push schema directly (recommended)
npx drizzle-kit push:pg

# Production: Run migrations
npx drizzle-kit migrate
```

> **Note:** Legacy migrations with numbering conflicts have been archived to `db/migrations/_legacy/`. See `db/migrations/_legacy/README.md` for details.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

Proprietary - Concept2Cure, Inc.

---

## Support

- **Documentation:** [docs/](docs/)
- **Issues:** [GitHub Issues](https://github.com/concept2cure/Concept2Cure.RI-2-replit/issues)

### Common Issues

#### GitHub Copilot Branch Conflicts
If you encounter issues with GitHub Copilot creating `copilot/*` branches or PRs not being found after delegation, see the [Copilot Branch Delegation Fix Guide](docs/fixes/COPILOT_BRANCH_DELEGATION_FIX.md).

**Quick Fix:**
```bash
# If you're on a copilot/* branch by mistake:
./scripts/fix-copilot-branch.sh
```

---

*Concept2Cure.RI - Accelerating the Path from Concept to Cure*
