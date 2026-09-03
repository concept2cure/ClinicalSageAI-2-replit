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
  /** Hosts pass their own collapse control; the panel renders the button. */
  onClose?: () => void;
}

/** A 1 Hz clock while something is in flight; frozen otherwise. */
function useNow(active: boolean): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
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
function useWorkModel(messages: AnaChatMessage[], streaming: boolean, runStatus: RunControlStatus): WorkModel {
  const turn = [...messages].reverse().find((m) => m.role === 'assistant') ?? null;
  const lastUser = [...messages].reverse().find((m) => m.role === 'user') ?? null;
  const live = Boolean(streaming && turn?.streaming);
  const now = useNow(live);
  const stateLine = stateLineFor(turn, live, runStatus, elapsedFor(turn, now));
  const phases = turn?.progress ?? [];
  const calls = turn?.toolCalls ?? [];
  return {
    turn,
    lastUser,
    live,
    now,
    stateLine,
    phases,
    calls,
    tally: tallyTools(calls),
    outputs: collectOutputs(messages),
    spoken: spokenLine(phases, live, stateLine),
  };
}

function PanelHeader({ stateLine, pulsing, onClose }: { stateLine: string; pulsing: boolean; onClose?: () => void }) {
  return (
    <div className="ana-work-hdr">
      <span className="ana-work-title">
        <span className="ana-work-mark" aria-hidden="true">{I.activity}</span>
        AnA at work
      </span>
      {stateLine && (
        <span className="ana-work-elapsed">
          {pulsing && <span className="ana-work-pulse" aria-hidden="true">{I.dot}</span>}
          {stateLine}
        </span>
      )}
      {onClose && (
        <button type="button" className="ana-work-x" onClick={onClose} aria-label="Hide AnA at work">
          {I.close}
        </button>
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
  const [open, setOpen] = React.useState<Record<SectionKey, boolean>>({
    progress: true,
    queue: true,
    tools: true,
    outputs: false,
    context: false,
  });
  const toggle = (k: SectionKey) => () => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const { turn, live, now, phases, calls, tally, outputs } = m;
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
        open={open.outputs || outputs.length > 0}
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
  onClose,
}: AnaWorkPanelProps) {
  const m = useWorkModel(messages, streaming, runStatus);
  return (
    <div className="ana-work" data-live={m.live ? 'true' : 'false'}>
      {announce && <span aria-live="polite" style={SR_ONLY_STYLE}>{m.spoken}</span>}
      <PanelHeader stateLine={m.stateLine} pulsing={m.live && runStatus !== 'paused'} onClose={onClose} />
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
