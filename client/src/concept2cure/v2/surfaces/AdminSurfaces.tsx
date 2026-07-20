import React, { useState, useEffect, useMemo, useRef } from 'react';
import { I } from '../icons';
import { SampleTag, matchesShape, unwrapList, useLive } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';
import { getAuthToken, getOrgId } from '@/utils/authToken';
import type { SurfaceViewProps } from '../surfaceViews';
import { getSurfaceMeta } from '../registryModel';
import { LIC_ROLES } from '../fixtures/licensing';
import {
  APPS_CATALOG,
  APP_LICENSE,
  PLATFORM_SERVICES,
  ARTIFACTS,
  ARTIFACT_FMT,
  AC_GRANTS,
} from '../fixtures/admin-data';
import type {
  AppsCatalogApp,
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

/* ── Shared inline helpers (also consumed by the extracted AuditTrail —
   AdminAuditTrail.tsx — which was split out to keep this module under the
   repo-health size gate) ── */

export interface AdminHeaderProps {
  eyebrow: string;
  title: React.ReactNode;
  sub?: string;
  actions?: React.ReactNode;
}

export function AdminHeader({ eyebrow, title, sub, actions }: AdminHeaderProps) {
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

export function useToast(): [string, (m: string) => void] {
  const [msg, setMsg] = useState('');
  const fire = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 2400);
  };
  return [msg, fire];
}

