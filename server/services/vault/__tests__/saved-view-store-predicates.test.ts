/**
 * saved_precedent_queries holds two kinds of row: precedent searches (surface
 * 'precedent') and Vault saved views (surface 'vault', P-46), some of them a
 * person's own. Inside an organisation nothing in the database separates them,
 * so the separation is a literal predicate in every statement
 * (docs/design/VAULT_SAVED_VIEWS_2026-10-29.md §3.1, test T4).
 *
 * This guard holds that mechanically:
 *  - only the files allowed below may name the table;
 *  - in the precedent router, every read, update and delete chain carries
 *    eq(savedPrecedentQueries.surface, 'precedent'), and every insert names
 *    surface: 'precedent';
 *  - in the Vault module (once it exists), every SQL literal naming the table
 *    carries the organisation, the surface and the owner arm.
 * The selftest runs the same checker on fixtures that each drop one predicate.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const PRECEDENT_ROUTER = 'server/routes/saved-precedent-queries.ts';
const VAULT_MODULE = 'server/services/vault/vault-saved-views.ts';
const ALLOWED = new Set([
  PRECEDENT_ROUTER,
  VAULT_MODULE,
  // An existence probe, no rows read.
  'server/services/mdx-health.service.ts',
  // The tenant purge, by organisation.
  'server/services/tenant/tenant-offboarding.ts',
]);
const NAMES = /\bsaved_precedent_queries\b|\bsavedPrecedentQueries\b/;

/** Each Drizzle chain on the table, from the call to the end of its statement. */
function precedentRouterProblems(src: string): string[] {
  const problems: string[] = [];
  for (const m of src.matchAll(/\.(select\([^)]*\)\s*\.from|update|delete|insert)\(\s*savedPrecedentQueries\s*\)/g)) {
    const end = src.indexOf(';', m.index!);
    const chain = src.slice(m.index!, end === -1 ? undefined : end);
    const kind = m[1].startsWith('select') ? 'select' : m[1];
    if (kind === 'insert') {
      if (!/surface:\s*'precedent'/.test(chain)) problems.push(`insert without surface: 'precedent'`);
    } else if (!/eq\(savedPrecedentQueries\.surface,\s*'precedent'\)/.test(chain)) {
      problems.push(`${kind} without eq(savedPrecedentQueries.surface, 'precedent')`);
    }
  }
  return problems;
}

/** Each SQL literal naming the table in the Vault module. */
function vaultModuleProblems(src: string): string[] {
  const problems: string[] = [];
  for (const m of src.matchAll(/`([^`]*saved_precedent_queries[^`]*)`/g)) {
    const sql = m[1];
    const verb = (/^\s*(SELECT|UPDATE|DELETE|INSERT|WITH)/i.exec(sql)?.[1] ?? 'SQL').toUpperCase();
    if (!/organization_id\s*=\s*\$/.test(sql)) problems.push(`${verb} without organization_id = $n`);
    if (!/surface\s*=\s*'vault'/.test(sql) && verb !== 'INSERT') problems.push(`${verb} without surface = 'vault'`);
    if (verb === 'INSERT' && !/'vault'/.test(sql)) problems.push(`INSERT without surface 'vault'`);
    if (verb !== 'INSERT' && !/user_id\s*=\s*\$/.test(sql)) problems.push(`${verb} without the owner arm (user_id = $n)`);
    if ((verb === 'SELECT' || verb === 'WITH') && !/visibility\s*=\s*'org_public'\s*OR/.test(sql)) problems.push(`${verb} without visibility = 'org_public' OR …`);
  }
  return problems;
}

function serverFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['__tests__', '__mocks__', 'node_modules'].includes(e.name)) serverFiles(p, out); }
    else if (/\.(ts|js|mjs)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) out.push(p.split(path.sep).join('/'));
  }
  return out;
}

describe('one store, two kinds of row, separated in every statement', () => {
  it('only the allowed files name the table', () => {
    const offenders = serverFiles('server').filter((f) => !ALLOWED.has(f) && NAMES.test(fs.readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('every precedent statement is predicated on surface = precedent', () => {
    const src = fs.readFileSync(PRECEDENT_ROUTER, 'utf8');
    // Four chains: list, create, update, delete.
    expect(src.match(/\.(select\([^)]*\)\s*\.from|update|delete|insert)\(\s*savedPrecedentQueries\s*\)/g)?.length).toBe(4);
    expect(precedentRouterProblems(src)).toEqual([]);
  });

  it('every Vault statement carries the organisation, the surface and the owner arm', () => {
    if (!fs.existsSync(VAULT_MODULE)) return; // R1: the Vault routes are not built yet.
    expect(vaultModuleProblems(fs.readFileSync(VAULT_MODULE, 'utf8'))).toEqual([]);
  });
});

describe('selftest: the checker reports each missing predicate', () => {
  it('in the precedent router', () => {
    expect(precedentRouterProblems(`db.select(COLS).from(savedPrecedentQueries).where(eq(savedPrecedentQueries.organizationId, o));`))
      .toEqual([`select without eq(savedPrecedentQueries.surface, 'precedent')`]);
    expect(precedentRouterProblems(`db.update(savedPrecedentQueries).set(u).where(and(eq(savedPrecedentQueries.id, i)));`))
      .toEqual([`update without eq(savedPrecedentQueries.surface, 'precedent')`]);
    expect(precedentRouterProblems(`db.delete(savedPrecedentQueries).where(eq(savedPrecedentQueries.id, i));`))
      .toEqual([`delete without eq(savedPrecedentQueries.surface, 'precedent')`]);
    expect(precedentRouterProblems(`db.insert(savedPrecedentQueries).values({ organizationId: o, label });`))
      .toEqual([`insert without surface: 'precedent'`]);
    expect(precedentRouterProblems(`db.select().from(savedPrecedentQueries).where(and(eq(savedPrecedentQueries.surface, 'precedent')));`)).toEqual([]);
  });

  it('in the Vault module', () => {
    expect(vaultModuleProblems("q(`SELECT * FROM saved_precedent_queries WHERE surface = 'vault' AND (visibility = 'org_public' OR user_id = $2)`)"))
      .toEqual(['SELECT without organization_id = $n']);
    expect(vaultModuleProblems("q(`SELECT * FROM saved_precedent_queries WHERE organization_id = $1 AND (visibility = 'org_public' OR user_id = $2)`)"))
      .toEqual([`SELECT without surface = 'vault'`]);
    expect(vaultModuleProblems("q(`SELECT * FROM saved_precedent_queries WHERE organization_id = $1 AND surface = 'vault' AND user_id = $2`)"))
      .toEqual([`SELECT without visibility = 'org_public' OR …`]);
    expect(vaultModuleProblems("q(`DELETE FROM saved_precedent_queries WHERE organization_id = $1 AND surface = 'vault' AND id = $3`)"))
      .toEqual(['DELETE without the owner arm (user_id = $n)']);
    expect(vaultModuleProblems("q(`UPDATE saved_precedent_queries SET label = $4 WHERE organization_id = $1 AND surface = 'vault' AND id = $3 AND user_id = $2`)")).toEqual([]);
  });
});
