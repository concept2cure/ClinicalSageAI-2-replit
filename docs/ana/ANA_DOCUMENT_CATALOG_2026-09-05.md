# AnA Document Catalog — remember, consume, contextualize client files

**Date:** 2026-09-05
**Feature flag:** `ana.document_catalog` (FeatureToggleService, **off by default**, fails closed) · env override `ANA_DOCUMENT_CATALOG_FORCE_ON=true` · **see Rollout — nothing here runs until the toggle is on**
**Migration:** `migrations/20260905_document_catalog.sql` (in `C2C_MIGRATION_FILES`)

## The problem this closes

A client uploads a file into the project vault. Before this change:

- **AnA could not see the project folder.** No tool queried `vault.documents` —
  `list_vault_documents`/`read_vault_document` read `concept2cure_artifacts`, a
  different store. She could only reach files a user hand-attached to a single
  chat turn, so a file uploaded in one session was invisible in the next: never
  listed, never re-opened, never referenced.
- **Nothing ever comprehended the document.** Filing classification read the
  filename, the title, and the first 4,000 characters. There was no durable
  record of what a document *is*, what it is *for*, or the data inside it.
- **Nothing proved a real read.** An agent could sample one page and speak as
  if it had reviewed the file, and nothing stopped a "review" that was
  metadata-only. Scanned PDFs were OCRed at ingest, but a reader could still
  treat the file as an opaque image.
- **An extraction failure looked like an empty document** (`extracted_text`
  silently null).

## What exists now

### Two tables (`migrations/20260905_document_catalog.sql`)

