/**
 * A reviewer simulation reads its packet and intel facts from the program's
 * records, says where each came from, and says what it could not assess.
 *
 * What the code used to do: runReviewerSimulation persisted an "audit-grade"
 * run (reviewer_simulation_runs) computed entirely from facts the CALLER
 * asserted — `packet`, `intel` and `reports` were used as given, and nothing was
 * read from the program's records except, optionally, nonclinical studies. The
 * questions printed those numbers ("Defense readiness score is 40/100", "3
 * claims have no traceable supporting evidence"); through AnA's
 * reviewer_simulation.run the model supplied them. A named defensePacketId was
 * stored on the run as "the packet that fed the inputs" while the packet facts
 * came from the request. And a fact nobody supplied produced no question, which
 * reads as "no concern".
 *
 * Now packet facts come only from the defense packet on record that
 * defensePacketId names (refused when the program has no such packet); intel
 * comes only from the records (nonclinical studies via ctdProgramId); caller
 * packet / intel / reports are set aside and the run says so; each fact group
 * that was not available produces an explicit info question; and
 * `inputsSource` is returned and persisted with the run. A failed nonclinical
 * read is an error, not "not loaded".
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const holder = vi.hoisted(() => ({
  /** Rows a `.limit()` read returns (the defense packet lookup). */
  packetRows: [] as Record<string, unknown>[],
  inserted: [] as Record<string, any>[],
  loadPreclinicalIntel: vi.fn(),
}));

vi.mock('../../../db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: async () => [] }),
          limit: async () => holder.packetRows,
        }),
      }),
    }),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        holder.inserted.push(v);
        return { returning: async () => [{ id: 'sim-run-1' }] };
      },
    }),
  },
}));
vi.mock('../../preclinical/preclinical-intel-loader', () => ({
  loadPreclinicalIntel: (...a: unknown[]) => holder.loadPreclinicalIntel(...a),
}));

import { runReviewerSimulation, ReviewerSimulationInputError } from '../reviewer-simulator.service';
import type { PersonaProgramFacts } from '../reviewer-personas';

const ORG = 7;
const PROGRAM = '00000000-0000-0000-0000-0000000000a1';
const PACKET_ID = '00000000-0000-0000-0000-0000000000b2';

const k510: PersonaProgramFacts = { programType: '510K', productType: 'device', deviceClass: 'II', primaryAgency: 'FDA' };
const pma: PersonaProgramFacts = { programType: 'PMA', productType: 'device', deviceClass: 'III', primaryAgency: 'FDA' };
const ind: PersonaProgramFacts = {
  programType: 'IND',
  productType: 'drug',
  deviceClass: null,
  primaryAgency: 'FDA',
  developmentStage: 'ind_enabling',
};

const callerPacket = { defenseReadinessScore: 40, topRisks: ['IU_MISMATCH'], riskCodesUsed: [], predicateKNumber: 'K000001' };
const callerIntel = {
  contradictionCount: 2,
  orphanClaimCount: 0,
  unsupportedClaimCount: 3,
  defensibilityScore: 42,
  missingSections: [],
};
const texts = (r: { questions: Array<{ question: string }> }) => r.questions.map(q => q.question).join('\n');
const triggers = (r: { questions: Array<{ trigger: string }> }) => r.questions.map(q => q.trigger);

beforeEach(() => {
  holder.packetRows = [];
  holder.inserted = [];
  holder.loadPreclinicalIntel.mockReset();
});

