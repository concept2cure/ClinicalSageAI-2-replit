import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { I } from '../icons';
import { useLiveRows, EmptyState, ErrorState } from '../dataConnect';
import { useAuthUser } from '@/services/portal/authService';
import { useTenant } from '@/contexts/TenantContext';
import { capturedActorHeaders } from '@/utils/authToken';
import { projectIntakeId, type ProjectIntakeActor } from '@shared/project-intake-workspace';
import { createProjectIntake, readProjectIntakeWorkspaces, type IntakeOptionsAnswer } from './projectIntakeRequest';
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
  filingDocumentClassForFiling,
  filingDocumentClassOf,
  filingTypeInSentence,
  productTypeFixedByFiling,
} from '@shared/regulatory/filing-document-classes';
import type { SurfaceViewProps } from '../surfaceViews';
import { publishShellProject } from '../shellProject';
import { DOSSIER_READINESS_LABEL, DOSSIER_READINESS_MEANS, dossierReadinessValue, isMeasuredReadiness, type DossierFigureState } from '../dossierReadiness';
import {
  listedChoices,
  notifySurfaceActionReady,
  useSurfaceActionHandlers,
  type DirectiveProgram,
} from '../surfaceActions';
import { usePublishSurfaceContext } from '../surfaceContext';
// The New-Project wizard drives off the global regulatory registry. Import the
// picker + the submission-type lookup DIRECTLY from the modules that own them,
// rather than depending on window globals that another surface may or may not
// have set first (it hadn't — window.RegistryPicker was never assigned, so the
// wizard's first step hung on "Loading registry…" and could never complete).
// Importing RegistryBridge also runs its side effects, which populate the
// window.GLOBAL_REGISTRY / REG_SEGMENTS that RegistryPicker reads.
import { RegistryPicker } from './AnaVerbs';
import { MarketSupportLine } from '../MarketSupportLine';
import { getSubmissionTypeContext } from './RegistryBridge';
import { ProjectDiscoveryHandoff } from './ProjectDiscoveryHandoff';
import {
  DEVICE_CLASSES, DEVICE_FLAGS, REVIEW_PANELS,
  usesDeviceClassification, type DeviceFlagId,
} from '../../../../../shared/constants/domain/device-classification';
import { MDR_DECLARED_CLASSES, IVDR_CLASSES } from '@shared/regulatory/device-class';
import { deviceClassScopeForFiling, regionalDeviceApplicationClassForFiling } from '@shared/regulatory/filing-catalog';
import '../styles/project-home-v2.css';

/* ── Window global owned by this surface (the app shell sets it to auto-open
   the wizard on navigation). C2C_PROJECT / __C2C_SEGMENT / C2C are declared by
   sibling surfaces and merge into the global Window type. ── */
declare global {
  interface Window {
    __C2C_NEW_PROJECT?: boolean;
  }
}

/* ════ New Project Wizard (registry-driven, persists to regulatory_programs) ══ */

interface SelTpl {
  id: string;
  label: string;
  pathway: string;
  agency?: string;
  region?: string;
  dossierStandard?: string;
  ctdModule?: string;
  submissionFormat?: string;
}

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

/** Map a chosen registry template + segment → a canonical program_type the
 *  backend accepts (server VALID_PROGRAM_TYPES) and WS_CASE buckets. */
