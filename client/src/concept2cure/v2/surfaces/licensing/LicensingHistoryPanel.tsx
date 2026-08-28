/**
 * Licensing decisions — the readable record of what the licensing console did.
 *
 * WHAT THIS ANSWERS. Two questions, and they are the only two anyone actually
 * arrives with: "why did THIS customer lose THIS module", and "who moved this
 * capability into a higher tier, and on what justification". Both were already
 * recorded — every mutation in the Master Licensing console writes a governed
 * audit record carrying the operator's typed reason — and neither was readable
 * anywhere in the product. A compliance record nobody can read does not do the
 * job it exists for.
 *
 * ── Three honesty rules this panel is built around ──────────────────────────
 *
 * 1. A FAILED READ IS NEVER AN EMPTY HISTORY. `<ErrorState>` and
 *    `<EmptyState>` are different branches and can never be reached by the same
 *    condition. "This platform has never made a licensing decision" is a strong
 *    claim about a compliance record; it is made only when the service actually
 *    said so.
 *
 * 2. A TRUNCATED PAGE SAYS SO. The footer states how much of the record is on
 *    screen and how much is not, next to the control that reaches the rest. A
 *    page presented as the whole history is the confident wrong answer this
 *    panel exists to prevent. Rows the service could not interpret are shown
 *    too, flagged, and counted in their own notice — dropping them would
 *    understate the record with nothing on screen to say so.
 *
 * 3. NO GREEN TICK IS INVENTED. Each row says what was verified about it and
 *    what was not: whether its position in the tamper-evident chain was
 *    re-derived and matched, and whether its seal was checked. Where
 *    verification did not run — sealing not configured, a store larger than the
 *    view checks in one pass, a check that failed — the row says that, in those
 *    words, rather than showing a state that implies a verification nobody
 *    performed.
 *
 * ── An open vocabulary ──────────────────────────────────────────────────────
 * Governed actions are still being added. An action this build has never heard
 * of gets a name derived from its own token and the same recorded-field list
 * every other row gets, so it renders as a readable row on the day it ships.
 * The internal token is never what the operator reads.
 *
 * Read-only by construction: this file contains no write path.
 */
import React, { useMemo, useState } from 'react';
import { I } from '../../icons';
import { useLiveData, ErrorState, EmptyState, hasKeys } from '../../dataConnect';
import '../../styles/misc-surfaces-v2.css';
import '../../styles/licensing-history.css';

/* ── The service contract, as this panel reads it ──────────────────────────── */

type ChainState = 'verified' | 'broken' | 'after-break' | 'not-checked' | 'not-recorded';
type SealState = 'verified' | 'unverified' | 'not-sealed';

interface HistoryEntry {
  id: string;
  occurredAt: string | null;
  /** The internal token. Never rendered — `actionLabel` names it for a person. */
  action: string | null;
  readable: boolean;
  actorId: number | null;
  actorEmail: string | null;
  organizationId: number | null;
  organizationName: string | null;
  moduleId: string | null;
  moduleName: string | null;
  reason: string | null;
  changed: Record<string, unknown>;
  integrity: { chain: ChainState; seal: SealState };
}

type IntegrityReason =
  | 'chain-and-seals-verified'
  | 'chain-verified-seals-not-configured'
  | 'chain-broken'
  | 'seal-broken'
  | 'store-too-large'
  | 'check-failed';

interface HistoryPayload {
  entries: HistoryEntry[];
  page: {
    limit: number;
    offset: number;
    returned: number;
    total: number | null;
    hasMore: boolean;
  };
  filters: { organizationId: number | null; moduleId: string | null };
  unreadable: number;
  integrity: {
    status: 'verified' | 'broken' | 'unavailable';
    reason: IntegrityReason;
    rowsChecked: number;
    checkedAt: string;
  };
}

/** The filter options, read from the licensing matrix the console already serves. */
interface FilterOptions {
  modules: Array<{ moduleId: string; name: string }>;
  organizations: Array<{ id: string | number; name: string }>;
}