export function C2CToast({ msg }: { msg: string }) {
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
   Live-wired to the governed org-profile + org-settings backend:
     GET   /api/organizations/:id           → { success, organization }
     PATCH /api/organizations/:id/profile   → { name, clientType, reason } —
           org-admin gated, audited (organizations-routes.ts)
     GET   /api/organizations/:id/settings  → { success, settings } (security /
           translation sections, defaults merged server-side)
     PATCH /api/organizations/:id/settings  → { settings, reason } — governed
           form, org-admin gated, audited
   Saves require a reason-for-change (min 3 chars) and are written to the audit
   trail. Offline / unauthenticated the panel keeps its browser-local draft with
   the Sample pill — it never pretends a write happened. /api/setup (the
   first-run installer) is intentionally NOT called from here. */

/** Live GET /api/organizations/:id → the fields this panel edits. */
function parseOrgProfile(x: unknown): { name: string; clientType: string | null } | null {
  if (!x || typeof x !== 'object') return null;
  const org = (x as { organization?: unknown }).organization;
  if (!org || typeof org !== 'object') return null;
  const o = org as Record<string, unknown>;
  if (typeof o.name !== 'string') return null;
  return { name: o.name, clientType: typeof o.clientType === 'string' ? o.clientType : null };
}

/** Live GET /api/organizations/:id/settings → the sections this panel edits. */
function parseOrgSettings(x: unknown): {
  mfaEnabled: boolean | null;
  ssoEnabled: boolean | null;
  translation: Partial<{
    enabled: boolean;
    targets: string[];
    defaultEngine: string;
    requireBackTranslation: boolean;
    twoPersonRule: boolean;
    glossaryScope: string;
    blockMachineApproval: boolean;
  }> | null;
} | null {
  if (!x || typeof x !== 'object') return null;
  const settings = (x as { settings?: unknown }).settings;
  if (!settings || typeof settings !== 'object') return null;
  const s = settings as Record<string, any>;
  const sec = s.security && typeof s.security === 'object' ? s.security : null;
  const txw = s.translation && typeof s.translation === 'object' ? s.translation : null;
  return {
    mfaEnabled: sec && typeof sec.mfaEnabled === 'boolean' ? sec.mfaEnabled : null,
    ssoEnabled: sec && typeof sec.ssoEnabled === 'boolean' ? sec.ssoEnabled : null,
    translation: txw,
  };
}

function syncTxwAdmin(n: SetupSettings): void {
  window.TXW_ADMIN = {
    enabled: n.txwEnabled,
    targets: n.txwTargets,
    defaultEngine: n.txwDefaultEngine,
    requireBackTranslation: n.txwRequireBackTranslation,
    twoPersonRule: n.txwTwoPersonRule,
    glossaryScope: n.txwGlossaryScope,
    blockMachineApproval: n.txwBlockMachineApproval,
  };
}

const SETUP_DEFAULTS: SetupSettings = {
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

/** Fold the live org profile + settings into the panel's edit shape. */
function seedFromLive(
  base: SetupSettings,
  profile: { name: string; clientType: string | null } | null,
  live: ReturnType<typeof parseOrgSettings>,
): SetupSettings {
  const n = { ...base };
  if (profile) {
    n.orgName = profile.name;
    if (profile.clientType) n.clientType = profile.clientType;
  }
  if (live) {
    if (live.mfaEnabled !== null) n.mfaRequired = live.mfaEnabled;
    if (live.ssoEnabled !== null) n.ssoEnabled = live.ssoEnabled;
    const t = live.translation;
    if (t) {
      if (typeof t.enabled === 'boolean') n.txwEnabled = t.enabled;
      if (Array.isArray(t.targets)) n.txwTargets = t.targets.filter((x): x is string => typeof x === 'string');
      if (typeof t.defaultEngine === 'string') n.txwDefaultEngine = t.defaultEngine;
      if (typeof t.requireBackTranslation === 'boolean') n.txwRequireBackTranslation = t.requireBackTranslation;
      if (typeof t.twoPersonRule === 'boolean') n.txwTwoPersonRule = t.twoPersonRule;
      if (typeof t.glossaryScope === 'string') n.txwGlossaryScope = t.glossaryScope;
      if (typeof t.blockMachineApproval === 'boolean') n.txwBlockMachineApproval = t.blockMachineApproval;
    }
  }
  return n;
}

export function Setup({ onAsk }: SurfaceViewProps) {
  const orgId = getOrgId();
  const profileRaw = useLive<unknown>(`/api/organizations/${encodeURIComponent(orgId)}`, null);
  const settingsRaw = useLive<unknown>(
    `/api/organizations/${encodeURIComponent(orgId)}/settings`,
    null,
  );
  const liveProfile = useMemo(
    () => (profileRaw.sample ? null : parseOrgProfile(profileRaw.data)),
    [profileRaw.sample, profileRaw.data],
  );
  const liveSettings = useMemo(
    () => (settingsRaw.sample ? null : parseOrgSettings(settingsRaw.data)),
    [settingsRaw.sample, settingsRaw.data],
  );
  const isLive = liveProfile !== null;

  const [s, setS] = useState<SetupSettings>(() => {
    let base = SETUP_DEFAULTS;
    try {
      const saved = JSON.parse(localStorage.getItem('c2c_admin_settings') || 'null');
      base = { ...SETUP_DEFAULTS, ...(saved || {}) };
    } catch (_e) {
      /* keep defaults */
    }
    syncTxwAdmin(base);
    return base;
  });
  // Snapshot of the last loaded/saved state — dirtiness is measured against it.
  const [baseline, setBaseline] = useState<string>(() => JSON.stringify(s));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, fireToast] = useToast();

  // Re-seed the edit state when the governed backend answers.
  const seededFrom = useRef<unknown>(null);
  useEffect(() => {
    if (!isLive || seededFrom.current === profileRaw.data) return;
    seededFrom.current = profileRaw.data;
    setS((prev) => {
      const seeded = seedFromLive(prev, liveProfile, liveSettings);
      setBaseline(JSON.stringify(seeded));
      syncTxwAdmin(seeded);
      return seeded;
    });
  }, [isLive, liveProfile, liveSettings, profileRaw.data]);

  const dirty = JSON.stringify(s) !== baseline;

  const set = (k: keyof SetupSettings, v: SetupSettings[keyof SetupSettings]) =>
    setS((prev) => {
      const n = { ...prev, [k]: v } as SetupSettings;
      try {
        localStorage.setItem('c2c_admin_settings', JSON.stringify(n));
      } catch (_e) {
        /* noop */
      }
      syncTxwAdmin(n);
      return n;
    });

  /** Governed save — profile PATCH + settings PATCH, both audited. */
  const save = async () => {
    if (!dirty || saving) return;
    if (!isLive) {
      setBaseline(JSON.stringify(s));
      fireToast('Saved in this browser only -- backend not reachable');
      return;
    }
    if (reason.trim().length < 3) {
      fireToast('A reason for change (min 3 chars) is required');
      return;
    }
    setSaving(true);
    const before: SetupSettings = JSON.parse(baseline);
    try {
      if (s.orgName !== before.orgName || s.clientType !== before.clientType) {
        const res = await apiRequest(
          'PATCH',
          `/api/organizations/${encodeURIComponent(orgId)}/profile`,
          { name: s.orgName, clientType: s.clientType, reason: reason.trim() },
        );
        if (!res.ok) throw new Error('profile update rejected');
      }
      const res2 = await apiRequest(
        'PATCH',
        `/api/organizations/${encodeURIComponent(orgId)}/settings`,
        {
          settings: {
            security: { mfaEnabled: s.mfaRequired, ssoEnabled: s.ssoEnabled },
            translation: {
              enabled: s.txwEnabled,
              targets: s.txwTargets,
              defaultEngine: s.txwDefaultEngine,
              requireBackTranslation: s.txwRequireBackTranslation,
              twoPersonRule: s.txwTwoPersonRule,
              glossaryScope: s.txwGlossaryScope,
              blockMachineApproval: s.txwBlockMachineApproval,
            },
          },
          reason: reason.trim(),
        },
      );
      if (!res2.ok) throw new Error('settings update rejected');
      setBaseline(JSON.stringify(s));
      setReason('');
      fireToast('Saved -- reason recorded -- audited (Part 11)');
    } catch (e) {
      fireToast(
        'Could not save -- ' + (e instanceof Error && e.message ? e.message : 'request failed'),
      );
    } finally {
      setSaving(false);
    }
  };

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
        eyebrow="Admin -- organization -- /api/organizations"
        title={
          <React.Fragment>
            Setup <SampleTag sample={!isLive} />
          </React.Fragment>
        }
        sub={
          isLive
            ? 'Organization profile, security defaults, and module configuration. Every save requires a reason and is written to the audit trail.'
            : 'Organization profile, security defaults, and module configuration. Backend not reachable -- edits stay in this browser only until you sign in.'
        }
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

      {/* -- Governed save bar -- appears when there are unsaved changes -- */}
      {dirty && (
        <div
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            marginTop: 16,
            padding: '12px 14px',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--bg-100)',
            maxWidth: 760,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 12.5, color: 'var(--text-300)', fontWeight: 500 }}>
            Unsaved changes
          </span>
          {isLive ? (
            <input
              className="ob-in"
              style={{ margin: 0, flex: '1 1 260px' }}
              placeholder="Reason for change (required, min 3 chars -- audited)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          ) : (
            <span style={{ fontSize: 11.5, color: 'var(--text-400)', flex: '1 1 260px' }}>
              Backend not reachable -- saving keeps a browser-local draft only.
            </span>
          )}
          <button
            className="sp-primary"
            style={{ padding: '8px 14px' }}
            disabled={saving || (isLive && reason.trim().length < 3)}
            onClick={save}
          >
            {saving ? 'Saving...' : isLive ? 'Save changes' : 'Save draft'}
          </button>
        </div>
      )}
      <C2CToast msg={toast} />
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
   Fail-closed: any fetch/shape failure keeps the curated APPS_CATALOG /
   APP_LICENSE fixture with the Sample-data pill. Fields the backend cannot
   truthfully supply (renewsAt — no renewal column is read anywhere server-side)
   are left empty when live, never invented. */

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
  const catLive = useLive<unknown>('/api/module-subscriptions/catalog', null);
  const licLive = useLive<unknown>('/api/module-subscriptions/license', null);
  const liveCat = useMemo(
    () => (catLive.sample ? null : mapLiveCatalog(catLive.data)),
    [catLive.sample, catLive.data],
  );
  const liveLic = useMemo(
    () => (licLive.sample ? null : mapLiveLicense(licLive.data)),
    [licLive.sample, licLive.data],
  );
  const catalogIsLive = liveCat !== null;
  const lic: AppLicense = liveLic ?? APP_LICENSE;
  const [cat, setCat] = useState<AppGroup[]>(APPS_CATALOG);
  const seededRef = useRef<AppGroup[] | null>(null);
  useEffect(() => {
    if (liveCat && seededRef.current !== liveCat) {
      seededRef.current = liveCat;
      setCat(liveCat);
    }
  }, [liveCat]);
  const [admin, setAdmin] = useState(false);
  const [toast, setToast] = useState('');
  const fireToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(''), 3200);
  };

  const tierLabel = lic.tier || 'professional';
  const pj = lic.usage?.projects || { current: 0, limit: 0 };
  const us = lic.usage?.users || { current: 0, limit: 0 };

  const setOn = (groupIdx: number, appId: string, on: boolean) =>
    setCat((prev) =>
      prev.map((g, gi) =>
        gi !== groupIdx
          ? g
          : {
              ...g,
              apps: g.apps.map((a) => (a.id === appId ? { ...a, on } : a)),
            },
      ),
    );

  const toggle = async (groupIdx: number, appId: string, next: boolean) => {
    const row = cat[groupIdx]?.apps.find((a) => a.id === appId);
    const label = row?.name || getSurfaceMeta(appId).label || appId;
    setOn(groupIdx, appId, next); // optimistic
    if (!catalogIsLive) {
      // Fixture mode — nothing to persist to; say so instead of faking success.
      fireToast((next ? 'Enabled ' : 'Disabled ') + label + ' -- sample only, not persisted');
      return;
    }
    try {
      // PUT /api/module-subscriptions/:moduleId/toggle (admin-only, org-scoped)
      const res = await apiRequest(
        'PUT',
        `/api/module-subscriptions/${encodeURIComponent(appId)}/toggle`,
        { enabled: next },
      );
      if (!res.ok) {
        // apiRequest passes 401 through without throwing
        setOn(groupIdx, appId, !next);
        fireToast(`Could not ${next ? 'enable' : 'disable'} ${label} -- sign in required`);
        return;
      }
      fireToast((next ? 'Enabled ' : 'Disabled ') + label);
    } catch (e) {
      // apiRequest throws on non-OK with the server's reason (e.g. admin
      // required, or the tier does not include this module). Revert -- never
      // report a write that did not happen.
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
        title={
          <React.Fragment>
            Apps catalog <SampleTag sample={!catalogIsLive || liveLic === null} />
          </React.Fragment>
        }
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
        <button
          className="btn ghost"
          style={{ height: 28 }}
          onClick={() => open('licensing')}
        >
          {I.creditCard || I.zap} Manage plan
        </button>
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
                      <button
                        className="btn primary"
                        style={{ height: 26, marginLeft: 'auto' }}
                        onClick={() => open('licensing')}
                        title={`Upgrade your plan to unlock ${label}`}
                      >
                        Upgrade plan
                      </button>
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

/* ════════════ Artifacts Center ════════════
   Live-wired to GET /api/artifacts-center (artifacts-center-routes.ts) —
   { success, data: ArtifactCenterRow[] } in exactly this display shape from
   the org-scoped concept2cure_artifacts store; `sig` reflects a real row in
   the immutable signatures ledger; `model` is null when the producing model
   was never persisted (rendered as an em dash, never invented). Fail-closed
   to the curated fixture with the Sample pill. */

/** Fixture-compatible row whose model may honestly be absent when live. */
type ArtifactRow = Omit<ArtifactEntry, 'model'> & { model: string | null };

export function ArtifactsCenter({ onAsk, onNav }: SurfaceViewProps) {
  const artRaw = useLive<unknown>('/api/artifacts-center', null);
  const liveRows = useMemo<ArtifactRow[] | null>(() => {
    if (artRaw.sample) return null;
    const list = unwrapList(artRaw.data);
    return matchesShape<ArtifactRow>(list, ARTIFACTS) ? list : null;
  }, [artRaw.sample, artRaw.data]);
  const artifactsLive = liveRows !== null;
  const rows: ArtifactRow[] = liveRows ?? ARTIFACTS;
  return (
    <div className="page-inner">
      <AdminHeader
        eyebrow="Workspace -- evidence -- /api/artifacts-center"
        title={
          <React.Fragment>
            Artifacts Center <SampleTag sample={!artifactsLive} />
          </React.Fragment>
        }
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
              <div style={{ color: 'var(--text-400)' }}>{a.model || '--'}</div>
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
const VKIT_FALLBACK: ValidationKit = { artifacts: [], note: '' };

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

/* Security-health panel — GET /api/admin/security-health (admin-security.ts,
   org-admin gated, audited read). The endpoint intentionally answers 503 when
   the panel is FAILING with the report as the body — a failing posture is the
   most important one to show, so this hook accepts both 200 and 503 JSON
   bodies instead of routing through useLive (which would discard the 503). */
interface SecCheckResult {
  name: string;
  status: string;
  critical: boolean;
  reason?: string;
  durationMs: number;
}
interface SecHealthReport {
  overall: 'healthy' | 'degraded' | 'failing';
  checkedAt: string;
  checks: SecCheckResult[];
}

function useSecurityHealth(bump: number): { report: SecHealthReport | null; loading: boolean } {
  const [state, setState] = useState<{ report: SecHealthReport | null; loading: boolean }>({
    report: null,
    loading: true,
  });
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    fetch('/api/admin/security-health', {
      headers: {
        ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
        'x-organization-id': getOrgId(),
      },
      credentials: 'include',
    })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status !== 200 && res.status !== 503) {
          setState({ report: null, loading: false });
          return;
        }
        const body = (await res.json().catch(() => null)) as SecHealthReport | null;
        const valid =
          body && typeof body.overall === 'string' && Array.isArray(body.checks);
        setState({ report: valid ? body : null, loading: false });
      })
      .catch(() => {
        if (!cancelled) setState({ report: null, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [bump]);
  return state;
}

/* Platform role grants — live from GET /api/admin/access/grants (the audited
   access-management router, server/routes/admin/access-management.ts). The read
   is platform-admin gated; a 401/403 or any shape mismatch fails closed to the
   AC_GRANTS fixture with the Sample pill. When live, create/revoke go to the
   real POST/DELETE (both require a reason-for-change, which the form collects). */
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
  const vkit = useLive<ValidationKit>('/api/validation-kit', VKIT_FALLBACK);
  const vkitDocs = vkit.data?.artifacts ?? [];
  const grantsLive = useLive<{ grants?: LiveGrant[] } | null>('/api/admin/access/grants', null);
  const liveGrants = useMemo(() => {
    if (grantsLive.sample || !grantsLive.data) return null;
    const arr = grantsLive.data.grants;
    if (!Array.isArray(arr)) return null;
    return arr.map(mapLiveGrant);
  }, [grantsLive.sample, grantsLive.data]);
  const grantsAreLive = liveGrants !== null;
  const [grants, setGrants] = useState<AcGrant[]>(AC_GRANTS);
  const seededGrants = useRef<AcGrant[] | null>(null);
  useEffect(() => {
    if (liveGrants && seededGrants.current !== liveGrants) {
      seededGrants.current = liveGrants;
      setGrants(liveGrants);
    }
  }, [liveGrants]);
  const [form, setForm] = useState<AcFormState>({ email: '', role: 'support', reason: '' });
  const [toast, fireToast] = useToast();

  /* Org profile -- live from GET /api/organizations/:id (validateOrgOwnership).
     Renders only columns the org row really carries; nothing invented. */
  const orgId = getOrgId();
  const orgRaw = useLive<unknown>(`/api/organizations/${encodeURIComponent(orgId)}`, null);
  const liveOrg = useMemo<Record<string, unknown> | null>(() => {
    if (orgRaw.sample || !orgRaw.data || typeof orgRaw.data !== 'object') return null;
    const org = (orgRaw.data as { organization?: unknown }).organization;
    if (!org || typeof org !== 'object') return null;
    const o = org as Record<string, unknown>;
    return typeof o.name === 'string' ? o : null;
  }, [orgRaw.sample, orgRaw.data]);
  const orgLive = liveOrg !== null;

  /* API keys -- live from /api/api-keys (org-scoped, admin-gated, audited).
     The raw key is shown exactly once after create (the backend never returns
     it again); revoke is a real DELETE. */
  interface LiveApiKey {
    id: number;
    name: string;
    keyPrefix: string;
    status: string;
    lastUsedAt: string | null;
    createdAt: string | null;
  }
  const [keysBump, setKeysBump] = useState(0);
  const keysRaw = useLive<unknown>('/api/api-keys', null, ['/api/api-keys', keysBump]);
  const liveKeys = useMemo<LiveApiKey[] | null>(() => {
    if (keysRaw.sample || !keysRaw.data || typeof keysRaw.data !== 'object') return null;
    const keys = (keysRaw.data as { keys?: unknown }).keys;
    if (!Array.isArray(keys)) return null;
    return keys
      .filter(
        (k): k is Record<string, unknown> =>
          !!k && typeof k === 'object' && typeof (k as any).keyPrefix === 'string',
      )
      .map((k) => ({
        id: Number(k.id),
        name: typeof k.name === 'string' ? k.name : String(k.id),
        keyPrefix: String(k.keyPrefix),
        status: typeof k.status === 'string' ? k.status : 'active',
        lastUsedAt: typeof k.lastUsedAt === 'string' ? k.lastUsedAt : null,
        createdAt: typeof k.createdAt === 'string' ? k.createdAt : null,
      }));
  }, [keysRaw.sample, keysRaw.data]);
  const keysLive = liveKeys !== null;
  const [keyName, setKeyName] = useState('');
  const [mintedKey, setMintedKey] = useState<{ name: string; raw: string } | null>(null);
  const [keyBusy, setKeyBusy] = useState(false);

  const createKey = async () => {
    const name = keyName.trim();
    if (name.length < 2) {
      fireToast('Name the key first (min 2 chars)');
      return;
    }
    if (!keysLive) {
      fireToast('Sign in as an org admin to mint API keys -- nothing was created');
      return;
    }
    setKeyBusy(true);
    try {
      // 'documents:read' is the least-privileged member of API_KEY_SCOPES
      // (shared/schema/api-keys.ts) — the server rejects unknown scopes.
      const res = await apiRequest('POST', '/api/api-keys', { name, scopes: ['documents:read'] });
      if (!res.ok) {
        fireToast('Could not create key -- org admin role required');
        return;
      }
      const body = await res.json().catch(() => null);
      if (body && typeof body.apiKey === 'string') {
        setMintedKey({ name, raw: body.apiKey });
      }
      setKeyName('');
      setKeysBump((b) => b + 1);
      fireToast('API key created -- audited');
    } catch (e) {
      fireToast(
        'Could not create key -- ' +
          (e instanceof Error && e.message ? e.message : 'request failed'),
      );
    } finally {
      setKeyBusy(false);
    }
  };

  const revokeKey = async (id: number, name: string) => {
    if (!keysLive) {
      fireToast('Sign in as an org admin to revoke keys');
      return;
    }
    try {
      const res = await apiRequest('DELETE', `/api/api-keys/${id}`);
      if (!res.ok) {
        fireToast('Could not revoke -- org admin role required');
        return;
      }
      setKeysBump((b) => b + 1);
      fireToast(`Revoked "${name}" -- audited`);
    } catch (e) {
      fireToast(
        'Could not revoke -- ' + (e instanceof Error && e.message ? e.message : 'request failed'),
      );
    }
  };

  /* Security & SSO policy -- live from the governed org-settings store
     (organizations.settings.security). Toggles are governed writes: a reason
     is captured and the PATCH lands in the audit trail. */
  const [secBump, setSecBump] = useState(0);
  const secHealth = useSecurityHealth(secBump);
  const orgSettingsRaw = useLive<unknown>(
    `/api/organizations/${encodeURIComponent(orgId)}/settings`,
    null,
    [orgId, secBump],
  );
  const liveSecurity = useMemo<{ mfaEnabled: boolean | null; ssoEnabled: boolean | null } | null>(() => {
    if (orgSettingsRaw.sample || !orgSettingsRaw.data || typeof orgSettingsRaw.data !== 'object') {
      return null;
    }
    const settings = (orgSettingsRaw.data as { settings?: unknown }).settings;
    if (!settings || typeof settings !== 'object') return null;
    const sec = (settings as Record<string, any>).security;
    return {
      mfaEnabled: sec && typeof sec.mfaEnabled === 'boolean' ? sec.mfaEnabled : null,
      ssoEnabled: sec && typeof sec.ssoEnabled === 'boolean' ? sec.ssoEnabled : null,
    };
  }, [orgSettingsRaw.sample, orgSettingsRaw.data]);
  const securityLive = liveSecurity !== null;

  const toggleSecurityPolicy = async (key: 'mfaEnabled' | 'ssoEnabled', next: boolean) => {
    if (!securityLive) {
      fireToast('Sign in as an org admin to change security policy');
      return;
    }
    const label = key === 'mfaEnabled' ? 'MFA requirement' : 'SSO';
    const reason =
      typeof window !== 'undefined' && window.prompt
        ? window.prompt(
            `Reason for ${next ? 'enabling' : 'disabling'} ${label} (min 3 chars, recorded in the audit trail):`,
          )
        : '';
    if (reason == null) return; // cancelled
    if (reason.trim().length < 3) {
      fireToast('A reason (min 3 chars) is required');
      return;
    }
    try {
      const res = await apiRequest(
        'PATCH',
        `/api/organizations/${encodeURIComponent(orgId)}/settings`,
        { settings: { security: { [key]: next } }, reason: reason.trim() },
      );
      if (!res.ok) {
        fireToast('Could not update -- org admin role required');
        return;
      }
      setSecBump((b) => b + 1);
      fireToast(`${label} ${next ? 'enabled' : 'disabled'} -- reason recorded -- audited`);
    } catch (e) {
      fireToast(
        'Could not update -- ' + (e instanceof Error && e.message ? e.message : 'request failed'),
      );
    }
  };

  /* Module subscriptions -- live enabled set from the same catalog the Apps
     surface uses (module-subscriptions.ts). */
  const modsRaw = useLive<unknown>('/api/module-subscriptions/catalog', null);
  const liveMods = useMemo<{ name: string; enabled: boolean }[] | null>(() => {
    if (modsRaw.sample || !modsRaw.data || typeof modsRaw.data !== 'object') return null;
    const modules = (modsRaw.data as { modules?: unknown }).modules;
    if (!Array.isArray(modules)) return null;
    const rows = modules.filter(
      (m): m is Record<string, unknown> =>
        !!m && typeof m === 'object' && typeof (m as any).name === 'string',
    );
    if (!rows.length) return null;
    return rows.map((m) => ({ name: String(m.name), enabled: Boolean(m.isEnabled) }));
  }, [modsRaw.sample, modsRaw.data]);
  const modsLive = liveMods !== null;
  const nav = (id: string) => {
    try {
      localStorage.setItem('c2c_open_surface', id);
    } catch (_e) {
      /* noop */
    }
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

    if (grantsAreLive) {
      // Real, audited write. apiRequest throws on non-OK (except 401) with the
      // server's reason (e.g. business-admin required, no such user).
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
          'Could not grant -- ' +
            (e instanceof Error && e.message ? e.message : 'request failed'),
        );
      }
      return;
    }

    // Sample mode — no audited backend reachable; record locally and say so
    // rather than claim a write that did not happen.
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
    fireToast(okMsg + ' -- sample only, not persisted');
    setForm({ email: '', role: 'support', reason: '' });
  };

  const revoke = async (id: number) => {
    if (grantsAreLive) {
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
          'Could not revoke -- ' +
            (e instanceof Error && e.message ? e.message : 'request failed'),
        );
      }
      return;
    }
    setGrants((g) => g.filter((x) => x.id !== id));
    fireToast('Grant revoked -- sample only, not persisted');
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
            Admin console <SampleTag sample={!(grantsAreLive || orgLive || keysLive)} />
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
                  <span className="t">
                    Platform role grants <SampleTag sample={!grantsAreLive} />
                  </span>
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
              <div>
                <div className="pj-card-h" style={{ padding: 0, marginBottom: 12 }}>
                  <span className="t">
                    Organization profile <SampleTag sample={!orgLive} />
                  </span>
                  <span className="s">organizations -- /api/organizations/{orgId}</span>
                </div>
                <div className="ac-fields">
                  {(
                    (orgLive
                      ? [
                          ['Organization name', String(liveOrg!.name)],
                          ['Client type', String(liveOrg!.clientType ?? '--')],
                          ['Industry mode', String(liveOrg!.industryMode ?? '--')],
                          ['Current tier', String(liveOrg!.subscriptionTier ?? liveOrg!.tier ?? '--')],
                          ['Payment status', String(liveOrg!.paymentStatus ?? '--')],
                          ['Status', String(liveOrg!.status ?? '--')],
                          [
                            'Seats',
                            `${String(liveOrg!.activeUsers ?? '--')} active / ${String(liveOrg!.seatsPurchased ?? '--')} purchased`,
                          ],
                        ]
                      : [
                          ['Organization name', 'Bright Biosciences'],
                          ['Organization type (industry_mode)', 'Virtual biotech'],
                          ['Current tier', 'professional'],
                          ['Payment status', 'active'],
                        ]) as [string, string][]
                  ).map(([k, v], i) => (
                    <div key={i} className="ac-field">
                      <span className="k">{k}</span>
                      <span className="v">{v}</span>
                    </div>
                  ))}
                  <div className="scaf-note" style={{ marginTop: 6 }}>
                    Profile drives rail categories, pathways and pricing archetype. Edit it in{' '}
                    <b>Setup</b> -- every change requires a reason and is audited.
                  </div>
                  <button className="sp-ask" style={{ marginTop: 10 }} onClick={() => nav('setup')}>
                    {I.settings} Open Setup
                  </button>
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
              <div>
                <div className="pj-card-h" style={{ padding: 0, marginBottom: 12 }}>
                  <span className="t">
                    SSO &amp; SCIM <SampleTag sample={!securityLive} />
                  </span>
                  <span className="s">
                    SSO: {securityLive ? ((liveSecurity?.ssoEnabled ?? false) ? 'enabled' : 'disabled') : 'unknown'} -- governed in Security
                  </span>
                </div>
                <div className="ac-cards">
                  {(
                    [
                      [
                        'SAML / OIDC SSO',
                        'Enterprise SSO via authEnterprise -- IdP metadata, ACS URL, JIT provisioning. Toggle the org policy in the Security section (governed).',
                        securityLive
                          ? (liveSecurity?.ssoEnabled ?? false)
                            ? 'Enabled'
                            : 'Disabled'
                          : 'SAML SSO on Professional+',
                      ],
                      [
                        'SCIM 2.0 provisioning',
                        'Automated user lifecycle from your IdP (/scim/v2). Bearer tokens are minted and rotated by platform operations in Master Administration -- Identity & SCIM; contact support to connect your IdP.',
                        'Token-scoped, per-tenant',
                      ],
                      [
                        'SCIM IP allowlist',
                        'Restricts SCIM calls to your IdP egress ranges (CIDR). Managed alongside your SCIM token by platform operations.',
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
              </div>
            )}

            {sec === 'security' && (
              <div>
                <div className="pj-card-h" style={{ padding: 0, marginBottom: 12 }}>
                  <span className="t">
                    Security policy <SampleTag sample={!securityLive} />
                  </span>
                  <span className="s">organizations.settings.security -- governed</span>
                </div>
                <div className="txw-row">
                  <div className="txw-row-l">
                    MFA policy
                    <small>Require TOTP for every member at sign-in. Governed change.</small>
                  </div>
                  <div className="txw-row-r" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <button
                      className="txw-switch"
                      data-on={(liveSecurity?.mfaEnabled ?? true) || undefined}
                      onClick={() => toggleSecurityPolicy('mfaEnabled', !(liveSecurity?.mfaEnabled ?? true))}
                      aria-pressed={liveSecurity?.mfaEnabled ?? true}
                      aria-label="MFA required"
                    />
                    <span className="txw-help">
                      {(liveSecurity?.mfaEnabled ?? true) ? 'Required' : 'Optional'} -- TOTP via
                      authenticator app
                    </span>
                  </div>
                </div>
                <div className="txw-row">
                  <div className="txw-row-l">
                    SSO (SAML / OIDC)
                    <small>Centralized identity via your IdP. Governed change.</small>
                  </div>
                  <div className="txw-row-r" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <button
                      className="txw-switch"
                      data-on={(liveSecurity?.ssoEnabled ?? false) || undefined}
                      onClick={() => toggleSecurityPolicy('ssoEnabled', !(liveSecurity?.ssoEnabled ?? false))}
                      aria-pressed={liveSecurity?.ssoEnabled ?? false}
                      aria-label="SSO enabled"
                    />
                    <span className="txw-help">
                      {(liveSecurity?.ssoEnabled ?? false) ? 'Connected to your IdP' : 'Disabled'}
                    </span>
                  </div>
                </div>

                <div className="pj-card-h" style={{ padding: 0, margin: '18px 0 10px' }}>
                  <span className="t">
                    Security health <SampleTag sample={!secHealth.report} />
                  </span>
                  <span className="s">
                    /api/admin/security-health -- audited read
                    {secHealth.report ? ` -- checked ${String(secHealth.report.checkedAt).slice(0, 16).replace('T', ' ')}` : ''}
                  </span>
                </div>
                {secHealth.loading ? (
                  <div className="scaf-note">Running the security self-test panel...</div>
                ) : secHealth.report ? (
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        gap: 10,
                        alignItems: 'center',
                        padding: '10px 14px',
                        borderRadius: 8,
                        border: `1px solid ${secHealth.report.overall === 'healthy' ? 'var(--success)' : secHealth.report.overall === 'degraded' ? 'var(--warning)' : 'var(--error)'}`,
                        background: `color-mix(in srgb,${secHealth.report.overall === 'healthy' ? 'var(--success)' : secHealth.report.overall === 'degraded' ? 'var(--warning)' : 'var(--error)'} 8%,transparent)`,
                        marginBottom: 10,
                        fontSize: 12.5,
                      }}
                    >
                      {secHealth.report.overall === 'healthy' ? I.shieldCheck : I.alertTriangle}
                      <b>Overall: {secHealth.report.overall}</b>
                      <span style={{ color: 'var(--text-400)' }}>
                        {secHealth.report.checks.length} checks
                      </span>
                      <button
                        className="sp-ask"
                        style={{ marginLeft: 'auto', padding: '2px 10px' }}
                        onClick={() => setSecBump((b) => b + 1)}
                      >
                        Re-run
                      </button>
                    </div>
                    <div className="sp-list">
                      {secHealth.report.checks.map((c) => (
                        <div key={c.name} className="sp-row">
                          <span
                            className={`rd-chip tone-${c.status === 'pass' ? 'ok' : c.status === 'warn' ? 'warn' : 'err'}`}
                          >
                            {c.status}
                          </span>
                          <span className="sp-row-b">
                            <span className="sp-row-t">
                              {c.name}
                              {c.critical ? ' (critical)' : ''}
                            </span>
                            {c.reason && <span className="sp-row-s">{c.reason}</span>}
                          </span>
                          <span className="mono" style={{ fontSize: 10, color: 'var(--text-400)' }}>
                            {c.durationMs}ms
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="scaf-note">
                    Security panel unavailable -- sign in as an org admin to run the live
                    self-test (JWT posture, audit chain, malware scanning, session policy).
                  </div>
                )}
              </div>
            )}

            {sec === 'modules' && (
              <div>
                <div className="pj-card-h" style={{ padding: 0, marginBottom: 12 }}>
                  <span className="t">
                    Module subscriptions <SampleTag sample={!modsLive} />
                  </span>
                  <span className="s">
                    {modsLive
                      ? `${liveMods!.filter((m) => m.enabled).length} enabled of ${liveMods!.length} -- module_subscriptions`
                      : 'module_subscriptions'}
                  </span>
                </div>
                <div className="scaf-note" style={{ marginBottom: 10 }}>
                  Modules auto-provision by tier (module_subscriptions --
                  provisionModulesForTier). Enable/disable them for this organization in the
                  Apps catalog; locked modules show an upgrade path, never a dead button.
                </div>
                <div className="ob-mods">
                  {(modsLive
                    ? liveMods!.filter((m) => m.enabled).map((m) => m.name)
                    : [
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
                      ]
                  ).map((m, i) => (
                    <span key={i} className="ob-mod">
                      {I.check} {m}
                    </span>
                  ))}
                </div>
                {modsLive && liveMods!.every((m) => !m.enabled) && (
                  <div className="scaf-note" style={{ marginTop: 8 }}>
                    No modules enabled yet -- open the Apps catalog to enable what your tier
                    includes.
                  </div>
                )}
                <button className="sp-ask" style={{ marginTop: 10 }} onClick={() => nav('apps')}>
                  {I.grid} Open Apps catalog
                </button>
              </div>
            )}

            {sec === 'apikeys' && (
              <div>
                <div className="pj-card-h" style={{ padding: 0, marginBottom: 12 }}>
                  <span className="t">
                    API keys <SampleTag sample={!keysLive} />
                  </span>
                  <span className="s">
                    {keysLive ? `${liveKeys!.length} key${liveKeys!.length === 1 ? '' : 's'} -- api_keys` : 'api_keys'}
                  </span>
                </div>
                <div className="scaf-note" style={{ marginBottom: 12 }}>
                  Programmatic access tokens (/api/api-keys) -- org-scoped, hashed at rest,
                  last-used tracked, revocable. Every lifecycle event is audited.
                </div>
                {mintedKey && (
                  <div
                    style={{
                      marginBottom: 12,
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--success)',
                      background: 'color-mix(in srgb,var(--success) 8%,transparent)',
                      fontSize: 12,
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      {I.shieldCheck} "{mintedKey.name}" created -- copy it now, it is never
                      shown again
                    </div>
                    <code
                      className="mono"
                      style={{ fontSize: 11, wordBreak: 'break-all', userSelect: 'all' }}
                    >
                      {mintedKey.raw}
                    </code>
                    <div style={{ marginTop: 6 }}>
                      <button className="sp-ask" onClick={() => setMintedKey(null)}>
                        I stored it -- dismiss
                      </button>
                    </div>
                  </div>
                )}
                <div className="sp-list">
                  {(keysLive
                    ? liveKeys!.map((k) => ({
                        id: k.id,
                        n: k.name,
                        k: `${k.keyPrefix}....`,
                        u: k.lastUsedAt
                          ? `last used ${String(k.lastUsedAt).slice(0, 10)}`
                          : 'never used',
                        revoked: k.status !== 'active',
                      }))
                    : [
                        { id: -1, n: 'Production integration', k: 'pk_live_....4f2a', u: 'used 2h ago', revoked: false },
                        { id: -2, n: 'CI validation', k: 'pk_live_....9c11', u: 'used 3d ago', revoked: false },
                      ]
                  ).map((row) => (
                    <div key={row.id} className="sp-row">
                      <span className="sp-q-ic">{I.terminal || I.key}</span>
                      <span className="sp-row-b">
                        <span className="sp-row-t">
                          {row.n}
                          {row.revoked ? ' (revoked)' : ''}
                        </span>
                        <span className="sp-row-s" style={{ fontFamily: 'var(--font-mono)' }}>
                          {row.k} -- {row.u}
                        </span>
                      </span>
                      {!row.revoked && (
                        <button
                          className="ac-revoke"
                          title="Revoke key (audited)"
                          onClick={() =>
                            keysLive
                              ? revokeKey(row.id, row.n)
                              : fireToast('Sign in as an org admin to revoke keys')
                          }
                        >
                          {I.close}
                        </button>
                      )}
                    </div>
                  ))}
                  {keysLive && liveKeys!.length === 0 && (
                    <div className="scaf-note">No API keys yet -- mint the first one below.</div>
                  )}
                </div>
                <div className="ac-grant-form" style={{ marginTop: 12 }}>
                  <input
                    className="ob-in"
                    style={{ margin: 0, flex: 1 }}
                    placeholder="Key name (e.g. Production integration)"
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                  />
                  <button
                    className="sp-primary"
                    style={{ padding: '8px 14px' }}
                    disabled={keyBusy}
                    onClick={createKey}
                  >
                    {I.plus} {keyBusy ? 'Creating...' : 'Create API key'}
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
    </div>
  );
}
