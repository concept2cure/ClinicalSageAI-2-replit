// Biopharma rail — port of ui_kits/biopharma/shell.jsx Rail.
//
// Phase 10.2: collapsible group state is lifted to the host App, which
// persists it per user via users.preferences.railGroups (smart defaults:
// Workstream open; Lifecycle / Workbench / Intelligence / System collapsed).
// The workstream + lifecycle groups filter by the tenant's client type
// (organizations.client_type).

import * as React from 'react';
import { BioIcon } from '../icons';
import { BIOPHARMA_NAV_GROUPS, BIOPHARMA_NAV, CLIENT_TYPES, asClientType } from '../data/nav';
import type { BioNavItem } from '../data/nav';

interface RailProps {
  activeNav:     string;
  setActiveNav:  (id: string) => void;
  collapsed:     boolean;
  setCollapsed:  (v: boolean) => void;
  clientType:    string;
  user:          { name: string; initials: string; role: string };
  /** Per-user group open state (users.preferences.railGroups). */
  groupOpen:     Record<string, boolean>;
  onToggleGroup: (groupId: string, open: boolean) => void;
}

export function BiopharmaRail({
  activeNav,
  setActiveNav,
  collapsed,
  setCollapsed,
  clientType,
  user,
  groupOpen,
  onToggleGroup,
}: RailProps) {
  const activeGroupId = React.useMemo(() => {
    const item = BIOPHARMA_NAV.find(i => i.id === activeNav);
    return item?.group ?? null;
  }, [activeNav]);

  function filterNav(items: BioNavItem[]): BioNavItem[] {
    const cfg = CLIENT_TYPES[asClientType(clientType)];
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
        // The active item's group always stays open so the current location
        // never disappears from the rail.
        const isOpen = collapsible ? (groupOpen[g.id] ?? false) || activeGroupId === g.id : true;
        const visibleItems = isOpen ? items : items.filter(i => i.id === activeNav);
        const hiddenCount = items.length - visibleItems.length;
        return (
          <React.Fragment key={g.id}>
            {collapsible && (
              <button className="rail-section rail-section-toggle" type="button"
                      data-open={isOpen || undefined}
                      aria-expanded={isOpen}
                      onClick={() => onToggleGroup(g.id, !isOpen)}
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
