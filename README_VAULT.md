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
- **Database**: PostgreSQL via Neon for document metadata and audit logs
- **Authentication**: JWT-based authentication with refresh tokens
- **Storage**: Local file system for document storage (can be configured for S3 or other storage)
- **AI Services**: OpenAI GPT-4o for document analysis and insights
- **Frontend**: React.js with Shadcn UI components

## API Endpoints

### Authentication

All Vault API endpoints require JWT authentication. Include the access token in the Authorization header:

```
Authorization: Bearer <your-access-token>
```

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
- PostgreSQL database (provided by Neon)
- Environment variables:
  - `NEON_DATABASE_URL`: Neon database connection string
  - `JWT_SECRET`: Secret for JWT token generation and validation
  - `REFRESH_TOKEN_SECRET`: Secret for refresh token generation
  - `OPENAI_API_KEY`: OpenAI API key for document analysis (optional)

### Database Setup

1. Run the setup script to create the required tables in Neon:
   ```bash
   node scripts/setup_neon_auth.js
   ```

2. For vault-specific tables, run additional migrations as needed

### Starting the Vault Server

The Vault server runs as a child process of the main TrialSage application:

1. The main application server automatically starts the Vault server on startup
2. All Vault API requests are proxied through the main server at `/api/vault/*`
3. Health checks and diagnostics are available at `/api/vault/health`

## Authentication

The Vault uses the same JWT-based authentication system as the main application:

1. Register or login via `/api/auth/register` or `/api/auth/login`
2. Use the returned access token in the Authorization header for all Vault requests
3. Refresh the access token using `/api/auth/refresh` when it expires

## Security Considerations

- JWT tokens are used for authentication and include user roles and tenant information
- All document operations are logged in the audit trail
- Document content integrity is verified using SHA-256 hashing
- Documents can only be accessed by users with the correct permissions
- Environment variables are used to store sensitive credentials
- Passwords are hashed using bcrypt with salt rounds

## Future Enhancements

- Advanced search capabilities with full-text search
- Document workflows with approval processes
- Integration with electronic signature providers
- Enhanced AI document analysis with custom models
- Cloud storage integration (AWS S3, Google Cloud Storage, etc.)
- Direct integration with regulatory submission systems

## Support

For questions or issues with the Vault system, please contact support@concept2cures.com.
