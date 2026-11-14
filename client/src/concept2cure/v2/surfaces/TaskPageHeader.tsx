/**
 * The Tasks page's header (D6.md §A.4 steps 2-3, as amended by §A.7 items 3-4).
 * Split out of TaskBoard.tsx, which is over its size limits.
 *
 *   - The page's own title, no "Project — collaboration" eyebrow: Tasks spans
 *     every project (P-131 item 1).
 *   - Home's greeting, by the one rule (taskGreeting.ts), compact, not a banner.
 *   - One line computed by code (taskNeedSentence.ts), naming what to start with.
 *   - "Start workflow" and the page's one filled button, "New task".
 *   - The starters: each asks AnA in the conversation. "What needs me first?" is
 *     the tray's triage ask (TRIAGE_ASK); AnA reasons, code ranks.
 *
 * Replaces the critical-path answer lead, whose outcomes now live here (the line,
 * its blocked-path link, the starters), in the Critical path view and in Analytics.
 */
import React from 'react';
import { I } from '../icons';
import { TRIAGE_ASK } from '../TaskTray';
import type { MineLine } from './taskNeedSentence';
import { unownedLinkText } from './taskNeedSentence';

export const TASK_STARTERS: ReadonlyArray<{ label: string; prompt: string }> = [
  { label: 'What needs me first?', prompt: TRIAGE_ASK },
  {
    label: 'What is on the critical path?',
    prompt: 'What is on the critical path across my projects, what is blocking it, and what should I unblock first?',
  },
  { label: 'Who is carrying the most work?', prompt: 'Who is carrying the most open work, and what could be reassigned?' },
];

/** A phrase in the line that opens something: a real button, read as part of the sentence. */
function SayLink({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label?: string }) {
  return <button type="button" className="tb-say-link" aria-label={label} onClick={onClick}>{children}</button>;
}

export type TaskLine =
  | { kind: 'quiet' }
  | { kind: 'text'; text: string }
  | { kind: 'mine'; line: MineLine; openStart: (key: string) => void; showUnowned: () => void }
  | { kind: 'everyone'; text: string; blockedAt: string | null; showPath: () => void }
  | { kind: 'unowned'; text: string; first: { title: string; open: () => void } | null };

function MineSay({ line, openStart, showUnowned }: Extract<TaskLine, { kind: 'mine' }>) {
  if (line.kind !== 'said') return <>{line.text}</>;
  const { lead, start, tail, unowned } = line;
  return (
    <>
      {lead}
      {start && <> Start with “<SayLink onClick={() => openStart(start.key)}>{start.title}</SayLink>”: {start.why}.</>}
      {tail && <> {tail}</>}
      {unowned > 0 && <> <SayLink onClick={showUnowned}>{unownedLinkText(unowned)}</SayLink>.</>}
    </>
  );
}

function Say(props: { line: TaskLine }) {
  const { line } = props;
  switch (line.kind) {
    case 'quiet': return null;
    case 'text': return <>{line.text}</>;
    case 'mine': return <MineSay {...line} />;
    case 'everyone':
      return (
        <>
          {line.text}
          {line.blockedAt && (
            <span className="tb-say-err">
              {' '}{I.alertTriangle} <SayLink onClick={line.showPath}>The critical path is blocked at “{line.blockedAt}”</SayLink>.
            </span>
          )}
        </>
      );
    case 'unowned':
      return (
        <>
          {line.text}
          {line.first && <> Start with “<SayLink onClick={line.first.open}>{line.first.title}</SayLink>”.</>}
        </>
      );
  }
}

export function TaskPageHeader({ title, greeting, line, canWrite, onStartWorkflow, onNewTask, onAsk }: {
  title: string;
  greeting: string;
  line: TaskLine;
  canWrite: boolean;
  onStartWorkflow: () => void;
  onNewTask: () => void;
  onAsk: (prompt: string) => void;
}) {
  return (
    <>
      <div className="ph">
        <div>
          <h1 className="ph-title">{title}</h1>
          <p className="tb-greet">{greeting}</p>
          <div className="ph-sub tb-say" data-testid="tb-say" aria-live="polite"><Say line={line} /></div>
        </div>
        {canWrite ? (
          <div className="ph-acts">
            <button type="button" className="btn ghost" onClick={onStartWorkflow}>{I.workflow} Start workflow</button>
            <button type="button" className="btn primary" onClick={onNewTask}>{I.plus} New task</button>
          </div>
        ) : (
          <div className="ph-sub" role="note" data-testid="tb-view-only">
            {I.lock} View only. Creating and changing tasks needs an editor role in this organization.
          </div>
        )}
      </div>
      <div className="sp-starters" data-layout="row" role="group" aria-label="Ask AnA">
        {TASK_STARTERS.map((st) => (
          <button key={st.label} type="button" className="sp-starter" onClick={() => onAsk(st.prompt)}>
            <span className="sk" aria-hidden="true">{I.sparkles}</span><span>{st.label}</span>
          </button>
        ))}
      </div>
    </>
  );
}
