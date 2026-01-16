# CSR Ingestion Pipeline (Phase 22)

## Overview

The CSR Ingestion Pipeline is a robust, queue-based system for harvesting Clinical Study Reports (CSRs) from external sources, extracting structured data, and storing them in the deep vault.

## Architecture

### Components

1. **Database Migration** (`server/db/migrations/22_ingestion_log.sql`)
   - Creates `csr_ingestion_log` table for job tracking
   - Includes indexes for efficient querying

2. **PDFProcessor** (`server/services/PDFProcessor.ts`)
   - Extracts text using PyPDF2
   - Extracts tables using pdfplumber
   - Python script: `server/scripts/extract_pdf.py`

3. **CSRHarvesterService** (`server/services/CSRHarvesterService.ts`)
   - Orchestrates the complete ingestion workflow:
     1. Validate job parameters
     2. Check for duplicate submission_id
     3. Download PDF (60s timeout, 3 retries, exponential backoff)
     4. Verify MIME type (application/pdf)
     5. Calculate SHA256 checksum
     6. Extract text and tables
     7. Call LLM structured extractor
     8. Validate payload
     9. Insert into csr_deep_vault
     10. Log to csr_ingestion_log

4. **BullMQ Queue** (`server/queue/CSRHarvestQueue.ts`)
   - Redis-backed job queue
   - Priority-based job scheduling
   - Automatic retries with exponential backoff
   - Job retention policies

5. **Worker** (`server/queue/worker.ts`)
   - Concurrency: 4 workers
   - Processes jobs from the queue
   - Graceful shutdown handling

6. **API Routes** (`server/api/vault/harvest.ts`)
   - `POST /api/vault/harvest/enqueue` - Enqueue jobs (max 100 per batch)
   - `GET /api/vault/harvest/status?submissionId=xxx` - Get job status
   - `GET /api/vault/harvest/metrics` - Get queue metrics

## Setup

### Prerequisites

1. **Redis** - Required for BullMQ queue
   ```bash
   # Install Redis (Ubuntu/Debian)
   sudo apt-get install redis-server
   
   # Start Redis
   redis-server
   ```

2. **Python Dependencies**
   ```bash
   pip install pdfplumber PyPDF2
   ```

3. **Node Dependencies**
   ```bash
   npm install
   ```

### Environment Variables

Add to `.env`:
```
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgresql://user:password@host:port/database
```

### Database Migration

Run the migration to create the ingestion log table:
```bash
psql $DATABASE_URL -f server/db/migrations/22_ingestion_log.sql
```

## Usage

### Starting the Worker

In a separate terminal:
```bash
npm run harvest-worker
```

### Enqueueing Jobs

**Single Job:**
```bash
curl -X POST http://localhost:5000/api/vault/harvest/enqueue \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "jobs": [
      {
        "submissionId": "HC-12345",
        "sourceUrl": "https://example.com/csr.pdf",
        "priority": 5
      }
    ]
  }'
```

**Batch Jobs (up to 100):**
```bash
curl -X POST http://localhost:5000/api/vault/harvest/enqueue \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "jobs": [
      {"submissionId": "HC-12345", "sourceUrl": "https://example.com/csr1.pdf"},
      {"submissionId": "HC-12346", "sourceUrl": "https://example.com/csr2.pdf"},
      {"submissionId": "HC-12347", "sourceUrl": "https://example.com/csr3.pdf"}
    ]
  }'
```

### Checking Job Status

```bash
curl -X GET "http://localhost:5000/api/vault/harvest/status?submissionId=HC-12345" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Queue Metrics

```bash
curl -X GET "http://localhost:5000/api/vault/harvest/metrics" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Job Lifecycle

1. **Pending** - Job enqueued, waiting for worker
2. **Processing** - Worker picked up the job
3. **Completed** - Successfully processed and stored
4. **Failed** - Error occurred (see error_message)

## Error Handling

- **Download Failures**: Retries 3 times with exponential backoff (2s, 4s, 8s)
- **Invalid MIME Type**: Fails immediately
- **Duplicate submission_id**: Skips processing
- **Extraction Failures**: Logs error and marks as failed
- **Network Issues**: Automatic retries via BullMQ

## Monitoring

### Database Queries

Check recent jobs:
```sql
SELECT * FROM csr_ingestion_log 
ORDER BY created_at DESC 
LIMIT 10;
```

Check failed jobs:
```sql
SELECT * FROM csr_ingestion_log 
WHERE status = 'failed'
ORDER BY created_at DESC;
```

Check processing stats:
```sql
SELECT 
  status,
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_duration_seconds
FROM csr_ingestion_log
WHERE completed_at IS NOT NULL
GROUP BY status;
```

## Testing

### Health Canada Sample

Test with a single CSR from Health Canada:
```bash
curl -X POST http://localhost:5000/api/vault/harvest/enqueue \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "jobs": [
      {
        "submissionId": "HC-TEST-001",
        "sourceUrl": "https://health-products.canada.ca/files/csr/sample.pdf",
        "priority": 1
      }
    ]
  }'
```

## Future Enhancements

- [ ] Integrate actual LLM structured extractor
- [ ] Add support for other document formats (DOCX, HTML)
- [ ] Implement rate limiting per source domain
- [ ] Add webhook notifications for job completion
- [ ] Create admin dashboard for queue monitoring
- [ ] Support for authenticated document sources
- [ ] Implement csr_deep_vault schema if not exists

## Troubleshooting

**Worker not processing jobs:**
- Check Redis connection: `redis-cli ping`
- Verify REDIS_URL environment variable
- Check worker logs for errors

**PDF extraction failing:**
- Verify Python dependencies installed
- Check extract_pdf.py script permissions
- Test PDF manually: `python3 server/scripts/extract_pdf.py /path/to/test.pdf`

**Database errors:**
- Verify migration ran successfully
- Check DATABASE_URL connection
- Verify csr_deep_vault table exists

## License

Proprietary - ClinicalSageAI Platform
