/**
 * AnA's CMC tools ask the composition boundary (decision P-28: small-molecule
 * Module 3 for a US IND; services/cmc/composition-scope.ts) before they state
 * small-molecule content.
 *
 * estimate_recorded_shelf_life and assess_recorded_batch_poolability gave a
 * monoclonal antibody's stability study an ICH Q1E-extrapolated shelf life,
 * and the CMC specification interview judged a monoclonal antibody's answers
 * by ICH Q3A(R2) and M7 and summarised it as ready for document generation
 * (2026-10-15 launch-boundary re-proof,
 * docs/evidence/D2-API-SCOPE/2026-10-15-reproof/cmc-boundary/). These drive
 * the real handlers with the program decision stood in for; the decision
 * itself runs on a real engine in cmc/__tests__/composition-boundary-readers.pglite.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { assessProgramCompositionScope, studyRows, estimateRecordedShelfLife, assessRecordedPoolability, loadInterviewSession } = vi.hoisted(
  () => ({
    assessProgramCompositionScope: vi.fn(async (_org: number, _project: string): Promise<unknown> => null),
    loadInterviewSession: vi.fn(async (_params: unknown): Promise<unknown> => null),
    studyRows: { value: [] as Array<Record<string, unknown>> },
    estimateRecordedShelfLife: vi.fn(async () => ({ ok: true, data: { limitingParameter: 'Assay' } })),
    assessRecordedPoolability: vi.fn(async () => ({ ok: true, data: { decision: 'combinable' } })),
  }),
);
vi.mock('../../cmc/module3-compile', async (orig) => ({
  ...(await orig<typeof import('../../cmc/module3-compile')>()),
  assessProgramCompositionScope,
}));
vi.mock('../../cmc/recorded-stability', async (orig) => ({
  ...(await orig<typeof import('../../cmc/recorded-stability')>()),
  estimateRecordedShelfLife,
  assessRecordedPoolability,
}));
vi.mock('../../cmc/interview-sessions', async (orig) => ({
  ...(await orig<typeof import('../../cmc/interview-sessions')>()),
  loadInterviewSession,
}));
/* The stability register read: the rows a case states, whatever the query. */
vi.mock('../../../db', async (orig) => ({
  ...(await orig<typeof import('../../../db')>()),
  db: { select: () => ({ from: () => ({ where: async () => studyRows.value }) }) },
}));

const { getToolHandler } = await import('../AnaToolExecutor.js');
const { startFlow } = await import('../intelligence-questions/engine.js');

const ORG = 101;
const PROGRAM = '6f1c2a7e-9c41-4b6a-8d3e-2f0a1b2c3d4e';
const BIOLOGIC = {
  code: 'CMC_MODALITY_OUT_OF_SCOPE',
  modality: 'biologic',
  message: "This program's drug substance is biologically derived — a monoclonal antibody — and Module 3 for a biologic is not composed here.",
};

const run = async (tool: string, input: Record<string, unknown>, ctx: Record<string, unknown> = { organizationId: ORG }) =>
  JSON.parse(await getToolHandler(tool)!(input, ctx as never));

const study = (id: number, projectId: string | null) => ({
  id,
  studyTitle: `Study ${id}`,
  productName: 'BX-701',
  batchNumber: `B-00${id}`,
  storageConditions: ['25C/60RH'],
  duration: 24,
  stabilityData: { results: [] },
  projectId,
});

beforeEach(() => {
  assessProgramCompositionScope.mockReset().mockResolvedValue(null);
  estimateRecordedShelfLife.mockClear();
  assessRecordedPoolability.mockClear();
  studyRows.value = [];
});
afterEach(() => vi.unstubAllEnvs());

describe('estimate_recorded_shelf_life asks the boundary of the program the study is filed under', () => {
  it('a biologic program: the refusal in its own words, and no Q1E estimate', async () => {
    studyRows.value = [study(7, PROGRAM)];
    assessProgramCompositionScope.mockResolvedValue(BIOLOGIC);
    const out = await run('estimate_recorded_shelf_life', { study_id: 7 });
    expect(out).toMatchObject({ status: 'outside_composition_scope', code: 'CMC_MODALITY_OUT_OF_SCOPE', message: BIOLOGIC.message });
    expect(out.instruction).toMatch(/verbatim/);
    expect(out.instruction).toMatch(/estimate_shelf_life/);
    expect(assessProgramCompositionScope).toHaveBeenCalledWith(ORG, PROGRAM);
    expect(estimateRecordedShelfLife).not.toHaveBeenCalled();
  });

  it('a study filed under no program is not established, and not estimated', async () => {
    studyRows.value = [study(7, null)];
    const out = await run('estimate_recorded_shelf_life', { study_id: 7 });
    expect(out.status).toBe('outside_composition_scope');
    expect(out.code).toBe('CMC_MODALITY_NOT_ESTABLISHED');
    expect(estimateRecordedShelfLife).not.toHaveBeenCalled();
  });

  it('a small-molecule IND program is estimated as before', async () => {
    studyRows.value = [study(7, PROGRAM)];
    const out = await run('estimate_recorded_shelf_life', { study_id: 7 });
    expect(out.status).toBe('computed');
    expect(estimateRecordedShelfLife).toHaveBeenCalledTimes(1);
  });
});

