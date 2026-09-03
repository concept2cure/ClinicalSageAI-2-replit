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
 * ── Why every registration is a chunk, not an import ──────────────────────────
 * This file held 88 static imports, and V2App imports it at module scope. That
 * put every surface the map registers — and the per-surface stylesheet most of
 * them carry — in the shell's own chunk, so a regulatory writer who opens
 * `document-authoring` and nothing else still downloaded the device kit, the PV
 * cockpit, the biostat workbench and eighty more before the first paint.
 * `vite.config.ts` splits the VENDOR graph (react, tanstack, charts, radix),
 * which is why the entry looked survivable; the application half was never
 * split at all. Measured: the V2App chunk was 1,645 KB of JavaScript.
 *
 * Each registration now names a `lazySurface(...)` binding instead of an
 * imported symbol, so Vite emits one chunk per surface module and the browser
 * fetches the surface it is routing to. Same build, same config: V2App is
 * 229 KB and the surfaces are 90-odd chunks alongside it.
 *
 * The map itself — every id, every component, every flag — is byte-for-byte
 * what it was. The flags are a product decision and the chunking is not, so
 * this change is not allowed to touch them.
 */
import React from 'react';
import type { UiSurface } from '@shared/constants/ui-surface-registry';
import type { DriveSseEvent } from '../components/ana/useAnaChat.types';
/*
 * The three bindings that stay static, each because splitting it would buy
 * nothing:
 *
 *   DeviceSurfaces / PdevSurfaces  are ALREADY lazy one level down. Each module
 *     is a thin id→wrapper map over a single `React.lazy` kit host and carries
 *     no kit code of its own (that is what tests/ui/shell-kit-lazy.test.ts
 *     holds in place). Splitting the map away from its own lazy boundary would
 *     emit a chunk whose only job is to load a chunk.
 *   GlobalRiBrowser  lives in `surfaces/Surfaces.tsx`, which V2App imports
 *     statically for `Home` and `KitSurfaceScaffold`. That module is in the
 *     entry graph whichever way this file names it, so a dynamic import here
 *     would emit nothing and only disguise the fact.
 */
import { DeviceSurfaces } from './surfaces/DeviceSurfaces';
import { PdevSurfaces } from './surfaces/PdevSurfaces';
import { GlobalRiBrowser } from './surfaces/Surfaces';

