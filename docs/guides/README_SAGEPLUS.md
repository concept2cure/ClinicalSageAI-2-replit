# 🧠 SagePlus | Advanced CSR Extraction & Structuring Pipeline

SagePlus is an intelligent Clinical Study Report (CSR) extraction and analysis system that transforms raw PDF reports into structured, searchable data with vector embeddings for similarity search.

## 📦 Pipeline Overview

This pipeline processes CSRs through three main phases:

1. **Text Extraction & Structuring**: Parses PDFs, extracts text, and uses LLMs to convert to structured JSON
2. **Embedding & Vectorization**: Creates text summaries and vector embeddings for similarity search
3. **Database Integration**: Stores structured data and vectors in searchable databases

## 🔧 Setup Instructions

### Prerequisites

- Python 3.7+
- PyMuPDF (for PDF extraction)
- Hugging Face API key
- (Optional) MongoDB for database integration

### Installation

1. Clone the repository
2. Create a virtual environment: `python -m venv venv`
3. Activate the environment:
   - Windows: `venv\Scripts\activate`
   - Unix/Mac: `source venv/bin/activate`
4. Install required packages: `pip install -r requirements.txt`
5. Copy `.env.example` to `.env` and add your Hugging Face API key

### Configuration

Create a `.env` file with the following variables:

```env
HF_API_KEY=your_huggingface_api_key_here

# PostgreSQL connection
DATABASE_URL=postgresql://user:password@localhost:5432/trialsage
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=password
PGDATABASE=trialsage

# MongoDB (optional)
MONGODB_URI=mongodb://localhost:27017/
```

This snippet provides a working local configuration. Adjust the values to match your environment.

## 🚀 Usage

### Processing CSR PDFs

1. Place your CSR PDFs in the `csrs/` directory
2. Run the pipeline:

```bash
python sage_plus_pipeline.py
```

This will:

- Extract text from each PDF
- Convert to structured JSON (saved in `csr_json/`)
- Generate embeddings (saved in `csr_vectors/`)
- Store in database (if enabled)

### Advanced Options

```bash
# Process PDFs from a specific directory
python sage_plus_pipeline.py --input /path/to/pdfs

# Enable database integration
python sage_plus_pipeline.py --database

# Only import existing vectors to database
python sage_plus_pipeline.py --import-only --database
```

## 🧱 Pipeline Components

### 1. CSR Extractor (`csr_extractor.py`)

Extracts text from PDFs and uses Hugging Face LLMs to convert to structured JSON with:

- Study Title
- Indication
- Phase
- Sample Size
- Study Arms
- Primary/Secondary Endpoints
- Outcome Summary
- Adverse Events

### 2. CSR Vectorizer (`csr_vectorizer.py`)

Creates vector embeddings for similarity search:

- Generates natural language summaries from structured data
- Creates vector embeddings using Hugging Face's sentence-transformers

### 3. CSR Database (`csr_database.py`)

Handles database operations (when MongoDB is available):

- Stores structured CSR data
- Stores vector embeddings
- Enables similarity search and filtering

## 📊 Data Schema

The pipeline produces structured JSON with this schema:

```json
{
  "study_title": "A Phase 2 Study of Drug X in Multiple Sclerosis",
  "indication": "Multiple Sclerosis",
  "phase": "Phase 2",
  "sample_size": 180,
  "study_arms": ["Placebo", "50mg", "100mg"],
  "primary_endpoints": ["Change in EDSS score over 24 weeks"],
  "secondary_endpoints": ["MRI lesion count"],
  "outcome_summary": "Primary endpoint met with statistical significance in 100mg group",
  "adverse_events": "15 cases of grade 2 nausea, 10 cases of grade 1 headache",
  "text_summary": "Phase 2 trial in MS tested 3 arms: Placebo, 50mg, 100mg...",
  "embedding": [0.123, 0.456, ...]
}
```

## 🔄 Integration with SagePlus

This pipeline forms the foundation for the SagePlus Clinical Study Design Agent by:

1. Creating a structured database of historical CSRs
2. Enabling similarity search for protocol comparison
3. Building the knowledge base for AI-guided study design

## 🔍 Next Steps

After processing your CSR library:

1. Use the vectorized data for similar trial lookups
2. Analyze outcome patterns across similar designs
3. Generate AI-powered design recommendations based on historical precedent
