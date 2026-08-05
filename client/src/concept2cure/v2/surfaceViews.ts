/**
 * SURFACE_VIEWS — the ui-v2 renderer map (kit `window.SURFACE_VIEWS`).
 *
 * Layer 2 of the 5-layer install model: each reconciled registry id maps to
 * its ported kit component plus its layout flags:
 *   full:true             → the surface owns the canvas (editor, regulatory
 *                           workspace, MDX frame)
 *   ownsConversation:true → the surface takes the AnA rail's column, so the
 *                           shell does not render the rail here.
 *
 * `ownsConversation` was called `hideAna`, and the rename is the point rather
 * than cosmetics. One flag was doing several jobs and only one of them was
 * stated: it collapsed the rail. What it silently did NOT do was tell the shell
 * that `onAsk` had nowhere to land — so six surfaces hid the rail and kept
 * handing questions to it. The answer streamed into a column that screen never
 * drew, and `ask()` persisted `anaOpen:true`, which armed the rail for the NEXT
 * surface that did draw one. You pressed "Ask AnA", saw nothing, navigated away,
 * and found your question and its answer already open.
 *
 * The flag now carries the obligation as well as the layout: a surface that
 * takes the rail's column is RESPONSIBLE for where a question goes. Three
 * discharges are legitimate —
 *   • answer in its own dock (`rbm`, `document-authoring`, `ectd-coauthor`),
 *   • hand the question to `conversation-thread` and go there (the shell's own
 *     `ask()` does this for ⌘K, exactly as Home does), or
 *   • offer no assistant at all, deliberately (`client-portal`).
 * — and the SurfaceView union below makes the fourth, "hand it to a rail that
 * isn't there", a compile error rather than a silence.
 *
 * Phase 1 ships the map EMPTY: every id resolves to the honest
 * SurfaceScaffold fallback in V2App. Phase 3 registers each surface here as
 * it ports (kit load order in app/index.html is the port order).
 */
import type React from 'react';
import type { UiSurface } from '@shared/constants/ui-surface-registry';
import { CapabilityIndex } from './intelligence/Intelligence';
import { Setup, Apps, ArtifactsCenter, AuditTrail } from './surfaces/AdminSurfaces';
import { AdminAccess } from './surfaces/AdminAccess';
import { AgencyMeetings } from './surfaces/AgencyMeetings';
import { AnaCommand } from './surfaces/AnaCommand';
import { AnaMemory } from './surfaces/AnaMemory';
import { AuthoringEngine } from './surfaces/AuthoringEngine';
import { BatchDraft } from './surfaces/BatchDraft';
import { BiopharmaJourney } from './surfaces/BiopharmaJourney';
import { CsrWorkflow, RegulatoryWorkspace } from './surfaces/BiopharmaProject';
import { Pediatric, Orphan, Lifecycle, Pharmacovigilance } from './surfaces/BiopharmaSpecialty';
import { PvCockpit } from './surfaces/PvCockpit';
import { Biostatistics } from './surfaces/Biostatistics';
import { BiostatWorkbench } from './surfaces/BiostatWorkbench';
import { ChangeAssessment } from './surfaces/ChangeAssessment';
import { ClinicalOps } from './surfaces/ClinicalOps';
import { ClientPortal } from './surfaces/ClientPortal';
import { ConversationThread } from './surfaces/ConversationThread';
import { CrlLibrary } from './surfaces/CrlLibrary';
import { CroPortfolio } from './surfaces/CroPortfolio';
import { CmcModule } from './surfaces/CmcModule';
import { CommunicationCenter } from './surfaces/CommunicationCenter';
import { CodebaseCoverage } from './surfaces/Coverage';
import { DecisionLineage } from './surfaces/DecisionLineage';
import { DeepResearch } from './surfaces/DeepResearch';
import { DesignControls } from './surfaces/DesignControls';
import { DeviceSurfaces } from './surfaces/DeviceSurfaces';
import { DispatchReadiness } from './surfaces/DispatchReadiness';
import { DocJourney } from './surfaces/DocJourney';
import { DocumentAuthoring } from './surfaces/DocumentAuthoring';
import { Dossier } from './surfaces/Dossier';
import { DossierMap } from './surfaces/DossierMap';
import { EctdCoauthor } from './surfaces/EctdCoauthor';
import { EctdCompile } from './surfaces/EctdCompile';
import { PublishingCenter } from './surfaces/PublishingCenter';
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
import { OnboardingIngest } from './surfaces/OnboardingIngest';
import { Orchestration } from './surfaces/Orchestration';
import { PdevSurfaces } from './surfaces/PdevSurfaces';
import { PrecedentEngine } from './surfaces/PrecedentEngine';
import { ProtocolWorkspace } from './surfaces/ProtocolDev';
import { ProjectHome } from './surfaces/ProjectHome';
import { Projects } from './surfaces/Projects';
import { PyramidShell } from './surfaces/Pyramid';
import { Rbm } from './surfaces/Rbm';
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
import { QualityModule } from './surfaces/QualityModule';
import { Part11Console } from './surfaces/Part11Console';
import { IdentityConsole } from './surfaces/IdentityConsole';
import { ReportGovernance } from './surfaces/ReportGovernance';
import { SubmissionTwin } from './surfaces/SubmissionTwin';
import { GatewayTransmittals } from './surfaces/GatewayTransmittals';
import { GlobalRiBrowser } from './surfaces/Surfaces';
import { TaskBoard } from './surfaces/TaskBoard';
import { TemplateLibrary } from './surfaces/TemplateLibrary';
import { Training } from './surfaces/Training';
import { UsageBilling } from './surfaces/UsageBilling';
import { Vault } from './surfaces/Vault';

