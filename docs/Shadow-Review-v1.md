# Shadow Review v1 (Public Signals)

Shadow Review predicts likely FDA questions using only **public signals** and deterministic checklist rules.

- Public signals: openFDA / MAUDE (device adverse events) and other public datasets.
- Checklist rules: rules-based “hard gates” that frequently map to FDA information requests.
- Deficiency Bank: voluntary, anonymized “give-to-get” uploads (v1 is in-memory only).

## Endpoints

### Run Shadow Review

`POST /api/lumen/shadow-review`

Body:
```json
{
  "tenantId": "demo",
  "productCode": "KRA",
  "dossierContext": {
    "isSoftware": true,
    "hasSBOM": false,
    "contactDuration": "Permanent",
    "iso10993Report": false,
    "predicateClearanceDate": "2025-06-01",
    "hasAIML": false
  },
  "topic": "cybersecurity",
  "useCache": true
}
```

### Upload to Deficiency Bank (Give-to-Get)

`POST /api/lumen/deficiency/upload`

Body:
```json
{
  "tenantId": "demo",
  "text": "...anonymized deficiency excerpt..."
}
```

### Query Deficiency Bank

`POST /api/lumen/deficiency/query`

Body:
```json
{
  "tenantId": "demo",
  "topic": "cybersecurity",
  "includeUnverified": false
}
```

## Notes

- Shadow Review does **not** access confidential FDA correspondence.
- Deficiency Bank uploads should only include content you have rights to share; v1 uses best-effort anonymization.
