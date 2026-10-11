/**
 * A bounded checker must retain the complete TypeScript Program in every
 * worker. These fixtures compare its aggregate against the installed compiler
 * API, including callers, ambient context, and diagnostics without filenames.
 * Worker failures must remain failures rather than becoming zero-error runs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  parseFilesPerProcess,
  runMemoryBoundedTypecheck,
} from '../typecheck-memory-bounded.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const HELPER_PATH = fileURLToPath(new URL('../typecheck-memory-bounded.mjs', import.meta.url));

// Avoid loading this repository's dependencies into the small fixture Program.
// These globals satisfy noLib while leaving every tested declaration visible.
const GLOBALS = `
interface Array<T> { length: number; [n: number]: T; }
interface Boolean {}
interface Function {}
interface CallableFunction {}
interface NewableFunction {}
interface IArguments { length: number; [n: number]: any; }
interface Number {}
interface Object {}
interface RegExp {}
interface String {}
`;

const BASE_OPTIONS = {
  target: 'ES2020',
  module: 'ESNext',
  moduleResolution: 'Bundler',
  strict: true,
  noEmit: true,
  noLib: true,
  types: [],
  skipLibCheck: true,
};

function fixture(t, files, config = {}) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'typecheck-memory-bounded-'));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(repoRoot, 'node_modules'));
  fs.symlinkSync(path.dirname(require.resolve('typescript/package.json')), path.join(repoRoot, 'node_modules/typescript'), 'dir');
  const write = (name, body) => {
    const destination = path.join(repoRoot, name);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, body);
  };
  write('globals.d.ts', GLOBALS);
  for (const [name, body] of Object.entries(files)) write(name, body);
  const { compilerOptions, ...rest } = config;
  write('tsconfig.json', JSON.stringify({
    compilerOptions: { ...BASE_OPTIONS, ...compilerOptions },
    files: ['globals.d.ts', ...Object.keys(files).filter(name => /\.[cm]?tsx?$/.test(name))],
    ...rest,
  }, null, 2));
  return { repoRoot, write };
}

function serialized(diagnostic) {
  return {
    category: diagnostic.category,
    code: diagnostic.code,
    file: diagnostic.file ? path.resolve(diagnostic.file.fileName) : null,
    start: diagnostic.start ?? null,
    length: diagnostic.length ?? null,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    relatedInformation: (diagnostic.relatedInformation || []).map(serialized),
  };
}

function comparable(diagnostic) {
  const { category, code, file, start, length, message, relatedInformation } = diagnostic;
  return { category, code, file, start, length, message, relatedInformation };
}

function canonical(diagnostics) {
  return [...new Set(diagnostics.map(diagnostic => JSON.stringify(comparable(diagnostic))))].sort();
}

function referenceProgram(repoRoot, configPath = 'tsconfig.json') {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    path.resolve(repoRoot, configPath),
    { noEmit: true },
    { ...ts.sys, onUnRecoverableConfigFileDiagnostic: diagnostic => {
      throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    } },
  );
  assert.ok(parsed, 'fixture config must parse');
  assert.equal(parsed.errors.length, 0, 'parity fixtures require valid config parsing');
  return ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
    projectReferences: parsed.projectReferences,
    configFileParsingDiagnostics: parsed.errors,
  });
}

function assertParity(repoRoot, { filesPerProcess = 1, configPath = 'tsconfig.json' } = {}) {
  const program = referenceProgram(repoRoot, configPath);
  const expected = ts.getPreEmitDiagnostics(program).map(serialized);
  const progress = [];
  const actual = runMemoryBoundedTypecheck({
    repoRoot,
    configPath,
    filesPerProcess,
    heapMb: '512',
    onProgress: message => progress.push(message),
  });
  assert.deepEqual(canonical(actual.diagnostics), canonical(expected));
  assert.deepEqual(
    [...actual.sourceFiles].sort(),
    program.getSourceFiles().map(file => path.resolve(file.fileName)).sort(),
    'coverage must include every full-Program source, not only configured roots',
  );
  assert.equal(new Set(actual.sourceFiles).size, actual.sourceFiles.length);
  assert.ok(actual.sourceFiles.every(file => path.isAbsolute(file)));
  assert.match(actual.manifestHash, /^[a-f0-9]{64}$/);
  assert.ok(Number.isInteger(actual.workerCount));
  assert.ok(actual.workerCount >= Math.ceil(actual.sourceFiles.length / filesPerProcess));
  return { actual, expected, program, progress };
}

test('files-per-process parsing accepts only bounded positive integers', () => {
  for (const value of ['1', '17', '10000']) {
    assert.equal(parseFilesPerProcess(value), Number(value));
  }
  for (const value of [
    '', '0', '-1', '+1', '1.5', '1e2', '1x', 'Infinity', 'NaN',
    ' 1', '1 ', '1\n', '10001', null, undefined, false, {}, [],
  ]) {
    assert.throws(() => parseFilesPerProcess(value), `invalid partition size ${String(value)}`);
  }
});

test('full context preserves an erroneous transitive caller outside configured roots', t => {
  const { repoRoot } = fixture(t, {
    'entry.ts': "import './api'; import './outside/caller'; export {};\n",
    'api.ts': 'export const transform = (value: number): number => value;\n',
    'outside/caller.ts': "import { transform } from '../api'; transform('wrong');\n",
  }, { files: ['globals.d.ts', 'entry.ts'], exclude: ['outside'] });
  const { actual, program } = assertParity(repoRoot);
  assert.equal(program.getRootFileNames().includes(path.join(repoRoot, 'outside/caller.ts')), false);
  assert.ok(actual.sourceFiles.includes(path.join(repoRoot, 'outside/caller.ts')));
  assert.ok(actual.diagnostics.some(diagnostic =>
    diagnostic.code === 2345 && diagnostic.file === path.join(repoRoot, 'outside/caller.ts')));
});

test('global merging, module augmentation, and declaration context survive partitioning', t => {
  const { repoRoot } = fixture(t, {
    'model.ts': 'export interface Model { value: number; }\n',
    'augment.ts': "import './model'; declare module './model' { interface Model { value: string; } }\n",
    'caller.ts': "import { Model } from './model'; const bad: Model = { value: 'wrong' }; export { bad };\n",
    'one.ts': 'interface SharedContext { member: number; } let duplicate = 1;\n',
    'two.ts': 'interface SharedContext { member: string; } let duplicate = 2;\n',
    'ambient.d.ts': 'declare const ambient: MissingAmbientType;\n',
  }, { compilerOptions: { skipLibCheck: false } });
  const { actual } = assertParity(repoRoot, { filesPerProcess: 2 });
  for (const code of [2304, 2322, 2451, 2717]) {
    assert.ok(actual.diagnostics.some(diagnostic => diagnostic.code === code), `expected TS${code}`);
  }
});

test('skipLibCheck preserves declaration coverage while matching compiler suppression', t => {
  const { repoRoot } = fixture(t, {
    'entry.ts': "export const invalid: number = 'wrong';\n",
    'ambient.d.ts': 'declare const ambient: MissingAmbientType;\n',
  });
  const { actual } = assertParity(repoRoot);
  assert.ok(actual.sourceFiles.includes(path.join(repoRoot, 'ambient.d.ts')));
  assert.ok(actual.diagnostics.some(diagnostic => diagnostic.code === 2322));
  assert.equal(actual.diagnostics.some(diagnostic => diagnostic.code === 2304), false);
});

test('declaration emit diagnostics are included when enabled with noEmit', t => {
  const { repoRoot } = fixture(t, {
    'factory.ts': 'class Hidden { private value = 1; } export const factory = () => class extends Hidden {};\n',
    'consumer.ts': "export { factory } from './factory';\n",
  }, { compilerOptions: { declaration: true } });
  const { actual } = assertParity(repoRoot);
  assert.ok(actual.diagnostics.some(diagnostic => diagnostic.code === 4094));
});

test('missing imports are diagnosed in the identical complete Program', t => {
  const { repoRoot } = fixture(t, {
    'entry.ts': "import { missing } from './does-not-exist'; export const value = missing;\n",
  });
  const { actual } = assertParity(repoRoot);
  assert.ok(actual.diagnostics.some(diagnostic => diagnostic.code === 2307));
});

test('fileless global and compiler-options diagnostics remain in the aggregate', t => {
  const { repoRoot } = fixture(t, { 'entry.ts': 'export const value = 1;\n' }, {
    compilerOptions: { module: 'CommonJS' },
    files: ['entry.ts'],
  });
  const { actual } = assertParity(repoRoot);
  assert.ok(actual.diagnostics.some(diagnostic => diagnostic.code === 2318 && diagnostic.file === null));
  assert.ok(actual.diagnostics.some(diagnostic => diagnostic.code === 5095));
});

test('syntax errors and unused expectations match the complete compiler API', t => {
  const { repoRoot } = fixture(t, {
    'broken.ts': 'export const value = ;\n',
    'expectation.ts': '// @ts-expect-error\nexport const value = 1;\n',
    'caller.ts': "export const invalid: number = 'wrong';\n",
  });
  const { actual } = assertParity(repoRoot);
  for (const code of [1109, 2322, 2578]) {
    assert.ok(actual.diagnostics.some(diagnostic => diagnostic.code === code), `expected TS${code}`);
  }
});

test('project-reference redirects and referenced declarations match a complete Program', t => {
  const { repoRoot, write } = fixture(t, {
    'entry.ts': "import { value } from './referenced'; export const invalid: string = value;\n",
  }, { references: [{ path: './referenced' }] });
  write('referenced/tsconfig.json', JSON.stringify({
    compilerOptions: {
      ...BASE_OPTIONS,
      noEmit: false,
      composite: true,
      declaration: true,
      rootDir: '.',
      outDir: 'dist',
    },
    files: ['index.ts'],
  }));
  write('referenced/index.ts', 'export const value: number = 1;\n');
  write('referenced/dist/index.d.ts', 'export declare const value: number;\n');
  const { actual } = assertParity(repoRoot);
  assert.ok(actual.sourceFiles.includes(path.join(repoRoot, 'referenced/dist/index.d.ts')));
  assert.ok(actual.diagnostics.some(diagnostic => diagnostic.code === 2322));
});

test('source manifests are deterministic across different diagnostic partition sizes', t => {
  const { repoRoot } = fixture(t, {
    'one.ts': 'export const one = 1;\n',
    'two.ts': "import { one } from './one'; export const two: string = one;\n",
  });
  const first = assertParity(repoRoot, { filesPerProcess: 1 }).actual;
  const second = assertParity(repoRoot, { filesPerProcess: 3 }).actual;
  assert.equal(first.manifestHash, second.manifestHash);
  assert.deepEqual(first.sourceFiles, second.sourceFiles);
});

test('a string partition size enforces the same worker bound as its integer value', t => {
  const { repoRoot } = fixture(t, {
    'one.ts': 'export const one = 1;\n',
    'two.ts': 'export const two = 2;\n',
    'three.ts': 'export const three = 3;\n',
    'four.ts': 'export const four = 4;\n',
  });
  const numeric = assertParity(repoRoot, { filesPerProcess: 2 }).actual;
  const string = assertParity(repoRoot, { filesPerProcess: '2' }).actual;
  assert.equal(string.workerCount, numeric.workerCount, 'string concatenation must not enlarge worker partitions');
});

test('invalid configuration parsing fails rather than passing an unchecked Program', t => {
  const { repoRoot, write } = fixture(t, { 'entry.ts': 'export const value = 1;\n' });
  write('tsconfig.json', JSON.stringify({ compilerOptions: { target: 'NotARealTarget' }, files: ['entry.ts'] }));
  assert.throws(() => runMemoryBoundedTypecheck({ repoRoot, filesPerProcess: 1, heapMb: '512' }));
});

test('an empty Program fails instead of producing a zero-error success', t => {
  const { repoRoot, write } = fixture(t, {});
  write('tsconfig.json', JSON.stringify({ compilerOptions: BASE_OPTIONS, files: [] }));
  assert.throws(() => runMemoryBoundedTypecheck({ repoRoot, filesPerProcess: 1, heapMb: '512' }));
});

test('a source change after discovery invalidates the full-Program snapshot', t => {
  const { repoRoot, write } = fixture(t, { 'entry.ts': 'export const value = 1;\n' });
  let mutated = false;
  assert.throws(() => runMemoryBoundedTypecheck({
    repoRoot,
    filesPerProcess: 1,
    heapMb: '512',
    onProgress: () => {
      if (!mutated) {
        mutated = true;
        write('entry.ts', "export const value: number = 'changed';\n");
      }
    },
  }), /snapshot|manifest|changed/i);
  assert.equal(mutated, true, 'the failure must follow completed discovery');
});

test('creating a previously absent dependency package.json invalidates module resolution', t => {
  const { repoRoot, write } = fixture(t, {
    'entry.ts': "import { value } from './dependency'; export const checked: number = value;\n",
    'dependency/index.ts': 'export const value = 1;\n',
    'dependency/alternate.d.ts': 'export declare const value: string;\n',
  }, { files: ['globals.d.ts', 'entry.ts'] });
  let mutated = false;
  assert.throws(() => runMemoryBoundedTypecheck({
    repoRoot,
    filesPerProcess: 1,
    heapMb: '512',
    onProgress: () => {
      if (!mutated) {
        mutated = true;
        write('dependency/package.json', JSON.stringify({ types: './alternate.d.ts' }));
      }
    },
  }), /snapshot|manifest|changed/i);
  assert.equal(mutated, true, 'the missing resolution input must be created after discovery');
});

test('dependency metadata changes are rejected even when source filenames and text stay fixed', t => {
  const { repoRoot, write } = fixture(t, {
    'entry.ts': "import { value } from './dependency'; export { value };\n",
    'dependency/index.ts': 'export const value = 1;\n',
    'dependency/package.json': JSON.stringify({ name: 'before', types: './index.ts' }),
  }, { files: ['globals.d.ts', 'entry.ts'] });
  let mutated = false;
  assert.throws(() => runMemoryBoundedTypecheck({
    repoRoot,
    filesPerProcess: 1,
    heapMb: '512',
    onProgress: () => {
      if (!mutated) {
        mutated = true;
        write('dependency/package.json', JSON.stringify({ name: 'after', types: './index.ts' }));
      }
    },
  }), /snapshot|manifest|changed/i);
  assert.equal(mutated, true, 'metadata must change after discovery without changing sources');
});

test('an inherited config mutation invalidates the complete compiler-options snapshot', t => {
  const { repoRoot, write } = fixture(t, {
    'entry.ts': 'const unused = 1; export {};\n',
    'base.json': JSON.stringify({ compilerOptions: { noUnusedLocals: false } }),
  }, { extends: './base.json' });
  let mutated = false;
  assert.throws(() => runMemoryBoundedTypecheck({
    repoRoot,
    filesPerProcess: 1,
    heapMb: '512',
    onProgress: () => {
      if (!mutated) {
        mutated = true;
        write('base.json', JSON.stringify({ compilerOptions: { noUnusedLocals: true } }));
      }
    },
  }), /snapshot|manifest|changed/i);
  assert.equal(mutated, true, 'the inherited config must change after discovery');
});

// Forward discovery to the real helper so each adversarial test reaches the
// semantic worker boundary with a valid full-Program manifest first.
function workerAfterDiscovery(source) {
  return `
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const input = fs.readFileSync(0, 'utf8');
const request = JSON.parse(input);
if (request.phase === 'discover') {
  const result = spawnSync(process.execPath, [${JSON.stringify(HELPER_PATH)}, '--worker'], {
    input, encoding: 'utf8', env: process.env,
  });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  process.exit(result.status ?? 1);
}
${source}
`;
}

function tamperedSuccessfulWorker(mutation) {
  return `
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const input = fs.readFileSync(0, 'utf8');
const request = JSON.parse(input);
const child = spawnSync(process.execPath, [${JSON.stringify(HELPER_PATH)}, '--worker'], {
  input, encoding: 'utf8', env: process.env,
});
if (child.status !== 0) {
  process.stderr.write(child.stderr || '');
  process.exit(child.status ?? 1);
}
const result = JSON.parse(child.stdout);
if (request.phase === 'check') { ${mutation} }
process.stdout.write(JSON.stringify(result));
`;
}

for (const [name, source] of [
  ['crashed', "process.stderr.write('injected worker crash\\n'); process.exit(23);\n"],
  ['signal-terminated', "process.kill(process.pid, 'SIGTERM');\n"],
  ['truncated JSON', "process.stdout.write('{\"diagnostics\":[');\n"],
  ['wrong schema', "process.stdout.write(JSON.stringify({ diagnostics: [], sourceFiles: [] }));\n"],
]) {
  test(`${name} workers fail closed`, t => {
    const { repoRoot, write } = fixture(t, { 'entry.ts': 'export const value = 1;\n' });
    write('malicious-worker.mjs', workerAfterDiscovery(source));
    assert.throws(() => runMemoryBoundedTypecheck({
      repoRoot,
      filesPerProcess: 1,
      heapMb: '512',
      workerPath: path.join(repoRoot, 'malicious-worker.mjs'),
    }));
  });
}

for (const [name, mutation] of [
  ['missing', 'result.checked = result.checked.slice(1);'],
  ['duplicate', 'result.checked.push(result.checked[0]);'],
  ['different snapshot', "result.manifestHash = '0'.repeat(64);"],
]) {
  test(`${name} successful-worker assignments are rejected`, t => {
    const { repoRoot, write } = fixture(t, { 'entry.ts': 'export const value = 1;\n' });
    write('tampered-worker.mjs', tamperedSuccessfulWorker(mutation));
    assert.throws(() => runMemoryBoundedTypecheck({
      repoRoot,
      filesPerProcess: 1,
      heapMb: '512',
      workerPath: path.join(repoRoot, 'tampered-worker.mjs'),
    }), /assigned|check|coverage|incomplete|duplicate|snapshot/i);
  });
}
