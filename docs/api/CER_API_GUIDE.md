# TrialSage CER API Guide

This document provides a comprehensive guide to the Clinical Evaluation Report (CER) API endpoints, including authentication, request/response formats, and error handling.

## Authentication

All API endpoints (except health check) require authentication using JSON Web Tokens (JWT).

### Authentication Header

```
Authorization: Bearer <your_jwt_token>
```

### Obtaining a Token

Tokens are obtained through the authentication API. See the Auth API documentation for details.

## API Endpoints

### Health Check

```
GET /api/health
```

Checks the health of the API server.

**Response:**

```json
{
  "status": "ok",
  "timestamp": "2025-04-29T17:00:00.000Z",
  "version": "1.0.0"
}
```

### Generate CER Report

```
POST /api/cer/generate
```

Initiates the generation of a new Clinical Evaluation Report.

**Request Body:**

```json
{
  "product": {
    "name": "Example Medical Device",
    "manufacturer": "Example Corp",
    "ndcCode": "12345-678-90"
  },
  "reportType": "full",
  "options": {
    "includeFaersData": true,
    "includeAdverseEvents": true,
    "generateExecutiveSummary": true
  }
}
```

**Response:**

```json
{
  "jobId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "status": "queued",
  "createdAt": "2025-04-29T17:05:00.000Z",
  "estimatedCompletionTime": "2025-04-29T17:10:00.000Z"
}
```

### Get CER Job Status

```
GET /api/cer/jobs/:jobId
```

Retrieves the status of a specific CER generation job.

**Parameters:**

- `jobId`: The UUID of the job

**Response:**

```json
{
  "jobId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "status": "processing",
  "progress": 60,
  "createdAt": "2025-04-29T17:05:00.000Z",
  "updatedAt": "2025-04-29T17:07:30.000Z",
  "estimatedCompletionTime": "2025-04-29T17:10:00.000Z"
}
```

### List CER Jobs

```
GET /api/cer/jobs
```

Lists all CER generation jobs for the authenticated user.

**Query Parameters:**

- `status`: Filter by status (optional)
- `page`: Page number (default: 1)
- `limit`: Results per page (default: 10)
- `sortBy`: Field to sort by (default: "createdAt")
- `sortOrder`: "asc" or "desc" (default: "desc")

**Response:**

```json
{
  "jobs": [
    {
      "jobId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "status": "completed",
      "createdAt": "2025-04-29T17:05:00.000Z",
      "completedAt": "2025-04-29T17:10:00.000Z",
      "productName": "Example Medical Device"
    },
    {
      "jobId": "d5ceb30a-12c4-4321-b123-1e02a5a3e579",
      "status": "queued",
      "createdAt": "2025-04-29T17:15:00.000Z",
      "productName": "Another Medical Device"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "totalItems": 2,
    "totalPages": 1
  }
}
```

### Download CER Report

```
GET /api/cer/reports/:jobId/download
```

Downloads the generated CER report PDF.

**Parameters:**

- `jobId`: The UUID of the job

**Response:**

- Content-Type: application/pdf
- Content-Disposition: attachment; filename="cer*report*<jobId>.pdf"
- The PDF file as a binary stream

### Get PDF Download URL (Signed URL)

```
GET /api/cer/reports/:jobId/url
```

Generates a time-limited signed URL for downloading the PDF.

**Parameters:**

- `jobId`: The UUID of the job

**Query Parameters:**

- `expiresIn`: URL expiration time in seconds (default: 3600)

**Response:**

```json
{
  "url": "https://s3.amazonaws.com/trialsage-cer/reports/f47ac10b-58cc-4372-a567-0e02b2c3d479.pdf?X-Amz-Algorithm=...",
  "expires": "2025-04-29T18:05:00.000Z"
}
```

### Cancel CER Job

```
POST /api/cer/jobs/:jobId/cancel
```

Cancels a queued or processing CER generation job.

**Parameters:**

- `jobId`: The UUID of the job

**Response:**

```json
{
  "jobId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "status": "cancelled",
  "updatedAt": "2025-04-29T17:08:00.000Z"
}
```

