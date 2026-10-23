/**
 * Golden questions: each library skill's authors wrote questions the way a
 * regulatory professional types them, and the skill must load for each one
 * against the WHOLE library — so a trigger one module adds cannot quietly take
 * another module's question away.
 *
 * The questions live in golden/<module>.json beside this file.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ClientSegmentId, TherapeuticArea } from '../../../../../shared/ana/skills.js';
import { getSkillLibrary } from '../library/index.js';
import { selectSkills } from '../selector.js';
import { buildSelectableSkills } from '../turn-skills.js';

interface GoldenCase {
  question: string;
  expect: string;
  context?: {
    surfaceId?: string;
    documentType?: string;
    segments?: ClientSegmentId[];
    submissionType?: string;
    therapeuticArea?: TherapeuticArea;
  };
}

const dir = path.join(__dirname, 'golden');
const files = readdirSync(dir).filter(f => f.endsWith('.json')).sort();
const library = getSkillLibrary();
const { skills } = buildSelectableSkills(library.skills, [], new Map());

describe('golden questions', () => {
  it('cover every authored module', () => {
    expect(files.length).toBeGreaterThanOrEqual(13);
  });

  for (const file of files) {
    const cases = JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as GoldenCase[];
    describe(file, () => {
      it('names only skills the library holds', () => {
        expect(cases.map(c => c.expect).filter(k => !library.byKey.has(k))).toEqual([]);
      });

      it.each(cases.map(c => [c.question, c] as const))('%s', (_q, c) => {
        const sel = selectSkills(skills, { message: c.question, ...(c.context ?? {}) });
        const loaded = sel.selected.map(s => s.skill.key);
        expect(loaded, `loaded ${loaded.join(', ') || 'nothing'}; passed over ${sel.passedOver.map(p => `${p.skill.key} (${p.why})`).join(', ') || 'nothing'}`).toContain(c.expect);
      });
    });
  }
});
