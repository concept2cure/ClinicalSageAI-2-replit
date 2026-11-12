/**
 * eTMF convergence E4 step 5 (2026-11-12; founder decisions P-74, P-75, P-124): the second trial master file store
 * goes, with its service, its verdict, its schema and its migration's tables.
 *
 * Its two tables (a per-study "TMF file" and its artifacts with a typed status and no document) were created by
 * migrations/20260610_etmf.sql, which is on no deploy path: install-fresh's overlay created them on a new database, and
 * deploy-migrate never did. Steps 1-4 moved every caller onto the deployed store (tmf-artifact-persistence.ts) and
 * deleted its routes. What was left had no caller.
 *
 * This pins it:
 *   - the service and the schema model are gone, and the schema index no longer exports one;
 *   - the migration creates nothing, and says why in its own header (RULE 1: amended in place, no DROP);
 *   - no file under server/, shared/ or client/src names either table outside a comment;
 *   - etmf-logic.ts is the classifier only, and the seed skeleton is gone.
 *
 * Tables an earlier install-fresh created are left as they are: they hold no document and nothing reads them.
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const at = (rel: string) => `${ROOT}${rel}`;
const read = (rel: string) => fs.readFileSync(at(rel), 'utf8');
// Built from parts so this file never names the tables itself.
const TABLES = new RegExp(`\\btmf_(${['files', 'artifacts'].join('|')})\\b`);
const SELF = 'server/services/etmf/__tests__/etmf-second-store-retired.test.ts';

/** Source text with its comments removed: block comments, then line comments not inside a string's `//` (a URL). */
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(^|[^:'"`])\/\/.*$/, '$1'))
    .join('\n');
}

function sqlOnly(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((line) => line.replace(/--.*$/, '')).join('\n');
}

describe('the second trial master file store is retired', () => {
  it('its service and its schema model are gone, and the schema index exports neither', () => {
    expect(fs.existsSync(at('server/services/etmf/etmf-service.ts'))).toBe(false);
    expect(fs.existsSync(at('shared/schema/etmf.ts'))).toBe(false);
    expect(read('shared/schema/index.ts')).not.toMatch(/from '\.\/etmf'/);
  });

  it('its migration creates nothing, and its header says what was removed and why', () => {
    const sql = read('migrations/20260610_etmf.sql');
    expect(sqlOnly(sql)).not.toMatch(/\bCREATE\b|\bDROP\b|\bALTER\b|\bINSERT\b/i);
    expect(sql.split('\n').slice(0, 40).join('\n')).toMatch(/eCTD REGULATORY AUDIT CONTEXT/);
    expect(sql).toMatch(/2026-11-12/);
    expect(sql).toMatch(/E4/);
  });

  it('no file under server/, shared/ or client/src names either table outside a comment', () => {
    const files = execFileSync('git', ['ls-files', '--', 'server', 'shared', 'client/src'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .filter((f) => /\.(ts|tsx|js|mjs|cjs|sql)$/.test(f) && f !== SELF && fs.existsSync(at(f)));
    const naming = files.filter((f) => {
      const text = read(f);
      if (!TABLES.test(text)) return false;
      return TABLES.test(f.endsWith('.sql') ? sqlOnly(text) : codeOnly(text));
    });
    expect(naming).toEqual([]);
  });

  it('etmf-logic.ts is the classifier only, and the seed skeleton is gone', async () => {
    const logic = await import('../etmf-logic');
    expect(Object.keys(logic).sort()).toEqual(
      ['TMF_ABOUT_PHRASES', 'TMF_KEYWORD_RULES', 'TMF_QUALIFIER_KEYWORDS', 'TMF_ZONES', 'classifyArtifact', 'zoneName']);
    expect(read('server/services/etmf/etmf-logic.ts')).not.toMatch(/shared\/schema\/etmf/);
    const completeness = await import('../tmf-completeness');
    expect(completeness).not.toHaveProperty('seedArtifacts');
    expect(typeof completeness.assessTmfCompleteness).toBe('function');
  });
});
