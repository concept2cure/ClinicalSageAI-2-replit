import type { Request } from 'express';
import {
  type GenerationGuardResult,
  type GovernedDocumentActionContract,
  validateGovernedDocumentActionContract,
} from '../../../shared/types/document-contract';
import { resolveRulePack } from './rules/ruleResolver';
import { getDocumentClassSemantics } from './authority/documentClassSemantics';

export type GovernedMutationContext = {
  req: Request;
  projectId: number;
  artifactId: number | null;
  documentType: string;
  generationMode: GovernedDocumentActionContract['generationMode'];
  lifecycleStatus: GovernedDocumentActionContract['lifecycleStatus'];
  originSurface?: GovernedDocumentActionContract['originSurface'];
  clientTrack?: GovernedDocumentActionContract['clientTrack'];
  submissionProgram?: GovernedDocumentActionContract['submissionProgram'];
  persona?: GovernedDocumentActionContract['persona'];
  regulatorScope?: GovernedDocumentActionContract['regulatorScope'];
  evidenceMode?: GovernedDocumentActionContract['evidenceMode'];
  documentClass?: GovernedDocumentActionContract['documentClass'];
  readinessGate?: GovernedDocumentActionContract['readinessGate'];
  approvalPathType?: GovernedDocumentActionContract['approvalPathType'];
  recommendationSource?: GovernedDocumentActionContract['recommendationSource'];
  regulatorIntent?: GovernedDocumentActionContract['regulatorIntent'];
  workspaceTarget?: GovernedDocumentActionContract['workspaceTarget'];
  dossierContainerId?: string;
  artifactContainerId?: string;
  title: string;
  content: string;
  ctdSection?: string | null;
  sourceRefs?: string[];
  exportAllowed?: boolean;
  provider?: string;
  model?: string;
  placementContainerId?: string;
  eventType: GovernedDocumentActionContract['auditEventPayload']['eventType'];
};

type ExportGateCheck = { name: string; passed: boolean; detail?: string };

export type GovernedResolutionResult = {
  contract: GovernedDocumentActionContract;
  validation: GenerationGuardResult;
  resolved: {
    originSurface: GovernedDocumentActionContract['originSurface'];
    workspaceTarget: GovernedDocumentActionContract['workspaceTarget'];
    placementContainerId: string;
    rulePack: ReturnType<typeof resolveRulePack>;
    personaOverlay: ReturnType<typeof resolveRulePack>['personaOverlay'];
    documentSemantics: ReturnType<typeof getDocumentClassSemantics>;
    exportGateChecks: ExportGateCheck[];
  };
};

function normalizeSubmissionProgram(
  raw: unknown
): GovernedDocumentActionContract['submissionProgram'] | undefined {
  if (typeof raw !== 'string') return undefined;
  const value = raw.toLowerCase();
  if (value === 'ind') return 'ind';
  if (value === 'ectd') return 'ectd';
  if (value === '510k' || value === '510(k)') return '510k';
  if (value === 'pma') return 'pma';
  if (value === 'cer') return 'cer';
  if (value === 'ivdr') return 'ivdr';
  if (value === 'general_ri' || value === 'general-ri' || value === 'ri') return 'general_ri';
  return undefined;
}

function normalizeWorkspaceTarget(
  raw: unknown
): GovernedDocumentActionContract['workspaceTarget'] | undefined {
  if (raw === 'project' || raw === 'dossier' || raw === 'vault') {
    return raw;
  }
  return undefined;
}

function normalizeReadinessGate(
  raw: unknown
): GovernedDocumentActionContract['readinessGate'] | undefined {
  if (
    raw === 'exploratory' ||
    raw === 'internal_review' ||
    raw === 'submission_candidate' ||
    raw === 'inspection_ready'
  ) {
    return raw;
  }
  return undefined;
}

