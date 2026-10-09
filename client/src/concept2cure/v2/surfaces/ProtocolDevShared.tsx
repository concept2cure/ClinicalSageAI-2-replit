/**
 * Protocol development — the two primitives every register pane uses.
 *
 * They lived in ProtocolDev.tsx and are imported by the register panes that
 * were split out of it when those panes gained their write controls. They live
 * here, and not there, so the split is a tree rather than a cycle:
 * ProtocolDev.tsx → ProtocolDev{Soa,Registers,Section}.tsx → this.
 * ProtocolDev.tsx re-exports both, so nothing that imported them has moved.
 */
import React from 'react';
import * as PG from './ProtocolGov';

/** A control in a pane head. `tone: 'quiet'` is a secondary affordance. */
export interface PaneAction {
  label: string;
  icon?: string;
  onAct: () => void;
  /** Omitted for the primary action of the pane. */
  variant?: string;
  disabled?: boolean;
}

export interface PaneHeadProps {
  title: string;
  sub?: string;
  /** The single action form kept for the panes that have exactly one. */
  action?: string;
  onAction?: () => void;
  /** A pane may need more than one (add a visit AND an assessment). */
  actions?: PaneAction[];
}

export function PaneHead({ title, sub, action, onAction, actions }: PaneHeadProps) {
  const list: PaneAction[] = actions ?? (action ? [{ label: action, icon: 'penLine', onAct: onAction ?? (() => undefined), variant: 'outline' }] : []);
  return (
    <div className="pd-pane-h">
      <div><h2 className="pd-pane-t">{title}</h2>{sub && <div className="pd-pane-s">{sub}</div>}</div>
      {list.length > 0 && (
        <div className="pde-actions">
          {list.map((a) => (
            <PG.Btn key={a.label} icon={a.icon ?? 'plus'} variant={a.variant ?? 'outline'} disabled={a.disabled} onClick={a.onAct}>
              {a.label}
            </PG.Btn>
          ))}
        </div>
      )}
    </div>
  );
}

export interface KVProps { k: string; v: string }

export function KV({ k, v }: KVProps) {
  return <div className="pd-kv"><span className="pd-kv-k">{k}</span><span className="pd-kv-v pg-mono">{v}</span></div>;
}
