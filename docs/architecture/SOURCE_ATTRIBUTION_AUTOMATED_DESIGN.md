# Automated Span-Level Source Attribution — Design

**Status:** Design (approved direction: "full auto attribution, with design")
**Author:** platform GA / traceability workstream
**Scope:** make "which uploaded document backs this generated text" a recorded,
character-level fact across every document the platform builds, for every client
type — the last of the three provenance mechanisms to reach production writers.

---

## 1. Why this exists

The platform already has three provenance mechanisms. Two are live and
CI-enforced; one is built but unwired:

| Mechanism | Question it answers | State |
| --- | --- | --- |
| **Author lineage** (`document_span_lineage`, `author_assertion`) | who wrote this prose | live, CI-enforced (`enforceAuthorLineage`) |
| **Artifact provenance** (`concept2cure_provenance_events`) | how did this document get built / transformed / exported | live, CI-enforced (18/18 producers, baseline 0) |
| **Source attribution** (`document_span_lineage`, `cre_evidence_source`) | which uploaded document backs *these characters* | **read stack built; zero live writers** |

The **read** side of source attribution is complete and route-wired:

- `span-lineage.service.ts` — `getSelectionOrigins`, `listDocumentSpans`,
  `listSpansCitingSource`, `listStaleSpans`, `findUncoveredRanges`, and the save
  gate `assertLineageCoversContent`.
- `data-origins.routes.ts` — `POST /api/data-origins/selection` (JSON panel) and
  `POST /api/data-origins/selection.pdf` (reviewer-handable export).
- The section-grain sibling (`source-usage.service.ts`, `authoring_citations`) is
  fully live: authors manually cite sources in the DocumentAuthoring Sources rail,
  the Source Tracer surface displays them, and change-propagation reports staleness.

The **write** side of span-grain attribution is the gap: `recordSourceSpan` has
**zero live (non-test) callers**, so the Data Origins panel is built but always
returns empty. This design fills that gap *automatically*, at generation time.

---

## 2. The constraint that shapes everything: honesty by construction

`source-usage.service.ts` states the rule the whole subsystem is built on:

> Nothing is inferred from titles, filenames or text similarity. A usage exists
> because someone recorded it.

Automated attribution must not violate this by quietly turning "the model
probably used this source" into a recorded citation. A similarity-matched guess
rendered as provenance on a regulated document is precisely the failure a
traceability system exists to prevent. So the mechanism is built around what can
be **verified**, and is explicit about what cannot:

