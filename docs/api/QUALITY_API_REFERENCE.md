# Quality Management API Reference

This document provides reference information for the Quality Management API, which integrates Critical-to-Quality (CTQ) factors, section gating, and quality validation in TrialSage's Clinical Evaluation Report (CER) system.

## Overview

The Quality Management API provides a unified interface for interacting with quality control mechanisms in the CER generation process. It enables:

- Quality Management Plans: create, change (activate, archive) and delete, each a
  governed change with a reason and a ledger row
- Section validation against the plan's gating rules and CTQ factors
- A governed delete of a CTQ factor
- Quality dashboard and metrics reporting

**Corrected 2026-09-23 (D5).** Earlier versions of this page described CTQ-factor
create, change and batch operations, section-gating rule writes and a waiver
workflow as working. None of them ever saved anything. They now refuse with
`501 NOT_AVAILABLE`, or were never routed at all. The per-route contract, known
defects included, is in
[`quality-gating-api-reference.md`](./quality-gating-api-reference.md). This page
no longer repeats it.

## Base URL

All API endpoints are relative to the base URL: `/api/quality`

## Authentication

All endpoints require authentication. Use the Bearer token scheme:

```
Authorization: Bearer <token>
```

Tenant context is derived from the authenticated user. The tenant middleware ensures proper isolation of data between organizations.

## API Structure

The Quality Management API is organized into several logical sections:

1. **Quality Management Plans** - Managing QMPs (governed writes)
2. **CTQ Factors** - Reads, and one governed delete
3. **Section Gating** - Reads only
4. **Validation** - Validate content against quality rules
5. **Waivers** - Not available: a request is refused and nothing is recorded

## Core Endpoints

### QMP Management

#### Get all QMPs

```
GET /plans
```

Retrieves all Quality Management Plans for the authenticated tenant.

#### Get a specific QMP

```
GET /plans/:id
```

Retrieves detailed information about a specific QMP, including associated section gating rules and CTQ factors.

#### Create a new QMP

```
POST /plans
```

Creates a new Quality Management Plan. This is a governed change. A `reason` of
at least 8 characters is required (`400 REASON_REQUIRED` without one), and the
plan and its ledger row commit together. A viewer is refused with `403`.

Request body:

```json
{
  "reason": "Plan for the 2026 CER programme, approved by the quality lead",
  "name": "CER Quality Management Plan",
  "version": "1.0",
  "description": "Quality plan for EU MDR compliant CERs",
  "status": "draft",
  "allowWaivers": true,
  "cerTypeId": 1,
  "metadata": {
    "author": "Quality Manager",
    "reviewCycle": "6 months"
  }
}
```

#### Update a QMP

```
PATCH /plans/:id
```

Updates a Quality Management Plan. This is a governed change: `reason` is
required, and the ledger records each changed field's before and after value.

- A request that changes nothing the plan does not already hold is refused with
  `409 NO_CHANGES`.
- A COMMIT the server cannot confirm is answered `500 OUTCOME_UNKNOWN`; reload
  before retrying.

Request body:

```json
{
  "reason": "Activating for the Q4 CER filings",
  "status": "active",
  "allowWaivers": false
}
```

#### Delete a QMP

```
DELETE /plans/:id
```

Deletes a Quality Management Plan. This is a governed change: `reason` is
required in the JSON body, and the ledger keeps a full copy of the deleted row.
It is refused when:

- the plan is `active` (`409 PLAN_ACTIVE`: archive it first with a governed
  `PATCH {status: "archived"}`);
- section gating rules still use it (`400`);
- CTQ factors or traceability rows still reference it (`409 PLAN_IN_USE`).

### CTQ Factors and Section Gating

These routes are described, one by one and with their known defects, in
[`quality-gating-api-reference.md`](./quality-gating-api-reference.md). In summary:

- **CTQ factors** (`/ctq-factors/:tenantId/ctq-factors…`):
  - create, change and every batch operation answer `501 NOT_AVAILABLE`. They
    never saved anything; nothing is saved.
  - the one working write is the governed delete,
    `DELETE /ctq-factors/:tenantId/ctq-factors/:factorId`. It requires an
    administrator, a `reason` of at least 8 characters, and a factor no
    traceability row or gating rule references. The ledger keeps a full copy of
    the deleted row.
- **Section gating**: the create, update and delete endpoints this page used to
  list (`POST /section-gating`, `PUT` and `DELETE /section-gating/:id`, and the
  `…/sections` and `…/rule/:id` reads) were never routed. Rule updates answer
  `501 NOT_AVAILABLE`.

### Validation

#### Validate a single section

```
POST /validation/validate-section
```

Validates a section against its quality gating rules.

Request body:

```json
{
  "qmpId": 1,
  "sectionCode": "benefit-risk",
  "content": "This section contains a comprehensive risk-benefit analysis...",
  "metadata": {
    "version": "1.2",
    "author": "John Smith"
  }
}
```

Response:

