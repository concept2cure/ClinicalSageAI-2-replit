// ProjectDrafts — port of ui_kits/projects/App.jsx Drafts.

import * as React from 'react';

interface Draft {
  id:             number;
  document_id:    string;
  section_key:    string;
  label:          string | null;
  status:         string;
  draft_source:   string | null;
  owner_id:       number | null;
  updated_at:     string | null;
  doc_type:       string | null;
  document_title: string | null;
}

interface DraftsProps {
  drafts:    Draft[];
  projectId: string;
  loading?:  boolean;
  onOpen?:   (draft: Draft) => void;
}

const STATUS_LABELS: Record<string, string> = {
  approved: 'Approved',
  review:   'In review',
  locked:   'Locked',
  drafted:  'Drafted',
  todo:     'To do',
};

function relTime(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function ProjectDrafts({ drafts, loading, onOpen }: DraftsProps) {
  if (loading) {
    return <div className="pj-drafts" style={{ padding: 16, color: 'var(--text-400)' }}>Loading drafts…</div>;
  }
  if (drafts.length === 0) {
    return <div className="pj-drafts" style={{ padding: 16, color: 'var(--text-400)' }}>No sections authored yet.</div>;
  }
  return (
    <div className="pj-drafts">
      {drafts.map((d, i) => (
        <div key={d.id ?? i} className="pj-draft-row" role="button" tabIndex={0}
             onClick={() => onOpen?.(d)}
             onKeyDown={e => e.key === 'Enter' && onOpen?.(d)}>
          <span className="ico">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/>
            </svg>
          </span>
          <span>
            <div className="title">{d.label ?? d.section_key}</div>
            <div className="sub">{d.document_title ?? d.doc_type} · {d.section_key}</div>
          </span>
          <span>
            <span className={`pj-status ${d.status}`}>{STATUS_LABELS[d.status] ?? d.status}</span>
          </span>
          <span className="when">{d.draft_source === 'ai' ? 'AnA' : 'Human'} · {relTime(d.updated_at)}</span>
        </div>
      ))}
    </div>
  );
}
