# Biotech Document Completion Matrix

## Status

The previous 101-row matrix was withdrawn on 2026-07-29 after repository review found that its lexical scanner treated comments, fixtures, and shared candidate services as document-specific implementation evidence. It is not a release verifier and must not be used as product truth.

No registry entry is currently classified `VERIFIED` under the work-order definition of done.

## Canonical sources

- Registry truth: `shared/regulatory/global-document-registry.ts`
- Registry validation: `server/services/regulatory/registry/registryValidation.ts`
- Existing biotech capability audit: `docs/reports/biotech-documentation-completeness-audit.md`
- Platform findings and evidence tiers: `docs/audit-2026-07/01-method-and-coverage.md` and `docs/audit-2026-07/12-findings-register.md`

A replacement per-entry matrix must be produced through the existing registry-validation architecture, distinguish direct wiring from shared/lexical evidence, and provide executable proof before changing any row from `IMPLEMENTED_UNVERIFIED` to `VERIFIED`.
