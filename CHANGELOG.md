# Changelog

All notable changes to Concept2Cure.RI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Concept2Cure foundation migration (tables, indexes, RLS, immutability).
- Concept2Cure signatures migration and API endpoint.
- Concept2Cure route tests for projects, conversations, artifacts, and signatures.
- Roadmap-aligned schema entry points for organizations and client engagements.
- Roadmap-aligned schema entry points for projects, WBS, and assignments.
- Roadmap-aligned PM settings schema and default seed entry point.
- Roadmap-aligned risk factor, detection, and prediction schema entry points.
- Roadmap-aligned communication channels, messages, and FDA communications schema entry points.
- Roadmap-aligned audit log and electronic signatures schema entry points.
- Roadmap-aligned documents and document versions schema entry points.
- Roadmap-aligned RLS policies entry point.
- Roadmap-aligned knowledge base and response cache schema entry points.

### Changed
- Redis rate limiter now initializes and shuts down with server lifecycle.
- Concept2Cure queries now batch message/version lookups to reduce N+1 load.
- Concept2Cure debug logging redacts request bodies in DEBUG mode.
- Concept2Cure error logs include structured operation fields.
- Concept2Cure error metrics counter added for observability.
- Concept2Cure migration run now completes successfully (64 succeeded, 0 failed).
- Fixed Concept2Cure migration policy checks (pg_policies.policyname) to allow successful reruns.

### Changed
- Concept2Cure migration runner path now targets root db/migrations.
- Migration manifest updated to include Concept2Cure foundation migration.
- Unified Concept2Cure roadmap cleaned and schedule authority clarified.

### Added
- Tech debt prevention system with ESLint rules and pre-commit hooks
- Comprehensive architecture documentation
- GRDHE (Global Regulatory Data Harmonization Engine) module

### Changed
- Package renamed from `rest-express` to `concept2cure-riai`
- Added Node.js engine requirements (>=20.0.0)

### Fixed
- Various build and deployment issues

---

## [1.0.0] - 2026-01-24

### Added
- **CER Generator** - EU MDR/IVDR Clinical Evaluation Reports
- **510(k) eSTAR** - FDA 510(k) electronic submissions with predicate finder
- **eCTD CoAuthor** - Real-time collaborative document authoring
- **CMC Platform** - Chemistry, Manufacturing, Controls documentation
- **Stability Studies** - ICH-compliant stability management
- **Cognitive Ecosystem** - LangGraph-powered AI agents
- **GRDHE Module** - Multi-jurisdiction regulatory data export (FDA MedWatch, EMA E2B(R3))

### Security
- 21 CFR Part 11 compliance layer
- Audit trails and e-signatures
- Role-based access control (RBAC)
- Hash chain verification

### Infrastructure
- PostgreSQL/Neon database with Drizzle ORM
- React 18 frontend with TipTap editor
- Express.js backend with TypeScript
- OpenAI/Anthropic AI integration

---

## Version History

| Version | Date | Highlights |
|---------|------|------------|
| 1.0.0 | 2026-01-24 | Enterprise GA release |
| 0.9.0 | 2025-11-01 | Beta release |
| 0.5.0 | 2025-08-01 | Alpha release |

---

[Unreleased]: https://github.com/concept2cure/Concept2Cure.RI-2-replit/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/concept2cure/Concept2Cure.RI-2-replit/releases/tag/v1.0.0
