# Roadmap item 4 — attachments in the official eSTAR (slices 1–4 of 5)

Date: 2026-09-07. Branch `concept2cure-v2`. Roadmap item 4 of
`docs/handoff/HANDOFF_DEVICE.md` §6 — the keystone: without it, nothing the platform
authors reaches the filed form (0 of 113 nIVD / 145 IVD attachment slots populated).

This closes four of five slices — the multi-object writer (§1–2), the encrypted object
construction (§3a), the catalog name tree (§3b) and the slot map (§3d). **A file is now
genuinely attached to the real FDA eSTAR, with the form and its scripts intact** (§3c), and
every one of the 113/145 slots is enumerable with the chapter token CDRH routes by. The
last slice is specified in §4.

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
| `server/.../estar/__tests__/estar-attachment-slots.test.ts` | 25 passed, both templates; 18 seen failing against the old reader (§3e) |
| `server/.../estar/__tests__/estar-attachment-acceptance.test.ts` | 27 passed (new), the six delete-guards, seen failing first |
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

### And it would have been deleted on the applicant's first save

That probe used `Section-5-Software.pdf` as the `/EmbeddedFiles` **name-tree key**, and the
template will not keep it. Measured 2026-09-08, quoted from the nIVD template's own script:

```js
function removeOrphanAttachments() {//checks for attachments in attachment pane that weren't
                                    //added with Add Attachment buttons
  …
  var strBadAttachments = "The following attachments were not added with the \"Add Attachment\"
    buttons. These attachments will be deleted, since they are not associated with any section
    of eSTAR.\n\n";
  …
      if (!isDate(d[i].name.substring(0,10))) {//not date
        … event.target.removeDataObject(d[i].name);
```

It runs at **`preSave` and `preSign`**. So the document opens, the manifest still holds the
token, the sponsor still sees the attachment — until anyone saves, and then the bytes are gone.
Silent, and delayed past the point anyone would connect it to the export.

The cause is that an attachment carries **two different strings**, and nothing made them look
different:

| Acrobat | PDF | what it must be |
|---|---|---|
| `dataObject.name` | the `/EmbeddedFiles` name-tree key | `yyyy-mm-ddTHH:MM:ss`, or the form deletes it |
| `dataObject.path` | the `/Filespec`'s `/F` and `/UF` | the file name — and what the **manifest token** references |

Nothing in the shipped code was wrong: the two were always independently settable, in separate
calls. Nothing in it stopped the mistake either — both fields were called `name`. So the
distinction is structural now: `EmbeddedFileEntry.nameTreeKey`, and
`attachmentDataObjectName(at, ordinal)` mints the shape the template mints for itself. A test
attaches with a date-shaped key and a different file name and asserts the two strings stay apart.

`AttachmentValidation()` refuses five more things, each now checked before anything is built —
a duplicate path, one of 25 forbidden extensions, a non-ASCII path, a path over 124 characters,
a file over 1,000,000,000 bytes. `checkAttachmentAcceptance` reports **every** reason rather
than the first, because a caller fixing one refusal per round trip is a bad loop.

The extension list is transcribed into the code AND asserted against the template, which caught
something worth knowing: the two templates carry the **same 25 extensions in a different order**
— `.exe` is first in nIVD and second-to-last in IVD. The template's own lookup is a substring
search, so order carries no meaning; an order-sensitive check would have read as a discrepancy
that is not one.

## 3d. Slice 4 — the slot map, read from the template rather than transcribed

An attachment does not reach CDRH by being embedded. It reaches CDRH as a routing token in
the form's `Verification.AttachmentManifest`, and FDA's own script says exactly what one is:

```js
d[AttachmentIndex].description = "Administrative Documentation | Cover Letter";
Verification.AttachmentManifest.rawValue =
  Verification.AttachmentManifest.rawValue + "<<" + d[AttachmentIndex].path
  + "|/CHAPTER 1/CH1.01/" + ">>";
```

So a slot is three facts — the `AddAttachment` control, the chapter token it writes, and
FDA's own description of what belongs there — and all three are already in the template.
`estar-attachment-slots.ts` reads them. Nothing is transcribed into a table: the template
ships in the image, so a vendored copy could only drift from it, and a hand-copied regulatory
constant is a transcription error waiting for a deploy.

**Measured, and the measurements were not what a guess would have produced.**

