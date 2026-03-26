# Export Governance Reference

## Purpose

Defines the governance payload and expected header behavior for regulated export routes.

## Governance payload

```json
{
  "governance": {
    "aiGenerated": true,
    "humanReviewApproved": true,
    "reviewerName": "Jane Doe",
    "reviewerRole": "Regulatory Affairs Lead",
    "reviewTimestamp": "2026-03-25T00:00:00.000Z"
  }
}
```

## Strict mode behavior

Strict mode is enabled when:
- `CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW=true`, or
- environment defaults to production policy in route-specific logic.

If strict mode is enabled and `humanReviewApproved !== true`, routes should return:
- `403`
- error code/message equivalent to `HUMAN_REVIEW_REQUIRED`

## Response headers

Expected governance headers on allowed exports:
- `X-Concept2Cure-AI-Generated`
- `X-Concept2Cure-Human-Review-Approved`
- `X-Concept2Cure-Review-Required`
- `X-Concept2Cure-Reviewer` (optional)
- `X-Concept2Cure-Review-Timestamp` (optional)

## Covered routes (execution stage)

- `POST /api/concept2cure/artifacts/export-docx`
- `POST /api/concept2cure/artifacts/export-pdf`
- `POST /api/concept2cure/artifacts/export-pptx`
- `POST /api/cerv2/export/pdf`
- `POST /api/cerv2/export/docx`
- `POST /api/cerv2/export/zip`
- `POST /api/ectd/export/:submissionId`
