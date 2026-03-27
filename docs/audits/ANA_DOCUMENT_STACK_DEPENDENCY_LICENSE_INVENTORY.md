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
| veraPDF | PDF/A validation | GPLv3 | CLI sidecar | strict isolation boundary required |

## Notes
- Exact version pinning and SBOM lock will be finalized in Phase 2/3 implementation PRs.
- Any GPL/LGPL components remain out-of-process and must not be statically linked into app runtime.
