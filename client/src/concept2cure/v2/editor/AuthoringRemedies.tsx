import React, { useId, useState } from 'react';
import type { AnaTurnRecordStatus } from '../../components/ana/useAnaChat.types';
import type { EditorBridge } from './DocumentWorkbench';
import { ANA_SUGGESTION_AUTHOR_ID, anaInsertRefusal } from './anaInsertGate';
import { parseRemedyAnswer, remedyRefusal, type AuthoringRemedy } from './authoringRemedies';

export interface RemedyTarget extends Pick<EditorBridge, 'propose' | 'editable' | 'sectionCode' | 'sectionLabels' | 'openSection'> {
  sectionId?: string;
  open?: boolean;
  reopen?: () => void;
  refusal?: string;
}

function targetRefusal(remedy: AuthoringRemedy, target?: RemedyTarget): string | null {
  if (!target) return 'Open this document in the editor to apply the fix.';
  if (target.refusal) return target.refusal;
  if (!target.editable) return 'This document is read-only or frozen.';
  if (target.sectionId && target.sectionId !== remedy.sectionId) return 'Open the section named by this fix before applying it.';
  return null;
}

function remedySectionLabel(remedy: AuthoringRemedy, target?: RemedyTarget): string | null {
  return target?.sectionLabels?.[remedy.sectionId] ?? (target?.sectionId === remedy.sectionId ? target.sectionCode : null);
}

function OpenRemedySection({ remedy, target }: { remedy: AuthoringRemedy; target?: RemedyTarget }) {
  const label = remedySectionLabel(remedy, target);
  if (!target?.sectionId || target.sectionId === remedy.sectionId || !label || !target.openSection) return null;
  return <button type="button" className="btn ghost" style={{ marginTop: 8, marginLeft: 6 }} onClick={() => {
    if (target.open === false) target.reopen?.();
    target.openSection?.(remedy.sectionId);
  }}>Open section {label}</button>;
}

const remedyApplyLabel = (applied: boolean, busy: boolean) => applied ? 'Added as tracked suggestion' : busy ? 'Applying…' : 'Apply as tracked suggestion';
function remedyStatus(applied: boolean, error: string | null, refusal: string | null): string {
  if (applied) return 'Review the change in the editor, then save with your reason for change. This fix has not been saved or approved.';
  return error ?? refusal ?? 'Adds a pending change for your review; nothing is saved or approved.';
}

function RemedyCard({ remedy, target, record, unfinished }: {
  remedy: AuthoringRemedy; target?: RemedyTarget; record?: AnaTurnRecordStatus; unfinished: boolean;
}) {
  const noteId = useId();
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sectionLabel = remedySectionLabel(remedy, target);
  const refusal = anaInsertRefusal(record, unfinished) ?? targetRefusal(remedy, target);
  const apply = async () => {
    if (!target || refusal || busy || applied) return;
    setBusy(true);
    setError(null);
    try {
      if (target.open === false) target.reopen?.();
      const result = await target.propose(remedy, {
        id: ANA_SUGGESTION_AUTHOR_ID, name: 'AnA (proposed fix)',
        ...(record?.status === 'recorded' ? { sourceRecord: record.id } : {}),
      }, record, unfinished);
      if (result.ok) setApplied(true);
      else setError(remedyRefusal(result));
    } catch {
      setError('The fix could not be applied. Your document has not been saved.');
    } finally { setBusy(false); }
  };
  return <article style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginTop: 8 }}>
    <strong>{sectionLabel ? `Proposed fix · ${sectionLabel}` : 'Proposed fix for another section'}</strong>
    <p style={{ margin: '8px 0' }}>{remedy.reason}</p>
    <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}><strong>Original: </strong><del>{remedy.quote}</del></div>
    <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginTop: 6 }}><strong>Replacement: </strong>{remedy.replacement || '(delete this passage)'}</div>
    <button type="button" className="btn ghost" onClick={() => void apply()} disabled={busy || applied || !!refusal} aria-describedby={noteId} style={{ marginTop: 8 }}>
      {remedyApplyLabel(applied, busy)}
    </button>
    <OpenRemedySection remedy={remedy} target={target} />
    <p id={noteId} role={error ? 'alert' : 'status'} style={{ margin: '6px 0 0', fontSize: 12 }}>
      {remedyStatus(applied, error, refusal)}
    </p>
  </article>;
}

/** Both hosts use this same offer and the same editor proposal door. */
export function AuthoringRemedies({ text, settled, record, unfinished, target }: {
  text: string; settled: boolean; record?: AnaTurnRecordStatus; unfinished: boolean; target?: RemedyTarget;
}) {
  if (!settled) return null;
  const parsed = parseRemedyAnswer(text);
  if (!parsed.hasRemedies) return null;
  return <section aria-label="AnA proposed fixes">
    {parsed.errors.map((error, i) => <p key={i} role="alert">{error}</p>)}
    {parsed.proposals.map((remedy, i) => <RemedyCard key={`${record?.status === 'recorded' ? record.id : ''}:${i}:${JSON.stringify(remedy)}`} remedy={remedy} target={target} record={record} unfinished={unfinished} />)}
  </section>;
}