export function programTypeFor(sel: SelTpl | null, uiSeg: string): string {
  const id = (sel?.id ?? '').toLowerCase();
  const pw = (sel?.pathway ?? '').toLowerCase();
  const regional = regionalDeviceApplicationClassForFiling(id); if (regional) return regional.docType;
  // A filing that is a document, not an application — a supplement, an annual
  // report, an IND amendment, a meeting package, a designation request, a CSR —
  // is its own class, decided before any pathway rule below. Every one of them
  // used to fall to the 'ctd' default and was scaffolded as a 73-node NDA, the
  // CSR to the closing 'ind' (shared/regulatory/filing-document-classes.ts).
  const documentClass = filingDocumentClassForFiling(id);
  if (documentClass) return documentClass.docType;
  if (id.includes('510k')) return '510k';
  if (id.includes('de_novo') || pw === 'denovo') return 'de_novo';
  if (id.includes('pma')) return 'pma';
  if (id === 'cer' || pw === 'cer') return 'cer';
  if (pw === 'ide' || id === 'ide') return 'ide';
  // 'jnda' is the JP MARKETING application only. The old `id.includes('jp_')`
  // shortcut held while the registry's JP rows were named pmda_*/ctn_jp; the
  // unified catalog's ids are lowercase canonical (jp_shonin, jp_ctn, …), so a
  // prefix match would file a Japanese device approval as a J-NDA. The
  // pathwayKey carries the intent now.
  if (id.includes('jnda') || pw === 'jnda') return 'jnda';
  // A 505(b)(2) IS an NDA (21 CFR 314.50 dossier) and a 351(k) IS a BLA. Their
  // pathway keys ('505b2', 'biosimilar') matched nothing below and fell through
  // to the final `'ind'` default — so a marketing-application customer was
  // scaffolded a 108-section IND and an IND submission spine. 'biosimilar' is
  // shared across regions, so the region prefix picks the application.
  if (pw === '505b2') return 'nda';
  if (pw === 'biosimilar') {
    if (id.startsWith('us_')) return 'bla';
    if (id.startsWith('eu_')) return 'maa';
    if (id.startsWith('jp_')) return 'jnda';
    return 'nda';
  }
  // A DMF is Module 3 content (3.2.S / 3.2.A / 3.2.R) with a letter of
  // authorization — not an IND. It files against the harmonised Module 3 pack
  // (mod3:ich) via PROGRAM_TO_DOC_TYPE, never a 108-section IND outline.
  if (pw === 'dmf' || id === 'us_dmf' || id === 'eu_asmf') return 'dmf';
  if (id.includes('bla') || pw === 'bla') return 'bla';
  if (id.includes('maa') || pw === 'maa') return 'maa';
  if (id.includes('anda') || pw === 'anda') return 'anda';
  // MUST precede the 'nda' line below. A missing pathwayKey defaults to 'ctd'
  // (line 130), and `pw === 'ctd'` returns 'nda' — which is how every
  // clinical-trial application in the registry became a US marketing
  // application. 'eu_cta' now carries pathwayKey 'cta' and lands here, so it
  // scaffolds the CTR 536/2014 Annex I outline seeded by migrations/20260806
  // instead of the 71-section NDA dossier.
  //
  // Other regional trial filings resolve to their own agency. A missing pack
  // is refused; a US marketing outline is never substituted.
  if (id === 'eu_cta' || pw === 'cta') return 'cta';
  // Bare device/ivd names no pathway and stays unmapped. The existing market
  // verdict refuses it; a regional technical file reaches its exact pack below.
  // MDR/IVDR before the generic device/ivd fallbacks: an EU technical file has a
  // real pack and must reach it, while a bare 'device' still fails closed.
  if (pw === 'mdr') return 'mdr';
  if (pw === 'ivdr') return 'ivdr';
  if (pw === 'device') return 'device';
  if (pw === 'ivd') return 'ivd';
  if (id.includes('nda') || pw === 'ctd') return 'nda';
  if (id.includes('ind') || pw === 'ind') return 'ind';
  return uiSeg === 'medtech' ? '510k' : uiSeg === 'diagnostics' ? 'ivd' : 'ind';
}

/** A filing document class as the review step names it ("Prior Approval Supplement"), or null for an application. */
function documentClassLabel(programType: string): string | null {
  const label = filingDocumentClassOf(programType)?.label;
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : null;
}

/** The three steps, in order. One list, read by the step rail, the sub-heading
 *  and the bounds checks below, so a step cannot be renamed in one place and
 *  stay stale in another. */
const STEP_LABELS = ['Choose filing type', 'Configure project', 'Review & create'] as const;

/** Exported for the failure-path test: the wizard's error surface is an
 *  acceptance criterion in its own right (a failed write must be visible and
 *  must offer a way out), and driving it through the whole Projects surface
 *  would test the registry loader rather than the banner. */
type NewProjectWizardProps = { onClose: () => void; onNav: (id: string) => void; segment?: string };
export function NewProjectWizard(props: NewProjectWizardProps) {
  const user = useAuthUser();
  const { currentOrganization } = useTenant();
  const actorUserId = projectIntakeId(user?.id);
  const organizationId = projectIntakeId(user?.organizationId);
  const tenantOrganizationId = projectIntakeId(currentOrganization?.id);
  const key = actorUserId && organizationId && tenantOrganizationId === organizationId ? `${actorUserId}:${organizationId}` : 'unavailable';
  const current = useRef(key);
  current.current = key;
  if (!actorUserId || !organizationId || tenantOrganizationId !== organizationId) return (
    <section className="npw" aria-label="New project">
      <div className="npw-inner"><h1>New project</h1><p>The signed-in account or organization changed. Reopen New project after selecting your organization.</p><button className="btn ghost" onClick={props.onClose}>Back to projects</button></div>
    </section>
  );
  return <NewProjectWizardSession key={key} {...props} actor={{ actorUserId, organizationId }} isCurrent={() => current.current === key} />;
}

