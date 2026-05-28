/**
 * InstructionsTab — Project instructions editor (5,000-char monospace
 * textarea + template rail). Per HANDOFF item 7, this tab is the
 * single source of truth for instructions; the Config panel General
 * tab textarea is read-only (handled there).
 *
 * Mirror of design-system/ui_kits/home/Projects.jsx
 * (ProjectInstructionsScreen, lines 620–697).
 */
import { useState } from 'react';
import { PINSTR_TEMPLATES } from '../data';
import type { Project } from '../types';

interface Props {
  project: Project;
  onSaveInstructions?: (text: string, active: boolean) => Promise<void> | void;
}

export function InstructionsTab({ project, onSaveInstructions }: Props) {
  const [text, setText] = useState(project.instructions || '');
  // Per HANDOFF item 8: active is persisted on the project payload as
  // instructionsActive. Use that field when present; fall back to
  // whether instructions text exists (legacy seed rows don't have it).
  const [active, setActive] = useState(
    project.instructionsActive !== undefined
      ? project.instructionsActive
      : !!project.instructions,
  );
  const [saving, setSaving] = useState(false);
  const charCount = text.length;
  const limit = 5000;

  const handleSave = async (nextActive: boolean) => {
    if (!onSaveInstructions) {
      setActive(nextActive);
      return;
    }
    setSaving(true);
    try {
      await onSaveInstructions(text, nextActive);
      setActive(nextActive);
    } finally {
      setSaving(false);
    }
  };

  function applyTemplate(t: typeof PINSTR_TEMPLATES[number]) {
    const next = text ? `${text}\n\n${t.body}` : t.body;
    if (next.length <= limit) setText(next);
  }

  return (
    <div className="pinstr" data-screen-label={`Instructions · ${project.name}`}>
      <header className="pinstr-head">
        <div>
          <div className="pinstr-eyebrow">Project instructions</div>
          <h2 className="pinstr-title">Tailor Claude for this project</h2>
          <p className="pinstr-sub">
            Instructions are injected into every chat in this project — set the regulatory context, citation style, and house preferences once.
          </p>
        </div>
        <div className="pinstr-head-r">
          <span className={`pinstr-status ${active ? 'is-on' : ''}`}>
            <span className="pinstr-status-dot" />
            {active ? 'Active' : 'Inactive'}
          </span>
        </div>
      </header>

      <div className="pinstr-body">
        <div className="pinstr-editor-wrap">
          <div className="pinstr-editor-head">
            <span className="pinstr-editor-lbl">Instructions</span>
            <span className={`pinstr-count ${charCount > limit * 0.9 ? 'is-warn' : ''}`}>
              {charCount.toLocaleString()} / {limit.toLocaleString()} characters
            </span>
          </div>
          <textarea
            className="pinstr-editor"
            value={text}
            onChange={e => e.target.value.length <= limit && setText(e.target.value)}
            placeholder={
              'Add custom instructions for Claude in this project. Be direct and specific — Claude will follow these in every chat. For example:\n\n• Focus on FDA Class II device requirements\n• Always cite 21 CFR 820 when discussing QMS\n• Our predicate device is K221847 — assume substantial equivalence to it unless stated otherwise\n• Output format: numbered sections, sentence case, citations in parentheses'
            }
            rows={18}
          />
          <div className="pinstr-editor-foot">
            <button type="button" className="prj-btn" onClick={() => setText('')} disabled={!text}>
              Clear
            </button>
            <div className="pinstr-spacer" />
            <button
              type="button"
              className="prj-btn"
              onClick={() => handleSave(false)}
              disabled={!active || saving}
            >
              Pause
            </button>
            <button
              type="button"
              className="prj-btn primary"
              onClick={() => handleSave(true)}
              disabled={saving}
            >
              {saving ? 'Saving…' : active ? 'Save' : 'Save and activate'}
            </button>
          </div>
        </div>

        <aside className="pinstr-rail">
          <div className="pinstr-rail-h">Quick templates</div>
          <div className="pinstr-rail-list">
            {PINSTR_TEMPLATES.map(t => (
              <button type="button" key={t.id} className="pinstr-tmpl" onClick={() => applyTemplate(t)}>
                <div className="pinstr-tmpl-label">{t.label}</div>
                <div className="pinstr-tmpl-hint">{t.hint}</div>
              </button>
            ))}
          </div>

          <div className="pinstr-rail-h pinstr-rail-h-2">Tips</div>
          <ul className="pinstr-tips">
            <li>Be specific — "always cite 21 CFR 820" works better than "be regulatory".</li>
            <li>Lead with the most important rules — Claude follows order of mention.</li>
            <li>Combine templates by clicking more than one — they append.</li>
            <li>Instructions are scoped to this project. Other projects are unaffected.</li>
          </ul>
        </aside>
      </div>
    </div>
  );
}
