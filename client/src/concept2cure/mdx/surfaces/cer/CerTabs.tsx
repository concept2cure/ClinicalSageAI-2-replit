/**
 * CerTabs — the CER workbench's inner tab bar + panel wrapper.
 *
 * Reuses the pathway tab visual idiom (pwt-bar / pwt-btn from
 * pathway-tabs.css) under a `.cer-tabbar` modifier that keeps the active
 * indicator NEUTRAL: the outer PathwayPanes bar already spends the screen's
 * one Claude-orange active indicator, and the design contract allows the
 * accent at most once per screen.
 *
 * Accessibility: proper tablist/tab/tabpanel roles with aria-selected and
 * id/aria-controls pairing; Left/Right/Home/End move focus and select
 * (roving tabindex).
 */

import * as React from 'react';

export type CerTabId = 'signals' | 'literature' | 'gspr' | 'equivalence' | 'pms' | 'generator';

export interface CerTabDef {
  id: CerTabId;
  label: string;
  sub: string;
  count?: number;
}

export function cerTabDomId(id: CerTabId): { tab: string; panel: string } {
  return { tab: `cer-tab-${id}`, panel: `cer-tabpanel-${id}` };
}

export interface CerTabBarProps {
  tabs: CerTabDef[];
  active: CerTabId;
  onSelect: (id: CerTabId) => void;
}

export function CerTabBar({ tabs, active, onSelect }: CerTabBarProps) {
  const refs = React.useRef<Map<CerTabId, HTMLButtonElement>>(new Map());

  const focusAndSelect = (index: number) => {
    const next = tabs[(index + tabs.length) % tabs.length];
    onSelect(next.id);
    refs.current.get(next.id)?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        focusAndSelect(index + 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        focusAndSelect(index - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusAndSelect(0);
        break;
      case 'End':
        e.preventDefault();
        focusAndSelect(tabs.length - 1);
        break;
      default:
        break;
    }
  };

  return (
    <div className="pwt-bar cer-tabbar" role="tablist" aria-label="Clinical evaluation workbench tabs">
      {tabs.map((t, i) => {
        const ids = cerTabDomId(t.id);
        const selected = active === t.id;
        return (
          <button
            key={t.id}
            id={ids.tab}
            role="tab"
            aria-selected={selected}
            aria-controls={ids.panel}
            tabIndex={selected ? 0 : -1}
            className={`pwt-btn ${selected ? 'active' : ''}`}
            ref={(el) => {
              if (el) refs.current.set(t.id, el);
              else refs.current.delete(t.id);
            }}
            onClick={() => onSelect(t.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            <span className="pwt-label">
              {t.label}
              {typeof t.count === 'number' && <span className="pwt-count">{t.count}</span>}
            </span>
            <span className="pwt-sub">{t.sub}</span>
          </button>
        );
      })}
    </div>
  );
}

export interface CerTabPanelProps {
  id: CerTabId;
  active: CerTabId;
  children: React.ReactNode;
}

/** Renders its children only while active — inactive tabs mount nothing,
 *  so their fetches only run once the user opens them. */
export function CerTabPanel({ id, active, children }: CerTabPanelProps) {
  const ids = cerTabDomId(id);
  if (id !== active) return null;
  return (
    <div id={ids.panel} role="tabpanel" aria-labelledby={ids.tab} className="cer-tabpanel">
      {children}
    </div>
  );
}
