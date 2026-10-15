import React, { useState } from 'react';
import { useLiveData, liveMutateOrNull } from '../dataConnect';
import { getJwtOrgId } from '@/utils/authToken';

/**
 * The connector for Claude, for this organisation (ADR-0014 §10, plan P1-47).
 *
 * Off until the organisation's owner or administrator turns it on. While it is
 * off, members cannot connect Claude, and connections already made stop working
 * (server/mcp/auth/connector-enablement.ts).
 *
 *   GET /api/tenant-config/:id/claude-connector  { connector: { enabled, canChange } }
 *   PUT /api/tenant-config/:id/claude-connector  { enabled }, the owner or administrator only
 *
 * Every member sees whether it is on. Only the owner or administrator gets the
 * switch, and the server decides who that is (`canChange`); a refused change is
 * shown as refused. `:id` is the organizationId claim on the caller's own token, as
 * AdminSurfaces uses it. After a change the setting is read again, so what is
 * shown is what the server stored. A read that fails, or answers in a shape
 * this page does not know, is shown as unread, never as "Off".
 */

interface Connector {
  enabled: boolean;
  canChange: boolean;
}

interface ConnectorState {
  connector: Connector;
}

function isConnectorState(value: unknown): value is ConnectorState {
  const c = (value as { connector?: unknown } | null)?.connector as Record<string, unknown> | undefined;
  return !!c && typeof c === 'object' && typeof c.enabled === 'boolean' && typeof c.canChange === 'boolean';
}

const DESCRIPTION =
  'Lets members of this organisation connect Claude to Concept2Cure. While it is off, no one can connect, ' +
  'and connections already made stop working. Each change is recorded in the audit trail.';

const onOff = (enabled: boolean) => (enabled ? 'On' : 'Off');

/** The line under the description: a refused change, what confirming will do, or who can change it. */
function noteFor(state: Connector | null, confirming: boolean, saveError: string | null): string | null {
  if (saveError) return saveError;
  if (!state) return null;
  if (confirming) {
    return state.enabled
      ? 'Members will no longer be able to connect Claude, and connections already made will stop working.'
      : "Members will be able to connect Claude to this organisation's content.";
  }
  return state.canChange ? null : "Only the organisation's owner or administrator can change this.";
}

interface ValueProps {
  state: Connector;
  confirming: boolean;
  saving: boolean;
  onAsk: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/** The value column once the setting has been read. */
function ConnectorValue({ state, confirming, saving, onAsk, onConfirm, onCancel }: ValueProps) {
  if (!state.canChange) return <span>{onOff(state.enabled)}</span>;
  if (confirming) {
    return (
      <>
        <button type="button" className="btn primary small" disabled={saving} onClick={onConfirm}>
          {state.enabled ? 'Turn off' : 'Turn on'}
        </button>
        <button type="button" className="btn ghost small" disabled={saving} onClick={onCancel}>
          Cancel
        </button>
      </>
    );
  }
  return (
    <>
      <span>{onOff(state.enabled)}</span>
      <button
        type="button"
        role="switch"
        aria-checked={state.enabled}
        aria-label="Connector for Claude"
        className="btn ghost small"
        onClick={onAsk}
      >
        {state.enabled ? 'Turn off…' : 'Turn on…'}
      </button>
    </>
  );
}

export function ClaudeConnectorSetting() {
  const path = `/api/tenant-config/${encodeURIComponent(getJwtOrgId())}/claude-connector`;
  const [epoch, setEpoch] = useState(0);
  const { data, loading, error } = useLiveData<ConnectorState>(path, [path, epoch], isConnectorState);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const state = data?.connector ?? null;
  const reread = () => setEpoch((n) => n + 1);

  const change = async (enabled: boolean) => {
    setSaving(true);
    setSaveError(null);
    const res = await liveMutateOrNull<ConnectorState>('PUT', path, { enabled });
    setSaving(false);
    setConfirming(false);
    if (!res.error && isConnectorState(res.data)) {
      reread();
      return;
    }
    setSaveError(
      res.status === 403
        ? "The setting was not changed. Only the organisation's owner or administrator can change it."
        : 'The setting was not changed. Try again.',
    );
  };

  let value: React.ReactNode;
  if (state) {
    value = (
      <ConnectorValue
        state={state}
        confirming={confirming}
        saving={saving}
        onAsk={() => {
          setSaveError(null);
          setConfirming(true);
        }}
        onConfirm={() => void change(!state.enabled)}
        onCancel={() => setConfirming(false)}
      />
    );
  } else if (loading && !error) {
    value = <span className="adm-muted">Reading…</span>;
  } else {
    value = (
      <>
        <span>Could not be read</span>
        <button type="button" className="btn ghost small" onClick={reread}>
          Retry
        </button>
      </>
    );
  }

  const note = noteFor(state, confirming, saveError);
  return (
    <div className="adm-settings" data-testid="claude-connector-setting">
      <div className="adm-setting adm-setting-fixed">
        <div>
          <div className="adm-setting-label">Connector for Claude</div>
          <div className="adm-setting-desc">{DESCRIPTION}</div>
          {note && (
            <div className="adm-setting-desc" role={saveError ? 'alert' : undefined}>
              {note}
            </div>
          )}
        </div>
        <div className="adm-setting-val">{value}</div>
      </div>
    </div>
  );
}
