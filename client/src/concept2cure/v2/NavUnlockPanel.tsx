/**
 * The panel a locked rail destination opens.
 *
 * MDX_PAYING_CUSTOMER_VALUE_AND_ENTITLEMENTS_2026-06-15.md §4 sets the rule
 * this implements: "Locked features show an upgrade path, never a dead button.
 * … Activating it opens an honest panel: what the feature does, the minimum
 * tier required, and a single next step. It never appears as a disabled,
 * reasonless control."
 *
 * So a locked rail entry stays a real, focusable, activatable button. What
 * changes is where it lands: instead of opening a surface the organization has
 * not licensed — which would either 403 or, worse, render an empty screen that
 * reads as "there is nothing here" — it opens this, which names the module, the
 * reason from the server, and the one step that resolves that reason.
 *
 * Every string comes from `lockNotice()`, which branches on the server's own
 * verdict. Nothing here invents a price, a tier, a renewal date, or a step the
 * viewer cannot actually take: when the resolving action belongs to an
 * administrator and the viewer is not one, the panel says so and offers no
 * button rather than offering one that will be refused.
 *
 * ── THE STEP THAT WAS MISSING ────────────────────────────────────────────────
 * That last rule was honest and it was a dead end. An org administrator got a
 * CTA to the plans page, which has a real checkout. A member got the reason,
 * the required tier, and nothing to do — the person who actually needs the
 * module left with only the knowledge that they needed it.
 *
 * So a member now gets one more thing: they can ask, and the ask lands
 * somewhere a human sees it. Three properties hold that honest:
 *
 *   · It is offered only to a viewer for whom asking IS the step. An
 *     administrator holds the control already (`lockNotice().requestable`).
 *   · A request already on file is SAID, with the date it was made, and the
 *     button is gone. A second press would be absorbed into the row already
 *     there and reported as success — a click that teaches the person pressing
 *     it that pressing does nothing.
 *   · A failed read is never rendered as "no request on file". The panel would
 *     then invite a duplicate and, worse, tell somebody their colleague's
 *     pending request does not exist. `<ErrorState>` with a retry, always.
 */
import React from 'react';
import { I } from './icons';
import { useDialog } from './useDialog';
import {
  currentRequestFor,
  lockNotice,
  requestNotice,
  type ModuleAccessRequestSummary,
  type NavSurfaceEntitlement,
} from './navEntitlements';
import { setUnlockIntent } from './unlockIntent';
import { useLiveData, ErrorState, hasKeys } from './dataConnect';
import { apiCall, apiErrorText } from './apiCall';
import './styles/licensing-access-requests.css';

const MINE_PATH = '/api/module-access-requests/mine';

interface MinePayload {
  requests: ModuleAccessRequestSummary[];
}

