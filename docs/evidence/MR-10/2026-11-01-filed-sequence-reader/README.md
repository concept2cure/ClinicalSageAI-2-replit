# MR-10 Stage 9, slice 1: a sequence filed elsewhere reads back as filed state

Launch row **D7**, ledger package **L1**, tester blocker **CAT2-07**. Session
`…session_01Gx2fiwvxaXi6mQgddPqMaG`, 2026-11-01, on `concept2cure-v2` from `8b8c6bc1`.
It is aligned with the coordinating session's holds
(`.design/claude-convergence/COORDINATION.md`) and touches no held file (design,
"Alignment with the other sessions").
Design: `docs/design/FILED_SEQUENCE_READER_2026-11-01.md`.

## What already exists

The full table is in the design, section "What already exists". In short, by path:

| Path | What it does | What it did not do |
|---|---|---|
| `server/services/legacy-importer/detector.ts` | The only reader of a foreign eCTD archive. It reaches users through AnA's `start_legacy_import`. | Its regex reader read the regional backbone only and matched hrefs to zip paths as written, so it mapped no leaf of a real sequence (see Proof). |
| `server/services/ectd/sequence-manifest.ts` | The record the platform keeps of each sequence it files (`SequenceLeafManifestEntry`). | Nothing produced it for a sequence filed elsewhere. |
| `server/services/ectd/prior-sequence-loader.ts` | `foldManifestRows` folds those records into the filed state, publicly through `loadFiledStateBySubmission`. `MODIFIED_FILE` is the pointer grammar it binds by. | Only native records. Held by RIM for F1 slice 1, so not edited here. |
| `submission-gateways/ectd-packager/ich-headings.ts`, `ectd/controlled-vocab/fda-regional-sections.ts` | Forward heading maps (section → element). | No reverse map. |
| `submission-gateways/ectd-structural-validator.ts` | Outbound checksum checks, by regex. | Not a reader. Adjacent; not converged here (design, "Adjacent, not converged"). |
| `archive/safeZip.ts`, `ectd/leaf-path-safety.ts` | Archive limits; containment. | Reused. |
| `ectd/filed-sequence-baseline.ts` and its route and surface | Declares the numbers of sequences filed elsewhere. | Holds no leaf. |

No deleted reader or importer was found (`git log --all --diff-filter=D` on
importer, legacy, backbone, filed-sequence, prior-sequence and manifest names).

## The change

| File | Change |
|---|---|
| `server/services/legacy-importer/filed-sequence-reader.ts` | The one reader of a filed sequence. It reads both backbones and verifies index-md5 and every checksum. Each href must stay in its sequence. A leaf's section is the heading that holds it. Pointers are bound within the archive. There are 20 refusal codes, and a refused leaf is never in `leaves`. External DTDs are not fetched, and a backbone that declares entities is refused before parsing. The archive is bounded before it inflates. |
| `server/services/legacy-importer/detector.ts` | `parseBackboneLeaves` (regex) and the regex admin reads are deleted. A file is `mapped` only where the reader declares it, at the reader's section. Each refusal is an error finding naming the file. The root `index-md5.txt` is structure. The replacement is the reader above, reached by the same two callers. |
| Two existing fixtures | `detector-filename-match-is-a-suggestion.test.ts` and `mdx-imports-structure-files-recognized-by-path.pglite.test.ts` were written in the old reader's own shape: root-relative regional hrefs, and no real `index.xml`. They are now conformant sequences. Each test asserts what it asserted before. The declared cover letter is at 1.2 (cover letters), not 1.1 (forms). |

Not changed: any route, table, migration, screen, AnA tool, or the structural
validator.

## Proof

