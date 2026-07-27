/**
 * Governed industry profile card — the real, persisted setting that presets the
 * one self-tailoring workspace.
 *
 * This replaces the "Client type" row that lived in the Setup panel's
 * localStorage state. That row claimed to drive "default templates, pathways, and
 * the AnA context across every project" while writing to one browser: two users
 * in the same organization would get different study menus for the same study,
 * and nothing recorded who changed it or why. Here every read and write goes to
 * /api/admin/industry-profile, which is tenant-scoped, role-gated and audited.
 *
 * It adds no navigation. It changes what the existing modules offer inside
 * themselves — which study archetypes the Study Design Center lists, which filing
 * types a new project can choose, and the nouns the shell uses.
 *
 * @module client/src/concept2cure/v2/surfaces/IndustryProfileCard
 */

import React, { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { I } from '../icons';

const PRIMARY_INDUSTRIES: Array<{ id: string; label: string }> = [
  { id: 'medical_device_diagnostics', label: 'Medical Device and Diagnostics' },
  { id: 'biotech_pharma', label: 'Biotech and Pharma' },
  { id: 'cro', label: 'CRO' },
  { id: 'regulatory_consulting', label: 'Regulatory Consulting' },
  { id: 'academic_research', label: 'Academic / Research' },
];

const SPECIALIZATIONS: Array<{ id: string; label: string }> = [
  { id: 'medical_device', label: 'Medical Device' },
  { id: 'ivd_diagnostics', label: 'IVD / Diagnostics' },
  { id: 'medical_device_and_ivd', label: 'Medical Device and IVD' },
  { id: 'software_as_medical_device', label: 'Software as a Medical Device' },
  { id: 'companion_diagnostic', label: 'Companion Diagnostic' },
  { id: 'combination_product', label: 'Combination Product' },
  { id: 'unspecified', label: 'Not yet specified' },
];

const MARKETS: Array<{ id: string; label: string }> = [
  { id: 'us', label: 'U.S.' },
  { id: 'eu', label: 'EU' },
  { id: 'ca', label: 'Canada' },
  { id: 'jp', label: 'Japan' },
  { id: 'uk', label: 'UK' },
  { id: 'au', label: 'Australia' },
];

interface Profile {
  primaryIndustry: string;
  mdxSpecialization: string;
  defaultMarkets: string[];
  defaultPathways: string[];
  defaultApprovalRigor: string;
  effectiveAt: string | null;
  changeReason: string | null;
  updatedAt: string | null;
}

interface Effective {
  vertical: string;
  verticalSource: string;
  specialization: string;
  specializationSource: string;
  studyTypes: string[];
  filingTypes: string[];
  terminology: Record<string, string>;
  needsDeclaration: string[];
}

/** MDX specialization is only meaningful for a vertical that reaches MDX. */
const SPECIALIZATION_APPLIES = new Set([
  'medical_device_diagnostics', 'cro', 'regulatory_consulting', 'academic_research',
]);

export function IndustryProfileCard() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [effective, setEffective] = useState<Effective | null>(null);
  const [draft, setDraft] = useState<Partial<Profile>>({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [pRes, eRes] = await Promise.all([
        apiRequest('GET', '/api/admin/industry-profile'),
        apiRequest('GET', '/api/admin/industry-profile/effective'),
      ]);
      const pBody = await pRes.json().catch(() => null);
      if (pRes.ok) {
        setProfile(pBody?.data ?? null);
        setConfigured(Boolean(pBody?.meta?.configured));
        setDraft(pBody?.data ?? {});
      } else {
        setError(pBody?.error || `Could not load the industry profile (HTTP ${pRes.status}).`);
      }
      const eBody = await eRes.json().catch(() => null);
      if (eRes.ok) setEffective(eBody?.data ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const industry = draft.primaryIndustry ?? profile?.primaryIndustry ?? '';
  const specialization = draft.mdxSpecialization ?? profile?.mdxSpecialization ?? 'unspecified';
  const markets = draft.defaultMarkets ?? profile?.defaultMarkets ?? [];

  // A material change alters which regulatory framework every project is offered,
  // so the server requires a reason. Mirroring that rule here means the operator
  // is told before submitting rather than after a 422.
  const material =
    (profile != null && industry !== profile.primaryIndustry)
    || (profile != null && specialization !== profile.mdxSpecialization)
    || profile == null;
  const dirty = material
    || JSON.stringify(markets) !== JSON.stringify(profile?.defaultMarkets ?? []);
  const canSave = dirty && !busy && Boolean(industry)
    && (!material || reason.trim().length >= 8);

  const save = async () => {
    setBusy(true); setError(null); setSaved(null);
    try {
      const res = await apiRequest('PATCH', '/api/admin/industry-profile', {
        primaryIndustry: industry,
        mdxSpecialization: specialization,
        defaultMarkets: markets,
        ...(material ? { changeReason: reason.trim() } : {}),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error || `The change was not saved (HTTP ${res.status}).`);
        return;
      }
      setReason('');
      setSaved('Saved. Project defaults and module content follow this from now on.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleMarket = (id: string) => {
    const next = markets.includes(id) ? markets.filter(m => m !== id) : [...markets, id];
    setDraft(d => ({ ...d, defaultMarkets: next }));
  };

  return (
    <div className="txw-set-card">
      <div className="txw-set-head">
        <div className="txw-set-head-l">
          <div className="txw-set-eyebrow">Organization {I.dot} governed</div>
          <h2 className="txw-set-title">Industry focus</h2>
          <p className="txw-set-sub">
            Presets project templates, study types, filing types and the AnA context across
            every project in this organization. Persisted server-side and audited — not a
            per-browser preference. Navigation is unaffected.
          </p>
        </div>
      </div>

      <div className="txw-set-body">
        {configured === false && (
          <div className="rbm-note" style={{ margin: '0 0 10px' }}>
            {I.info}No industry profile has been declared for this organization yet, so
            projects fall back to the legacy <span className="mono">industry_mode</span> value.
            Declaring it here is what makes the tailoring governed.
          </div>
        )}

        <div className="txw-row">
          <div className="txw-row-l">
            Primary industry
            <small>Determines the vertical a new project presets to.</small>
          </div>
          <div className="txw-row-r">
            <div className="txw-row-r-grid">
              {PRIMARY_INDUSTRIES.map(p => (
                <button key={p.id} className="txw-pchip" data-on={industry === p.id || undefined}
                  disabled={busy}
                  onClick={() => setDraft(d => ({ ...d, primaryIndustry: p.id }))}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {SPECIALIZATION_APPLIES.has(industry) && (
          <div className="txw-row">
            <div className="txw-row-l">
              MDX specialization
              <small>
                Device and IVD programs share the MDX workspace but need different study
                archetypes, protocol structures and performance statistics.
              </small>
            </div>
            <div className="txw-row-r">
              <div className="txw-row-r-grid">
                {SPECIALIZATIONS.map(sp => (
                  <button key={sp.id} className="txw-pchip"
                    data-on={specialization === sp.id || undefined} disabled={busy}
                    onClick={() => setDraft(d => ({ ...d, mdxSpecialization: sp.id }))}>
                    {sp.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="txw-row">
          <div className="txw-row-l">
            Default markets
            <small>Pre-selected on a new project; a project can still change them.</small>
          </div>
          <div className="txw-row-r">
            <div className="txw-row-r-grid">
              {MARKETS.map(m => (
                <button key={m.id} className="txw-pchip"
                  data-on={markets.includes(m.id) || undefined} disabled={busy}
                  onClick={() => toggleMarket(m.id)}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {material && (
          <div className="txw-row">
            <div className="txw-row-l">
              Reason for the change
              <small>
                Required: changing the industry or specialization changes which study types,
                filing types and terminology every project here is offered.
              </small>
            </div>
            <div className="txw-row-r">
              <textarea className="txw-gov-field" rows={2} value={reason} disabled={busy}
                style={{ width: '100%', maxWidth: 420, fontSize: 13, padding: '8px 10px',
                  borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-050)' }}
                placeholder="e.g. the IVD line was acquired and its programs move onto this tenant"
                onChange={e => setReason(e.target.value)} />
            </div>
          </div>
        )}

        {error && <div className="rbm-note" role="alert" style={{ margin: '10px 0 0', color: '#e5484d' }}>{error}</div>}
        {saved && <div className="rbm-note" style={{ margin: '10px 0 0' }}>{I.check}{saved}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
          <button className="rbm-btn pri" disabled={!canSave} onClick={save}>
            {busy ? 'Saving…' : configured ? 'Save industry focus' : 'Declare industry focus'}
          </button>
          {profile?.updatedAt && (
            <span className="mut" style={{ fontSize: 11 }}>
              Last changed {profile.updatedAt.slice(0, 10)}
              {profile.changeReason ? ` — "${profile.changeReason}"` : ''}
            </span>
          )}
        </div>

        {effective && <EffectiveSummary e={effective} />}
      </div>
    </div>
  );
}

/**
 * What the resolver actually returns for this organization right now.
 *
 * Shown because the whole value of the setting is what it changes downstream, and
 * because `needsDeclaration` is the honest answer when the resolver reached a weak
 * default — a CRO's vertical, or an MDX org that has never declared whether it is
 * device or IVD. Surfacing it here is how the operator learns the workspace is
 * waiting on a decision rather than quietly assuming one.
 */
function EffectiveSummary({ e }: { e: Effective }) {
  return (
    <div className="rbm-note" style={{ marginTop: 14 }}>
      {I.info}
      <b>Resolved now:</b> {e.vertical} workspace
      {e.specialization !== 'unspecified' ? `, ${e.specialization.replace(/_/g, ' ')}` : ''}
      {' '}(vertical from {e.verticalSource.replace(/_/g, ' ')}).
      {e.studyTypes.length > 0 && ` ${e.studyTypes.length} study archetype(s) and ${e.filingTypes.length} filing type(s) offered.`}
      {e.terminology.product && ` The shell calls a product a "${e.terminology.product}".`}
      {e.needsDeclaration.length > 0 && (
        <>
          {' '}
          <b>Still undeclared: {e.needsDeclaration.join(' and ')}.</b> Projects will ask
          rather than assume, and MDX study archetypes stay hidden until it is set —
          offering the wrong panel would be worse than offering none.
        </>
      )}
    </div>
  );
}

export default IndustryProfileCard;
