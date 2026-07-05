# AnA document tools — View, Operations, and plan introspection (2026-07-03)

Fifteen tools giving AnA the full document lifecycle across every store the
platform holds, plus plan/credit answers for clients. All are tenant-scoped
(hard error without an organization in `ToolContext`); writes additionally
require a user and a reason-for-change (min 8 characters) and are audited.

Registered in `server/services/ana/AnaToolDefinitions.ts` (definitions) and
`AnaToolExecutor.ts` (handlers); the tool-registry consistency suite asserts
every tool is both defined and wired, with no duplicates. These tools
ENHANCE existing subsystems — the vault (`concept2cure_artifacts` +
`concept2cure_artifact_versions`), governed C2C documents, the eTMF
(Capability C2C-08), and the Anthropic-style billing services — none of
them re-implement storage, diffing, classification, or governance that
already existed.

## View (read-only)

| Tool | What it answers |
|---|---|
| `list_vault_documents` | What documents exist in the vault (filter by title, status, CTD prefix). |
| `read_vault_document` | A vault document's metadata and content (truncation-aware; total length reported; cap 30k chars/call). |
| `get_document_versions` | The sealed version history (number, change description, hash, author, timestamp). |
| `list_governed_documents` | The org's submission documents (doc type, agency, lifecycle status, readiness). |
| `read_governed_document` | A document's section outline, or one section's content and version. |
| `get_tmf_view` | A TMF's artifacts by DIA RM zone + the completeness gap-check and inspection-readiness verdict; without an id, the org's TMF list. |

## Operations (governed writes + comparison + search)

| Tool | Behavior |
|---|---|
| `save_document_to_vault` | Creates a draft artifact with SHA-256 hash and an immutable version-1 snapshot, in one transaction; audited. |
| `update_vault_document` | Bumps the version, replaces working content, seals a new snapshot with the reason as change description. Refuses locked documents. |
| `compare_vault_versions` | Fetches two sealed versions by number with metadata + a line-level change summary. Complementary to the pre-existing `compare_document_versions` (which section-diffs two provided texts) — hand the two contents to it for a full redline. |
| `seed_tmf` | Populates a TMF with the reference-model expected-document skeleton (scope `essential` or `all`), idempotently, inside the platform's governed-action transaction. |
| `update_tmf_artifact_status` | Moves a TMF artifact through expected → received → in_review → final (or missing / not_applicable), governed. |
| `search_all_documents` | One query across vault artifacts, governed documents, and TMF artifacts, returning typed hits ready for the read tools. |

## Plan introspection (read-only, from the billing services)

| Tool | What it answers |
|---|---|
| `get_plan_usage` | "How much usage do I have left?" — session window + weekly buckets + per-model drill-down (`usage-windows.ts`). |
| `get_billing_credits` | "What's my credit balance?" — balance, auto-reload settings, recent ledger (`credit-ledger.ts`). |
| `get_org_capabilities` | "What does my plan include / why is this locked?" — tier features, pilot-flag grants, module subscriptions (`entitlements/resolver.ts`), with the honest upgrade path (`minTier`). |

## Invariants

- Every SQL predicate carries `organization_id` (or `org_id`); cross-org ids
  resolve to not-found, never to another tenant's data.
- Locked/finalized content is immutable: `update_vault_document` refuses it,
  and version rows sit under the DB immutability trigger on
  `concept2cure_artifact_versions`.
- Content reads are bounded (default 6k, cap 30k chars) with explicit
  truncation reporting so AnA never silently reads a partial document as
  complete.
- Governed writes record who/why: vault writes via `auditService.auditLog`,
  eTMF ops inside `recordGovernedAction` transactions.

## Known fix shipped alongside

Version history previously queried `c2c_artifact_versions`, which exists
only as an index-name prefix — the real table is
`concept2cure_artifact_versions`. Both the `/api/mdx/vault/:id/versions`
endpoint and `get_document_versions` now query the real table, org-scoped,
aliased to the wire shape the client already consumes.
