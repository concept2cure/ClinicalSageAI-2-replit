# Quality Gating API Reference

This document lists the API endpoints of the quality-gating system — Critical-to-Quality
(CTQ) factors, the section gating rules that require them, and section validation — as
they exist in the server today, including the ones that refuse.

> **Corrected 2026-09-23.** An earlier version of this page documented five endpoints
> under `/api/tenant-section-gating/:tenantId/section-gating/…` — `validate`,
> `batch-validate`, `:sectionCode/request-override`, `PATCH overrides/:overrideId` and
> `project/:projectId/stats` — with example responses such as an override
> "automatically approved based on your role". **None of those routes exist**, and no
> override or waiver is recorded anywhere: there is no override or waiver table and no
> approval route. The sections below describe what is actually routed.

## Where the routes are mounted

Each router is mounted twice. Both paths reach the same handler.

| Router (file) | Mount 1 | Mount 2 |
|---|---|---|
| `server/routes/tenant-ctq-factors.ts` | `/api/tenant-ctq-factors` | `/api/quality/ctq-factors` |
| `server/routes/tenant-quality-validation.ts` | `/api/tenant-quality-validation` | `/api/quality/validation` |
| `server/routes/tenant-section-gating.ts` | `/api/tenant-section-gating` | `/api/quality/section-gating` |

`/api/quality/batch-validate` is declared on `server/routes/quality-management-api.ts`
itself.

## How validation works

A section gating rule (`qmp_section_gating`) belongs to a Quality Management Plan and
lists the CTQ factors a section requires in `required_ctq_factor_ids` (a JSON array of
factor ids). Each active CTQ factor carries a `risk_level` and optional
`validation_criteria`, a comma-separated list of terms the section content must contain.

- A missing term on a **high**-risk factor is a hard failure: the section is not valid.
- A missing term on a **medium**-risk factor is a soft failure. Under a soft gate the
  section stays valid and the message is a warning. Under a hard gate only the factor's
  own entry shows it.
- **Low**-risk factors are reported but never affect the result.

The gating level is derived from the rule, which stores no explicit level:

- `validate-section` treats a rule with `allow_override = false` as a hard gate and one
  with `allow_override = true` as a soft gate.
- `batch-validate` uses `minimum_mandatory_completion`: 100 is hard, 80–99 is soft, and
  below 80 is informational (nothing blocks).

`allow_override`, `override_requires_approval` and `override_requires_reason` are stored
on the rule. No endpoint requests, approves or records an override.

## Validation endpoints

### Validate a section

**Endpoint:** `POST /api/tenant-quality-validation/validate-section` (also
`/api/quality/validation/validate-section`)

**Request body:**

```json
{
  "qmpId": 12,
  "sectionCode": "benefit-risk",
  "content": "Section text to check",
  "metadata": {}
}
```

**Response** when the section has no gating rule:

```json
{ "valid": true, "message": "No quality gating rules defined for this section", "validations": [] }
```

**Response** otherwise:

```json
{
  "valid": false,
  "gatingLevel": "hard",
  "message": "Section contains critical quality issues",
  "validations": [
    {
      "factorId": 4,
      "factorName": "Endpoint definitions",
      "category": "clinical",
      "riskLevel": "high",
      "passed": false,
      "message": "Missing required terms: primary endpoint",
      "details": "Primary and secondary endpoints are defined"
    }
  ]
}
```

**Known defect:** when the section's rule lists one or more factor ids, the factor
lookup sends the ids as a parenthesised list, `id = ANY(($1, …))`, not as an array.
Postgres rejects it: `22P02` (malformed array literal) for one id, `42809` for two or
more. The route answers `500 {"error": "Failed to validate section"}`. It does not
return a result in that case.

### Batch-validate sections

**Endpoint:** `POST /api/quality/batch-validate`

**Request body:**

```json
{
  "qmpId": 12,
  "sections": [
    { "sectionCode": "benefit-risk", "content": "Section text" },
    { "sectionCode": "clinical-background", "content": "Section text" }
  ],
  "metadata": {}
}
```

**Response:** `{ valid, hasWarnings, message, metadata, timestamp, sectionResults }`,
where each `sectionResults` entry is
`{ sectionCode, valid, gatingLevel, message, allowOverride, validations }`.

**Known defect:** the gating-rule lookup sends the section codes as a parenthesised
list, `section_key = ANY(($1, …))`, not as an array. Postgres rejects it: `22P02`
(malformed array literal) for one section, `42809` for two or more. So any non-empty
`sections` list answers `500 {"error": "Failed to validate sections"}`.

### Validation statistics for a plan

