# Product Audit API Documentation

## Overview

The Product Audit API provides endpoints for managing audit questionnaire responses in the Concept2Cure (C2C) workflow. This API enables organizations to track product audit progress, store assessment responses, and maintain audit history.

## Base URL

```
/api/product-audit
```

## Authentication

All endpoints require authentication via JWT token and organization context.

Required headers:
- `Authorization: Bearer <token>`

The authenticated user must have a valid organization context.

## Endpoints

### GET /api/product-audit/responses

Retrieve audit responses for the current organization.

#### Request

```http
GET /api/product-audit/responses
```

#### Response

```json
{
  "success": true,
  "data": {
    "organizationId": 100,
    "responses": {
      "1.1": {
        "questionId": "1.1",
        "status": "yes",
        "notes": "Verified compliance",
        "severity": "verified",
        "updatedAt": "2025-01-24T10:30:00Z"
      },
      "2.3": {
        "questionId": "2.3",
        "status": "partial",
        "notes": "Needs additional documentation",
        "severity": "p1",
        "updatedAt": "2025-01-24T10:35:00Z"
      }
    },
    "lastUpdated": "2025-01-24T10:35:00Z",
    "auditor": "auditor@example.com"
  }
}
```

#### Response Fields

- `organizationId` (number): The organization ID
- `responses` (object): Map of question IDs to audit responses
- `lastUpdated` (string): ISO 8601 timestamp of last update
- `auditor` (string): Email of the auditor who last updated the responses

### POST /api/product-audit/responses

Save or update audit questionnaire responses.

#### Request

```http
POST /api/product-audit/responses
Content-Type: application/json
```

```json
{
  "responses": {
    "1.1": {
      "questionId": "1.1",
      "status": "yes",
      "notes": "Verified compliance",
      "severity": "verified",
      "updatedAt": "2025-01-24T10:30:00Z"
    },
    "2.3": {
      "questionId": "2.3",
      "status": "partial",
      "notes": "Needs additional documentation",
      "severity": "p1",
      "updatedAt": "2025-01-24T10:35:00Z"
    }
  },
  "auditor": "auditor@example.com"
}
```

#### Request Fields

- `responses` (object, required): Map of question IDs to audit responses
  - Each response object must contain:
    - `questionId` (string, required): Unique identifier for the question
    - `status` ('yes' | 'no' | 'partial' | 'in_progress' | null, optional): Assessment status
    - `notes` (string, optional): Additional notes or comments
    - `severity` ('p0' | 'p1' | 'p2' | 'p3' | 'verified' | null, optional): Severity level
    - `updatedAt` (string, required): ISO 8601 timestamp
- `auditor` (string, optional): Email of the auditor

#### Response

```json
{
  "success": true,
  "data": {
    "organizationId": 100,
    "responses": {
      "1.1": {
        "questionId": "1.1",
        "status": "yes",
        "notes": "Verified compliance",
        "severity": "verified",
        "updatedAt": "2025-01-24T10:30:00Z"
      },
      "2.3": {
        "questionId": "2.3",
        "status": "partial",
        "notes": "Needs additional documentation",
        "severity": "p1",
        "updatedAt": "2025-01-24T10:35:00Z"
      }
    },
    "lastUpdated": "2025-01-24T10:35:00Z",
    "auditor": "auditor@example.com"
  },
  "message": "Audit responses saved successfully"
}
```

## Data Models

### AuditResponse

```typescript
interface AuditResponse {
  questionId: string;  // e.g. "1.1", "2.3"
  status: 'yes' | 'no' | 'partial' | 'in_progress' | null;
  notes: string;
  severity: 'p0' | 'p1' | 'p2' | 'p3' | 'verified' | null;
  updatedAt: string;  // ISO 8601 datetime
}
```

### AuditState

```typescript
interface AuditState {
  organizationId: number;
  responses: Record<string, AuditResponse>;
  lastUpdated: string;  // ISO 8601 datetime
  auditor: string;
}
```

