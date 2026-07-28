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

Concept2Cure.RI implements the security controls below. Each is described as
built, not as aspired to — where a control is partial, deployment-dependent, or
not yet an attested certification, this document says so. Claims about our
security posture should be verifiable by reading the code, and the file paths
below are given so they can be.

#### Authentication & Authorization
- Session-based authentication with secure cookies
- Role-based access control (RBAC)
- Passwords hashed with bcrypt at cost factor 12 (`server/routes/auth.ts`)
- TOTP multi-factor authentication, available per user and opt-in — it is not
  enforced org-wide by default (`server/services/mfaService.ts`)
- JWT tokens with short expiration, verified through a rotation-aware helper
  rather than a bare `jwt.verify`

#### Data Protection
- **Encryption at rest is field-level, applied to specific secrets** —
  AES-256-GCM with a random 96-bit IV and an authenticated tag, covering TOTP
  secrets (`server/services/mfaService.ts`) and stored integration credentials
  (`server/services/integrations/credentialVault.ts`). A general-purpose
  PII/PHI field-encryption helper exists at
  `server/services/security/field-encryption.ts` but is **not yet wired to any
  column**. Whole-database and disk-level encryption are properties of your
  deployment (managed Postgres, volume encryption), not of this application.
  We do not claim "all data encrypted at rest." <!-- compliance-claim-allow: disclaims the claim rather than making it -->

- Encryption keys must be supplied in production; the code refuses to fall back
  to a hardcoded literal and fails closed instead
- TLS for data in transit is terminated by your reverse proxy or platform
  ingress. The application does not terminate TLS and therefore cannot and does
  not guarantee a specific TLS version.
- No plaintext credential storage

#### Compliance
Honest framing matters more here than anywhere else in this document, because
these are the claims a customer's quality and security teams will audit.

- **21 CFR Part 11 — technical controls implemented; validation is the
  deploying organization's responsibility.** The platform provides a
  SHA-256-chained, HMAC-sealed append-only audit trail written inside a
  transaction that holds a `SELECT … FOR UPDATE` on the chain tip, so
  concurrent writers cannot fork the chain
  (`server/services/auditService.ts`), plus electronic signature capture.
  Part 11 compliance is a property of a *validated installation* — IQ/OQ/PQ
  execution, SOPs, and training in your quality system — not something a
  vendor can assert on your behalf. We do not describe the product as
  "21 CFR Part 11 compliant" on its own. <!-- compliance-claim-allow: disclaims the claim rather than making it -->

- **ISO 14971** — the product supports risk-management workflows aligned to
  ISO 14971. This is not a certification of the platform.
- **HIPAA** — the platform is built to support HIPAA-regulated workflows
  (access control, audit logging, field-level encryption of identifiers).
  Contact us regarding a Business Associate Agreement; deploying HIPAA
  workloads requires one.
<!-- compliance-claim-allow: this bullet states the ABSENCE of a SOC 2 report -->
- **SOC 2 — not attested.** Concept2Cure.RI has **no SOC 2 Type I or Type II
  report**. The platform ships a SOC 2 Trust Services Criteria control mapping
  as a *reference framework* for customers running their own GRC program
  (`server/routes/part11-compliance.ts`); as that endpoint itself states, the
  platform does not track or attest SOC 2 evidence. Any prior statement that
  this product has "SOC 2 Type II controls" overstated our position and has <!-- compliance-claim-allow: retracts the prior claim -->

  been removed.

#### Infrastructure
- Helmet.js security headers, applied globally
  (`server/middleware/enterprise-security.ts`)
- CSRF protection via an `x-csrf-token` double-submit check, applied globally
  (`server/middleware/csrf.ts`)
- **Rate limiting** on all `/api` routes plus tighter per-prefix buckets for
  auth, AI, export, upload, workflow, and document endpoints. Counters are
  Redis-backed when `REDIS_URL` is configured; **without Redis the limiter
  falls back to a per-process in-memory store, so an N-replica deployment
  permits roughly N× the configured limit** (`server/middleware/redisRateLimiter.ts`).
  Configure Redis for any multi-replica deployment.
- Input validation with Zod schemas
- SQL injection prevention via parameterized Drizzle ORM queries
- XSS protection
- A CI gate that blocks tenant-trust regressions — reading an organization ID
  from `req.body`, `req.query`, or an `x-*-id` header, bypassing the JWT
  rotation helper, or hardcoding an org-ID fallback
  (`npm run check:security-patterns`)

### Known Gaps

Published deliberately, because a security policy that lists only strengths is
a marketing page. As of the date below:

- No SOC 2 audit has been performed (see Compliance, above).
- Row-Level Security policies exist in the database, but the application does
  not yet route all queries through the tenant-scoped connection required to
  enforce them, so tenant isolation currently rests on application-layer
  scoping rather than on two independent layers. This is tracked as our
  highest-priority security investment.
- Encryption at rest covers specific secret fields, not all stored data.
- Multi-factor authentication is available but not enforceable org-wide.

### Security Contacts

- **Security Team:** security@concept2cure.pro
- **Bug Bounty:** Not currently offered

### Acknowledgments

We thank all security researchers who have responsibly disclosed vulnerabilities.

---

*Last updated: July 28, 2026*
