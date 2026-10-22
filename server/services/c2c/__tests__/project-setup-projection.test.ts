/**
 * The project-setup interview configures the programme record, and says what
 * it could not configure (founder's directive, 2026-10-12; task #15).
 *
 * Nine slices of this batch made the interview governed: the agency is a
 * position, the route comes from the filing registry, the class is checked
 * against the Annex VIII rules, a programme not filing in the US can say so.
 * All of it ended in a completion event that went nowhere, and
 * `start_intelligence_flow` refuses such a flow in production for exactly that
 * reason — an interview whose answers reach no record is an empty result
 * standing in for a refusal.
 *
 * These tests hold both halves: what reaches the record, and that nothing
 * answered reaches NOTHING in silence.
 */
import { describe, expect, it } from 'vitest';

import { COMMITTING_FLOW_CATEGORIES, buildInterviewCommitPlan, flowCommitsToRecord } from '../../cmc/interview-commit';
import { programmeProfilePatchSchema, programmeProfileFields } from '../programme-profile-write';
import {
  NOT_PROJECTED,
  PROJECTED_FIELDS,
  projectSetupProgrammeConfiguration,
} from '../project-setup-projection';

/** A device programme, answered as a person would answer it. */
const DEVICE_ANSWERS = {
  project_identity: {
    project_name: 'CGM programme',
    project_code: 'CGM-2026-001',
    project_description: 'A continuous glucose monitor for adults.',
    development_phase: 'pivotal',
    target_submission_date: '2027-03-01',
    project_priority: 'standard',
  },
  product_details: {
    product_name: 'BX-204 CGM',
    product_type: 'medical_device',
    therapeutic_area: 'endocrinology',
    indication: 'Glycaemic monitoring in adults with type 1 diabetes',
  },
  regulatory_targets: {
    primary_regulatory_agency: 'US',
    multi_country_submission: true,
    additional_agencies: ['EU'],
  },
  device_classification: { device_class: 'class_ii', product_code: 'QAS', eu_mdr_class: 'class_iib' },
  medtech_regulatory: {
    device_submission_pathway: 'US_510K',
    predicate_device_name: 'GlucoTrend CGM System',
    predicate_510k_number: 'k123456',
    notified_body: 'BSI (2797)',
  },
  team_assignment: { project_lead: 'R. Okafor', regulatory_lead: 'J. Lindqvist', team_size: 9 },
  project_preferences: { project_timezone: 'Europe/Dublin', enable_ai_assistance: true },
};

const projected = (answers: Record<string, Record<string, unknown>>) =>
  projectSetupProgrammeConfiguration(answers);

const reasonFor = (answers: Record<string, Record<string, unknown>>, fieldId: string) =>
  projected(answers).unprojected.find(u => u.fieldId === fieldId)?.reason;

