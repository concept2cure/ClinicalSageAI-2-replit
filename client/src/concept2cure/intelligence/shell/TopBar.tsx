/**
 * Intelligence top bar — port of ui_kits/intelligence/surfaces.jsx TopBar.
 *
 * @module client/src/concept2cure/intelligence/shell/TopBar
 */

import * as React from 'react';
import { I } from '../icons';
import { HERE_LABEL } from '../data';

export interface TopBarProps {
  activeNav: string;
  onOpenPalette?: () => void;
}

export function TopBar({ activeNav, onOpenPalette }: TopBarProps) {
  return (
    <header className="in-topbar">
      <div className="in-crumbs">
        <span>Concept2Cure.RI</span>
        <span className="sep">›</span>
        <span>Intelligence</span>
        <span className="sep">›</span>
        <span className="here">{HERE_LABEL[activeNav]}</span>
      </div>
      <div className="in-spacer" />
      <button className="in-tb-search" type="button" title="⌘K" onClick={onOpenPalette}>
        <span className="ico">{I.search}</span>
        <span className="lbl">Ask AnA, jump to…</span>
        <span className="kbd">⌘K</span>
      </button>
      <button className="in-tb-btn" type="button" title="Filter">{I.filter}</button>
      <button className="in-tb-btn" type="button" title="Notifications">{I.bell}</button>
      <button className="in-tb-btn" type="button" title="Help">{I.help}</button>
    </header>
  );
}
