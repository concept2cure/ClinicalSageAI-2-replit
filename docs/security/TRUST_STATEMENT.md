# Concept2Cure — Trust Statement (DRAFT, 2026-09-20)

Concept2Cure (TrialSage) is a regulatory operating system for life-sciences
sponsors: submission authoring, a controlled document vault, eCTD assembly and
readiness, and QMS controlled documents. This page says plainly what is in
place today, what is in progress, and what is not yet done. It is a draft
until the founder signs it and the production environment is live.

## What is in place today (enforced by code on the shipping branch)
- **Record integrity.** The three audit stores are append-only (database
  triggers refuse updates and deletes; the one delete path on `audit_logs` is
  an archive function that records every removed batch and refuses rows inside
  the 24-month hot window), SHA-256 hash-chained, and `audit_logs` and the
  tamper-proof log are sealed with an HMAC key held outside the database
  (`audit_events` is chained, its seal is still deferred). An integrity verifier
  walks every chain and refuses on the first break; we proved it by corrupting a
  row and watching it fail, and since 2026-09-25 a daily sweep runs it over
  every store and production refuses to boot without the triggers. Some
  domain history tables are not yet under triggers; see the audit.
- **Electronic signatures (21 CFR Part 11).** One canonical signature
  substrate. A signer re-enters their password (and TOTP when enrolled) at the
  moment of signing; the signature binds the exact content digest with a stated
  basis; revocation is an append-only supersession, never an edit. A
  cryptographic (AWS KMS RSA) signature layer sits behind the same seam.
  Twenty-three legacy routes that record a "signature" outside that ceremony
  are listed in the audit and are being retired.
- **Fail-closed production boot.** Production refuses to start without its
  secrets, without row-level security enforced, without audit seal keys,
  without a valid signer mode, with the API auth boundary in warn mode, or
  without the audit immutability triggers in place. Five accepted-risk flags
  can still lower other controls with a log line; the audit names them.
- **Tenant isolation.** Every tenant row carries its organisation; PostgreSQL
  row-level security is enforced; the application connects as a
  least-privilege role; CI gates block tenant-blind queries.
- **Governed AI.** Numbers, verdicts and compliance results come from
  deterministic engines; language models draft and explain. Every model is an
  approved-registry entry with a pinned version. Provider placement (region,
  zero-data-retention) is an explicit per-tenant approval that failover never
  crosses. PII screening is on by default.
- **Secure development.** Single canonical branch, CodeQL (blocking) and
  Semgrep (advisory today), a dependency-advisory gate sealed to the lockfile,
  migration-safety and fixture gates, and a warning ratchet that may only
  shrink. The branch is not yet protected by a rule that requires those checks
  before a push lands; that is a founder action named in the audit.

## In progress
- Hosted production on AWS (Terraform: encrypted RDS, TLS 1.3 load balancer,
  Secrets Manager, CloudTrail with Object Lock) — defined, not yet applied.
- Live KMS signing key — implemented and tested against an in-memory KMS;
  not yet executed against a live account.
- Validation package (CSA-aligned IQ/OQ/PQ) and the per-tenant retention and
  residency statement on the order form.
- Consolidating the authoring loop's PIN-based signature store onto the
  canonical substrate.

## Not yet done — and we will not claim otherwise
- **SOC 2 Type II:** no observation window is open. We publish this statement
  and the policy set (`docs/security/policies/`) instead of a report we do not have.
- **Penetration test:** none performed. The first will be scheduled before the
  first production tenant files, and findings will be closed before launch.
- **Anthropic BAA:** not signed. It is required before any tenant places PHI in
  the platform; the default posture is that submission content is de-identified.
- **Incident tabletop, access reviews, restore timing on production-size data.**

## Sub-processors (planned for launch)
Amazon Web Services (hosting, storage, keys); Anthropic (Claude models);
GitHub (source control and CI). Additional model lanes (OpenAI, Moonshot,
Google Vertex, Azure OpenAI, AWS Bedrock) are disabled unless a tenant's
placement approval names them.

## Contact
Security questions and vulnerability reports: security@concept2cure.pro
(also published at `/.well-known/security.txt` on every deployment). We answer
standard security questionnaires from
`docs/security/SECURITY_QUESTIONNAIRE_SIG_LITE.md`; an independent audit of the
platform (`docs/security/SECURITY_AUDIT_2026-09-24.md`) re-tests every
statement on this page against the code.

| Approved by | Date | Signature |
|---|---|---|
| Founder | | |
