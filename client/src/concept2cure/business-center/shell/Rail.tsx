/**
 * Business Center left rail. Mirrors the MDX / Master Administration rail
 * behaviour (expanded / collapsed) with its own `bizc-` scoped class names so
 * the modules never fight over global CSS.
 */

import * as React from 'react';
import { I } from '../../mdx/icons';
import { BIZC_NAV, BIZC_NAV_GROUPS, type NavItem } from '../data/nav';

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
  onExit: () => void;
  user: User;
}

export function Rail({ activeNav, setActiveNav, collapsed, setCollapsed, onExit, user }: RailProps) {
  const renderItem = (item: NavItem) => {
    const Cn = I[item.icon];
    const isActive = activeNav === item.id;
    return (
      <button
        key={item.id}
        className="bizc-nav-item"
        aria-current={isActive || undefined}
        onClick={() => setActiveNav(item.id)}
        title={collapsed ? item.label : undefined}
      >
        <span className="bizc-ico">{Cn}</span>
        <span className="bizc-lbl">{item.label}</span>
      </button>
    );
  };

  return (
    <nav className="bizc-rail" aria-label="Business Center">
      <div className="bizc-rail-top">
        <div className="bizc-rail-logo">
          <span className="bizc-rail-badge">BC</span>
          <span className="bizc-rail-logo-text">
            Business<span> Center</span>
          </span>
        </div>
        <button
          className="bizc-rail-collapse"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand' : 'Collapse'}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          {I.panelLeft}
        </button>
      </div>

      {BIZC_NAV_GROUPS.map(g => {
        const items = BIZC_NAV.filter(i => i.group === g.id);
        if (!items.length) return null;
        return (
          <React.Fragment key={g.id}>
            <div className="bizc-rail-section">{g.label}</div>
            <div className="bizc-rail-nav">{items.map(renderItem)}</div>
          </React.Fragment>
        );
      })}

      <div className="bizc-rail-spacer" />

      <button className="bizc-nav-item bizc-exit" onClick={onExit} title="Exit to platform">
        <span className="bizc-ico">{I.arrowLeft}</span>
        <span className="bizc-lbl">Exit to platform</span>
      </button>

      <div className="bizc-rail-account" title={user.name}>
        <div className="bizc-avatar">{user.initials}</div>
        <div className="bizc-who">
          <div className="bizc-name">{user.name}</div>
          <div className="bizc-plan">{user.role}</div>
        </div>
      </div>
    </nav>
  );
}