**Endpoint:** `GET /api/tenant-quality-validation/stats/:qmpId` (also
`/api/quality/validation/stats/:qmpId`)

**Response:**

```json
{
  "qmpId": 12,
  "stats": { "totalRules": 3, "hardGates": 2, "softGates": 1, "infoGates": 0, "activeRules": 3, "inactiveRules": 0 }
}
```

These are rule counts only. No validation results or waivers are stored, so none are
counted.

### Quality waivers — not available

**Endpoint:** `POST /api/tenant-quality-validation/request-waiver` (also
`/api/quality/validation/request-waiver`)

**Response:** `501`

```json
{
  "error": "NOT_AVAILABLE",
  "message": "Quality waiver requests are not available: a waiver request is not recorded anywhere and nothing can approve one. Nothing was submitted."
}
```

Before 2026-09-23 this route wrote nothing, invented a waiver
`{ "id": <timestamp>, "status": "pending" }` and answered `201`.

## CTQ factor endpoints

Paths are relative to `/api/tenant-ctq-factors` (or `/api/quality/ctq-factors`). The
path's `:tenantId` must be the caller's own organization. The two reads also let a
`super_admin` name another organization. The delete has no such exception.

| Method and path | What it does |
|---|---|
| `GET /:tenantId/ctq-factors/:factorId` | Returns one factor of the organization. |
| `GET /:tenantId/ctq-factors` | **Known defect:** answers `500`. The query orders by a column the table does not have (`ORDER BY risk_level, <nothing>`). |
| `POST /:tenantId/ctq-factors` | `501 NOT_AVAILABLE`. It has never saved anything. Nothing is saved. |
| `PATCH /:tenantId/ctq-factors/:factorId` | `501 NOT_AVAILABLE`. It has never saved anything. Nothing is saved. |
| `POST /:tenantId/ctq-factors/batch` | `501 NOT_AVAILABLE` for every operation. It has never saved anything. Nothing is saved. |
| `DELETE /:tenantId/ctq-factors/:factorId` | The governed delete. See below. |

### Delete a CTQ factor (governed)

**Endpoint:** `DELETE /api/tenant-ctq-factors/:tenantId/ctq-factors/:factorId` (also
`/api/quality/ctq-factors/…`)

**Request body:**

```json
{ "reason": "Duplicate of the endpoint-definition factor; retiring it." }
```

- A `viewer` is refused `403`, as on every governed write. Then only `admin` may delete:
  anyone else gets `403`.
- `reason` is required: at least 8 characters after trimming. Otherwise `400 REASON_REQUIRED`.
- A factor the QMP traceability matrix references, or that any section gating rule of
  the organization lists in `required_ctq_factor_ids`, is refused `409 FACTOR_IN_USE`
  and nothing is deleted.
- Another organization's factor is `404`.
- On success the row is deleted and the ledger records the deletion, with the whole
  deleted row, in one transaction. The response is
  `200 { "deleted": true, "id": <factorId>, "message": "CTQ factor deleted." }`.
- If the audit record cannot be written, the delete is rolled back:
  `500 AUDIT_WRITE_FAILED`, and the factor is kept.
- If the commit itself cannot be confirmed, the response is `500 OUTCOME_UNKNOWN`.
  Reload before trying again.

## Section gating endpoints

`server/routes/tenant-section-gating.ts` declares its paths with a leading `/api/…`, so
they sit under a doubled prefix, e.g.
`/api/tenant-section-gating/api/tenant-section-gating/:qmpId`.

| Method and path (relative to the mount) | What it does |
|---|---|
| `GET /api/tenant-section-gating/:qmpId` | **Known defect:** answers `500`. It selects columns `qmp_section_gating` does not have (`required_level`, `active`, …). |
| `POST /api/tenant-section-gating/:qmpId/update` | `501 NOT_AVAILABLE`. It has never saved anything. Nothing is saved. |
| `GET /api/tenant-ctq-factors/:section` | **Known defect:** answers `500`. It selects `mitigation_strategy`, which `ctq_factors` does not have. |

This router used to declare its own `POST` and `DELETE …/api/tenant-ctq-factors[/:id]`.
They were removed on 2026-09-23. The delete ran for any member, a viewer included, with
no reason and no ledger row. The create never saved anything. CTQ factors are deleted
only through the governed delete above.

## Tenant isolation

- The CTQ-factor and validation endpoints query through the request-scoped database
  connection and filter by organization. Row-level security applies on that connection
  when it is enabled.
- The section-gating router's reads use the shared connection pool, with an
  organization filter in each query.
- The governed CTQ-factor delete has no cross-tenant exception: the path's tenant id
  must equal the caller's organization, and the ledger row is written against it.
