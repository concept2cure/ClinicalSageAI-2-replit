// CMC TabBar — the 8 workstream surfaces. Mirrors biopharma TabBar styling.

import * as React from 'react';
import { CmcIcon } from '../icons';
import { CMC_NAV } from '../data/nav';

interface TabBarProps {
  activeNav:    string;
  setActiveNav: (id: string) => void;
}

export function CmcTabBar({ activeNav, setActiveNav }: TabBarProps) {
  return (
    <div className="tabbar" role="tablist" aria-label="CMC surfaces">
      {CMC_NAV.map(t => (
        <button key={t.id} className="tab" type="button"
                role="tab"
                aria-selected={activeNav === t.id}
                aria-current={activeNav === t.id || undefined}
                onClick={() => setActiveNav(t.id)}>
          <span className="ico"><CmcIcon name={t.icon} /></span>
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}
