/**
 * S5c: the GCP operations worksheets keep an unanswered fact not_stated, decide nothing from it, and refuse a
 * malformed value by field.
 *
 * What the code did before this change: three functions already left an unstated fact undecided (the
 * 2026-10-15 sweep), but none refused a malformed value. affectsParticipantSafety 'true' classified a deviation
 * non-important with "no individual prompt IRB report required"; isFirstInHuman 'true' scored a trial low risk;
 * an essentialDocsCompletePercent of 150 read as 100 and 'ready'; inspectionTarget 'FDA' crashed; stage 'Before'
 * returned an empty document plan. assess_gcp_compliance scored `{}` 0, 'major_gaps', raised "not documented"
 * gaps for omitted facts, read null and 'false' as a documented strength, called a trial with an omitted
 * safetyReportingCompliant 'compliant', and never read protocolFollowedWithChangeControl. design_informed_consent
 * said "Paper consent process selected" when no consent method was stated, listed no unforeseeable-risks or
 * biospecimen element when the facts deciding them were left out, and said nothing of an unstated placebo use.
 */
import { describe, expect, it } from 'vitest';
import {
  designMonitoringPlan, assessInspectionReadiness, assessGCPCompliance, designInformedConsent,
  classifyProtocolDeviation, planEssentialDocuments,
} from '../../gcp-operations/gcp-operations-knowledge';
import { getToolHandler } from '../AnaToolExecutor';
import { GCP_OPERATIONS_TOOLS } from '../gcpOperationsTools';

/** ai-gateway/gateway.ts trims a longer tool description to this many characters for OpenAI-compatible providers. */
const OPENAI_MAX_TOOL_DESCRIPTION_CHARS = 1024;

const monitoring = {
  phase: 'phase3', isFirstInHuman: false, noveltyOfIntervention: 'established', vulnerablePopulation: false,
  complexProtocol: false, endpointObjectivity: 'objective', isMultiRegional: false, numberOfSites: 12,
  plannedEnrollment: 240, usesInvestigationalDevice: false, experiencedSites: true, electronicDataCapture: true,
  priorInspectionFindings: false, blinded: false,
} satisfies Parameters<typeof designMonitoringPlan>[0];
const readiness = {
  inspectionTarget: 'sponsor', essentialDocsCompletePercent: 100, openCapas: 0, tmfContemporaneous: true,
  consentDocumentationComplete: true, delegationLogCurrent: true, trainingRecordsComplete: true,
  ipAccountabilityReconciled: true, safetyReportingCurrent: true, protocolDeviationsLogged: true,
  capaProcessInPlace: true, dataTraceabilityVerified: true, computerizedSystemsValidated: true,
  monitoringReportsCurrent: true, priorInspectionFindings: false,
} satisfies Parameters<typeof assessInspectionReadiness>[0];
const PRINCIPLE_FLAGS = [
  'ethicsApprovalCurrent', 'informedConsentProcessCompliant', 'independentEthicsReviewDocumented',
  'riskBasedQualityManagement', 'proportionateProcessesDocumented', 'sponsorOversightDocumented',
  'personnelQualified', 'ipManagementCompliant', 'dataGovernanceAlcoaPlus',
];
const CROSS_CUTTING_FLAGS = [
  'vendorOversightDocumented', 'delegationDocumented', 'protocolFollowedWithChangeControl', 'safetyReportingCompliant',
  'computerizedSystemsValidated', 'auditTrailReviewPerformed', 'recordRetentionCompliant',
];
const compliance = Object.fromEntries([...PRINCIPLE_FLAGS, ...CROSS_CUTTING_FLAGS].map(k => [k, true])) as
  Parameters<typeof assessGCPCompliance>[0];
