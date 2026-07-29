# AnA OCR

Optical character recognition for AnA's document stack, behind one capability-aware facade.

## Engines

| Input | Method | Engine | System dependency |
|---|---|---|---|
| Images (png, jpeg, tiff, bmp, webp) | `recognizeImage` | `tesseract.js` (WASM) | **none** — WASM core ships in `node_modules` |
| PDF → text | `ocrPdfToText` | pdfjs rasterise + `tesseract.js` | **none** — `@napi-rs/canvas` + pdfjs |
| PDF → searchable PDF | `ocrPdf` | `ocrmypdf` via `OcrMyPdfClient` | `ocrmypdf` binary (wraps Tesseract) |

Both the image path and `ocrPdfToText` work in **every** runtime — including the
managed/ephemeral container where no system `tesseract`/`ocrmypdf` is installed.
`ocrPdf` (which produces a *searchable PDF* rather than text) needs the `ocrmypdf`
binary and degrades gracefully (`applied: false`) instead of throwing when it's absent.

Always check `ocrService.getCapabilities()` before relying on an engine.

## Usage

```ts
import { ocrService } from '../ocr';

// Image OCR (works everywhere)
const { text, confidence } = await ocrService.recognizeImage(imageBuffer);

// Scanned-PDF → text (works everywhere; no system binary)
const pdf = await ocrService.ocrPdfToText(pdfBuffer, { dpi: 200, maxPages: 50 });

// Scanned-PDF → searchable PDF (needs ocrmypdf)
const caps = ocrService.getCapabilities();
if (caps.pdf.available) {
  await ocrService.ocrPdf('/in.pdf', '/out.pdf');
}
```

AnA invokes image OCR conversationally through the `ocr_extract_text` AI action.

## Offline language data

The WASM core is bundled locally, but Tesseract `*.traineddata` is fetched from a
CDN by default. Where outbound network is restricted (e.g. this environment, where
the CDN returns HTTP 403), OCR can't fetch the data at runtime. Provision it once:

```bash
node scripts/vendor-tesseract-langdata.mjs            # eng
node scripts/vendor-tesseract-langdata.mjs eng fra deu
```

This writes `server/assets/tessdata/<lang>.traineddata.gz`, which
`tesseractOcrService` auto-detects — no env var required. Alternatively set
`TESSERACT_LANG_PATH` to a directory you manage. `getCapabilities().image.langDataLocal`
reports whether the default languages are available on disk.

`eng` data is committed to the repo (`server/assets/tessdata/eng.traineddata.gz`),
so image and PDF OCR work out of the box. The vendoring script pulls from the **npm
registry** (`@tesseract.js-data/<lang>`), which is reachable where the jsDelivr CDN
is blocked.

Env knobs: `TESSERACT_LANG` (default `eng`; `+`/comma-separated for multiple),
`TESSERACT_LANG_PATH`, `TESSERACT_CACHE_PATH` (decompressed-data cache; defaults to
a temp dir), `OCRMYPDF_COMMAND`.
