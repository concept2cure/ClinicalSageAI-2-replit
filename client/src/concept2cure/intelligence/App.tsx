/**
 * IntelligenceApp — Phase 11 Intelligence cluster shell.
 *
 * Rail + TopBar + surface router over Protocol / CMC / Biostat / Reports.
 * Read-only surfaces; all mutation deep-links to Authoring (Phase 9).
 * Port of ui_kits/intelligence/App.jsx + surfaces.jsx shell.
 *
 * @module client/src/concept2cure/intelligence/App
 */

import * as React from 'react';
import { Rail } from './shell/Rail';
import { TopBar } from './shell/TopBar';
import { ProtocolSurface } from './surfaces/Protocol';
import { CmcSurface } from './surfaces/Cmc';
import { BiostatSurface } from './surfaces/Biostat';
import { ReportsSurface } from './surfaces/Reports';
import { HERE_LABEL, INT_SUGGESTIONS, type IntTab } from './data';

export interface IntelligenceAppProps {
  /** Which surface to open first (from ?tab= / rail click). */
  initialNav?: IntTab;
  /** Forward an AnA prompt to the host conversation surface. */
  onAskAna?: (text: string) => void;
  /** Host navigation for rail cross-links + authoring hand-off. */
  onNavigate?: (target: string) => void;
}

export function IntelligenceApp({ initialNav = 'protocol', onAskAna, onNavigate }: IntelligenceAppProps) {
  const [activeNav, setActiveNav] = React.useState<string>(initialNav);

  React.useEffect(() => { setActiveNav(initialNav); }, [initialNav]);

  const onAsk = React.useCallback((q: string) => {
    if (onAskAna) onAskAna(q);
    else console.info('[AnA · intelligence]', q);
  }, [onAskAna]);

  const onOpenPalette = React.useCallback(() => {
    onAsk(INT_SUGGESTIONS[activeNav]?.[0] ?? 'Show me what you can do here');
  }, [activeNav, onAsk]);

  const onOpenAuthoring = React.useCallback((rulePack: string) => {
    // Phase 9 authoring is not yet routed in v2; deep-link through the host
    // nav so it lands correctly once Authoring ships. Until then the host's
    // safe fallback handles the unknown target.
    onNavigate?.('authoring');
    onAsk(`Open authoring with rule pack ${rulePack}`);
  }, [onNavigate, onAsk]);

  let surface: React.ReactNode;
  switch (activeNav) {
    case 'cmc':       surface = <CmcSurface onAsk={onAsk} onOpenAuthoring={onOpenAuthoring} />; break;
    case 'biostat':   surface = <BiostatSurface onAsk={onAsk} onOpenAuthoring={onOpenAuthoring} />; break;
    case 'reporting': surface = <ReportsSurface onAsk={onAsk} />; break;
    default:          surface = <ProtocolSurface onAsk={onAsk} onOpenAuthoring={onOpenAuthoring} />;
  }

  return (
    <div className="in-shell" data-screen-label="Intelligence">
      <Rail activeNav={activeNav} setActiveNav={setActiveNav} onNavigate={onNavigate} />
      <div className="in-main">
        <TopBar activeNav={activeNav} onOpenPalette={onOpenPalette} />
        <div className="in-page" data-screen-label={`Intelligence · ${HERE_LABEL[activeNav] ?? activeNav}`}>
          <div className="in-page-inner">{surface}</div>
        </div>
      </div>
    </div>
  );
}
