# ICH Specialist Service

The ICH Specialist Service is a microservice that provides intelligent regulatory guidance and project management capabilities for TrialSage. It processes ICH guidelines and CSR documents, indexes them with vector embeddings, and provides an AI-powered interface for answering regulatory questions.

## Features

- **Automated Ingestion**: Regularly fetches the latest ICH guidelines and processes uploaded CSRs
- **Vector-based Retrieval**: Uses OpenAI embeddings and Pinecone for semantic search
- **Context-aware Responses**: Provides answers grounded in regulatory documents
- **Task Generation**: Suggests follow-up project tasks based on user queries
- **Module-aware Context**: Adapts responses based on the active platform module

## Architecture

The service consists of several components:

- `config.py`: Pydantic Settings for robust environment management
- `ingestion.py`: Handles fetching and processing of ICH guidelines and CSRs
- `parser.py`: Extracts text from various document formats
- `indexer.py`: Creates and manages vector embeddings
- `agent.py`: FastAPI application providing the question-answering endpoints

## Setup

### Environment Variables

```
OPENAI_API_KEY=your_openai_key
PINECONE_API_KEY=your_pinecone_key
PINECONE_ENV=your_pinecone_environment
PINECONE_INDEX=ich-specialist
ICH_BASE_URL=https://www.ich.org/page/articles-procedures
CSR_DIR=csr_uploads/
GUIDELINES_DIR=services/ich_ingest/guidelines/
PROCESSED_LOG=services/ich_ingest/processed.json
INGEST_INTERVAL_SEC=86400
CSR_POLL_INTERVAL_SEC=60
```

### Running Locally

```bash
# Install dependencies
pip install -r requirements.txt

# Run the FastAPI service
uvicorn services.ich_ingest.agent:app --reload

# Run the ingestion service (in a separate terminal)
python -m services.ich_ingest.ingestion
```

### Running with Docker

```bash
# Build the Docker image
docker build -t ich-specialist -f services/ich_ingest/Dockerfile .

# Run the Docker container
docker run -p 8000:8000 \
  -e OPENAI_API_KEY=your_openai_key \
  -e PINECONE_API_KEY=your_pinecone_key \
  -e PINECONE_ENV=your_pinecone_environment \
  ich-specialist
```

## API

### `POST /api/ich-agent`

Query the ICH Specialist to get regulatory guidance and project tasks.

**Request Body**:

```json
{
  "question": "What ICH guideline covers stability testing?",
  "module": "protocol"
}
```

**Response**:

```json
{
  "answer": "ICH Q1A(R2) is the guideline that covers stability testing for new drug substances and products...",
  "tasks": [
    {
      "title": "Validate stability testing protocol against ICH Q1A(R2)",
      "module": "protocol"
    }
  ],
  "sources": ["ICH_Q1A_R2_Guideline.pdf", "ICH_Q1B_Photostability.pdf"]
}
```

## Integration

To integrate the ICH Specialist into TrialSage modules:

1. Import the ICHSpecialistSidebar component
2. Mount it within the module's layout
3. The component will automatically detect the current module context

Example:

```jsx
import ICHSpecialistSidebar from '@/components/ich/ICHSpecialistSidebar';

function ProtocolReviewPage() {
  return (
    <div className="layout">
      <main>{/* Protocol review content */}</main>
      <ICHSpecialistSidebar />
    </div>
  );
}
```
