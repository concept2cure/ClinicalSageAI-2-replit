/**
 * The platform skill library is shippable only when every skill passes.
 *
 * Each check is something a broken skill would otherwise do to a client:
 * route AnA to a tool she does not have (or that launch scope hides), cite a
 * guideline, standard or record the platform does not hold, name a submission
 * or document type no registry knows, or describe a tool in its method that it
 * never lists (so Settings shows one thing and AnA reads another).
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_ANA_TOOLS } from '../../AnaToolDefinitions.js';
import { withoutHiddenAppTools } from '../../ana-launch-scope.js';
import { getGuideline } from '../../../ana-ri/ich-guideline-corpus.js';
import { REGULATORY_FACTS } from '../../../regulatory-currency/currency-registry.js';
import { getApplicationType } from '../../../../../shared/regulatory/global-document-registry.js';
import { THERAPEUTIC_AREAS } from '../../../../../shared/constants/domain/therapeutic-areas.js';
import {
  SKILL_DISCIPLINES,
  SKILL_SEGMENT_IDS,
} from '../../../../../shared/ana/skills.js';
import { buildLibrary, librarySources } from '../library/index.js';
import { validateSkillSource } from '../library/validate.js';
import { skill } from '../types.js';

const REPO = path.resolve(__dirname, '../../../../..');
const sources = librarySources();
const library = buildLibrary(sources);
const ALL_TOOL_NAMES = new Set(ALL_ANA_TOOLS.map(t => t.name));
const LAUNCH_TOOL_NAMES = new Set(withoutHiddenAppTools(ALL_ANA_TOOLS).map(t => t.name));
const FACT_IDS = new Set(REGULATORY_FACTS.map(f => f.id));

describe('the platform skill library', () => {
  it('has no skill the registry had to leave out', () => {
    expect(library.problems).toEqual([]);
    expect(library.skills.length).toBe(sources.length);
  });

  it('routes only to tools AnA has in the launch scope', () => {
    const wrong: string[] = [];
    for (const s of library.skills) {
      for (const t of s.tools) {
        if (!ALL_TOOL_NAMES.has(t)) wrong.push(`${s.key}: ${t} is not an AnA tool`);
        else if (!LAUNCH_TOOL_NAMES.has(t)) wrong.push(`${s.key}: ${t} is hidden by launch scope`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('names in its method exactly the tools it lists, so Settings and AnA read the same skill', () => {
    const wrong: string[] = [];
    for (const s of library.skills) {
      const named = new Set(
        [...s.instructions.matchAll(/`([a-z][a-z0-9_]+)`/g)].map(m => m[1]).filter(n => ALL_TOOL_NAMES.has(n)),
      );
      for (const n of named) if (!s.tools.includes(n)) wrong.push(`${s.key}: method names ${n}, tools do not list it`);
      for (const t of s.tools) if (!named.has(t)) wrong.push(`${s.key}: lists ${t}, method never says when to use it`);
    }
    expect(wrong).toEqual([]);
  });

  it('cites only what the platform holds', () => {
    const wrong: string[] = [];
    for (const s of library.skills) {
      for (const r of s.references) {
        if (r.kind === 'ich' && !getGuideline(r.id)) wrong.push(`${s.key}: ICH ${r.id} is not in the ICH corpus`);
        if (r.kind === 'currency-fact' && !FACT_IDS.has(r.id)) wrong.push(`${s.key}: currency fact ${r.id} does not exist`);
        if (r.kind === 'record' && !existsSync(path.join(REPO, r.id))) wrong.push(`${s.key}: record ${r.id} does not exist`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('names only submission and document types the global registry knows', () => {
    const wrong: string[] = [];
    for (const s of library.skills) {
      for (const id of [...s.submissionTypes, ...s.documentTypes]) {
        if (!getApplicationType(id)) wrong.push(`${s.key}: ${id} is not a registry id`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('covers every discipline, every client segment, and every therapeutic area but the cross-cutting one', () => {
    for (const d of SKILL_DISCIPLINES) {
      expect(library.skills.some(s => s.parent === null && s.disciplines.includes(d)), `no root skill for ${d}`).toBe(true);
    }
    for (const seg of SKILL_SEGMENT_IDS) {
      const n = library.skills.filter(s => s.segments.length === 0 || s.segments.includes(seg)).length;
      expect(n, `${seg} has ${n} skills`).toBeGreaterThanOrEqual(40);
    }
    for (const ta of THERAPEUTIC_AREAS.filter(t => t.value !== 'other')) {
      expect(library.skills.some(s => s.therapeuticAreas.includes(ta.value)), `no skill for ${ta.value}`).toBe(true);
    }
  });

  it('gives CMC and biostatistics sub-skills, not one broad skill each', () => {
    expect(library.skills.filter(s => s.key.startsWith('cmc.')).length).toBeGreaterThanOrEqual(8);
    expect(library.skills.filter(s => s.key.startsWith('biostatistics.')).length).toBeGreaterThanOrEqual(8);
  });

  it('hashes content: the same skill hashes the same, a changed method does not', () => {
    const again = buildLibrary(sources);
    for (const s of library.skills) expect(again.byKey.get(s.key)?.contentHash).toBe(s.contentHash);
    const first = sources[0];
    const edited = buildLibrary([{ ...first, instructions: `${first.instructions}\n\nOne more line.` }]);
    expect(edited.skills[0].contentHash).not.toBe(library.byKey.get(first.key)?.contentHash);
  });
});

describe('the library refuses a broken skill', () => {
  const good = skill({
    key: 'cmc',
    name: 'Test',
    description: 'A skill used only to show the validator refusing.',
    disciplines: ['cmc'],
    useCases: ['drafting'],
    triggers: ['test phrase'],
    instructions: '## Method\nDo the thing in the right order and say what was checked.',
  });

  it('accepts a well-formed skill', () => {
    expect(validateSkillSource(good)).toEqual([]);
  });

  it.each([
    ['an unknown discipline', { disciplines: ['astrology' as never] }, 'disciplines'],
    ['a submission type no registry knows', { submissionTypes: ['US_MADE_UP'] }, 'submissionTypes'],
    ['an exclamation mark', { instructions: '## Method\nAlways do this first, it matters a great deal!' }, 'exclamation'],
    ['no Method section', { instructions: 'Just some text that is long enough to pass the length floor.' }, 'Method'],
    ['nothing that can select it', { triggers: [] }, 'nothing can select it'],
    ['a reviewed state with no reviewer', { review: { state: 'reviewed' as const, note: 'Checked.' } }, 'named reviewer'],
  ])('refuses %s', (_label, patch, expected) => {
    const problems = validateSkillSource({ ...good, ...patch });
    expect(problems.map(p => p.problem).join(' | ')).toContain(expected);
  });

  it('leaves out a skill whose parent is missing, and its children with it', () => {
    const child = { ...good, key: 'cmc.stability' };
    const grandchild = { ...good, key: 'cmc.stability.photostability' };
    const built = buildLibrary([child, grandchild]);
    expect(built.skills).toEqual([]);
    expect(built.problems.map(p => p.key).sort()).toEqual(['cmc.stability', 'cmc.stability.photostability']);
  });
});