describe('assess_recorded_batch_poolability asks it of every program the studies are filed under', () => {
  const OTHER = '7a2b3c4d-0000-4000-8000-000000000001';

  it('one study on a biologic program refuses the whole comparison', async () => {
    studyRows.value = [study(1, PROGRAM), study(2, OTHER)];
    assessProgramCompositionScope.mockImplementation(async (_org, project) => (project === OTHER ? BIOLOGIC : null));
    const out = await run('assess_recorded_batch_poolability', { study_ids: [1, 2] });
    expect(out).toMatchObject({ status: 'outside_composition_scope', code: 'CMC_MODALITY_OUT_OF_SCOPE' });
    expect(out.instruction).toMatch(/assess_batch_poolability/);
    expect(assessProgramCompositionScope.mock.calls.map((c) => c[1]).sort()).toEqual([PROGRAM, OTHER].sort());
    expect(assessRecordedPoolability).not.toHaveBeenCalled();
  });

  it('a study filed under no program is named, and nothing is assessed', async () => {
    studyRows.value = [study(1, PROGRAM), study(2, null)];
    const out = await run('assess_recorded_batch_poolability', { study_ids: [1, 2] });
    expect(out.code).toBe('CMC_MODALITY_NOT_ESTABLISHED');
    expect(out.message).toMatch(/\b2\b/);
    expect(assessRecordedPoolability).not.toHaveBeenCalled();
  });

  it('studies on a small-molecule IND program are assessed as before', async () => {
    studyRows.value = [study(1, PROGRAM), study(2, PROGRAM)];
    const out = await run('assess_recorded_batch_poolability', { study_ids: [1, 2] });
    expect(out.status).toBe('computed');
    expect(assessProgramCompositionScope).toHaveBeenCalledTimes(1);
  });
});

const classification = (molecule_type: string) => ({
  molecule_type,
  therapeutic_area: 'oncology',
  development_phase: 'phase_1',
  is_sterile: false,
});
const started = () => startFlow('cmc_specification', { organizationId: null, userId: null, projectId: null }).state;
const answer = (input: Record<string, unknown>, ctx: Record<string, unknown> = {}) =>
  run('answer_intelligence_question', input, ctx);

