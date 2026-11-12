/**
 * A change's record, read in its own row of the change log (C9, split out of ChangeControl.tsx): what changes and why,
 * its risk, its impact assessment and its implementation plan, then the records it is linked to, as a plain list.
 *
 * Until 2026-11-10 the row opened onto its linked records alone, as bordered cards with type-coloured icons. The
 * assessment, the thing an approver signs, could be read nowhere in the log: not in the row, and not in the signature
 * dialog. The register read already returned it.
 *
 * P-122 (2026-11-12): a change filed under a device project also carries the device change determination, between
 * its assessment and its links: for the United States, new 510(k) or letter to file; for the European Union,
 * significant change or not. Two rule engines decide it and nothing reached them until now
 * (server/services/qms/change-regulatory-impact.ts). It is shown as the engine's determination, with the engine's
 * rationale. It does not classify the change. A change that is not a device's says so in one sentence, and only in
 * an organisation that has a device project.
 *
 * @module client/src/concept2cure/quality/ChangeRecordDetail
 */
import * as React from 'react';
import { DEVICE_CHANGE_MARKETS, type DeviceChangeMarket } from '@shared/regulatory/change-control-taxonomy';
import { EmptyState } from '../v2/dataConnect';
import {
  IMPACT_DECISION_LABEL, IMPACT_MARKET_LABEL, LINK_TYPE_LABEL, RELATIONSHIP_LABEL, RISK_LABEL, STATE_LABEL, formatDate,
  type ChangeControl as ChangeControlRow, type ChangeLink, type ImpactDetermination, type KeptDetermination, type RegulatoryImpact,
} from './changeData';

const NOT_RECORDED = 'Not recorded yet.';
const NOT_ASSESSED = 'Not assessed yet.';
const UNREADABLE = 'A determination is kept for this market and could not be read, so no verdict is shown. Assess again to replace it.';
const THE_DETERMINATION = 'The device determination (new 510(k) or letter to file; significant change in the EU)';

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

/** Which rules a determination was reached under, who ran it and when. */
const provenance = (d: ImpactDetermination) => `Rules ${d.ruleVersion}. Assessed by ${d.byName} on ${formatDate(d.at)}.`;

/** A kept determination in one line of words, for the approval. */
function determinationWords(kept: KeptDetermination): string {
  if (kept === null) return NOT_ASSESSED;
  if (kept === 'unreadable') return UNREADABLE;
  return `${IMPACT_DECISION_LABEL[kept.decision]}. ${kept.rationale} ${provenance(kept)}`;
}

/**
 * The device change determination as label and words, for a device project's change: the approval's content digest
 * covers it (change-approval-signature.ts), so the approver reads it among what the signature binds. Empty for a
 * change the determination does not apply to.
 */
export function changeImpactRows(c: ChangeControlRow): { label: string; value: string }[] {
  const impact = c.regulatoryImpact;
  if (!impact || impact.applies !== 'device') return [];
  return DEVICE_CHANGE_MARKETS.map((market) => ({
    label: `Regulatory impact, ${IMPACT_MARKET_LABEL[market]} (the rules engine's determination)`,
    value: determinationWords(impact[market]),
  }));
}