| Check | Before (detector at `5f30fdda`) | After |
|---|---|---|
| `detector-reads-a-filed-sequence.test.ts`: a sequence built by the platform's own packager (Modules 1–5, with STFs) | **5 of 5 fail** ([detector-before-fix.txt](detector-before-fix.txt)). Each failure:<br>• 0 of 5 leaves mapped from a backbone; all 5 placed by filename, with 4 sections wrong at module level (`1`, `3`, `4`, `5`);<br>• the cover letter reported `missing_required_leaf` though the archive holds it;<br>• application, sequence and sponsor all null;<br>• the root `index-md5.txt` not recognized;<br>• the untampered CSR in an archive whose other leaf was tampered with, placed by filename (`suggested`), not mapped from index.xml. The run stopped at that assertion, so it does not show whether the old detector raised an error for the tampered leaf. | 5 of 5 pass |
| `filed-sequence-reader-round-trip.test.ts`: three sequences (0000 new; 0001 replace and append; 0002 a Module 1 replace into the regional backbone, and a withdrawal), built by `packageEctdSubmission` and put in one archive | — (the reader did not exist) | Every leaf of every sequence equals the packager's recorded manifest on section, file, href, md5, act, `modified-file`, title, backbone ID and backbone. The one exception is the 3.2.S.4.2 leaf, read back at its heading, 3.2.S, as the design records. **The fold (`loadFiledStateBySubmission`, given the manifests as its query's rows) gives the same filed state from the imported sequences as from the platform's own records.** *Corrected 2026-11-02:* that holds only because no two leaves of one sequence share a heading and a file name, and because the test folds the native side at heading level (`HEADING_OF`). Where two leaves do share them, the fold kept one and dropped the other. The review round's reader refuses such leaves (`leaf_identity_ambiguous`) instead. |
| `filed-sequence-reader-refuses.test.ts` | — | 33 cases:<br>• 19 of the 20 refusal codes, each naming the leaf or, for a sequence-level code, the backbone (*corrected 2026-11-02:* `sequence_number_missing` was not exercised; the review round's tests cover it);<br>• the heading reverse map agreeing with every ICH heading the packager writes, and with every FDA Module 1 heading except 1.18, the one `usRegionalHeadingPlacement` already says it cannot stand behind;<br>• pointers bound, refused, or left for the filed state. |
| Each guard made to fail | — | [guards-made-to-fail.txt](guards-made-to-fail.txt): eight guards removed one at a time, and each turns at least one test red. The guards: the checksum compare, the archive limits, the wrapper check, the entity pre-check, href containment, pointer binding, the pointer form check and the index-md5 compare. |
| Consumers | — | [after-fix.txt](after-fix.txt): the legacy-importer suite, the mdx-imports route tests (PGlite, real INSERT), the onboarding aggregate, `tests/mdx-imports-routes.test.ts`, and the archive-limit call sites. All pass. |

## Not done here, and why

Recording an imported sequence as filed state is steps 4–8 in the design's last
table. That work needs a governed act, a migration and an entry point:

- the act collides with the unreleased package-model claim;
- where the record lives is a founder decision;
- the entry point must be the existing project start or Builder, with Vault
  `.zip` admission an open MR-08 decision;
- DTD validation waits on the vendored DTDs.

Until those land, CAT2-07 remains open. A tester can see a legacy archive's
leaves mapped correctly through AnA's `start_legacy_import`, but cannot yet act
on them in a sequence.

`docs/design/FILED_ELSEWHERE_BASELINE_2026-10-29.md` (another lane's record)
still says no part of the Stage 9 import exists. The reader now exists; that row
is left to its owner.

## Correction, 2026-11-02: three consumer tests this slice turned red

An independent review of the slice (`…01Gx2fiw…`, 2026-11-02, five lenses, each finding
reproduced by a second agent) found that `90f1c747` left three more fixtures written in
the old reader's shape, and they failed on trunk:

- `server/routes/__tests__/mdx-imports-filename-suggestion-not-mapped.pglite.test.ts`;
- `server/services/ana/__tests__/start-legacy-import-filename-suggestion-not-mapped.pglite.test.ts`
  (AnA's `start_legacy_import`);
- `server/routes/__tests__/mdx-onboarding-aggregate-counts-only-confirmed-mappings.pglite.test.ts`.

Their red run on the unchanged fixtures is
[consumers-red-at-90f1c747.txt](consumers-red-at-90f1c747.txt). Each fixture is now a
conformant sequence (`handSequenceFiles`). The structure files it adds (`index.xml`,
`index-md5.txt`) are counted as skipped, and each test asserts what it did before.

Every test file that imports the detector, `mdx-imports`, `mdx-onboarding` or
`start_legacy_import` now passes: 15 files, 95 tests
([consumers-green.txt](consumers-green.txt)).

The claim above and in the commit, "95/95 across the importer, route and AnA-consumer
suites", was wrong. That run covered 8 files and no AnA test. "Two existing fixtures"
should have read five.

The review's other findings are fixed in a following change, recorded below.

## Review round, 2026-11-02: the review's other findings, fixed

The review confirmed 35 findings, each reproduced by a second agent; 4 others
were refuted. The full list, with each finding's reproduction, is in the
session's review record, summarised here by what changed. Every case in the new
`__tests__/filed-sequence-reader-real-archives.test.ts` was written first and
run against the reader at `0835454a`: **33 of 37 failed**
([review-round-red-at-0835454a.txt](review-round-red-at-0835454a.txt)). Four
passed there, as expected:
- the size cap, which tests the new module directly;
- the later-sequence refusal, a control;
- `sequence_number_missing` and the wrong-backbone pointer, which existing code
  already handled but no test exercised (#32, #33).

| Finding | What the reader did | Now |
|---|---|---|
| #1/#23 UTF-8 byte-order mark (written by default by .NET tools) | The whole backbone was refused as not well-formed | Honoured and dropped |
| #6 declared encoding | ISO-8859-1 titles recorded as U+FFFD; UTF-16 unreadable | Decoded as declared; bytes that are not what they claim are refused (`backbone_encoding_unsupported`) |
| #5 DTD-fixed prefixes | A backbone relying on the DTD's `#FIXED xmlns:xlink` was refused | `xlink`, `ectd`, `fda-regional` in scope when undeclared |
| #9 (high) / #14 DOCTYPE pre-check | Quadratic: 20.7 s blocked on a 3 KB upload; bypassed by a quoted `>` | One linear, quote-aware scan; the same input answers in milliseconds |
| — | No size bound on a backbone | Over 32 MiB is refused (`backbone_too_large`) |
| #2 ICH file reuse | A leaf reusing an earlier sequence's file was refused as unsafe | Read, with its checksum verified in the archive. A reuse from a sequence the archive does not hold waits on the filed state; one from a later sequence is refused |
| #8 percent-encoding | `%20` hrefs not found | Decoded when the literal path is absent; a decoded traversal is refused |
| #12 nested sequence folders | An outer sequence could map an inner sequence's refused file | Refused |
| #3/#16 grouped-layout pointers | Bound, but recorded as written, so the fold kept the replaced leaf | Recorded as `../<sequence>/<backbone>#<ID>` |
| #13 extra `../`, another application | Accepted, then bound by the fold to the wrong sequence | Refused |
| #17 pointer at a replaced leaf, or a withdrawal | Accepted | Refused; also a second act on one leaf in one sequence |
| #18 pointer at its own or a later sequence (outside the archive) | Accepted | Refused |
| #19 withdrawal of a leaf outside the archive | Recorded with no file name; the sequence read complete but the fold would throw | `isComplete` is false while anything waits on the filed state |
| #20 withdrawal under another heading | The fold also withdrew an unrelated leaf | The withdrawal takes the withdrawn leaf's section |
| #21 sequence number `1` | Recorded; cannot bind or order | Refused (`sequence_number_malformed`) |
| #30 two leaves, one heading, one file name | The fold kept one, silently | Each refused (`leaf_identity_ambiguous`) |
| #24 index.xml failing index-md5 | Every Module 2–5 leaf still mapped | No leaf read from either backbone |
| #34 ICH tree guard | Could never fire | Refuses 2.8, 3.9, 3.2.Z, 4.2.4, 5.9 |
| #10/#11/#15 work bounds | O(depth²) per leaf; a file re-inflated per leaf; cubic root ownership | Nesting capped at 32; each file inflated and hashed once (asserted); one pass for ownership |
| #4 grouped FDA submission | Application and number from whichever `<application>` came first | The one with `application-containing-files="true"` |
| #26 EU envelope | Sequence number lost; a new error | `<sequence>`, `<applicant>`, the procedure number |
| #7/#25 sequences not read | "No index.xml" even when it was there | Each regional backbone not read is named, with the reason; a folder holding index.xml and index-md5.txt is read whatever its name |
| #27/#31 refusals and their files | Most leaf refusals named no file; the file became a filename suggestion | Every leaf refusal names its file; that file is stored skipped, not suggested |
| #28 other regions' backbones | `m1/ca/ca-regional.xml` stored as a Module 1 document | Structure |

**Files.** These two modules are new, inside the folder they came from (RULE 6:
split, don't add):
- `filed-sequence-xml.ts`: decoding, parsing, headings;
- `filed-sequence-pointers.ts`: binding pointers and the identity check.

The reader and the detector are changed. Two tests change:
- `filed-sequence-reader-refuses.test.ts`: its duplicate-number fixture is now
  two sibling folders of one application. A duplicate is now judged per
  application, so the old fixture, a sequence nested inside another, no longer
  shows one.
- The detector test gains three cases.

**Green.** [review-round-green.txt](review-round-green.txt): the legacy-importer folder and every
test file that imports the detector, `mdx-imports`, `mdx-onboarding` or `start_legacy_import`.

**Each guard made to fail.**
[guards-made-to-fail-review-round.txt](guards-made-to-fail-review-round.txt):
21 guards, each removed in turn, each turning at least one test red.

**Not fixed, by design.**
- The fold keys a leaf by section and file name, which lives in
  `prior-sequence-loader.ts`, held by RIM. A later sequence's leaf with the
  same heading and file name as an earlier, different document therefore
  supersedes it, as it would natively for the same precise section. Keying
  imported leaves by backbone ID is handed to RIM with the pointer-parser
  convergence.
- Reading other regions' Module 1 headings beyond the FDA's and the EU's is
  unchanged.

## Second review, 2026-11-02: the fixes, reviewed before they were pushed

The review round's fixes were reviewed again, read-only and by three lenses:
coverage of the 35 findings, the tests, and new holes. Each issue went to a
skeptic. They found problems in the code already committed as `7e7fae33`, so
that commit was not pushed until they were fixed. Every case below was run
first against `7e7fae33`: **16 of 18 failed, and the absolute-name case hung
until killed at 90 s** ([second-review-red-at-7e7fae33.txt](second-review-red-at-7e7fae33.txt)).
The two that passed are coverage additions: guards the code had, which no test
exercised (the pointer's backbone, and a refused regional backbone's files).

| Issue | What `7e7fae33` did | Now |
|---|---|---|
| **High:** a zip entry named `/x` | The walk to its sequence root never ended (`lastIndexOf('/', -1)` finds the leading `/` again). safeZip refuses the name in a zip's central directory, but JSZip takes each name from the local header, so an upload whose two headers disagree carried it to the reader ("Draft review" below). | An absolute name belongs to no sequence. The walk is bounded at 1,024 characters and 32 folders. |
| 32 MiB backbone of empty leaves | About 1.7 million leaves, roughly 3 GB of heap and a 10 s block | Over 50,000 leaves is refused before the document is built (`backbone_too_large`) |
| A reused file the earlier sequence refused, never read, or never filed | Recorded, complete, and mapped | Refused: a reused file must be one a kept leaf of that earlier sequence filed |
| An archive zipped without its application folder | A grouped-form pointer (`../../nda123456/0000/…`) was refused | Bound to the sibling sequence, through a folder of any name; since the draft review, only through the application's own (below) |
| A four-digit ancestor folder (`export/2024/ind123/`) | Reuse refused | Read |
| A leaf a later filing under the same section and name took off file | A pointer at it bound, so the fold withdrew the re-filing | Refused, as the fold's own supersession implies |
| An ID such as `1ov` | Recorded; a pointer at it could never be parsed by the fold | Refused (`leaf_id_malformed`), and so is a pointer naming one |
| Several `<application>` elements, none marked | The first was taken | None is taken |
| A pointer at a leaf its own sequence then refused as ambiguous | Bound | Identity is checked before anything binds |
| `m3-2-z-…`, `m2-3-z-…` | Read as 3.2 and 2.3 | Not a heading |
| A sequence folder inside another of the same number | No longer refused | Refused |
| A leaf refused for having no ID | Its file became a filename suggestion | Stored skipped |
| A reused file in the detector | Mapped under the reusing sequence's section | Keeps the section the sequence that filed it gave it |
| 20,000 reuses refused at once; many leaves with one name | Quadratic: 14 s and 11 s | Linear (a test bounds it) |

**Withdrawn after a dissenting verdict.** One fix refused a leaf filed directly
in a heading that has sub-headings (3, 3.2, 5.3), as the packager's
`isPlaceableSection` would. A second verifier pointed out that the ICH DTD lets
every heading hold leaves. Such a leaf can be in a validly filed sequence, and
refusing it would keep that sequence out of the filed state. Such leaves are
read as filed, and a test pins it. A later act at that section is refused
openly by the packager.

**Each guard made to fail.**
[guards-made-to-fail-second-review.txt](guards-made-to-fail-second-review.txt).
On the first pass three guards survived; each got a case only it decides. On
the second pass every guard turns a test red.

**Green.** [second-review-green.txt](second-review-green.txt): the legacy-importer
folder and every test file that imports the detector, `mdx-imports`,
`mdx-onboarding` or `start_legacy_import`.

## Draft review, 2026-11-02: grouped-form paths, and a trunk change under two tests

A third, read-only review of the second review's fixes confirmed 24 issues.
`24694d13` fixed 23 of them. This is the 24th, plus two corrections.

**A grouped-form path into another application.** An FDA grouped submission
files its sequences under one folder per application (`ind123456/0001/`). A
leaf that modifies one filed under another application names that folder
(`../../nda999999/0000/index.xml#ov`). The reader at `a9202589` reads an archive
zipped without its application folder as that folder's contents. So such a
path climbed out and back in through a folder of any name, and it was bound to
this application's own sequence of the same number. That would have acted on
the wrong leaf. The fix: the climbed folder must be this application's own, as
its regional backbone names it (`fdaApplicationPrefix` of the
`application-type` attribute, plus the `application-number`). The fixture files
`ind123456`. Otherwise the leaf is refused, both as a pointer and as a reused
file. An archive that holds the application folder was already right: there,
the path leaves the folder, and is refused.

| Case | `a9202589` | Now |
|---|---|---|
| `../../nda999999/0000/index.xml#ov` from `0001/` | Bound to `0000/` | Refused, naming both folders |
| `../../nda123456/…` for IND 123456 (same number, another type) | Bound | Refused |
| `../../../0000/index.xml#ov` from `0001/` (a climb through `..`) | Bound | Refused |
| A climb when no regional backbone names the application | Bound | Refused: nothing to match the folder against |
| A reused file at `../../nda999999/0000/…` | Read from `0000/` | Refused (`leaf_href_unsafe`) |
| A pointer or reuse through `ind123456` | Bound | Bound (the controls) |

The test that bound `../../nda123456/…` for this IND fixture was wrong, and now
names `ind123456`.

**Red, green and each guard made to fail.**
- [grouped-paths-red-at-a9202589.txt](grouped-paths-red-at-a9202589.txt): the
  final cases against the reader as pushed. 5 of 7 fail; the two that pass are
  the own-folder controls.
- [guards-made-to-fail-grouped-paths.txt](guards-made-to-fail-grouped-paths.txt):
  each of six guards is removed in turn. Every one turns a test red, and each
  file is restored and compared byte for byte.
- [grouped-paths-green.txt](grouped-paths-green.txt): green.

**Correction: how `/x` reached the reader.** The second review rated the `/x`
loop high because "safeZip does not stop that name", and `24694d13` repeated
it. That reason was imprecise. A draft correction then called the loop latent,
on the grounds that safeZip refuses the name. That was wrong, and it was not
applied. The facts, from [zip-local-name-probe.txt](zip-local-name-probe.txt):
- A plain zip naming `/x` is refused by safeZip.
- A crafted zip names `ax` in its central directory and `/x` in its local
  header. It passes safeZip, which reads names from the central directory.
- JSZip names the entry `/x`, because it takes each name from the local header
  (and from a Unicode-path extra field). So the detector reached the loop.

The rating stands. The gap is safeZip's and reaches every caller that reads
with JSZip, so it is fixed in safeZip as its own change:
[`docs/evidence/D6/2026-11-02-zip-names-checked-where-read/`](../../D6/2026-11-02-zip-names-checked-where-read/README.md).
There, a crafted upload is refused at this reader's entry point,
`readFiledSequenceArchive`.

**Correction: two tests went red on trunk under a change to the fold.** At
02:56, `090f62af` (F1, "what the agency holds is what was sent") changed the
fold's filed-manifest query to return a `kind` per row. This folder's two
round-trip tests answered it through a stub pool whose rows carried no kind, so
the fold read nothing:
- `records a grouped-layout pointer in the form the fold binds`;
- `folds into the same filed state as the sequences the platform filed itself`.

Both were red on trunk from the merge of that change until this commit. The
second review's green run predates the merge, and the pre-push gates do not run
this folder's tests. The record is
[filed-state-stub-red-at-a9202589.txt](filed-state-stub-red-at-a9202589.txt).
The stub is now one helper, `filedStatePool` in the test support module. It
writes `kind: 'compile'`, as the loader's own tests do. No assertion changed.

