/**
 * Intelligence rail — port of ui_kits/intelligence/surfaces.jsx Rail.
 *
 * The kit's cross-links were raw anchor tags to sibling prototype pages;
 * in v2 they route through the host's navigation callback so they land on
 * the real in-app surfaces instead of static prototype pages.
 *
 * @module client/src/concept2cure/intelligence/shell/Rail
 */

import * as React from 'react';
import { I } from '../icons';
import { INT_NAV } from '../data';

export interface RailProps {
  activeNav: string;
  setActiveNav: (id: string) => void;
  /** Host navigation — wired to ZenApp's nav handler for cross-links. */
  onNavigate?: (target: string) => void;
}

export function Rail({ activeNav, setActiveNav, onNavigate }: RailProps) {
  return (
    <nav className="in-rail" aria-label="Intelligence">
      <div className="in-logo">
        <span>Concept2Cure<span className="ri">.RI</span></span>
      </div>
      <div className="in-section">Intelligence</div>
      <div className="in-nav">
        {INT_NAV.map((it) => (
          <button
            key={it.id}
            className="in-nav-item"
            type="button"
            aria-current={activeNav === it.id || undefined}
            onClick={() => setActiveNav(it.id)}
          >
            <span className="ico">{I[it.icon]}</span>
            <span>{it.label}</span>
          </button>
        ))}
      </div>
      <div className="in-rail-spacer" />
      <div className="in-section" style={{ marginBottom: 0 }}>Cross-links</div>
      <button className="in-rail-link" type="button" onClick={() => onNavigate?.('projects')}>{I.arrowLeft} Back to home</button>
      <button className="in-rail-link" type="button" onClick={() => onNavigate?.('biopharma')}>{I.layers} Biopharma</button>
      <button className="in-rail-link" type="button" onClick={() => onNavigate?.('mdx')}>{I.layers} Medtech / IVD</button>
    </nav>
  );
}
