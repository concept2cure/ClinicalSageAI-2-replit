/**
 * Optional full-program TypeScript diagnostics in sequential fresh processes.
 * Only diagnostic targets are partitioned: every process loads the identical
 * full configuration, roots, references, imports, ambient declarations and libs.
 * No build-info or diagnostic cache is read or written.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const self = fileURLToPath(import.meta.url);
const PROTOCOL = 1;
const MAX_BUFFER = 64 * 1024 * 1024;
const hash = value => createHash('sha256').update(value).digest('hex');
const stable = value => JSON.stringify(value, (_key, item) => {
  if (item && !Array.isArray(item) && typeof item === 'object') {
    return Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]));
  }
  return item;
});

export function parseFilesPerProcess(value) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new Error('TYPECHECK_FILES_PER_PROCESS must be an integer from 1 to 10000');
  }
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count > 10000) {
    throw new Error('TYPECHECK_FILES_PER_PROCESS must be an integer from 1 to 10000');
  }
  return count;
}

function installedTypeScript(repoRoot) {
  const require = createRequire(path.join(repoRoot, 'package.json'));
  const compilerPath = require.resolve('typescript');
  return { ts: require('typescript'), compilerPath };
}

// Track resolution inputs too: package.json, missing candidates and directory
// listings can change semantics without changing any loaded source's contents.
function trackedSystem(ts) {
  const inputs = new Map();
  const system = { ...ts.sys };
  const operations = ['readFile', 'fileExists', 'directoryExists', 'readDirectory', 'getDirectories', 'realpath'];
  function record(operation, args, result) {
    const normalizedArgs = args.map(arg => arg === undefined ? null : arg);
    const value = operation === 'readFile' ? (result === undefined ? null : hash(result))
      : result === undefined ? null : result;
    const entry = { operation, args: normalizedArgs, value };
    const key = stable([operation, normalizedArgs]);
    if (inputs.has(key) && stable(inputs.get(key)) !== stable(entry)) {
      throw new Error(`TypeScript input changed while reading: ${operation} ${args[0]}`);
    }
    inputs.set(key, entry);
    return result;
  }
  for (const operation of operations) {
    if (typeof ts.sys[operation] === 'function') {
      system[operation] = (...args) => record(operation, args, ts.sys[operation](...args));
    }
  }
  return { system, entries: () => [...inputs.values()].sort((a, b) => stable(a).localeCompare(stable(b))) };
}

function verifyInputs(ts, manifest) {
  for (const entry of manifest.inputs) {
    const args = entry.args.map(arg => arg === null ? undefined : arg);
    const result = ts.sys[entry.operation](...args);
    const value = entry.operation === 'readFile' ? (result === undefined ? null : hash(result))
      : result === undefined ? null : result;
    if (stable(value) !== stable(entry.value)) {
      throw new Error(`TypeScript snapshot changed: ${entry.operation} ${entry.args[0]}`);
    }
  }
  if (hash(fs.readFileSync(self)) !== manifest.helperHash ||
      hash(fs.readFileSync(manifest.compilerPath)) !== manifest.compilerHash) {
    throw new Error('TypeScript compiler or bounded worker changed during verification');
  }
}

function serializeDiagnostic(ts, diagnostic) {
  return {
    category: diagnostic.category,
    code: diagnostic.code,
    file: diagnostic.file ? path.resolve(diagnostic.file.fileName) : null,
    start: diagnostic.start ?? null,
    length: diagnostic.length ?? null,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    relatedInformation: (diagnostic.relatedInformation || []).map(item => serializeDiagnostic(ts, item)),
  };
}

function loadProgram(repoRoot, configPath, compilerOptions) {
  const { ts, compilerPath } = installedTypeScript(repoRoot);
  const tracker = trackedSystem(ts);
  const fatalConfig = [];
  const config = ts.getParsedCommandLineOfConfigFile(path.resolve(repoRoot, configPath), compilerOptions, {
    ...tracker.system,
    onUnRecoverableConfigFileDiagnostic: diagnostic => fatalConfig.push(diagnostic),
  });
  if (!config || fatalConfig.length || config.errors.length) {
    const errors = [...fatalConfig, ...(config?.errors || [])];
    throw new Error(`TypeScript rejected configuration: ${errors.map(item =>
      `error TS${item.code}: ${ts.flattenDiagnosticMessageText(item.messageText, '\n')}`).join('\n')}`);
  }
  if (config.fileNames.length === 0) throw new Error('TypeScript configuration has no root files');
  const host = ts.createCompilerHost(config.options, true);
  for (const name of ['readFile', 'fileExists', 'directoryExists', 'readDirectory', 'getDirectories', 'realpath']) {
    if (tracker.system[name]) host[name] = tracker.system[name];
  }
  // Emission is disabled by the same override as tsc --noEmit, and any accidental
  // emit attempt is a protocol failure rather than a side effect.
  host.writeFile = () => { throw new Error('Unexpected TypeScript emit in diagnostic-only worker'); };
  const program = ts.createProgram({
    rootNames: config.fileNames,
    options: config.options,
    projectReferences: config.projectReferences,
    configFileParsingDiagnostics: config.errors,
    host,
  });
  const sourceFiles = program.getSourceFiles();
  const names = sourceFiles.map(file => path.resolve(file.fileName));
  if (!names.length || new Set(names).size !== names.length) {
    throw new Error('TypeScript program is empty or contains duplicate source paths');
  }
  // Force all non-semantic phases in the discovery process and identically in
  // every shard. This initializes the same complete global binding context.
  const initialDiagnostics = [
    ...program.getConfigFileParsingDiagnostics(),
    ...program.getOptionsDiagnostics(),
    ...program.getSyntacticDiagnostics(),
    ...program.getGlobalDiagnostics(),
  ];
  for (const extra of ['package.json', 'package-lock.json', '.typecheck-baseline.json']) {
    tracker.system.readFile(path.join(repoRoot, extra));
  }
  const options = { ...config.options };
  delete options.configFile;
  const makeManifest = () => ({
    protocol: PROTOCOL,
    compilerVersion: ts.version,
    compilerPath,
    compilerHash: hash(fs.readFileSync(compilerPath)),
    helperHash: hash(fs.readFileSync(self)),
    configPath: path.resolve(repoRoot, configPath),
    rootNames: config.fileNames,
    options,
    projectReferences: config.projectReferences || [],
    sources: sourceFiles.map(file => ({ file: path.resolve(file.fileName), sha256: hash(file.text) })),
    inputs: tracker.entries(),
  });
  return { ts, program, sourceFiles, names, initialDiagnostics, makeManifest };
}

function worker(request) {
  if (!request || request.protocol !== PROTOCOL || typeof request.repoRoot !== 'string' ||
      typeof request.configPath !== 'string' || !['discover', 'check', 'verify'].includes(request.phase)) {
    throw new Error('Invalid bounded typecheck worker request');
  }
  process.chdir(request.repoRoot);
  const context = loadProgram(request.repoRoot, request.configPath, request.compilerOptions);
  const { ts, program, sourceFiles, names, initialDiagnostics, makeManifest } = context;
  const manifest = makeManifest();
  const manifestHash = hash(stable(manifest));
  if (request.phase !== 'discover' && manifestHash !== request.manifestHash) {
    throw new Error('TypeScript full-program snapshot differs between workers');
  }
  const checked = [];
  let diagnostics = [];
  if (request.phase === 'discover') {
    diagnostics = initialDiagnostics;
  } else if (request.phase === 'check') {
    if (!Array.isArray(request.files) || !request.files.length || new Set(request.files).size !== request.files.length ||
        request.files.some(file => typeof file !== 'string' || !names.includes(file))) {
      throw new Error('Invalid or duplicate bounded diagnostic target');
    }
    const byName = new Map(sourceFiles.map(file => [path.resolve(file.fileName), file]));
    for (const name of request.files) {
      const file = byName.get(name);
      diagnostics.push(...program.getSemanticDiagnostics(file));
      if (ts.getEmitDeclarations(program.getCompilerOptions())) {
        diagnostics.push(...program.getDeclarationDiagnostics(file));
      }
      checked.push(name);
    }
  }
  if (hash(stable(makeManifest())) !== manifestHash) {
    throw new Error('Compiler input manifest changed while checking diagnostics');
  }
  verifyInputs(ts, manifest);
  return {
    protocol: PROTOCOL,
    phase: request.phase,
    manifestHash,
    manifest: request.phase === 'discover' ? manifest : null,
    checked,
    diagnostics: ts.sortAndDeduplicateDiagnostics(diagnostics).map(item => serializeDiagnostic(ts, item)),
  };
}

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    stable(Object.keys(value).sort()) === stable([...keys].sort());
}

function validDiagnostic(item, depth = 0) {
  return depth < 20 && exactKeys(item, ['category', 'code', 'file', 'start', 'length', 'message', 'relatedInformation']) &&
    Number.isInteger(item.category) && item.category >= 0 && item.category <= 3 &&
    Number.isInteger(item.code) && item.code > 0 && (item.file === null || typeof item.file === 'string') &&
    (item.start === null || (Number.isInteger(item.start) && item.start >= 0)) &&
    (item.length === null || (Number.isInteger(item.length) && item.length >= 0)) &&
    typeof item.message === 'string' && Array.isArray(item.relatedInformation) &&
    item.relatedInformation.every(related => validDiagnostic(related, depth + 1));
}

function validInput(input) {
  if (!exactKeys(input, ['operation', 'args', 'value']) || !Array.isArray(input.args) ||
      typeof input.args[0] !== 'string') return false;
  const { operation, args, value } = input;
  const strings = item => Array.isArray(item) && item.every(part => typeof part === 'string');
  if (operation === 'readFile') return args.length === 1 && (value === null || (typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)));
  if (operation === 'fileExists' || operation === 'directoryExists') return args.length === 1 && typeof value === 'boolean';
  if (operation === 'realpath') return args.length === 1 && (value === null || typeof value === 'string');
  if (operation === 'getDirectories') return args.length === 1 && strings(value);
  return operation === 'readDirectory' && args.length >= 1 && args.length <= 5 && strings(value) &&
    args.slice(1, 4).every(item => item === null || strings(item)) &&
    (args.length < 5 || args[4] === null || (Number.isInteger(args[4]) && args[4] >= 0));
}

function validateResult(result, request) {
  if (!exactKeys(result, ['protocol', 'phase', 'manifestHash', 'manifest', 'checked', 'diagnostics']) ||
      result.protocol !== PROTOCOL || result.phase !== request.phase || !/^[a-f0-9]{64}$/.test(result.manifestHash) ||
      !Array.isArray(result.checked) || !Array.isArray(result.diagnostics) || !result.diagnostics.every(item => validDiagnostic(item))) {
    throw new Error('Invalid or incomplete bounded typecheck worker JSON');
  }
  if (stable(result.checked) !== stable(request.files || [])) throw new Error('Bounded worker did not check its exact assigned files');
  if (request.phase === 'discover') {
    const manifest = result.manifest;
    if (!exactKeys(manifest, ['protocol', 'compilerVersion', 'compilerPath', 'compilerHash', 'helperHash', 'configPath',
      'rootNames', 'options', 'projectReferences', 'sources', 'inputs']) || manifest.protocol !== PROTOCOL ||
      typeof manifest.compilerVersion !== 'string' || typeof manifest.compilerPath !== 'string' ||
      !/^[a-f0-9]{64}$/.test(manifest.compilerHash) || !/^[a-f0-9]{64}$/.test(manifest.helperHash) ||
      manifest.configPath !== path.resolve(request.repoRoot, request.configPath) ||
      !Array.isArray(manifest.rootNames) || !manifest.rootNames.length || !manifest.rootNames.every(name => typeof name === 'string') ||
      !manifest.options || typeof manifest.options !== 'object' || manifest.options.noEmit !== true ||
      !Array.isArray(manifest.projectReferences) || !Array.isArray(manifest.sources) || !manifest.sources.length ||
      !manifest.sources.every(source => exactKeys(source, ['file', 'sha256']) && typeof source.file === 'string' &&
        path.isAbsolute(source.file) && /^[a-f0-9]{64}$/.test(source.sha256)) ||
      new Set(manifest.sources.map(source => source.file)).size !== manifest.sources.length ||
      !Array.isArray(manifest.inputs) || !manifest.inputs.every(validInput) || hash(stable(manifest)) !== result.manifestHash) {
      throw new Error('Invalid full-program discovery manifest');
    }
  } else if (result.manifest !== null || result.manifestHash !== request.manifestHash) {
    throw new Error('Bounded worker returned a different program snapshot');
  }
  if (request.phase === 'verify' && result.diagnostics.length !== 0) {
    throw new Error('Unexpected diagnostics in the final snapshot-only worker');
  }
}

export function runMemoryBoundedTypecheck({ repoRoot, configPath = 'tsconfig.json', filesPerProcess,
  heapMb = '4096', onProgress = () => {}, workerPath = self, incremental = false, buildInfoFile }) {
  filesPerProcess = parseFilesPerProcess(String(filesPerProcess));
  repoRoot = path.resolve(repoRoot);
  if (incremental && (typeof buildInfoFile !== 'string' || !path.isAbsolute(buildInfoFile))) {
    throw new Error('Incremental option context requires an absolute build-info path');
  }
  const expectedHelperHash = hash(fs.readFileSync(self));
  const compilerPath = createRequire(path.join(repoRoot, 'package.json')).resolve('typescript');
  const expectedCompilerHash = hash(fs.readFileSync(compilerPath));
  function invoke(phase, manifestHash, files) {
    const compilerOptions = { noEmit: true, ...(incremental ? { incremental: true, tsBuildInfoFile: buildInfoFile } : {}) };
    const request = { protocol: PROTOCOL, repoRoot, configPath, compilerOptions, phase, manifestHash, ...(files ? { files } : {}) };
    const processResult = spawnSync(process.execPath, [workerPath, '--worker'], {
      cwd: repoRoot,
      input: JSON.stringify(request),
      encoding: 'utf8',
      env: { ...process.env, NODE_OPTIONS: `--max-old-space-size=${heapMb}` },
      maxBuffer: MAX_BUFFER,
    });
    if (processResult.error || processResult.signal || processResult.status !== 0) {
      throw new Error(`Bounded typecheck ${phase} worker did not complete (exit ${processResult.status}, signal ${processResult.signal || 'none'}): ${processResult.error?.message || processResult.stderr || 'no completed result'}`);
    }
    let result;
    try { result = JSON.parse(processResult.stdout); } catch {
      throw new Error('Bounded typecheck worker produced truncated or invalid JSON');
    }
    validateResult(result, request);
    return result;
  }
  const discovery = invoke('discover');
  if (discovery.manifest.helperHash !== expectedHelperHash || discovery.manifest.compilerPath !== compilerPath ||
      discovery.manifest.compilerHash !== expectedCompilerHash) {
    throw new Error('Compiler or bounded helper changed before discovery completed');
  }
  const sourceFiles = discovery.manifest.sources.map(source => source.file);
  onProgress({ completed: 0, total: sourceFiles.length, manifestHash: discovery.manifestHash });
  const diagnostics = [...discovery.diagnostics];
  const checked = new Set();
  let workerCount = 1;
  for (let offset = 0; offset < sourceFiles.length; offset += filesPerProcess) {
    const files = sourceFiles.slice(offset, offset + filesPerProcess);
    const result = invoke('check', discovery.manifestHash, files);
    for (const file of result.checked) {
      if (checked.has(file)) throw new Error(`Source checked twice: ${file}`);
      checked.add(file);
    }
    diagnostics.push(...result.diagnostics);
    workerCount++;
    onProgress({ completed: checked.size, total: sourceFiles.length, manifestHash: discovery.manifestHash });
  }
  if (checked.size !== sourceFiles.length || sourceFiles.some(file => !checked.has(file))) {
    throw new Error('Incomplete full-program diagnostic coverage');
  }
  invoke('verify', discovery.manifestHash);
  workerCount++;
  const unique = [...new Map(diagnostics.map(item => [stable(item), item])).values()]
    .sort((a, b) => stable(a).localeCompare(stable(b)));
  return { diagnostics: unique, sourceFiles, manifestHash: discovery.manifestHash, workerCount };
}

if (process.argv[1] && path.resolve(process.argv[1]) === self && process.argv.includes('--worker')) {
  try {
    const request = JSON.parse(fs.readFileSync(0, 'utf8'));
    process.stdout.write(JSON.stringify(worker(request)));
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}
