import React from 'react';
import { I } from '../icons';
import { SampleTag, useLiveList } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';

/* -- Inline fixture types -- */

interface LearningPath {
  id: string;
  title: string;
  lessons: number;
  done: number;
  mins: number;
  level: string;
  tone: string;
}

interface Certification {
  name: string;
  status: string;
  when: string;
}

/* -- Inline fixture data (kit-identical) -- */

const PATHS: LearningPath[] = [
  { id: 'start', title: 'Getting started with AnA', lessons: 6, done: 6, mins: 35, level: 'Essential', tone: 'ok' },
  { id: '510k', title: '510(k) submission mastery', lessons: 9, done: 4, mins: 70, level: 'Device', tone: 'ai' },
  { id: 'ectd', title: 'eCTD authoring & assembly', lessons: 8, done: 1, mins: 60, level: 'Pharma', tone: 'ai' },
  { id: 'ana', title: 'AnA power user -- slash commands & modes', lessons: 5, done: 0, mins: 25, level: 'All roles', tone: 'idle' },
  { id: 'part11', title: '21 CFR Part 11 in practice', lessons: 4, done: 2, mins: 30, level: 'Compliance', tone: 'warn' },
  { id: 'biostat', title: 'Conversational biostatistics', lessons: 7, done: 0, mins: 55, level: 'Clinical', tone: 'idle' },
];

const CERTS: Certification[] = [
  { name: 'AnA Certified -- Regulatory Author', status: 'earned', when: 'Mar 2026' },
  { name: '510(k) Workbench Specialist', status: 'in-progress', when: '44% complete' },
  { name: 'eCTD Assembly Professional', status: 'locked', when: 'Complete the path to unlock' },
];

/* ════ Training -- enablement surface ════ */

export function Training({ onAsk }: SurfaceViewProps) {
  // live ?? fixture: adopt the org's real enablement content once the backend
  // responds, failing closed to the fixture (Sample-data pill) until then.
  const livePaths = useLiveList<LearningPath>('/api/enablement/paths', PATHS);
  const liveCerts = useLiveList<Certification>('/api/enablement/certifications', CERTS);
  const paths = livePaths.data;
  const certs = liveCerts.data;
  const sample = livePaths.sample || liveCerts.sample;

  return (
    <div className="page-inner">
      <div className="ph">
        <div>
          <div className="ph-eyebrow">Admin · enablement</div>
          <h1 className="ph-title">Training &amp; enablement</h1>
          <div className="ph-sub">Guided tours, role-based learning paths, certifications, and AnA as an interactive tutor.</div>
        </div>
        <button className="btn primary" onClick={() => onAsk('Give me a guided tour of the workspace')}>{I.sparkles} Start guided tour</button>
      </div>

      <SampleTag sample={sample} />

      <div className="sec">
        <div className="sec-hdr">
          <div className="sec-title">Learning paths</div>
          <div className="sec-sub">{paths.length} paths</div>
        </div>
        <div className="launch-grid">
          {paths.map((p) => (
            <button key={p.id} className="launch" onClick={() => onAsk(`Continue the "${p.title}" path`)}>
              <div className="launch-top">
                <span className="launch-ico">{I.book}</span>
                <span className={`rd-chip tone-${p.tone}`}>{p.level}</span>
              </div>
              <div className="launch-title">{p.title}</div>
              <div className="launch-desc">{p.lessons} lessons · {p.mins} min</div>
              <div className="ph-bar-track" style={{ margin: '12px 0 6px' }}>
                <div
                  className="ph-bar-fill"
                  data-tone={p.done === p.lessons ? 'ok' : 'ai'}
                  style={{ width: `${(p.done / p.lessons) * 100}%` }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-400)' }}>
                <span>{p.done}/{p.lessons} complete</span>
                <span>{p.done === p.lessons ? 'Done' : p.done ? 'Resume' : 'Start'}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="sec">
        <div className="sec-hdr">
          <div className="sec-title">Certifications</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, maxWidth: 620 }}>
          {certs.map((c, i) => (
            <div key={i} className="form-row">
              <span
                className="esig"
                style={{
                  color: c.status === 'earned'
                    ? 'var(--success)'
                    : c.status === 'in-progress'
                      ? 'var(--warning)'
                      : 'var(--text-500)',
                }}
              >
                {c.status === 'locked' ? I.lock : I.shieldCheck}
              </span>
              <span className="form-l" style={{ flex: 1, fontWeight: 500 }}>{c.name}</span>
              <span className={`rd-chip tone-${c.status === 'earned' ? 'ok' : c.status === 'in-progress' ? 'warn' : 'idle'}`}>
                {c.status}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-400)', minWidth: 120, textAlign: 'right' }}>{c.when}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
