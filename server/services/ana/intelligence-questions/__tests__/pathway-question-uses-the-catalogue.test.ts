/**
 * The pathway question asks the governed catalogue, for the regulator the
 * project named (founder's directive, 2026-10-12).
 *
 * `project-setup` wrote its own seven options for `device_submission_pathway`:
 * they mixed the three 510(k) flavours — which the 510(k) flow asks about
 * itself — with distinct pathways, left out exemption and the 513(g) that
 * clears nothing, carried no authority, and said nothing about what choosing
 * one commits the programme to. A person answering therefore saw a list that
 * matched neither the registry the platform files against nor the frame it
 * reasons with.
 *
 * It then drew `shared/regulatory/pathway-positions` — but for the United
 * States, whatever agency the project had named, because a flow file is built
 * before any answer exists. So a European device programme was shown the four
 * FDA routes with every one marked inapplicable: correct, and the wrong
 * question. The field now declares the catalogue and the ENGINE resolves it as
 * the question is drawn, which is the only place that knows the regulator.
 *
 * These tests drive the real engine, because what a person is offered is the
 * drawn question and not what the flow file holds.
 */
import { describe, expect, it } from 'vitest';

import { pathwayOptions } from '@shared/regulatory/pathway-positions';
import type { FlowEngineContext, FlowState, QuestionField } from '../types.js';
import { advanceFlow } from '../engine.js';

const ctx = (clientType: FlowEngineContext['clientType']): FlowEngineContext => ({
  organizationId: 7,
  userId: 3,
  projectId: null,
  clientType,
});

const stateWith = (answers: Record<string, Record<string, unknown>>): FlowState => ({
  flowId: 'project-setup-v1',
  flowCategory: 'project_setup',
  currentNodeId: 'device_classification',
  answers,
  completedNodes: [],
  issues: [],
  startedAt: '2026-10-12T00:00:00.000Z',
  complete: false,
  sectionProgress: {},
});

/**
 * The route question as a person is actually drawn it, for a project that
 * named this agency and this product type.
 */
const drawnRouteField = (
  agency: string | null,
  productType = 'medical_device',
  clientType: FlowEngineContext['clientType'] = 'medtech',
): QuestionField => {
  const targets: Record<string, unknown> = { product_type: productType };
  if (agency) targets.primary_regulatory_agency = agency;
  const result = advanceFlow(
    stateWith({ regulatory_targets: targets }),
    'device_classification',
    { device_class: 'class_ii' },
    ctx(clientType),
  );
  expect(result.event?.node.id, 'the route question follows the classification').toBe('medtech_regulatory');
  return result.event!.node.fields.find(f => f.id === 'device_submission_pathway')!;
};

const valuesOf = (field: QuestionField) => (field.options ?? []).map(o => o.value);

