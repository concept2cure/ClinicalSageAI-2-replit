'use strict';

// Contract tests for the existing AnA definition, not an agency filing or
// authenticated-chat integration test. Run at repository root with node --test.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require(process.env.C2C_TS_PATH || 'typescript');

const root = path.resolve(process.env.C2C_REPAIR_SOURCE_ROOT || process.cwd());
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const definitionPath = 'server/services/ana/bla-biologics-tool-defs.ts';
const taxonomyPath = 'shared/regulatory/document-taxonomy.ts';
const skillPath = 'server/services/ana/skills/library/submissions.ts';
const source = ts.createSourceFile(definitionPath, read(definitionPath), ts.ScriptTarget.Latest, true);
const taxonomy = ts.createSourceFile(taxonomyPath, read(taxonomyPath), ts.ScriptTarget.Latest, true);
const skillText = read(skillPath);

function canonicalValues(typeName) {
  const node = taxonomy.statements.find((n) => ts.isTypeAliasDeclaration(n) && n.name.text === typeName);
  assert.ok(node && ts.isUnionTypeNode(node.type), `Missing canonical union: ${typeName}`);
  return node.type.types.map((n) => {
    assert.ok(ts.isLiteralTypeNode(n) && ts.isStringLiteral(n.literal), `Nonliteral ${typeName} member`);
    return n.literal.text;
  });
}

function loadTool() {
  const declarations = source.statements.filter(ts.isVariableStatement)
    .flatMap((s) => Array.from(s.declarationList.declarations))
    .filter((d) => ts.isIdentifier(d.name) && d.name.text === 'RESOLVE_SUBMISSION_PLAN');
  assert.equal(declarations.length, 1, 'The existing planning definition must remain unique');
  const init = declarations[0].initializer;
  assert.ok(init && ts.isObjectLiteralExpression(init), 'Planning definition must be an object literal');
  const compiled = ts.transpileModule(`module.exports = ${init.getText(source)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true,
  });
  assert.deepEqual((compiled.diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error), []);
  const sandbox = { module: { exports: {} } };
  vm.runInNewContext(compiled.outputText, sandbox, { timeout: 1000 });
  // Normalize cross-realm objects. No model, handler, database or agency is called.
  return JSON.parse(JSON.stringify(sandbox.module.exports));
}

const tool = loadTool();
const schema = tool.input_schema;
const props = schema.properties;
const sorted = (values) => [...values].sort();
const method = skillText.split('\n').find((line) => line.startsWith('3. For ') && line.includes('resolve_submission_plan'));
assert.ok(method, 'Existing submission-planning skill method must be present');

test('product choices exactly match the existing canonical ProductClass union', () => {
  assert.deepEqual(sorted(props.productClass.enum), sorted(canonicalValues('ProductClass')));
  assert.equal(new Set(props.productClass.enum).size, props.productClass.enum.length);
});

test('family choices exactly match the existing canonical ApplicationFamily union', () => {
  assert.deepEqual(sorted(props.applicationFamily.enum), sorted(canonicalValues('ApplicationFamily')));
  assert.equal(new Set(props.applicationFamily.enum).size, props.applicationFamily.enum.length);
});

test('all previously exposed medicine product and family choices remain available', () => {
  for (const p of ['small_molecule', 'biologic', 'biosimilar', 'vaccine', 'atmp', 'generic', 'any'])
    assert.ok(props.productClass.enum.includes(p), `Lost product ${p}`);
  for (const f of ['clinical_trial', 'marketing_authorization', 'variation', 'renewal', 'supplement', 'pediatric', 'orphan'])
    assert.ok(props.applicationFamily.enum.includes(f), `Lost family ${f}`);
});

test('the existing eight-region selector and order are unchanged', () => {
  assert.deepEqual(props.regions.items.enum, ['US', 'EU', 'JP', 'UK', 'CA', 'CN', 'AU', 'CH']);
  for (const region of props.regions.items.enum) assert.ok(canonicalValues('Region').includes(region));
});

test('tool identity, field names and omitted-argument shape remain compatible', () => {
  assert.equal(tool.name, 'resolve_submission_plan');
  assert.equal(schema.type, 'object');
  assert.deepEqual(Object.keys(props), ['filingType', 'applicationFamily', 'productClass', 'regions']);
  assert.deepEqual(schema.required, []);
  for (const key of ['filingType', 'applicationFamily', 'productClass']) assert.equal(props[key].type, 'string');
  assert.equal(props.regions.type, 'array');
  assert.equal(props.regions.items.type, 'string');
});

test('the tool distinguishes registry candidates from legal equivalence', () => {
  assert.match(tool.description, /not legal equivalents/i);
  assert.match(tool.description, /selected registry filing in its own region/i);
  assert.doesNotMatch(tool.description, /asserting which.*fully supported/i);
});

test('the tool separates planning from readiness, entitlement, acceptance and authorization', () => {
  for (const term of ['project readiness', 'license entitlement', 'delivery acceptance', 'regulatory approval'])
    assert.ok(tool.description.includes(term), `Missing limitation: ${term}`);
  assert.match(tool.description, /does not authorize signing, release or transmission/i);
  assert.match(tool.description, /read-only/i);
});

test('the tool exposes returned support limitations instead of hiding a gap', () => {
  for (const term of ['missing', 'inactive', 'product-conflicting', 'portal-only', 'unconnected', 'unsupported', 'buildSupported', 'submitSupported', 'gaps', 'methodology'])
    assert.ok(tool.description.includes(term), `Missing instruction: ${term}`);
  assert.match(tool.description, /never substitute another filing/i);
  assert.match(props.productClass.description, /do not replace a specific class with any/i);
});

test('the skill preserves specific product settings and discloses comparison defaults', () => {
  for (const product of ['medical_device', 'ivd', 'combination_product', 'otc']) assert.ok(method.includes(product));
  assert.match(method, /ask when material settings are missing/i);
  assert.match(method, /If regions are omitted, disclose the US, EU and JP comparison default/i);
  assert.match(tool.description, /Omitted regions use the existing US, EU and JP comparison default; disclose that default/i);
});

test('the skill agrees with the tool about candidates, support gaps and human authorization', () => {
  for (const term of ['not legal equivalents', 'buildSupported', 'submitSupported', 'gaps', 'methodology', 'portal-only', 'unconnected', 'unsupported', 'no-compatible-filing'])
    assert.ok(method.includes(term), `Missing skill limitation: ${term}`);
  for (const term of ['project readiness', 'license entitlement', 'delivery acceptance', 'regulatory approval'])
    assert.ok(method.includes(term), `Missing skill limitation: ${term}`);
  assert.match(method, /does not authorize signing, release or transmission/i);
});
