import React from 'react';
import type { AuthoringHandoffController, AuthoringHandoffRecoveryState } from './authoringHandoff';
import { AuthoringRecoveryNotice } from './AuthoringRecoveryNotice';

function recoveryActions(handoff: AuthoringHandoffController, state: AuthoringHandoffRecoveryState, onNav?: (id: string) => void) {
  const busy = state.phase === 'pending' || state.checking || state.continuing;
  const needsCheck = state.phase === 'unknown' || state.phase === 'partial';
  const actions = [];
  if (needsCheck) actions.push({
    label: state.checking ? 'Checking…' : state.docId ? 'Check document sections' : 'Check working documents',
    onClick: () => { void handoff.check(); }, disabled: !!busy,
  });
  if (state.canContinue) actions.push({
    label: state.continuing ? 'Saving text…' : 'Continue saving text',
    onClick: () => { void handoff.continueSaving(); }, disabled: !!busy,
  });
  if (state.canOpen && onNav) actions.push({
    label: state.phase === 'saved' ? 'Open saved document' : 'Open document to review',
    onClick: () => { handoff.open(onNav); }, disabled: !!busy,
  });
  if (state.inventory && !state.docId && onNav) actions.push({
    label: 'Open working documents',
    onClick: () => { handoff.openWorkingDocuments(onNav); }, disabled: !!busy,
  });
  return actions;
}

/** Explicit recovery beside the source result; never replays caller effects. */
export function AuthoringHandoffNotice({ handoff, onNav }: {
  handoff: AuthoringHandoffController;
  onNav?: (id: string) => void;
}) {
  const state = handoff.state;
  if (!state) return null;
  return <AuthoringRecoveryNotice message={state.message}
    role={state.phase === 'saved' || state.phase === 'pending' ? 'status' : 'alert'}
    actions={recoveryActions(handoff, state, onNav)}>
    {!state.docId && state.inventory && <CheckedInventory inventory={state.inventory} />}
  </AuthoringRecoveryNotice>;
}

function CheckedInventory({ inventory }: { inventory: NonNullable<AuthoringHandoffRecoveryState['inventory']> }) {
  return <>
    <p>This list does not identify which request created a document. Review it before creating another copy.</p>
    {inventory.length > 0 ? <ul>{inventory.map(row => <li key={row.id}>{row.title} · {row.id}</li>)}</ul>
      : <p>No working documents were returned by this check.</p>}
  </>;
}
