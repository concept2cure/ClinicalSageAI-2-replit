// Biopharma TopBar — port of ui_kits/biopharma/shell.jsx TopBar.

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { BioIcon } from '../icons';
import type { BiopharmaProgram } from '../data/programs';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';

interface TopBarProps {
  hereLabel:      string;
  program:        BiopharmaProgram | null;
  density:        string;
  onDensity:      (d: string) => void;
  clientType:     string;
  setClientType:  (t: string) => void;
  onOpenPalette:  () => void;
}

export function BiopharmaTopBar({ hereLabel, program, density, onDensity, clientType, setClientType, onOpenPalette }: TopBarProps) {
  const { t } = useTranslation('common');
  return (
    <header className="topbar">
      <div className="crumbs">
        <span>Concept2Cure.RI</span>
        <span className="sep">›</span>
        <span>Biotech and Pharma</span>
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
        {(['compact','comfortable','spacious'] as const).map(d => (
          <button key={d} type="button"
                  data-active={density === d || undefined}
                  onClick={() => onDensity(d)}
                  title={t(`density.${d}`)}>
            {t(`density.${d}`)}
          </button>
        ))}
      </div>
      <div className="tb-actions">
        <select
          value={clientType}
          onChange={e => setClientType(e.target.value)}
          aria-label={t('topbar.clientType')}
          style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)' }}>
          <option value="pharma">{t('topbar.pharma')}</option>
          <option value="biotech">{t('topbar.biotech')}</option>
        </select>
        <LanguageSwitcher variant="topbar" />
        <button className="tb-btn" type="button" title={t('topbar.filter')}><BioIcon name="filter" /></button>
        <button className="tb-btn" type="button" title={t('topbar.notifications')}><BioIcon name="bell" /></button>
        <button className="tb-btn" type="button" title={t('topbar.help')}><BioIcon name="helpCircle" /></button>
      </div>
    </header>
  );
}
