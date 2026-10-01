/**
 * The AnA turn paths never coerce a project id: they resolve it (PF-10 S6a,
 * S10b).
 *
 * A v2 project is a regulatory_programs UUID. parseInt('7abb1c22-…', 10) is 7,
 * a valid, wrong project of the same organization; Number(uuid) is NaN. Both
 * were written at every step of the AnA turn: the guidance executor
 * auto-created artifacts under project 7, the command executor ran with it
 * active, the intelligence prefix and the session bootstrap read its memory.
 * The one resolution is services/c2c/project-ref.ts integerProjectForRef (an
 * integer as itself, a program through its anchor row, else none), and the
 * canonical parse is lib/project-id.ts parseIntegerProjectId.
 *
 * Refused in these files: parseInt( or Number( applied to an expression naming
 * a project.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FILES = [
  'server/routes/chat/send-message.ts',
  'server/routes/ana-ri/post-processing.ts',
  'server/services/lumen-context/intelligence-prefix.ts',
];
/** parseInt(… project …) or Number(… project …), on one line. */
const COERCION = /\b(?:Number\.)?(?:parseInt|Number)\(\s*(?:String\()?[^)\n]*\b\w*[pP]roject\w*/;

const offenders = (src: string) =>
  src
    .split('\n')
    .map((line, i) => ({ line: i + 1, text: line.trim() }))
    .filter(({ text }) => !text.startsWith('//') && !text.startsWith('*') && !text.startsWith('/*') && COERCION.test(text));

describe('no project id is coerced on the AnA turn paths', () => {
  it('the pattern catches the coercions that were removed, and not the resolution', () => {
    for (const bad of [
      "projectId: typeof project_id === 'string' ? parseInt(project_id, 10) : project_id,",
      "const projectIdNum = parseInt(String(normalizedProjectId || '0'), 10);",
      'projectId: streamProjectId ? Number(streamProjectId) || null : null,',
      "? Number.parseInt(streamProjectId, 10)",
    ]) expect(COERCION.test(bad), bad).toBe(true);
    for (const ok of [
      "const projectId = await turnProjectId(streamProjectId, orgId, 'ana-ri.post-processing');",
      'organizationId: Number(orgId),',
      "const RETRIEVAL_TOP_K = parseInt(process.env.ANA_RETRIEVAL_TOP_K ?? '5', 10);",
    ]) expect(COERCION.test(ok), ok).toBe(false);
  });

  it.each(FILES)('%s', (rel) => {
    expect(offenders(fs.readFileSync(path.join(ROOT, rel), 'utf8'))).toEqual([]);
  });
});
