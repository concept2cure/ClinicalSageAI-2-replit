# Phase 22: CSR Ingestion Pipeline

## Overview

The CSR Ingestion Pipeline is a fully automated system for downloading, extracting, validating, and storing Clinical Study Reports (CSRs) from regulatory agencies. It uses a queue-based architecture with BullMQ and Redis for scalable background processing.

## Architecture

```
┌─────────────────┐
│  API Endpoint   │  POST /api/vault/harvest/enqueue
│   (Express)     │  GET  /api/vault/harvest/status/:id
└────────┬────────┘
         │
         v
┌─────────────────┐
│  BullMQ Queue   │  Job queuing with priority
│   (Redis)       │  Retry logic & backoff
└────────┬────────┘
         │
         v
┌─────────────────┐
│     Worker      │  Concurrency: 4 jobs
│  (Background)   │  Rate limit: 10/min
└────────┬────────┘
         │
         v
┌─────────────────────────────────────────┐
│       CSRHarvesterService               │
│  1. Download PDF (axios, retries)       │
│  2. Extract Text/Tables (pdfplumber)    │
│  3. LLM Extraction (GPT-4)              │
│  4. Validate Data (completeness)        │
│  5. Store in DB (deduplication)         │
│  6. Log Status                          │
└─────────────────────────────────────────┘
         │
         v
┌─────────────────┐
│   PostgreSQL    │  csr_deep_vault
│    Database     │  csr_ingestion_log
└─────────────────┘
```

## Components

### 1. Database Migration

**File:** `server/db/migrations/22_ingestion_log.sql`

Creates the `csr_ingestion_log` table to track:
- Job status (pending, downloading, processing, completed, failed)
- Timestamps (started_at, completed_at)
- Performance metrics (download/extraction duration)
- Quality scores (confidence, completeness)
- Error tracking with retry counts
- Duplicate detection via SHA256 hash

**Run migration:**
```bash
psql $DATABASE_URL -f server/db/migrations/22_ingestion_log.sql
```

### 2. PDFProcessor Service

**File:** `server/services/PDFProcessor.ts`

Python-based PDF extraction using:
- **pdfplumber**: Table extraction
- **PyPDF2**: Text and metadata extraction

Features:
- SHA256 hash computation
- PDF validation
- Buffer and file-based processing

**Python helper:** `server/services/pdf_extractor_helper.py`

### 3. ValidationService

**File:** `server/services/ValidationService.ts`

Validates extracted CSR data against ICH E3 requirements:
- Required sections check
- Completeness scoring (0-1)
- Confidence scoring
- Error/warning generation

### 4. CSRHarvesterService

**File:** `server/services/CSRHarvesterService.ts`

Main orchestrator for the full pipeline:

**Download Manager:**
- Timeout: 60 seconds
- Retries: 3 with exponential backoff
- Content-type validation
- Stream processing for large files

**Pipeline Steps:**
1. Create ingestion log entry
2. Download PDF with retry logic
3. Validate PDF format
4. Compute SHA256 hash
5. Check for duplicates
6. Extract text and tables
7. LLM-based structured extraction
8. Validate completeness
9. Store in csr_deep_vault
10. Update ingestion log

### 5. BullMQ Queue

**File:** `server/queue/CSRHarvestQueue.ts`

Job queue configuration:
- Queue name: `csr-harvest`
- Redis connection with retry strategy
- Job options:
  - Attempts: 3
  - Backoff: Exponential (5s base)
  - Retention: 1000 completed, 5000 failed

**Functions:**
- `enqueueCSRHarvest()` - Single job
- `enqueueBatchCSRHarvest()` - Batch (max 100)
- `getQueueStats()` - Statistics
- `getJobStatus()` - Job status by ID

### 6. Worker Process

**File:** `server/queue/worker.ts`

Background worker configuration:
- Concurrency: 4 simultaneous jobs
- Rate limiting: 10 jobs/minute
- Lock duration: 5 minutes (for long-running jobs)
- Auto-run: true

**Run worker:**
```bash
npm run worker:csr-harvest
```

### 7. API Routes

**File:** `server/api/vault/harvest.ts`

**Endpoints:**

#### POST `/api/vault/harvest/enqueue`
Enqueue single or batch harvest jobs.

**Auth:** Requires admin or data_scientist role

**Single job request:**
```json
{
  "submissionId": "HC-12345",
  "pdfUrl": "https://example.com/csr.pdf",
  "priority": 5,
  "metadata": {
    "regulatoryAgency": "Health Canada",
    "drugName": "Test Drug"
  }
}
```

**Batch request:**
```json
{
  "jobs": [
    {
      "submissionId": "HC-12345",
      "pdfUrl": "https://example.com/csr1.pdf"
    },
    {
      "submissionId": "HC-12346",
      "pdfUrl": "https://example.com/csr2.pdf"
    }
  ]
}
```

