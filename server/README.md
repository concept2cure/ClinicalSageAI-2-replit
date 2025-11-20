# TrialSage: Clinical Trial Intelligence Platform

## Overview

TrialSage is an AI-powered platform for clinical study report analysis and protocol generation. It leverages OpenAI's GPT-4 models to provide evidence-based protocol recommendations, IND module drafting, and regulatory insight.

## Deployment Checklist

### 1. Environment Setup

- [ ] Set up Python 3.9+ environment
- [ ] Configure required environment variables:
  - `OPENAI_API_KEY` - OpenAI API key
  - `MAILGUN_SMTP_SERVER` - SMTP server (default: smtp.mailgun.org)
  - `MAILGUN_SMTP_PORT` - SMTP port (default: 587)
  - `MAILGUN_USER` - Mailgun username
  - `MAILGUN_PASSWORD` - Mailgun password
  - `TRIALSAGE_SENDER_EMAIL` - Sender email (default: no-reply@trialsage.ai)

### 2. Installation

```bash
# Install required packages
pip install fastapi uvicorn openai python-dotenv pydantic[email]
```

### 3. Folder Structure

```
/trialsage/
├── main.py                   # FastAPI application entrypoint
├── controllers/
│   └── protocol.py           # API route controllers
├── services/
│   ├── openai_engine.py      # OpenAI integration
│   └── report_generator.py   # Weekly report generator
├── models/
│   └── schemas.py            # Pydantic models
└── data/                     # Data storage directory
```

### 4. API Endpoints

| Route                             | Method | Description                            |
| --------------------------------- | ------ | -------------------------------------- |
| `/api/intel/protocol-suggestions` | POST   | Generate protocol recommendations      |
| `/api/intel/continue-thread`      | POST   | Continue analysis with existing thread |
| `/api/intel/trigger-followup`     | POST   | Generate follow-up analysis            |
| `/api/intel/sap-draft`            | POST   | Generate Statistical Analysis Plan     |
| `/api/intel/csr-evidence`         | POST   | Look up evidence from CSRs             |
| `/api/intel/scheduled-report`     | GET    | Generate weekly intelligence brief     |

### 5. Running the Application

```bash
# Run the FastAPI application
uvicorn trialsage.main:app --host 0.0.0.0 --port 8000 --reload
```

### 6. Setting Up Scheduled Reports

For Replit, use the built-in job scheduler to hit the `/api/intel/scheduled-report` endpoint weekly.

### 7. Testing

Test the API endpoints with the following curl commands:

```bash
# Generate a protocol
curl -X POST -H "Content-Type: application/json" \
  -d '{"indication":"NASH"}' \
  http://localhost:8000/api/intel/protocol-suggestions

# Generate a weekly report
curl http://localhost:8000/api/intel/scheduled-report
```

## Features

### Protocol Generation

- Evidence-based protocol design
- Regulatory risk analysis
- IND Module drafting
- Citations from real clinical trials

### Thread Persistence

- Continuous conversation with AI assistant
- Maintain context across multiple requests
- Build on previous protocol elements

### Intelligence Reports

- Weekly summaries of protocol design
- Regulatory updates
- Statistical analysis recommendations
- Email delivery with Mailgun integration

## Technical Details

### OpenAI Integration

- Uses Assistants API with thread persistence
- Embeddings for knowledge retrieval
- Structured data extraction

### Report Generation

- Markdown and HTML formatting
- Email delivery via SMTP
- Local file storage

## Maintenance

- Update OpenAI models as newer versions become available
- Monitor API usage and costs
- Keep dependencies updated

## License

© 2025 TrialSage Intelligence Platform. All rights reserved.