| | nIVD | IVD |
|---|---|---|
| attachment slots | **113** | **145** |
| distinct chapter tokens | 67 | 78 |

> **Corrected 2026-09-08.** This section first reported 112 and 140, and said those numbers
> agreeing with `device-market-readiness-2026-09-07.md`'s independent count was "the strongest
> evidence available that the extraction is right". It was not evidence at all — both were
> counting distinct field NAMES, and the name is not unique. See §3e.

- Fewer chapters than slots, because several controls file into one chapter: five
  `ADAddAttachment0xx` all route to `/CHAPTER 1/CH1.04/`.
- The chapter paths are **not** `/CHAPTER n/CHn.nn/`. There is a
  `/CHAPTER 6A/CH6A.03/CH6A.03.01/`, and the deepest run four levels
  (`/CHAPTER 3/CH3.05/CH3.05.05/CH3.05.05.01/`). A tighter pattern — the one the shape
  suggests — rejects a fifth of the real slots.
- The **delete** path is a decoy. The template also adjusts the manifest with
  `.replace(…, "")`, keyed by an `iAttachmentIndices` table that maps only fifteen indices.
  Reading that finds an eighth of the slots and looks like an answer.
- One append site per template is excluded, and it earned its own test:
  `LBAttachment360.Type` is the labeling-type dropdown, which RE-ROUTES an already-attached
  file between `/CHAPTER 5/CH5.04`, `CH5.08`, `CH5.09` and `CH5.10` as the applicant changes
  the labeling kind. It is not somewhere a file can be attached, and its real slot
  (`LBAddAttachment360`) is in the map on its own. Counting it would offer an attachment
  target that does not exist.

## 3e. The slot reader was wrong three ways, and the corroboration was not corroboration

A design panel reviewing this work read the reader rather than its output, and found three
defects. Each was reproduced before anything was changed.

**1. A slot's identity was its short name, and the name is not unique.** Measured on the
templates: nIVD has **113** `*AddAttachment*` field declarations over **112 distinct names** —
`AddAttachment`, bare, is declared twice, once under `ReprocSterDocs` and once under
`BiocompatibilityDocs`. IVD has **145** declarations over **140 names**. The reader deduped on
the name, so the second declaration lost:

```
bare AddAttachment @ 6174133 | enclosing subform: ReprocSterDocs
bare AddAttachment @ 6980222 | enclosing subform: BiocompatibilityDocs
shipped reader, nIVD → 1 entry: chapter /CHAPTER 3/CH3.08/, "Reprocessing … Documents"
                       "Biocompatibility Documents" present anywhere? false
```

The nIVD **Biocompatibility** slot did not exist in the map. Outline node E1 "Biocompatibility"
is `mandatory: true` in the shipped 510(k) pack, so the one slot its content could be routed to
was the one the reader had dropped. Identity is now the full SOM path
(`root.Biocompatibility.BiocompatibilityDocs.AddAttachment`), and a test asserts that slot
exists with its own chapter and description.

**2. Descriptions were hunted in a 1200-character window behind the append**, so they could come
from a different handler than the chapter, and three nIVD / two IVD slots FDA does name reported
`null` (`EMAddAttachment415`, `EMAddAttachment450`, `EMAddAttachment950`). The scan now runs
inside the control's own declaration, which cannot cross into a neighbour's. Zero nulls on
either template, and that is asserted.

**3. One control writes two chapters, and the reader silently picked the first.**
`root.AdministrativeDocumentation.ADAddAttachment910` — the **User Fee Form** — writes
`/CHAPTER 1/CH1.04/` when `ApplicationType.ATRadioButton100 == 2` (Health Canada) and
`/CHAPTER 1/CH1.09/` otherwise (FDA). CH1.04 appears first in the file, so the reader returned
the **Health Canada** chapter for a US submission.

`chapters` is a list now — and the first correction of this was itself too strict. It refused
the slot outright, on the reasoning that the platform does not write that radio so it cannot
choose. But it does not have to choose: the templates **ship**
`root.ApplicationType.ATRadioButton100 = "1"`, and `1 != 2`, so the else branch is FDA's own
answer. Computing it from the document's own value is not a guess; it is the same computation
FDA's script performs on the same input. Refusing it cost a real slot — the User Fee Form is one
of the two `mapToEstar` already reports as `missingRequired`.

