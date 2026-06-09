/**
 * Intelligence top bar — port of ui_kits/intelligence/surfaces.jsx TopBar.
 *
 * @module client/src/concept2cure/intelligence/shell/TopBar
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { I } from '../icons';
import { HERE_LABEL } from '../data';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';

export interface TopBarProps {
  activeNav: string;
  onOpenPalette?: () => void;
}

export function TopBar({ activeNav, onOpenPalette }: TopBarProps) {
  const { t } = useTranslation('common');
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
        <span className="lbl">{t('topbar.askAna')}</span>
        <span className="kbd">⌘K</span>
      </button>
      <LanguageSwitcher variant="topbar" />
      <button className="in-tb-btn" type="button" title={t('topbar.filter')}>{I.filter}</button>
      <button className="in-tb-btn" type="button" title={t('topbar.notifications')}>{I.bell}</button>
      <button className="in-tb-btn" type="button" title={t('topbar.help')}>{I.help}</button>
    </header>
  );
}
