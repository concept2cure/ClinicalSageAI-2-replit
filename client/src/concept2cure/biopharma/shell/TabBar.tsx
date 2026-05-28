// Biopharma TabBar — port of ui_kits/biopharma/shell.jsx TabBar.

import * as React from 'react';
import { BioIcon } from '../icons';
import { CLIENT_TYPES } from '../data/nav';
import type { BiopharmaProgram } from '../data/programs';

interface Tab {
  id:     string;
  label:  string;
  icon:   string;
  count?: number;
}

interface TabBarProps {
  activeNav:    string;
  setActiveNav: (id: string) => void;
  programs:     BiopharmaProgram[];
  clientType:   string;
}

export function BiopharmaTabBar({ activeNav, setActiveNav, programs, clientType }: TabBarProps) {
  const allTabs: Tab[] = [
    { id: 'overview',  label: 'Overview',       icon: 'grid',        count: programs.length },
    { id: 'ind',       label: 'IND / CTA',      icon: 'flask',       count: programs.filter(p => p.program_type === 'IND').length },
    { id: 'nda',       label: 'NDA',            icon: 'file',        count: programs.filter(p => p.program_type === 'NDA').length },
    { id: 'bla',       label: 'BLA',            icon: 'atom',        count: programs.filter(p => p.program_type === 'BLA').length },
    { id: 'maa',       label: 'MAA',            icon: 'globe',       count: programs.filter(p => p.program_type === 'MAA').length },
    { id: 'jnda',      label: 'JNDA',           icon: 'shieldCheck' },
    { id: 'lifecycle', label: 'Lifecycle',      icon: 'history' },
    { id: 'precedent', label: 'Precedent intel',icon: 'scale' },
  ];

  const cfg = CLIENT_TYPES[clientType];
  const allowed = cfg ? new Set([...cfg.workstream, 'overview', 'lifecycle']) : null;
  const tabs = allowed ? allTabs.filter(t => allowed.has(t.id)) : allTabs;

  return (
    <div className="tabbar">
      {tabs.map(t => (
        <button key={t.id} className="tab" type="button"
                aria-current={activeNav === t.id || undefined}
                onClick={() => setActiveNav(t.id)}>
          <span className="ico"><BioIcon name={t.icon as any} /></span>
          <span>{t.label}</span>
          {t.count !== undefined && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
