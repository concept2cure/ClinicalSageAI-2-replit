/**
 * SubmissionApp — submission gateway workstream domain shell.
 *
 * Rail + TopBar + TabBar + surface router + AnA dock. Mirrors the tasking shell
 * idioms. Every surface renders live data via useSubmission hooks against
 * /api/mdx/gateways/* — no kit / demo arrays are imported.
 *
 * Scope: this is the agency-transmission layer (FDA ESG, EMA CESP, EUDAMED,
 * PMDA Gateway) — transmittals, ACK chains, and pre-flight findings. It is
 * deliberately distinct from the package + section + readiness management the
 * existing 'submissions' layoutMode already owns via /api/submission-ops/*, so
 * it does not rebuild any of that.
 *
 * Scoping: every gateway route resolves the org id server-side from the
 * session — no client org param is sent. The region filter and environment
 * toggle narrow the live transmittals + gateways lists. The canonical
 * concept2cure project id is non-numeric and is not a transmittal program UUID,
 * so it is accepted for parity but not threaded as the program filter (it would
 * match nothing); the surface defaults to org-wide, the correct default here.
 *
 * AnA: ⌘\ toggles the dock. When open it runs a real useAnaChat round-trip
 * against /api/ana-ri/stream with submission module context; when closed it
 * collapses to the biopharma-style .ana-seam button.
 *
 * @module client/src/concept2cure/submission/App
 */

import * as React from 'react';
import { SubmissionRail } from './shell/Rail';
import { SubmissionTopBar, type Environment, type RegionFilter } from './shell/TopBar';
import { SubmissionTabBar } from './shell/TabBar';
import { SubmissionOverview } from './surfaces/Overview';
import { SubmissionTransmittals } from './surfaces/Transmittals';
import { SubmissionValidation } from './surfaces/Validation';
import { SubmissionIcon } from './icons';
import { HERE_LABEL_SUBMISSION, SUBMISSION_SUGGESTIONS } from './data/nav';
import { useAnaChat } from '../components/ana/useAnaChat';

const USER = { name: 'You', initials: 'JC', role: 'Enterprise · Reg affairs' };

export interface SubmissionAppProps {
  /** The canonical concept2cure project id, accepted for parity with the other
   *  workstream shells. The submission gateway is org-scoped, so it is not used
   *  as a filter (transmittals key on a program UUID, a different id space). */
  activeProjectId?: string;
  initialNav?: string;
}

