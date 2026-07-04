# Vault cross-client taxonomy + eTMF alignment — 2026-07-03

The Document vault is the platform-wide DMS — it serves Pharma, Biotech,
Device, and IVD product owners plus CRO/CDMO service organizations, across
all document types and filing types. This change gives all of those views
one shared taxonomy and connects the vault to the existing eTMF.

## Shared taxonomy (`shared/constants/domain/vault-taxonomy.ts`)

Follows the centralized-domain-vocabulary pattern (PR #975): segment ids
reuse the canonical `ClientSegmentType` from `organization-types.ts` — no
new client vocabulary invented.

- **Views** — `pharma | biotech | device | ivd | service`. Product owners
  map to their segment; service orgs (CRO, CDMO, academic, government)
  get the cross-sponsor `service` view via `vaultViewForOrganization()`.
- **Document kinds** (17) — protocol, CSR, test report, nonclinical, CMC,
  batch record, spec, certificate, labeling, software/SBOM, supplier,
  agency correspondence, submission, clinical, QMS, CAPA, template — each
  tagged with the views where it is a first-class filter. The shipped
  device-view filter ids are preserved as a compatible subset.
- **Filing types** (19) — IND, NDA, ANDA, BLA, MAA, IMPD, DMF, eCTD,
  510(k), PMA, De Novo, IDE, CER, IVDR PE, Pre-Sub, TMF, Engineering,
  QMS, Agency — with regulatory references and per-view applicability
  (e.g. NDA is pharma-only; BLA is biotech).
- **Folder presets** — pharma/biotech: CTD structure (Modules 1–5 +
  eCTD sequences + correspondence); device/ivd: submission + DHF/RMF
  structure; service: the 11 TMF Reference Model zones.

The MDX (device) vault now derives its type filters and framework pills
from this taxonomy (`client/.../mdx/data/vault.ts` →
`vaultFiltersForView('device')` / `vaultFrameworksForView('device')`);
pharma/biotech/service vault surfaces consume the same source as they
ship.

## eTMF: what existed, what was added

The platform **already has a full eTMF** (Capability C2C-08, discovered
during this work — do not duplicate it):

- `server/routes/etmf.ts` + `etmf.routes.ts` (both under `/api/etmf`) —
  governed TMF files/artifacts, status lifecycle
  (expected → received → in_review → final / missing / not_applicable),
  keyword auto-classification into DIA RM zones, completeness with
  inspection-readiness verdicts, per-trial artifact filings.
- `server/services/etmf/` — `etmf-logic.ts` (zone catalog + classifier),
  `tmf-completeness.ts` (zones + ICH E6(R2) §8 essential artifacts +
  assessment), `etmf-service.ts`, `tmf-artifact-persistence.ts`.
- Tables: `tmf_files`, `tmf_artifacts` (`migrations/20260610_etmf.sql`),
  `tmf_artifact_filings`.

**Added on top (no duplication):**

1. **Expected-skeleton seeding** — a new TMF started empty and had to be
   populated one artifact at a time. `seedArtifacts()` (pure, in
   `tmf-completeness.ts`) derives the expected-document skeleton from the
   reference-model catalog; `seedReferenceModelTx()` inserts it
   idempotently (case-insensitive name match skips existing rows);
   governed `POST /api/etmf/files/:id/seed` (reason-for-change required)
   exposes it with `scope: 'essential' | 'all'`.
   `completeness_required` mirrors `essential`, so optional artifacts
   never dilute the inspection-readiness denominator.
2. **Shared zone mirror** — `shared/constants/domain/tmf-reference-model.ts`
   mirrors the server zone catalog for client-safe consumption (client
   code cannot import server services). A drift test
   (`server/services/__tests__/vault-taxonomy-etmf.test.ts`) asserts the
   mirror matches BOTH server catalogs exactly — same posture as the
   enum-alignment schema-drift guards.
3. **Vault ⇄ eTMF bridge** — the vault's service-view folders are the TMF
   zones, derived from the shared mirror, so a CRO's vault rail and the
   eTMF index share one structure.

## Tests

`server/services/__tests__/vault-taxonomy-etmf.test.ts` (15 tests): zone
drift guard, view integrity (folders/kinds/frameworks per view, unique
ids), device-filter compatibility, CTD-vs-TMF folder structures,
segment-correct filing frameworks, the service-org rule, and the seed
skeleton (scope behavior, essential↔completeness invariant, unique codes).
Existing eTMF suites (`etmf-logic`, `tmf-completeness`) remain green.

## UI note

Pharma/biotech/CRO vault surfaces and an eTMF workspace need design kits
per `design-system/CLAUDE.md` ("if the surface you need isn't in
`ui_kits/` yet, stop and ask") — the taxonomy, endpoints, and shapes above
are ready for those kits to consume.
