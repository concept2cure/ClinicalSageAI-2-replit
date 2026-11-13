import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { I } from '../icons';
import { useLiveRows, EmptyState, ErrorState } from '../dataConnect';
import { useAuthUser } from '@/services/portal/authService';
import { useTenant } from '@/contexts/TenantContext';
import { capturedActorHeaders } from '@/utils/authToken';
import { projectIntakeId, type ProjectIntakeActor } from '@shared/project-intake-workspace';
import { createProjectIntake, readProjectIntakeWorkspaces, type IntakeOptionsAnswer } from './projectIntakeRequest';
import { ClientChoicesNote, ProjectClientFilter, portfolioClients, portfolioClientContext } from './ProjectClientFilter';
import { PortfolioLine, PortfolioLinesNote, usePortfolioLines } from './PyramidProject';
import { CardFacts, PortfolioFigures, PortfolioPagedNote, ProjectPortfolioFilters, WS_LABEL, averageReadinessFigure, averageReadinessSentence, portfolioCounts, portfolioFilterUrl, portfolioIsUnfilteredEmpty, portfolioStatusChoices, readIsPaged, searchPlaceholder, stated, useRememberedView } from './ProjectPortfolioFilters';
import { NewProjectObjectiveField, NewProjectObjectiveReview } from './ProjectObjective';
import { enumWords } from './projectWords';
import { useDialog } from '../useDialog';
import {
  productTypeForFilingType,
  deviceProductTypesForFilingType,
  workstreamForFilingType,
  MEDICINAL_PRODUCT_TYPES,
  PRODUCT_TYPES,
  type ProductType,
} from '@shared/constants/domain/product-types';
import {
  filingDocumentClassOf,
  filingTypeInSentence,
  productTypeFixedByFiling,
} from '@shared/regulatory/filing-document-classes';
import type { SurfaceViewProps } from '../surfaceViews';
import { openProjectHome, publishShellProject } from '../shellProject';
import { consumeNavParams, NAV_PARAMS_EVENT } from '../navParams';
import { DOSSIER_READINESS_LABEL, DOSSIER_READINESS_MEANS, dossierReadinessValue, type DossierFigureState } from '../dossierReadiness';
import {
  listedChoices,
  notifySurfaceActionReady,
  openNewProject,
  useSurfaceActionHandlers,
  type DirectiveProgram,
} from '../surfaceActions';
import { usePublishSurfaceContext, type SurfaceContext } from '../surfaceContext';
// The New-Project wizard drives off the global regulatory registry. Import the
// picker + the submission-type lookup DIRECTLY from the modules that own them,
// rather than depending on window globals that another surface may or may not
// have set first (it hadn't — window.RegistryPicker was never assigned, so the
// wizard's first step hung on "Loading registry…" and could never complete).
// Importing RegistryBridge also runs its side effects, which populate the
// window.GLOBAL_REGISTRY / REG_SEGMENTS that RegistryPicker reads.
import { RegistryPicker, type FilingBrowseState } from './AnaVerbs';
import { marketSupportText, useMarketSupport, type MarketSupportView } from '../MarketSupportLine';
import { PATHWAY_LABEL, REGULATORY_PATHWAYS, REGULATORY_PATH_TO_PATHWAY, pathwayKey, type RegulatoryPathway } from '@shared/constants/mdx';
import { getSubmissionTypeContext } from './RegistryBridge';
import { ProjectDiscoveryHandoff } from './ProjectDiscoveryHandoff';
import { ArchivedProjects, ArchivedProjectsLink } from './ProjectsArchived';
import { ProjectsAtRisk } from './ProjectsAtRisk';
import {
  DEVICE_CLASSES, DEVICE_FLAGS, REVIEW_PANELS,
  usesDeviceClassification, type DeviceFlagId,
} from '../../../../../shared/constants/domain/device-classification';
import { MDR_DECLARED_CLASSES, IVDR_CLASSES } from '@shared/regulatory/device-class';
import { deviceClassScopeForFiling } from '@shared/regulatory/filing-catalog';
/* The application type a catalog filing creates: one rule, shared with POST /api/c2c/projects (S1, 2026-11-09). */
import { programTypeFor, type SelTpl } from '@shared/constants/domain/filing-application-type';
import { filingLifecycleReferenceFor, filingReferenceFactsFor } from '@shared/regulatory/filing-lifecycle-reference';
import { getSegment } from '../registryModel';
import '../styles/project-home-v2.css';

/* ════ New Project Wizard (registry-driven, persists to regulatory_programs) ══ */

// UI segment → regulatory registry segment (RegistryPicker's initial tab).
const SEG2REG: Record<string, string | null> = {
  biotech: 'pharma_biotech', pharma: 'pharma_biotech',
  medtech: 'medical_devices', diagnostics: 'diagnostics_ivd',
  cro: null, health: 'pharma_biotech',
};

// UI segment → portfolio workstream label (card chip / filter tab).
const SEG2WS: Record<string, string> = {
  biotech: 'Biotech', pharma: 'Pharma', medtech: 'MDX',
  diagnostics: 'MDX', cro: 'CRO', health: 'Biotech',
};

/* The product class comes from the FILING TYPE (`productTypeForFilingType`,
   shared with the server so the two cannot drift); the lane only refines within
   the device family (a 510(k) from the Diagnostics lane is an IVD 510(k)).

   Where the filing type does not fix the class — an IND, CTA, MAA, J-NDA or
   DMF covers drugs and biologics alike — the person states it (P-21). A lane
   map (`SEG2PRODUCT`) used to fill it in: the Pharma & Biotech tab made a
   510(k) a biologic, and once that was closed the Biotech tab still made every
   IND a biologic, an inhaled small molecule included (QA 2026-10-08, second
   walk, j1/j7). The map is gone; nothing fills a class nobody chose. */

/** The medicinal classes a person can state, labelled from the one vocabulary. */
const STATED_CLASS_CHOICES = PRODUCT_TYPES.filter((t) => MEDICINAL_PRODUCT_TYPES.includes(t.value));

/** The prompt a regulated select shows until the person states a value (P-21). */
const NOT_STATED = 'Not stated — choose';

// UI segment → human label, for the wizard's "Tailored for …" banner.
/* Registry tab → UI segment, so the banner can follow a tab change. Only the
   lanes that map 1:1 back; pharma_biotech is ambiguous (biotech and pharma both
   point at it) and keeps whatever lane the user actually arrived in. */
const REG2SEG: Record<string, string> = {
  medical_devices: 'medtech',
  diagnostics_ivd: 'diagnostics',
};

const SEG_LABELS: Record<string, string> = {
  biotech: 'Biotech', pharma: 'Pharma', medtech: 'Medical Devices',
  diagnostics: 'Diagnostics & IVD', cro: 'CRO / Services', health: 'Digital Health',
};

/** A filing document class as the review step names it ("Prior Approval Supplement"), or null for an application. */
function documentClassLabel(programType: string): string | null {
  const label = filingDocumentClassOf(programType)?.label;
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : null;
}

/**
 * The filing as people name it ("510(k)", "IND", "De Novo"), from the one
 * pathway vocabulary (shared/constants/mdx.ts). Only a type that IS a pathway
 * takes its label: an MDR technical file is not "CER", nor a bare IVD "IVDR".
 * The review read "510K · ivd" (2026-10-31).
 */
export function filingLabel(programType: string): string {
  const classLabel = documentClassLabel(programType);
  if (classLabel) return classLabel;
  const key = pathwayKey(programType);
  const own: RegulatoryPathway | null = (REGULATORY_PATHWAYS as readonly string[]).includes(key) ? key as RegulatoryPathway
    : Object.hasOwn(REGULATORY_PATH_TO_PATHWAY, key) && REGULATORY_PATH_TO_PATHWAY[key] === 'k510' ? 'k510' : null;
  return own && own !== 'other' ? PATHWAY_LABEL[own] : key.toUpperCase().replace(/_/g, ' ');
}

/** A product type as the vocabulary labels it ("In-vitro diagnostic"). */
function productTypeLabel(value: string | null): string {
  if (!value) return 'not stated';
  return PRODUCT_TYPES.find(t => t.value === value)?.label ?? value;
}

/** A date input's YYYY-MM-DD as the review prints it ("Mar 31, 2027"). */
export function reviewDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso.trim() || 'Not set';
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** What a step still needs before it can move on, naming the first missing
 *  field; null when nothing is missing. Continue and Create were disabled with
 *  no word of why, and a disabled primary looked enabled (2026-10-31). */
export function wizardMissing(step: number, s: {
  filingChosen: boolean; workspaceRead: boolean; workspaceChosen: boolean; nameGiven: boolean; classStated: boolean;
}): string | null {
  const then = step === 2 ? 'to create the project' : 'to continue';
  if (step === 0) return s.filingChosen ? null : `Choose a filing type ${then}.`;
  if (!s.workspaceChosen) return s.workspaceRead ? `Choose a client workspace ${then}.` : 'Checking client workspaces…';
  if (!s.nameGiven) return `Enter a project name ${then}.`;
  return s.classStated ? null : `Choose a product type ${then}.`;
}

/** A name already used by a project on the loaded portfolio page, or null. */
export function duplicateProjectName(name: string, existing: readonly string[]): string | null {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return null;
  return existing.find(title => title.trim().toLowerCase() === wanted) ?? null;
}

/**
 * What the project will get, in one sentence: the outline it is built against.
 * Read from the same market answer the project's submission rows show
 * (MarketSupportLine), and only its outline: whether and how a sequence can be
 * sent is the Submit tab's matter. The wizard opened with the full market line,
 * "Transmit not proven: FDA onboarding … have not been verified", before a
 * project existed (2026-10-31). A filing not offered keeps the server's words.
 */
export function wizardSetupText(m: Pick<MarketSupportView, 'offered' | 'summary' | 'line' | 'outline'>): string {
  if (!m.offered) return marketSupportText(m);
  const pack = m.outline?.state === 'outline' ? m.outline.pack : null;
  if (pack?.label.trim()) return `The project is built against the ${pack.label.trim()} outline, section by section.`;
  return 'This filing has no dossier outline here yet: the project is created, and its documents are added to it.';
}

