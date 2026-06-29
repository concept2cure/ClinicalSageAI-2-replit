/**
 * ectdReadinessFixtures — deterministic sample data for the E10 readiness-gate
 * surface, so the gate renders end-to-end before the live artifact-store join
 * lands. Every fixture is flagged `sample: true` on the assembled module so the
 * honesty contract refuses to seal it (see aggregateReadiness).
 *
 * INTEGRATION: replace these with the real tool envelopes once the Document
 * Studio orchestration joins the live artifact store. The three shapes mirror
 * the executor results 1:1 (assemble_ectd_module_from_artifacts, validate_docx,
 * check_dossier_consistency), so the swap is a wiring change, not a reshape.
 *
 * @module client/src/concept2cure/components/ana/ectdReadinessFixtures
 */
import type {
  AssembledModuleResult,
  ConsistencyReadiness,
  StructuralReadiness,
} from './ectdReadiness';

/** A clean Module 2.5 assembly (sample → not certifiable, by contract). */
export const SAMPLE_ASSEMBLED_M2_5: AssembledModuleResult = {
  moduleNumber: '2.5',
  sectionsAssembled: 6,
  sectionsIndex: [
    { number: '2.5.1', title: 'Product Development Rationale' },
    { number: '2.5.2', title: 'Overview of Biopharmaceutics' },
    { number: '2.5.3', title: 'Overview of Clinical Pharmacology' },
    { number: '2.5.4', title: 'Overview of Efficacy' },
    { number: '2.5.5', title: 'Overview of Safety' },
    { number: '2.5.6', title: 'Benefits and Risks Conclusions' },
  ],
  output: { path: '/tmp/ana/ectd/module-2.5.docx', format: 'docx', sizeBytes: 148_512 },
  sample: true,
};

/** A clean Module 5.3.5 assembly (sample). */
export const SAMPLE_ASSEMBLED_M5_3_5: AssembledModuleResult = {
  moduleNumber: '5.3.5',
  sectionsAssembled: 3,
  sectionsIndex: [
    { number: '5.3.5.1', title: 'Study Reports of Controlled Clinical Studies' },
    { number: '5.3.5.2', title: 'Study Reports of Uncontrolled Clinical Studies' },
    { number: '5.3.5.3', title: 'Reports of Analyses of Data from More Than One Study' },
  ],
  output: { path: '/tmp/ana/ectd/module-5.3.5.docx', format: 'docx', sizeBytes: 392_004 },
  sample: true,
};

/** A passing structural check. */
export const SAMPLE_STRUCTURAL_OK: StructuralReadiness = {
  ok: true,
  partsChecked: 14,
  paragraphCount: 612,
  missingParts: [],
  malformedParts: [],
  danglingRels: [],
  errors: [],
};

/** A failing structural check (missing part + dangling relationship). */
export const SAMPLE_STRUCTURAL_FAIL: StructuralReadiness = {
  ok: false,
  partsChecked: 13,
  paragraphCount: null,
  missingParts: ['word/styles.xml'],
  malformedParts: [],
  danglingRels: [{ rels: 'word/_rels/document.xml.rels', target: 'media/image3.png' }],
  errors: [],
};

/** A clean consistency verdict. */
export const SAMPLE_CONSISTENCY_CLEAN: ConsistencyReadiness = {
  verdict: 'clean',
  artifactsCompared: 9,
  divergences: [],
};

/** A blocking consistency verdict (a sample-size contradiction across modules). */
export const SAMPLE_CONSISTENCY_BLOCKER: ConsistencyReadiness = {
  verdict: 'blocker',
  artifactsCompared: 9,
  divergences: [
    {
      kind: 'sample_size_mismatch',
      severity: 'critical',
      description: 'Pivotal trial randomized population stated inconsistently',
      draftValue: '486',
      existingValue: '512',
      existingArtifact: 'Clinical Study Report — Study 301',
      existingCtdSection: '5.3.5.1',
    },
    {
      kind: 'dose_mismatch',
      severity: 'high',
      description: 'Maximum tolerated dose differs from the nonclinical overview',
      draftValue: '120 mg/kg',
      existingValue: '90 mg/kg',
      existingArtifact: 'Nonclinical Overview',
      existingCtdSection: '2.4',
    },
  ],
};
