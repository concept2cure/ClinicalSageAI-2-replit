/**
 * Rule 2 S4: a readiness determination requires recorded nonclinical studies.
 * Reuses the existing project/actor boundary and requirement-list engine.
 * Until S14 reaches the selected study store, no figures in the call are used.
 */
import { resolveRecordSourceProject, suppliedAny, type RecordSourceContext } from './record-source-project.js';
import { requiredNonclinicalBattery, type ProgramContext } from '../preclinical/nonclinical-program-requirements.js';

const NOT_ASSESSED = { readiness: 'not_assessed', programAssessed: false, programGaps: null } as const;

export async function assessRecordedNonclinicalSafety(input: Record<string, unknown>, ctx?: RecordSourceContext): Promise<string> {
  const ignoredSuppliedFigures = suppliedAny(input, ['studies', 'presentStudies', 'findings']) ||
    (input.fih != null && typeof input.fih === 'object' && Object.keys(input.fih).length > 0);
  try {
    const project = await resolveRecordSourceProject(input, ctx, {
      module: '2.4', label: 'Nonclinical safety assessment', source: 'recorded nonclinical studies',
    }, ignoredSuppliedFigures);
    if (!project.ok) return JSON.stringify({
      ...project, ...NOT_ASSESSED,
      ...(project.status === 'needs_project' && !project.code ? {
        message: 'No project was read. Open the project to resolve its scope; this platform does not yet record nonclinical studies against a project, so readiness cannot be assessed here. Typed studies, NOAELs and findings are not used.',
      } : {}),
    });
    const program = input.program as ProgramContext | undefined;
    if (typeof program?.maxClinicalDurationWeeks !== 'number' || !Number.isFinite(program.maxClinicalDurationWeeks) || program.maxClinicalDurationWeeks <= 0) {
      return JSON.stringify({
        status: 'needs_parameters', ...NOT_ASSESSED, projectId: project.projectId, ignoredSuppliedFigures,
        message: 'program.maxClinicalDurationWeeks must be stated as a positive finite number to list the required battery. No study was read or readiness assessed.',
      });
    }
    return JSON.stringify({
      status: 'needs_data', engine: 'deterministic', ...NOT_ASSESSED,
      projectId: project.projectId, ignoredSuppliedFigures,
      requiredBattery: requiredNonclinicalBattery(program),
      message: 'This platform does not yet record nonclinical studies against a project. Readiness and a starting dose cannot be determined from records here; studies, NOAELs, findings and doses supplied in the call are not used.',
      instruction: 'Report the required battery as requirements for the stated clinical context. No studies were read: do not say the program holds or lacks any study, is ready for first-in-human, or has a starting dose.',
    });
  } catch (err) {
    return JSON.stringify({ error: `Nonclinical safety assessment failed: ${err instanceof Error ? err.message : 'unknown error'}` });
  }
}
