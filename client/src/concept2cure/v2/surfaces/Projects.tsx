import React, { useEffect, useMemo, useState } from 'react';
import { I } from '../icons';
import { useLiveRows, EmptyState, ErrorState } from '../dataConnect';
import { apiRequest, ApiRequestError } from '@/lib/queryClient';
import { useDialog } from '../useDialog';
import {
  productTypeForFilingType,
  workstreamForFilingType,
} from '@shared/constants/domain/product-types';
import type { SurfaceViewProps } from '../surfaceViews';
import { publishShellProject } from '../shellProject';
import { notifySurfaceActionReady, useSurfaceActionHandlers } from '../surfaceActions';
import { usePublishSurfaceContext } from '../surfaceContext';
// The New-Project wizard drives off the global regulatory registry. Import the
// picker + the submission-type lookup DIRECTLY from the modules that own them,
// rather than depending on window globals that another surface may or may not
// have set first (it hadn't — window.RegistryPicker was never assigned, so the
// wizard's first step hung on "Loading registry…" and could never complete).
// Importing RegistryBridge also runs its side effects, which populate the
// window.GLOBAL_REGISTRY / REG_SEGMENTS that RegistryPicker reads.
import { RegistryPicker } from './AnaVerbs';
import { getSubmissionTypeContext } from './RegistryBridge';
import {
  DEVICE_CLASSES, DEVICE_FLAGS, REVIEW_PANELS,
  usesDeviceClassification, type DeviceFlagId,
} from '../../../../../shared/constants/domain/device-classification';
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

/**
 * UI segment → the product class the lane implies.
 *
 * This map used to be sent to the server AS `productType`, which is how a
 * 510(k) came to be recorded as a biologic: the wizard opens on the Pharma &
 * Biotech tab by default, `SEG2PRODUCT['biotech']` is `'biologic'`, and that
 * value was submitted explicitly — overriding the server's own correct
 * derivation from the filing type. The review step rendered what it sent:
 * `510K · biologic`.
 *
 * The product class now comes from the FILING TYPE
 * (`productTypeForFilingType`, shared with the server so the two cannot drift).
 * The lane survives only as a REFINEMENT within the device family — a 510(k)
 * started from the Diagnostics lane is an IVD 510(k) — which is a real signal
 * and the only one available at creation time. It can no longer make a device
 * filing medicinal.
 */
const SEG2PRODUCT: Record<string, string> = {
  biotech: 'biologic', pharma: 'drug', medtech: 'device',
  diagnostics: 'ivd', cro: 'drug', health: 'biologic',
};

/**
 * The product class this wizard will persist: the filing type decides, the lane
 * refines within the device family, and the lane's own default applies only to
 * a filing type the shared vocabulary cannot classify.
 */
function productTypeForSelection(programType: string, uiSeg: string): string {
  return productTypeForFilingType(programType, uiSeg) ?? SEG2PRODUCT[uiSeg] ?? 'drug';
}

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

/* ── Therapeutic areas — the create form's indication axis (self-contained) ── */
const TA_GROUPS: { id: string; label: string }[] = [
  { id: 'onc', label: 'Oncology' },
  { id: 'neuro', label: 'Neurology & Neuromuscular' },
  { id: 'immuno', label: 'Immunology & Inflammation' },
  { id: 'cardio', label: 'Cardiovascular & Metabolic' },
  { id: 'id', label: 'Infectious Disease & Vaccines' },
  { id: 'rare', label: 'Rare & Genetic Disease' },
  { id: 'resp', label: 'Respiratory' },
  { id: 'other', label: 'Other' },
];
const TA_LIST: { id: string; label: string; group: string }[] = [
  { id: 'onc_solid', label: 'Solid tumors', group: 'onc' },
  { id: 'onc_heme', label: 'Hematologic malignancies', group: 'onc' },
  { id: 'onc_general', label: 'Oncology (general)', group: 'onc' },
  { id: 'neuro_cns', label: 'CNS / neurodegeneration', group: 'neuro' },
  { id: 'neuro_nmj', label: 'Neuromuscular', group: 'neuro' },
  { id: 'immuno_rheum', label: 'Rheumatology / autoimmune', group: 'immuno' },
  { id: 'immuno_derm', label: 'Dermatology / inflammation', group: 'immuno' },
  { id: 'cardio_hf', label: 'Heart failure / cardiology', group: 'cardio' },
  { id: 'cardio_metab', label: 'Metabolic / endocrine', group: 'cardio' },
  { id: 'id_vaccine', label: 'Vaccines', group: 'id' },
  { id: 'id_amr', label: 'Anti-infectives', group: 'id' },
  { id: 'rare_genetic', label: 'Rare genetic disease', group: 'rare' },
  { id: 'resp_obstructive', label: 'COPD / asthma', group: 'resp' },
  { id: 'other_unspec', label: 'Other / not specified', group: 'other' },
];