function NewProjectWizardSession({ onClose, onNav, segment, actor, isCurrent }: NewProjectWizardProps & { actor: ProjectIntakeActor; isCurrent: () => boolean }) {
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
  // creates the project solo and teammates are added afterward.
  const [team] = useState<string[]>([]);
  const [target, setTarget] = useState('');
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
  const uiSeg = tabSeg ?? arrivedSeg;
  const regSeg = SEG2REG[uiSeg];
  const segLabel = SEG_LABELS[uiSeg] || uiSeg;
  const ctx = tpl ? getSubmissionTypeContext(tpl) : null;
  const selTpl: SelTpl | null = ctx
    ? { ...ctx, label: ctx.displayName, pathway: ctx.pathwayKey || 'ctd' }
    : null;
  const programType = programTypeFor(selTpl, uiSeg);
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
       `programTypeFor` above is where that choice is fixed — and it was being
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

      <header className="npw-head">
        <div className="npw-head-inner">
          <div className="ph-eyebrow">Workspace</div>
          <h1 className="ph-title" id="new-project-title">New project</h1>
          <p className="ph-sub">
            Choose the filing type, describe the product, then review what will be recorded.
            The filing type decides the dossier outline this programme is built against.
          </p>
        </div>
      </header>

      {/* Step rail — replaces the three flat progress bars the modal used, which
          carried the entire step state in the fill colour of an unlabelled
          strip. Position is stated three ways here: the number or tick, the
          step's own name, and aria-current. Nothing is signalled by colour
          alone. A finished step is re-openable; a step ahead of the current one
          is not, because nothing has been entered into it yet. */}
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
                  <span className="npw-step-k">Step {i + 1}</span>
                  <span className="npw-step-t">{label}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className="npw-scroll">
        {/* The registry step is a catalogue and wants the width; the two form
            steps are read line by line and want a measure. One container, two
            widths, rather than one compromise that serves neither. */}
        <div className="npw-inner" data-measure={step === 0 ? 'wide' : 'form'}>
          {/* Step 0: Choose template */}
          {step === 0 && (
            <div>
              <div className="npw-seg-note">
                <span className="ico" aria-hidden="true">{I.sparkles}</span>
                <div>
                  <div className="npw-seg-t">Tailored for {segLabel}</div>
                  <div className="npw-seg-s">Showing the filing types that fit your client type. Switch the tab to browse other segments.</div>
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
              />
            </div>
          )}

          {/* Step 1: Configure */}
          {step === 1 && selTpl && (
            <div className="npw-form">
              <h2 className="npw-h2">Configure your {selTpl.label} project</h2>
              {/* What the platform can carry for the market this filing type
                  opens, in the server's words (FILING_SPINE.md F19). */}
              <p className="npw-seg-s" data-testid="npw-market-support">
                <MarketSupportLine applicationType={programTypeFor(selTpl, uiSeg)} market={selTpl.agency || 'FDA'} />
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
                  <span className="npw-field-help" id="npw-name-help">
                    Required. The program is listed under this name.
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
                      {canRefine ? 'The filing default is selected. Choose the product type this project will record.' : <>Required. {filingTypeInSentence(programType)} covers drugs and biologics; the program records which.</>}
                    </span>
                  </label>
                )}

                <label className="npw-field">
                  <span className="npw-field-l">Target submission date</span>
                  <input className="c2c-input" type="date" value={target} onChange={e => setTarget(e.target.value)} />
                </label>
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
                      Three letters. It decides the regulation number, the review panel and which
                      predicates you can compare against.
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
                    <span className="npw-field-help" id="npw-rn-help">21 CFR — the part is the panel.</span>
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

              <div className="npw-field npw-field-wide">
                <span className="npw-field-l">Team members</span>
                {/* Backend gap: no endpoint lists selectable org members for a
                    not-yet-created project (GET /api/c2c/projects/:id/team needs a
                    persisted project id). Rather than show a fabricated roster, the
                    project is created solo and teammates are added afterward. */}
                <EmptyState
                  icon={I.info}
                  title="Team assignment isn't available yet"
                  hint="You'll be able to add teammates once the project exists and org members can be listed."
                />
              </div>
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
                  <dd>{target || 'Not set'}</dd>
                </div>
                <div className="npw-review-row">
                  <dt>Pathway</dt>
                  {/* A filing document class names itself: its pathway key is the
                      'ctd' default, which read "CTD" for a supplement or a CSR. */}
                  <dd>{documentClassLabel(programType) ?? (selTpl.pathway || '').toUpperCase()}{selTpl.submissionFormat && selTpl.submissionFormat !== '—' ? ' — ' + selTpl.submissionFormat : ''}</dd>
                </div>
                {/* Both lines are derived exactly as the create call derives
                    them, so the review step shows what will actually persist.
                    They were read off the UI segment before, which is why this
                    pane said "Workstream: Biotech / Recorded as: 510K · biologic"
                    for a device filing — and then stored it. */}
                <div className="npw-review-row">
                  <dt>Workstream</dt>
                  <dd>{workstreamForFilingType(programType, recordedClass) ?? SEG2WS[uiSeg] ?? 'Biotech'}</dd>
                </div>
                <div className="npw-review-row">
                  <dt>Recorded as</dt>
                  <dd>{programType.toUpperCase().replace(/_/g, ' ')} · {recordedClass ?? 'not stated'}</dd>
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

              <div className="npw-next">
                <span className="ico" aria-hidden="true">{I.sparkles}</span>
                <span>Your project is saved to the portfolio and opens in its workspace, where you can add documents and author sections with AnA.</span>
              </div>
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
          {step < 2 && (
            <button
              type="button"
              className="btn primary"
              disabled={(step === 0 && !tpl) || (step === 1 && !configured)}
              onClick={() => setStep(s => s + 1)}
            >
              Continue
            </button>
          )}
          {step === 2 && (
            <button type="button" className="btn primary" disabled={creating || writeStopped || !configured} onClick={doCreate}>
              {creating ? 'Creating project…' : <>{I.plus} Create project</>}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/* ════ Projects — portfolio of programs ════ */

/** True when the list route said there is more than the page it returned. */
function readIsPaged(meta: Record<string, unknown> | undefined): boolean {
  return meta !== undefined && meta.hasMore === true;
}

/** A count read from one page of a longer list is a floor, and reads as one. */
function countFloor(n: number, paged: boolean): string {
  return paged ? `${n}+` : String(n);
}

function PortfolioPagedNote({ paged, settled, count }: { paged: boolean; settled: boolean; count: number }) {
  if (!paged || !settled) return null;
  return (
    <div role="status" className="scaf-note" style={{ marginBottom: 12 }}>
      Showing the first {count} programs. The totals, the average readiness and search cover these only.
    </div>
  );
}

/**
 * Portfolio row — the display contract projected by GET /api/c2c/projects
 * (server/routes/c2c/projects.ts), one field per real `regulatory_programs`
 * column (phase → stage, target_submission_date → due, lead_user_id → lead),
 * and the home filing's dossier readiness, measured on each read. `blocker` is in the projection but the list query
 * returns it as a literal NULL — no blocker is computed at list level — so it is
 * typed nullable and rendered null-safe, never fabricated. Null means "not
 * assessed here", never "none": the card says nothing about blockers then.
 */
interface ProjPortfolioEntry {
  id: string;
  title: string;
  ws: string;
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
  blocker: string | null;
  due: string;
  /** target_submission_date as YYYY-MM-DD, or null when none is set. */
  due_date?: string | null;
  activity: string;
}

/**
 * The portfolio's mean dossier readiness, over the programs measured, and how
 * many it covers when that is not all of them (`cover`, '' until the read has
 * settled). A mean over no programmes has no value: `kv` covers a read that has
 * not settled, and this covers one that settled with nothing measured, where a
 * `|| 1` divisor once produced a confident "0%".
 */
function portfolioMean(projects: ProjPortfolioEntry[], settled: boolean): { mean: string; cover: string } {
  const measured = projects.filter((p): p is ProjPortfolioEntry & { readiness: number } => isMeasuredReadiness(p.readiness, p.readinessState));
  const mean = measured.length ? Math.round(measured.reduce((s, p) => s + p.readiness, 0) / measured.length) + '%' : '—';
  const partial = settled && measured.length > 0 && measured.length < projects.length;
  return { mean, cover: partial ? `${measured.length} of ${projects.length} measured` : '' };
}

/** Whole days from today to a YYYY-MM-DD date, in the viewer's calendar; null
 *  for no date or an unreadable one. */
function daysUntil(isoDate: string | null | undefined, today: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate ?? '');
  if (!m) return null;
  const due = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((due - now) / 86_400_000);
}

/** Workstream → chip tone (presentation config, not data). */
const WS_TONE: Record<string, string> = { MDX: 'ai', Biotech: 'ok', Pharma: 'warn', CRO: 'idle' };

/* A program whose stored status is `blocked` while the list carries no blocker
   for it. The product writes only active and archived (POST and the close-out
   routes); a `blocked` row comes from data loaded some other way, and the list
   does not assess blockers. The card states the gap instead of a bare red chip. */
const BLOCKED_NO_CAUSE = 'No cause recorded';
const BLOCKED_NO_CAUSE_TITLE = 'This program’s status is recorded as blocked, and no blocker is recorded against it.';

export function Projects({ onAsk, onNav, segment }: SurfaceViewProps) {
  const [ws, setWs] = useState('all');
  const [status, setStatus] = useState('all');
  const [view, setView] = useState('grid');
  const [q, setQ] = useState('');
  const [wizardOpen, setWizardOpen] = useState(() => {
    if (window.__C2C_NEW_PROJECT) { window.__C2C_NEW_PROJECT = false; return true; }
    return false;
  });

  // Real program portfolio — GET /api/c2c/projects projects one field per real
  // regulatory_programs column (server/routes/c2c/projects.ts). Fixture-free:
  // real rows, an honest empty, or an honest error — never a "Sample data" stand-in.
  /* `useLiveRows` re-fetches when its dep list changes and exposes no reload of
     its own, so the retry the failed-load panel offers is a nonce in that list.
     The panel's copy promised a retry it did not have. */
  const [reloadNonce, setReloadNonce] = useState(0);
  const live = useLiveRows<ProjPortfolioEntry>('/api/c2c/projects', [reloadNonce]);
  const projects = live.rows;
  /* The read is one page (50 by default) and the route says when there is
     more (`meta.hasMore`). Ignored, an org with 80 programs read "50 active
     programs", the mean covered 50 and search could not find the 51st. The
     count is a floor then, and the screen and AnA are told so. */
  const truncated = readIsPaged(live.meta);

  /* Search matches the two things a person actually knows a programme by — its
     title and its code. Deliberately NOT `lead`: the server projects that as
     COALESCE(u.name, u.email, '—'), so searching it would let a typed fragment
     confirm a colleague's email address one character at a time. Same reason
     the AnA publisher below drops the field. */
  const needle = q.trim().toLowerCase();
  const list = projects.filter(
    p =>
      (ws === 'all' || p.ws === ws) &&
      (status === 'all' || p.status === status) &&
      (!needle ||
        p.title.toLowerCase().includes(needle) ||
        p.code.toLowerCase().includes(needle)),
  );
  /* Gated on the read, not just on the row count.
     `projects` is empty while the portfolio read is in flight AND when it has
     failed, so every figure here resolved to a settled 0 — and the `|| 1`
     divisor turned what would at least have been a visible NaN into a clean
     "0%", a portfolio-mean readiness computed over no programs. A director
     reading the header learned they run nothing and have nothing blocked. */
  const kv = (v: string) => (live.loading || live.error ? '—' : v);
  const { mean: meanReadiness, cover: measuredCover } = portfolioMean(projects, !live.loading && !live.error);
  /* No "Blocked" figure. A program's status is only ever written as active or
     archived (POST and the close-out routes in server/routes/c2c/projects.ts),
     and the list computes no blocker, so the count could only read 0: an
     all-clear nothing had assessed. Readiness is assessed per program, on
     Project home and in Submission Center. */
  const filingSoon = projects.filter(p => {
    const d = daysUntil(p.due_date);
    return d != null && d >= 0 && d < 60;
  }).length;
  const health = [
    { l: 'Active programs', n: kv(countFloor(projects.length, truncated)), m: 'across MDX, Biotech, Pharma', t: '' },
    // A mean over some of the programs says how many it covers (`q`).
    { l: 'Average readiness', n: kv(meanReadiness), m: 'portfolio mean', t: '', q: measuredCover },
    { l: 'Filing < 60 days', n: kv(countFloor(filingSoon, truncated)), m: 'target filing date set', t: 'warn' },
  ];
  /* The status filter offers the statuses the portfolio actually holds. It
     offered Blocked and Complete, which nothing writes, so both always showed
     an empty list. One status (or none) needs no filter. */
  const statuses = ['all', ...Array.from(new Set(projects.map(p => p.status).filter(Boolean)))];
  const wss = ['all', 'MDX', 'Biotech', 'Pharma'];

  /* What AnA can see of this screen.
     The portfolio is the screen a user is most likely to ask a general question
     on — "which programs are at risk?", "what should I do next?" — and until now
     she was told only that the surface was called "projects". The button in the
     header literally sends her "Which programs are at risk this week?" with no
     way to know which programs exist.

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
      return {
        summary:
          'The new-project wizard has the screen; the portfolio list is not visible. It walks ' +
          `three steps — ${STEP_LABELS.join(', ')} — and the step the person is on is the ` +
          'wizard\'s own state, which this surface does not hold.',
        availableActions: [
          'Explain what a filing type commits the programme to',
          'Cancel the wizard and go back to the portfolio',
        ],
      };
    }
    if (live.loading) {
      return { summary: 'The project portfolio is still loading; nothing on screen is final yet.' };
    }
    if (live.error) {
      return {
        summary:
          'The project portfolio could not be read, so this screen is showing no programs because of a ' +
          'failure, not because there are none.',
        availableActions: ['Retry the portfolio read'],
      };
    }
    /* The search narrows the list exactly as the two dropdowns do, so it has to
       be named here for the same reason they are: a summary that said "filtered
       by workstream and status" while a search term was also hiding rows would
       describe a screen the user is not looking at, and AnA would answer "which
       programs are at risk?" over a set it had been told was complete. */
    const filtered = ws !== 'all' || status !== 'all' || needle !== '';
    const by = [
      ws !== 'all' ? `workstream "${ws}"` : null,
      status !== 'all' ? `status "${status}"` : null,
      needle ? `a search for "${q.trim()}"` : null,
    ].filter(Boolean);
    return {
      summary:
        `Projects portfolio: ${projects.length} regulatory program(s)` +
        (truncated ? ` — the first ${projects.length} only; more exist, and every figure here covers the first ${projects.length}` : '') +
        (filtered ? `, filtered to ${list.length} by ${by.join(' and ')}` : '') +
        `. Average readiness ${health[1].n}${measuredCover ? ` (${measuredCover})` : ''}; ${health[2].n} with a target filing date in the next 60 days. ` +
        'Blockers are not assessed on this list; each program\'s readiness is on its project home. ' +
        `Shown as a ${view}.`,
      facts: {
        totalPrograms: projects.length,
        portfolioTruncated: truncated,
        shownInList: list.length,
        workstreamFilter: ws,
        statusFilter: status,
        searchQuery: q.trim() || null,
        averageReadiness: health[1].n,
        filingWithin60Days: health[2].n,
        blockersAssessed: false,
        // Enough to name a programme back to the user, not the whole row set.
        // `p.lead` is deliberately NOT published: the server projects it as
        // COALESCE(u.name, u.email, '—'), so a lead with no name set resolves to
        // an EMAIL — PII that must not enter the model prompt. It stays on the
        // card (where the person reads it); the sibling ProjectHome publisher
        // drops the team member's email for the same reason.
        programs: list.slice(0, 12).map(p => ({
          id: p.id, code: p.code, title: p.title, workstream: p.ws, stage: p.stage,
          status: p.status, readiness: p.readiness, readinessState: p.readinessState ?? null, due: p.due,
          blocker: p.blocker ?? null,
        })),
      },
      availableActions: [
        'Open a program to enter its project home',
        'Filter the portfolio by workstream (MDX, Biotech, Pharma) or by status',
        'Search the portfolio by program title or code',
        'Switch between the grid and list views',
        'Create a new project through the new-project wizard',
      ],
    };
  }, [wizardOpen, live.loading, live.error, projects, list, ws, status, q, needle, view, health, measuredCover, truncated]);
  usePublishSurfaceContext('projects', anaContext);

  const openProj = (
    pr: Pick<ProjPortfolioEntry, 'id' | 'title' | 'code'> & Partial<Pick<ProjPortfolioEntry, 'ws' | 'status'>>,
  ) => {
    try {
      publishShellProject({ id: pr.id, title: pr.title, code: pr.code, ws: pr.ws, status: pr.status });
      if (window.C2C?.setSurface) window.C2C.setSurface('project-home', pr.title);
    } catch { /* noop */ }
    onNav('project-home');
  };

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
      const listed = () => listedChoices(projects.map(programName), 'Programs listed');
      if (!wanted) return { ok: false, reason: `No program named.${listed()}` };
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
              ? `"${params.program}" matches ${contains.length} programs — name one exactly.${listedChoices(
                  contains.map(programName),
                  'Matches',
                )}`
              : `No program named "${params.program}" in this portfolio.${listed()}`,
        };
      }
      openProj(match);
      return { ok: true, detail: `Opened ${match.code} — ${match.title}` };
    },
    'projects.filter': (params) => {
      const guarded = wizardGuard();
      if (guarded) return guarded;
      const applied: string[] = [];
      if (params.workstream) { setWs(params.workstream); applied.push(`workstream ${params.workstream}`); }
      if (params.status) { setStatus(params.status); applied.push(`status ${params.status}`); }
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
    return <NewProjectWizard onClose={() => setWizardOpen(false)} onNav={onNav} segment={segment} />;
  }

  return (
    /* `.page-full` on the shell sets `display:flex; padding:0`, so this is the
       flex child that has to claim the row and carry its own padding. Using
       `.page-inner` here is what capped the workspace index at a 1160px reading
       measure — see the note beside `projects:` in surfaceViews.ts. */
    <div className="pj-index">
      <div className="ph">
        <div>
          <div className="ph-eyebrow">Workspace</div>
          <h1 className="ph-title">Projects</h1>
          <div className="ph-sub">Every regulatory program across all workstreams. Open one to enter its project home.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost" onClick={() => onAsk('Which programs are at risk this week?')}>{I.sparkles} Ask AnA</button>
          <button className="btn primary" onClick={() => setWizardOpen(true)}>{I.plus} New project</button>
        </div>
      </div>

      {/* ── The four metric tiles are one line now (2026-09-07) ──
          "Active programs / Average readiness / Blocked / Filing < 60 days" was
          a dashboard bolted to the top of a directory: four large figures a
          person had to read past to reach the thing they came for, which is
          their project. The figures themselves are unchanged and still honest —
          `kv()` still resolves every one of them to an em dash while the read is
          in flight or has failed, so a failed portfolio read cannot render as a
          real "0%" portfolio mean. They are simply quiet now. */}
      <div className="pj-summary">
        {health.map((h, i) => (
          <span key={i} className="pj-summary-i" data-tone={h.t || undefined}>
            <strong>{h.n}</strong> {h.l.toLowerCase()}{'q' in h && h.q ? `, ${h.q}` : ''}
          </span>
        ))}
      </div>
      <PortfolioPagedNote paged={truncated} settled={!live.loading && !live.error} count={projects.length} />

      <div className="pj-toolbar">
        <div className="pj-search">
          <span className="ico">{I.search}</span>
          <input
            type="search"
            className="pj-search-i"
            placeholder="Search projects"
            value={q}
            onChange={e => setQ(e.target.value)}
            aria-label="Search projects by title or code"
          />
        </div>
        <span style={{ flex: 1 }} />
        <div className="seg">
          <button className={`seg-b${view === 'grid' ? ' on' : ''}`} onClick={() => setView('grid')}>Grid</button>
          <button className={`seg-b${view === 'list' ? ' on' : ''}`} onClick={() => setView('list')}>List</button>
        </div>
      </div>

      <div className="ws-switch" style={{ marginBottom: 8 }}>
        {wss.map(w => <button key={w} className={`ws-btn${ws === w ? ' on' : ''}`} onClick={() => setWs(w)}>{w === 'all' ? 'All workstreams' : w}</button>)}
      </div>

      {statuses.length > 2 && (
        <div className="seg" style={{ marginBottom: 18 }}>
          {statuses.map(s => (
            <button key={s} className={`seg-b${status === s ? ' on' : ''}`} onClick={() => setStatus(s)}>
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      )}

      {live.loading ? (
        <div role="status" className="scaf-note" style={{ padding: '18px 10px' }}>Loading programs…</div>
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
      ) : live.empty ? (
        <EmptyState
          icon={I.folder}
          title="No programs yet"
          hint="Create a regulatory program and it appears here — every workstream across MDX, Biotech, and Pharma."
        />
      ) : list.length === 0 ? (
        <EmptyState
          icon={I.filter}
          title={needle ? `No programs match “${q.trim()}”` : 'No programs match these filters'}
          hint={
            needle
              ? 'Search matches a program’s title or code. Clear the search, or adjust the workstream or status filter.'
              : 'Adjust the workstream or status filter to see more.'
          }
        />
      ) : view === 'grid' ? (
        <div className="pj-cards">
          {list.map(p => (
            <button key={p.id} className="pj-card" onClick={() => openProj(p)}>
              <div className="pj-card-t">{p.title}</div>
              <div className="pj-card-m">{p.code} · {p.stage} · Lead {p.lead}</div>
              {/* No figure draws no bar: an empty track reads as 0. */}
              {isMeasuredReadiness(p.readiness, p.readinessState) ? (
                <div className="ph-bar-track" style={{ margin: '12px 0 6px' }}>
                  <div className="ph-bar-fill" data-tone={p.status === 'blocked' ? 'warn' : 'ok'} style={{ width: p.readiness + '%' }} />
                </div>
              ) : <div style={{ height: 12 }} />}
              <div className="pj-card-r">
                <span title={p.readinessReason ?? DOSSIER_READINESS_MEANS}>{DOSSIER_READINESS_LABEL} {dossierReadinessValue(p.readiness, p.readinessState)}</span><span>{p.due}</span>
              </div>
              <div className="pj-card-f">
                <span className={`rd-chip tone-${WS_TONE[p.ws]}`}>{p.ws}</span>
                <span className={`rd-chip tone-${p.status === 'blocked' ? 'err' : p.status === 'complete' ? 'ok' : 'ai'}`}>{p.status}</span>
                {/* The blocker keeps its own line and its warning tone: it is
                    the one thing on this card that changes what you do next,
                    and colour is not carrying it alone — the icon and the text
                    both say so. */}
                {/* Nothing when no blocker came back: the list does not
                    assess blockers, so "No open blockers" was an all-clear
                    nothing had checked. */}
                {p.blocker && <span className="pj-card-blk">{I.alertTriangle} {p.blocker}</span>}
                {/* A status of blocked with no blocker behind it (NM-512 in the
                    QA organisation, QA 2026-10-08 j1) says so in words. The red
                    chip alone read as a finding with its cause withheld. */}
                {!p.blocker && p.status === 'blocked' && (
                  <span className="pj-card-blk" title={BLOCKED_NO_CAUSE_TITLE}>{I.alertTriangle} {BLOCKED_NO_CAUSE}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="ctable">
          <div className="ct-head" style={{ gridTemplateColumns: '1.6fr 80px 1fr 120px 100px 90px' }}>
            <div>Program</div><div>WS</div><div>Stage / readiness</div><div>Blocker</div><div>Lead</div><div>Due</div>
          </div>
          {list.map(p => (
            <button key={p.id} className="ct-row" style={{ gridTemplateColumns: '1.6fr 80px 1fr 120px 100px 90px' }} onClick={() => openProj(p)}>
              <div>
                <div className="ct-strong">{p.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-300)' }}>{p.code}</div>
              </div>
              <div><span className={`rd-chip tone-${WS_TONE[p.ws]}`}>{p.ws}</span></div>
              <div>
                <div style={{ fontSize: 11.5 }}>{p.stage}</div>
                {isMeasuredReadiness(p.readiness, p.readinessState) && (
                  <div className="ph-bar-track" style={{ marginTop: 5 }}>
                    <div className="ph-bar-fill" data-tone={p.status === 'blocked' ? 'warn' : 'ok'} style={{ width: p.readiness + '%' }} />
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--text-300)', marginTop: 3 }} title={p.readinessReason ?? DOSSIER_READINESS_MEANS}>
                  {DOSSIER_READINESS_LABEL} {dossierReadinessValue(p.readiness, p.readinessState)}
                </div>
              </div>
              <div
                style={{ fontSize: 11, color: p.blocker || p.status === 'blocked' ? 'var(--warning)' : 'var(--text-400)' }}
                title={!p.blocker && p.status === 'blocked' ? BLOCKED_NO_CAUSE_TITLE : undefined}
              >
                {p.blocker ? '1 blocker' : p.status === 'blocked' ? BLOCKED_NO_CAUSE : '—'}
              </div>
              <div style={{ fontSize: 11.5 }}>{p.lead}</div>
              <div style={{ fontSize: 11, color: 'var(--text-300)' }}>{p.due}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default Projects;
