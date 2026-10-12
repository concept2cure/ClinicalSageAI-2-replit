/**
 * The interview marks a position its own answers contradict, and records the
 * choice of one (founder's decision, 2026-10-12).
 *
 * The catalogue decided WHAT a fact says against a position and the authority
 * that makes it say so (shared/regulatory/__tests__/pathway-availability).
 * This holds the other half, which is where it can go wrong in practice:
 *
 *   - which answer states which fact. These field names are a contract with
 *     17 flow files and nothing but a test holds them: a rename would leave
 *     the rules in place, firing on nothing, which reads exactly like a check
 *     that passes.
 *   - that the question a person actually reads carries the mark, and still
 *     carries every position it carried before.
 *   - that taking a marked position leaves a record. An interview feeds
 *     document authoring and a Part 11 trail; a contradiction the sponsor
 *     walked into silently is the failure this whole mechanism exists to
 *     prevent.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { agencyOptions } from '@shared/regulatory/agency-positions';
import type { FlowState, QuestionField, QuestionNode } from '../types.js';
import { advanceFlow } from '../engine.js';
import { cautionedChoiceNotices, factFields, programmeFactsFrom, withCautions } from '../programme-facts.js';

const CTX = { organizationId: 7, userId: 3, projectId: null, clientType: 'medtech' as const };

const stateAt = (nodeId: string, answers: Record<string, Record<string, unknown>> = {}): FlowState => ({
  flowId: 'project-setup-v1',
  flowCategory: 'project_setup',
  currentNodeId: nodeId,
  answers,
  completedNodes: [],
  issues: [],
  startedAt: '2026-10-12T00:00:00.000Z',
  complete: false,
  sectionProgress: {},
});

const pathwayOptionsOf = (event: { node: QuestionNode } | null) =>
  event!.node.fields.find(f => f.id === 'device_submission_pathway')!.options!;

describe('which answer states which fact', () => {
  it('reads every agency the project named, in whichever vocabulary', () => {
    expect(programmeFactsFrom({ primary_regulatory_agency: 'US' })).toEqual({ regions: ['US'] });
    expect(
      programmeFactsFrom({ primary_regulatory_agency: 'US', additional_agencies: ['EU', 'who'] }),
      'WHO prequalification is not a region, and is not read as one',
    ).toEqual({ regions: ['US', 'EU'] });
    // The nine hand-written values this question used to carry still resolve.
    expect(programmeFactsFrom({ primary_regulatory_agency: 'ema' })).toEqual({ regions: ['EU'] });
    expect(programmeFactsFrom({ primary_regulatory_agency: '__other__' }), 'own words name no region').toEqual({});
  });

  it('reads the class and the predicate the flows actually ask for', () => {
    expect(programmeFactsFrom({ device_class: 'class_iii' })).toEqual({ deviceClass: 'III' });
    expect(programmeFactsFrom({ device_class: 'class_ii' }), 'iii must not match ii').toEqual({ deviceClass: 'II' });
    expect(programmeFactsFrom({ eu_mdr_class: 'class_iib' })).toEqual({ euMdrClass: 'IIb' });
    expect(programmeFactsFrom({ predicate_device_name: 'Acme Stent' })).toEqual({ predicateNamed: 'Acme Stent' });
    expect(programmeFactsFrom({ predicate_device: ' K123456 ' })).toEqual({ predicateNamed: 'K123456' });
  });

  it('states no fact where the person said they do not know, or said nothing', () => {
    expect(programmeFactsFrom({ device_class: 'not_classified' }), 'not knowing is not a contradiction').toEqual({});
    expect(programmeFactsFrom({ eu_mdr_class: 'na' })).toEqual({});
    expect(programmeFactsFrom({ predicate_device: '   ' })).toEqual({});
    expect(programmeFactsFrom({ device_class: 'class_iv' })).toEqual({});
    expect(programmeFactsFrom({})).toEqual({});
  });

  it('is still asked by a flow — a renamed field would leave the rules firing on nothing', () => {
    const dir = join(__dirname, '..', 'flows');
    const read = (d: string, acc: string[] = []): string[] => {
      for (const entry of readdirSync(d)) {
        if (entry === '__tests__') continue;
        const full = join(d, entry);
        if (statSync(full).isDirectory()) read(full, acc);
        else if (entry.endsWith('.ts')) acc.push(readFileSync(full, 'utf8'));
      }
      return acc;
    };
    const sources = read(dir);
    expect(sources.length, 'a scan that read nothing proves nothing').toBeGreaterThan(10);
    const missing = factFields().filter(field => !sources.some(src => src.includes(`id: '${field}'`)));
    expect(missing, 'a fact field no flow asks any more').toEqual([]);
  });
});

describe('the question a person reads', () => {
  it('asks the classification before the route, which is what makes the mark possible', () => {
    const answered = advanceFlow(stateAt('device_classification'), 'device_classification', { device_class: 'class_iii' }, CTX);
    expect(answered.event!.node.id, 'the route question follows the classification').toBe('medtech_regulatory');
  });

  it('marks the route the stated class speaks against, and removes nothing', () => {
    const answered = advanceFlow(stateAt('device_classification'), 'device_classification', { device_class: 'class_iii' }, CTX);
    const options = pathwayOptionsOf(answered.event);
    const flat = pathwayOptionsOf(advanceFlow(stateAt('device_classification'), 'device_classification', { device_class: 'not_classified' }, CTX).event);
    expect(options.map(o => o.value), 'a marked question offers what an unmarked one offers').toEqual(flat.map(o => o.value));

    const k510 = options.find(o => o.value === 'US_510K')!;
    expect(k510.caution!.availability).toBe('needs_basis');
    expect(k510.caution!.reason).toMatch(/preamendments/i);
    expect(k510.caution!.authority).toMatch(/814\.1\(c\)/);
    expect(options.find(o => o.value === 'US_PMA')!.caution, 'a PMA is the Class III route').toBeUndefined();
    expect(flat.find(o => o.value === 'US_510K')!.caution, 'nothing stated, nothing marked').toBeUndefined();
  });

  it('marks a De Novo once a predicate has been named', () => {
    const state = stateAt('device_classification', { predicate_info: { predicate_device_name: 'K123456 — Acme' } });
    const options = pathwayOptionsOf(advanceFlow(state, 'device_classification', { device_class: 'class_ii' }, CTX).event);
    expect(options.find(o => o.value === 'US_DE_NOVO')!.caution!.reason).toContain('K123456 — Acme');
  });

  it('drops a caution the rules no longer justify, rather than letting it ride', () => {
    const field = {
      id: 'route',
      label: 'Route',
      type: 'select' as const,
      options: [
        {
          value: 'US_510K',
          label: '510(k)',
          caution: { availability: 'inapplicable' as const, reason: 'stale', authority: 'stale' },
        },
      ],
    };
    expect(withCautions([field], {})[0].options![0].caution).toBeUndefined();
    expect(withCautions([field], { deviceClass: 'III' })[0].options![0].caution!.availability).toBe('needs_basis');
  });
});

describe('the agency question itself', () => {
  const everyField = async (): Promise<QuestionField[]> => {
    const { getAvailableFlows, getFlowDefinition } = await import('../flows/index.js');
    const ctx = { organizationId: 7, userId: 3, projectId: null };
    return getAvailableFlows(ctx).flatMap(f =>
      (getFlowDefinition(f.category, ctx)?.nodes ?? []).flatMap(n => n.fields),
    );
  };

  it('offers the governed positions wherever a flow asks it, and is not a text box', async () => {
    /* `agency_select` is a field type the engine has always declared and no
       renderer ever implemented, so it fell through to a text input. This
       holds that no flow can ask it bare again. */
    const asked = (await everyField()).filter(f => f.type === 'agency_select');
    expect(asked.length, 'a scan that found no agency question proves nothing').toBeGreaterThan(0);
    for (const field of asked) {
      expect(field.options?.map(o => o.value), field.id).toEqual(agencyOptions().map(o => o.value));
      expect(field.options?.every(o => o.commits), field.id).toBe(true);
      expect(field.allowOther, 'an agency AnA does not hold must still be nameable').toBeDefined();
    }
  });

  it('offers the same governed twelve for the additional agencies, plus the one that is not a filing', async () => {
    const additional = (await everyField()).find(f => f.id === 'additional_agencies')!;
    const values = additional.options!.map(o => o.value);
    expect(values.slice(0, 12)).toEqual(agencyOptions().map(o => o.value));
    expect(values, 'dropping WHO prequalification would remove a target some sponsors use').toContain('who');
    const who = additional.options!.find(o => o.value === 'who')!;
    expect(who.label).toMatch(/not a national filing/);
    expect(who.commits).toMatch(/no Module 1 requirements/);
    // The five the hand-written nine left out.
    for (const value of ['CH', 'SG', 'KR']) expect(values, value).toContain(value);
  });

  it('leaves the country questions as free text, because no governed country vocabulary exists', async () => {
    const countries = (await everyField()).filter(f => f.type === 'country_select');
    expect(countries.length).toBeGreaterThan(0);
    for (const field of countries) {
      expect(
        field.options,
        'the platform holds a governed agency list and no governed country list; if one lands, these draw it',
      ).toBeUndefined();
    }
  });
});

