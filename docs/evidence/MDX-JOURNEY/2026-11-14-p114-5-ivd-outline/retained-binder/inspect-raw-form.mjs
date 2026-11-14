// Run with Node 22: node --import tsx <this file>. No field-list filtering.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const { listXfaPackets } = await import(path.join(root, 'server/services/forms/fill-official-pdf.ts'));
const pdf = readFileSync(path.join(root, 'assets/estar-templates/eSTAR-510k-ivd.pdf'));
const template = (await listXfaPackets(pdf)).find(p => p.name === 'template');
if (!template) throw new Error('The retained PDF has no template packet');
const bytes = Buffer.from(template.bytes);
const output = '/workspace/scratch/ivd-retained-binder-raw-template.xml';
writeFileSync(output, bytes);
console.log(JSON.stringify({ pdfSha256: createHash('sha256').update(pdf).digest('hex'),
  templateSha256: createHash('sha256').update(bytes).digest('hex'), templateBytes: bytes.length,
  templatePath: output, command: 'Node 22 node --import tsx inspect-raw-form.mjs' }));
