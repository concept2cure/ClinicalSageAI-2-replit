/**
 * A change's record, read in its own row of the change log (C9, split out of ChangeControl.tsx): what changes and why,
 * its risk, its impact assessment and its implementation plan, then the records it is linked to, as a plain list.
 *
 * Until 2026-11-10 the row opened onto its linked records alone, as bordered cards with type-coloured icons. The
 * assessment, the thing an approver signs, could be read nowhere in the log: not in the row, and not in the signature
 * dialog. The register read already returned it.
 *
 * @module client/src/concept2cure/quality/ChangeRecordDetail
 */
import * as React from 'react';
import { EmptyState } from '../v2/dataConnect';
import { LINK_TYPE_LABEL, RELATIONSHIP_LABEL, RISK_LABEL, type ChangeControl as ChangeControlRow } from './changeData';

const NOT_RECORDED = 'Not recorded yet.';

/** The record's fields as label and words. The row and the approval dialog read the same rows. */
export function changeRecordRows(c: ChangeControlRow): { label: string; value: string }[] {
  return [
    { label: 'Current state → proposed state', value: c.description?.trim() || NOT_RECORDED },
    { label: 'Reason for the change', value: c.reason?.trim() || NOT_RECORDED },
    { label: 'Risk', value: c.riskLevel ? RISK_LABEL[c.riskLevel] : NOT_RECORDED },
    { label: 'Impact assessment', value: c.impactAssessment?.trim() || NOT_RECORDED },
    { label: 'Implementation plan', value: c.implementationPlan?.trim() || NOT_RECORDED },
  ];
}

/** The record's fields as a definition list: the row's detail, and the approval dialog before the signature. */
export function ChangeRecordFacts({ change }: { change: ChangeControlRow }) {
  return (
    <dl className="qcc-facts">
      {changeRecordRows(change).map((r) => (
        <div key={r.label}>
          <dt>{r.label}</dt>
          <dd data-empty={r.value === NOT_RECORDED || undefined}>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ChangeRecordDetail({ change: c, onAsk }: { change: ChangeControlRow; onAsk: (q: string) => void }) {
  const links = c.links ?? [];
  return (
    <div className="qcc-detail">
      <ChangeRecordFacts change={c} />
      <h3 className="qcc-detail-title">Linked records</h3>
      {links.length === 0 ? (
        <EmptyState title="No linked records yet." hint="To keep the log traceable, link the deviation, CAPA or validation protocol this change touches (More, then Link a record)." />
      ) : (
        <ul className="qcc-links">
          {links.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                className="qcc-link"
                title="Ask AnA how this record relates to the change"
                onClick={() =>
                  onAsk(`Open ${LINK_TYPE_LABEL[l.linkType]} ${l.linkedRef}${l.linkedLabel ? ` (${l.linkedLabel})` : ''} and show how it relates to change ${c.changeNumber}.`)
                }
              >
                <span className="mono">{l.linkedRef}</span>
                {l.linkedLabel && <span className="qcc-link-label">{l.linkedLabel}</span>}
              </button>
              <span className="qcc-link-rel">{RELATIONSHIP_LABEL[l.relationship]}</span>
              <span className="qcc-link-type">{LINK_TYPE_LABEL[l.linkType]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
