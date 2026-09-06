/**
 * The interview → register projector.
 *
 * ── The plan is pure ─────────────────────────────────────────────────────────
 * `buildInterviewCommitPlan` maps a completed CMC interview's answers onto the
 * register write paths as `{ register, body }` entries. The contract these
 * tests pin:
 *   • deterministic — same answers, same plan, same keys;
 *   • one entry per record the answers describe, and no entry for a node the
 *     interview never reached;
 *   • NO PLACEHOLDERS — a field the interview did not ask for, or the user did
 *     not answer, is absent from the body; nothing is defaulted, ever. A
 *     register column the answers cannot fill stays unfilled and the write
 *     path refuses it, which is reported, not hidden;
 *   • every answered field is either consumed by an entry or listed in
 *     `unprojected` with the reason, so nothing evaporates silently.
 *
 * ── The commit is bookkeeping around an injected writer ──────────────────────
 * `commitInterviewSession` loads the session, refuses when the project is
 * missing or the session is not complete, executes the plan through the
 * writer, records every ref, and moves the status only when EVERY entry
 * landed. A failure mid-way leaves the status at 'complete' and records what
 * did land so a retry skips it.
 */
import { describe, it, expect, vi } from 'vitest';

import {
  buildInterviewCommitPlan,
  commitInterviewSession,
  productionRegisterWriter,
  INTERVIEW_REGISTER_WRITE_PATHS,
  type RegisterWriter,
} from '../interview-commit';
import type { Queryable } from '../interview-sessions';
import type { FlowState } from '../../../../shared/types/intelligence-questions';

/* ─── A fully answered CMC interview ─────────────────────────────────────── */

