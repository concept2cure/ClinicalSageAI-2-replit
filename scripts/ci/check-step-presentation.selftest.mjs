#!/usr/bin/env node
/**
 * Self-test for ci:step-presentation (scripts/ci/check-step-presentation.mjs).
 *
 * On the real tree the gate reports OK, so its failure branches never fire in
 * normal use. A gate that has only ever been seen to pass has not been tested
 * (CLAUDE.md, working agreement). This shows each one firing, and the real
 * tree passing, through the same entry points CI uses:
 *
 *   1. the real tree passes (the CLI, exit 0);
 *   2. the real register with ONE in-scope entry's `present` deleted fails,
 *      naming that tool (MISSING) — through the exported check and through the
 *      CLI over a copy of the tree (exit 1);
 *   3. the real register with `source: 'engine'` given to a real tool whose
 *      handler calls a model (convene_drafting_council → multi-agent-council →
 *      the gateway) fails (ENGINE), naming the chain;
 *   4. a fixture tree of test doubles: `engine` on a double that calls the
 *      gateway directly, through a same-file helper, and through a dynamic
 *      import each fail; the same claim on a pure double passes (the control:
 *      without it, "everything is refused" would also make 4 pass);
 *   5. each structural rule fails on its own case: VERB, SOURCE, PREVIEW,
 *      OBJECT (a tool-like name), REFUSAL (a handler refusal labelled as the
 *      act), ENGINE on a writing class, and an engine claim with no handler;
 *   6. fail closed: a verb table the gate cannot read throws rather than
 *      passing every verb.
 *
 * Exit 0 when every case behaves; 1 otherwise, listing the ones that did not.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkStepPresentation, readClosedTables } from './check-step-presentation.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GATE = path.join(REPO, 'scripts', 'ci', 'check-step-presentation.mjs');
const REGISTER = 'server/services/ana/tool-authorization.register.json';
const INVENTORY = 'server/services/ana/ana-launch-scope.inventory.json';
const VERBS = 'shared/ana/step-verbs.ts';

const results = [];
function expectCase(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n        ${detail}` : ''}`);
}
const realRegister = () => JSON.parse(fs.readFileSync(path.join(REPO, REGISTER), 'utf8')).tools;
const realInventory = () => JSON.parse(fs.readFileSync(path.join(REPO, INVENTORY), 'utf8'));
const has = (findings, code, tool) => findings.some(f => f.code === code && f.tool === tool);
function runCli(root) {
  try {
    const out = execFileSync(process.execPath, [GATE, ...(root ? ['--root', root] : [])], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

// ── 1. the real tree passes ──────────────────────────────────────────────────
{
  const { code, out } = runCli();
  expectCase('1. the real tree passes (CLI exit 0)', code === 0, out.trim().split('\n')[0]);
}

// ── 2. one in-scope entry deleted ────────────────────────────────────────────
{
  const register = realRegister();
  const victim = 'search_project_documents';
  delete register[victim].present;
  const { findings } = checkStepPresentation(REPO, { register });
  expectCase(
    `2a. deleting the present entry of ${victim} fails MISSING, naming it`,
    has(findings, 'MISSING', victim) && findings.length === 1,
    findings.map(f => `${f.code} ${f.tool}: ${f.detail}`).join('; '),
  );

  // The same through the CLI, over a copy of the files the gate reads.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'step-presentation-'));
  for (const rel of [VERBS, INVENTORY]) {
    fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
    fs.copyFileSync(path.join(REPO, rel), path.join(tmp, rel));
  }
  const full = JSON.parse(fs.readFileSync(path.join(REPO, REGISTER), 'utf8'));
  delete full.tools[victim].present;
  // No engine claims in the copy: this case is about coverage, and the copy has no handlers.
  for (const e of Object.values(full.tools)) if (e.present?.source === 'engine') e.present.source = 'knowledge';
  fs.mkdirSync(path.dirname(path.join(tmp, REGISTER)), { recursive: true });
  fs.writeFileSync(path.join(tmp, REGISTER), JSON.stringify(full));
  const { code, out } = runCli(tmp);
  expectCase('2b. the CLI exits 1 on the same deletion', code === 1 && out.includes(`MISSING  ${victim}`), out.trim().split('\n').slice(0, 2).join(' | '));
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ── 3. engine on a real tool whose handler calls a model ─────────────────────
{
  const register = realRegister();
  const tool = 'convene_drafting_council';
  register[tool].present = { ...register[tool].present, source: 'engine' };
  const { findings } = checkStepPresentation(REPO, { register });
  const f = findings.find(x => x.tool === tool);
  expectCase(
    `3. source 'engine' on ${tool} (its handler calls a model) fails ENGINE`,
    f?.code === 'ENGINE' && /ai-gateway\/gateway\.ts/.test(f.detail) && findings.length === 1,
    f ? f.detail : 'no finding',
  );
}

// ── 4. a fixture tree of test doubles ────────────────────────────────────────
function fixtureTree(register, inScope) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'step-presentation-doubles-'));
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
    fs.writeFileSync(path.join(tmp, rel), text);
  };
  write(VERBS, fs.readFileSync(path.join(REPO, VERBS), 'utf8'));
  write('server/services/ai-gateway/gateway.ts', "export function getGateway() { return { route: async () => ({ content: '' }) }; }\n");
  write('scripts/ci/gateway-bypass-baseline.json', JSON.stringify({ entries: {} }));
  write('server/services/ana/pure-engine.ts', 'export const pureSum = (a: number, b: number) => a + b;\n');
  write(
    'server/services/ana/drafter.ts',
    "import { getGateway } from '../ai-gateway/gateway';\nexport async function draftWithModel() { return (await getGateway().route()).content; }\n",
  );
  write(
    'server/services/ana/fixture-tools.ts',
    [
      "import { getGateway } from '../ai-gateway/gateway';",
      "import { pureSum } from './pure-engine';",
      'declare function registerToolHandler(name: string, fn: (input: unknown) => Promise<string>): void;',
      'function helperThatCallsModel() { return getGateway().route(); }',
      "registerToolHandler('double_calls_model', async () => (await getGateway().route()).content);",
      "registerToolHandler('double_model_via_helper', async () => { await helperThatCallsModel(); return '{}'; });",
      "registerToolHandler('double_model_via_dynamic_import', async () => { const { draftWithModel } = await import('./drafter.js'); return draftWithModel(); });",
      "registerToolHandler('double_pure', async () => JSON.stringify({ n: pureSum(1, 2) }));",
      '',
    ].join('\n'),
  );
  write(REGISTER, JSON.stringify({ tools: register }));
  write(INVENTORY, JSON.stringify({ tools: { inScope, hiddenApp: [] } }));
  return tmp;
}
const engine = (verb = 'compute', object = 'the figure') => ({ class: 'read', writes: 'none', present: { verb, object, source: 'engine' } });
{
  const doubles = ['double_calls_model', 'double_model_via_helper', 'double_model_via_dynamic_import', 'double_pure'];
  const register = Object.fromEntries(doubles.map(n => [n, engine()]));
  const tmp = fixtureTree(register, doubles);
  const { findings } = checkStepPresentation(tmp);
  for (const n of doubles.slice(0, 3)) {
    const f = findings.find(x => x.tool === n);
    expectCase(`4. engine on ${n} fails ENGINE`, f?.code === 'ENGINE', f ? f.detail : 'no finding');
  }
  expectCase('4. control: engine on double_pure passes', !findings.some(f => f.tool === 'double_pure'));
  const { code } = runCli(tmp);
  expectCase('4. the CLI exits 1 on the doubles tree', code === 1);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ── 5. each structural rule on its own case ──────────────────────────────────
{
  const ok = (over = {}) => ({ class: 'read', writes: 'none', present: { verb: 'search', object: 'the Vault', source: 'vault', ...over } });
  const register = {
    good: ok(),
    bad_verb: ok({ verb: 'frobnicate' }),
    bad_source: ok({ source: 'the_internet' }),
    bad_preview: ok({ preview: ['document_id'] }),
    tool_like_object: ok({ object: 'the search_project_documents' }),
    empty_object: ok({ object: ' ' }),
    handler_refusal: { class: 'refuse', writes: 'none', refusedBy: 'handler', why: 'x', present: { verb: 'finalize', object: 'the protocol', source: 'authoring' } },
    engine_writes: { class: 'confirm', writes: 'INSERT x', present: { verb: 'compute', object: 'the figure', source: 'engine' } },
    engine_no_handler: engine(),
  };
  const tmp = fixtureTree(register, Object.keys(register));
  const { findings } = checkStepPresentation(tmp);
  const cases = [
    ['VERB', 'bad_verb'],
    ['SOURCE', 'bad_source'],
    ['PREVIEW', 'bad_preview'],
    ['OBJECT', 'tool_like_object'],
    ['OBJECT', 'empty_object'],
    ['REFUSAL', 'handler_refusal'],
    ['ENGINE', 'engine_writes'],
    ['ENGINE', 'engine_no_handler'],
  ];
  for (const [code, tool] of cases) expectCase(`5. ${code} fires on ${tool}`, has(findings, code, tool));
  expectCase('5. control: a well-formed entry has no finding', !findings.some(f => f.tool === 'good'));
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ── 6. fail closed ───────────────────────────────────────────────────────────
{
  let threw = false;
  try {
    readClosedTables('export const STEP_VERBS = {} as const;\nexport const STEP_SOURCES = { vault: "Vault" } as const;\nexport const STEP_PREVIEW_FIELDS = ["query"] as const;\n');
  } catch {
    threw = true;
  }
  expectCase('6. an unreadable or empty verb table throws, never passes every verb', threw);
  let threwInventory = false;
  try {
    checkStepPresentation(REPO, { inventory: { tools: { inScope: [] } } });
  } catch {
    threwInventory = true;
  }
  expectCase('6. an empty in-scope list throws, never passes', threwInventory);
}

const failed = results.filter(r => !r.ok);
console.log(`\nci:step-presentation:selftest — ${results.length - failed.length}/${results.length} cases behaved.`);
if (failed.length > 0) {
  console.error(`FAILED: ${failed.map(f => f.name).join('; ')}`);
  process.exit(1);
}