function normalizeDocumentClass(
  raw: unknown
): GovernedDocumentActionContract['documentClass'] | undefined {
  if (
    raw === 'strategy_memo' ||
    raw === 'evidence_memo' ||
    raw === 'section_draft' ||
    raw === 'module3_output' ||
    raw === 'submission_component' ||
    raw === 'audit_report' ||
    raw === 'comparator_summary' ||
    raw === 'risk_benefit' ||
    raw === 'protocol_rationale' ||
    raw === 'regional_differences' ||
    raw === 'safety_evidence_brief' ||
    raw === 'endpoint_justification'
  ) {
    return raw;
  }
  return undefined;
}

function resolveOriginSurface(context: GovernedMutationContext): GovernedDocumentActionContract['originSurface'] {
  if (context.originSurface) return context.originSurface;
  const body = (context.req.body || {}) as Record<string, unknown>;
  const metadata = (body.metadata || {}) as Record<string, unknown>;
  const candidate = metadata.originSurface || body.originSurface;

  if (
    candidate === 'ri_copilot' ||
    candidate === 'ectd_coauthor' ||
    candidate === 'ind_workspace' ||
    candidate === 'cmc_workspace' ||
    candidate === 'cerv2_device' ||
    candidate === 'editor_panel' ||
    candidate === 'import_pipeline' ||
    candidate === 'system' ||
    candidate === 'project_workspace_shell' ||
    candidate === 'ai_orchestrator' ||
    candidate === 'api_route'
  ) {
    return candidate;
  }
  return 'api_route';
}

function resolveClientTrack(context: GovernedMutationContext): GovernedDocumentActionContract['clientTrack'] {
  if (context.clientTrack) return context.clientTrack;
  const body = (context.req.body || {}) as Record<string, unknown>;
  const metadata = (body.metadata || {}) as Record<string, unknown>;
  const candidate = (metadata.clientTrack || body.clientTrack || '').toString().toLowerCase();
  if (candidate === 'device') return 'device';
  if (candidate === 'diagnostics') return 'diagnostics';
  return 'biotech';
}

function resolveSubmissionProgram(
  context: GovernedMutationContext
): GovernedDocumentActionContract['submissionProgram'] {
  if (context.submissionProgram) return context.submissionProgram;
  const body = (context.req.body || {}) as Record<string, unknown>;
  const metadata = (body.metadata || {}) as Record<string, unknown>;
  return (
    normalizeSubmissionProgram(metadata.submissionProgram || body.submissionProgram || body.type) ||
    'general_ri'
  );
}

function resolvePersona(context: GovernedMutationContext): GovernedDocumentActionContract['persona'] {
  if (context.persona) return context.persona;
  const body = (context.req.body || {}) as Record<string, unknown>;
  const metadata = (body.metadata || {}) as Record<string, unknown>;
  const role = ((metadata.persona || body.persona || context.req.userRole || '') as string).toLowerCase();
  if (role === 'medical_writer' || role === 'medical-writer' || role === 'writer') return 'medical_writer';
  if (role === 'cmc') return 'cmc';
  if (role === 'clinical') return 'clinical';
  if (role === 'qa') return 'qa';
  if (role === 'executive') return 'executive';
  if (role === 'cro') return 'cro';
  return 'regulatory';
}

function resolveRegulatorScope(context: GovernedMutationContext): GovernedDocumentActionContract['regulatorScope'] {
  if (context.regulatorScope) return context.regulatorScope;
  const body = (context.req.body || {}) as Record<string, unknown>;
  const metadata = (body.metadata || {}) as Record<string, unknown>;
  const region = ((metadata.regulatorScope || metadata.region || body.regulatorScope || '') as string).toLowerCase();
  if (region === 'ema') return 'ema';
  if (region === 'mhra') return 'mhra';
  if (region === 'hc' || region === 'health_canada') return 'hc';
  if (region === 'pmda') return 'pmda';
  if (region === 'multi') return 'multi';
  return 'fda';
}

function resolveEvidenceMode(context: GovernedMutationContext): GovernedDocumentActionContract['evidenceMode'] {
  if (context.evidenceMode) return context.evidenceMode;
  const body = (context.req.body || {}) as Record<string, unknown>;
  const metadata = (body.metadata || {}) as Record<string, unknown>;
  const candidate = (metadata.evidenceMode || body.evidenceMode || '').toString().toLowerCase();
  if (candidate === 'csr') return 'csr';
  if (candidate === 'literature') return 'literature';
  if (candidate === 'predicate') return 'predicate';
  if (candidate === 'cmc_source' || candidate === 'cmc') return 'cmc_source';
  if (candidate === 'test_data' || candidate === 'test') return 'test_data';
  return 'mixed';
}