### Generate FAERS Data Report

```
POST /api/cer/faers
```

Generates a report based on FDA Adverse Event Reporting System (FAERS) data.

**Request Body:**

```json
{
  "ndcCode": "12345-678-90",
  "reportType": "summary",
  "dateRange": {
    "start": "2024-01-01",
    "end": "2025-04-29"
  }
}
```

**Response:**

```json
{
  "jobId": "a1b2c3d4-5678-90ab-cdef-0e1f2a3b4c5d",
  "status": "queued",
  "createdAt": "2025-04-29T17:20:00.000Z",
  "estimatedCompletionTime": "2025-04-29T17:22:00.000Z"
}
```

### Generate Report History

```
GET /api/cer/history
```

Gets the report generation history for the authenticated user.

**Query Parameters:**

- `page`: Page number (default: 1)
- `limit`: Results per page (default: 10)
- `sortBy`: Field to sort by (default: "createdAt")
- `sortOrder`: "asc" or "desc" (default: "desc")

**Response:**

```json
{
  "reports": [
    {
      "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "type": "cer",
      "createdAt": "2025-04-29T17:05:00.000Z",
      "productName": "Example Medical Device",
      "status": "completed"
    },
    {
      "id": "a1b2c3d4-5678-90ab-cdef-0e1f2a3b4c5d",
      "type": "faers",
      "createdAt": "2025-04-29T17:20:00.000Z",
      "productName": "Example Medical Device",
      "status": "completed"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "totalItems": 2,
    "totalPages": 1
  }
}
```

## Error Handling

The API uses standard HTTP status codes and includes detailed error information in the response body.

### Error Response Format

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      "field": "Additional error details"
    },
    "timestamp": "2025-04-29T17:25:00.000Z",
    "requestId": "req-123456789"
  }
}
```

### Common Error Codes

| HTTP Status | Error Code          | Description               |
| ----------- | ------------------- | ------------------------- |
| 400         | INVALID_REQUEST     | Request validation failed |
| 401         | UNAUTHORIZED        | Authentication required   |
| 403         | FORBIDDEN           | Insufficient permissions  |
| 404         | NOT_FOUND           | Resource not found        |
| 409         | CONFLICT            | Resource conflict         |
| 429         | RATE_LIMITED        | Too many requests         |
| 500         | SERVER_ERROR        | Internal server error     |
| 503         | SERVICE_UNAVAILABLE | Service unavailable       |

## Rate Limiting

The API implements rate limiting to prevent abuse. Rate limits are applied per user and API endpoint.

### Rate Limit Headers

Rate limit information is included in response headers:

- `X-RateLimit-Limit`: Maximum requests per time window
- `X-RateLimit-Remaining`: Remaining requests in the current window
- `X-RateLimit-Reset`: Time in seconds when the rate limit resets

### Rate Limits

| Endpoint          | Rate Limit          |
| ----------------- | ------------------- |
| /api/cer/generate | 10 requests/hour    |
| /api/cer/faers    | 20 requests/hour    |
| Other endpoints   | 100 requests/minute |

## Webhook Notifications (Enterprise Feature)

Enterprise customers can configure webhook notifications for job status changes.

### Configure Webhook

```
POST /api/cer/webhooks
```

**Request Body:**

```json
{
  "url": "https://example.com/webhook",
  "events": ["job.completed", "job.failed"],
  "secret": "your-webhook-secret"
}
```

### Webhook Payload

```json
{
  "event": "job.completed",
  "timestamp": "2025-04-29T17:10:00.000Z",
  "data": {
    "jobId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "status": "completed",
    "productName": "Example Medical Device",
    "completedAt": "2025-04-29T17:10:00.000Z"
  },
  "signature": "hmac-sha256-signature"
}
```

## API Versioning

The API is versioned using URI versioning. The current version is v1.

```
/api/v1/cer/generate
```

## API Client Libraries

API client libraries are available for:

- JavaScript/TypeScript
- Python
- Java
- C#

See the [Developer Portal](https://developer.trialsage.com) for API client downloads and documentation.