**Response:**
```json
{
  "status": "success",
  "message": "2 jobs enqueued",
  "data": {
    "jobIds": ["harvest-HC-12345-...", "harvest-HC-12346-..."],
    "count": 2
  }
}
```

#### GET `/api/vault/harvest/status/:submissionId`
Get ingestion status for a submission.

**Response:**
```json
{
  "status": "success",
  "data": {
    "submissionId": "HC-12345",
    "logs": [
      {
        "logId": 123,
        "status": "completed",
        "startedAt": "2024-01-16T10:00:00Z",
        "completedAt": "2024-01-16T10:02:30Z",
        "metrics": {
          "fileSizeBytes": 2500000,
          "downloadDurationMs": 5000,
          "extractionDurationMs": 120000,
          "totalDurationMs": 150000
        },
        "quality": {
          "confidence": 0.85,
          "completeness": 0.9
        },
        "csrId": 456,
        "hash": "abc123..."
      }
    ],
    "latestStatus": "completed"
  }
}
```

#### GET `/api/vault/harvest/queue/stats`
Get queue statistics.

**Response:**
```json
{
  "status": "success",
  "data": {
    "waiting": 10,
    "active": 4,
    "completed": 1000,
    "failed": 5,
    "delayed": 2,
    "total": 1021
  }
}
```

#### GET `/api/vault/harvest/job/:jobId`
Get job status by job ID.

## Dependencies

### Node.js
- `bullmq`: Job queue system
- `ioredis`: Redis client
- `axios`: HTTP client with retry logic
- `pg`: PostgreSQL client

### Python
- `pdfplumber`: PDF table extraction
- `PyPDF2`: PDF text extraction

## Installation

1. **Install Node dependencies:**
```bash
npm install
```

2. **Install Python dependencies:**
```bash
pip install -r server/services/python/requirements.txt
```

3. **Configure Redis:**
Add to `.env` or `.env.local`:
```env
REDIS_HOST=localhost
REDIS_PORT=6379
```

4. **Run database migration:**
```bash
psql $DATABASE_URL -f server/db/migrations/22_ingestion_log.sql
```

## Usage

### Start the Worker

In a separate terminal:
```bash
npm run worker:csr-harvest
```

### Enqueue Jobs via API

```bash
curl -X POST http://localhost:5000/api/vault/harvest/enqueue \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "submissionId": "HC-TEST-001",
    "pdfUrl": "https://clinical-information.canada.ca/ci-rc/download?fid=..."
  }'
```

### Check Status

```bash
curl http://localhost:5000/api/vault/harvest/status/HC-TEST-001 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Monitor Queue

```bash
curl http://localhost:5000/api/vault/harvest/queue/stats \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Testing

Run the end-to-end test:
```bash
node test-csr-pipeline.js
```

This will:
1. Check database schema
2. Download a sample Health Canada CSR
3. Extract and validate data
4. Store in database
5. Display metrics

## Performance

- **Download:** 60s timeout, 3 retries with exponential backoff
- **Processing:** Typically 1-3 minutes per CSR depending on size
- **Concurrency:** 4 simultaneous jobs
- **Rate Limit:** 10 jobs per minute
- **Deduplication:** SHA256 hash check before processing

## Error Handling

- Automatic retry on failure (3 attempts)
- Exponential backoff between retries
- Detailed error logging in `csr_ingestion_log`
- Failed jobs retained for 7 days for debugging

## Security

- Authentication required (admin or data_scientist role)
- PDF validation before processing
- Content-type verification
- Rate limiting to prevent abuse
- Duplicate detection to avoid reprocessing

## Monitoring

Monitor ingestion via:
1. Queue statistics endpoint
2. Database queries on `csr_ingestion_log`
3. Worker logs (stdout)

## Troubleshooting

**Redis connection error:**
- Ensure Redis is running: `redis-cli ping`
- Check REDIS_HOST and REDIS_PORT env vars

**Python extraction fails:**
- Verify Python dependencies: `pip list | grep -E "pdfplumber|PyPDF2"`
- Check Python path in PDFProcessor

**Database migration not applied:**
```bash
psql $DATABASE_URL -f server/db/migrations/22_ingestion_log.sql
```

**Worker not processing jobs:**
- Check worker is running: `ps aux | grep worker`
- Check Redis connection
- Review worker logs for errors

## Future Enhancements

- [ ] Web UI for monitoring queue
- [ ] Webhook notifications on completion
- [ ] Multi-agency support (FDA, EMA, etc.)
- [ ] Advanced table parsing with ML
- [ ] Real-time progress updates via WebSocket
- [ ] Batch import from CSV/Excel
