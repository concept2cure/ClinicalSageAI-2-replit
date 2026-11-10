# A stored .zip is read for no text and is not opened (server/services/ocr/extractDocumentText.ts, real code, real zip)

```
PROBE application/zip {"method":"none","textLength":0}
PROBE application/x-zip-compressed {"method":"none","textLength":0}
PROBE application/octet-stream {"method":"none","textLength":0}
```

Probe script (run with npx tsx; jszip and the extractor imported from the repository):

```ts
import JSZip from '<repo>/node_modules/jszip/lib/index.js';
import { extractDocumentText } from '<repo>/server/services/ocr/extractDocumentText';
(async () => {
  const z = new JSZip();
  z.file('0003/index.xml', '<?xml version="1.0"?><ectd:ectd xmlns:ectd="http://www.ich.org/ectd"/>');
  z.file('0003/m1/us/cover.pdf', '%PDF-1.4 cover');
  const buf = await z.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  for (const mime of ['application/zip', 'application/x-zip-compressed', 'application/octet-stream']) {
    const out = await extractDocumentText(buf, mime, 'sponsor-copy-0003.zip', { ocr: false, layout: true });
    console.log('PROBE', mime, JSON.stringify({ method: out.method, textLength: out.text.length }));
  }
})();
```
