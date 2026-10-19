# Editor citation and catalogue integration

W1 / D2 continuation on `concept2cure-v2`, from `920b230b`. Enhance the existing
DocumentAuthoring / ConversationThread → DocumentCanvas → DocumentWorkbench
→ RichSectionEditor path. Existing design-system tokens, source rows, picker,
loading/error/retry states and the one AnA / one canvas decision remain the UI
authority. No additional editor, source store, route, provider, dependency or
migration is introduced.

## Complete and scoped source reads

Read all pages of the existing project sources endpoint for citation metadata.
Validate its project, paging envelope, source identity and eligibility flags;
reject inconsistent totals, duplicates and reads that cannot make progress.
Partial reads may report their progress but cannot imply complete citation
numbering. Project changes and retries invalidate earlier completions. New
insertion choices require a current, data-eligible source with extracted text.
Opening the existing Sources rail refreshes the complete catalogue and recorded
associations, preserving its earlier ability to discover newly captured sources.

Reuse the same page contract in the editor's Data Room rail. Hide the previous
search's actionable rows immediately when a different search is pending. A
malformed or incorrectly scoped page is a recoverable read failure, never an
empty catalogue. Project changes reset the rail's search, page and import
selection. Preserve source IDs, original availability and disposition facts.

## Authoritative insertion and citation admission

The governed editor confirms the existing source-citation write before adding
a citation node. A refusal, navigation or stale editor/section/selection cannot
leave a new marker in the buffer. The Vault rail awaits the insertion outcome
before reporting success. Standalone editor behavior remains supported through
the same command and node; no second citation implementation is added.

Display metadata is admitted through recorded associations in the exact
section. A marker pasted into another section cannot gain legitimacy merely
because its source exists in the project or is cited elsewhere. Preceding
sections advance document numbering only through their own admitted sources.
Eligible recorded historical references remain readable; supersession alone
does not erase a recorded citation. Data withdrawn from use cannot resolve as
valid evidence.

## Existing backend and export paths

Canonical citation creation and refresh validate source and section project
ends, current source version and the existing disposition predicate. Lock the
matched source inside the supplied transaction. Funnel the generic citation
route's existing `cre_evidence_source` discriminator through that same service;
preserve other citation kinds and the response and audit contracts.

Bibliography reads require the exact document/section, recorded association,
tenant, project and data-eligibility checks through the caller's transaction
executor. Existing DOCX/PDF and Vault filing rendering builds its current global
numbering registry from admitted references and applies each section's own
admission set. Unregistered, foreign-project and withdrawn markers keep the
existing unresolved fallback without creating a bibliography entry.

The existing document citation list retains its plain array and recorded row
fields, adding `source_details` from this same contextual reader (null when
unresolved). This preserves eligible organization-wide references and unfiled
documents that are absent from the project catalogue, without using another
project's catalogue or inventing eligibility from the cached citation label.

## Ownership and verification

Control tower owns DataRoomSourcesPanel, async ProjectFilesPanel outcomes,
related regressions, this contract and overall evidence and gates. The editor
session owns DocumentWorkbench, RichSectionEditor, citationNode, the shared
project-source page adapter and paged hook, and their regressions. The source
session owns existing citation/source services, routes and export integration
with backend regressions. No production files overlap between sessions.

The SQL scanner first refused the factored bibliography reader's two template
fragments. They are the existing `visibleOrgClause(orgId, 2).sql` (whose tenant
value remains bound) and `capturedDataEligibleSql('src')` with the fixed code
alias `src`. No request value supplies an identifier or SQL expression. Source
IDs, tenant, document, section and discriminator remain `$1`–`$5` parameters.
The allowance adds only this new helper at two sites; the existing service's
twelve-site allowance is unchanged. The helper is the canonical reader exported
by source-usage.service, with no alternate pool or citation registry.

Reproduce failures before fixes. Verify pagination, scope changes, refusal,
selection changes, exact-section admission, historical references and real
database/export behavior. Check the existing UI on desktop and touch screens,
run applicable design and canonical-path gates, typecheck and build. Evidence:
`docs/evidence/D2-EDITOR-INTEGRATION/2026-10-14/citation-integration/`.