So `resolveAttachmentSlot(slot, values)` resolves a conditional slot when the deciding value is
supplied and refuses (`undecided_condition`) when it is not. The condition is transcribed into
`CONDITIONAL_ATTACHMENT_SLOTS` **and asserted against the template**, like the forbidden-extension
list: every slot with more than one chapter must have an entry whose branches are exactly that
slot's chapters. A future template that makes another control conditional fails that test instead
of silently resolving to whichever branch appears first, which is the defect this replaces.

**And 19 of the 165 appends were commented out** — 6 inside `/* … */`, 13 behind `//`. The
reader was reading FDA's discarded drafts as live routing. Comments are stripped now, measured
safe: all 113/145 slots still resolve a chapter and a description, and no chapter path contains
`//`.

### What this says about the corroboration

The original section argued that 112/140 was trustworthy because
`device-market-readiness-2026-09-07.md` had reached the same numbers from the opposite
direction. Two measurements agreeing is only evidence when they can fail differently. Both of
these counted distinct field names — the audit by counting `*AddAttachment*` controls, this by
deduping appends on the control name — so they shared one mistake and agreed loudly about it.
Agreement between two methods is worth exactly as much as the independence of their failure
modes, and that is worth writing down somewhere it will be read again.

## 4. The last slice, specified

A design panel (three approaches, two judges each, one synthesis — all six surveyors and both
judges reading the code rather than this report) settled the shape. What it found that this
report had wrong is in §3e; what it settled is here.

**The manifest is written through the existing fill engine.** Proven twice independently, once by
a surveyor and once by the synthesis, each with a call-time one-entry field map
(`{ attachmentManifest: { xfaSomPath: 'root.Verification.AttachmentManifest', type: 'text' } }`)
and no change to `fillXfaDatasets` or `ESTAR_FIELD_MAPS`:

```
SEED:      {"root.AttachmentManifest":"***Start***","root.CompletionCheck":"0"}
fill:      filled=["attachmentManifest"] skipped=[] warnings=[]
bytes:     5280666 -> 5284892  (then attach) -> 5289869
READ BACK: "***Start***<<A1_Cover_letter.pdf|/CHAPTER 1/CH1.01/>><<E1_Biocompatibility.pdf|/CHAPTER 3/CH3.05/CH3.05.06/>>"
FDA's own parser replayed on it: indexOf('<<') = 11 > 0 ✓
  arrAttachmentManifestNames = ["A1_Cover_letter.pdf","E1_Biocompatibility.pdf"]
pypdf 6.16.2, using none of this repo's code: /Names ['/JavaScript','/EmbeddedFiles'],
  JavaScript entries 3, XFA packets 20, name-tree keys date-shaped, /F the manifest paths
```

`***Start***` is a permanent 11-character prefix and it is **load-bearing**: FDA's
`checkRemovedAttachments()` tests `indexOf("<<") > 0`, strictly greater than zero. Drop the seed
and the first `<<` lands at index 0, `0 > 0` is false, and FDA's own validator silently no-ops.

**What the slice is:** append `<<path|chapter>>` per attachment to `root.AttachmentManifest` after
the seed, through the existing engine; render each mapped section with
`renderStructuredLeafPdf` (`server/services/ectd/leaf-pdf-renderer.ts`, pdf-lib only, on the
`ci:check-pdf-runtime` approved list, byte-deterministic) — **not** `renderPdfBuffersPerSection`,
whose PDFKit fallback stamps *"Do not file this rendering as the formatted document"* on page one
and whose output changes with whether the deployment has Chromium; resolve vault bytes through
`readVerifiedVaultBytes`, which already refuses a hash mismatch, a missing file and a path
escaping `uploads/`; then the route and the surface.

**Three things the panel found that must be fixed on the way** (all three are done — 1 and 3
on 2026-09-07, 2 on 2026-09-08; see `wo8-estar-attachments-slice5-2026-09-08.md`)**:**

1. `loadAuthoredDeviceSections` filters on `isAuthored` **alone** — `(content ?? '').trim().length > 0`
   — and never applies `isSubstantive`. So a section with status `drafting` and a 41-character body
   would be rendered and filed into a named CDRH document slot. That is the difference between
   filing an approved section and filing an unreviewed machine draft.