function WizardFilingSetup({ applicationType, market }: { applicationType: string; market: string }) {
  const read = useMarketSupport(applicationType, market);
  const m = read.data?.markets?.[0];
  if (read.loading) return <span data-testid="market-support" data-state="loading">Checking what this filing sets up…</span>;
  if (read.error || !m) {
    return (
      <span role="status" data-testid="market-support" data-state="error">
        What this filing sets up could not be read.{' '}
        <button type="button" className="btn ghost sm" onClick={read.retry}>Retry</button>
      </span>
    );
  }
  return <span data-testid="market-support" data-state={m.offered ? 'offered' : 'refused'}>{wizardSetupText(m)}</span>;
}

/** The three steps, in order. One list, read by the step rail, the sub-heading
 *  and the bounds checks below, so a step cannot be renamed in one place and
 *  stay stale in another. */
const STEP_LABELS = ['Choose filing type', 'Configure project', 'Review & create'] as const;

type WizardScreenContext = Omit<SurfaceContext, 'surfaceId'>;
function wizardScreenContext(step: number, filing: SelTpl | null, applicationType: string, unavailable = false, browser: { segment: string | null; searchTerm: string; inspectedReference?: FilingBrowseState['inspectedReference'] } = { segment: null, searchTerm: '', inspectedReference: null }): WizardScreenContext {
  if (unavailable) return {
    summary: 'The new-project wizard cannot continue because the signed-in account or organization changed. Reopen New project before continuing.',
    facts: { wizardState: 'unavailable', selectedFiling: null },
  };
  const catalog = filing ? filingReferenceFactsFor(filing.id) : null;
  return {
    summary: `The new-project wizard is on step ${step + 1} of ${STEP_LABELS.length}: ${STEP_LABELS[step]}. ` +
      (filing ? `Selected filing: ${filing.label} (${filing.agency ?? 'agency not recorded'}, ${filing.region ?? 'region not recorded'}).` : 'No filing type is selected.'),
    facts: { wizardState: 'open', filingLifecycleReference: filingLifecycleReferenceFor(filing?.id), filingBrowser: { ...browser, inspectedReference: browser.inspectedReference ?? null }, wizardStep: { number: step + 1, label: STEP_LABELS[step] },
      selectedFiling: filing ? { id: filing.id, name: filing.label, applicationType, agency: filing.agency ?? null, region: filing.region ?? null,
        ...(catalog ? { description: catalog.entry.description, submissionFormat: catalog.entry.submissionFormat, ctdModule: catalog.entry.ctdModule,
          workflowLabel: catalog.workflowLabel } : {}) } : null },
    availableActions: [filing ? 'Explain what the selected filing contains and which evidence it needs' : 'Explain the filing choices'],
  };
}

/** Exported for the failure-path test: the wizard's error surface is an
 *  acceptance criterion in its own right (a failed write must be visible and
 *  must offer a way out), and driving it through the whole Projects surface
 *  would test the registry loader rather than the banner. */
type NewProjectWizardProps = { onClose: () => void; onNav: (id: string) => void; segment?: string;
  onAsk?: (text: string) => void; onContext?: (context: WizardScreenContext | null) => void;
  /** The titles of the projects on the loaded portfolio page, so a name already
   *  in use is said before the project is created. Not a uniqueness rule: the
   *  server allows it, and a page is not the whole portfolio. */
  existingNames?: readonly string[] };
export function NewProjectWizard(props: NewProjectWizardProps) {
  const { onContext } = props;
  const user = useAuthUser();
  const { currentOrganization } = useTenant();
  const actorUserId = projectIntakeId(user?.id);
  const organizationId = projectIntakeId(user?.organizationId);
  const tenantOrganizationId = projectIntakeId(currentOrganization?.id);
  const key = actorUserId && organizationId && tenantOrganizationId === organizationId ? `${actorUserId}:${organizationId}` : 'unavailable';
  const current = useRef(key);
  current.current = key;
  useEffect(() => {
    if (key !== 'unavailable') return undefined;
    onContext?.(wizardScreenContext(0, null, '', true));
    return () => onContext?.(null);
  }, [key, onContext]);
  if (!actorUserId || !organizationId || tenantOrganizationId !== organizationId) return (
    <section className="npw" aria-label="New project">
      <div className="npw-inner"><h1>New project</h1><p>The signed-in account or organization changed. Reopen New project after selecting your organization.</p><button className="btn ghost" onClick={props.onClose}>Back to projects</button></div>
    </section>
  );
  return <NewProjectWizardSession key={key} {...props} actor={{ actorUserId, organizationId }} isCurrent={() => current.current === key} />;
}

