/**
 * Time-limited grants — the operator's view of every trial on the platform.
 *
 * ── What this screen is for ──────────────────────────────────────────────────
 *
 * A grant can now be opened until a date. That makes two questions urgent and
 * neither had anywhere to be asked: which trials are about to end, and which
 * already have.
 *
 * ── The thing this panel must not get wrong ──────────────────────────────────
 *
 * A lapse is not a revocation. When a grant's date passes, the OVERRIDE stops
 * applying and entitlement resolution continues to the organization's plan — so
 * a workspace whose plan already covers the module loses nothing at all, and a
 * workspace whose plan does not covers loses access.
 *
 * Those are completely different outcomes and they look identical in a list of
 * end dates. An operator chasing renewals on the first kind is wasting their
 * time and the customer's; one who misses the second kind finds out from a
 * support ticket. So every row says which it is, in words, rather than leaving
 * the operator to hold the tier ladder in their head.
 *
 * Lapsed grants are listed alongside live ones for the same reason: they are
 * the rows somebody still has to act on, and a list that quietly dropped them
 * would show "nothing expiring" to an operator whose customers had already lost
 * access.
 */
import React, { useMemo, useState } from 'react';
import { I } from '../../icons';
import { useLiveData, ErrorState, EmptyState, hasKeys } from '../../dataConnect';
/* The client's one ascending tier ordering (free < standard < professional <
   enterprise), mirroring TIER_LEVELS in license-manager.ts. A private copy here
   would be another place that ordering is written down, and the whole point of
   the consequence line below is that it agrees with what the server will do. */
import { LIC_TIER_LEVEL } from '../../fixtures/licensing';
import { apiCall, apiErrorText } from '../../apiCall';
import { C2CToast, useToast } from '../../toast';
import {
  GovernedConfirmDialog,
  type ConfirmConfig,
} from '../../../_shared/components/GovernedConfirmDialog';
import '../../styles/misc-surfaces-v2.css';

const TRIALS_PATH = '/api/admin/master/licensing/trials';
const LICENSING_PATH = '/api/admin/master/licensing';

interface Trial {
  organizationId: number;
  organizationName: string;
  organizationSlug: string | null;
  tier: string | null;
  moduleId: string;
  moduleName: string;
  expiresAt: string | null;
  expired: boolean;
  setBy: string | null;
  setAt: string | null;
  /** Whether the workspace keeps the module through its plan once this lapses. */
  coveredByPlan: boolean;
}

interface TrialsPayload {
  trials: Trial[];
  live: number;
  lapsed: number;
}

type Pending =
  | { kind: 'convert'; config: ConfirmConfig; trial: Trial }
  | { kind: 'end'; config: ConfirmConfig; trial: Trial }
  | { kind: 'open'; config: ConfirmConfig; organizationId: number; moduleId: string; until: string };

/* Just enough of the licensing matrix to offer the two pickers. Read from the
   same endpoint the Packaging and Tenants tabs use rather than a second one. */
interface MatrixModule {
  moduleId: string;
  name: string;
  minTier: string | null;
}
interface MatrixOrg {
  id: number | string;
  name: string;
  tier: string | null;
}
interface MatrixPayload {
  modules: MatrixModule[];
  organizations: MatrixOrg[];
}

/** Absolute, never relative. "In 3 days" invites arithmetic the reader should
 *  not have to redo, and is wrong the moment the page is left open. */
