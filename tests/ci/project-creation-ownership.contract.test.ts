/** D2 A2.9: one canonical project creator; narrowly named retained anchor owners. */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
type Table = 'projects' | 'regulatory_programs';
interface InsertSite { file: string; line: number; table: Table }
interface Owner { file: string; table: Table; count: number; reason: string }

const OWNERS: readonly Owner[] = [
  { file: 'server/routes/c2c/projects.ts', table: 'regulatory_programs', count: 1,
    reason: 'Canonical Projects wizard/API creates the program, scaffold, accepted anchor and audit.' },
  { file: 'server/services/c2c/program-project-anchor.ts', table: 'projects', count: 1,
    reason: 'Canonical accepted program-to-project anchor writer; not a parallel intake flow.' },
  { file: 'server/services/rules-engine/actions/index.ts', table: 'projects', count: 1,
    reason: 'Existing create_child_project rule action explicitly retained by A2.9 pending its own functional/caller trace.' },
  { file: 'server/services/atomicQuotaService.js', table: 'projects', count: 1,
    reason: 'Existing atomic quota writer explicitly retained by A2.9 pending its own functional/caller trace.' },
];

const RETIRED_POSTS = [
  ['server/routes/concept2cure.ts', '/projects'],
  ['server/routes/concept2cure.ts', '/projects/:id/duplicate'],
  ['server/routes/device-projects.ts', '/'],
  ['server/routes/projects-management.ts', '/'],
  ['server/routes/project-hierarchy.ts', '/:projectId/children'],
  ['server/bootstrap/register-advanced-platform-routes.ts', '/api/workspace/projects'],
  ['server/routes/ctd-onboarding.ts', '/projects'],
  ['server/routes/ana-platform-control.ts', '/projects'],
  ['server/routes/ana-platform-control.ts', '/onboard'],
  ['server/routes/ana-platform-control.ts', '/execute'],
  ['server/routes/program-journey.routes.ts', '/'],
  ['server/routes/program-journey.routes.ts', '/:id/stages/:stageId'],
] as const;

const RETAINED_ROUTES = [
  ['server/routes/concept2cure.ts', 'get', '/projects'],
  ['server/routes/concept2cure.ts', 'get', '/projects/:id'],
  ['server/routes/concept2cure.ts', 'put', '/projects/:id'],
  ['server/routes/device-projects.ts', 'get', '/'],
  ['server/routes/device-projects.ts', 'put', '/:id'],
  ['server/routes/device-projects.ts', 'delete', '/:id'],
  ['server/routes/projects-management.ts', 'get', '/'],
  ['server/routes/projects-management.ts', 'patch', '/:projectId'],
  ['server/routes/project-hierarchy.ts', 'get', '/:projectId/children'],
  ['server/routes/project-hierarchy.ts', 'patch', '/:projectId/move'],
  ['server/bootstrap/register-advanced-platform-routes.ts', 'get', '/api/workspace/projects'],
  ['server/routes/ctd-onboarding.ts', 'get', '/projects'],
  ['server/routes/ctd-onboarding.ts', 'post', '/projects/:id/upload'],
  ['server/routes/program-journey.routes.ts', 'get', '/'],
  ['server/routes/ana-platform-control.ts', 'get', '/capabilities'],
  ['server/routes/ana-platform-control.ts', 'patch', '/settings'],
  ['server/routes/ana-platform-control.ts', 'patch', '/projects/:projectId'],
] as const;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return ['__tests__', '__fixtures__', 'node_modules'].includes(entry.name) ? [] : sourceFiles(full);
    return /\.[cm]?[jt]sx?$/.test(entry.name) && !/\.(test|spec)\.[cm]?[jt]sx?$|\.d\.ts$/.test(entry.name) ? [full] : [];
  });
}

const tableFor = (name: string): Table | null => name === 'projects' ? 'projects' : ['regulatoryPrograms', 'regulatory_programs'].includes(name) ? 'regulatory_programs' : null;
const parse = (file: string, text: string) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const member = (node: ts.Expression): string | null => ts.isPropertyAccessExpression(node) ? node.name.text
  : ts.isElementAccessExpression(node) && node.argumentExpression && ts.isStringLiteral(node.argumentExpression) ? node.argumentExpression.text : null;

function tableExpression(node: ts.Expression, aliases: Map<string, Table>): Table | null {
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) return tableExpression(node.expression, aliases);
  if (ts.isIdentifier(node)) return aliases.get(node.text) ?? tableFor(node.text);
  const name = member(node);
  return name === null ? null : tableFor(name);
}

function rememberAlias(node: ts.Node, aliases: Map<string, Table>): void {
  if (ts.isImportSpecifier(node)) {
    const table = tableFor(node.propertyName?.text ?? node.name.text);
    if (table) aliases.set(node.name.text, table);
  }
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
    const table = tableExpression(node.initializer, aliases);
    if (table) aliases.set(node.name.text, table);
  }
}

