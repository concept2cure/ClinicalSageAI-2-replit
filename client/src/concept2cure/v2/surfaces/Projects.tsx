import React, { useState } from 'react';
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
// The New-Project wizard drives off the global regulatory registry. Import the
// picker + the submission-type lookup DIRECTLY from the modules that own them,
// rather than depending on window globals that another surface may or may not
// have set first (it hadn't — window.RegistryPicker was never assigned, so the
// wizard's first step hung on "Loading registry…" and could never complete).
// Importing RegistryBridge also runs its side effects, which populate the
// window.GLOBAL_REGISTRY / REG_SEGMENTS that RegistryPicker reads.
import { RegistryPicker } from './AnaVerbs';
import { getSubmissionTypeContext } from './RegistryBridge';
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

/** Exported for the failure-path test: the wizard's error surface is an
 *  acceptance criterion in its own right (a failed write must be visible and
 *  must offer a way out), and driving it through the whole Projects surface
 *  would test the registry loader rather than the banner. */
export function NewProjectWizard({ onClose, onNav }: { onClose: () => void; onNav: (id: string) => void }) {
  const dialogRef = useDialog(onClose);
  const [step, setStep] = useState(0);
  const [tpl, setTpl] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [product, setProduct] = useState('');
  const [ta, setTa] = useState('onc_general');
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

  const uiSeg = (typeof window !== 'undefined' && window.__C2C_SEGMENT) || 'biotech';
  const regSeg = SEG2REG[uiSeg];
  const segLabel = SEG_LABELS[uiSeg] || uiSeg;
  const ctx = tpl ? getSubmissionTypeContext(tpl) : null;
  const selTpl: SelTpl | null = ctx
    ? { ...ctx, label: ctx.displayName, pathway: ctx.pathwayKey || 'ctd' }
    : null;

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
      indication: taLabel,
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
    <div className="esign-bd" onClick={onClose}>
      {/* `useDialog` is the v2 modal primitive that was already in this
          directory and that this wizard never used: it focuses the panel on
          open, closes on Escape, and hands focus back to the opener on unmount.
          Without it the wizard was a plain div — no keyboard exit, no focus
          hand-off, no dialog semantics — which is the surface a failed create
          now has to announce into. Not a full focus trap; Tab can still leave
          the panel, and closing that is a shared-modal change, not this task's. */}
      <div
        ref={dialogRef}
        className="esign-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-project-title"
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
        style={{ width: 880, maxWidth: '94vw', maxHeight: '90vh', overflow: 'auto' }}
      >
        {/* Header */}
        <div className="esign-h" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
          <span className="ico" style={{ fontSize: 18 }}>{I.plus}</span>
          <div style={{ flex: 1 }}>
            <span className="t" id="new-project-title" style={{ fontSize: 15 }}>New project</span>
            <div style={{ fontSize: 11, color: 'var(--text-300)', marginTop: 2 }}>
              Step {step + 1} of 3 — {['Choose template', 'Configure project', 'Review & create'][step]}
            </div>
          </div>
          {/* The icon is aria-hidden, so without this label the control had no
              accessible name at all. */}
          <button className="tbtn" onClick={onClose} aria-label="Close">{I.close}</button>
        </div>

        {/* Step indicators */}
        <div style={{ display: 'flex', gap: 4, padding: '12px 20px 8px' }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? 'var(--accent-200)' : 'var(--bg-300)', transition: 'background 0.2s' }} />
          ))}
        </div>

        <div style={{ padding: '8px 20px 20px' }}>
          {/* Step 0: Choose template */}
          {step === 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 13px', marginBottom: 12, borderRadius: 8, background: 'var(--accent-000)', border: '1px solid var(--accent-muted)' }}>
                <span className="ico" style={{ fontSize: 15, color: 'var(--accent-200)' }}>{I.sparkles}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-100)' }}>Tailored for {segLabel}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-300)' }}>Showing the filing types that fit your client type. Switch the tab to browse other segments.</div>
                </div>
              </div>
              <div style={{ maxHeight: 440, overflowY: 'auto' }}>
                <RegistryPicker value={tpl ?? ''} onChange={(id) => setTpl(id)} initialSegment={regSeg || undefined} />
              </div>
            </div>
          )}

          {/* Step 1: Configure */}
          {step === 1 && selTpl && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Configure your {selTpl.label} project</div>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text-300)' }}>Project name</span>
                <input value={name} onChange={e => setName(e.target.value)}
                  placeholder={`e.g. ${selTpl.id === '510k' ? 'Aurora CGM — 510(k)' : 'BX-204 — ' + selTpl.label}`}
                  style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-control)', background: 'var(--bg-100)', fontSize: 13 }} />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text-300)' }}>Product name</span>
                <input value={product} onChange={e => setProduct(e.target.value)} placeholder="e.g. BX-204"
                  style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-control)', background: 'var(--bg-100)', fontSize: 13 }} />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text-300)' }}>Therapeutic area</span>
                <select value={ta} onChange={e => setTa(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-control)', background: 'var(--bg-100)', fontSize: 13 }}>
                  {taGroups.map(g => {
                    const items = taList.filter(t => t.group === g.id);
                    return items.length
                      ? <optgroup key={g.id} label={g.label}>{items.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</optgroup>
                      : null;
                  })}
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text-300)' }}>Target submission date</span>
                <input type="date" value={target} onChange={e => setTarget(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-control)', background: 'var(--bg-100)', fontSize: 13 }} />
              </label>

              <div>
                <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text-300)', display: 'block', marginBottom: 6 }}>Team members</span>
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
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Review & create</div>
              <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '10px 16px', fontSize: 12.5, padding: 16, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-100)' }}>
                <span style={{ color: 'var(--text-300)', fontWeight: 500 }}>Filing type</span>
                <span style={{ fontWeight: 500 }}>{selTpl.label}</span>
                {selTpl.agency && <>
                  <span style={{ color: 'var(--text-300)', fontWeight: 500 }}>Agency / Region</span>
                  <span>{selTpl.agency} · {selTpl.region}</span>
                </>}
                {selTpl.dossierStandard && selTpl.dossierStandard !== '—' && <>
                  <span style={{ color: 'var(--text-300)', fontWeight: 500 }}>Dossier</span>
                  <span>{selTpl.dossierStandard}{selTpl.ctdModule && selTpl.ctdModule !== '—' ? ' · ' + selTpl.ctdModule : ''}</span>
                </>}
                <span style={{ color: 'var(--text-300)', fontWeight: 500 }}>Project name</span>
                <span>{name || '(unnamed)'}</span>
                <span style={{ color: 'var(--text-300)', fontWeight: 500 }}>Product</span>
                <span>{product || '—'}</span>
                <span style={{ color: 'var(--text-300)', fontWeight: 500 }}>Therapeutic area</span>
                <span>{taList.find(t => t.id === ta)?.label || ta}</span>
                <span style={{ color: 'var(--text-300)', fontWeight: 500 }}>Target date</span>
                <span>{target || 'Not set'}</span>
                <span style={{ color: 'var(--text-300)', fontWeight: 500 }}>Pathway</span>
                <span>{(selTpl.pathway || '').toUpperCase()}{selTpl.submissionFormat && selTpl.submissionFormat !== '—' ? ' — ' + selTpl.submissionFormat : ''}</span>
                <span style={{ color: 'var(--text-300)', fontWeight: 500 }}>Workstream</span>
                {/* Both lines are derived exactly as the create call derives
                    them, so the review step shows what will actually persist.
                    They were read off the UI segment before, which is why this
                    pane said "Workstream: Biotech / Recorded as: 510K · biologic"
                    for a device filing — and then stored it. */}
                <span>{workstreamForFilingType(programTypeFor(selTpl, uiSeg)) ?? SEG2WS[uiSeg] ?? 'Biotech'}</span>
                <span style={{ color: 'var(--text-300)', fontWeight: 500 }}>Recorded as</span>
                <span>{programTypeFor(selTpl, uiSeg).toUpperCase().replace(/_/g, ' ')} · {productTypeForSelection(programTypeFor(selTpl, uiSeg), uiSeg)}</span>
              </div>

              <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 6, background: 'color-mix(in srgb,var(--success) 8%,transparent)', border: '1px solid var(--success)', fontSize: 11.5, display: 'flex', gap: 8, alignItems: 'center' }}>
                {I.sparkles}<span>Your project is saved to the portfolio and opens in its workspace, where you can add documents and author sections with AnA.</span>
              </div>
            </div>
          )}
        </div>

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
          <div style={{ margin: '0 20px' }}>
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
        )}

        {/* Footer */}
        <div className="esign-f" style={{ borderTop: '1px solid var(--border)', padding: '12px 20px' }}>
          {step > 0 && <button className="btn ghost" style={{ flex: 0 }} onClick={() => setStep(s => s - 1)}>Back</button>}
          <span style={{ flex: 1 }} />
          {step < 2 && <button className="btn primary" disabled={step === 0 && !tpl} onClick={() => setStep(s => s + 1)}>Continue</button>}
          {step === 2 && <button className="btn primary" disabled={creating} onClick={doCreate}>
            {creating ? 'Creating project...' : <>{I.plus} Create project</>}
          </button>}
        </div>
      </div>
    </div>
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
  const health = [
    { l: 'Active programs', n: String(projects.length), m: 'across MDX, Biotech, Pharma', t: '' },
    { l: 'Average readiness', n: Math.round(projects.reduce((s, p) => s + p.readiness, 0) / (projects.length || 1)) + '%', m: 'portfolio mean', t: '' },
    { l: 'Blocked', n: String(projects.filter(p => p.status === 'blocked').length), m: 'need attention', t: 'err' },
    { l: 'Filing < 60 days', n: String(projects.filter(p => /days/.test(p.due)).length), m: 'near-term submissions', t: 'warn' },
  ];
  const wss = ['all', 'MDX', 'Biotech', 'Pharma'];

  const openProj = (pr: ProjPortfolioEntry) => {
    try {
      publishShellProject({ id: pr.id, title: pr.title, code: pr.code, ws: pr.ws, status: pr.status });
      if (window.C2C?.setSurface) window.C2C.setSurface('project-home', pr.title);
    } catch (_) { /* noop */ }
    onNav('project-home');
  };

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

      {wizardOpen && <NewProjectWizard onClose={() => setWizardOpen(false)} onNav={onNav} />}

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
        <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading programs…</div>
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
