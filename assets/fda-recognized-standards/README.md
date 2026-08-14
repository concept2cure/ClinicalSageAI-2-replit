# FDA recognized consensus standards (drop-point)

This directory is the drop-point for the **FDA CDRH Recognized Consensus
Standards** dataset — the list that tells a 510(k) submitter which consensus
standards FDA recognizes, and therefore which standards a submission should
declare conformity to.

It mirrors the vendored-asset pattern already used by `assets/estar-templates/`
(FDA eSTAR PDFs) and `assets/ectd-dtd/` (agency DTDs): a drop-point directory, a
loader that reads it, and a fail-closed lookup that reports an explicitly
labelled empty result rather than guessing when the asset is absent.

## Why this is a vendored dataset and not an API client

openFDA exposes `device/classification.json`, `device/510k.json`, MAUDE, recalls,
registration and listing, and GUDID. **It does not expose recognized consensus
standards.** FDA publishes that database separately, through the CDRH
Recognized Consensus Standards search at

<https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfStandards/search.cfm>

so there is no endpoint for `server/services/integrations/openfda-device-client.ts`
to call. The only honest way to answer "which standards apply to product code
X" is to hold FDA's own published list. That makes this a procurement/ops
acquisition (runbook B21), not an engineering gap.

## The one rule that governs this directory

**Never write a standard into this dataset that FDA has not published against
that product code.**

The platform's whole posture is that it refuses rather than fabricates. A
fabricated recognized-standards list is worse than an empty one: a submitter who
cites a standard FDA does not recognize for their device draws an FDA
information request, and a submitter who trusts a fabricated list stops looking
for the real one. So:

- If FDA publishes no product-code association for a standard, leave
  `productCodes` empty. An empty list is a true statement.
- Do not infer an association from the standard's subject matter, from the
  device's description, or from what "obviously" applies. Judgement about what
  *ought* to apply is the submitter's, informed by FDA's list — it is not data.
- Do not merge in a vendor's or a consultant's curated list and present it as
  FDA's. If a non-FDA source is used, it is a different dataset and does not
  belong in this file.

## What to drop in

One file, exactly this name — it is load-bearing, hard-coded as
`RECOGNIZED_STANDARDS_DATASET_FILE` in
`server/services/fda-recognized-standards/recognized-standards-dataset.ts`:

```
assets/fda-recognized-standards/fda-recognized-consensus-standards.json
```

Or point `FDA_RECOGNIZED_STANDARDS_DIR` at a directory that holds it.

### Shape

The shape is **ours** — a normalization of FDA's published records, because FDA
distributes the database through a search UI rather than as a single canonical
machine-readable export. The acquisition step is therefore "export from FDA,
normalize into this shape, record where it came from".

```json
{
  "datasetVersion": 1,
  "provenance": {
    "source": "FDA CDRH Recognized Consensus Standards Database",
    "sourceUrl": "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfStandards/search.cfm",
    "recognitionListNumber": "<the FDA Recognition List number this export came from>",
    "publishedOn": "YYYY-MM-DD",
    "retrievedOn": "YYYY-MM-DD",
    "retrievedBy": "<person or team who performed the acquisition>"
  },
  "standards": [
    {
      "recognitionNumber": "<FDA recognition number>",
      "sdo": "<standards developing organization>",
      "designationNumber": "<the standard's designation, verbatim from FDA>",
      "title": "<title, verbatim from FDA>",
      "extentOfRecognition": "<FDA's extent-of-recognition text, verbatim>",
      "specialtyTaskGroup": "<optional>",
      "recognitionStatus": "<optional: recognized | transition | withdrawn>",
      "transitionEndDate": "<optional YYYY-MM-DD>",
      "productCodes": ["<FDA product code>", "..."]
    }
  ]
}
```

Every field except the four `optional` ones is required, and the loader rejects
the **whole file** if any record is malformed — see "fail closed" below.
`productCodes` must be present but may be `[]`.

### The provenance block is not optional

The loader refuses a dataset with no provenance. A recognized-standards list
with no recorded source, publication date and retriever is indistinguishable
from someone's notes, and this is content a submitter will cite to FDA. The
provenance travels with every lookup response so the surface can show which
recognition list the answer came from.

## Fail closed

`recognized-standards-dataset.ts` treats a malformed dataset as **absent**, not
as partially usable. There is no partial load, because a half-parsed regulatory
dataset is more dangerous than no dataset: it answers some product codes
correctly and others with a silent empty, and nothing distinguishes the two.

`recognized-standards.service.ts` therefore returns one of three explicitly
labelled outcomes, and never a guess:

| Outcome | Means |
|---|---|
| `available:false`, `datasetLoaded:false` | the dataset is not vendored (or did not parse) — `unavailableReason` says which |
| `available:true`, `datasetLoaded:true`, `matched:0` | the dataset IS loaded and FDA lists no recognized standard against this product code |
| `available:true`, `matched:n` | FDA's list, verbatim |

The middle row is the one that matters. "We do not have the data" and "the data
says nothing here" are different claims, and a surface that collapses them into
one empty table is lying by omission.

## Vendoring policy — this dataset is gitignored by default

FDA's recognition records are US-government public information, so nothing
*licensed* blocks committing them. They are gitignored anyway, for two reasons:

1. It is a bulk export that is superseded whenever FDA publishes a new
   Recognition List, not source code.
2. It keeps a hand-written list of standards from arriving in the repository as
   an ordinary-looking commit. Committing this file is a deliberate act
   (`git add -f`) that must carry the provenance block and be reviewed as an
   asset acquisition — the same treatment `assets/ectd-dtd/` gives DTDs.

Note what this dataset is **not**: it is the recognition *list*, not the
standards themselves. The text of ISO 14971, IEC 60601-1 and the rest is
copyrighted by the SDOs and licensed per seat. Knowing that a standard is
recognized is not the same as holding it.

## Relationship to the existing standards path

There is one other standards surface in this repository and it answers a
different question. Do not merge them:

| Path | Question it answers | Backed by |
|---|---|---|
| `server/services/regulatory-graph/standards-applicability.service.ts` + `/api/standards` | "for THIS program, which catalog standards apply, do we have evidence, where are the gaps?" — rule-driven, per-program, with confidence scores and human decisions persisted in `standards_applicability` | the internal `device_test_standards` catalog |
| this dataset + `/api/510k/device/standards` | "which standards has FDA recognized for THIS product code?" — a lookup with zero inference | FDA's published recognition list |

The first is a recommender over a curated internal catalog. The second is a
fact from FDA. The first may consume the second later; it must never present
the second's data as its own recommendations, or the fabrication boundary that
this drop-point exists to hold moves back inside the rules engine.

## Verify

```
node scripts/ops/ga-readiness-report.mjs --all      # the fda-recognized-standards row
```

The row reads `blocked` until the file is present, and flips to `ready` once it
parses with a provenance block and at least one record. Presence is necessary
and never sufficient: the probe cannot tell you the export is current, only that
it is there. `provenance.recognitionListNumber` against FDA's current
Recognition List is the human half of that check.
