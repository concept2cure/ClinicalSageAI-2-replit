# Regional biotech filing and document templates in the existing editor

W1 / D2 continuation, canonical branch `concept2cure-v2`, initial base
`d6d8c19f`; synchronized integration base `9ba70078`. Evidence: `docs/evidence/D2-EDITOR-INTEGRATION/2026-10-14/global-biotech-templates/`.
The user explicitly requested biotech filing/document/template coverage across
FDA, Canada, EMEA and Japan. This contract interprets EMEA as EMA/EU, matching
the existing region registry; it does not silently add Middle East/Africa rules.

## One implementation

Keep the existing editor, Start from picker, authoring documents, creation route,
recorded CREATE guidance, provenance disclosure, AnA conversation, saved review
and governed remedy/filing doors. No additional surface, editor, tool, route,
database store, dependency or migration. Existing IND template IDs, source hashes,
contents, modules and catalogue remain unchanged.

Bridge the existing `getRegistryDocumentTemplate` structures for every active
`pharma_biotech` registry entry in US/CA/EU/JP/GLOBAL. Runtime inventory currently
finds 87 entries (32/8/22/8/17); counts are computed from the registry, never a
second maintained filing list. Include the existing biotech document-component
structures (`ectd` or `ctis` family), excluding device-only outlines. Regional
components retain EU scope where the existing preparation resolver requires it;
shared ICH documents retain GLOBAL scope. A cover-letter scaffold does not
establish a universal Module 1 placement. Metadata with no indexed outline, such
as a PIL, is an explicitly limited preparation worksheet, not an invented QRD
leaflet or a copy of the SmPC.

Use a single generalized builtin authoring resolver over the existing IND
projection and regional document library. New regional/component UUIDv5 IDs use
a separate versioned namespace and exact source entry ID. Resolve asynchronously
because the canonical library resolves dedicated blueprints asynchronously.
Current database-backed organization/global templates continue through their
existing path. Any failure to resolve mandatory builtin context refuses creation
before writes; do not persist a partial source or silently create a blank document.

## Recorded identity and eligibility

Reuse the current recorded-source contract, with optional `filingContext`:
`{ registryId: string | null, region: 'US' | 'CA' | 'EU' | 'JP' | 'GLOBAL', agency: string }`.
Registry IDs identify exact filing rows; null identifies standalone document
components, not an unknown guessed filing. Store this context on the document
and section CREATE metadata, include it in source snapshots, parse it through
the shared pure parser, and carry it unchanged into saved review and editor
handoffs. Malformed or conflicting present context refuses authoritative review.
Old source records without the optional field keep their existing behavior.

Whole filings and structures without explicit drafting eligibility are preparation
worksheets. Narrative eligibility may use only exact canonical component metadata;
never the metadata catalogue's unknown-ID CTD fallback, a heading's prose type,
or a scaffold's required flag. Original forms, datasets, certificates, executed
consents, signed records, technical messages and restricted master-file parts
remain required. An editor worksheet cannot replace a dedicated safety-message,
dataset or package engine. Record product-class/applicability and source/currency
limitations rather than claiming suitability for every sponsor's product.

Only an explicit document CTD section can establish a single module. A whole
filing or document with ordinal headings has `module: null`; section `1` does not
mean CTD Module 1. Creation uses the template's recorded module and current writable
project, retains empty authored bodies plus reference guidance, and creates an
unbound working copy for deliberate governed filing placement.

## Guidance, region and AnA

Project the same canonical ordered headings, purposes, source references, basis
confidence and limitations into the editor and existing exact-ID
`get_document_template` lookup. The UUID tool path validates requested market,
filing identity and family; a conflicting scope refuses rather than relabeling a
template. Shared GLOBAL context can be used with a confirmed supported market;
it is never a claim that regional requirements are identical. Page complete
reference context within the existing 5,000-character builtin budget, with
Unicode-safe text boundaries and explicit limits. Preserve existing string-ID
catalogue and preparation inquiries.

Keep saved template facts independent of renamed working titles. The provenance
line uses the existing pattern and calls regional sources regulatory templates;
existing IND records retain their IND wording. Existing guidance/disclosure and
fixed oversight prompts carry regional source and preparation limits through the
one conversation. No CSS, token, layout or new interaction pattern is required.
The existing regional picker description stays concise so long applicability
notes do not push its controls below the useful form area. It explicitly points
to the complete recorded limits and missing-outline notices in the editor's
existing template-guidance disclosure; no source metadata is clipped.

Before exposing existing outlines, repair two known source-selection errors by
reusing canonical records: EU_PSUR must use the existing 19-section `pbrer`
component, and US_NDA_ANNUAL must use the existing NDA annual-report lifecycle
record instead of IND annual headings. Do not duplicate either heading tree.

## Qualification and ownership

Root owns this contract, UI/shared recorded-source integration, review integration,
release evidence and canonical publication. The projection session owns the new
generalized builtin resolver and the two canonical source-selection corrections.
The backend integration session owns existing list/create/template-reference
dispatch. Independent evaluation owns route/SQL behavioral tests. Publish actual
before failures before production edits, then prove every selected filing and
component can be listed, created, reopened and reviewed with exact recorded
context, empty prose and atomic section evidence. Preserve all 200 IND starts,
source/catalogue/Data Room/Vault/projects and remedy regressions.

Run focused and combined regressions, compiler/build, design/import/warning and
normal publication hooks. Browser proof covers the existing picker/editor and
AnA handoffs across US/CA/EU/JP, desktop/touch and light/dark. Local fixtures do not
qualify live providers, deployed RLS, regulatory readiness or agency acceptance.
Existing CMC composition, validation, approval and transmission qualification
boundaries remain unchanged; this work expands authoring preparation and review.
