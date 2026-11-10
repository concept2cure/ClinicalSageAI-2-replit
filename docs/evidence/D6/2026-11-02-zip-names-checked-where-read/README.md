# D6: a ZIP's names are checked where its readers read them (SEC-17 follow-up, 2026-11-02)

This fixes `server/services/archive/safeZip.ts` (`docs/evidence/D6/2026-10-29-archive-limits/`). Its name check
could be bypassed. A ZIP names each entry twice: in its central directory, and in the entry's own local header.
`assertZipWithinLimits` checked the first. JSZip reads the second, and so do mammoth and exceljs, which read
through JSZip. JSZip also reads a third name, an Info-ZIP Unicode Path extra field, when there is one.

So a ZIP whose directory says `ax` and whose local header says `/x` passed safeZip, and JSZip named its entry
`/x`. The legacy importer's reader looped forever on that name until `24694d13`
(`docs/evidence/MR-10/2026-11-01-filed-sequence-reader/zip-local-name-probe.txt`). Any name a reader may use must
be one that was checked.

## What already exists

Searches run:
- `localHeader`, `LOCAL`, `0x7075`, `UNICODE_PATH`, `unicodePath`, `fileNameStr`, `unsafeName` and
  `names a file outside` across `server/`;
- every server import of `jszip`, `adm-zip`, `mammoth` and `exceljs`.

Deleted history: `git log --all --diff-filter=D` on `*safeZip*` and `*zip*` finds nothing relevant.

| Piece | What it does today | What it does not |
|---|---|---|
| `server/services/archive/safeZip.ts`: `inspectZip`, `assertDeclared` (`unsafeName`) | Refuses an absolute, drive or `..` name **in the central directory** | Look at the local header's name, or a Unicode Path field |
| `safeZip.ts`: `dataOf` | Reads the local header to find the entry's data | Compare the name it skips |
| `server/services/ectd/leaf-path-safety.ts` (`isContainedIn`) | Containment of a leaf href in a package | See zip entry names |
| JSZip `zipEntry.js` (`readLocalPart`, `handleUTF8`) | Takes the local header's name, then a Unicode Path whose CRC matches it. It resolves `..` and keeps the unsafe original | Refuse a mismatch |

The change is to `safeZip.ts` only. No caller changes. Each caller already maps `ArchiveLimitError` to its
refusal: 422 `ARCHIVE_LIMITS_EXCEEDED` on upload, template and eCTD validation, and a refused import in the
legacy importer.

## The change

`inspectZip` now refuses three kinds of entry:
- one whose local header names it otherwise than its directory entry does. A backslash for a slash is allowed,
  because some Windows tools write it in one header only.
- one whose Unicode Path field names a file outside the archive.
- one whose Unicode Path names another file, when the directory's name is plain ASCII. A plain-ASCII name needs
  no re-encoding, so a Unicode Path for it must be the same name.

`dataOf` and the new check read the local header through one function, `localHeaderOf`.

One existing case was adjusted, and its purpose is kept: "counts overlapping entries that share one compressed
body". Its eight directory copies were renamed `k0.tx`…`k7.tx` over one local header named `k.txt`. Each such
copy names one file two ways, and is now refused before its size is counted. So every copy keeps the local
header's name, and the case still shows the overlapping bodies counted to the limit.

## Proof

- [01-red.txt](01-red.txt): trunk's safeZip at `a9202589` with the new tests.
  - Five cases fail. The two that pass are what must still be admitted: the Windows backslash, and a Unicode Path
    equal to the name.
  - At the legacy importer's entry point (`readFiledSequenceArchive`), a crafted upload naming `/x` only in its
    local header passes trunk's safeZip, and is refused with this change.
- [02-green.txt](02-green.txt): green. The run covers:
  - `server/services/archive` and `server/services/legacy-importer`;
  - every test file that imports a caller of safeZip: 57 files, 938 tests.

  Fifteen cases of `report-os/pdf/__tests__/run-pdf.test.ts` fail identically with trunk's safeZip. This
  container has no NotoSans (503 `REPORT_PDF_FONTS_UNAVAILABLE`). That file matched the search through a comment
  only.
- [03-mutation.txt](03-mutation.txt): each of six guards is removed in turn, and every one turns a test red. The
  file is restored and compared byte for byte.
- Typecheck and lint: the pre-push gates. `eslint` on the two changed files reports nothing.

## Not done here

- Duplicate names in a directory are not refused. Which one a reader keeps depends on the reader. That is a
  separate ambiguity, not examined here.
- A local header's own extra fields are not read. JSZip skips them.
