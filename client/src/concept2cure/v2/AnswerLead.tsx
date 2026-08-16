/**
 * AnswerLead — the app-wide "human lead" pattern (kit app/answer-lead.jsx).
 *
 * Every surface OPENS by speaking to the person's real question in plain
 * language: the honest answer, reassurance, ONE clear next step — before any
 * table, chart, or metric (answer-first, never a dashboard). Styles: .al-*
 * in styles/app-v2.css.
 */
import React from 'react';
import { I } from './icons';

export interface AnswerLeadAction {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  alt?: { label: string; onClick: () => void };
}

export interface AnswerLeadProps {
  eyebrow?: string;
  headline?: React.ReactNode;
  body?: React.ReactNode;
  reassure?: React.ReactNode;
  action?: AnswerLeadAction;
  secondary?: React.ReactNode;
  tone?: 'calm' | 'urgent' | 'good';
  children?: React.ReactNode;
}

export function AnswerLead({
  eyebrow,
  headline,
  body,
  reassure,
  action,
  secondary,
  tone = 'calm',
  children,
}: AnswerLeadProps) {
  return (
    <div className={`al-lead al-${tone}`}>
      {eyebrow && (
        <div className="al-k">
          {tone === 'urgent' ? I.clock : tone === 'good' ? I.check : I.sparkles} {eyebrow}
        </div>
      )}
      {headline && <div className="al-h">{headline}</div>}
      {body && <div className="al-b">{body}</div>}
      {reassure && (
        <div className="al-re">
          {I.shieldCheck} {reassure}
        </div>
      )}
      {children}
      {(action || secondary) && (
        <div className="al-act">
          {action && (
            <button type="button" className="al-btn" onClick={action.onClick}>
              {action.icon ?? I.sparkles} {action.label}
            </button>
          )}
          {action?.alt && (
            <button type="button" className="al-btn2" onClick={action.alt.onClick}>
              {action.alt.label}
            </button>
          )}
          {secondary && <span className="al-note">{secondary}</span>}
        </div>
      )}
    </div>
  );
}

/**
 * The lead to render when the read behind it has not produced an answer yet.
 *
 * ── The defect this exists to make unrepresentable ───────────────────────────
 * An AnswerLead speaks the surface's headline conclusion, and every one of them
 * was written as a two-branch conditional over `rows.length`:
 *
 *     plans.length === 0 ? <"No pediatric plans are on file"> : <the narrative>
 *
 * `rows` is empty in THREE situations — the request is in flight, the request
 * FAILED, or it succeeded and there is genuinely nothing — and only the third
 * may say "nothing is on file". So on a failed load the most prominent sentence
 * on the surface stated, with confidence, a fact about the organization's
 * regulatory record that nobody had established. The table below it said
 * "couldn't load" at the same moment, because tables were given `loading` and
 * `error` and leads were given `rows`.
 *
 * Returning `null` when the state HAS an answer is what lets a caller keep its
 * existing two-branch shape and add this in front, rather than restructuring
 * the conditional and getting it subtly wrong four times.
 *
 * There is no `action` and no `reassure` on either branch by design: offering a
 * next step over an unread record invites work on a premise that may not hold,
 * and reassurance is the one thing an absent answer can never justify.
 */
export function UnresolvedLead({
  state,
  eyebrow,
  subject,
}: {
  state: 'loading' | 'unreadable' | string;
  eyebrow?: string;
  /** Plural noun phrase for what is being read, e.g. "pediatric plans". */
  subject: string;
}) {
  if (state !== 'loading' && state !== 'unreadable') return null;
  return (
    <AnswerLead
      tone="calm"
      eyebrow={eyebrow}
      headline={
        state === 'loading'
          ? <>Reading the {subject} on file for this organization…</>
          : <>The {subject} could not be read.</>
      }
      body={
        state === 'loading'
          ? <>Nothing is claimed about them until the record answers.</>
          : <>This is a failed read, not an empty one — no claim is made here about what is or is not on file. The detail is reported below.</>
      }
    />
  );
}

export default AnswerLead;
