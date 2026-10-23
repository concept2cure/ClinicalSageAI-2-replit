# Complete the existing official eSTAR attachment controls

W1 / D2. Root owns merged qualification, browser layout review and publication.
These mounted fixtures exercise the real panel, export hook and canonical Vault
picker with controlled HTTP/storage responses; they are not human acceptance.

## What already exists

- `mdx/surfaces/OfficialEstarPanel.tsx` already previews the administrative
  fields and invokes the one official exporter. It now reaches explicit Vault
  attachment assignments for marketing pathways, preserving PreSTAR behavior.
- `mdx/hooks/useEstarExport.ts` remains the one export/delivery path. The
  transport worker owns its exact receipt verification and late-delivery guards.
  The panel passes local expected hashes and a synchronous visit/session guard.
- `v2/surfaces/VaultLibraryResults.tsx` already provides `VaultVersionPicker`,
  including authorized program search, current versions, 25-row pagination,
  retry and ownership reset. The panel reuses it; root owns tightened shared
  search-shape validation. No second document list or picker was added.
- Existing FDA slot extraction, attachment planning, byte verification and
  export retention remain server-owned. The backend worker exposes verified
  slot metadata and composes canonical source eligibility/approval/access gates.
- `OfficialEstarPanel.render.test.tsx` already qualifies administrative fields,
  readiness, entitlement, errors and PreSTAR behavior. Its existing family
  helper compared only `ivd`; it now composes the canonical `isIvdFamily` in
  `shared/constants/domain/product-types.ts`, which already includes CDx.
  The render suite extends that coverage with canonical product identities.
  Discovery and deleted-history searches are recorded in the workstream design.

## Source ownership

- `client/src/concept2cure/mdx/surfaces/OfficialEstarPanel.tsx`
- `client/src/concept2cure/mdx/surfaces/OfficialEstarAttachments.tsx`
- `client/src/concept2cure/mdx/surfaces/__tests__/OfficialEstarPanel.attachments.test.tsx`
- `client/src/concept2cure/mdx/surfaces/__tests__/OfficialEstarPanel.render.test.tsx`

The helper keeps optional assignments in the current panel visit only. It
validates matching catalog type/variant, unique slot identities, exact current
Vault UUID/hash/program selection, incomplete rows and single-file cardinality.
The server owns approval and final source eligibility. Added rows are bounded
at the existing POST request ceiling of 150, including queued activations.

## Retained qualification

- `red.*`: before UI implementation, **19 failures / 2 passes** in 21 cases.
  The missing assignment control failed while existing zero-attachment and
  PreSTAR behavior remained available.
- `green.*`: intermediate successful epoch, superseded below; do not pool
  overlapping counts.
- `red-refinement.*`: **4 failures / 19 passes** in 23 cases before adding
  exact returned UUID display and the assignment ceiling. Three marketing
  pathway/variant checks lacked the returned UUID, and queued Add activations
  exceeded the server ceiling.
- `green-final.*`: successful attachment-completion epoch; **66 passed,
  0 failed** across the new 23 mounted attachment cases and the existing 43
  panel cases. Actual reused picker queries and exact outgoing attachments are
  asserted; local expected hashes do not enter the POST body.
- `red-cdx.*`: before changing the existing family helper, **5 failures /
  74 passes**. Three CDx case variants incorrectly chose device, and two
  mounted companion-diagnostic flows requested the wrong destination catalog.
  SaMD, medical-device and complementary-diagnostic controls already passed.
- `green-cdx.*`: final owned source pins and compressed raw output; **79 passed,
  0 failed**, comprising 28 mounted attachment and 51 panel/render cases.
  The added mounted cases carry actual product identity through the helper,
  destination request, real reused picker, exact official POST and receipt.
- `eslint-final.*`: prior three-file forced `--no-ignore` lint, **0 errors / 2 warnings**.
  Both warnings belong to the existing large panel function. The unchanged
  panel baseline also reports 2 warnings (`eslint-baseline.results.json`).
  The helper and new mounted fixture have no warnings. Earlier unforced lint
  output contains ignored-file notices and is not evidence of checked files.
- `eslint-cdx.*`: final four-file forced lint, **0 errors / 7 warnings**.
  The panel retains its 2 existing warnings; the extended render suite retains
  its 5 existing warnings (`eslint-render-baseline.results.json`). The
  attachment helper and mounted attachment suite remain warning-free.

Mounted coverage includes per-pathway/variant selection, source pagination,
missing source hashes, unavailable earlier versions, wrong/malformed catalogs,
catalog retry and empty destinations, duplicate single-file assignments,
removal/change, returned receipts/refusals, pending-export editing, the 150-row
ceiling, synchronous program/pathway/variant/session resets, and unchanged
export without attachments. Browser geometry and real backend qualification
are retained separately by root.
