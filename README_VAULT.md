# TrialSage Vault™

The TrialSage Vault™ module provides enterprise-grade document management for regulatory, clinical, and safety documentation with AI-powered features.

## Features

- **Secure Document Storage**: Store and manage clinical and regulatory documents securely
- **Powerful Document Search**: Find documents quickly using metadata or content search
- **Version Control**: Track document versions and changes over time
- **AI-Powered Insights**: Automatic document summarization and tagging
- **Audit Trails**: Comprehensive logging of all document operations
- **Role-Based Access Control**: Fine-grained permissions for document access
- **Multi-Tenant Architecture**: Support for multiple organizations
- **Blockchain Verification**: Optional integrity verification using blockchain
- **FDA 21 CFR Part 11 Compliance**: Electronic signatures and audit trails

## Architecture

The Vault system is built with a modern, scalable architecture:

- **Backend**: Node.js with Express.js for the API server
- **Database**: Supabase (PostgreSQL) for document metadata and audit logs
- **Storage**: Local file system for document storage (can be configured for S3 or other storage)
- **Authentication**: JWT-based authentication and authorization
- **AI Services**: OpenAI GPT-4o for document analysis and insights
- **Frontend**: React.js with Shadcn UI components

## API Endpoints

### Authentication

- `POST /api/vault/auth/token`: Generate a JWT token for API access

### Documents

- `POST /api/vault/documents/upload`: Upload a new document
- `GET /api/vault/documents`: List documents with filtering and pagination
- `GET /api/vault/documents/:id`: Get document details
- `GET /api/vault/documents/:id/download`: Download document file
- `DELETE /api/vault/documents/:id`: Delete a document

### Health and Diagnostics

- `GET /api/vault/health`: Check the health of the Vault service

## Vault Setup

### Prerequisites

- Node.js 16+
- PostgreSQL database (provided by Supabase)
- Environment variables:
  - `JWT_SECRET`: Secret for JWT token generation and validation
  - `SUPABASE_URL`: URL of the Supabase project
  - `SUPABASE_SERVICE_ROLE_KEY`: Service role key for Supabase
  - `OPENAI_API_KEY`: OpenAI API key for document analysis (optional)

### Database Setup

1. Run the setup script to create the required tables in Supabase:
   ```
   node scripts/setup_supabase.js
   ```

### Starting the Vault Server

The Vault server runs as a child process of the main TrialSage application:

1. The main application server automatically starts the Vault server on startup
2. All Vault API requests are proxied through the main server at `/api/vault/*`
3. Health checks and diagnostics are available at `/api/vault/health`

## Testing the Vault

1. Navigate to `/vault-test` in the TrialSage application
2. Log in with the default credentials:
   - Username: `admin`
   - Password: `admin123`
3. Upload documents and test the features

## Security Considerations

- JWT tokens are used for authentication and include user roles and tenant information
- All document operations are logged in the audit trail
- Document content integrity is verified using SHA-256 hashing
- Documents can only be accessed by users with the correct permissions
- Environment variables are used to store sensitive credentials

## Future Enhancements

- Advanced search capabilities with full-text search
- Document workflows with approval processes
- Integration with electronic signature providers
- Enhanced AI document analysis with custom models
- Cloud storage integration (AWS S3, Google Cloud Storage, etc.)
- Direct integration with regulatory submission systems

## Support

For questions or issues with the Vault system, please contact support@concept2cures.com.
