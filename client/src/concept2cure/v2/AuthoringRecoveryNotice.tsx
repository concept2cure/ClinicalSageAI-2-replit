import React from 'react';

interface RecoveryAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

/** The existing native creation notice, shared without adding a UI pattern. */
export function AuthoringRecoveryNotice({ message, role, actions = [], children }: {
  message: React.ReactNode;
  role: 'alert' | 'status';
  actions?: RecoveryAction[];
  children?: React.ReactNode;
}) {
  return <div className="scaf-note" role={role}>
    {message}
    {children}
    {actions.map(action => <button key={action.label} type="button" className="btn ghost"
      disabled={action.disabled} onClick={action.onClick}>{action.label}</button>)}
  </div>;
}
