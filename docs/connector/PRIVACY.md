# Privacy policy — Concept2Cure connector for Claude (draft for counsel)

*Draft grounded in the connector's actual data flows (`server/mcp/`). To be
reviewed against the platform privacy notice, the DPA and the Anthropic BAA
before publication. Not yet legal text.*

## Who is the controller

Concept2Cure operates the platform and the connector. When your organisation
uses the connector, Concept2Cure processes data on behalf of your organisation
under the subscription or pilot agreement and its DPA; Anthropic processes the
conversation in which Claude calls the connector under your organisation's
agreement with Anthropic.

## What the connector receives

* **An access token** identifying you and your organisation. A platform
  session token is verified against the platform's own verifier and the live
  membership table; a connector-issued token additionally records the client
  that requested it and the scopes you approved.
* **Tool inputs** Claude sends on your behalf: identifiers (project,
  submission, sequence, document), search queries, claims you ask to have
  swept, passages you ask to have scanned, and — for the two drafting tools —
  the agency request and the facts you supply.

## What the connector stores

| Record | Where | Retention |
|---|---|---|
| Registered client metadata (name, redirect URIs) | `mcp_oauth_clients` | Until removed by an administrator. Holds no tenant data. |
| Authorization codes (hashed) | `mcp_oauth_authorization_codes` | 10 minutes, single use; deleted with the membership. |
| Refresh tokens (hashed) | `mcp_oauth_refresh_tokens` | 30 days, rotated on use, revocable; deleted with the membership. |
| Audit row per tool call: tool name, organisation, user, client, scopes, outcome, duration, refusal text | `audit_logs` (sha-256 chained, HMAC sealed) | Retained as a 21 CFR Part 11 audit record under the platform retention policy; never deleted on request, exported and purged only with the tenant. |
| Draft leaf created by `c2c_file_draft_for_review` | `submission_leaves` | A governed regulatory record of your organisation. |

The connector does **not** store tool inputs or outputs, conversation content,
or prompts, other than the refusal text captured in the audit row.

## Where a model is involved

Exactly one tool, `c2c_draft_agency_response`, sends text to a model, and only
through the platform's governed AI gateway: the deficiency text and the facts
you supplied, to the provider your organisation's placement policy permits
(Claude via Anthropic for the launch configuration). The gateway records model,
prompt hash and provenance; the tool refuses to run when no provider is
configured and never substitutes demo content. No other tool sends data to a
model. Numbers, verdicts and readiness states are computed by deterministic
engines from your organisation's records.

## Tenant isolation

Every tool call runs inside your organisation's tenant scope. Row-level
security and explicit organisation predicates in every service prevent a token
from one organisation reading, listing or referencing another organisation's
projects, submissions, sequences or documents. A cross-tenant identifier is
refused, not silently emptied.

## Your controls

* Revoke a connector: an administrator removes the client, or revokes the
  refresh token (`/revoke`); access tokens expire within one hour.
* Remove a person: removing their organisation membership cascades away all
  codes and refresh tokens they authorised.
* Audit: every call is visible in the platform audit trail by tool name,
  organisation and user.
* Data subject and deletion requests follow the platform privacy notice; audit
  records are retained as required by 21 CFR Part 11.

## Contact

See `SUPPORT.md`.
