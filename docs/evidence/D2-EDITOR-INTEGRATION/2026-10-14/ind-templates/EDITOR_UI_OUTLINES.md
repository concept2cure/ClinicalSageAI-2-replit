# Existing IND library and Module 4–5 outlines

W1 / D2, canonical branch `concept2cure-v2`, base `dd3637f4`.
Contract: [IND_TEMPLATE_EDITOR_EXPANSION_2026-10-14.md](../../../../design/IND_TEMPLATE_EDITOR_EXPANSION_2026-10-14.md).

## Observed failures and resulting behavior

`indTemplateLoading.test.tsx` first ran against the existing UI: **10 tests
failed**, including absent template creation/module controls, inability to
find renamed copies by their actual template ID, and a creation picker that
used duplicate display names instead of exact IDs. The captured run is
`/workspace/scratch/ind-template-ui-before.log` (46.61 seconds). No missing
module/import failure is counted as a regression.

The same IND library now offers existing native module filters and details
actions for pyramid deliverables, CTD sections and module outlines. Template
limits remain visible within the existing disclosures. Creating uses the
existing `POST /api/authoring/docs`; the receipt must identify a real document
UUID, the requested project and exact template before invoking the host's
editor handoff. An already created ID survives filters and a held/canceled
host leave guard, so reopening does not create another document. Renamed
copies match their recorded template ID; legacy title matches remain usable.

Pending creates refuse duplicate clicks. A project switch suppresses delayed
results. Unread existing-document inventory disables creation. A known server
refusal offers retry; an uncertain response instead offers the existing
scoped document read, so a reply lost after creation does not cause a blind
second POST. Builtin working copies are described as unbound to a filing.

The existing New document drawer now selects exact IDs using C2CForm's
existing `{value,label}` options. A builtin's module—including null for an
unbound preparation worksheet—is derived from its actual manifest rather than
the current editor tree filter. Its limits are shown beside the selection.
No C2CForm implementation, editor, provider, route, store, stylesheet or
product UI pattern was added.

## Recorded outlines

- Module 4 reuses the existing seven-section nonclinical report structure.
  That structure/type was moved unchanged to a pure module and re-exported
  from the existing builder, preserving callers and execution behavior.
- Controlled and uncontrolled clinical study reports use the complete pure
  ICH E3 guidance tree: **119 headings**, including detailed results and
  appendices. It supersedes reuse of the older 48-node builder projection for
  these new working outlines without editing that builder.
- Explicit protocol document types use the current pure M11 record:
  **87 headings**. A shared CTD placement or task identifier alone cannot
  turn a CSR into a protocol.
- Pooled analyses use ten applicable E3 headings; previous human experience
  uses six source-aware headings that distinguish investigational, marketing,
  safety and withdrawal records. Other clinical source/data-only entries use
  four source-review headings.

Every authored body starts empty. Purpose, evidence requirements, source
references, applicability and pitfalls remain typed guidance. Each child code
uses `<canonical code>:work:<ordinal>`, explicitly document-local and never a
new CTD filing node. Original reports, datasets, forms and signatures remain
required; no results, compliance claims or approvals are supplied as prose.
The outline test also confirms projection does not initialize model
infrastructure.

## Scoped validation

Final focused run: **89 checks passed across five files**, 9.74 seconds:

| File | Checks |
| --- | ---: |
| `editor/__tests__/indTemplateLoading.test.tsx` | 14 |
| `editor/__tests__/editorSourceLibraries.test.tsx` | 8 |
| `v2/__tests__/authoringCreateExport.test.tsx` | 26 |
| `authoring/__tests__/ind-template-outlines-m4-m5.test.ts` | 30 |
| `authoring/__tests__/nonclinical-study-report-builder.test.ts` | 11 |

Log: `/workspace/scratch/ind-template-scoped-final.log`. Scoped lint reports
zero warnings for the new files and IND library; AuthoringCreateExport retains
one existing function-length warning, down from two warnings at HEAD. The
root session owns database creation/coverage checks, combined type/build
gates and real-browser validation; those are not claimed by this test slice.

The UI tests mount the real library and C2CForm with stubbed API replies;
they qualify client request/receipt behavior, not live authorization or RLS.
The outline and existing NSR tests are deterministic and use no provider
requests. No commit or push was performed by this session.