export interface SurfaceViewProps {
  surface: UiSurface;
  /** The SHELL's conversation. Only surfaces the shell draws a rail beside get
   *  this — see `OwnedSurfaceViewProps`. */
  onAsk: (text: string) => void;
  onNav: (id: string) => void;
  segment: string;
}

/**
 * What a surface that owns the conversation receives: everything except the
 * shell's `onAsk`. There is no rail on these screens, so there is no `onAsk` to
 * hand out — and because the prop is absent from the type, a surface cannot
 * quietly start using it again. `onNav` stays: seeding `window.C2C_CONVO` and
 * navigating to `conversation-thread` is one of the sanctioned discharges.
 */
export type OwnedSurfaceViewProps = Omit<SurfaceViewProps, 'onAsk'>;

/**
 * A registry entry. The union is the guard: `ownsConversation: true` narrows
 * `component` to one that cannot take the shell's `onAsk`, so the mistake this
 * file's header describes is a type error at the registration site — the one
 * place where both facts (the flag and the component) are visible together.
 */
export type SurfaceView =
  | {
      component: React.ComponentType<SurfaceViewProps>;
      full?: boolean;
      ownsConversation?: false;
    }
  | {
      component: React.ComponentType<OwnedSurfaceViewProps>;
      full?: boolean;
      ownsConversation: true;
    };

/**
 * The widening for a component that owns its conversation but still DECLARES
 * the full `SurfaceViewProps` even though it never reads `onAsk`. Assignability
 * can see the declaration and not the (non-)use, so the union above rejects it.
 *
 * Exactly three registrations need this today, and each stops needing it the
 * moment its own props are narrowed — a one-line edit per file, outside this
 * change's file set:
 *
 *   surfaces/ClientPortal.tsx:43        `({ onNav }: SurfaceViewProps)`
 *                                       → `({ onNav }: OwnedSurfaceViewProps)`
 *   surfaces/ConversationThread.tsx:262 `({ onNav }: SurfaceViewProps)`
 *                                       → `({ onNav }: OwnedSurfaceViewProps)`
 *   surfaces/Rbm.tsx:68                 `({ onAsk, onNav }: SurfaceViewProps)`
 *                                       → `({ onNav }: OwnedSurfaceViewProps)`
 *                                       (`onAsk` is destructured, never used)
 *
 * The set is pinned in tests/ui/one-shell.test.ts ("the unused-onAsk widening
 * is spent only on the three components that predate the guard"), so it cannot
 * grow to cover a NEW surface without that assertion being edited too — which
 * is the review moment the guard exists to create.
 */

