# Company document settings and review

The same settings component is available through organization Setup, Admin
Settings and the account-settings company-documents section. Server-provided
capabilities distinguish presentation management, legal custodianship and
permission administration. Delegation does not grant project access or source
approval. Older servers without capability fields retain their existing
`canManage` behavior.

The setup checklist describes saved data and explicitly excludes an unsaved
draft. Customers can inspect a keyboard-focusable visual preview at 100–200%
zoom or switch to a readable text representation. Deterministic contrast
guidance compares saved text colors with white; it does not certify the final
document or evaluate a logo. Browser preview and imported formatting are
approximations. Unsaved Word proofs use the actual renderer and are identified
as drafts without saving or activating a presentation.

Existing legacy branding is previewed before an explicit adoption or replacement
decision. Adoption and restoration disclose that the presentation draft will be
replaced; unrelated legal changes preserve it. Presentation history compares all
safe template fields and image changes without printing embedded image bytes.
Restores use the current profile revision and preserve the legal registry and
output preferences.

Named designs snapshot the current designer draft with explicit admitted-project,
canonical-market, language and subsidiary scope. Server-provided review and
publication permissions enforce independent review. Publication creates a
variant and leaves the organization default and its unsaved draft unchanged.
Outputs must select a variant explicitly. List, detail and proof refusals remain
visible; downloading a proof never implies publication.

An owner or administrator may optionally require independent review of the
organization default. Enabling that policy first requires explicit activation
of an independently reviewed, published organization-wide design whose exact
identity and style match the saved default. Scoped variants cannot become the
default. Activation separately selects automatic report/correspondence use and
retains any dirty designer draft. Policy changes preserve the draft and never
change automatic-use preferences. Under the policy, protected identity/style
changes and different historical restores follow staging, independent review,
publication and explicit activation; automatic-use preferences alone remain
directly editable. Server approval and hash validation remain authoritative.

The legal library uses canonical scope choices, exact Vault-version registration,
and server-side search, status filters, sorting, scoped counts and pagination.
Settings requests a presentation-only profile; `legalDocumentsIncluded:false`
means the legal array was omitted, not that the registry is empty. Inventory
records, counts and facets come from the dedicated admitted registry endpoint.
The Vault picker supports retry of the same query
and accessible previous/next results. Registration is separate from approval and
signature evidence. Entry lifecycle and requirement editors reuse the canonical
workflow endpoints; current project access applies to sources, supporting
evidence, renewal custody and affected filings. Archival and revocation remain
different actions.

Read and mutation boundaries bind their responses to the current organization,
token and request generation. Failed reads render an error rather than an empty
library. Ordinary refusals retain editable inputs. Successful changes are read
back before the UI confirms the saved profile; presentation drafts survive legal
workflow updates.

Focused UI regressions cover refusal and conflict retention, cross-session draft
reset, delegated capabilities, explicit legacy decisions, safe review controls,
Vault paging/retry, inventory filtering, permission updates, presentation restore,
unsaved Word proof isolation and governed named-design publication.
