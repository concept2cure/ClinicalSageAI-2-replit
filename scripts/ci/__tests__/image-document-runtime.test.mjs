/**
 * Self-test for the image document-runtime gate.
 *
 * The gate reads Dockerfile.optimized's production stage with regular
 * expressions, so each check is shown failing on the real files with the one
 * line it exists for taken out — a gate seen only passing has not been tested.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SPAWNERS,
  checkImageDocumentRuntime,
  pythonImports,
  spawnedRuntimes,
  stdlibModules,
} from '../check-image-document-runtime.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function realInputs() {
  const spawnerSources = SPAWNERS.map(read);
  const runtimeSources = Object.fromEntries(spawnedRuntimes(spawnerSources).map((r) => [r, read(r)]));
  return {
    dockerfile: read('Dockerfile.optimized'),
    spawnerSources,
    runtimeSources,
    requirements: read('requirements.txt'),
    stdlib: stdlibModules(),
  };
}

const without = (text, re) => {
  assert.match(text, re, `fixture precondition: ${re} is in the file`);
  return text.replace(re, '');
};

test('the repository passes', () => {
  assert.deepEqual(checkImageDocumentRuntime(realInputs()), []);
});

test('fails when the runtimes are not copied into the production stage', () => {
  const inputs = realInputs();
  inputs.dockerfile = without(inputs.dockerfile, /^COPY --from=builder \/app\/workers\/artifact-compute[^\n]*\n/m);
  const problems = checkImageDocumentRuntime(inputs);
  assert.ok(problems.some((p) => /docx-insert-runtime\.py is spawned by the server but not copied/.test(p)), problems.join('\n'));
});

test('fails when the virtualenv does not install the packages, or nothing probes them', () => {
  const inputs = realInputs();
  inputs.dockerfile = without(inputs.dockerfile, /^RUN python3 -m venv[\s\S]*?rm \/tmp\/requirements\.txt\n/m);
  const problems = checkImageDocumentRuntime(inputs);
  for (const re of [/does not pip-install python-docx/, /does not pip-install lxml/, /no build-time import probe for "docx"/]) {
    assert.ok(problems.some((p) => re.test(p)), `${re}\n${problems.join('\n')}`);
  }
});

test('fails when the image does not point ANA_DOCX_PYTHON at the virtualenv', () => {
  const inputs = realInputs();
  inputs.dockerfile = without(inputs.dockerfile, /^ENV ANA_DOCX_PYTHON=[^\n]*\n/m);
  assert.ok(checkImageDocumentRuntime(inputs).some((p) => /ENV ANA_DOCX_PYTHON/.test(p)));
});

test('fails when a spawner runs plain python3', () => {
  const inputs = realInputs();
  inputs.spawnerSources[0] = inputs.spawnerSources[0].replace(/process\.env\.ANA_DOCX_PYTHON/g, "'python3'");
  assert.ok(checkImageDocumentRuntime(inputs).some((p) => /scriptWorker\.ts does not spawn the interpreter/.test(p)));
});

test('fails when a runtime starts importing a package nothing installs', () => {
  const inputs = realInputs();
  const [first] = Object.keys(inputs.runtimeSources);
  inputs.runtimeSources[first] = `import openpyxl\n${inputs.runtimeSources[first]}`;
  assert.ok(checkImageDocumentRuntime(inputs).some((p) => /import "openpyxl", which has no entry/.test(p)));
});

test('fails when requirements.txt stops pinning a package the runtimes import', () => {
  const inputs = realInputs();
  inputs.requirements = without(inputs.requirements, /^lxml==[^\n]*\n/m);
  assert.ok(checkImageDocumentRuntime(inputs).some((p) => /requirements\.txt does not pin lxml/.test(p)));
});

test('reads imports the way the runtimes write them', () => {
  assert.deepEqual(
    pythonImports('import base64, json\nfrom docx.shared import Pt\nimport lxml.etree as ET\n  import indented_is_not_top_level\n').sort(),
    ['base64', 'docx', 'json', 'lxml'],
  );
});
