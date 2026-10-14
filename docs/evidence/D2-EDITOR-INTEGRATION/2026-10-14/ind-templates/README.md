# All IND template starts in the existing editor

W1 / D2, `concept2cure-v2`, implementation base `dd3637f4`.
Contract: [IND template expansion](../../../../design/IND_TEMPLATE_EDITOR_EXPANSION_2026-10-14.md).

## Delivered behavior

The existing IND library and New document picker offer **200** loadable starts:
102 canonical CTD sections, all 93 recorded pyramid deliverables and five full
module outlines. They project the current regulatory records rather than seed
another registry. Stable UUIDs distinguish entries with the same display name.
Every start creates through the existing authoring service and opens the same
DocumentCanvas → DocumentWorkbench → native TipTap editor.

| Module | Canonical section types | Full module working rows | Expanded reference content |
| --- | ---: | ---: | --- |
| 1 | 20 | 21 | FDA administrative placements, forms, completion checks and source limits |
| 2 | 31 | 58 | QOS, nonclinical expert/written/tabulated summaries and clinical components |
| 3 | 19 | 56 | Substance/product, controls, development, appendices and regional guidance |
| 4 | 20 | 140 | Recorded seven-part nonclinical study-report outlines and original-data preparation |
| 5 | 12 | 295 | Complete 119-heading E3 CSR and explicit 87-heading M11 protocol outlines, pooled analysis and prior experience |

Counts include module roots; additional working headings are explicitly local
to a document, not new CTD filing positions. Modules 2–3 reuse all 87 recorded
guidance records. The 46 deliverables without a recorded CTD placement retain
module null and task/phase preparation guidance.

Every authored section starts empty. Source/completion checklists, review
points and reference basis are separate guidance. Original forms, datasets,
certificates, GLP statements, signatures and receipts remain original-record
work; their editor starts are preparation worksheets. No study result,
compliance claim or approval is supplied as boilerplate. Existing governed CMC
composition boundaries are unchanged.

Each library AnA action names the exact template UUID and requests every page
of its source requirements. The existing AnA IND requirement reader exposes
section/deliverable template UUIDs, and
`get_document_template` reads their complete paged outlines, instructions,
source requirements and pitfalls within its existing 5,000-character result
budget. Existing saved-document review/remedy tools continue to work on these
authoring documents. No tool, model or provider route was added.

## Scope, persistence and UI

Builtin creation requires current project write authorization and the template's
actual module. Each copy is an unbound DRAFT, with identity/version/digest,
kind, drafting eligibility, original format and limits in provenance. The
existing writer persists every section's genesis revision and CREATE audit,
including the guidance snapshot actually used to create it.

The existing guidance endpoint checks current project/document view access
and reads that saved snapshot. Legacy organization/global guidance resolves
by the document's exact template and section, preventing another template's
same-code guidance from being shown. A global template must have an active
parent before it can seed a new copy.

The library preserves Find source and AnA actions, adds existing native module
filters/module outlines/Create from template, and finds renamed copies by
template ID. It retains a confirmed created ID when the host holds or cancels
navigation. Pending requests cannot double-create; unknown create outcomes
require checking scoped working documents before another POST. Project changes
suppress delayed replies. Existing host unsaved-work guards remain in effect.

The New document drawer uses exact ID options in the existing C2CForm and
derives builtin module/null placement from the manifest. Template guidance
uses the editor's existing source disclosure styling. The browser evaluation
also caught the existing 18px-high empty-editor AnA link target; its existing
`.rse-link` rule now follows the editor's 24px desktop/44px coarse-pointer
target sizes. No new UI pattern, editor, stylesheet, token, route, dependency,
database migration or second authoring store was introduced.

## Verification and limits

Actual before failures cover missing catalogue template IDs, tabulated/certificate
and GLP drafting classification, absent native loading controls, duplicate-name
picker values, incomplete 2.4 expert headings, and AnA's inability to read a
builtin UUID. The accessibility before capture records the small AnA target.
These are behavior failures rather than missing imports or synthetic gates.

The original regression run passed 755 tests in 60 files. After synchronizing
with the shared document-access controls and completing the exact-UUID AnA
handoff, the final combined run passed **815 tests in 64 files**. It includes the
real HTTP/JWT/PGlite all-template probe: every one of 200 starts created and
reopened, **2,725 empty sections**, exact provenance and guidance, authorization
refusals, inactive global-template refusal and transaction rollback. The batch
probe's elapsed time is local diagnostic evidence, not production latency.

See [Modules 2–3 and HTTP evidence](M2_M3_TEMPLATE_EVIDENCE.md),
[Module 4–5 and loading evidence](EDITOR_UI_OUTLINES.md), and the accompanying
regression, release and browser artifacts. The final saved-template writer
helper extraction is covered by a further targeted HTTP/creation regression;
the CSS target correction is covered by the final browser accessibility matrix.
The four desktop/touch light/dark contexts exercise all five module
representatives: 20 exact native creates, separate saved guidance, duplicate-free
reopening, actual unsaved-section guards and 20 exact-UUID AnA handoffs. All
five module-outline references and the incoming Access action are retained.
There are no axe A/AA violations, browser errors or horizontal overflow in the
recorded matrix. The editable viewport is 1104 × 320px desktop and
298 × 242px touch. Before cases, final screenshots, fixture contracts and
reproduction commands are retained.

This is repository/local evidence. PGlite does not establish production RLS
or PostgreSQL concurrency; intercepted browser API responses qualify native
UI behavior, while the separate real HTTP suite qualifies backend creation.
No live model, production deployment, approved filing or launch-row completion
is claimed.
