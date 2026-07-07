import React, { useState, useEffect } from 'react';
import { I } from '../icons';
import { SampleTag } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import { getSurfaceMeta } from '../registryModel';
import { LIC_ROLES } from '../fixtures/licensing';
import {
  AUDIT_LOG,
  AUDIT_KINDS,
  APPS_CATALOG,
  APP_LICENSE,
  PLATFORM_SERVICES,
  ARTIFACTS,
  ARTIFACT_FMT,
  AC_GRANTS,
} from '../fixtures/admin-data';
import type {
  AuditEntry,
  AppsCatalogGroup,
  AppLicense,
  AcGrant,
} from '../fixtures/admin-data';
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
  title: string;
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

/* ════════════ Setup (org config) ════════════ */

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
        title="Setup"
        sub="Organization profile, security defaults, and module configuration. Changes apply to every member of this tenant."
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
                Client type<small>Sets the default rail focus and AnA framing.</small>
              </div>
              <div className="txw-row-r">
                <div className="txw-row-r-grid">
                  {['medtech', 'biotech', 'pharma', 'diagnostics', 'cro', 'health'].map((t) => (
                    <button
                      key={t}
                      className="txw-pchip"
                      data-on={s.clientType === t || undefined}
                      onClick={() => set('clientType', t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
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

/* ════════════ Audit trail -- immutable hash-chain viewer (ss11.10(e)) ════════════ */

export function AuditTrail({ onAsk }: SurfaceViewProps) {
  const [kind, setKind] = useState('all');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [chainView, setChainView] = useState(false);
  const [exporting, setExporting] = useState(false);
  const term = q.toLowerCase();

  const log = AUDIT_LOG.filter(
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
    n: k.id === 'all' ? AUDIT_LOG.length : AUDIT_LOG.filter((e) => e.kind === k.id).length,
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

  const entry = sel ? AUDIT_LOG.find((e) => e.id === sel) : null;

  const doExport = () => {
    setExporting(true);
    setTimeout(() => setExporting(false), 2000);
  };

  /* Hash-chain integrity check (visual) */
  const chainStatus = (() => {
    const all = AUDIT_LOG;
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
        sub={`${AUDIT_LOG.length} entries -- hash-chained -- append-only -- 21 CFR Part 11 ss11.10(e)`}
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
              {exporting ? 'Generating...' : ''}
              {I.scroll} Export signed PDF
            </button>
          </React.Fragment>
        }
      />

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
          HEAD {AUDIT_LOG[0]?.hash}
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
          {AUDIT_LOG.map((e, i) => (
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
                {i < AUDIT_LOG.length - 1 && (
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
        historical entry breaks the chain. Export produces a Part 11-compliant signed PDF with the
        full verification manifest.
      </div>
    </div>
  );
}

/* ════════════ Apps catalog ════════════ */

const BILLING_TONE: Record<string, string> = { paid: 'ok', active: 'ai' };

export function Apps({ onAsk, onNav }: SurfaceViewProps) {
  const open = (id: string) => onNav(id);
  const [lic, setLic] = useState<AppLicense>(APP_LICENSE);
  const [cat, setCat] = useState<AppsCatalogGroup[]>(APPS_CATALOG);
  const [admin, setAdmin] = useState(false);
  const [toast, setToast] = useState('');

  const tierLabel = lic.tier || 'professional';
  const pj = lic.usage?.projects || { current: 0, limit: 0 };
  const us = lic.usage?.users || { current: 0, limit: 0 };

  const toggle = (groupIdx: number, appId: string, next: boolean) => {
    /* PUT /api/module-subscriptions/:moduleId/toggle -- wired when live API lands */
    setCat((prev) =>
      prev.map((g, gi) =>
        gi !== groupIdx
          ? g
          : {
              ...g,
              apps: g.apps.map((a) => (a.id === appId ? { ...a, on: next } : a)),
            },
      ),
    );
    const surf = getSurfaceMeta(appId);
    setToast((next ? 'Enabled ' : 'Disabled ') + (surf.label || appId));
    setTimeout(() => setToast(''), 2600);
  };

  return (
    <div className="page-inner">
      <AdminHeader
        eyebrow="Workspace"
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

      {cat.map((g, gi) => (
        <div className="sec" key={g.group}>
          <div className="sec-hdr">
            <div className="sec-title">{g.group}</div>
            <div className="sec-sub">{g.note}</div>
          </div>
          <div className="launch-grid">
            {g.apps.map((a) => {
              const surf = getSurfaceMeta(a.id);
              const isCore = a.tier === 'Core';
              const canToggle =
                admin && !isCore && a.tier !== 'Add-on'
                  ? true
                  : admin && a.on && a.tier === 'Add-on';
              return (
                <div key={a.id} className="launch" data-locked={!a.on || undefined}>
                  {!a.on && <span className="launch-lock">{I.lock}</span>}
                  <div className="launch-top">
                    <span className="launch-ico">
                      {(surf.icon ? I[surf.icon] : null) || I.grid}
                    </span>
                  </div>
                  <div className="launch-title">{surf.label || a.id}</div>
                  <div className="launch-desc">
                    {!a.on
                      ? `Upgrade your plan to unlock ${surf.label || a.id}.`
                      : a.desc}
                  </div>
                  <div className="launch-foot">
                    <span
                      className={`rd-chip tone-${a.tier === 'Core' ? 'ok' : a.tier === 'Add-on' && !a.on ? 'idle' : 'ai'}`}
                    >
                      {a.tier}
                    </span>
                    {admin && !isCore && (a.on || a.tier === 'Add-on') ? (
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
                    ) : (
                      <a
                        className="btn primary"
                        style={{ height: 26, marginLeft: 'auto', textDecoration: 'none' }}
                        href="/settings/subscription"
                        title={`Upgrade your plan to unlock ${surf.label || a.id}`}
                      >
                        Upgrade plan
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

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

/* ════════════ Artifacts Center ════════════ */

export function ArtifactsCenter({ onAsk, onNav }: SurfaceViewProps) {
  return (
    <div className="page-inner">
      <AdminHeader
        eyebrow="Workspace -- evidence"
        title="Artifacts Center"
        sub="Every artifact AnA has drafted -- across projects, with version chain, provenance and signature status. Open a DOCX to edit it, or download a PDF."
        actions={
          <button className="btn ghost">{I.externalLink} Export all</button>
        }
      />
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
        {ARTIFACTS.map((a) => {
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
              <div style={{ color: 'var(--text-400)' }}>{a.model}</div>
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

export function AdminConsole({ onAsk, onNav }: SurfaceViewProps) {
  const [sec, setSec] = useState('access');
  const [grants, setGrants] = useState<AcGrant[]>(AC_GRANTS);
  const [form, setForm] = useState<AcFormState>({ email: '', role: 'support', reason: '' });
  const [toast, fireToast] = useToast();
  const nav = (id: string) => {
    try {
      localStorage.setItem('c2c_open_surface', id);
    } catch (_e) {
      /* noop */
    }
    onNav && onNav(id);
  };

  const doGrant = () => {
    if (!form.email.trim()) {
      fireToast('Enter an email');
      return;
    }
    if (form.reason.trim().length < 3) {
      fireToast('A reason (min 3 chars) is required');
      return;
    }
    const roleMeta = LIC_ROLES.find((r) => r.id === form.role);
    const rec: AcGrant = {
      id: Date.now(),
      name: form.email.split('@')[0],
      email: form.email.trim(),
      role: form.role,
      granted_by: 'you',
      granted_at: 'just now',
      _new: true,
    };
    setGrants((g) => [rec, ...g]);
    fireToast(
      (roleMeta && roleMeta.business ? 'Business-tier ' : '') +
        'role granted -- audited (Part 11)',
    );
    setForm({ email: '', role: 'support', reason: '' });
  };

  const revoke = (id: number) => {
    setGrants((g) => g.filter((x) => x.id !== id));
    fireToast('Grant revoked -- reason recorded -- audited');
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
          <h1 className="sp-title">
            Admin console <SampleTag sample={true} />
          </h1>
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
                    </div>
                    <span className="ac-val-st soon">
                      Provided at contract -- not yet self-serve
                    </span>
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
                  in the audit trail. The two rows marked "provided at contract" are the only items
                  not yet self-serve -- tracked openly, never claimed early.
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
                  {grants.map((g) => {
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
                  })}
                </div>
              </div>
            )}

            {sec === 'org' && (
              <div className="ac-fields">
                {(
                  [
                    ['Organization name', 'Bright Biosciences'],
                    ['Organization type (industry_mode)', 'Virtual biotech'],
                    ['Current tier', 'professional'],
                    ['Payment status', 'active'],
                    ['Region', 'US -- FDA primary'],
                    ['Data residency', 'US-East'],
                  ] as [string, string][]
                ).map(([k, v], i) => (
                  <div key={i} className="ac-field">
                    <span className="k">{k}</span>
                    <span className="v">{v}</span>
                  </div>
                ))}
                <div className="scaf-note" style={{ marginTop: 6 }}>
                  Profile drives rail categories, pathways and pricing archetype. Editing is
                  governed via /api/setup.
                </div>
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
                  provisionModulesForTier). Toggle to enable/disable for this organization;
                  locked modules show an upgrade path, never a dead button.
                </div>
                <div className="ob-mods">
                  {[
                    'AI Copilot (AnA)',
                    'eCTD Authoring',
                    '510(k) Module',
                    'CER Generation',
                    'CMC / Module 3',
                    'Advanced Analytics',
                    'SAML SSO',
                    'Compliance Audit Pack',
                    'Deep Research',
                    'Biostatistics',
                  ].map((m, i) => (
                    <span key={i} className="ob-mod">
                      {I.check} {m}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {sec === 'apikeys' && (
              <div>
                <div className="scaf-note" style={{ marginBottom: 12 }}>
                  Programmatic access tokens (/api/api-keys) -- org-scoped, hashed at rest,
                  last-used tracked, revocable. Every use is audited.
                </div>
                <div className="sp-list">
                  {(
                    [
                      ['Production integration', 'pk_live_....4f2a', 'used 2h ago'],
                      ['CI validation', 'pk_live_....9c11', 'used 3d ago'],
                    ] as [string, string, string][]
                  ).map(([n, k, u], i) => (
                    <div key={i} className="sp-row">
                      <span className="sp-q-ic">{I.terminal || I.key}</span>
                      <span className="sp-row-b">
                        <span className="sp-row-t">{n}</span>
                        <span className="sp-row-s" style={{ fontFamily: 'var(--font-mono)' }}>
                          {k} -- {u}
                        </span>
                      </span>
                      <button className="ac-revoke">{I.close}</button>
                    </div>
                  ))}
                </div>
                <button
                  className="sp-primary"
                  style={{ marginTop: 12, padding: '8px 14px' }}
                  onClick={() => fireToast('Create API key (POST /api/api-keys)')}
                >
                  {I.plus} Create API key
                </button>
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
    </div>
  );
}
