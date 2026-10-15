# Security review of the dataset intake and .zip intake, and its fixes (2026-10-15)

The security-auditor lens reviewed:

- the `.xpt` / Dataset-JSON admission and readers (`fc457d725`);
- the browser `.zip` intake (`392dcbed6`).

It probed the real `multer`, `makeUploadFileFilter`, `assertUploadSafe` and readers. All of its findings are fixed here, before either change reached trunk.

| # | Finding | Fix |
|---|---|---|
| F1 | The readers run on the request thread. A crafted 50 MB file held the event loop for 6.6 s (`.xpt`: one-byte blank observations, trimmed one by one), 16 s and 2 GB (NDJSON: `split` on 50 M blank lines), and 15 s (`.json` of `[`, parsed in full for every `.json`). | `countRows` trims only the observations the last record's padding could fill. NDJSON parses the metadata line alone and counts rows by scanning bytes. A `.json` is parsed only when its first 64 KB open a Dataset-JSON object. |
| F2 | `evil.pdf ` (trailing space) declared `text/html` passed the name binding, because `path.extname` read `.pdf `. This is SEC-A-3 reopened. The allowlist trims and the binding did not; the new `.xpt` binding inherited the gap. | One extension function, `extensionOf` (`shared/constants/upload-name-bindings.ts`), drops trailing whitespace and dots. The binding reads it on both sides. |
| F3 | `application/x-sas-xport` could be declared for a `.tif` or `.html` and passed on the 48-character prefix. The prefix alone admitted anything that began with it. | `NAME_ONLY_TYPES`: the transport and NDJSON types are admitted for their own name only. The signature is the whole 80-byte first record. |
| F4 | The zip ratio bound (1000:1) was near deflate's ceiling, and 1 GB of entries could be held in the tab, more than once when several archives were dropped together. | 200:1, 300 MB total, and archives open one after another. |
| — | A real `.ndjson` upload was refused: a browser sends `application/octet-stream`, which the binding did not admit. | `.ndjson` admits octet-stream, checked as NDJSON text. |

## Semantics stated

An `.xpt` observation made only of blanks, before the last record's padding, is now counted as an observation. A dataset of empty character values has rows. The earlier read discounted every trailing blank observation, and that was both the cost and a miscount.

## Files

- `01-red.txt`: the readers and the binding as committed, with the regression tests kept. Seven failures: three readers at 2–3 s on 20 MB, and four binding gaps admitted.
- `02-green.txt`: the regression tests, every reader, profile and signature test, and the archive and hook tests.

## Reported, not changed here

- A `.zip` declared `image/png` with PNG magic in front is admitted by the allowlist's `image/` prefix. This was the case before this work. The server never unpacks it.
- No archive hash is kept for a `.zip` opened in the browser, and the UI says the archive is not kept.
