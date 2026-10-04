# D1 — a DOCX→PDF conversion that hangs ends, and one that cannot start says so

Row **D1** (hosted production, reliability of the deployed tools). Found by the D4
honest-tools review (`docs/evidence/D4/2026-09-30-honest-tools/`, handed on), fixed by the
same session `…01SuVLo2`, 2026-10-01; claimed when filed.

`runDocxPdfPipeline` (`server/services/docx-pdf-pipeline.ts`) is the one DOCX→PDF path:
`convert_docx_to_pdf`, `rasterize_page`, `generate_document`, the master document builder
and four other AnA tools call it. It had no time limit, so a LibreOffice that hung held
the calling tool — and the chat turn — for ever; and it listened for `close` only, so a
spawn that failed (`'error'`, e.g. no `python3`) left the promise unsettled.

Now the conversion runs in its own process group and, at a two-minute limit (per-call
`timeoutMs`), the whole group is killed — the Python wrapper and the `soffice` it
started — and the call fails saying so. A spawn error rejects with its cause.

| What | Red | Green |
|---|---|---|
| `server/services/__tests__/docx-pdf-pipeline.test.ts` (two cases added) | `red/pipeline-timeout.txt`: the over-limit case ends only when the process closes, as "exited with code null"; the spawn-error case never settles (the runner's 10 s timeout) | `green/pipeline-timeout.txt`: both pass with the existing cases and the `rasterize_page` suite; a real detached group of two processes is gone after the group kill |

Not run: a real LibreOffice conversion. `soffice` in this container produces no PDF,
identically on trunk.
