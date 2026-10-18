# Project and Vault parent access

Next bounded increment after the verified workflow bridge. The reporting,
authoring-intake and AnA fixes do not establish privacy for every platform API.
Current `/api/c2c/projects/:id` reads and the project Vault read model still
rely on organization ownership. The portfolio and Vault library search also
enumerate organization records without the canonical private-project filter.

The implementation must reuse the existing program/project anchor and project
sharing policy, with a fresh active organization member on the same query
executor. It must not create another membership table, role policy or UI grant.
Explicit program reads require one live same-organization anchor and current
project permission before any source content, metadata, history, relationship,
download or mutation is supplied. A missing or ambiguous relationship returns
a named reconciliation refusal; a failed access read is unavailable access.
Existing malformed-ID and foreign-tenant behavior remains non-disclosing.

Portfolio and organization-wide Vault search apply authorized program IDs in
SQL before limit, offset, counts and source-type facets. Post-page filtering
cannot protect pagination totals or keep the library useful. Empty authorized
sets are actual evaluated emptiness; failed verification cannot return an empty
portfolio or imply that the client has no documents. Source/artifact scopes stay
attached through adoption and filing; a permitted target cannot authorize a
private source. Conversation-only attachments retain their creator boundary.

Scope: a shared current program/project reader in `services/c2c`, the canonical
`routes/c2c/projects.ts` and `routes/c2c/project-vault.ts`, and the existing
`services/vault/vault-search.ts`. Extend current service admission only where a
route can otherwise discard a source's scope. Preserve existing filing,
disposition, signature, hash and audit controls. No alternate project library,
search implementation or access-confirmation flow is added.

Verification uses actual HTTP and SQL for private owner/member/reviewer/public
cases, revocation and role change, missing/duplicate anchors, verification
failure, exact document downloads, source-to-target mismatches, and pagination
with inaccessible records ahead of accessible ones. Native runtime-role/RLS
checks must demonstrate both permission refusal and authorized access. Existing
project intake, archive, workstream, Data Room and Vault filing tests remain
meaningful. The UI retains its current visual system and reports genuine access
or setup failures without fabricated data.

This document defines work to implement. It does not claim these platform
parent boundaries have already shipped.
