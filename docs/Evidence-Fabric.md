# Evidence Fabric ("The Weave-Killer") — v1

Evidence Fabric is a lightweight mechanism for **cryptographically linking document text to raw analysis outputs**, so dossiers can be refreshed safely when upstream data changes.

It’s designed to solve the "50 tables in Word" problem:
- Writers insert **Smart Tags** like `{{safety_analysis.primary_endpoint.p_value}}`.
- The platform resolves tags from registered evidence sources.
- A **manifest** (SHA-256 hashes of evidence sources used) is generated at refresh time.
- If any evidence source hash changes later, the document is **stale**.

## Smart Tags

Smart Tags follow this pattern:

- `{{some.key.path}}`
- Allowed characters: `a-zA-Z0-9_.:-`

Resolution supports two modes:
1. **Exact key**: a source exists at `some.key.path`
2. **Root object + dot path**: a source exists at `some`, with JSON value `{ key: { path: ... } }`

## API

All routes are mounted under `/api/evidence-fabric`.

### Upsert a source

`POST /api/evidence-fabric/sources/upsert`

Body:
```json
{
  "tenantId": "optional",
  "key": "safety_analysis",
  "value": {
    "primary_endpoint": {
      "p_value": 0.031,
      "effect": 1.42
    }
  },
  "provenance": {
    "system": "sas",
    "dataset": "adam.adsl",
    "program": "safety_primary.sas",
    "runId": "2026-01-15T12:00:00Z"
  }
}
```

Response includes a SHA-256 `hash` that acts as the cryptographic evidence link.

### Preview (render) a document snippet

`POST /api/evidence-fabric/preview`

Body:
```json
{
  "content": "Primary endpoint p={{safety_analysis.primary_endpoint.p_value}}",
  "previousManifest": {"version":"v1","createdAt":"...","sources":{},"bindings":{}}
}
```

Returns:
- `rendered`: text with tags substituted
- `manifest`: SHA-256 source hashes used + bindings
- `stale`: whether `previousManifest` differs

### Status (staleness only)

`POST /api/evidence-fabric/status`

Body:
```json
{
  "content": "Primary endpoint p={{safety_analysis.primary_endpoint.p_value}}",
  "previousManifest": {"version":"v1","createdAt":"...","sources":{},"bindings":{}}
}
```

Returns:
- `stale`, `staleReason`
- `changedSources`, `newBindings`
- `currentManifest`

## Operational Notes

- Current implementation uses an in-memory store (demo-safe). Persisting sources/manifests to Postgres is a planned enhancement.
- The system is compatible with a "data lake" workflow: any SAS/LIMS pipeline can publish computed outputs (JSON) by calling `sources/upsert`.
- This design intentionally keeps the writer experience simple: authors manage text, the platform manages truth.
