/**
 * Skills a person chooses, and skills a project holds: a skill picked in the
 * conversation or deployed to the project loads without a trigger phrase and
 * whatever the program's facets, within its own allowance so it never crowds
 * out what the question calls for; a skill turned off in a project never loads
 * there; a skill written for one project loads nowhere else; and the
 * organization's client type stands in for the product's segment when the turn
 * states none.
 */
import { describe, expect, it } from 'vitest';
import type { OrgSkillRecord } from '../../../account-skill-bundles';
import { selectSkills, type SelectableSkill } from '../selector';
import {
  applyProjectScope,
  buildSelectableSkills,
  orgSkillsForProject,
  pickedSkillKeysOf,
  segmentsOfClientType,
  selectTurnSkills,
} from '../turn-skills';
import { getSkillLibrary } from '../library/index';

function s(key: string, over: Partial<SelectableSkill> = {}): SelectableSkill {
  return {
    key,
    name: key,
    source: 'library',
    version: 1,
    contentHash: `hash-${key}`,
    triggers: [],
    instructions: `## Method\nThe ${key} method.`,
    tools: [],
    reviewState: 'unreviewed',
    disciplines: ['cmc'],
    useCases: ['drafting'],
    segments: [],
    therapeuticAreas: [],
    regions: [],
    submissionTypes: [],
    surfaces: [],
    documentTypes: [],
    replacedBy: null,
    addenda: [],
    ...over,
  };
}

function org(id: number, over: Partial<OrgSkillRecord> = {}): OrgSkillRecord {
  return {
    id,
    bundleId: `bundle_${id}`,
    name: `Org skill ${id}`,
    description: 'An organization skill used only in this test file.',
    instructions: `## Method\nHouse rule ${id}.`,
    disciplines: ['cmc'],
    useCases: ['drafting'],
    segments: [],
    therapeuticAreas: [],
    regions: [],
    submissionTypes: [],
    surfaces: [],
    documentTypes: [],
    triggers: [],
    tools: [],
    extendsSkillKey: null,
    extensionMode: null,
    status: 'active',
    version: 1,
    updatedAt: null,
    projectId: null,
    ...over,
  };
}

describe('a skill the person chose', () => {
  const device = s('device.predicate', { segments: ['device'], triggers: ['predicate'] });
  const stability = s('cmc.stability', { triggers: ['shelf life'] });

  it('loads when picked, with no phrase calling for it and the program saying it is for another segment', () => {
    const sel = selectSkills([device, stability], { message: 'Summarize where we are.', segments: ['pharma'], invokedKeys: ['device.predicate'] });
    expect(sel.selected.map(x => x.skill.key)).toEqual(['device.predicate']);
    expect(sel.selected[0].chosen).toBe('picked');
    expect(sel.selected[0].reasons[0]).toBe('chosen in this conversation');
  });

  it('loads when deployed to the project, on a turn about something else', () => {
    const sel = selectSkills([device, stability], { message: 'Thanks.', deployedKeys: ['cmc.stability'] });
    expect(sel.selected.map(x => [x.skill.key, x.chosen])).toEqual([['cmc.stability', 'deployed']]);
    expect(sel.selected[0].reasons).toContain('deployed to this project');
  });

  it('has its own allowance: three chosen skills never crowd out what the question asks for', () => {
    const chosen = ['a', 'b', 'c', 'd'].map(k => s(`chosen.${k}`));
    const asked = ['x', 'y', 'z'].map(k => s(`asked.${k}`, { triggers: [`topic ${k}`] }));
    const sel = selectSkills([...chosen, ...asked], {
      message: 'topic x, topic y and topic z',
      invokedKeys: ['chosen.a', 'chosen.b'],
      deployedKeys: ['chosen.c', 'chosen.d'],
    });
    const loaded = sel.selected.map(x => x.skill.key);
    expect(loaded.filter(k => k.startsWith('asked.')).sort()).toEqual(['asked.x', 'asked.y', 'asked.z']);
    expect(loaded.filter(k => k.startsWith('chosen.')).length).toBe(3);
    expect(sel.passedOver.find(p => p.skill.key.startsWith('chosen.'))?.why).toBe('3 chosen skills are already loaded');
  });

  it('puts a pick ahead of a deployment when the allowance is short', () => {
    const sel = selectSkills([s('one'), s('two')], { message: '', invokedKeys: ['two'], deployedKeys: ['one'] }, { maxChosen: 1 });
    expect(sel.selected.map(x => x.skill.key)).toEqual(['two']);
  });

  it('picks a library skill the organization replaced by either key', () => {
    const replaced = s('cmc.stability', { replacedBy: { key: 'org:bundle_7', name: 'Our stability SOP', version: 3 } });
    const sel = selectSkills([replaced], { message: '', invokedKeys: ['org:bundle_7'] });
    expect(sel.selected.map(x => x.skill.key)).toEqual(['cmc.stability']);
  });
});

describe('a project’s skills', () => {
  it('leaves out a skill turned off there, under its library key or its replacement’s, and names what it deploys', () => {
    const skills = [s('a'), s('b', { replacedBy: { key: 'org:bundle_2', name: 'B', version: 1 } }), s('c')];
    const settings = new Map([
      ['a', { state: 'off' as const }],
      ['org:bundle_2', { state: 'off' as const }],
      ['c', { state: 'always' as const }],
    ]);
    const scoped = applyProjectScope(skills, settings);
    expect(scoped.skills.map(x => x.key)).toEqual(['c']);
    expect(scoped.deployedKeys).toEqual(['c']);
  });

  it('keeps the organization’s skills and this project’s, never another project’s', () => {
    const records = [org(1), org(2, { projectId: 9 }), org(3, { projectId: 10 })];
    expect(orgSkillsForProject(records, 9).map(r => r.id)).toEqual([1, 2]);
    expect(orgSkillsForProject(records, null).map(r => r.id)).toEqual([1]);
  });
});

