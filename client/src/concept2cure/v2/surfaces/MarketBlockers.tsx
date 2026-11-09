/**
 * What must close before a market's sequence can be dispatched, in plain
 * sentences, each with its act (the project's Submit step).
 *
 * Submit drew the readiness detail (DispatchReadiness.tsx MarketGateDetail) as
 * it is: gate titles, rule ids (STRUCTURAL_GATE_CLEAR), finding codes and the
 * server's messages, which name a document by its store and id ("points at
 * vault_documents 4e487967-…"). A client read it as engine output (2026-10-31).
 * Above that detail there is now one sentence per thing to do, naming each
 * document by its title, with the button that opens where it is done. The
 * detail itself, rules and all, is kept behind "Rule detail" for a reviewer.
 *
 * Nothing here decides anything. The verdict, the gates and the findings are
 * the server's (programSequence.ts); this only says them in words. A finding
 * this file has no sentence for is said by its rule's title and section. When
 * the server sent no findings to read, its own blocker sentences are shown.
 */
import React from 'react';
import { I } from '../icons';
import { MarketGateDetail } from './DispatchReadiness';
import { openSubmissionCenter, VerdictDetail, type CenterTarget } from './ProjectMarkets';
import { findingAct, type FindingAct } from './readinessFindingActs';
import { awaitingOwnReleaseSignature, type GateView, type ProgramMarket, type ReadinessFinding } from './programSequence';

/** One thing to do, and where it is done (null: the sentence is the act). */
export interface MarketTodo { key: string; text: string; act: { label: string; at: CenterTarget } | null }

/** "m1.14.4.1" → "1.14.4.1": a section as the agency's headings number it. */
const sectionWords = (code: string | null | undefined): string | null => {
  const v = String(code ?? '').trim();
  return v ? v.replace(/^m(?=\d)/i, '') : null;
};

/** The leaf's title, which the server's message quotes first ('Leaf "Protocol v1.0" (…)'). */
const leafTitle = (message: string): string | null => /^Leaf "([^"]+)"/.exec(message)?.[1] ?? null;

/** A document named by its title, or by where it is placed when the message gives none. */
function documentName(f: ReadinessFinding, sec: string | null): string {
  const title = leafTitle(f.message);
  if (title) return sec ? `“${title}” (section ${sec})` : `“${title}”`;
  return sec ? `The document at section ${sec}` : 'A placed document';
}

/** A finding as one sentence that says what to do. */
export function findingSentence(f: ReadinessFinding): string {
  const sec = sectionWords(f.sectionCode);
  switch (f.code) {
    case 'MISSING_REQUIRED_SECTION': return `Place a document at section ${sec ?? 'the required section'}. This application requires it.`;
    case 'IND_MODULE3_REQUIRED': return `Place Module 3${sec ? ` section ${sec}` : ''} from CMC / Module 3, or record a cross-reference to it with its Letter of Authorization.`;
    case 'EMPTY_SEQUENCE': return 'Place the first document in this sequence.';
    case 'DOCUMENT_NOT_APPROVED': return `Approve ${documentName(f, sec)}. Only approved documents are released.`;
    case 'UNRESOLVED_DOCUMENT': return `${documentName(f, sec)} has no content. Write it, then place it again.`;
    case 'DOCUMENT_CONTENT_MISMATCH': return `${documentName(f, sec)} changed after it was placed. Place it again.`;
    default: return `${f.rule?.title ?? 'A structural check'}: not met${sec ? ` at section ${sec}` : ''}.`;
  }
}

/** Plain names for the finding acts (readinessFindingActs.ts routes them). */
function actLabel(act: FindingAct): string {
  if (act.kind === 'place') return 'Place a document';
  if (act.kind === 'leaf') return 'Open the placed document';
  return 'Open in Validation';
}

function actTarget(m: ProgramMarket, sequenceId: number, act: FindingAct): CenterTarget {
  return act.kind === 'validation'
    ? { submissionId: m.submission.id, sequenceId, ws: 'validation' }
    : { submissionId: m.submission.id, sequenceId, ws: 'builder', section: { act: act.kind, code: act.code } };
}

/** A finding that holds the sequence back: an error, or a document not yet approved, which release refuses. */
const holdsBack = (f: ReadinessFinding): boolean =>
  f.severity === 'error' || (f as ReadinessFinding & { blocksRelease?: boolean }).blocksRelease === true || f.code === 'DOCUMENT_NOT_APPROVED';

