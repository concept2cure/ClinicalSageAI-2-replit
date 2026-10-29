# D2: the define.xml stylesheet and slide decks enter the Vault (MR-08 Stage 3 step 3, 2026-10-29)

`docs/work-orders/MR-08-vault-upload-safety-and-document-control.md` Stage 3, step 3, and acceptance (a).

FDA expects `define.xml` to travel with the stylesheet that renders it. The Vault admitted `define.xml` but refused its `.xsl`, so the dataset documentation for Module 5 could not be kept whole. Slide decks (`.pptx`), such as investigator meeting and pre-IND meeting materials, were refused too. Separately, a SAS transport file a browser sends as `application/octet-stream` was stored under that type, not as the transport file its name and bytes are.

## What already exists

Searches run: `.xsl`, `xslt`, `.pptx`, `presentationml`, `NAME_BINDINGS`, `UPLOAD_NAME_BINDINGS`, `NAME_ONLY_TYPES`, `VAULT_UPLOAD_EXTENSIONS`, `signatureTypeFor`, `RAW_TEXT_MIMES`. Deleted history: nothing under those names.

- **The one format table:** `shared/constants/document-intake-formats.ts`. The Vault picker, the staging list and the ingest route's allowlist all read it.
- **The one name-binding table:** `shared/constants/upload-name-bindings.ts`, read by `server/utils/fileSignature.ts` and by the browser's archive intake. `.pptx` was already bound; `.xsl` was not.
- **`.xpt`** was already admitted (2026-10-15), and `signatureTypeFor` already checks its bytes as a transport file when it is declared octet-stream. Ingest stored the declared type all the same.
- **The archive limit (SEC-17)** already holds every ZIP container, including a `.pptx`.

## What changed

| Piece | Where |
|---|---|
| `.xsl` (read as raw text) and `.pptx` (stored, text not read) are Vault formats | `document-intake-formats.ts` |
| `.xsl` binds `application/xslt+xml`, declared as that, `text/xsl`, `text/xml`, `application/xml` or `text/plain`. The type is admitted for that name only. | `upload-name-bindings.ts` |
| XSLT is checked as text, and read as raw text | `fileSignature.ts` (`TEXT_LIKE_EXACT`), `extractDocumentText.ts` (`RAW_TEXT_MIMES`) |
| A version is stored under the type its name binds, which its bytes were just checked against | `vault-ingest.service.ts` |
| Every format the Vault admits has a byte check and a name binding | `server/utils/__tests__/fileSignature.test.ts` |

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | **On HEAD, real PostgreSQL 16 through `POST /api/vault/ingest`:** the stylesheet under four declared types and the deck are refused by type, and `define.xml` is admitted. The binary renamed `.xsl` is refused by type there, so it shows nothing yet; in green it is refused by its bytes. **The invariant:** red with `.xsl` in the format table and no binding yet. |
| `02-green.txt` | **The intake suite:** 8 of 8. **Type check:** `tsc` exits 0. **The 26 dbtests that touch intake, bindings, ingest or extraction:** 236 of 236. **The 48 unit suites that touch them:** 897 of 920. The 23 failures are the report-PDF font and founder-path renderer suites, which fail without this change too. |
| `03-mutation.txt` | Four mutations, each caught: <ul><li>ingest stores the declared type;</li><li>XSLT admitted for any name;</li><li>XSLT given no text check;</li><li>a stylesheet not read as text.</li></ul> |

## Decisions recorded here

- **The stylesheet is not chat-admitted.** The work order says `chat: false`. It belongs with its `define.xml` in the Vault, not in a conversation.
- **The stored type is the bound one, not the declared one.** Downloads serve the stored type, so an `.xpt` is now served as a transport file and a `.csv` sent as `text/plain` as CSV. Re-upload comparison does not read the type (`vault-reupload.ts`), so existing rows are unaffected.
- **A stylesheet is served as XSLT, not run.** No viewer applies it; it is downloaded like any other version.

## Not done

- **MR-08 Stage 3 step 1(b) and steps 4 to 6:** OCR off the request, the processing sweep, and the honest pending state.
