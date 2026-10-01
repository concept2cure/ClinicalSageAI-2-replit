# AnA Document Stack — Dependency & License Inventory (Initial)

| Component | Purpose | Typical License | Integration Mode | Copyleft Handling |
|---|---|---|---|---|
| OCRmyPDF | OCR scanned PDFs | MPL-2.0 | CLI sidecar | isolated process boundary |
| Apache Tika | detection/metadata/text fallback | Apache-2.0 | HTTP sidecar | permissive |
| Docling | primary structured parsing | (verify exact upstream license during lock) | HTTP sidecar | isolate if non-permissive |
| Unstructured | fallback parsing | Apache-2.0 core (verify variants) | HTTP sidecar | permissive when using OSS API |
| GROBID | bibliography/reference extraction | Apache-2.0 | HTTP sidecar | permissive |
| Citation.js | citation normalization/rendering | MIT | Node dependency/service module | permissive |
| scispaCy | biomedical NLP enrichment | Apache-2.0 | Python sidecar | permissive |
| Vale | style linting | MIT | CLI sidecar | permissive |
| LanguageTool | grammar/style | LGPL-2.1+ | HTTP sidecar | isolate boundary maintained |
| redlines | text-level diff markup | MIT | Python sidecar/CLI | permissive |
| diff2html | browser diff rendering | MIT | Node dependency/service module | permissive |
| veraPDF | PDF/A validation | GPLv3+ or MPL-2.0+ (dual-licensed) | CLI sidecar | strict isolation boundary required |

## Notes
- Exact version pinning and SBOM lock will be finalized in Phase 2/3 implementation PRs.
- Any GPL/LGPL components remain out-of-process and must not be statically linked into app runtime.

## The production image, as shipped (added 2026-10-01)

The table above was the planned document stack. What `Dockerfile.optimized`
actually installs is below, with each program's upstream licence. Each runs as
a separate program the server starts, and none is linked into the Node runtime.

| Component | Installed as | Licence | What it does in the product | Status |
|---|---|---|---|---|
| **Ghostscript** | `ghostscript` (Debian) | **AGPL-3.0**, or a commercial licence from Artifex | Converts PDF leaves to PDF/A (`server/services/ectd/pdfa-pipeline.ts`) | **Open: counsel.** Artifex states that offering Ghostscript's function as SaaS needs its commercial licence. Whether running the unmodified command-line program behind a hosted service triggers AGPL §13 is a legal question. Until it is answered, treat it as a procurement item (a quote from Artifex). |
| veraPDF 1.30.2 | CLI jar, SHA-256 pinned | GPLv3+ or MPL-2.0+ (dual) | Validates PDF/A | Use under MPL-2.0; separate process |
| LibreOffice (common, writer) | Debian | MPL-2.0 | DOCX to PDF | Separate process |
| OCRmyPDF | Debian | MPL-2.0 | OCR of scanned PDFs | Separate process |
| Tesseract | Debian | Apache-2.0 | OCR engine | Permissive |
| OpenJDK (`default-jre-headless`) | Debian | GPLv2 with Classpath Exception | Runs veraPDF | The exception covers running programs on it |
| libxml2 (`xmllint`) | Debian | MIT | DTD and XML validation | Permissive |
| Liberation fonts | Debian | SIL OFL 1.1 | Rendering | Permissive; may be bundled |
| python-docx, lxml | pip, in the image's venv | MIT; BSD-3-Clause | DOCX runtimes | Permissive |

**Not in the production image:** PyMuPDF (AGPL-3.0 or Artifex commercial) is
pinned in `requirements.txt` for the Python ingestion scripts. The image
installs only python-docx and lxml, so PyMuPDF does not ship. Keep it that way,
or obtain the same Artifex licence.
