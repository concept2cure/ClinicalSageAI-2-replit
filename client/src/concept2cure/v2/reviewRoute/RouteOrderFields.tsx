/**
 * The order of a route's reviews and their due dates, in both route forms
 * (RR2 of docs/design/REVIEW_ROUTING_2026-10-23.md §2.6, §3; the Vault's
 * v2/surfaces/VaultReviewRoute.tsx and the register's quality/QmsReviewRoute.tsx):
 *
 *   - with two or more reviewers, the sender chooses "At the same time" or
 *     "One after another";
 *   - one after another, the reviewers are an ordered list, one per line. Each
 *     is moved earlier or later by a button (a 44 px target, so it works at a
 *     phone's width, where drag does not), and each step has its own due date,
 *     on or after the one before;
 *   - at the same time, one date for the reviews.
 *
 * What Send waits for, and what it sends, is routeShape.ts's.
 */
import React from 'react';
import { DueDateField } from '../editor/reviewFields';
import { effectiveOrder, moveReviewer, type RouteShapeInput } from './routeShape';

export function RouteOrderFields({ idPrefix, f, nameOf, set, today }: {
  /** The form's id and test-id stem ("vr", "qms"). */
  idPrefix: string;
  f: RouteShapeInput;
  nameOf: (id: string) => string;
  set: (patch: Partial<RouteShapeInput>) => void;
  /** The earliest date offered (YYYY-MM-DD). */
  today: string;
}) {
  if (f.reviewers.length === 0) return null;
  const order = effectiveOrder(f);
  const move = (i: number, delta: -1 | 1) => set({ reviewers: moveReviewer(f.reviewers, i, delta) });
  return (
    <>
      {f.reviewers.length >= 2 ? (
        <fieldset className="de-field" data-testid={`${idPrefix}-order`}>
          <legend className="de-label">Order of the reviews</legend>
          <label className="rf-opt">
            <input type="radio" name={`${idPrefix}-order`} checked={order === 'parallel'} onChange={() => set({ order: 'parallel' })} data-testid={`${idPrefix}-order-parallel`} />
            <span>At the same time: every reviewer is asked now</span>
          </label>
          <label className="rf-opt">
            <input type="radio" name={`${idPrefix}-order`} checked={order === 'sequential'} onChange={() => set({ order: 'sequential' })} data-testid={`${idPrefix}-order-sequential`} />
            <span>One after another: each reviewer is asked once the one before has signed</span>
          </label>
        </fieldset>
      ) : null}
      {order === 'sequential' ? (
        <ol className="vr-steps" data-testid={`${idPrefix}-steps`} aria-label="Reviewers, in the order they review">
          {f.reviewers.map((id, i) => {
            const name = nameOf(id);
            return (
              <li key={id} className="vr-step">
                <span className="vr-step-name">{`Step ${i + 1} · ${name}`}</span>
                <span className="vr-step-acts">
                  <button type="button" className="sp-ask vr-move" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${name} earlier`}>Earlier</button>
                  <button type="button" className="sp-ask vr-move" disabled={i === f.reviewers.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${name} later`}>Later</button>
                </span>
                <DueDateField id={`${idPrefix}-step-due-${i}`} label={`Step ${i + 1} due`} value={f.stepDue[i] ?? ''}
                  onChange={(v) => { const next = f.reviewers.map((_, j) => f.stepDue[j] ?? ''); next[i] = v; set({ stepDue: next }); }}
                  required min={(i > 0 && f.stepDue[i - 1]) || today} testId={`${idPrefix}-step-due-${i}`} />
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="vr-due">
          <DueDateField id={`${idPrefix}-review-due`} label="Reviews due" value={f.reviewDue} onChange={(v) => set({ reviewDue: v })}
            required min={today} testId={`${idPrefix}-review-due`} />
        </div>
      )}
    </>
  );
}
