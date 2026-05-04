/**
 * ChatsTab — default detail tab. Renders the timeline + composer + chat
 * list (main column) with memory / instructions / files side cards.
 * Mirror of design-system/ui_kits/home/Projects.jsx (lines 330–431, the
 * `tab === 'chats'` branch of ProjectDetail).
 */
import { useState } from 'react';
import { I } from '../icons';
import { ProjectTimeline } from '../ProjectTimeline';
import type { DetailTab, Project } from '../types';

interface Props {
  project: Project;
  onSwitchTab?: (tab: DetailTab) => void;
}

export function ChatsTab({ project, onSwitchTab }: Props) {
  const [composer, setComposer] = useState('');

  return (
    <div className="prj-grid">
      <section className="prj-main">
        {project.phases && project.phases.length > 0 && <ProjectTimeline project={project} />}

        <div className="prj-composer">
          <textarea
            placeholder="How can I help you today?"
            value={composer}
            onChange={e => setComposer(e.target.value)}
            rows={1}
          />
          <div className="prj-composer-foot">
            <button type="button" className="prj-composer-attach" title="Attach">
              {I.plus}
            </button>
            <div className="prj-composer-spacer" />
            <button type="button" className="prj-model">
              <span>Opus 4.7</span>
              <span className="prj-model-mode">Adaptive</span>
              <span className="prj-model-caret">{I.down}</span>
            </button>
            <button type="button" className="prj-mic" title="Voice">
              {I.mic}
            </button>
          </div>
        </div>

        <ul className="prj-chats">
          {project.chats.map(c => (
            <li key={c.id} className="prj-chat-row">
              <button type="button" className="prj-chat-btn">
                <span className="prj-chat-title">{c.title}</span>
                <span className="prj-chat-last">Last message {c.last}</span>
              </button>
            </li>
          ))}
          {project.chats.length === 0 && (
            <li className="prj-chats-empty">No chats yet. Start one above.</li>
          )}
        </ul>
      </section>

      <aside className="prj-side">
        <section className="prj-side-card">
          <header className="prj-side-h">
            <h2>Memory</h2>
            <div className="prj-side-h-r">
              <span className="prj-only-you">{I.lock} Only you</span>
              <button
                type="button"
                className="prj-icon-btn"
                title="Edit memory"
                onClick={() => onSwitchTab?.('memory')}
              >
                {I.pencil}
              </button>
            </div>
          </header>
          {project.memory.enabled ? (
            <>
              <p className="prj-memory-body">{project.memory.summary}</p>
              <p className="prj-memory-meta">Last updated {project.memory.updated}</p>
            </>
          ) : (
            <p className="prj-memory-empty">Memory is off for this project.</p>
          )}
        </section>

        <section className="prj-side-card">
          <header className="prj-side-h">
            <h2>Instructions</h2>
            <button
              type="button"
              className="prj-icon-btn"
              title="Add instructions"
              onClick={() => onSwitchTab?.('instructions')}
            >
              {I.plus}
            </button>
          </header>
          {project.instructions ? (
            <p className="prj-instructions">{project.instructions}</p>
          ) : (
            <p className="prj-instructions-empty">
              Add instructions to tailor Claude's responses.
            </p>
          )}
        </section>

        <section className="prj-side-card">
          <header className="prj-side-h">
            <h2>Files</h2>
            <button
              type="button"
              className="prj-icon-btn"
              title="Add file"
              onClick={() => onSwitchTab?.('files')}
            >
              {I.plus}
            </button>
          </header>
          <div className="prj-cap">
            <div className="prj-cap-track">
              <div className="prj-cap-fill" style={{ width: `${project.capacityPct}%` }} />
            </div>
            <div className="prj-cap-lbl">{project.capacityPct}% of project capacity used</div>
          </div>
          <div className="prj-files">
            {project.files.map(f => (
              <button
                type="button"
                key={f.name}
                className="prj-file"
                onClick={() => onSwitchTab?.('files')}
              >
                <span className="prj-file-name">{f.name}</span>
                <span className="prj-file-lines">{f.lines ?? 0} lines</span>
                <span className="prj-file-kind">{f.kind}</span>
              </button>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}
