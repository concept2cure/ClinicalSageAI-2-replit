# TrialSage CER Worker

The CER Worker is a critical component of the TrialSage Clinical Evaluation Report (CER) Generation system. It handles the resource-intensive tasks of PDF generation, OpenAI API interactions, and document processing.

## Architecture

The worker is designed to process jobs from a Redis-based Bull queue. It communicates with the API server through both the queue and direct HTTP calls when needed. The worker is containerized and designed to be horizontally scalable.

## Features

- **PDF Rendering**: Generates professional-quality PDF reports from templates and content
- **Concurrent Processing**: Handles multiple jobs simultaneously for improved throughput
- **Fault Tolerance**: Implements retry mechanisms with exponential backoff
- **Monitoring**: Exposes Prometheus metrics for observability
- **Resource Control**: Configurable concurrency and memory limits
- **AI Integration**: Interacts with OpenAI for document intelligence

## Configuration

The worker is configured through environment variables:

| Variable             | Description                             | Default                  |
| -------------------- | --------------------------------------- | ------------------------ |
| `NODE_ENV`           | Environment (development/production)    | `production`             |
| `PORT`               | HTTP port for health checks and metrics | `8080`                   |
| `METRICS_PORT`       | Port for Prometheus metrics             | `9090`                   |
| `CONCURRENCY`        | Number of concurrent jobs               | `2`                      |
| `MAX_MEMORY_RESTART` | Memory limit before restart             | `2G`                     |
| `REDIS_URL`          | Redis connection string                 | Required                 |
| `DATABASE_URL`       | PostgreSQL connection string            | Required                 |
| `JWT_SECRET`         | JWT secret for authentication           | Required                 |
| `AWS_ENABLED`        | Enable S3 storage                       | `false`                  |
| `AWS_REGION`         | AWS region                              | `us-east-1`              |
| `AWS_S3_BUCKET`      | S3 bucket name                          | Required if AWS enabled  |
| `AWS_ACCESS_KEY`     | AWS access key                          | Required if AWS enabled  |
| `AWS_SECRET_KEY`     | AWS secret key                          | Required if AWS enabled  |
| `OPENAI_API_KEY`     | OpenAI API key                          | Required for AI features |

## Development

### Prerequisites

- Node.js 18+
- Docker for containerization
- Access to Redis and PostgreSQL
- OpenAI API key for AI features

### Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Set up environment variables:

   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. Run the worker in development mode:
   ```bash
   npm run dev
   ```

### Building the Container

```bash
docker build -t trialsage/cer-worker:latest .
```

### Architecture Details

The worker uses a multi-layered architecture:

1. **HTTP Server Layer**: Express server for health checks and metrics
2. **Queue Processing Layer**: Bull queue consumer with concurrency control
3. **Rendering Engine**: Puppeteer-based PDF generation with fallback mechanisms
4. **AI Integration Layer**: OpenAI API client for document intelligence
5. **Storage Layer**: Local file system or S3 for PDF storage

### Job Processing Flow

1. Job is pulled from Redis queue
2. Worker fetches necessary data from database
3. Document template is populated with content
4. PDF is rendered using Puppeteer
5. PDF is stored locally or in S3
6. Job status is updated in database
7. Notifications are sent if configured

## Performance Tuning

- **Concurrency**: Adjust based on available CPU and memory
- **Memory Limits**: Set based on expected PDF complexity and size
- **Retry Strategy**: Configure based on expected transient failures
- **Puppeteer Pooling**: Adjust browser instance reuse for better performance

## Monitoring

The worker exposes Prometheus metrics at `/metrics` on the metrics port. Key metrics include:

- `cer_jobs_processed_total`: Counter of total jobs processed
- `cer_jobs_succeeded_total`: Counter of successful jobs
- `cer_jobs_failed_total`: Counter of failed jobs
- `cer_job_duration_seconds`: Histogram of job processing duration
- `cer_job_queue_length`: Gauge of current queue length
- `cer_memory_usage_bytes`: Gauge of memory usage
- `cer_cpu_usage_percent`: Gauge of CPU usage

## Troubleshooting

Common issues and solutions:

1. **Memory Crashes**: Increase `MAX_MEMORY_RESTART` and container memory limits
2. **Slow PDF Generation**: Check for resource contention, reduce concurrency
3. **Failed OpenAI Calls**: Verify API key and network connectivity
4. **Database Connection Issues**: Check connection string and PostgreSQL availability

## Contributing

1. Follow project coding standards
2. Write tests for new features
3. Document changes in code and update this README as needed
4. Submit pull requests for review
