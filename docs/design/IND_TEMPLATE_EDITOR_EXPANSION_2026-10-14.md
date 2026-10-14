# IND templates in the existing editor

W1 / D2 work from `dd3637f4`, branch `concept2cure-v2` only. User authorized
all IND pyramid templates across Modules 1–5, with ordered focus on 1, 2, 3,
then 4. Evidence: `docs/evidence/D2-EDITOR-INTEGRATION/2026-10-14/ind-templates/`.
Preserve one AnA, one canvas and the existing editor/UI controls.

## Canonical coverage and identity

The existing canonical IND projection contains 102 non-root CTD sections,
93 pyramid deliverables and eight phases. Every entry gains an editor-loadable
template reference, including manual/form/data-only entries. Also offer the
five module outlines. Template identities derive deterministically from the
canonical entry identity with a versioned namespace, are valid UUIDs, and are
resolved by the existing template picker/create service. These are projections
of current section/pyramid/authoring records, not another maintained regulatory
tree or new template store. Existing org/reference/formatting templates retain
their distinct purposes.

Reuse current CTD authoring guidance and document outlines for richer headings,
evidence requirements and pitfalls. Module 1 reads regional FDA placements,
forms and completion guidance. Modules 2–3 read their canonical written,
tabulated and CMC headings/guidance. Module 4 reuses the recorded nonclinical
study report structure; Module 5 reuses ICH E3 and the recorded protocol spine
where applicable. Document-local headings are explicitly working-outline
identifiers, never invented CTD filing positions. All section content starts
empty; guidance stays separate from authored facts.

Retain aiDraftable, authoringMode and original format. Official forms,
certificates, datasets, signatures and receipt outputs load as preparation
worksheets/source review, with the original required. They do not become
model-drafted official outputs. Close the observed tabulated-summary and batch
certificate classification gaps conservatively. No source values, results,
GLP claims, signatures or approval statements are supplied as boilerplate.
Unbound preparation deliverables keep module null and gain no invented CTD
placement. Template availability never declares filing readiness.

## Existing creation and editor paths

Extend GET /authoring/templates, POST /authoring/docs and the existing resolver
and atomic writer; no new route, store, editor, provider, dependency or migration.
The existing AnA IND requirement pages expose those exact template IDs, and
get_document_template reads their complete paged headings/source requirements
from the same provider within the current result budget. No tool is added.
Every selected builtin resolves before writes and creates an auditable DRAFT in
the currently authorized project, with template identity/version and scaffold
limits recorded as provenance. Validate exact template/module/section identity;
refuse invalid, inactive or corrupt template resolution. Builtins create unbound
working documents; filing/binding is a deliberate later act through the existing
governed workflow, including for module outlines. Global reference
resolution must verify the active parent template.

Keep the existing IND library details/actions; add a native Create from template
action and existing module-select pattern. Match existing working documents by
template_id so renamed copies stay reachable. Preserve the host's unsaved-work
guard and exact document/project scope, suppress stale async results, and show
real failure/retry rather than an invented success. The existing creation picker
must submit exact IDs, not select a duplicate display name. Expose source-aware
template guidance through the existing guidance endpoint using the document's
actual saved template ID, tenant and section, rather than a code-only join.

## Interfaces and ownership

Root owns catalogue projection/IDs/provider, Module 1 outlines, shared template
types, authoring router/create/guidance integration and overall evidence/gates.
Ingestion session owns `ind-template-outlines-m2-m3.ts` and narrow outline tests.
Editor session owns `ind-template-outlines-m4-m5.ts`, its tests, IndDocumentLibrary
and AuthoringCreateExport with narrow UI tests. No overlapping production writes.
The editor session may extract the existing seven-section nonclinical report
record into a pure module with unchanged imports/re-exports; the existing CSR
and protocol records already supply pure structures and must not be duplicated.
Module builder interface: `(section: INDSection) => IndTemplateOutlineSection[]`,
returning exact code/title/order, empty content, and separate guidance fields.
The root composer combines these into section, deliverable and module scopes.

First capture concrete coverage/loading failures, then validate every catalogue
entry and module outline, unique IDs/codes, empty authored content and real
guidance, official-data limits, null-module preparation, active template refusal,
current project authorization, atomic creation/provenance and exact-ID reopening.
Measure catalogue construction/loading cost without claiming deployment latency.
Run meaningful database/UI/editor regressions, desktop/touch light/dark checks,
type/build/design/canvas/SQL and normal commit/push gates without baseline changes.