const HISTORY_PATH = '/api/admin/master/licensing/history';
const MATRIX_PATH = '/api/admin/master/licensing';
const PAGE_SIZE = 25;

/* ── Naming a decision ─────────────────────────────────────────────────────── */

const ACTION_LABEL: Record<string, string> = {
  'module.repackage': 'Module tier changed',
  'tenant.tier_change': 'Workspace plan changed',
  'tenant.provision': 'Workspace provisioned to its plan',
  'tenant.module_toggle': 'Module access changed for a workspace',
  'tenant.status_change': 'Workspace status changed',
  'feature_flag.toggle': 'Feature flag changed',
  'enforcement.observations_cleared': 'Enforcement observations cleared',
};

/** `mode_change` becomes `mode change`, capitalised only when it leads. */
function humanizeSegment(seg: string, lead: boolean): string {
  const words = seg.replace(/[_-]+/g, ' ').trim();
  if (!words) return '';
  return lead ? words.charAt(0).toUpperCase() + words.slice(1) : words;
}

/**
 * The operator-facing name of a decision.
 *
 * A token this build does not know is NAMED from its own parts rather than
 * printed raw or hidden. That keeps the vocabulary open: an action added after
 * this file shipped reads as "Enforcement · mode change" on day one, which is
 * both honest about the fact that it is unfamiliar and readable.
 */
export function actionLabel(action: string | null): string {
  if (!action) return 'Decision could not be read';
  const known = ACTION_LABEL[action];
  if (known) return known;
  return (
    action
      .split('.')
      .map((seg, i) => humanizeSegment(seg, i === 0))
      .filter(Boolean)
      .join(' · ') || 'Recorded decision'
  );
}

const FIELD_LABEL: Record<string, string> = {
  previousTier: 'Previous tier',
  minTier: 'Lowest tier that includes it',
  tier: 'Plan',
  previousStatus: 'Previous status',
  status: 'Status',
  enabled: 'Module access',
  granted: 'Modules granted',
  enabledTotal: 'Modules enabled after the run',
  retainedAboveTier: 'Kept above the new plan',
  industryMode: 'Industry mode',
  from: 'Previous value',
  to: 'New value',
  clearedObservations: 'Observations cleared',
  clearedObservingSince: 'Observation window started',
};