```json
{
  "valid": true,
  "gatingLevel": "hard",
  "message": "Section meets quality requirements",
  "validations": [
    {
      "factorId": 1,
      "factorName": "Risk-Benefit Analysis Completeness",
      "category": "clinical",
      "riskLevel": "high",
      "passed": true,
      "message": "Validation passed",
      "details": "All required terms are present"
    },
    {
      "factorId": 2,
      "factorName": "GSPR Coverage",
      "category": "regulatory",
      "riskLevel": "medium",
      "passed": true,
      "message": "Validation passed",
      "details": "All required terms are present"
    }
  ]
}
```

#### Batch validation

```
POST /batch-validate
```

Validates multiple sections at once.

Request body:

```json
{
  "qmpId": 1,
  "sections": [
    {
      "sectionCode": "benefit-risk",
      "content": "This section contains a comprehensive risk-benefit analysis..."
    },
    {
      "sectionCode": "clinical-background",
      "content": "The clinical background for this device includes..."
    }
  ],
  "metadata": {
    "cerProjectId": 123,
    "version": "1.2"
  }
}
```

#### Get validation statistics

```
GET /validation/stats/:qmpId
```

Retrieves validation statistics for a QMP.

### Waivers

#### Request a quality waiver

```
POST /validation/request-waiver
```

**Not available.** Waiver requests are not recorded: there is no waiver store
and no approval route. The request answers `501 NOT_AVAILABLE` ("Nothing was
submitted."). Earlier versions answered `201` with an invented pending waiver.

### Dashboard and Metrics

#### Get QMP dashboard data

```
GET /dashboard/:qmpId
```

Retrieves dashboard data for a specific QMP, including statistics on sections, factors, and compliance.

#### Get quality metrics for a CER project

```
GET /metrics/:cerProjectId
```

Retrieves quality metrics for a specific CER project.

## Data Models

### Quality Management Plan

```typescript
interface QualityManagementPlan {
  id: number;
  organizationId: number;
  name: string;
  version: string;
  description?: string;
  status: 'draft' | 'active' | 'archived';
  allowWaivers: boolean;
  cerTypeId?: number;
  metadata?: Record<string, any>;
  createdById: number;
  createdAt: Date;
  updatedById: number;
  updatedAt: Date;
}
```

### CTQ Factor

```typescript
interface CtqFactor {
  id: number;
  organizationId: number;
  name: string;
  description?: string;
  category: 'safety' | 'effectiveness' | 'performance' | 'clinical' | 'regulatory' | 'other';
  appliesTo: 'all' | 'device' | 'medicinal' | 'combination';
  sectionCode: string;
  riskLevel: 'low' | 'medium' | 'high';
  validationRule?: string;
  active: boolean;
  required: boolean;
  customMetadata?: Record<string, any>;
  createdById: number;
  createdAt: Date;
  updatedById: number;
  updatedAt: Date;
}
```

### Section Gating Rule

```typescript
interface QmpSectionGating {
  id: number;
  organizationId: number;
  qmpId: number;
  sectionKey: string;
  sectionName: string;
  requiredCtqFactorIds: number[];
  minimumMandatoryCompletion: number;
  minimumRecommendedCompletion: number;
  allowOverride: boolean;
  overrideRequiresApproval: boolean;
  overrideRequiresReason: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

### Waiver Request

```typescript
interface WaiverRequest {
  id: number;
  qmpId: number;
  sectionCode: string;
  organizationId: number;
  requestedById: number;
  requestedDate: Date;
  justification: string;
  factorIds: number[];
  customRuleIds?: string[];
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled';
  expirationDate?: Date;
  approvedById?: number;
  approvedDate?: Date;
  comments?: string;
  riskAssessment?: any;
}
```

## Error Handling

The API uses standard HTTP status codes to indicate success or failure:

- `200 OK` - The request succeeded
- `201 Created` - A new resource was created
- `400 Bad Request` - The request was malformed or contained invalid data
- `401 Unauthorized` - Authentication is required
- `403 Forbidden` - The authenticated user does not have permission
- `404 Not Found` - The requested resource was not found
- `409 Conflict` - The request conflicts with the current state
- `500 Internal Server Error` - An unexpected error occurred

Error responses include a JSON body with the following structure:

```json
{
  "error": "Error message",
  "details": "Optional detailed error information"
}
```

## Pagination and Filtering

List endpoints support pagination and filtering via query parameters:

- `limit` - Maximum number of items to return (default: 50)
- `offset` - Number of items to skip (default: 0)
- `sortBy` - Field to sort by (default varies by endpoint)
- `sortOrder` - Sort order, either `asc` or `desc` (default: `asc`)

Example: `GET /api/quality/ctq-factors/1/ctq-factors?limit=10&offset=20&sortBy=name&sortOrder=asc`

## Caching

The API implements server-side caching for read-heavy endpoints to improve performance. Cached data is automatically invalidated when related resources are modified.

## Rate Limiting

API requests are subject to rate limiting to ensure system stability. Rate limits are applied per user and per tenant.
