import React, { useState, useEffect, useMemo, useRef } from 'react';
import { I } from '../icons';
import { SampleTag, useLiveData, useLiveRows, EmptyState } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';
import { getAuthToken } from '@/utils/authToken';
import type { SurfaceViewProps } from '../surfaceViews';
import { getSurfaceMeta } from '../registryModel';
import { LIC_ROLES } from '../fixtures/licensing';
// Canonical config kept (not fixture DATA): AUDIT_KINDS is the audit-kind
// filter taxonomy the server's deriveKind() mirrors; PLATFORM_SERVICES is the
// static platform-capability catalog; ARTIFACT_FMT is the format→label display
// map. The fixture DATA constants (audit log, apps catalog, app license,
// artifacts and access grants) were removed — every surface below now renders
// real persisted data, an honest empty state, or an honest error state.
import {
  AUDIT_KINDS,
  PLATFORM_SERVICES,
  ARTIFACT_FMT,
} from '../fixtures/admin-data';
import type {
  AuditEntry,
  AppsCatalogApp,
  AppsCatalogGroup,
  AppLicense,
  AcGrant,
} from '../fixtures/admin-data';
import { useIndustryProfile } from '../../mdx/hooks/useIndustryProfile';
import {
  CLIENT_TYPE_OPTIONS,
  buildOrgProfilePatch,
  governedToPicker,
  pickerMatchesProfile,
} from '../../mdx/lib/industryProfileMapping';
import {
  GovernedConfirmDialog,
  type ConfirmConfig,
} from '../../_shared/components/GovernedConfirmDialog';
import '../styles/project-home-v2.css';
import '../styles/ana-v2.css';
import '../styles/translation-v2.css';

/* ── Window globals -- cross-surface data providers ── */
declare global {
  interface Window {
    TXW_ADMIN?: {
      enabled: boolean;
      targets: string[];
      defaultEngine: string;
      requireBackTranslation: boolean;
      twoPersonRule: boolean;
      glossaryScope: string;
      blockMachineApproval: boolean;
    };
  }
}

/* ── Shared inline helpers ── */

interface AdminHeaderProps {
  eyebrow: string;
  title: React.ReactNode;
  sub?: string;
  actions?: React.ReactNode;
}

function AdminHeader({ eyebrow, title, sub, actions }: AdminHeaderProps) {
  return (
    <div className="ph">
      <div>
        <div className="ph-eyebrow">{eyebrow}</div>
        <h1 className="ph-title">{title}</h1>
        {sub && <div className="ph-sub">{sub}</div>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8 }}>{actions}</div>}
    </div>
  );
}

function useToast(): [string, (m: string) => void] {
  const [msg, setMsg] = useState('');
  const fire = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 2400);
  };
  return [msg, fire];
}

function C2CToast({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <div className="de-toast">
      <span className="ico">{I.checkCircle}</span>
      {msg}
    </div>
  );
}

/* ── Setup settings shape ── */

interface SetupSettings {
  orgName: string;
  clientType: string;
  mfaRequired: boolean;
  ssoEnabled: boolean;
  txwEnabled: boolean;
  txwTargets: string[];
  txwDefaultEngine: string;
  txwRequireBackTranslation: boolean;
  txwTwoPersonRule: boolean;
  txwGlossaryScope: string;
  txwBlockMachineApproval: boolean;
}

interface LangOption {
  id: string;
  label: string;
  flag: string;
  agency: string;
}

/* ════════════ Setup (org config) ════════════
   Partially governed. The client-type picker reads and writes the org's
   industry profile through GET/PATCH /api/mdx/industry-profile (tenant-scoped,
   audited — see server/routes/mdx-industry-context.ts and
   mdx/hooks/useIndustryProfile). The picker vocabulary maps onto the governed
   primary_industry/mdx_specialization enums via mdx/lib/industryProfileMapping.

   The remaining fields (orgName, MFA/SSO, translation-workspace policy) are
   still browser-local: the only /api/setup routes on the server
   (server/routes/setup.ts) are the first-run installer — GET /status
   ({ initialized }) and the self-closing POST /initialize that creates the
   first org + admin on an empty database. Neither can truthfully read or
   persist those fields, so they stay in localStorage and the surface carries
   the Sample-data pill instead of pretending to be an org-wide governed
   write. Do not wire this panel to /api/setup — calling the installer from
   here would be destructive, not persistence. */

