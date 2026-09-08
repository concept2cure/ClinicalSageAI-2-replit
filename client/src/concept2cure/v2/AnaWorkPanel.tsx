/**
 * AnA's work, live — the panel a client watches while she works.
 *
 * ── What it is ───────────────────────────────────────────────────────────────
 * A docked record of the current turn and the conversation around it, in five
 * sections that mirror how a person asks "what is she doing?":
 *
 *   Progress    the numbered phases this turn has passed through, the one in
 *               flight highlighted, with a running elapsed time
 *   Work queue  the steps of this run by round, steers waiting for the next
 *               round, and the background investigations the server reports
 *   Tools       every tool she called this turn, with its duration and an
 *               audit disclosure of the inputs, plus the tools used across
 *               the conversation
 *   Outputs     what the conversation has produced — drafts, actions taken,
 *               sign-offs waiting, reports rendered
 *   Context     what she is grounded on — project, module, engine, pinned
 *               tools, attachments
 *
 * ── What it refuses ──────────────────────────────────────────────────────────
 * Every row is something the stream actually reported. The phases are the
 * `status` events the server sent, in order, not a template with ticks added
 * as time passes; a turn with no tool round has no "running steps" phase. The
 * background queue is the server's answer, and a failed read says so rather
 * than showing an empty queue. There is no progress bar and no percentage:
 * the loop runs until AnA decides she has enough, and any bar would be a
 * fiction with a number on it (see AnaActivity for the same rule in the
 * transcript).
 *
 * Both hosts — the persistent rail and the full-page conversation surface —
 * mount this one component. Nothing here is duplicated from AnaActivity: that
 * is the per-message record inside the transcript; this is the live dock for
 * the turn in flight and the conversation's outputs. The projections it
 * renders live in anaWorkModel.ts; the section renderers in AnaWorkSections.
 *
 * @module client/src/concept2cure/v2/AnaWorkPanel
 */

import React from 'react';

import { SR_ONLY_STYLE } from '../hooks/useChatUpload';
import { I } from './icons';
import type { AnaChatMessage, AnaToolCall, RunControlStatus } from '../components/ana/useAnaChat';
import type { AnaProgressPhase } from '../components/ana/useAnaChat.types';
import { tallyTools, type ToolTally } from '../components/ana/anaProgress';
import type { AgentActivityView } from './useAgentActivity';
import { useNow } from './useNow';
import {
  collectOutputs,
  contextRows,
  conversationTools,
  elapsedFor,
  spokenLine,
  stateLineFor,
  type AnaWorkContext,
  type OutputRow,
} from './anaWorkModel';
import {
  BackgroundQueueBody,
  ContextBody,
  OutputsBody,
  ProgressBody,
  RunQueue,
  Section,
  SteerQueue,
  ToolsBody,
} from './AnaWorkSections';

export type { AnaWorkContext } from './anaWorkModel';

export interface AnaWorkPanelProps {
  messages: AnaChatMessage[];
  streaming: boolean;
  runStatus?: RunControlStatus;
  /** Steers accepted by the server and not yet spliced into a round. */
  pendingSteers?: string[];
  context?: AnaWorkContext;
  /** The background queue read. Omitted → the section says it is not shown here. */
  queue?: AgentActivityView;
  /**
   * Own a polite live region for phase changes. Off by default: the rail also
   * mounts AnaActivity, which announces the same phase, and two regions saying
   * one thing is worse than one. The conversation surface turned it on while
   * it had no other announcer; since WO-11 it mounts AnaActivity on every
   * turn too, so no host passes this today. It stays for a host that mounts
   * the panel without a per-turn record.
   */
  announce?: boolean;
  /**
   * Leave drafts out of Outputs. The conversation surface renders every draft
   * as an artifact card directly beneath the dock, and a title that appears
   * twice in one column is one more thing a reviewer has to read for no new
   * information. Other hosts have no artifact list and keep the rows.
   */
  omitDrafts?: boolean;
}

interface WorkModel {
  turn: AnaChatMessage | null;
  lastUser: AnaChatMessage | null;
  live: boolean;
  now: number;
  stateLine: string;
  phases: AnaProgressPhase[];
  calls: AnaToolCall[];
  tally: ToolTally;
  outputs: OutputRow[];
  /** What the polite live region says: the active phase, then the outcome. */
  spoken: string;
}

/** Every fact the sections render, derived once from the turns. */
function useWorkModel(
  messages: AnaChatMessage[],
  streaming: boolean,
  runStatus: RunControlStatus,
  omitDrafts: boolean,
): WorkModel {
  /* Everything that depends only on the turns is derived once per change to
     them. The clock re-renders the panel every second while live and every
     streamed token re-renders it too; walking every message's outputs and
     tools on each of those is wasted on three hosts at once. */
  const derived = React.useMemo(() => {
    let turn: AnaChatMessage | null = null;
    let lastUser: AnaChatMessage | null = null;
    for (let i = messages.length - 1; i >= 0 && (!turn || !lastUser); i -= 1) {
      const m = messages[i];
      if (!turn && m.role === 'assistant') turn = m;
      else if (!lastUser && m.role === 'user') lastUser = m;
    }
    const calls = turn?.toolCalls ?? [];
    return {
      turn,
      lastUser,
      phases: turn?.progress ?? [],
      calls,
      tally: tallyTools(calls),
      outputs: collectOutputs(messages, { drafts: !omitDrafts }),
    };
  }, [messages, omitDrafts]);
  const { turn, phases } = derived;
  const live = Boolean(streaming && turn?.streaming);
  const now = useNow(live);
  const stateLine = stateLineFor(turn, live, runStatus, elapsedFor(turn, now));
  return {
    ...derived,
    live,
    now,
    stateLine,
    spoken: spokenLine(phases, live, stateLine, turn?.statusPhase),
  };
}

