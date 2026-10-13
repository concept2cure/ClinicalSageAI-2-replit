# Retained workflow prose across editor formatting

The browser reproduction showed unchanged imported prose becoming a human
assertion after a figure-only save. The immutable source copy used 323 raw
HTML characters; TipTap added a figure and normalized the same prose/table
to 673 characters. Both previous machine spans failed the old raw-clause-hash
match, so the save attributed their unchanged prose to the saver.

The canonical PATCH now reads the previous section body in its own transaction
after the parent write reservation and before the section update, holding the
child row lock. Client-provided previous text is never used. The machine
attribution reader verifies every previous live span's bounds and exact raw
SHA against that body. Corruption refuses the save through the existing
`500 LINEAGE_REQUIRED` path; content, revisions, lineage and audit roll back.

One strict formatting helper receives the existing machine attribution
scanner's typed primitives. It keeps case and scientific characters exact,
maps supported presentation changes to current raw offsets, and bounds each
retained occurrence by verified previous spans. Scientific HTML entities use
the existing canonical decoder once, with raw offset mappings; plain-text
entities and unknown aliases remain literal. A supported uploaded image is
excluded from the machine ranges while unchanged surrounding prose retains
its attribution. Unsupported printing annotations are not absorbed into it.

Tables retain row/cell/header identity and span relationships. Paragraphs in
cells, column widths, group wrappers and explicit default spans of one may
change. Each retained cell must keep its complete projected value: changing
`100 mg` to `100 mg/kg`, or `Safety` to `Safety not demonstrated`, changes the
whole cell. Independent unchanged cells remain attributed. Changed headers,
row/cell reorder and different spans cannot be flattened into the old table.

The gate subtracts retained machine intervals before creating human assertions.
New verified machine acceptance in a remaining independent clause uses the
existing acceptance comparison and occurrence budget; formatting alone records
no new acceptance. Existing machine identity, requester (including unknown),
acceptor/time, signature, usage and confidence survive a formatting copy.
Immutable CREATE receipts, genesis and revision history are never rewritten.

When unsupported reader markup would leave prior machine provenance unverified,
PATCH refuses with `422 MACHINE_LINEAGE_FORMATTING_UNVERIFIED`. A fully exact
raw carry that preserves the original attribution needs no formatting inference.
This prevents an unprojectable copy from becoming a human claim merely because
the editor saved it. It does not add support for arbitrary HTML.

## Remaining source-citation limitation

This increment covers imported and generated machine/template lineage. True
CRE quote and paraphrase spans still use
[`retireStaleSourceSpans`](../../server/services/clinical-regulatory-evidence/span-lineage.service.ts)
in `span-lineage.service.ts`, which retains a citation only when its raw hash
still matches at the same offsets. Inserting a figure or changing supported
markup around an unchanged quote can retire that citation and leave an author
assertion. **Source-citation formatting provenance is not fixed here.**

A separate increment must first reproduce that failure through actual native
source retrieval, quote/paraphrase capture and authenticated PATCH, then reanchor
only verified unchanged citations while preserving original source checksum,
locator, usage, confidence and original audit facts. It must recheck current
source permissions and prove duplicate, changed-source, withdrawn-source and
corrupt-prior refusal behavior. It must not refresh an original source hash by
calling a new-citation writer or fabricate human review.

Local pure, actual SQL, native HTTP/runtime-role and browser evidence is recorded
under `docs/evidence/D2-PLATFORM-COMPLETION/2026-10-13/workflow-bridge/`.
These controls do not establish model qualification or certify scientific claims.
