#!/usr/bin/env node
/** D2/A2.9: canonical intake owns program creation; PM inserts are bounded. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const WRITER_OWNERS = [
  { file: 'server/routes/c2c/projects.ts', table: 'regulatory_programs', count: 1,
    reason: 'Canonical POST /api/c2c/projects: validated human intake, quota and atomic accepted PM anchor.' },
  { file: 'server/services/c2c/program-project-anchor.ts', table: 'projects', count: 1,
    reason: 'The canonical intake transaction creates its one same-organization/client PM anchor here.' },
  { file: 'server/services/atomicQuotaService.js', table: 'projects', count: 1,
    reason: 'Explicit A2.9 deferral: internal quota writer remains until its remaining consumers are traced; no HTTP creator is retained.' },
  { file: 'server/services/rules-engine/actions/index.ts', table: 'projects', count: 1,
    reason: 'Explicit A2.9 deferral: create_child_project rule action requires separate tracing, not an admission for another route.' },
];
const TABLE_NAMES = new Map([
  ['projects', 'projects'], ['regulatoryPrograms', 'regulatory_programs'],
  ['regulatory_programs', 'regulatory_programs'],
]);
export const RETIRED_CREATORS = new Map([
  ['server/routes/concept2cure.ts', ['/projects', '/projects/:id/duplicate']],
  ['server/routes/device-projects.ts', ['/']],
  ['server/routes/projects-management.ts', ['/']],
  ['server/routes/project-hierarchy.ts', ['/:projectId/children']],
  ['server/bootstrap/register-advanced-platform-routes.ts', ['/api/workspace/projects']],
  ['server/routes/ctd-onboarding.ts', ['/projects']],
  ['server/routes/ana-platform-control.ts', ['/projects', '/onboard', '/execute']],
  ['server/routes/program-journey.routes.ts', ['/', '/:id/stages/:stageId']],
]);

function unwrap(node) {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)
    || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node))) node = node.expression;
  return node;
}

function tableName(value) {
  const name = value.replace(/^public\./i, '').replace(/["`]/g, '');
  return TABLE_NAMES.get(name) ?? TABLE_NAMES.get(name.toLowerCase());
}

function importBindings(source) {
  const bindings = new Map(TABLE_NAMES);
  for (const node of source.statements) {
    if (!ts.isImportDeclaration(node)) continue;
    const named = node.importClause?.namedBindings;
    if (!named || !ts.isNamedImports(named)) continue;
    for (const item of named.elements) {
      const table = tableName((item.propertyName ?? item.name).text);
      if (table) bindings.set(item.name.text, table);
    }
  }
  return bindings;
}

function expressionTable(node, bindings) {
  node = unwrap(node);
  if (!node) return undefined;
  if (ts.isIdentifier(node)) return bindings.get(node.text);
  if (ts.isPropertyAccessExpression(node)) return tableName(node.name.text);
  if (ts.isStringLiteralLike(node)) return tableName(node.text);
  return undefined;
}

function learnBinding(node, bindings) {
  if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name) || !node.initializer) return;
  let table = expressionTable(node.initializer, bindings);
  const initializer = unwrap(node.initializer);
  if (ts.isCallExpression(initializer)) {
    const callee = initializer.expression;
    const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : '';
    if (['pgTable', 'table'].includes(name)) table = expressionTable(initializer.arguments[0], bindings);
  }
  if (table) bindings.set(node.name.text, table);
}

function sqlText(node) {
  if (ts.isParenthesizedExpression(node)) return sqlText(node.expression);
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map(span => ` __expression__ ${span.literal.text}`).join('');
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) return sqlText(node.left) + sqlText(node.right);
  return ' __expression__ ';
}

function partOfConcatenation(node) {
  let parent = node.parent;
  while (parent && ts.isParenthesizedExpression(parent)) parent = parent.parent;
  return parent && ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.PlusToken;
}

/** Scan executable literal/ORM syntax, excluding source comments. */
export function findProjectInserts(text, file = 'server/example.ts') {
  if (!/\binsert(?:Into)?\b/i.test(text)) return [];
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const bindings = importBindings(source);
  const sites = [];
  function add(node, table, kind) {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    sites.push({ file, line: line + 1, table, kind });
  }
  function visit(node) {
    learnBinding(node, bindings);
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const verb = node.expression.name.text;
      if (['insert', 'insertInto'].includes(verb)) {
        const table = expressionTable(node.arguments[0], bindings);
        if (table) add(node, table, 'ORM');
      }
    }
    const sqlExpression = ts.isStringLiteralLike(node) || ts.isTemplateExpression(node)
      || (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken);
    if (sqlExpression && !partOfConcatenation(node)) {
      const sql = sqlText(node).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
      for (const match of sql.matchAll(/\bINSERT\s+INTO\s+(?:ONLY\s+)?(?:(?:"public"|public)\s*\.\s*)?["`]?([a-z_]+)["`]?\b/gi)) {
        const table = tableName(match[1]);
        if (table) add(node, table, 'SQL');
      }
      if (ts.isTemplateExpression(node) && /\bINSERT\s+INTO\s*$/i.test(node.head.text)) {
        const table = expressionTable(node.templateSpans[0]?.expression, bindings);
        if (table) add(node, table, 'SQL');
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return sites;
}

export function checkProjectWriterOwners(sites, owners = WRITER_OWNERS) {
  const problems = [];
  for (const owner of owners) {
    if (!owner.reason?.trim() || !Number.isInteger(owner.count) || owner.count !== 1) {
      problems.push(`Invalid owner exception: ${owner.file} (${owner.table}); one site and a reason required.`);
    }
    const count = sites.filter(site => site.file === owner.file && site.table === owner.table).length;
    if (count !== owner.count) problems.push(`${owner.file}: ${owner.table} expected ${owner.count} writer, found ${count}; update the explicit owner inventory if one is retired.`);
  }
  for (const site of sites) {
    if (!owners.some(owner => owner.file === site.file && owner.table === site.table)) {
      problems.push(`${site.file}:${site.line}: alternate ${site.table} ${site.kind} writer; use Projects → POST /api/c2c/projects.`);
    }
  }
  return problems;
}

function productionServerFiles(root) {
  return execFileSync('git', ['ls-files', '-z', '--', 'server'], { cwd: root, encoding: 'utf8' }).split('\0')
    .filter(file => /\.(?:[cm]?js|tsx?)$/.test(file))
    .filter(file => !/(?:^|\/)(?:__tests__|fixtures)\//.test(file) && !/\.(?:test|spec|dbtest)\.[cm]?[jt]sx?$/.test(file));
}

export function repositoryProjectWriters(root = ROOT) {
  return productionServerFiles(root).flatMap(file => findProjectInserts(readFileSync(path.join(root, file), 'utf8'), file));
}

function memberName(node) {
  node = unwrap(node);
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(unwrap(node.argumentExpression))) return unwrap(node.argumentExpression).text;
  return '';
}

/** The workspace creator wrote other stores, so a PM-only insert scan is insufficient. */
export function findRetiredCreatorRegistrations(text, file) {
  const paths = RETIRED_CREATORS.get(file);
  if (!paths) return [];
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const sites = [];
  function visit(node) {
    if (ts.isCallExpression(node) && memberName(node.expression) === 'post') {
      let argument = unwrap(node.arguments[0]);
      const receiver = unwrap(node.expression).expression;
      if (receiver && ts.isCallExpression(receiver) && memberName(receiver.expression) === 'route') argument = unwrap(receiver.arguments[0]);
      if (argument && ts.isStringLiteralLike(argument) && paths.includes(argument.text)) {
        sites.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}: retired POST ${argument.text}; use Projects -> POST /api/c2c/projects.`);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return sites;
}

export function repositoryRetiredCreatorRegistrations(root = ROOT) {
  return [...RETIRED_CREATORS.keys()].flatMap(file => findRetiredCreatorRegistrations(readFileSync(path.join(root, file), 'utf8'), file));
}

export function projectCreationOwnerSelfTest() {
  const bad = [
    "db.query('INSERT INTO regulatory_programs (id) VALUES ($1)')",
    'db.query(`INSERT\n INTO "public"."projects" (name) VALUES (${name})`)',
    'db.insert(projects).values({name})',
    "import { projects as pm } from './schema'; db.insert(pm).values({name})",
    "import * as schema from './schema'; db.insert(schema.regulatoryPrograms).values({name})",
    "import {projects as pm} from './schema'; const target=pm; db.insert(target).values({})",
    "db.insertInto('public.projects').values({})",
    "const p = pgTable('projects', {}); db.insert(p).values({})",
    "db.query('INSERT INTO PROJECTS (name) VALUES ($1)')",
    "db.query('INSERT /* owner */ INTO public.projects (name) VALUES ($1)')",
    "db.query('INSERT INTO ' + 'projects (name) VALUES ($1)')",
    'db.execute(sql`INSERT INTO ${schema.regulatoryPrograms} (id) VALUES (${id})`)',
    'db.insert(projects as any).values({})',
    'db.insert((projects)).values({})',
    'db.insert(projects!).values({})',
    'db.insert(projects satisfies unknown).values({})',
    'const pm = projects as any; db.insert(pm).values({})',
    'db.insert(<typeof projects>projects).values({})',
    "db.query('INSERT INTO ONLY projects (name) VALUES ($1)')",
  ];
  const good = [
    '// db.insert(projects).values({name})',
    '/* INSERT INTO projects (name) VALUES (x) */',
    "db.query('SELECT id FROM projects WHERE organization_id=$1')",
    "db.query('INSERT INTO project_sections (project_id) VALUES ($1)')",
    'db.insert(projectMembership).values({projectId})',
  ];
  for (const source of bad) {
    const sites = findProjectInserts(source);
    if (!sites.length || !checkProjectWriterOwners(sites, []).length) throw new Error(`Missed planted writer: ${source}`);
  }
  for (const source of good) if (findProjectInserts(source).length) throw new Error(`Flagged a read/comment: ${source}`);
  const sites = WRITER_OWNERS.map(owner => ({ ...owner, line: 1, kind: 'SQL' }));
  if (checkProjectWriterOwners(sites).length) throw new Error('Rejected the four explicit owners.');
  if (!checkProjectWriterOwners([...sites, sites[0]]).length) throw new Error('An owner file gained a writer undetected.');
  if (!checkProjectWriterOwners(sites.slice(1)).length) throw new Error('A stale freed owner slot was accepted.');
  if (!checkProjectWriterOwners(sites, WRITER_OWNERS.map(owner => ({ ...owner, reason: '' }))).length) throw new Error('Unreasoned exceptions accepted.');
  const file = 'server/bootstrap/register-advanced-platform-routes.ts';
  for (const source of ["app.post('/api/workspace/projects', h)", "app['post']('/api/workspace/projects', h)", "app.route('/api/workspace/projects').post(h)"]) {
    if (findRetiredCreatorRegistrations(source, file).length !== 1) throw new Error('Missed retired workspace creator.');
  }
  if (findRetiredCreatorRegistrations("app.get('/api/workspace/projects', h); app.post('/api/unrelated', h)", file).length) throw new Error('Flagged retained GET or unrelated POST.');
  return { planted: bad.length, readsAndComments: good.length, owners: sites.length };
}

function main() {
  if (process.argv.includes('--self-test')) {
    console.log('[ci:project-creation-owners:selftest] OK', projectCreationOwnerSelfTest());
    return;
  }
  const sites = repositoryProjectWriters();
  const problems = [...checkProjectWriterOwners(sites), ...repositoryRetiredCreatorRegistrations()];
  if (problems.length) {
    console.error(`[ci:project-creation-owners] FAILED\n${problems.join('\n')}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[ci:project-creation-owners] OK — one canonical program writer and three explicit, bounded PM writers (${sites.length} sites).`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
