/**
 * Left rail — 260px expanded / 56px collapsed.
 * Ported from design-system/ui_kits/mdx/Shell.jsx > Rail.
 */

import * as React from 'react';
import { I } from '../icons';
import { MDX_NAV_GROUPS, MDX_NAV_V2, type NavItem } from '../data/nav';

interface User {
  name: string;
  initials: string;
  role: string;
}

export interface RailProps {
  activeNav: string;
  setActiveNav: (id: string) => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  user: User;
}

export function Rail({ activeNav, setActiveNav, collapsed, setCollapsed, user }: RailProps) {
  const renderItem = (item: NavItem) => {
    const Cn = I[item.icon];
    const isActive = activeNav === item.id;
    if (item.href) {
      return (
        <a
          key={item.id}
          className="nav-item"
          href={item.href}
          title={collapsed ? item.label : undefined}
        >
          <span className="ico">{Cn}</span>
          <span className="lbl">{item.label}</span>
        </a>
      );
    }
    return (
      <button
        key={item.id}
        className="nav-item"
        aria-current={isActive || undefined}
        onClick={() => setActiveNav(item.id)}
        title={collapsed ? item.label : undefined}
      >
        <span className="ico">{Cn}</span>
        <span className="lbl">{item.label}</span>
        {item.meta && <span className="nav-meta">{item.meta}</span>}
      </button>
    );
  };

  return (
    <nav className="rail" aria-label="Primary">
      <div className="rail-top">
        <div className="rail-logo">
          <div className="rail-logo-text">
            Concept2Cure<span>.RI</span>
          </div>
        </div>
        <button
          className="rail-collapse"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {I.panelLeft}
        </button>
      </div>
      {MDX_NAV_GROUPS.map(g => {
        const gItems = MDX_NAV_V2.filter(i => i.group === g.id);
        if (!gItems.length) return null;
        return (
          <React.Fragment key={g.id}>
            {g.label && <div className="rail-section">{g.label}</div>}
            <div className="rail-nav">{gItems.map(renderItem)}</div>
          </React.Fragment>
        );
      })}
      <div className="rail-spacer" />
      <button className="rail-account" title={user.name}>
        <div className="avatar">{user.initials}</div>
        <div className="who">
          <div className="name">{user.name}</div>
          <div className="plan">{user.role}</div>
        </div>
        <span className="chev">{I.down}</span>
      </button>
    </nav>
  );
}
