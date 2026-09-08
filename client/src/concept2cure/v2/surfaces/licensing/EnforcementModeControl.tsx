/**
 * The enforcement mode control — where the rollout decision is executed.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * The Enforcement tab already answers the question "is it safe to start
 * refusing requests?" — it shows every workspace that is being refused, or
 * would be. What it could not do was act on the answer. The mode lived only in
 * the deployment's own configuration, so the platform owner could reach a
 * conclusion on this screen and then needed an engineer and a redeploy to carry
 * it out. A control room whose one conclusion has to be executed somewhere else
 * is not finished.
 *
 * ── The three things this must not get wrong ────────────────────────────────
 *
 * 1. IT MUST NOT OFFER A CHOICE IT CANNOT GROUND. If the mode cannot be read,
 *    this renders an error with a retry — never a selector with a guessed
 *    current value. An operator who "changes" a mode from a state the console
 *    invented has no idea what they actually did.
 *
 * 2. IT MUST SAY WHERE THE CURRENT VALUE CAME FROM. A stored value and one
 *    inherited from the deployment look identical on screen and behave
 *    differently: the inherited one is put back by the next deploy. So the
 *    source is stated in words every time, not implied.
 *
 * 3. IT MUST PUT THE COST OF "REFUSING" IN FRONT OF THE OPERATOR BEFORE THEY
 *    CONFIRM. Moving to refusing while workspaces are recorded as reaching
 *    modules they have not licensed means knowingly breaking those customers.
 *    The count is shown on the panel AND repeated in the confirmation. It does
 *    not block: the operator may have decided those refusals are correct, and a
 *    console that argues with a decision it cannot evaluate is an obstacle, not
 *    a control.
 *
 * Default-exported with no required props so it drops straight into the
 * Enforcement tab. `onChanged` is optional and lets the tab re-read its report
 * after the mode moves.
 */
import React, { useState } from 'react';
import { I } from '../../icons';
import { useLiveData, ErrorState, hasKeys } from '../../dataConnect';
import { apiCall, apiErrorText } from '../../apiCall';
import { C2CToast, useToast } from '../../toast';
import {
  GovernedConfirmDialog,
  type ConfirmConfig,
} from '../../../_shared/components/GovernedConfirmDialog';
import '../../styles/misc-surfaces-v2.css';
import '../../styles/licensing-enforcement.css';

export const ENFORCEMENT_MODE_PATH = '/api/admin/master/licensing/enforcement/mode';

type Mode = 'off' | 'report' | 'enforce';

/** The server contract, as this control reads it. */
export interface EnforcementModeState {
  mode: string;
  /** 'stored' — set here. 'deployment' — inherited from how this is deployed. */
  source: string;
  storedMode: string | null;
  deploymentMode: string;
  modes: string[];
  updatedAt: string | null;
  updatedBy: number | null;
  reason: string | null;
  /** True when the stored value could not be read and this is a fail-safe. */
  degraded: boolean;
  propagationSeconds: number;
  impact: {
    organizationsAffected: number;
    modulesAffected: string[];
    observations: number;
    /** null = nothing recorded. NOT "nothing would be refused". */
    observingSince: string | null;
    perProcess: boolean;
  };
}

const ORDER: Mode[] = ['off', 'report', 'enforce'];

const LABEL: Record<Mode, string> = {
  off: 'Not checking',
  report: 'Observing',
  enforce: 'Refusing',
};

/** What each choice does to a real request. Stated per option, in consequences. */
const MEANING: Record<Mode, string> = {
  off: 'Entitlement is not checked when a request arrives, and nothing is recorded.',
  report:
    'Every request is checked and still served. What would be refused is recorded in the report below.',
  enforce:
    'Requests for modules a workspace has not licensed are refused. Everything else is served as before.',
};

function isMode(v: unknown): v is Mode {
  return typeof v === 'string' && (ORDER as string[]).includes(v);
}

function modeLabel(v: unknown): string {
  return isMode(v) ? LABEL[v] : 'Unknown';
}

