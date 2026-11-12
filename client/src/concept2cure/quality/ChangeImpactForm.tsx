/**
 * ChangeImpactForm — "Assess the regulatory impact" on a change of a device project (P-122, 2026-11-12).
 *
 * The questions are the rule engines' own inputs, in plain words (shared/regulatory/change-control-taxonomy.ts
 * DEVICE_CHANGE_QUESTIONS): seven for the United States (new 510(k) or letter to file), five for the European Union
 * (significant change or not). Each is a yes or a no, and none is answered for the person: a question starts with
 * neither chosen, and the form does not send while one is unanswered. On a reassessment the recorded answer is shown
 * beside its question and the person answers again, with a reason.
 *
 * What is sent is the answers. The server runs the engine and keeps its verdict on the change
 * (POST /api/mdx/qms/changes/:id/regulatory-impact); nothing here computes one.
 *
 * Split out of ChangeControl.tsx, as ChangeLinkForm.tsx is.
 *
 * @module client/src/concept2cure/quality/ChangeImpactForm
 */
import * as React from 'react';
import { DEVICE_CHANGE_MARKETS, DEVICE_CHANGE_QUESTIONS, type DeviceChangeMarket } from '@shared/regulatory/change-control-taxonomy';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import { C2CForm, type C2CFormField } from '../v2/C2CForm';
import { IMPACT_MARKET_ASKS, IMPACT_MARKET_LABEL, type ChangeControl, type KeptDetermination } from './changeData';

const YES_NO = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];

export interface ChangeImpactAnswers {
  market: DeviceChangeMarket;
  /** Each question's answer; undefined for one the form holds no yes or no for, which the server refuses. */
  answers: Record<string, boolean | undefined>;
  reason?: string;
}

/** A form value as an answer: yes, no, or no answer. Never a default. */
const answerOf = (value: string | undefined): boolean | undefined => (value === 'yes' ? true : value === 'no' ? false : undefined);

/** The market the form opens on: the first still to assess, else the United States. */
const firstOpenMarket = (kept: Record<DeviceChangeMarket, KeptDetermination>): DeviceChangeMarket =>
  DEVICE_CHANGE_MARKETS.find((m) => kept[m] === null) ?? 'us';

/** What is recorded for a question, to read beside it on a reassessment. */
function recordedAnswer(kept: KeptDetermination, key: string): string | undefined {
  if (kept === null || kept === 'unreadable') return undefined;
  return `Recorded answer: ${kept.inputs[key] ? 'Yes' : 'No'}.`;
}

export function ChangeImpactForm({ change, refusal, onCancel, onSubmit }: {
  change: ChangeControl;
  /** The server's refusal of the last attempt, shown in the drawer. */
  refusal: string | null;
  onCancel: () => void;
  onSubmit: (v: ChangeImpactAnswers) => void;
}) {
  const kept = React.useMemo(() => ({ us: change.regulatoryImpact?.us ?? null, eu: change.regulatoryImpact?.eu ?? null }), [change.regulatoryImpact]);
  const [opensOn] = React.useState(() => firstOpenMarket(kept));
  const [market, setMarket] = React.useState<DeviceChangeMarket>(opensOn);
  const recorded = kept[market];
  const questions: C2CFormField[] = DEVICE_CHANGE_QUESTIONS[market].map((q) => ({
    key: q.key, label: q.question, type: 'seg', required: true, default: '', options: YES_NO, desc: recordedAnswer(recorded, q.key),
  }));
  const reasonField: C2CFormField[] = recorded === null ? [] : [{
    key: 'reason', label: 'Reason for assessing again', type: 'textarea', rows: 2, required: true,
    desc: `A determination is already recorded for the ${IMPACT_MARKET_LABEL[market]}. The audit trail keeps it with your reason. At least ${GOVERNED_REASON_MIN} characters.`,
  }];
  return (
    <C2CForm
      config={{
        eyebrow: 'Change control',
        title: `Assess the regulatory impact of ${change.changeNumber}`,
        sub: `${change.title}. A rules engine decides from your answers. It does not classify the change.`,
        governed: 'The determination is kept on the change with your answers and written to the audit trail under your name. From approval on, it is part of what the approval signed.',
        submitLabel: 'Run the assessment',
        ...(refusal ? { notice: refusal } : {}),
        fields: [
          {
            // What the chosen market's engine decides: it changes with the choice, so it is the live part.
            key: 'market', label: 'Assess for', type: 'seg', default: opensOn, descStatus: IMPACT_MARKET_ASKS[market],
            options: DEVICE_CHANGE_MARKETS.map((m) => ({ value: m, label: IMPACT_MARKET_LABEL[m] })),
          },
          ...questions,
          ...reasonField,
        ],
      }}
      onFieldChange={(key, value) => { if (key === 'market' && (value === 'us' || value === 'eu')) setMarket(value); }}
      onCancel={onCancel}
      onSubmit={(v) => onSubmit({
        market,
        answers: Object.fromEntries(DEVICE_CHANGE_QUESTIONS[market].map((q) => [q.key, answerOf(v[q.key])])),
        ...(recorded !== null && v.reason?.trim() ? { reason: v.reason.trim() } : {}),
      })}
    />
  );
}
