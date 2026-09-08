# Roadmap item 4 — attachments in the official eSTAR (slices 1–3 of 5)

Date: 2026-09-07. Branch `concept2cure-v2`. Roadmap item 4 of
`docs/handoff/HANDOFF_DEVICE.md` §6 — the keystone: without it, nothing the platform
authors reaches the filed form (0 of 112 nIVD / 140 IVD attachment slots populated).

This closes the first three of five slices — the multi-object writer (§1–2), the encrypted
object construction (§3a) and the catalog name tree (§3b). **A file is now genuinely
attached to the real FDA eSTAR, with the form and its scripts intact** (§3c). The remaining
two are specified in §4.

## 1. Why the writer had to change first

`appendIncrementalUpdate` took **one** object, of **one** shape:

```ts
appendIncrementalUpdate(original, { num, gen, dict, data })   // a stream, always
```

with a hardcoded two-entry cross-reference stream. That is exactly right for what it was
built for — filling the XFA `datasets` packet replaces exactly one stream — and it cannot
express an attachment. The smallest real attachment is three objects:

| object | shape | number |
|---|---|---|
| `/EmbeddedFile` | stream | new |
| `/Filespec` | **dictionary, no stream** | new |
| the catalog, carrying `/Names /EmbeddedFiles` | dictionary, no stream | **existing — replaced** |

Two new numbers past the file's `/Size`, one replacement, and two objects that are not
streams at all.

## 2. What it is now

```ts
appendIncrementalUpdate(original, objects: PdfObjectWrite[])
nextFreeObjectNumber(original): number
```

- **A list.** Mixed shapes: `data` present ⇒ the `dict` is a stream dictionary; absent ⇒ the
  `dict` is the whole object.
- **Real `/Index` subsections.** Entries are sorted by object number and grouped into
  contiguous runs, so a revision touching non-adjacent numbers (a catalog at 3 and new
  objects at 279–280) is described correctly rather than as one impossible run.
- **`/Size` clears everything allocated**, the xref stream object included — and the xref
  object number is chosen past the caller's highest, because a caller building linked
  objects legitimately reserves a block ahead of `/Size`.
- `nextFreeObjectNumber` is exported because linked objects have to know their numbers
  **before** they are written: a `/Filespec` names its `/EmbeddedFile` by reference, so the
  reference has to be in the dictionary text.

Two refusals, each pinned by a test:

- **`/Length` must match the bytes.** A reader takes `/Length` bytes and stops, so an
  understated length is a silently truncated attachment — a file that opens, and is wrong.
- **No object number twice in one revision**, which would leave the xref pointing at one of
  two bodies by accident of order.

Encryption stays the **caller's**. The writer emits the bytes it is handed; in an encrypted
document every stream and every string must already be enciphered under that object's key.
That is stated in the docstring, and §3 is what happens when it is not honoured.

## 3. Verification

| check | result |
|---|---|
| `server/services/forms/__tests__/incremental-update.test.ts` | 9 passed (new), all 9 seen failing first |
| `server/services/forms/__tests__/pdf-embedded-files.test.ts` | 9 passed (new), against the REAL encrypted template, seen failing first |
| `server/services/forms/__tests__/pdf-object-store.test.ts` | 11 passed (new), both templates, including the chained-update regression |
| `server/services/forms/__tests__/pdf-attach.test.ts` | 12 passed (new), both templates, 6 seen failing on the older-startxref bug |
| `server/services/forms` (the datasets fill, against the REAL vendored templates) | unchanged through the generalised writer and the startxref fix |
| forms + estar engine + official-eSTAR route + the nine export contracts | 30 files / 357 passed |
| `npx tsc --noEmit` | clean |

The new tests verify through **pdf-lib** — an independent parser, not this module's own
reader — so a writer that agreed only with itself would fail them.

**Cross-checked against the real encrypted FDA template, with pypdf as a second independent
oracle** (scratchpad only; not a dependency). A two-object revision — an `/EmbeddedFile`
stream and a `/Filespec` dictionary — appended to `eSTAR-510k-non-ivd.pdf`:

```
originalBytes 5280666 → outBytes 5281135, first free object 279
pypdf: trailer /Size 282
       obj 279: type=/EmbeddedFile
       obj 280: type=/Filespec  keys ['/Type','/F','/UF','/EF']
       XFA packet entries: 20        ← the form is intact
```

pypdf also printed `Adding missing padding. Ignoring padding error: Invalid padding bytes.`
— it tried to AES-decrypt a stream this probe deliberately wrote in plaintext. That is the
docstring's warning, observed: **slice 2 must encrypt the stream *and* the `/F` and `/UF`
strings** under each new object's key, or the attachment reaches CDRH as noise.

## 3a. Slice 2 — the objects, built for an encrypted document

`server/services/forms/pdf-embedded-files.ts` builds the pair one attachment needs: the
`/EmbeddedFile` stream and the `/Filespec` that names it, with the encipherment already
applied, as objects `appendIncrementalUpdate` writes verbatim. It does not touch the
catalog — attaching the pair to `/Names /EmbeddedFiles` is a separate concern and slice 3.

What the encryption actually requires, and what the tests pin:

- **The stream is enciphered under the stream object's key.** The test asserts the plaintext
  is NOT present in the written bytes and that the module's own reader gets it back exactly.
- **So are the strings.** `/F` and `/UF` are enciphered under the *`/Filespec`'s* key, not the
  stream's — a string's key comes from the object it sits in. A readable file name inside a
  ciphered document is a bug, and the test says so.
- **`/Length` describes the ciphertext; `/Params /Size` and `/CheckSum` describe the
  plaintext.** `/Length` is what a reader must read; `/Size` is the file the user attached.
  Conflating them gives a viewer that reports a size nobody recognises.
