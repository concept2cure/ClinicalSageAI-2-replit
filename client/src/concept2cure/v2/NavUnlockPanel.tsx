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
 */
import React from 'react';
import { I } from './icons';
import { useDialog } from './useDialog';
import { lockNotice, type NavSurfaceEntitlement } from './navEntitlements';

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
        <div className="nav-unlock-foot">
          <button type="button" className="btn ghost" onClick={onClose}>
            Close
          </button>
          {notice.ctaLabel && notice.ctaTarget && (
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                const target = notice.ctaTarget as string;
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
