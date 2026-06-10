// Risk TopBar — breadcrumb + density toggle + project selector.
// Mirrors labeling TopBar idioms.

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { RiskIcon } from '../icons';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';

export interface RiskProjectOption {
  id: string;
  label: string;
}

interface TopBarProps {
  hereLabel:       string;
  density:         string;
  onDensity:       (d: string) => void;
  projectId:       string | null;
  projectOptions:  RiskProjectOption[];
  onSelectProject: (id: string) => void;
  onOpenPalette:   () => void;
}

export function RiskTopBar({
  hereLabel, density, onDensity, projectId, projectOptions, onSelectProject, onOpenPalette,
}: TopBarProps) {
  const { t } = useTranslation('common');
  return (
    <header className="topbar">
      <div className="crumbs">
        <span>Concept2Cure.RI</span>
        <span className="sep">›</span>
        <span>Risk management</span>
        <span className="sep">›</span>
        <span className="here">{hereLabel}</span>
      </div>
      <div className="tb-spacer" />
      <button className="tb-cmdk" type="button" onClick={onOpenPalette} title={`${t('topbar.command')} · ⌘K`}>
        <span className="ico"><RiskIcon name="search" /></span>
        <span className="lbl">{t('topbar.askAna')}</span>
        <span className="kbd">⌘K</span>
      </button>
      <div className="bp-density-toggle" role="tablist" aria-label={t('density.label')}>
        {(['compact', 'comfortable', 'spacious'] as const).map(d => (
          <button key={d} type="button"
                  role="tab"
                  aria-selected={density === d}
                  data-active={density === d || undefined}
                  onClick={() => onDensity(d)}
                  title={t(`density.${d}`)}>
            {t(`density.${d}`)}
          </button>
        ))}
      </div>
      <div className="tb-actions">
        <select
          value={projectId ?? ''}
          onChange={e => onSelectProject(e.target.value)}
          aria-label={t('topbar.activeProject')}
          style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)' }}>
          {projectOptions.length === 0 && <option value="">{t('topbar.noProjects')}</option>}
          {projectOptions.length > 0 && projectId == null && <option value="">{t('topbar.selectProject')}</option>}
          {projectOptions.map(o => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
        <LanguageSwitcher variant="topbar" />
        <button className="tb-btn" type="button" title={t('topbar.notifications')} aria-label={t('topbar.notifications')}><RiskIcon name="bell" /></button>
        <button className="tb-btn" type="button" title={t('topbar.help')} aria-label={t('topbar.help')}><RiskIcon name="helpCircle" /></button>
      </div>
    </header>
  );
}
