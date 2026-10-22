/** Isolated shared entry under browser bundling; not a full application build. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build, version } from 'esbuild';
const folder = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(folder, '../../../..');
const entry = 'shared/ai/finish-reason.ts';
const sources = [entry, 'server/services/ai-gateway/finish-reason.ts',
  'client/src/concept2cure/v2/surfaces/BatchDraft.tsx', 'vite.config.ts', 'vitest.config.ts', 'tsconfig.json',
  path.relative(root, fileURLToPath(import.meta.url))];
const sha = value => createHash('sha256').update(value).digest('hex');
const snapshot = () => Object.fromEntries(sources.map(name => [name, sha(fs.readFileSync(path.join(root, name)))]));
const manifest = { startedAt: new Date().toISOString(), node: process.version, esbuild: version,
  entry, platform: 'browser', format: 'esm', target: 'es2022', before: snapshot(),
  scope: 'Only the canonical shared classifier is browser bundled. Actual component shared alias is exercised by canonical Vitest. This is not a full client build or deployment.' };
const result = await build({ absWorkingDir: root, entryPoints: [entry], outfile: 'termination-browser.mjs',
  bundle: true, platform: 'browser', format: 'esm', target: 'es2022', write: false, metafile: true });
const inputs = Object.keys(result.metafile.inputs);
if (inputs.length !== 1 || inputs[0] !== entry) throw new Error('Unexpected browser entry dependency.');
const output = Object.values(result.metafile.outputs)[0];
if (output.imports.length !== 0) throw new Error('Browser entry has a runtime import.');
const required = ['TRUNCATING_FINISH_REASONS', 'isTruncated', 'isVerifiedComplete'];
if (JSON.stringify([...output.exports].sort()) !== JSON.stringify(required.sort())) throw new Error('Changed browser export API.');
const bundle = result.outputFiles[0].contents;
fs.writeFileSync(path.join(folder, 'browser-module.js.txt'), bundle);
fs.writeFileSync(path.join(folder, 'browser-metafile.json'), JSON.stringify(result.metafile, null, 2) + '\n');
manifest.baselineHelperSha256 = sha(fs.readFileSync(path.join(folder, 'baseline-finish-reason.ts.txt')));
manifest.sharedImplementationByteIdenticalToBaseline = manifest.baselineHelperSha256 === manifest.before[entry];
if (!manifest.sharedImplementationByteIdenticalToBaseline) throw new Error('The moved pure implementation changed.');
manifest.finishedAt = new Date().toISOString();
manifest.after = snapshot();
manifest.sourcesUnchangedDuringRun = JSON.stringify(manifest.before) === JSON.stringify(manifest.after);
manifest.bundleSha256 = sha(bundle);
manifest.imports = output.imports;
manifest.exports = output.exports;
manifest.exitCode = manifest.sourcesUnchangedDuringRun ? 0 : 1;
fs.writeFileSync(path.join(folder, 'browser-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
process.stdout.write(JSON.stringify({ exitCode: manifest.exitCode,
  sharedImplementationByteIdenticalToBaseline: manifest.sharedImplementationByteIdenticalToBaseline,
  sourcesUnchangedDuringRun: manifest.sourcesUnchangedDuringRun, inputCount: inputs.length, runtimeImports: output.imports.length }) + '\n');
process.exitCode = manifest.exitCode;
