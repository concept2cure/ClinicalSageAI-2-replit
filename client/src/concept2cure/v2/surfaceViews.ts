/**
 * SURFACE_VIEWS — the ui-v2 renderer map (kit `window.SURFACE_VIEWS`).
 *
 * Layer 2 of the 5-layer install model: each reconciled registry id maps to
 * its ported kit component plus its layout flags:
 *   full:true    → the surface owns the canvas (editor, regulatory workspace,
 *                  MDX frame)
 *   hideAna:true → collapses the global AnA rail (the surface carries its own
 *                  right pane) — honor this or the editor's doc column is
 *                  crushed.
 *
 * Phase 1 ships the map EMPTY: every id resolves to the honest
 * SurfaceScaffold fallback in V2App. Phase 3 registers each surface here as
 * it ports (kit load order in app/index.html is the port order).
 */
import type React from 'react';
import type { UiSurface } from '@shared/constants/ui-surface-registry';
import { CapabilityIndex } from './intelligence/Intelligence';
import { Setup, AuditTrail, Apps, ArtifactsCenter, AdminConsole } from './surfaces/AdminSurfaces';
import { AgencyMeetings } from './surfaces/AgencyMeetings';
import { AnaCommand } from './surfaces/AnaCommand';
import { AnaMemory } from './surfaces/AnaMemory';
import { AuthoringEngine } from './surfaces/AuthoringEngine';
import { BatchDraft } from './surfaces/BatchDraft';
import { BiopharmaJourney } from './surfaces/BiopharmaJourney';
import { BiopharmaProject, CsrWorkflow, RegulatoryWorkspace } from './surfaces/BiopharmaProject';
import { Pediatric, Orphan, Lifecycle, Pharmacovigilance } from './surfaces/BiopharmaSpecialty';
import { PvCockpit } from './surfaces/PvCockpit';
import { Biostatistics } from './surfaces/Biostatistics';
import { BiostatWorkbench } from './surfaces/BiostatWorkbench';
import { ChangeAssessment } from './surfaces/ChangeAssessment';
import { ClinicalOps } from './surfaces/ClinicalOps';
import { ConversationThread } from './surfaces/ConversationThread';
import { CroPortfolio } from './surfaces/CroPortfolio';
import { CmcModule } from './surfaces/CmcModule';
import { CommunicationCenter } from './surfaces/CommunicationCenter';
import { CodebaseCoverage } from './surfaces/Coverage';
import { DecisionLineage } from './surfaces/DecisionLineage';
import { DeepResearch } from './surfaces/DeepResearch';
import { DesignControls } from './surfaces/DesignControls';
import { DeviceWorkstream } from './surfaces/DeviceWorkstream';
import { DispatchReadiness } from './surfaces/DispatchReadiness';
import { DocJourney } from './surfaces/DocJourney';
import { DocumentAuthoring } from './surfaces/DocumentAuthoring';
import { Dossier } from './surfaces/Dossier';
import { DossierMap } from './surfaces/DossierMap';
import { EctdCoauthor } from './surfaces/EctdCoauthor';
import { EctdCompile } from './surfaces/EctdCompile';
import { Etmf } from './surfaces/Etmf';
import { Evidence } from './surfaces/Evidence';
import { FilingsCatalog } from './surfaces/FilingsCatalog';
import { HaqManager } from './surfaces/HaqManager';
import { HumanFactors } from './surfaces/HumanFactors';
import { Inconsistency } from './surfaces/Inconsistency';
import { IndLifecycle } from './surfaces/IndLifecycle';
import { InvestigatorBrochure } from './surfaces/InvestigatorBrochure';
import { InsightsCanvas } from './surfaces/Insights';
import { IvdCompleteness } from './surfaces/IvdCompleteness';
import { Labeling } from './surfaces/Labeling';
import { LabelingPI } from './surfaces/LabelingPi';
import { SmpcLabeling } from './surfaces/SmpcLabeling';
import { LicensingSurface } from './surfaces/LicensingSurface';
import { MaaCockpit } from './surfaces/MaaCockpit';
import { MarketAccess } from './surfaces/MarketAccess';
import { NdaCockpit } from './surfaces/NdaCockpit';
import { Nonclinical } from './surfaces/Nonclinical';
import { Onboarding } from './surfaces/Onboarding';
import { Orchestration } from './surfaces/Orchestration';
import { PdevInd } from './surfaces/PdevInd';
import { PrecedentEngine } from './surfaces/PrecedentEngine';
import { ProtocolWorkspace } from './surfaces/ProtocolDev';
import { ProjectHome } from './surfaces/ProjectHome';
import { Projects } from './surfaces/Projects';
import { PyramidShell } from './surfaces/Pyramid';
import { Rbm } from './surfaces/Rbm';
import { RbmOperations } from './surfaces/RbmOperations';
import { RegChange } from './surfaces/RegChange';
import { Registrations } from './surfaces/Registrations';
import { ReportEngine } from './surfaces/ReportEngine';
import { ResearchAdmin } from './surfaces/ResearchAdmin';
import { Review } from './surfaces/Review';
import { Risk } from './surfaces/Risk';
import { SafetyNarrative } from './surfaces/SafetyNarrative';
import { ShadowReview } from './surfaces/ShadowReview';
import { SourceTracer } from './surfaces/SourceTracer';
import { SubmissionCenter } from './surfaces/SubmissionCenter';
import { QmpWorkspace } from './surfaces/QmpWorkspace';
import { Part11Console } from './surfaces/Part11Console';
import { SubmissionTwin } from './surfaces/SubmissionTwin';
import { GlobalRiBrowser } from './surfaces/Surfaces';
import { TaskBoard } from './surfaces/TaskBoard';
import { TemplateLibrary } from './surfaces/TemplateLibrary';
import { Training } from './surfaces/Training';
import { UsageBilling } from './surfaces/UsageBilling';
import { Vault } from './surfaces/Vault';

