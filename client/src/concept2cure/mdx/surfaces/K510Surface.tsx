/**
 * 510(k) surface — 7-stage strip · predicate table · SE matrix · eSTAR list.
 * Ported from Surfaces.jsx > K510Surface.
 */

import * as React from 'react';
import { I } from '../icons';
import { K510_ESTAR, K510_PREDICATES, K510_SE_ROWS, K510_STAGES } from '../data/k510';
import type { Program } from '../data/programs';
import { useK510EstarSections, useK510Predicates, useK510SeMatrix } from '../hooks/useK510';
import { AskAnaChip } from './AskAnaChip';
import { AnaDraftBanner } from '../components/AnaDraftBanner';

export interface K510SurfaceProps {
  program: Program | null;
  onAskAna: (text: string) => void;
  onOpenEditor?: (sectionId: number) => void;
}

export function K510Surface({ program, onAskAna, onOpenEditor }: K510SurfaceProps) {
  const activeStageIdx = program ? program.stageIdx : 4;
  const programStatus = program ? program.status : 'active';
  const programId = program?.id ?? null;

  /* Live data — three independent fetches that fall back to the kit
     fixtures during load and on error. The eSTAR fetch hits a local DB
     endpoint; predicates + SE matrix proxy to the shadow service and
     can 502 in dev — when they do, the fixture renders so the surface
     remains usable. */
  const estar     = useK510EstarSections(programId);
  const predicates = useK510Predicates(programId);
  const seMatrix  = useK510SeMatrix(programId);

  const sourcePredicates = predicates.rows ?? K510_PREDICATES;
  const sourceSeRows     = seMatrix.rows  ?? K510_SE_ROWS;
  const sourceEstar      = estar.rows     ?? K510_ESTAR;
  const estarBlockerCount = estar.rows ? estar.blockerCount : K510_ESTAR.filter(s => s.blocker).length;
  const estarTotal = sourceEstar.length;

  const initialSelectedKey = sourcePredicates[0]?.k ?? '';
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set(initialSelectedKey ? [initialSelectedKey] : []));
  const [showSelectedOnly, setShowSelectedOnly] = React.useState(false);

  /* Re-seed selection when the live predicate set changes — switching
     program (or shadow coming online) should not leave a stale K-number
     selected from a different program. */
  React.useEffect(() => {
    if (!sourcePredicates.length) return;
    setSelected((prev) => {
      const survivors = new Set([...prev].filter((k) => sourcePredicates.some((p) => p.k === k)));
      if (survivors.size === 0) survivors.add(sourcePredicates[0].k);
      return survivors;
    });
  }, [sourcePredicates]);

  const toggle = (k: string) => {
    const n = new Set(selected);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    if (n.size === 0) n.add(k);
    setSelected(n);
  };

  const selectedList = sourcePredicates.filter(p => selected.has(p.k));
  const multi = selectedList.length > 1;
  const subjectName = program ? program.title : 'BX-204 CGM';

  return (
    <>
      <div className="section-hdr">
        <div>
          <div className="section-title">
            510(k) pathway · {program ? program.title : 'BX-204 Continuous Glucose Monitor'}
          </div>
          <div className="section-sub">
            Stage {activeStageIdx + 1} of 7 — {K510_STAGES[activeStageIdx]?.label} ·{' '}
            {program ? program.dueLabel : 'FDA filing · 41 days'}
          </div>
        </div>
        <button className="section-more" onClick={() => onOpenEditor && onOpenEditor(11)}>
          Open §11 in editor {I.arrowRight}
        </button>
        <button
          className="section-more"
          style={{ marginLeft: 8 }}
          onClick={() =>
            onAskAna(
              `Export the eSTAR package for ${program?.code ?? 'this project'} ready for FDA filing — ` +
                `Module 6 PDF + Form FDA 3514, packaged as a ZIP with the required attachments.`,
            )
          }
        >
          Export eSTAR {I.download}
        </button>
      </div>

      <div className="stage-strip">
        {K510_STAGES.map((s, i) => {
          const stateClass =
            i < activeStageIdx
              ? 'complete'
              : i === activeStageIdx
              ? programStatus === 'blocked'
                ? 'blocked'
                : 'active'
              : 'idle';
          return (
            <div key={s.id} className={`stage-node ${stateClass}`}>
              <div className="stage-dot">{i < activeStageIdx ? I.check : i + 1}</div>
              <div className="stage-label">{s.label}</div>
              <div className="stage-meta">{s.meta}</div>
            </div>
          );
        })}
      </div>

      {/* Predicate intelligence is provisioned by a shadow service. When
          the live fetch errors (typical: shadow service not configured in
          this environment) we surface an explicit banner instead of
          silently rendering the kit fixture's example K-numbers — paying
          clients should not see another vendor's predicates as if they
          were their own. */}
      {predicates.error && !predicates.rows && (
        <div
          className="banner-warn"
          style={{
            margin: '12px 0',
            padding: '10px 14px',
            background: 'var(--bg-050)',
            border: '1px solid var(--border-100)',
            borderLeft: '3px solid var(--accent-100)',
            borderRadius: 6,
            fontSize: 12,
            color: 'var(--text-200)',
            display: 'flex',
            gap: 8,
            alignItems: 'center',
          }}
          role="status"
        >
          <span style={{ color: 'var(--accent-100)' }}>{I.alertCircle}</span>
          <span>
            Predicate intelligence is configuring for your tenant. The table below shows the canonical
            example data so you can preview the workflow; live K-number candidates appear here once the
            shadow service is reachable.
          </span>
        </div>
      )}

      <div className="col2">
        <div>
          <div className="panel">
            <div className="panel-hdr">
              <div>
                <div className="t">Predicate search · K-numbers</div>
                <div className="s">
                  {selected.size} of {sourcePredicates.length} selected · ranked by similarity · check 2+ for side-by-side
                  {predicates.rows === null && !predicates.error && (
                    <span style={{ marginLeft: 6, color: 'var(--text-400)' }}>· loading…</span>
                  )}
                </div>
              </div>
              <div className="actions">
                <button
                  className={`tb-btn${showSelectedOnly ? ' active' : ''}`}
                  title={showSelectedOnly ? 'Show all candidates' : 'Show selected only'}
                  onClick={() => setShowSelectedOnly(s => !s)}
                >
                  {I.filter}
                </button>
                <button
                  className="tb-btn"
                  title="Refine query with AnA"
                  onClick={() =>
                    onAskAna(
                      `Refine the predicate search for ${subjectName}. ` +
                        `Currently ${selected.size} of ${sourcePredicates.length} candidates selected — ` +
                        `suggest tighter filters and any K-numbers I might be missing.`,
                    )
                  }
                >
                  {I.sparkles}
                </button>
              </div>
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th className="cb"></th>
                  <th>K-number</th>
                  <th>Device</th>
                  <th>Cleared</th>
                  <th>Match</th>
                  <th>Diffs</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sourcePredicates.filter(p => !showSelectedOnly || selected.has(p.k)).map(p => {
                  const isSel = selected.has(p.k);
                  return (
                    <tr key={p.k} className={isSel ? 'multi-selected' : ''} onClick={() => toggle(p.k)}>
                      <td
                        className="cb"
                        onClick={e => {
                          e.stopPropagation();
                          toggle(p.k);
                        }}
                      >
                        <span className="cbox" data-on={isSel}>
                          {I.check}
                        </span>
                      </td>
                      <td>
                        <span className="k-num">{p.k}</span>
                      </td>
                      <td>
                        <div className="k-name">{p.name}</div>
                        <div className="k-holder">{p.holder}</div>
                      </td>
                      <td className="k-date">{p.cleared}</td>
                      <td>
                        <div className="match-cell">
                          <div className="match-bar">
                            <div
                              className={`match-bar-fill ${p.match >= 80 ? '' : p.match >= 60 ? 'warn' : 'err'}`}
                              style={{ width: `${p.match}%` }}
                            />
                          </div>
                          <span className="match-pct">{p.match}%</span>
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-300)', fontVariantNumeric: 'tabular-nums' }}>
                        {p.diffs}
                      </td>
                      <td>
                        <span className={`status-pill ${p.status}`}>{p.status}</span>
                        {onAskAna && (
                          <AskAnaChip
                            onAsk={() => onAskAna(`Compare predicate ${p.k} (${p.name}) against subject device`)}
                            label={`Ask AnA about ${p.k}`}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="panel">
            <div className="panel-hdr">
              <div>
                <div className="t">Substantial equivalence matrix</div>
                <div className="s">
                  {subjectName} vs. {multi ? `${selectedList.length} predicates` : selectedList[0]?.name}
                </div>
              </div>
              <div className="actions">
                <button
                  className="tb-btn"
                  title="Export SE matrix as CSV"
                  onClick={() => {
                    const headers = multi
                      ? ['Attribute', 'Subject', ...selectedList.map(p => p.k)]
                      : ['Attribute', 'Subject', 'Verdict', 'Predicate', 'Note'];
                    const rows = sourceSeRows.map(r =>
                      multi
                        ? [r.attr, r.subject, ...selectedList.map(() => r.predicate)]
                        : [r.attr, r.subject, r.verdict, r.predicate, r.note ?? ''],
                    );
                    const csv = [headers, ...rows]
                      .map(line => line.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
                      .join('\r\n');
                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${(program?.code ?? 'project').toLowerCase()}-se-matrix.csv`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                  }}
                >
                  {I.download}
                </button>
              </div>
            </div>
            {multi ? (
              <>
                <div
                  className="se-matrix-multi header"
                  style={{
                    gridTemplateColumns: `160px 1fr ${selectedList.map(() => '1fr').join(' ')}`,
                  }}
                >
                  <div>Attribute</div>
                  <div className="col-subject">{subjectName}</div>
                  {selectedList.map(p => (
                    <div key={p.k} className="col-predicate">
                      {p.k}
                    </div>
                  ))}
                </div>
                {sourceSeRows.map((r, i) => (
                  <div
                    key={i}
                    className="se-matrix-multi"
                    style={{
                      gridTemplateColumns: `160px 1fr ${selectedList.map(() => '1fr').join(' ')}`,
                    }}
                  >
                    <div className="se-attr">{r.attr}</div>
                    <div className="se-val">{r.subject}</div>
                    {selectedList.map(p => (
                      <div key={p.k} className="se-val" style={{ color: 'var(--text-300)' }}>
                        {r.predicate}
                      </div>
                    ))}
                  </div>
                ))}
              </>
            ) : (
              <>
                <div className="se-row header">
                  <div>Attribute</div>
                  <div>{subjectName} (Subject)</div>
                  <div style={{ textAlign: 'center' }}>Verdict</div>
                  <div>{selectedList[0]?.k} (Predicate)</div>
                </div>
                {sourceSeRows.map((r, i) => (
                  <div key={i} className="se-row">
                    <div className="se-attr">{r.attr}</div>
                    <div className="se-val">{r.subject}</div>
                    <div className={`se-verdict ${r.verdict}`}>
                      {r.verdict === 'same' && I.check}
                      {r.verdict === 'equivalent' && I.eq}
                      {r.verdict === 'different' && I.minus}
                    </div>
                    <div className="se-val">{r.predicate}</div>
                    {r.note && <div className="se-note">{r.note}</div>}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        <div>
          <div className="panel">
            <div className="panel-hdr">
              <div>
                <div className="t">eSTAR sections</div>
                <div className="s">{estarTotal} sections · {estarBlockerCount} blocker{estarBlockerCount === 1 ? '' : 's'}</div>
              </div>
              <div className="actions">
                <button
                  className="tb-btn"
                  title="Run pre-flight validation"
                  onClick={() =>
                    onAskAna(
                      `Run pre-flight RTA validation on the 510(k) eSTAR module for ${program?.code ?? 'this project'}. ` +
                        `Report blockers, missing required fields, and the overall judgment.`,
                    )
                  }
                >
                  {I.play}
                </button>
              </div>
            </div>
            <div className="estar">
              {sourceEstar.map(s => (
                <React.Fragment key={s.id}>
                  <button
                    className={`estar-row ${s.blocker ? 'blocker' : ''}`}
                    onClick={() => onOpenEditor && onOpenEditor(s.id)}
                    title={`Open ${s.label} in editor`}
                  >
                    <div className="estar-num">§{String(s.id).padStart(2, '0')}</div>
                    <div className="estar-label">{s.label}</div>
                    <span className={`status-pill ${s.status}`}>{s.status}</span>
                    <span className="estar-open">{I.arrowRight}</span>
                  </button>
                  {/* Surface AnA's pending draft so the user can accept or
                      open the editor to refine. The banner reads the live
                      draft provenance from the hook and disappears after
                      a successful accept (estar.refresh re-fetches). */}
                  {s.draft ? (
                    <AnaDraftBanner
                      draft={s.draft}
                      onRefine={() => onOpenEditor && onOpenEditor(s.id)}
                      onAccepted={estar.refresh}
                    />
                  ) : null}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