/**
 * The title bar. It carries no close control of its own: every host already
 * has one show/hide toggle for the dock, and a second control for the same
 * state — a few pixels below the first, with the same icon — was two
 * affordances for one non-primary action. The host's toggle is the one.
 */
function PanelHeader({ stateLine, pulsing }: { stateLine: string; pulsing: boolean }) {
  return (
    <div className="ana-work-hdr">
      {/* A real heading: the dock's five sections are h3s, so the dock itself
          must be the h2 between them and the page title wherever it is hosted
          (SC 1.3.1). Styled to the header's type, not the document's. */}
      <h2 className="ana-work-title">
        <span className="ana-work-mark" aria-hidden="true">{I.activity}</span>
        AnA at work
      </h2>
      {stateLine && (
        <span className="ana-work-elapsed">
          {pulsing && <span className="ana-work-pulse" aria-hidden="true">{I.dot}</span>}
          {stateLine}
        </span>
      )}
    </div>
  );
}

type SectionKey = 'progress' | 'queue' | 'tools' | 'outputs' | 'context';

function queueMeta(tally: ToolTally, steers: number): string | undefined {
  if (tally.total > 0) return `${tally.succeeded + tally.failed} of ${tally.total} steps`;
  if (steers > 0) return `${steers} waiting`;
  return undefined;
}

function PanelSections({
  m,
  messages,
  pendingSteers,
  context,
  queue,
}: {
  m: WorkModel;
  messages: AnaChatMessage[];
  pendingSteers: string[];
  context?: AnaWorkContext;
  queue?: AgentActivityView;
}) {
  const { turn, live, now, phases, calls, tally, outputs } = m;
  const [open, setOpen] = React.useState<Record<SectionKey, boolean>>(() => ({
    progress: true,
    queue: true,
    /* Closed by default: its rows are the Work queue's rows again in more
       forensic form (durations, raw inputs) — detail that belongs behind a
       click, like Context — and with both open a multi-round turn outgrew
       the rail and pushed the conversation below the fold. */
    tools: false,
    outputs: outputs.length > 0,
    context: false,
  }));
  const toggle = (k: SectionKey) => () => setOpen((o) => ({ ...o, [k]: !o[k] }));
  /* Outputs opens itself ONCE, when the first output lands — a state write,
     not an OR in the render, so the person can still collapse it afterwards.
     (`open || outputs.length > 0` made the header a button that did nothing.) */
  const hadOutputs = React.useRef(outputs.length > 0);
  React.useEffect(() => {
    if (outputs.length > 0 && !hadOutputs.current) setOpen((o) => ({ ...o, outputs: true }));
    hadOutputs.current = outputs.length > 0;
  }, [outputs.length]);
  const settled = phases.filter((p) => p.status !== 'active').length;
  return (
    <>
      {turn && (
        <Section
          title="Progress"
          meta={phases.length > 0 ? `${settled} of ${phases.length}` : undefined}
          open={open.progress}
          onToggle={toggle('progress')}
        >
          <ProgressBody turn={turn} live={live} now={now} />
        </Section>
      )}

      <Section title="Work queue" meta={queueMeta(tally, pendingSteers.length)} open={open.queue} onToggle={toggle('queue')}>
        {turn && <RunQueue calls={calls} tally={tally} live={live} />}
        <SteerQueue steers={pendingSteers} />
        <div className="ana-work-group">
          <div className="ana-work-group-h">Background investigations</div>
          <BackgroundQueueBody q={queue} />
        </div>
      </Section>

      <Section title="Tools" meta={tally.total > 0 ? `${tally.total}` : undefined} open={open.tools} onToggle={toggle('tools')}>
        <ToolsBody turn={turn} calls={calls} live={live} now={now} usedInConversation={conversationTools(messages)} />
      </Section>

      <Section
        title="Outputs"
        meta={outputs.length > 0 ? `${outputs.length}` : undefined}
        open={open.outputs}
        onToggle={toggle('outputs')}
      >
        <OutputsBody outputs={outputs} />
      </Section>

      <Section title="Context" open={open.context} onToggle={toggle('context')}>
        <ContextBody
          rows={contextRows(context, turn)}
          pinnedTools={context?.pinnedTools ?? []}
          attachments={m.lastUser?.attachments ?? []}
        />
      </Section>
    </>
  );
}

export function AnaWorkPanel({
  messages,
  streaming,
  runStatus = null,
  pendingSteers = [],
  context,
  queue,
  announce = false,
  omitDrafts = false,
}: AnaWorkPanelProps) {
  const m = useWorkModel(messages, streaming, runStatus, omitDrafts);
  return (
    <div className="ana-work" data-live={m.live ? 'true' : 'false'}>
      {announce && <span aria-live="polite" style={SR_ONLY_STYLE}>{m.spoken}</span>}
      <PanelHeader stateLine={m.stateLine} pulsing={m.live && runStatus !== 'paused'} />
      {!m.turn && (
        <div className="ana-work-idle">
          AnA has not started a turn in this conversation. Ask something and her progress, steps and
          tools appear here as she works.
        </div>
      )}
      <PanelSections m={m} messages={messages} pendingSteers={pendingSteers} context={context} queue={queue} />
    </div>
  );
}

export default AnaWorkPanel;