describe('the CMC specification interview: the molecule type stated', () => {

  it.each(['monoclonal_antibody', 'adc', 'recombinant_protein', 'cell_therapy', 'gene_therapy', 'vaccine'])(
    'a %s stated as the molecule type is refused before any answer is judged',
    async (type) => {
      const out = await answer({ flow_state: started(), node_id: 'substance_classification', answers: classification(type) });
      expect(out.status).toBe('outside_composition_scope');
      expect(out.code).toBe('CMC_MODALITY_OUT_OF_SCOPE');
      expect(out.message).toMatch(/a biologic/);
      expect(out.instruction).toMatch(/on the person's behalf/);
      expect(out.flowState).toBeUndefined();
    },
  );

  it.each([
    ['peptide', /a peptide/],
    ['oligonucleotide', /an oligonucleotide/],
  ])('%s, which ICH Q3A(R2) and M7 exclude by scope, is refused', async (type, said) => {
    const out = await answer({ flow_state: started(), node_id: 'substance_classification', answers: classification(type) });
    expect(out.code).toBe('CMC_MODALITY_OUT_OF_SCOPE');
    expect(out.message).toMatch(said);
  });

  it('"other" does not establish a small molecule', async () => {
    const out = await answer({
      flow_state: started(),
      node_id: 'substance_classification',
      answers: { ...classification('other'), molecule_type_other: 'lipid nanoparticle' },
    });
    expect(out.code).toBe('CMC_MODALITY_NOT_ESTABLISHED');
  });

  it('a later answer is refused when the molecule type stated earlier is a biologic', async () => {
    const state = { ...started(), answers: { substance_classification: classification('monoclonal_antibody') } };
    const out = await answer({
      flow_state: state,
      node_id: 'physicochemical_properties',
      answers: { physical_form: 'lyophilized' },
    });
    expect(out.code).toBe('CMC_MODALITY_OUT_OF_SCOPE');
  });

  it('a small molecule advances as before', async () => {
    const out = await answer({ flow_state: started(), node_id: 'substance_classification', answers: classification('small_molecule') });
    expect(out.status).toBe('intelligence_question');
    expect(out.code).toBeUndefined();
  });

});

describe('the CMC specification interview: the program, the session and the release', () => {
  it("the program the interview is bound to is asked too: a biologic program's interview takes no answer", async () => {
    assessProgramCompositionScope.mockResolvedValue(BIOLOGIC);
    const out = await answer(
      { flow_state: started(), node_id: 'substance_classification', answers: classification('small_molecule') },
      { organizationId: ORG, projectRef: PROGRAM },
    );
    expect(out).toMatchObject({ status: 'outside_composition_scope', message: BIOLOGIC.message });
    expect(assessProgramCompositionScope).toHaveBeenCalledWith(ORG, PROGRAM);
  });

  it('a boundary that cannot be asked refuses as a failed read; the answer is not judged unasked', async () => {
    assessProgramCompositionScope.mockRejectedValue(new Error('connection terminated unexpectedly'));
    const out = await answer(
      { flow_state: started(), node_id: 'substance_classification', answers: classification('small_molecule') },
      { organizationId: ORG, projectRef: PROGRAM },
    );
    expect(out).toMatchObject({ status: 'outside_composition_scope', code: 'CMC_APPLICATION_NOT_READABLE' });
    expect(out.message).not.toMatch(/connection terminated/);
  });

  it('a program with no substance recorded yet is not refused: the interview is how it gets recorded', async () => {
    assessProgramCompositionScope.mockResolvedValue({ code: 'CMC_MODALITY_NOT_ESTABLISHED', message: 'No drug substance is recorded.' });
    const out = await answer(
      { flow_state: started(), node_id: 'substance_classification', answers: classification('small_molecule') },
      { organizationId: ORG, projectRef: PROGRAM },
    );
    expect(out.status).toBe('intelligence_question');
  });

  it("starting one on a biologic program is refused, so no one is walked through an interview that cannot finish", async () => {
    assessProgramCompositionScope.mockResolvedValue(BIOLOGIC);
    const out = await run('start_intelligence_flow', { document_type: 'cmc_specification' }, { organizationId: ORG, projectRef: PROGRAM });
    expect(out).toMatchObject({ status: 'outside_composition_scope', message: BIOLOGIC.message });
    expect(out.session_id).toBeUndefined();
  });

  it("with a session, the program asked is the session's own, not the caller's", async () => {
    loadInterviewSession.mockResolvedValue({ id: 's-1', status: 'active', state: started(), projectId: PROGRAM });
    assessProgramCompositionScope.mockResolvedValue(BIOLOGIC);
    const out = await answer(
      { session_id: 's-1', node_id: 'substance_classification', answers: classification('small_molecule') },
      { organizationId: ORG, projectRef: '7a2b3c4d-0000-4000-8000-000000000009' },
    );
    expect(out).toMatchObject({ status: 'outside_composition_scope', session_id: 's-1' });
    expect(assessProgramCompositionScope).toHaveBeenCalledWith(ORG, PROGRAM);
  });

  it('resume does not re-present a session whose stated molecule type is outside the boundary', async () => {
    const state = { ...started(), answers: { substance_classification: classification('vaccine') } };
    loadInterviewSession.mockResolvedValue({ id: 's-2', status: 'complete', state, projectId: PROGRAM });
    const out = await run('resume_intelligence_flow', { session_id: 's-2' });
    expect(out).toMatchObject({ status: 'outside_composition_scope', code: 'CMC_MODALITY_OUT_OF_SCOPE', session_id: 's-2' });
    expect(out.flowState).toBeUndefined();
  });

  it('in production, a caller-supplied flow_state for an interview that commits nothing is refused, as start refuses it', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LAUNCH_SCOPE_ENFORCE', '');
    const protocol = startFlow('protocol_development', { organizationId: null, userId: null, projectId: null }).state;
    const out = await answer({ flow_state: protocol, node_id: protocol.currentNodeId, answers: {} });
    expect(out.error).toMatch(/not available in this release/);
    expect(out.commits).toBe(false);
  });
});
