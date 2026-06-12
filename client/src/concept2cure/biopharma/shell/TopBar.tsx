// Biopharma TopBar — port of ui_kits/biopharma/shell.jsx TopBar.
//
// Phase 10.2: the kit-only tenant-type switcher is stripped — in v2 the
// client type comes from organizations.client_type via the session
// (PHASE_10_2_INSTALL.md §3.1). The density toggle persists per user via
// users.preferences.density.

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { BioIcon } from '../icons';
import type { BiopharmaProgram } from '../data/programs';
import type { Density } from '../data/preferences';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';

interface TopBarProps {
  hereLabel:      string;
  program:        BiopharmaProgram | null;
  density:        Density;
  onDensity:      (d: Density) => void;
  /** Display label for the tenant's domain (from organizations.client_type). */
  domainLabel:    string;
  onOpenPalette:  () => void;
}

export function BiopharmaTopBar({ hereLabel, program, density, onDensity, domainLabel, onOpenPalette }: TopBarProps) {
  const { t } = useTranslation('common');
  return (
    <header className="topbar">
      <div className="crumbs">
        <span>Concept2Cure.RI</span>
        <span className="sep">›</span>
        <span>{domainLabel}</span>
        <span className="sep">›</span>
        <span className="here">{hereLabel}</span>
      </div>
      <div className="tb-spacer" />
      {program && (
        <button className="tb-pill" type="button" title={`${t('topbar.switchProgram')} (⌘K)`} onClick={onOpenPalette}>
          <span className="dot" />
          <span>{program.code ?? program.name}</span>
          <span style={{ color: 'var(--text-400)' }}><BioIcon name="chevronDown" /></span>
        </button>
      )}
      <button className="tb-cmdk" type="button" onClick={onOpenPalette} title={`${t('topbar.command')} · ⌘K`}>
        <span className="ico"><BioIcon name="search" /></span>
        <span className="lbl">{t('topbar.askAna')}</span>
        <span className="kbd">⌘K</span>
      </button>
      <div className="bp-density-toggle" role="tablist" aria-label={t('density.label')}>
        {(['compact', 'comfortable', 'spacious'] as const).map(d => (
          <button key={d} type="button"
                  data-active={density === d || undefined}
                  onClick={() => onDensity(d)}
                  title={t(`density.${d}`)}>
            {t(`density.${d}`)}
          </button>
        ))}
      </div>
      <div className="tb-actions">
        <LanguageSwitcher variant="topbar" />
        <button className="tb-btn" type="button" title={t('topbar.filter')}><BioIcon name="filter" /></button>
        <button className="tb-btn" type="button" title={t('topbar.notifications')}><BioIcon name="bell" /></button>
        <button className="tb-btn" type="button" title={t('topbar.help')}><BioIcon name="helpCircle" /></button>
      </div>
    </header>
  );
}