/** `retainedAboveTier` becomes `Retained above tier` when it is not in the map. */
export function fieldLabel(key: string): string {
  const known = FIELD_LABEL[key];
  if (known) return known;
  const spaced = key.replace(/[_-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * One recorded value, in words.
 *
 * `enabled` is the one field given its own reading, because "Module access: No"
 * is a worse sentence than "Module access: Turned off" for the decision people
 * come here to understand. Everything else is rendered as recorded — a value
 * this panel does not understand is shown, not swallowed.
 */
export function fieldValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return 'Not set';
  if (typeof value === 'boolean') {
    if (key === 'enabled') return value ? 'Turned on' : 'Turned off';
    return value ? 'Yes' : 'No';
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return 'None';
    const shown = value.slice(0, 6).map((v) => String(v));
    return value.length > 6
      ? `${shown.join(', ')} and ${value.length - 6} more`
      : shown.join(', ');
  }
  if (typeof value === 'object') {
    const text = JSON.stringify(value);
    return text.length > 140 ? `${text.slice(0, 140)}…` : text;
  }
  return String(value);
}

/** Absolute, never relative: an auditor reads a record, not a countdown. */
export function whenText(iso: string | null): string {
  if (!iso) return 'Time not recorded';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Time not recorded';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/* ── Integrity, in words ───────────────────────────────────────────────────── */

/** What the deployment can say about the record store as a whole. */
export function integrityHeadline(status: string, reason: IntegrityReason): string {
  if (status === 'verified') {
    return reason === 'chain-and-seals-verified'
      ? 'Record chain and seals verified'
      : 'Record chain verified';
  }
  if (status === 'broken') {
    return reason === 'seal-broken' ? 'A record seal did not verify' : 'A break was found in the record chain';
  }
  return 'Record integrity was not verified for this view';
}

export function integrityDetail(reason: IntegrityReason): string {
  switch (reason) {
    case 'chain-and-seals-verified':
      return 'Every entry was re-derived from the one before it and its seal was checked.';
    case 'chain-verified-seals-not-configured':
      return 'Every entry was re-derived from the one before it. Record sealing is not configured on this deployment, so seals could not be checked and no entry is shown as sealed-and-verified.';
    case 'chain-broken':
      return 'One entry does not match its position. Entries recorded before it were verified; the entry itself and everything after it cannot be proven from the chain.';
    case 'seal-broken':
      return 'At least one seal failed verification, so no sealed entry on this page is shown as verified.';
    case 'store-too-large':
      return 'The record store holds more entries than this view checks in one pass, so no verification was performed. The entries below are shown without a verification result.';
    case 'check-failed':
    default:
      return 'The verification could not be completed. The entries below are shown without a verification result.';
  }
}

/** The per-row verdict: a short label, a sentence, and a chip tone. */
export function rowVerdict(
  integrity: { chain: ChainState; seal: SealState },
  reason: IntegrityReason,
): { tone: 'ok' | 'warn' | 'off'; label: string; detail: string } {
  switch (integrity.chain) {
    case 'verified':
      if (integrity.seal === 'verified') {
        return { tone: 'ok', label: 'Verified', detail: 'Chain position and seal verified.' };
      }
      if (integrity.seal === 'not-sealed') {
        return { tone: 'ok', label: 'Chain verified', detail: 'This entry carries no seal.' };
      }
      return {
        tone: 'off',
        label: 'Chain verified',
        detail:
          reason === 'chain-verified-seals-not-configured'
            ? 'Its seal could not be checked, because record sealing is not configured on this deployment.'
            : 'Its seal was not verified.',
      };
    case 'broken':
      return {
        tone: 'warn',
        label: 'Does not match',
        detail: 'This entry does not match its position in the record chain.',
      };
    case 'after-break':
      return {
        tone: 'warn',
        label: 'Cannot be proven',
        detail: 'An earlier break in the record chain makes this position unprovable.',
      };
    case 'not-recorded':
      return {
        tone: 'off',
        label: 'Not in the chain',
        detail: 'This entry was written without a position in the record chain, so there is nothing to verify.',
      };
    case 'not-checked':
    default:
      return { tone: 'off', label: 'Not checked', detail: integrityDetail(reason) };
  }
}

/* ── The panel ─────────────────────────────────────────────────────────────── */

export default function LicensingHistoryPanel() {
  const [reload, setReload] = useState(0);
  const [offset, setOffset] = useState(0);
  const [orgFilter, setOrgFilter] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');

  const retry = () => setReload((n) => n + 1);

  const historyPath = useMemo(() => {
    const params = new URLSearchParams();
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(offset));
    if (orgFilter) params.set('organizationId', orgFilter);
    if (moduleFilter) params.set('moduleId', moduleFilter);
    return `${HISTORY_PATH}?${params.toString()}`;
  }, [offset, orgFilter, moduleFilter]);

  const hist = useLiveData<HistoryPayload>(
    historyPath,
    [historyPath, reload],
    hasKeys<HistoryPayload>('entries', 'page', 'integrity'),
  );

  /* The filter options come from the matrix the console already serves, so this
     panel introduces no second source of truth for what a workspace or module
     is. If that read fails the filters simply offer no options — the history
     itself is unaffected and still renders. */
  const options = useLiveData<FilterOptions>(
    MATRIX_PATH,
    [reload],
    hasKeys<FilterOptions>('modules', 'organizations'),
  );

  const orgOptions = options.data?.organizations ?? [];
  const moduleOptions = options.data?.modules ?? [];
  const filtered = Boolean(orgFilter || moduleFilter);

  const clearFilters = () => {
    setOrgFilter('');
    setModuleFilter('');
    setOffset(0);
  };

  const payload = hist.data;
  const page = payload?.page;
  const entries = payload?.entries ?? [];

  const rangeStart = page && page.returned > 0 ? page.offset + 1 : 0;
  const rangeEnd = page ? page.offset + page.returned : 0;
  const withheld = page && page.total != null ? Math.max(page.total - rangeEnd, 0) : null;

  return (
    <section className="ml-sec" aria-labelledby="lh-h">
      <h2 id="lh-h" className="ml-sec-h">Licensing decisions</h2>

      <div className="ml-banner">
        <span className="ml-banner-ic" aria-hidden="true">{I.info}</span>
        <p>
          Every change to module packaging, to a workspace plan, and to module access is recorded
          with the reason the operator entered. This is that record, newest first. It is read-only
          and nothing here can be edited or removed.
        </p>
      </div>

      {/* Integrity of the record itself, stated before anything is read from it. */}
      {payload && (
        <div
          className="ml-enf-state"
          data-tone={payload.integrity.status === 'verified' ? undefined : 'unknown'}
          role="status"
          data-testid="lh-integrity"
        >
          <span className="ml-enf-ic" aria-hidden="true">
            {payload.integrity.status === 'verified' ? I.shieldCheck : I.shieldAlert}
          </span>
          <div>
            <div className="ml-enf-h">
              {integrityHeadline(payload.integrity.status, payload.integrity.reason)}
            </div>
            <p className="ml-enf-body">{integrityDetail(payload.integrity.reason)}</p>
            <p className="ml-enf-body">
              {payload.integrity.rowsChecked > 0
                ? `${payload.integrity.rowsChecked.toLocaleString()} entries checked at ${whenText(payload.integrity.checkedAt)}.`
                : `Last attempted ${whenText(payload.integrity.checkedAt)}.`}
            </p>
          </div>
        </div>
      )}

      <div className="ml-toolbar">
        <div className="ml-field">
          <label className="ml-label" htmlFor="lh-org">Workspace</label>
          <select
            id="lh-org"
            className="ml-select"
            value={orgFilter}
            onChange={(e) => {
              setOrgFilter(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All workspaces</option>
            {orgOptions.map((o) => (
              <option key={String(o.id)} value={String(o.id)}>{o.name}</option>
            ))}
          </select>
        </div>
        <div className="ml-field">
          <label className="ml-label" htmlFor="lh-mod">Module</label>
          <select
            id="lh-mod"
            className="ml-select"
            value={moduleFilter}
            onChange={(e) => {
              setModuleFilter(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All modules</option>
            {moduleOptions.map((m) => (
              <option key={m.moduleId} value={m.moduleId}>{m.name}</option>
            ))}
          </select>
        </div>
        {options.error && (
          <div className="ml-sub" role="status">
            The workspace and module lists could not be loaded, so the filters are empty. The record
            below is unaffected.
          </div>
        )}
        {orgFilter && (
          /* Said plainly, because the gap is invisible otherwise: a tier change
             is a platform-wide decision, recorded against no single workspace,
             and it is a common reason a workspace stops seeing a module. */
          <div className="ml-sub" role="status">
            A change to how a module is packaged applies to the whole platform and is not recorded
            against one workspace, so it is not in this filtered view. Filter by module to see it.
          </div>
        )}
        {filtered && (
          <button type="button" className="btn ghost" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </div>

      {hist.loading ? (
        <div className="ml-loading" role="status">Loading the licensing decisions…</div>
      ) : hist.error || !payload ? (
        /* A read that failed is an error, never an empty record. The two are
           opposite facts and this panel must not confuse them. */
        <ErrorState
          title="Couldn't load the licensing decisions"
          message={hist.error}
          retry={retry}
          testId="lh-error"
        />
      ) : entries.length === 0 && offset > 0 ? (
        /* Past the end of the record is NOT an empty record. Saying "nothing is
           recorded" here would be false — the reader has simply paged beyond
           what matches — so it says that instead, and offers the way back. */
        <EmptyState
          icon={I.history}
          title="This page is past the end of the record"
          hint="There is nothing further back than the previous page."
          action={{ label: 'Back to the newest decisions', onAct: () => setOffset(0) }}
          testId="lh-past-end"
        />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={I.history}
          title={filtered ? 'No decision matches this filter' : 'No licensing decisions are recorded yet'}
          hint={
            filtered
              ? 'No decision matching this filter was recorded. Clear it to see the whole record.'
              : 'Changes to module packaging, workspace plans and module access appear here as soon as they are made, with the reason the operator entered.'
          }
          {...(filtered ? { action: { label: 'Clear filters', onAct: clearFilters } } : {})}
          regulation="Serves the Part 11 audit record for licensing decisions (21 CFR 11.10(e))"
          testId="lh-empty"
        />
      ) : (
        <>
          {payload.unreadable > 0 && (
            <div className="lh-partial" role="status" data-testid="lh-unreadable">
              <span className="lh-partial-ic" aria-hidden="true">{I.alertTriangle}</span>
              <p>
                {payload.unreadable === 1
                  ? 'One entry on this page could not be fully read. It is listed below with the detail that could be recovered.'
                  : `${payload.unreadable} entries on this page could not be fully read. They are listed below with the detail that could be recovered.`}
              </p>
            </div>
          )}

          <div className="ml-scroll">
            <div className="ml-table lh-table" role="table" aria-label="Licensing decisions, newest first">
              <div className="ml-thead" role="row">
                <span role="columnheader">When</span>
                <span role="columnheader">Decision</span>
                <span role="columnheader">Workspace and module</span>
                <span role="columnheader">Reason given</span>
                <span role="columnheader">Record</span>
              </div>

              {entries.map((e) => {
                const verdict = rowVerdict(e.integrity, payload.integrity.reason);
                const fields = Object.entries(e.changed).filter(
                  ([k]) => !(k === 'moduleId' && e.moduleId),
                );
                return (
                  <div className="ml-row" role="row" key={e.id}>
                    <div role="cell">
                      <div className="ml-name">{whenText(e.occurredAt)}</div>
                      <div className="ml-sub">
                        {e.actorEmail ?? (e.actorId != null ? `Operator ${e.actorId}` : 'Operator not recorded')}
                      </div>
                    </div>

                    <div role="cell">
                      <div className="ml-name">
                        {actionLabel(e.action)}
                        {!e.readable && <span className="ml-chip" data-tone="warn">Partly readable</span>}
                      </div>
                      {fields.length > 0 && (
                        <div className="lh-fields">
                          {fields.map(([k, v]) => (
                            <div key={k}>
                              <b>{fieldLabel(k)}:</b> {fieldValue(k, v)}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div role="cell">
                      <div className="ml-name">
                        {e.organizationName ?? (e.organizationId ? `Workspace ${e.organizationId}` : 'Whole platform')}
                      </div>
                      <div className="ml-sub">
                        {e.moduleName ?? e.moduleId ?? 'No single module'}
                      </div>
                    </div>

                    <div role="cell">
                      {e.reason ? (
                        <div className="lh-reason">{e.reason}</div>
                      ) : (
                        <div className="lh-reason-none">No reason was recorded with this entry.</div>
                      )}
                    </div>

                    <div role="cell" className="lh-int">
                      <span className="ml-chip" data-tone={verdict.tone}>{verdict.label}</span>
                      <span className="ml-sub">{verdict.detail}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* How much of the record is on screen, and how much is not. */}
          <div className="lh-page">
            <div className="lh-page-note" role="status" data-testid="lh-page-note">
              {page && page.total != null
                ? `Showing ${rangeStart} to ${rangeEnd} of ${page.total.toLocaleString()} recorded decisions.`
                : `Showing ${rangeStart} to ${rangeEnd} recorded decisions.`}
              {page?.hasMore
                ? ` ${withheld != null ? withheld.toLocaleString() : 'More'} older ${withheld === 1 ? 'decision is' : 'decisions are'} recorded and not shown on this page.`
                : ' This is the end of the record.'}
            </div>
            <div className="lh-page-acts">
              <button
                type="button"
                className="btn ghost"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(offset - PAGE_SIZE, 0))}
              >
                Newer
              </button>
              <button
                type="button"
                className="btn ghost"
                disabled={!page?.hasMore}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Older
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
