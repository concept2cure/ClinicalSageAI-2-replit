import React from 'react';
import { I } from '../icons';
import { useLiveRows, EmptyState } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';

/* -- Display row types (match the backend SELECTed columns) -- */

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
  id: string;
  name: string;
  status: string;
  when: string;
}

/* ════ Training -- enablement surface ════ */

export function Training({ onAsk }: SurfaceViewProps) {
  // Real, org-scoped enablement content. GET /api/enablement/paths and
  // /certifications read persisted rows shaped to the display contract and
  // fail closed to empty — render real rows, an honest empty state, or an
  // honest failed-load state, never a fixture.
  const paths = useLiveRows<LearningPath>('/api/enablement/paths');
  const certs = useLiveRows<Certification>('/api/enablement/certifications');

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

      <div className="sec">
        <div className="sec-hdr">
          <div className="sec-title">Learning paths</div>
          <div className="sec-sub">{paths.rows.length} paths</div>
        </div>
        {paths.loading ? (
          <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading learning paths…</div>
        ) : paths.error ? (
          <EmptyState
            tone="error"
            icon={I.alertTriangle}
            title="Couldn't load learning paths"
            hint="The enablement store didn't respond. Your organization's role-based learning paths appear here once it's reachable — sign in and retry."
          />
        ) : paths.empty ? (
          <EmptyState
            icon={I.book}
            title="No learning paths yet"
            hint="Your organization has no enablement learning paths configured. Once an admin adds them, guided role-based paths appear here."
          />
        ) : (
          <div className="launch-grid">
            {paths.rows.map((p) => (
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
        )}
      </div>

      <div className="sec">
        <div className="sec-hdr">
          <div className="sec-title">Certifications</div>
        </div>
        {certs.loading ? (
          <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading certifications…</div>
        ) : certs.error ? (
          <EmptyState
            tone="error"
            icon={I.alertTriangle}
            title="Couldn't load certifications"
            hint="The enablement store didn't respond. Your organization's certifications and their status appear here once it's reachable — sign in and retry."
          />
        ) : certs.empty ? (
          <EmptyState
            icon={I.shieldCheck}
            title="No certifications yet"
            hint="Your organization has no certifications configured. Earned credentials and in-progress certifications appear here once they're set up."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, maxWidth: 620 }}>
            {certs.rows.map((c) => (
              <div key={c.id} className="form-row">
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
        )}
      </div>
    </div>
  );
}
