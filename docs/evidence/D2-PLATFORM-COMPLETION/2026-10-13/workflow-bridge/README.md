# Governed workflow authoring integration

This increment extends the existing verified source importer and authoring
workbench. Stored protocol and CSR output can be previewed and copied into an
unbound working draft without generating replacement prose or inheriting the
source's approval or signatures. It retains source scope, actual content hashes,
original authorship, gaps, a composition fingerprint and immutable creation
receipts. The existing UI and canonical review, signing, export and filing paths
remain the product interfaces.

Current source access is checked before source content and again on the creation
transaction. Saved-source rendition and coauthoring checks also use the current
interactive actor. AnA project, selected-source and file-tool admission apply
current project sharing before context assembly or model work. Figure capture
uses the actual open document, its object permission and its project, with the
existing immutable upload and evidence records.

Copied template or unknown-origin text needs the assigned independent review
and explicit adoption recorded against the current full draft. Retained known
machine source without canonical generation and qualification proof stays held;
review alone cannot mint that proof. Child content writers reserve the parent
document so that concurrent sealing cannot omit a new or changed section.

## Verification records

- [Materialization](materializer.md): faithful stored protocol structure and CSR
  selection, source fingerprints, gaps and original authorship.
- [Governance](governance/): release, signing, export and current-content controls.
- [Native release verification](independent-review/README.md): real PostgreSQL
  runtime role, forced RLS and the two parent/child concurrency directions.
- [Source access](source-access/README.md): original uploads, selected context
  and registered file tools, including revocation and private source refusal.
- [Figures and coauthoring](image-and-coauthor/verification.md): current source
  access before retained-text reuse and governed image capture.
- [AnA project access](../integration/ana-project-access/): both HTTP chat
  entrances and direct planner admission.
- [Workflow intake](../integration/workflow-intake/): current target/source
  access, immutable genesis and draft identity.

These suites overlap; their test counts must not be added as independent cases.
Compiler, build, browser and branch-publication evidence is recorded separately
when completed. Local test content is explicitly synthetic. Local HMAC fallback
and test fixtures do not establish production signing-key qualification, model
PQ, scientific approval, agency acceptance or deployment. This increment does
not resolve every platform access boundary; the separately documented Project
and Vault parent-access work remains a subsequent implementation.
