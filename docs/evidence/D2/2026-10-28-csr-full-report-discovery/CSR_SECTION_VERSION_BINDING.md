# CSR section-version and AnA-run evidence binding

This increment extends the existing AnA medical-writing review; it creates no parallel editor, source store or approval workflow.

The pure `verifyCsrSectionEvidenceBinding` preflight requires:
- Exact authoring section ID and SHA-256 of the currently saved text.
- Exact AnA run ID that generated the reviewed section.
- An explicit, nonempty, unique claim-ID manifest matching the supplied structured receipts.
- All claims assigned to that same section ID.
- Reconciliation against qualified, version-bound TLF/source facts via the existing `reconcileCsrClaims`.

It refuses edited text, stale AnA runs, cross-section claims, missing/duplicate claims, withdrawn source evidence and numerical mismatches. The existing `reviewCsrSectionWithEvidence` wrapper exposes these results alongside the medical-writing review but never claims approval.

**Not yet production-integrated:** The editor must persist/resolve the binding, claim manifest and qualified TLF fact records from the canonical governed evidence system in the same tenant-scoped, version-pinned transaction. Its existing authoring review and e-sign routes must invoke that verification immediately before promotion, then record human medical-writer/biostatistician decisions. Without that persisted source ledger, an automatic pass would be false. This commit intentionally does not fabricate ledger rows or alter signature behavior.

Focused regression: `npx vitest run server/services/ana/__tests__/csr-section-evidence-binding.test.ts server/services/ana/__tests__/csr-claim-reconciliation.test.ts`. Full TypeScript, CI, security, RLS and browser qualification are still required; no passing run is claimed.
