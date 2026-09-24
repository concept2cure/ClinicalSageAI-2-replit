/**
 * The visible half of the global mutation-failure contract.
 *
 * ── What this closes ─────────────────────────────────────────────────────────
 * The MDX UAT found writes failing in silence: Word export returned 500 with no
 * toast, no console message and no visible change, and a document creation
 * failed with the modal simply closing. In both cases the user's next action
 * was taken on the belief that the write had landed — which, in a regulated
 * record, is the failure that matters.
 *
 * `queryClient`'s MutationCache raises `c2c:mutation-error` for every
 * `useMutation` whose call site did NOT supply its own `onError`. This listens
 * and renders the shared <ErrorState>. Surfaces that report their own failures
 * are untouched: a second global banner on top of a well-placed inline one is
 * noise, and the cache checks for that before dispatching.
 *
 * ── Why an event rather than a store ─────────────────────────────────────────
 * `client/src/lib/queryClient.ts` is the transport layer. Giving it a React
 * dependency — a context, a store, a toast handle — would invert the direction
 * this codebase's layering runs in, and would make the module unimportable from
 * a plain script or a test without a renderer. A DOM CustomEvent is the one
 * channel both sides already have.
 *
 * ── The second event: saved, but not in the audit trail ─────────────────────
 * `apiRequest` / `apiUpload` raise `c2c:audit-row-not-persisted` when a write
 * SUCCEEDED and the server reported that its 21 CFR Part 11 §11.10(e) audit row
 * was not written (`findUnpersistedAuditRow`, client/src/lib/queryClient.ts).
 * That is not a failed save — the change stands, and saying otherwise would be
 * its own false record — so it gets its own sentence rather than "The change
 * was not saved". It is shown whether or not the surface handles its own
 * errors: a surface's success path is exactly where it says "Saved", and no
 * surface reads this signal itself.
 */

import React from 'react';
import {
  AUDIT_ROW_NOT_PERSISTED_EVENT,
  MUTATION_ERROR_EVENT,
  type AuditRowNotPersistedDetail,
  type MutationErrorDetail,
} from '@/lib/queryClient';
import { ErrorState } from './dataConnect';

interface Entry extends MutationErrorDetail {
  id: number;
}

interface AuditNotice extends AuditRowNotPersistedDetail {
  id: number;
}

/** How many failures are shown at once. Beyond this the oldest is dropped: a
 *  stack of banners taller than the viewport reports nothing to anybody. */
const MAX_VISIBLE = 3;

export function GlobalMutationErrors() {
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [auditNotices, setAuditNotices] = React.useState<AuditNotice[]>([]);
  const nextId = React.useRef(0);

  React.useEffect(() => {
    const onUnpersisted = (e: Event) => {
      const detail = (e as CustomEvent<AuditRowNotPersistedDetail>).detail;
      if (!detail?.code) return;
      setAuditNotices((prev) => {
        // The same write retried is one missing record to report, not several.
        if (prev.some((p) => p.method === detail.method && p.path === detail.path && p.code === detail.code)) return prev;
        return [...prev, { ...detail, id: nextId.current++ }].slice(-MAX_VISIBLE);
      });
    };
    window.addEventListener(AUDIT_ROW_NOT_PERSISTED_EVENT, onUnpersisted);
    return () => window.removeEventListener(AUDIT_ROW_NOT_PERSISTED_EVENT, onUnpersisted);
  }, []);

  React.useEffect(() => {
    const onError = (e: Event) => {
      const detail = (e as CustomEvent<MutationErrorDetail>).detail;
      if (!detail?.message) return;
      setEntries((prev) => {
        // A retry loop can raise the same failure repeatedly; showing it five
        // times tells the user nothing the first one did not.
        if (prev.some((p) => p.message === detail.message && p.code === detail.code)) return prev;
        return [...prev, { ...detail, id: nextId.current++ }].slice(-MAX_VISIBLE);
      });
    };
    window.addEventListener(MUTATION_ERROR_EVENT, onError);
    return () => window.removeEventListener(MUTATION_ERROR_EVENT, onError);
  }, []);

  if (entries.length === 0 && auditNotices.length === 0) return null;

  return (
    <div className="c2c-global-errors" data-testid="global-mutation-errors">
      {auditNotices.map((notice) => (
        <ErrorState
          key={`audit-${notice.id}`}
          variant="inline"
          title="Saved, but the audit trail did not record it"
          message="Your change was saved. The audit-trail entry that records who made it and when could not be written. Tell your administrator and give them the reference below."
          correlationId={notice.correlationId}
          onDismiss={() => setAuditNotices((prev) => prev.filter((p) => p.id !== notice.id))}
          testId="global-audit-row-notice"
        />
      ))}
      {entries.map((entry) => (
        <ErrorState
          key={entry.id}
          variant="inline"
          title="The change was not saved"
          message={entry.message}
          correlationId={entry.correlationId}
          onDismiss={() => setEntries((prev) => prev.filter((p) => p.id !== entry.id))}
          testId="global-mutation-error"
        />
      ))}
    </div>
  );
}

export default GlobalMutationErrors;