export function NavUnlockPanel({
  verdict,
  isOrgAdmin,
  onClose,
  onNav,
}: {
  verdict: NavSurfaceEntitlement;
  isOrgAdmin: boolean;
  onClose: () => void;
  onNav: (id: string) => void;
}) {
  const notice = lockNotice(verdict, { isOrgAdmin });
  const ref = useDialog(onClose);
  const titleId = `nav-unlock-${verdict.id}`;

  /* Read only when asking is actually on offer. An administrator's panel makes
     no request for a queue it will not show. */
  const [reload, setReload] = React.useState(0);
  const minePath = notice.requestable ? MINE_PATH : null;
  const mine = useLiveData<MinePayload>(
    minePath,
    [minePath, reload],
    hasKeys<MinePayload>('requests'),
  );

  /** The request this press created, held locally so the panel can report the
   *  outcome without waiting for a re-read. */
  const [justFiled, setJustFiled] = React.useState<ModuleAccessRequestSummary | null>(null);
  const [note, setNote] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [writeError, setWriteError] = React.useState<string | null>(null);

  const onFile = currentRequestFor(mine.data?.requests ?? null, verdict.id);
  const current = justFiled ?? onFile;
  const currentNotice = requestNotice(current);
  /* Only an OPEN request closes the form. A declined one is history the viewer
     should see, and asking again after the plan changed is exactly what the
     partial de-duplication rule exists to allow. */
  const alreadyOpen = current?.status === 'open';

  async function submit() {
    setSending(true);
    setWriteError(null);
    const res = await apiCall<{ request: ModuleAccessRequestSummary; alreadyOpen: boolean }>(
      'POST',
      '/api/module-access-requests',
      { moduleId: verdict.id, note: note.trim() || undefined },
    );
    setSending(false);
    if (!res.ok || !res.body?.request) {
      setWriteError(apiErrorText(res, 'Your request was not sent.'));
      return;
    }
    setJustFiled(res.body.request);
  }

  return (
    <div className="nav-unlock-bd" onClick={onClose}>
      <div
        className="nav-unlock"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="nav-unlock-hd">
          {/* The status is carried by text AND an icon, never colour alone
              (HF spec — "Color is never the only channel"). */}
          <span className="nav-unlock-ic" aria-hidden="true">
            {I.lock}
          </span>
          <div className="nav-unlock-hd-mid">
            <div className="nav-unlock-t" id={titleId}>
              {verdict.label}
            </div>
            <div className="nav-unlock-status">{notice.status}</div>
          </div>
          <button type="button" className="tb-btn" onClick={onClose} aria-label="Close">
            {I.close}
          </button>
        </div>
        <p className="nav-unlock-body">{notice.body}</p>

        {notice.requestable && (
          <div className="nav-unlock-req">
            {mine.loading && (
              <p className="nav-unlock-req-note" role="status" aria-live="polite">
                Checking whether you have already asked for this app.
              </p>
            )}

            {/* Fail closed. A failed read must never render as "no request on
                file" — that invites a duplicate and denies a pending one. */}
            {!mine.loading && mine.error && !justFiled && (
              <ErrorState
                variant="inline"
                title="Could not check your earlier requests."
                message={mine.error}
                retry={() => setReload((n) => n + 1)}
              />
            )}

            {!mine.loading && !mine.error && currentNotice && (
              <p className="nav-unlock-req-note" role="status" aria-live="polite">
                <span className="nav-unlock-req-ic" aria-hidden="true">
                  {alreadyOpen ? I.clock : I.info}
                </span>
                {currentNotice}
              </p>
            )}

            {!mine.loading && !mine.error && !alreadyOpen && (
              <>
                <label className="nav-unlock-req-label" htmlFor={`${titleId}-note`}>
                  Why you need it (optional)
                </label>
                <textarea
                  id={`${titleId}-note`}
                  className="nav-unlock-req-input"
                  rows={3}
                  value={note}
                  maxLength={2000}
                  disabled={sending}
                  placeholder="The work this app is needed for, and by when."
                  onChange={(e) => setNote(e.target.value)}
                />
                {writeError && (
                  <ErrorState
                    variant="inline"
                    title="Your request was not sent."
                    message={writeError}
                    retry={submit}
                    busy={sending}
                    onDismiss={() => setWriteError(null)}
                  />
                )}
              </>
            )}
          </div>
        )}

        <div className="nav-unlock-foot">
          <button type="button" className="btn ghost" onClick={onClose}>
            Close
          </button>
          {notice.requestable && !alreadyOpen && !mine.loading && !mine.error && (
            <button
              type="button"
              className="btn primary"
              onClick={submit}
              disabled={sending}
              aria-label={`Ask an administrator for ${verdict.label}`}
            >
              {sending ? 'Sending…' : 'Ask an administrator'}
            </button>
          )}
          {notice.ctaLabel && notice.ctaTarget && (
            <button
              type="button"
              className={notice.requestable ? 'btn ghost' : 'btn primary'}
              onClick={() => {
                const target = notice.ctaTarget as string;
                /* Carry WHAT the customer was trying to open across the
                   navigation. Without this they land on a generic price list
                   that has never heard of the module they just clicked, and are
                   left to work out which column applies — at exactly the moment
                   an upgrade either happens or does not. Both facts come from
                   the server's verdict; neither is invented here. */
                setUnlockIntent({
                  moduleId: verdict.id,
                  label: verdict.label,
                  requiredTier: verdict.requiredTier,
                });
                onClose();
                onNav(target);
              }}
            >
              {notice.ctaLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