const ANSWERS: Record<string, Record<string, unknown>> = {
  substance_identification: {
    inn_name: 'Examplumab',
    chemical_name: '(2S)-2-amino-3-(4-hydroxyphenyl)propanoic acid',
    cas_number: '1374853-91-4',
    molecular_formula: 'C6H12O6',
    molecular_weight: 180.16,
  },
  substance_classification: {
    molecule_type: 'small_molecule',
    therapeutic_area: 'oncology',
    development_phase: 'phase_3',
    is_sterile: 'no',
  },
  physicochemical_properties: {
    physical_form: 'crystalline',
    polymorphic_forms: 'no',
    solubility_profile: 'pH 1.2: 5.2 mg/mL; pH 6.8: 0.03 mg/mL',
    bcs_class: 'class_ii',
  },
  synthetic_route: {
    ds_process_name: 'Route B, Process v3',
    synthesis_overview: 'Seven-step convergent synthesis from SM-1 and SM-2 with a final recrystallisation from ethanol/water.',
    number_of_steps: '7',
    manufacturing_sites: 'Site A — steps 1–4; Site B — steps 5–7 and purification',
    manufacturing_scale: 'pilot',
    process_changes: 'yes',
    process_change_details: 'Step 3 solvent changed from DCM to 2-MeTHF; three bridging batches compared.',
  },
  critical_process_parameters: {
    cqas_identified: 'Assay ≥ 98.0%\nTotal impurities ≤ 1.5%',
    cpps_identified: '- Reaction temperature Step 3 (65–75 °C)\n- Crystallization cooling rate (0.5–1.0 °C/min)',
    design_space_established: 'no',
    risk_assessment_method: ['fmea', 'doe'],
  },
  starting_materials: {
    starting_material_list: 'SM-1: 4-hydroxyphenylalanine, Supplier X, in-house spec',
    starting_material_justification: 'SM-1 is a commercially available, well-characterised substance several steps from the API.',
    number_of_suppliers: 'dual',
    supplier_qualification: ['audit', 'coa_testing'],
  },
  structural_characterization: {
    characterization_study_title: 'Structure elucidation package, Report R-2025-014',
    characterization_methods: ['nmr', 'mass_spec', 'ir'],
    characterization_summary: 'NMR and HRMS confirm the assigned structure; IR consistent with the amide and phenol.',
    chirality: 'yes',
    chirality_control: 'Chiral HPLC on release; enantiomeric purity ≥ 99.5%.',
  },
  impurity_profile: {
    organic_impurities: 'Impurity A (des-methyl), 0.08%; Impurity B (N-oxide), 0.05%',
    inorganic_impurities: 'Pd from Step 5 hydrogenation, < 10 ppm; ICH Q3D risk assessment complete',
    residual_solvents: 'Ethanol (Class 3) 1200 ppm; 2-MeTHF (Class 3) 300 ppm',
    max_daily_dose: '200',
    unqualified_impurities: 'no',
  },
  genotoxic_impurities: {
    mutagenic_impurity_assessment: 'yes',
    alerting_structures_identified: '2',
    confirmed_mutagens: 'None confirmed (Ames negative).',
    genotox_control_strategy: 'option_4',
  },
  formulation_composition: {
    product_name: 'Examplumab 50 mg film-coated tablets',
    formulation_name: 'F-07 (Phase 3 formulation)',
    dosage_form: 'tablet',
    strengths: '25 mg, 50 mg',
    route_of_administration: 'oral',
    formulation_composition_detail: '- Active: Examplumab — 50 mg\n- Filler: Microcrystalline cellulose NF — 150 mg',
    formulation_rationale: 'Immediate-release tablet selected for a BCS II compound with adequate dissolution.',
  },
  excipient_selection: {
    excipient_compatibility_studies: 'yes',
    compatibility_study_details: 'Binary mixtures at 40 °C/75% RH for 4 weeks; no incompatibility.',
    novel_excipients_used: 'yes',
    functional_excipients: 'Croscarmellose sodium (disintegrant) is critical to dissolution.',
  },
  novel_excipient_characterization: {
    novel_excipient_name: 'Soluplus® (polyvinyl caprolactam-polyvinyl acetate-polyethylene glycol graft copolymer)',
    novel_excipient_function: 'Amorphous solid dispersion carrier for solubility enhancement',
    novel_excipient_safety_data: ['repeat_dose_90', 'genotoxicity'],
    novel_excipient_amount: '200',
  },
  manufacturing_overview: {
    dp_process_name: 'Wet granulation process, v2',
    dp_manufacturing_description: 'Weighing → high-shear wet granulation → fluid-bed drying → blending → compression → film coating → packaging.',
    batch_formula: 'Commercial batch: 100,000 units; 2% coating overage justified by process loss.',
    dp_manufacturing_site: 'Site C — formulation, compression, coating and packaging',
    equipment_type: 'Fluid bed granulator (Glatt)\nRotary tablet press (Fette)',
    sterile_manufacturing: 'not_applicable',
  },
  process_validation: {
    validation_stage: 'stage_2_executing',
    ppq_batches: '3 planned, 2 completed',
    ppq_acceptance_criteria: 'Cpk ≥ 1.33 on assay and content uniformity',
    process_validation_complete: 'no',
  },
  in_process_controls: {
    ipc_list: '- Granulation: LOD ≤ 2.5%\n- Compression: hardness 8–12 kP',
    pat_implemented: 'no',
    rtrt_planned: 'no',
  },
  analytical_methods: {
    compendial_methods: ['usp'],
    key_analytical_methods: 'RP-HPLC (assay, related substances); KF (water)',
    method_validation_status: 'all_validated',
    method_transfer_planned: 'no',
  },
  specification_setting: {
    ds_specification_tests: 'Appearance, identity (IR, HPLC), assay, related substances, residual solvents, water',
    dp_specification_tests: 'Appearance, identity, assay, related substances, dissolution, uniformity of dosage units',
    specification_justification: ['batch_data', 'stability'],
    number_of_batches: '12',
  },
  reference_standards: {
    primary_reference_standard: 'In-house primary standard lot RS-001, characterised by NMR/MS/HPLC, assigned purity 99.6%.',
    pharmacopeial_standards_available: 'no',
    reference_standard_requalification: 'annual',
    impurity_reference_standards: 'Impurity A synthesised in-house, 98.5%.',
  },
  container_closure: {
    container_system_name: '10 mL vial / 20 mm stopper',
    primary_packaging: '10 mL Type I borosilicate glass vial (Schott), 20 mm neck finish',
    closure_description: '20 mm bromobutyl rubber stopper (West 4432/50) with aluminum flip-off seal',
    secondary_packaging: 'Carton of 10 vials',
    el_assessment: 'yes',
    el_assessment_details: 'Controlled extraction study on stopper and vial; no leachable above the AET after 12 months.',
    cci_testing: 'dye_ingress',
  },
  stability_program: {
    ds_stability_conditions: ['long_term_25', 'accelerated'],
    ds_stability_duration: '24',
    dp_stability_conditions: ['long_term_25', 'accelerated'],
    dp_stability_duration: '18',
    proposed_shelf_life: 'DS: 36 months at 25 °C; DP: 24 months at 25 °C/60% RH',
    stability_batches: 'DS: 3 pilot batches; DP: 3 registration batches',
    stability_indicating: 'yes',
  },
};