const consent = {
  studyType: 'interventional', applicableClinicalTrial: true, involvesPlacebo: false, moreThanMinimalRisk: true,
  collectsBiospecimens: false, genomicData: false, commercialProfitPotential: false, electronicConsent: false,
  remoteConsent: false, vulnerablePopulations: [], targetReadingGradeLevel: 8,
} satisfies Parameters<typeof designInformedConsent>[0];
const deviation = {
  category: 'visit_window', affectsParticipantSafety: false, involvedUnreportedSAE: false, increasedRiskToSubjects: false,
  affectsConsentValidity: false, affectsPrimaryEndpoint: false, affectsEligibilityCriticalCriterion: false,
  deviationFromIRBApprovedProtocol: false, isRecurring: false, numberOfParticipantsAffected: 1,
} satisfies Parameters<typeof classifyProtocolDeviation>[0];
const documents = {
  stage: 'all', includeInvestigatorSiteFile: true, includeSponsorTmf: true, electronicTmf: true,
  usesInvestigationalDevice: false, multiSite: true,
} satisfies Parameters<typeof planEssentialDocuments>[0];

const families = [
  { tool: 'design_monitoring_plan', compute: designMonitoringPlan, input: monitoring,
    flags: ['isFirstInHuman', 'isMultiRegional', 'usesInvestigationalDevice', 'blinded', 'vulnerablePopulation',
      'complexProtocol', 'electronicDataCapture', 'experiencedSites', 'priorInspectionFindings'],
    result: { overallRiskLevel: 'low', riskScore: 0 } },
  { tool: 'assess_inspection_readiness', compute: assessInspectionReadiness, input: readiness,
    flags: ['tmfContemporaneous', 'consentDocumentationComplete', 'delegationLogCurrent', 'trainingRecordsComplete',
      'ipAccountabilityReconciled', 'safetyReportingCurrent', 'protocolDeviationsLogged', 'capaProcessInPlace',
      'dataTraceabilityVerified', 'computerizedSystemsValidated', 'monitoringReportsCurrent', 'priorInspectionFindings'],
    result: { overallReadiness: 'ready', readinessScore: 100, inspectionTarget: 'sponsor' } },
  { tool: 'assess_gcp_compliance', compute: assessGCPCompliance, input: compliance,
    flags: [...PRINCIPLE_FLAGS, ...CROSS_CUTTING_FLAGS], result: { overallStatus: 'compliant', complianceScore: 100, gaps: [] } },
  { tool: 'design_informed_consent', compute: designInformedConsent, input: consent,
    flags: ['involvesPlacebo', 'moreThanMinimalRisk', 'collectsBiospecimens', 'genomicData', 'electronicConsent',
      'remoteConsent', 'commercialProfitPotential', 'applicableClinicalTrial'],
    result: { applicableAdditionalElements: expect.arrayContaining([expect.objectContaining({ id: 'unforeseeable_risks' })]) } },
  { tool: 'classify_protocol_deviation', compute: classifyProtocolDeviation, input: deviation,
    flags: ['affectsParticipantSafety', 'affectsPrimaryEndpoint', 'affectsEligibilityCriticalCriterion',
      'affectsConsentValidity', 'isRecurring', 'involvedUnreportedSAE', 'deviationFromIRBApprovedProtocol',
      'increasedRiskToSubjects'],
    result: { importance: 'non_important', severity: 'minor', reportability: expect.objectContaining({ reportToIRB: false }) } },
  { tool: 'plan_essential_documents', compute: planEssentialDocuments, input: documents,
    flags: ['includeInvestigatorSiteFile', 'includeSponsorTmf', 'electronicTmf', 'usesInvestigationalDevice', 'multiSite'],
    result: { documents: expect.arrayContaining([expect.objectContaining({ stage: 'before' })]) } },
];

function changed(input: object, overrides: Record<string, unknown>): never {
  return { ...input, ...overrides } as never;
}

async function run(tool: string, input: object) {
  const handler = getToolHandler(tool);
  expect(handler, tool).toBeTypeOf('function');
  return JSON.parse(await handler!(input as Record<string, unknown>, { organizationId: 101, userId: 7 } as never));
}

describe('the six GCP operations tools keep their stated results', () => {
  it.each(families)('$tool reaches its engine with a stated basis', async ({ tool, input, result }) => {
    expect(await run(tool, input)).toMatchObject({
      status: 'computed', engine: 'deterministic', basis: 'stated', appliesTo: 'the inputs stated in this conversation', result,
    });
  });
});