function dateText(iso: string | null): string {
  if (!iso) return 'No end date';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'End date unreadable';
  return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

/**
 * PURE: would this plan already include the module, with no trial at all?
 *
 * The same inclusive-upward comparison the server makes, so the sentence shown
 * before the operator confirms matches the verdict they will get afterwards. A
 * module with no floor is unrestricted.
 */
export function planAlreadyIncludes(orgTier: string | null, minTier: string | null): boolean {
  if (!minTier) return true;
  const have = LIC_TIER_LEVEL[String(orgTier ?? '').toLowerCase()] ?? 1;
  const need = LIC_TIER_LEVEL[String(minTier).toLowerCase()] ?? 99;
  return have >= need;
}

/** An ISO calendar date N days from now, for the quick-set buttons. */
export function datePlusDays(days: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function tierText(t: string | null): string {
  if (!t) return 'No plan set';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * What actually happens to this workspace, said in one sentence.
 *
 * Four states, because "expired" and "covered by the plan" are independent and
 * the combination is what the operator needs. Collapsing them to "expired" /
 * "active" is what makes a list of end dates useless.
 */
function outcomeText(t: Trial): string {
  if (t.expired && t.coveredByPlan) {
    return `Ended. The ${tierText(t.tier)} plan includes this module, so the workspace still has it.`;
  }
  if (t.expired) {
    return `Ended. The ${tierText(t.tier)} plan does not include this module, so the workspace has lost access.`;
  }
  if (t.coveredByPlan) {
    return `The ${tierText(t.tier)} plan already includes this module. Nothing changes when this ends.`;
  }
  return `The ${tierText(t.tier)} plan does not include this module. The workspace loses access when this ends.`;
}

export function TrialsPanel() {
  const [reload, setReload] = useState(0);
  const [toast, fireToast] = useToast();
  const [pending, setPending] = useState<Pending | null>(null);
  const retry = () => setReload((n) => n + 1);

  const state = useLiveData<TrialsPayload>(
    TRIALS_PATH,
    [reload],
    hasKeys<TrialsPayload>('trials'),
  );

  /* The two pickers. Read from the licensing matrix the other tabs already
     use — a second endpoint listing the same workspaces would be a second
     answer to the same question. */
  const matrix = useLiveData<MatrixPayload>(
    LICENSING_PATH,
    [reload],
    hasKeys<MatrixPayload>('modules', 'organizations'),
  );

  const [orgId, setOrgId] = useState('');
  const [moduleId, setModuleId] = useState('');
  const [until, setUntil] = useState('');

  const orgs = useMemo(() => matrix.data?.organizations ?? [], [matrix.data]);
  const modules = useMemo(
    () => [...(matrix.data?.modules ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [matrix.data],
  );
  const chosenOrg = orgs.find((o) => String(o.id) === orgId) ?? null;
  const chosenModule = modules.find((m) => m.moduleId === moduleId) ?? null;

  /* An end date before tomorrow is an immediate lapse dressed as a grant, and
     the server refuses it. Bounding the input means the operator finds that out
     from the control rather than from a rejected write. */
  const earliest = datePlusDays(1);

  /* Said before the write, not after: opening a trial for something the plan
     already covers grants nothing, and an operator who is not told that will
     record a trial, tell a customer it is running, and see no change. */
  const redundant =
    chosenOrg != null &&
    chosenModule != null &&
    planAlreadyIncludes(chosenOrg.tier, chosenModule.minTier);

  const canOpen = Boolean(orgId && moduleId && until && until >= earliest);

  const rows = useMemo(() => state.data?.trials ?? [], [state.data]);

  /* Sorted so the rows that cost a customer something come first. A plain
     date sort buries a lapsed workspace that has actually lost a module under
     a dozen harmless ones whose plan covers them. */
  const ordered = useMemo(() => {
    const weight = (t: Trial) => (t.expired && !t.coveredByPlan ? 0 : t.expired ? 2 : 1);
    return [...rows].sort(
      (a, b) => weight(a) - weight(b) || (a.expiresAt ?? '').localeCompare(b.expiresAt ?? ''),
    );
  }, [rows]);

  const losing = ordered.filter((t) => t.expired && !t.coveredByPlan).length;

  const askOpen = () => {
    if (!canOpen || !chosenOrg || !chosenModule) return;
    setPending({
      kind: 'open',
      organizationId: Number(chosenOrg.id),
      moduleId: chosenModule.moduleId,
      until,
      config: {
        action: redundant
          ? 'Open a trial for a module the plan already includes'
          : 'Open a time-limited grant for this workspace',
        target: `${chosenOrg.name} · ${chosenModule.name} · until ${dateText(until)}`,
        resource: chosenModule.moduleId,
        minReason: 3,
      },
    });
  };

  const ask = (kind: 'convert' | 'end', trial: Trial) => {
    setPending({
      kind,
      trial,
      config: {
        action:
          kind === 'convert'
            ? 'Remove the end date and make this grant permanent'
            : 'End this grant now',
        target: `${trial.organizationName} · ${trial.moduleName}`,
        resource: trial.moduleId,
        minReason: 3,
      },
    });
  };

  /* GovernedConfirmDialog hands back a ConfirmResult, not a bare string —
     destructured here so the reason reaching the server is the typed sentence
     and not a stringified object. */
  const run = async ({ reason }: { reason: string }) => {
    const action = pending;
    setPending(null);
    if (!action) return;

    if (action.kind === 'open') {
      /* The date input yields a calendar day; the server stores an instant. Sent
         as end-of-day UTC so a trial "until the 23rd" includes the 23rd rather
         than lapsing as it begins. */
      const res = await apiCall('POST', TRIALS_PATH, {
        organizationId: action.organizationId,
        moduleId: action.moduleId,
        until: `${action.until}T23:59:59.000Z`,
        reason,
      });
      if (!res.ok) {
        fireToast(apiErrorText(res, 'That grant was not opened.'), 'error');
        return;
      }
      fireToast(`Grant opened until ${dateText(action.until)}.`);
      setOrgId('');
      setModuleId('');
      setUntil('');
      retry();
      return;
    }

    const path = action.kind === 'convert' ? `${TRIALS_PATH}/convert` : `${TRIALS_PATH}/end`;
    const res = await apiCall('POST', path, {
      organizationId: action.trial.organizationId,
      moduleId: action.trial.moduleId,
      reason,
    });

    if (!res.ok) {
      fireToast(apiErrorText(res, 'That grant was not changed.'), 'error');
      return;
    }
    fireToast(
      action.kind === 'convert'
        ? `${action.trial.moduleName} is now permanent for ${action.trial.organizationName}.`
        : `${action.trial.moduleName} no longer overrides the plan for ${action.trial.organizationName}.`,
    );
    retry();
  };

  return (
    <section className="ml-sec" aria-labelledby="ml-trials-h">
      <h2 id="ml-trials-h" className="ml-sec-h">Time-limited grants</h2>

      <div className="ml-banner">
        <span className="ml-banner-ic" aria-hidden="true">{I.info}</span>
        <p>
          When a grant reaches its end date it stops overriding the workspace&rsquo;s plan. It is
          not a revocation: whatever the plan itself includes is unaffected, so a workspace on a
          plan that already covers the module keeps it. Each row below says which case it is.
        </p>
      </div>

      {/* ── Open a grant ───────────────────────────────────────────────────
          Sits ABOVE the list and outside its empty state on purpose: a
          deployment with no trials yet is exactly when somebody needs to open
          one, and a control that only appears once a trial already exists
          cannot create the first. */}
      {matrix.loading ? (
        <div className="ml-loading" role="status">Loading workspaces and modules…</div>
      ) : matrix.error ? (
        <ErrorState
          title="Couldn't load the workspaces and modules"
          message={matrix.error}
          retry={retry}
          testId="ml-trials-matrix-error"
        />
      ) : orgs.length === 0 || modules.length === 0 ? (
        <EmptyState
          icon={I.building}
          title="Nothing to grant yet"
          hint="A time-limited grant needs both a workspace and a registered module. One of them is empty on this deployment."
          testId="ml-trials-matrix-empty"
        />
      ) : (
        <div className="ml-trial-open" data-testid="ml-trial-open">
          <div className="ml-toolbar">
            <div className="ml-field">
              <label className="ml-label" htmlFor="ml-trial-org">Workspace</label>
              <select
                id="ml-trial-org"
                className="ml-select"
                value={orgId}
                onChange={(e) => setOrgId(e.target.value)}
              >
                <option value="">Choose a workspace</option>
                {orgs.map((o) => (
                  <option key={String(o.id)} value={String(o.id)}>
                    {o.name} — {tierText(o.tier)}
                  </option>
                ))}
              </select>
            </div>
            <div className="ml-field ml-field-grow">
              <label className="ml-label" htmlFor="ml-trial-module">Module</label>
              <select
                id="ml-trial-module"
                className="ml-select"
                value={moduleId}
                onChange={(e) => setModuleId(e.target.value)}
              >
                <option value="">Choose a module</option>
                {modules.map((m) => (
                  <option key={m.moduleId} value={m.moduleId}>{m.name}</option>
                ))}
              </select>
            </div>
            <div className="ml-field">
              <label className="ml-label" htmlFor="ml-trial-until">Ends</label>
              <input
                id="ml-trial-until"
                className="ml-input"
                type="date"
                value={until}
                min={earliest}
                onChange={(e) => setUntil(e.target.value)}
              />
            </div>
            <div className="ml-field">
              <span className="ml-label" id="ml-trial-quick">Quick set</span>
              <div className="ml-seg" role="group" aria-labelledby="ml-trial-quick">
                {[30, 60, 90].map((d) => (
                  <button
                    key={d}
                    type="button"
                    className="ml-seg-btn"
                    data-on={until === datePlusDays(d) || undefined}
                    onClick={() => setUntil(datePlusDays(d))}
                  >
                    {d} days
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* The consequence, before the write rather than after it. */}
          {chosenOrg && chosenModule && (
            <p className="ml-note" data-testid="ml-trial-consequence">
              {redundant
                ? `${chosenOrg.name} is on ${tierText(chosenOrg.tier)}, which already includes ${chosenModule.name}. A grant here would change nothing they can do today, and when it ends they keep the module through their plan.`
                : `${chosenOrg.name} is on ${tierText(chosenOrg.tier)}, which does not include ${chosenModule.name}. This grant gives them access${until ? ` until ${dateText(until)}` : ''}, and access ends when it does.`}
            </p>
          )}

          <div className="ml-enf-acts">
            <button
              type="button"
              className="btn primary"
              disabled={!canOpen}
              onClick={askOpen}
            >
              Open the grant
            </button>
            {!canOpen && (
              <span className="ml-sub">
                Choose a workspace, a module and an end date no earlier than {dateText(earliest)}.
              </span>
            )}
          </div>
        </div>
      )}

      {state.loading ? (
        <div className="ml-loading" role="status">Loading time-limited grants…</div>
      ) : state.error ? (
        <ErrorState
          title="Couldn't load the time-limited grants"
          message={state.error}
          retry={retry}
          testId="ml-trials-error"
        />
      ) : ordered.length === 0 ? (
        <EmptyState
          icon={I.clock}
          title="No grant has an end date"
          hint="Every module grant on this deployment is permanent. A grant opened until a date appears here, and stays here after it ends."
          testId="ml-trials-empty"
        />
      ) : (
        <>
          {losing > 0 && (
            <div className="ml-enf-state" data-tone="unknown" data-testid="ml-trials-losing">
              <span className="ml-enf-ic" aria-hidden="true">{I.shieldAlert}</span>
              <div>
                <div className="ml-enf-h">
                  {losing === 1
                    ? '1 workspace has lost a module'
                    : `${losing} workspaces have lost a module`}
                </div>
                <p className="ml-enf-body">
                  These grants have ended and the workspace&rsquo;s plan does not include the
                  module, so access is gone. Convert the grant or change the plan to restore it.
                </p>
              </div>
            </div>
          )}

          <div className="ml-enf-stats">
            <div className="ml-enf-stat">
              <b>{state.data?.live ?? 0}</b>
              <span>Still running</span>
            </div>
            <div className="ml-enf-stat">
              <b>{state.data?.lapsed ?? 0}</b>
              <span>Ended</span>
            </div>
          </div>

          <div className="ml-scroll">
            <div className="ml-table ml-table-trials" role="table" aria-label="Time-limited grants">
              <div className="ml-thead" role="row">
                <span role="columnheader">Workspace</span>
                <span role="columnheader">Module</span>
                <span role="columnheader">Ends</span>
                <span role="columnheader">What happens</span>
                <span role="columnheader">Change</span>
              </div>
              {ordered.map((t) => (
                <div className="ml-row" role="row" key={`${t.organizationId} ${t.moduleId}`}>
                  <div role="cell">
                    <div className="ml-name">{t.organizationName}</div>
                    <div className="ml-sub">
                      {t.organizationSlug && <span className="mono">{t.organizationSlug}</span>}
                      {` · ${tierText(t.tier)}`}
                    </div>
                  </div>
                  <div role="cell">
                    <div className="ml-name">{t.moduleName}</div>
                    <div className="ml-sub mono">{t.moduleId}</div>
                  </div>
                  <div role="cell">
                    {/* Text AND a chip tone — the state never rests on colour. */}
                    <span className="ml-chip" data-tone={t.expired ? 'warn' : 'ok'}>
                      {t.expired ? 'Ended' : 'Runs to'}
                    </span>
                    <div className="ml-sub">{dateText(t.expiresAt)}</div>
                    {t.setBy && <div className="ml-sub">Set by {t.setBy}</div>}
                  </div>
                  <div role="cell" className="ml-sub">{outcomeText(t)}</div>
                  <div role="cell">
                    <div className="ml-enf-acts">
                      <button type="button" className="btn ghost" onClick={() => ask('convert', t)}>
                        Make permanent
                        <span className="ml-vh"> {t.moduleName} for {t.organizationName}</span>
                      </button>
                      {!t.expired && (
                        <button type="button" className="btn ghost" onClick={() => ask('end', t)}>
                          End now
                          <span className="ml-vh"> {t.moduleName} for {t.organizationName}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {pending && (
        <GovernedConfirmDialog
          open
          {...pending.config}
          onCancel={() => setPending(null)}
          onConfirm={run}
        />
      )}
      <C2CToast msg={toast} />
    </section>
  );
}

export default TrialsPanel;
