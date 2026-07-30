import { describe, it, expect } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';
import {
  buildBiotechProgramStatus,
  normalizeModality,
  normalizeProgramPhase,
  inferPhaseFromJourneyStage,
  BIOTECH_PROGRAM_SPINE,
  BIOTECH_PROGRAM_PHASES,
  MODALITY_CRITICAL_PATH,
  PHASE_LABELS,
  MODALITY_LABELS,
} from '../biotech-program.js';

describe('biotech-program — pure resolvers', () => {
  it('normalizes modality aliases to known modalities', () => {
    expect(normalizeModality('mAb')).toBe('monoclonal_antibody');
    expect(normalizeModality('CAR-T')).toBe('cell_therapy');
    expect(normalizeModality('AAV')).toBe('gene_therapy');
    expect(normalizeModality('mRNA')).toBe('vaccine');
    expect(normalizeModality('351(k)')).toBe('biosimilar');
    expect(normalizeModality('gene_therapy')).toBe('gene_therapy');
  });

  it('defaults unknown / missing modality to other', () => {
    expect(normalizeModality(undefined)).toBe('other');
    expect(normalizeModality(null)).toBe('other');
    expect(normalizeModality('something novel')).toBe('other');
  });

  it('normalizes development-phase aliases, or returns null when unknown', () => {
    expect(normalizeProgramPhase('phase 1')).toBe('clinical_early');
    expect(normalizeProgramPhase('pivotal')).toBe('clinical_late');
    expect(normalizeProgramPhase('IND')).toBe('ind_enabling');
    expect(normalizeProgramPhase('BLA')).toBe('bla_filing');
    expect(normalizeProgramPhase('post-approval')).toBe('post_approval');
    expect(normalizeProgramPhase('nonsense')).toBeNull();
    expect(normalizeProgramPhase(undefined)).toBeNull();
  });

  it('infers a coarse phase from each journey stage', () => {
    expect(inferPhaseFromJourneyStage('just_licensed')).toBe('discovery');
    expect(inferPhaseFromJourneyStage('project_started')).toBe('ind_enabling');
    expect(inferPhaseFromJourneyStage('in_review')).toBe('clinical_late');
    expect(inferPhaseFromJourneyStage('submission_ready')).toBe('bla_filing');
    expect(inferPhaseFromJourneyStage('submitted')).toBe('post_approval');
  });

  it('every phase in the arc has a complete, well-formed spine', () => {
    for (const phase of BIOTECH_PROGRAM_PHASES) {
      const spine = BIOTECH_PROGRAM_SPINE[phase];
      expect(spine, phase).toBeTruthy();
      expect(spine.objective.length, phase).toBeGreaterThan(10);
      expect(spine.keyDeliverables.length, phase).toBeGreaterThan(0);
      expect(spine.regulatoryGates.length, phase).toBeGreaterThan(0);
      expect(spine.anaCanDoNow.length, phase).toBeGreaterThan(0);
      expect(spine.nextMilestone.length, phase).toBeGreaterThan(10);
      expect(PHASE_LABELS[phase]).toBeTruthy();
    }
  });

  it('the nextPhase chain walks the arc in order and terminates', () => {
    let phase: (typeof BIOTECH_PROGRAM_PHASES)[number] | null = 'discovery';
    const walked: string[] = [];
    while (phase) {
      walked.push(phase);
      phase = BIOTECH_PROGRAM_SPINE[phase].nextPhase;
      if (walked.length > 20) break; // guard against a cycle
    }
    expect(walked).toEqual([...BIOTECH_PROGRAM_PHASES]);
  });

  it('every modality has a non-empty critical path', () => {
    for (const modality of Object.keys(MODALITY_LABELS) as Array<keyof typeof MODALITY_LABELS>) {
      expect(MODALITY_CRITICAL_PATH[modality].length, modality).toBeGreaterThan(0);
    }
  });
});

describe('biotech-program — buildBiotechProgramStatus', () => {
  it('uses an explicit phase hint and tags it as hint', () => {
    const s = buildBiotechProgramStatus({
      journeyStage: 'just_licensed',
      modality: 'gene_therapy',
      phaseHint: 'phase_3',
      indication: 'DMD',
    });
    expect(s.phase).toBe('clinical_late');
    expect(s.phaseSource).toBe('hint');
    expect(s.modality).toBe('gene_therapy');
    expect(s.indication).toBe('DMD');
    // gene-therapy critical path leads with the potency assay
    expect(s.criticalPath.join(' ').toLowerCase()).toContain('potency');
    expect(s.nextPhase).toBe('bla_filing');
    expect(s.nextPhaseLabel).toBe(PHASE_LABELS.bla_filing);
  });

  it('falls back to journey-inferred phase and tags it accordingly', () => {
    const s = buildBiotechProgramStatus({ journeyStage: 'submission_ready' });
    expect(s.phase).toBe('bla_filing');
    expect(s.phaseSource).toBe('inferred_from_journey');
    expect(s.modality).toBe('other');
    expect(s.guidance.toLowerCase()).toContain('confirm');
  });

  it('surfaces biosimilar analytical-similarity critical path', () => {
    const s = buildBiotechProgramStatus({ journeyStage: 'authoring', modality: 'biosimilar' });
    expect(s.criticalPath.join(' ').toLowerCase()).toContain('analytical similarity');
  });
});

describe('biotech-program — tool registration', () => {
  it('get_biotech_program_status is registered and defined', () => {
    expect(typeof getToolHandler('get_biotech_program_status')).toBe('function');
    expect(ALL_ANA_TOOLS.some((t) => t.name === 'get_biotech_program_status')).toBe(true);
  });

  it('handler returns a well-formed status with no tenant context (fail-soft)', async () => {
    const out = JSON.parse(
      await getToolHandler('get_biotech_program_status')!({ modality: 'mAb', phase: 'ind_enabling' }, {} as any),
    );
    expect(out.source).toContain('biotech program');
    expect(out.phase).toBe('ind_enabling');
    expect(out.modality).toBe('monoclonal_antibody');
    expect(Array.isArray(out.anaCanDoNow)).toBe(true);
    expect(out.nextMilestone).toBeTruthy();
  });
});
