# Company document workflow completion

Authorized by the user on 2026-10-18. This extends the existing company-document
feature within D2 onboarding/governed documents, D7 Submission Center and
Reporting. Work remains on `concept2cure-v2`. Evidence belongs under
`docs/evidence/COMPANY-DOCUMENTS/gap-closure/`.

## What already exists

The October 18 implementation inventory and October 21/23 merge reviews extend these canonical paths. The limitations below describe the starting behavior, before this completion.

| Existing piece | Existing responsibility | Completion in this work |
| --- | --- | --- |
| `client/src/concept2cure/v2/surfaces/CompanyDocumentSettings.tsx`; `server/services/company-documents/profile.ts` | Company identity, logo/letterhead editing and registered legal PDF references. | Reach the same settings from Account; add reviewed designs, retained revisions, permissions and a scalable registry. |
| `client/src/concept2cure/v2/surfaces/VaultLibraryResults.tsx:VaultVersionPicker` | Shared admitted Vault-version selection, extended upstream with metadata filters and shared result mapping. | Converge company selection onto this picker; retain same-query retry, paging and request-scope guards. |
| `server/services/ectd/package-identity.ts`; `server/services/ind-forms/form-context-assembler.ts` | Canonical submission/market applicant identity and the established program-address authority. | Use the same identity in company comparison and correspondence; bind review/reservation to applicant/contact/market snapshots without borrowing a home-market number. |
| `server/routes/client-branding.ts` | Legacy tenant branding and letterhead import. | Explicitly adopt or replace legacy assets; keep delegated brand extraction on the same admission path. |
| `server/services/tenant/tenant-settings-writer.ts` | Tenant settings, locking and chained audit transaction. | Add registry/history/projection checks to its transaction rather than introducing another settings writer. |
| `server/services/vault/vault-ingest.service.ts`; `server/services/vault/vault-lifecycle.ts` | Original bytes, project admission, exact versions and current approval. | Retain immutable copied-original lineage and legal lifecycle refusals; reuse native ingest, review and placement. |
| `server/services/templates/templateStore.ts`; `server/services/docx/docxFactory.ts`; `server/services/pdf-converter.ts` | Canonical template specifications and Word/PDF rendering. | Retain exact approved presentations and render historical correspondence through these engines. |
| `server/services/authoring/authoring-from-draft.ts`; `server/services/authoring/authoring-file-to-vault.ts` | Authoring creation and governed Vault filing. | Carry admitted filing and company-presentation provenance through the existing creation/review/file workflow. |
| `server/services/ectd/leaf-source-resolver.ts`; `server/services/submission-gateways/regional-packager.ts` | Admitted sources, package generation and technical checks. | Preserve registered/signed PDF originals through the final ZIP while retaining current regional/DTD gates. |
| `server/services/global-ri/regional-module1-requirements.ts` | Regional requirement source. | Map legal companions only under explicit customer review; retain unknown coverage honestly. |
| `server/routes/report-os.ts`; `server/services/export/governedExportConsequence.ts` | Report exports and audited delivery. | Explicit report/legal companion ZIPs with unchanged originals and current source checks. |
| `server/services/tenant-export/`; `server/services/tenant/tenant-offboarding.ts` | Customer data return, receipts, holds and eligible disposal. | Bind exact company metadata/designs to the same receipt and purge transaction. |

The initial deletion-history search `git log --all --diff-filter=D -- '*company-document*' '*CompanyDocument*' '*letterhead*'` found no earlier removed implementation. Subsequent merge review converged the duplicate `company-documents/CompanyVaultPicker.tsx` onto the reachable `VaultLibraryResults.tsx:VaultVersionPicker`; settings, legal evidence and their retry/paging regressions use that canonical replacement. October 23 history review also covered picker and package-identity names. Existing surfaces, storage, approvals and gateways are extended.

## Invariants

- Existing Vault ingest, project admission, approvals, signatures, placement,
  communication records and report rendering remain canonical.
- Original legal PDFs are immutable. No renderer or PDF/A converter may rewrite
  a registered legal original. A technical requirement that cannot be met with
  the original must refuse with an actionable explanation.
- Applicability, legal review, cryptographic signature verification and internal
  approval are separate facts. No user-entered verdict implies agency acceptance
  or successful cryptographic validation.
- Tenant and current project access apply to metadata, counts, exports and
  evidence as well as file bytes. Audit entries contain identifiers and hashes,
  not private legal prose or logo data.
- The current profile remains backward compatible. New read-time response
  fields are optional; existing clients cannot write server-derived facts.
- New tables use public schema and `organization_id INTEGER NOT NULL`, occur
  before the canonical isolation sweeps, and are included in tenant export and
  disposal. Production dependencies remain unchanged.

## Delivery sequence and contracts

### 1. Integrity and customer-data closure

1. Carry registered-legal-original identity from the admitted Vault source to
   final eCTD output. Detect embedded signatures independently as defense in
   depth. Preserve bytes, verify final hashes, and retain source-to-package proof.
   PDF/A policy must validate retained originals or refuse, never normalize them.
