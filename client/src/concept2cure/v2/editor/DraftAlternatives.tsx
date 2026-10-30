/**
 * The alternatives, their comparison and the choice by paragraph, inside the one AnA review
 * panel (surfaces/AuthoringAiDraft.tsx; docs/design/CSR_DRAFT_HUMAN_CONTROL_2026-10-29.md,
 * slice 1). Reading, switching and comparing change nothing. Adding chosen paragraphs proposes
 * tracked changes through the workbench's own door; nothing is saved, accepted or approved here.
 */
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { RedlineText } from '../RedlineText';
import { renderSafeMarkdown } from '../../components/ana/renderSafeMarkdown';
import { AuthoredHtml } from './AuthoredHtml';
import { anaInsertRefusal } from './anaInsertGate';
import type { AiDraftReviewState, PendingAiDraft } from './authoringDraftTransport';
import type { EditorProposalReceipt } from './editorProposalReceipt';
import {
  approachOf, defaultPairing, draftParagraphAuthor, draftParagraphs, paragraphProposals, paragraphRefusal,
  savedParagraphs, shapeLine, type DraftProposalTarget, type ParagraphPlan,
} from './draftAlternatives';
import '../styles/redline.css';

const NOTE: React.CSSProperties = { margin: 0, fontSize: 12 };
const QUIET: React.CSSProperties = { fontSize: 11, color: 'var(--text-300)' };

/** The alternatives as a radio group: native arrow keys, one shown at a time. */
export function AlternativesPicker({ state, accepting, onShow }: {
  state: AiDraftReviewState; accepting: boolean; onShow: (index: number) => void;
}) {
  const disabled = accepting || !!state.acceptUnknown;
  const headingId = useId();
  const name = useId();
  const groupRef = useRef<HTMLDivElement | null>(null);
  /* The control the person pressed leaves the panel when the first alternative arrives. Focus that
     fell to the page goes to the alternative shown; focus anywhere else is the person's and stays. */
  useEffect(() => {
    if (typeof document === 'undefined' || (document.activeElement && document.activeElement !== document.body)) return;
    groupRef.current?.querySelector<HTMLInputElement>('input[type="radio"]:checked')?.focus();
  }, []);
  const list = state.alternatives ?? [];
  const pending = state.pendingApproaches ?? [];
  const total = list.length + pending.length;
  const last = list[list.length - 1];
  if (!total) return null;
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div id={headingId} style={{ fontSize: 12, fontWeight: 600 }}>Alternatives</div>
      <div ref={groupRef} role="radiogroup" aria-labelledby={headingId} style={{ display: 'grid', gap: 4 }}>
        {list.map((alt, i) => {
          const { label, asked } = approachOf(alt.approach);
          const descId = `${name}-d${i}`;
          return (
            <div key={`${alt.approach}-${i}`} style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'baseline' }}>
                <input type="radio" name={name} checked={(state.shownAlternative ?? 0) === i} disabled={disabled}
                  aria-describedby={descId} onChange={() => onShow(i)} />
                {label}
              </label>
              <span id={descId} style={QUIET}>{`${asked} · ${shapeLine(alt.draft.generated)}`}</span>
            </div>
          );
        })}
        {pending.map(approach => {
          const { label, asked } = approachOf(approach);
          return (
            <div key={`pending-${approach}`} style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'baseline' }}>
                <input type="radio" name={name} checked={false} disabled onChange={() => undefined} />
                {label}
              </label>
              <span style={QUIET}>{`${asked} · drafting…`}</span>
            </div>
          );
        })}
      </div>
      <div role="status" data-testid="ai-draft-alternatives-status" style={QUIET}>
        {last ? `${approachOf(last.approach).label} alternative is ready (${list.length} of ${total}).` : ''}
      </div>
    </div>
  );
}

/** The comparison and the choice by paragraph, for the draft shown. */
export function AlternativeReview(props: { state: AiDraftReviewState; draft: PendingAiDraft; label: string; edited: boolean;
  savedContent: string; savedUpdatedAt: string | null; target?: DraftProposalTarget; busy: boolean; docSealed: boolean }) {
  const held = props.busy || props.docSealed || !!props.state.acceptUnknown;
  return (
    <>
      <AlternativeCompare state={props.state} savedContent={props.savedContent} />
      <ParagraphChoice draft={props.draft} label={props.label} edited={props.edited} savedContent={props.savedContent}
        savedUpdatedAt={props.savedUpdatedAt} target={props.target} busy={held} />
    </>
  );
}

