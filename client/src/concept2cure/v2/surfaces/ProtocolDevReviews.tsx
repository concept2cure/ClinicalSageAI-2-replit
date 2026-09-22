/**
 * Protocol development — review assignments and informed consent.
 *
 * REVIEWS: `/api/protocol-reviews` has carried reviewers, comments,
 * resolutions and dispositions since C2C-17, and this pane read them and wrote
 * none of them — WI's audit put it plainly: "reviewers/comments are API-only".
 * A review that can only be requested through an API is not a review anyone on
 * the study can ask for. The pane now requests a review (reviewer, role, due
 * date) and records a reviewer's disposition, each through its own governed
 * drawer; the disposition route records a signature-grade action.
 *
 * CONSENT: the tab used to read `consent: []` — hard-coded in the assembler —
 * and print "0 of 0 required elements present, 0% complete" over whatever had
 * been authored. That is a number invented by the screen. The assembler now
 * returns the latest linked consent form and its elements, so the tab is wired
 * to them. It stays READ-ONLY here on purpose: consent elements are authored
 * against a consent form (`/api/protocol-consent`), which is a different
 * record with its own version and approval, and giving this tab a tick box
 * would be a second writer for it. With no linked form the tab says so and
 * prints no percentage — a completeness figure over zero elements is not 0 %,
 * it is nothing.
 */
import React from 'react';
import * as PG from './ProtocolGov';
import { PaneHead, type PaneAction } from './ProtocolDevShared';
import type { PdevFormKind, PdevFormTarget } from './ProtocolDevForms';

type Row = Record<string, unknown>;
const asRows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const str = (v: unknown): string => (v == null ? '' : String(v));

export interface ReviewPaneProps {
  doc: Record<string, unknown>;
  onEdit?: (kind: PdevFormKind, target?: PdevFormTarget) => void;
}

function ReviewerRow({ r, onEdit }: { r: Row; onEdit?: ReviewPaneProps['onEdit'] }) {
  const name = str(r.reviewer);
  const disposition = str(r.disposition);
  const due = str(r.dueDate);
  return (
    <div className="pde-review-row">
      <span className="pde-review-name">{name || 'Unnamed reviewer'}</span>
      <PG.StatusBadge status={str(r.status)} />
      <span className="pde-review-meta">
        {str(r.role) ? PG.labelize(str(r.role)) : 'No review role recorded'}
        {due ? ' · due ' + due : ' · no due date'}
        {disposition ? ' · ' + PG.labelize(disposition) : ' · no disposition recorded'}
      </span>
      {onEdit && (
        <span className="pde-review-act">
          {/* The visible label is short so the row stays one line; the
              accessible name carries the reviewer, and contains the visible
              text, so WCAG 2.5.3 (Label in Name) holds. */}
          <button
            type="button"
            className="pg-btn outline"
            aria-label={'Record disposition for ' + (name || 'this reviewer')}
            onClick={() => onEdit('review-disposition', {
              id: Number(r.id), label: name,
              defaults: disposition ? { disposition } : undefined,
            })}
          >
            <PG.Ic n="penLine" s={14} />Record disposition
          </button>
        </span>
      )}
    </div>
  );
}

export function ReviewsTab({ doc, onEdit }: ReviewPaneProps) {
  const reviews = asRows(doc.reviews);
  const allComments = reviews.flatMap((r) => asRows(r.comments));
  const blocking = allComments.filter((c) => c.sev === 'blocking' && !c.resolved).length;
  const actions: PaneAction[] | undefined = onEdit
    ? [{ label: 'Request a review', icon: 'plus', onAct: () => onEdit('review-request'), variant: 'outline' }]
    : undefined;

  return (
    <div className="pd-pane">
      <PaneHead
        title="Review & comments"
        sub={reviews.length + ' reviewers · ' + blocking + ' blocking open'}
        actions={actions}
      />
      {reviews.length === 0
        ? <div className="pde-note">No review has been requested for this protocol.</div>
        : <div className="pd-review-sum">{reviews.map((r) => <ReviewerRow key={str(r.id)} r={r} onEdit={onEdit} />)}</div>}
      {allComments.length ? (
        <div className="pd-comments">{allComments.map((c) => (
          <div key={str(c.id)} className="pd-comment" data-sev={str(c.sev)}>
            <div className="pd-comment-h">
              <span className="pg-badge" data-tone={PG.SEV_TONE[str(c.sev)]}>{PG.labelize(str(c.sev))}</span>
              <span className="pd-comment-sec">{str(c.sec)}</span>
              <span className="pd-comment-st">{c.resolved ? 'Resolved' : 'Open'}</span>
            </div>
            <div className="pd-comment-t">{str(c.text)}</div>
          </div>))}</div>
      ) : <div className="pg-empty">No review comments have been left on this protocol.</div>}
    </div>
  );
}

export function ConsentTab({ doc }: { doc: Record<string, unknown> }) {
  const consent = asRows(doc.consent);
  const form = (doc.consentForm ?? null) as Row | null;
  const required = consent.filter((c) => c.required !== false);
  const present = required.filter((c) => c.present).length;

  if (!form || consent.length === 0) {
    return (
      <div className="pd-pane">
        <PaneHead title="Informed consent" sub="Read from the linked consent form" />
        <div className="pde-note">
          {form
            ? <>The linked consent form <strong>{str(form.title)}</strong> has no elements recorded, so there is no checklist to report against.</>
            : <><strong>No consent form is linked to this protocol.</strong> Consent elements are authored on a consent form, which carries its own version and approval; until one is linked there is no completeness to report.</>}
        </div>
        <PG.Citation basis="45 CFR 46.116 — General requirements for informed consent" />
      </div>
    );
  }

  const pct = Math.round((present / required.length) * 100);
  return (
    <div className="pd-pane">
      <PaneHead
        title="Informed consent"
        sub={present + ' of ' + required.length + ' required elements present'}
      />
      <div className="pde-note">
        {str(form.title)} · version {str(form.version) || '—'} · {PG.labelize(str(form.status)) || 'no status'}
        {Number(form.formsLinked) > 1 ? ` · ${Number(form.formsLinked)} forms linked, the most recently updated is shown` : ''}
      </div>
      <div className="pd-consent-meter">
        <div className="pd-consent-bar"><div className="pd-consent-fill" style={{ width: pct + '%' }} /></div>
        <span className="pd-consent-pct">{pct + '% complete'}</span>
        <PG.Citation basis="45 CFR 46.116 — General requirements for informed consent" />
      </div>
      <ul className="pd-consent-list">{consent.map((c) => (
        <li key={str(c.id)} className={'pd-consent-row' + (c.present ? '' : ' missing')}>
          <span className="pd-consent-ck" data-on={Boolean(c.present)} aria-hidden="true">{c.present ? '✓' : ''}</span>
          <span>{str(c.el)}</span>
          <span className="sr-only">{c.present ? 'present' : 'not present'}</span>
        </li>))}</ul>
    </div>
  );
}