- **`vault.document_catalog`** — one row per vault document, two tiers:
  - *Extraction tier*, written in the **same transaction** as the ingest
    (`server/routes/vault-ingest.ts`): method (`pdf-text`/`pdf-ocr`/`docx`/…),
    OCR confidence, char/word counts — or `catalog_status='extraction_failed'`
    with the recorded reason. An extraction failure is a row that says so,
    never an absent row rendering as "nothing here".
  - *Comprehension tier*, written by AnA only after a full read:
    `document_kind`, `purpose`, `summary`, `key_data` (JSONB — study IDs,
    dates, doses, endpoints, N's as stated in the text), plus a 1536-d
    embedding (`embedding_status` records `embedded`/`failed`/`skipped`
    honestly; the column itself exists only where pgvector does).
  - A re-upload with different bytes voids the old comprehension in the same
    upsert (content-hash keyed) — stale understanding is never carried onto
    new content.
- **`vault.document_read_receipts`** — every read records the exact character
  span served, keyed to the content hash it was served from.

### The read-coverage gate (`server/services/vault/document-catalog.service.ts`)

`catalog_project_document` is **refused** unless the union of read receipts
covers the *entire* extracted text — exact integer span arithmetic, not a
percentage heuristic. The refusal names the uncovered ranges so the agent
knows precisely what is left to read. This is the mechanism that makes "a
sampled page recorded as reviewed" impossible, and the tests exercise the
refusal first (`server/services/vault/__tests__/document-catalog.service.test.ts`).

### Seven AnA tools (defs `document-catalog-tool-defs.ts`, handlers `document-catalog-tools.ts`)

| Tool | What it does |
|---|---|
| `list_project_documents` | Enumerates the vault (program-scoped via `projects.regulatory_program_id`, else org-wide): filed location, catalog state per document. Uncataloged and extraction-failed files are labeled as exactly that. Also returns the org's **chat uploads** from the evidence spine (`listClientDocuments`, `currentOnly` — superseded re-uploads excluded) with each one's `fileId`, so a file attached in a past conversation reopens through `read_uploaded_document`. A failed chat-upload listing is reported as an error, never as "no chat uploads". |
| `read_project_document` | Serves the extracted text in windows, records a receipt per window, reports coverage + remaining unread ranges. On extraction failure it says so with the recorded reason instead of returning empty text. Text produced by OCR carries its mean confidence and an explicit caveat — a recognised digit is not a typed one. |
| `catalog_project_document` | Writes the comprehension tier — refused below full coverage; embeds the record for semantic recall. |
| `place_project_document` | Files the document into its dossier folder through the canonical `placeVaultDocument` — governed, audited with both the old and new location, and **refused for a document with no comprehension record**. `unfile:true` is the honest fallback. |
| `file_chat_upload_to_vault` | Files a chat upload into the project vault through the canonical `ingestVaultDocument`, so it gains a dossier placement, a catalog record, chunks and semantic search. Refuses a vault UUID (already filed) and asks which program rather than guessing one. |
| `search_document_passages` | Passage search INSIDE the filed documents (`vault.document_chunks`, through the canonical `ragRouter` vault corpus): the sentences that answer a question, with the document and locator that make them citable. States how many documents are not in the passage index, and reports an unavailable index as unavailable. |
| `search_project_documents` | Semantic (pgvector cosine) search over the comprehension records (`document-catalog-search.ts`), org-checked. Only cataloged documents are searchable — the response counts the unsearchable ones so absence is never read as nonexistence — and an unreachable embedding provider or a vector-less database is reported as unavailability, never as an empty result. |

Definitions are in `ALL_ANA_TOOLS_RAW` (registry-consistency suite holds
def ↔ handler parity); handlers registered via the inject-and-sibling pattern;
UI step labels in `agentic-loop.ts` `TOOL_LABELS`.

### One canonical ingest, and the tool that reaches it

**Service:** `server/services/vault/vault-ingest.service.ts` · **Tool:** `file_chat_upload_to_vault`

The id-space refusal above told AnA a chat upload "has to be ingested into the
project vault first" — an action with no affordance, because the governed
ingest lived inside the body of `POST /api/vault/ingest` and nothing else could
reach it. Naming a remedy nothing can perform is its own dishonesty.

The admission moved to `ingestVaultDocument`, which the route now calls: one
implementation of what it means for a document to enter the governed corpus
(ownership → virus scan → stored bytes → extraction outcome → placement
proposal → INSERT + catalog tier + hash-chained Part 11 audit row in one
transaction → passage index post-commit). A second ingest path would have been
two answers to that question, drifting on whichever half someone forgot. The
route kept the HTTP — multipart, status codes, response shape — and shrank from
617 lines to 188; every failure is *returned* as `{ok:false, status, code,
message}` carrying the same status and code the route has always sent, so the
client contract is unchanged and the tool gets a reason it can say out loud.

The service does not open a tenant scope: callers are already inside one (the
route re-enters the scope multer destroyed and wraps the whole call; a tool call
runs inside the turn's scope). That keeps the reason the scope is needed next to
the thing that destroys it, and makes it one span rather than a dozen
re-entries.

`file_chat_upload_to_vault` then files a chat upload through that same function,
so it gains everything a vault document has: a dossier placement, a catalog
record, chunks, and semantic search. It refuses a vault UUID (already filed),
asks which program rather than guessing one, derives a stable document code so
filing the same file twice upserts one row, and relays a governed refusal with
its own reason. The behaviour-preservation of the extraction is carried by the
20 existing real-database tests — including the six that drive the HTTP route
end to end (SHA-256, bytes on disk, the audit chain, atomicity, the
cross-tenant refusal) — plus a new dbtest that files a real chat upload and
proves the resulting vault document carries the tenant key, the audit row, the
catalog tier, and is immediately readable.

### One canonical filing, and the tool that reaches it

**Service:** `server/services/vault/vault-placement.service.ts` · **Tool:** `place_project_document`

The same shape as the ingest, one step later in the document's life. The
classifier in `vault-filing.service.ts` PROPOSES a placement at upload — from a
filename, a title, and a sample of the text — and `vault-ingest` writes that
proposal once. Nothing ever revisited it. A document the rules could not place
sat in the Unfiled queue permanently; one they placed wrongly sat under
"suggested" permanently. The only writer of a filing decision was 191 lines
inside `POST /api/c2c/project-vault/:id/file`, reachable only by a person
clicking in the Vault surface, and covered by no test at all — a §11-audited
mutation that was believed to work rather than known to.

So the write moved to `placeVaultDocument`, unchanged in behaviour, and both
callers use it: the route maps its result to HTTP (191 lines → 55) and the tool
maps the same result to AnA's transcript. The guards travel with it — program
ownership reported as absence rather than as forbidden, the row taken `FOR
UPDATE` inside the transaction, a folder validated against the program's *own*
taxonomy view, and the UPDATE and its hash-chained audit row committing
together or not at all.

`place_project_document` adds one rule on top, and only for AnA: **she may file
only a document she has cataloged.** Filing is a claim about what a document
is, and a placement resting on a filename is the classifier's guess wearing her
name. Unfiling is exempt, because it retracts a claim rather than making one —
`unfile:true` puts the document in the visible Unfiled queue with her reason
recorded, which is the honest answer when she cannot justify a folder.

`tests/db/vault-placement.dbtest.ts` proves the write against real PostgreSQL:
the filed row and its audit entry (both locations, hash-chained), a folder from
another modality's taxonomy refused with nothing written, confirm-with-no-
suggestion refused, an explicit unfile honoured, and another organization's
caller unable to move the document. The taxonomy guard and the tenancy
predicate were each removed in turn to watch exactly one test go red.

### A passage citation names a page

**Mapper:** `server/services/ocr/page-offsets.ts` · **Written by:** `chunkAndEmbedDocument`

`search_document_passages` advertised "the sentences that answer the question,
with the document and page they came from", and the chunk INSERT did not list
`page_number` or `section_title` at all — so every passage came back with a null
locator. A citation nobody can turn to is not a citation.

The extractors already had the material and nobody was using it: `pdf-parse`
returns a per-page array beside its combined text, and the OCR path builds its
text by joining per-page recognitions. What was missing was the mapping from a
character offset back to a page.

It is established by ALIGNMENT, not arithmetic. Summing page lengths and adding
a separator is right until an extractor trims, re-wraps whitespace or drops a
blank page — and then it is quietly off by one for the rest of the document,
which is worse than no page at all, because a wrong citation reads as a checked
one. So each page's text is located in the combined text, in order, from where
the previous page ended. Every page found ⇒ the map is exact whatever the
extractor did in between. Any page not found ⇒ the whole map is discarded and
the chunks carry no page, which is honest.

Blank pages keep their number (a zero-width span, so nothing is attributed to
them but page 7 is still page 7), and the page numbers the extractor reports are
used rather than the array index, so a ranged extraction cites pages 5–6 as 5–6.

The tool description was corrected in the same change: a page is promised only
"for a paged format whose pages could be located", because a .docx has none.

`tests/db/vault-passage-search.dbtest.ts` ingests a three-page PDF whose pages
each exceed the 4,000-character chunk target, then re-derives the expected page
for every chunk from the STORED TEXT independently of the mapper and asserts
each `page_number` matches — plus that all three pages are actually reached, so
a mapping stuck on page 1 cannot pass. Reverting the write to NULL turns it red.
`server/services/ocr/__tests__/page-offsets.test.ts` covers the refusals: an
unfindable page, out-of-order pages, empty input.

### A file sent in chat was indexed by its first 16,000 characters

**Writer:** `server/services/uploads/upload-retrieval-atom.ts` ·
**Tripwires:** its unit suite, `tests/db/document-catalog.dbtest.ts`,
`document-passage-tools.test.ts`

Both embedding paths in `server/routes/chat/upload.ts` did the same thing:

```ts
const boundedContent = extractedText.substring(0, 16000);
INSERT INTO lumen_data_atoms (… content …) VALUES (… boundedContent …)
await embeddingService.embedAtom(atomId);
```

One atom per file, holding its first 16,000 characters. A clinical protocol
runs 300–600 KB of extracted text, so that is roughly the first four pages of a
hundred and fifty. The rest was not embedded, not stored on the atom, and not
recorded as missing — and a retrieval hit returned those characters AS the
document's content. The honest answer, "I have the opening of this file and
nothing else", was one the model had no way to give.

That is this workstream's founding complaint sitting in the pipeline itself:
grab a page, call it the document.

The limit is not the defect — an atom is a single embedding, and an embedding
over more text than that stops discriminating between the passages inside it.
Pretending the limit was not there was the defect. So the prefix now knows it
is a prefix: one writer for both paths (they were near-identical), the two
lengths recorded in `structured_data`, a cut taken at a paragraph boundary so
the embedded text is not a half-sentence making a claim the document does not,
and the upload response carrying `indexedWholeFile`.

The remedy is a different pipeline, not a bigger number.
`file_chat_upload_to_vault` runs the canonical vault ingest, which chunks and
page-numbers every character. `vault.document_chunks.document_id` carries a
hard foreign key to `vault.documents`, so an unfiled upload cannot be in the
passage corpus at all — which is why `search_document_passages` now reports how
many chat uploads sit outside it. It used to say "All 4 document(s) are in the
passage index" while the file the question was about sat outside, and a miss
read as an exhaustive search.

### The toggle the operator flipped was never read

**Service:** `FeatureToggleService.readToggle` / `readFeatureState` ·
**Tripwires:** `tests/db/document-catalog-toggles.dbtest.ts`,
`server/startup/__tests__/document-catalog-bootstrap.test.ts`

`initializeFeatureToggle` establishes a system tenant scope and carries eight
lines of comment saying why: pool instrumentation refuses any statement issued
with no tenant scope while `RLS_ENFORCE=on`, which production hard-requires,
and `feature_toggles` is platform reference data with no tenant column and no
RLS policy, so the scope states what the operation IS rather than minting
authority from an argument.

Every word of that applies to the READ. The read did not have one.

So on every enforcing deployment the toggle query was refused,
`isFeatureEnabled` caught the refusal in a bare `catch { return false }`, and
the feature resolved OFF — for the startup line, and for anything else running
outside a request. The bootstrap added in the slice above logged "the
client-files surface is inactive platform-wide" no matter what the operator had
set, which is the one thing that bootstrap exists to report accurately. Three
dbtests were red on trunk saying so.

Two fixes, because the defect has two halves. The read now establishes a system
scope when the caller has none, keeping the caller's own scope when it has one
— a data accessor that quietly upgrades its caller's role is a shape worth not
having. And `readFeatureState` returns `{ enabled, readable }` so the startup
line can distinguish "off" from "we could not find out": both leave the feature
inactive, correctly, but only one of them is a decision somebody made.

One subtlety worth keeping: a drizzle builder is lazy. Handing it back from a
synchronous callback lets `runWithSystemTenantScope` return before the query
runs, and the refusal is then byte-identical to having no scope at all.

### A listing reports its scope, not the page it happened to return

**Service:** `listProjectDocuments` → `ProjectDocumentPage` ·
**Recall:** `formatVaultScopeLine` · **Tripwires:** `tests/db/document-catalog.dbtest.ts`,
`server/services/__tests__/ana-session-bootstrap.test.ts`, `persona-client-files.test.ts`

`listProjectDocuments` always applied a `LIMIT` — 100 by default, 200 at most —
and returned a bare array. So the only number any caller could report was
`rows.length`, and the AnA tool reported exactly that, as `count`. An
organization with 340 documents was told it had 200. Session recall was worse:
it samples the twelve most recent under a heading that reads as the complete
set, so the files it omitted were the OLDEST — which is precisely where "the
file I sent you last week" lives, and precisely the recall this catalog exists
to provide.

Nothing here failed. The listing returned rows and the model reasoned over
them; it simply reasoned over a page while believing it had an inventory, and
the observable result was AnA saying "there is no such document" about a
document that was sitting in the vault. That is the user's original complaint
reproduced by the mechanism built to fix it.

Every listing now carries `total`, `withheld`, and the scope-wide counts of
what needs attention — computed by window aggregates in the same scan, so
honesty costs no extra round trip — and `count` is split into `returned` and
`total` so a caller cannot answer both questions with one field. The recall
block states what it is not showing; the persona says that a listing is a page
and that "there is no such document" is a claim about the whole vault. Chat
uploads get the same treatment through an exact limit+1 probe, needing nothing
from the evidence spine.

### The tenant tool deny-list holds on both chat paths

**Helper:** `governedToolsetFor` (`server/services/ana/governed-toolset.ts`) ·
**Tripwire:** `server/routes/__tests__/chat-path-parity.test.ts`

The same one-of-two-doors shape as the rehydration above, one turn worse.
`organizations.settings.anaToolPolicy.deny` lets a tenant switch an AnA tool off.
Honouring it takes two steps — load the policy, filter the assembled toolset —
and three call sites did both by hand while `POST /api/chat/send-message` did
neither: it passed `getAllEnabledTools()` straight into relevance selection. A
denied tool was denied on the streaming endpoint and still offered on the other.

A capability wired to one door is a gap someone eventually notices. A GOVERNANCE
CONTROL wired to one door does not fail visibly — it quietly does not hold, and
the tenant finds out by watching the model use the tool they turned off.

All three composers (both chat paths and deep-investigation) now go through one
helper. Only the deny-list is applied, as `filterToolsByPolicy` documents: `allow`
is scoped to governed mutations and enforced at execution, and applying it to the
read toolset would strip every search tool the moment a tenant allowlisted one
mutation. Relevance selection stays with each caller, which pins different tools
for its own reasons — governance must not be entangled with relevance.

The bootstrap tripwire became `chat-path-parity.test.ts`: one file enumerating
the canonical chat entry points and asserting every cross-cutting concern holds
on all of them, which is where the third instance of this shape belongs.

### Both chat paths rehydrate at session start

**Helper:** `sessionBootstrapBlockFor` (`server/services/ana-session-bootstrap.ts`) ·
**Tripwire:** `server/routes/__tests__/session-bootstrap-wiring.test.ts`

The session-start rehydration — the working summary, the top project and client
atoms, AnA's own past lessons, and the project-files digest this workstream
added — was called from exactly one place: `POST /api/chat/send-message`.

The product has two canonical chat endpoints, and it is the other one,
`POST /api/ana-ri/stream`, that a chat UI actually uses. There the memory was
query-driven only: it answers what the user just typed and never says a document
exists. So a streaming session began not knowing the client had uploaded
anything — the exact failure this workstream was built to end, still true on the
path that matters most, because the capability had been wired to one of two
equivalent doors.

The gate, the `ANA_SESSION_BOOTSTRAP_AUTO` kill-switch and the failure path move
into one helper that both routes call; the streaming path counts its prior turns
(server history, else the client's) and injects the block as a system turn ahead
of the user's message when there are none. The tripwire enumerates the canonical
chat entry points and asserts each one calls the helper, injects what it gets
back, and does NOT re-implement the gate — which is how the two diverged.

### The passage corpus becomes reachable

**Service:** `server/services/vault/document-passage-search.ts` · **Tool:** `search_document_passages`

The chunk corpus had been written by every ingest since it was built, and swept
for the legacy backlog. Nothing AnA could call ever read it. The tool that looks
like it should — `project_knowledge_search` — passes an `artifactScope`, which
routes retrieval to the project ATOM index (Data Room artifacts) and never to
the client's uploads; the only readers of the vault corpus were the Cortex query
route and the RAG eval harness. So the passages of the client's own evidence
were indexed and unreachable: the same shape as the defect that created the
corpus (a reader with no store), with the halves swapped.

The tool is a thin adapter over `ragRouter` with `corpus: 'vault'` — no second
SQL path — with two deliberate departures from the `regulatory_qa` defaults,
because this runs inside an agent turn rather than behind one request a person
is waiting on: `strategy: 'basic'` (the default 'advanced' is HyDE plus
multi-query, two model round trips before a row is read) and
`useReranking: false` (an LLM-as-judge pass per search). Hybrid retrieval, MMR
and ±1 context expansion stay on — they are SQL and arithmetic, and a matched
sentence without its surrounding clause is how a figure gets quoted away from
the condition attached to it.

Honesty, in three places: a missing tenant identity is REFUSED here rather than
passed to the pipeline, whose own refusal is an empty array indistinguishable
from "nothing matched" by the time a model reads it; every answer carries the
chunking ledger's coverage (indexed / pending / failed of total), so a miss over
a partly-indexed corpus is never reported as absence; and an unreachable
embedding provider is stated, never rendered as zero passages.

`tests/db/vault-passage-search.dbtest.ts` proves it end to end against real
PostgreSQL and a real (stub) embedding endpoint through the governed provider
seam: two documents uploaded through the ingest route are searchable by their
CONTENTS in the same session, a stability question returns the stability
passage and a tox question the tox one (the stub is a deterministic
bag-of-words projection, not a constant vector, precisely so selection is under
test), another organization's identical document never appears, and the
tenant-less call refuses. Routing the search back through `artifactScope` — the
exact misrouting that made the corpus unreachable — turns four of the six red.

### Two id spaces, told apart (`document-catalog-tools.ts`)

`list_project_documents` returns vault documents (UUID ids) *and* chat uploads
(`file_<epoch>_<rand>` ids) — so the obvious next call carries an id the
read/catalog tools do not take. Both used to answer it with **"Document not
found in your organization's programs"**: absence, reported for a file the same
surface had just listed, which under the persona's client-files rule AnA would
relay to the client verbatim. The listing meant to help had reintroduced the
original defect.

The refusal now distinguishes *wrong store* from *absent*. A chat-upload id is
told it is a chat-uploaded file, that **the file exists**, which tool reads it
(`read_uploaded_document`), and how it could gain a durable record (ingest into
the vault). An unrecognised UUID is told plainly that the vault does not hold
it, and pointed at the listing. Both tools' `document_id` descriptions now name
the id space up front, so the wrong call is less likely to be made at all.
`server/services/ana/__tests__/document-catalog-tools-id-space.test.ts` pins it;
all three cases fail against the old single "not found".

### Passage retrieval — the vault corpus is live (`document-chunking.service.ts`)

**Flag:** `ana.vault_chunking` (requires the catalog flag too) · env override `ANA_VAULT_CHUNKING_FORCE_ON=true`
**Migration:** `migrations/20260905b_vault_document_chunks.sql`

`advancedRAGPipeline`'s `'vault'` corpus — the `ragRouter` default — read
`vault.document_chunks`, a table that existed only in the install-fresh drizzle
baseline (absent from every deploy-migrated database) and whose only writer
was `server/workers/vectorization-worker.ts`: unreferenced dead code reading a
column the canonical shape never had, embedding through a direct OpenAI
client. The platform's primary retrieval corpus was a reader with no store and
a store with no writer.

Now: the migration creates the table durably (reader's exact shape, GIN
full-text + ivfflat cosine indexes, its own RLS policy set — 070_gcc only runs
on fresh installs), and ingest chunks + embeds each document's extracted text
through the governed provider seam, post-commit, all-or-nothing per document.
The catalog carries a chunking ledger (`chunk_status`/`chunk_count`/
`chunk_error`): a document whose passages could not be indexed says so — there
is no partially indexed document and no silent gap. Oversized documents
(> 500 chunks) are refused rather than truncated into fake coverage. The dead
worker is deleted and purged from the CI baselines it sat in.

Making the reader live also surfaced (and fixed) a latent reader bug: the
dense arm's threshold predicate `… < 1 - $2` made Postgres infer the parameter
as *integer* from the literal, so any float threshold failed with 22P02 —
unreachable until the table existed. Both corpus sites now cast `$2::float8`,
pinned by the end-to-end dbtest (`tests/db/document-catalog-recall.dbtest.ts`:
ingest → chunks embedded → `ragRetrieve` returns the passage).

### The tenant key the write path forgot (`vault-ingest.ts`)

`vault.documents` gained an `organization_id` (its own migration, with a
one-time backfill from each document's program) and the vault retrieval SQL
gained an explicit predicate on it — correct hardening, since RLS alone was not
the boundary. But the *write* path was never updated: the ingest INSERT did not
list the column, and no trigger populated it. The backfill therefore repaired
every existing row once, while **every document uploaded afterwards was written
NULL** — and the new predicate excludes NULL by design ("an orphan document
belongs to no tenant and is returned to none"). The net effect was silent and
total: new uploads were invisible to the vault corpus, with nothing failing
loudly to say so.

The INSERT now writes `organization_id` from the org whose ownership of the
program the route already verified (a caller who does not own it is refused
before any row is written), and the `ON CONFLICT` path repairs a still-NULL row
on re-upload without ever moving one between tenants. Two tests pin it, and
both fail with the column omitted: a direct assertion that ingest stores the
tenant key, and the end-to-end retrieval test — which is how the defect
surfaced at all.

### Backfilling documents older than the feature

**Service:** `server/services/vault/document-chunking-backfill.service.ts`
**CLI:** `node scripts/backfill-vault-chunks.mjs --org <id> [--limit N] [--retry-failed] [--apply]`

Chunking runs at ingest, so documents uploaded before a tenant's
`ana.vault_chunking` flag was flipped sit outside passage retrieval with no
`chunk_status` — the honest "never attempted" state, and exactly the candidate
set this sweep closes. One tenant per run, dry-run unless `--apply`, and
resumable: indexed documents drop out of the candidate set, so a rerun
continues the backlog and a run after completion examines nothing.

It refuses to manufacture coverage. A document whose extraction failed has no
text to index and is reported as **skipped with its reason** — never counted as
done, because only re-ingesting it (which re-runs extraction and OCR) can make
it indexable. A document that was indexable but failed is **named**, left with
`chunk_failed` on its ledger, and picked up again by `--retry-failed`; ordinary
reruns skip it rather than re-burning embedding spend on a known failure. Every
statement reaches `vault.documents` through
`regulatory_programs.organization_id`, the same join the writer uses.

### Memory ingestion embeds what it stores (`client-intelligence-memory.ts`)

`ingestDocument` and `ingestProjectDocument` (the path behind
`remember_document_in_project`) now embed every memory entry they insert,
through the governed provider seam. Semantic recall over
`client_memory_entries` / `project_memory_entries` filters
`embedding IS NOT NULL`, so before this fix every ingest-created entry was
durable but invisible — only the consolidation job's promoted summaries were
findable. An embedding failure is logged and the entries stay (unembedded,
honestly logged as unreachable), matching the consolidation job's policy.

### The discipline that makes her use any of it (`server/services/ana-ri/persona.ts`)

Every capability above shipped before any instruction to reach for it did. With
~700 tools registered, a tool description is not a discipline — and the persona
already carried a **Context Clarity Protocol** telling AnA to say plainly when
something is not in her context. Applied to a file, that is precisely the
reported behavior: a client asks about the tox report they uploaded last week
and is told it cannot be seen, while the document sits in the vault one call
away.

`## THE CLIENT'S FILES (NON-NEGOTIABLE)` sits directly above that protocol and
qualifies it. It establishes four things:

1. **The project folder is not part of the CONTEXT SNAPSHOT** — it is a place
   she *looks*. A file uploaded in a previous session is still there, so
   "I don't see that document" is not an available answer until she has called
   `list_project_documents` (or `search_project_documents` when she knows what
   she needs but not which file holds it).
2. **Consume, don't sample.** A scanned PDF is a document, not an image; the
   OCRed text *is* its content. Page through with `read_project_document` until
   the coverage it reports is complete — an opinion from the first page or the
   filename is worth nothing on a regulatory record.
3. **Record the comprehension once** with `catalog_project_document`, so the
   client stops re-explaining their own file — and record only what the text
   states.
4. **Say plainly when a file cannot be read**, using the recorded reason.

Both live chat paths (`ana-ri/stream.ts`, `chat/send-message.ts`) reach this
through the orchestrator's `buildAnaRISystemPrompt`.
`server/services/ana-ri/__tests__/persona-client-files.test.ts` is the tripwire:
it asserts every tool the section names is registered *and* executable (a
persona promising a call the runtime cannot serve teaches the model to
hallucinate one — the CMC section carries the same guard), that each of the four
disciplines is still stated, and that the section contains no backtick, since
the persona body is a template literal and the first draft of this block
terminated it.

### Session recall (`server/services/ana-session-bootstrap.ts`)

Session bootstrap now includes **"Project files on record"**: up to 12 vault
documents with filed location and what each is for — or, honestly, "not yet
studied" / "extraction FAILED". This is what makes AnA open a session already
knowing the client's files exist, where each one is, and what it is for,
instead of rediscovering them by accident. Gated on the same flag; degrades to
nothing like every other bootstrap source.

## Fail-closed properties (each verified by a failing test first)

1. A partial read cannot be cataloged — the gate refuses and names the gaps.
2. Empty extraction is `extraction_failed` with a reason — never
   "extracted, 0 chars", never `complete` coverage.
3. Flag off / toggle store unreachable → feature off; tools answer with an
   explicit disabled message, never a simulated listing.
4. The migration is pinned to the durable applier and re-applies cleanly
   (`tests/schema-contract/document-catalog-migration.contract.test.ts`).

## Rollout

> **Everything below is OFF until someone turns it on.** `feature_toggles` is
> empty on a fully migrated database — no migration seeds it — and
> `isFeatureEnabled` correctly returns false for a key with no row. So the whole
> surface resolved off in every deployment, and with no row there was nothing in
> the toggle table for an operator to find: not a feature switched off, a
> feature that could not be discovered. Startup now creates both rows (disabled)
> and prints the resolved state, so a deployment running without the capability
> says so instead of looking like one that has it
> (`server/startup/document-catalog-bootstrap.ts`, proven in
> `tests/db/document-catalog-toggles.dbtest.ts`). Enabling is still a decision,
> not a default: chunking embeds every upload at ingest and carries a per-upload
> cost.

1. Deploy (migration applies via `deploy-migrate` / `apply-c2c-migrations`).
2. Read the startup line — it names both keys and their resolved state.
3. Turn it on, either way:
   - **Per tenant:** `FeatureToggleService.enableFeatureForTenant('ana.document_catalog', <orgId>)`
     (and `'ana.vault_chunking'` for the passage index).
   - **Globally:** `UPDATE feature_toggles SET enabled = TRUE WHERE feature_key IN
     ('ana.document_catalog', 'ana.vault_chunking');`
   - **Per environment (dev):** `ANA_DOCUMENT_CATALOG_FORCE_ON=true`,
     `ANA_VAULT_CHUNKING_FORCE_ON=true`.
   The catalog can run without chunking: the tools and recall work, and
   `search_document_passages` reports that nothing is indexed rather than
   returning an empty result. Chunking without the catalog does nothing.
4. New vault ingests write the extraction tier immediately; legacy documents
   are backfilled lazily on first `read_project_document`, and their passages by
   `scripts/backfill-vault-chunks.mjs`.

## Known gaps / next steps (deliberately out of scope here)

- **Chat uploads have no catalog of their own:** they are discoverable,
  recalled at session start, and can be *filed* into the vault
  (`file_chat_upload_to_vault`), at which point they gain everything. What they
  do not have is a coverage-gated catalog entry *while still unfiled* —
  deliberately: the comprehension record hangs off `vault.documents`, and
  filing is the act that gives a file a governed home. `remember_document_in_project`
  (now embedding its entries) remains their lighter durable-memory path.
- **Passage search does not narrow to one document.** It searches the
  organization's whole filed corpus; "what does THIS report say about X" is
  served by reading that document. Adding a document filter means adding a
  column to the shared `rag-filters` layer, which is a change to every corpus,
  not to this tool.
- **Cataloging and filing are still model-invoked:** Anna reads, catalogs and
  files a document when the work calls for it; nothing sweeps the backlog of
  "extracted but not yet studied" files, or the Unfiled queue, on its own. Both
  are labeled honestly in the listing and in session recall, so the backlog is
  visible rather than hidden — but a file nobody asks about stays unstudied.
- ~~`vault.documents.page_count` never populated~~ — **closed.** Ingest now
  reads the count from the PDF itself (`pdfPageCount`, no text-layer census) and
  writes it to the document and its catalog row. It stays null for a format
  with no pages or a file that will not parse, so null now means "not
  applicable or not readable" rather than "nobody looked".
- ~~Bootstrap recall of chat uploads~~ — **closed.** The session-start digest
  now carries a second block for files the client attached in past
  conversations, each with the `file_id` that reopens it, saying plainly that
  they are not filed and naming the tool that files them. One definition of
  "the chat uploads this org has" (`listChatUploads`) serves both the digest and
  the discovery tool.
