// Labeling TabBar — the workstream surfaces. Mirrors cmc TabBar styling.

import * as React from 'react';
import { LabelingIcon } from '../icons';
import { LABELING_NAV } from '../data/nav';

interface TabBarProps {
  activeNav:    string;
  setActiveNav: (id: string) => void;
}

export function LabelingTabBar({ activeNav, setActiveNav }: TabBarProps) {
  return (
    <div className="tabbar" role="tablist" aria-label="Labeling surfaces">
      {LABELING_NAV.map(t => (
        <button key={t.id} className="tab" type="button"
                role="tab"
                aria-selected={activeNav === t.id}
                aria-current={activeNav === t.id || undefined}
                onClick={() => setActiveNav(t.id)}>
          <span className="ico"><LabelingIcon name={t.icon} /></span>
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}