| Span provenance | How it is established | `usage` | Honest because |
| --- | --- | --- | --- |
| **Verified quote** | the generated span's text is found **verbatim** (after normalization) inside a retrieved source's content | `quoted` | it is a substring fact, checkable at any later time |
| **Asserted paraphrase** | the model self-reports, in structured output, that a span was derived from a specific retrieved source id | `paraphrased` / `derived` | recorded as an *assertion*, never as a verified quote — the state vocabulary already distinguishes `unverified` |
| **Author original** | prose with no upstream source (the model's own connective/analytical text) | `asserted` (author kind) | recorded via `recordAuthorSpan` — the author/model is the source of record for its own analysis |

The verified-quote path is the keystone: it is honest with zero trust in the
model, needs no new vocabulary, and is fully testable offline. Paraphrase
attribution is a layered enhancement, always marked as an assertion so a reviewer
can tell a checkable citation from a claimed one.

---

## 3. Data flow

```
Data Room upload ──► cre_evidence_sources (canonical id + checksum)
      │                        ▲
      ▼                        │ source_id (for source_type='data_room_upload')
  lumen_data_atoms  ───────────┘
      │  (retrieval: enhancedEmbeddingService / advancedRAGPipeline)
      ▼
  retrieved chunks  ──►  GENERATION  ──►  generated section text
      │  {content, sourceId, sourceType}      │
      │                                        ▼
      └──────────────►  ATTRIBUTION  ◄─────────┘
                             │  verify quotes → recordSourceSpan(usage='quoted')
                             │  model assertions → recordSourceSpan(usage='paraphrased')
                             │  remainder → recordAuthorSpan
                             ▼
                     document_span_lineage  ──►  getSelectionOrigins / Data Origins panel + PDF
```

The structural change in retrieval: the canonical search return shape currently
drops `source_id`/`source_type` (see `enhancedEmbeddingService.ts`
`searchHybrid`/`searchAtoms` — they map to `{id, content, title, score}`). Those
two fields must be threaded through so generation knows the source identity of
each chunk it was given.

⚠️ **The cross-registry gap (the real Phase 2 blocker — verified in code, not
assumed).** An earlier draft of this doc assumed a `data_room_upload` atom's
`source_id` *is* a `cre_evidence_sources.id`. It is not. The retrieval corpus and
the canonical source registry are **two different registries**:

- **`lumen_data_atoms`** (what RAG retrieves): a `data_room_upload` atom is
  written with `source_id = concept2cure_artifacts.artifact_id` — a **string
  artifact id** (see `projects/contextual-ingest.ts`, `routes/chat/upload.ts`).
  `project_knowledge_search` returns a `documentId` from this — an artifact/atom
  identity.
- **`cre_evidence_sources`** (what `document_span_lineage` cites): the Data Room
  canonical registry, integer ids, checksums, staleness. This is what the
  verified-quote span must reference.

Nothing at retrieval time maps one to the other. So Phase 2 is not "add two
fields to the return shape" — it is **establish and carry a resolvable link from
a retrieved chunk back to its `cre_evidence_sources.id`**. Candidate links to
evaluate (each needs verification against the ingestion flow): a Data Room upload
creates both a `cre_evidence_sources` row and the artifact/atoms, and
`cre_evidence_sources.provenance->>'fileUploadId'` already records the upload —
so the join likely runs source ← fileUploadId → upload → artifact → atom, and the
ingestion path should stamp the `cre_evidence_sources.id` onto the atom
(`source_id` or a new column) at index time so retrieval can return it directly.
Until that link exists, automated span attribution has no honest
`cre_evidence_sources` id to record, which is why the mechanism (Phases 1 & 3a)
is complete and correct while the live wiring is not yet done. This is a
foundational data-model step, best done as its own change with its own tests, not
folded into an unrelated PR.

---

## 4. Phased plan (each phase independently shippable and CI-validatable)

**Phase 1 — the honest attribution primitive (pure + offline-testable).**
`attributeGeneratedSpans(generatedText, retrievedSources[])` → the set of
`{charStart, charEnd, sourceId, usage}` spans it can *verify* by locating
normalized-verbatim quotes of the generated text within a retrieved source's
content. No DB, no model trust — pure string logic. Unit-tested exhaustively
(exact match, whitespace/punctuation normalization, overlaps, no-match,
multi-source). This is the keystone and has no honesty risk.

**Phase 2 — retrieval carries a resolvable `cre_evidence_sources` id.**
The prerequisite, and the real work (see the cross-registry gap in §3): stamp the
`cre_evidence_sources.id` onto Data Room atoms at index time (via the
`fileUploadId` link on `cre_evidence_sources.provenance`), then extend the
`enhancedEmbeddingService` / `advancedRAGPipeline` return shape to surface it
alongside `sourceType`. Additive to the return shape; existing callers ignore the
new fields. Contract-tested, with a fixture proving a retrieved Data Room chunk
resolves to the same `cre_evidence_sources.id` a manual citation would use.

**Phase 3 — wire one generation path end to end.**
Pick the authoring section-drafting path (co-located with `citeSource` in
`authoring.router.ts`). After a section is drafted from retrieved sources, run
Phase 1's primitive over the output and persist the verified source spans **in
the same transaction as the section content**, then call
`assertLineageCoversContent` so content never commits with incomplete lineage —
identical to how `enforceAuthorLineage` already gates author spans. Author spans
cover the remainder. PGlite integration test proves: drafted section → Data
Origins panel returns real source spans with `state='current'`.

**Phase 4 — layer model-asserted paraphrase (optional, marked as assertion).**
Structured-output generation that tags spans with the source id they derived
from; recorded with `usage='paraphrased'` so the panel shows "derived from" vs
"quoted from" honestly. Gated behind the verified-quote path always running
first.

**Phase 5 — propagate to every generation surface.**
Roll the Phase-3 pattern to the other content producers (AnA tool executor,
CMC/module builders, artifact generation), then add a CI guard mirroring
`check-lineage-save-gate` / `check-artifact-provenance`: any generation path that
writes document content from retrieved sources must emit source lineage, with a
shrinking baseline. This is what makes it a *platform* guarantee across all client
types rather than one wired path.

**Phase 6 — UI affordances (invoke Claude design).**
The Data Origins panel + PDF already exist. The incremental UI is (a) inline
source-attribution highlighting in the DocumentAuthoring editor and (b) a
per-document coverage indicator ("92% of this section traces to a source; 8%
author-original"). Designed against the real `DocumentAuthoring.tsx` surface with
the frontend-design skill, honoring the regulated-UX and accessibility skills.

---

## 5. Testing strategy

- **Phase 1** is pure logic: fast unit tests, no DB. The normalization rules and
  match boundaries are the whole risk surface and are pinned exactly.
- **Phases 3+** use the established PGlite in-process Postgres pattern: provision
  `document_span_lineage` + `cre_evidence_sources`, draft, assert Data Origins
  returns the expected spans and coverage.
- The save gate (`assertLineageCoversContent`) means a wiring regression fails
  **closed** (content rolls back), not silently — so a broken attribution path
  surfaces immediately rather than shipping unattributed documents.

## 6. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Over-attribution (claiming a source the model didn't use) | verified-quote path records only substring facts; paraphrase is marked as an assertion, never as a quote |
| Retrieval-shape change ripples to callers | additive fields only; existing destructured callers are unaffected; contract test |
| Save gate makes generation brittle | same gate already runs live for author lineage; failure mode is a rollback, which is the correct one for missing provenance |
| Coverage noise (whitespace) | reuse the existing whitespace-tolerant gap logic in `assertLineageCoversContent` |

---

## 7. Why not the coarser "bridge section citations" shortcut

A cheaper option was to auto-record a whole-section span whenever an author
manually cites a source. Rejected as the *primary* mechanism: it is section-grain
dressed as span-grain (every source covers the entire section, so the panel can
never say *which sentence* came from *which source*), and it only fires when a
human already clicked cite — which is the manual path that already works via
`source-usage.service`. The value of span attribution is character-level and
automatic; the design above delivers that, honestly.
