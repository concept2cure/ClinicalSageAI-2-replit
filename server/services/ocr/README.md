# AnA OCR

Optical character recognition for AnA's document stack, behind one capability-aware facade.

## Engines

| Input | Engine | System dependency |
|---|---|---|
| Images (png, jpeg, tiff, bmp, webp) | `tesseract.js` (WASM) | **none** — the WASM core ships in `node_modules` |
| PDFs | `ocrmypdf` via the existing `OcrMyPdfClient` | `ocrmypdf` binary (wraps Tesseract) |

The WASM image path works in every runtime — including the managed/ephemeral
container where no system `tesseract`/`ocrmypdf` is installed. PDF OCR still needs
the `ocrmypdf` binary; we don't add a native page rasteriser, so where it's absent
`ocrPdf` degrades gracefully (`applied: false`) instead of throwing.

Always check `ocrService.getCapabilities()` before relying on an engine.

## Usage

```ts
import { ocrService } from '../ocr';

const { text, confidence } = await ocrService.recognizeImage(imageBuffer);

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

Env knobs: `TESSERACT_LANG` (default `eng`; `+`/comma-separated for multiple),
`TESSERACT_LANG_PATH`, `OCRMYPDF_COMMAND`.
