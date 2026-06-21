/**
 * Master Administration left rail. Mirrors the MDX rail behaviour (260px /
 * 56px collapsed) with its own scoped class names so the two modules never
 * fight over global CSS.
 */

import * as React from 'react';
import { I } from '../../mdx/icons';
import { MA_NAV, MA_NAV_GROUPS, type NavItem } from '../data/nav';

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
        className="ma-nav-item"
        aria-current={isActive || undefined}
        onClick={() => setActiveNav(item.id)}
        title={collapsed ? item.label : undefined}
      >
        <span className="ma-ico">{Cn}</span>
        <span className="ma-lbl">{item.label}</span>
      </button>
    );
  };

  return (
    <nav className="ma-rail" aria-label="Master administration">
      <div className="ma-rail-top">
        <div className="ma-rail-logo">
          <span className="ma-rail-badge">MA</span>
          <span className="ma-rail-logo-text">
            Master<span> Admin</span>
          </span>
        </div>
        <button
          className="ma-rail-collapse"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand' : 'Collapse'}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          {I.panelLeft}
        </button>
      </div>

      {MA_NAV_GROUPS.map(g => {
        const items = MA_NAV.filter(i => i.group === g.id);
        if (!items.length) return null;
        return (
          <React.Fragment key={g.id}>
            <div className="ma-rail-section">{g.label}</div>
            <div className="ma-rail-nav">{items.map(renderItem)}</div>
          </React.Fragment>
        );
      })}

      <div className="ma-rail-spacer" />

      <button className="ma-nav-item ma-exit" onClick={onExit} title="Back to platform">
        <span className="ma-ico">{I.arrowLeft}</span>
        <span className="ma-lbl">Exit to platform</span>
      </button>

      <div className="ma-rail-account" title={user.name}>
        <div className="ma-avatar">{user.initials}</div>
        <div className="ma-who">
          <div className="ma-name">{user.name}</div>
          <div className="ma-plan">{user.role}</div>
        </div>
      </div>
    </nav>
  );
}
