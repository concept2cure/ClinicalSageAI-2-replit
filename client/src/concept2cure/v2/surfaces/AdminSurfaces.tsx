import React, { useState, useEffect, useMemo, useRef } from 'react';
import { I } from '../icons';
import { downloadBlob, downloadText } from '../download';
import { useLiveData, useLiveRows, EmptyState, liveMutateOrNull } from '../dataConnect';
import { ApiRequestError, apiRequest, serverMessage } from '@/lib/queryClient';
import { getAuthToken, getJwtOrgId } from '@/utils/authToken';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import {
  listedChoices,
  notifySurfaceActionReady,
  useSurfaceActionHandlers,
} from '../surfaceActions';
import { LIC_ROLES } from '../fixtures/licensing';
import { isLiveModuleEntry, moduleIsOpen, type LiveModuleEntry } from './WorkflowCatalog';
// Canonical config kept (not fixture DATA): AUDIT_KINDS is the audit-kind
// filter taxonomy the server's deriveKind() mirrors. The fixture DATA constants
// (audit log, workflow guide, app license, artifacts and access grants) were
// removed — every surface below now renders real persisted data, an honest
// empty state, or an honest error state.
import {
  AUDIT_KINDS,
} from '../fixtures/admin-data';
import type {
  AuditEntry,
  AcGrant,
} from '../fixtures/admin-data';
import { useIndustryProfile } from '../../mdx/hooks/useIndustryProfile';
import {
  CLIENT_TYPE_LABEL,
  CLIENT_TYPE_OPTIONS,
  buildOrgProfilePatch,
  governedToPicker,
  pickerMatchesProfile,
} from '../../mdx/lib/industryProfileMapping';
import {
  GovernedConfirmDialog,
  type ConfirmConfig,
} from '../../_shared/components/GovernedConfirmDialog';
import { RetentionPeriodCard } from './RetentionPeriodCard';
import { CompanyDocumentSettings } from './CompanyDocumentSettings';
import { LegalHoldsCard } from './LegalHoldsCard';
import { GatewayAccountsSetting } from './GatewayAccountsSetting';
import { PdfARequirementSetting } from './PdfARequirementSetting';
import { SessionPolicySetting } from '../onboarding/SessionPolicySetting';
import '../styles/project-home-v2.css';
import '../styles/ana-v2.css';
import '../styles/translation-v2.css';
import { C2CToast, useToast } from '../toast';
import { getSurfaceMeta } from '../registryModel';

/* `window.TXW_ADMIN` used to be published from the Setup panel below and was
   read by nothing in the repository. Its successor, the Translation workspace
   card, saved organizations.settings.translation — and nothing read that
   either: no server code consults it (the translation service takes each
   project's own target language, and approvalGuard() applies
   DEFAULT_GUARDRAILS without reading an org setting), as the card itself
   admitted. An audited save of a setting with no effect is a control that does
   nothing, so the card was removed in the settings/integrity audit of
   2026-10-17 (finding 5). */

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

