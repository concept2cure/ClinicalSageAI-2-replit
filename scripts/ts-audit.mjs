import ts from 'typescript';
import path from 'node:path';

const cwd = process.cwd();
const configPath = ts.findConfigFile(cwd, ts.sys.fileExists, 'tsconfig.json');
if (!configPath) {
  console.error('tsconfig.json not found');
  process.exit(2);
}
const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(
  configFile.config,
  ts.sys,
  path.dirname(configPath)
);
parsed.options.noEmit = true;
parsed.options.skipLibCheck = true;

const targets = process.argv.slice(2).map(p => path.resolve(p));
if (targets.length === 0) {
  console.error('Usage: ts-audit.mjs <file...>');
  process.exit(2);
}

const program = ts.createProgram({
  rootNames: parsed.fileNames,
  options: parsed.options,
});

const targetSet = new Set(targets.map(t => t.replace(/\\/g, '/')));
const diagnostics = ts
  .getPreEmitDiagnostics(program)
  .filter(d => d.file && targetSet.has(d.file.fileName.replace(/\\/g, '/')));

if (diagnostics.length === 0) {
  console.log(`OK — no errors in ${targets.length} target file(s)`);
  process.exit(0);
}
const host = {
  getCanonicalFileName: f => f,
  getCurrentDirectory: () => cwd,
  getNewLine: () => '\n',
};
console.log(ts.formatDiagnosticsWithColorAndContext(diagnostics, host));
process.exit(1);
