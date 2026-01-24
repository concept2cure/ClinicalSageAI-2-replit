# Quality Management API Reference

This document provides reference information for the Quality Management API, which integrates Critical-to-Quality (CTQ) factors, section gating, and quality validation in TrialSage's Clinical Evaluation Report (CER) system.

## Overview

The Quality Management API provides a unified interface for interacting with quality control mechanisms in the CER generation process. It enables:

- Risk-based quality validation through CTQ factors
- Section gating with configurable validation rules
- Waiver request and approval workflow management
- Quality dashboard and metrics reporting

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

1. **Quality Management Plans** - Managing QMPs
2. **CTQ Factors** - Define and manage quality factors
3. **Section Gating** - Configure section quality requirements
4. **Validation** - Validate content against quality rules
5. **Waivers** - Request and manage quality requirement waivers

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

Creates a new Quality Management Plan.

Request body:

```json
{
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

Updates a Quality Management Plan.

Request body:

```json
{
  "status": "active",
  "allowWaivers": false
}
```

#### Delete a QMP

```
DELETE /plans/:id
```

Deletes a Quality Management Plan. Returns an error if the QMP is in use by any gating rules.

### CTQ Factors

#### Get all CTQ factors

```
GET /ctq-factors/:tenantId/ctq-factors
```

Retrieves all CTQ factors for the specified tenant. Supports filtering via query parameters:

- `category` - Filter by category
- `riskLevel` - Filter by risk level
- `sectionCode` - Filter by section code
- `active` - Filter by active status

#### Get a single CTQ factor

```
GET /ctq-factors/:tenantId/ctq-factors/:factorId
```

Retrieves a specific CTQ factor by ID.

#### Create a CTQ factor

```
POST /ctq-factors/:tenantId/ctq-factors
```

Creates a new CTQ factor.

Request body:

```json
{
  "name": "Comprehensive Literature Search",
  "description": "Evidence of a comprehensive literature search strategy",
  "category": "clinical",
  "appliesTo": "all",
  "sectionCode": "literature-analysis",
  "riskLevel": "high",
  "validationRule": "search strategy,databases,inclusion criteria,exclusion criteria",
  "active": true,
  "required": true
}
```

#### Update a CTQ factor

```
PATCH /ctq-factors/:tenantId/ctq-factors/:factorId
```

Updates an existing CTQ factor.

#### Delete a CTQ factor

```
DELETE /ctq-factors/:tenantId/ctq-factors/:factorId
```

Deletes a CTQ factor. Returns an error if the factor is in use by any gating rules.

#### Batch operations

```
POST /ctq-factors/:tenantId/ctq-factors/batch
```

Performs batch operations on CTQ factors. Operations include:

- `update-status` - Update active status for multiple factors
- `clone-template` - Clone factors from a template
- `apply-to-sections` - Apply factors to multiple sections

### Section Gating

#### Get section gating rules for a QMP

```
GET /section-gating/:qmpId/sections
```

Retrieves all section gating rules for a specific QMP.

#### Get a specific section gating rule

```
GET /section-gating/rule/:id
```

Retrieves a specific section gating rule by ID, including associated CTQ factors.

#### Create a section gating rule

```
POST /section-gating
```

Creates a new section gating rule.

Request body:

```json
{
  "qmpId": 1,
  "sectionCode": "benefit-risk",
  "ctqFactors": [1, 2, 3],
  "requiredLevel": "hard",
  "customValidations": [
    {
      "name": "Risk-benefit analysis completeness",
      "description": "Checks if the risk-benefit analysis is complete",
      "rule": "risk analysis,benefit analysis,conclusion",
      "severity": "high"
    }
  ],
  "active": true
}
```

#### Update a section gating rule

```
PUT /section-gating/:id
```

Updates an existing section gating rule.

#### Delete a section gating rule

```
DELETE /section-gating/:id
```

Deletes a section gating rule.

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

Requests a waiver for quality requirements that cannot be met.

Request body:

```json
{
  "qmpId": 1,
  "sectionCode": "clinical-background",
  "justification": "Clinical data is limited due to novel device classification",
  "factorIds": [1, 5],
  "expirationDate": "2025-12-31T23:59:59Z"
}
```

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