describe.each(families)('$tool keeps each boolean answer as stated', ({ tool, compute, input, flags }) => {
  it.each(flags)('%s reads not_stated when omitted or null, and is refused when malformed', async field => {
    for (const absent of [undefined, null]) {
      expect(compute(changed(input, { [field]: absent }))).toMatchObject({ inputStates: { [field]: 'not_stated' } });
    }
    for (const answer of [true, false]) {
      expect(compute(changed(input, { [field]: answer }))).toMatchObject({ inputStates: { [field]: answer } });
    }
    for (const value of ['false', 'true', 0, 1]) {
      const out = await run(tool, changed(input, { [field]: value }));
      expect(out).toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field });
      expect(out).not.toHaveProperty('basis');
    }
  });
});

describe('a malformed enum, list, count or percentage is refused by field, never read', () => {
  it.each([
    { tool: 'design_monitoring_plan', input: monitoring, field: 'phase', value: 'Phase 1' },
    { tool: 'design_monitoring_plan', input: monitoring, field: 'noveltyOfIntervention', value: 'Novel' },
    { tool: 'design_monitoring_plan', input: monitoring, field: 'endpointObjectivity', value: 'Subjective' },
    { tool: 'design_monitoring_plan', input: monitoring, field: 'numberOfSites', value: '50' },
    { tool: 'design_monitoring_plan', input: monitoring, field: 'numberOfSites', value: -5 },
    { tool: 'design_monitoring_plan', input: monitoring, field: 'plannedEnrollment', value: '60' },
    { tool: 'assess_inspection_readiness', input: readiness, field: 'inspectionTarget', value: 'FDA' },
    { tool: 'assess_inspection_readiness', input: readiness, field: 'essentialDocsCompletePercent', value: 150 },
    { tool: 'assess_inspection_readiness', input: readiness, field: 'essentialDocsCompletePercent', value: '90' },
    { tool: 'assess_inspection_readiness', input: readiness, field: 'openCapas', value: -2 },
    { tool: 'design_informed_consent', input: consent, field: 'studyType', value: 'Observational' },
    { tool: 'design_informed_consent', input: consent, field: 'vulnerablePopulations', value: 'children' },
    { tool: 'design_informed_consent', input: consent, field: 'vulnerablePopulations', value: ['Children'] },
    { tool: 'design_informed_consent', input: consent, field: 'targetReadingGradeLevel', value: 20 },
    { tool: 'classify_protocol_deviation', input: deviation, field: 'category', value: 'Safety reporting' },
    { tool: 'classify_protocol_deviation', input: deviation, field: 'numberOfParticipantsAffected', value: '5' },
    { tool: 'plan_essential_documents', input: documents, field: 'stage', value: 'Before' },
  ])('$tool refuses $field = $value', async ({ tool, input, field, value }) => {
    const out = await run(tool, changed(input, { [field]: value }));
    expect(out).toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field });
    expect(out).not.toHaveProperty('basis');
  });
});