export interface SurfaceViewProps {
  surface: UiSurface;
  /** The SHELL's conversation. Only surfaces the shell draws a rail beside get
   *  this — see `OwnedSurfaceViewProps`. */
  onAsk: (text: string) => void;
  onNav: (id: string) => void;
  segment: string;
  /**
   * AnA Live Drive bridge, for surfaces that run their OWN useAnaChat instance
   * (ownsConversation — e.g. ConversationThread). The shell owns the drive
   * state machine and this hands its two ends down: `on` is the person's
   * toggle (sent per turn as `live_drive`), `onDriveEvent` routes the turn's
   * drive_state/drive_navigation events back into the shell's single
   * apply/take-over reducer. Optional: a surface that ignores it simply
   * cannot originate driving turns — the rail still can everywhere.
   */
  liveDrive?: {
    on: boolean;
    onDriveEvent: (event: DriveSseEvent) => void;
    /** Follow-the-work: forward to `useAnaChat`'s `onArtifactSaved` so a
     *  driven turn's persisted draft appears in front of the subscriber from
     *  this surface's dock too, not only the shell rail. */
    onWorkSaved?: (artifactId: string) => void;
  };
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

/**
 * Shown while a surface chunk arrives. The same stated placeholder the two kit
 * maps already use (DeviceSurfaces.tsx:39, PdevSurfaces.tsx:59) — a loading
 * treatment this shell already had, not a second one.
 *
 * Both attributes are load-bearing past accessibility, because every audit that
 * walks the whole registry now meets this node first and has to be able to tell
 * it apart from a surface that rendered:
 *
 *   role="status"    the hostile-payload probe treats a container whose only
 *                    substantive content is a `role="status"` node as STILL
 *                    LOADING and keeps waiting (hostilePayloadProbe.test.tsx).
 *   aria-busy="true" the a11y audit waits for `[aria-busy="true"]` to clear
 *                    before it reads the tree (a11ySemantics.test.tsx). Without
 *                    it that suite would settle on this placeholder — one
 *                    correctly-labelled node, no findings — and report a green
 *                    surface it never looked at, 118 times over.
 *
 * DeviceSurfaces/PdevSurfaces state only `role`; those two predate this file
 * being the thing every surface loads through.
 */
function SurfaceChunkFallback() {
  return React.createElement(
    'div',
    {
      className: 'scaf-note',
      style: { padding: '40px 16px', textAlign: 'center' },
      role: 'status',
      'aria-busy': true,
    },
    'Loading surface…',
  );
}

/**
 * The lazy component, wrapped in the boundary that makes it safe to render.
 *
 * A bare `React.lazy` would change what a registration IS: not a component but
 * a promise thrown on first render, which is a white screen anywhere no
 * ancestor draws a `Suspense`. That is not hypothetical here —
 * `SURFACE_VIEWS[id].component` is rendered directly, with no boundary of its
 * own, by surfaceRender, workflowAudit, a11ySemantics,
 * hostilePayloadProbe, guardsPreserveContent and scripts/visual-qa. Keeping the
 * boundary inside the registration means the exported shape is still what every
 * one of those already assumes — "a component you can render" — which is also
 * how DeviceSurfaces.tsx and PdevSurfaces.tsx mount the two kits that were
 * split first.
 *
 * `createElement` rather than JSX because this file is `.ts` and must stay
 * `.ts`: tests/ui/one-shell.test.ts and
 * tests/ui/surface-registry-coverage.test.ts read it by path and parse its
 * source.
 */
function chunkBoundary<P extends object>(Chunk: React.ComponentType<P>, props: P) {
  return React.createElement(
    React.Suspense,
    { fallback: React.createElement(SurfaceChunkFallback) },
    React.createElement(Chunk, props),
  );
}

/**
 * Register a surface as its own chunk.
 *
 * The props type is stated, not inferred from the loaded component, and that is
 * the difference between this compiling and nine surfaces breaking. Plenty of
 * them declare only the props they read — `CodebaseCoverage` takes `{ onNav }`,
 * `CapabilityIndex` takes `{ onAsk }` — which has always been fine, because a
 * component asking for less than the shell hands it is assignable to
 * `ComponentType<SurfaceViewProps>` by ordinary parameter contravariance. Let a
 * type parameter be solved FROM those declarations instead and the binding
 * comes back as `ComponentType<{ onNav }>`, which fits neither arm of the
 * `SurfaceView` union — and the obvious way out of that error is to loosen the
 * union that guards `onAsk`, which is the one thing this file must not do.
 */
function lazySurface(
  load: () => Promise<{ default: React.ComponentType<SurfaceViewProps> }>,
): React.ComponentType<SurfaceViewProps> {
  const Chunk = React.lazy(load) as unknown as React.ComponentType<SurfaceViewProps>;
  return (props: SurfaceViewProps) => chunkBoundary(Chunk, props);
}

/**
 * The same, for a surface that owns the conversation. Two functions rather than
 * one generic because the union's whole job is that `ownsConversation: true`
 * cannot be paired with a component that takes the shell's `onAsk` — a single
 * loader typed to `SurfaceViewProps` would hand every registration a component
 * that declares it, and the six owned entries below would stop compiling for
 * the wrong reason. Registering an owned surface with `lazySurface` is still a
 * type error at the map entry, where the flag is visible.
 */
function lazyOwnedSurface(
  load: () => Promise<{ default: React.ComponentType<OwnedSurfaceViewProps> }>,
): React.ComponentType<OwnedSurfaceViewProps> {
  const Chunk = React.lazy(load) as unknown as React.ComponentType<OwnedSurfaceViewProps>;
  return (props: OwnedSurfaceViewProps) => chunkBoundary(Chunk, props);
}

const CapabilityIndex = lazySurface(() => import('./intelligence/Intelligence').then((m) => ({ default: m.CapabilityIndex })));
const Setup = lazySurface(() => import('./surfaces/AdminSurfaces').then((m) => ({ default: m.Setup })));
const Apps = lazySurface(() => import('./surfaces/AdminSurfaces').then((m) => ({ default: m.Apps })));
const ArtifactsCenter = lazySurface(() => import('./surfaces/AdminSurfaces').then((m) => ({ default: m.ArtifactsCenter })));
const AuditTrail = lazySurface(() => import('./surfaces/AdminSurfaces').then((m) => ({ default: m.AuditTrail })));
const AdminAccess = lazySurface(() => import('./surfaces/AdminAccess').then((m) => ({ default: m.AdminAccess })));
const MasterLicensing = lazySurface(() => import('./surfaces/MasterLicensing').then((m) => ({ default: m.MasterLicensing })));
const AccessRequests = lazySurface(() => import('./surfaces/AccessRequests').then((m) => ({ default: m.AccessRequests })));
const AgencyMeetings = lazySurface(() => import('./surfaces/AgencyMeetings').then((m) => ({ default: m.AgencyMeetings })));
const AnaCommand = lazySurface(() => import('./surfaces/AnaCommand').then((m) => ({ default: m.AnaCommand })));
const AnaMemory = lazySurface(() => import('./surfaces/AnaMemory').then((m) => ({ default: m.AnaMemory })));
const AuthoringEngine = lazySurface(() => import('./surfaces/AuthoringEngine').then((m) => ({ default: m.AuthoringEngine })));
const BatchDraft = lazySurface(() => import('./surfaces/BatchDraft').then((m) => ({ default: m.BatchDraft })));
const BiopharmaJourney = lazySurface(() => import('./surfaces/BiopharmaJourney').then((m) => ({ default: m.BiopharmaJourney })));
const CsrWorkflow = lazySurface(() => import('./surfaces/BiopharmaProject').then((m) => ({ default: m.CsrWorkflow })));
const RegulatoryWorkspace = lazySurface(() => import('./surfaces/BiopharmaProject').then((m) => ({ default: m.RegulatoryWorkspace })));
const Pediatric = lazySurface(() => import('./surfaces/BiopharmaSpecialty').then((m) => ({ default: m.Pediatric })));
const Orphan = lazySurface(() => import('./surfaces/BiopharmaSpecialty').then((m) => ({ default: m.Orphan })));
const Lifecycle = lazySurface(() => import('./surfaces/BiopharmaSpecialty').then((m) => ({ default: m.Lifecycle })));
const Pharmacovigilance = lazySurface(() => import('./surfaces/BiopharmaSpecialty').then((m) => ({ default: m.Pharmacovigilance })));
const PvCockpit = lazySurface(() => import('./surfaces/PvCockpit').then((m) => ({ default: m.PvCockpit })));
const Biostatistics = lazySurface(() => import('./surfaces/Biostatistics').then((m) => ({ default: m.Biostatistics })));
const BiostatWorkbench = lazySurface(() => import('./surfaces/BiostatWorkbench').then((m) => ({ default: m.BiostatWorkbench })));
const MissionControl = lazySurface(() => import('./surfaces/MissionControl').then((m) => ({ default: m.MissionControl })));
const FilingStrategy = lazySurface(() => import('./surfaces/FilingStrategy').then((m) => ({ default: m.FilingStrategy })));
const ChangeAssessment = lazySurface(() => import('./surfaces/ChangeAssessment').then((m) => ({ default: m.ChangeAssessment })));
const ClinicalOps = lazySurface(() => import('./surfaces/ClinicalOps').then((m) => ({ default: m.ClinicalOps })));
const ClientPortal = lazyOwnedSurface(() => import('./surfaces/ClientPortal').then((m) => ({ default: m.ClientPortal })));
const ConversationThread = lazyOwnedSurface(() => import('./surfaces/ConversationThread').then((m) => ({ default: m.ConversationThread })));
const CrlLibrary = lazySurface(() => import('./surfaces/CrlLibrary').then((m) => ({ default: m.CrlLibrary })));
const CroPortfolio = lazySurface(() => import('./surfaces/CroPortfolio').then((m) => ({ default: m.CroPortfolio })));
const CmcModule = lazySurface(() => import('./surfaces/CmcModule').then((m) => ({ default: m.CmcModule })));
const CommunicationCenter = lazySurface(() => import('./surfaces/CommunicationCenter').then((m) => ({ default: m.CommunicationCenter })));
const CodebaseCoverage = lazySurface(() => import('./surfaces/Coverage').then((m) => ({ default: m.CodebaseCoverage })));
const DecisionLineage = lazySurface(() => import('./surfaces/DecisionLineage').then((m) => ({ default: m.DecisionLineage })));
const DeepResearch = lazySurface(() => import('./surfaces/DeepResearch').then((m) => ({ default: m.DeepResearch })));
const DesignControls = lazySurface(() => import('./surfaces/DesignControls').then((m) => ({ default: m.DesignControls })));
const DispatchReadiness = lazySurface(() => import('./surfaces/DispatchReadiness').then((m) => ({ default: m.DispatchReadiness })));
const DocJourney = lazySurface(() => import('./surfaces/DocJourney').then((m) => ({ default: m.DocJourney })));
const DocumentAuthoring = lazyOwnedSurface(() => import('./surfaces/DocumentAuthoring').then((m) => ({ default: m.DocumentAuthoring })));
const Dossier = lazySurface(() => import('./surfaces/Dossier').then((m) => ({ default: m.Dossier })));
const DossierMap = lazySurface(() => import('./surfaces/DossierMap').then((m) => ({ default: m.DossierMap })));
const EctdCoauthor = lazyOwnedSurface(() => import('./surfaces/EctdCoauthor').then((m) => ({ default: m.EctdCoauthor })));
const EctdCompile = lazySurface(() => import('./surfaces/EctdCompile').then((m) => ({ default: m.EctdCompile })));
const PublishingCenter = lazySurface(() => import('./surfaces/PublishingCenter').then((m) => ({ default: m.PublishingCenter })));
const Etmf = lazySurface(() => import('./surfaces/Etmf').then((m) => ({ default: m.Etmf })));
const Evidence = lazySurface(() => import('./surfaces/Evidence').then((m) => ({ default: m.Evidence })));
const FilingsCatalog = lazySurface(() => import('./surfaces/FilingsCatalog').then((m) => ({ default: m.FilingsCatalog })));
const HaqManager = lazySurface(() => import('./surfaces/HaqManager').then((m) => ({ default: m.HaqManager })));
const HumanFactors = lazySurface(() => import('./surfaces/HumanFactors').then((m) => ({ default: m.HumanFactors })));
const Inconsistency = lazySurface(() => import('./surfaces/Inconsistency').then((m) => ({ default: m.Inconsistency })));
const IndLifecycle = lazySurface(() => import('./surfaces/IndLifecycle').then((m) => ({ default: m.IndLifecycle })));
const InvestigatorBrochure = lazySurface(() => import('./surfaces/InvestigatorBrochure').then((m) => ({ default: m.InvestigatorBrochure })));
const InsightsCanvas = lazyOwnedSurface(() => import('./surfaces/Insights').then((m) => ({ default: m.InsightsCanvas })));
const IvdCompleteness = lazySurface(() => import('./surfaces/IvdCompleteness').then((m) => ({ default: m.IvdCompleteness })));
const Labeling = lazySurface(() => import('./surfaces/Labeling').then((m) => ({ default: m.Labeling })));
const LabelingPI = lazySurface(() => import('./surfaces/LabelingPi').then((m) => ({ default: m.LabelingPI })));
const SmpcLabeling = lazySurface(() => import('./surfaces/SmpcLabeling').then((m) => ({ default: m.SmpcLabeling })));
const LicensingSurface = lazySurface(() => import('./surfaces/LicensingSurface').then((m) => ({ default: m.LicensingSurface })));
const MaaCockpit = lazySurface(() => import('./surfaces/MaaCockpit').then((m) => ({ default: m.MaaCockpit })));
const MarketAccess = lazySurface(() => import('./surfaces/MarketAccess').then((m) => ({ default: m.MarketAccess })));
const NdaCockpit = lazySurface(() => import('./surfaces/NdaCockpit').then((m) => ({ default: m.NdaCockpit })));
const Nonclinical = lazySurface(() => import('./surfaces/Nonclinical').then((m) => ({ default: m.Nonclinical })));
const Onboarding = lazySurface(() => import('./surfaces/Onboarding').then((m) => ({ default: m.Onboarding })));
const OnboardingIngest = lazySurface(() => import('./surfaces/OnboardingIngest').then((m) => ({ default: m.OnboardingIngest })));
const Orchestration = lazySurface(() => import('./surfaces/Orchestration').then((m) => ({ default: m.Orchestration })));
const PrecedentEngine = lazySurface(() => import('./surfaces/PrecedentEngine').then((m) => ({ default: m.PrecedentEngine })));
const ProtocolWorkspace = lazySurface(() => import('./surfaces/ProtocolDev').then((m) => ({ default: m.ProtocolWorkspace })));
const ProjectHome = lazySurface(() => import('./surfaces/ProjectHome').then((m) => ({ default: m.ProjectHome })));
const Projects = lazySurface(() => import('./surfaces/Projects').then((m) => ({ default: m.Projects })));
const PyramidShell = lazySurface(() => import('./surfaces/Pyramid').then((m) => ({ default: m.PyramidShell })));
const Rbm = lazyOwnedSurface(() => import('./surfaces/Rbm').then((m) => ({ default: m.Rbm })));
const RegChange = lazySurface(() => import('./surfaces/RegChange').then((m) => ({ default: m.RegChange })));
const Registrations = lazySurface(() => import('./surfaces/Registrations').then((m) => ({ default: m.Registrations })));
const ReportEngine = lazySurface(() => import('./surfaces/ReportEngine').then((m) => ({ default: m.ReportEngine })));
const ResearchAdmin = lazySurface(() => import('./surfaces/ResearchAdmin').then((m) => ({ default: m.ResearchAdmin })));
const Review = lazySurface(() => import('./surfaces/Review').then((m) => ({ default: m.Review })));
const Risk = lazySurface(() => import('./surfaces/Risk').then((m) => ({ default: m.Risk })));
const SafetyNarrative = lazySurface(() => import('./surfaces/SafetyNarrative').then((m) => ({ default: m.SafetyNarrative })));
const ShadowReview = lazySurface(() => import('./surfaces/ShadowReview').then((m) => ({ default: m.ShadowReview })));
const SourceTracer = lazySurface(() => import('./surfaces/SourceTracer').then((m) => ({ default: m.SourceTracer })));
const SubmissionCenter = lazySurface(() => import('./surfaces/SubmissionCenter').then((m) => ({ default: m.SubmissionCenter })));
const QmpWorkspace = lazySurface(() => import('./surfaces/QmpWorkspace').then((m) => ({ default: m.QmpWorkspace })));
const QualityModule = lazySurface(() => import('./surfaces/QualityModule').then((m) => ({ default: m.QualityModule })));
const Part11Console = lazySurface(() => import('./surfaces/Part11Console').then((m) => ({ default: m.Part11Console })));
const IdentityConsole = lazySurface(() => import('./surfaces/IdentityConsole').then((m) => ({ default: m.IdentityConsole })));
const ReportGovernance = lazySurface(() => import('./surfaces/ReportGovernance').then((m) => ({ default: m.ReportGovernance })));
const SubmissionTwin = lazySurface(() => import('./surfaces/SubmissionTwin').then((m) => ({ default: m.SubmissionTwin })));
const GatewayTransmittals = lazySurface(() => import('./surfaces/GatewayTransmittals').then((m) => ({ default: m.GatewayTransmittals })));
const TaskBoard = lazySurface(() => import('./surfaces/TaskBoard').then((m) => ({ default: m.TaskBoard })));
const TemplateLibrary = lazySurface(() => import('./surfaces/TemplateLibrary').then((m) => ({ default: m.TemplateLibrary })));
const Training = lazySurface(() => import('./surfaces/Training').then((m) => ({ default: m.Training })));
const UsageBilling = lazySurface(() => import('./surfaces/UsageBilling').then((m) => ({ default: m.UsageBilling })));
const Vault = lazySurface(() => import('./surfaces/Vault').then((m) => ({ default: m.Vault })));

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
  // Platform-owner licensing control. Deliberately NOT seeded into
  // available_modules — the surface that EDITS entitlements must never itself
  // be lockable, or a mis-set tier could strand the owner outside the only
  // place the tier can be un-set.
  'master-licensing': { component: MasterLicensing, full: true },
  'access-requests': { component: AccessRequests },
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
  'mission-control': { component: MissionControl },
  'filing-strategy': { component: FilingStrategy },
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
  /* Full-width, like every other workspace-level surface.
     `.page-inner` caps content at 1160px — a reading measure, right for a
     document or a narrative surface and wrong for this one. Projects is the
     workspace index: a stat row and a table of every programme in the org, both
     of which are columns-across-the-screen content. On any monitor wider than
     ~1300px it rendered as a narrow strip down the middle of an empty page,
     while `project-home` — the screen you reach by clicking a row IN this table
     — was already full-bleed. Two adjacent screens in one journey disagreeing
     about the page width is what made this read as broken rather than as a
     choice. */
  projects: { component: Projects, full: true },
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
