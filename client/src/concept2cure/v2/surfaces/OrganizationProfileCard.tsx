/**
 * Admin and access → Settings → Profile: the organisation's name and its client
 * type, each changed under one reason for change and written to the audit trail.
 *
 * Moved, not copied, from Setup (AdminSurfaces.tsx) when Setup folded into Admin
 * and access (D2, 2026-10-29; .design/client-journey/FUNCTION_PARITY.md, "Into
 * administration / From `setup`";
 * docs/evidence/D2-ONE-ANA/2026-10-29/fold-setup/).
 *
 *   Reads   GET   /api/organizations/:id            organizations.name
 *           GET   /api/mdx/industry-profile         the governed client type
 *   Writes  PATCH /api/organizations/:id/profile    { name, reason }
 *           PATCH /api/mdx/industry-profile         (useIndustryProfile), with the reason
 *
 * `:id` is getJwtOrgId(): the organizationId claim on the caller's OWN token,
 * never a value this page holds or a user types. validateOrgOwnership pins a
 * non-staff caller to exactly that org, and requireOrgAdmin gates the profile
 * write, so a member without the admin role gets a 403 and the card says so.
 *
 * One reason covers up to two governed PATCHes, and the baseline advances only
 * for the call that succeeded: a partial failure leaves the failed field dirty
 * and visibly unsaved. A failed read leaves every field read-only, so no change
 * can be lost, and offers the read again.
 *
 * Not wired, deliberately: /api/setup. Its only routes (server/routes/setup.ts)
 * are the first-run installer — GET /status and the self-closing POST
 * /initialize that creates the first org and admin on an EMPTY database.
 * Calling that from an admin page would be destructive, not persistence.
 *
 * What AnA sees (`onContext`): the saved name, the client type, whether either
 * has an unsaved change and whether the reason is entered, which together
 * decide whether a save is accepted. A failed read is published as the failure;
 * presenting an empty working copy as this organisation's profile would
 * misstate it. The parent publishes it under its own surface id.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { I } from '../icons';
import { EmptyState, liveMutateOrNull, useLiveData } from '../dataConnect';
import { serverMessage } from '@/lib/queryClient';
import { getJwtOrgId } from '@/utils/authToken';
import { useIndustryProfile } from '../../mdx/hooks/useIndustryProfile';
import {
  CLIENT_TYPE_LABEL,
  CLIENT_TYPE_OPTIONS,
  buildOrgProfilePatch,
  governedToPicker,
  pickerMatchesProfile,
} from '../../mdx/lib/industryProfileMapping';
import '../styles/translation-v2.css';

/** The fields this card reads from GET /api/organizations/:id. */
interface OrgRecord {
  organization?: { name?: string | null };
}

/**
 * How a refused governed write is reported. The server's own message is used
 * where it gave one, and status 0 — reserved for a failure with no response at
 * all — is the one case that must never read as "the server said no".
 *
 * liveMutateOrNull passes apiRequest's ApiRequestError message through, already
 * reduced by the envelope reader. But it also has a branch that never goes near
 * the envelope: a 401 is the one status apiRequest does not throw on, and it
 * returns its own `HTTP <status> <path>` string, which carries an API route.
 * Rendering that is an information-disclosure finding, not a cosmetic one. So
 * the string is filtered here rather than trusted: wrapping it as a message
 * body runs it through the reader every other surface uses, which rejects both
 * enum-shaped tokens and infrastructure text. The retention and legal-hold
 * cards word their refusals with it too.
 */
export function saveFailure(error: string, status: number): string {
  if (status === 0) return 'the server could not be reached, so nothing was saved.';
  const said = serverMessage({ message: error });
  return said ? `${said} (HTTP ${status}).` : `the change was not accepted (HTTP ${status}).`;
}

/** What AnA is told about the profile, published by the surface that mounts the card. */
export interface OrganizationProfileContext {
  summary: string;
  facts: Record<string, unknown>;
  availableActions: string[];
}

type SaveNote = { tone: 'ok' | 'warn'; text: string } | null;

const fieldStyle: React.CSSProperties = {
  fontSize: 13,
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid var(--border-control)',
  background: 'var(--bg-050)',
  color: 'var(--text-100)',
};

interface Props {
  /** Receives what AnA may be told, on every change, and null when the card unmounts. */
  onContext?: (context: OrganizationProfileContext | null) => void;
}