/** The shown alternative against the saved section or another alternative, as a redline. */
export function AlternativeCompare({ state, savedContent }: { state: AiDraftReviewState; savedContent: string }) {
  const selectId = useId();
  const [against, setAgainst] = useState('none');
  const shown = state.shownAlternative ?? 0;
  const others = (state.alternatives ?? []).map((alt, i) => ({ alt, i })).filter(({ i }) => i !== shown);
  const other = against === 'saved' ? savedContent
    : against.startsWith('alternative:') ? state.alternatives?.[Number(against.slice(12))]?.body ?? null : null;
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', fontSize: 12 }}>
        <label htmlFor={selectId}>Compare with</label>
        <select id={selectId} value={against} onChange={e => setAgainst(e.target.value)} style={{ height: 28 }}>
          <option value="none">Nothing</option>
          <option value="saved">The saved section</option>
          {others.map(({ alt, i }) => <option key={i} value={`alternative:${i}`}>{`${approachOf(alt.approach).label} alternative`}</option>)}
        </select>
      </div>
      {other !== null && (
        <div data-testid="ai-draft-compare" className="ed-provline">
          <RedlineText previous={other} current={renderSafeMarkdown(state.body)} label="Changes from the compared text to the alternative shown"
            identicalNote="The two read identically." />
        </div>
      )}
    </div>
  );
}

function useProposalStates(receipts: readonly EditorProposalReceipt[], target?: DraftProposalTarget) {
  const [, refresh] = useState(0);
  const subscribe = target?.subscribeProposalChanges;
  useEffect(() => {
    const unsubscribe = subscribe?.(() => refresh(n => n + 1));
    refresh(n => n + 1);
    return unsubscribe;
  }, [subscribe]);
  return receipts.map(receipt => target?.getProposalState(receipt) ?? 'unavailable');
}

interface Landed { plan: ParagraphPlan; receipt: EditorProposalReceipt | null }

const STANDARD_NOTE = 'Each chosen paragraph is added to the editor as AnA’s tracked change, for you to accept, reject or edit there before you save. '
  + 'Paragraphs added this way carry no source citations; accepting the whole alternative records them.';

function paragraphNote(draft: PendingAiDraft, target: DraftProposalTarget | undefined): string {
  if (!target) return 'Open this section in the document editor to add chosen paragraphs.';
  return anaInsertRefusal(draft.turnRecord, false) ?? STANDARD_NOTE;
}

/** One paragraph of the alternative: its choice, its pair and its redline against that pair. */
function ParagraphRow({ index, text, current, pair, chosen, disabled, onChoose, onPair }: {
  index: number; text: string; current: readonly string[]; pair: number; chosen: boolean; disabled: boolean;
  onChoose: (value: boolean) => void; onPair: (value: number) => void;
}) {
  const selectId = useId();
  const html = useMemo(() => renderSafeMarkdown(text), [text]);
  return (
    <div className="authoring-remedy" style={{ marginTop: 0 }}>
      <label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'baseline' }}>
        <input type="checkbox" checked={chosen} disabled={disabled} onChange={e => onChoose(e.target.checked)} />
        {`Use paragraph ${index + 1}`}
      </label>
      <AuthoredHtml html={html} />
      {current.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', fontSize: 12 }}>
            <label htmlFor={selectId}>{`Paragraph ${index + 1} replaces`}</label>
            <select id={selectId} value={String(pair)} disabled={disabled} onChange={e => onPair(Number(e.target.value))} style={{ height: 28, maxWidth: '100%' }}>
              {current.map((c, j) => <option key={j} value={String(j)}>{`Current paragraph ${j + 1}: “${c.length > 60 ? `${c.slice(0, 60)}…` : c}”`}</option>)}
            </select>
          </div>
          <RedlineText previous={current[pair] ?? ''} current={html} label={`Changes paragraph ${index + 1} makes to current paragraph ${pair + 1}`}
            identicalNote="Reads the same as the current paragraph." />
        </>
      )}
    </div>
  );
}

/**
 * The paragraphs of the alternative shown, as AnA drafted them, each with a choice. They are
 * proposed as drafted so the save can verify AnA's words against the alternative's record; an
 * edit made in the box above applies only to accepting the whole alternative.
 */