function resolveDocumentClass(context: GovernedMutationContext): GovernedDocumentActionContract['documentClass'] {
  if (context.documentClass) return context.documentClass;
  const body = (context.req.body || {}) as Record<string, unknown>;
  const metadata = (body.metadata || {}) as Record<string, unknown>;
  const ctdSection = context.ctdSection || (metadata.ctdSection as string | undefined);
  const typeCandidate = (metadata.documentClass || body.documentClass || context.documentType || '')
    .toString()
    .toLowerCase();

  const normalized = normalizeDocumentClass(typeCandidate);
  if (normalized) return normalized;

  if (typeCandidate.includes('audit')) return 'audit_report';
  if (typeCandidate.includes('risk')) return 'risk_benefit';
  if (typeCandidate.includes('protocol')) return 'protocol_rationale';
  if (typeCandidate.includes('endpoint')) return 'endpoint_justification';
  if (typeCandidate.includes('section') || ctdSection?.startsWith('2.') || ctdSection?.startsWith('3.')) {
    return ctdSection?.startsWith('3.') ? 'module3_output' : 'section_draft';
  }
  if (typeCandidate.includes('submission')) return 'submission_component';
  if (typeCandidate.includes('evidence')) return 'evidence_memo';
  if (typeCandidate.includes('regional')) return 'regional_differences';
  if (typeCandidate.includes('safety')) return 'safety_evidence_brief';
  return 'strategy_memo';
}

function resolveReadinessGate(
  context: GovernedMutationContext,
  documentClass: GovernedDocumentActionContract['documentClass']
): GovernedDocumentActionContract['readinessGate'] {
  if (context.readinessGate) return context.readinessGate;
  const body = (context.req.body || {}) as Record<string, unknown>;
  const metadata = (body.metadata || {}) as Record<string, unknown>;
  const normalized = normalizeReadinessGate(metadata.readinessGate || body.readinessGate);
  if (normalized) return normalized;
  if (context.lifecycleStatus === 'published') return 'submission_candidate';
  if (context.lifecycleStatus === 'locked' || documentClass === 'audit_report') return 'inspection_ready';
  return 'exploratory';
}

function resolveRecommendationSource(
  context: GovernedMutationContext,
  originSurface: GovernedDocumentActionContract['originSurface'],
  submissionProgram: GovernedDocumentActionContract['submissionProgram']
): GovernedDocumentActionContract['recommendationSource'] {
  if (context.recommendationSource) return context.recommendationSource;
  if (originSurface === 'cmc_workspace') return 'cmc_builder';
  if (originSurface === 'ri_copilot') return 'ana_ri';
  if (originSurface === 'ectd_coauthor') return 'ectd_compiler';
  if (originSurface === 'ind_workspace') return 'ind_autodraft';
  if (originSurface === 'cerv2_device') {
    if (submissionProgram === '510k') return 'cerv2_510k';
    if (submissionProgram === 'pma') return 'cerv2_pma';
    if (submissionProgram === 'cer') return 'cerv2_cer';
  }
  return 'report_engine';
}

function resolveRegulatorIntent(
  context: GovernedMutationContext,
  documentClass: GovernedDocumentActionContract['documentClass']
): GovernedDocumentActionContract['regulatorIntent'] {
  if (context.regulatorIntent) return context.regulatorIntent;
  if (documentClass === 'audit_report') return 'inspection_support';
  if (documentClass === 'strategy_memo') return 'strategy';
  if (documentClass === 'comparator_summary' || documentClass === 'regional_differences') {
    return 'comparison';
  }
  if (documentClass === 'evidence_memo' || documentClass === 'risk_benefit') return 'evidence_analysis';
  return 'submission_authoring';
}

