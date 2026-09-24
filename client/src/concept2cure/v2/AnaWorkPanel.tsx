/**
 * AnA's progress — the panel a person watches while she works, and the chip
 * that opens it.
 *
 * ── What it is ───────────────────────────────────────────────────────────────
 * One quiet column in three parts, read top to bottom the way a person asks
 * "what is she doing?":
 *
 *   Progress              her plan, or the phases the turn reported, on one
 *                         vertical rail with the current step emphasised and
 *                         the step in flight named beneath it
 *   Outputs               what the conversation has produced
 *   Used in this session  uploads, memory, tools and project context
 *
 * The chip ("Step 2 of 5") sits in each host's header and toggles the panel.
 * Every host — the persistent rail, the full-page conversation, the document
 * editor, the eCTD co-author and risk-based monitoring — mounts these same two
 * components, so AnA's work reads the same in every module.
 *
 * ── What it refuses ──────────────────────────────────────────────────────────
 * Every line is something the stream reported. A step count appears only when
 * AnA declared a plan (`update_plan`, server/services/ana/turn-plan.ts): both
 * numbers are hers, and a step is done only because she marked it so. Without
 * a plan the rail shows the phases the server actually sent, in order, and
 * the chip counts nothing. There is no progress bar and no percentage: the
 * loop runs until she decides she has enough, and a bar would be a fiction
 * with a number on it. "Used in this session" lists only what reached the
 * model (the `context_used` event), and a failed read says so.
 *
 * The forensic detail — each tool's duration and the inputs she passed — is
 * in the transcript, behind each step's own disclosure (AnaActivity). The
 * projections live in anaWorkModel.ts; the section renderers in
 * AnaWorkSections.tsx.
 *
 * @module client/src/concept2cure/v2/AnaWorkPanel
 */

import React from 'react';

import { SR_ONLY_STYLE } from '../hooks/useChatUpload';
import { I } from './icons';
import type { AnaChatMessage, RunControlStatus } from '../components/ana/useAnaChat';
import type { AgentActivityView } from './useAgentActivity';
import { useNow } from './useNow';
import {
  collectOutputs,
  elapsedFor,
  progressChip,
  spokenLine,
  stateLineFor,
  usedInSession,
  type AnaWorkContext,
} from './anaWorkModel';
import { BackgroundQueue, OutputsBody, Section, SteersWaiting, StepsBody, UsedBody } from './AnaWorkSections';

export type { AnaWorkContext } from './anaWorkModel';

export interface AnaWorkPanelProps {
  messages: AnaChatMessage[];
  streaming: boolean;
  runStatus?: RunControlStatus;
  /** Steers accepted by the server and not yet spliced into a round. */
  pendingSteers?: string[];
  context?: AnaWorkContext;
  /** The background queue read. Omitted → no Background section. */
  queue?: AgentActivityView;
  /**
   * Own a polite live region for phase changes. Off by default: every host
   * also mounts AnaActivity, which announces the same phase, and two regions
   * saying one thing is worse than one. It stays for a host that mounts the
   * panel without a per-turn record.
   */
  announce?: boolean;
  /**
   * Leave drafts out of Outputs. The conversation surface renders every draft
   * as a document canvas or an artifact card of its own, and a title that
   * appears twice in one column is one more thing a reviewer has to read for
   * no new information.
   */
  omitDrafts?: boolean;
  /** Close the panel. Omitted → no close control (the host's chip is the only one). */
  onClose?: () => void;
}

/** The title bar: a real h2 between the page title and the h3 sections (SC 1.3.1). */
function PanelHeader({ stateLine, onClose }: { stateLine: string; onClose?: () => void }) {
  return (
    <div className="ana-work-hdr">
      <h2 className="ana-work-title">Progress</h2>
      {stateLine && <span className="ana-work-state">{stateLine}</span>}
      {onClose && (
        <button type="button" className="ana-work-close" aria-label="Close progress" onClick={onClose}>
          {I.close}
        </button>
      )}
    </div>
  );
}

/** The latest assistant turn. */
function latestTurns(messages: AnaChatMessage[]): { turn: AnaChatMessage | null } {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'assistant') return { turn: messages[i] };
  }
  return { turn: null };
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
  onClose,
}: AnaWorkPanelProps) {
  /* Everything that depends only on the turns is derived once per change to
     them. The clock re-renders the panel every second while live and every
     streamed token re-renders it too. */
  const derived = React.useMemo(() => {
    const { turn } = latestTurns(messages);
    return {
      turn,
      outputs: collectOutputs(messages, { drafts: !omitDrafts }),
      used: usedInSession(messages, context),
    };
  }, [messages, omitDrafts, context]);
  const { turn, outputs, used } = derived;
  const live = Boolean(streaming && turn?.streaming);
  const now = useNow(live);
  const stateLine = stateLineFor(turn, live, runStatus, elapsedFor(turn, now));
  const spoken = spokenLine(turn?.progress ?? [], live, stateLine, turn?.statusPhase);

  return (
    <div className="ana-work" data-live={live ? 'true' : 'false'}>
      {announce && <span aria-live="polite" style={SR_ONLY_STYLE}>{spoken}</span>}
      <PanelHeader stateLine={stateLine} onClose={onClose} />
      {!turn ? (
        <p className="ana-work-empty">
          AnA has not started a turn in this conversation. Ask something and her plan and steps appear here as she
          works.
        </p>
      ) : (
        <div className="ana-work-steps">
          <StepsBody turn={turn} live={live} paused={runStatus === 'paused'} now={now} />
          <SteersWaiting steers={pendingSteers} />
        </div>
      )}
      {outputs.length > 0 && (
        <Section title="Outputs">
          <OutputsBody outputs={outputs} />
        </Section>
      )}
      {used.length > 0 && (
        <Section title="Used in this session">
          <UsedBody rows={used} />
        </Section>
      )}
      <BackgroundQueue q={queue} />
    </div>
  );
}

/**
 * The chip in a host's header that opens and closes the panel: "Step 2 of 5"
 * when AnA declared a plan, "Working" or "Progress" when she did not. A toggle
 * button (aria-pressed); its name starts with the visible words so a voice
 * user can say what they see (SC 2.5.3).
 */
export const AnaProgressChip = React.forwardRef<
  HTMLButtonElement,
  { messages: AnaChatMessage[]; streaming: boolean; open: boolean; onToggle: () => void }
>(function AnaProgressChip({ messages, streaming, open, onToggle }, ref) {
  const { turn } = latestTurns(messages);
  const live = Boolean(streaming && turn?.streaming);
  const chip = progressChip(turn, live);
  return (
    <button
      ref={ref}
      type="button"
      className="ana-step-chip"
      data-live={live ? 'true' : 'false'}
      aria-pressed={open}
      onClick={onToggle}
    >
      <span className="ana-step-chip-ic" aria-hidden="true">
        {I.fileText}
      </span>
      {chip.text}
      <span className="sr-only"> · AnA's progress</span>
    </button>
  );
});

export default AnaWorkPanel;