describe('the six definitions say what an omitted fact means, within the trimmed length', () => {
  it.each(families)('$tool', ({ tool, flags }) => {
    const def = GCP_OPERATIONS_TOOLS.find(t => t.name === tool)!;
    expect(def.description.length).toBeLessThanOrEqual(OPENAI_MAX_TOOL_DESCRIPTION_CHARS);
    expect(def.description).toMatch(/relay the validation error/);
    const properties = def.input_schema.properties as Record<string, { description: string }>;
    for (const field of flags) {
      expect(def.input_schema.required).not.toContain(field);
      expect(properties[field].description, field).toMatch(/Omitted or null stays not_stated/);
      expect(properties[field].description, field).not.toMatch(/\(default/);
    }
  });

  it('claims no scored factor, priority or class the engine does not give', () => {
    const desc = (tool: string) => GCP_OPERATIONS_TOOLS.find(t => t.name === tool)!.description;
    expect(desc('design_monitoring_plan')).not.toMatch(/blinding/);
    expect(desc('assess_gcp_compliance')).not.toMatch(/partial|prioritized/);
  });

  it('names the inputs no function reads', () => {
    const props = (tool: string) => GCP_OPERATIONS_TOOLS.find(t => t.name === tool)!.input_schema.properties as
      Record<string, { description: string }>;
    expect(props('design_monitoring_plan').therapeuticArea.description).toMatch(/Not read/);
    expect(props('design_informed_consent').involvesRandomization.description).toMatch(/Not read/);
    expect(props('design_informed_consent').futureResearchUse.description).toMatch(/Not read/);
  });
});

describe('assess_gcp_compliance gives no gap, strength, score or status from an unstated fact', () => {
  const statusOf = (overrides: Record<string, unknown>) => assessGCPCompliance(changed(compliance, overrides));
  const omit = (fields: string[]) => Object.fromEntries(fields.map(k => [k, undefined]));

  it('does not grade a trial nobody described', () => {
    const out = assessGCPCompliance({});
    expect(out).toMatchObject({ overallStatus: 'not_assessed', complianceScore: null, gaps: [], strengths: [] });
    expect(out.notAssessed).toHaveLength(16);
  });

  it('raises no "not documented" gap for the facts left out', () => {
    const out = statusOf(omit(CROSS_CUTTING_FLAGS));
    expect(out).toMatchObject({ overallStatus: 'not_assessed', complianceScore: 100, gaps: [] });
    expect(out.notAssessed).toEqual(CROSS_CUTTING_FLAGS);
    expect(out.notes.join(' ')).toMatch(/Overall status not assessed: .* from compliant to critical_gaps/);
  });

  it('does not read null as documented', () => {
    const out = statusOf({ delegationDocumented: null, computerizedSystemsValidated: null });
    expect(out.overallStatus).toBe('not_assessed');
    expect(out.strengths.join(' ')).not.toMatch(/Delegation of authority is documented|Computerised systems are validated/);
  });

  it.each(CROSS_CUTTING_FLAGS)('%s left out leaves the status open', field => {
    expect(statusOf({ [field]: undefined }).overallStatus).toBe('not_assessed');
  });

  it('leaves the score null and the principle unverified, without asserting the failure', () => {
    const out = statusOf({ personnelQualified: undefined });
    expect(out).toMatchObject({ overallStatus: 'not_assessed', complianceScore: null });
    expect(out.principleAssessments.find(p => p.principleId === 'P7')).toMatchObject({
      conforms: 'unverified', finding: expect.stringMatching(/^Status not provided — verify and document\. If it is not met:/) });
  });

  it('gives a status no answer to the unstated facts could change', () => {
    expect(assessGCPCompliance({ safetyReportingCompliant: false })).toMatchObject({
      overallStatus: 'critical_gaps', complianceScore: null });
  });

  it('reads a stated protocolFollowedWithChangeControl', () => {
    const out = statusOf({ protocolFollowedWithChangeControl: false });
    expect(out.gaps).toEqual([expect.objectContaining({ domain: 'protocol_compliance', severity: 'major' })]);
    expect(out.overallStatus).toBe('minor_gaps');
  });

  it('keeps the stated answers', () => {
    expect(statusOf({ safetyReportingCompliant: false }).overallStatus).toBe('critical_gaps');
    expect(statusOf({ sponsorOversightDocumented: false, delegationDocumented: false }).overallStatus).toBe('major_gaps');
    expect(statusOf({ auditTrailReviewPerformed: false }).overallStatus).toBe('minor_gaps');
  });
});

describe('design_informed_consent decides no element or method from an unstated feature', () => {
  it('does not call an unstated consent method paper', () => {
    const out = designInformedConsent({ studyType: 'interventional' });
    expect(out.electronicConsentConsiderations.join(' ')).not.toMatch(/Paper consent process selected/);
    expect(out.electronicConsentConsiderations[0]).toMatch(/^Consent method not assessed: electronicConsent, remoteConsent not stated/);
    expect(designInformedConsent(consent).electronicConsentConsiderations[0]).toMatch(/^Paper consent process selected/);
  });

  it('names the elements an unstated feature leaves undecided', () => {
    const out = designInformedConsent({ studyType: 'interventional' });
    const warned = out.warnings.join(' ');
    for (const id of ['unforeseeable_risks', 'commercial_profit', 'return_of_results', 'genome_sequencing']) {
      expect(warned).toContain(id);
      expect(out.applicableAdditionalElements.map(e => e.id)).not.toContain(id);
    }
    expect(designInformedConsent(changed(consent, { moreThanMinimalRisk: false })).warnings.join(' ')).not.toMatch(/Not assessed/);
  });

  it('decides an element from a stated fact that settles it alone', () => {
    const ids = designInformedConsent(changed(consent, { collectsBiospecimens: undefined, genomicData: true }))
      .applicableAdditionalElements.map(e => e.id);
    expect(ids).toContain('genome_sequencing');
    expect(ids).not.toContain('return_of_results');
  });

  it('says when placebo use was not stated', () => {
    expect(designInformedConsent(changed(consent, { involvesPlacebo: undefined })).warnings.join(' ')).toMatch(/Placebo use not stated/);
    expect(designInformedConsent(consent).warnings.join(' ')).not.toMatch(/[Pp]lacebo/);
    const stated = designInformedConsent(changed(consent, { involvesPlacebo: true })).warnings.join(' ');
    expect(stated).toMatch(/Placebo-controlled design/);
    expect(stated).not.toMatch(/Placebo use not stated/);
  });

  it('says when no populations or reading target were stated', () => {
    const out = designInformedConsent(changed(consent, { vulnerablePopulations: undefined, targetReadingGradeLevel: undefined }));
    expect(out.warnings.join(' ')).toMatch(/vulnerablePopulations not stated/);
    expect(out.readabilityGuidance[0]).toMatch(/grade 8 \(no target stated; /);
    expect(designInformedConsent(consent).readabilityGuidance[0]).toMatch(/grade 8 \(6th–8th grade/);
    expect(designInformedConsent(changed(consent, { vulnerablePopulations: ['children'] })).vulnerablePopulationSafeguards)
      .toEqual([expect.objectContaining({ population: 'Children' })]);
  });
});

describe('design_monitoring_plan and plan_essential_documents name what an unstated fact leaves out', () => {
  it('names a critical-to-quality factor an unstated fact decides', () => {
    expect(designMonitoringPlan(changed(monitoring, { blinded: undefined })).notes.join(' '))
      .toMatch(/Not assessed: blinding maintenance \(blinded not stated\)/);
    expect(designMonitoringPlan(changed(monitoring, { blinded: true })).criticalToQualityFactors.map(c => c.id))
      .toContain('CTQ-BLIND-MAINTENANCE');
    expect(designMonitoringPlan(monitoring).notes.join(' ')).not.toMatch(/Not assessed/);
  });

  it('names the device records an unstated device status leaves out', () => {
    const out = planEssentialDocuments(changed(documents, { usesInvestigationalDevice: undefined }));
    expect(out.notes.join(' ')).toMatch(/usesInvestigationalDevice not stated: .*IDE/);
    expect(out.documents.map(d => d.id)).not.toContain('ED-DEVICE-IDE');
    expect(planEssentialDocuments(changed(documents, { usesInvestigationalDevice: true })).documents.map(d => d.id))
      .toContain('ED-DEVICE-IDE');
  });
});

describe('assess_inspection_readiness reports an unstated target and prior findings as unstated', () => {
  it('reads null like an omitted target, and says the sponsor findings are listed', () => {
    const out = assessInspectionReadiness(changed(readiness, { inspectionTarget: null }));
    expect(out.inspectionTarget).toBe('not_stated');
    expect(out.warnings.join(' ')).toMatch(/Inspection target not stated/);
    expect(assessInspectionReadiness(changed(readiness, { inspectionTarget: 'cro' })).inspectionTarget).toBe('cro');
  });

  it('says prior inspection findings were not provided', () => {
    expect(assessInspectionReadiness(changed(readiness, { priorInspectionFindings: undefined })).capaPosture.join(' '))
      .toMatch(/Prior inspection findings not provided/);
  });
});