function resolveWorkspaceTarget(
  context: GovernedMutationContext,
  documentClass: GovernedDocumentActionContract['documentClass'],
  readinessGate: GovernedDocumentActionContract['readinessGate']
): GovernedDocumentActionContract['workspaceTarget'] {
  if (context.workspaceTarget) return context.workspaceTarget;
  const body = (context.req.body || {}) as Record<string, unknown>;
  const metadata = (body.metadata || {}) as Record<string, unknown>;
  const normalized = normalizeWorkspaceTarget(metadata.workspaceTarget || body.workspaceTarget);
  if (normalized) return normalized;
  if (documentClass === 'audit_report') return 'vault';
  if (readinessGate === 'submission_candidate' || documentClass === 'module3_output') return 'dossier';
  return 'project';
}

function resolvePlacementTarget(
  context: GovernedMutationContext,
  workspaceTarget: GovernedDocumentActionContract['workspaceTarget']
): {
  placementTarget: GovernedDocumentActionContract['placementTarget'];
  dossierContainerId?: string;
  artifactContainerId?: string;
} {
  const body = (context.req.body || {}) as Record<string, unknown>;
  const metadata = (body.metadata || {}) as Record<string, unknown>;
  const requestedContainerId =
    context.placementContainerId ||
    (metadata.containerId as string | undefined) ||
    (body.containerId as string | undefined);
  const dossierContainerId =
    context.dossierContainerId ||
    (metadata.dossierContainerId as string | undefined) ||
    (body.dossierContainerId as string | undefined);
  const artifactContainerId =
    context.artifactContainerId ||
    (metadata.artifactContainerId as string | undefined) ||
    (body.artifactContainerId as string | undefined);

  const containerId =
    requestedContainerId ||
    (workspaceTarget === 'dossier'
      ? dossierContainerId
      : workspaceTarget === 'vault'
        ? artifactContainerId
        : String(context.projectId)) ||
    String(context.projectId);

  return {
    placementTarget: {
      workspace: workspaceTarget,
      containerId,
      sectionKey: context.ctdSection || undefined,
    },
    dossierContainerId: workspaceTarget === 'dossier' ? dossierContainerId : undefined,
    artifactContainerId: workspaceTarget === 'vault' ? artifactContainerId : undefined,
  };
}

function resolveApprovalPathType(
  context: GovernedMutationContext,
  documentClass: GovernedDocumentActionContract['documentClass'],
  readinessGate: GovernedDocumentActionContract['readinessGate'],
  personaOverlay: ReturnType<typeof resolveRulePack>['personaOverlay'],
  semantics: ReturnType<typeof getDocumentClassSemantics>
): GovernedDocumentActionContract['approvalPathType'] {
  if (context.approvalPathType) return context.approvalPathType;
  if (personaOverlay.approvalPathOverride) return personaOverlay.approvalPathOverride;
  if (readinessGate === 'inspection_ready') return 'qa_lock';
  if (documentClass === 'submission_component' || documentClass === 'module3_output') {
    return 'regulated_dual_review';
  }
  return semantics.defaultApprovalPath;
}