2. Adding `attachmentReport` to `withOfficialExtras` **necessarily breaks**
   `ci:governed-export-consequence-shape`'s pinned literal. That gate has no selftest, contrary to
   what one design assumed; the literal and its consumer change in the same commit.
3. `buildEmbeddedFileObjects` emits no `/Desc`, while FDA's handler sets
   `d[AttachmentIndex].description` on every one of the 113/145 controls.

**Per-slot cardinality, measured** (three sources disagreed and all three were wrong): exactly
**two** controls per template refuse a second attachment — `CLAddAttachment110` and
`ADAddAttachment803`. The "Only three attachments can be attached per attachment upload section"
text is real, and sits inside a `/* … */` block.

> **CORRECTED 2026-09-08 — it is FIVE, not two.** The paragraph above is wrong, and it is
> wrong in the way this report spends §3e warning about: a number read once and written
> down. Slice 5 needed the rule, read it from the template instead of copying the sentence,
> and found five controls per template — identical on both — each opening its handler with
> `if (<the attachment row>.presence == "visible") { messageBox("Only a single …") }`:
> `CoverLetter.CLAddAttachment110`, `…RelatedSubmissions.NSE510k.ADAddAttachment660`,
> `RiskManagement.RiskMitigationTable.RMAddAttachment100`,
> `RiskManagement.BenefitRisk.BRAddAttachment110`,
> `AdministrativeDocumentation.ADAddAttachment803`. The two named above are the first and
> the last. The rule is now read by `listEstarAttachmentSlots` and asserted whole in
> `estar-attachment-slots.test.ts`; see
> `docs/reports/wo8-estar-attachments-slice5-2026-09-08.md` §3a. The `/* … */` finding
> above is confirmed.

## 4b. The form layer, which nothing here can reach

The honest limit of a datasets-only build, measured on both templates:

- The completeness indicators are `<draw>` elements — 105 nIVD / 109 IVD `NoIndicator` draws,
  **zero** `<field name="NoIndicator">`, zero occurrences in the datasets packet.
  `CLNoIndicator110` ships `<color value="255,0,0"/>` with the tooltip "Required Question
  Incomplete". A machine-built eSTAR therefore **opens with every attachment question red**.
- `<subform name="CLAttachment110" presence="hidden">` means the per-attachment row — with its
  Open and Delete buttons — is never instantiated by a datasets-only fill. The applicant cannot
  remove our files through the form.
- `root.CompletionCheck` is writable and reads back as `1`, and **should not be written**:
  nothing in either template reads it, and `Validation()` recomputes it from those same
  form-layer draw colours. Writing `1` is a claim the form contradicts on first open.
- Slot subforms are `presence`-gated by the applicant's own answers (3277
  `.presence = "visible"|"hidden"` assignments), so a mapped slot can be one the form declares
  not applicable.

None of this is solved by any design, and none of it is guessable. It is what the reference
artifact in §4c settles.

## 4c. The one artifact that settles four questions

One eSTAR with a single attachment added in Acrobat Pro and saved. Its `datasets`, `form` and
`/EmbeddedFiles` diff against the blank template answers, at once:

1. whether the LiveCycle runtime preserves a datasets-only `AttachmentManifest` on open, or
   recomputes it — **the question that decides whether the slice works at all in a viewer**;
2. whether CDRH needs the `form`-packet `CLAttachment110` occurrence and its `AttachmentName`, or
   routes by the manifest alone;
3. whether Acrobat writes `/Desc`, and with what string;
4. what the indicators and the `form` packet's `checksum` become once an attachment exists.

Everything else about attachments has now been measured from the templates. This is the one thing
that cannot be.

## 5. What this does NOT do

The file is attached to the DOCUMENT. It is not yet attached to a **section** of the eSTAR,
and that is what CDRH's ingestion reads. A submitted eSTAR routes each attachment by an
`AttachmentManifest` token of the form `<<path|/CHAPTER n/CHn.nn/>>` against a `form`-packet
occurrence carrying its `AttachmentName`; without those, an attachment is a file in the
document rather than "the software documentation for section 5". Slices 4 and 5.

Nothing in the product calls any of this yet — no route accepts attachments, and the eSTAR
the export produces today still populates 0 of 113/145 slots. What has changed is that every
reason it could not has now been removed: the writer can express the objects, they can be
enciphered, and they can be joined to the document without destroying the form.
