# ClinicalSageAI

**The Cognitive Regulatory Ecosystem for Life Sciences**

[![Enterprise GA](https://img.shields.io/badge/status-Enterprise%20GA%20Hardening-blue)](https://github.com/concept2cure/ClinicalSageAI-2-replit)
[![21 CFR Part 11](https://img.shields.io/badge/compliance-21%20CFR%20Part%2011-green)](docs/compliance/)
[![ISO 14971](https://img.shields.io/badge/risk%20analysis-ISO%2014971-green)](docs/compliance/)

---

## Overview

ClinicalSageAI is an enterprise-grade regulatory intelligence platform that transforms how life sciences companies prepare, submit, and manage regulatory documentation.

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
git clone https://github.com/concept2cure/ClinicalSageAI-2-replit.git
cd ClinicalSageAI-2-replit

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your database credentials

# Run database migrations
npm run db:migrate

# Start development server
npm run dev
```

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

---

## Project Structure

```
ClinicalSageAI/
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

ClinicalSageAI is designed for regulated environments:

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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

Proprietary - Concept2Cure, Inc.

---

## Support

- **Documentation:** [docs/](docs/)
- **Issues:** [GitHub Issues](https://github.com/concept2cure/ClinicalSageAI-2-replit/issues)

---

*ClinicalSageAI - Accelerating the Path from Concept to Cure*
