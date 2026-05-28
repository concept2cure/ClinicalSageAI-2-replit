// Biopharma pathway surface — generic table + stage strip used by IND, NDA, BLA, MAA, JNDA.
// Port of ui_kits/biopharma/surfaces.jsx BiopharmaPathway.

import * as React from 'react';
import { BioIcon } from '../icons';
import type { BiopharmaProgram } from '../data/programs';

const PATHWAY_META: Record<string, { kicker: string; agency: string }> = {
  ind:  { kicker: 'IND · 21 CFR §312',       agency: 'FDA' },
  nda:  { kicker: 'NDA · 505(b)',             agency: 'FDA' },
  bla:  { kicker: 'BLA · 351(a) biologics',  agency: 'FDA' },
  maa:  { kicker: 'MAA · EU centralized',    agency: 'EMA' },
  jnda: { kicker: 'JNDA · Japan',            agency: 'PMDA' },
};

interface PathwayProps {
  pathwayKey: string;
  programs:   BiopharmaProgram[];
  onAskAna:   (text: string) => void;
}

export function BiopharmaPathway({ pathwayKey, programs, onAskAna }: PathwayProps) {
  const meta  = PATHWAY_META[pathwayKey] ?? { kicker: pathwayKey.toUpperCase(), agency: 'Agency' };
  const items = programs.filter(p => p.program_type.toLowerCase() === pathwayKey);

  const stageMap: Record<string, number> = {
    'pre-ind': 0, 'ind': 1, 'phase-i': 2, 'phase-ii': 3, 'phase-iii': 4,
    'filing': 5, 'review': 6, 'approved': 7,
    'pre-submission': 0, 'submission': 5, 'in agency review': 6,
  };

  const byStage = [0,1,2,3,4,5,6,7].map(idx => ({
    idx,
    count: items.filter(p => (stageMap[(p.status ?? '').toLowerCase()] ?? 0) === idx).length,
  }));

  return (
    <div className="bp-surface">
      <div className="bp-page-head">
        <div>
          <div className="bp-kicker">{meta.kicker}</div>
          <h1 className="bp-title">{pathwayKey.toUpperCase()} programs</h1>
          <div className="bp-meta">{items.length} programs · {meta.agency}</div>
        </div>
        <div className="bp-page-actions">
          <button className="bp-btn-primary" type="button"
                  onClick={() => onAskAna(`Run ${pathwayKey.toUpperCase()} readiness diagnostic`)}>
            <BioIcon name="sparkles" /> Ask AnA
          </button>
        </div>
      </div>

      {/* Stage strip */}
      <div className="bp-stage-strip">
        {byStage.filter(s => s.count > 0).map(s => (
          <div key={s.idx} className="bp-stage-tile">
            <div className="bp-stage-count">{s.count}</div>
            <div className="bp-stage-lbl">Stage {s.idx}</div>
          </div>
        ))}
      </div>

      {/* Program list */}
      {items.length === 0 ? (
        <div className="bp-empty">
          No {pathwayKey.toUpperCase()} programs in your portfolio.
        </div>
      ) : (
        <div className="bp-card">
          <div className="bp-card-head"><span>{pathwayKey.toUpperCase()} programs</span></div>
          <table className="bp-table">
            <thead>
              <tr>
                <th>Program</th>
                <th>Indication</th>
                <th>Status</th>
                <th>Readiness</th>
                <th>PDUFA / target</th>
              </tr>
            </thead>
            <tbody>
              {items.map(p => (
                <tr key={p.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{p.code ?? p.name}</div>
                    <div className="bp-meta">{p.sponsor_name}</div>
                  </td>
                  <td>{p.lead_indication ?? '—'}</td>
                  <td>{p.status ?? '—'}</td>
                  <td>{p.completion_percentage ?? 0}%</td>
                  <td className="bp-meta">{p.pdufa_date ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Re-export named variants for convenience.
export const BiopharmaInd  = (props: Omit<PathwayProps, 'pathwayKey'>) => <BiopharmaPathway pathwayKey="ind"  {...props}/>;
export const BiopharmaNda  = (props: Omit<PathwayProps, 'pathwayKey'>) => <BiopharmaPathway pathwayKey="nda"  {...props}/>;
export const BiopharmaBla  = (props: Omit<PathwayProps, 'pathwayKey'>) => <BiopharmaPathway pathwayKey="bla"  {...props}/>;
export const BiopharmaMaa  = (props: Omit<PathwayProps, 'pathwayKey'>) => <BiopharmaPathway pathwayKey="maa"  {...props}/>;
export const BiopharmaJnda = (props: Omit<PathwayProps, 'pathwayKey'>) => <BiopharmaPathway pathwayKey="jnda" {...props}/>;
