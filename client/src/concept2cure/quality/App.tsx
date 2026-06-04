/**
 * QualityApp — Quality system / SOP register shell.
 *
 * A single-surface shell (topbar + scrollable page) over the SOP register.
 * Mirrors the host-integration contract of IntelligenceApp: AnA prompts hand
 * off to the host conversation surface via `onAskAna`; rail cross-links route
 * through `onNavigate`. Mounted by ZenApp on layoutMode === 'quality' (the home
 * rail "Quality and Lifecycle" item).
 *
 * @module client/src/concept2cure/quality/App
 */

import * as React from 'react';
import { I } from './icons';
import { SopRegister } from './SopRegister';

export interface QualityAppProps {
  /** Forward an AnA prompt to the host conversation surface. */
  onAskAna?: (text: string) => void;
  /** Host navigation for rail cross-links (reserved; accepted for parity). */
  onNavigate?: (target: string) => void;
}

export function QualityApp({ onAskAna }: QualityAppProps) {
  const onAsk = React.useCallback(
    (q: string) => {
      if (onAskAna) onAskAna(q);
      else console.info('[AnA · quality]', q);
    },
    [onAskAna],
  );

  return (
    <div className="qms-shell" data-screen-label="Quality system">
      <div className="qms-topbar">
        <div className="qms-crumbs">
          <span>Quality and lifecycle</span>
          <span className="sep">/</span>
          <span className="here">SOP register</span>
        </div>
        <div className="qms-spacer" />
        <button
          className="qms-tb-btn"
          onClick={() =>
            onAsk(
              'Give me a read-out on the quality system — what is overdue for review, what is awaiting approval, ' +
                'and where read-and-understood training is short.',
            )
          }
        >
          {I.sparkle} Ask AnA
        </button>
      </div>
      <div className="qms-page">
        <div className="qms-page-inner">
          <SopRegister onAsk={onAsk} />
        </div>
      </div>
    </div>
  );
}
