# Automated Span-Level Source Attribution — Design

**Status:** Phases 1–3 implemented (the authoring draft-accept path is a live,
tested span-grain source writer); Phases 4–6 designed and pending.
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
| **Source attribution** (`document_span_lineage`, `cre_evidence_source`) | which uploaded document backs *these characters* | read stack live; **first automatic writer live** (authoring draft-accept) |

The **read** side of source attribution is complete and route-wired:

- `span-lineage.service.ts` — `getSelectionOrigins`, `listDocumentSpans`,
  `listSpansCitingSource`, `listStaleSpans`, `findUncoveredRanges`, and the save
  gate `assertLineageCoversContent`.
- `data-origins.routes.ts` — `POST /api/data-origins/selection` (JSON panel) and
  `POST /api/data-origins/selection.pdf` (reviewer-handable export).
- The section-grain sibling (`source-usage.service.ts`, `authoring_citations`) is
  fully live: authors manually cite sources in the DocumentAuthoring Sources rail,
  the Source Tracer surface displays them, and change-propagation reports staleness.

The **write** side of span-grain attribution WAS the gap: `recordSourceSpan` had
zero live callers, so the Data Origins panel was built but always returned empty.
This design fills that gap *automatically*. As of Phase 3 the first live writer is
the authoring **draft-accept** endpoint: accepting an AI draft records its verified
quotes as `cre_evidence_source` spans and the remainder as author spans, in the
same transaction as the section content. The mechanism is now proven end to end;
Phase 5 rolls it to every other generation surface with a CI guard.

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
a retrieved chunk back to its `cre_evidence_sources.id`**.

✅ **The link, now verified in code (2026-08-07).** An earlier draft of this doc
guessed the join ran source ← `provenance->>'fileUploadId'` → upload → artifact →
atom. The actual link is **more direct**: a Data Room upload that creates a
canonical source records the artifact id on the source's *metadata*.
`routes/chat/upload.ts` uses the **same** artifact id for the atom's `source_id`
(the `lumen_data_atoms` INSERT) and the source's `metadata.artifactId` (the
`createSource` call). So:

```
cre_evidence_sources.metadata->>'artifactId'  ===  lumen_data_atoms.source_id
```

This is implemented and proven end-to-end against the spine migration in
`server/services/clinical-regulatory-evidence/retrieval-source-link.ts`
(`resolveEvidenceSourceIdsByArtifact`) +
`__tests__/retrieval-source-link.pglite.integration.test.ts`. It is **honest by
construction**: an atom whose upload never created a canonical source — e.g. the
`routes/concept2cure.ts` data-room path, which writes atoms but no
`cre_evidence_sources` — resolves to **nothing**, so no span can cite a source
that does not exist. And it is tenant-scoped (`organization_id` on the join).

Resolving at read time (rather than stamping the id onto the atom at index time)
was chosen deliberately: it covers atoms that **already** exist, needs no
migration or re-ingest, and cannot drift from the source registry. An index-time
stamp remains a valid later optimization but is not required for correctness. The
remaining Phase 2 work is purely to **carry** this resolved id through the
retrieval return shape into generation; the honesty-critical part — the link
itself — is done.

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
The prerequisite, and the real work (see the cross-registry gap in §3).
- **2a — the resolvable link (DONE, 2026-08-07).** Verified the join is
  `cre_evidence_sources.metadata->>'artifactId' = lumen_data_atoms.source_id`
  (not the assumed `fileUploadId` chain) and shipped
  `resolveEvidenceSourceIdsByArtifact` (`retrieval-source-link.ts`), org-scoped
  and honest (no source ⇒ no id), proven against the spine migration in
  `retrieval-source-link.pglite.integration.test.ts`.
- **2c — both link forms (DONE, 2026-08-07).** The resolver also handles the
  program-scoped Data Room form where the atom's `source_id` is
  `'cre_source:<id>'` (upload.ts:505) — the embedded id is VERIFIED to exist and
  be org-owned before it is returned, never trusted blind. So the two real link
  forms (numeric-workspace `metadata.artifactId` and UUID-workspace
  `cre_source:<id>`) both resolve; only the `concept2cure.ts` data_room_upload
  path (which creates no canonical source) stays honestly silent.