## Status Values

- `yes`: Question requirement is fully satisfied
- `no`: Question requirement is not satisfied
- `partial`: Question requirement is partially satisfied
- `in_progress`: Assessment is in progress
- `null`: Not yet evaluated

## Severity Levels

- `p0`: Critical priority - blocking issue
- `p1`: High priority - major issue
- `p2`: Medium priority - moderate issue
- `p3`: Low priority - minor issue
- `verified`: Verified and compliant
- `null`: Not yet assessed

## Error Responses

### 400 Bad Request

Invalid request data or validation error.

```json
{
  "success": false,
  "error": "Invalid request data",
  "details": [
    {
      "code": "invalid_enum_value",
      "message": "Invalid enum value. Expected 'yes' | 'no' | 'partial' | 'in_progress', received 'invalid'",
      "path": ["responses", "1.1", "status"]
    }
  ]
}
```

### 400 Bad Request (Missing Organization Context)

```json
{
  "success": false,
  "error": "Organization context is required"
}
```

### 401 Unauthorized

Missing or invalid authentication token.

```json
{
  "success": false,
  "error": "Unauthorized"
}
```

### 500 Internal Server Error

```json
{
  "success": false,
  "error": "Failed to save audit responses"
}
```

## Examples

### Example 1: Initialize Empty Audit

```bash
curl -X GET \
  https://api.example.com/api/product-audit/responses \
  -H 'Authorization: Bearer <token>'
```

Response:
```json
{
  "success": true,
  "data": {
    "organizationId": 100,
    "responses": {},
    "lastUpdated": "2025-01-24T10:00:00Z",
    "auditor": "user@example.com"
  }
}
```

### Example 2: Save Initial Responses

```bash
curl -X POST \
  https://api.example.com/api/product-audit/responses \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "responses": {
      "1.1": {
        "questionId": "1.1",
        "status": "yes",
        "notes": "Documentation reviewed and approved",
        "severity": "verified",
        "updatedAt": "2025-01-24T10:30:00Z"
      }
    },
    "auditor": "qa-lead@example.com"
  }'
```

### Example 3: Update Existing Responses

```bash
curl -X POST \
  https://api.example.com/api/product-audit/responses \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "responses": {
      "2.3": {
        "questionId": "2.3",
        "status": "partial",
        "notes": "Awaiting additional test results",
        "severity": "p1",
        "updatedAt": "2025-01-24T11:00:00Z"
      }
    }
  }'
```

The new response will be merged with existing responses from Example 2.

## Implementation Notes

### In-Memory Storage

The current implementation uses in-memory storage (`Map<number, AuditState>`). This means:

- Data persists only while the server is running
- Data is lost on server restart
- Suitable for lightweight auditing during development
- For production use, consider migrating to database storage

### Organization Isolation

All audit responses are scoped to the organization context:
- Each organization maintains separate audit state
- Users can only access audit data for their own organization
- Organization isolation is enforced by the `requireOrganizationContext` middleware

### Response Merging

When saving responses via POST:
- New responses are merged with existing ones
- Existing question responses are updated
- New question responses are added
- Unaffected question responses remain unchanged

## Security

- All endpoints require JWT authentication
- Organization context is validated on every request
- Input validation using Zod schemas
- SQL injection protection (not applicable - in-memory storage)
- XSS prevention through JSON response encoding

## Rate Limiting

Currently no rate limiting is implemented. Consider adding rate limiting for production use.

## Future Enhancements

Potential improvements for future versions:

1. **Database Persistence**: Migrate from in-memory to database storage
2. **Audit History**: Track complete history of all changes
3. **Bulk Operations**: Support batch updates for multiple questions
4. **Export/Import**: Export audit data to CSV/Excel
5. **Notifications**: Alert users when audit status changes
6. **Analytics**: Aggregate audit statistics and trends
7. **Collaboration**: Support multiple auditors with change tracking
8. **Attachments**: Allow file attachments per question response