function NewProjectWizardSession({ onClose, onNav, segment, onAsk, onContext, existingNames = [], actor, isCurrent }: NewProjectWizardProps & { actor: ProjectIntakeActor; isCurrent: () => boolean }) {
  const { setCurrentClientWorkspace } = useTenant();
  const capturedActor = useMemo(() => ({ actorUserId: actor.actorUserId, organizationId: actor.organizationId }), [actor.actorUserId, actor.organizationId]);
  // Retain the pending outcome in this view. A ref also protects an Escape or
  // second click in the same turn, before the creating state has rendered.
  const pendingCreate = useRef(false);
  const closeIfSettled = useCallback(() => { if (!pendingCreate.current) onClose(); }, [onClose]);
  /* `useDialog` on something that is deliberately not a dialog, and on purpose.
     The hook sets no ARIA of its own — it is three keyboard behaviours: focus
     the container on mount, call onClose on Escape, hand focus back to the
     opener on unmount. All three are exactly as required of a full-canvas view
     that replaces the portfolio and must give the keyboard back when it leaves.
     Writing a second hook with the same body so this one could be named
     differently would be the duplication, not the reuse. The dialog SEMANTICS
     — role, aria-modal — are what this view drops, and those live in the JSX
     below, not in here. */
  const viewRef = useDialog(closeIfSettled);
  const [step, setStep] = useState(0);
  /* Each step opens at its top. The review step was reached scrolled to where
     the long filing catalogue had been left (2026-10-31). */
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [step]);
  const [tpl, setTpl] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [product, setProduct] = useState('');
  /* The indication, as the person states it, or nothing (P-21). Step 2 used to
     offer a therapeutic-area dropdown that started on "Oncology (general)",
     and its label was saved as the program's indication — the value Form 1571
     carries. "QA-W2 Tolvexa · idiopathic pulmonary fibrosis" was recorded with
     the indication "COPD / asthma" (QA 2026-10-08, second walk, j1/j7). A
     therapeutic area is not an indication; the dropdown is gone and nothing
     else reads it. */
  const [indication, setIndication] = useState('');
  const [riskBasedMonitoring, setRiskBasedMonitoring] = useState(false);
  /* The drug / biologic class, for a filing type that does not fix it. Starts
     unstated; Continue waits for it. */
  const [statedClass, setStatedClass] = useState<ProductType | ''>('');
  /* FDA taxonomy; EU classes use their existing separate columns. */
  const [productCode, setProductCode] = useState('');
  const [regulationNumber, setRegulationNumber] = useState('');
  const [deviceClass, setDeviceClass] = useState('');
  const [euMdrClass, setEuMdrClass] = useState('');
  const [euIvdrClass, setEuIvdrClass] = useState('');
  const [reviewPanel, setReviewPanel] = useState('');
  const [predicateK, setPredicateK] = useState('');
  /* The predicate's trade name. The official eSTAR prints it beside the
     submission number, both from `predicate_devices[0]`, so the pair travels
     together — the server refuses one without the other. */
  const [predicateName, setPredicateName] = useState('');
  const [intendedUse, setIntendedUse] = useState('');
  const [deviceFlags, setDeviceFlags] = useState<DeviceFlagId[]>([]);
  const toggleFlag = (id: DeviceFlagId) =>
    setDeviceFlags(f => (f.includes(id) ? f.filter(x => x !== id) : [...f, id]));
  // Team assignment needs a persisted project id (GET /:id/team); no endpoint
  // lists selectable org members for a not-yet-created project, so the wizard
  // creates the project solo (the creator-only list the server expects) and
  // people are added afterward on the project's Team section, through
  // ProjectTeamSharing.tsx ("Grant sharing").
  const [team] = useState<string[]>([]);
  const [target, setTarget] = useState('');
  /** The project's objective, optional here: recorded as its charter's objective once the project exists (S1). */
  const [objective, setObjective] = useState('');
  const [creating, setCreating] = useState(false);
  const [writeStopped, setWriteStopped] = useState(false);
  const [retired, setRetired] = useState(false);
  const [workspaceOptions, setWorkspaceOptions] = useState<IntakeOptionsAnswer | null>(null);
  const [workspaceId, setWorkspaceId] = useState('');
  const [workspaceRead, setWorkspaceRead] = useState(0);
  const alive = useRef(true);
  const scopeCurrent = useRef(isCurrent);
  scopeCurrent.current = isCurrent;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const mountedSession = useCallback(() => alive.current && scopeCurrent.current(), []);
  const currentSession = useCallback(() => {
    if (!mountedSession()) return false;
    try { capturedActorHeaders({ userId: capturedActor.actorUserId, organizationId: capturedActor.organizationId }); return true; } catch { return false; }
  }, [capturedActor, mountedSession]);
  useEffect(() => {
    if (step !== 1) return;
    let active = true;
    setWorkspaceOptions(null);
    void readProjectIntakeWorkspaces(capturedActor, () => active && currentSession()).then(answer => {
      if (!active || !mountedSession()) return;
      if (!currentSession() || answer.kind === 'retired') { setRetired(true); return; }
      setWorkspaceOptions(answer);
      setWorkspaceId(previous => answer.kind === 'confirmed'
        ? answer.clients.length === 1 ? answer.clients[0].id : answer.clients.some(row => row.id === previous) ? previous : ''
        : '');
    });
    return () => { active = false; };
  }, [step, workspaceRead, capturedActor, currentSession, mountedSession]);
  const workspace = workspaceOptions?.kind === 'confirmed' ? workspaceOptions.clients.find(row => row.id === workspaceId) ?? null : null;
  /**
   * The wizard's outcome banner.
   *
   * `kind` matters and used to be missing. One `error: string` carried two
   * opposite outcomes: a genuine failure (nothing was created) and the
   * created-but-no-dossier-scaffolded advisory below (the project DOES exist).
   * Rendering both as the same red banner told a user their project had failed
   * when it had not, and offering "Try again" on the advisory would have
   * created a second copy of a program that was already there.
   */
  const [outcome, setOutcome] = useState<
    { kind: 'error' | 'notice'; message: string; correlationId?: string; notOffered?: boolean; unknown?: boolean; confirmedCreated?: boolean } | null
  >(null);
  const fail = (message: string, correlationId?: string) =>
    setOutcome({ kind: 'error', message, correlationId });

  /* The SHELL's active client category, passed down. This used to read
     window.__C2C_SEGMENT, which only BiopharmaJourney ever writes and which it
     can only set to 'biotech' or 'pharma' — so opening New project from the
     Medical Device or Diagnostics lane showed "Tailored for Biotech" and
     defaulted to the pharma template tab. The global is kept as a fallback for
     the two callers that still open the wizard without a segment. */
  const arrivedSeg = segment || (typeof window !== 'undefined' && window.__C2C_SEGMENT) || 'biotech';
  /* The tab the user is LOOKING at, which is the lane they arrived in until
     they switch. The banner reads this, not the arrival lane. */
  const [tabSeg, setTabSeg] = useState<string | null>(null);
  const [filingBrowser, setFilingBrowser] = useState<FilingBrowseState | null>(null);
  const uiSeg = tabSeg ?? arrivedSeg;
  const regSeg = SEG2REG[uiSeg];
  const segLabel = SEG_LABELS[uiSeg] || getSegment(uiSeg)?.label || uiSeg;
  const ctx = useMemo(() => tpl ? getSubmissionTypeContext(tpl) : null, [tpl]);
  const selTpl = useMemo<SelTpl | null>(() => ctx
    ? { ...ctx, label: ctx.displayName, pathway: ctx.pathwayKey || 'ctd' }
    : null, [ctx]);
  const programType = programTypeFor(selTpl, uiSeg);
  const screenContext = useMemo(() => wizardScreenContext(step, selTpl, programType, retired, filingBrowser ?? { segment: regSeg ?? null, searchTerm: '', inspectedReference: null }), [step, selTpl, programType, retired, filingBrowser, regSeg]);
  useEffect(() => { onContext?.(screenContext); }, [onContext, screenContext]);
  useEffect(() => () => onContext?.(null), [onContext]);
  /* The filing fixes the family when known; the person states any unresolved class. */
  // A filing document class asks, unless the filing names its class itself (an
  // sBLA is a biologics licence supplement): filing-document-classes.ts.
  const fixedClass = productTypeForFilingType(programType, ctx?.segment === 'diagnostics_ivd' ? 'diagnostics' : uiSeg, selTpl?.id) ?? productTypeFixedByFiling(selTpl?.id);
  const deviceChoices = deviceProductTypesForFilingType(programType, selTpl?.id);
  const canRefine = (deviceChoices?.length ?? 0) > 1;
  const productChoices = deviceChoices ? PRODUCT_TYPES.filter(t => deviceChoices.includes(t.value)) : STATED_CLASS_CHOICES;
  const asksClass = fixedClass === null;
  const recordedClass: string | null = canRefine && statedClass && deviceChoices?.includes(statedClass) ? statedClass : fixedClass ?? (statedClass || null);
  const isDeviceFiling = usesDeviceClassification(fixedClass);
  const isFdaDeviceFiling = isDeviceFiling && selTpl?.agency === 'FDA';
  const euRegulation = isDeviceFiling && selTpl?.region === 'EU'
    ? programType === 'ivdr' ? 'ivdr' : ['mdr', 'cer'].includes(programType) ? 'mdr' : null
    : null;
  const classChoices = isFdaDeviceFiling ? DEVICE_CLASSES : deviceClassScopeForFiling(selTpl?.id)?.classes ?? (euRegulation === 'mdr' ? MDR_DECLARED_CLASSES : IVDR_CLASSES);
  const classValue = isFdaDeviceFiling ? deviceClass : euRegulation === 'mdr' ? euMdrClass : euIvdrClass;
  // A filing change retires fields whose regulatory context may have changed.
  // Returning to the earlier filing must not revive a hidden classification.
  useEffect(() => {
    setStatedClass('');
    setProductCode(''); setRegulationNumber(''); setDeviceClass('');
    setReviewPanel(''); setPredicateK(''); setPredicateName('');
    setEuMdrClass(''); setEuIvdrClass(''); setDeviceFlags([]);
  }, [tpl, uiSeg]);
  const savedIndication = indication.trim();

  /* The name and product exactly as they will be saved — the review prints
     these and the create call sends these, so the two cannot disagree. The
     name used to fall back to the filing type's label ("Investigational New
     Drug Application") while the review read "(unnamed)", and programs were
     saved under identical generic names (QA 2026-10-08, j1). It is required
     now. A blank product is recorded as the name, which is what the server
     does with one (POST /api/c2c/projects: productName || name), and the
     review says so. */
  const savedName = name.trim();
  const savedProduct = product.trim() || savedName;
  /* Configure is complete when the name is given and, where the filing type
     leaves it open, the class is chosen. */
  const configured = savedName !== '' && recordedClass !== null && workspace !== null;
  /* Said beside Continue / Create while it is disabled, and named by it. */
  const missing = wizardMissing(step, {
    filingChosen: Boolean(tpl), workspaceRead: workspaceOptions !== null, workspaceChosen: workspace !== null,
    nameGiven: savedName !== '', classStated: recordedClass !== null,
  });
  const sameName = duplicateProjectName(savedName, existingNames);

  // Persist a real regulatory program (POST /api/c2c/projects → regulatory_programs)
  // then navigate into it using the id the store assigns. On failure we surface
  // the error instead of pretending the project was created.
  const doCreate = async () => {
    if (!configured || recordedClass === null || !workspace || pendingCreate.current || creating || writeStopped || !mountedSession()) return;
    if (!currentSession()) { setRetired(true); return; }
    pendingCreate.current = true;
    setCreating(true);
    setOutcome(null);
    try {
      const fresh = await readProjectIntakeWorkspaces(actor, currentSession);
      if (!mountedSession()) return;
      if (!currentSession() || fresh.kind === 'retired') { setRetired(true); return; }
      setWorkspaceOptions(fresh);
      if (fresh.kind !== 'confirmed') {
        fail(fresh.message);
        setCreating(false);
        setStep(1);
        return;
      }
      const verifiedWorkspace = fresh.clients.find(row => row.id === workspace.id && row.name === workspace.name);
      if (!verifiedWorkspace) {
        setWorkspaceId('');
        fail('The client workspace changed or is no longer available. Choose a current workspace and review the project again.');
        setCreating(false);
        setStep(1);
        return;
      }
      const body = {
        name: savedName,
        productName: savedProduct,
        programType,
        productType: recordedClass,
        primaryAgency: selTpl?.agency || 'FDA',
        submissionTypeId: selTpl?.id,
        // Only what was stated: a blank indication sends none (P-21).
        indication: isDeviceFiling ? (intendedUse || undefined) : (savedIndication || undefined),
        ...(euRegulation === 'mdr' ? { euMdrClass: euMdrClass || null } : {}),
        ...(euRegulation === 'ivdr' ? { euIvdrClass: euIvdrClass || null } : {}),
        ...(isDeviceFiling
          ? {
              deviceClassification: {
                intendedUse,
                ...(isFdaDeviceFiling ? {
                  productCode, regulationNumber, deviceClass,
                  reviewPanel, predicateK, predicateName, flags: deviceFlags,
                } : {}),
              },
            }
          : {}),
        targetSubmissionDate: target || null,
        teamMembers: team,
        riskBasedMonitoring,
        /* The objective is recorded with the project, as version 1 of its charter, in the creation's own transaction
           (S1, 505449d7a): one write, so a refused objective refuses the creation in the server's words. */
        ...(objective.trim() ? { objective: objective.trim() } : {}),
      };
      const answer = await createProjectIntake(actor, verifiedWorkspace, body, currentSession);
      if (!mountedSession()) return;
      if (!currentSession() || answer.kind === 'retired') { setRetired(true); return; }
      setCreating(false);
      if (answer.kind !== 'confirmed') {
        if (answer.kind === 'unconfirmed') setWriteStopped(true);
        setOutcome({ kind: 'error', message: answer.message, correlationId: answer.correlationId,
          notOffered: answer.notOffered, unknown: answer.kind === 'unconfirmed', confirmedCreated: answer.confirmedCreated });
        return;
      }
      // Only a verified saved program/anchor receipt can authorize navigation.
      // A confirmed save also closes the duplicate-create path on scaffold notices.
      setWriteStopped(true);
      const { data: created, meta } = answer.receipt;
      // The verified saved parent becomes the context for the project's sharing
      // and assignment controls. Global selection never supplies intake intent.
      setCurrentClientWorkspace({ id: String(meta.clientWorkspaceId), name: meta.clientWorkspaceName, organizationId: String(meta.organizationId) });
      if (meta.scaffoldSkipped) {
        setOutcome({
          kind: 'notice',
          message: (meta.scaffoldDetail
            ? `${meta.scaffoldDetail} You can add documents manually, or pick a filing type with a defined pathway.`
            : 'Project created, but no submission dossier was started. You can add documents manually, or pick a filing type with a defined pathway.').replace(/\s+/g, ' '),
        });
        return;
      }
      publishShellProject({
        id: created.id,
        title: created.title || body.name,
        product: body.productName,
        code: created.code || '',
        ws: created.ws || SEG2WS[uiSeg] || 'Biotech',
        status: created.status || 'active',
      });
      onClose();
      onNav('project-home');
    } finally { pendingCreate.current = false; }
  };

  if (retired) return <section ref={viewRef} className="npw" aria-label="New project" tabIndex={-1}><div className="npw-inner"><h1>New project</h1><p>The signed-in account or organization changed. Reopen New project before continuing.</p><button className="btn ghost" onClick={closeIfSettled}>Back to projects</button></div></section>;

  return (
    /* ── Full canvas, not a modal ────────────────────────────────────────────
       This wizard used to be an 880px `.esign-modal` floating over the very
       portfolio it was about to write into, with a 440px scroll pane inside it
       for the registry. Choosing a filing type is the longest-lived decision
       this product asks anyone to make — it selects the rule pack, the dossier
       outline and the agency the whole programme is then governed against, and
       `programTypeFor` (imported above) is where that choice is fixed — and it was being
       taken through a letterbox: a scrolling pane over the registry, a form
       column narrower than the table behind it, and a review step that had to
       be scrolled to be read at all.

       `projects` is registered `full: true` (see the note beside it in
       surfaceViews.ts), so the surface already owns the whole canvas. The
       wizard now takes it, as a VIEW of that surface rather than a route of its
       own: no registry id, no entitlement, no deep link. That is deliberate —
       Cancel stays a state change back to the portfolio rather than a
       navigation, so a half-filled form cannot be stranded behind history.

       It is therefore NOT `role="dialog"` and NOT `aria-modal`. Nothing sits
       behind it to be made inert, and announcing a modal boundary that spans
       the entire screen would describe a containment that does not exist. It
       is a labelled region headed by an <h1>, which is what it now is. The
       keyboard contract is unchanged from the modal: focus lands here on open,
       Escape backs out, focus returns to the control that opened it. */
    <section ref={viewRef} className="npw" aria-labelledby="new-project-title" tabIndex={-1}>
      <div className="pd-topbar">
        <button type="button" className="pd-crumb-back" disabled={creating} onClick={closeIfSettled}>
          {I.left} Projects
        </button>
        <span className="pd-crumb-sep" aria-hidden="true">/</span>
        <span className="pd-crumb-here">New project</span>
      </div>

      {/* No eyebrow: the crumb above says where this is (D2.md §2.4 item 1). */}
      <header className="npw-head">
        <div className="npw-head-inner">
          <h1 className="ph-title" id="new-project-title">New project</h1>
          <p className="ph-sub">
            Choose the filing, describe the project, then review what will be recorded.
            The filing decides the dossier outline the project is built against.
          </p>
        </div>
      </header>

      {/* Step rail — replaces the three flat progress bars the modal used, which
          carried the entire step state in the fill colour of an unlabelled
          strip. Position is stated three ways here: the number or tick, the
          step's own name, and aria-current. Nothing is signalled by colour
          alone. A finished step is re-openable; a step ahead of the current one
          is not, because nothing has been entered into it yet. "Step N" is read
          by screen readers and not shown: the disc already numbers the step. */}
      <nav className="npw-steps" aria-label="New project steps">
        <ol>
          {STEP_LABELS.map((label, i) => (
            <li
              key={label}
              className="npw-step"
              data-state={i < step ? 'done' : i === step ? 'current' : 'todo'}
              aria-current={i === step ? 'step' : undefined}
            >
              <button
                type="button"
                className="npw-step-btn"
                disabled={i > step || creating}
                onClick={() => setStep(i)}
              >
                <span className="npw-step-n" aria-hidden="true">{i < step ? I.check : i + 1}</span>
                <span className="npw-step-l">
                  <span className="sr-only">Step {i + 1}</span>
                  <span className="npw-step-t">{label}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className="npw-scroll" ref={scrollRef}>
        {/* The registry step is a catalogue and wants the width; the two form
            steps are read line by line and want a measure. One container, two
            widths, rather than one compromise that serves neither. */}
        <div className="npw-inner" data-measure={step === 0 ? 'wide' : 'form'}>
          {/* Step 0: Choose template */}
          {step === 0 && (
            <div>
              {/* One quiet line above the catalogue. No spark: it marks AnA, not a note. */}
              <div className="npw-seg-note">
                <div>
                  <div className="npw-seg-t">Tailored for {segLabel}</div>
                  <div className="npw-seg-s">The filings for your client type come first. Use the tabs for other kinds of product, or search by name.</div>
                </div>
              </div>
              {/* No inner scroll pane. The picker was capped at 440px inside an
                  880px modal, so the global registry — every agency, every
                  pathway — was read four rows at a time. The page scrolls now
                  and the picker is as tall as it needs to be. */}
              <RegistryPicker
                value={tpl ?? ''}
                onChange={(id) => setTpl(id)}
                /* The type creation will send for each filing, so the picker
                   asks the market verdict about exactly what it would create. */
                applicationTypeOf={(e) => programTypeFor({ id: e.id, label: e.id, pathway: e.pathwayKey || 'ctd' }, uiSeg)}
                initialSegment={regSeg || undefined}
                onSegmentChange={(next) => setTabSeg(REG2SEG[next] ?? arrivedSeg)}
                onAsk={onAsk}
                onBrowseChange={setFilingBrowser}
              />
            </div>
          )}

          {/* Step 1: Configure */}
          {step === 1 && selTpl && (
            <div className="npw-form">
              <h2 className="npw-h2">Configure your {selTpl.label} project</h2>
              {/* What the project will get: the outline it is built against,
                  from the server's market answer (FILING_SPINE.md F19). */}
              <p className="npw-seg-s" data-testid="npw-market-support">
                <WizardFilingSetup applicationType={programTypeFor(selTpl, uiSeg)} market={selTpl.agency || 'FDA'} />
              </p>

              <ProjectDiscoveryHandoff
                fields={{ name, target, indication, intendedUse }}
                isDeviceFiling={isDeviceFiling}
                disabled={creating}
                onApply={(fields) => {
                  if (fields.name !== undefined) setName(current => current.trim() ? current : fields.name!);
                  if (fields.target !== undefined) setTarget(current => current.trim() ? current : fields.target!);
                  if (fields.indication !== undefined) setIndication(current => current.trim() ? current : fields.indication!);
                  if (fields.intendedUse !== undefined) setIntendedUse(current => current.trim() ? current : fields.intendedUse!);
                }}
              />

              <div className="npw-fields">
                <div className="npw-field npw-field-wide">
                  <label className="npw-field-l" htmlFor="npw-client-workspace">Client workspace</label>
                  <select id="npw-client-workspace" className="c2c-input" value={workspaceId}
                    disabled={workspaceOptions?.kind !== 'confirmed' || creating || writeStopped}
                    onChange={event => setWorkspaceId(event.target.value)} aria-describedby="npw-workspace-help" required>
                    <option value="">Choose a client workspace</option>
                    {workspaceOptions?.kind === 'confirmed' && workspaceOptions.clients.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
                  </select>
                  <span className="npw-field-help" id="npw-workspace-help">
                    {workspaceOptions === null ? 'Checking current client workspaces…'
                      : workspaceOptions.kind !== 'confirmed' ? workspaceOptions.message
                      : workspaceOptions.clients.length === 0 ? 'No active client workspace is available. Contact your organization administrator.'
                      : workspaceOptions.clients.length === 1 ? `${workspaceOptions.clients[0].name} is the only active client workspace and is recorded for this project.`
                      : 'Choose the client that owns this project and its dossier. Review this choice before creating the project.'}
                  </span>
                  {workspaceOptions && workspaceOptions.kind !== 'confirmed' && <button type="button" className="btn ghost" onClick={() => setWorkspaceRead(value => value + 1)}>Refresh workspaces</button>}
                </div>
                <label className="npw-field">
                  <span className="npw-field-l">Project name</span>
                  <input
                    className="c2c-input"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder={`e.g. ${selTpl.id === '510k' ? 'Aurora CGM — 510(k)' : 'BX-204 — ' + selTpl.label}`}
                    required
                    aria-required="true"
                    aria-describedby="npw-name-help"
                  />
                  <span className="npw-field-help" id="npw-name-help" data-testid="npw-name-help">
                    {sameName
                      ? `A project named “${sameName}” is already in your portfolio. Choose another name, or keep it if this is a separate project.`
                      : 'Required. The project is listed under this name.'}
                  </span>
                </label>

                <label className="npw-field">
                  <span className="npw-field-l">Product name</span>
                  <input
                    className="c2c-input"
                    value={product}
                    onChange={e => setProduct(e.target.value)}
                    placeholder="e.g. BX-204"
                  />
                </label>

                {/* A device files under a product code, not a therapeutic area.
                    The pharma axis is wrong for it in both directions: there is
                    no oncology peak flow meter, and the fields a CDRH reviewer
                    actually opens the file for had nowhere to live. */}
                {isDeviceFiling ? (isFdaDeviceFiling || euRegulation ? (
                  <label className="npw-field">
                    <span className="npw-field-l">{euRegulation ? `EU ${euRegulation.toUpperCase()} class` : 'Device class'}</span>
                    <select
                      className="c2c-input"
                      value={classValue}
                      onChange={e => isFdaDeviceFiling ? setDeviceClass(e.target.value) : euRegulation === 'mdr' ? setEuMdrClass(e.target.value) : setEuIvdrClass(e.target.value)}
                    >
                      <option value="">Not yet determined</option>
                      {classChoices.map(c => (
                        <option key={c} value={c}>Class {c}</option>
                      ))}
                    </select>
                  </label>
                ) : null) : (
                  <label className="npw-field">
                    <span className="npw-field-l">Indication</span>
                    <input
                      className="c2c-input"
                      value={indication}
                      onChange={e => setIndication(e.target.value)}
                      placeholder="e.g. idiopathic pulmonary fibrosis"
                      aria-describedby="npw-indication-help"
                    />
                    <span className="npw-field-help" id="npw-indication-help">
                      The disease or condition, as Form 1571 will state it. Leave it blank if it is not settled yet.
                    </span>
                  </label>
                )}

                {(asksClass || canRefine) && (
                  <label className="npw-field">
                    <span className="npw-field-l">Product type</span>
                    <select
                      className="c2c-input"
                      value={recordedClass ?? ''}
                      onChange={e => setStatedClass(e.target.value as ProductType | '')}
                      required={asksClass}
                      aria-required={asksClass}
                      aria-describedby="npw-class-help"
                    >
                      {asksClass && <option value="">{NOT_STATED}</option>}
                      {productChoices.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <span className="npw-field-help" id="npw-class-help">
                      {canRefine ? 'The filing default is selected. Choose the product type this project will record.' : <>Required. {filingTypeInSentence(programType)} covers drugs and biologics; the project records which.</>}
                    </span>
                  </label>
                )}

                <label className="npw-field">
                  <span className="npw-field-l">Target submission date</span>
                  <input className="c2c-input" type="date" value={target} onChange={e => setTarget(e.target.value)} />
                </label>
                <NewProjectObjectiveField value={objective} onChange={setObjective} />
              </div>

              {isFdaDeviceFiling && (
                <div className="npw-grid">
                  <label className="npw-field">
                    <span className="npw-field-l">Product code</span>
                    <input
                      className="c2c-input"
                      value={productCode}
                      onChange={e => setProductCode(e.target.value.toUpperCase().slice(0, 3))}
                      placeholder="e.g. BZH"
                      maxLength={3}
                      aria-describedby="npw-pc-help"
                    />
                    <span className="npw-field-help" id="npw-pc-help">
                      The three-letter FDA product code from the product classification database.
                      Enter its regulation number and review panel below; they are not filled in from it.
                    </span>
                  </label>

                  <label className="npw-field">
                    <span className="npw-field-l">Regulation number</span>
                    <input
                      className="c2c-input"
                      value={regulationNumber}
                      onChange={e => setRegulationNumber(e.target.value)}
                      placeholder="e.g. 868.1860"
                      aria-describedby="npw-rn-help"
                    />
                    <span className="npw-field-help" id="npw-rn-help">The 21 CFR regulation listed for the product code.</span>
                  </label>

                  <label className="npw-field">
                    <span className="npw-field-l">Review panel</span>
                    <select className="c2c-input" value={reviewPanel} onChange={e => setReviewPanel(e.target.value)}>
                      <option value="">Not yet determined</option>
                      {REVIEW_PANELS.map(pnl => <option key={pnl} value={pnl}>{pnl}</option>)}
                    </select>
                  </label>

                  <label className="npw-field">
                    <span className="npw-field-l">Predicate 510(k) number</span>
                    <input
                      className="c2c-input"
                      value={predicateK}
                      onChange={e => setPredicateK(e.target.value.toUpperCase())}
                      placeholder="e.g. K181234"
                      aria-describedby="npw-pk-help"
                    />
                    <span className="npw-field-help" id="npw-pk-help">
                      The cleared device this one is substantially equivalent to.
                    </span>
                  </label>

                  <label className="npw-field">
                    <span className="npw-field-l">Predicate device name</span>
                    <input
                      className="c2c-input"
                      value={predicateName}
                      onChange={e => setPredicateName(e.target.value)}
                      placeholder="the predicate’s trade name, as it is marketed"
                      aria-describedby="npw-pn-help"
                    />
                    <span className="npw-field-help" id="npw-pn-help">
                      The eSTAR prints this beside the number, so give both or
                      neither — the record does not hold half a claim of
                      substantial equivalence.
                    </span>
                  </label>
                </div>
              )}

              {isDeviceFiling && (
                <>
                  <div className="npw-field npw-field-wide">
                    {/* A <span> names nothing. The class selector is
                        `.npw-field-l`, not `span.npw-field-l`, so this carries
                        its styling over unchanged. */}
                    <label className="npw-field-l" htmlFor="npw-intended-use">Indications for use</label>
                    <textarea
                      id="npw-intended-use"
                      className="c2c-input"
                      rows={3}
                      value={intendedUse}
                      onChange={e => setIntendedUse(e.target.value)}
                      placeholder={isFdaDeviceFiling ? 'The statement that will appear on FDA Form 3881.' : 'The device’s intended purpose and intended population.'}
                    />
                  </div>

                  {isFdaDeviceFiling && <fieldset className="npw-field npw-field-wide npw-flags">
                    <legend className="npw-field-l">Product characteristics</legend>
                    <span className="npw-field-help">
                      Each of these adds required content to the submission, so they are recorded
                      now rather than discovered at assembly.
                    </span>
                    <div className="npw-flag-grid">
                      {DEVICE_FLAGS.map(f => (
                        <label key={f.id} className="npw-flag" title={f.because}>
                          <input
                            type="checkbox"
                            checked={deviceFlags.includes(f.id)}
                            onChange={() => toggleFlag(f.id)}
                          />
                          <span>
                            <span className="npw-flag-l">{f.label}</span>
                            <span className="npw-flag-w">{f.because}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>}
                </>
              )}

              <label className="npw-flag npw-field-wide">
                <input type="checkbox" checked={riskBasedMonitoring} onChange={event => setRiskBasedMonitoring(event.target.checked)} />
                {/* The device flags' checkbox card (npw-flag), not a form field:
                    as `npw-field` it stacked the box above its words. */}
                <span><span className="npw-flag-l">Risk-based monitoring</span>{' '}<span className="npw-flag-w">Include risk assessment, monitoring indicators and site oversight for this project. No assessment or monitoring data is created during setup; existing access requirements apply.</span></span>
              </label>
              {/* No "Team members" field. It was an empty box saying team
                  assignment "isn't available yet": a roadmap message in place of
                  a control. People are added once the project exists, on its
                  Team section (ProjectHome.tsx → ProjectTeamSharing.tsx), and the
                  review step below says so (D2.md §2.4 item 7). */}
            </div>
          )}

          {/* Step 2: Review & create */}
          {step === 2 && selTpl && (
            <div className="npw-form">
              <h2 className="npw-h2">Review &amp; create</h2>
              <dl className="npw-review">
                <div className="npw-review-row">
                  <dt>Client workspace</dt>
                  <dd className="npw-review-strong">{workspace?.name ?? 'Workspace must be verified'}</dd>
                </div>
                <div className="npw-review-row">
                  <dt>Filing type</dt>
                  <dd className="npw-review-strong">{selTpl.label}</dd>
                </div>
                {selTpl.agency && (
                  <div className="npw-review-row">
                    <dt>Agency / Region</dt>
                    <dd>{selTpl.agency} · {selTpl.region}</dd>
                  </div>
                )}
                {selTpl.dossierStandard && selTpl.dossierStandard !== '—' && (
                  <div className="npw-review-row">
                    <dt>Dossier</dt>
                    <dd>{selTpl.dossierStandard}{selTpl.ctdModule && selTpl.ctdModule !== '—' ? ' · ' + selTpl.ctdModule : ''}</dd>
                  </div>
                )}
                <div className="npw-review-row">
                  <dt>Project name</dt>
                  <dd>{savedName}</dd>
                </div>
                <div className="npw-review-row">
                  <dt>Risk-based monitoring</dt>
                  <dd>{riskBasedMonitoring ? 'Included for this project' : 'Not selected'}</dd>
                </div>
                <div className="npw-review-row">
                  <dt>Product</dt>
                  <dd>
                    {savedProduct}
                    {!product.trim() && <span style={{ color: 'var(--text-300)' }}> (same as the project name)</span>}
                  </dd>
                </div>
                {!isDeviceFiling && (
                  <div className="npw-review-row">
                    <dt>Indication</dt>
                    <dd>{savedIndication || 'Not stated'}</dd>
                  </div>
                )}
                <div className="npw-review-row">
                  <dt>Target date</dt>
                  <dd>{reviewDate(target)}</dd>
                </div>
                <NewProjectObjectiveReview value={objective} />
                <div className="npw-review-row">
                  <dt>Pathway</dt>
                  {/* Named as the filing is named (filingLabel), never its key:
                      "CTD" for a supplement, "510K" for a 510(k). */}
                  <dd>{filingLabel(programType)}{selTpl.submissionFormat && selTpl.submissionFormat !== '—' ? ' — ' + selTpl.submissionFormat : ''}</dd>
                </div>
                {/* Both lines are derived exactly as the create call derives
                    them, so the review step shows what will actually persist.
                    They were read off the UI segment before, which is why this
                    pane said "Workstream: Biotech / Recorded as: 510K · biologic"
                    for a device filing — and then stored it. */}
                <div className="npw-review-row">
                  <dt>Client type</dt>
                  {/* Said in words (WS_LABEL): the stored key "MDX" read as jargon to a device tester (J1, 2026-11-06). */}
                  {(() => { const ws = workstreamForFilingType(programType, recordedClass) ?? SEG2WS[uiSeg] ?? 'Biotech'; return <dd>{WS_LABEL[ws] ?? ws}</dd>; })()}
                </div>
                <div className="npw-review-row">
                  <dt>Recorded as</dt>
                  <dd>{filingLabel(programType)} · {productTypeLabel(recordedClass)}</dd>
                </div>
                {/* Only what was actually entered. A device row that reads
                    "Not recorded" is the truth about the programme; filling it
                    with a default here would put a classification nobody chose
                    into the record the reviewer reads. */}
                {isDeviceFiling && (
                  <>
                    <div className="npw-review-row">
                      <dt>Classification</dt>
                      <dd>
                        {[
                          isFdaDeviceFiling && productCode && `Product code ${productCode}`,
                          isFdaDeviceFiling && regulationNumber && `21 CFR ${regulationNumber}`,
                          classValue && `${euRegulation ? `EU ${euRegulation.toUpperCase()} ` : ''}Class ${classValue}`,
                          isFdaDeviceFiling && reviewPanel,
                        ].filter(Boolean).join(' · ') || 'Not recorded'}
                      </dd>
                    </div>
                    {isFdaDeviceFiling && <div className="npw-review-row">
                      <dt>Predicate</dt>
                      <dd>
                        {predicateK && predicateName
                          ? `${predicateK} — ${predicateName}`
                          : predicateK || predicateName
                            ? 'Not recorded — the number and the trade name are filed together'
                            : 'Not recorded'}
                      </dd>
                    </div>}
                    {isFdaDeviceFiling && deviceFlags.length > 0 && (
                      <div className="npw-review-row">
                        <dt>Adds required content</dt>
                        <dd>
                          {deviceFlags
                            .map(id => DEVICE_FLAGS.find(f => f.id === id)?.label ?? id)
                            .join(' · ')}
                        </dd>
                      </div>
                    )}
                  </>
                )}
              </dl>

              {/* What happens on create, and where people are added: one quiet
                  line under the list, not a tinted box with AnA's spark. "Team"
                  is the project page's heading for its people and their sharing
                  (newProjectWizardLook.test.tsx follows it there). */}
              <p className="npw-review-note">
                Your project is saved to the portfolio and opens in its workspace, where you can add documents and author sections with AnA.
                {' '}After it is created, share it with people in your organization from its Team section.
              </p>
            </div>
          )}

          {/* Announcement is separated from presentation on purpose.

              These two regions are PERMANENT and empty until there is something
              to say. A live region that is inserted into the DOM together with
              its text is the higher-risk pattern under SC 4.1.3 — some AT/browser
              pairs never announce it, because the region did not exist to be
              watched. Mounting them once and writing text into them is the
              portable form. Two regions rather than one because a failure must
              interrupt (assertive) and a succeeded-but-degraded write must not
              (polite), and swapping `aria-live` on a single live element is
              itself unreliable.

              The visual banner below stays in the accessibility tree — it holds
              the Try again and Dismiss controls, so hiding it would strand them —
              it simply is not the thing that announces. */}
          <div className="sr-only" role="alert" aria-live="assertive">
            {outcome?.kind === 'error' ? outcome.message : ''}
          </div>
          <div className="sr-only" role="status" aria-live="polite">
            {outcome?.kind === 'notice' ? outcome.message : ''}
          </div>

          {/* The wizard's outcome — surfaced honestly instead of a fake "created"
              toast, and never silently.

              A FAILURE renders the shared <ErrorState variant="inline">, the same
              component every failed load and failed write in the client now uses,
              which is where the internals filter lives. A SUCCESS-with-caveat is
              not an error and must not borrow its styling: the project exists,
              there is nothing to retry, and offering "Try again" there would
              create a second copy of a program that is already saved. */}
          {outcome?.kind === 'error' && (
            <div className="npw-outcome">
              <ErrorState
                variant="inline"
                title={outcome.confirmedCreated ? 'Project created; details unavailable' : outcome.unknown ? 'Check whether the project was created' : outcome.notOffered ? 'This filing is not offered here' : 'The project was not created'}
                message={outcome.message}
                correlationId={outcome.correlationId}
                retry={outcome.unknown ? closeIfSettled : outcome.notOffered ? () => { setOutcome(null); setStep(0); } : doCreate}
                retryLabel={outcome.unknown ? 'Check projects' : outcome.notOffered ? 'Choose another filing' : undefined}
                busy={creating}
                onDismiss={() => setOutcome(null)}
                testId="new-project-outcome"
              />
            </div>
          )}
          {outcome?.kind === 'notice' && (
            <div className="npw-outcome">
              <div className="c2c-wizard-notice" data-testid="new-project-outcome">
                <span className="ico" aria-hidden="true">{I.info}</span>
                <div>{outcome.message}</div>
                <button
                  type="button"
                  className="c2c-error-dismiss"
                  onClick={() => setOutcome(null)}
                  aria-label="Dismiss this message"
                >
                  {I.close}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer. Fixed to the bottom of the canvas rather than scrolling away at
          the end of a long registry: the primary action of a three-step form
          should not have to be hunted for. */}
      <div className="npw-foot">
        <div className="npw-foot-inner">
          <button type="button" className="btn ghost" disabled={creating} onClick={closeIfSettled}>Cancel</button>
          {step > 0 && <button type="button" className="btn ghost" disabled={creating} onClick={() => setStep(s => s - 1)}>Back</button>}
          <span className="npw-foot-gap" />
          {/* Why the primary is unavailable, beside it and named by it. */}
          <span className="npw-field-help" id="npw-missing" role="status" data-testid="npw-missing">
            {missing && !creating && !writeStopped ? missing : ''}
          </span>
          {step < 2 && (
            <button
              type="button"
              className="btn primary"
              disabled={missing !== null}
              aria-describedby={missing ? 'npw-missing' : undefined}
              onClick={() => setStep(s => s + 1)}
            >
              Continue
            </button>
          )}
          {step === 2 && (
            <button type="button" className="btn primary" disabled={creating || writeStopped || !configured}
              aria-describedby={missing ? 'npw-missing' : undefined} onClick={doCreate}>
              {creating ? 'Creating project…' : <>{I.plus} Create project</>}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/* ════ Projects — portfolio of programs ════ */

/**
 * Portfolio row — the display contract projected by GET /api/c2c/projects
 * (server/routes/c2c/projects.ts), one field per real `regulatory_programs`
 * column (phase → stage, target_submission_date → due, lead_user_id → lead),
 * and the home filing's dossier readiness, measured on each read. No blocker:
 * the list query projected one as a literal NULL, so its column read "—" on
 * every row, and it is gone from the projection and the list (2026-10-31,
 * server/services/c2c/project-portfolio.ts). A project's blockers are on its
 * project home.
 */
interface ProjPortfolioEntry {
  id: string;
  title: string;
  ws: string;
  pathway?: string;
  code: string;
  stage: string;
  /** Share of the home filing's sections approved or locked; null with no
   *  figure, and `readinessState` says why: nothing to count, or not read. */
  readiness: number | null;
  readinessState?: DossierFigureState;
  /** Why a figure is unavailable, in the server's words. */
  readinessReason?: string;
  status: string;
  lead: string;
  due: string;
  /** target_submission_date as YYYY-MM-DD, or null when none is set. */
  due_date?: string | null;
  /** When the project's record last changed ('Updated Oct 29'), from
   *  projects.updated_at on the server; null when the record holds none. */
  activity: string | null;
  client_workspace_id?: number | null;
  client_name?: string | null;
  /** What the project says it is, for the card's one line (S11, 2026-11-01):
   *  each a regulatory_programs column, null when nothing (or only whitespace)
   *  is stated. Optional for a payload from before the projection carried them. */
  description?: string | null;
  indication?: string | null;
  /** primary_agency as stored, e.g. 'FDA'. */
  agency?: string | null;
  /** The filing type as stored, e.g. 'ind' or '510k'. */
  program_type?: string | null;
}

/** The list view's columns: project, client type, stage, dossier readiness,
 *  status, lead, target date. The list is the dense view: it holds, as text,
 *  what the cards leave out (D2 §1.4 item 6). */
const LIST_COLUMNS = '1.8fr 150px 110px 130px 100px 120px 120px';

/**
 * The card's one line: what the project is (D2 §1.4 item 5; ONE_DESIGN_PLAN §2
 * "Projects": "the name, a one-line description and when it was updated").
 * The stated description first; otherwise the filing in words (filing type,
 * agency, indication), each only when stated; otherwise, for a payload without
 * those fields, the stage and the lead the card used to show. Nothing is
 * filled in that the record does not hold.
 */
function cardLine(p: Pick<ProjPortfolioEntry, 'description' | 'program_type' | 'agency' | 'indication' | 'stage' | 'lead'>): string {
  const description = stated(p.description);
  if (description) return description;
  const programType = stated(p.program_type);
  const filing = [programType ? filingLabel(programType) : null, stated(p.agency), stated(p.indication)].filter(Boolean);
  if (filing.length) return filing.join(' · ');
  const lead = stated(p.lead);
  return [stated(p.stage), lead ? `Lead ${lead}` : null].filter(Boolean).join(' · ');
}

/* A program whose stored status is `blocked` while the list carries no blocker
   for it. The product writes only active and archived (POST and the close-out
   routes); a `blocked` row comes from data loaded some other way, and the list
   does not assess blockers. The card states the gap instead of a bare red chip. */
const BLOCKED_NO_CAUSE = 'No cause recorded';
const BLOCKED_NO_CAUSE_TITLE = 'This project’s status is recorded as blocked, and no blocker is recorded against it.';

/**
 * A project screen chosen from the rail with no project ever opened lands on
 * Projects: say which one, rather than nothing (2026-10-31).
 */
function NeedsProjectNotice() {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    const receive = () => setLabel((current) => consumeNavParams('projects')?.needsProject ?? current);
    receive();
    window.addEventListener(NAV_PARAMS_EVENT, receive);
    return () => window.removeEventListener(NAV_PARAMS_EVENT, receive);
  }, []);
  if (!label) return null;
  return (
    <p className="ph-sub" role="status" data-testid="projects-needs-project">
      <strong>{label} opens inside a project.</strong> Open one below, or create one with New project.
    </p>
  );
}

export function Projects({ onAsk, onNav, segment }: SurfaceViewProps) {
  const [ws, setWs] = useState('all');
  const [pathway, setPathway] = useState('all');
  const [status, setStatus] = useState('all');
  const [clientWorkspaceId, setClientWorkspaceId] = useState('all');
  const [view, setView] = useRememberedView();
  const [q, setQ] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardContext, setWizardContext] = useState<WizardScreenContext | null>(null);

  // Real program portfolio — GET /api/c2c/projects projects one field per real
  // regulatory_programs column (server/routes/c2c/projects.ts). Fixture-free:
  // real rows, an honest empty, or an honest error — never a "Sample data" stand-in.
  /* `useLiveRows` re-fetches when its dep list changes and exposes no reload of
     its own, so the retry the failed-load panel offers is a nonce in that list.
     The panel's copy promised a retry it did not have. */
  const [reloadNonce, setReloadNonce] = useState(0);
  /* Archived projects, in place of the list, with a way to restore one (P-122 §3.5). */
  const [archivedView, setArchivedView] = useState(false);
  /* "Which projects are at risk this week?", answered by the server's risk engines (P-122 §3.2). */
  const [riskOpen, setRiskOpen] = useState(false);
  const portfolioUrl = portfolioFilterUrl(clientWorkspaceId, ws, pathway);
  const live = useLiveRows<ProjPortfolioEntry>(portfolioUrl, [reloadNonce, clientWorkspaceId, ws, pathway]);
  const projects = live.rows;
  // Each card's plan line (S11, THE_PROGRAM §5): one read for the page, from the schedule engine.
  const plans = usePortfolioLines(projects.map(p => p.id));
  // Options come from accessible program anchors, not an organization-wide
  // client directory. The server applies this filter before it pages the list.
  const clients = useMemo(() => portfolioClients(live.meta), [live.meta]);
  const clientContext = useMemo(() => portfolioClientContext(clientWorkspaceId, clients, live.meta),
    [clientWorkspaceId, clients, live.meta]);
  // Readiness, status and search cover the page. Counts from the server cover
  // the complete admitted set; older responses retain honest page floors.
  const truncated = readIsPaged(live.meta);
  const counts = portfolioCounts(live.meta);
  const unfilteredEmpty = portfolioIsUnfilteredEmpty(live.empty, ws, pathway);

  /* Search matches the two things a person actually knows a programme by — its
     title and its code. Deliberately NOT `lead`: the server projects that as
     COALESCE(u.name, u.email, '—'), so searching it would let a typed fragment
     confirm a colleague's email address one character at a time. Same reason
     the AnA publisher below drops the field. */
  const needle = q.trim().toLowerCase();
  const list = projects.filter(
    p =>
      (status === 'all' || p.status === status) &&
      (!needle ||
        p.title.toLowerCase().includes(needle) ||
        p.code.toLowerCase().includes(needle)),
  );
  /* Gated on the read: `projects` is empty while the read is in flight AND when it
     failed. `settled` gates the figures, the search placeholder's count and the
     paged note. The figures are the server's counts (PortfolioFigures, P-122):
     no "Blocked" figure (nothing writes that status or computes a blocker), and
     no average readiness (the server sends none; the page mean was the browser's). */
  const settled = !live.loading && !live.error;
  /* The status filter offers the statuses the portfolio actually holds. It
     offered Blocked and Complete, which nothing writes, so both always showed
     an empty list. One status (or none) needs no filter. */
  const statusChoices = portfolioStatusChoices(projects.map(project => project.status), status);

  /* What AnA can see of this screen.
     The portfolio is the screen a user is most likely to ask a general question
     on — "which programs are at risk?", "what should I do next?" — and until now
     she was told only that the surface was called "projects". The header's
     "Ask AnA" button (gone since D2-1; ⌘K asks AnA) sent her "Which programs
     are at risk this week?" with no way to know which programs exist.

     A FAILED read publishes the failure. `projects` is [] both when the org has
     no programmes and when the read threw, and a summary saying "0 programs"
     over an outage would make AnA confidently wrong about a customer's whole
     portfolio. */
  const anaContext = useMemo(() => {
    /* The wizard is a full-canvas view now, so when it is open the portfolio is
       NOT on screen. Publishing "Projects portfolio: 14 programs, 3 blocked"
       while the person is looking at a filing-type catalogue would describe a
       screen that is not there — the same class of untruth as reporting an
       empty portfolio over a failed read, two branches down. */
    if (wizardOpen) {
      return wizardContext ?? {
        summary:
          'The new-project wizard is opening; its current step has not been reported yet. The portfolio is not visible.',
        availableActions: [
          'Explain what a filing type commits the project to',
        ],
      };
    }
    if (archivedView) {
      return { summary: 'The archived projects are shown, each with Restore; the active portfolio is not listed.', availableActions: ['Restore an archived project, with a reason', 'Go back to the active projects'] };
    }
    if (live.loading) {
      return { summary: 'The project portfolio is still loading; nothing on screen is final yet.' };
    }
    if (live.error) {
      return {
        summary:
          'The project portfolio could not be read, so this screen is showing no projects because of a ' +
          'failure, not because there are none.',
        availableActions: ['Retry the portfolio read'],
      };
    }
    /* The search narrows the list exactly as the two dropdowns do, so it has to
       be named here for the same reason they are: a summary that said "filtered
       by workstream and status" while a search term was also hiding rows would
       describe a screen the user is not looking at, and AnA would answer "which
       programs are at risk?" over a set it had been told was complete. */
    const filtered = ws !== 'all' || pathway !== 'all' || status !== 'all' || clientContext.active || needle !== '';
    const by = [
      ws !== 'all' ? `workstream "${ws}"` : null,
      pathway !== 'all' ? `pathway "${pathway}"` : null,
      status !== 'all' ? `status "${status}"` : null,
      clientContext.description,
      needle ? `a search for "${q.trim()}"` : null,
    ].filter(Boolean);
    return {
      summary:
        `Projects portfolio: ${counts?.total ?? projects.length} regulatory project(s)` +
        (truncated ? ` — showing the first ${projects.length} only; more exist. Readiness, status and search cover this page${counts ? '; total and filing counts cover all matching projects' : '; counts are page floors'}` : '') +
        (filtered ? `, filtered to ${list.length} by ${by.join(' and ')}` : '') +
        (counts ? `; ${counts.filingWithin60Days} with a target filing date in the next 60 days, as the server counted. ` : '. The portfolio figures could not be read. ') +
        `${averageReadinessSentence(counts) ?? 'No portfolio average readiness is computed.'} Each project's dossier readiness is listed. Blockers are not assessed on this list. ` +
        `Shown as a ${view}.`,
      facts: {
        totalPrograms: counts?.total ?? projects.length,
        countsScope: counts ? 'selected client, workstream and pathway before paging' : 'returned page only',
        readinessPageCount: projects.length,
        pathwayFilter: pathway,
        byWorkstream: counts?.byWorkstream ?? null,
        byPathway: counts?.byPathway ?? null,
        portfolioTruncated: truncated,
        shownInList: list.length,
        workstreamFilter: ws,
        statusFilter: status,
        ...clientContext.facts,
        searchQuery: q.trim() || null,
        filingWithin60Days: counts?.filingWithin60Days ?? null,
        averageReadiness: averageReadinessFigure(counts),
        blockersAssessed: false,
        // Enough to name a programme back to the user, not the whole row set.
        // `p.lead` is deliberately NOT published: the server projects it as
        // COALESCE(u.name, u.email, '—'), so a lead with no name set resolves to
        // an EMAIL — PII that must not enter the model prompt. It stays on the
        // list (where the person reads it); the sibling ProjectHome publisher
        // drops the team member's email for the same reason.
        programs: list.slice(0, 12).map(p => ({
          id: p.id, code: p.code, title: p.title, workstream: p.ws, pathway: p.pathway ?? null, stage: p.stage,
          status: p.status, readiness: p.readiness, readinessState: p.readinessState ?? null, due: p.due,
        })),
      },
      availableActions: [
        'Open a project to enter its project home',
        'Filter the portfolio by client type (medical device & IVD, biotech, pharma), pathway or client; filter the loaded page by status',
        'Search the portfolio by project title or code',
        'Switch between the grid and list views; both show the portfolio figures and each project’s readiness, stage, lead and status',
        'Create a new project through the new-project wizard',
      ],
    };
  }, [wizardOpen, wizardContext, archivedView, live.loading, live.error, projects, list, ws, pathway, status, clientContext, q, needle, view, truncated, counts]);
  usePublishSurfaceContext('projects', anaContext);

  const openProj = (
    pr: Pick<ProjPortfolioEntry, 'id' | 'title'> & Partial<Pick<ProjPortfolioEntry, 'code' | 'ws' | 'status'>>,
  ) => openProjectHome({ id: pr.id, title: pr.title, code: pr.code, ws: pr.ws, status: pr.status }, onNav);

  /* AnA's hands on this screen — the surface-action bus (shared registry:
     projects.*). Every handler drives the SAME state the human's own controls
     drive (openProj / setWs / setStatus / setView), so there is no second
     path; misses are honest refusals, never guesses. */
  /* One guard for all three: while the wizard owns the canvas, a person may be
     mid-form — AnA operating the portfolio underneath (or navigating away)
     would discard their work. Honest refusal instead. */
  /* The program the server found. act_on_screen resolves the reference across
     every program the person has and hands over the one it matched; this page
     lists only the 50 most recent, so a program past it was refused here as
     unknown although it exists. It arrives beside the params, never in them —
     the model writes params. Needs no page, so it does not wait for one. */
  const openResolvedProgram = (program: DirectiveProgram, named: string | undefined) => {
    const found = projects.find((p) => p.id === program.id) ?? {
      id: program.id,
      title: program.name || named || '',
      code: program.code || '—',
    };
    openProj(found);
    return { ok: true as const, detail: `Opened ${found.code} — ${found.title}` };
  };
  const wizardGuard = () =>
    wizardOpen ? { ok: false as const, reason: 'The new-project wizard is open — close it first.' } : null;
  useSurfaceActionHandlers('projects', {
    'projects.new-project': () => {
      if (wizardOpen) return { ok: true, detail: 'The new-project wizard is already open.' };
      setWizardContext(null);
      setWizardOpen(true);
      return { ok: true, detail: 'Opened the new-project wizard.' };
    },
    'projects.open-program': (params, { program }) => {
      const guarded = wizardGuard();
      if (guarded) return guarded;
      if (program) return openResolvedProgram(program, params.program);
      const wanted = (params.program ?? '').trim().toLowerCase();
      // Not-ready, not failed: the bus holds the directive and re-attempts on
      // this surface's ready signal below — the navigate→act gap.
      if (live.loading)
        return { ok: false, reason: 'The portfolio is still loading.', retry: true };
      if (live.error) return { ok: false, reason: 'The portfolio could not be read.' };
      const programName = (p: (typeof projects)[number]) => `${p.code} — ${p.title}`;
      const listed = () => listedChoices(projects.map(programName), 'Projects listed');
      if (!wanted) return { ok: false, reason: `No project named.${listed()}` };
      /* Exact first, on the keys the server resolves a reference by
         (drive-context.ts resolveProgramRef): the id, the trimmed code, the
         title. The id was not one of them here. AnA is handed each program's
         id beside its name, act_on_screen resolves the reference before the
         directive is sent, and it sends on a reference the server matched —
         so a program open-by-id that the server had found was refused here as
         "No program named …" while it sat on this very page. */
      const exact = projects.find(
        (p) =>
          p.id.toLowerCase() === wanted ||
          p.code.trim().toLowerCase() === wanted ||
          p.title.toLowerCase() === wanted,
      );
      const contains = exact
        ? []
        : projects.filter(
            (p) => p.title.toLowerCase().includes(wanted) || p.code.toLowerCase().includes(wanted),
          );
      const match = exact ?? (contains.length === 1 ? contains[0] : null);
      if (!match) {
        return {
          ok: false,
          reason:
            contains.length > 1
              ? `"${params.program}" matches ${contains.length} projects — name one exactly.${listedChoices(
                  contains.map(programName),
                  'Matches',
                )}`
              : `No project named "${params.program}" in this portfolio.${listed()}`,
        };
      }
      openProj(match);
      return { ok: true, detail: `Opened ${match.code} — ${match.title}` };
    },
    'projects.filter': (params) => {
      const guarded = wizardGuard();
      if (guarded) return guarded;
      if (params.clientWorkspaceId && params.clientWorkspaceId !== 'all'
        && !clients.some(client => String(client.id) === params.clientWorkspaceId)) {
        return { ok: false, reason: 'That client is not available in this portfolio’s client choices.' };
      }
      const applied: string[] = [];
      if (params.workstream) { setWs(params.workstream); applied.push(`workstream ${params.workstream}`); }
      if (params.pathway) { setPathway(params.pathway); applied.push(`pathway ${params.pathway}`); }
      if (params.status) { setStatus(params.status); applied.push(`status ${params.status}`); }
      if (params.clientWorkspaceId) {
        setClientWorkspaceId(params.clientWorkspaceId);
        applied.push(params.clientWorkspaceId === 'all' ? 'all clients' : `client ${clients.find(client => String(client.id) === params.clientWorkspaceId)?.name}`);
      }
      if (applied.length === 0) return { ok: false, reason: 'No filter named.' };
      return { ok: true, detail: `Filtered to ${applied.join(', ')}` };
    },
    'projects.set-view': (params) => {
      const guarded = wizardGuard();
      if (guarded) return guarded;
      if (params.view !== 'grid' && params.view !== 'list') {
        return { ok: false, reason: 'View must be grid or list.' };
      }
      setView(params.view);
      return { ok: true, detail: `Switched to the ${params.view} view` };
    },
  });
  /* The ready signal for the retry contract above: when the portfolio read
     settles, a held not-ready open-program gets its one re-attempt. */
  useEffect(() => {
    if (!live.loading) notifySurfaceActionReady('projects');
  }, [live.loading]);

  /* The wizard takes the canvas instead of floating over it. Placed after every
     hook above, so the hook order is identical in both branches. It is a state
     swap and not a navigation on purpose: `onNav` would push a surface change
     the shell persists, and backing out of a half-filled form would then have to
     unwind that too. */
  if (wizardOpen) {
    return <NewProjectWizard onClose={() => setWizardOpen(false)} onNav={onNav} segment={segment} onAsk={onAsk} onContext={setWizardContext}
      existingNames={projects.map(project => project.title)} />;
  }

  return (
    /* `.page-full` on the shell sets `display:flex; padding:0`, so this is the
       flex child that has to claim the row and carry its own padding. Using
       `.page-inner` here is what capped the workspace index at a 1160px reading
       measure — see the note beside `projects:` in surfaceViews.ts. */
    <div className="pj-index">
      {/* Claude's Projects page (D2 §1.3–1.4): the serif title and one primary
          action. The "Workspace" eyebrow, the sub-line and "Ask AnA" are gone:
          the rail and the crumb say where you are, and ⌘K's "Ask AnA" and the
          Home composer ask AnA anything, over this screen's published context. */}
      <div className="ph">
        <div>
          <h1 className="ph-title">Projects</h1>
          <NeedsProjectNotice />
        </div>
        <div className="ph-acts">
          <button type="button" className="btn ghost" aria-expanded={riskOpen} onClick={() => setRiskOpen(o => !o)}>
            Which projects are at risk this week?
          </button>
          <button type="button" className="btn primary" onClick={() => openNewProject(onNav)}>{I.plus} New project</button>
        </div>
      </div>

      <PortfolioFigures settled={settled} counts={counts} />
      <ProjectsAtRisk open={riskOpen} onClose={() => setRiskOpen(false)} onOpenProject={openProj} />
      {/* One quiet toolbar row: search, the filters as selects, the view. */}
      <div className="pj-toolbar">
        <div className="pj-search">
          <span className="ico">{I.search}</span>
          <input
            type="search"
            className="pj-search-i"
            placeholder={searchPlaceholder(projects.length, truncated, settled)}
            value={q}
            onChange={e => setQ(e.target.value)}
            aria-label="Search projects by title or code"
          />
        </div>
        <ProjectClientFilter value={clientWorkspaceId} clients={clients} onChange={setClientWorkspaceId} />
        <ProjectPortfolioFilters workstream={ws} pathway={pathway} counts={counts}
          hasDeviceRows={projects.some(project => project.ws === 'MDX')} onWorkstream={setWs} onPathway={setPathway} />
        {statusChoices.visible && (
          <select className="c2c-input pj-filter" aria-label="Status" value={status} onChange={e => setStatus(e.target.value)}>
            {statusChoices.choices.map(s => (
              <option key={s} value={s}>{s === 'all' ? 'All statuses' : enumWords(s) ?? s}</option>
            ))}
          </select>
        )}
        <span className="pj-toolbar-gap" />
        <div className="seg" role="group" aria-label="View">
          <button type="button" className={`seg-b${view === 'grid' ? ' on' : ''}`} aria-pressed={view === 'grid'} onClick={() => setView('grid')}>Grid</button>
          <button type="button" className={`seg-b${view === 'list' ? ' on' : ''}`} aria-pressed={view === 'list'} onClick={() => setView('list')}>List</button>
        </div>
      </div>
      <ClientChoicesNote hasMore={clientContext.hasMore} />

      {archivedView ? (
        <ArchivedProjects portfolioUrl={portfolioUrl} needle={needle} onBack={() => setArchivedView(false)}
          onRestored={() => setReloadNonce(n => n + 1)} />
      ) : live.loading ? (
        <div role="status" className="scaf-note" style={{ padding: '18px 10px' }}>Loading projects…</div>
      ) : live.error ? (
        // The hint used to read "…(projected from regulatory_programs)…",
        // naming a governed store's table on screen: an information-disclosure
        // finding in a regulated product, not a cosmetic one, and a detail the
        // reader could do nothing with. It also promised a retry the panel did
        // not offer — `retry` below is that affordance.
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load the project portfolio"
          hint={live.error || "Couldn't load your projects. Try again, or sign in if your session has expired."}
          retry={() => setReloadNonce(n => n + 1)}
        />
      ) : unfilteredEmpty ? (
        <EmptyState
          icon={I.folder}
          title={clientContext.empty.title}
          hint={clientContext.empty.hint}
        />
      ) : list.length === 0 ? (
        <EmptyState
          icon={I.filter}
          title={needle ? `No projects match “${q.trim()}”` : 'No projects match these filters'}
          hint={
            needle
              ? 'Search matches a project’s title or code on the loaded page. Clear the search, or adjust the filters.'
              : 'Adjust the client, client type, pathway or status filter to see more.'
          }
        />
      ) : view === 'grid' ? (
        /* A calm card: the name, one line of what the project is, its plan line, its
           readiness, stage, lead and status (P-122 §3.2: D2-1 had left these to the
           list), and its code and last update (the device portfolio's "last
           activity", folded into Projects: D2, fold F6, 2026-10-30). */
        <div className="pj-cards">
          <PortfolioLinesNote error={plans.error} />
          {list.map(p => {
            const line = cardLine(p);
            return (
              <button type="button" key={p.id} className="pj-card" onClick={() => openProj(p)}>
                <div className="pj-card-t">{p.title}</div>
                {line && <div className="pj-card-m">{line}</div>}
                <PortfolioLine line={plans.lines[p.id]} />
                <CardFacts p={p} />
                <div className="pj-card-r">
                  <span>{[stated(p.code), p.activity].filter(Boolean).join(' · ')}</span>
                  {p.due_date && <span>Due {p.due}</span>}
                </div>
                {/* The status is a fact above. The list assesses no blockers, so a
                    status of blocked (NM-512 in the QA organisation, QA 2026-10-08 j1)
                    says in words that no cause is recorded: a red chip alone read as a
                    finding with its cause withheld. */}
                {p.status === 'blocked' && (
                  <span className="pj-card-blk" title={BLOCKED_NO_CAUSE_TITLE}>{I.alertTriangle} Blocked · {BLOCKED_NO_CAUSE}</span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <>
        {/* The plans' failed read is said in the list too, which a remembered list view now opens on (P-122). */}
        <PortfolioLinesNote error={plans.error} />
        <div className="ctable">
          {/* Status, where a Blocker column read "—" on every row: the list
              assesses no blockers (2026-10-31). The figure is text under the
              name Project home uses, with the server's reason as its title. */}
          <div className="ct-head" style={{ gridTemplateColumns: LIST_COLUMNS }}>
            <div>Project</div><div>Client type</div><div>Stage</div><div>{DOSSIER_READINESS_LABEL}</div><div>Status</div><div>Lead</div><div>Target date</div>
          </div>
          {list.map(p => (
            <button type="button" key={p.id} className="ct-row" style={{ gridTemplateColumns: LIST_COLUMNS }} onClick={() => openProj(p)}>
              <div>
                <div className="ct-strong">{p.title}</div>
                <div className="pj-list-sub">{[stated(p.code), p.activity].filter(Boolean).join(' · ')}</div>
              </div>
              <div>{WS_LABEL[p.ws] ?? p.ws}</div>
              <div>{p.stage}</div>
              <div><span title={p.readinessReason ?? DOSSIER_READINESS_MEANS}>{dossierReadinessValue(p.readiness, p.readinessState)}</span></div>
              <div
                data-tone={p.status === 'blocked' ? 'warn' : undefined}
                title={p.status === 'blocked' ? BLOCKED_NO_CAUSE_TITLE : undefined}
              >
                {enumWords(p.status) ?? 'Not recorded'}
                {p.status === 'blocked' && <div className="pj-list-sub">{BLOCKED_NO_CAUSE}</div>}
              </div>
              <div>{p.lead}</div>
              <div>{p.due}<PortfolioLine line={plans.lines[p.id]} className="pj-list-sub" /></div>
            </button>
          ))}
        </div>
        </>
      )}

      <ArchivedProjectsLink shown={archivedView} onOpen={() => setArchivedView(true)}>
        <PortfolioPagedNote paged={truncated} settled={settled} count={projects.length} scopedCounts={counts !== null} />
      </ArchivedProjectsLink>
    </div>
  );
}

export default Projects;