describe('the pathway question', () => {
  it('offers exactly the catalogue’s US positions to a project that named FDA', () => {
    expect(valuesOf(drawnRouteField('US'))).toEqual(
      pathwayOptions({ domain: 'medical_devices', region: 'US' }).map(o => o.value),
    );
    expect(drawnRouteField('US').helpText, 'whose routes these are must be said').toMatch(/These are FDA’s routes/);
  });

  it('offers a project that named EMA the MDR conformity routes instead, not FDA’s marked', () => {
    const values = valuesOf(drawnRouteField('EU'));
    expect(values).toEqual(pathwayOptions({ domain: 'medical_devices', region: 'EU' }).map(o => o.value));
    expect(values, 'the EU class routes').toContain('EU_MDR_CLASS_III');
    expect(values, 'a 510(k) is not a European route').not.toContain('US_510K');
    /* And it says so in words that are true of a device: the MDR routes are a
       notified body's assessment, not EMA's — which is what a device project
       was told until a review caught it. */
    expect(drawnRouteField('EU').helpText).toMatch(/EU MDR conformity assessment routes/);
    expect(drawnRouteField('EU').helpText).toMatch(/notified body assesses them/);
    expect(drawnRouteField('EU', 'diagnostic').helpText, 'an assay is IVDR').toMatch(/EU IVDR conformity/);
    expect(drawnRouteField('US').helpText, 'FDA regulates both, so its name is right for both').toMatch(
      /These are FDA’s routes/,
    );
  });

  it('offers a diagnostics programme the IVD positions, in whichever region', () => {
    const us = valuesOf(drawnRouteField('US', 'diagnostic'));
    expect(us).toEqual(pathwayOptions({ domain: 'diagnostics_ivd', region: 'US' }).map(o => o.value));
    expect(us, 'an IVD is not asked about a plain 510(k)').toContain('US_510K_IVD');
    expect(us).toContain('US_CDX_PMA');
    const eu = valuesOf(drawnRouteField('EU', 'diagnostic'));
    expect(eu).toContain('EU_IVDR_CLASS_CD');
    expect(eu).not.toEqual(valuesOf(drawnRouteField('EU')));
  });

  it('reads the diagnostics domain from the client’s segment too, not only the answer', () => {
    const values = valuesOf(drawnRouteField('US', 'combination_product', 'ivd'));
    expect(values).toContain('US_510K_IVD');
  });

  it('says what each position commits the programme to, and its authority', () => {
    for (const option of drawnRouteField('US').options!) {
      expect(option.commits, option.value).toBeTruthy();
      expect(option.authority, option.value).toBeTruthy();
    }
    const deNovo = drawnRouteField('US').options!.find(o => o.value === 'US_DE_NOVO')!;
    expect(deNovo.commits).toMatch(/special controls/i);
    expect(deNovo.authority).toMatch(/513\(f\)\(2\)/);
  });

  it('no longer offers the 510(k) flavours as if they were pathways', () => {
    const values = valuesOf(drawnRouteField('US'));
    expect(values).not.toContain('510k_special');
    expect(values).not.toContain('510k_abbreviated');
    // And the ones it used to omit are present.
    expect(values).toContain('US_513G');
  });

  it('still lets the person take a position the list does not hold', () => {
    expect(drawnRouteField('US').allowOther).toBeDefined();
  });

  it('offers nothing for a regulator the catalogue has no positions for, and says why by name', () => {
    /* Japan's filings are in the registry; what taking one commits a sponsor
       to is not written. Offering another regulator's routes would be worse
       than offering none, and an empty select would be an error drawn as a
       result. */
    const field = drawnRouteField('JP');
    expect(field.options).toBeUndefined();
    expect(field.helpText).toMatch(/holds no routes to market for PMDA/);
    expect(field.helpText).toMatch(/record it in your words/);
    expect(field.allowOther, 'their own words are the answer here').toBeDefined();
  });

  it('says so when no agency has been named and the list is therefore an assumption', () => {
    const field = drawnRouteField(null);
    expect(field.helpText).toMatch(/No primary agency has been named yet, so these are FDA’s routes/);
    expect(valuesOf(field)).toEqual(pathwayOptions({ domain: 'medical_devices', region: 'US' }).map(o => o.value));
  });

  it('sends the predicate question with its gate, for the card to decide', () => {
    /* `predicate_device` is gated on the route — a field in its OWN question —
       so the server cannot decide it: the person has not chosen a route yet
       when the question is drawn. It is sent with its predicate and the card
       shows it the moment a 510(k) is picked. Until the 2026-10-12 review this
       node dropped it, so a person choosing a 510(k) was never asked for the
       predicate at all. */
    const node = advanceFlow(
      stateWith({ regulatory_targets: { primary_regulatory_agency: 'US', product_type: 'medical_device' } }),
      'device_classification',
      { device_class: 'class_ii' },
      ctx('medtech'),
    ).event!.node;
    const predicate = node.fields.find(f => f.id === 'predicate_device')!;
    expect(predicate, 'the question a 510(k) turns on must reach the person').toBeDefined();
    expect(predicate.visibleWhen).toEqual({
      field: 'device_submission_pathway',
      operator: 'eq',
      value: 'US_510K',
    });
  });

  it('still decides a gate that an EARLIER question answered', () => {
    /* The notified-body question is gated on the EU class, asked in the
       previous node, so the server decides it as it always did. */
    const withoutEu = advanceFlow(
      stateWith({ regulatory_targets: { primary_regulatory_agency: 'US', product_type: 'medical_device' } }),
      'device_classification',
      { device_class: 'class_ii', eu_mdr_class: 'na' },
      ctx('medtech'),
    ).event!.node;
    expect(withoutEu.fields.find(f => f.id === 'notified_body'), 'no EU filing planned').toBeUndefined();
    const withEu = advanceFlow(
      stateWith({ regulatory_targets: { primary_regulatory_agency: 'EU', product_type: 'medical_device' } }),
      'device_classification',
      { device_class: 'class_ii', eu_mdr_class: 'class_iib' },
      ctx('medtech'),
    ).event!.node;
    expect(withEu.fields.find(f => f.id === 'notified_body')).toBeDefined();
  });
});

