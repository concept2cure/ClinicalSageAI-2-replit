# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take security seriously at Concept2Cure. If you discover a security vulnerability in Concept2Cure.RI, please report it responsibly.

### How to Report

1. **Do NOT** create a public GitHub issue for security vulnerabilities
2. Email security concerns to: **security@concept2cure.pro**
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Any suggested fixes (optional)

### What to Expect

- **Acknowledgment:** Within 48 hours
- **Initial Assessment:** Within 5 business days
- **Resolution Timeline:** Depends on severity
  - Critical: 24-72 hours
  - High: 1-2 weeks
  - Medium: 2-4 weeks
  - Low: Next release cycle

### Security Measures in Place

Concept2Cure.RI implements the following security controls:

#### Authentication & Authorization
- Session-based authentication with secure cookies
- Role-based access control (RBAC)
- Multi-factor authentication support
- JWT tokens with short expiration

#### Data Protection
- All data encrypted at rest (AES-256)
- TLS 1.3 for data in transit
- Database connection pooling with SSL
- No plaintext credential storage

#### Compliance
- 21 CFR Part 11 compliant audit trails
- ISO 14971 risk management
- HIPAA-ready data handling
- SOC 2 Type II controls

#### Infrastructure
- Helmet.js security headers
- Rate limiting on all endpoints
- Input validation with Zod schemas
- SQL injection prevention via Drizzle ORM
- XSS protection
- CSRF tokens

### Security Contacts

- **Security Team:** security@concept2cure.pro
- **Bug Bounty:** Not currently offered

### Acknowledgments

We thank all security researchers who have responsibly disclosed vulnerabilities.

---

*Last updated: January 24, 2026*
