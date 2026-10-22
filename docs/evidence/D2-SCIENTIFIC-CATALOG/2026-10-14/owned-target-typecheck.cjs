const path = require('node:path');
const root = path.resolve(__dirname, '../../../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const targets = process.argv.slice(2).map(f => path.resolve(root, f));
if (!targets.length) throw new Error('No diagnostic targets');
const configPath = path.join(root, 'tsconfig.json');
const raw = ts.readConfigFile(configPath, ts.sys.readFile);
if (raw.error) throw new Error(ts.flattenDiagnosticMessageText(raw.error.messageText, '\n'));
const config = ts.parseJsonConfigFileContent(raw.config, ts.sys, root, { noEmit: true }, configPath);
const ambient = config.fileNames.filter(f => f.endsWith('.d.ts'));
const program = ts.createProgram({ rootNames: [...new Set([...targets, ...ambient])], options: config.options });
const diagnostics = [...config.errors, ...program.getOptionsDiagnostics(), ...program.getGlobalDiagnostics()];
process.stdout.write(`Scope: ${targets.length} owned roots plus repository ambient declarations and imported dependencies; compiler options from repository tsconfig.json. This is not a whole-repository typecheck.\n`);
for (const target of targets) {
  const source = program.getSourceFile(target);
  if (!source) throw new Error(`Missing target: ${target}`);
  const found = [...program.getSyntacticDiagnostics(source), ...program.getSemanticDiagnostics(source)];
  diagnostics.push(...found);
  process.stdout.write(`${path.relative(root, target)}: ${found.length} target diagnostics\n`);
}
process.stdout.write(`Loaded imported/ambient sources: ${program.getSourceFiles().length}\n`);
process.stdout.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCurrentDirectory: () => root, getCanonicalFileName: x => x, getNewLine: () => '\n' }));
process.stdout.write(`Total selected-scope diagnostics: ${diagnostics.length}\n`);
process.exitCode = diagnostics.some(x => x.category === ts.DiagnosticCategory.Error) ? 1 : 0;