describe('reviewer simulation: facts come from the records, and absence is stated', () => {
  it("does not print a caller's packet figures; with no packet named, says the packet checks did not run", async () => {
    const r = await runReviewerSimulation({
      organizationId: ORG, programId: PROGRAM, program: k510, packet: callerPacket, intel: callerIntel, dryRun: true,
    });
    expect(texts(r), "a caller-asserted readiness score was printed as the program's").not.toContain('40/100');
    expect(triggers(r)).not.toContain('IU_MISMATCH risk code present');
    expect(triggers(r)).toContain('packet_facts_not_available');
    expect(r.inputsSource.packet).toBe('not_available');
    expect(r.inputsSource.setAside).toEqual(expect.arrayContaining(['packet', 'intel']));
  });

  it("does not print a caller's intel figures; says the claim-health checks did not run", async () => {
    const r = await runReviewerSimulation({
      organizationId: ORG, programId: PROGRAM, program: pma, intel: callerIntel, dryRun: true,
    });
    const all = texts(r);
    expect(all, 'a caller-asserted defensibility score was printed').not.toContain('42/100');
    expect(all, 'a caller-asserted contradiction count was printed').not.toMatch(/^2 cross-section contradictions/m);
    const note = r.questions.find(q => q.trigger === 'claim_health_not_assessed');
    expect(note?.severity).toBe('info');
    expect(r.inputsSource.claimHealth).toBe('not_available');
  });

  it("sets aside caller-supplied reports: no question is printed from a caller's defensibility report", async () => {
    const r = await runReviewerSimulation({
      organizationId: ORG,
      programId: PROGRAM,
      program: k510,
      intel: callerIntel,
      reports: {
        claimEvidence: { alignments: [], overallRisk: 'low', overstatedCount: 0, unsupportedCount: 0, claimCount: 0 } as any,
        consistency: { inconsistencies: [], consistencyScore: null, comparisons: 0 } as any,
        defensibility: { score: 31, riskLevel: 'high', breakdown: {}, drivers: [], notAssessed: [], partial: false } as any,
      },
      dryRun: true,
    });
    expect(texts(r), 'a question was printed from a caller-asserted report').not.toContain('31/100');
    expect(r.inputsSource.setAside).toContain('reports');
  });

  it('reads the packet facts from the defense packet on record that defensePacketId names', async () => {
    holder.packetRows = [
      { defenseReadinessScore: 55, topRisks: ['TECH_DIFFERENCE'], riskCodesUsed: ['TECH_DIFFERENCE'], predicateKNumber: 'K123456', status: 'RENDERED' },
    ];
    const r = await runReviewerSimulation({
      organizationId: ORG,
      programId: PROGRAM,
      program: k510,
      packet: callerPacket,
      intel: callerIntel,
      defensePacketId: PACKET_ID,
      dryRun: true,
    });
    expect(texts(r)).toContain('Defense readiness score is 55/100');
    expect(texts(r)).not.toContain('40/100');
    expect(triggers(r)).toContain('TECH_DIFFERENCE risk code present');
    expect(triggers(r)).not.toContain('IU_MISMATCH risk code present');
    expect(triggers(r)).not.toContain('packet_facts_not_available');
    expect(r.inputsSource).toMatchObject({
      packet: 'defense_packets', defensePacketId: PACKET_ID, defensePacketStatus: 'RENDERED',
    });
  });

  it('refuses a defensePacketId the program has no packet for, and persists nothing', async () => {
    holder.packetRows = [];
    const attempt = runReviewerSimulation({
      organizationId: ORG, programId: PROGRAM, program: k510, packet: callerPacket, intel: callerIntel, defensePacketId: PACKET_ID,
    });
    await expect(attempt, 'a named packet that is not on record was accepted').rejects.toThrow(/defense packet/i);
    await expect(attempt).rejects.toBeInstanceOf(ReviewerSimulationInputError);
    expect(holder.inserted).toEqual([]);
  });
});

describe('reviewer simulation: the run records its sources, and reads nonclinical facts honestly', () => {
  it('persists where each fact group came from with the run', async () => {
    const r = await runReviewerSimulation({
      organizationId: ORG, programId: PROGRAM, program: k510, packet: callerPacket, intel: callerIntel, triggeredBy: 'user-1',
    });
    expect(holder.inserted).toHaveLength(1);
    expect(holder.inserted[0].summary?.inputsSource, 'the run did not record where its facts came from').toMatchObject({
      program: 'caller_stated',
      packet: 'not_available',
      claimHealth: 'not_available',
    });
    expect(holder.inserted[0].summary.inputsSource).toEqual(r.inputsSource);
  });

  it("sets aside caller-attached nonclinical facts: only the program's studies on record are read", async () => {
    const r = await runReviewerSimulation({
      organizationId: ORG,
      programId: PROGRAM,
      program: ind,
      intel: {
        ...callerIntel,
        nonclinical: {
          studies: [{ studyType: 'repeat_dose_tox', species: 'rat', durationWeeks: 26, glpCompliant: false, noael: '5', pivotal: true }],
          genotoxBattery: { ames: true, inVitroMammalian: true, inVivo: true },
        },
      },
      dryRun: true,
    });
    expect(triggers(r), 'a caller-attached study raised a finding').not.toContain('NC_GLP_PIVOTAL_MISSING');
    expect(triggers(r)).toContain('nonclinical_intel_missing');
    expect(r.inputsSource.nonclinical).toBe('not_available');
  });

  it('a failed nonclinical read is an error, not "data not loaded"', async () => {
    holder.loadPreclinicalIntel.mockRejectedValueOnce(new Error('connection terminated'));
    await expect(
      runReviewerSimulation({
        organizationId: ORG, programId: PROGRAM, program: ind, intel: callerIntel, ctdProgramId: 42, dryRun: true,
      }),
      'a failed read of ctd_nonclinical_studies was reported as data not loaded',
    ).rejects.toThrow(/connection terminated/);
  });
});