- **Hex strings, not literals.** A literal would need `\(`, `\)` and `\\` escaping over
  ciphertext that is uniformly random. Hex is the same information with nothing to get wrong.
- **`/Subtype` is a PDF name**, so `application/pdf` becomes `application#2Fpdf`.
- An empty name or zero bytes is refused rather than embedded.

**pypdf, the second independent oracle, on the real encrypted template** (scratchpad only):

```
built: first free object 279, filespec 280, plaintext 44 bytes,
       sha256 e1f5f9c8…d3dc8f
pypdf: stream bytes 44
       stream sha256 e1f5f9c8…d3dc8f          ← identical
       stream text  '%PDF-1.4\n% Section 5 software documentation\n'
       /F  Section-5-Software.pdf
       /UF Section-5-Software.pdf
       /Params {'/Size': 44, '/CheckSum': …}
       XFA packets 20                          ← the form is intact
```

No padding warnings this time — the complaint slice 1 recorded was the plaintext stream, and
it is gone.

## 3b. Slice 3 — joining the file to the document, without deleting the form

An `/EmbeddedFile` nothing references is a stream sitting in a file: Acrobat will not list
it and CDRH's ingestion will not find it. The reference that makes it an attachment is an
entry in the catalog's `/Names /EmbeddedFiles` tree.

**Why this had to be a merge.** In both templates the catalog's `/Names` dictionary holds
exactly one key: `/JavaScript`. That is the form — the reveal guards, the 510(k)-summary
rebuilds, everything `docs/reports/estar-acrobat-behaviour-2026-09-04.md` measured. Writing a
fresh names dictionary carrying `/EmbeddedFiles` would attach the file and hand the applicant
an eSTAR that opens and does nothing.

And that dictionary is **not** a top-level object. Measured 2026-09-07: nIVD catalog 212 →
`/Names 221 0 R`, which is entry 1 of `ObjStm` 272 — deflated, and enciphered under the
object stream's key. `pdf-lib` cannot traverse those, and the fill engine never needed to
(PDF forbids streams inside object streams, so every XFA packet is necessarily top-level).

So `pdf-object-store.ts` reads indirect objects wherever they live: it parses the
cross-reference **stream** (undoing the PNG predictor — the templates use Up on 5-byte rows,
without which every offset is a difference rather than a value and still parses), follows
`/Prev`, and refuses a classic `xref` table by name rather than approximating it. A
compressed object is decrypted under its **containing** stream's key — the object's own
number keys nothing, which is the detail that makes this unlike every other read in the fill
engine.

`pdf-attach.ts` then rewrites **only** the names dictionary, carrying every existing key
across verbatim and adding one. Name-tree keys are PDF strings, so they are enciphered under
the names dictionary's own object number — not under the `/Filespec` they point at — and the
array is sorted by the plaintext key, which is what a reader binary-searches. Attaching to a
document that already has an `/EmbeddedFiles` tree is **refused**: merging an arbitrary
multi-level `/Kids` tree is not something to approximate, neither template has one, and an
untested merge of a submission's attachment index is worse than a refusal that names the
problem.

### A latent bug this surfaced

`startxrefOffset` scanned the last 4 KB and took the **first** `startxref` it matched. After
an incremental update the tail holds two — the original document's and the update's — so it
returned the **older** section, and every object the update replaced read back at its
previous revision. Nothing fails; the file simply reports its old contents. It could only
bite once two updates were chained, which is exactly what attaching to a filled form does.
It now takes the last match, there is one implementation rather than the three this work
would have created, and the regression is pinned on both templates.

## 3c. What a real eSTAR now carries

Filled through `fillXfaDatasets`, then attached — two chained revisions on
`eSTAR-510k-non-ivd.pdf`. pypdf, reading the result cold:

```
attachments: ['Section-5-Software.pdf']
  Section-5-Software.pdf: 905 bytes
  sha256 61c354d4…90225d               ← identical to what the builder reported
catalog /Names keys: ['/JavaScript', '/EmbeddedFiles']
JavaScript entries: 3                  ← the template's own scripts, intact
XFA packets: 20                        ← the form is whole
datasets has trade name: True          ← and still filled
```

This is the first attachment this platform has ever embedded in the official form.

## 4. The remaining two slices

4. **The slot map.** Section → one of the 112/140 `*AddAttachment*` controls → its
   `/CHAPTER n/CHn.nn/` `AttachmentManifest` token → its completeness indicator. This is
   read off the template's own `form` packet, the way `estar-field-map.ts` was: measured,
   not guessed, and pinned per template.
5. **The `form`-packet occurrence.** `instanceManager.addInstance` plus `AttachmentName`, so
   the applicant's Acrobat shows the attachment against the right section rather than an
   embedded file nothing references.

Bytes come from authored sections (rendered) and vault evidence; the route and surface work
follows slice 5.

## 5. What this does NOT do

The file is attached to the DOCUMENT. It is not yet attached to a **section** of the eSTAR,
and that is what CDRH's ingestion reads. A submitted eSTAR routes each attachment by an
`AttachmentManifest` token of the form `<<path|/CHAPTER n/CHn.nn/>>` against a `form`-packet
occurrence carrying its `AttachmentName`; without those, an attachment is a file in the
document rather than "the software documentation for section 5". Slices 4 and 5.

Nothing in the product calls any of this yet — no route accepts attachments, and the eSTAR
the export produces today still populates 0 of 112/140 slots. What has changed is that every
reason it could not has now been removed: the writer can express the objects, they can be
enciphered, and they can be joined to the document without destroying the form.
