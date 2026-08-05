/**
 * SignoffList — the one renderer for a turn's pending 21 CFR Part 11 sign-offs.
 *
 * When AnA proposes a record-altering command, the server refuses it with
 * `PART11_SIGNATURE_REQUIRED` and hands back enough to re-submit. Whatever drew
 * that turn has to draw the prompt too, because the prompt is the only place the
 * user can supply the reason-for-change (and, for high-impact actions, the
 * §11.50 signature) that lets the mutation proceed. A surface that renders the
 * answer but not the gate does not "defer" the signature — it drops the action
 * silently, with nothing on screen saying anything is waiting.
 *
 * ── Why this is shared ────────────────────────────────────────────────────────
 * This component existed four times, in `Shell` (`RailSignoffs`), `RbmSurfaces`
 * (`RbmSignoffs`), `DocumentAuthoring` (`AuthoringSignoffs`) and `EctdCoauthor`
 * (`EctdSignoffs`) — identical down to the `outcomes`/`dismissed` index maps and
 * the `${command}-${i}` keys, differing only in the wrapper's class and the
 * class on the resolved line. `ConversationThread` needed a fifth. Four copies
 * of a compliance gate is four places to fix a compliance bug, and no way to see
 * from any one of them whether the others agree.
 *
 * Presentation stays with the host: each passes the class or style its own
 * stylesheet defines, so extracting this changed no rendered class name.
 */

import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { GovernedActionSignoff } from '../components/ana/GovernedActionSignoff';
import type { PendingSignoff } from '../components/ana/useGovernedAction';
import { I } from './icons';

export interface SignoffListProps {
  signoffs: PendingSignoff[];
  /** Class for the wrapper — the host's own container. */
  className?: string;
  /** Inline layout for hosts whose stylesheet has no class for this. */
  style?: CSSProperties;
  /** Class for the resolved line that replaces a prompt once it is signed. */
  doneClassName?: string;
}

/**
 * Renders the REAL sign-off prompts AnA returned, each resolving through
 * {@link GovernedActionSignoff} (POST /api/ana-ri/governed-action) to the
 * server's own confirmation message, or dismissed. The outcome shown is the
 * server's — no fabricated audit id or hash is invented here.
 */
export function SignoffList({ signoffs, className, style, doneClassName }: SignoffListProps): ReactNode {
  // Keyed by index rather than by command: the same command can legitimately be
  // pending twice in one turn, and signing one must not resolve the other.
  const [outcomes, setOutcomes] = useState<Record<number, string>>({});
  const [dismissed, setDismissed] = useState<Record<number, boolean>>({});

  return (
    <div className={className} style={style}>
      {signoffs.map((s, i) => {
        if (dismissed[i]) return null;
        if (outcomes[i]) {
          return (
            <div key={`${s.command}-${i}`} className={doneClassName} role="status">
              {I.check} {outcomes[i]}
            </div>
          );
        }
        return (
          <GovernedActionSignoff
            key={`${s.command}-${i}`}
            signoff={s}
            onResolved={(o) => setOutcomes((p) => ({ ...p, [i]: o.message }))}
            onCancel={() => setDismissed((p) => ({ ...p, [i]: true }))}
          />
        );
      })}
    </div>
  );
}
