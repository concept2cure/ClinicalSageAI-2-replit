// Tasking TabBar — the workstream surfaces. Mirrors risk TabBar styling.

import * as React from 'react';
import { TaskingIcon } from '../icons';
import { TASKING_NAV } from '../data/nav';

interface TabBarProps {
  activeNav:    string;
  setActiveNav: (id: string) => void;
}

export function TaskingTabBar({ activeNav, setActiveNav }: TabBarProps) {
  return (
    <div className="tabbar" role="tablist" aria-label="Tasking surfaces">
      {TASKING_NAV.map(t => (
        <button key={t.id} className="tab" type="button"
                role="tab"
                aria-selected={activeNav === t.id}
                aria-current={activeNav === t.id || undefined}
                onClick={() => setActiveNav(t.id)}>
          <span className="ico"><TaskingIcon name={t.icon} /></span>
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}
