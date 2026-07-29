/**
 * PDEV rail — left column of the 3-pane shell. Program selector,
 * grouped sub-nav, collapse toggle, account stub.
 *
 * Port of design-system/ui_kits/pdev/Shell.jsx > PdevRail with the
 * window-global plumbing dropped (closed enums + nav items become
 * direct imports).
 *
 * "Coming soon" nav items render disabled with a hint per the
 * additive-phases rule — they light up when their sub-phase ships.
 */

import * as React from 'react';
import { PdevIcon } from '../icons';
import { PDEV_NAV_GROUPS, PDEV_NAV_ITEMS } from '../data/nav';
import type { PdevProgramView } from '../data/types';

interface RailProps {
  activeNav: string;
  setActiveNav: (id: string) => void;
  collapsed: boolean;
  setCollapsed: (next: boolean) => void;
  program: PdevProgramView['program'] | null;
  programs: ReadonlyArray<{ id: string; code: string; productName: string }>;
  switchProgram: (id: string) => void;
}

export function PdevRail({
  activeNav,
  setActiveNav,
  collapsed,
  setCollapsed,
  program,
  programs,
  switchProgram,
}: RailProps) {
  return (
    <nav className="pdev-rail" aria-label="PDEV navigation">
      <div className="pdev-rail-top">
        <div className="pdev-rail-logo">
          <div className="pdev-rail-logo-text">
            Concept2Cure<span>.RI</span>
          </div>
        </div>
        <button
          className="pdev-rail-collapse"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand' : 'Collapse'}
          type="button"
        >
          <PdevIcon name="panelLeft" />
        </button>
      </div>

      <div className="pdev-rail-breadcrumb">
        <button
          className="pdev-rail-breadcrumb-btn"
          onClick={() => setActiveNav('overview')}
          type="button"
        >
          <span className="ico">
            <PdevIcon name="arrowLeft" />
          </span>
          <span className="lbl">Domain: PDEV</span>
        </button>
      </div>

      <div className="pdev-rail-program">
        <div className="pdev-rail-program-label">Active program</div>
        <select
          className="pdev-rail-program-select"
          value={program?.id ?? ''}
          onChange={(e) => switchProgram(e.target.value)}
          aria-label="Active program"
        >
          {programs.length === 0 && <option value="">No PDEV programs</option>}
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} · {p.productName.split(' · ')[0]}
            </option>
          ))}
        </select>
      </div>

      {PDEV_NAV_GROUPS.map((g) => {
        const items = PDEV_NAV_ITEMS.filter((i) => i.group === g.id);
        if (!items.length) return null;
        return (
          <React.Fragment key={g.id}>
            {g.label && <div className="pdev-rail-section">{g.label}</div>}
            <div className="pdev-rail-nav">
              {items.map((item) => {
                const isActive = activeNav === item.id;
                const disabled = item.comingSoon === true;
                return (
                  <button
                    key={item.id}
                    className="pdev-nav-item"
                    aria-current={isActive ? 'page' : undefined}
                    aria-disabled={disabled || undefined}
                    onClick={() => !disabled && setActiveNav(item.id)}
                    title={
                      disabled
                        ? `${item.label} · ships in a later sub-phase`
                        : collapsed
                        ? item.label
                        : undefined
                    }
                    type="button"
                    data-disabled={disabled || undefined}
                  >
                    <span className="ico">
                      <PdevIcon name={item.icon} />
                    </span>
                    <span className="lbl">{item.label}</span>
                    {disabled && <span className="pdev-nav-soon">soon</span>}
                  </button>
                );
              })}
            </div>
          </React.Fragment>
        );
      })}

      <div className="pdev-rail-spacer" />
      <button className="pdev-rail-account" type="button">
        <div className="pdev-avatar">
          {(program?.code ?? 'PD').slice(0, 2).toUpperCase()}
        </div>
        <div className="pdev-who">
          <div className="pdev-name">{program?.name ?? 'PDEV program'}</div>
          <div className="pdev-plan">
            {program ? `IND · ${program.primaryAgency}` : 'No program selected'}
          </div>
        </div>
        <span className="chev">
          <PdevIcon name="down" />
        </span>
      </button>
    </nav>
  );
}