2. Both tenant exporters include a versioned company-document metadata envelope
   with a deterministic SHA-256. Full-export completeness and purge receipts
   account for that envelope. No arbitrary organization settings or secrets are
   exported with it.
3. An eligible tenant purge explicitly erases company-document settings in the
   same transaction as the existing purge marker. Existing legal holds continue
   to block disposal. Evidence identifies metadata disposition without retaining
   private values in the audit ledger.
4. Legacy branding adoption is a preview then explicit audited action. Detect
   existing feature-store assets, validate imported raster/logo and formatting,
   preserve current profile on conflicts, and never silently switch away from
   old branding on the first unrelated save.
5. Identity reconciliation compares company presentation with recorded applicant
   and sponsor facts for an admitted filing. It reports field differences and
   supports a reasoned role difference; it never silently rewrites filing data.
6. Company capabilities distinguish brand management, legal custodianship and
   permission administration. Owner/admin retain rights; delegated users require
   current active membership and existing project access. A brand grant does not
   grant access to legal sources. The existing `canManage` response remains a
   backward-compatible administrative flag; new UI uses explicit capabilities.
7. Submission correspondence accepts a sequence reference and derives program,
   submission, application, jurisdiction and recipient facts on the server.
   Retain that identity in its export audit. Company-only stationery remains
   available without a submission.
8. Add exact legal-version links to existing handoff/agency correspondence
   records, with source admission and current access checks. Agency rejection
   does not itself revoke Vault approval.

### 2. Governed legal and presentation workflows

- Legal lifecycle metadata records custodian, reminder interval, replacement,
  revocation and authority/verification evidence. Renewal tasks and affected
  filing links use existing notification and where-used mechanisms. Archive
  remains inventory retirement; revocation is a distinct filing refusal.
- Canonical market/type selectors replace free-form scope entry. Connect existing
  regional requirements to registered documents using explicit reviewed mappings
  and supplemental customer requirements. Unknown requirements remain unresolved.
  Language and certified translations are linked evidence, not inferred acceptance.
- Retain immutable company-presentation revisions, compare/restore, unsaved
  rendered proof and controlled activation. Named variants reuse existing
  template storage and support explicit project/market/language selection.
  A named variant has its own immutable `(organization, variant, revision)`
  presentation identity. Publication leaves the organization default unchanged;
  outputs select a variant explicitly and enforce its admitted scope.
  Owners/admins can require independent review of the organization default.
  Enablement requires an explicitly activated, published organization-wide
  design whose identity/logo/style exactly match the default; the canonical
  writer applies that gate to edits, restores and adoption. Automatic-use flags
  remain independently configurable against the reviewed presentation.
- Connect correspondence drafts to canonical Authoring, review/approval and Vault
  filing. Preserve profile and filing provenance through the handoff.
- Report packages explicitly select legal originals, verify source access and
  approval, and include originals plus a legal inventory with versions/hashes.
- Search, filters, pagination and retry apply to both registry and Vault picker.
  Replace the settings-backed registry limit with a tenant-keyed registry when
  lifting capacity; do not merely increase an arbitrary JSON-array limit.
- Server-recorded copy lineage follows exact registered original references.
  Revocation or invalid verification of an ancestor blocks its copies, including
  across admitted projects, without reusing an ancestor's Vault approval or
  disclosing private source metadata. Unrelated equal-byte documents do not
  acquire lineage through hash equality alone.
- Setup checklist, customer instructions and accessible preview controls explain
  import fidelity, lifecycle steps and supported output capabilities. Validate
  keyboard use, readable review and actual generated artifacts.

## File ownership for parallel work

- Root: shared base contracts, profile/validation/provenance, identity/migration,
  capabilities, template revision storage and integration coordination.
- Portability agent: tenant exporters, export receipt integrity and offboarding,
  their tests and one focused design/evidence note.
- Packaging agent: eCTD source/leaf/package contracts, conversion, final original
  proof and package tests; later report-pack legal companions.
- UI agent: CompanyDocumentSettings, its hook/styles/tests and new company setup
  components; coordinate any shared contract additions with root first.
- Correspondence agent: company-documents route (including render), a new
  correspondence integration service/router, CompanySubmissionDocuments and
  communication/handoff links and tests. Root supplies profile service exports.
- Legal workflow agent: new shared legal-workflow contract, service/router and
  tests. It must use root's atomic profile writer and admission functions, not
  a second settings or approval writer.

## Verification and publication

Targeted tests must exercise governed refusals and actual artifacts, with
meaningful regressions for final-PDF preservation, omitted metadata, retained
purge settings, identity drift, migration loss and unbound correspondence.
Run TypeScript, production build, touched-file lint and required repository
gates after integration. Retain current-SHA evidence and publish directly to
`concept2cure-v2`, reconciling upstream conflicts. Production deployment and
unobserved remote checks remain separately reported facts.
