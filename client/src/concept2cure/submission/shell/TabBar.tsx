// Submission gateway TabBar — the workstream surfaces. Mirrors tasking TabBar.

import * as React from 'react';
import { SubmissionIcon } from '../icons';
import { SUBMISSION_NAV } from '../data/nav';

interface TabBarProps {
  activeNav:    string;
  setActiveNav: (id: string) => void;
}

export function SubmissionTabBar({ activeNav, setActiveNav }: TabBarProps) {
  return (
    <div className="tabbar" role="tablist" aria-label="Submission gateway surfaces">
      {SUBMISSION_NAV.map(t => (
        <button key={t.id} className="tab" type="button"
                role="tab"
                aria-selected={activeNav === t.id}
                aria-current={activeNav === t.id || undefined}
                onClick={() => setActiveNav(t.id)}>
          <span className="ico"><SubmissionIcon name={t.icon} /></span>
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}
