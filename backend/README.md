# TrialSage RegIntel Validator Backend

This module provides a FastAPI-based backend for the RegIntel Validator component, which allows users to validate regulatory documents against compliance standards.

## Features

- Multi-tenant isolation via JWT authentication
- File upload and validation against regulatory standards
- Report generation in JSON and Define.xml formats
- OpenAI-powered explanations and fix suggestions
- Static file serving for generated reports

## Setup

1. Install dependencies:

   ```bash
   pip install fastapi uvicorn python-multipart python-jose[cryptography] pydantic
   ```

2. Set up environment variables:

   - `JWT_SECRET_KEY`: Secret key for JWT token generation/validation
   - `OPENAI_API_KEY`: OpenAI API key for explanations and fixes
   - `REGINTEL_ENGINE_PATH`: Path to the RegIntel validator CLI tool

3. Create required directories:

   ```bash
   mkdir -p uploads validation_logs define_outputs
   ```

4. Run the application:
   ```bash
   python run.py
   ```

## API Endpoints

- `POST /api/validate`: Upload and validate files against regulatory standards
- `POST /api/regintel/explain`: Get an explanation for a validation rule failure
- `POST /api/regintel/fix`: Get suggestions for fixing a validation issue
- `GET /static/validation/{tenant_id}/{run_id}.json`: Access validation reports
- `GET /static/define/{tenant_id}/{run_id}.xml`: Access generated Define.xml files

## Integration with Frontend

The backend integrates with the Microsoft 365-inspired ValidatorRunner.tsx frontend component, which provides a user-friendly interface for uploading, validating, and viewing results.
