# TrialSage Automated Knowledge Enhancement System

## Overview

The TrialSage Automated Knowledge Enhancement System ensures our AI continuously improves without requiring manual uploads of academic resources. Since "our value is our knowledge," this system maintains our competitive edge by automatically acquiring, processing, and integrating the latest clinical research knowledge.

## Components

### 1. Health Canada CSR Import (`import_batch_of_50.js`, `import_500_more_canada_trials.js`)

- Imports batches of 50 clinical trial reports from Health Canada
- Provides structured processing of trial data
- Handles error recovery and tracking
- Supports bulk imports of 500 trials at once

### 2. Academic Knowledge Enhancement (`auto_knowledge_enhancement.js`)

- Fetches new academic papers from PubMed and other open sources
- Monitors clinical trial registries for new publications
- Processes and structures data using Hugging Face models (BAAI/bge-large-en-v1.5 for embeddings, mistralai/Mixtral-8x7B-Instruct-v0.1 for text)
- Integrates knowledge into our academic-knowledge-service

### 3. Journal RSS Monitor (`journal_rss_monitor.js`)

- Continuously monitors RSS feeds from top clinical research journals
- Automatically assesses relevance of new publications
- Extracts key information and formats it for our knowledge service
- Tracks processed articles to avoid duplication

### 4. Knowledge Scheduler (`knowledge_scheduler.js`)

- Coordinates all knowledge enhancement tasks
- Runs on configurable schedules:
  - Health Canada CSR imports: Weekly (Mondays at 3:00 AM)
  - Academic knowledge enhancement: Daily (2:00 AM)
  - Journal RSS monitoring: Twice daily (8:00 AM and 8:00 PM)
  - Bulk Canada imports: Monthly (1st at 1:00 AM)
- Provides status monitoring and manual task execution
- Maintains detailed logs of all enhancement activities

## Key Benefits

1. **Continuous Knowledge Expansion**: Automatically adds 500+ new clinical trials and numerous academic papers each month
2. **Zero Manual Uploads**: Eliminates the need for manual research and uploading
3. **Exclusive Use of Hugging Face**: All processing uses Hugging Face models (no OpenAI/Perplexity)
4. **Robust Error Handling**: Automatically recovers from failures and tracks progress
5. **Comprehensive Logging**: Maintains detailed records of all enhancement activities

## Getting Started

### Install Dependencies

```bash
npm install node-cron axios xml2js
```

### Start the Knowledge Enhancement System

```bash
node knowledge_scheduler.js
```

### Check System Status

```bash
node knowledge_scheduler.js status
```

### Run Individual Tasks Manually

```bash
node knowledge_scheduler.js run knowledgeEnhancement
node knowledge_scheduler.js run journalMonitor
node knowledge_scheduler.js run canadaImport
node knowledge_scheduler.js run bulkCanadaImport
```

## Configuration

All components can be configured through their respective files:

- `knowledge_scheduler.js`: Schedule settings and task coordination
- `auto_knowledge_enhancement.js`: Academic source settings and processing parameters
- `journal_rss_monitor.js`: Journal RSS feeds and relevance thresholds
- `import_batch_of_50.js`: Import settings and tracking

### Required Environment Variables

Create a `.env` file similar to the following:

```env
HF_API_KEY=your_huggingface_api_key_here

# PostgreSQL connection
DATABASE_URL=postgresql://user:password@localhost:5432/trialsage
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=password
PGDATABASE=trialsage

# MongoDB (for CSR storage)
MONGODB_URI=mongodb://localhost:27017/

# PubMed API (optional)
PUBMED_API_KEY=your_pubmed_api_key
```

This snippet provides defaults for running the enhancement tasks locally. Adjust values for your environment.

## Integration with TrialSage Platform

The automated knowledge system integrates with:

1. **academic-knowledge-service.ts**: Expands source list with new academic papers
2. **protocol-knowledge-service.ts**: Enhances protocol recommendations with latest research
3. **agent-service.ts**: Improves AI agent responses with updated knowledge

## Maintenance

The system is designed to be self-maintaining, but occasional review of the logs in the `logs/knowledge_enhancement` directory is recommended to ensure optimal performance.

For any issues, first check the log files:

- `canada_import_log.json`
- `knowledge_enhancement_log.json`
- `journal_monitor_log.json`
- `bulk_canada_import_log.json`

## Data Storage

All acquired knowledge is stored in structured directories:

- `/data/academic_sources`: Academic papers
- `/data/knowledge_structure`: Processed and structured knowledge
- `/data/trial_registries`: Data from clinical trial registries
- `/data/processed_knowledge`: Ready-to-integrate knowledge
- `/data/processed_csrs`: Processed clinical study reports

## "Our Value is Our Knowledge"

This system ensures TrialSage's AI consistently has access to the latest clinical research knowledge without requiring manual intervention, maintaining our unique value proposition by continuously expanding our knowledge base.
