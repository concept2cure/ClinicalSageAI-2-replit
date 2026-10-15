# AnA oversight in the existing editor

W1 / D2, with D5 evidence for attributed fixes. The authoring surface and the
conversation canvas continue to mount DocumentWorkbench and RichSectionEditor.

The existing editor now offers Review section, Review document, Reconcile
project evidence, and Prepare targeted fixes. These enter its existing AnA
conversation, including the conversation host when embedded. The requests
require saved-record reads, complete paging, deterministic critique, project
evidence reads, and explicit disclosure of unread or unavailable evidence.
The editor states that unsaved edits are outside those reads. Context carries
the real section id and saved timestamp, related section codes, the filing's
recorded agency/type, and explicitly labelled evidence source ids. Imported
working copies retain their original source/checksum and conversion warnings
in the page and in both conversation hosts' context.

The reconciliation request reads the entire canonical IND catalogue through
the existing `get_document_section_requirements` tool with
`document="ind_pyramid"`. Numeric offset/limit pages retain whole entries,
shrink to the shared serialized result budget, and provide `nextOffset` until
the last phase and all deliverables/sections have been read. Phase and CTD
section filters use the same reference. The result identifies the canonical
record, states official-form/dataset drafting limits and does not infer client
inventory, completion or readiness. Its tests verify every canonical id,
last-phase coverage, official-form limits, escaped-text budgets and invalid
filters/cursors alongside the existing knowledge-tool regression suites.

AnA may return up to six explicit `authoring-remedy` JSON fences. The shared
parser requires a section UUID, exact quoted passage, replacement, reason,
and saved SHA-256 or timestamp; it bounds payloads and refuses incomplete or
malformed proposals. The same remedy component appears in both conversation
hosts. Application uses the existing proposal door, checking model
qualification, section, frozen state, saved version, quote ambiguity,
overlapping pending changes and document structure. It adds attributed tracked
changes and records the turn id; it does not save or approve them. A fix for
another known section offers its actual code/title and opens that section
through the existing unsaved-work guard.

The immutable turn verifier also reads the decoded quote/replacement from
strictly valid remedy fences. This preserves attribution for JSON-escaped
quotes and line breaks. Tenant, record-integrity, model and duplicate-count
checks remain the same. Arbitrary JSON or an invalid contract receives no new
text attribution.

Validation paths:

- `client/src/concept2cure/v2/editor/__tests__/authoringRemedies.test.ts`
- `client/src/concept2cure/v2/editor/__tests__/workbenchRemedies.test.tsx`
- `client/src/concept2cure/v2/editor/__tests__/editorBridgePropose.test.tsx`
- `client/src/concept2cure/v2/editor/__tests__/editorBridgeProposeGate.test.tsx`
- `client/src/concept2cure/v2/__tests__/authoringAnaInsertGate.test.tsx`
- `server/services/ana-ri/__tests__/context-blocks.test.ts`
- `server/services/ana/__tests__/ind-pyramid-knowledge-tool.test.ts`
- `server/services/authoring/__tests__/governed-machine-claims.pglite.test.ts`

The new workbench suite passes all six cases, including genuine TipTap tracked
replacement in both hosts, a stale-version refusal, an unqualified-model
refusal, opening another known section, and holding a source working-copy
handoff behind the pinned editor's unsaved-work guard. The attribution run
passes 30 tests across four suites, including real immutable PGlite turn
records with escaped replacement text, foreign-tenant refusal, malformed
contract refusal and model refusal. The control tower records the final
combined regression and typecheck results alongside this evidence.

Model responses in the UI tests are scripted SSE fixtures. No live provider
or production performance qualification is claimed by these tests.
