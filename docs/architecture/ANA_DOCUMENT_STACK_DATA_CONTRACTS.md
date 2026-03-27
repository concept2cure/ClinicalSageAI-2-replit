# AnA Document Stack — Data Contracts (v0)

## 1) Normalized intake schema
- `IntakeFileDescriptor`
- `TikaMetadataResult`
- `ParsedDocument`
- `IntakePipelineReport`

Purpose: deterministic parsing provenance + parser arbitration record.

## 2) Citation/evidence schema
- `CitationNormalizationPayload`
- `CitationNormalized`

Purpose: predictable internal representation across GROBID + Citation.js.

## 3) Document quality schema
- `DocumentQualityReport`
- `DocumentQualityIssue`

Purpose: advisory or blocking quality outcomes for proposal review.

## 4) Review diff schema
- `ReviewDiffArtifact`

Purpose: portable redlines + HTML render payload for reviewer UX.

## 5) PDF validation schema
- `PdfValidationReport`

Purpose: attach final-format validation to export governance metadata.

## Canonical source
These TypeScript interfaces are defined in:
- `server/services/documentIntelligence/contracts.ts`