- **2b — carry it through retrieval (DONE via #1285).** `searchHybrid` /
  `searchSimilar` now attach the raw `sourceId` / `sourceType` to every retrieved
  atom (additive; existing destructured callers ignore them), via a best-effort
  lookup that leaves the search queries untouched and degrades to `null` on
  failure. The RESOLVED `cre_evidence_sources.id` is produced by the 2a resolver
  **at the generation boundary** — which holds the numeric `orgId` the resolver
  needs — not inside `searchHybrid`, which only has the org UUID. This is what the
  submission-chat boundary already does (#1278) and what the Phase 3 generation
  path does next. Unit-tested (enrichment merge, null-for-missing atoms,
  best-effort degradation when the lookup fails, `searchSimilar` parity).

**Phase 3 — wire one generation path end to end (IMPLEMENTED via option a).**

The authoring section-drafting path is the wired path. The obvious wiring —
"record verified spans in the same transaction as the section content, in
`PATCH /sections/:id`" — does NOT work, verified in code:

- Verifying a quote needs the **source's text**. `cre_evidence_sources` has no
  full-text column; a source's content lives chunked in `lumen_data_atoms` and is
  assembled only at RETRIEVAL time. So at the manual save (`PATCH /sections/:id`)
  the section's cited-source ids are available but their **content is not** —
  there is nothing to match the generated text against.
- The content AND (via #1285) the source identity are both in hand at exactly one
  place: **draft generation** (`POST /sections/:sectionId/ai/draft`), which
  retrieves the chunks it drafts from. But that endpoint *returns* the draft; it
  does not persist it, and the user may edit before saving.

So Phase 3 records at a **draft-accept persistence point** — the moment a
generated draft (with the chunks that back it) becomes section content. The
shipped design is option (a), persist-on-accept:

1. **`POST /sections/:sectionId/ai/draft`** now captures the chunks it retrieved
   from, resolves each raw atom `source_id` to its canonical
   `cre_evidence_sources.id` (the Phase 2 resolver, run here — the generation
   boundary holds the numeric `orgId` it needs), and parks a **draft candidate**
   (`authoring_ai_draft_candidates`, migration `20260809_…`): the generated text
   plus `[{ evidenceSourceId, content, title }]`. It returns a `draftId`. All of
   this is best-effort — any failure omits `draftId` and never breaks drafting.
2. **`POST /sections/:sectionId/ai/draft/accept`** (new) claims the candidate
   inside ONE transaction (`consumeDraftCandidate`, single-use DELETE…RETURNING,
   tenant- and section-scoped), writes the (possibly edited) section content, and
   runs **`enforceSourceAndAuthorLineage`** — the source-aware sibling of
   `enforceAuthorLineage`: verified quotes become `cre_evidence_source` spans
   (`replaceSourceSpans`), every other clause becomes an author span
   (`replaceAuthorSpans`), then `assertLineageCoversContent`. Revision + Part 11
   audit are written after, mirroring `PATCH /sections/:id`.

The store holds the chunks **server-side**, never round-tripped through the
client, so source content cannot be forged to manufacture a quote match — the only
client input at accept time is the text being saved.

The record is honest and non-stale by construction: only quotes still present in
the saved text are attributed, both span kinds are REPLACED on each accept so an
edited-away quote is retired rather than left citing characters that moved, and
`assertLineageCoversContent` makes the save fail **closed** if lineage is
incomplete — exactly as `enforceAuthorLineage` already gates author spans.

Proven by PGlite integration tests against the real migrations: accepting a draft
whose clauses are verbatim in a retrieved source records `cre_evidence_source`
spans (`state='current'`) plus author spans for the rest; an edited-away quote is
retired; a cross-tenant source is refused; the draft-candidate store round-trips,
is single-use, tenant/section-scoped, and rejects expired candidates. Route tests
cover the endpoint contract (400/404/410, happy path, edited-content attribution,
and 500 fail-closed on a lineage error). Modules:
`clinical-regulatory-evidence/{source-attribution,lineage-gate,draft-candidate-store}.ts`
and the `replaceSourceSpans` addition to `span-lineage.service.ts`.

The rejected option (b), an opt-in `persist:true` on `ai/draft`, would have turned
a pure generator into a writer; keeping generation and persistence separate is what
lets accept re-verify verbatim against the exact chunks the draft came from.

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