describe('the medicines route question', () => {
  /**
   * The route question as a medicines project is actually drawn it: the agency
   * is answered first, and the question that follows is the route.
   */
  const drawnSubmissionField = (agency: string, productType: string): QuestionField => {
    const result = advanceFlow(
      { ...stateWith({ product_details: { product_type: productType } }), currentNodeId: 'regulatory_targets' },
      'regulatory_targets',
      { primary_regulatory_agency: agency },
      ctx('pharma'),
    );
    expect(result.event?.node.id, 'the route question follows the agency').toBe('submission_route');
    return result.event!.node.fields.find(f => f.id === 'submission_type')!;
  };

  it('offers a small molecule the frame’s own list, in the frame’s order', () => {
    expect(valuesOf(drawnSubmissionField('US', 'small_molecule'))).toEqual(['US_NDA', 'US_505B2', 'US_ANDA']);
  });

  it('offers an antibody a biologics licence and nothing under section 505', () => {
    const values = valuesOf(drawnSubmissionField('US', 'monoclonal_antibody'));
    expect(values).toEqual(['US_BLA']);
    expect(values, 'an antibody is not approved under 505').not.toContain('US_NDA');
  });

  it('never offers a device route among the medicines ones, as the hand-written ten did', () => {
    const values = valuesOf(drawnSubmissionField('US', 'small_molecule'));
    for (const device of ['US_510K', 'US_PMA', 'US_DE_NOVO']) expect(values, device).not.toContain(device);
  });

  it('says what each position commits the programme to, and its authority', () => {
    for (const option of drawnSubmissionField('US', 'small_molecule').options!) {
      expect(option.commits, option.value).toBeTruthy();
      expect(option.authority, option.value).toBeTruthy();
    }
  });

  it('offers the European routes to a European filing, and marks the ones the modality contradicts', () => {
    const field = drawnSubmissionField('EU', 'biosimilar');
    expect(valuesOf(field)).toEqual(['EU_MAA', 'EU_CMA', 'EU_BIOSIMILAR_MAA', 'EU_GENERIC_DCP']);
    const by = (value: string) => field.options!.find(o => o.value === value)!;
    expect(by('EU_BIOSIMILAR_MAA').caution, 'the route for a biosimilar').toBeUndefined();
    expect(by('EU_MAA').caution!.availability).toBe('needs_basis');
    expect(by('EU_GENERIC_DCP').caution!.availability).toBe('inapplicable');
    expect(by('EU_GENERIC_DCP').caution!.ruleId).toBe('biological_as_generic');
  });

  it('marks a biosimilar application for a chemical product', () => {
    const field = drawnSubmissionField('EU', 'small_molecule');
    const biosimilar = field.options!.find(o => o.value === 'EU_BIOSIMILAR_MAA')!;
    expect(biosimilar.caution!.availability).toBe('inapplicable');
    expect(biosimilar.caution!.reason).toMatch(/section 505/);
  });

  it('offers nothing for a combination product, and says why in the frame’s own words', () => {
    /* The modality frame holds no pathways for a combination product, because
       the lead centre is assigned by primary mode of action. An empty select
       would say "choose one of none". */
    const field = drawnSubmissionField('US', 'combination_product');
    expect(field.options).toBeUndefined();
    expect(field.helpText).toMatch(/holds no route for combination/i);
    expect(field.helpText, 'the reason is the frame\u2019s own').toMatch(/primary mode of action under 21 CFR Part 3/);
    expect(field.allowOther).toBeDefined();
  });

  it('is not asked of a device project at all', () => {
    /* A device project is routed past it — and if it ever reached the node,
       the field is hidden rather than asking a device its NDA type. */
    const routed = advanceFlow(
      { ...stateWith({ product_details: { product_type: 'medical_device' } }), currentNodeId: 'regulatory_targets' },
      'regulatory_targets',
      { primary_regulatory_agency: 'US' },
      ctx('medtech'),
    );
    expect(routed.event?.node.id).toBe('device_classification');
    const reachedAnyway = advanceFlow(
      { ...stateWith({ product_details: { product_type: 'medical_device' } }), currentNodeId: 'submission_route' },
      'submission_route',
      {},
      ctx('medtech'),
    );
    expect(reachedAnyway.state.answers.submission_route, 'nothing demanded of a device here').toEqual({});
  });
});

