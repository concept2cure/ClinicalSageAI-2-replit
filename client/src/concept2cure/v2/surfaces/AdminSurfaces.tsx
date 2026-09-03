import React, { useState, useEffect, useMemo, useRef } from 'react';
import { I } from '../icons';
import { downloadBlob, downloadText, safeFileName } from '../download';
import { useLiveData, useLiveRows, EmptyState, liveMutateOrNull } from '../dataConnect';
import { ApiRequestError, apiRequest, serverMessage } from '@/lib/queryClient';
import { getAuthToken, getJwtOrgId } from '@/utils/authToken';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import {
  applySurfaceAction,
  notifySurfaceActionReady,
  useSurfaceActionHandlers,
} from '../surfaceActions';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';
import { getSurfaceMeta } from '../registryModel';
import { consumeNavParams } from '../navParams';
// LIC_TIER_LEVEL is the client's one ascending tier ordering (free < standard <
// professional < enterprise), mirroring TIER_LEVELS in license-manager.ts. The
// Apps catalog needs it to tell a tier gap from an industry-mode mismatch, and
// a private copy here would be a seventh place that ordering is written down.
import { LIC_ROLES, LIC_TIER_LEVEL } from '../fixtures/licensing';
// The shell's lock vocabulary, not a second one. A customer who is told on the
// rail that an app is "turned off for this workspace" must not be told on the
// catalog card that it is "not included in your plan"; both screens read these.
import {
  lockNotice,
  lockShortReason,
  type NavSurfaceEntitlement,
} from '../navEntitlements';
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
import { C2CToast, useToast } from '../toast';

/* `window.TXW_ADMIN` used to be published from the Setup panel below and was
   read by nothing in the repository -- 0 consumers, so the translation policy
   it carried reached no runtime. The policy now lives on the organization
   record (organizations.settings.translation) where the server already keeps
   it, so the global and its `declare global` block are gone rather than left
   as a second, unread source of truth. */

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

/* ── Setup settings shape ── */

/**
 * Org-wide translation-workspace policy, in exactly the shape it is persisted
 * at `organizations.settings.translation`. That section is not invented here:
 * organizations-routes.ts already seeds it in the GET defaults, under a comment
 * naming this surface ("Translation-workspace policy (ui-v2 Setup surface /
 * Document editor Trans dock). Org-wide defaults; per-user prefs live on
 * users.preferences" -- and users.ts does carry the matching per-user keys).
 *
 * The last three fields are NOT preferences. They mirror the guardrails the
 * approval path enforces unconditionally and are written back verbatim on every
 * save, so the stored record can never drift into describing a laxer policy
 * than the server actually applies. See the Setup card comment below.
 */
interface TranslationPolicy {
  enabled: boolean;
  targets: string[];
  defaultEngine: string;
  glossaryScope: string;
  requireBackTranslation: boolean;
  twoPersonRule: boolean;
  blockMachineApproval: boolean;
}

/**
 * DEFAULT_GUARDRAILS (server/services/translation/types.ts) as this surface
 * states them. approvalGuard() applies that constant to every
 * POST /api/translation/segments/:id/approve; no org setting is consulted.
 */
const ENFORCED_GUARDRAILS = {
  blockMachineApproval: true,
  requireBackTranslation: true,
  twoPersonRule: true,
} as const;

const TRANSLATION_DEFAULTS: TranslationPolicy = {
  enabled: false,
  targets: [],
  defaultEngine: 'C2C-RIM-MT v2.4',
  glossaryScope: 'org',
  ...ENFORCED_GUARDRAILS,
};

/**
 * The approval rules the platform applies to EVERY translation approval,
 * rendered as locked facts rather than switches. Each `evidence` line names the
 * check in approvalGuard() so a reader can go and confirm the claim instead of
 * taking the UI's word for it.
 */
const ENFORCED_APPROVAL_RULES: Array<{
  id: string;
  title: string;
  detail: string;
  evidence: string;
}> = [
  {
    id: 'machine-only',
    title: 'Machine-only segments are never approvable',
    detail:
      'Machine translation is a draft accelerator. A segment still carrying method "machine" cannot reach approved — only human and mt_postedited can.',
    evidence: "approvableMethods: ['human', 'mt_postedited'] -- rejects with method_not_approvable.",
  },
  {
    id: 'back-translation',
    title: 'Verified back-translation before approval',
    detail:
      'An independent re-translation of the target back to source, persisted with the segment. Editing the target text clears the prior evidence, because evidence is bound to the exact text it verified.',
    evidence:
      'requireBackTranslation with a 0.85 similarity threshold; deterministic/demo engine output is never accepted as evidence.',
  },
  {
    id: 'two-person',
    title: 'Separation of duties on approval',
    detail:
      'A named human reviewer of record must sign off, and that reviewer cannot also be the post-editor.',
    evidence: 'Rejects with reviewer_required, then with the reviewer/post-editor identity check.',
  },
];

/** The fields this surface reads from GET /api/organizations/:id. */
interface OrgRecord {
  organization?: { name?: string | null };
}

/** The payload of GET /api/organizations/:id/settings. */
interface OrgSettingsRecord {
  settings?: { translation?: Partial<TranslationPolicy> };
}

/**
 * Read a persisted translation section defensively -- it is free-form jsonb, so
 * every field is validated rather than trusted -- and pin the three enforced
 * guardrails to what the server actually does, whatever the column happens to
 * hold. A row written before this surface existed cannot make the UI claim a
 * Part 11 control is off.
 */
function readTranslationPolicy(raw: Partial<TranslationPolicy> | undefined): TranslationPolicy {
  const targets = Array.isArray(raw?.targets)
    ? raw.targets.filter((t): t is string => typeof t === 'string')
    : TRANSLATION_DEFAULTS.targets;
  return {
    enabled: typeof raw?.enabled === 'boolean' ? raw.enabled : TRANSLATION_DEFAULTS.enabled,
    targets,
    defaultEngine:
      typeof raw?.defaultEngine === 'string' && raw.defaultEngine.trim()
        ? raw.defaultEngine
        : TRANSLATION_DEFAULTS.defaultEngine,
    glossaryScope: raw?.glossaryScope === 'project' ? 'project' : 'org',
    ...ENFORCED_GUARDRAILS,
  };
}

/**
 * How a refused governed write is reported. The server's own message is used
 * where it gave one, and status 0 -- reserved for a failure with no response at
 * all -- is the one case that must never read as "the server said no".
 *
 * The claim this comment used to make, that "apiRequest already lifts it out of
 * the error envelope", is true of only one of the two ways a string gets here.
 * apiRequest throws ApiRequestError with a message extractApiError has already
 * reduced, and liveMutateOrNull passes that through -- so far so good. But
 * liveMutateOrNull also has a branch that never goes near the envelope: a 401
 * is the one status apiRequest does not throw on, and it returns its own
 * `HTTP <status> <path>` string, which carries an API route. Rendering that is
 * an information-disclosure finding, not a cosmetic one. So the string is
 * filtered here rather than trusted: wrapping it as a message body runs it
 * through the same reader every other surface uses, which rejects both
 * enum-shaped tokens and infrastructure text.
 */
function saveFailure(error: string, status: number): string {
  if (status === 0) return 'the server could not be reached, so nothing was saved.';
  const said = serverMessage({ message: error });
  return said ? `${said} (HTTP ${status}).` : `the change was not accepted (HTTP ${status}).`;
}

interface LangOption {
  id: string;
  label: string;
  flag: string;
  agency: string;
}

/* ════════════ Setup (org config) ════════════
   GOVERNED. Every control on this surface either reads and writes a real,
   org-scoped, audited server record, or says plainly that the thing it names is
   enforced elsewhere and cannot be set here. Nothing on it is browser-local any
   more, and no value it shows is fabricated.

   Reads
     GET   /api/organizations/:id            organizations.name
     GET   /api/organizations/:id/settings   settings.translation
     GET   /api/mdx/industry-profile         the governed client type
   Writes
     PATCH /api/organizations/:id/profile    { name, reason }
     PATCH /api/organizations/:id/settings   { settings: { translation }, reason }
     PATCH /api/mdx/industry-profile         (useIndustryProfile)

   `:id` is getJwtOrgId() — the organizationId claim on the caller's OWN token,
   never a value this page holds or a user types. That is the identifier
   organizations-routes.ts actually takes: validateOrgOwnership pins a non-staff
   caller to exactly that org (a tenant 'admin' is deliberately not treated as
   platform staff there), and requireOrgAdmin gates both writes — so a member
   without the admin role gets a 403 and this panel says so instead of letting
   the save look like it landed.

   Both writes carry a reason, because both routes audit one: the profile PATCH
   logs before/after plus the reason, and the settings PATCH logs the changed
   SECTION KEYS and the reason but deliberately not the values (settings
   sections can carry integration credentials).

   The one thing NOT wired, deliberately: /api/setup. The only routes there
   (server/routes/setup.ts) are the first-run installer — GET /status
   ({ initialized }) and the self-closing POST /initialize that creates the
   first org + admin on an EMPTY database. Calling that from an admin console
   would be destructive, not persistence.

   ── Controls that are deliberately not switches ────────────────────────────
   Three translation controls used to render as toggles reading "Enforced" /
   "Disabled". They are enforced UNCONDITIONALLY by DEFAULT_GUARDRAILS
   (server/services/translation/types.ts) through approvalGuard()
   (server/services/translation/hybrid-workflow.ts), which
   POST /api/translation/segments/:id/approve runs against every approval:

     machine-only segments   approvableMethods: ['human', 'mt_postedited']
     back-translation        requireBackTranslation, threshold 0.85, and
                             deterministic/demo output is never evidence
     separation of duties    a named reviewer who is not the post-editor

   No org setting is consulted at any point. A switch that appeared to turn one
   off would have changed nothing server-side while telling an administrator
   they had relaxed a Part 11 control — the most dangerous kind of wrong. They
   render as locked, enforced facts instead.

   MFA and SSO were switches too. There is no organization-wide MFA gate:
   users.mfaEnabled is per-user enrolment through mfaService, and no sign-in
   path reads an org flag. SSO/SCIM is genuinely governed — but by the Identity
   console (SAML endpoints, SCIM provisioning tokens, IP allowlist), not by a
   boolean here, and a second copy of that state would be a second source of
   truth that nothing reconciles. Both are now status rows naming where the
   control actually lives. */