function evaluateExportGates(
  contract: GovernedDocumentActionContract,
  resolvedRulePack: ReturnType<typeof resolveRulePack>
) {
  const checks: ExportGateCheck[] = [];
  const hasCtdSection = Boolean(contract.editorPayload.ctdSection);
  const hasEvidenceClassification = ['csr', 'literature', 'predicate', 'cmc_source', 'test_data'].includes(
    contract.evidenceMode
  );
  const hasSourceRefs = Boolean(contract.provenancePayload.sourceRefs?.length);
  const strongApproval = ['regulated_dual_review', 'qa_lock', 'signoff_required'].includes(
    contract.approvalPathType
  );

  checks.push({
    name: 'placement_present',
    passed: Boolean(contract.placementTarget.containerId),
    detail: `workspace=${contract.workspaceTarget}`,
  });
  checks.push({ name: 'ctd_section_present', passed: hasCtdSection, detail: contract.editorPayload.ctdSection });
  checks.push({
    name: 'evidence_present',
    passed: contract.editorPayload.content.length > 50,
    detail: `content_length=${contract.editorPayload.content.length}`,
  });
  checks.push({
    name: 'evidence_classification_present',
    passed: hasEvidenceClassification,
    detail: `evidenceMode=${contract.evidenceMode}`,
  });
  checks.push({
    name: 'provenance_complete',
    passed: Boolean(
      contract.provenancePayload.generatedAt &&
        contract.provenancePayload.generatedBy &&
        contract.provenancePayload.provider &&
        contract.provenancePayload.model
    ),
  });
  checks.push({ name: 'source_refs_present', passed: hasSourceRefs });
  checks.push({ name: 'regulator_scope_declared', passed: Boolean(contract.regulatorScope) });
  checks.push({ name: 'approval_path_satisfied', passed: strongApproval || contract.readinessGate === 'exploratory' });
  checks.push({
    name: 'readiness_gate_satisfied',
    passed: contract.readinessGate !== 'inspection_ready' || strongApproval,
  });
  checks.push({
    name: 'document_class_rules_satisfied',
    passed: resolvedRulePack.disallowedCombinations.length === 0,
    detail: resolvedRulePack.disallowedCombinations.join('; ') || undefined,
  });
  checks.push({
    name: 'dossier_placement_satisfied',
    passed:
      contract.workspaceTarget !== 'dossier' ||
      Boolean(contract.dossierContainerId && contract.placementTarget.workspace === 'dossier'),
  });
  checks.push({
    name: 'module_mapping_present',
    passed: contract.documentClass !== 'module3_output' || Boolean(contract.editorPayload.ctdSection?.startsWith('3.')),
  });
  checks.push({
    name: 'predicate_context_present',
    passed:
      contract.evidenceMode !== 'predicate' ||
      contract.clientTrack === 'device' ||
      contract.readinessGate === 'exploratory',
  });
  checks.push({
    name: 'review_status_sufficient',
    passed:
      contract.readinessGate !== 'inspection_ready' ||
      ['in_review', 'approved', 'locked', 'published'].includes(contract.lifecycleStatus),
  });

  const blockingReasons = checks.filter(c => !c.passed).map(c => c.name);
  const readinessOutcome =
    blockingReasons.length === 0 ? 'ready' : contract.readinessGate === 'exploratory' ? 'conditional' : 'blocked';

  return {
    allowed: blockingReasons.length === 0 || readinessOutcome === 'conditional',
    gateChecks: checks,
    blockingReasons,
    readinessOutcome,
  } as const;
}