/** The fields this surface reads from GET /api/organizations/:id. */
interface OrgRecord {
  organization?: { name?: string | null };
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

/* ════════════ Setup (org config) ════════════
   GOVERNED. Every control on this surface either reads and writes a real,
   org-scoped, audited server record, or says plainly that the thing it names is
   enforced elsewhere and cannot be set here. Nothing on it is browser-local any
   more, and no value it shows is fabricated.

   Reads
     GET   /api/organizations/:id            organizations.name
     GET   /api/mdx/industry-profile         the governed client type
   Writes
     PATCH /api/organizations/:id/profile    { name, reason }
     PATCH /api/mdx/industry-profile         (useIndustryProfile)
   (The cards below — gateway accounts, session policy, PDF/A, retention,
   legal holds — each own their own read and governed write.)

   `:id` is getJwtOrgId() — the organizationId claim on the caller's OWN token,
   never a value this page holds or a user types. That is the identifier
   organizations-routes.ts actually takes: validateOrgOwnership pins a non-staff
   caller to exactly that org (a tenant 'admin' is deliberately not treated as
   platform staff there), and requireOrgAdmin gates the profile write — so a member
   without the admin role gets a 403 and this panel says so instead of letting
   the save look like it landed.

   Both writes carry a reason, because both routes audit one: the profile PATCH
   logs before/after plus the reason.

   The one thing NOT wired, deliberately: /api/setup. The only routes there
   (server/routes/setup.ts) are the first-run installer — GET /status
   ({ initialized }) and the self-closing POST /initialize that creates the
   first org + admin on an EMPTY database. Calling that from an admin console
   would be destructive, not persistence.

   ── Controls that are deliberately not switches ────────────────────────────
   Three translation guardrails used to render as toggles, then as locked
   facts inside the Translation workspace card. They are enforced
   unconditionally by DEFAULT_GUARDRAILS (server/services/translation/types.ts)
   through approvalGuard(), which reads no org setting; the card that stated
   them was removed with the unread settings it saved (see the note at the top
   of this file).

   MFA and SSO were switches. There is no organization-wide MFA gate:
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

  /* Server truth and the working copy the controls edit. Both take the same
     value the moment a load lands, so `dirty` is exactly "what this
     administrator changed and has not saved yet" — never "what differs from a
     default we made up". */
  const [savedName, setSavedName] = useState('');
  const [name, setName] = useState('');

  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);

  const orgLoaded = !org.loading && !org.error;
  const loadError = org.error ?? null;
  const loading = org.loading;

  useEffect(() => {
    if (!orgLoaded) return;
    const live = org.data?.organization?.name ?? '';
    setSavedName(live);
    setName(live);
  }, [orgLoaded, org.data]);

  const nameDirty = orgLoaded && name.trim() !== savedName;
  const editable = !loading && !loadError;

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
      if (r.error) failures.push(`Organization name — ${saveFailure(r.error, r.status)}`);
      else setSavedName(r.data?.organization?.name ?? name.trim());
    }

    if (clientTypeDirty) {
      const patch = buildOrgProfilePatch(clientType, govSpec);
      const saved = patch ? await saveProfile(patch, why) : false;
      if (!saved) failures.push('Client type — not saved to the governed industry profile.');
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

  /* A chip is a pending change, saved by "Save to organization" under the
     page's one reason for change like every other field here. It used to
     PATCH the governed profile on click, with no reason and no confirmation
     (launch sweep finding 122). */
  const chooseClientType = (t: string) => setClientType(t);
  const clientTypeDirty =
    profile.status === 'ready' || profile.status === 'empty'
      ? Boolean(clientType) && (govPrimary == null || !pickerMatchesProfile(clientType, govPrimary, govSpec))
      : false;
  const dirty = nameDirty || clientTypeDirty;

  const clientTypeStatus: string =
    clientTypeDirty && saveState.status !== 'saving'
      ? 'Not saved yet — give a reason above and save to the organization.'
      : profile.status === 'error'
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

  /* What AnA can see of this screen.
     Setup is a governed editor: every control here writes to the organization
     record under a reason, audited. So the fact that matters most is not what
     the settings ARE but whether the administrator has UNSAVED changes and
     whether the reason field is filled — the two things that decide whether the
     save will be accepted. Publishing the settings without that would let AnA
     describe as current a value nobody has committed.

     A FAILED load publishes the failure: presenting an empty working copy as
     this organisation's configuration would misstate it. */
  const anaContext = useMemo(() => {
    if (loading) {
      return { summary: 'The organization profile and settings are still loading; nothing on screen is final yet.' };
    }
    if (loadError) {
      return {
        summary:
          'The organization record could not be read, so the controls on this screen are not showing ' +
          'this organisation\u2019s saved settings, and nothing here can be edited.',
        facts: { loadFailure: loadError },
        availableActions: ['Retry the organization profile and settings read'],
      };
    }
    return {
      summary:
        `Organization setup: name "${savedName}"` +
        (clientType ? `, client type "${clientType}"` : '') +
        '. ' +
        (dirty
          ? `There are UNSAVED changes (${[nameDirty && 'organization name', clientTypeDirty && 'client type'].filter(Boolean).join(' and ')})` +
            `, and a reason for change is ${reason.trim() ? 'entered' : 'still required before they can be saved'}.`
          : 'Nothing is unsaved.'),
      facts: {
        savedOrganizationName: savedName,
        editedOrganizationName: nameDirty ? name : null,
        clientType: clientType || null,
        clientTypeStatus,
        hasUnsavedChanges: dirty,
        reasonForChangeEntered: reason.trim().length > 0,
        editable,
        lastSaveNote: saveNote ? { tone: saveNote.tone, text: saveNote.text } : null,
      },
      availableActions: [
        'Change the organization name, then save under an audited reason for change',
        'Pick the client type, which is written to the governed org industry profile',
      ],
    };
  }, [loading, loadError, savedName, name, nameDirty, clientType, clientTypeStatus, clientTypeDirty, dirty, reason, editable, saveNote]);
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
          hint={`${loadError} — nothing below is editable until the organization record loads, so no change can be lost.`}
        />
      )}
      {/* The result of a governed, audited PATCH. It was a plain div that
          appeared after the write, so the only report that "Save to
          organization" had landed — or been refused with "Not saved: …" — was
          an icon swap and a tint. The region is rendered unconditionally and
          filled conditionally, because a live region has to exist before its
          content changes for the change to be announced reliably; empty, it has
          no class and so no box. */}
      <div
        className={saveNote ? 'txw-help' : undefined}
        data-tone={saveNote?.tone === 'warn' ? 'warn' : undefined}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {saveNote ? (
          <>
            {saveNote.tone === 'warn' ? I.alertTriangle : I.checkCircle} {saveNote.text}
          </>
        ) : null}
      </div>

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
                  Sets the default rail focus and AnA framing, and the skills AnA prefers
                  when a question does not name the product (Admin and access → Skills).
                  Governed — saved to your organization's industry profile.
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
                      {CLIENT_TYPE_LABEL[t]}
                    </button>
                  ))}
                </div>
                {clientTypeStatus && (
                  /* Cycles through "Saving to governed org profile…" and its
                     outcome. Choosing a client-type chip fires a governed write
                     and the chips merely disable and re-enable, so without this
                     the write was silent from start to finish. */
                  <span
                    role="status"
                    aria-live="polite"
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
                {/* QA 2026-10-08 (j9): this said "enrolled by each member", but no
                    screen started an authenticator enrolment, so it said what sign-in
                    does instead (routes/auth.ts POST /login). P-25: the account panel
                    (v2/AccountPanel.tsx) now enrols one, so the row says where. */}
                <small>
                  Sign-in asks for an emailed code, or for an authenticator app on an account that
                  has one.
                </small>
              </div>
              <div
                className="txw-row-r"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
              >
                <span className="txw-help">
                  {I.info} Set per user, not per organization, so there is nothing for an
                  administrator to switch here. Each person sets up an authenticator app from
                  Account in the account menu.
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

        {/* -- Agency gateway accounts: platform or the organisation's own, per
            gateway and environment (D7, founder decision 2026-10-01). -- */}
        <GatewayAccountsSetting />
        <SessionPolicySetting />
        {/* PDF/A only where this organisation's procedures require it (D7, decided 2026-10-01). */}
        <PdfARequirementSetting />

        {/* -- Records retention (P1-22; ADR-0014 §6) -- its own read and its
            own governed save, because the period has its own route and its own
            chained audit row; see RetentionPeriodCard.tsx. */}
        <RetentionPeriodCard describeFailure={saveFailure} />
        <LegalHoldsCard describeFailure={saveFailure} />
        <CompanyDocumentSettings onNav={onNav} />
      </div>
    </div>
  );
}