/** The record's fields as a definition list: the row's detail, and the approval dialog before the signature. */
export function ChangeRecordFacts({ change, withImpact }: { change: ChangeControlRow; withImpact?: boolean }) {
  const rows = withImpact ? [...changeRecordRows(change), ...changeImpactRows(change)] : changeRecordRows(change);
  return (
    <dl className="qcc-facts">
      {rows.map((r) => (
        <div key={r.label}>
          <dt>{r.label}</dt>
          <dd data-empty={r.value === NOT_RECORDED || r.value === NOT_ASSESSED || undefined}>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Why a change that is not a device's does not offer the determination, in one sentence. */
function notOfferedSentence(impact: RegulatoryImpact): string {
  if (impact.applies === 'no_project') {
    return `${THE_DETERMINATION} is offered on a change filed under a device project; this change is organisation-wide.`;
  }
  const medicinal = impact.productType === 'drug' || impact.productType === 'biologic';
  return `${THE_DETERMINATION} is not offered here: this change is filed under a ${medicinal ? `${impact.productType} project` : 'project that is not a device'}.`;
}

/** One market's determination: the verdict, the engine's rationale and triggers, and where it came from. */
function MarketDetermination({ market, kept }: { market: DeviceChangeMarket; kept: KeptDetermination }) {
  if (kept === null || kept === 'unreadable') {
    return (
      <div>
        <dt>{IMPACT_MARKET_LABEL[market]}</dt>
        <dd data-empty={kept === null || undefined} data-unread={kept === 'unreadable' || undefined}>{kept === null ? NOT_ASSESSED : UNREADABLE}</dd>
      </div>
    );
  }
  return (
    <div>
      <dt>{IMPACT_MARKET_LABEL[market]}</dt>
      <dd>
        <span className="qcc-impact-verdict">{IMPACT_DECISION_LABEL[kept.decision]}</span>
        <p className="qcc-impact-why">{kept.rationale}</p>
        {kept.triggers.length > 0 && (
          <ul className="qcc-impact-triggers">
            {kept.triggers.map((t) => <li key={t}>{t}</li>)}
          </ul>
        )}
        <p className="qcc-impact-meta">{provenance(kept)}</p>
      </dd>
    </div>
  );
}

/** The device change determination in the change's detail, or the one sentence that says why it is not offered. */
function ChangeRegulatoryImpact({ change: c, onAssess }: { change: ChangeControlRow; onAssess?: () => void }) {
  const impact = c.regulatoryImpact;
  const titleId = React.useId();
  if (!impact) return null;
  if (impact.applies !== 'device') {
    // Nobody looks for a device determination in an organisation with no device project: say nothing there.
    return impact.organisationHasDevices
      ? <p className="qcc-impact-note" data-testid="change-impact-not-offered">{notOfferedSentence(impact)}</p> : null;
  }
  const open = impact.us === null || impact.eu === null;
  return (
    <section className="qcc-impact" aria-labelledby={titleId}>
      <div className="qcc-detail-head">
        <h3 className="qcc-detail-title" id={titleId}>Regulatory impact</h3>
        {impact.assessable && onAssess && (
          <button type="button" className="btn ghost small" onClick={onAssess}
            title="Answer the rules engine's questions: new 510(k) or letter to file in the United States; significant change or not in the European Union">
            Assess the regulatory impact
          </button>
        )}
      </div>
      <dl className="qcc-facts" data-testid="change-impact">
        {DEVICE_CHANGE_MARKETS.map((market) => <MarketDetermination key={market} market={market} kept={impact[market]} />)}
      </dl>
      <p className="qcc-impact-note">
        The rules engine's determination from the answers recorded. It does not classify the change: its classification,
        assessment and approval are a person's.
        {!impact.assessable && open && ` This change is ${STATE_LABEL[c.status].toLowerCase()}, so its content is fixed: a determination can no longer be recorded on it.`}
      </p>
    </section>
  );
}

export function ChangeRecordDetail({ change: c, onAsk, onAssessImpact, onUnlink }: {
  change: ChangeControlRow; onAsk: (q: string) => void;
  /** Open the determination's form for this change (P-122). Offered only where the server says it applies. */
  onAssessImpact?: () => void;
  /** Remove a link, with its reason. Absent where the change takes no link change (closed, cancelled, rejected). */
  onUnlink?: (link: ChangeLink) => void;
}) {
  const links = c.links ?? [];
  return (
    <div className="qcc-detail">
      <ChangeRecordFacts change={c} />
      <ChangeRegulatoryImpact change={c} onAssess={onAssessImpact} />
      <h3 className="qcc-detail-title">Linked records</h3>
      {links.length === 0 ? (
        <EmptyState title={onUnlink ? 'No linked records yet.' : 'No linked records.'}
          hint={onUnlink ? 'To keep the log traceable, link the deviation, CAPA or validation protocol this change touches, with Link a record.' : undefined} />
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
              {onUnlink && (
                <button type="button" className="btn ghost small" aria-label={`Remove ${l.linkedRef} from ${c.changeNumber}`}
                  title="Remove this link, with a reason. It is kept on the record as removed." onClick={() => onUnlink(l)}>
                  Remove
                </button>
              )}
              {/* Why it was linked, as recorded with the link (required past proposal since 2026-11-10). */}
              {l.note && <span className="qcc-link-note">{l.note}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
