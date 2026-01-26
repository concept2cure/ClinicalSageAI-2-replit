# FDA 510(k) API Migration Guide

## Overview

As part of the Q1 2026 consolidation sprint, all 510(k) related API endpoints are being consolidated into a unified API at `/api/fda510k-unified`.

**Sunset Date: June 30, 2026**

After this date, legacy endpoints will return `410 Gone` responses.

## Quick Reference

| Legacy Endpoint               | New Endpoint                        | Description                  |
| ----------------------------- | ----------------------------------- | ---------------------------- |
| `/api/510k/*`                 | `/api/fda510k-unified/device/*`     | Device profiles, predicates  |
| `/api/fda510k/requirements/*` | `/api/fda510k-unified/api/*`        | Requirements by device class |
| `/api/fda510k/compliance/*`   | `/api/fda510k-unified/compliance/*` | Compliance checks            |
| `/api/510k/literature/*`      | `/api/fda510k-unified/literature/*` | Literature search            |
| `/api/510k-projects/*`        | `/api/fda510k-unified/projects/*`   | Project wizard               |
| `/api/fda510k/*`              | `/api/fda510k-unified/fda/*`        | FDA database queries         |
| `/api/510k-estar/*`           | `/api/fda510k-unified/estar/*`      | eSTAR package generation     |

## Deprecation Headers

All legacy endpoints now return the following headers:

```http
Deprecation: true
Sunset: Tue, 30 Jun 2026 00:00:00 GMT
Link: </api/fda510k-unified/device>; rel="successor-version"
Warning: 299 - "This endpoint is deprecated..."
X-Deprecation-Notice: This endpoint is deprecated...
X-Migration-Endpoint: /api/fda510k-unified/device
X-Migration-Guide: /api/fda510k-unified/docs
```

## Migration Steps

### 1. Update Base URL

Replace your base URL from legacy endpoints to the unified API:

```javascript
// Before
const baseUrl = '/api/510k';

// After
const baseUrl = '/api/fda510k-unified/device';
```

### 2. Update Request Headers

The unified API uses the same tenant context headers:

```javascript
headers: {
  'X-Organization-Id': 'your-org-id',
  'X-Client-Workspace-Id': 'your-workspace-id',
  'X-Module': '510k'
}
```

### 3. Endpoint-Specific Changes

#### Device Profiles

```javascript
// Before: POST /api/510k/device-profile
// After:  POST /api/fda510k-unified/device/device-profile

// Before: GET /api/510k/predicate-search
// After:  GET /api/fda510k-unified/device/predicate-search
```

#### Requirements

```javascript
// Before: GET /api/fda510k/requirements/:deviceClass
// After:  GET /api/fda510k-unified/api/requirements/:deviceClass
```

#### Compliance Checks

```javascript
// Before: GET /api/fda510k/compliance-results/:projectId
// After:  GET /api/fda510k-unified/compliance/compliance-results/:projectId

// Before: POST /api/fda510k/run-checks
// After:  POST /api/fda510k-unified/compliance/run-checks
```

#### Literature Search

```javascript
// Before: POST /api/510k/literature/search
// After:  POST /api/fda510k-unified/literature/search
```

#### Project Management

```javascript
// Before: GET /api/510k-projects/templates
// After:  GET /api/fda510k-unified/projects/templates

// Before: POST /api/510k-projects/create
// After:  POST /api/fda510k-unified/projects/create
```

#### FDA Database

```javascript
// Before: GET /api/fda510k/search
// After:  GET /api/fda510k-unified/fda/search

// Before: GET /api/fda510k/device/:k_number
// After:  GET /api/fda510k-unified/fda/device/:k_number
```

#### eSTAR Package

```javascript
// Before: POST /api/510k-estar/validate
// After:  POST /api/fda510k-unified/estar/validate

// Before: POST /api/510k-estar/build
// After:  POST /api/fda510k-unified/estar/build
```

## Response Format

The unified API maintains backward-compatible response formats. No changes to response parsing are required.

## Rate Limiting

The unified API includes built-in rate limiting:

- **100 requests per minute** per organization
- Rate limit headers included in responses:
  - `X-RateLimit-Limit: 100`
  - `X-RateLimit-Remaining: 95`

## Health Check

Verify the unified API is available:

```bash
curl /api/fda510k-unified/health
```

Response:

```json
{
  "status": "ok",
  "timestamp": "2026-01-26T12:00:00.000Z",
  "service": "fda510k-unified-api",
  "version": "2.0.0",
  "modules": [
    "device-profiles",
    "requirements",
    "compliance",
    "literature",
    "projects",
    "fda-api",
    "estar"
  ]
}
```

## API Documentation

Full API documentation is available at:

```
GET /api/fda510k-unified/docs
```

## Support

If you encounter issues during migration:

1. Check the deprecation headers for specific migration guidance
2. Review the API documentation at `/api/fda510k-unified/docs`
3. Contact the platform team for assistance

## Timeline

| Date         | Action                                                      |
| ------------ | ----------------------------------------------------------- |
| Jan 26, 2026 | Deprecation notices added to legacy endpoints               |
| Mar 31, 2026 | Warning emails sent to organizations using legacy endpoints |
| May 31, 2026 | Legacy endpoints return 429 if unified endpoints available  |
| Jun 30, 2026 | **Sunset** - Legacy endpoints return 410 Gone               |
