// Biopharma rail — port of ui_kits/biopharma/shell.jsx Rail.

import * as React from 'react';
import { BioIcon } from '../icons';
import { BIOPHARMA_NAV_GROUPS, BIOPHARMA_NAV, CLIENT_TYPES } from '../data/nav';
import type { BioNavItem } from '../data/nav';

interface RailProps {
  activeNav:     string;
  setActiveNav:  (id: string) => void;
  collapsed:     boolean;
  setCollapsed:  (v: boolean) => void;
  clientType:    string;
  user:          { name: string; initials: string; role: string };
}

const RAIL_GROUPS_KEY = 'biopharma.railGroupsOpen';

export function BiopharmaRail({ activeNav, setActiveNav, collapsed, setCollapsed, clientType, user }: RailProps) {
  const activeGroupId = React.useMemo(() => {
    const item = BIOPHARMA_NAV.find(i => i.id === activeNav);
    return item?.group ?? null;
  }, [activeNav]);

  const [groupOpen, setGroupOpen] = React.useState<Record<string, boolean>>(() => {
    let stored: Record<string, boolean> = {};
    try {
      const raw = localStorage.getItem(RAIL_GROUPS_KEY);
      if (raw) stored = JSON.parse(raw);
    } catch { /* ignore */ }
    const out: Record<string, boolean> = {};
    BIOPHARMA_NAV_GROUPS.forEach(g => {
      out[g.id] = stored[g.id] != null ? stored[g.id] : (g.id === 'workstream' || g.id === 'system' || !g.label);
    });
    return out;
  });

  React.useEffect(() => {
    try { localStorage.setItem(RAIL_GROUPS_KEY, JSON.stringify(groupOpen)); } catch { /* quota */ }
  }, [groupOpen]);

  const toggleGroup = (gid: string) => setGroupOpen(prev => ({ ...prev, [gid]: !prev[gid] }));

  function filterNav(items: BioNavItem[]): BioNavItem[] {
    const cfg = CLIENT_TYPES[clientType];
    if (!cfg) return items;
    const allowedWS = new Set(cfg.workstream);
    const allowedLC = new Set(cfg.lifecycle);
    return items.filter(it => {
      if (it.group === 'workstream') return allowedWS.has(it.id);
      if (it.group === 'lifecycle')  return allowedLC.has(it.id);
      return true;
    });
  }

  const renderItem = (item: BioNavItem) => {
    const isActive = activeNav === item.id;
    return (
      <button key={item.id} className="nav-item" aria-current={isActive || undefined}
              onClick={() => setActiveNav(item.id)} title={collapsed ? item.label : undefined}
              type="button">
        <span className="ico"><BioIcon name={item.icon as any} /></span>
        <span className="lbl">{item.label}</span>
      </button>
    );
  };

  return (
    <nav className="rail" aria-label="Primary">
      <div className="rail-top">
        <div className="rail-logo">
          <div className="rail-logo-text">Concept2Cure<span>.RI</span></div>
        </div>
        <button className="rail-collapse" type="button"
                onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Expand' : 'Collapse'}>
          <BioIcon name="panelLeft" />
        </button>
      </div>

      {BIOPHARMA_NAV_GROUPS.map(g => {
        const items = filterNav(BIOPHARMA_NAV).filter(i => i.group === g.id);
        if (!items.length) return null;
        const collapsible = !!g.label;
        const isOpen = collapsible ? (groupOpen[g.id] || activeGroupId === g.id) : true;
        const visibleItems = isOpen ? items : items.filter(i => i.id === activeNav);
        const hiddenCount = items.length - visibleItems.length;
        return (
          <React.Fragment key={g.id}>
            {collapsible && (
              <button className="rail-section rail-section-toggle" type="button"
                      data-open={isOpen || undefined}
                      onClick={() => toggleGroup(g.id)}
                      title={isOpen ? `Collapse ${g.label}` : `Expand ${g.label}`}>
                <span className="rail-section-chev"><BioIcon name="chevronDown" /></span>
                <span>{g.label}</span>
                {!isOpen && hiddenCount > 0 && <span className="rail-section-count">{hiddenCount}</span>}
              </button>
            )}
            <div className="rail-nav">{visibleItems.map(renderItem)}</div>
          </React.Fragment>
        );
      })}

      <div className="rail-spacer" />
      <button className="rail-account" type="button" title={user.name}>
        <div className="avatar">{user.initials}</div>
        <div className="who">
          <div className="name">{user.name}</div>
          <div className="plan">{user.role}</div>
        </div>
        <span className="chev"><BioIcon name="chevronDown" /></span>
      </button>
    </nav>
  );
}