/** The ledger route's `meta.chain` (server/routes/audit-trail-ledger.routes.ts
 *  AuditLedgerChainVerdict), reduced to what the banner and AnA state. */
type ChainVerdictView = {
  verdict: 'intact' | 'broken' | 'unverified';
  /** The server's reason when it verified nothing (no chained rows). */
  reason: string | null;
  rowsChecked: number;
  legacyRows: number;
  sequencedRows: number;
  /**
   * Where it breaks, as this organisation may be told (audited-export.ts
   * breakForTenant): its own entry by id, another organisation's only as such.
   * `commitsTo` is the entry the stored hash derives from, 'genesis', or null
   * when no predecessor derives it.
   */
  brokenAt: { id: string | null; segment: string; commitsTo: string | null } | null;
};

/** The break's "commits to" as a phrase: an entry id, genesis, another organisation's entry, or nothing. */
function commitsToOf(v: unknown): string | null {
  if (v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string') return `entry ${(v as { id: string }).id}`;
  return typeof v === 'string' ? (v === 'genesis' ? 'genesis' : `an entry of ${v}`) : null;
}

function readChainVerdict(meta: Record<string, unknown> | undefined): ChainVerdictView {
  const c = meta?.chain as
    | {
        ok?: unknown;
        reason?: unknown;
        rowsChecked?: unknown;
        legacyRows?: unknown;
        sequencedRows?: unknown;
        brokenAt?: { id?: unknown; segment?: unknown; commitsTo?: unknown } | null;
      }
    | undefined;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  if (!c || typeof c.ok !== 'boolean') {
    const reason = c && c.ok === null && typeof c.reason === 'string' ? c.reason : null;
    return { verdict: 'unverified', reason, rowsChecked: 0, legacyRows: 0, sequencedRows: 0, brokenAt: null };
  }
  const b = c.brokenAt;
  return {
    verdict: c.ok ? 'intact' : 'broken',
    reason: null,
    rowsChecked: n(c.rowsChecked),
    legacyRows: n(c.legacyRows),
    sequencedRows: n(c.sequencedRows),
    brokenAt: b && typeof b === 'object'
      ? { id: typeof b.id === 'string' ? b.id : null, segment: String(b.segment ?? ''), commitsTo: commitsToOf(b.commitsTo) }
      : null,
  };
}

function chainTone(v: ChainVerdictView): string {
  return v.verdict === 'intact' ? 'var(--success)' : v.verdict === 'broken' ? 'var(--error)' : 'var(--warning)';
}

function chainSummary(v: ChainVerdictView): string {
  if (v.verdict === 'unverified') {
    return v.reason
      ? `The chain is not verified: ${v.reason.replace(/\.$/, '')}`
      : 'The server returned no chain verdict on this read, so the chain is not verified here';
  }
  const span = `${v.rowsChecked} chained ${v.rowsChecked === 1 ? 'entry' : 'entries'} verified server-side (${v.sequencedRows} sequenced, ${v.legacyRows} legacy)`;
  if (v.verdict === 'intact') return `Hash chain verifies intact over ${span}`;
  return `Hash chain breaks at ${v.brokenAt?.id ? `entry ${v.brokenAt.id}` : "another organisation's entry"} (${v.brokenAt?.segment || 'unknown'} segment, ${
    v.brokenAt?.commitsTo ? `commits to ${v.brokenAt.commitsTo}` : 'content does not derive from any predecessor'
  }) over ${span}`;
}

/* ════════════ Audit trail — immutable hash-chain viewer (§11.10(e)) ════════════
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

/** The account beside an actor's name: a name alone does not say which account acted (VSR-001 F-42). */
function ActorRef({ value }: { value?: string | null }) {
  if (!value) return null;
  return (
    <span className="mono" style={{ marginLeft: 6, fontSize: 10.5, color: 'var(--text-400)' }}>
      {value}
    </span>
  );
}

export function AuditTrail({ onAsk, onNav }: SurfaceViewProps) {
  const [kind, setKind] = useState('all');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [chainView, setChainView] = useState(false);
  const [exporting, setExporting] = useState(false);
  const term = q.toLowerCase();

  // Real hash-chained ledger. useLiveRows unwraps the { success, data } envelope,
  // returns a fresh [] while loading / on error (rendered directly, so no seed
  // loop), and sets `error` only on a genuine fetch failure.
  const { rows: entries, loading, error, status: readStatus, meta } = useLiveRows<AuditEntry>('/api/audit-trail/ledger');

  const log = entries.filter(
    (e) =>
      (kind === 'all' || e.kind === kind) &&
      (!term ||
        e.event.toLowerCase().includes(term) ||
        e.actor.toLowerCase().includes(term) ||
        (e.actorRef ?? '').toLowerCase().includes(term) ||
        e.target.toLowerCase().includes(term) ||
        (e.targetRef ?? '').toLowerCase().includes(term) ||
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

  /* Hash-chain verdict — the SERVER's (route meta.chain, computed by the one
     verifier over the tenant's whole audit_logs chain). This surface used to
     count prevHash === next.hash over the rows on screen; that window merges
     two stores, is cut by `limit`, and since the chain became per tenant a
     legacy row may legitimately link to the global head — so the count was
     not a verdict. No verdict from the server is reported as exactly that,
     never as "intact". */
  const chainStatus = readChainVerdict(meta);

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
        `Audit trail: ${entries.length} hash-chained ${entries.length === 1 ? 'entry' : 'entries'}` +
        (filtered ? `, filtered to ${log.length} by kind "${kind}"${term ? ` and the search "${q}"` : ''}` : '') +
        `. ${chainSummary(chainStatus)}` +
        (entry ? ` Entry ${entry.id} is open.` : ''),
      facts: {
        totalEntries: entries.length,
        shownInList: log.length,
        kindFilter: kind,
        searchTerm: term || null,
        entriesByKind: Object.fromEntries(kindCounts.map((k) => [k.id, k.n])),
        hashChain: chainStatus,
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
  /* AnA's hands on this screen (wave 7). The audit trail is where the training
     demonstration ends and where an inspector starts, and she had no action
     here at all: she could walk in and then do nothing. Every handler drives
     the same state the controls above drive — the kind buttons, the search
     box, a row click, the hash-chain toggle. Reading only: the signed export
     is a governed act and stays a human one. */
  useSurfaceActionHandlers('audit-trail', {
    'audit-trail.filter-entries': (params) => {
      const wanted = (params.kind ?? '').trim().toLowerCase();
      const legal = AUDIT_KINDS.map((k) => k.id);
      if (!legal.includes(wanted)) {
        return { ok: false, reason: `No audit kind "${params.kind}" — this ledger files events as ${legal.join(', ')}.` };
      }
      if (loading) return { ok: false, reason: 'The audit trail is still loading.', retry: true };
      if (error) {
        return {
          ok: false,
          reason:
            'The hash-chained ledger could not be read, so there is nothing on screen to filter. ' +
            'That is not the same as the trail being empty.',
        };
      }
      if (entries.length === 0) return { ok: false, reason: 'This workspace has no audit entries yet, so there is nothing to filter.' };
      const n = wanted === 'all' ? entries.length : entries.filter((e) => e.kind === wanted).length;
      const label = AUDIT_KINDS.find((k) => k.id === wanted)?.label ?? wanted;
      if (kind === wanted) return { ok: true, detail: `Already filtered to ${label} (${n} entries)` };
      setKind(wanted);
      // A kind with no entries still applies; the count is told truthfully
      // rather than letting an empty table read as an empty ledger.
      return { ok: true, detail: `Filtered to ${label} — ${n} of ${entries.length} entries` };
    },
    'audit-trail.search': (params) => {
      const wanted = (params.query ?? '').trim();
      if (!wanted) return { ok: false, reason: 'Name what to search the audit trail for.' };
      if (loading) return { ok: false, reason: 'The audit trail is still loading.', retry: true };
      if (error) return { ok: false, reason: 'The hash-chained ledger could not be read, so there is nothing on screen to search.' };
      if (entries.length === 0) return { ok: false, reason: 'This workspace has no audit entries yet, so there is nothing to search.' };
      setQ(wanted);
      const hits = entries.filter(
        (e) =>
          (kind === 'all' || e.kind === kind) &&
          [e.id, e.event, e.target, e.actor].some((f) => String(f ?? '').toLowerCase().includes(wanted.toLowerCase())),
      ).length;
      return { ok: true, detail: `Searched the audit trail for "${wanted}" — ${hits} matching ${hits === 1 ? 'entry' : 'entries'}` };
    },
    'audit-trail.select-entry': (params) => {
      const wanted = (params.entry ?? '').trim();
      if (!wanted) return { ok: false, reason: 'Name an audit entry to open.' };
      if (loading) return { ok: false, reason: 'The audit trail is still loading.', retry: true };
      if (error) return { ok: false, reason: 'The hash-chained ledger could not be read, so there are no entries to open.' };
      if (log.length === 0) {
        return {
          ok: false,
          reason:
            entries.length === 0
              ? 'This workspace has no audit entries yet.'
              : 'No entries match the filter and search on screen, so there is none to open.',
        };
      }
      const lower = wanted.toLowerCase();
      const exact = log.find((e) => e.id.toLowerCase() === lower);
      const contains = exact ? [] : log.filter((e) => [e.id, e.event, e.target].some((f) => String(f ?? '').toLowerCase().includes(lower)));
      const match = exact ?? (contains.length === 1 ? contains[0] : null);
      if (!match) {
        return {
          ok: false,
          reason:
            (contains.length > 1
              ? `"${wanted}" matches ${contains.length} entries — name one exactly.`
              : `No audit entry matching "${wanted}" on screen.`) + listedChoices(log.slice(0, 8).map((e) => e.id), 'On screen'),
        };
      }
      if (sel === match.id) return { ok: true, detail: `Already showing ${match.id}` };
      setSel(match.id);
      return { ok: true, detail: `Opened ${match.id} — ${match.event}` };
    },
    'audit-trail.set-chain-view': (params) => {
      const want = (params.state ?? '').trim().toLowerCase();
      if (want !== 'shown' && want !== 'hidden') {
        return { ok: false, reason: `"${params.state}" is not a hash-chain view state — choose shown or hidden.` };
      }
      const next = want === 'shown';
      if (chainView === next) return { ok: true, detail: `The hash chain is already ${want}` };
      setChainView(next);
      return { ok: true, detail: next ? 'Showing the hash chain' : 'Hid the hash chain' };
    },
    'audit-trail.close-entry': () => {
      if (!sel) return { ok: true, detail: 'No audit entry is open' };
      const was = sel;
      setSel(null);
      return { ok: true, detail: `Closed ${was}` };
    },
  });
  /* The ready signal for the holds above. Gated on the read settling and
     nothing else: a failed read must reach a held action as the handler's own
     refusal, not as a twenty-second timeout (surfaceReadySignal.test.ts). */
  useEffect(() => {
    if (!loading) notifySurfaceActionReady('audit-trail');
  }, [loading]);
  usePublishSurfaceContext('audit-trail', anaContext);

  return (
    <div className="page-inner">
      <AdminHeader
        eyebrow="Admin — compliance"
        title="Audit trail"
        sub={`${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} — hash-chained — append-only — 21 CFR Part 11 §11.10(e)`}
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
            {/* The scoped, per-question reports (access review, sign-ins,
                signatures, retention) are sealed the same way and live on
                their own surface. */}
            <button type="button" className="btn ghost" onClick={() => onNav('compliance-reports')}>
              {I.fileCheck} Compliance reports
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
        <div role="status" className="scaf-note" style={{ padding: '18px 10px', maxWidth: 680 }}>
          Loading audit trail…
        </div>
      ) : error && readStatus === 403 ? (
        /* A refusal is not an outage (QA 2026-10-08, j8): a member was told the
           ledger "didn't respond" and to retry, when the server had refused the
           read for the member's role. The server's own sentence says who reads it. */
        <EmptyState
          icon={I.lock}
          title="The audit trail is not available to your role"
          hint={error}
        />
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
          background: `color-mix(in srgb,${chainTone(chainStatus)} 10%,transparent)`,
          border: `1px solid ${chainTone(chainStatus)}`,
          marginBottom: 16,
          maxWidth: 680,
        }}
      >
        <span style={{ fontSize: 18 }}>
          {chainStatus.verdict === 'intact' ? I.shieldCheck : I.alertTriangle}
        </span>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 13,
              color: chainTone(chainStatus),
            }}
          >
            {chainStatus.verdict === 'intact'
              ? 'Hash chain intact'
              : chainStatus.verdict === 'broken'
                ? 'Chain verification failed'
                : 'Chain not verified'}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-400)', marginTop: 2 }}>
            {chainSummary(chainStatus)} — SHA-256 — append-only ledger
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
            aria-label="Search audit trail entries"
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
            <div style={{ fontSize: 12 }}>
              {e.actor}
              <ActorRef value={e.actorRef} />
            </div>
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
                <span className="esig" role="img" aria-label="E-signed (21 CFR Part 11)">{I.shieldCheck}</span>
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
            borderRadius: 'var(--radius-lg)',
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
            <div style={{ fontWeight: 600, fontSize: 14 }}>{entry.id} — Entry detail</div>
            <button className="tbtn" aria-label="Close" onClick={() => setSel(null)} style={{ fontSize: 16 }}>
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
            <span>
              {entry.actor}
              <ActorRef value={entry.actorRef} />
            </span>
            <span style={{ color: 'var(--text-400)', fontWeight: 500 }}>Timestamp</span>
            <span className="mono">{entry.when}</span>
            <span style={{ color: 'var(--text-400)', fontWeight: 500 }}>Target</span>
            <span>{entry.target}</span>
            {entry.targetRef && (
              <React.Fragment>
                <span style={{ color: 'var(--text-400)', fontWeight: 500 }}>Record</span>
                <span className="mono">{entry.targetRef}</span>
              </React.Fragment>
            )}
            {entry.signatureRef && (
              <React.Fragment>
                <span style={{ color: 'var(--text-400)', fontWeight: 500 }}>Signature record</span>
                <span className="mono">{entry.signatureRef}</span>
              </React.Fragment>
            )}
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
                  <span className="esig" style={{ marginRight: 6 }} role="img" aria-label="E-signed (21 CFR Part 11)">
                    {I.shieldCheck}
                  </span>
                  {entry.meaning} (§11.50)
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
                This entry was digitally signed per 21 CFR §11.50. Meaning:{' '}
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
        historical entry breaks the chain. Export downloads the entries as a signed JSON bundle:
        the data, a verification manifest and an HMAC-SHA256 signature over both.
      </div>
        </React.Fragment>
      )}
    </div>
  );
}

