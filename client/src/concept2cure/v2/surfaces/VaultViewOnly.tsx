/**
 * Whether the Vault offers this person its write controls, and what it says
 * when it does not.
 *
 * Every Vault write route carries `requireEditorAccess`, which admits
 * GOVERNED_WRITE_ROLES and nothing else, and the session derives
 * GOVERNED_WRITE_PERMISSION from that same set (shared/constants/permissions.ts).
 * The panels offered every control to everyone, so a viewer wrote a reason for
 * change, an annotation or a relationship and was refused after the click. The
 * Catalog record panel already withheld its controls (S4), from the server's
 * own answer; this is the rule for the panels that ask nothing before writing.
 *
 * A session with no permissions array offers the controls, as canGovernedWrite
 * documents: the server still refuses, and hiding a writer's controls on a
 * guess is the worse failure.
 */
import React from 'react';
import { canGovernedWrite } from '@shared/constants/permissions';
import { useAuthUser } from '@/services/portal/authService';

/** True when the signed-in role may change the Vault (the server decides either way). */
export function useVaultCanWrite(): boolean {
  return canGovernedWrite(useAuthUser());
}

/** Said in place of a panel's write controls. `act` names what the role cannot do here. */
export function VaultViewOnly({ act, testId }: { act: string; testId: string }) {
  return (
    <div className="vd-d-idx" role="note" data-testid={testId}>
      {`View only. Your role can read this but not ${act}. A member or administrator can.`}
    </div>
  );
}
