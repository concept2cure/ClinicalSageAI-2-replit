# Quality Gating API Reference

This document outlines the API endpoints for the Quality Gating validation system within the TrialSage platform, which implements risk-based quality controls for Clinical Evaluation Reports (CER).

## Quality Control Overview

The system uses Critical-to-Quality (CTQ) factors that are categorized by risk level:

1. **Required (High Risk)** - Must be satisfied for validation to pass; failures act as "hard gates"
2. **Warning (Medium Risk)** - Should be satisfied, but failures result in warnings rather than blocking
3. **Informational (Low Risk)** - Suggestions for best practices that are tracked but don't affect validation status

## Validation Endpoints

### 1. Validate a Section

Validates a specific section against configured quality gating rules.

**Endpoint:** `POST /api/tenant-section-gating/:tenantId/section-gating/validate`

**Request Body:**

```json
{
  "sectionCode": "benefit-risk",
  "satisfiedFactors": [1, 2, 3],
  "content": "Optional section content",
  "projectId": 123,
  "documentId": 456,
  "requestOverride": false,
  "overrideReason": "Only required when requestOverride is true",
  "overrideEvidence": "Optional supporting evidence for override"
}
```

**Response:**

```json
{
  "valid": true,
  "status": "passed",
  "message": "Section validates successfully",
  "sectionCode": "benefit-risk",
  "compliancePercentage": 85,
  "complianceDetails": {
    "required": 100,
    "warning": 75,
    "informational": 50
  },
  "factorCounts": {
    "total": 10,
    "required": 3,
    "warning": 4,
    "informational": 3,
    "satisfied": 8,
    "missing": 2
  },
  "factorResults": [
    {
      "id": 1,
      "name": "Risk-benefit analysis present",
      "category": "safety",
      "criticality": "required",
      "satisfied": true,
      "impact": "Ensures patient safety is properly evaluated"
    }
    // Additional factors...
  ],
  "overrideStatus": null
}
```

### 2. Batch Validate Multiple Sections

Validates multiple sections at once, returning consolidated results.

**Endpoint:** `POST /api/tenant-section-gating/:tenantId/section-gating/batch-validate`

**Request Body:**

```json
{
  "projectId": 123,
  "documentId": 456,
  "sections": [
    {
      "sectionCode": "benefit-risk",
      "satisfiedFactors": [1, 2, 3],
      "content": "Optional section content"
    },
    {
      "sectionCode": "clinical-background",
      "satisfiedFactors": [5, 6],
      "content": "Optional section content"
    }
  ]
}
```

**Response:**

```json
{
  "results": [
    {
      "sectionCode": "benefit-risk",
      "valid": true,
      "status": "passed",
      "message": "Section validates successfully",
      "compliancePercentage": 100,
      "factorResults": [],
      "missingRequiredCount": 0,
      "missingWarningCount": 0,
      "missingInfoCount": 0
    },
    {
      "sectionCode": "clinical-background",
      "valid": false,
      "status": "failed",
      "message": "Section validation failed: 2 required CTQ factors not satisfied",
      "compliancePercentage": 40,
      "factorResults": [],
      "missingRequiredCount": 2,
      "missingWarningCount": 1,
      "missingInfoCount": 0
    }
  ],
  "summary": {
    "totalSections": 2,
    "passedSections": 1,
    "warningSections": 0,
    "failedSections": 1,
    "overallCompliancePercentage": 50,
    "valid": false
  }
}
```

### 3. Request Validation Override/Waiver

Requests an override for sections that fail validation but need approval to proceed.

**Endpoint:** `POST /api/tenant-section-gating/:tenantId/section-gating/:sectionCode/request-override`

**Request Body:**

```json
{
  "projectId": 123,
  "documentId": 456,
  "reason": "Clinical data from post-market surveillance provides alternative evidence.",
  "evidence": "Link to supporting documentation",
  "satisfiedFactors": [1, 2],
  "missingFactors": [3, 4]
}
```

**Response:**

```json
{
  "status": "approved",
  "message": "Override request has been automatically approved based on your role",
  "canSelfApprove": true,
  "overrideRecord": {
    "tenantId": 1,
    "sectionCode": "benefit-risk",
    "projectId": 123,
    "documentId": 456,
    "reason": "Clinical data from post-market surveillance provides alternative evidence.",
    "evidence": "Link to supporting documentation",
    "requestedBy": "user123",
    "requestedAt": "2025-05-09T02:00:00.000Z",
    "status": "approved",
    "satisfiedFactors": [1, 2],
    "missingFactors": [3, 4],
    "approvedBy": "user123",
    "approvedAt": "2025-05-09T02:00:00.000Z",
    "expiresAt": "2025-06-08T02:00:00.000Z"
  }
}
```

### 4. Approve/Reject Override Request

Approves or rejects a pending override request (admin/manager only).

**Endpoint:** `PATCH /api/tenant-section-gating/:tenantId/section-gating/overrides/:overrideId`

**Request Body:**

```json
{
  "action": "approve",
  "comments": "Approved based on alternative evidence provided",
  "expiresAt": "2025-06-30T00:00:00.000Z"
}
```

**Response:**

```json
{
  "status": "approved",
  "message": "Override request has been approved. Valid until 2025-06-30T00:00:00.000Z",
  "overrideRecord": {
    "id": "override123",
    "status": "approved",
    "approvedBy": "admin456",
    "approvedAt": "2025-05-09T02:01:00.000Z",
    "rejectedBy": null,
    "rejectedAt": null,
    "expiresAt": "2025-06-30T00:00:00.000Z",
    "comments": "Approved based on alternative evidence provided"
  }
}
```

### 5. Get Validation Statistics

Retrieves validation statistics for a project.

**Endpoint:** `GET /api/tenant-section-gating/:tenantId/section-gating/project/:projectId/stats`

**Response:**

```json
{
  "projectId": 123,
  "totalSections": 9,
  "passedSections": 5,
  "warningSections": 3,
  "failedSections": 1,
  "overallCompliancePercentage": 88,
  "sectionStats": [
    {
      "sectionCode": "benefit-risk",
      "name": "Benefit-Risk Analysis",
      "status": "passed",
      "compliancePercentage": 100,
      "lastValidated": "2025-05-09T02:00:00.000Z"
    }
    // Additional sections...
  ]
}
```

## Override Policies

The system supports multiple override policies that control who can override validation failures:

1. **none** - No overrides allowed for this section
2. **admin-only** - Only administrators can approve overrides
3. **manager-approval** - Managers and administrators can approve overrides
4. **document-reason** - Any user can override as long as they document the reason

## Integration with QMP

These validation endpoints integrate with the Quality Management Plan (QMP) to ensure proper:

1. Risk-based quality control
2. Audit trail tracking
3. Regulatory compliance documentation
4. Change control approvals

## Tenant Isolation

All endpoints enforce proper tenant isolation, ensuring:

1. Users can only access data from their own organization
2. Super admins can access data across tenants
3. Row-level security is enforced at the database level