describe('what reaches the programme record', () => {
  it('carries the facts the record has columns for', () => {
    expect(projected(DEVICE_ANSWERS).patch).toEqual({
      euMdrClass: 'IIb',
      productName: 'BX-204 CGM',
      productCode: 'QAS',
      indication: 'Glycaemic monitoring in adults with type 1 diabetes',
      description: 'A continuous glucose monitor for adults.',
      deviceClass: 'II',
      regulatoryPath: '510k',
      targetSubmissionDate: '2027-03-01',
      priority: 'medium',
      targetAgencies: ['FDA', 'EMA'],
      teamMembers: [
        { name: 'R. Okafor', role: 'Project lead' },
        { name: 'J. Lindqvist', role: 'Regulatory lead' },
      ],
      predicateDevices: [{ id: 'K123456', name: 'GlucoTrend CGM System', kNumber: 'K123456' }],
    });
  });

  it('is a patch the write accepts, which is the only thing that makes it a record', () => {
    const parsed = programmeProfilePatchSchema.safeParse(projected(DEVICE_ANSWERS).patch);
    expect(parsed.success, JSON.stringify(parsed.success ? {} : parsed.error.flatten())).toBe(true);
  });

  it('reads the class through the governed reader rather than the answer’s spelling', () => {
    /* 'class_ii_pma' is a transitional device, Class III by FD&C Act 520(l)
       (2026-10-22); 'no_us_filing' and 'not_classified' state no class at all. */
    expect(projected({ d: { device_class: 'class_ii_pma' } }).patch.deviceClass).toBe('III');
    for (const value of ['no_us_filing', 'not_classified']) {
      const out = projected({ d: { device_class: value } });
      expect(out.patch.deviceClass, value).toBeUndefined();
      expect(out.unprojected.find(u => u.fieldId === 'device_class')?.reason, value).toMatch(/states no class/);
    }
  });

  it('names the agencies as the record names them, not as the question stores them', () => {
    /* The question stores canonical REGION codes; the column holds the
       agency. 'US' in that column would be a different value from 'FDA'. */
    const out = projected({ r: { primary_regulatory_agency: 'EU', additional_agencies: ['JP'] } });
    expect(out.patch.targetAgencies).toEqual(['EMA', 'PMDA']);
  });

  it('maps the interview’s priority onto the column’s, which has no "standard"', () => {
    expect(projected({ p: { project_priority: 'standard' } }).patch.priority).toBe('medium');
    expect(projected({ p: { project_priority: 'critical' } }).patch.priority).toBe('critical');
  });

  it('takes the US premarket path from the position the person took', () => {
    for (const [position, path] of [
      ['US_510K', '510k'],
      ['US_510K_IVD', '510k'],
      ['US_DE_NOVO', 'de_novo'],
      ['US_PMA_IVD', 'pma'],
      ['US_HDE', 'hde'],
      ['US_IDE', 'ide'],
    ] as const) {
      expect(projected({ m: { device_submission_pathway: position } }).patch.regulatoryPath, position).toBe(path);
    }
  });

  it('refuses to guess a US path for a route that is not one', () => {
    for (const position of ['EU_MDR_CLASS_IIB', 'US_513G', 'EU_CTA']) {
      const out = projected({ m: { device_submission_pathway: position } });
      expect(out.patch.regulatoryPath, position).toBeUndefined();
      expect(out.unprojected.find(u => u.fieldId === 'device_submission_pathway')?.reason, position).toMatch(
        /not a US premarket path/,
      );
    }
  });
});