export interface SurfaceViewProps {
  surface: UiSurface;
  onAsk: (text: string) => void;
  onNav: (id: string) => void;
  segment: string;
}

export interface SurfaceView {
  component: React.ComponentType<SurfaceViewProps>;
  full?: boolean;
  hideAna?: boolean;
}

/* Kit load order (app/index.html) is the port order; flags mirror the kit's
   window.SURFACE_VIEWS registrations exactly. */
export const SURFACE_VIEWS: Record<string, SurfaceView> = {
  'admin-console': { component: AdminConsole },
  'agency-meetings': { component: AgencyMeetings },
  'ana-command': { component: AnaCommand },
  'ana-memory': { component: AnaMemory },
  apps: { component: Apps },
  'artifacts-center': { component: ArtifactsCenter },
  'audit-trail': { component: AuditTrail },
  'authoring-engine': { component: AuthoringEngine },
  'batch-draft': { component: BatchDraft, full: true },
  biopharma: { component: BiopharmaProject },
  biostatistics: { component: Biostatistics },
  'biostat-workbench': { component: BiostatWorkbench },
  'change-assessment': { component: ChangeAssessment },
  'clinical-ops': { component: ClinicalOps },
  cmc: { component: CmcModule },
  'communication-center': { component: CommunicationCenter },
  'conversation-thread': { component: ConversationThread, hideAna: true },
  coverage: { component: CodebaseCoverage },
  'cro-portfolio': { component: CroPortfolio },
  'csr-workflow': { component: CsrWorkflow, full: true, hideAna: true },
  'decision-lineage': { component: DecisionLineage, full: true },
  'deep-research': { component: DeepResearch },
  'design-controls': { component: DesignControls },
  'device-510k': { component: DeviceWorkstream, full: true, hideAna: true },
  'device-cer': { component: DeviceWorkstream, full: true, hideAna: true },
  'device-diagnostics': { component: DeviceWorkstream, full: true, hideAna: true },
  'device-submission': { component: DeviceWorkstream, full: true, hideAna: true },
  'device-workstream': { component: DeviceWorkstream, full: true, hideAna: true },
  'dispatch-readiness': { component: DispatchReadiness, full: true },
  'doc-journey': { component: DocJourney },
  'document-authoring': { component: DocumentAuthoring, full: true, hideAna: true },
  dossier: { component: Dossier },
  'dossier-map': { component: DossierMap },
  'ectd-coauthor': { component: EctdCoauthor, full: true, hideAna: true },
  'ectd-compile': { component: EctdCompile },
  etmf: { component: Etmf },
  'evidence-search': { component: Evidence },
  'filings-catalog': { component: FilingsCatalog },
  'global-ri': { component: GlobalRiBrowser, full: true },
  'haq-manager': { component: HaqManager },
  'human-factors': { component: HumanFactors },
  inconsistency: { component: Inconsistency },
  'ind-checklist': { component: IndLifecycle },
  'ind-lifecycle': { component: IndLifecycle },
  'investigator-brochure': { component: InvestigatorBrochure },
  insights: { component: InsightsCanvas, full: true, hideAna: true },
  'intelligence-catalog': { component: CapabilityIndex },
  'ivd-completeness': { component: IvdCompleteness, full: true },
  labeling: { component: Labeling },
  'labeling-pi': { component: LabelingPI },
  'labeling-smpc': { component: SmpcLabeling },
  licensing: { component: LicensingSurface },
  'lifecycle-mgmt': { component: Lifecycle },
  'maa-cockpit': { component: MaaCockpit },
  'market-access': { component: MarketAccess },
  'nda-cockpit': { component: NdaCockpit },
  nonclinical: { component: Nonclinical },
  onboarding: { component: Onboarding },
  orchestration: { component: Orchestration },
  orphan: { component: Orphan },
  pdev: { component: PdevInd },
  pediatric: { component: Pediatric },
  pharmacovigilance: { component: Pharmacovigilance },
  'pv-cockpit': { component: PvCockpit },
  'precedent-intelligence': { component: PrecedentEngine },
  'program-journey': { component: BiopharmaJourney },
  'project-home': { component: ProjectHome, full: true },
  projects: { component: Projects },
  'protocol-dev': { component: ProtocolWorkspace, full: true, hideAna: true },
  pyramid: { component: PyramidShell },
  rbm: { component: Rbm, hideAna: true },
  'rbm-operations': { component: RbmOperations },
  'reg-change': { component: RegChange },
  registrations: { component: Registrations },
  'regulatory-workspace': { component: RegulatoryWorkspace, full: true },
  'report-engine': { component: ReportEngine },
  'research-admin': { component: ResearchAdmin },
  review: { component: Review },
  risk: { component: Risk },
  'safety-narrative': { component: SafetyNarrative },
  setup: { component: Setup },
  'shadow-review': { component: ShadowReview, full: true },
  'source-tracer': { component: SourceTracer },
  qmp: { component: QmpWorkspace },
  'part11-console': { component: Part11Console },
  'submission-center': { component: SubmissionCenter },
  'submission-twin': { component: SubmissionTwin },
  'task-board': { component: TaskBoard },
  tasks: { component: TaskBoard },
  'template-library': { component: TemplateLibrary },
  training: { component: Training },
  billing: { component: UsageBilling },
  usage: { component: UsageBilling },
  vault: { component: Vault, full: true },
};