// The catalog is implemented once in WorkflowCatalog; Setup below reuses its
// live row decoder/verdict. Keep Apps as the stable surface export/deep-link id.
export { Apps } from './WorkflowCatalog';

/* No Artifacts center. The gallery folded into the Vault as its organization
   view (D2, fold F3 slice C, 2026-10-29; surfaces/VaultOrganizationArtifacts.tsx,
   reached as 'vault', and 'artifacts-center' is an alias of it). Its read, GET
   /api/artifacts-center, is the Vault's now, bound to the projects the caller
   can open; its manifest, governed DOCX, editor hand-off and AnA focus moved
   with it. docs/evidence/D2-ONE-ANA/2026-10-29/fold-f3-vault/. */

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
  const modState = useLiveData<{ modules: LiveModuleEntry[]; launchScope?: { enforced?: boolean } }>(
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
        'Could not grant — ' +
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
        'Could not revoke — ' +
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
          'Could not create the key — ' + (serverMessage(json) ?? 'sign in as an admin'),
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
        'Could not create the key — ' +
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
                      <b>E-signatures (21 CFR §11.50 / §11.70)</b>
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
                        {I.check} Self-serve — {vkitDocs.length} document{vkitDocs.length === 1 ? '' : 's'}
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
                  — tracked openly, never claimed early. Validation protocols download as drafts;
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
                        {r.business ? ' — finance' : ''}
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
                    <div role="status" className="scaf-note" style={{ padding: '14px 10px' }}>Loading grants…</div>
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
                            {g.email} — granted by {g.granted_by} — {g.granted_at}
                          </span>
                        </span>
                        <span className={'rd-chip tone-' + (rm.business ? 'warn' : 'ai')}>
                          {rm.label}
                        </span>
                        <button
                          className="ac-revoke"
                          onClick={() => revoke(g.id)}
                          title="Revoke (records a reason)" aria-label="Revoke (records a reason)"
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
                  Subscription status, seats, renewal and subscription changes run through
                  Stripe. Choose a subscription and its seats in Compare subscriptions.
                </div>
                <button className="sp-primary" onClick={() => nav('licensing')}>
                  {I.creditCard || I.arrowRight} {getSurfaceMeta('licensing').label}
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
                <SessionPolicySetting />
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
                  below; enable or disable features in Subscription &amp; features.
                </div>
                {modState.loading ? (
                  <div role="status" className="scaf-note" style={{ padding: '14px 10px' }}>Loading modules…</div>
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
                    {/* Open or not by Subscription & features' own verdict: `isEnabled`
                        read a module the plan includes, with no row written, as
                        locked (finding 44). */}
                    {liveModules.map((m) => {
                      const open = moduleIsOpen(m, modState.data?.launchScope?.enforced === true);
                      return (
                        <span
                          key={m.moduleId}
                          className="ob-mod"
                          style={open ? undefined : { opacity: 0.55 }}
                          title={open ? 'Open to this organization' : 'Not open to this organization — see Subscription & features'}
                        >
                          {open ? I.check : I.lock} {m.name}
                        </span>
                      );
                    })}
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
                  <div role="status" className="scaf-note" style={{ padding: '14px 10px' }}>Loading API keys…</div>
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
                              ? ' — used ' + String(k.lastUsedAt).slice(0, 10)
                              : ' — never used'}
                            {k.status && k.status !== 'active' ? ' — ' + k.status : ''}
                          </span>
                        </span>
                        {(!k.status || k.status === 'active') && (
                          <button
                            className="ac-revoke"
                            title="Revoke this API key (audited)" aria-label="Revoke this API key (audited)"
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
                    style={{ marginTop: 14, padding: 14, border: '1px solid var(--accent-100, var(--border))', borderRadius: 'var(--radius-lg)', background: 'var(--bg-050)' }}
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
                          style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '4px 8px', borderRadius: 6, cursor: 'pointer', border: '1px solid ' + (on ? 'var(--accent-100)' : 'var(--border)'), background: on ? 'var(--accent-100)' : 'transparent', color: on ? '#fff' : 'inherit' }}
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