const byKey = (plan: ReturnType<typeof buildInterviewCommitPlan>) =>
  Object.fromEntries(plan.entries.map(e => [e.key, e]));

/* ─── The plan ────────────────────────────────────────────────────────────── */

describe('buildInterviewCommitPlan — cmc_specification', () => {
  const plan = buildInterviewCommitPlan('cmc_specification', ANSWERS);
  const entries = byKey(plan);

  it('is deterministic', () => {
    expect(buildInterviewCommitPlan('cmc_specification', ANSWERS)).toEqual(plan);
  });

  it('describes exactly the eight records the answers describe, each on a real write path', () => {
    expect(Object.keys(entries).sort()).toEqual([
      'characterization_study:structural_characterization',
      'container_closure:container_closure',
      'drug_product:formulation_composition',
      'drug_substance:substance_identification+substance_classification',
      'formulation_record:formulation_composition+manufacturing_overview',
      'manufacturing_process:manufacturing_overview+process_validation+in_process_controls+substance_classification',
      'manufacturing_process:synthetic_route+critical_process_parameters',
      'material_spec:novel_excipient_characterization',
    ]);
    for (const e of plan.entries) {
      expect(INTERVIEW_REGISTER_WRITE_PATHS[e.register].path).toMatch(/^\/api\/cmc\//);
    }
  });

  it('drug substance: identity as answered, the phase as its label, the weight as the decimal string the column takes', () => {
    expect(entries['drug_substance:substance_identification+substance_classification'].body).toEqual({
      substanceName: 'Examplumab',
      inn: 'Examplumab',
      casNumber: '1374853-91-4',
      molecularFormula: 'C6H12O6',
      molecularWeight: '180.16',
      developmentPhase: 'Phase 3',
    });
  });

  it('drug product: the product identity and route, with select answers as their labels', () => {
    expect(entries['drug_product:formulation_composition'].body).toEqual({
      productName: 'Examplumab 50 mg film-coated tablets',
      dosageForm: 'Tablet (Immediate Release)',
      strength: '25 mg, 50 mg',
      routeOfAdministration: 'Oral',
    });
  });

  it('formulation record: one component row per line as typed, batch formula from the manufacturing node', () => {
    expect(entries['formulation_record:formulation_composition+manufacturing_overview'].body).toEqual({
      formulationName: 'F-07 (Phase 3 formulation)',
      dosageForm: 'Tablet (Immediate Release)',
      strength: '25 mg, 50 mg',
      components: [
        { component: 'Active: Examplumab — 50 mg' },
        { component: 'Filler: Microcrystalline cellulose NF — 150 mg' },
      ],
      batchSize: 'Commercial batch: 100,000 units; 2% coating overage justified by process loss.',
    });
  });

  it('container closure: the drug-product primary system, E&L conclusion and CCI method as recorded', () => {
    expect(entries['container_closure:container_closure'].body).toEqual({
      scope: 'drug_product',
      componentType: 'primary',
      systemName: '10 mL vial / 20 mm stopper',
      containerDescription: '10 mL Type I borosilicate glass vial (Schott), 20 mm neck finish',
      closureDescription: '20 mm bromobutyl rubber stopper (West 4432/50) with aluminum flip-off seal',
      extractablesLeachables: {
        conclusion: 'Controlled extraction study on stopper and vial; no leachable above the AET after 12 months.',
      },
      integrityTesting: { method: 'Dye Ingress / Blue Dye' },
    });
  });

  it('drug substance process: prose to text columns, CPPs one row per line, development history labelled', () => {
    expect(entries['manufacturing_process:synthetic_route+critical_process_parameters'].body).toEqual({
      processName: 'Route B, Process v3',
      processType: 'drug_substance',
      processDescription: 'Seven-step convergent synthesis from SM-1 and SM-2 with a final recrystallisation from ethanol/water.',
      facilityInfo: { manufacturingSites: 'Site A — steps 1–4; Site B — steps 5–7 and purification' },
      batchSize: 'Pilot Scale (1–100 kg)',
      criticalProcessParameters: [
        { parameter: 'Reaction temperature Step 3 (65–75 °C)' },
        { parameter: 'Crystallization cooling rate (0.5–1.0 °C/min)' },
      ],
      processDevelopment: [
        'Number of synthetic / process steps: 7',
        'Process changes during development: Yes — Step 3 solvent changed from DCM to 2-MeTHF; three bridging batches compared.',
        'Critical Quality Attributes (CQAs): Assay ≥ 98.0%\nTotal impurities ≤ 1.5%',
        'Design space established: No',
        'Risk assessment methodology: FMEA (Failure Mode & Effects Analysis); Design of Experiments (DoE)',
      ].join('\n\n'),
    });
  });

  it('drug product process: equipment and IPCs one row per line, validation and sterility state labelled', () => {
    expect(entries['manufacturing_process:manufacturing_overview+process_validation+in_process_controls+substance_classification'].body).toEqual({
      processName: 'Wet granulation process, v2',
      processType: 'drug_product',
      processDescription: 'Weighing → high-shear wet granulation → fluid-bed drying → blending → compression → film coating → packaging.',
      facilityInfo: { manufacturingSites: 'Site C — formulation, compression, coating and packaging' },
      equipmentList: [
        { equipment: 'Fluid bed granulator (Glatt)' },
        { equipment: 'Rotary tablet press (Fette)' },
      ],
      processControls: [
        { control: 'Granulation: LOD ≤ 2.5%' },
        { control: 'Compression: hardness 8–12 kP' },
      ],
      processDevelopment: [
        'Sterile product: No',
        'Sterilization approach: Not Applicable (non-sterile product)',
        'Process validation stage: Stage 2 — PPQ Execution In Progress',
        'PPQ batches planned / completed: 3 planned, 2 completed',
        'PPQ acceptance criteria: Cpk ≥ 1.33 on assay and content uniformity',
        'Process validation complete: No',
        'PAT implemented: No',
        'Real-time release testing planned: No',
      ].join('\n\n'),
    });
  });

  it('novel excipient: a material spec flagged novel, with the safety package as recorded', () => {
    expect(entries['material_spec:novel_excipient_characterization'].body).toEqual({
      materialRole: 'excipient',
      materialName: 'Soluplus® (polyvinyl caprolactam-polyvinyl acetate-polyethylene glycol graft copolymer)',
      functionInFormulation: 'Amorphous solid dispersion carrier for solubility enhancement',
      novelExcipient: true,
      novelExcipientJustification: [
        'Safety data available: 90-Day Repeat Dose Toxicity; Genotoxicity Battery',
        'Amount per dose (mg): 200',
      ].join('\n\n'),
    });
  });

  it('characterization study: structural, the techniques as labels, chirality in supporting data', () => {
    expect(entries['characterization_study:structural_characterization'].body).toEqual({
      scope: 'drug_substance',
      studyType: 'structural',
      studyTitle: 'Structure elucidation package, Report R-2025-014',
      technique: '¹H / ¹³C NMR; Mass Spectrometry (MS / HRMS); Infrared Spectroscopy (IR / FTIR)',
      conclusion: 'NMR and HRMS confirm the assigned structure; IR consistent with the amide and phenol.',
      supportingData: [
        { label: 'Chiral centers', value: 'Yes' },
        { label: 'Chirality control strategy', value: 'Chiral HPLC on release; enantiomeric purity ≥ 99.5%.' },
      ],
    });
  });

  it('every answered field is consumed by an entry or listed as unprojected with a reason — nothing evaporates', () => {
    const consumed = new Set(plan.entries.flatMap(e => e.source.fieldIds.map(f => `${e.source.nodeIds[0]}::${f}`)));
    const listed = new Set(plan.unprojected.map(u => `${u.nodeId}.${u.fieldId}`));
    for (const [nodeId, fields] of Object.entries(ANSWERS)) {
      for (const fieldId of Object.keys(fields)) {
        const isConsumed = plan.entries.some(e => e.source.nodeIds.includes(nodeId) && e.source.fieldIds.includes(fieldId));
        expect(
          isConsumed || listed.has(`${nodeId}.${fieldId}`),
          `${nodeId}.${fieldId} neither projected nor reported`,
        ).toBe(true);
        expect(isConsumed && listed.has(`${nodeId}.${fieldId}`), `${nodeId}.${fieldId} both projected and reported`).toBe(false);
      }
    }
    expect(consumed.size).toBeGreaterThan(0);
    for (const u of plan.unprojected) expect(u.reason.length).toBeGreaterThan(20);
  });

  it('names the answers no register can take, with the reason', () => {
    const find = (nodeId: string, fieldId: string) => plan.unprojected.find(u => u.nodeId === nodeId && u.fieldId === fieldId);
    expect(find('substance_identification', 'chemical_name')?.reason).toMatch(/drug_substances/);
    expect(find('container_closure', 'secondary_packaging')?.reason).toMatch(/one system per row/);
    expect(find('stability_program', 'proposed_shelf_life')?.reason).toMatch(/stability_studies/);
    expect(find('impurity_profile', 'organic_impurities')?.reason).toMatch(/cmc_impurity_profiles/);
    expect(find('formulation_composition', 'formulation_rationale')?.reason).toMatch(/§3\.2\.P\.2/);
    expect(find('reference_standards', 'primary_reference_standard')?.reason).toMatch(/cmc_reference_standards/);
  });
});

describe('buildInterviewCommitPlan — no placeholders', () => {
  it('omits every field the interview did not capture; nothing is defaulted', () => {
    const plan = buildInterviewCommitPlan('cmc_specification', {
      container_closure: {
        // No system name, no closure description (an interview completed
        // before those fields existed), E&L not performed, CCI not applicable.
        primary_packaging: 'HDPE bottle with induction seal',
        el_assessment: 'no',
        cci_testing: 'not_applicable',
      },
    });
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0].body).toEqual({
      scope: 'drug_product',
      componentType: 'primary',
      containerDescription: 'HDPE bottle with induction seal',
    });
    // The two required columns are simply absent — the write path refuses
    // them and the refusal is reported. They are never filled with 'TBD'.
    expect(plan.entries[0].body).not.toHaveProperty('systemName');
    expect(plan.entries[0].body).not.toHaveProperty('closureDescription');
    expect(plan.entries[0].body).not.toHaveProperty('extractablesLeachables');
    expect(plan.entries[0].body).not.toHaveProperty('integrityTesting');
  });

  it('blank answers are not answers', () => {
    const plan = buildInterviewCommitPlan('cmc_specification', {
      substance_identification: { inn_name: '   ', cas_number: '', molecular_formula: 'C2H6O' },
    });
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0].body).toEqual({ molecularFormula: 'C2H6O' });
    expect(plan.unprojected).toEqual([]);
  });

  it('emits no entry for a node the interview never reached', () => {
    const plan = buildInterviewCommitPlan('cmc_specification', {
      substance_identification: { inn_name: 'Examplumab' },
    });
    expect(plan.entries.map(e => e.register)).toEqual(['drug_substance']);
  });

  it('projects nothing for a flow with no register mapping, and says so per answer', () => {
    const plan = buildInterviewCommitPlan('protocol_development', { study_design: { phase: 'phase_3' } });
    expect(plan.entries).toEqual([]);
    expect(plan.unprojected).toEqual([
      { nodeId: 'study_design', fieldId: 'phase', reason: expect.stringMatching(/protocol_development/) },
    ]);
  });
});

