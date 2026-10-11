// Temporary compiler-owned incremental cache preparation; never a typecheck verdict.
// Final validation is the unchanged repository typecheck-no-regression gate.
const fs = require('node:fs');
const path = require('node:path');
const repo = path.resolve(process.env.C2C_REPO_DIR || process.cwd());
const ts = require(path.join(repo, 'node_modules/typescript'));
const cache = path.join(repo, 'node_modules/.cache/typecheck-no-regression/tsconfig.tsbuildinfo');
const mode = process.argv[2] || 'seed';
const maxFiles = Number(process.argv[3] || 20);
const softRssMb = Number(process.argv[4] || 3800);
if (!['seed', 'batch'].includes(mode) || !Number.isSafeInteger(maxFiles) || maxFiles < 1 || !Number.isFinite(softRssMb) || softRssMb < 500) throw new Error('Invalid temporary batch arguments');
if (ts.version !== '5.6.3') throw new Error('Only the inspected TypeScript 5.6.3 implementation is authorized');
process.chdir(repo);
fs.mkdirSync(path.dirname(cache), { recursive: true });
const parsed = ts.getParsedCommandLineOfConfigFile(path.join(repo, 'tsconfig.json'), {
  noEmit: true, incremental: true, tsBuildInfoFile: cache,
}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: d => { throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n')); } });
if (!parsed || parsed.errors.length) throw new Error('The unchanged repository config could not be parsed');
const builder = ts.createIncrementalProgram({ rootNames: parsed.fileNames, options: parsed.options,
  configFileParsingDiagnostics: parsed.errors, projectReferences: parsed.projectReferences });
const checked = [];
const gcEvents = [];
let skipped = 0;
// Native invalidation/signature bookkeeping only. Every skipped file remains
// an unchecked numeric diagnostic entry in the compiler's build info.
const affected = builder.getSemanticDiagnosticsOfNextAffectedFile(undefined, () => { skipped++; return true; });
if (affected !== undefined) throw new Error('The signature seed did not drain the affected queue');
function writeCompilerOutput(fileName, data) {
  if (path.resolve(fileName) !== cache) throw new Error('Unexpected compiler output path');
  const temp = `${cache}.native-${process.pid}.tmp`;
  fs.writeFileSync(temp, data);
  fs.renameSync(temp, cache);
}
function checkpoint() {
  builder.emitBuildInfo(writeCompilerOutput);
  const info = JSON.parse(fs.readFileSync(cache, 'utf8'));
  if (info.version !== ts.version || (info.changeFileSet?.length || 0) !== 0) throw new Error('The compiler retained pending signature changes');
  return { info, pending: (info.semanticDiagnosticsPerFile || []).filter(v => typeof v === 'number') };
}
let snapshot = checkpoint();
const initialPending = snapshot.pending.length;
if (mode === 'batch') {
  const pendingPaths = snapshot.pending.map(id => path.resolve(path.dirname(cache), snapshot.info.fileNames[id - 1]));
  for (const fileName of pendingPaths) {
    const source = builder.getSourceFile(fileName);
    if (!source) throw new Error(`Native pending source was not found: ${fileName}`);
    const diagnostics = builder.getSemanticDiagnostics(source);
    checked.push({ file: path.relative(repo, fileName), diagnosticCodes: diagnostics.map(d => d.code) });
    if (checked.length % 50 === 0) snapshot = checkpoint();
    if (checked.length >= maxFiles) break;
    if (process.memoryUsage().rss / 1024 / 1024 >= softRssMb) {
      if (typeof global.gc === 'function') {
        snapshot = checkpoint();
        const before = process.memoryUsage();
        global.gc();
        const after = process.memoryUsage();
        gcEvents.push({ checkedCount: checked.length,
          rssBeforeMb: Math.round(before.rss / 1024 / 1024), rssAfterMb: Math.round(after.rss / 1024 / 1024),
          heapBeforeMb: Math.round(before.heapUsed / 1024 / 1024), heapAfterMb: Math.round(after.heapUsed / 1024 / 1024) });
      }
      if (process.memoryUsage().rss / 1024 / 1024 >= softRssMb) break;
    }
  }
  snapshot = checkpoint();
}
console.info('%s', JSON.stringify({ version: ts.version, mode, rootCount: parsed.fileNames.length,
  sourceCount: snapshot.info.fileNames.length, skippedDuringNativeInvalidation: skipped,
  pendingBefore: initialPending, pendingAfter: snapshot.pending.length, checkedCount: checked.length,
  cachedDiagnosticFileCount: (snapshot.info.semanticDiagnosticsPerFile || []).filter(Array.isArray).length,
  rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024), heapMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024), gcEvents, checked }));