/* Kit load order (app/index.html) is the port order; flags mirror the kit's
   window.SURFACE_VIEWS registrations exactly. */
export const SURFACE_VIEWS: Record<string, SurfaceView> = {
  // The one product admin for every client type — Claude Design's canonical
  // "Admin and Access" (5 tabs + KPIs + Part 11 audit band), wired to
  // /api/mdx/admin. Reached from the bottom-left account menu (admin-gated).
  //
  // NO `ownsConversation`. All seven of this surface's AnA hand-offs are
  // GOVERNED mutations — invite a member, grant program access, edit role
  // scopes, rotate an API key, change an org setting — and the §11.50 e-sign
  // prompt for a governed command is rendered by the rail, from the real
  // `pendingSignoffs` on the turn (V2App adaptChatMessage → AnaRail →
  // GovernedActionSignoff). Hiding the rail hid the signature gate: the prompt
  // was drawn into a column this screen never showed. The layout affords the
  // rail — `.adm-members-layout` is `minmax(0,1fr) 320px` with a 1100px
  // single-column fallback and `.adm-access{min-width:0}` — so the rail is the
  // right home, not a compromise.
  'admin-console': { component: AdminAccess, full: true },
  'agency-meetings': { component: AgencyMeetings },
  'ana-command': { component: AnaCommand },
  'ana-memory': { component: AnaMemory },
  apps: { component: Apps },
  'artifacts-center': { component: ArtifactsCenter },
  'audit-trail': { component: AuditTrail },
  'authoring-engine': { component: AuthoringEngine },
  'batch-draft': { component: BatchDraft, full: true },
  biostatistics: { component: Biostatistics },
  'biostat-workbench': { component: BiostatWorkbench },
  'change-assessment': { component: ChangeAssessment },
  'clinical-ops': { component: ClinicalOps },
  // External client portal — full-page read-only view (no internal AnA rail).
  // Deep-link only (/concept2cure/client-portal); external-client users are
  // scoped to their own workspace server-side, CRO staff can preview.
  // Owns its conversation by having none: an external client reads their
  // workspace here and AnA is deliberately absent. That is a discharge of the
  // obligation, not an evasion of it — there is no Ask affordance to strand.
  'client-portal': { component: ClientPortal, full: true, ownsConversation: true },
  cmc: { component: CmcModule },
  'communication-center': { component: CommunicationCenter },
  // THE surface that owns the shell's conversation. `window.C2C_CONVO =
  // { id:'new', seed }` + navigate here is the protocol Home, ProjectHome and
  // now the shell's own `ask()` use when there is no rail to answer in.
  'conversation-thread': { component: ConversationThread, ownsConversation: true },
  coverage: { component: CodebaseCoverage },
  // No `full`, no `ownsConversation` — the AnA rail stays open on the CRL library,
  // because the point of looking at a letter is being able to ask about it.
  'crl-library': { component: CrlLibrary },
  'cro-portfolio': { component: CroPortfolio },
  // NO `ownsConversation`. This is a board — an ICH E3 section table capped at
  // 1100px — not an editor, and it hid the rail while calling `onAsk` from both
  // its header button and every section row. Its sibling in the SAME FILE,
  // `regulatory-workspace` (BiopharmaProject.tsx:488), is the actual 3-pane
  // substrate, is registered `full` with no rail-hiding, and uses the identical
  // row phrasing ("Open {num} in the document editor") to hand the request to
  // the rail. The phrasing was never the defect; the flag was.
  'csr-workflow': { component: CsrWorkflow, full: true },
  'decision-lineage': { component: DecisionLineage, full: true },
  'deep-research': { component: DeepResearch },
  'design-controls': { component: DesignControls },
  // ── Device & diagnostics ──
  // One entry per surface, each rendering only its own canvas. These used to be
  // five aliases for the whole MDX application, which drew a second Rail,
  // TopBar and AnA composer inside this shell; `hideAna: true` (now
  // `ownsConversation`) was what let it bring its own conversation. Both are
  // gone — the shell owns the chrome and owns the conversation, so none of
  // these claims the rail's column.
  'device-510k': { component: DeviceSurfaces['device-510k'], full: true },
  'device-analytics': { component: DeviceSurfaces['device-analytics'], full: true },
  'device-cer': { component: DeviceSurfaces['device-cer'], full: true },
  'device-clinical-studies': { component: DeviceSurfaces['device-clinical-studies'], full: true },
  'device-diagnostics': { component: DeviceSurfaces['device-diagnostics'], full: true },
  'device-engineering': { component: DeviceSurfaces['device-engineering'], full: true },
  'device-pma': { component: DeviceSurfaces['device-pma'], full: true },
  'device-postmarket': { component: DeviceSurfaces['device-postmarket'], full: true },
  'device-presub': { component: DeviceSurfaces['device-presub'], full: true },
  'device-software': { component: DeviceSurfaces['device-software'], full: true },
  'device-submission': { component: DeviceSurfaces['device-submission'], full: true },
  'device-tasks': { component: DeviceSurfaces['device-tasks'], full: true },
  'device-udi': { component: DeviceSurfaces['device-udi'], full: true },
  'device-validation': { component: DeviceSurfaces['device-validation'], full: true },
  'device-vault': { component: DeviceSurfaces['device-vault'], full: true },
  'device-workstream': { component: DeviceSurfaces['device-workstream'], full: true },
  'dispatch-readiness': { component: DispatchReadiness, full: true },
  'doc-journey': { component: DocJourney },
  // Owns its conversation in the editor's own right rail (a fourth mode beside
  // history / comments / sources). It cannot give the column back: `.ed` is
  // `220px minmax(420px,1fr)` and `.ed[data-comments="true"]` adds a third
  // 300px track, a hard 940px minimum. With the shell rail open that needs
  // 56 + 940 + 380 = 1376px before the doc column reaches its own minimum, so
  // dropping the flag would overflow the editor on any ordinary laptop — and
  // `ask()` PERSISTS `anaOpen`, so 380px is the standing cost for anyone who
  // has pressed an Ask button once, not the 32px seam. Its asks ("Draft §X",
  // "Cite this claim", "what changed in this source") are about the section
  // under the cursor, so navigating away from an editor with unsaved changes is
  // the wrong discharge too. It answers in place.
  'document-authoring': { component: DocumentAuthoring, full: true, ownsConversation: true },
  dossier: { component: Dossier },
  'dossier-map': { component: DossierMap },
  // Owns its conversation in its middle intelligence pane. The pane was already
  // drawn and already had a composer; it just had nowhere to put an answer —
  // it appended the user's turn to a local array and forwarded the question to
  // a rail this surface hides. It runs the real assistant now.
  'ectd-coauthor': { component: EctdCoauthor, full: true, ownsConversation: true },
  'ectd-compile': { component: EctdCompile },
  'ectd-publishing': { component: PublishingCenter },
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
  // Keeps the column for its own reporting pane, and the one button that handed
  // a question to the shell rail is gone (see Insights.tsx). It is NOT wired to
  // that pane instead: the pane runs `roRouteReply`, a client-side intent router
  // that returns composed text, so routing a real question there would have
  // turned a dead affordance into a fabricated assistant reply on a governed
  // reporting surface. The pane no longer presents as AnA either -- it is
  // labelled "Report builder" and speaks declaratively, because a template
  // wearing the assistant's name is indistinguishable from the assistant to
  // the person reading it. Until it runs a real `useAnaChat` this surface
  // answers only the report-generation intents it can actually satisfy.
  insights: { component: InsightsCanvas, full: true, ownsConversation: true },
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
  // Upload a document -> AnA proposes values with verified provenance -> the
  // human reviews and applies them through the governed, audited commit.
  'onboarding-ingest': { component: OnboardingIngest, full: true },
  orchestration: { component: Orchestration },
  orphan: { component: Orphan },
  // The PDEV Phase 7 kit mounts as a top-level route in ZenRouter (mirrors
  // ── Pharmaceutical development ──
  // These were one entry, `PdevRedirect`, whose only job was to navigate the
  // browser OUT of this shell to a route where the kit drew its own Rail,
  // TopBar and AnA dock. The kit contributes surfaces now; the shell keeps the
  // chrome and the conversation.
  pdev: { component: PdevSurfaces['pdev'], full: true },
  'pdev-clinical': { component: PdevSurfaces['pdev-clinical'], full: true },
  'pdev-cmc': { component: PdevSurfaces['pdev-cmc'], full: true },
  'pdev-contradictions': { component: PdevSurfaces['pdev-contradictions'], full: true },
  'pdev-fda-interactions': { component: PdevSurfaces['pdev-fda-interactions'], full: true },
  'pdev-ind-assembly': { component: PdevSurfaces['pdev-ind-assembly'], full: true },
  'pdev-nonclinical': { component: PdevSurfaces['pdev-nonclinical'], full: true },
  'pdev-regulatory': { component: PdevSurfaces['pdev-regulatory'], full: true },
  pediatric: { component: Pediatric },
  pharmacovigilance: { component: Pharmacovigilance },
  'pv-cockpit': { component: PvCockpit },
  'precedent-intelligence': { component: PrecedentEngine },
  'program-journey': { component: BiopharmaJourney },
  'project-home': { component: ProjectHome, full: true },
  projects: { component: Projects },
  // NO `ownsConversation`. Unlike the authoring editor this is a two-track
  // grid — `.pd-grid{268px 1fr}` — whose work column sets `overflow-y:auto`,
  // which zeroes its automatic minimum size, and whose panes are capped at
  // `.pd-pane{max-width:920px}` anyway. It gives 380px back by shrinking, not
  // by overflowing. Its two live asks are questions about the open protocol
  // ("Review … for completeness", "Draft <section> from the linked evidence")
  // and the document body here is read-only, so there is nothing in-place for
  // an answer to be written into — beside the protocol, in the rail, is where
  // it belongs.
  'protocol-dev': { component: ProtocolWorkspace, full: true },
  pyramid: { component: PyramidShell },
  // Owns its conversation in the study-scoped RBM co-monitor dock, which runs
  // its own `useAnaChat` and renders the real Part 11 sign-offs through
  // GovernedActionSignoff (RbmSurfaces.tsx:276) — proof that a surface holding
  // this flag can still present a §11.50 gate without the shell's rail.
  rbm: { component: Rbm, ownsConversation: true },
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
  quality: { component: QualityModule, full: true },
  'part11-console': { component: Part11Console },
  'identity-console': { component: IdentityConsole },
  'report-governance': { component: ReportGovernance },
  'submission-center': { component: SubmissionCenter },
  'submission-twin': { component: SubmissionTwin },
  'gateway-transmittals': { component: GatewayTransmittals },
  'task-board': { component: TaskBoard },
  tasks: { component: TaskBoard },
  'template-library': { component: TemplateLibrary },
  training: { component: Training },
  billing: { component: UsageBilling },
  usage: { component: UsageBilling },
  vault: { component: Vault, full: true },
};
