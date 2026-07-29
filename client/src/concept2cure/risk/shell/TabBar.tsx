// Risk TabBar — the workstream surfaces. Mirrors labeling TabBar styling.

import * as React from 'react';
import { RiskIcon } from '../icons';
import { RISK_NAV } from '../data/nav';

interface TabBarProps {
  activeNav:    string;
  setActiveNav: (id: string) => void;
}

export function RiskTabBar({ activeNav, setActiveNav }: TabBarProps) {
  return (
    <div className="tabbar" role="tablist" aria-label="Risk surfaces">
      {RISK_NAV.map(t => (
        <button key={t.id} className="tab" type="button"
                role="tab"
                aria-selected={activeNav === t.id}
                aria-current={activeNav === t.id || undefined}
                onClick={() => setActiveNav(t.id)}>
          <span className="ico"><RiskIcon name={t.icon} /></span>
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}
