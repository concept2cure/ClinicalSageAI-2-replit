/**
 * BiopharmaApp — Phase 10 biopharma domain shell.
 *
 * Rail + TopBar + TabBar + surface router. Data comes from
 * /api/biopharma/programs (live) — no fixture data imported.
 *
 * AnA dock: ⌘\ toggles; seam collapses when closed. AnaDock
 * promotes to _shared/shell/ in Phase 10.1; for now it reuses
 * the PDEV AnaDock pattern with domain="biopharma".
 *
 * Port of ui_kits/biopharma/app.jsx + shell.jsx.
 *
 * @module client/src/concept2cure/biopharma/App
 */

import * as React from 'react';
import { BiopharmaRail }   from './shell/Rail';
import { BiopharmaTopBar } from './shell/TopBar';
import { BiopharmaTabBar } from './shell/TabBar';
import { BiopharmaOverview } from './surfaces/Overview';
import { BiopharmaPathway, BiopharmaInd, BiopharmaNda, BiopharmaBla, BiopharmaMaa, BiopharmaJnda } from './surfaces/Pathway';
import { BiopharmaStub }   from './surfaces/Stub';
import { HERE_LABEL_BIOPHARMA, BIOPHARMA_SUGGESTIONS } from './data/nav';
import { useBiopharmaPrograms } from './data/programs';

const USER = { name: 'You', initials: 'JC', role: 'Enterprise · Reg Affairs' };

const SHARED_WITH_MDX: Record<string, string> = {
  tasks:        'mdx/workbench/Tasks',
  'ana-review': 'mdx/surfaces/AnaReview',
  vault:        'mdx/surfaces/Vault',
  validation:   'mdx/workbench/Validation',
  submissions:  'mdx/workbench/Submissions',
  templates:    'mdx/surfaces/Templates',
  analytics:    'mdx/surfaces/Analytics',
  memory:       'mdx/surfaces/Memory',
  conversations:'mdx/surfaces/Conversations',
  search:       'mdx/surfaces/Search',
  notifications:'mdx/surfaces/Notifications',
  audit:        'mdx/surfaces/Audit',
  admin:        'mdx/surfaces/Admin',
};

export interface BiopharmaAppProps {
  initialNav?: string;
}

export function BiopharmaApp({ initialNav = 'overview' }: BiopharmaAppProps) {
  const [activeNav, setActiveNav] = React.useState(initialNav);
  const [collapsed, setCollapsed] = React.useState(false);
  const [anaOpen, setAnaOpen] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem('biopharma.anaOpen') ?? 'false'); }
    catch { return false; }
  });
  const [density, setDensity] = React.useState(() => {
    try { return localStorage.getItem('biopharma.density') ?? 'comfortable'; }
    catch { return 'comfortable'; }
  });
  const [clientType, setClientType] = React.useState(() => {
    try { return localStorage.getItem('biopharma.clientType') ?? 'pharma'; }
    catch { return 'pharma'; }
  });

  React.useEffect(() => {
    try { localStorage.setItem('biopharma.anaOpen', JSON.stringify(anaOpen)); } catch { /* noop */ }
  }, [anaOpen]);
  React.useEffect(() => {
    try { localStorage.setItem('biopharma.density', density); } catch { /* noop */ }
  }, [density]);
  React.useEffect(() => {
    try { localStorage.setItem('biopharma.clientType', clientType); } catch { /* noop */ }
  }, [clientType]);

  // ⌘\ toggles AnA dock
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') { e.preventDefault(); setAnaOpen((o: boolean) => !o); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const { programs, loading } = useBiopharmaPrograms();

  const hereLabel = HERE_LABEL_BIOPHARMA[activeNav] ?? 'Overview';

  const askAna = React.useCallback((text: string) => {
    setAnaOpen(true);
    console.info('[AnA · biopharma]', text);
  }, []);

  const onOpenPalette = React.useCallback(() => {
    const suggestions = BIOPHARMA_SUGGESTIONS[activeNav];
    askAna(suggestions?.[0] ?? 'Show me what you can do here');
  }, [activeNav, askAna]);

  let surface: React.ReactNode;
  switch (activeNav) {
    case 'overview':  surface = <BiopharmaOverview programs={programs} onAskAna={askAna} loading={loading} />; break;
    case 'ind':       surface = <BiopharmaInd  programs={programs} onAskAna={askAna} />; break;
    case 'nda':       surface = <BiopharmaNda  programs={programs} onAskAna={askAna} />; break;
    case 'bla':       surface = <BiopharmaBla  programs={programs} onAskAna={askAna} />; break;
    case 'maa':       surface = <BiopharmaMaa  programs={programs} onAskAna={askAna} />; break;
    case 'jnda':      surface = <BiopharmaJnda programs={programs} onAskAna={askAna} />; break;
    case 'lifecycle':
    case 'orphan':
    case 'pediatric':
    case 'pharmacov':
    case 'meetings':
    case 'cmc':
    case 'clinical':
    case 'biostat':
    case 'precedent':
      surface = <BiopharmaStub nav={activeNav} label={hereLabel} onAskAna={askAna} />;
      break;
    default:
      surface = SHARED_WITH_MDX[activeNav]
        ? <BiopharmaStub nav={activeNav} label={hereLabel} sharedWith={SHARED_WITH_MDX[activeNav]} onAskAna={askAna} />
        : <BiopharmaStub nav={activeNav} label={hereLabel} onAskAna={askAna} />;
  }

  return (
    <div className="shell" data-collapsed={collapsed || undefined}
         data-ana-open={anaOpen ? 'true' : undefined}>
      <BiopharmaRail
        activeNav={activeNav} setActiveNav={setActiveNav}
        collapsed={collapsed} setCollapsed={setCollapsed}
        clientType={clientType} user={USER}
      />
      <main className="main">
        <BiopharmaTopBar
          hereLabel={hereLabel} program={null}
          density={density} onDensity={setDensity}
          clientType={clientType} setClientType={setClientType}
          onOpenPalette={onOpenPalette}
        />
        <BiopharmaTabBar
          activeNav={activeNav} setActiveNav={setActiveNav}
          programs={programs} clientType={clientType}
        />
        <div className="page" data-screen-label={`Biopharma · ${hereLabel}`} data-density={density}>
          <div className="page-inner">{surface}</div>
        </div>
      </main>
      {/* AnA seam — dock (Phase 10.1 _shared/shell/AnaDock) wires here */}
      {!anaOpen && (
        <aside className="ana-seam" aria-label="AnA assistant (collapsed)">
          <button className="ana-seam-btn" type="button"
                  onClick={() => setAnaOpen(true)} title="Open AnA · ⌘\">
            <span className="ana-seam-mark">✻</span>
            <span className="ana-seam-label">AnA</span>
          </button>
        </aside>
      )}
    </div>
  );
}
