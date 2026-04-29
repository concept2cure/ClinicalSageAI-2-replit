/**
 * MemoryTab — Project memory full-screen view.
 * Mirror of design-system/ui_kits/home/Projects.jsx
 * (ProjectMemoryScreen, lines 509–608).
 */
import { useState } from 'react';
import { I } from '../icons';
import { PMEM_LEARNINGS } from '../data';
import type { Project } from '../types';

interface Props {
  project: Project;
}

export function MemoryTab({ project }: Props) {
  const [enabled, setEnabled] = useState(project.memory.enabled);
  const learnings = PMEM_LEARNINGS[project.id] || [];

  return (
    <div className="pmem" data-screen-label={`Memory · ${project.name}`}>
      <header className="pmem-head">
        <div>
          <div className="pmem-eyebrow">Project memory</div>
          <h2 className="pmem-title">What Claude remembers across this project</h2>
          <p className="pmem-sub">
            Memory persists across all chats in {project.name}. It captures decisions, regulatory rationale, predicate selections, and supplier commitments — so you don't have to repeat them.
          </p>
        </div>
        <div className="pmem-head-r">
          <span className="pmem-only-you">{I.lock} Only you</span>
          <button
            type="button"
            className={`pmem-toggle ${enabled ? 'is-on' : ''}`}
            onClick={() => setEnabled(!enabled)}
            aria-pressed={enabled}
          >
            <span className="pmem-toggle-knob" />
          </button>
        </div>
      </header>

      {!enabled && (
        <div className="pmem-off">
          <div className="pmem-off-ico">{I.lock}</div>
          <div>
            <div className="pmem-off-title">Memory is off for this project</div>
            <div className="pmem-off-sub">
              Turn it on to let Claude carry context between chats. Off projects work like single conversations — nothing is remembered after a session ends.
            </div>
          </div>
          <button type="button" className="prj-btn primary" onClick={() => setEnabled(true)}>
            Turn on memory
          </button>
        </div>
      )}

      {enabled && (
        <>
          <section className="pmem-card">
            <header className="pmem-card-h">
              <h3 className="pmem-h3">Summary</h3>
              <span className="pmem-meta">Updated {project.memory.updated || 'just now'}</span>
            </header>
            <p className="pmem-summary">
              {project.memory.summary || 'No summary yet — Claude will build one as you work.'}
            </p>
          </section>

          <section className="pmem-stats">
            <div className="pmem-stat">
              <span className="pmem-stat-num">{learnings.length}</span>
              <span className="pmem-stat-lbl">learnings stored</span>
            </div>
            <div className="pmem-stat">
              <span className="pmem-stat-num">{project.chats.length}</span>
              <span className="pmem-stat-lbl">chats indexed</span>
            </div>
            <div className="pmem-stat">
              <span className="pmem-stat-num">{project.files.length}</span>
              <span className="pmem-stat-lbl">files referenced</span>
            </div>
            <div className="pmem-stat">
              <span className="pmem-stat-num">SHA-256</span>
              <span className="pmem-stat-lbl">integrity verified</span>
            </div>
          </section>

          <section className="pmem-card">
            <header className="pmem-card-h">
              <h3 className="pmem-h3">Recent learnings</h3>
              <button type="button" className="pcp-link">View all</button>
            </header>
            <ul className="pmem-list">
              {learnings.length === 0 && (
                <li className="pmem-empty">
                  Nothing learned yet. Start a chat — Claude will record key decisions here.
                </li>
              )}
              {learnings.map((l, i) => (
                <li key={i} className="pmem-row">
                  <span className="pmem-row-when">{l.when}</span>
                  <span className="pmem-row-kind">{l.kind}</span>
                  <span className="pmem-row-text">{l.text}</span>
                  <button type="button" className="prj-icon-btn pmem-row-x" title="Forget this">
                    {I.close}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="pmem-card">
            <header className="pmem-card-h">
              <h3 className="pmem-h3">Controls</h3>
            </header>
            <div className="pmem-controls">
              <button type="button" className="prj-btn">Export memory</button>
              <button type="button" className="prj-btn">Audit trail</button>
              <button type="button" className="pmem-danger">
                Forget everything in this project
              </button>
            </div>
            <p className="pmem-note">
              Forgetting is final — once cleared, Claude will start fresh in this project. Audit-trail entries (who turned memory on/off, what was forgotten and when) are retained per 21 CFR Part 11.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