export function ParagraphChoice({ draft, label, edited, savedContent, savedUpdatedAt, target, busy }: {
  draft: PendingAiDraft; label: string; edited: boolean; savedContent: string; savedUpdatedAt: string | null;
  target?: DraftProposalTarget; busy: boolean;
}) {
  const paragraphs = useMemo(() => draftParagraphs(draft.generated), [draft.generated]);
  const current = useMemo(() => savedParagraphs(savedContent), [savedContent]);
  const [chosen, setChosen] = useState<number[]>([]);
  const [pairing, setPairing] = useState<number[]>(() => defaultPairing(paragraphs, current));
  const [landed, setLanded] = useState<Landed[]>([]);
  const [refusals, setRefusals] = useState<string[]>([]);
  const [proposing, setProposing] = useState(false);
  useEffect(() => { setChosen([]); setLanded([]); setRefusals([]); setPairing(defaultPairing(paragraphs, current)); }, [paragraphs, current]);
  const receipts = landed.flatMap(l => (l.receipt ? [l.receipt] : []));
  const states = useProposalStates(receipts, target);
  const pendingCount = states.filter(s => s === 'pending').length;
  const noteId = useId();
  const note = paragraphNote(draft, target);
  const refused = note !== STANDARD_NOTE;
  const n = chosen.length;
  const add = async () => {
    if (!target || refused || !n || proposing) return;
    setProposing(true);
    setRefusals([]);
    try {
      const { plans, unchanged } = paragraphProposals({ sectionId: draft.sectionId, baseUpdatedAt: savedUpdatedAt, draft: paragraphs, chosen, current, pairing });
      const done: Landed[] = [];
      const notes = unchanged.map(i => `Paragraph ${i + 1} already reads the same as the current paragraph it is paired with, so it was not added.`);
      for (const plan of plans) {
        const result = await target.propose(plan.proposal, draftParagraphAuthor(draft.turnRecord), draft.turnRecord, false);
        if (result.ok) done.push({ plan, receipt: result.receipt ?? null });
        else notes.push(paragraphRefusal(result, plan));
      }
      setLanded(prev => [...prev, ...done]);
      setRefusals(notes);
      setChosen([]);
    } finally { setProposing(false); }
  };
  const landedCount = landed.reduce((sum, l) => sum + l.plan.paragraphs.length, 0);
  return (
    <fieldset style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 8, display: 'grid', gap: 8, margin: 0 }}>
      <legend style={{ fontSize: 12, fontWeight: 600 }}>{`Paragraphs of the ${label.toLowerCase()} alternative`}</legend>
      <p id={noteId} role="note" data-testid="ai-draft-paragraph-note" style={NOTE}>{note}</p>
      {edited && <p style={QUIET}>Paragraphs are offered as AnA drafted them. Edit a chosen paragraph in the editor after it is added; your words there are recorded as yours.</p>}
      {paragraphs.map((text, i) => (
        <ParagraphRow key={i} index={i} text={text} current={current} pair={pairing[i] ?? 0} chosen={chosen.includes(i)}
          disabled={busy || proposing}
          onChoose={value => setChosen(prev => (value ? [...prev, i] : prev.filter(x => x !== i)))}
          onPair={value => setPairing(prev => prev.map((p, k) => (k === i ? value : p)))} />
      ))}
      <div>
        <button type="button" className="btn ghost" style={{ height: 30 }} onClick={() => void add()}
          disabled={busy || proposing || refused || !target || n === 0} aria-describedby={noteId}
          title={n === 0 ? 'Choose at least one paragraph above.' : undefined}>
          {n === 0 ? 'Add chosen paragraphs as tracked changes' : `Add ${n} chosen paragraph${n === 1 ? '' : 's'} as tracked changes`}
        </button>
      </div>
      <p role="status" style={NOTE}>
        {landedCount > 0
          ? `${landedCount === 1 ? '1 paragraph is in the editor as a tracked change' : `${landedCount} paragraphs are in the editor as tracked changes`}. `
            + `${pendingCount === receipts.length ? `Review ${landedCount === 1 ? 'it' : 'them'} there, then save with your reason for change.` : 'Some have already been reviewed in the editor.'} Nothing was saved or accepted.`
          : ''}
      </p>
      {refusals.map((text, i) => <p key={i} role="alert" style={{ ...NOTE, color: 'var(--error)' }}>{text}</p>)}
    </fieldset>
  );
}
