# AnA Document Stack — Service Boundaries

## Boundary model

### 1) App-controlled orchestrators (trusted write boundary)
- `server/services/documentIntelligence/*`
- `server/services/citations/*` (planned)
- `server/services/documentQuality/*`
- `server/services/reviewDiffs/*` (planned)

Responsibilities:
- invoke sidecars/CLIs
- arbitrate results
- sanitize and normalize payloads
- persist outcomes via existing app data/governance services only

### 2) Sidecar/CLI adapters (untrusted compute boundary)
- `server/integrations/tika/*`
- `server/integrations/ocrmypdf/*`
- `server/integrations/docling/*`
- `server/integrations/unstructured/*`
- `server/integrations/grobid/*` (planned)
- `server/integrations/scispacy/*` (planned)
- `server/integrations/languagetool/*` (planned)
- `server/integrations/verapdf/*`

Responsibilities:
- external call execution only
- no persistence side effects
- return typed response + diagnostics

### 3) Regulated surfaces to preserve
- `documentExportService` remains source of export generation.
- `governedExportConsequence` remains source of governed consequence schema.
- proposal/review flows remain in conversation OS routes/services.

## Safety constraints
- No sidecar service gets DB credentials for regulated writes.
- No sidecar output is directly trusted without contract validation.
- Feature flags gate every non-trivial integration.
