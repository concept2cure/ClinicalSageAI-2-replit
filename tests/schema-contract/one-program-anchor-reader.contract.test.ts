/**
 * There is one reader of a program's anchor row (PF-08).
 *
 * `server/services/c2c/program-project-anchor.ts` `readProgramAnchorRow` reads
 * the lowest-id `projects` row naming the program, which is the row intake
 * links. Five copies read `... WHERE regulatory_program_id = $1 ... LIMIT 1`
 * with no order. With two anchor rows, an export could file under one project
 * and the next under the other, and an AnA draft could version under a third
 * view of the program. The fifth copy, in the AnA draft writer, was found by
 * the slice's own review (wf_6f56bbd0-de6).
 *
 * Refused: a query that picks a projects row BY its program, outside the
 * anchor module. Allowed: the reverse read (a project's own program, by id),
 * and an EXISTS / JOIN filter that admits every row anchored to the program.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CANONICAL = 'server/services/c2c/program-project-anchor.ts';

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '__tests__') continue;
      out.push(...sourceFiles(rel));
    } else if (/\.(ts|mjs|js)$/.test(e.name) && !/\.test\./.test(e.name)) {
      out.push(rel);
    }
  }
  return out;
}

/** The ways a projects row has been picked by its program. */
const ANCHOR_PICKS: RegExp[] = [
  // Raw SQL: SELECT id … FROM projects … WHERE regulatory_program_id = $n
  /SELECT\s+(?:\w+\.)?id\b[^;`]{0,200}?\bFROM\s+projects\b(?:\s+\w+)?\s+WHERE\s+(?:\w+\.)?regulatory_program_id\s*=\s*\$\d/i,
  // Drizzle: eq(projects.regulatoryProgramId, …) / eq(schema.projects.regulatoryProgramId, …)
  /\beq\(\s*(?:\w+\.)?projects\.regulatoryProgramId\s*,/,
];
const picksAnchor = (src: string) => ANCHOR_PICKS.some((re) => re.test(src));

describe('a program anchor row has one reader', () => {
  it('the patterns catch every copy that was folded, and pass the reads that are allowed', () => {
    // The five deleted copies, verbatim in shape.
    expect(picksAnchor('`SELECT id FROM projects\n          WHERE regulatory_program_id = $1 AND organization_id = $2\n          LIMIT 1`')).toBe(true);
    expect(picksAnchor('.where(and(eq(projects.regulatoryProgramId, programId), eq(projects.organizationId, orgId)))')).toBe(true);
    expect(picksAnchor('and(\n          eq(schema.projects.regulatoryProgramId, projectUuid),')).toBe(true);
    // Allowed: a project's own program, and an any-anchor filter.
    expect(picksAnchor('`SELECT regulatory_program_id FROM projects WHERE id = $1 AND organization_id = $2 LIMIT 1`')).toBe(false);
    expect(picksAnchor('EXISTS (SELECT 1 FROM projects p\n WHERE p.id = a.project_id\n AND p.regulatory_program_id = $1::uuid)')).toBe(false);
  });

  it('only the anchor module picks a projects row by its program', () => {
    const pickers = ['server', 'shared'].flatMap(sourceFiles).filter((f) => picksAnchor(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    expect(pickers).toEqual([CANONICAL]);
  });
});
