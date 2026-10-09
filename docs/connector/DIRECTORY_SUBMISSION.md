# Connectors Directory submission checklist

Founder-owned. Everything below is prepared; the submission itself, the
support/privacy contacts and the production URL are the founder's to confirm.

## Listing fields

| Field | Limit | Prepared value |
|---|---|---|
| Name | ≤ 100 chars | `Concept2Cure` (12) |
| Tagline | ≤ 55 chars | `Regulatory readiness, validation and filing, governed` (52) |
| Description | ≤ 2000 chars | See below (≈1,150) |
| Categories | — | Productivity / Work; Data & Analytics; Compliance |
| Server URL | — | `https://<production host>/mcp` — **founder: production origin (D1) required** |
| Privacy policy URL | — | Publish `docs/connector/PRIVACY.md` after counsel review — **founder** |
| Support URL / email | — | `docs/connector/SUPPORT.md`; support@concept2cure.com — **founder to confirm** |
| Authentication | — | OAuth 2.1 + PKCE S256, dynamic client registration (RFC 7591), RFC 8414/9728 metadata, refresh rotation |

### Description (prepared)

Concept2Cure is the regulatory operating system for drug, biologic and device
sponsors: the eCTD packager, validators, readiness gates, rule packs, ICH
corpus and precedent engine that turn drafts into a submittable dossier. The
connector gives Claude a scoped, audited window onto that system. Claude
drafts; Concept2Cure governs, validates and submits.

With the connector, Claude can list your projects, submissions and eCTD
sequences; assess a sequence's filing readiness with the same deterministic
gate Submission Center uses; validate an eCTD structure; sweep claims for
contradictions; run a CRL/RTF pre-mortem calibrated against the precedent
corpus; look up ICH guidelines and check regulatory currency; find reviewer
deficiency patterns; list and search Vault documents; and draft a cover letter
or an agency-response narrative for review. Its one write files a draft leaf
into a sequence for a named human to review and sign in the app — the
connector never signs, freezes or transmits.

Every number, verdict and readiness state comes from a platform engine, not
the model. Cold-start and missing-licence states are reported, never filled
in. Each call runs inside your organisation's tenant scope and is written to
the Part 11 audit trail with the tool name, organisation, user and outcome.

## Test credentials procedure (for the directory reviewer)

1. Founder provisions a **reviewer organisation** on staging with two seeded
   projects, one submission with a draft sequence, and three Vault documents
   (`scripts/ops/provision-launch-modules.ts` + the W7 dbtest's seeding SQL as
   the template).
2. Founder creates a reviewer user in that organisation (email + password,
   MFA by email OTP to a mailbox the founder controls, or MFA disabled for the
   reviewer org if policy allows).
3. Reviewer adds `https://<staging host>/mcp` in Claude; the consent page
   signs in with those credentials and approves `c2c:read c2c:draft`.
   Do **not** grant `c2c:file` to the reviewer account.
4. Expected behaviour to demonstrate: `c2c_list_projects` returns the two
   projects; `c2c_assess_sequence_readiness` returns a BLOCKED dispatch gate
   with named blockers; `c2c_search_precedents` returns an honest empty set;
   `c2c_file_draft_for_review` is denied for insufficient scope.
5. After review, the founder deletes the reviewer membership, which cascades
   away every code and refresh token it authorised.

## Pre-submission gates (this repository)

- [x] Remote MCP server, Streamable HTTP, at `/mcp` (`server/mcp/`)
- [x] OAuth 2.1 resource server + minimal authorization server (PKCE S256, DCR, refresh rotation, RFC 8414/9728)
- [x] 19 hand-curated tools with title, description, JSON schema, four annotations, scope and governed flag
- [x] Audit row per call through the platform audit service
- [x] Tests: contract (no DB) and real-database with tenant scoping under `RLS_ENFORCE=on`
- [x] Evidence transcript from a separate process (`docs/evidence/W7/2026-09-20/`)
- [x] Privacy policy draft, support doc, positioning
- [x] Skills pack (`skills/concept2cure/`)
- [ ] Production origin with HTTPS (`MCP_PUBLIC_URL`) — **D1, founder**
- [ ] Support and security mailboxes confirmed — **founder**
- [ ] Privacy policy reviewed by counsel and published — **founder / D9**
- [ ] Transcript from a **second machine's** Claude client against **staging** — **needs D1 staging**
- [ ] Directory submission and acknowledgement filed under `docs/evidence/W7/` — **founder**