describe('the IVDR class question', () => {
  /** The classification question as a diagnostics programme is drawn it. */
  const classificationNode = (productType: string) => {
    const result = advanceFlow(
      { ...stateWith({ product_details: { product_type: productType } }), currentNodeId: 'regulatory_targets' },
      'regulatory_targets',
      { primary_regulatory_agency: 'EU' },
      ctx('ivd'),
    );
    expect(result.event?.node.id, 'a diagnostics project goes to the classification question').toBe(
      'device_classification',
    );
    return result.event!.node;
  };

  it('is asked of a diagnostics programme — the first question anywhere to ask it', () => {
    const field = classificationNode('diagnostic').fields.find(f => f.id === 'ivdr_class')!;
    expect(field, 'the IVDR class was enumerated eight times and asked nowhere').toBeDefined();
    expect(field.options?.map(o => o.value)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('answers in the spelling the rest of the platform already stores', async () => {
    /* The IVDR class column, the endpoint's zod enum and the read-side
       adapters all speak bare 'A'-'D'. This is the first interview field whose
       values are that same vocabulary. */
    const values = classificationNode('diagnostic').fields.find(f => f.id === 'ivdr_class')!.options!.map(o => o.value);
    expect(values).not.toContain('class_a');
    const { programmeFactsFrom } = await import('../programme-facts.js');
    expect(programmeFactsFrom({ ivdr_class: 'C' })).toEqual({ ivdrClass: 'C' });
    expect(programmeFactsFrom({ ivdr_class: 'Class D' }), 'a spelling a person might use').toEqual({ ivdrClass: 'D' });
    expect(programmeFactsFrom({ ivdr_class: 'E' }), 'there is no Class E').toEqual({});
  });

  it('states the Article 48 route each class commits the programme to, from the platform’s own statement', () => {
    const options = classificationNode('diagnostic').fields.find(f => f.id === 'ivdr_class')!.options!;
    const by = (value: string) => options.find(o => o.value === value)!;
    expect(by('A').label).toMatch(/no notified body/);
    expect(by('A').commits).toMatch(/EU declaration of conformity/);
    expect(by('B').label).toMatch(/notified body/);
    expect(by('C').commits, 'the companion-diagnostic consultation').toMatch(/consults a medicines authority/);
    expect(by('D').commits, 'the reference laboratory').toMatch(/EU reference laboratory/);
    expect(by('D').commits).toMatch(/common specifications/);
    for (const option of options) expect(option.authority, option.value).toMatch(/Art 48/);
  });

  it('does not ask a diagnostics programme its MDR class, which is the wrong regulation', () => {
    const asked = classificationNode('diagnostic').fields.map(f => f.id);
    expect(asked).toContain('ivdr_class');
    expect(asked, 'an IVD is classified under the IVDR, not the MDR').not.toContain('eu_mdr_class');
  });

  it('does not ask a device programme its IVDR class either', () => {
    const asked = classificationNode('medical_device').fields.map(f => f.id);
    expect(asked).toContain('eu_mdr_class');
    expect(asked).not.toContain('ivdr_class');
  });

  it('offers the MDR classes a sponsor can actually declare, including the Class I variants', () => {
    const mdr = classificationNode('medical_device').fields.find(f => f.id === 'eu_mdr_class')!;
    expect(mdr.options!.map(o => o.value)).toEqual([
      'class_i',
      'class_is',
      'class_im',
      'class_ir',
      'class_iia',
      'class_iib',
      'class_iii',
      'na',
    ]);
  });
});

describe('the escape hatch on a catalogue that admits what it does not hold', () => {
  /* The flows that ask this question declare `allowOther` themselves. The
     resolver guarantees it anyway, because this catalogue covers the US and
     the EU only: without it, a required route question for a Japanese
     programme would have no answer that satisfies it — a deadlock, not a
     closed list. */
  const resolved = async (region: string | null) => {
    const { withGovernedOptions } = await import('../governed-options.js');
    const { programmeFactsFrom } = await import('../programme-facts.js');
    const answers = region ? { primary_regulatory_agency: region } : {};
    return withGovernedOptions(
      [{ id: 'route', label: 'Route', type: 'select', required: true, optionsFrom: 'device_pathway_positions' }],
      { facts: programmeFactsFrom(answers), answers, ctx: ctx('medtech') },
    )[0];
  };

  it('is added where the flow declared none and the catalogue holds nothing', async () => {
    const field = await resolved('JP');
    expect(field.options).toBeUndefined();
    expect(field.allowOther, 'a required question with no answer is a deadlock').toBeDefined();
  });

  it('is added where the flow declared none and the catalogue holds positions', async () => {
    const field = await resolved('US');
    expect((field.options ?? []).length).toBeGreaterThan(5);
    expect(field.allowOther, 'the catalogue admits it holds the US and the EU only').toBeDefined();
  });
});

describe('the order the questions are asked in', () => {
  const nextAfter = (nodeId: string, answers: Record<string, unknown>) =>
    advanceFlow(
      { ...stateWith({}), currentNodeId: nodeId },
      nodeId,
      answers,
      ctx('medtech'),
    ).event?.node.id;

  it('asks a device project its regulator BEFORE its route', () => {
    /* The device branch used to leave from `product_details`, so a device or
       diagnostics project never reached the agency question at all: the
       platform never learned its regulator, and the routes it offers could not
       be keyed to one. */
    expect(
      nextAfter('product_details', { product_name: 'Acme Stent', product_type: 'medical_device', therapeutic_area: 'cardiovascular' }),
      'a device project must still be asked its agency',
    ).toBe('regulatory_targets');
    expect(
      nextAfter('regulatory_targets', { primary_regulatory_agency: 'US', product_type: 'medical_device' }),
      'and then its classification',
    ).toBe('device_classification');
  });

  it('still sends a medicines project straight on, and a multi-country one to its timeline', () => {
    expect(nextAfter('regulatory_targets', { primary_regulatory_agency: 'US' })).toBe('submission_route');
    expect(nextAfter('submission_route', { submission_type: 'US_IND' })).toBe('team_assignment');
    expect(
      nextAfter('submission_route', { submission_type: 'US_IND', multi_country_submission: true }),
    ).toBe('multi_country_setup');
  });
});

describe('the answer the validator judges', () => {
  const submit = (agency: string, route: string) =>
    advanceFlow(
      stateWith({ regulatory_targets: { primary_regulatory_agency: agency, product_type: 'medical_device' } }),
      'medtech_regulatory',
      { device_submission_pathway: route },
      ctx('medtech'),
    );

  it('is judged against the list the person was shown, not against no list at all', () => {
    /* The field carries no static options, so a validator reading the raw flow
       definition would see a field with no list and accept any string. */
    const refused = submit('EU', 'US_510K');
    const errors = (refused.event?.newIssues ?? []).filter(i => i.checkId.startsWith('validation_'));
    expect(errors.length, 'a route that was never offered was accepted').toBe(1);
    expect(errors[0].message).toMatch(/not a valid option/i);
  });

  it('is not invalidated by an agency that arrives in the same answer', () => {
    /* The person was shown FDA's routes, because no agency had been named when
       the question was drawn. An agency arriving with their choice must not
       retroactively refuse it — but the record still catches the
       contradiction, because the trail is judged against everything known. */
    const result = advanceFlow(
      stateWith({}),
      'medtech_regulatory',
      { primary_regulatory_agency: 'EU', device_submission_pathway: 'US_510K' },
      ctx('medtech'),
    );
    const issues = result.event?.newIssues ?? result.completeEvent?.issues ?? [];
    expect(issues.filter(i => i.checkId.startsWith('validation_')), 'judged against a list never shown').toEqual([]);
    const noted = issues.find(i => i.checkId === 'cautioned_position_device_submission_pathway_US_510K');
    expect(noted, 'and yet the contradiction must be on the record').toBeDefined();
    expect(noted!.message).toMatch(/You have named EMA/);
  });

  it('accepts a route that was on that list', () => {
    const taken = submit('EU', 'EU_MDR_CLASS_IIB');
    expect((taken.event?.newIssues ?? []).filter(i => i.checkId.startsWith('validation_'))).toEqual([]);
    expect(taken.state.answers.medtech_regulatory.device_submission_pathway).toBe('EU_MDR_CLASS_IIB');
  });
});

/**
 * Which flows a client can reach at all (founder's directive, 2026-10-12).
 *
 * `getFlowDefinition` withholds a flow whose `clientTypes` exclude the client
 * (flows/index.ts), and the segment was derived as
 * `projectType === 'medtech' ? 'medtech' : … : 'pharma'` — but `projectType`
 * is the SUBMISSION type ('IND', '510k'), never 'medtech'. So every interview
 * ran as 'pharma' and the 510(k), PMA and CER flows were unreachable by the
 * very clients they are written for. A diagnostics programme had no segment
 * at all, so it was read as pharma too.
 */
describe('the client segment an interview runs under', () => {
  const definitionFor = async (clientType: FlowEngineContext['clientType'], category: string) => {
    const { getFlowDefinition } = await import('../flows/index.js');
    return getFlowDefinition(category as never, { organizationId: 7, userId: 3, projectId: null, clientType });
  };

  it('lets a device client reach the 510(k) interview', async () => {
    expect(await definitionFor('medtech', 'device_510k')).not.toBeNull();
  });

  it('lets a diagnostics client reach the 510(k) and PMA interviews', async () => {
    expect(await definitionFor('ivd', 'device_510k'), 'an IVD files a 510(k)').not.toBeNull();
    expect(await definitionFor('ivd', 'device_pma'), 'a Class III assay files a PMA').not.toBeNull();
  });

  it('withholds a device flow from a pharma client, which is the restriction working', async () => {
    expect(await definitionFor('pharma', 'device_510k')).toBeNull();
  });

  it('withholds nothing when the segment is unknown, rather than guessing pharma', async () => {
    expect(await definitionFor(null, 'device_510k'), 'not knowing must not hide the flow').not.toBeNull();
    expect(await definitionFor(null, 'ind_submission')).not.toBeNull();
  });

  it('reads a submission type as the segment it implies, and says nothing when it implies none', async () => {
    const { interviewClientType } = await import('../client-segment.js');
    // A segment passed directly, in any of the vocabularies in use.
    expect(interviewClientType('medtech')).toBe('medtech');
    expect(interviewClientType('mdx')).toBe('medtech');
    expect(interviewClientType('ivd')).toBe('ivd');
    expect(interviewClientType('biotech')).toBe('biotech');
    // A submission type implies the segment that files it.
    expect(interviewClientType('510k')).toBe('medtech');
    expect(interviewClientType('PMA')).toBe('medtech');
    expect(interviewClientType('IND')).toBe('pharma');
    expect(interviewClientType('bla')).toBe('pharma');
    // And where it says nothing, it says nothing — rather than 'pharma'.
    expect(interviewClientType('nonclinical_overview')).toBeNull();
    expect(interviewClientType('')).toBeNull();
    expect(interviewClientType(null)).toBeNull();
    expect(interviewClientType(undefined)).toBeNull();
  });
});
