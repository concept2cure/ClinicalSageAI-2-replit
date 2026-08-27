#!/usr/bin/env node
/** Fail closed when an active runtime contract drifts away from Node 22 LTS. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const NODE_MAJOR = '22';
const NODE_ENGINE = '>=22.0.0 <23.0.0';
const readText = (path) => readFileSync(path, 'utf8');
const trackedWorkflows = () => execFileSync(
  'git',
  ['ls-files', '.github/workflows/*.yml', '.github/workflows/*.yaml'],
  { encoding: 'utf8' },
).trim().split('\n').filter(Boolean);

const exactTextContracts = new Map([
  ['.nvmrc', '22'],
  ['.node-version', '22'],
]);

const patternContracts = new Map([
  ['.npmrc', [/^engine-strict=true$/m, 'engine-strict=true']],
  ['.replit', [/^modules = \[[^\n]*"nodejs-22"[^\n]*\]$/m, 'nodejs-22 module']],
  ['.devcontainer/devcontainer.json', [/typescript-node:1-22-bookworm/, 'Node 22 devcontainer image']],
  ['.claude/skills/gstack/.github/docker/Dockerfile.ci', [/nodesource\.com\/setup_22\.x/, 'NodeSource 22 LTS installer']],
  ['app.yaml', [/^runtime:\s*nodejs22\s*$/m, 'nodejs22 runtime']],
  ['docs/validation/IQ-CORTEX-001-INSTALLATION_QUALIFICATION.md', [/Node\.js Runtime \| 22\.x LTS/, 'Node.js 22.x LTS IQ requirement']],
  ['docs/validation/IQ_OQ_EVIDENCE_PACK.md', [/declared `>=22\.0\.0 <23\.0\.0`/, 'Node.js 22-only declared runtime']],
  ['docs/validation/OQ-CORTEX-001-OPERATIONAL_QUALIFICATION.md', [/Application Server \| Node\.js 22\.x LTS/, 'Node.js 22.x LTS OQ requirement']],
  ['docs/beta/validation/IQ_TEMPLATE.md', [/Node\.js runtime\s+\| 22\.x LTS/, 'Node.js 22.x LTS IQ template requirement']],
  ['docs/architecture/CONCEPT2CURE_V3_ARCHITECTURE.md', [/Node\.js 22 LTS with/, 'Node.js 22 LTS migration prerequisite']],
  ['docs/guides/README_VAULT.md', [/Node\.js 22 LTS/, 'Node.js 22 LTS Vault prerequisite']],
]);

export function checkRuntimeContracts({ read = readText, workflows = trackedWorkflows() } = {}) {
  const errors = [];
  const packageJson = JSON.parse(read('package.json'));
  const lockJson = JSON.parse(read('package-lock.json'));
  if (packageJson.engines?.node !== NODE_ENGINE) {
    errors.push(`package.json: engines.node must equal ${NODE_ENGINE}`);
  }
  if (packageJson.engines?.npm !== '>=10.0.0') {
    errors.push('package.json: engines.npm must equal >=10.0.0');
  }
  if (lockJson.packages?.['']?.engines?.node !== NODE_ENGINE) {
    errors.push(`package-lock.json: root package engines.node must equal ${NODE_ENGINE}`);
  }
  if (lockJson.packages?.['']?.engines?.npm !== '>=10.0.0') {
    errors.push('package-lock.json: root package engines.npm must equal >=10.0.0');
  }

  for (const [path, expected] of exactTextContracts) {
    if (read(path).trim() !== expected) errors.push(`${path}: must contain only ${expected}`);
  }
  for (const [path, [pattern, description]] of patternContracts) {
    if (!pattern.test(read(path))) errors.push(`${path}: missing ${description}`);
  }

  const dockerfile = read('Dockerfile.optimized');
  const baseImages = [...dockerfile.matchAll(/^FROM\s+node:([^\s]+).*$/gm)].map((match) => match[1]);
  if (baseImages.length !== 2 || baseImages.some((image) => image !== '22-slim')) {
    errors.push('Dockerfile.optimized: builder and production stages must both use node:22-slim');
  }

  for (const path of workflows) {
    const content = read(path);
    const declaredEnv = [...content.matchAll(/^\s*NODE_VERSION:\s*['"]?([^'"\s#]+)['"]?/gm)]
      .map((match) => match[1]);
    if (declaredEnv.some((version) => version !== NODE_MAJOR)) {
      errors.push(`${path}: every NODE_VERSION must equal ${NODE_MAJOR}`);
    }
    const setupNodeUses = [...content.matchAll(/^\s*(?:-\s*)?uses:\s*actions\/setup-node@/gm)].length;
    const selectors = [...content.matchAll(/^\s*node-version:\s*['"]?([^'"\n#]+?)['"]?\s*(?:#.*)?$/gm)]
      .map((match) => match[1].trim());
    if (selectors.length !== setupNodeUses) {
      errors.push(`${path}: each actions/setup-node use must have exactly one Node ${NODE_MAJOR} selector`);
    }
    for (const selector of selectors) {
      const valid = selector === NODE_MAJOR || selector === '${{ env.NODE_VERSION }}';
      if (!valid) errors.push(`${path}: node-version selector ${JSON.stringify(selector)} must resolve to Node ${NODE_MAJOR}`);
      if (selector === '${{ env.NODE_VERSION }}' && !declaredEnv.includes(NODE_MAJOR)) {
        errors.push(`${path}: env.NODE_VERSION selector has no Node ${NODE_MAJOR} declaration`);
      }
    }
  }
  return errors;
}

function runSelfTest() {
  const originals = new Map();
  const read = (path) => originals.get(path) ?? readText(path);
  const cases = [
    ['package engine downgrade', 'package.json', (value) => value.replace(NODE_ENGINE, '>=20.0.0')],
    ['package engine broadening', 'package.json', (value) => value.replace(NODE_ENGINE, '>=22.0.0')],
    ['lockfile root downgrade', 'package-lock.json', (value) => value.replace(NODE_ENGINE, '>=20.0.0')],
    ['lockfile root broadening', 'package-lock.json', (value) => value.replace(NODE_ENGINE, '>=22.0.0')],
    ['version file downgrade', '.nvmrc', () => '20\n'],
    ['production container downgrade', 'Dockerfile.optimized', (value) => value.replace('FROM node:22-slim AS production', 'FROM node:20-slim AS production')],
    ['deployment runtime downgrade', 'app.yaml', (value) => value.replace('nodejs22', 'nodejs20')],
  ];
  for (const [name, path, mutate] of cases) {
    originals.set(path, mutate(readText(path)));
    if (checkRuntimeContracts({ read }).length === 0) throw new Error(`self-test missed ${name}`);
    originals.delete(path);
  }

  const workflow = '.github/workflows/ci.yml';
  originals.set(workflow, readText(workflow).replace("node-version: '22'", "node-version: '18'"));
  if (checkRuntimeContracts({ read, workflows: [workflow] }).length === 0) {
    throw new Error('self-test missed workflow downgrade below Node 20');
  }
  console.log(`Node runtime guard self-test passed: ${cases.length + 1} simulated drifts were rejected.`);
}

if (process.argv.includes('--self-test')) {
  runSelfTest();
} else {
  const errors = checkRuntimeContracts();
  if (errors.length) {
    console.error('Node runtime contract violations:\n' + errors.map((error) => `- ${error}`).join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`Node runtime contracts are pinned to Node ${NODE_MAJOR} (${patternContracts.size + exactTextContracts.size + 4} fixed surfaces plus active workflows).`);
  }
}
