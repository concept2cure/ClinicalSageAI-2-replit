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

export default AnswerLead;
