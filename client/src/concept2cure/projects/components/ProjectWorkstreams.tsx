// ProjectWorkstreams — port of ui_kits/projects/App.jsx Streams.

import * as React from 'react';

interface Workstream {
  module:         string;
  total:          number;
  approved:       number;
  completion_pct: number;
  last_updated:   string | null;
}

interface WorkstreamsProps {
  workstreams:  Workstream[];
  documentId?:  string | null;
  onOpen?:      (module: string) => void;
}

const MODULE_LABELS: Record<string, { label: string; desc: string }> = {
  m1:  { label: 'Admin · Module 1',      desc: 'Forms, labeling' },
  m2:  { label: 'Summaries · Module 2',  desc: 'QOS, nonclin, clinical' },
  m3:  { label: 'CMC · Module 3',        desc: 'Drug substance + product' },
  m4:  { label: 'Nonclinical · Module 4',desc: 'Pharm, PK, tox' },
  m5:  { label: 'Clinical · Module 5',   desc: 'CSRs, ISE, ISS' },
  cmc:  { label: 'CMC',                  desc: 'Chemistry, Manufacturing and Controls' },
  nonclin: { label: 'Nonclinical',       desc: 'Pharmacology, tox, PK' },
  clin:    { label: 'Clinical',          desc: 'Clinical study reports' },
  admin:   { label: 'Administrative',    desc: 'Module 1 forms and labeling' },
};

function statusFromPct(pct: number): string {
  if (pct >= 100) return 'approved';
  if (pct >= 75)  return 'review';
  if (pct >= 25)  return 'drafted';
  return 'todo';
}

export function ProjectWorkstreams({ workstreams, onOpen }: WorkstreamsProps) {
  if (workstreams.length === 0) {
    return (
      <div className="pj-stream">
        <div style={{ padding: 24, color: 'var(--text-400)', textAlign: 'center' }}>
          No sections authored yet.
        </div>
      </div>
    );
  }

  return (
    <div className="pj-stream">
      {workstreams.map(ws => {
        const info   = MODULE_LABELS[ws.module.toLowerCase()] ?? { label: ws.module.toUpperCase(), desc: '' };
        const status = statusFromPct(ws.completion_pct);
        return (
          <button key={ws.module} className="pj-stream-card" type="button"
                  onClick={() => onOpen?.(ws.module)}>
            <div className="head">
              <span className="lbl">{info.label}</span>
              <span className="pct">{ws.completion_pct}%</span>
            </div>
            <div className="meta">{info.desc} · {ws.approved} / {ws.total} sections</div>
            <div className="bar"><div className="fill" style={{ width: `${ws.completion_pct}%` }}/></div>
          </button>
        );
      })}
    </div>
  );
}