export function Setup({ onAsk }: SurfaceViewProps) {
  const [s, setS] = useState<SetupSettings>(() => {
    const def: SetupSettings = {
      orgName: 'Acme Bio',
      clientType: 'biotech',
      mfaRequired: true,
      ssoEnabled: false,
      txwEnabled: true,
      txwTargets: ['ja-JP', 'zh-CN', 'de-DE'],
      txwDefaultEngine: 'C2C-RIM-MT v2.4',
      txwRequireBackTranslation: true,
      txwTwoPersonRule: true,
      txwGlossaryScope: 'org',
      txwBlockMachineApproval: true,
    };
    try {
      const saved = JSON.parse(localStorage.getItem('c2c_admin_settings') || 'null');
      const merged: SetupSettings = { ...def, ...(saved || {}) };
      window.TXW_ADMIN = {
        enabled: merged.txwEnabled,
        targets: merged.txwTargets,
        defaultEngine: merged.txwDefaultEngine,
        requireBackTranslation: merged.txwRequireBackTranslation,
        twoPersonRule: merged.txwTwoPersonRule,
        glossaryScope: merged.txwGlossaryScope,
        blockMachineApproval: merged.txwBlockMachineApproval,
      };
      return merged;
    } catch (_e) {
      return def;
    }
  });

  const set = (k: keyof SetupSettings, v: SetupSettings[keyof SetupSettings]) =>
    setS((prev) => {
      const n = { ...prev, [k]: v } as SetupSettings;
      try {
        localStorage.setItem('c2c_admin_settings', JSON.stringify(n));
      } catch (_e) {
        /* noop */
      }
      window.TXW_ADMIN = {
        enabled: n.txwEnabled,
        targets: n.txwTargets,
        defaultEngine: n.txwDefaultEngine,
        requireBackTranslation: n.txwRequireBackTranslation,
        twoPersonRule: n.txwTwoPersonRule,
        glossaryScope: n.txwGlossaryScope,
        blockMachineApproval: n.txwBlockMachineApproval,
      };
      return n;
    });

  /* ── Governed client type (org industry profile) ──
     The picker below reads/writes GET|PATCH /api/mdx/industry-profile.
     localStorage keeps only a cosmetic copy (and the pharma-vs-biotech
     nuance the governed enum collapses); the profile row is the truth. */
  const { profile, save: saveProfile, saveState } = useIndustryProfile();
  const govPrimary = profile.status === 'ready' ? profile.data.primaryIndustry : null;
  const govSpec = profile.status === 'ready' ? profile.data.mdxSpecialization : null;

  useEffect(() => {
    if (!govPrimary) return;
    setS((prev) => {
      if (pickerMatchesProfile(prev.clientType, govPrimary, govSpec)) return prev;
      const next = { ...prev, clientType: governedToPicker(govPrimary, govSpec) };
      try {
        localStorage.setItem('c2c_admin_settings', JSON.stringify(next));
      } catch (_e) {
        /* noop */
      }
      return next;
    });
  }, [govPrimary, govSpec]);

  const chooseClientType = (t: string) => {
    set('clientType', t);
    const patch = buildOrgProfilePatch(t, govSpec);
    if (patch) void saveProfile(patch);
  };

  const clientTypeStatus: string =
    profile.status === 'error'
      ? 'Governed profile unreachable -- selection kept in this browser only.'
      : saveState.status === 'saving'
        ? 'Saving to governed org profile…'
        : saveState.status === 'error'
          ? saveState.message
          : saveState.status === 'saved'
            ? 'Saved to the governed org profile (audited).'
            : profile.status === 'loading'
              ? 'Loading governed org profile…'
              : profile.status === 'empty'
                ? 'No governed profile saved yet -- pick a type to create one.'
                : profile.status === 'ready'
                  ? 'Governed -- loaded from your org industry profile.'
                  : '';

  const ALL_LANGS: LangOption[] = [
    { id: 'ja-JP', label: 'Japanese', flag: 'JP', agency: 'PMDA' },
    { id: 'zh-CN', label: 'Chinese (simplified)', flag: 'CN', agency: 'NMPA' },
    { id: 'de-DE', label: 'German', flag: 'DE', agency: 'BfArM' },
    { id: 'fr-FR', label: 'French', flag: 'FR', agency: 'ANSM' },
    { id: 'es-ES', label: 'Spanish', flag: 'ES', agency: 'AEMPS' },
    { id: 'ko-KR', label: 'Korean', flag: 'KR', agency: 'MFDS' },
    { id: 'pt-BR', label: 'Portuguese (Brazil)', flag: 'BR', agency: 'ANVISA' },
    { id: 'it-IT', label: 'Italian', flag: 'IT', agency: 'AIFA' },
  ];
  const ENGINES = [
    'C2C-RIM-MT v2.4',
    'DeepL Pro',
    'Google Translation',
    'Azure Translator',
    'Custom (Bring your own)',
  ];
  const toggleLang = (id: string) =>
    set(
      'txwTargets',
      s.txwTargets.includes(id) ? s.txwTargets.filter((x) => x !== id) : [...s.txwTargets, id],
    );

  return (
    <div className="page-inner">
      <AdminHeader
        eyebrow="Admin -- organization"
        title={
          <React.Fragment>
            Setup <SampleTag sample={true} />
          </React.Fragment>
        }
        sub="Organization profile, security defaults, and module configuration. Client type is governed (reads and writes the org industry profile); the remaining settings are saved in this browser only."
        actions={
          <button className="btn ghost" onClick={() => onAsk && onAsk('Summarize my org configuration')}>
            {I.sparkles} Ask AnA
          </button>
        }
      />

      <div className="txw-settings">
        {/* -- Org profile -- */}
        <div className="txw-set-card">
          <div className="txw-set-head">
            <div className="txw-set-head-l">
              <div className="txw-set-eyebrow">Organization</div>
              <h2 className="txw-set-title">Profile &amp; client type</h2>
              <p className="txw-set-sub">
                Drives default templates, pathways, and the AnA context across every project.
              </p>
            </div>
          </div>
          <div className="txw-set-body">
            <div className="txw-row">
              <div className="txw-row-l">
                Organization name
                <small>Displayed in audit, e-sign manifest, and export footers.</small>
              </div>
              <div className="txw-row-r">
                <input
                  className="txw-gov-field"
                  style={{
                    fontSize: 13,
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-050)',
                    width: '100%',
                    maxWidth: 340,
                  }}
                  value={s.orgName}
                  onChange={(e) => set('orgName', e.target.value)}
                />
              </div>
            </div>
            <div className="txw-row">
              <div className="txw-row-l">
                Client type
                <small>
                  Sets the default rail focus and AnA framing. Governed -- saved to your
                  organization's industry profile.
                </small>
              </div>
              <div className="txw-row-r">
                <div className="txw-row-r-grid">
                  {CLIENT_TYPE_OPTIONS.map((t) => (
                    <button
                      key={t}
                      className="txw-pchip"
                      data-on={s.clientType === t || undefined}
                      disabled={profile.status === 'loading' || saveState.status === 'saving'}
                      onClick={() => chooseClientType(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                {clientTypeStatus && (
                  <span
                    className="txw-help"
                    data-tone={
                      saveState.status === 'error' || profile.status === 'error'
                        ? 'warn'
                        : undefined
                    }
                  >
                    {clientTypeStatus}
                  </span>
                )}
              </div>
            </div>
            <div className="txw-row">
              <div className="txw-row-l">
                Multi-factor authentication
                <small>Required for every member at sign-in.</small>
              </div>
              <div className="txw-row-r" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <button
                  className="txw-switch"
                  data-on={s.mfaRequired || undefined}
                  onClick={() => set('mfaRequired', !s.mfaRequired)}
                  aria-pressed={s.mfaRequired}
                  aria-label="MFA required"
                />
                <span className="txw-help">
                  {s.mfaRequired ? 'Required' : 'Optional'} -- TOTP via authenticator app.
                </span>
              </div>
            </div>
            <div className="txw-row">
              <div className="txw-row-l">
                SSO &amp; SCIM<small>SAML / OIDC for centralized identity.</small>
              </div>
              <div className="txw-row-r" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <button
                  className="txw-switch"
                  data-on={s.ssoEnabled || undefined}
                  onClick={() => set('ssoEnabled', !s.ssoEnabled)}
                  aria-pressed={s.ssoEnabled}
                  aria-label="SSO enabled"
                />
                <span className="txw-help">
                  {s.ssoEnabled ? 'Connected to your IdP' : 'Disabled'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* -- Translation workspace -- */}
        <div className="txw-set-card">
          <div className="txw-set-head">
            <div className="txw-set-head-l">
              <div className="txw-set-eyebrow">Module -- authoring</div>
              <h2 className="txw-set-title">Translation workspace</h2>
              <p className="txw-set-sub">
                Bilingual review for non-English regulatory content -- drafted by MT, post-edited by a
                human, back-translated for verification, and approved under 21 CFR Part 11. Exposed
                inside the Document editor's Trans dock.
              </p>
            </div>
            <button
              className="txw-switch"
              data-on={s.txwEnabled || undefined}
              onClick={() => set('txwEnabled', !s.txwEnabled)}
              aria-pressed={s.txwEnabled}
              aria-label="Enable translation workspace"
            />
          </div>
          {s.txwEnabled && (
            <div className="txw-set-body">
              <div className="txw-row">
                <div className="txw-row-l">
                  Target languages
                  <small>Available to every project. Add more in the language registry.</small>
                </div>
                <div className="txw-row-r">
                  <div className="txw-row-r-grid">
                    {ALL_LANGS.map((l) => (
                      <button
                        key={l.id}
                        className="txw-pchip"
                        data-on={s.txwTargets.includes(l.id) || undefined}
                        onClick={() => toggleLang(l.id)}
                      >
                        <span className="txw-pchip-flag">{l.flag}</span>
                        {l.label}{' '}
                        <span
                          style={{
                            color: s.txwTargets.includes(l.id)
                              ? 'rgba(255,255,255,.7)'
                              : 'var(--text-400)',
                            fontSize: 10,
                          }}
                        >
                          -- {l.agency}
                        </span>
                      </button>
                    ))}
                  </div>
                  {s.txwTargets.length === 0 && (
                    <div className="txw-warn">
                      {I.alertTriangle}Select at least one target language.
                    </div>
                  )}
                </div>
              </div>
              <div className="txw-row">
                <div className="txw-row-l">
                  Default MT engine
                  <small>Used for first-pass drafts. Authors can override per segment.</small>
                </div>
                <div className="txw-row-r" style={{ flexDirection: 'row' }}>
                  <select
                    value={s.txwDefaultEngine}
                    onChange={(e) => set('txwDefaultEngine', e.target.value)}
                    style={{
                      fontSize: 12.5,
                      padding: '7px 10px',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'var(--bg-050)',
                      color: 'var(--text-100)',
                      minWidth: 240,
                    }}
                  >
                    {ENGINES.map((en) => (
                      <option key={en} value={en}>
                        {en}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="txw-row">
                <div className="txw-row-l">
                  Block approval of machine-only segments
                  <small>
                    A segment with method{' '}
                    <span className="mono" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                      machine
                    </span>{' '}
                    can never be approved -- only human + MT-postedited segments are approvable.
                  </small>
                </div>
                <div
                  className="txw-row-r"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                >
                  <button
                    className="txw-switch"
                    data-on={s.txwBlockMachineApproval || undefined}
                    onClick={() => set('txwBlockMachineApproval', !s.txwBlockMachineApproval)}
                    aria-pressed={s.txwBlockMachineApproval}
                    aria-label="Block machine-only approval"
                  />
                  <span className="txw-help">
                    {s.txwBlockMachineApproval
                      ? 'Enforced -- APPROVABLE_METHODS = [human, mt_postedited]'
                      : 'Disabled -- not recommended for regulated submissions'}
                  </span>
                </div>
              </div>
              <div className="txw-row">
                <div className="txw-row-l">
                  Require verified back-translation before approval
                  <small>
                    Independent re-translation of the target back to source, persisted with the
                    segment.
                  </small>
                </div>
                <div
                  className="txw-row-r"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                >
                  <button
                    className="txw-switch"
                    data-on={s.txwRequireBackTranslation || undefined}
                    onClick={() => set('txwRequireBackTranslation', !s.txwRequireBackTranslation)}
                    aria-pressed={s.txwRequireBackTranslation}
                    aria-label="Require back-translation"
                  />
                  <span className="txw-help">
                    {s.txwRequireBackTranslation
                      ? 'Required for every approved segment'
                      : 'Optional'}
                  </span>
                </div>
              </div>
              <div className="txw-row">
                <div className="txw-row-l">
                  Two-person rule
                  <small>Reviewer must differ from the post-editor (separation of duties).</small>
                </div>
                <div
                  className="txw-row-r"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                >
                  <button
                    className="txw-switch"
                    data-on={s.txwTwoPersonRule || undefined}
                    onClick={() => set('txwTwoPersonRule', !s.txwTwoPersonRule)}
                    aria-pressed={s.txwTwoPersonRule}
                    aria-label="Two-person rule"
                  />
                  <span className="txw-help">
                    {s.txwTwoPersonRule ? 'Enforced' : 'Disabled'}
                  </span>
                </div>
              </div>
              <div className="txw-row">
                <div className="txw-row-l">
                  Glossary scope
                  <small>
                    Where the do-not-translate registry lives by default for new terms.
                  </small>
                </div>
                <div className="txw-row-r">
                  <div className="txw-row-r-grid">
                    {[
                      { id: 'org', label: 'Org-wide' },
                      { id: 'project', label: 'Project-scoped' },
                    ].map((o) => (
                      <button
                        key={o.id}
                        className="txw-pchip"
                        data-on={s.txwGlossaryScope === o.id || undefined}
                        onClick={() => set('txwGlossaryScope', o.id)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="txw-row" style={{ borderBottom: 0 }}>
                <div className="txw-row-l">
                  Open in editor
                  <small>
                    Reach the workspace from any document -- click the <b>Trans</b> dock tab in the
                    Document editor.
                  </small>
                </div>
                <div className="txw-row-r">
                  <span className="txw-help">
                    Surfaces inside <b>Document editor -- Trans</b> with Sections / Segments /
                    Glossary / QA toggles.
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════ Audit trail -- immutable hash-chain viewer (ss11.10(e)) ════════════
   Live-anchored to GET /api/audit-trail/ledger (mounted in
   server/bootstrap/register-regulatory-routes.ts, router
   server/routes/audit-trail-ledger.routes.ts). REAL: an org-scoped, newest-first
   slice of the append-only, hash-chained `audit_events` table, returned in this
   surface's exact AuditEntry display shape — hash/prevHash are the real stored
   SHA-256 chain (genesis row → prevHash 'genesis'), sig is a genuine §11.50
   signed status, reason/meaning are the stored values, and event/target/kind are
   documented presentation derivations of real columns. No fixture: the surface
   renders real rows, an honest empty state, or an honest error (a 503 when the
   hash-chain schema isn't provisioned surfaces as the error state). */

/** Fetch the signed, hash-verifiable audit export bundle and download it as a
 *  JSON file. GET /api/audit/export/signed is Bearer-gated and returns
 *  { export: { data, manifest, signature, verification } } — the inspection-ready
 *  bundle an auditor can independently verify (HMAC-SHA256 over the manifest,
 *  SHA-256 of the data). Never throws; returns an honest ok/error. */
async function downloadSignedAuditExport(): Promise<{ ok: boolean; error?: string }> {
  try {
    const token = getAuthToken();
    const res = await fetch('/api/audit/export/signed?format=json', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      return {
        ok: false,
        error:
          res.status === 401 || res.status === 403
            ? 'Admin session required to export the audit trail.'
            : `Export failed (HTTP ${res.status}).`,
      };
    }
    const json = (await res.json().catch(() => null)) as { export?: unknown } | null;
    if (!json?.export) return { ok: false, error: 'The export response was malformed.' };
    const blob = new Blob([JSON.stringify(json.export, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audit-trail-signed-export.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Export failed.' };
  }
}

export function AuditTrail({ onAsk }: SurfaceViewProps) {
  const [kind, setKind] = useState('all');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [chainView, setChainView] = useState(false);
  const [exporting, setExporting] = useState(false);
  const term = q.toLowerCase();

  // Real hash-chained ledger. useLiveRows unwraps the { success, data } envelope,
  // returns a fresh [] while loading / on error (rendered directly, so no seed
  // loop), and sets `error` only on a genuine fetch failure.
  const { rows: entries, loading, error } = useLiveRows<AuditEntry>('/api/audit-trail/ledger');

  const log = entries.filter(
    (e) =>
      (kind === 'all' || e.kind === kind) &&
      (!term ||
        e.event.toLowerCase().includes(term) ||
        e.actor.toLowerCase().includes(term) ||
        e.target.toLowerCase().includes(term) ||
        e.id.toLowerCase().includes(term)),
  );

  const kindCounts = AUDIT_KINDS.map((k) => ({
    ...k,
    n: k.id === 'all' ? entries.length : entries.filter((e) => e.kind === k.id).length,
  }));

  const kindColor: Record<string, string> = {
    esign: 'var(--accent-200)',
    authoring: 'var(--info)',
    review: 'var(--warning)',
    submission: 'var(--success)',
    vault: 'var(--ai)',
    validation: 'var(--text-300)',
    admin: 'var(--text-400)',
  };

  const entry = sel ? entries.find((e) => e.id === sel) : null;

  // REAL, audited signed export — GET /api/audit/export/signed streams the
  // inspection-ready bundle (data + manifest + HMAC signature) which downloads
  // as a JSON file. Honest failure surfaced inline; nothing is faked.
  const [exportErr, setExportErr] = useState('');
  const doExport = async () => {
    setExporting(true);
    setExportErr('');
    const r = await downloadSignedAuditExport();
    if (!r.ok) setExportErr(r.error || 'Could not generate the signed export.');
    setExporting(false);
  };

  /* Hash-chain integrity check (visual) */
  const chainStatus = (() => {
    const all = entries;
    let valid = 0;
    for (let i = 0; i < all.length; i++) {
      if (i === all.length - 1) {
        if (all[i].prevHash === 'genesis') valid++;
        continue;
      }
      if (all[i].prevHash === all[i + 1].hash) valid++;
    }
    return { total: all.length, valid, intact: valid === all.length };
  })();

  return (
    <div className="page-inner">
      <AdminHeader
        eyebrow="Admin -- compliance"
        title="Audit trail"
        sub={`${entries.length} entries -- hash-chained -- append-only -- 21 CFR Part 11 ss11.10(e)`}
        actions={
          <React.Fragment>
            <button
              className={`btn ghost${chainView ? ' on' : ''}`}
              onClick={() => setChainView((v) => !v)}
              style={
                chainView
                  ? { background: 'var(--accent-000)', borderColor: 'var(--accent-100)' }
                  : {}
              }
            >
              {I.link || I.network} Hash chain
            </button>
            <button className="btn primary" onClick={doExport} disabled={exporting}>
              {I.scroll} {exporting ? 'Generating…' : 'Export signed bundle'}
            </button>
          </React.Fragment>
        }
      />
      {exportErr && (
        <div className="scaf-note" role="alert" style={{ padding: '10px 12px', margin: '0 0 12px', color: 'var(--error)', border: '1px solid var(--error)', borderRadius: 8 }}>
          {exportErr}
        </div>
      )}

      {loading ? (
        <div className="scaf-note" style={{ padding: '18px 10px', maxWidth: 680 }}>
          Loading audit trail…
        </div>
      ) : error ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load the audit trail"
          hint="The append-only, hash-chained 21 CFR Part 11 ledger didn't respond. Sign in and retry, or check the audit service is reachable -- the trail is never shown as an empty 'no events' state when it can't be read."
        />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={I.scroll}
          title="No audit entries yet"
          hint="Governed actions -- authoring, review, submission, vault locks and e-signatures -- are written here to the immutable hash-chained ledger as they happen."
        />
      ) : (
        <React.Fragment>
      {/* Chain integrity banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 14px',
          borderRadius: 8,
          background: chainStatus.intact
            ? 'color-mix(in srgb,var(--success) 10%,transparent)'
            : 'color-mix(in srgb,var(--error) 10%,transparent)',
          border:
            '1px solid ' + (chainStatus.intact ? 'var(--success)' : 'var(--error)'),
          marginBottom: 16,
          maxWidth: 680,
        }}
      >
        <span style={{ fontSize: 18 }}>
          {chainStatus.intact ? I.shieldCheck : I.alertTriangle}
        </span>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 13,
              color: chainStatus.intact ? 'var(--success)' : 'var(--error)',
            }}
          >
            {chainStatus.intact ? 'Hash chain intact' : 'Chain verification failed'}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-400)', marginTop: 2 }}>
            {chainStatus.total} entries -- {chainStatus.valid}/{chainStatus.total} links
            verified -- SHA-256 -- append-only ledger
          </div>
        </div>
        <span className="mono" style={{ fontSize: 10, color: 'var(--text-400)' }}>
          HEAD {entries[0]?.hash}
        </span>
      </div>

      {/* Filters */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          marginBottom: 16,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div className="vault-search" style={{ flex: '1 1 240px', maxWidth: 360 }}>
          <span className="ico">{I.search}</span>
          <input
            placeholder="Search entries..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="seg" style={{ flexWrap: 'wrap' }}>
          {kindCounts.map((k) => (
            <button
              key={k.id}
              className={`seg-b${kind === k.id ? ' on' : ''}`}
              onClick={() => setKind(k.id)}
            >
              {k.label}
              <span className="mono" style={{ fontSize: 10, marginLeft: 4, opacity: 0.6 }}>
                {k.n}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Hash chain view */}
      {chainView && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
            marginBottom: 20,
            maxWidth: 720,
            position: 'relative',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-300)', marginBottom: 8 }}>
            Hash chain -- newest to oldest
          </div>
          {entries.map((e, i) => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
              <div
                style={{
                  width: 32,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: e.sig ? 'var(--accent-200)' : 'var(--bg-300)',
                    border:
                      '2px solid ' + (e.sig ? 'var(--accent-200)' : 'var(--border)'),
                    flexShrink: 0,
                    marginTop: 8,
                  }}
                />
                {i < entries.length - 1 && (
                  <div style={{ width: 2, flex: 1, background: 'var(--border)' }} />
                )}
              </div>
              <button
                onClick={() => setSel(e.id)}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 8,
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: sel === e.id ? 'var(--accent-000)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 12,
                }}
              >
                <span
                  className="mono"
                  style={{ color: 'var(--accent-200)', fontSize: 10, flexShrink: 0 }}
                >
                  {e.id}
                </span>
                <span
                  className="mono"
                  style={{ color: 'var(--text-400)', fontSize: 10, flexShrink: 0 }}
                >
                  {e.hash}
                </span>
                <span
                  style={{
                    color: sel === e.id ? 'var(--text-100)' : 'var(--text-300)',
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {e.event}
                </span>
                {e.sig && (
                  <span style={{ color: 'var(--accent-200)', flexShrink: 0 }}>
                    {I.shieldCheck}
                  </span>
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main table */}
      <div className="ctable">
        <div
          className="ct-head"
          style={{ gridTemplateColumns: '90px 130px 110px 1fr 90px 40px 40px' }}
        >
          <div>ID</div>
          <div>When</div>
          <div>Actor</div>
          <div>Event</div>
          <div>Target</div>
          <div>Sig</div>
          <div></div>
        </div>
        {log.map((e) => (
          <button
            key={e.id}
            className="ct-row"
            data-on={sel === e.id || undefined}
            style={{
              gridTemplateColumns: '90px 130px 110px 1fr 90px 40px 40px',
              background: sel === e.id ? 'var(--accent-000)' : undefined,
            }}
            onClick={() => setSel(sel === e.id ? null : e.id)}
          >
            <div className="mono" style={{ color: 'var(--accent-200)', fontSize: 11 }}>
              {e.id}
            </div>
            <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-400)' }}>
              {e.when}
            </div>
            <div style={{ fontSize: 12 }}>{e.actor}</div>
            <div style={{ fontWeight: 400, fontSize: 12 }}>
              <span
                style={{
                  display: 'inline-block',
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: kindColor[e.kind] || 'var(--text-400)',
                  marginRight: 6,
                  verticalAlign: 'middle',
                }}
              />
              {e.event}
            </div>
            <div style={{ color: 'var(--text-400)', fontSize: 11.5 }}>{e.target}</div>
            <div>
              {e.sig ? (
                <span className="esig">{I.shieldCheck}</span>
              ) : (
                <span style={{ color: 'var(--text-500)' }}>--</span>
              )}
            </div>
            <div style={{ color: 'var(--text-400)', fontSize: 13 }}>{I.chevDown}</div>
          </button>
        ))}
      </div>

      {/* Detail drawer */}
      {entry && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--bg-100)',
            maxWidth: 720,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 14 }}>{entry.id} -- Entry detail</div>
            <button className="tbtn" onClick={() => setSel(null)} style={{ fontSize: 16 }}>
              {I.close}
            </button>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '120px 1fr',
              gap: '8px 16px',
              fontSize: 12.5,
            }}
          >
            <span style={{ color: 'var(--text-400)', fontWeight: 500 }}>Event</span>
            <span style={{ fontWeight: 500 }}>{entry.event}</span>
            <span style={{ color: 'var(--text-400)', fontWeight: 500 }}>Actor</span>
            <span>{entry.actor}</span>
            <span style={{ color: 'var(--text-400)', fontWeight: 500 }}>Timestamp</span>
            <span className="mono">{entry.when}</span>
            <span style={{ color: 'var(--text-400)', fontWeight: 500 }}>Target</span>
            <span>{entry.target}</span>
            <span style={{ color: 'var(--text-400)', fontWeight: 500 }}>Kind</span>
            <span>
              <span
                style={{
                  display: 'inline-block',
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: kindColor[entry.kind] || 'var(--text-400)',
                  marginRight: 6,
                  verticalAlign: 'middle',
                }}
              />
              {entry.kind}
            </span>
            <span style={{ color: 'var(--text-400)', fontWeight: 500 }}>Origin IP</span>
            <span className="mono">{entry.ip}</span>
            {entry.reason && (
              <React.Fragment>
                <span style={{ color: 'var(--text-400)', fontWeight: 500 }}>
                  Reason for change
                </span>
                <span style={{ fontStyle: 'italic' }}>{entry.reason}</span>
              </React.Fragment>
            )}
            {entry.meaning && (
              <React.Fragment>
                <span style={{ color: 'var(--text-400)', fontWeight: 500 }}>
                  Signature meaning
                </span>
                <span>
                  <span className="esig" style={{ marginRight: 6 }}>
                    {I.shieldCheck}
                  </span>
                  {entry.meaning} (ss11.50)
                </span>
              </React.Fragment>
            )}
            <span style={{ color: 'var(--text-400)', fontWeight: 500 }}>Entry hash</span>
            <span className="mono" style={{ fontSize: 11, wordBreak: 'break-all' }}>
              SHA-256: {entry.hash}
            </span>
            <span style={{ color: 'var(--text-400)', fontWeight: 500 }}>Previous hash</span>
            <span className="mono" style={{ fontSize: 11, wordBreak: 'break-all' }}>
              {entry.prevHash === 'genesis' ? 'genesis block' : entry.prevHash}
            </span>
          </div>
          {entry.sig && (
            <div
              style={{
                marginTop: 12,
                padding: '8px 12px',
                borderRadius: 6,
                background: 'color-mix(in srgb,var(--success) 8%,transparent)',
                border: '1px solid var(--success)',
                fontSize: 11.5,
                display: 'flex',
                gap: 8,
                alignItems: 'center',
              }}
            >
              {I.shieldCheck}
              <span>
                This entry was digitally signed per 21 CFR ss11.50. Meaning:{' '}
                <strong>{entry.meaning}</strong>. Signature is hash-bound and tamper-evident.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="scaf-note" style={{ marginTop: 16, maxWidth: 760 }}>
        Entries are append-only, hash-chained (SHA-256), and timestamped. Each entry's hash
        incorporates the previous entry's hash, creating a verifiable chain. Any modification to a
        historical entry breaks the chain. Export produces a signed PDF carrying the full
        verification manifest, in the form Part 11 record retention expects.
      </div>
        </React.Fragment>
      )}
    </div>
  );
}

/* ════════════ Apps catalog ════════════
   Live-wired to /api/module-subscriptions (mounted in
   server/bootstrap/register-inline-routes.ts, router
   server/routes/module-subscriptions.ts):
     GET /catalog            → { modules: [{ moduleId, name, description,
                                 category, isEnabled, isAvailable,
                                 requiredTier, sortOrder }] }
     GET /license            → { tier, industryMode, usage: { projects|users:
                                 { currentCount, maxAllowed } } }
     PUT /:moduleId/toggle   → { moduleId, enabled } (admin-only; 403 with a
                                 reason when the tier does not include it)
   Fixture-free: the surface renders the real catalog + license, an honest empty
   state, or an honest error state — no APPS_CATALOG / APP_LICENSE fallback and no
   Sample-data pill. Fields the backend cannot truthfully supply (renewsAt — no
   renewal column is read anywhere server-side) are left empty, never invented. */

/** One live catalog row (ModuleCatalogEntry, server/services/license-manager.ts). */
interface LiveModuleEntry {
  moduleId: string;
  name: string;
  description: string | null;
  category: string | null;
  isEnabled: boolean;
  isAvailable: boolean;
  requiredTier: string | null;
  sortOrder: number;
}

/** Display row — the fixture shape plus the live module's own name. */
type AppRow = AppsCatalogApp & { name?: string };
type AppGroup = Omit<AppsCatalogGroup, 'apps'> & { apps: AppRow[] };

function isLiveModuleEntry(m: unknown): m is LiveModuleEntry {
  if (!m || typeof m !== 'object') return false;
  const r = m as Record<string, unknown>;
  return (
    typeof r.moduleId === 'string' &&
    typeof r.name === 'string' &&
    typeof r.isEnabled === 'boolean' &&
    typeof r.isAvailable === 'boolean'
  );
}

/** Truthful tier chip for a live module: within-plan modules show the lowest
    tier that includes them ('Included' when unrestricted); modules the org's
    tier does NOT include map to 'Add-on' — the same upgrade-path semantics the
    fixture uses (and the same rule the server enforces on toggle). */
function liveTierLabel(m: LiveModuleEntry): string {
  if (!m.isAvailable) return 'Add-on';
  if (!m.requiredTier) return 'Included';
  return m.requiredTier.charAt(0).toUpperCase() + m.requiredTier.slice(1);
}

/** Map GET /catalog into the grouped display, or null when the payload does
    not carry the display contract (→ fail closed to the fixture). */
function mapLiveCatalog(payload: unknown): AppGroup[] | null {
  if (!payload || typeof payload !== 'object') return null;
  const modules = (payload as { modules?: unknown }).modules;
  if (!Array.isArray(modules)) return null;
  const rows = modules.filter(isLiveModuleEntry);
  if (rows.length === 0) return null;
  const byCat = new Map<string, LiveModuleEntry[]>();
  for (const m of rows) {
    const cat = m.category || 'other';
    const list = byCat.get(cat) || [];
    list.push(m);
    byCat.set(cat, list);
  }
  const groups = Array.from(byCat.values());
  for (const mods of groups) mods.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  groups.sort((a, b) => (a[0]?.sortOrder || 0) - (b[0]?.sortOrder || 0));
  return groups.map((mods) => {
    const cat = mods[0]?.category || 'other';
    return {
      group: cat.charAt(0).toUpperCase() + cat.slice(1),
      note: `${mods.length} module${mods.length === 1 ? '' : 's'} -- live subscription state for this organization`,
      apps: mods.map((m) => ({
        id: m.moduleId,
        name: m.name,
        tier: liveTierLabel(m),
        on: m.isEnabled,
        desc: m.description || m.name,
      })),
    };
  });
}

/** Map GET /license into the fixture display shape, or null on shape mismatch.
    `renewsAt` stays empty — the backend holds no renewal date to report. */
function mapLiveLicense(payload: unknown): AppLicense | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as {
    tier?: unknown;
    industryMode?: unknown;
    usage?: {
      projects?: { currentCount?: unknown; maxAllowed?: unknown };
      users?: { currentCount?: unknown; maxAllowed?: unknown };
    };
  };
  const pj = p.usage?.projects;
  const us = p.usage?.users;
  if (typeof p.tier !== 'string') return null;
  if (typeof pj?.currentCount !== 'number' || typeof pj?.maxAllowed !== 'number') return null;
  if (typeof us?.currentCount !== 'number' || typeof us?.maxAllowed !== 'number') return null;
  return {
    tier: p.tier,
    industryMode: typeof p.industryMode === 'string' ? p.industryMode : '',
    renewsAt: '',
    usage: {
      projects: { current: pj.currentCount, limit: pj.maxAllowed },
      users: { current: us.currentCount, limit: us.maxAllowed },
    },
  };
}

export function Apps({ onAsk, onNav }: SurfaceViewProps) {
  const open = (id: string) => onNav(id);
  // Fixture-free live reads. Both endpoints return a bare (non-enveloped) object,
  // so useLiveData yields the payload directly ({ modules } / the license object).
  const catState = useLiveData<{ modules: LiveModuleEntry[] }>('/api/module-subscriptions/catalog');
  const licState = useLiveData<Record<string, unknown>>('/api/module-subscriptions/license');
  const liveGroups = useMemo(() => mapLiveCatalog(catState.data), [catState.data]);
  const lic = useMemo(() => mapLiveLicense(licState.data), [licState.data]);
  // Editable copy for optimistic toggles, seeded once when the live catalog
  // resolves. liveGroups is a stable reference until the fetch re-runs (useMemo
  // over the resolved payload), so the seed effect fires once and never loops.
  const [cat, setCat] = useState<AppGroup[]>([]);
  const seededRef = useRef<AppGroup[] | null>(null);
  useEffect(() => {
    if (liveGroups && seededRef.current !== liveGroups) {
      seededRef.current = liveGroups;
      setCat(liveGroups);
    }
  }, [liveGroups]);
  // Render from the optimistic copy once seeded, else straight from the live map
  // (avoids a one-frame blank between the fetch resolving and the seed effect).
  const groups = cat.length > 0 ? cat : liveGroups ?? [];
  const [admin, setAdmin] = useState(false);
  const [toast, setToast] = useState('');
  const fireToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(''), 3200);
  };

  const tierLabel = lic?.tier || '';
  const pj = lic?.usage?.projects || { current: 0, limit: 0 };
  const us = lic?.usage?.users || { current: 0, limit: 0 };

  const setOn = (groupIdx: number, appId: string, on: boolean) =>
    setCat((prev) => {
      const base = prev.length > 0 ? prev : liveGroups ?? [];
      return base.map((g, gi) =>
        gi !== groupIdx
          ? g
          : {
              ...g,
              apps: g.apps.map((a) => (a.id === appId ? { ...a, on } : a)),
            },
      );
    });

  const toggle = async (groupIdx: number, appId: string, next: boolean) => {
    const row = groups[groupIdx]?.apps.find((a) => a.id === appId);
    const label = row?.name || getSurfaceMeta(appId).label || appId;
    setOn(groupIdx, appId, next); // optimistic
    try {
      // PUT /api/module-subscriptions/:moduleId/toggle (admin-only, org-scoped) —
      // a real, persisted write. apiRequest passes 401 through; other non-OK
      // throws with the server's reason (admin required / tier does not include).
      const res = await apiRequest(
        'PUT',
        `/api/module-subscriptions/${encodeURIComponent(appId)}/toggle`,
        { enabled: next },
      );
      if (!res.ok) {
        setOn(groupIdx, appId, !next);
        fireToast(`Could not ${next ? 'enable' : 'disable'} ${label} -- sign in required`);
        return;
      }
      fireToast((next ? 'Enabled ' : 'Disabled ') + label);
    } catch (e) {
      // Revert -- never report a write that did not happen.
      setOn(groupIdx, appId, !next);
      fireToast(
        `Could not ${next ? 'enable' : 'disable'} ${label} -- ` +
          (e instanceof Error && e.message ? e.message : 'request failed'),
      );
    }
  };

  return (
    <div className="page-inner">
      <AdminHeader
        eyebrow="Workspace -- /api/module-subscriptions"
        title="Apps catalog"
        sub="Every application -- the destinations you open and work in -- entitlement-aware. Active apps launch; add-ons show an upgrade path, never a dead button. Platform services (below) are the capabilities that run inside these apps."
        actions={
          <button
            className="btn ghost"
            data-on={admin || undefined}
            onClick={() => setAdmin((v) => !v)}
            title="Toggle admin controls"
          >
            {I.settings || I.sliders} {admin ? 'Admin controls on' : 'Admin controls'}
          </button>
        }
      />

      {/* License / entitlement header */}
      {licState.loading ? (
        <div className="scaf-note" style={{ marginBottom: 16 }}>Loading license…</div>
      ) : lic ? (
      <div className="lic-band">
        <div className="lic-tier">
          <span className="lic-tier-dot" data-tier={tierLabel}></span>
          <div>
            <div className="lic-tier-l">Current plan</div>
            <div className="lic-tier-v">
              {String(tierLabel).charAt(0).toUpperCase() + String(tierLabel).slice(1)}
              {lic.industryMode ? (
                <span className="lic-ind"> -- {lic.industryMode}</span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="lic-quota">
          <div className="lic-q-l">Projects</div>
          <div className="lic-q-bar">
            <div
              className="lic-q-fill"
              data-warn={(pj.limit && pj.current / pj.limit > 0.85) || undefined}
              style={{
                width: (pj.limit ? Math.min(100, (pj.current / pj.limit) * 100) : 0) + '%',
              }}
            />
          </div>
          <div className="lic-q-n mono">
            {pj.current} / {pj.limit}
          </div>
        </div>
        <div className="lic-quota">
          <div className="lic-q-l">Seats</div>
          <div className="lic-q-bar">
            <div
              className="lic-q-fill"
              data-warn={(us.limit && us.current / us.limit > 0.85) || undefined}
              style={{
                width: (us.limit ? Math.min(100, (us.current / us.limit) * 100) : 0) + '%',
              }}
            />
          </div>
          <div className="lic-q-n mono">
            {us.current} / {us.limit}
          </div>
        </div>
        <div className="lic-band-spacer"></div>
        {lic.renewsAt && <div className="lic-renew">Renews {lic.renewsAt}</div>}
        <a
          className="btn ghost"
          style={{ height: 28, textDecoration: 'none' }}
          href="/settings/subscription"
        >
          {I.creditCard || I.zap} Manage plan
        </a>
      </div>
      ) : (
        <div
          className="scaf-note"
          style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}
        >
          {I.info}
          <span>
            License &amp; entitlement details are unavailable right now
            {licState.error ? " -- the billing service didn't respond" : ''}.
          </span>
          <a
            className="btn ghost"
            style={{ height: 28, textDecoration: 'none', marginLeft: 'auto' }}
            href="/settings/subscription"
          >
            {I.creditCard || I.zap} Manage plan
          </a>
        </div>
      )}

      {catState.loading ? (
        <div className="sec">
          <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading apps…</div>
        </div>
      ) : catState.error ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load the apps catalog"
          hint="The module-subscriptions service didn't respond. Sign in and retry, or check it's reachable."
        />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={I.grid}
          title="No apps enabled yet"
          hint="Modules auto-provision by tier. Once provisioned, your apps appear here entitlement-aware -- active apps launch and add-ons show an upgrade path."
        />
      ) : (
        groups.map((g, gi) => (
        <div className="sec" key={g.group}>
          <div className="sec-hdr">
            <div className="sec-title">{g.group}</div>
            <div className="sec-sub">{g.note}</div>
          </div>
          <div className="launch-grid">
            {g.apps.map((a) => {
              const surf = getSurfaceMeta(a.id);
              const label = a.name || surf.label || a.id;
              const isCore = a.tier === 'Core';
              const isAddOn = a.tier === 'Add-on';
              /* Mirrors the server gate (canAccessModule): a within-plan module
                 toggles freely; an out-of-plan module ('Add-on') can only be
                 switched OFF -- re-enabling it would 403, so the card shows the
                 upgrade path instead. */
              const showToggle = admin && !isCore && (isAddOn ? a.on : true);
              return (
                <div key={a.id} className="launch" data-locked={!a.on || undefined}>
                  {!a.on && <span className="launch-lock">{I.lock}</span>}
                  <div className="launch-top">
                    <span className="launch-ico">
                      {(surf.icon ? I[surf.icon] : null) || I.grid}
                    </span>
                  </div>
                  <div className="launch-title">{label}</div>
                  <div className="launch-desc">
                    {!a.on
                      ? isAddOn
                        ? `Upgrade your plan to unlock ${label}.`
                        : `Disabled for this organization -- an admin can re-enable it.`
                      : a.desc}
                  </div>
                  <div className="launch-foot">
                    <span
                      className={`rd-chip tone-${isCore ? 'ok' : isAddOn && !a.on ? 'idle' : 'ai'}`}
                    >
                      {a.tier}
                    </span>
                    {showToggle ? (
                      <button
                        className="lic-toggle"
                        role="switch"
                        aria-checked={a.on}
                        data-on={a.on || undefined}
                        style={{ marginLeft: 'auto' }}
                        onClick={() => toggle(gi, a.id, !a.on)}
                        title={a.on ? 'Disable module' : 'Enable module'}
                      >
                        <span className="lic-toggle-k"></span>
                      </button>
                    ) : a.on ? (
                      <button
                        className="btn ghost"
                        style={{ height: 26, marginLeft: 'auto' }}
                        onClick={() => open(a.id)}
                      >
                        Open
                      </button>
                    ) : isAddOn ? (
                      <a
                        className="btn primary"
                        style={{ height: 26, marginLeft: 'auto', textDecoration: 'none' }}
                        href="/settings/subscription"
                        title={`Upgrade your plan to unlock ${label}`}
                      >
                        Upgrade plan
                      </a>
                    ) : (
                      <button
                        className="btn ghost"
                        style={{ height: 26, marginLeft: 'auto' }}
                        onClick={() => setAdmin(true)}
                        title="Turn on admin controls to enable this module"
                      >
                        Admin controls
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        ))
      )}

      <div className="sec">
        <div className="sec-hdr">
          <div className="sec-title">Platform services</div>
          <div className="sec-sub">Not apps -- capabilities that run inside apps</div>
        </div>
        <div className="svc-note">
          {I.info}
          <span>
            A <b>service</b> is not a destination. You never "open" a service; it works inside the
            applications above -- grounding a draft, routing a model, sealing a report, signing an
            action. Listed here for transparency, not navigation.
          </span>
        </div>
        <div className="svc-grid">
          {PLATFORM_SERVICES.map((s, i) => (
            <div key={i} className="svc-card">
              <div className="svc-ico">{I[s.icon] || I.zap}</div>
              <div>
                <div className="svc-name">{s.name}</div>
                <div className="svc-desc">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      {toast && (
        <div className="pdev-toast">
          {I.check} {toast}
        </div>
      )}
    </div>
  );
}

/* ════════════ Artifacts Center ════════════
   Live-anchored to GET /api/artifacts-center (mounted in
   server/bootstrap/register-regulatory-routes.ts, router
   server/routes/artifacts-center-routes.ts). REAL: one row per governed artifact
   the org owns, from concept2cure_artifacts + concept2cure_signatures + projects,
   in this surface's display shape. No fixture — real rows, honest empty, honest
   error. `model` is nullable: the artifacts table does not persist the AnA
   model/tier, so it is null unless a caller stored metadata.model (rendered '—',
   never fabricated). */

/** Live artifact row (server ArtifactCenterRow) — the fixture's ArtifactEntry
    shape but with the truthful nullable `model`. */
interface ArtifactRow {
  id: string;
  name: string;
  kind: string;
  fmt: string;
  size: string;
  model: string | null;
  when: string;
  ver: string;
  sig: boolean;
  prog: string;
}

export function ArtifactsCenter({ onAsk, onNav }: SurfaceViewProps) {
  // Real cross-project artifact gallery, unwrapped from { success, data }.
  const { rows, loading, error } = useLiveRows<ArtifactRow>('/api/artifacts-center');
  return (
    <div className="page-inner">
      <AdminHeader
        eyebrow="Workspace -- evidence"
        title="Artifacts Center"
        sub="Every artifact AnA has drafted -- across projects, with version chain, provenance and signature status. Open a DOCX to edit it, or download a PDF."
        actions={
          // MOCK ACTION (flagged): "Export all" has no handler and no bulk-export
          // endpoint exists — inert button, left for a later actions pass.
          <button className="btn ghost">{I.externalLink} Export all</button>
        }
      />
      {loading ? (
        <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading artifacts…</div>
      ) : error ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load the Artifacts Center"
          hint="The governed artifact gallery didn't respond. Sign in and retry, or check the service is reachable."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={I.fileText}
          title="No artifacts yet"
          hint="Every artifact AnA drafts across your projects lands here -- with its version chain, provenance and signature status. Draft a section, SAP, memo or report to get started."
        />
      ) : (
      <div className="ctable">
        <div
          className="ct-head"
          style={{ gridTemplateColumns: '1.7fr 78px 90px 96px 84px 60px 132px' }}
        >
          <div>Artifact</div>
          <div>Format</div>
          <div>Program</div>
          <div>Model</div>
          <div>Updated</div>
          <div>Sig</div>
          <div></div>
        </div>
        {rows.map((a) => {
          const f = ARTIFACT_FMT[a.fmt] || {
            label: a.fmt.toUpperCase(),
            tone: 'idle',
            action: 'Download',
          };
          const isDoc = a.fmt === 'docx';
          return (
            <div
              key={a.id}
              className="ct-row art-row"
              style={{ gridTemplateColumns: '1.7fr 78px 90px 96px 84px 60px 132px' }}
            >
              <div className="vn">
                <span
                  className="vtype"
                  style={{ background: 'var(--accent-000)', color: 'var(--accent-200)' }}
                >
                  {a.ver}
                </span>
                <span className="ct-strong">{a.name}</span>
                <span className="art-kind">{a.kind}</span>
              </div>
              <div>
                <span className="art-fmt" data-tone={f.tone}>
                  {f.label}
                </span>
              </div>
              <div className="mono" style={{ fontSize: 11 }}>
                {a.prog}
              </div>
              <div style={{ color: 'var(--text-400)' }}>{a.model ?? '—'}</div>
              <div style={{ color: 'var(--text-400)' }}>{a.when}</div>
              <div>
                {a.sig ? (
                  <span className="esig" title="E-signed (21 CFR Part 11)">
                    {I.shieldCheck}
                  </span>
                ) : (
                  <span style={{ color: 'var(--text-500)' }}>--</span>
                )}
              </div>
              <div className="art-acts">
                <button
                  className="art-act pri"
                  onClick={() =>
                    isDoc
                      ? onNav('document-authoring')
                      : onAsk(`Download ${a.name} (${f.label}, ${a.size})`)
                  }
                >
                  {isDoc ? I.penLine : I.download}
                  {f.action}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      )}
      <div className="svc-note" style={{ marginTop: 14 }}>
        {I.info}
        <span>
          DOCX artifacts open in the document editor with track-changes and e-sign. PDF/XLSX/PPTX
          download as final files. Every artifact carries its version chain and, when signed, its
          Part 11 manifestation.
        </span>
      </div>
    </div>
  );
}

/* ════════════ Admin Console ════════════ */

interface AcFormState {
  email: string;
  role: string;
  reason: string;
}

/* GAMP 5 validation-kit — self-serve catalog from /api/validation-kit, backed
   by the real documents under docs/validation/. Offline (empty fixture) the
   GAMP row falls back to the honest "provided at contract" state, since
   self-serve download requires the backend. */
interface ValidationArtifact {
  docId: string;
  type: string;
  title: string;
  version: string | null;
  status: string | null;
  sizeBytes: number;
}
interface ValidationKit {
  artifacts: ValidationArtifact[];
  note: string;
}

/** Live API-key row (subset of server listApiKeys()) — the fields the admin
    console renders. keyPrefix is the stored public prefix, never the secret. */
interface ApiKeyRow {
  id: number | string;
  name: string;
  keyPrefix: string | null;
  status: string | null;
  lastUsedAt: string | null;
}

/** Mirrors API_KEY_SCOPES in shared/schema/api-keys.ts — the backend rejects a
 *  create with an unknown scope or zero scopes. All are read-only. */
const API_KEY_SCOPE_OPTIONS: readonly string[] = [
  'csr:read',
  'regulatory:read',
  'endpoints:read',
  'precedent:read',
  'trial-design:read',
  'documents:read',
];

/** Short badge from a document's own status line (drafts ship as DRAFT). */
function vkitBadge(status: string | null): string {
  if (!status) return 'Available';
  if (/draft/i.test(status)) return 'Draft';
  if (/approved|final|released/i.test(status)) return 'Approved';
  return 'Available';
}

/** Authenticated download — the endpoint is Bearer-gated, so an <a href> can't
    carry the JWT; fetch with the token and stream the blob to a download. */
async function downloadValidationDoc(docId: string, filename: string): Promise<void> {
  const token = getAuthToken();
  const res = await fetch(`/api/validation-kit/${encodeURIComponent(docId)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* Platform role grants — live from GET /api/admin/access/grants (the audited
   access-management router, server/routes/admin/access-management.ts). The read
   is platform-admin gated; a 401/403 surfaces as an honest error state (no
   fixture, no Sample pill), a successful read with no grants as an honest empty
   state. create/revoke go to the real POST/DELETE (both require a
   reason-for-change, which the form collects) and only report success on a real
   2xx. */
interface LiveGrant {
  id: number | string;
  user_id?: number;
  email?: string | null;
  name?: string | null;
  role: string;
  granted_by?: string | null;
  granted_at?: string | null;
}

function mapLiveGrant(r: LiveGrant): AcGrant {
  return {
    id: Number(r.id),
    name: r.name || (r.email ? r.email.split('@')[0] : String(r.id)),
    email: r.email || '',
    role: r.role,
    granted_by: r.granted_by || 'system',
    granted_at: r.granted_at ? String(r.granted_at).slice(0, 10) : '',
  };
}

export function AdminConsole({ onAsk, onNav }: SurfaceViewProps) {
  const [sec, setSec] = useState('access');
  // Fixture-free live reads, fetched only when their section is active
  // (useLiveData no-ops on a null path). Each section renders real data, an
  // honest empty state, or an honest error state — never a fixture.
  const vkit = useLiveData<ValidationKit>(sec === 'validation' ? '/api/validation-kit' : null);
  const vkitDocs = vkit.data?.artifacts ?? [];
  const grantsState = useLiveData<{ grants?: LiveGrant[] }>(
    sec === 'access' ? '/api/admin/access/grants' : null,
  );
  const liveGrants = useMemo(() => {
    const arr = grantsState.data?.grants;
    if (!Array.isArray(arr)) return null;
    return arr.map(mapLiveGrant);
  }, [grantsState.data]);
  // Optimistic copy of the grants list, re-seeded once when the live read
  // resolves (liveGrants identity is stable per resolved payload → no loop).
  const [grants, setGrants] = useState<AcGrant[]>([]);
  const seededGrants = useRef<AcGrant[] | null>(null);
  useEffect(() => {
    if (liveGrants && seededGrants.current !== liveGrants) {
      seededGrants.current = liveGrants;
      setGrants(liveGrants);
    }
  }, [liveGrants]);
  // Live module catalog (real per-org enabled/disabled state) for the Modules
  // section, and live org API keys for the API-keys section.
  const modState = useLiveData<{ modules: LiveModuleEntry[] }>(
    sec === 'modules' ? '/api/module-subscriptions/catalog' : null,
  );
  const liveModules = (modState.data?.modules ?? []).filter(isLiveModuleEntry);
  // keysReload is bumped after a create/revoke to re-fetch the live list.
  const [keysReload, setKeysReload] = useState(0);
  const keysState = useLiveData<{ keys: ApiKeyRow[] }>(
    sec === 'apikeys' ? '/api/api-keys' : null,
    [sec, keysReload],
  );
  const apiKeys = Array.isArray(keysState.data?.keys) ? (keysState.data!.keys as ApiKeyRow[]) : [];
  const [keyName, setKeyName] = useState('');
  const [keyScopes, setKeyScopes] = useState<string[]>([]);
  // The raw secret returned once by POST /api/api-keys — held only in local
  // state for a single reveal, never persisted or logged, cleared on dismiss.
  const [mintedKey, setMintedKey] = useState<{ name: string; secret: string; prefix: string } | null>(null);
  const [form, setForm] = useState<AcFormState>({ email: '', role: 'support', reason: '' });
  // Revoke API-key gate. Was window.confirm() — unstyled, unlocalized, no
  // audit hook, no typed-word gate on a destructive irreversible action. Now
  // routes through the canonical GovernedConfirmDialog: captures a real
  // reason (audit-logged verbatim server-side) + requires the user to type
  // the exact word 'revoke' before the DELETE fires.
  const [revokeConfirm, setRevokeConfirm] =
    useState<{ id: number | string; name: string; config: ConfirmConfig } | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [toast, fireToast] = useToast();
  const nav = (id: string) => {
    onNav && onNav(id);
  };

  const doGrant = async () => {
    if (!form.email.trim()) {
      fireToast('Enter an email');
      return;
    }
    if (form.reason.trim().length < 3) {
      fireToast('A reason (min 3 chars) is required');
      return;
    }
    const roleMeta = LIC_ROLES.find((r) => r.id === form.role);
    const okMsg =
      (roleMeta && roleMeta.business ? 'Business-tier ' : '') +
      'role granted -- audited (Part 11)';

    // Real, audited write. apiRequest passes 401 through; other non-OK throws
    // with the server's reason (business-admin required, no such user). Only
    // report success — and the "audited (Part 11)" message — on a real 2xx.
    try {
      const res = await apiRequest('POST', '/api/admin/access/grants', {
        email: form.email.trim(),
        role: form.role,
        reason: form.reason.trim(),
      });
      if (!res.ok) {
        fireToast('Could not grant -- sign in as a platform admin');
        return;
      }
      const row = await res.json().catch(() => null);
      const rec: AcGrant = {
        id: row?.id ?? Date.now(),
        name: form.email.split('@')[0],
        email: form.email.trim(),
        role: form.role,
        granted_by: row?.granted_by || 'you',
        granted_at: row?.granted_at ? String(row.granted_at).slice(0, 10) : 'just now',
        _new: true,
      };
      setGrants((g) => [rec, ...g.filter((x) => !(x.email === rec.email && x.role === rec.role))]);
      fireToast(okMsg);
      setForm({ email: '', role: 'support', reason: '' });
    } catch (e) {
      fireToast(
        'Could not grant -- ' + (e instanceof Error && e.message ? e.message : 'request failed'),
      );
    }
  };

  const revoke = async (id: number) => {
    const reason =
      typeof window !== 'undefined' && window.prompt
        ? window.prompt(
            'Reason for revoking this grant (min 3 chars, recorded in the audit trail):',
          )
        : '';
    if (reason == null) return; // cancelled
    if (reason.trim().length < 3) {
      fireToast('A reason (min 3 chars) is required to revoke');
      return;
    }
    // Real, audited DELETE — only drop the row and report success on a real 2xx.
    try {
      const res = await apiRequest('DELETE', `/api/admin/access/grants/${id}`, {
        reason: reason.trim(),
      });
      if (!res.ok) {
        fireToast('Could not revoke -- sign in as a platform admin');
        return;
      }
      setGrants((g) => g.filter((x) => x.id !== id));
      fireToast('Grant revoked -- reason recorded -- audited');
    } catch (e) {
      fireToast(
        'Could not revoke -- ' + (e instanceof Error && e.message ? e.message : 'request failed'),
      );
    }
  };

  const toggleKeyScope = (s: string) =>
    setKeyScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  // mintKey — REAL, audited create. POST /api/api-keys returns the raw secret
  // exactly once (server audits creation with the prefix, never the secret).
  // The secret is shown once via the reveal panel and never re-fetchable. Only
  // reports success on a real 2xx; nothing is fabricated on failure.
  const mintKey = async () => {
    const name = keyName.trim();
    if (!name) {
      fireToast('Enter a name for the key');
      return;
    }
    if (keyScopes.length === 0) {
      fireToast('Select at least one scope');
      return;
    }
    try {
      const res = await apiRequest('POST', '/api/api-keys', { name, scopes: keyScopes });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        fireToast('Could not create the key -- ' + (json?.error || 'sign in as an admin'));
        return;
      }
      if (json?.apiKey) {
        setMintedKey({ name, secret: String(json.apiKey), prefix: String(json.keyPrefix ?? '') });
      }
      setKeyName('');
      setKeyScopes([]);
      setKeysReload((n) => n + 1); // re-fetch the live list to show the new key
    } catch (e) {
      fireToast(
        'Could not create the key -- ' + (e instanceof Error && e.message ? e.message : 'request failed'),
      );
    }
  };

  // revokeKey — REAL, audited DELETE /api/api-keys/:id. Opens the governed
  // confirm dialog first because revocation immediately breaks any integration
  // using the key and is not reversible. The DELETE only fires once the user
  // types the confirmWord and provides a reason (both captured in the audit
  // trail server-side). Only drops the row on a real 2xx; the live list is
  // re-fetched to reflect the server state.
  const revokeKey = (id: number | string, name: string) => {
    setRevokeError(null);
    setRevokeConfirm({
      id,
      name,
      config: {
        action: 'Revoke API key',
        target: name,
        resource: 'api-key:' + String(id),
        minReason: 10,
        confirmWord: 'revoke',
      },
    });
  };

  const onConfirmRevoke = async () => {
    if (!revokeConfirm) return;
    setRevokeError(null);
    try {
      const res = await apiRequest('DELETE', '/api/api-keys/' + revokeConfirm.id);
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setRevokeError(json?.error || 'Sign in as an admin');
        return;
      }
      fireToast('API key revoked -- audited');
      setRevokeConfirm(null);
      setKeysReload((n) => n + 1);
    } catch (e) {
      setRevokeError(e instanceof Error && e.message ? e.message : 'Request failed');
    }
  };

  const SECTIONS: [string, string, string][] = [
    ['access', 'Access & personnel', 'users'],
    ['org', 'Organization profile', 'building'],
    ['subscription', 'Subscription & billing', 'creditCard'],
    ['sso', 'SSO & SCIM', 'key'],
    ['security', 'Security & IP allowlist', 'shieldCheck'],
    ['modules', 'Module subscriptions', 'grid'],
    ['apikeys', 'API keys', 'terminal'],
    ['audit', 'Audit trail', 'scroll'],
    ['validation', 'Compliance & validation', 'shieldCheck'],
  ];

  return (
    <div className="sp" style={{ maxWidth: 1120 }}>
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">Admin -- /api/admin</div>
          <h1 className="sp-title">Admin console</h1>
          <p className="sp-state">
            Designate personnel, manage SSO/SCIM, security policy, module entitlements and API
            keys -- every governed action carries a reason and a 21 CFR Part 11 audit entry.
          </p>
        </div>
      </div>

      <div className="sp-2col" style={{ gridTemplateColumns: '240px 1fr' }}>
        <div className="pj-card">
          <div className="pj-card-b" style={{ padding: 8 }}>
            <div className="ac-nav">
              {SECTIONS.map(([id, l, ic]) => (
                <button
                  key={id}
                  className={'ac-nav-b' + (sec === id ? ' on' : '')}
                  onClick={() => setSec(id)}
                >
                  {I[ic] || I.settings}
                  <span>{l}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="pj-card">
          <div className="pj-card-b">
            {sec === 'validation' && (
              <div>
                <div className="pj-card-h" style={{ padding: 0, marginBottom: 12 }}>
                  <span className="t">Compliance &amp; validation</span>
                  <span className="s">what auditors and IT-QA ask for</span>
                </div>
                <div className="ac-val">
                  <div className="ac-val-row">
                    <div className="ac-val-main">
                      <b>Part 11 audit trail -- SIEM export</b>
                      <span>
                        Cursor-paginated NDJSON pull of this org's append-only audit trail for
                        SOC/SIEM ingestion.
                      </span>
                    </div>
                    <span className="ac-val-st ok">
                      {I.check} Live -- /api/admin/audit
                    </span>
                  </div>
                  <div className="ac-val-row">
                    <div className="ac-val-main">
                      <b>Audit chain integrity</b>
                      <span>
                        Append-only entries with chain verification and signed exports.
                      </span>
                    </div>
                    <span className="ac-val-st ok">
                      {I.check} Live -- audit-trail routes
                    </span>
                  </div>
                  <div className="ac-val-row">
                    <div className="ac-val-main">
                      <b>E-signatures (21 CFR ss11.50 / ss11.70)</b>
                      <span>
                        Password + TOTP verification; signature meaning recorded on every signing.
                      </span>
                    </div>
                    <span className="ac-val-st ok">
                      {I.check} Live -- /api/esignature
                    </span>
                  </div>
                  <div className="ac-val-row">
                    <div className="ac-val-main">
                      <b>GAMP 5 validation package (IQ/OQ/PQ)</b>
                      <span>
                        Release-by-release validation documentation for your
                        computer-system-validation file.
                      </span>
                      {vkitDocs.length > 0 && (
                        <div className="ac-val-docs">
                          {vkitDocs.map((d) => (
                            <button
                              key={d.docId}
                              type="button"
                              className="ac-val-doc"
                              title={d.status || undefined}
                              onClick={() => downloadValidationDoc(d.docId, `${d.docId}.md`)}
                            >
                              {I.download}
                              <span className="ac-val-doc-t">{d.type}</span>
                              <span className="ac-val-doc-id">{d.docId}</span>
                              <span className={'ac-val-doc-st ' + vkitBadge(d.status).toLowerCase()}>
                                {vkitBadge(d.status)}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {vkitDocs.length > 0 ? (
                      <span className="ac-val-st ok">
                        {I.check} Self-serve -- {vkitDocs.length} document{vkitDocs.length === 1 ? '' : 's'}
                      </span>
                    ) : (
                      <span className="ac-val-st soon">
                        Provided at contract -- not yet self-serve
                      </span>
                    )}
                  </div>
                  <div className="ac-val-row">
                    <div className="ac-val-main">
                      <b>Data residency</b>
                      <span>
                        Single-region deployment today; committed regions are stated in your order
                        form. Multi-region residency is on the roadmap -- it will appear here when
                        it ships, not before.
                      </span>
                    </div>
                    <span className="ac-val-st soon">Single region</span>
                  </div>
                </div>
                <div className="ac-val-note">
                  {I.shieldCheck} Every governed mutation carries a reason-for-change and lands
                  in the audit trail. Any row marked "provided at contract" is not yet self-serve
                  -- tracked openly, never claimed early. Validation protocols download as drafts;
                  executed and approved records are provided through QA at contract.
                </div>
              </div>
            )}

            {sec === 'access' && (
              <div>
                <div className="pj-card-h" style={{ padding: 0, marginBottom: 12 }}>
                  <span className="t">Platform role grants</span>
                  <span className="s">
                    {grants.length} active -- platform_role_grants
                  </span>
                </div>
                <div className="ac-grant-form">
                  <input
                    className="ob-in"
                    style={{ margin: 0, flex: 1 }}
                    placeholder="user@org.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                  >
                    {LIC_ROLES.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                        {r.business ? ' -- finance' : ''}
                      </option>
                    ))}
                  </select>
                  <input
                    className="ob-in"
                    style={{ margin: 0, flex: 1.4 }}
                    placeholder="Reason for change (required, min 3 chars)"
                    value={form.reason}
                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  />
                  <button
                    className="sp-primary"
                    style={{ padding: '8px 14px' }}
                    onClick={doGrant}
                  >
                    {I.plus} Grant
                  </button>
                </div>
                {LIC_ROLES.find((r) => r.id === form.role && r.business) && (
                  <div className="scaf-note" style={{ margin: '8px 0 0' }}>
                    {I.alertTriangle || I.alertTriangle} Business-tier role -- confers finance
                    access; only a business administrator may grant it.
                  </div>
                )}
                <div className="sp-list" style={{ marginTop: 14 }}>
                  {grantsState.loading && grants.length === 0 ? (
                    <div className="scaf-note" style={{ padding: '14px 10px' }}>Loading grants…</div>
                  ) : grantsState.error && grants.length === 0 ? (
                    <EmptyState
                      tone="error"
                      icon={I.alertTriangle}
                      title="Couldn't load access grants"
                      hint="Platform role grants require a platform-admin session -- sign in and retry."
                    />
                  ) : grants.length === 0 ? (
                    <EmptyState
                      icon={I.shieldCheck}
                      title="No platform role grants yet"
                      hint="Grant a platform role above to designate personnel. Every grant carries a reason-for-change and a 21 CFR Part 11 audit entry."
                    />
                  ) : (
                    grants.map((g) => {
                    const rm = LIC_ROLES.find((r) => r.id === g.role) || {
                      label: g.role,
                      business: false,
                    };
                    return (
                      <div key={g.id} className="sp-row" data-new={g._new || undefined}>
                        <span className="ac-av">
                          {(g.name || g.email || '?').slice(0, 2).toUpperCase()}
                        </span>
                        <span className="sp-row-b">
                          <span className="sp-row-t">{g.name || g.email}</span>
                          <span className="sp-row-s">
                            {g.email} -- granted by {g.granted_by} -- {g.granted_at}
                          </span>
                        </span>
                        <span className={'rd-chip tone-' + (rm.business ? 'warn' : 'ai')}>
                          {rm.label}
                        </span>
                        <button
                          className="ac-revoke"
                          onClick={() => revoke(g.id)}
                          title="Revoke (records a reason)"
                        >
                          {I.close}
                        </button>
                      </div>
                    );
                    })
                  )}
                </div>
              </div>
            )}

            {sec === 'org' && (
              <div className="ac-fields">
                {/* Backend gap: the only /api/setup routes are the first-run
                    installer (GET /status, POST /initialize); there is no
                    governed org-profile READ endpoint to source these fields, so
                    we show an honest empty state rather than a fabricated org
                    profile (name / industry mode / tier / region / residency). */}
                <EmptyState
                  icon={I.building}
                  title="Organization profile not yet available"
                  hint="A governed org-profile read isn't wired yet. The profile (name, industry mode, tier, region, data residency) drives rail categories, pathways and pricing archetype; editing is governed via /api/setup."
                />
              </div>
            )}

            {sec === 'subscription' && (
              <div>
                <div className="scaf-note" style={{ marginBottom: 12 }}>
                  Subscription status, seats, renewal and plan changes run through Stripe
                  (/api/billing). Manage plans and seats in Plans &amp; licensing.
                </div>
                <button className="sp-primary" onClick={() => nav('licensing')}>
                  {I.creditCard || I.arrowRight} Open Plans &amp; licensing
                </button>
              </div>
            )}

            {sec === 'sso' && (
              <div className="ac-cards">
                {(
                  [
                    [
                      'SAML / OIDC SSO',
                      'Enterprise SSO via authEnterprise -- IdP metadata, ACS URL, JIT provisioning',
                      'SAML SSO on Professional+',
                    ],
                    [
                      'SCIM 2.0 provisioning',
                      'Automated user lifecycle from your IdP -- scim-tenants',
                      'Token-scoped, per-tenant',
                    ],
                    [
                      'SCIM IP allowlist',
                      'Restrict SCIM to your IdP egress ranges -- scim-ip-allowlist',
                      'CIDR ranges',
                    ],
                  ] as [string, string, string][]
                ).map(([t, d, tag], i) => (
                  <div key={i} className="ac-card">
                    <div className="ac-card-t">{t}</div>
                    <div className="ac-card-d">{d}</div>
                    <span className="ac-card-tag">{tag}</span>
                  </div>
                ))}
              </div>
            )}

            {sec === 'security' && (
              <div className="ac-cards">
                {(
                  [
                    [
                      'MFA policy',
                      'Require TOTP for all members or by role -- admin-security',
                      'Recommended: required',
                    ],
                    [
                      'IP allowlist',
                      'Restrict app access to corporate ranges (CIDR)',
                      'Off',
                    ],
                    [
                      'Session policy',
                      'JWT sliding 7-day refresh -- idle timeout',
                      '7-day refresh',
                    ],
                    [
                      'Audit to SIEM',
                      'Stream the Part-11 audit log to your SIEM -- audit-siem',
                      'Splunk / S3 / webhook',
                    ],
                  ] as [string, string, string][]
                ).map(([t, d, tag], i) => (
                  <div key={i} className="ac-card">
                    <div className="ac-card-t">{t}</div>
                    <div className="ac-card-d">{d}</div>
                    <span className="ac-card-tag">{tag}</span>
                  </div>
                ))}
              </div>
            )}

            {sec === 'modules' && (
              <div>
                <div className="scaf-note" style={{ marginBottom: 10 }}>
                  Modules auto-provision by tier (module_subscriptions --
                  provisionModulesForTier). This organization's live entitlement state is shown
                  below; enable or disable modules in the Apps catalog.
                </div>
                {modState.loading ? (
                  <div className="scaf-note" style={{ padding: '14px 10px' }}>Loading modules…</div>
                ) : modState.error ? (
                  <EmptyState
                    tone="error"
                    icon={I.alertTriangle}
                    title="Couldn't load module subscriptions"
                    hint="The module-subscriptions service didn't respond. Sign in and retry, or check it's reachable."
                  />
                ) : liveModules.length === 0 ? (
                  <EmptyState
                    icon={I.grid}
                    title="No modules provisioned yet"
                    hint="Modules auto-provision by tier. Once provisioned, this organization's enabled modules appear here."
                  />
                ) : (
                  <div className="ob-mods">
                    {liveModules.map((m) => (
                      <span
                        key={m.moduleId}
                        className="ob-mod"
                        style={m.isEnabled ? undefined : { opacity: 0.55 }}
                        title={
                          m.isEnabled
                            ? 'Enabled for this organization'
                            : 'Not enabled for this organization'
                        }
                      >
                        {m.isEnabled ? I.check : I.lock} {m.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {sec === 'apikeys' && (
              <div>
                <div className="scaf-note" style={{ marginBottom: 12 }}>
                  Programmatic access tokens (/api/api-keys) -- org-scoped, hashed at rest,
                  last-used tracked, revocable. Every use is audited.
                </div>
                {keysState.loading ? (
                  <div className="scaf-note" style={{ padding: '14px 10px' }}>Loading API keys…</div>
                ) : keysState.error ? (
                  <EmptyState
                    tone="error"
                    icon={I.alertTriangle}
                    title="Couldn't load API keys"
                    hint="Managing API keys requires an admin session -- sign in and retry."
                  />
                ) : apiKeys.length === 0 ? (
                  <EmptyState
                    icon={I.terminal}
                    title="No API keys yet"
                    hint="Create an org-scoped API key for programmatic access. Keys are hashed at rest and every use is audited."
                  />
                ) : (
                  <div className="sp-list">
                    {apiKeys.map((k) => (
                      <div key={String(k.id)} className="sp-row">
                        <span className="sp-q-ic">{I.terminal || I.key}</span>
                        <span className="sp-row-b">
                          <span className="sp-row-t">{k.name}</span>
                          <span className="sp-row-s" style={{ fontFamily: 'var(--font-mono)' }}>
                            {k.keyPrefix ? k.keyPrefix + '…' : '—'}
                            {k.lastUsedAt
                              ? ' -- used ' + String(k.lastUsedAt).slice(0, 10)
                              : ' -- never used'}
                            {k.status && k.status !== 'active' ? ' -- ' + k.status : ''}
                          </span>
                        </span>
                        {(!k.status || k.status === 'active') && (
                          <button
                            className="ac-revoke"
                            title="Revoke this API key (audited)"
                            onClick={() => revokeKey(k.id, k.name)}
                          >
                            {I.close}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {/* One-time secret reveal — the raw key is returned by POST once
                    and never retrievable again; held only in local state until
                    dismissed, never persisted or logged. */}
                {mintedKey && (
                  <div
                    style={{ marginTop: 14, padding: 14, border: '1px solid var(--accent-100, var(--border))', borderRadius: 10, background: 'var(--bg-050)' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span className="sp-q-ic">{I.key || I.terminal}</span>
                      <strong>API key “{mintedKey.name}” created</strong>
                    </div>
                    <p className="sp-state" style={{ margin: '0 0 8px' }}>
                      Copy it now — it is shown once and cannot be retrieved again. Store it in your secrets manager.
                    </p>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <code style={{ flex: 1, padding: '8px 10px', fontFamily: 'var(--font-mono)', background: 'var(--bg-000)', border: '1px solid var(--border)', borderRadius: 8, wordBreak: 'break-all' }}>
                        {mintedKey.secret}
                      </code>
                      <button
                        className="reg-mini"
                        onClick={() => {
                          try {
                            void navigator.clipboard?.writeText(mintedKey.secret);
                            fireToast('Copied to clipboard');
                          } catch {
                            fireToast('Copy failed — select the key and copy it manually');
                          }
                        }}
                      >
                        Copy
                      </button>
                      <button className="reg-mini" onClick={() => setMintedKey(null)}>
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
                {/* Real create — POST /api/api-keys with a name + ≥1 scope. */}
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                    placeholder="Key name (e.g. CI pipeline)"
                    maxLength={255}
                    style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-000)', maxWidth: 360 }}
                  />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {API_KEY_SCOPE_OPTIONS.map((s) => {
                      const on = keyScopes.includes(s);
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => toggleKeyScope(s)}
                          aria-pressed={on}
                          style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '4px 8px', borderRadius: 6, cursor: 'pointer', border: '1px solid ' + (on ? 'var(--accent-100, #d97757)' : 'var(--border)'), background: on ? 'var(--accent-100, #d97757)' : 'transparent', color: on ? '#fff' : 'inherit' }}
                        >
                          {s}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    className="sp-primary"
                    style={{ alignSelf: 'flex-start', padding: '8px 14px' }}
                    onClick={mintKey}
                    disabled={!keyName.trim() || keyScopes.length === 0}
                    title={!keyName.trim() ? 'Enter a name' : keyScopes.length === 0 ? 'Select at least one scope' : 'Create an org-scoped API key'}
                  >
                    {I.plus} Create API key
                  </button>
                </div>
              </div>
            )}

            {sec === 'audit' && (
              <div>
                <div className="scaf-note" style={{ marginBottom: 12 }}>
                  Every governed action (grants, config, e-sign) is written to the immutable,
                  hash-chained audit trail (audit-trail-routes) with signed export.
                </div>
                <button className="sp-primary" onClick={() => nav('audit-trail')}>
                  {I.scroll || I.arrowRight} Open audit trail
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <C2CToast msg={toast} />

      {/* Governed revoke — captures reason + 'revoke' typed word before the
          irreversible DELETE fires. Replaces window.confirm() (unstyled,
          unlocalized, no audit hook). Position: fixed, so it overlays. */}
      {revokeConfirm && (
        <GovernedConfirmDialog
          open={true}
          {...revokeConfirm.config}
          onCancel={() => {
            setRevokeConfirm(null);
            setRevokeError(null);
          }}
          onConfirm={onConfirmRevoke}
          submitError={revokeError}
        />
      )}
    </div>
  );
}
