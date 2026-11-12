// Render the biotech pack's Vault PDFs exactly as biotech.mjs does, with the writer in the working tree.
import { writeFileSync } from 'node:fs';
import { makeMultiPagePdfBuffer, demoTitle } from '../../../../scripts/demo/launch-demo/lib.mjs';
import * as content from '../../../../scripts/demo/launch-demo/packs/biotech-content.mjs';
const out = process.argv[2];
const specs = Object.values(content).flatMap((v) => (Array.isArray(v) ? v : [v])).filter((s) => s && typeof s === 'object' && s.pdf && s.name);
for (const spec of specs) {
  const title = demoTitle('biotech', spec.name);
  const pdf = makeMultiPagePdfBuffer({ title, subtitle: spec.pdf.subtitle, footer: 'DEMO — fictional content — Concept2Cure Therapeutics', sections: spec.pdf.sections });
  writeFileSync(`${out}/${spec.key}.pdf`, pdf);
  console.info(spec.key, '|', spec.name.slice(0, 60));
}