/** A gate other than the structural one, as a sentence and where it is closed. */
function gateTodo(g: GateView, m: ProgramMarket, sequenceId: number): MarketTodo | null {
  const at = (ws: CenterTarget['ws']): CenterTarget => ({ submissionId: m.submission.id, sequenceId, ws });
  if (g.key === 'shadowPresence') {
    return { key: g.key, text: 'Run Shadow Review on this sequence. A sequence no one has reviewed is not cleared for dispatch.', act: { label: 'Open Shadow Review', at: at('shadow-review') } };
  }
  if (g.key === 'releaseSignature') {
    return { key: g.key, text: 'Sign the release of this sequence. The release signature is applied on its Dispatch tab.', act: { label: 'Open Dispatch', at: at('dispatch') } };
  }
  if (g.key === 'external') {
    return { key: g.key, text: 'Resolve the agency validator’s findings on this package.', act: { label: 'Open in Validation', at: at('validation') } };
  }
  return null;
}

/** Everything that must close before dispatch, errors first, then approvals, then the other gates. */
export function marketTodos(m: ProgramMarket, locked: boolean): MarketTodo[] {
  const r = m.read;
  if (r.state !== 'verdict' || !r.gate || r.gate.cleared) return [];
  const sequenceId = r.sequence.id;
  const a = r.assessment;
  const findings = (Array.isArray(a?.readiness?.findings) ? a.readiness.findings : []).filter(holdsBack);
  const ordered = [...findings.filter((f) => f.severity === 'error'), ...findings.filter((f) => f.severity !== 'error')];
  const todos: MarketTodo[] = ordered.map((f, i) => {
    const act = findingAct(f, { locked });
    return { key: `f${i}`, text: findingSentence(f), act: act ? { label: actLabel(act), at: actTarget(m, sequenceId, act) } : null };
  });
  const gates = Array.isArray(a?.gates) ? a.gates : [];
  todos.push(...gates.filter((g) => !g.cleared).map((g) => gateTodo(g, m, sequenceId)).filter((t): t is MarketTodo => t !== null));
  /* No findings or gates to read: the server's own blocker sentences. */
  if (todos.length === 0) return r.gate.blockers.map((text, i) => ({ key: `b${i}`, text, act: null }));
  return todos;
}

function TodoList({ todos, onNav, center }: { todos: MarketTodo[]; onNav: (id: string) => void; center: boolean }) {
  return (
    <ol className="pj-mkt-todo-list">
      {todos.map((t) => (
        <li key={t.key} className="pj-mkt-todo-i">
          <span className="pj-mkt-todo-t">{t.text}</span>
          {t.act && center && (
            <button type="button" className="btn small pj-mkt-todo-act" onClick={() => openSubmissionCenter(onNav, t.act!.at)}>
              {t.act.label} {I.right}
            </button>
          )}
        </li>
      ))}
    </ol>
  );
}

/** Under a market's row on Submit: what must close, in words, then the rule detail. A
 *  verdict that does not block (cleared, or awaiting only the release signature the
 *  dispatch e-signature applies) shows the readiness detail as it is: its door to Dispatch is there. */
export function MarketBlockers({ m, onNav, center }: { m: ProgramMarket; onNav: (id: string) => void; center: boolean }) {
  const r = m.read;
  if (r.state !== 'verdict' || !r.assessment) return <VerdictDetail read={r} />;
  if (!r.gate || r.gate.cleared || awaitingOwnReleaseSignature(r.assessment)) return <MarketGateDetail m={m} onNav={onNav} center={center} />;
  const status = r.assessment.sequenceStatus ?? r.sequence.status;
  const todos = marketTodos(m, status === 'frozen' || status === 'dispatched');
  return (
    <div className="pj-mkt-todo" data-testid="pj-market-todo">
      <h3 className="pj-mkt-todo-h">What must close before dispatch</h3>
      <TodoList todos={todos} onNav={onNav} center={center} />
      <details className="pj-mkt-rules">
        <summary>Rule detail: gates, findings and the rules behind them</summary>
        <MarketGateDetail m={m} onNav={onNav} center={center} />
      </details>
    </div>
  );
}