export function resolveGovernedContext(context: GovernedMutationContext): GovernedResolutionResult {
  const now = new Date().toISOString();
  const actorId = context.req.userId || context.req.userEmail || 'unknown';
  const body = (context.req.body || {}) as Record<string, unknown>;
  const metadata = (body.metadata || {}) as Record<string, unknown>;
  const traceId =
    (metadata.traceId as string | undefined) || (body.traceId as string | undefined);

  const originSurface = resolveOriginSurface(context);
  const clientTrack = resolveClientTrack(context);
  const submissionProgram = resolveSubmissionProgram(context);
  const persona = resolvePersona(context);
  const regulatorScope = resolveRegulatorScope(context);
  const evidenceMode = resolveEvidenceMode(context);
  const documentClass = resolveDocumentClass(context);
  const readinessGate = resolveReadinessGate(context, documentClass);
  const workspaceTarget = resolveWorkspaceTarget(context, documentClass, readinessGate);
  const placement = resolvePlacementTarget(context, workspaceTarget);
  const semantics = getDocumentClassSemantics(documentClass);
  const provisionalContract: GovernedDocumentActionContract = {
    projectId: context.projectId,
    artifactId: context.artifactId,
    documentType: context.documentType,
    originSurface,
    generationMode: context.generationMode,
    lifecycleStatus: context.lifecycleStatus,
    clientTrack,
    submissionProgram,
    persona,
    regulatorScope,
    evidenceMode,
    documentClass,
    readinessGate,
    approvalPathType: context.approvalPathType || semantics.defaultApprovalPath,
    recommendationSource: resolveRecommendationSource(context, originSurface, submissionProgram),
    workspaceTarget,
    dossierContainerId: placement.dossierContainerId,
    artifactContainerId: placement.artifactContainerId,
    regulatorIntent: resolveRegulatorIntent(context, documentClass),
    editorPayload: {
      title: context.title,
      content: context.content,
      ctdSection: context.ctdSection || undefined,
    },
    placementTarget: placement.placementTarget,
    provenancePayload: {
      generatedAt: now,
      generatedBy: actorId,
      runId: traceId,
      sourceRefs: context.sourceRefs,
      provider: context.provider,
      model: context.model,
    },
    auditEventPayload: {
      eventType: context.eventType,
      actorId,
      actorRole: context.req.userRole || undefined,
      at: now,
      metadata: {
        originSurface,
        clientTrack,
        submissionProgram,
        persona,
        regulatorScope,
        documentClass,
        readinessGate,
      },
    },
    exportEligibility: {
      allowed: false,
      reason: 'pending gate evaluation',
    },
  };
  const initialRulePack = resolveRulePack(provisionalContract);
  const personaOverlay = initialRulePack.personaOverlay;
  const approvalPathType = resolveApprovalPathType(
    context,
    documentClass,
    readinessGate,
    personaOverlay,
    semantics
  );
  const recommendationSource = provisionalContract.recommendationSource;
  const regulatorIntent = provisionalContract.regulatorIntent;

  const contract: GovernedDocumentActionContract = {
    projectId: context.projectId,
    artifactId: context.artifactId,
    documentType: context.documentType,
    originSurface,
    generationMode: context.generationMode,
    lifecycleStatus: context.lifecycleStatus,
    clientTrack,
    submissionProgram,
    persona,
    regulatorScope,
    evidenceMode,
    documentClass,
    readinessGate,
    approvalPathType,
    recommendationSource,
    workspaceTarget,
    dossierContainerId: placement.dossierContainerId,
    artifactContainerId: placement.artifactContainerId,
    regulatorIntent,
    editorPayload: {
      title: context.title,
      content: context.content,
      ctdSection: context.ctdSection || undefined,
    },
    placementTarget: placement.placementTarget,
    provenancePayload: {
      generatedAt: now,
      generatedBy: actorId,
      runId: traceId,
      sourceRefs: context.sourceRefs,
      provider: context.provider,
      model: context.model,
    },
    auditEventPayload: {
      eventType: context.eventType,
      actorId,
      actorRole: context.req.userRole || undefined,
      at: now,
      metadata: {
        originSurface,
        clientTrack,
        submissionProgram,
        persona,
        regulatorScope,
        documentClass,
        readinessGate,
      },
    },
    exportEligibility: {
      allowed: false,
      reason: 'pending gate evaluation',
    },
  };

  const rulePack = resolveRulePack(contract);
  const exportGateResult = evaluateExportGates(contract, rulePack);
  contract.exportEligibility = {
    allowed: context.exportAllowed ?? exportGateResult.allowed,
    reason: exportGateResult.allowed
      ? 'Gate checks satisfied for current readiness'
      : 'One or more regulatory export gates failed',
    gateChecks: exportGateResult.gateChecks,
    blockingReasons: exportGateResult.blockingReasons,
    readinessOutcome: exportGateResult.readinessOutcome,
  };

  const validation = validateGovernedDocumentActionContract(contract);
  validation.warnings.push(...rulePack.warnings, ...rulePack.personaOverlay.warnings);
  if (rulePack.disallowedCombinations.length > 0) {
    validation.errors.push(...rulePack.disallowedCombinations);
    validation.valid = false;
  }

  return {
    contract,
    validation,
    resolved: {
      originSurface,
      workspaceTarget,
      placementContainerId: placement.placementTarget.containerId,
      rulePack,
      personaOverlay,
      documentSemantics: semantics,
      exportGateChecks: exportGateResult.gateChecks,
    },
  };
}

export function validateGovernedArtifactMutation(
  context: GovernedMutationContext
): GenerationGuardResult {
  return resolveGovernedContext(context).validation;
}