export function OrganizationProfileCard({ onContext }: Props) {
  /* The org claim on the caller's own token. Read once: the identity behind a
     mounted card does not change, and re-reading would re-key the fetches. */
  const orgId = useMemo(() => getJwtOrgId(), []);
  const orgPath = `/api/organizations/${encodeURIComponent(orgId)}`;
  const [readEpoch, setReadEpoch] = useState(0);
  const org = useLiveData<OrgRecord>(orgPath, [orgPath, readEpoch]);

  /* Server truth and the working copy the field edits. Both take the same value
     the moment a load lands, so `nameDirty` is exactly "what this administrator
     changed and has not saved yet", never "what differs from a default". */
  const [savedName, setSavedName] = useState('');
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState<SaveNote>(null);

  const loading = org.loading;
  const loadError = org.error ?? null;
  const orgLoaded = !loading && !loadError && org.data !== null;

  useEffect(() => {
    if (!orgLoaded) return;
    const live = org.data?.organization?.name ?? '';
    setSavedName(live);
    setName(live);
  }, [orgLoaded, org.data]);

  const nameDirty = orgLoaded && name.trim() !== savedName;
  const editable = orgLoaded;

  /* ── Governed client type (org industry profile) ──
     The chips read and write GET|PATCH /api/mdx/industry-profile. The profile
     row is the truth; this card keeps only the picker-level nuance the governed
     enum collapses (pharma vs biotech). A chip is a pending change, saved by
     "Save to organization" under the card's one reason, like the name. It used
     to PATCH the profile on click, with no reason and no confirmation (launch
     sweep finding 122). */
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

  const clientTypeDirty =
    profile.status === 'ready' || profile.status === 'empty'
      ? Boolean(clientType) && (govPrimary == null || !pickerMatchesProfile(clientType, govPrimary, govSpec))
      : false;
  const dirty = nameDirty || clientTypeDirty;

  const clientTypeStatus: string =
    clientTypeDirty && saveState.status !== 'saving'
      ? 'Not saved yet — give a reason below and save to the organization.'
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

  async function saveOrg() {
    const why = reason.trim();
    if (why.length < 3) {
      setSaveNote({ tone: 'warn', text: 'Enter a reason of at least 3 characters — it is written to the audit record.' });
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
      const r = await liveMutateOrNull<{ organization?: { name?: string } }>('PATCH', `${orgPath}/profile`, {
        name: name.trim(),
        reason: why,
      });
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
    setSaveNote({ tone: 'ok', text: 'Saved to the organization record and written to the audit trail.' });
  }

  const context = useMemo<OrganizationProfileContext>(() => {
    if (loading) {
      return {
        summary: 'The organization profile (name and client type) is still loading; nothing in it is final yet.',
        facts: { profileRead: 'loading' },
        availableActions: [],
      };
    }
    if (loadError) {
      return {
        summary:
          'The organization record could not be read, so the Profile card is not showing this organisation’s saved ' +
          'name or client type, and neither can be changed.',
        facts: { profileRead: 'failed', loadFailure: loadError },
        availableActions: ['Retry the organization record read from the Profile card'],
      };
    }
    return {
      summary:
        `Organization profile: name "${savedName}"` +
        (clientType ? `, client type "${clientType}"` : '') +
        '. ' +
        (dirty
          ? `There are UNSAVED changes (${[nameDirty && 'organization name', clientTypeDirty && 'client type'].filter(Boolean).join(' and ')})` +
            `, and a reason for change is ${reason.trim() ? 'entered' : 'still required before they can be saved'}.`
          : 'Nothing in it is unsaved.'),
      facts: {
        profileRead: 'read',
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
        'Pick the client type, which is written to the governed org industry profile under the same reason',
      ],
    };
  }, [loading, loadError, savedName, name, nameDirty, clientType, clientTypeStatus, clientTypeDirty, dirty, reason, editable, saveNote]);

  useEffect(() => {
    onContext?.(context);
  }, [context, onContext]);
  useEffect(() => () => onContext?.(null), [onContext]);

  return (
    <div className="txw-set-card" data-testid="organization-profile-card">
      <div className="txw-set-head">
        <div className="txw-set-head-l">
          <div className="txw-set-eyebrow">Organization</div>
          <h2 className="txw-set-title">Profile &amp; client type</h2>
          <p className="txw-set-sub">
            Drives default templates, pathways, and the AnA context across every project. Saved to the
            organization record under a reason, and written to the audit trail.
          </p>
        </div>
      </div>
      <div className="txw-set-body">
        {loadError && (
          <EmptyState
            tone="error"
            icon={I.alertTriangle}
            title="Couldn't load your organization record"
            hint={`${loadError} — nothing here is editable until the organization record loads, so no change can be lost.`}
            retry={() => setReadEpoch((n) => n + 1)}
          />
        )}
        <div className="txw-row">
          <div className="txw-row-l">
            Organization name
            <small>Displayed in audit, e-sign manifest, and export footers.</small>
          </div>
          <div className="txw-row-r">
            <input
              aria-label="Organization name"
              className="txw-gov-field"
              style={{ ...fieldStyle, width: '100%', maxWidth: 340 }}
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
              Sets the default rail focus and AnA framing, and the skills AnA prefers when a question does
              not name the product (Skills tab). Governed — saved to your organization&rsquo;s industry
              profile.
            </small>
          </div>
          <div className="txw-row-r">
            <div className="txw-row-r-grid">
              {CLIENT_TYPE_OPTIONS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="txw-pchip"
                  data-on={clientType === t || undefined}
                  disabled={profile.status === 'loading' || saveState.status === 'saving'}
                  onClick={() => setClientType(t)}
                >
                  {CLIENT_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
            {clientTypeStatus && (
              /* Cycles through "Saving to governed org profile…" and its outcome,
                 so the write is never silent from start to finish. */
              <span
                role="status"
                aria-live="polite"
                className="txw-help"
                data-tone={saveState.status === 'error' || profile.status === 'error' ? 'warn' : undefined}
              >
                {clientTypeStatus}
              </span>
            )}
          </div>
        </div>
        <div className="txw-row">
          <div className="txw-row-l">
            Reason for change
            <small>One reason covers both fields, and is recorded with each change.</small>
          </div>
          <div className="txw-row-r">
            <input
              aria-label="Reason for change"
              className="txw-gov-field"
              placeholder="Reason for change (audited)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={!dirty || saving}
              style={{ ...fieldStyle, fontSize: 12.5, padding: '7px 10px', minWidth: 220 }}
            />
            <div>
              <button type="button" className="btn" onClick={() => void saveOrg()} disabled={!dirty || saving}>
                {saving ? 'Saving…' : dirty ? 'Save to organization' : 'No unsaved changes'}
              </button>
            </div>
          </div>
        </div>
        {/* The result of the governed PATCHes. Rendered unconditionally and
            filled conditionally: a live region has to exist before its content
            changes for the change to be announced reliably. */}
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
      </div>
    </div>
  );
}