/** Map a chosen registry template + segment → a canonical program_type the
 *  backend accepts (server VALID_PROGRAM_TYPES) and WS_CASE buckets. */
export function programTypeFor(sel: SelTpl | null, uiSeg: string): string {
  const id = (sel?.id ?? '').toLowerCase();
  const pw = (sel?.pathway ?? '').toLowerCase();
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
  // cta_hc, cta_nmpa, ctn_au and ctn_jp reach this line too. There is still no
  // cta pack for hc / nmpa / tga / pmda, so resolveDocumentClass produces
  // (cta, hc), no c2c_rule_packs row satisfies it, and the scaffold declines with
  // NO_RULE_PACK. That is deliberate: declining is honest, filing a Canadian
  // trial application as a US marketing application is not. They become sellable
  // when those four packs exist, and nothing else has to change here.
  if (id === 'eu_cta' || pw === 'cta') return 'cta';
  // 'device' and 'ivd' are accepted by the API (projects.ts VALID_PROGRAM_TYPES)
  // and deliberately UNMAPPED in PROGRAM_TO_DOC_TYPE, so they fail closed: the
  // project is created and no document is scaffolded. That is the intended
  // outcome for a filing whose pathway is genuinely ambiguous — an EU MDR Class
  // IIb technical file is not a 510(k), a De Novo, a PMA or an IDE, and this
  // product cannot yet tell which. 33 registry rows previously fell past these
  // lines into `pw === 'ctd'` and were filed as US NDAs instead.
  //
  // Reaching here therefore produces an empty Vault, which is only honest if the
  // customer is TOLD. The wizard surfaces meta.scaffoldSkipped for exactly that
  // reason; the two changes are not separable.
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

/** The three steps, in order. One list, read by the step rail, the sub-heading
 *  and the bounds checks below, so a step cannot be renamed in one place and
 *  stay stale in another. */
const STEP_LABELS = ['Choose filing type', 'Configure project', 'Review & create'] as const;

/** Exported for the failure-path test: the wizard's error surface is an
 *  acceptance criterion in its own right (a failed write must be visible and
 *  must offer a way out), and driving it through the whole Projects surface
 *  would test the registry loader rather than the banner. */
export function NewProjectWizard({ onClose, onNav, segment }: { onClose: () => void; onNav: (id: string) => void; segment?: string }) {
  /* `useDialog` on something that is deliberately not a dialog, and on purpose.
     The hook sets no ARIA of its own — it is three keyboard behaviours: focus
     the container on mount, call onClose on Escape, hand focus back to the
     opener on unmount. All three are exactly as required of a full-canvas view
     that replaces the portfolio and must give the keyboard back when it leaves.
     Writing a second hook with the same body so this one could be named
     differently would be the duplication, not the reuse. The dialog SEMANTICS
     — role, aria-modal — are what this view drops, and those live in the JSX
     below, not in here. */
  const viewRef = useDialog(onClose);
  const [step, setStep] = useState(0);
  const [tpl, setTpl] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [product, setProduct] = useState('');
  const [ta, setTa] = useState('onc_general');
  /* The device taxonomy. Step 2 offered a therapeutic-area dropdown and nothing
     else — an oncology / vaccines list, defaulting to "Oncology (general)",
     shown to someone filing a peak flow meter. These are the fields a device
     reviewer opens the file to find. */
  const [productCode, setProductCode] = useState('');
  const [regulationNumber, setRegulationNumber] = useState('');
  const [deviceClass, setDeviceClass] = useState('');
  const [reviewPanel, setReviewPanel] = useState('');
  const [predicateK, setPredicateK] = useState('');
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
    { kind: 'error' | 'notice'; message: string; correlationId?: string } | null
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
  /* From the FILING TYPE, not the lane: a 510(k) picked from any tab is a
     device filing, and a pharma filing picked from the device tab is not. */
  const isDeviceFiling = usesDeviceClassification(
    productTypeForSelection(programTypeFor(selTpl, uiSeg), uiSeg),
  );

  // Persist a real regulatory program (POST /api/c2c/projects → regulatory_programs)
  // then navigate into it using the id the store assigns. On failure we surface
  // the error instead of pretending the project was created.
  const doCreate = async () => {
    setCreating(true);
    setOutcome(null);
    const taLabel = TA_LIST.find(t => t.id === ta)?.label ?? null;
    const body = {
      name: name || selTpl?.label || 'New project',
      productName: product || name || (selTpl?.label ?? ''),
      programType: programTypeFor(selTpl, uiSeg),
      productType: productTypeForSelection(programTypeFor(selTpl, uiSeg), uiSeg),
      primaryAgency: selTpl?.agency || 'FDA',
      submissionTypeId: selTpl?.id,
      indication: isDeviceFiling ? (intendedUse || undefined) : taLabel,
      ...(isDeviceFiling
        ? {
            deviceClassification: {
              productCode, regulationNumber, deviceClass,
              reviewPanel, predicateK, intendedUse,
              flags: deviceFlags,
            },
          }
        : {}),
      targetSubmissionDate: target || null,
      teamMembers: team,
    };
    try {
      const res = await apiRequest('POST', '/api/c2c/projects', body);
      // apiRequest throws on every non-2xx EXCEPT 401, which it returns so the
      // caller can decide. So this branch is the session case, and only that.
      if (!res.ok) {
        fail('Your session has expired. Sign in again to create this project.');
        setCreating(false);
        return;
      }
      const j = await res.json();

      // The server tells us when it created the project but declined to scaffold
      // a governed document — POST /api/c2c/projects puts scaffoldSkipped and
      // scaffoldDetail in the 201's `meta`. Nothing read it. The project was
      // created, the wizard closed, and the customer arrived at a permanently
      // empty Vault with no indication that anything had been declined.
      //
      // That silence is what made the fail-closed design dishonest in practice.
      // Declining to guess a pathway is right — filing an EU MDR Class IIb
      // technical file as a US NDA is worse than filing nothing — but only if
      // the customer is told which of the two happened. Surfacing it is the
      // other half of routing those 33 registry rows to their true program type.
      const skipped = j?.meta?.scaffoldSkipped as string | undefined;
      if (skipped) {
        const detail = typeof j?.meta?.scaffoldDetail === 'string' ? j.meta.scaffoldDetail : '';
        // `detail` (from services/c2c/scaffold-project-documents.ts) already
        // ends by restating that the project was created and nothing was
        // scaffolded, so leading with our own sentence said the same thing
        // twice — two systems' text concatenated without editing. Keep our
        // sentence only for the skip that carries no detail.
        setOutcome({
          kind: 'notice',
          message: (
            detail
              ? `${detail} You can add documents manually, or pick a filing type with a defined pathway.`
              : 'Project created, but no submission dossier was started. You can add documents ' +
                'manually, or pick a filing type with a defined pathway.'
          ).replace(/\s+/g, ' '),
        });
        setCreating(false);
        // Deliberately NOT navigating away. The project exists and is listed;
        // dropping the user into an empty Vault is how this went unnoticed.
        return;
      }

      const created = (j?.data ?? {}) as Partial<ProjPortfolioEntry> & { id?: string };
      try {
        publishShellProject({
          id: created.id || 'new',
          title: created.title || body.name,
          product: body.productName,
          code: created.code || '',
          ws: created.ws || SEG2WS[uiSeg] || 'Biotech',
          status: created.status || 'active',
        });
      } catch { /* noop */ }
      onClose();
      onNav('project-home');
    } catch (e) {
      // ONLY an ApiRequestError's message is safe to render: apiRequest has
      // reduced that one through `extractApiError`, so it is never the raw enum
      // and never driver text. Any other throw here is a browser-native
      // TypeError from fetch itself — "Failed to fetch", "Load failed",
      // "NetworkError when attempting to fetch resource" — which carries a
      // non-empty `.message` and would sail past a bare `e instanceof Error`
      // check straight onto the screen. That is engineer text in a regulated
      // UI, arriving by a path the server-envelope filter cannot see.
      const known = e instanceof ApiRequestError;
      fail(
        known && e.message
          ? e.message
          : 'The project could not be created. Check your connection and try again.',
        known ? e.correlationId : undefined,
      );
      setCreating(false);
    }
  };

  const taGroups = TA_GROUPS;
  const taList = TA_LIST;

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
        <button type="button" className="pd-crumb-back" onClick={onClose}>
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
                disabled={i > step}
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
                initialSegment={regSeg || undefined}
                onSegmentChange={(next) => setTabSeg(REG2SEG[next] ?? arrivedSeg)}
              />
            </div>
          )}

          {/* Step 1: Configure */}
          {step === 1 && selTpl && (
            <div className="npw-form">
              <h2 className="npw-h2">Configure your {selTpl.label} project</h2>

              <div className="npw-fields">
                <label className="npw-field">
                  <span className="npw-field-l">Project name</span>
                  <input
                    className="c2c-input"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder={`e.g. ${selTpl.id === '510k' ? 'Aurora CGM — 510(k)' : 'BX-204 — ' + selTpl.label}`}
                  />
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
                {isDeviceFiling ? (
                  <label className="npw-field">
                    <span className="npw-field-l">Device class</span>
                    <select
                      className="c2c-input"
                      value={deviceClass}
                      onChange={e => setDeviceClass(e.target.value)}
                    >
                      <option value="">Not yet determined</option>
                      {DEVICE_CLASSES.map(c => (
                        <option key={c} value={c}>Class {c}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className="npw-field">
                    <span className="npw-field-l">Therapeutic area</span>
                    <select className="c2c-input" value={ta} onChange={e => setTa(e.target.value)}>
                      {taGroups.map(g => {
                        const items = taList.filter(t => t.group === g.id);
                        return items.length
                          ? <optgroup key={g.id} label={g.label}>{items.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</optgroup>
                          : null;
                      })}
                    </select>
                  </label>
                )}

                <label className="npw-field">
                  <span className="npw-field-l">Target submission date</span>
                  <input className="c2c-input" type="date" value={target} onChange={e => setTarget(e.target.value)} />
                </label>
              </div>

              {isDeviceFiling && (
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
                    <span className="npw-field-l">Predicate device</span>
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
                </div>
              )}

              {isDeviceFiling && (
                <>
                  <div className="npw-field npw-field-wide">
                    <span className="npw-field-l">Indications for use</span>
                    <textarea
                      className="c2c-input"
                      rows={3}
                      value={intendedUse}
                      onChange={e => setIntendedUse(e.target.value)}
                      placeholder="The statement that will appear on FDA Form 3881."
                    />
                  </div>

                  <fieldset className="npw-field npw-field-wide npw-flags">
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
                  </fieldset>
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
                  <dd>{name || '(unnamed)'}</dd>
                </div>
                <div className="npw-review-row">
                  <dt>Product</dt>
                  <dd>{product || '—'}</dd>
                </div>
                <div className="npw-review-row">
                  <dt>Therapeutic area</dt>
                  <dd>{taList.find(t => t.id === ta)?.label || ta}</dd>
                </div>
                <div className="npw-review-row">
                  <dt>Target date</dt>
                  <dd>{target || 'Not set'}</dd>
                </div>
                <div className="npw-review-row">
                  <dt>Pathway</dt>
                  <dd>{(selTpl.pathway || '').toUpperCase()}{selTpl.submissionFormat && selTpl.submissionFormat !== '—' ? ' — ' + selTpl.submissionFormat : ''}</dd>
                </div>
                {/* Both lines are derived exactly as the create call derives
                    them, so the review step shows what will actually persist.
                    They were read off the UI segment before, which is why this
                    pane said "Workstream: Biotech / Recorded as: 510K · biologic"
                    for a device filing — and then stored it. */}
                <div className="npw-review-row">
                  <dt>Workstream</dt>
                  <dd>{workstreamForFilingType(programTypeFor(selTpl, uiSeg)) ?? SEG2WS[uiSeg] ?? 'Biotech'}</dd>
                </div>
                <div className="npw-review-row">
                  <dt>Recorded as</dt>
                  <dd>{programTypeFor(selTpl, uiSeg).toUpperCase().replace(/_/g, ' ')} · {productTypeForSelection(programTypeFor(selTpl, uiSeg), uiSeg)}</dd>
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
                          productCode && `Product code ${productCode}`,
                          regulationNumber && `21 CFR ${regulationNumber}`,
                          deviceClass && `Class ${deviceClass}`,
                          reviewPanel,
                        ].filter(Boolean).join(' · ') || 'Not recorded'}
                      </dd>
                    </div>
                    <div className="npw-review-row">
                      <dt>Predicate</dt>
                      <dd>{predicateK || 'Not recorded'}</dd>
                    </div>
                    {deviceFlags.length > 0 && (
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
                title="The project was not created"
                message={outcome.message}
                correlationId={outcome.correlationId}
                retry={doCreate}
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
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          {step > 0 && <button type="button" className="btn ghost" onClick={() => setStep(s => s - 1)}>Back</button>}
          <span className="npw-foot-gap" />
          {step < 2 && (
            <button type="button" className="btn primary" disabled={step === 0 && !tpl} onClick={() => setStep(s => s + 1)}>
              Continue
            </button>
          )}
          {step === 2 && (
            <button type="button" className="btn primary" disabled={creating} onClick={doCreate}>
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
 * column (progress_percent → readiness, phase → stage, target_submission_date →
 * due, lead_user_id → lead). `blocker` is in the projection but the list query
 * returns it as a literal NULL — no blocker is computed at list level — so it is
 * typed nullable and rendered null-safe, never fabricated.
 */
interface ProjPortfolioEntry {
  id: string;
  title: string;
  ws: string;
  code: string;
  stage: string;
  readiness: number;
  status: string;
  lead: string;
  blocker: string | null;
  due: string;
  activity: string;
}

/** Workstream → chip tone (presentation config, not data). */
const WS_TONE: Record<string, string> = { MDX: 'ai', Biotech: 'ok', Pharma: 'warn', CRO: 'idle' };

export function Projects({ onAsk, onNav, segment }: SurfaceViewProps) {
  const [ws, setWs] = useState('all');
  const [status, setStatus] = useState('all');
  const [view, setView] = useState('grid');
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

  const list = projects.filter(p => (ws === 'all' || p.ws === ws) && (status === 'all' || p.status === status));
  /* Gated on the read, not just on the row count.
     `projects` is empty while the portfolio read is in flight AND when it has
     failed, so every figure here resolved to a settled 0 — and the `|| 1`
     divisor turned what would at least have been a visible NaN into a clean
     "0%", a portfolio-mean readiness computed over no programs. A director
     reading the header learned they run nothing and have nothing blocked. */
  const kv = (v: string) => (live.loading || live.error ? '—' : v);
  const health = [
    { l: 'Active programs', n: kv(String(projects.length)), m: 'across MDX, Biotech, Pharma', t: '' },
    { l: 'Average readiness', n: kv(Math.round(projects.reduce((s, p) => s + p.readiness, 0) / (projects.length || 1)) + '%'), m: 'portfolio mean', t: '' },
    { l: 'Blocked', n: kv(String(projects.filter(p => p.status === 'blocked').length)), m: 'need attention', t: 'err' },
    { l: 'Filing < 60 days', n: kv(String(projects.filter(p => /days/.test(p.due)).length)), m: 'near-term submissions', t: 'warn' },
  ];
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
    const blocked = projects.filter(p => p.status === 'blocked');
    const filtered = ws !== 'all' || status !== 'all';
    return {
      summary:
        `Projects portfolio: ${projects.length} regulatory program(s)` +
        (filtered ? `, filtered to ${list.length} by workstream "${ws}" and status "${status}"` : '') +
        `. ${blocked.length} blocked, average readiness ${health[1].n}. Shown as a ${view}.`,
      facts: {
        totalPrograms: projects.length,
        shownInList: list.length,
        workstreamFilter: ws,
        statusFilter: status,
        blockedCount: blocked.length,
        averageReadiness: health[1].n,
        // Enough to name a programme back to the user, not the whole row set.
        // `p.lead` is deliberately NOT published: the server projects it as
        // COALESCE(u.name, u.email, '—'), so a lead with no name set resolves to
        // an EMAIL — PII that must not enter the model prompt. It stays on the
        // card (where the person reads it); the sibling ProjectHome publisher
        // drops the team member's email for the same reason.
        programs: list.slice(0, 12).map(p => ({
          id: p.id, code: p.code, title: p.title, workstream: p.ws, stage: p.stage,
          status: p.status, readiness: p.readiness, due: p.due,
          blocker: p.blocker ?? null,
        })),
      },
      availableActions: [
        'Open a program to enter its project home',
        'Filter the portfolio by workstream (MDX, Biotech, Pharma) or by status',
        'Switch between the grid and list views',
        'Create a new project through the new-project wizard',
      ],
    };
  }, [wizardOpen, live.loading, live.error, projects, list, ws, status, view, health]);
  usePublishSurfaceContext('projects', anaContext);

  const openProj = (pr: ProjPortfolioEntry) => {
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
  const wizardGuard = () =>
    wizardOpen ? { ok: false as const, reason: 'The new-project wizard is open — close it first.' } : null;
  useSurfaceActionHandlers('projects', {
    'projects.open-program': (params) => {
      const guarded = wizardGuard();
      if (guarded) return guarded;
      const wanted = (params.program ?? '').trim().toLowerCase();
      if (!wanted) return { ok: false, reason: 'No program named.' };
      // Not-ready, not failed: the bus holds the directive and re-attempts on
      // this surface's ready signal below — the navigate→act gap.
      if (live.loading)
        return { ok: false, reason: 'The portfolio is still loading.', retry: true };
      if (live.error) return { ok: false, reason: 'The portfolio could not be read.' };
      const exact = projects.find(
        (p) => p.code.toLowerCase() === wanted || p.title.toLowerCase() === wanted,
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
              ? `"${params.program}" matches ${contains.length} programs — name one exactly.`
              : `No program named "${params.program}" in this portfolio.`,
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

      <div className="metrics">
        {health.map((h, i) => (
          <div key={i} className="metric" data-tone={h.t || undefined}>
            <div className="metric-l">{h.l}</div>
            <div className="metric-n">{h.n}</div>
            <div className="dmod-chip" style={{ marginTop: 6, background: 'transparent', padding: 0, color: 'var(--text-300)' }}>{h.m}</div>
          </div>
        ))}
      </div>

      <div className="ws-switch" style={{ marginBottom: 8 }}>
        {wss.map(w => <button key={w} className={`ws-btn${ws === w ? ' on' : ''}`} onClick={() => setWs(w)}>{w === 'all' ? 'All workstreams' : w}</button>)}
        <span style={{ flex: 1 }} />
        <div className="seg">
          <button className={`seg-b${view === 'grid' ? ' on' : ''}`} onClick={() => setView('grid')}>Grid</button>
          <button className={`seg-b${view === 'list' ? ' on' : ''}`} onClick={() => setView('list')}>List</button>
        </div>
      </div>

      <div className="seg" style={{ marginBottom: 18 }}>
        {(['all', 'active', 'blocked', 'complete'] as const).map(s => (
          <button key={s} className={`seg-b${status === s ? ' on' : ''}`} onClick={() => setStatus(s)}>
            {s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

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
          title="No programs match these filters"
          hint="Adjust the workstream or status filter to see more."
        />
      ) : view === 'grid' ? (
        <div className="launch-grid">
          {list.map(p => (
            <button key={p.id} className="launch" onClick={() => openProj(p)}>
              <div className="launch-top">
                <span className={`rd-chip tone-${WS_TONE[p.ws]}`}>{p.ws}</span>
                <span className={`rd-chip tone-${p.status === 'blocked' ? 'err' : p.status === 'complete' ? 'ok' : 'ai'}`}>{p.status}</span>
              </div>
              <div className="launch-title">{p.title}</div>
              <div className="launch-desc">{p.code} · {p.stage} · Lead {p.lead}</div>
              <div className="ph-bar-track" style={{ margin: '12px 0 6px' }}>
                <div className="ph-bar-fill" data-tone={p.status === 'blocked' ? 'warn' : 'ok'} style={{ width: p.readiness + '%' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-300)' }}>
                <span>{p.readiness}% ready</span><span>{p.due}</span>
              </div>
              {p.blocker
                ? <div className="ed-flag" data-sev="warn" style={{ marginTop: 10 }}><span className="ico">{I.alertTriangle}</span><span>{p.blocker}</span></div>
                : <div style={{ marginTop: 10, fontSize: 11, color: 'var(--success)', display: 'flex', gap: 6, alignItems: 'center' }}>{I.check} No open blockers</div>}
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
                <div className="ph-bar-track" style={{ marginTop: 5 }}>
                  <div className="ph-bar-fill" data-tone={p.status === 'blocked' ? 'warn' : 'ok'} style={{ width: p.readiness + '%' }} />
                </div>
              </div>
              <div style={{ fontSize: 11, color: p.blocker ? 'var(--warning)' : 'var(--text-400)' }}>{p.blocker ? '1 blocker' : '—'}</div>
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