describe('what it says about the answers it cannot carry', () => {
  it('reports every answered field no column took, with a reason', () => {
    const out = projected(DEVICE_ANSWERS);
    const reported = new Set(out.unprojected.map(u => u.fieldId));
    for (const field of [
      'project_name',
      'project_code',
      'development_phase',
      'product_type',
      'therapeutic_area',
      'notified_body',
      'team_size',
      'project_timezone',
      'multi_country_submission',
      'enable_ai_assistance',
    ]) {
      expect(reported.has(field), `${field} answered and not reported`).toBe(true);
    }
    for (const entry of out.unprojected) {
      expect(entry.reason.length, entry.fieldId).toBeGreaterThan(30);
      expect(entry.reason, entry.fieldId).not.toMatch(/no reason has been written/);
    }
  });

  it('says nothing about a field nobody answered', () => {
    const out = projected({ p: { project_priority: 'high' } });
    expect(out.unprojected.map(u => u.fieldId)).toEqual([]);
  });

  it('says the PRIMARY agency was recorded as a target and not applied as primary', () => {
    /* The write refuses `primaryAgency` — it keys the Module 1 backbone, the
       validation profile and the gateway — and this projected the answer only
       as a member of the target list. A programme answering "EMA is primary"
       kept `primary_agency = 'FDA'` with nothing saying so, because the field
       was on the projected list (2026-10-13 audit, DP-96). */
    const out = projected({ r: { primary_regulatory_agency: 'EU' } });
    expect(out.patch.targetAgencies, 'still recorded as a target').toEqual(['EMA']);
    const said = out.unprojected.find(u => u.fieldId === 'primary_regulatory_agency');
    expect(said?.reason, 'and the person is told what became of it').toMatch(
      /Module 1 backbone.*set when the programme is created/s,
    );
  });

  it('distinguishes a refused column from a column that does not exist', () => {
    expect(reasonFor(DEVICE_ANSWERS, 'project_name'), 'refused: a rename is its own action').toMatch(
      /own governed action/,
    );
    expect(reasonFor(DEVICE_ANSWERS, 'notified_body'), 'no column holds it').toMatch(/No column holds the notified body/);
    expect(reasonFor(DEVICE_ANSWERS, 'multi_country_submission'), 'not a fact of its own').toMatch(/gate/);
  });

  /**
   * Until 2026-10-19 one box asked for "K123456 — Brand Name by Manufacturer"
   * and the projection refused it outright: the predicate of record carries
   * the trade name the official eSTAR prints BESIDE the submission number, and
   * reading a trade name out of that blob would be asserting one. So a
   * programme named its predicate and the record kept nothing. The interview
   * now asks the two facts the form prints.
   */
  it('files the predicate of record from the two facts the eSTAR prints', () => {
    expect(projected(DEVICE_ANSWERS).patch.predicateDevices).toEqual([
      { id: 'K123456', name: 'GlucoTrend CGM System', kNumber: 'K123456' },
    ]);
  });

  it('refuses a submission number that is not one, rather than printing it on a form', () => {
    const answers = (n: string) => ({
      medtech_regulatory: { predicate_device_name: 'GlucoTrend CGM System', predicate_510k_number: n },
    });
    for (const bad of ['K12345', 'DEN200001', 'K1234567', '123456', 'see attached']) {
      expect(projected(answers(bad)).patch.predicateDevices, bad).toBeUndefined();
      expect(reasonFor(answers(bad), 'predicate_510k_number'), bad).toMatch(/six digits/);
    }
    expect(projected(answers('k123456')).patch.predicateDevices, 'the person’s case is not their mistake').toEqual([
      { id: 'K123456', name: 'GlucoTrend CGM System', kNumber: 'K123456' },
    ]);
  });

  it('files neither half alone, and says which half is missing', () => {
    const nameOnly = { medtech_regulatory: { predicate_device_name: 'GlucoTrend CGM System' } };
    expect(projected(nameOnly).patch.predicateDevices, 'half a claim of substantial equivalence').toBeUndefined();
    expect(reasonFor(nameOnly, 'predicate_510k_number')).toMatch(/submission number/);

    const numberOnly = { medtech_regulatory: { predicate_510k_number: 'K123456' } };
    expect(projected(numberOnly).patch.predicateDevices).toBeUndefined();
    expect(reasonFor(numberOnly, 'predicate_device_name')).toMatch(/trade name/);
  });

  it('keeps the development phase away from the workflow phase', () => {
    expect(reasonFor(DEVICE_ANSWERS, 'development_phase')).toMatch(/not the workflow phase/);
  });
});

describe('the European classifications, which had no column until 2026-10-12', () => {
  it('records the class the sponsor DECLARED, not the one the rules yield', () => {
    /* programmeFactsFrom reads Is/Im/Ir onto Class I, because the caution
       rules reason about the four the Annex VIII rules yield. The record keeps
       the seven a sponsor declares: the notified body's involvement for the
       sterile, metrological or reprocessing aspect follows from them. */
    for (const [answer, declared] of [
      ['class_is', 'Is'],
      ['class_im', 'Im'],
      ['class_ir', 'Ir'],
      ['class_iia', 'IIa'],
      ['class_iii', 'III'],
    ] as const) {
      expect(projected({ d: { eu_mdr_class: answer } }).patch.euMdrClass, answer).toBe(declared);
    }
  });

  it('clears the column where no EU filing is planned, rather than standing a class in it', () => {
    const out = projected({ d: { eu_mdr_class: 'na' } });
    expect(out.patch.euMdrClass, 'null withdraws; undefined would leave a stale class').toBeNull();
    expect('euMdrClass' in out.patch).toBe(true);
  });

  it('records the IVDR class on its own column, for its own regulation', () => {
    for (const cls of ['A', 'B', 'C', 'D'] as const) {
      expect(projected({ d: { ivdr_class: cls } }).patch.euIvdrClass, cls).toBe(cls);
    }
    /* And not onto the MDR column: they are different regulations. */
    expect(projected({ d: { ivdr_class: 'C' } }).patch.euMdrClass).toBeUndefined();
    expect(projected({ d: { eu_mdr_class: 'class_iib' } }).patch.euIvdrClass).toBeUndefined();
  });

  it('keeps a class in the person’s own words off the record as a class', () => {
    const out = projected({ d: { ivdr_class: '__other__' } });
    expect(out.patch.euIvdrClass).toBeUndefined();
    expect(out.unprojected.find(u => u.fieldId === 'ivdr_class')?.reason).toMatch(/own words/);
  });

  it('never puts a European class in the US column, which is printed on a US form', () => {
    const out = projected({ d: { eu_mdr_class: 'class_iib', ivdr_class: 'C' } });
    expect(out.patch.deviceClass, 'the US class is stated by its own question').toBeUndefined();
  });
});