describe('a route to a regulator the project did not name', () => {
  it('is marked inapplicable, and says how to open it', () => {
    const state = stateAt('device_classification', { regulatory_targets: { primary_regulatory_agency: 'EU' } });
    const options = pathwayOptionsOf(advanceFlow(state, 'device_classification', { device_class: 'class_ii' }, CTX).event);
    const k510 = options.find(o => o.value === 'US_510K')!;
    expect(k510.caution!.availability).toBe('inapplicable');
    expect(k510.caution!.reason).toMatch(/You have named EMA/);
    expect(k510.caution!.reason).toMatch(/name FDA among the agencies/);
  });

  it('is not marked once that regulator is among the additional agencies', () => {
    const state = stateAt('device_classification', {
      regulatory_targets: { primary_regulatory_agency: 'EU', additional_agencies: ['US'] },
    });
    const options = pathwayOptionsOf(advanceFlow(state, 'device_classification', { device_class: 'class_ii' }, CTX).event);
    expect(options.find(o => o.value === 'US_510K')!.caution).toBeUndefined();
  });
});

describe('taking a marked position', () => {
  const takeTheRoute = (route: string) => {
    const classified = advanceFlow(stateAt('device_classification'), 'device_classification', { device_class: 'class_iii' }, CTX);
    return advanceFlow(classified.state, 'medtech_regulatory', { device_submission_pathway: route }, CTX);
  };

  it('is allowed, and leaves a record carrying the reason and the authority', () => {
    const result = takeTheRoute('US_510K');
    const noted = (result.event?.newIssues ?? result.completeEvent?.issues ?? []).find(
      i => i.checkId === 'cautioned_position_device_submission_pathway_US_510K',
    );
    expect(noted, 'a cautioned position taken with no trace of it').toBeDefined();
    expect(noted!.severity).toBe('warning');
    expect(noted!.title).toMatch(/needs a basis/i);
    expect(noted!.message).toMatch(/preamendments/i);
    expect(noted!.reference).toMatch(/814\.1\(c\)/);
    expect(noted!.triggerValues).toMatchObject({ device_submission_pathway: 'US_510K', deviceClass: 'III' });
    // Allowed: the answer is recorded as given, not refused.
    expect(result.state.answers.medtech_regulatory.device_submission_pathway).toBe('US_510K');
  });

  it('reads a fact that arrives in the same answer as the choice', () => {
    /* The engine judges against everything the interview holds INCLUDING the
       answer being submitted, so a question that asks for the classification
       and the route together still leaves the record. */
    const result = advanceFlow(
      stateAt('medtech_regulatory'),
      'medtech_regulatory',
      { device_class: 'class_iii', device_submission_pathway: 'US_510K' },
      CTX,
    );
    const ids = (result.event?.newIssues ?? result.completeEvent?.issues ?? []).map(i => i.checkId);
    expect(ids).toContain('cautioned_position_device_submission_pathway_US_510K');
  });

  it('leaves no record when the answers say nothing against it', () => {
    const result = takeTheRoute('US_PMA');
    const notes = (result.event?.newIssues ?? []).filter(i => i.checkId.startsWith('cautioned_position_'));
    expect(notes, 'a PMA for a Class III device is the route, not a contradiction').toEqual([]);
  });

  it('records it even where the fact arrives with the choice, and could not have marked it in time', () => {
    const node: QuestionNode = {
      id: 'one_question',
      section: 'S',
      question: 'Classification and route together',
      fields: [
        { id: 'device_class', label: 'Class', type: 'select', options: [{ value: 'class_iii', label: 'Class III' }] },
        { id: 'route', label: 'Route', type: 'select', options: [{ value: 'US_510K', label: '510(k)' }] },
      ],
    };
    const answers = { device_class: 'class_iii', route: 'US_510K' };
    const notes = cautionedChoiceNotices(node, answers, programmeFactsFrom(answers));
    expect(notes.map(n => n.checkId)).toEqual(['cautioned_position_route_US_510K']);
    expect(notes[0].message).toMatch(/510\(k\)/);
  });

  it('says the choice is the person’s, rather than reading as a refusal', () => {
    const noted = cautionedChoiceNotices(
      { id: 'n', section: 'S', question: 'q', fields: [{ id: 'route', label: 'Route', type: 'select', options: [{ value: 'US_DE_NOVO', label: 'De Novo' }] }] },
      { route: 'US_DE_NOVO' },
      { predicateNamed: 'K123456' },
    )[0];
    expect(noted.message).toMatch(/You have taken De Novo anyway/);
    expect(noted.message).toMatch(/carry that justification/);
  });
});