/* ─── The commit ──────────────────────────────────────────────────────────── */

const ORG = 42;
const SESSION_ID = '5f1c2a7e-9c41-4b6a-8d3e-2f0a1b2c3d4e';

function completeState(answers: Record<string, Record<string, unknown>> = ANSWERS): FlowState {
  return {
    flowId: 'cmc-specification-v1',
    flowCategory: 'cmc_specification',
    currentNodeId: 'stability_program',
    answers,
    completedNodes: Object.keys(answers),
    issues: [],
    startedAt: '2026-09-06T00:00:00.000Z',
    complete: true,
    sectionProgress: {},
  };
}

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    organization_id: ORG,
    project_id: 'prog-1',
    user_id: 7,
    flow_id: 'cmc-specification-v1',
    flow_category: 'cmc_specification',
    state: completeState(),
    status: 'complete',
    committed_record_refs: null,
    created_at: new Date('2026-09-06T00:00:00.000Z'),
    updated_at: new Date('2026-09-06T00:00:00.000Z'),
    ...overrides,
  };
}

/** A pool that answers the load from `row` and echoes every UPDATE. */
function fakePool(row: Record<string, unknown> | null) {
  const statements: Array<{ text: string; params: unknown[] }> = [];
  const q: Queryable = {
    async query(text: string, params: unknown[] = []) {
      statements.push({ text, params });
      if (/^\s*SELECT/.test(text)) return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      if (/^\s*UPDATE/.test(text) && row) {
        const status = /status = 'committed'/.test(text) ? 'committed' : String(row.status);
        const refs = params[2] !== undefined ? JSON.parse(String(params[2])) : row.committed_record_refs;
        return { rows: [{ ...row, status, committed_record_refs: refs }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  return { q, statements };
}

describe('commitInterviewSession', () => {
  it('executes every plan entry through the writer with the tenant scope, records the refs, and marks the session committed', async () => {
    const { q, statements } = fakePool(sessionRow());
    const writer = vi.fn<RegisterWriter>(async (entry) => ({ id: `${entry.register}-id`, module3Linked: true }));

    const outcome = await commitInterviewSession({ organizationId: ORG, sessionId: SESSION_ID, userId: 7 }, { writer, q });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.status).toBe('committed');
    expect(writer).toHaveBeenCalledTimes(8);
    for (const call of writer.mock.calls) {
      expect(call[1]).toEqual({ organizationId: ORG, projectId: 'prog-1', userId: 7 });
    }
    expect(outcome.refs).toHaveLength(8);
    expect(outcome.refs.map(r => r.register).sort()).toEqual([
      'characterization_study', 'container_closure', 'drug_product', 'drug_substance',
      'formulation_record', 'manufacturing_process', 'manufacturing_process', 'material_spec',
    ]);
    const committedUpdate = statements.find(s => /status = 'committed'/.test(s.text));
    expect(committedUpdate).toBeTruthy();
    expect(committedUpdate!.params[1]).toBe(ORG);
    expect(JSON.parse(String(committedUpdate!.params[2]))).toHaveLength(8);
    expect(outcome.unprojected.length).toBeGreaterThan(0);
  });

  it('refuses when the session has no project and none is supplied — nothing is written', async () => {
    const { q, statements } = fakePool(sessionRow({ project_id: null }));
    const writer = vi.fn<RegisterWriter>();

    const outcome = await commitInterviewSession({ organizationId: ORG, sessionId: SESSION_ID, userId: 7 }, { writer, q });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe('PROJECT_REQUIRED');
    expect(outcome.status).toBe('complete');
    expect(writer).not.toHaveBeenCalled();
    expect(statements.filter(s => /^\s*UPDATE/.test(s.text))).toEqual([]);
  });

  it('a project supplied at commit time binds a session that had none', async () => {
    const { q } = fakePool(sessionRow({ project_id: null }));
    const writer = vi.fn<RegisterWriter>(async (entry) => ({ id: `${entry.register}-id` }));

    const outcome = await commitInterviewSession(
      { organizationId: ORG, sessionId: SESSION_ID, userId: 7, projectId: 'prog-9' },
      { writer, q },
    );

    expect(outcome.ok).toBe(true);
    expect(writer.mock.calls[0][1].projectId).toBe('prog-9');
  });

  it('refuses a session that is not complete — nothing is written', async () => {
    const { q } = fakePool(sessionRow({ status: 'active', state: { ...completeState(), complete: false } }));
    const writer = vi.fn<RegisterWriter>();
    const outcome = await commitInterviewSession({ organizationId: ORG, sessionId: SESSION_ID, userId: 7 }, { writer, q });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe('SESSION_NOT_COMPLETE');
    expect(writer).not.toHaveBeenCalled();
  });

  it('a write failure mid-way: status stays complete, what landed is recorded AND reported, the rest is named', async () => {
    const { q, statements } = fakePool(sessionRow());
    let n = 0;
    const writer = vi.fn<RegisterWriter>(async (entry) => {
      n += 1;
      if (n === 3) throw new Error(`400 Invalid payload: closureDescription is required (${entry.register})`);
      return { id: n };
    });

    const outcome = await commitInterviewSession({ organizationId: ORG, sessionId: SESSION_ID, userId: 7 }, { writer, q });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe('WRITE_FAILED');
    expect(outcome.status).toBe('complete');
    expect(outcome.committed).toHaveLength(2);
    expect(outcome.failed?.error).toMatch(/closureDescription is required/);
    expect(outcome.remaining).toHaveLength(8 - 2 - 1);
    // Partial refs are persisted without moving the status.
    const partial = statements.find(s => /committed_record_refs = \$3::jsonb/.test(s.text));
    expect(partial).toBeTruthy();
    expect(partial!.text).not.toMatch(/status = 'committed'/);
    expect(JSON.parse(String(partial!.params[2]))).toHaveLength(2);
    expect(statements.some(s => /status = 'committed'/.test(s.text))).toBe(false);
  });

  it('a retry skips the entries a previous partial commit already wrote', async () => {
    const plan = buildInterviewCommitPlan('cmc_specification', ANSWERS);
    const already = plan.entries.slice(0, 2).map(e => ({
      key: e.key, register: e.register, id: `old-${e.register}`, committedAt: '2026-09-06T00:00:00.000Z',
    }));
    const { q, statements } = fakePool(sessionRow({ committed_record_refs: already }));
    const writer = vi.fn<RegisterWriter>(async (entry) => ({ id: `new-${entry.register}` }));

    const outcome = await commitInterviewSession({ organizationId: ORG, sessionId: SESSION_ID, userId: 7 }, { writer, q });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(writer).toHaveBeenCalledTimes(6);
    expect(writer.mock.calls.map(c => c[0].key)).not.toContain(already[0].key);
    expect(outcome.skipped.map(r => r.key)).toEqual(already.map(r => r.key));
    expect(outcome.refs).toHaveLength(8);
    const committedUpdate = statements.find(s => /status = 'committed'/.test(s.text))!;
    expect(JSON.parse(String(committedUpdate.params[2])).map((r: any) => r.id)).toEqual(
      expect.arrayContaining(['old-drug_substance', 'old-drug_product']),
    );
  });

  it('a committed session is not committed twice — the recorded refs are returned', async () => {
    const refs = [{ key: 'k', register: 'drug_substance', id: 1, committedAt: '2026-09-06T00:00:00.000Z' }];
    const { q, statements } = fakePool(sessionRow({ status: 'committed', committed_record_refs: refs }));
    const writer = vi.fn<RegisterWriter>();
    const outcome = await commitInterviewSession({ organizationId: ORG, sessionId: SESSION_ID, userId: 7 }, { writer, q });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.alreadyCommitted).toBe(true);
    expect(outcome.refs).toEqual(refs);
    expect(writer).not.toHaveBeenCalled();
    expect(statements.filter(s => /^\s*UPDATE/.test(s.text))).toEqual([]);
  });

  it('refuses when the answers describe no register record', async () => {
    const state = { ...completeState({ stability_program: ANSWERS.stability_program }), completedNodes: ['stability_program'] };
    const { q } = fakePool(sessionRow({ state }));
    const writer = vi.fn<RegisterWriter>();
    const outcome = await commitInterviewSession({ organizationId: ORG, sessionId: SESSION_ID, userId: 7 }, { writer, q });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe('NOTHING_TO_COMMIT');
    expect(outcome.unprojected.length).toBeGreaterThan(0);
    expect(writer).not.toHaveBeenCalled();
  });

  it('a cross-organization session id is NOT FOUND — reported, never executed', async () => {
    const { q } = fakePool(null);
    const writer = vi.fn<RegisterWriter>();
    const outcome = await commitInterviewSession({ organizationId: ORG + 1, sessionId: SESSION_ID, userId: 7 }, { writer, q });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe('SESSION_NOT_FOUND');
    expect(writer).not.toHaveBeenCalled();
  });
});

/* The production writer routes each register to its ONE canonical create in
   services/cmc/register-writes.ts — the same function the HTTP route calls —
   under the session's tenant and project. Mocked here; the creates' own
   behaviour (parse, refusal, insert, link) is pinned in register-writes.test. */
const creates = {
  createDrugSubstance: vi.fn(),
  createDrugProduct: vi.fn(),
  createContainerClosure: vi.fn(),
  createManufacturingProcess: vi.fn(),
  createFormulationRecord: vi.fn(),
  createMaterialSpec: vi.fn(),
  createCharacterizationStudy: vi.fn(),
};
vi.mock('../register-writes', () => creates);

describe('the production writer', () => {
  const scope = { organizationId: ORG, projectId: 'prog-1', userId: 7 };

  it('writes a container closure through createContainerClosure under the session tenant and project', async () => {
    const plan = buildInterviewCommitPlan('cmc_specification', ANSWERS);
    const entry = plan.entries.find(e => e.register === 'container_closure')!;
    creates.createContainerClosure.mockResolvedValueOnce({ row: { id: 42 }, module3Linked: true });

    const result = await productionRegisterWriter(entry, scope);

    expect(creates.createContainerClosure).toHaveBeenCalledWith(
      ORG,
      { ...entry.body, projectId: 'prog-1' },
      { projectId: 'prog-1' },
    );
    expect(result).toEqual({ id: 42, module3Linked: true, module3Warning: undefined });
  });

  it('the project is always the session\'s, never one named in the plan body', async () => {
    const plan = buildInterviewCommitPlan('cmc_specification', ANSWERS);
    const entry = { ...plan.entries.find(e => e.register === 'drug_substance')!, body: { name: 'X', projectId: 'someone-elses' } };
    creates.createDrugSubstance.mockResolvedValueOnce({ row: { id: 1 }, module3Linked: false, module3Warning: 'w' });

    const result = await productionRegisterWriter(entry, scope);

    expect(creates.createDrugSubstance.mock.calls[0][1]).toMatchObject({ projectId: 'prog-1' });
    expect(result.module3Warning).toBe('w');
  });

  it('every register in the plan has a create, and a refusal from it fails the entry, not the process', async () => {
    const plan = buildInterviewCommitPlan('cmc_specification', ANSWERS);
    const registers = new Set(plan.entries.map(e => e.register));
    for (const register of registers) {
      const entry = plan.entries.find(e => e.register === register)!;
      const key = ('create' + register.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join('')) as keyof typeof creates;
      creates[key].mockRejectedValueOnce(new Error('governed refusal'));
      await expect(productionRegisterWriter(entry, scope)).rejects.toThrow('governed refusal');
    }
  });
});