describe('what the request may pick', () => {
  it('keeps only skill-shaped keys, once each, up to the allowance', () => {
    expect(pickedSkillKeysOf(['cmc.stability', 'cmc.stability', 'org:bundle_1', 'DROP TABLE x', 7, 'labeling', 'biostatistics'])).toEqual([
      'cmc.stability',
      'org:bundle_1',
      'labeling',
    ]);
    expect(pickedSkillKeysOf('cmc.stability')).toEqual([]);
    expect(pickedSkillKeysOf(undefined)).toEqual([]);
  });
});

describe('the organization’s client type', () => {
  it('names the segment of a product-owning organization, and none for a service organization', () => {
    expect(segmentsOfClientType('medtech')).toEqual(['device']);
    expect(segmentsOfClientType('pharma')).toEqual(['pharma']);
    expect(segmentsOfClientType('cro')).toEqual([]);
    expect(segmentsOfClientType('not a type')).toEqual([]);
    expect(segmentsOfClientType(null)).toEqual([]);
  });
});

describe('a turn in a project', () => {
  const library = getSkillLibrary().skills;
  const drugPathways = library.find(x => x.key === 'regulatory-strategy.drug-pathways')!;

  /** A request client answering each statement from the organization's and project's stored state. */
  function client(state: { clientType?: string; project?: Array<{ skill_key: string; state: string }>; orgRows?: Array<Record<string, unknown>> }) {
    return {
      query: async (sql: string) => {
        if (sql.includes('FROM organizations')) return { rows: [{ client_type: state.clientType ?? 'pharma' }] };
        if (sql.includes('FROM project_skill_settings')) {
          return { rows: (state.project ?? []).map(r => ({ ...r, reason: 'Set for this project.', updated_at: null })) };
        }
        if (sql.includes('FROM account_skill_bundles')) return { rows: state.orgRows ?? [] };
        return { rows: [] };
      },
    };
  }

  it('loads a deployed skill on a turn about something else, and never a skill turned off there', async () => {
    const sel = await selectTurnSkills(
      client({ project: [{ skill_key: 'labeling', state: 'always' }, { skill_key: drugPathways.key, state: 'off' }] }),
      { organizationId: 4, projectId: 9, message: `Thanks. Also, is ${drugPathways.triggers[0]} right for us?` },
    );
    const loaded = sel.selected.map(x => x.skill.key);
    expect(loaded).toContain('labeling');
    expect(loaded).not.toContain(drugPathways.key);
  });

  it('loads a skill written for the project only in that project', async () => {
    const row = {
      id: 5,
      bundle_id: 'bundle_5',
      name: 'Our zebra protocol',
      description: 'How this program runs its zebra protocol reviews.',
      prompt_fragments: [{ role: 'instruction', content: '## Method\nReview it our way.', priority: 5 }],
      module_types: ['clinical'],
      work_types: ['review'],
      triggers: ['zebra protocol'],
      status: 'active',
      version: 1,
      project_id: 9,
    };
    const inProject = await selectTurnSkills(client({ orgRows: [row] }), { organizationId: 4, projectId: 9, message: 'Check the zebra protocol.' });
    const elsewhere = await selectTurnSkills(client({ orgRows: [row] }), { organizationId: 4, projectId: 10, message: 'Check the zebra protocol.' });
    expect(inProject.selected.map(x => x.skill.key)).toContain('org:bundle_5');
    expect(elsewhere.selected.map(x => x.skill.key)).not.toContain('org:bundle_5');
  });

  it('reads the organization’s client type as the segment when the turn names no submission type', async () => {
    const message = `Is ${drugPathways.triggers[0]} right for us?`;
    const device = await selectTurnSkills(client({ clientType: 'medtech' }), { organizationId: 4, message });
    const pharma = await selectTurnSkills(client({ clientType: 'pharma' }), { organizationId: 4, message });
    const reasonsOf = (sel: typeof device) => sel.selected.find(x => x.skill.key === drugPathways.key)?.reasons.join(' ') ?? '';
    expect(reasonsOf(device)).toContain('the project is device');
    expect(reasonsOf(pharma)).toContain('the project is pharma');
  });
});

describe('market skills', () => {
  const { skills } = buildSelectableSkills(getSkillLibrary().skills, [], new Map());
  const loaded = (message: string) => selectSkills(skills, { message }).selected.map(x => x.skill.key);
  const markets = (keys: string[]) => keys.filter(k => k.startsWith('regulatory-strategy.global-planning.'));

  it('load for a question about their market', () => {
    expect(loaded('What does a PMDA consultation before the J-NDA need from us?')).toContain('regulatory-strategy.global-planning.japan');
    expect(loaded('Can we use the International Recognition Procedure with the MHRA after FDA approval?')).toContain('regulatory-strategy.global-planning.uk');
  });

  it('never load on a word that means something else in another discipline', () => {
    // HSA is also human serum albumin; CDE is also a common data element.
    expect(markets(loaded('Is HSA acceptable as an excipient in our lyophilized biologic formulation?'))).toEqual([]);
    expect(markets(loaded('Map our case report forms to the NIH CDE definitions before database lock.'))).toEqual([]);
  });
});
