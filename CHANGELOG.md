# Changelog

All notable changes to ClinicalSageAI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Tech debt prevention system with ESLint rules and pre-commit hooks
- Comprehensive architecture documentation
- GRDHE (Global Regulatory Data Harmonization Engine) module

### Changed
- Package renamed from `rest-express` to `clinicalsageai`
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

[Unreleased]: https://github.com/concept2cure/ClinicalSageAI-2-replit/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/concept2cure/ClinicalSageAI-2-replit/releases/tag/v1.0.0
