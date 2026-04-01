# Regulatory Correspondence OS (Phase 1 Foundation)

## Why this exists
Concept2Cure already had strong upstream document governance. This phase adds a normalized downstream loop for agency communications so the platform can run:

1. submission lifecycle state
2. inbound/outbound correspondence
3. issue extraction + human review
4. response package assembly
5. auditable timeline consequences

## Domain model added
- `Submission` lifecycle model with extensible state taxonomy.
- `Correspondence` as first-class regulated event.
- `CorrespondenceIssue` for reason extraction and human review gating.
- `ResponsePackage` linking issue matrix, cover letter, and revised artifacts.
- `MailboxConnection` scaffold for connector-ready ingestion.
- Timeline events tying lifecycle + correspondence + response action.
- Secure attachment metadata with checksum/malware/quarantine/extraction states.

## Security controls scaffolded
- Explicit parser/extraction metadata per communication record.
- Human review status on each extracted issue (AI never auto-final).
- Attachment checksum + malware state placeholder in ingestion contract.
- Organization/project/submission IDs carried in all major entities for scoped access.

## Integration strategy (adopt now vs later)
### Adopt now (clear acceleration)
- **mailparser** (`nodemailer/mailparser`) for MIME decomposition and attachment metadata extraction.
- **ClamAV** for malware scan gate before extraction.
- **Apache Tika** in isolated worker for document text extraction.

### Adopt soon (next iteration)
- **Nango** for OAuth connector/token lifecycle abstraction (Gmail/M365).
- **Temporal** for sync + parsing + triage + reminder orchestration.

### Evaluate with architecture guardrails
- **OpenFGA** for submission/correspondence/attachment-level authorization.
- **OpenBao** for token and connector secret custody.
- **Keycloak** if enterprise SSO federation requirements exceed existing auth controls.

## Notes on scope
This phase deliberately keeps mailbox sync behind a boundary (`MailboxConnection` + API contract) and prioritizes Concept2Cure-native correspondence intelligence/workbench behavior.

## Implementation update (current)
- API routes now run in **DB-first mode** when `c2c_*` tables exist, with in-memory fallback only for non-migrated environments.
- Timeline events are persisted to `c2c_communication_timeline_events` when DB mode is active.
- Manual correspondence intake persists extracted issues and attachment metadata references for human triage.
- Feature flag available: `ENABLE_REG_CORRESPONDENCE_OS` (fails closed when set to `false`).
- Mailbox connection admin endpoints and deficiency-pattern analytics endpoint are now scaffolded for operations visibility.
- Request payloads now include server-side schema validation (submission, intake, issue review, mailbox connection, response package) to reduce malformed writes.
