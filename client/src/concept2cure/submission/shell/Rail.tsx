// Submission gateway rail — single flat workstream group, mirrors tasking Rail.

import * as React from 'react';
import { SubmissionIcon } from '../icons';
import { SUBMISSION_NAV, type SubmissionNavItem } from '../data/nav';

interface RailProps {
  activeNav:    string;
  setActiveNav: (id: string) => void;
  collapsed:    boolean;
  setCollapsed: (v: boolean) => void;
  user:         { name: string; initials: string; role: string };
}

export function SubmissionRail({ activeNav, setActiveNav, collapsed, setCollapsed, user }: RailProps) {
  const renderItem = (item: SubmissionNavItem) => {
    const isActive = activeNav === item.id;
    return (
      <button key={item.id} className="nav-item" aria-current={isActive || undefined}
              onClick={() => setActiveNav(item.id)} title={collapsed ? item.label : undefined}
              type="button">
        <span className="ico"><SubmissionIcon name={item.icon} /></span>
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
                onClick={() => setCollapsed(!collapsed)}
                aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
                title={collapsed ? 'Expand' : 'Collapse'}>
          <SubmissionIcon name="panelLeft" />
        </button>
      </div>

      <div className="rail-section rail-section-toggle" data-open aria-hidden="true">
        <span>Submission gateway</span>
      </div>
      <div className="rail-nav">{SUBMISSION_NAV.map(renderItem)}</div>

      <div className="rail-spacer" />
      <button className="rail-account" type="button" title={user.name}>
        <div className="avatar">{user.initials}</div>
        <div className="who">
          <div className="name">{user.name}</div>
          <div className="plan">{user.role}</div>
        </div>
        <span className="chev"><SubmissionIcon name="chevronDown" /></span>
      </button>
    </nav>
  );
}
