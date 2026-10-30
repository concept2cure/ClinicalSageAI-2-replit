/**
 * Engineering's design history panel: the sections of the project's own
 * documents and where each stands (founder decision P-60, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/engineering-per-product/).
 *
 * GET /api/mdx/engineering/:programId reads them from c2c_document_sections
 * under the project's c2c_documents. The organization's one device kit
 * (cerv2_510k_sections) is not shown under a project: a company with several
 * products keeps a design history per product (21 CFR 820.30(j), ISO 13485
 * §7.3.10).
 *
 * What the panel can claim, and what it cannot. It lists the sections that
 * exist in this project's documents, their status and their document. It is
 * not an inspected design history file index: it does not list the design
 * plan, reviews, verification and validation records or transfer records a
 * DHF holds unless they were authored here as document sections, and a
 * section's "ready" means it was approved or locked, not that an inspector
 * found the file complete.
 *
 * Its own module because EngineeringSurface.tsx is at the file-length limit.
 *
 * @module client/src/concept2cure/mdx/surfaces/EngineeringDesignHistory
 */
import * as React from 'react';
import { DataGate } from '../components/DataGate';
import type { DataState } from '../lib/dataState';
import type { DhfRow } from '../data/engineering';

/** What the panel says it is, in every ready state. */
export const DESIGN_HISTORY_NOTE =
  "The sections of this project's own documents and where each stands. " +
  'This is not an inspected design history file index: it lists only what has been authored here as document sections, ' +
  'and a section is ready when it has been approved, not when the file has been found complete.';

const EMPTY_HINT = "This project's document sections appear here once its documents have sections.";

export interface EngineeringDesignHistoryProps {
  state: DataState<DhfRow[]>;
  /** The route reported the panel keyed to the project. */
  keyed: boolean;
  onRetry: () => void;
  /** The empty hint and note the screen shows for a panel not keyed to the project. */
  notKeyedEmptyHint: string;
  notKeyed: React.ReactNode;
}

/** The rows grouped by their document, in the order the route returned them. */
function byDocument(rows: DhfRow[]): Array<{ key: string; title: string; rows: DhfRow[] }> {
  const groups = new Map<string, { key: string; title: string; rows: DhfRow[] }>();
  for (const row of rows) {
    const key = row.documentId ?? '';
    if (!groups.has(key)) groups.set(key, { key, title: row.document ?? 'Document', rows: [] });
    groups.get(key)?.rows.push(row);
  }
  return [...groups.values()];
}

export function EngineeringDesignHistory({ state, keyed, onRetry, notKeyedEmptyHint, notKeyed }: EngineeringDesignHistoryProps) {
  return (
    <>
      <div className="section-head" style={{ marginTop: 0 }}>
        <h2 style={{ fontSize: 14 }}>Design history · this project&apos;s document sections</h2>
      </div>
      {/* Slice 0: rows are not shown until keyed to the project; the gate still
          shows loading, failure and empty. */}
      <DataGate state={state} label="document sections" onRetry={onRetry} dense emptyHint={keyed ? EMPTY_HINT : notKeyedEmptyHint}>
        {(rows) => !keyed ? notKeyed : (
          <div data-testid="eng-design-history">
            <p className="eng-trace-summary" data-testid="eng-design-history-note">{DESIGN_HISTORY_NOTE}</p>
            {byDocument(rows).map((group) => (
              <div key={group.key} data-testid="eng-design-history-document">
                <div className="eng-trace-summary mono tiny">
                  {group.title} · {group.rows.length} {group.rows.length === 1 ? 'section' : 'sections'}
                </div>
                <div className="eng-dhf-strip">
                  {group.rows.map((d) => (
                    <div key={d.id} className="eng-dhf-cell" data-status={d.status} title={`${d.label} · ${d.meta}`}>
                      <div className="eng-dhf-num mono">§{d.num}</div>
                      <div className="eng-dhf-label">{d.label}</div>
                      <div className="eng-dhf-meta">
                        <span className="mono">{d.ver}</span>
                        <span className="dot-sep" aria-hidden="true">·</span>
                        <span>{d.updated}</span>
                      </div>
                      <span className={`status-pill ${d.status}`}>{d.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </DataGate>
    </>
  );
}