export function SubmissionApp({ initialNav = 'overview' }: SubmissionAppProps) {
  const [activeNav, setActiveNav] = React.useState(initialNav);
  const [collapsed, setCollapsed] = React.useState(false);
  const [anaOpen, setAnaOpen] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem('submission.anaOpen') ?? 'false'); }
    catch { return false; }
  });
  const [density, setDensity] = React.useState(() => {
    try { return localStorage.getItem('submission.density') ?? 'comfortable'; }
    catch { return 'comfortable'; }
  });
  const [environment, setEnvironment] = React.useState<Environment>(() => {
    try { return (localStorage.getItem('submission.environment') as Environment) ?? 'production'; }
    catch { return 'production'; }
  });
  const [region, setRegion] = React.useState<RegionFilter>(() => {
    try { return (localStorage.getItem('submission.region') as RegionFilter) ?? 'all'; }
    catch { return 'all'; }
  });

  React.useEffect(() => {
    try { localStorage.setItem('submission.anaOpen', JSON.stringify(anaOpen)); } catch { /* noop */ }
  }, [anaOpen]);
  React.useEffect(() => {
    try { localStorage.setItem('submission.density', density); } catch { /* noop */ }
  }, [density]);
  React.useEffect(() => {
    try { localStorage.setItem('submission.environment', environment); } catch { /* noop */ }
  }, [environment]);
  React.useEffect(() => {
    try { localStorage.setItem('submission.region', region); } catch { /* noop */ }
  }, [region]);

  // ⌘\ toggles AnA dock
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') { e.preventDefault(); setAnaOpen((o: boolean) => !o); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const hereLabel = HERE_LABEL_SUBMISSION[activeNav] ?? 'Submission center';

  const anaChat = useAnaChat({
    screenName: `Submission gateway · ${activeNav}`,
    moduleContext: { workstream: 'submission-gateway', activeNav, environment, region },
  });

  const askAna = React.useCallback((text: string) => {
    if (!text) return;
    setAnaOpen(true);
    void anaChat.send(text);
  }, [anaChat]);

  const onOpenPalette = React.useCallback(() => {
    const suggestions = SUBMISSION_SUGGESTIONS[activeNav];
    askAna(suggestions?.[0] ?? 'Show me what you can do here');
  }, [activeNav, askAna]);

  let surface: React.ReactNode;
  switch (activeNav) {
    case 'overview':
      surface = <SubmissionOverview environment={environment} region={region} onAskAna={askAna} />;
      break;
    case 'transmittals':
      surface = <SubmissionTransmittals region={region} onAskAna={askAna} />;
      break;
    case 'validation':
      surface = <SubmissionValidation region={region} onAskAna={askAna} />;
      break;
    default:
      surface = <SubmissionOverview environment={environment} region={region} onAskAna={askAna} />;
  }

  const [anaDraft, setAnaDraft] = React.useState('');
  const sendAnaDraft = () => {
    const t = anaDraft.trim();
    if (!t) return;
    setAnaDraft('');
    void anaChat.send(t);
  };

  return (
    <div className="shell" data-collapsed={collapsed || undefined}
         data-ana-open={anaOpen ? 'true' : undefined}>
      <SubmissionRail
        activeNav={activeNav} setActiveNav={setActiveNav}
        collapsed={collapsed} setCollapsed={setCollapsed}
        user={USER}
      />
      <main className="main">
        <SubmissionTopBar
          hereLabel={hereLabel}
          density={density} onDensity={setDensity}
          environment={environment} onEnvironment={setEnvironment}
          region={region} onSelectRegion={setRegion}
          onOpenPalette={onOpenPalette}
        />
        <SubmissionTabBar activeNav={activeNav} setActiveNav={setActiveNav} />
        <div className="page" data-screen-label={`Submission gateway · ${hereLabel}`} data-density={density}>
          <div className="page-inner">{surface}</div>
        </div>
      </main>

      {/* AnA — collapsed seam when closed; an inline panel backed by a real
          useAnaChat stream when open. */}
      {!anaOpen ? (
        <aside className="ana-seam" aria-label="AnA assistant (collapsed)">
          <button className="ana-seam-btn" type="button"
                  onClick={() => setAnaOpen(true)} title="Open AnA · ⌘\">
            <span className="ana-seam-mark">✻</span>
            <span className="ana-seam-label">AnA</span>
          </button>
        </aside>
      ) : (
        <aside className="ana" aria-label="AnA assistant"
               style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, minWidth: 300, borderLeft: '1px solid var(--border)', background: 'var(--bg-000)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="ana-seam-mark">✻</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>AnA · submission gateway</span>
            </div>
            <button className="tb-btn" type="button" onClick={() => setAnaOpen(false)}
                    aria-label="Collapse AnA dock" title="Collapse · ⌘\">
              <SubmissionIcon name="panelLeft" />
            </button>
          </div>

          <div className="sub-chat-log" style={{ flex: 1, overflowY: 'auto' }}>
            {anaChat.messages.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(SUBMISSION_SUGGESTIONS[activeNav] ?? SUBMISSION_SUGGESTIONS.overview).slice(0, 3).map((s, i) => (
                  <button key={i} className="sub-starter" type="button" onClick={() => askAna(s)}>
                    <span className="sub-starter-ico"><SubmissionIcon name="sparkles" /></span>{s}
                  </button>
                ))}
              </div>
            )}
            {anaChat.messages.map((m, i) => (
              <div key={i} className={`sub-chat-msg ${m.role === 'assistant' ? 'ana' : 'you'}`}>
                {m.text || (m.streaming ? m.statusPhase || 'Routing…' : '')}
              </div>
            ))}
          </div>

          <form style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}
                onSubmit={e => { e.preventDefault(); sendAnaDraft(); }}>
            <textarea rows={2} aria-label="Ask AnA"
                      placeholder={anaChat.isStreaming ? 'AnA is thinking…' : 'Ask AnA about a transmittal…'}
                      value={anaDraft}
                      onChange={e => setAnaDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendAnaDraft(); } }}
                      disabled={anaChat.isStreaming}
                      style={{ flex: 1, fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', resize: 'vertical', background: 'var(--bg-000)', color: 'var(--text-100)' }} />
            <button className="bp-btn-primary" type="submit" aria-label="Send"
                    disabled={!anaDraft.trim() || anaChat.isStreaming}>
              <SubmissionIcon name="send" />
            </button>
          </form>
        </aside>
      )}
    </div>
  );
}
