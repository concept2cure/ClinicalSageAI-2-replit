import assert from 'node:assert/strict';
import test from 'node:test';
import { approvedSqlPredicates } from './approved-sql-predicates.mjs';

const caller = 'server/services/csr/vault-source-input.ts';
const prelude = "import { vaultDataEligibleSql } from '../document-data-disposition/eligibility.js';\n";
const query = expression => 'q.query(`SELECT ${' + expression + '}`);';
const openings = source => [...source.matchAll(/\$\{/g)].map(match => match.index);
const classify = (body, path = caller, offsets) => {
  const source = prelude + body;
  return approvedSqlPredicates(path, source, offsets ?? openings(source));
};

test('proof retains exact source, builder, module, alias and counted opening', () => {
  const source = prelude + query("vaultDataEligibleSql('d')");
  const [proof] = approvedSqlPredicates(caller, source, openings(source));
  assert.equal(proof.builder, 'vaultDataEligibleSql');
  assert.equal(proof.module, '../document-data-disposition/eligibility.js');
  assert.equal(proof.alias, 'd');
  assert.equal(source.slice(proof.openingOffset, proof.openingOffset + 2), '${');
  assert.equal(source.slice(proof.expressionStart, proof.expressionEnd), "vaultDataEligibleSql('d')");
  assert.equal(proof.line, 2);
});

test('a valid AST call outside the raw regex count never creates a subtraction', () => {
  assert.deepEqual(classify(query("vaultDataEligibleSql('d')"), caller, []), []);
  assert.deepEqual(classify(query("vaultDataEligibleSql('d')"), caller, [1, 2, 3]), []);
});

test('duplicate counted offsets cannot subtract the same expression twice', () => {
  const source = prelude + query("vaultDataEligibleSql('d')");
  assert.equal(approvedSqlPredicates(caller, source, [...openings(source), ...openings(source)]).length, 1);
});

test('only a direct first argument to query receives proof', () => {
  assert.deepEqual(classify('const text = `SELECT ${vaultDataEligibleSql("d")}`; q.query(text);'), []);
  assert.deepEqual(classify('q.other(`SELECT ${vaultDataEligibleSql("d")}`);'), []);
  assert.deepEqual(classify('q.query("SELECT $1", `SELECT ${vaultDataEligibleSql("d")}`);'), []);
});

test('caller paths are exact and do not normalize alternative paths into approval', () => {
  for (const path of ['server/services/csr/other.ts', './' + caller, caller.replaceAll('/', '\\'), 'server/services/csr/../csr/vault-source-input.ts']) {
    assert.deepEqual(classify(query("vaultDataEligibleSql('d')"), path), []);
  }
});

for (const expression of [
  'vaultDataEligibleSql(alias)', 'vaultDataEligibleSql(req.body.alias)',
  'vaultDataEligibleSql("s")', 'vaultDataEligibleSql("d.x")',
  'vaultDataEligibleSql("d; SELECT 1")', 'vaultDataEligibleSql(`d`)',
  'vaultDataEligibleSql("\\x64")', 'vaultDataEligibleSql("d", req.body.x)',
  'vaultDataEligibleSql(...["d"])', 'vaultDataEligibleSql?.("d")',
  'vaultDataEligibleSql<string>("d")', 'vaultDataEligibleSql.call(null, "d")',
  '(vaultDataEligibleSql)("d")', '(vaultDataEligibleSql("d"))',
  'String(vaultDataEligibleSql("d"))', 'vaultDataEligibleSql("d") + req.query.x',
]) {
  test(`unproved expression remains counted: ${expression}`, () => {
    assert.deepEqual(classify(query(expression)), []);
  });
}

test('named import aliases and specifier-level type-only imports fail closed', () => {
  for (const declaration of [
    "import { vaultDataEligibleSql as safe } from '../document-data-disposition/eligibility.js';",
    "import { type vaultDataEligibleSql } from '../document-data-disposition/eligibility.js';",
    "import * as vaultDataEligibleSql from '../document-data-disposition/eligibility.js';",
    "import vaultDataEligibleSql from '../document-data-disposition/eligibility.js';",
  ]) {
    const source = declaration + query('vaultDataEligibleSql("d")');
    assert.deepEqual(approvedSqlPredicates(caller, source, openings(source)), []);
  }
});

test('catch/function/declaration shadowing cannot borrow another scope import proof', () => {
  for (const body of [
    'try {} catch (vaultDataEligibleSql) { ' + query('vaultDataEligibleSql("d")') + ' }',
    'function f(vaultDataEligibleSql) { ' + query('vaultDataEligibleSql("d")') + ' }',
    '{ function vaultDataEligibleSql() { return req.query.x; } ' + query('vaultDataEligibleSql("d")') + ' }',
    '{ const { helper: vaultDataEligibleSql } = req.body; ' + query('vaultDataEligibleSql("d")') + ' }',
  ]) assert.deepEqual(classify(body), []);
});

test('malformed syntax receives no partial parser proof', () => {
  assert.deepEqual(classify(query('vaultDataEligibleSql("d")') + '\nfunction broken( {'), []);
});

test('multiple actual template spans retain their own opening offsets', () => {
  const source = prelude + 'q.query(`SELECT ${vaultDataEligibleSql("d")} AND ${req.body.x} AND ${vaultDataEligibleSql("d")}`);';
  const proofs = approvedSqlPredicates(caller, source, openings(source));
  assert.deepEqual(proofs.map(proof => proof.openingOffset), [openings(source)[0], openings(source)[2]]);
});

test('query type arguments and trivia do not change the import binding proof', () => {
  const source = prelude + 'q.query<Row>(`SELECT ${ /* reviewed */ vaultDataEligibleSql("d")}`);';
  assert.equal(approvedSqlPredicates(caller, source, openings(source)).length, 1);
});

test('a nested backtick cannot make a later uncounted expression eligible', () => {
  const source = prelude + 'q.query(`SELECT ${req.body.x ?? `fallback`} AND ${vaultDataEligibleSql("d")}`);';
  const legacyCounted = [openings(source)[0]];
  assert.deepEqual(approvedSqlPredicates(caller, source, legacyCounted), []);
});

const contentCallers = ['server/services/figureGenerationService.ts', 'server/services/autoExtractionPipeline.ts', 'server/services/keywordExtractionService.ts'];
const contentImport = "import { artifactDataEligibleSql } from './document-data-disposition/eligibility';\n";
for (const path of contentCallers) test(`content eligibility proof is restricted to its exact caller, import and alias: ${path}`, () => {
  const source = contentImport + query("artifactDataEligibleSql('a')");
  const proofs = approvedSqlPredicates(path, source, openings(source));
  assert.equal(proofs.length, 1);assert.equal(proofs[0].alias, 'a');assert.equal(proofs[0].builder, 'artifactDataEligibleSql');
  for (const expression of ['artifactDataEligibleSql("d")', 'artifactDataEligibleSql(req.body.alias)', 'artifactDataEligibleSql("\\x61")', 'artifactDataEligibleSql("a") + req.query.x']) {
    const bad = contentImport + query(expression);assert.deepEqual(approvedSqlPredicates(path,bad,openings(bad)), []);
  }
  const shadowed = contentImport + 'function f(artifactDataEligibleSql) {' + query('artifactDataEligibleSql("a")') + '}';
  assert.deepEqual(approvedSqlPredicates(path,shadowed,openings(shadowed)),[]);
  const wrongModule = contentImport.replace("'./document-data-disposition/eligibility'", "'../document-data-disposition/eligibility.js'") + query('artifactDataEligibleSql("a")');
  assert.deepEqual(approvedSqlPredicates(path,wrongModule,openings(wrongModule)),[]);
  assert.deepEqual(approvedSqlPredicates(caller,source,openings(source)),[]);
});
