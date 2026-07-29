/**
 * QualityApp — Quality & Assurance domain shell.
 *
 * A tabbed shell (topbar + tab bar + scrollable page) over the quality
 * surfaces: the SOP register (controlled documents, periodic review, training)
 * and Change control (the change-control log, lifecycle flowchart, and the
 * links to deviations, CAPAs and validation records). Mirrors the host-
 * integration contract of the other domain shells: AnA prompts hand off to the
 * host conversation surface via `onAskAna`; rail cross-links route through
 * `onNavigate`.
 *
 * @module client/src/concept2cure/quality/App
 */

import * as React from 'react';
import { I } from './icons';
import { SopRegister } from './SopRegister';
import { ChangeControl } from './ChangeControl';

export interface QualityAppProps {
  /** Forward an AnA prompt to the host conversation surface. */
  onAskAna?: (text: string) => void;
  /** Host navigation for rail cross-links (reserved; accepted for parity). */
  onNavigate?: (target: string) => void;
  /** Which surface to open first ('sop' | 'change'). */
  initialTab?: QualityTab;
}

type QualityTab = 'sop' | 'change';

const TABS: { id: QualityTab; label: string; icon: React.ReactNode }[] = [
  { id: 'sop', label: 'SOP register', icon: I.template },
  { id: 'change', label: 'Change control', icon: I.gitBranch },
];

const HERE: Record<QualityTab, string> = {
  sop: 'SOP register',
  change: 'Change control',
};

const ASK_STARTER: Record<QualityTab, string> = {
  sop:
    'Give me a read-out on the quality system — what is overdue for review, what is awaiting approval, ' +
    'and where read-and-understood training is short.',
  change:
    'Give me a read-out on change control — what is awaiting approval, what is overdue for implementation, ' +
    'and which linked deviations or CAPAs are still open.',
};

export function QualityApp({ onAskAna, initialTab = 'sop' }: QualityAppProps) {
  const [tab, setTab] = React.useState<QualityTab>(initialTab);

  const onAsk = React.useCallback(
    (q: string) => {
      if (onAskAna) onAskAna(q);
      else console.info('[AnA · quality]', q);
    },
    [onAskAna],
  );

  return (
    <div className="qms-shell" data-screen-label="Quality & Assurance">
      <div className="qms-topbar">
        <div className="qms-crumbs">
          <span>Quality &amp; Assurance</span>
          <span className="sep">/</span>
          <span className="here">{HERE[tab]}</span>
        </div>
        <div className="qms-spacer" />
        <button className="qms-tb-btn" onClick={() => onAsk(ASK_STARTER[tab])}>
          {I.sparkle} Ask AnA
        </button>
      </div>

      <div className="qms-tabbar" role="tablist" aria-label="Quality surfaces">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className="qms-tab"
            data-on={tab === t.id || undefined}
            onClick={() => setTab(t.id)}
          >
            <span className="qms-tab-ico">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      <div className="qms-page">
        <div className="qms-page-inner">
          {tab === 'sop' ? <SopRegister onAsk={onAsk} /> : <ChangeControl onAsk={onAsk} />}
        </div>
      </div>
    </div>
  );
}
