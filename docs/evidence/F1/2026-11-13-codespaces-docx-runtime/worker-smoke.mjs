import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runIsolatedCompute } from '../../../../server/services/compute/workerClient.ts';

const outputDir = process.argv[2] ?? await mkdtemp(join(tmpdir(), 'c2c-docx-smoke-'));
await mkdir(outputDir, { recursive: true });
try {
  const outputs = await runIsolatedCompute({
    projectId: 1, organizationId: 1, requestedById: 1,
    surfaceKey: 'governed_export', intentType: 'docx_generation',
    title: 'Codespace document runtime verification', format: 'docx',
    content: '# Verification\n\nNative Word output.\n\n| Check | Result |\n|---|---|\n| Runtime | Ready |',
  });
  assert.equal(outputs.length, 1);
  const output = outputs[0];
  assert.equal(output.outputType, 'docx');
  assert.equal(output.mimeType, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.ok(output.buffer.length > 1000);
  const path = `${outputDir}/document-runtime-check.docx`;
  await writeFile(path, output.buffer);
  const reopened = spawnSync(process.env.ANA_DOCX_PYTHON || 'python3', ['-I', '-c', `
import json,sys,zipfile
from docx import Document
with zipfile.ZipFile(sys.argv[1]) as archive:
 assert archive.testzip() is None
 assert 'word/document.xml' in archive.namelist()
doc=Document(sys.argv[1])
assert any(paragraph.text=='Native Word output.' for paragraph in doc.paragraphs)
assert any([cell.text for cell in row.cells]==['Runtime','Ready'] for table in doc.tables for row in table.rows)
print(json.dumps({'zipValid':True,'paragraphPreserved':True,'tablePreserved':True}))
`, path], { encoding: 'utf8' });
  assert.equal(reopened.status, 0, reopened.stderr);
  console.info(JSON.stringify({ worker: 'runIsolatedCompute → real isolated Python worker', outputType: output.outputType,
    bytes: output.buffer.length, outputPath: path, reopened: JSON.parse(reopened.stdout), providerCalls: 0 }));
} catch (error) {
  console.error(String(error));
  process.exitCode = 1;
}