/** Absolute, not relative — see the report above it for why. */
function whenText(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * PURE: the sentence that goes in front of the operator before they confirm a
 * move to refusing, or null when there is nothing to warn about.
 *
 * Exported for its own test. Three distinct states, and collapsing any two of
 * them would mislead:
 *   - workspaces recorded  → this many customers start being refused.
 *   - observing, nothing recorded → an absence of evidence, said as one.
 *   - not observing at all → nothing has been measured, so nothing is known.
 */
export function enforceWarning(state: EnforcementModeState): string | null {
  const { impact } = state;
  if (impact.organizationsAffected > 0) {
    const n = impact.organizationsAffected;
    return `${n} workspace${n === 1 ? '' : 's'} recorded here would start being refused. Review the list below before continuing.`;
  }
  if (impact.observingSince === null) {
    return state.mode === 'off'
      ? 'Nothing has been measured on this server, so which workspaces would be refused is not known.'
      : 'Nothing has been recorded on this server yet, which is not the same as knowing that no workspace would be refused.';
  }
  return null;
}

export interface EnforcementModeControlProps {
  /** Called after the mode changes, so the surrounding report can re-read. */
  onChanged?: () => void;
}

export default function EnforcementModeControl({ onChanged }: EnforcementModeControlProps = {}) {
  const [reload, setReload] = useState(0);
  const [toast, fireToast] = useToast();
  const [pending, setPending] = useState<{ config: ConfirmConfig; to: Mode } | null>(null);

  const retry = () => setReload((n) => n + 1);

  const state = useLiveData<EnforcementModeState>(
    ENFORCEMENT_MODE_PATH,
    [reload],
    hasKeys<EnforcementModeState>('mode', 'source', 'deploymentMode', 'impact'),
  );

  if (state.loading) {
    return (
      <div className="ml-loading" role="status">
        Loading the enforcement mode…
      </div>
    );
  }

  // Contract 1: never a selector over a guessed current value.
  if (state.error || !state.data) {
    return (
      <ErrorState
        title="Couldn't load the enforcement mode"
        message={state.error ?? 'The platform returned no enforcement mode for this server.'}
        retry={retry}
        testId="ml-enf-mode-error"
      />
    );
  }

  const data = state.data;
  const current: Mode | null = isMode(data.mode) ? data.mode : null;
  const warning = enforceWarning(data);

  const ask = (to: Mode) => {
    if (to === current) return;
    const impactLine =
      to === 'enforce' && data.impact.organizationsAffected > 0
        ? ` · ${data.impact.organizationsAffected} recorded workspace${
            data.impact.organizationsAffected === 1 ? '' : 's'
          } would be refused`
        : '';
    setPending({
      to,
      config: {
        action:
          to === 'enforce'
            ? 'Start refusing requests for modules a workspace has not licensed'
            : 'Change how module entitlement is enforced',
        target: `${modeLabel(data.mode)} → ${LABEL[to]}${impactLine}`,
        resource: 'Route entitlement enforcement',
        minReason: 3,
      },
    });
  };

  const run = async ({ reason }: { reason: string }) => {
    const action = pending;
    setPending(null);
    if (!action) return;

    const res = await apiCall<EnforcementModeState>('PATCH', ENFORCEMENT_MODE_PATH, {
      mode: action.to,
      reason,
    });
    if (!res.ok) {
      fireToast(apiErrorText(res, 'The enforcement mode was not changed.'), 'error');
      return;
    }
    const seconds = res.body?.propagationSeconds ?? data.propagationSeconds;
    fireToast(
      `Enforcement is now ${LABEL[action.to].toLowerCase()}. Every server picks this up within ${seconds} seconds.`,
    );
    retry();
    onChanged?.();
  };

  return (
    <div className="ml-enf-mode" data-testid="ml-enf-mode">
      <div className="ml-enf-mode-head">
        <span className="ml-label">Enforcement mode</span>
        <span className="ml-chip" data-tone={current === 'enforce' ? 'warn' : 'off'}>
          {modeLabel(data.mode)}
        </span>
      </div>

      <div className="ml-seg" role="group" aria-label="Enforcement mode">
        {ORDER.map((m) => (
          <button
            key={m}
            type="button"
            className="ml-seg-btn"
            aria-pressed={current === m}
            data-on={current === m ? '' : undefined}
            data-testid={`ml-enf-mode-${m}`}
            onClick={() => ask(m)}
          >
            {current === m && (
              <span className="ml-seg-tick" aria-hidden="true">
                {I.check}
              </span>
            )}
            {LABEL[m]}
          </button>
        ))}
      </div>

      <ul className="ml-enf-mode-opts">
        {ORDER.map((m) => (
          <li key={m} className="ml-enf-mode-opt" data-current={current === m ? 'true' : 'false'}>
            <b>{LABEL[m]}</b> — {MEANING[m]}
          </li>
        ))}
      </ul>

      {/* Contract 2: where the value in force came from, in words. */}
      <p className="ml-sub" data-testid="ml-enf-mode-source">
        {data.source === 'stored' ? (
          <>
            Set in this console
            {data.updatedAt ? ` on ${whenText(data.updatedAt)}` : ''}.
            {data.reason ? ` Reason given: ${data.reason}` : ''}
          </>
        ) : (
          <>
            Inherited from how this platform is deployed, because no mode has been set here.
            Choosing one records the decision and it stops being inherited.
          </>
        )}{' '}
        A change reaches every server within {data.propagationSeconds} seconds, with no restart.
      </p>

      {data.degraded && (
        <div className="ml-enf-mode-warn" data-testid="ml-enf-mode-degraded">
          <span className="ml-enf-ic" aria-hidden="true">
            {I.alertTriangle}
          </span>
          <p>
            The stored mode could not be read just now, so what is shown is the safest value
            available rather than a confirmed one. Enforcement will not have increased while this
            is true. Try again before making a change.
          </p>
        </div>
      )}

      {/* Contract 3: the cost of "refusing", before the dialog, not only in it. */}
      {current !== 'enforce' && warning && (
        <div className="ml-enf-mode-warn" data-testid="ml-enf-mode-impact">
          <span className="ml-enf-ic" aria-hidden="true">
            {I.alertTriangle}
          </span>
          <p>{warning}</p>
        </div>
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
    </div>
  );
}
