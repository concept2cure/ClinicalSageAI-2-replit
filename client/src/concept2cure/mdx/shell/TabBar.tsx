/**
 * 44px tab bar — 5 primary surface tabs with live counts.
 * Counts derive from the parent's program list (live via useMdxPrograms or
 * MDX_PROGRAMS fixture fallback); pathway codes are NOT used as status.
 * Ported from Shell.jsx > TabBar.
 */

import * as React from 'react';
import { I, type IconKey } from '../icons';
import type { Program } from '../data/programs';

interface Tab {
  id: string;
  label: string;
  icon: IconKey;
  count?: number;
}

export interface TabBarProps {
  activeNav: string;
  setActiveNav: (id: string) => void;
  programs: Program[];
}

export function TabBar({ activeNav, setActiveNav, programs }: TabBarProps) {
  const tabs: Tab[] = [
    { id: 'overview',  label: 'Overview',        icon: 'grid',        count: programs.length },
    { id: 'k510',      label: '510(k)',          icon: 'file',        count: programs.filter(p => p.pathway === 'k510').length },
    { id: 'pma',       label: 'PMA',             icon: 'shieldCheck', count: programs.filter(p => p.pathway === 'pma').length },
    { id: 'cer',       label: 'CER',             icon: 'microscope',  count: programs.filter(p => p.pathway === 'cer').length },
    { id: 'predicate', label: 'Precedent intel', icon: 'scale' },
  ];

  return (
    <div className="tabbar">
      {tabs.map(t => (
        <button
          key={t.id}
          className="tab"
          aria-current={activeNav === t.id || undefined}
          onClick={() => setActiveNav(t.id)}
        >
          <span className="ico">{I[t.icon]}</span>
          <span>{t.label}</span>
          {t.count !== undefined && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