/** AST ignores comments; actual SQL strings retain statement/case/schema variants. */
function insertSites(file: string, text: string): InsertSite[] {
  const source = parse(file, text);
  const sites: InsertSite[] = [];
  const aliases = new Map<string, Table>();
  const add = (node: ts.Node, table: Table) => sites.push({ file, table, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
  const sql = (node: ts.Node, value: string) => {
    const uncommented = value.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
    for (const match of uncommented.matchAll(/\binsert\s+into\s+(?:only\s+)?(?:"?public"?\s*\.\s*)?"?(regulatory_programs|projects)"?(?=\s|\(|$)/gi)) {
      add(node, match[1].toLowerCase() as Table);
    }
  };
  const visit = (node: ts.Node) => {
    rememberAlias(node, aliases);
    if (ts.isCallExpression(node) && member(node.expression) === 'insert' && node.arguments[0]) {
      const table = tableExpression(node.arguments[0], aliases);
      if (table) add(node, table);
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) sql(node, node.text);
    if (ts.isTemplateExpression(node)) {
      sql(node, node.head.text + node.templateSpans.map(span => (tableExpression(span.expression, aliases) ?? ' __value__ ') + span.literal.text).join(''));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return sites;
}

function ownershipProblems(sites: readonly InsertSite[], owners: readonly Owner[] = OWNERS): string[] {
  const issues = sites.filter(site => !owners.some(owner => owner.file === site.file && owner.table === site.table))
    .map(site => `Unowned ${site.table} insert: ${site.file}:${site.line}`);
  for (const owner of owners) {
    if (!owner.reason.trim()) issues.push(`Missing owner reason: ${owner.file}`);
    const actual = sites.filter(site => owner.file === site.file && owner.table === site.table).length;
    if (actual !== owner.count) issues.push(`${owner.file} ${owner.table}: expected ${owner.count} insert, found ${actual}`);
  }
  return issues;
}

function routePath(call: ts.CallExpression): string | null {
  const first = call.arguments[0];
  if (first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))) return first.text;
  const receiver = ts.isPropertyAccessExpression(call.expression) || ts.isElementAccessExpression(call.expression) ? call.expression.expression : null;
  return receiver && ts.isCallExpression(receiver) && member(receiver.expression) === 'route' ? routePath(receiver) : null;
}

function registeredPaths(file: string, text: string, method = 'post'): string[] {
  const paths: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && member(node.expression) === method) {
      const endpoint = routePath(node);
      if (endpoint !== null) paths.push(endpoint);
    }
    ts.forEachChild(node, visit);
  };
  visit(parse(file, text));
  return paths;
}

const SHIPPED_SITES = sourceFiles(path.join(ROOT, 'server')).flatMap(file => insertSites(path.relative(ROOT, file), fs.readFileSync(file, 'utf8')));

describe('canonical project-creation ownership', () => {
  it('holds all program/project inserts to explicit owners and exact site counts', () => {
    expect(ownershipProblems(SHIPPED_SITES)).toEqual([]);
  });

  it.each(RETIRED_POSTS)('retires the alternate POST in %s at %s', (file, endpoint) => {
    expect(registeredPaths(file, fs.readFileSync(path.join(ROOT, file), 'utf8')), `${file} POST ${endpoint}`).not.toContain(endpoint);
  });

  it.each(RETAINED_ROUTES)('retains the existing %s %s %s outcome', (file, method, endpoint) => {
    expect(registeredPaths(file, fs.readFileSync(path.join(ROOT, file), 'utf8'), method)).toContain(endpoint);
  });
});

describe('ownership detector refuses deliberately planted regressions', () => {
  it.each([
    'db.query(`INSERT INTO regulatory_programs (id) VALUES ($1)`);',
    'db.query(`insert\n INTO "public" . "projects" (id) VALUES ($1)`);',
    'db.insert(schema.projects).values({});',
    'import { projects as legacy } from "./schema"; db.insert(legacy).values({});',
    'import { regulatoryPrograms as programs } from "./schema"; db.insert(programs).values({});',
    'const p = schema.projects; db["insert"](p).values({});',
    'db.query(sql`INSERT INTO ${schema.projects} (id) VALUES (${id})`);',
  ])('detects an inserted writer: %s', text => {
    const sites = insertSites('server/routes/planted.ts', text);
    expect(sites).toHaveLength(1);
    expect(ownershipProblems(sites, [])).toHaveLength(1);
  });

  it('refuses an extra insert even in an existing allowed owner', () => {
    const owner = OWNERS[1];
    const one = insertSites(owner.file, 'db.query(`INSERT INTO projects (id) VALUES ($1)`);');
    expect(ownershipProblems(one, [owner])).toEqual([]);
    expect(ownershipProblems([...one, ...one], [owner])).toEqual([`${owner.file} projects: expected 1 insert, found 2`]);
  });

  it('refuses an owner without its stated reason', () => {
    const owner = { ...OWNERS[1], reason: ' ' };
    const site = insertSites(owner.file, 'db.insert(projects).values({});');
    expect(ownershipProblems(site, [owner])).toEqual([`Missing owner reason: ${owner.file}`]);
  });

  it('ignores source/SQL comments and unrelated stores rather than weakening the ownership check', () => {
    expect(insertSites('server/service.ts', '// db.insert(projects)\n/* INSERT INTO regulatory_programs (id) */\ndb.query(`-- INSERT INTO projects (id)\nSELECT 1`); db.insert(projectSections);')).toEqual([]);
    expect(registeredPaths('server/router.ts', '// router.post("/projects", handler)\nrouter.get("/projects", handler);')).toEqual([]);
    expect(registeredPaths('server/router.ts', 'router.route("/projects").post(handler); router["post"](`/children`, handler);')).toEqual(['/projects', '/children']);
  });
});