export function Setup({ onAsk, onNav }: SurfaceViewProps) {
  /* The org claim on the caller's own token. Read once: the identity behind a
     mounted surface does not change, and re-reading would re-key the fetches. */
  const orgId = useMemo(() => getJwtOrgId(), []);
  const orgPath = `/api/organizations/${encodeURIComponent(orgId)}`;

  const org = useLiveData<OrgRecord>(orgPath);
  const orgSettings = useLiveData<OrgSettingsRecord>(`${orgPath}/settings`);

  /* Server truth and the working copy the controls edit. Both take the same
     value the moment a load lands, so `dirty` is exactly "what this
     administrator changed and has not saved yet" — never "what differs from a
     default we made up". */
  const [savedName, setSavedName] = useState('');
  const [name, setName] = useState('');
  const [savedTxw, setSavedTxw] = useState<TranslationPolicy>(TRANSLATION_DEFAULTS);
  const [txw, setTxw] = useState<TranslationPolicy>(TRANSLATION_DEFAULTS);

  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);

  const orgLoaded = !org.loading && !org.error;
  const settingsLoaded = !orgSettings.loading && !orgSettings.error;
  const loadError = org.error ?? orgSettings.error ?? null;
  const loading = org.loading || orgSettings.loading;

  useEffect(() => {
    if (!orgLoaded) return;
    const live = org.data?.organization?.name ?? '';
    setSavedName(live);
    setName(live);
  }, [orgLoaded, org.data]);

  useEffect(() => {
    if (!settingsLoaded) return;
    const live = readTranslationPolicy(orgSettings.data?.settings?.translation);
    setSavedTxw(live);
    setTxw(live);
  }, [settingsLoaded, orgSettings.data]);

  const nameDirty = orgLoaded && name.trim() !== savedName;
  const txwDirty = settingsLoaded && JSON.stringify(txw) !== JSON.stringify(savedTxw);
  const dirty = nameDirty || txwDirty;
  const editable = !loading && !loadError;

  const setTxwField = <K extends keyof TranslationPolicy>(k: K, v: TranslationPolicy[K]) =>
    setTxw((prev) => ({ ...prev, [k]: v }));

  /**
   * One reason, up to two governed PATCHes, and a baseline that advances ONLY
   * for the call that actually succeeded — so a partial failure leaves the
   * failed section dirty and visibly unsaved rather than quietly marking it
   * clean. The reason is cleared only when everything landed.
   */
  async function saveOrg() {
    const why = reason.trim();
    if (why.length < 3) {
      setSaveNote({
        tone: 'warn',
        text: 'Enter a reason of at least 3 characters — it is written to the audit record.',
      });
      return;
    }
    if (nameDirty && !name.trim()) {
      setSaveNote({ tone: 'warn', text: 'Organization name cannot be blank.' });
      return;
    }

    setSaving(true);
    setSaveNote(null);
    const failures: string[] = [];

    if (nameDirty) {
      const r = await liveMutateOrNull<{ organization?: { name?: string } }>(
        'PATCH',
        `${orgPath}/profile`,
        { name: name.trim(), reason: why },
      );
      if (r.error) failures.push(`Organization name -- ${saveFailure(r.error, r.status)}`);
      else setSavedName(r.data?.organization?.name ?? name.trim());
    }

    if (txwDirty) {
      // Defence in depth, and deliberately redundant with readTranslationPolicy:
      // that pins the guardrails on the way in, this pins them on the way out,
      // and either alone is enough today. Both stay because the cost is one
      // spread and the failure they prevent -- a stored org policy describing
      // weaker Part 11 controls than the server enforces -- is invisible on
      // screen and would surface as an audit finding.
      const payload: TranslationPolicy = { ...txw, ...ENFORCED_GUARDRAILS };
      const r = await liveMutateOrNull('PATCH', `${orgPath}/settings`, {
        settings: { translation: payload },
        reason: why,
      });
      if (r.error) failures.push(`Translation workspace -- ${saveFailure(r.error, r.status)}`);
      else setSavedTxw(payload);
    }

    setSaving(false);
    if (failures.length) {
      setSaveNote({ tone: 'warn', text: `Not saved: ${failures.join('  ')}` });
      return;
    }
    setReason('');
    setSaveNote({
      tone: 'ok',
      text: 'Saved to the organization record and written to the audit trail.',
    });
  }

  /* ── Governed client type (org industry profile) ──
     The picker below reads/writes GET|PATCH /api/mdx/industry-profile. The
     profile row is the truth; this component keeps only the picker-level
     nuance the governed enum collapses (pharma vs biotech). */
  const { profile, save: saveProfile, saveState } = useIndustryProfile();
  const govPrimary = profile.status === 'ready' ? profile.data.primaryIndustry : null;
  const govSpec = profile.status === 'ready' ? profile.data.mdxSpecialization : null;
  const [clientType, setClientType] = useState('');

  useEffect(() => {
    if (!govPrimary) return;
    setClientType((prev) =>
      pickerMatchesProfile(prev, govPrimary, govSpec) ? prev : governedToPicker(govPrimary, govSpec),
    );
  }, [govPrimary, govSpec]);

  const chooseClientType = (t: string) => {
    setClientType(t);
    const patch = buildOrgProfilePatch(t, govSpec);
    if (patch) void saveProfile(patch);
  };

  const clientTypeStatus: string =
    profile.status === 'error'
      ? 'Governed profile unreachable — the client type could not be read and cannot be changed.'
      : saveState.status === 'saving'
        ? 'Saving to governed org profile…'
        : saveState.status === 'error'
          ? saveState.message
          : saveState.status === 'saved'
            ? 'Saved to the governed org profile (audited).'
            : profile.status === 'loading'
              ? 'Loading governed org profile…'
              : profile.status === 'empty'
                ? 'No governed profile saved yet — pick a type to create one.'
                : profile.status === 'ready'
                  ? 'Governed — loaded from your org industry profile.'
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
    setTxwField(
      'targets',
      txw.targets.includes(id) ? txw.targets.filter((x) => x !== id) : [...txw.targets, id],
    );

  /* What AnA can see of this screen.
     Setup is a governed editor: every control here writes to the organization
     record under a reason, audited. So the fact that matters most is not what
     the settings ARE but whether the administrator has UNSAVED changes and
     whether the reason field is filled — the two things that decide whether the
     save will be accepted. Publishing the settings without that would let AnA
     describe as current a value nobody has committed.

     A FAILED load publishes the failure: the working copy falls back to
     TRANSLATION_DEFAULTS, and presenting a default as this organisation's
     policy would misstate a governed configuration. */
  const anaContext = useMemo(() => {
    if (loading) {
      return { summary: 'The organization profile and settings are still loading; nothing on screen is final yet.' };
    }
    if (loadError) {
      return {
        summary:
          'The organization record could not be read, so the controls on this screen are showing built-in ' +
          'defaults rather than this organisation\u2019s saved settings, and nothing here can be edited.',
        facts: { loadFailure: loadError },
        availableActions: ['Retry the organization profile and settings read'],
      };
    }
    return {
      summary:
        `Organization setup: name "${savedName}"` +
        (clientType ? `, client type "${clientType}"` : '') +
        `. Translation policy ${savedTxw.enabled ? 'enabled' : 'disabled'} across ` +
        `${savedTxw.targets.length} target language(s) on ${savedTxw.defaultEngine}. ` +
        (dirty
          ? `There are UNSAVED changes (${[nameDirty && 'organization name', txwDirty && 'translation policy'].filter(Boolean).join(' and ')})` +
            `, and a reason for change is ${reason.trim() ? 'entered' : 'still required before they can be saved'}.`
          : 'Nothing is unsaved.'),
      facts: {
        savedOrganizationName: savedName,
        editedOrganizationName: nameDirty ? name : null,
        clientType: clientType || null,
        clientTypeStatus,
        savedTranslationPolicy: savedTxw,
        editedTranslationPolicy: txwDirty ? txw : null,
        hasUnsavedChanges: dirty,
        reasonForChangeEntered: reason.trim().length > 0,
        editable,
        lastSaveNote: saveNote ? { tone: saveNote.tone, text: saveNote.text } : null,
      },
      availableActions: [
        'Change the organization name or the translation policy, then save under an audited reason for change',
        'Pick the client type, which is written to the governed org industry profile',
        'Add or remove target languages and choose the default translation engine',
        'Set the translation guardrails — back-translation, two-person rule, blocking machine approval',
      ],
    };
  }, [loading, loadError, savedName, name, nameDirty, clientType, clientTypeStatus, savedTxw, txw, txwDirty, dirty, reason, editable, saveNote]);
  usePublishSurfaceContext('setup', anaContext);

  return (
    <div className="page-inner">
      <AdminHeader
        eyebrow="Admin — organization"
        title={
          <React.Fragment>
            Setup
          </React.Fragment>
        }
        sub="Organization profile and module configuration, saved to the organization record and written to the audit trail. Controls the platform enforces rather than exposes are marked as enforced."
        actions={
          <React.Fragment>
            <input
              aria-label="Reason for change"
              className="txw-gov-field"
              placeholder="Reason for change (audited)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={!dirty || saving}
              style={{
                fontSize: 12.5,
                padding: '7px 10px',
                borderRadius: 6,
                border: '1px solid var(--border-control)',
                background: 'var(--bg-050)',
                color: 'var(--text-100)',
                minWidth: 220,
              }}
            />
            <button className="btn" onClick={() => void saveOrg()} disabled={!dirty || saving}>
              {saving ? 'Saving…' : dirty ? 'Save to organization' : 'No unsaved changes'}
            </button>
            <button
              className="btn ghost"
              onClick={() => onAsk && onAsk('Summarize my org configuration')}
            >
              {I.sparkles} Ask AnA
            </button>
          </React.Fragment>
        }
      />

      {loadError && (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load your organization record"
          hint={`${loadError} -- nothing below is editable until the organization record loads, so no change can be lost.`}
        />
      )}
      {saveNote && (
        <div className="txw-help" data-tone={saveNote.tone === 'warn' ? 'warn' : undefined}>
          {saveNote.tone === 'warn' ? I.alertTriangle : I.checkCircle} {saveNote.text}
        </div>
      )}

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
                  aria-label="Organization name"
                  className="txw-gov-field"
                  style={{
                    fontSize: 13,
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--border-control)',
                    background: 'var(--bg-050)',
                    width: '100%',
                    maxWidth: 340,
                  }}
                  value={name}
                  disabled={!editable || saving}
                  onChange={(e) => setName(e.target.value)}
                />
                <span className="txw-help" data-tone={nameDirty ? 'warn' : undefined}>
                  {loading
                    ? 'Loading the organization record…'
                    : loadError
                      ? 'Unavailable — the organization record did not load.'
                      : nameDirty
                        ? 'Unsaved — give a reason and save to write it to the organization record.'
                        : 'Governed — stored on the organization record.'}
                </span>
              </div>
            </div>
            <div className="txw-row">
              <div className="txw-row-l">
                Client type
                <small>
                  Sets the default rail focus and AnA framing. Governed — saved to your
                  organization's industry profile.
                </small>
              </div>
              <div className="txw-row-r">
                <div className="txw-row-r-grid">
                  {CLIENT_TYPE_OPTIONS.map((t) => (
                    <button
                      key={t}
                      className="txw-pchip"
                      data-on={clientType === t || undefined}
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
                <small>TOTP via an authenticator app, enrolled by each member.</small>
              </div>
              <div
                className="txw-row-r"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
              >
                <span className="txw-help">
                  {I.info} Set per user, not per organization. Sign-in enforcement follows each
                  member's own enrolment, so there is nothing for an administrator to switch here.
                </span>
              </div>
            </div>
            <div className="txw-row">
              <div className="txw-row-l">
                SSO &amp; SCIM<small>SAML / OIDC and directory provisioning.</small>
              </div>
              <div
                className="txw-row-r"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
              >
                <button className="btn ghost" onClick={() => onNav('identity-console')}>
                  {I.lock} Open Identity console
                </button>
                <span className="txw-help">
                  Governed there, not here — SAML endpoints, SCIM provisioning tokens and the SCIM
                  IP allowlist. A boolean on this page would be a second copy of that state with
                  nothing to reconcile it.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* -- Translation workspace -- */}
        <div className="txw-set-card">
          <div className="txw-set-head">
            <div className="txw-set-head-l">
              <div className="txw-set-eyebrow">Module — authoring</div>
              <h2 className="txw-set-title">Translation workspace</h2>
              <p className="txw-set-sub">
                Bilingual review for non-English regulatory content — drafted by MT, post-edited by a
                human, back-translated for verification, and approved under 21 CFR Part 11. Exposed
                inside the Document editor's Trans dock.
              </p>
            </div>
            <button
              className="txw-switch"
              data-on={txw.enabled || undefined}
              disabled={!editable || saving}
              onClick={() => setTxwField('enabled', !txw.enabled)}
              aria-pressed={txw.enabled}
              aria-label="Enable translation workspace"
            />
          </div>
          {txw.enabled && (
            <div className="txw-set-body">
              {/* The honest scope of the three editable preferences below. They
                  persist on the organization record and are audited; the
                  translation service does not read them yet (project creation
                  takes its own target language, and draft generation routes
                  through the AnA gateway's model policy). Stating that once,
                  here, is better than three hedged row captions -- and better
                  than letting an administrator assume enforcement. */}
              <div className="txw-help" data-tone="warn">
                {I.info} Declared org defaults. These three persist on the organization record and
                are audited, but the translation service does not read them yet — a project still
                chooses its own target language and drafting routes through the AnA gateway's model
                policy. The approval guardrails further down are a different matter: those are
                enforced on every approval.
              </div>
              <div className="txw-row">
                <div className="txw-row-l">
                  Target languages
                  <small>The set this organization declares for regulatory translation.</small>
                </div>
                <div className="txw-row-r">
                  <div className="txw-row-r-grid">
                    {ALL_LANGS.map((l) => (
                      <button
                        key={l.id}
                        className="txw-pchip"
                        data-on={txw.targets.includes(l.id) || undefined}
                        disabled={!editable || saving}
                        onClick={() => toggleLang(l.id)}
                      >
                        <span className="txw-pchip-flag">{l.flag}</span>
                        {l.label}{' '}
                        <span
                          style={{
                            color: txw.targets.includes(l.id)
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
                  {txw.targets.length === 0 && (
                    <div className="txw-warn">
                      {I.alertTriangle}Select at least one target language.
                    </div>
                  )}
                </div>
              </div>
              <div className="txw-row">
                <div className="txw-row-l">
                  Default MT engine
                  <small>The engine this organization intends for first-pass drafts.</small>
                </div>
                <div className="txw-row-r" style={{ flexDirection: 'row' }}>
                  <select
                    aria-label="Default MT engine"
                    value={txw.defaultEngine}
                    disabled={!editable || saving}
                    onChange={(e) => setTxwField('defaultEngine', e.target.value)}
                    style={{
                      fontSize: 12.5,
                      padding: '7px 10px',
                      borderRadius: 6,
                      border: '1px solid var(--border-control)',
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
                        data-on={txw.glossaryScope === o.id || undefined}
                        disabled={!editable || saving}
                        onClick={() => setTxwField('glossaryScope', o.id)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Enforced, not configurable -- see the card comment above Setup.
                  These render as locked facts because approvalGuard() applies
                  DEFAULT_GUARDRAILS to every approval and reads no org setting;
                  a switch here would have let an administrator believe they had
                  turned a Part 11 control off while the server kept enforcing
                  it. Stated as a capability, this is also the stronger claim. */}
              {ENFORCED_APPROVAL_RULES.map((rule) => (
                <div className="txw-row" key={rule.id}>
                  <div className="txw-row-l">
                    {rule.title}
                    <small>{rule.detail}</small>
                  </div>
                  <div
                    className="txw-row-r"
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                  >
                    <span className="rd-chip tone-ok">
                      {I.lock} Always enforced
                    </span>
                    <span className="txw-help">{rule.evidence}</span>
                  </div>
                </div>
              ))}
              <div className="txw-row" style={{ borderBottom: 0 }}>
                <div className="txw-row-l">
                  Open in editor
                  <small>
                    Reach the workspace from any document — click the <b>Trans</b> dock tab in the
                    Document editor.
                  </small>
                </div>
                <div className="txw-row-r">
                  <span className="txw-help">
                    Surfaces inside <b>Document editor — Trans</b> with Sections / Segments /
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
    const saved = downloadText(
      'audit-trail-signed-export.json',
      JSON.stringify(json.export, null, 2),
      'application/json',
    );
    if (!saved) return { ok: false, error: 'The export was produced but the browser refused the download.' };
    return { ok: true };
  } catch {
    // Raw fetch: the only throw reachable here is the request itself failing,
    // whose native message is "Failed to fetch" — not an export failure the
    // server described, and not copy.
    return { ok: false, error: 'Export failed.' };
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

  /* What AnA can see of this screen.
     A FAILED read publishes the failure, and on this surface that is not a
     nicety: the audit trail is the 21 CFR Part 11 §11.10(e) record, and an
     assistant reporting "no audit events" because the ledger did not respond
     would be asserting the absence of a regulated record. The surface itself
     already refuses to render that as an empty state; the same rule applies to
     what AnA is told.

     The hash-chain verdict travels with it, because "intact" is the claim an
     inspector acts on and it is computed here from the rows on screen. */
  const anaContext = useMemo(() => {
    if (loading) {
      return { summary: 'The audit trail is still loading; nothing on screen is final yet.' };
    }
    if (error) {
      return {
        summary:
          'The append-only, hash-chained Part 11 ledger could not be read, so this screen is showing no ' +
          'audit events because of a failure. That is NOT the same as the trail being empty and must not ' +
          'be reported as one.',
        availableActions: ['Retry the audit-trail read'],
      };
    }
    const filtered = kind !== 'all' || term.length > 0;
    return {
      summary:
        `Audit trail: ${entries.length} hash-chained entry(ies)` +
        (filtered ? `, filtered to ${log.length} by kind "${kind}"${term ? ` and the search "${q}"` : ''}` : '') +
        `. Hash chain ${chainStatus.intact ? 'verifies intact' : `has ${chainStatus.total - chainStatus.valid} link(s) that do not verify`}` +
        ` over ${chainStatus.total} entry(ies).` +
        (entry ? ` Entry ${entry.id} is open.` : ''),
      facts: {
        totalEntries: entries.length,
        shownInList: log.length,
        kindFilter: kind,
        searchTerm: term || null,
        entriesByKind: Object.fromEntries(kindCounts.map((k) => [k.id, k.n])),
        hashChain: { total: chainStatus.total, verified: chainStatus.valid, intact: chainStatus.intact },
        hashChainViewOpen: chainView,
        // Enough to name an event back to the user, not the whole ledger.
        // `actor` (an individual's name, or an email via the server's
        // actorName fallback) and `reason` (user-authored signing/decision
        // free-text) are deliberately NOT published: the name/email is PII and
        // the free-text is both sensitive content and a prompt-injection vector
        // folded verbatim into the model prompt. `meaning` (an
        // APPROVAL/AUTHORSHIP/… enum) and `hasReason` carry the same grounding
        // without the payload — the way this block already omits `e.ip`. The
        // actor and reason stay on the ledger row, where the person reads them.
        recentEntries: log.slice(0, 10).map((e) => ({
          id: e.id, when: e.when, event: e.event,
          target: e.target, kind: e.kind, eSigned: e.sig,
          hasReason: Boolean(e.reason), meaning: e.meaning,
        })),
        selectedEntry: entry
          ? {
              id: entry.id, when: entry.when, event: entry.event,
              target: entry.target, kind: entry.kind, eSigned: entry.sig,
              hasReason: Boolean(entry.reason), meaning: entry.meaning,
            }
          : null,
        lastExportFailure: exportErr || null,
      },
      availableActions: [
        'Filter the ledger by event kind, or search actor, event, target or entry id',
        'Open an entry to read its reason, signature meaning and chain links',
        'Show the hash-chain view',
        'Export the signed, inspection-ready audit bundle (data + manifest + HMAC signature)',
      ],
    };
  }, [loading, error, entries, log, kind, term, q, kindCounts, chainStatus, chainView, entry, exportErr]);
  usePublishSurfaceContext('audit-trail', anaContext);

  return (
    <div className="page-inner">
      <AdminHeader
        eyebrow="Admin — compliance"
        title="Audit trail"
        sub={`${entries.length} entries — hash-chained — append-only — 21 CFR Part 11 ss11.10(e)`}
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
          hint="The append-only, hash-chained 21 CFR Part 11 ledger didn't respond. Sign in and retry, or check the audit service is reachable — the trail is never shown as an empty 'no events' state when it can't be read."
        />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={I.scroll}
          title="No audit entries yet"
          hint="Governed actions — authoring, review, submission, vault locks and e-signatures — are written here to the immutable hash-chained ledger as they happen."
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
            verified — SHA-256 — append-only ledger
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
            Hash chain — newest to oldest
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
   renewal column is read anywhere server-side) are left empty, never invented.

   ENTITLEMENT HONESTY. Every card states one of five things, and they are not
   interchangeable: the module is on; it is in the plan and simply not switched
   on; an administrator switched it off; the plan does not include it; it is not
   offered for this workspace's industry. The reason and the remedy travel
   together — the last one has no remedy on this screen and is given none,
   rather than a plans button that would resolve nothing. The wording is the
   shell's own (lockNotice / lockShortReason in navEntitlements.tsx), so the
   rail's explanation for a lock and this catalog's explanation for the same
   lock are the same sentence. */

/** One live catalog row (ModuleCatalogEntry, server/services/license-manager.ts). */
interface LiveModuleEntry {
  moduleId: string;
  name: string;
  description: string | null;
  category: string | null;
  isEnabled: boolean;
  /* The subscription row's OWN state (ModuleSubscriptionState). `isEnabled`
     collapses "an administrator switched this off" and "this organization never
     had a row written" into one `false` — the right answer for "may they use
     it", the wrong answer for "why not". The server keeps the two apart for
     exactly that reason; this surface used to drop the field on the floor and
     told the owner of EVERY off module that "an admin can re-enable it", which
     invents an administrator's decision for modules nobody has ever touched.

     Optional because a deployment whose server predates the field still returns
     rows without it. `moduleVerdict` then falls back to 'none', which is the
     branch that makes no accusation and claims no lock — see rule 1. */
  subscriptionState?: 'enabled' | 'disabled' | 'none';
  isAvailable: boolean;
  requiredTier: string | null;
  sortOrder: number;
}

/**
 * Display row — the fixture shape, plus the live module's name and the two
 * entitlement facts the card has to keep apart.
 *
 * `lock` and `toggleable` are separate on purpose. A module an administrator
 * switched OFF is locked (nobody can open it) AND toggleable (an admin turning
 * it back on is precisely the remedy). A module above the org's tier is locked
 * and NOT toggleable. Folding either into the other produces a card that either
 * hides the fix or offers a button whose only outcome is a 403.
 */
type AppRow = AppsCatalogApp & {
  name?: string;
  /** Why this organization cannot open the module, or null when it can. */
  lock: NavSurfaceEntitlement | null;
  /** Whether PUT /:moduleId/toggle would be accepted — mirrors canAccessModule. */
  toggleable: boolean;
};
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

/**
 * The payload is the catalog contract — `{ modules: [...] }` with a real array.
 *
 * Passed to `useLiveData` so a 200 that is NOT the catalog (an envelope change,
 * a proxy's HTML login page, `{ data: [] }`) reaches the surface's error branch
 * instead of its empty branch. Before this, `mapLiveCatalog` returned null for
 * both a malformed body and an empty list, and the surface rendered "No apps
 * enabled yet" — an error presented to a paying customer as the finding that
 * their organization has no applications, and published to AnA as the same
 * claim. Written inline rather than with `hasKeys('modules')` because the whole
 * point is that `modules` must be an ARRAY, which a key check does not assert.
 */
function isCatalogPayload(v: unknown): v is { modules: LiveModuleEntry[] } {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  return Array.isArray((v as { modules?: unknown }).modules);
}

/**
 * The plan band a module sits in — the lowest tier that includes it, or
 * 'Included' when the catalog attaches no tier requirement at all.
 *
 * This replaces `liveTierLabel`, which mapped `!isAvailable` to 'Add-on' BEFORE
 * looking at `requiredTier`. That was defensible while every catalog row had an
 * empty `tiers` array; since 20260823_module_catalog_commercial_packaging.sql
 * gave all 84 rows a real band it is two separate lies. It threw away the one
 * number a customer needs ("which plan do I need?") in favour of 'Add-on', a
 * word that promises something purchasable — and it said that word just as
 * loudly for a module withheld by INDUSTRY MODE, which no plan on the price
 * list will ever unlock. What is not available and why is now `lock`'s job; the
 * chip states the packaging fact and nothing else.
 */
function tierBandLabel(m: LiveModuleEntry): string {
  if (!m.requiredTier) return 'Included';
  return m.requiredTier.charAt(0).toUpperCase() + m.requiredTier.slice(1);
}

/**
 * Why this organization cannot open a module, as the shell's own lock verdict —
 * or null when it can.
 *
 * The branch order mirrors `decideNavEntitlement`
 * (server/services/entitlements/navigation-entitlements.ts) deliberately, down
 * to its tier/industry tie-break, so the rail and this catalog never give one
 * customer two different reasons for one lock. Two differences, both required:
 *
 *   - No `master_admin` branch. That grant answers "may this VIEWER open it",
 *     and the platform owner may open everything. This screen answers "what has
 *     this ORGANIZATION subscribed to", which is the state the toggle writes;
 *     collapsing it to `entitled` would show a master admin every module as
 *     available while the org's switches are off, and hide the switch that is
 *     the entire purpose of the page.
 *   - Read from GET /catalog, not from `useNavEntitlements()`. The nav payload
 *     carries no verdict for the Apps catalog's own destinations by design
 *     (rule 2: an unknown id is not licensable), and it is resolved once per
 *     session, so it would not see the write this page just made.
 *
 * The tie-break inherits the server's bias on purpose: with the org's tier
 * unknown (the licence read failed independently of the catalog read), it
 * reports 'industry' rather than 'tier'. Being wrongly told to ask an
 * administrator costs a conversation; being wrongly told to upgrade sells
 * somebody a plan that changes nothing.
 */
function moduleVerdict(m: LiveModuleEntry, orgTier: string | null): NavSurfaceEntitlement | null {
  const base = { id: m.moduleId, label: m.name, requiredTier: m.requiredTier };
  const state = m.subscriptionState ?? (m.isEnabled ? 'enabled' : 'none');
  if (state === 'enabled') return null; // 'subscribed'
  if (state === 'disabled') return { ...base, entitled: false, source: 'disabled' };
  if (m.isAvailable) return null; // 'included' — in the plan, no row written yet
  const orgRank = orgTier != null ? LIC_TIER_LEVEL[orgTier] : undefined;
  const needRank = m.requiredTier != null ? LIC_TIER_LEVEL[m.requiredTier] : undefined;
  const belowTier = orgRank !== undefined && needRank !== undefined && orgRank < needRank;
  return { ...base, entitled: false, source: belowTier ? 'tier' : 'industry' };
}

/**
 * The `opts` lockNotice requires, for the fields that do not read it.
 *
 * Named rather than inlined so the constraint is visible at the call site: the
 * Apps card renders `status` and the tier branch's CTA, and no branch of
 * lockNotice consults `isOrgAdmin` to produce either. Reading `body`, or the
 * 'disabled' / 'industry' CTAs, from this value WOULD be a fabricated claim
 * about the viewer's role — see the comment where it is used.
 */
const ROLE_AGNOSTIC = { isOrgAdmin: false } as const;

/**
 * Map GET /catalog into the grouped display. Always an array: `isCatalogPayload`
 * has already rejected anything that is not the contract, so `[]` here means
 * the catalog is genuinely empty — the honest empty state, never a failure.
 */
function mapLiveCatalog(payload: unknown, orgTier: string | null): AppGroup[] {
  if (!isCatalogPayload(payload)) return [];
  const rows = payload.modules.filter(isLiveModuleEntry);
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
        tier: tierBandLabel(m),
        on: m.isEnabled,
        desc: m.description || m.name,
        lock: moduleVerdict(m, orgTier),
        /* canAccessModule() allows the write when the module is already in the
           org's enabled set OR its tier and industry match — so an org that
           downgraded can still switch OFF a module it is currently running,
           and nothing else outside the plan can be switched at all. */
        toggleable: m.isAvailable || m.isEnabled,
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
  const catState = useLiveData<{ modules: LiveModuleEntry[] }>(
    '/api/module-subscriptions/catalog',
    ['/api/module-subscriptions/catalog'],
    // A 200 that is not the catalog contract belongs in the error branch below,
    // not in the empty one — see isCatalogPayload.
    isCatalogPayload,
  );
  const licState = useLiveData<Record<string, unknown>>('/api/module-subscriptions/license');
  const lic = useMemo(() => mapLiveLicense(licState.data), [licState.data]);
  // The org's plan tier decides whether an unavailable module is a tier gap or
  // an industry-mode mismatch, so the catalog mapping depends on the licence
  // read as well as its own. Keyed on the tier STRING rather than the licence
  // object so a re-fetch that returns the same tier does not re-seed below.
  const orgTier = lic?.tier || null;
  const liveGroups = useMemo(
    () => mapLiveCatalog(catState.data, orgTier),
    [catState.data, orgTier],
  );
  // Editable copy for optimistic toggles, re-seeded whenever the live mapping
  // resolves to a new reference — once when the catalog lands, and once more if
  // the licence lands after it and changes a tier/industry verdict. Both are
  // one-shot per resolved input (useMemo over resolved payloads), so this
  // settles rather than looping.
  const [cat, setCat] = useState<AppGroup[]>([]);
  const seededRef = useRef<AppGroup[] | null>(null);
  useEffect(() => {
    if (liveGroups.length > 0 && seededRef.current !== liveGroups) {
      seededRef.current = liveGroups;
      setCat(liveGroups);
    }
  }, [liveGroups]);
  // Render from the optimistic copy once seeded, else straight from the live map
  // (avoids a one-frame blank between the fetch resolving and the seed effect).
  const groups = cat.length > 0 ? cat : liveGroups;
  const [admin, setAdmin] = useState(false);
  const [toast, fireToast] = useToast();

  const tierLabel = lic?.tier || '';
  const pj = lic?.usage?.projects || { current: 0, limit: 0 };
  const us = lic?.usage?.users || { current: 0, limit: 0 };

  const setOn = (groupIdx: number, appId: string, on: boolean) =>
    setCat((prev) => {
      const base = prev.length > 0 ? prev : liveGroups;
      return base.map((g, gi) =>
        gi !== groupIdx
          ? g
          : {
              ...g,
              apps: g.apps.map((a) =>
                a.id === appId
                  ? {
                      ...a,
                      on,
                      /* The optimistic row carries the REASON the write
                         implies, not just the switch position. Setting `on`
                         alone left `lock` at null, so a module an administrator
                         had just switched off went on reading "Included in your
                         plan. Not switched on for this organization" until a
                         reload replaced it with the workspace decision that
                         administrator had in fact just made. Only the 'disabled'
                         source is reachable here — the toggle is never rendered
                         for a tier or industry lock — and both directions revert
                         cleanly, because the failure path calls this again with
                         the previous value. */
                      lock: on
                        ? null
                        : {
                            id: a.id,
                            label: a.name || a.id,
                            requiredTier: a.lock?.requiredTier ?? null,
                            entitled: false,
                            source: 'disabled' as const,
                          },
                    }
                  : a,
              ),
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
          // Only apiRequest's own error has been through the envelope reader;
          // a bare rejection is the fetch failing ("Failed to fetch").
          (e instanceof ApiRequestError && e.message ? e.message : 'request failed')
      );
    }
  };

  /* What AnA can see of this screen.
     The Apps catalog is where a user asks "why can't I open X?" — and the
     answer is an entitlement fact on this page: the tier, whether the module is
     available at that tier, and whether it is switched on for the org. Until
     now AnA was told the surface was called "apps" and had none of it.

     A FAILED read publishes the failure: `groups` is [] both when the catalog
     is genuinely empty and when it did not load, and an assistant telling a
     customer they have no apps because a fetch failed is exactly the
     confidently-wrong answer this channel exists to prevent. */
  const anaContext = useMemo(() => {
    if (catState.loading || licState.loading) {
      return { summary: 'The apps catalog and licence are still loading; nothing on screen is final yet.' };
    }
    if (catState.error) {
      return {
        summary:
          'The apps catalog could not be read, so this screen is showing no applications because of a ' +
          'failure, not because none are entitled.',
        availableActions: ['Retry the catalog read'],
      };
    }
    const all = groups.flatMap((g) => g.apps);
    const on = all.filter((a) => a.on);
    return {
      summary:
        `Apps catalog: ${all.length} application(s) across ${groups.length} group(s), ${on.length} enabled for ` +
        `this organisation` +
        (lic
          ? `. Plan "${lic.tier}"${lic.industryMode ? ` (${lic.industryMode} mode)` : ''}, ` +
            `${pj.current} of ${pj.limit} projects and ${us.current} of ${us.limit} users used`
          : '. The licence could not be read, so no plan or usage figures are on screen') +
        (admin ? '. Admin controls are switched on, so the enable/disable toggles are live.' : ''),
      facts: {
        adminControlsVisible: admin,
        licence: lic
          ? {
              tier: lic.tier,
              industryMode: lic.industryMode || null,
              projects: { used: pj.current, limit: pj.limit },
              users: { used: us.current, limit: us.limit },
            }
          : null,
        licenceUnavailable: licState.error ? 'the licence read failed' : null,
        totalApps: all.length,
        enabledApps: on.length,
        groups: groups.map((g) => ({
          group: g.group,
          apps: (g.apps ?? []).map((a) => ({
            id: a.id,
            name: a.name ?? null,
            tier: a.tier,
            enabled: a.on,
            /* "Why can't I open X?" is the question this surface exists to
               answer, and until now AnA could see only that X was off. The
               reason comes from the same helper the rail and the card use, so
               she cannot answer with a fifth phrasing — or, worse, reach for
               "not included in your plan" when the real cause was an
               administrator switching it off. Null means nothing is blocking
               it beyond the switch itself. */
            unavailableBecause: a.lock ? lockShortReason(a.lock) : null,
            /* Whether the enable/disable write would be accepted. She must not
               tell someone to ask an administrator to switch on a module the
               server would refuse with MODULE_NOT_AVAILABLE. */
            anAdminCanSwitchItOn: a.toggleable && !a.on,
          })),
        })),
      },
      availableActions: [
        'Open an enabled application',
        'Show the admin controls and enable or disable a module for this organisation (admin only, persisted)',
        'Read the plan tier and the project / user usage against their limits',
      ],
    };
  }, [catState.loading, catState.error, licState.loading, licState.error, groups, lic, pj, us, admin]);
  usePublishSurfaceContext('apps', anaContext);

  return (
    <div className="page-inner">
      <AdminHeader
        eyebrow="Workspace -- /api/module-subscriptions"
        title="Apps catalog"
        sub="Every application — the destinations you open and work in — entitlement-aware. Active apps launch; anything you cannot open states which of the reasons applies and the step that resolves it, never a dead button. Platform services (below) are the capabilities that run inside these apps."
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
        {/* Was <a href="/settings/subscription">. That path matches no route,
            so the browser did a FULL page reload and the SPA router landed the
            admin back on the app home — a hard reload, a lost place in the
            product, and no billing screen. `licensing` is a real registered
            surface and `onNav` is already in scope here. */}
        <button
          className="btn ghost"
          style={{ height: 28 }}
          onClick={() => open('licensing')}
          data-testid="admin-manage-plan"
        >
          {I.creditCard || I.zap} Manage plan
        </button>
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
          <button
            className="btn ghost"
            style={{ height: 28, marginLeft: 'auto' }}
            onClick={() => open('licensing')}
            data-testid="admin-manage-plan-fallback"
          >
            {I.creditCard || I.zap} Manage plan
          </button>
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
          title="No apps in the catalog"
          hint="The module catalog for this organization is empty. Modules auto-provision by tier; once the catalog is seeded, your apps appear here with their entitlement state."
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
              /* The lock's own words, from the shell's lock vocabulary.

                 Only the role-INVARIANT parts of lockNotice are read here:
                 `status` for the chip, and the 'tier' branch's CTA. Neither
                 reads `opts`. The parts that DO fork on it — every `body`, and
                 the CTAs on the 'disabled' and 'industry' branches — are
                 deliberately unused, for two reasons. This surface holds no
                 auth dependency and cannot answer "is the viewer an org admin"
                 without adding one (the server is the real gate and already
                 reports its refusal on the write). And lockNotice's 'disabled'
                 CTA is "Open Apps catalog", which is this screen: the remedy
                 for that lock is the switch a few pixels away, not a link back
                 to where the reader already is. The sentence therefore comes
                 from lockShortReason, which is documented to stand alone
                 precisely because the rail appends it to a button with no
                 context around it. */
              const notice = a.lock ? lockNotice(a.lock, ROLE_AGNOSTIC) : null;
              /* Mirrors canAccessModule() rather than the chip's LABEL. The
                 previous gate was `a.tier === 'Add-on'`, so the question "would
                 the server accept this write" was answered by string-matching
                 display copy — one wording change away from putting a switch on
                 a module whose only possible response is 403
                 MODULE_NOT_AVAILABLE. `toggleable` is computed from isAvailable
                 / isEnabled, the same two facts the server decides on. */
              const showToggle = admin && a.toggleable;
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
                    {/* Three different facts, three different sentences. An
                        upsell, a workspace decision and an unprovisioned module
                        used to share two strings between them, so an org was
                        told to buy a plan for a module their administrator had
                        switched off — and told an administrator had switched
                        off a module nobody had ever touched. */}
                    {a.lock
                      ? `${label} is ${lockShortReason(a.lock)}.`
                      : a.on
                        ? a.desc
                        : 'Included in your plan. Not switched on for this organization.'}
                  </div>
                  <div className="launch-foot">
                    <span
                      className={`rd-chip rd-chip-sentence tone-${a.lock ? 'idle' : a.on ? 'ai' : 'ok'}`}
                    >
                      {/* Locked: the reason, which for a tier gap names the
                          plan that includes it ("Included from Professional").
                          Otherwise the packaging band the module sits in. */}
                      {notice ? notice.status : a.tier}
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
                    ) : a.toggleable ? (
                      /* Off and switchable — either an administrator turned it
                         off or it was never provisioned. Both are resolved by
                         the switch above, which needs admin controls showing. */
                      <button
                        className="btn ghost"
                        style={{ height: 26, marginLeft: 'auto' }}
                        onClick={() => setAdmin(true)}
                        title="Turn on admin controls to enable this module"
                      >
                        Admin controls
                      </button>
                    ) : notice?.ctaLabel && notice.ctaTarget ? (
                      /* Only the tier branch reaches here with a CTA, and its
                         target is the licensing surface. It is a button, not
                         the old <a href="/settings/subscription">: that path
                         matched no route, so the browser did a full reload and
                         the SPA router landed the admin back on the app home. */
                      <button
                        className="btn primary"
                        style={{ height: 26, marginLeft: 'auto' }}
                        onClick={() => open(notice.ctaTarget as string)}
                        data-testid="admin-upgrade-plan"
                      >
                        {notice.ctaLabel}
                      </button>
                    ) : null /* Industry mismatch: no plan and no switch on this
                                screen changes it, so the card offers no step
                                rather than a button that resolves nothing. */}
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
          <div className="sec-sub">Not apps — capabilities that run inside apps</div>
        </div>
        <div className="svc-note">
          {I.info}
          <span>
            A <b>service</b> is not a destination. You never "open" a service; it works inside the
            applications above — grounding a draft, routing a model, sealing a report, signing an
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
      <C2CToast msg={toast} />
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
  /* Derived from the row's category server-side, so a row whose category never
     got backfilled arrives without one — nullable like `model`, not a contract. */
  fmt: string | null;
  size: string;
  model: string | null;
  when: string;
  ver: string;
  sig: boolean;
  reviewed: boolean;
  sourceCount: number;
  prog: string;
}

/* CSV cell: quote always, double any embedded quote. Artifact names carry
   commas and parentheses ("… — 510(k) Summary, rev 2"), which is exactly the
   text that silently corrupts a hand-rolled CSV. */
function csvCell(v: unknown): string {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

export function ArtifactsCenter({ onAsk, onNav }: SurfaceViewProps) {
  // Real cross-project artifact gallery, unwrapped from { success, data }.
  const { rows, loading, error } = useLiveRows<ArtifactRow>('/api/artifacts-center');
  /* Follow-the-work hand-off (Live Drive): a driven turn that just persisted a
     draft lands here with its artifactId, and the gallery brings that row into
     view, highlighted — the subscriber watches the document ARRIVE. Consumed
     once; a stale or absent hand-off changes nothing. The setter now also
     serves artifacts-center.focus-artifact, which drives the SAME focus
     mechanism by name. */
  const [focusId, setFocusId] = useState<string | null>(
    () => consumeNavParams('artifacts-center')?.artifactId ?? null,
  );
  const focusRowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    /* Guarded like Review's queue scroll: `scrollIntoView` is absent in jsdom
       and some embedded webviews, and an unguarded call throws out of the
       effect — taking the focus highlight down with it. The highlight is the
       part that matters; the scroll is a courtesy. */
    try {
      if (focusId && focusRowRef.current) {
        focusRowRef.current.scrollIntoView({ block: 'center' });
      }
    } catch { /* no scrollIntoView here — the row is still highlighted */ }
  }, [focusId, rows.length]);

  /* AnA's hands on this screen — the surface-action bus (shared registry:
     artifacts-center.focus-artifact, identity-resolved). Focus/scroll only —
     nothing on this surface mutates; downloads and exports stay human acts
     behind their governance gate. */
  useSurfaceActionHandlers('artifacts-center', {
    'artifacts-center.focus-artifact': (params) => {
      const wanted = (params.artifact ?? '').trim();
      if (!wanted) return { ok: false, reason: 'No artifact named.' };
      if (loading)
        return { ok: false, reason: 'The artifact gallery is still loading.', retry: true };
      if (error) return { ok: false, reason: 'The artifact gallery could not be read.' };
      if (rows.length === 0) return { ok: false, reason: 'No artifacts in this gallery.' };
      const lower = wanted.toLowerCase();
      const exact = rows.find((a) => a.name.toLowerCase() === lower);
      const contains = exact ? [] : rows.filter((a) => a.name.toLowerCase().includes(lower));
      const match = exact ?? (contains.length === 1 ? contains[0] : null);
      if (!match) {
        return {
          ok: false,
          reason:
            contains.length > 1
              ? `"${params.artifact}" matches ${contains.length} artifacts — name one exactly.`
              : `No artifact named "${params.artifact}" in the gallery.`,
        };
      }
      setFocusId(match.id);
      return { ok: true, detail: `Focused ${match.name}` };
    },
  });
  /* The ready signal for the retry contract above. */
  useEffect(() => {
    if (!loading) notifySurfaceActionReady('artifacts-center');
  }, [loading]);

  /* What AnA can see of this screen.
     This is the gallery of what SHE drafted, so "where is the SAP I wrote?" and
     "has that memo been signed?" are the questions it exists to answer — and
     until now she could not see a single row of it.

     A FAILED read publishes the failure: an empty gallery and an unreachable
     one look identical from here, and telling a user they have drafted nothing
     because a fetch failed is a claim about their evidence record. */
  const anaContext = useMemo(() => {
    if (loading) {
      return { summary: 'The artifact gallery is still loading; nothing on screen is final yet.' };
    }
    if (error) {
      return {
        summary:
          'The governed artifact gallery could not be read, so this screen is showing no artifacts ' +
          'because of a failure, not because none exist.',
        availableActions: ['Retry the artifact gallery read'],
      };
    }
    const signed = rows.filter((a) => a.sig).length;
    const programs = [...new Set(rows.map((a) => a.prog).filter(Boolean))];
    return {
      summary:
        `Artifacts Center: ${rows.length} artifact(s) across ${programs.length} program(s), ` +
        `${signed} carrying a Part 11 e-signature.`,
      facts: {
        totalArtifacts: rows.length,
        eSignedArtifacts: signed,
        programs,
        // Enough to name an artifact back to the user, not the whole gallery.
        artifacts: rows.slice(0, 15).map((a) => ({
          id: a.id, name: a.name, kind: a.kind, format: a.fmt,
          version: a.ver, program: a.prog, model: a.model,
          updated: a.when, eSigned: a.sig,
        })),
      },
      availableActions: [
        'Open a DOCX artifact in the document editor',
        'Download a rendered artifact',
        'Read an artifact\u2019s version chain, provenance and signature status',
      ],
    };
  }, [loading, error, rows]);
  usePublishSurfaceContext('artifacts-center', anaContext);

  /* ── "Export all" was inert, and the code said so ──────────────────────────
     The two lines above it read: "MOCK ACTION (flagged): 'Export all' has no
     handler and no bulk-export endpoint exists — inert button, left for a later
     actions pass." An admin clicked it and got nothing: no file, no error, no
     toast.

     It exports the MANIFEST, and is labelled that way. There is genuinely no
     bulk-file endpoint — /api/artifacts-center returns a gallery with no
     content, and the three single-document exporters in routes/concept2cure.ts
     take { title, content } for one document behind an export-governance gate
     that a bulk loop must not skip. Building that is a backend change, not a
     button fix. What this surface HAS is the index, and an index is a real,
     useful thing to hand someone — so the button now delivers exactly that and
     its label no longer promises the files. */
  const downloadArtifact = async (a: ArtifactRow) => {
    try {
      const token = getAuthToken();
      const res = await fetch(
        `/api/artifacts-center/${encodeURIComponent(a.id)}/export?format=docx`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        const why = (b as { message?: string; error?: string } | null);
        // eslint-disable-next-line no-alert
        window.alert(
          'Not downloaded — ' +
            (why?.message || why?.error || `the server refused it (HTTP ${res.status})`) + '.',
        );
        return;
      }
      downloadBlob(safeFileName(a.name, 'artifact').slice(0, 80) + '.docx', await res.blob());
    } catch (e) {
      // eslint-disable-next-line no-alert
      window.alert('Not downloaded — ' + (e instanceof Error ? e.message : String(e)) + '.');
    }
  };

  const exportManifest = () => {
    const cols: Array<[string, (r: ArtifactRow) => unknown]> = [
      ['Name', (r) => r.name],
      ['Kind', (r) => r.kind],
      ['Format', (r) => r.fmt ?? ''],
      ['Size', (r) => r.size],
      ['Model', (r) => r.model ?? ''],
      ['Version', (r) => r.ver],
      ['Signed', (r) => (r.sig ? 'yes' : 'no')],
      ['Program', (r) => r.prog],
      ['Updated', (r) => r.when],
    ];
    const csv = [
      cols.map((c) => csvCell(c[0])).join(','),
      ...rows.map((r) => cols.map((c) => csvCell(c[1](r))).join(',')),
    ].join('\n');
    downloadText('artifacts-manifest.csv', csv, 'text/csv;charset=utf-8');
  };
  return (
    <div className="page-inner">
      <AdminHeader
        eyebrow="Workspace — evidence"
        title="Artifacts Center"
        sub="Every artifact AnA has drafted — across projects, with version chain, provenance and signature status. Open a DOCX to edit it, or download a PDF."
        actions={
          <button
            className="btn ghost"
            onClick={exportManifest}
            /* Disabled on empty or failed, so it can never present as a
               no-op again: with no rows there is no manifest to export. */
            disabled={loading || Boolean(error) || rows.length === 0}
            title={
              rows.length === 0
                ? 'No artifacts to export yet'
                : 'Download the artifact index as CSV (names, versions, signature status — not the files)'
            }
            data-testid="artifacts-export-manifest"
          >
            {I.download || I.externalLink} Export manifest
          </button>
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
          hint="Every artifact AnA drafts across your projects lands here — with its version chain, provenance and signature status. Draft a section, SAP, memo or report to get started."
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
          // A row with no `fmt` misses ARTIFACT_FMT and used to fall through to
          // `a.fmt.toUpperCase()` on the absent value, taking the whole gallery
          // down with it. No format means no label to show for it.
          const f = (a.fmt && ARTIFACT_FMT[a.fmt]) || {
            label: a.fmt ? a.fmt.toUpperCase() : '',
            tone: 'idle',
            action: 'Download',
          };
          const isDoc = a.fmt === 'docx';
          return (
            <div
              key={a.id}
              ref={a.id === focusId ? focusRowRef : undefined}
              className={`ct-row art-row${a.id === focusId ? ' is-focus' : ''}`}
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
                <span className="art-kind" data-testid={`artifact-governance-${a.id}`}>
                  {a.sourceCount ?? 0} cited source{a.sourceCount === 1 ? '' : 's'} ·{' '}
                  {a.reviewed ? 'Human review recorded' : 'Human review required'}
                </span>
              </div>
              <div>
                {/* No format on the row -> no badge, rather than an empty pill
                    that reads as a format the artifact does not have. */}
                {f.label && (
                  <span className="art-fmt" data-tone={f.tone}>
                    {f.label}
                  </span>
                )}
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
                {/* The non-docx branch used to run
                    onAsk('Download <name> (PDF, 24 KB)') — it typed the file's
                    name into the chat rail. No file was produced, and none
                    could be: the gallery read returns octet_length(a.content),
                    not the content, and there was no per-artifact endpoint to
                    ask for it. GET /api/artifacts-center/:id/export now exists
                    and renders the stored content behind the same
                    export-review gate the other exporters use. */}
                <button
                  className="art-act pri"
                  onClick={() => {
                    if (!isDoc) {
                      void downloadArtifact(a);
                      return;
                    }
                    /* Open used to navigate empty-handed: the editor landed on
                       its default document, not this artifact. It now rides the
                       same authoring.open-document directive AnA rides — the
                       bus stashes it across the navigate→mount gap and the
                       editor resolves the name with its own honest-miss rules.
                       An unresolvable name still lands on the editor (what the
                       bare navigation always did), never a fabricated open. */
                    const res = resolveSurfaceAction('authoring.open-document', { title: a.name });
                    if (res.ok) applySurfaceAction(res.directive, (t) => onNav(t));
                    else onNav('document-authoring');
                  }}
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
/**
 * Fetch one GAMP 5 validation document and hand it to the browser.
 *
 * `if (!res.ok) return;` was the whole error path: a 401, 403 or 500 produced
 * no file, no message and no sign anything had happened, so an auditor clicking
 * IQ/OQ/PQ on a computer-system-validation file saw a dead button. Returns a
 * message on failure, null on success, so the caller can say so.
 */
async function downloadValidationDoc(docId: string, filename: string): Promise<string | null> {
  try {
    const token = getAuthToken();
    const res = await fetch(`/api/validation-kit/${encodeURIComponent(docId)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      return res.status === 401 || res.status === 403
        ? `${docId} was not downloaded — your account is not authorised to read the validation kit.`
        : `${docId} was not downloaded — the validation kit refused the request (HTTP ${res.status}).`;
    }
    const blob = await res.blob();
    if (blob.size === 0) {
      return `${docId} came back empty — nothing was downloaded.`;
    }
    return downloadBlob(filename, blob)
      ? null
      : `${docId} was fetched but the browser refused the download.`;
  } catch (e) {
    return `${docId} was not downloaded — ${e instanceof Error ? e.message : String(e)}.`;
  }
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
  /* A refused validation-kit download. Announced beside the document list —
     the button used to swallow 401/403/500 entirely (`if (!res.ok) return;`). */
  const [vkitError, setVkitError] = useState('');
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
      fireToast('Enter an email', 'error');
      return;
    }
    if (form.reason.trim().length < 3) {
      fireToast('A reason (min 3 chars) is required', 'error');
      return;
    }
    const roleMeta = LIC_ROLES.find((r) => r.id === form.role);
    const okMsg =
      (roleMeta && roleMeta.business ? 'Business-tier ' : '') +
      'role granted — audited (Part 11)';

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
        fireToast('Could not grant — sign in as a platform admin', 'error');
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
        // Only apiRequest's own error has been through the envelope reader; a
        // bare rejection is the fetch failing ("Failed to fetch").
        'Could not grant -- ' +
          (e instanceof ApiRequestError && e.message ? e.message : 'request failed'),
        'error',
      );
    }
  };

  const revoke = async (id: number) => {
    /*
     * The reason is a Part 11 audit-trail entry, so it is required — but the
     * "no prompt available" branch used to be indistinguishable from "you typed
     * nothing". It yielded `''`, which is not `null`, so it fell through to the
     * min-length check and told the user "A reason (min 3 chars) is required"
     * on a screen with no way to supply one. Chrome suppresses repeated
     * prompts, and embedded/webview browsers can disable them outright, so that
     * state is reachable — and it blamed the user for the environment.
     *
     * Now it says what actually happened. Capturing a regulated reason through
     * a native prompt is the deeper problem (unstyled, unlocalisable, blocking,
     * suppressible); this is honest until an in-product reason dialog exists.
     */
    const canPrompt = typeof window !== 'undefined' && typeof window.prompt === 'function';
    if (!canPrompt) {
      fireToast('This browser blocks the reason prompt — revoke from a window that allows it', 'error');
      return;
    }
    // Replace with an in-product reason dialog — not by dropping the reason.
    // eslint-disable-next-line no-alert
    const reason = window.prompt(
      'Reason for revoking this grant (min 3 chars, recorded in the audit trail):',
    );
    if (reason == null) return; // cancelled
    if (reason.trim().length < 3) {
      fireToast('A reason (min 3 chars) is required to revoke', 'error');
      return;
    }
    // Real, audited DELETE — only drop the row and report success on a real 2xx.
    try {
      const res = await apiRequest('DELETE', `/api/admin/access/grants/${id}`, {
        reason: reason.trim(),
      });
      if (!res.ok) {
        fireToast('Could not revoke — sign in as a platform admin', 'error');
        return;
      }
      setGrants((g) => g.filter((x) => x.id !== id));
      fireToast('Grant revoked — reason recorded — audited');
    } catch (e) {
      fireToast(
        // Only apiRequest's own error has been through the envelope reader; a
        // bare rejection is the fetch failing ("Failed to fetch").
        'Could not revoke -- ' +
          (e instanceof ApiRequestError && e.message ? e.message : 'request failed'),
        'error',
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
      fireToast('Enter a name for the key', 'error');
      return;
    }
    if (keyScopes.length === 0) {
      fireToast('Select at least one scope', 'error');
      return;
    }
    try {
      const res = await apiRequest('POST', '/api/api-keys', { name, scopes: keyScopes });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        // `json.error` was rendered raw, so an envelope of { error: '<CODE>',
        // message: '<a real sentence>' } toasted the token.
        fireToast(
          'Could not create the key -- ' + (serverMessage(json) ?? 'sign in as an admin'),
          'error',
        );
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
        // Only apiRequest's own error has been through the envelope reader; a
        // bare rejection is the fetch failing ("Failed to fetch").
        'Could not create the key -- ' +
          (e instanceof ApiRequestError && e.message ? e.message : 'request failed'),
        'error',
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
        // `json.error` was rendered raw, so an envelope of { error: '<CODE>',
        // message: '<a real sentence>' } put the token in the dialog.
        setRevokeError(serverMessage(json) ?? 'Sign in as an admin');
        return;
      }
      fireToast('API key revoked — audited');
      setRevokeConfirm(null);
      setKeysReload((n) => n + 1);
    } catch (e) {
      // Only apiRequest's own error has been through the envelope reader; a
      // bare rejection is the fetch failing ("Failed to fetch").
      setRevokeError(e instanceof ApiRequestError && e.message ? e.message : 'Request failed');
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
          <div className="sp-eyebrow">Admin</div>
          <h1 className="sp-title">Admin console</h1>
          <p className="sp-state">
            Designate personnel, manage SSO/SCIM, security policy, module entitlements and API
            keys — every governed action carries a reason and a 21 CFR Part 11 audit entry.
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
                      <b>Part 11 audit trail — SIEM export</b>
                      <span>
                        Cursor-paginated NDJSON pull of this org's append-only audit trail for
                        SOC/SIEM ingestion.
                      </span>
                    </div>
                    <span className="ac-val-st ok">
                      {I.check} Live
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
                      {I.check} Live — audit-trail routes
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
                      {I.check} Live
                    </span>
                  </div>
                  <div className="ac-val-row">
                    <div className="ac-val-main">
                      <b>GAMP 5 validation package (IQ/OQ/PQ)</b>
                      <span>
                        Release-by-release validation documentation for your
                        computer-system-validation file.
                      </span>
                      {vkitError && (
                        <div className="ac-val-err" role="alert">{vkitError}</div>
                      )}
                      {vkitDocs.length > 0 && (
                        <div className="ac-val-docs">
                          {vkitDocs.map((d) => (
                            <button
                              key={d.docId}
                              type="button"
                              className="ac-val-doc"
                              title={d.status || undefined}
                              onClick={async () => {
                                const problem = await downloadValidationDoc(d.docId, `${d.docId}.md`);
                                setVkitError(problem ?? '');
                              }}
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
                        Provided at contract — not yet self-serve
                      </span>
                    )}
                  </div>
                  <div className="ac-val-row">
                    <div className="ac-val-main">
                      <b>Data residency</b>
                      <span>
                        Single-region deployment today; committed regions are stated in your order
                        form. Multi-region residency is on the roadmap — it will appear here when
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
                    {grants.length} active — platform_role_grants
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
                    {I.alertTriangle || I.alertTriangle} Business-tier role — confers finance
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
                      hint="Platform role grants require a platform-admin session — sign in and retry."
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
                  hint="A governed org-profile read isn't wired yet. The profile (name, industry mode, tier, region, data residency) drives rail categories, pathways and pricing archetype; editing is governed in Setup."
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
              <>
                {/* ── This section had no field, button or link ──────────────
                    Three static description cards and nothing to act on, so SSO
                    and SCIM could not be configured anywhere in the product —
                    on the screen named for them. Two of the three DO have real,
                    mounted admin APIs (/api/admin/scim-tenants and
                    /api/admin/scim-ip-allowlist, both admin-gated), and SAML/OIDC
                    runs through authEnterprise.

                    Building three configuration UIs is its own piece of work and
                    is not smuggled in here. What is fixed now is the dishonesty:
                    the section says where each control actually lives and stops
                    presenting itself as a settings page that simply has no
                    settings. */}
                <div className="scaf-note" style={{ marginBottom: 10 }}>
                  SSO and SCIM are configured through the platform admin APIs, not from this
                  page — SAML/OIDC via authEnterprise, and SCIM provisioning and its IP
                  allowlist via the admin SCIM endpoints. The cards below describe what each
                  one covers.
                </div>
                <div className="ac-cards">
                {(
                  [
                    [
                      'SAML / OIDC SSO',
                      'Enterprise SSO via authEnterprise — IdP metadata, ACS URL, JIT provisioning',
                      'SAML SSO on Professional+',
                    ],
                    [
                      'SCIM 2.0 provisioning',
                      'Automated user lifecycle from your IdP — scim-tenants',
                      'Token-scoped, per-tenant',
                    ],
                    [
                      'SCIM IP allowlist',
                      'Restrict SCIM to your IdP egress ranges — scim-ip-allowlist',
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
              </>
            )}

            {sec === 'security' && (
              <>
                {/* ── These describe controls; they never read this org's config ──
                    Two of the tags used to assert a posture: "IP allowlist —
                    Off" and "Session policy — 7-day refresh". Both were string
                    literals in this array. An admin opening Security &
                    IP allowlist read them as their organisation's real settings
                    — and would have reported "our IP allowlist is off" on a
                    security questionnaire on the strength of a constant.

                    No governed read exists for MFA policy, IP allowlist or
                    session policy (unlike modules and API keys below, which are
                    live). Rather than fabricate a posture, the two state-shaped
                    tags now describe the control like the others do, and the
                    note says plainly that this is a catalogue. When a read is
                    wired, this section takes the loading/error/empty shape the
                    modules section already uses. */}
                <div className="scaf-note" style={{ marginBottom: 10 }}>
                  These are the security controls available on this platform, not a readout of
                  this organization&rsquo;s current configuration — no governed read is wired for
                  MFA, IP allowlist or session policy yet. Module entitlements and API keys below
                  are live.
                </div>
                <div className="ac-cards">
                {(
                  [
                    [
                      'MFA policy',
                      'Require TOTP for all members or by role — admin-security',
                      'Recommended: required',
                    ],
                    [
                      'IP allowlist',
                      'Restrict app access to corporate ranges (CIDR)',
                      'CIDR ranges',
                    ],
                    [
                      'Session policy',
                      'JWT sliding refresh — idle timeout',
                      'Refresh + idle timeout',
                    ],
                    [
                      'Audit to SIEM',
                      'Stream the Part-11 audit log to your SIEM — audit-siem',
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
              </>
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
                  Programmatic access tokens — org-scoped, hashed at rest,
                  last-used tracked, revocable. Every use is audited.
                </div>
                {keysState.loading ? (
                  <div className="scaf-note" style={{ padding: '14px 10px' }}>Loading API keys…</div>
                ) : keysState.error ? (
                  <EmptyState
                    tone="error"
                    icon={I.alertTriangle}
                    title="Couldn't load API keys"
                    hint="Managing API keys requires an admin session — sign in and retry."
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
                            fireToast('Copy failed — select the key and copy it manually', 'error');
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
                    style={{ padding: '8px 10px', border: '1px solid var(--border-control)', borderRadius: 8, background: 'var(--bg-000)', maxWidth: 360 }}
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