describe('the two lists, in both directions', () => {
  it('every field the interview can answer is projected or has a written reason', async () => {
    /* The gate that makes "no answer evaporates" true rather than intended. A
       field added to the flow and to neither list fails here. */
    const { getAvailableFlows, getFlowDefinition } = await import(
      '../../ana/intelligence-questions/flows/index.js'
    );
    const ctx = { organizationId: 7, userId: 3, projectId: null } as never;
    const listed = getAvailableFlows(ctx).find(f => f.category === 'project_setup');
    expect(listed, 'project_setup is a listed flow').toBeDefined();
    const definition = getFlowDefinition('project_setup', ctx)!;
    const unaccounted: string[] = [];
    let seen = 0;
    for (const node of definition.nodes) {
      for (const field of node.fields) {
        seen += 1;
        if (PROJECTED_FIELDS.includes(field.id)) continue;
        if (NOT_PROJECTED[field.id]) continue;
        unaccounted.push(`${node.id}.${field.id}`);
      }
    }
    expect(seen, 'a scan that saw no fields proves nothing').toBeGreaterThan(40);
    expect(unaccounted, 'an answer that would reach neither a column nor a reason').toEqual([]);
  });

  it('writes no reason, and reads no field, the interview does not ask', async () => {
    /* The other direction, and the one a count cannot check: a stale entry is
       how a reason list becomes a place to hide a field that was renamed —
       after which the renamed field evaporates and the list still looks
       complete. */
    const { getFlowDefinition } = await import('../../ana/intelligence-questions/flows/index.js');
    const ctx = { organizationId: 7, userId: 3, projectId: null } as never;
    const asked = new Set(
      getFlowDefinition('project_setup', ctx)!.nodes.flatMap(n => n.fields.map(f => f.id)),
    );
    const stale = [...Object.keys(NOT_PROJECTED), ...PROJECTED_FIELDS].filter(f => !asked.has(f));
    expect(stale, 'an entry for a field project_setup does not ask').toEqual([]);
    expect(Object.keys(NOT_PROJECTED).length, 'a list this short would prove nothing').toBeGreaterThan(20);
  });

  it('projects nothing the write cannot set', () => {
    const settable = new Set(programmeProfileFields());
    const unknown = Object.keys(projected(DEVICE_ANSWERS).patch).filter(k => !settable.has(k));
    expect(unknown, 'a projected key the write refuses').toEqual([]);
  });
});

describe('the commit plan the interview produces', () => {
  it('is one entry, naming the programme record and the fields it sets', () => {
    const plan = buildInterviewCommitPlan('project_setup', DEVICE_ANSWERS);
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0]!.register).toBe('programme_configuration');
    expect(plan.entries[0]!.key).toBe('programme_configuration:project_setup');
    expect(plan.entries[0]!.source.fieldIds, 'the columns, for the provenance').toContain('deviceClass');
    expect(plan.unprojected.length, 'and the answers it could not carry').toBeGreaterThan(5);
  });

  it('is NO entry where the answers set nothing, so an empty update is never called a configuration', () => {
    const plan = buildInterviewCommitPlan('project_setup', { p: { enable_ai_assistance: true } });
    expect(plan.entries).toEqual([]);
    expect(plan.unprojected.map(u => u.fieldId)).toEqual(['enable_ai_assistance']);
  });

  it('is what the launch-scope gate now admits', () => {
    expect(flowCommitsToRecord('project_setup')).toBe(true);
    expect([...COMMITTING_FLOW_CATEGORIES]).toContain('project_setup');
  });
});
