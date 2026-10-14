import ts from 'typescript';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
const root = process.cwd();
const targets = [
  'server/services/ana/document-catalog-tool-defs.ts', 'server/services/ana/step-presentation.ts',
  'server/services/ana/__tests__/document-source-facade-integration.test.ts',
  'server/services/ana/__tests__/step-document-titles.pglite.test.ts',
  'server/services/ana/__tests__/document-placement-tools.test.ts',
  'server/services/ana/catalog-scope.ts', 'server/services/ana/document-tools-shared.ts',
  'server/services/ana/document-catalog-tools.ts', 'server/services/ana/document-catalog-input.ts',
  'server/services/ana/document-passage-tools.ts', 'server/services/ana/draft-project-sources.ts',
  'server/services/ana/__tests__/document-source-access-tools.test.ts',
  'server/services/ana/__tests__/document-catalog-preview-tools.test.ts',
  'server/services/ana/__tests__/document-catalog-tools-project-scope.test.ts',
  'server/services/ana/__tests__/document-catalog-tools-id-space.test.ts',
  'server/services/ana/__tests__/document-catalog-program-binding.test.ts',
  'server/services/ana/__tests__/document-passage-tools.test.ts',
  'server/services/ana/__tests__/draft-project-sources.test.ts',
  'server/services/ana/__tests__/batch-draft-sections.test.ts',
  'server/services/ana/__tests__/vault-access-without-key.test.ts',
  'server/services/ana/__tests__/read-delivery-executor.test.ts',
  'server/services/ana/__tests__/support/read-delivery-vault.ts',
  'server/services/ana/__tests__/support/source-read-tool-fixture.ts',
];
const sourceHashes = Object.fromEntries(targets.map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
const fileSet = new Set(targets.map(file => path.join(root, file)));
const raw = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
if (raw.error) throw new Error(ts.flattenDiagnosticMessageText(raw.error.messageText, '\n'));
const parsed = ts.parseJsonConfigFileContent(raw.config, ts.sys, root);
const program = ts.createProgram([...fileSet], {...parsed.options, noEmit: true});
const all = ts.getPreEmitDiagnostics(program);
const relevant = all.filter(d => !d.file || fileSet.has(d.file.fileName));
const unchanged = targets.every(file => sourceHashes[file] === createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'));
fs.writeFileSync(path.join(root,'docs/evidence/D2-ANA-SOURCE-ACCESS/2026-10-14/tools-type-source-manifest.json'),JSON.stringify({sourceHashes,unchanged},null,2)+'\n');
console.info(JSON.stringify({ sourceUnchangedDuringCheck: unchanged, check: 'target-file diagnostics, imports inspected but excluded from pass count', targets, targetDiagnostics: relevant.length, importedDiagnostics: all.length-relevant.length }, null, 2));
console.info(ts.formatDiagnosticsWithColorAndContext(relevant,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>root,getNewLine:()=> '\n'}));
process.exitCode = relevant.length || !unchanged ? 1 : 0;
