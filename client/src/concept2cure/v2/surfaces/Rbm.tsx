import React, { useState } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import { SampleTag } from '../dataConnect';
import {
  RBM_STUDIES, RBM_NAV, RBM_LINKS,
} from '../fixtures/rbm-data';
import {
  SeedEmpty, RbmAnaDock, rbmAnaResolve,
  RbmOverview, RbmReport, RbmRact, RbmKris, RbmQtls,
  RbmSignals, RbmPatients, RbmSites, RbmOversight, RbmPlan,
} from './RbmSurfaces';
import '../styles/project-home-v2.css';

/* ── Surface component map ── */
type SubSurface = React.ComponentType<{
  onTab: (id: string) => void;
  onAsk: (t: string) => void;
  onNav: (id: string) => void;
}>;

const SURFACES: Record<string, SubSurface> = {
  overview: RbmOverview, report: RbmReport, ract: RbmRact,
  kris: RbmKris, qtls: RbmQtls, signals: RbmSignals,
  patients: RbmPatients, sites: RbmSites, oversight: RbmOversight,
  plan: RbmPlan,
};

/* ── AnA message type ── */
interface AnaMsg {
  role: string;
  text?: string;
  r?: ReturnType<typeof rbmAnaResolve>;
}

/* ── Seed action map ── */
const SEED_ACTIONS: Record<string, string[]> = {
  overview: ['Seed risk assessment', 'Seed KRIs', 'Seed QTLs', 'Recompute site risk'],
  report: ['Seed risk assessment'],
  ract: ['Seed a default ICH E6(R3) assessment'],
  kris: ['Seed the standard KRI library'],
  qtls: ['Propose quality tolerance limits'],
  signals: ['Run central monitoring'],
  patients: ['Scan the patient cohort'],
  sites: ['Recompute site risk'],
  oversight: ['Recompute site risk'],
  plan: ['Generate a risk-based monitoring plan'],
};

/* ── Icon map for cross-app links ── */
const LINK_ICONS: Record<string, string> = {
  project: 'folder', vault: 'vault', biostats: 'sigma', tasks: 'checkSquare',
};

/* ════════════════════════════════════════════════════════════════════
   Rbm — the RBM domain shell
   ════════════════════════════════════════════════════════════════════ */

export function Rbm({ onAsk, onNav }: SurfaceViewProps) {
  const [study, setStudy] = useState('bx204-301');
  const [tab, setTab] = useState('overview');
  const [anaOpen, setAnaOpen] = useState(true);
  const [anaMsgs, setAnaMsgs] = useState<AnaMsg[]>([]);

  const st = RBM_STUDIES.find(s => s.id === study)!;
  const nav = RBM_NAV.find(n => n.id === tab)!;

  const askAna = (text: string) => {
    if (!text) return;
    setAnaMsgs(m => [...m, { role: 'user', text }, { role: 'ana', r: rbmAnaResolve(text) }]);
    if (!anaOpen) setAnaOpen(true);
  };

  const Body = SURFACES[tab];

  return (
    <div className="rbm" data-screen-label={`RBM -- ${nav.label}`}>
      <SampleTag sample={true} />

      <div className="reg-h">
        <div>
          <div className="ph-eyebrow">Clinical -- risk-based quality management</div>
          <h1 className="reg-title">Risk-based monitoring</h1>
          <p className="reg-sub">
            ICH E6(R3) RBQM for the study: risk assessment, KRIs and QTLs, central
            statistical monitoring, site oversight and the monitoring plan. Every score
            is engine output -- the number behind each chip is always visible.
          </p>
        </div>
        <div className="rbm-study">
          <span className="rbm-study-l">Study</span>
          <select
            className="rbm-study-sel"
            value={study}
            onChange={e => setStudy(e.target.value)}
            aria-label="Select a study"
          >
            {RBM_STUDIES.map(s => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          <span className="rbm-study-m">
            {st.program} -- {st.sites} sites -- {st.subjects} subjects
          </span>
        </div>
      </div>

      <div className="rbm-links">
        <span className="rbm-links-l">{I.network}Linked to</span>
        {(['project', 'vault', 'tasks', 'biostats'] as const).map(k => {
          const L = RBM_LINKS[k];
          return (
            <button
              key={k}
              className="rbm-link"
              onClick={() => onNav && onNav(L.surface)}
              title={L.note}
            >
              <span className="rbm-link-ico">
                {(I as Record<string, React.ReactNode>)[LINK_ICONS[k] || 'folder']}
              </span>
              <span className="rbm-link-t">
                <b>{L.label}</b><em>{L.value}</em>
              </span>
              <span className="rbm-link-go">{I.chevRight}</span>
            </button>
          );
        })}
      </div>

      <div className="reg-tabs rbm-tabs" role="tablist">
        {RBM_NAV.map(n => (
          <button
            key={n.id}
            role="tab"
            aria-selected={tab === n.id}
            className={`reg-tab${tab === n.id ? ' on' : ''}`}
            onClick={() => setTab(n.id)}
          >
            {n.label}
          </button>
        ))}
      </div>

      <div className="rbm-workarea" data-ana={anaOpen || undefined}>
        <div className="rbm-content">
          {st.hasData ? (
            <Body onTab={setTab} onAsk={askAna} onNav={onNav} />
          ) : (
            <SeedEmpty
              title={`No RBM data for ${st.label} yet`}
              body="This study has no risk assessment, indicators or tolerance limits. Seeding creates the ICH E6(R3) TransCelerate defaults, scoped to this study, ready to tailor."
              actions={SEED_ACTIONS[tab] || SEED_ACTIONS.overview}
              onRun={a => askAna(`${a} for ${st.label}`)}
            />
          )}
        </div>
        {anaOpen ? (
          <RbmAnaDock
            nav={nav}
            study={st.label.split(' --')[0]}
            msgs={anaMsgs}
            onAsk={askAna}
            onTab={setTab}
            onNav={onNav}
            onClose={() => setAnaOpen(false)}
          />
        ) : (
          <button
            className="rbm-ana-seam"
            onClick={() => setAnaOpen(true)}
            title="Open AnA"
          >
            <span className="mk">{'✻'}</span>AnA
          </button>
        )}
      </div>
    </div>
  );
}
