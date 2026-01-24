# Auth Setup (Neon Database with JWT Authentication)

This project uses PostgreSQL/Neon for database hosting and implements a custom JWT-based authentication system with refresh tokens and password reset functionality.

## Architecture

- **Database**: PostgreSQL via Neon (serverless Postgres)
- **Authentication**: JWT access tokens + refresh tokens
- **Password Security**: Bcrypt hashing with salt rounds
- **Session Management**: Refresh token rotation for enhanced security

## Required Environment Variables

### Server-side (.env):

```bash
# Neon Database
NEON_DATABASE_URL="postgresql://user:password@host/database?sslmode=require"
DATABASE_URL="${NEON_DATABASE_URL}"

# Authentication Secrets (use strong random strings, min 32 characters)
JWT_SECRET="your-jwt-secret-here-change-in-production"
REFRESH_TOKEN_SECRET="your-refresh-token-secret-here-change-in-production"

# Optional: SMTP for password reset emails
SMTP_HOST="smtp.example.com"
SMTP_PORT=465
SMTP_USER="your-smtp-user"
SMTP_PASS="your-smtp-password"
```

## Database Setup

1. Create a Neon database account at https://neon.tech
2. Copy your connection string to NEON_DATABASE_URL in .env
3. Run the authentication schema migration:
   ```bash
   node scripts/setup_neon_auth.js
   ```

This creates three tables:
- `auth_users` - User accounts with email, username, and password hash
- `auth_refresh_tokens` - JWT refresh tokens for session management
- `auth_password_resets` - Temporary tokens for password reset flow

## API Endpoints

### Public (No Authentication Required)

- `POST /api/auth/register` - Register a new user
  ```json
  {
    "email": "user@example.com",
    "username": "username",
    "password": "securepassword123"
  }
  ```

- `POST /api/auth/login` - Login and receive tokens
  ```json
  {
    "email": "user@example.com",
    "password": "securepassword123"
  }
  ```
  Returns:
  ```json
  {
    "success": true,
    "accessToken": "eyJhbG...",
    "refreshToken": "abc123...",
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "username": "username"
    }
  }
  ```

- `POST /api/auth/refresh` - Get new access token using refresh token
  ```json
  {
    "refreshToken": "abc123..."
  }
  ```

- `POST /api/auth/forgot-password` - Request password reset
  ```json
  {
    "email": "user@example.com"
  }
  ```

- `POST /api/auth/reset-password` - Reset password with token
  ```json
  {
    "token": "reset-token-from-email",
    "newPassword": "newsecurepassword123"
  }
  ```

### Protected (Authentication Required)

Include `Authorization: Bearer <accessToken>` header in requests.

- `POST /api/auth/logout` - Logout and revoke refresh token
- `GET /api/auth/profile` - Get current user profile

## Token Lifecycle

1. **Access Token**: Short-lived (15 minutes), used for API requests
2. **Refresh Token**: Long-lived (7 days), stored securely, used to get new access tokens
3. **Password Reset Token**: One-time use, expires in 1 hour

## Security Features

- Passwords hashed with bcrypt (10 salt rounds)
- JWT tokens signed with separate secrets
- Refresh token rotation (old token revoked when refreshed)
- Password reset tokens are single-use
- IP address and user agent tracking for tokens
- Automatic cleanup of expired tokens

## Client-Side Usage

The auth client (`src/lib/authClient.ts`) handles token storage and automatic refresh:

```typescript
import * as authClient from '@/lib/authClient';

// Register
await authClient.register({ email, username, password });

// Login
const result = await authClient.login({ email, password });
// Tokens are automatically stored in localStorage

// Make authenticated requests
const response = await authClient.authenticatedFetch('/api/some-endpoint');

// Logout
await authClient.logout();
// Tokens are automatically cleared
```

## Notes

- Access tokens are stored in localStorage (consider httpOnly cookies for production)
- Refresh tokens enable "remember me" functionality
- Email verification is optional (email_verified field in auth_users)
- All passwords must be at least 8 characters
- Keep JWT secrets secure and never commit them to version control

