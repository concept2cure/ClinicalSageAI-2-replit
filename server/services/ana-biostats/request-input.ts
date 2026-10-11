/**
 * The one mapping from a loosely typed request body (an AnA tool's input, an
 * HTTP request) to the biostatistics engine's input. Numbers arrive as
 * strings or numbers; anything blank or non-finite is left undefined so the
 * engine's input normalizer reports it as missing rather than computing on a
 * guess. Moved out of AnaToolExecutor.ts (2026-10-05) so the statistical
 * defensibility route reads a request exactly as the AnA tools do.
 */
export function toBiostatsInput(
  input: Record<string, unknown>,
  fallbackProjectId?: number | null,
): Record<string, unknown> {
  const num = (v: unknown): number | undefined => {
    if (v === undefined || v === null || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);

  return {
    clientTrack: str(input.clientTrack),
    studyType: str(input.studyType),
    objectiveType: str(input.objectiveType),
    endpointType: str(input.endpointType),
    effectSize: num(input.effectSize),
    controlRate: num(input.controlRate),
    treatmentRate: num(input.treatmentRate),
    alpha: num(input.alpha),
    powerTarget: num(input.powerTarget),
    attritionRate: num(input.attritionRate),
    allocationRatio: num(input.allocationRatio),
    nonInferiorityMargin: num(input.nonInferiorityMargin),
    equivalenceMargin: num(input.equivalenceMargin),
    comparatorType: str(input.comparatorType),
    numberOfGroups: num(input.numberOfGroups),
    followUpDuration: num(input.followUpDuration),
    interimAnalyses: num(input.interimAnalyses),
    sensitivity: num(input.sensitivity),
    specificity: num(input.specificity),
    prevalence: num(input.prevalence),
    aucTarget: num(input.aucTarget),
    aucNull: num(input.aucNull),
    agreementTarget: num(input.agreementTarget),
    crossoverPeriods: num(input.crossoverPeriods),
    withinSubjectCorrelation: num(input.withinSubjectCorrelation),
    numberOfEndpoints: num(input.numberOfEndpoints),
    multiplicityMethod: str(input.multiplicityMethod),
    estimandStrategy: str(input.estimandStrategy),
    missingDataMethod: str(input.missingDataMethod),
    expectedMissingRate: num(input.expectedMissingRate),
    regulatoryBody: str(input.regulatoryBody),
    indication: str(input.indication),
    phase: str(input.phase),
    projectId: num(input.projectId) ?? (fallbackProjectId ?? undefined),
  };
}
