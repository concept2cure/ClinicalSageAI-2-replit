/**
 * The turn record and the answer check for the "Draft from sources" door (RT-6,
 * AnA reasoning round 12, 2026-10-05).
 *
 * POST /api/authoring/sections/:sectionId/ai/draft asks a model for a section
 * draft, and its accept files the text as AnA's. It wrote no turn record and
 * ran no check, so a draft that stated 45% where its source says 31% reached
 * the accept with nothing flagged, and the Part 11 row named a SHA-256 of a
 * prompt the system never kept. Every other AnA door files one record per
 * turn (turn-record.ts) and checks what she wrote (turn-verification.ts).
 *
 * This composes those two for the door. Nothing here is a new engine:
 *   - the record is opened before the model is asked, with the one message it
 *     is sent, and filed however the request ends: 'answered' with the draft,
 *     'failed' on a refusal, an empty answer or a fault;
 *   - the check reads what the model was SHOWN: the Data Room evidence after
 *     its 600-character cut and before the block's instructions, and the
 *     section header it was given. The person's own words are passed as
 *     theirs, so a figure only they gave reads as theirs, never as found;
 *   - a failed or empty retrieval consulted nothing, so every claim is
 *     unchecked, and the record says why in the retrieval service's fixed
 *     sentence, never the raw error.
 *
 * @module server/services/ana/turn-record-draft
 */

import { RETRIEVAL_STATUS_MESSAGE, type RetrievalStatus } from '../data-room-retrieval.js';
import type { AnswerCheck, EvidenceEntry } from './answer-grounding.js';
import {
  callSent,
  canonicalJson,
  openTurnRecorder,
  writeTurnRecordSafely,
  type TurnOutcome,
  type TurnRecorder,
  type TurnRecordStatus,
} from './turn-record.js';
import { verifyTurnAnswer, type TurnVerification } from './turn-verification.js';

type ConnectablePool = Parameters<typeof writeTurnRecordSafely>[0];

/** What this door is, for a reader of its records. */
const DOOR_LIMITS =
  'This turn is a section draft from the authoring editor ("Draft from sources"): one model call, no tools. ' +
  'Its evidence-label reading is void: the door does not ask the model for [KNOWN]/[INFERRED] labels, and the panel shows only the check.';

/** Where the evidence block's instructions to the model begin; nothing after it is evidence. */
const END_OF_EVIDENCE = '--- END EVIDENCE ---';

/** The Data Room evidence exactly as the prompt showed it, without the block's instructions. */
export function evidenceShown(evidenceBlock: string): string {
  const end = evidenceBlock.indexOf(END_OF_EVIDENCE);
  return (end >= 0 ? evidenceBlock.slice(0, end) : evidenceBlock).trim();
}

export interface DraftedTurn {
  /** The engine's check of the draft as generated; null when it could not run. */
  check: AnswerCheck | null;
  turnRecord: TurnRecordStatus;
}

/** One section draft's turn: opened before the model call, filed once. */
export class DraftTurn {
  private filed = false;

  constructor(
    private readonly recorder: TurnRecorder,
    private readonly pool: ConnectablePool,
    private readonly audit: { ipAddress?: string; userAgent?: string },
  ) {}

  /** The model answered: who served it, what it was sent, and what it wrote. */
  served(response: { provider?: string | null; model?: string | null; requestId?: string | null; content?: unknown }): void {
    this.recorder.setModel({ provider: response.provider ?? null, model: response.model ?? null });
    this.recorder.addServed(1, response, callSent({}));
    this.recorder.setAnswer({ streamed: typeof response.content === 'string' ? response.content : null });
  }

  /** The draft: checked against what the model was shown, and the turn filed as answered. */
  async drafted(
    content: string,
    d: {
      label: string;
      authoringDocId: string;
      /** The evidence the model was shown (evidenceShown), or null when retrieval found or ran nothing. */
      shownEvidence: string | null;
      sectionHeader: string;
      personWords: string;
      retrievalStatus: RetrievalStatus;
    },
  ): Promise<DraftedTurn> {
    const sources: EvidenceEntry[] = [];
    if (d.shownEvidence) {
      sources.push({ source: 'Data Room', content: d.shownEvidence }, { source: 'context', content: d.sectionHeader });
    }
    if (d.personWords) sources.push({ source: 'person', content: d.personWords });
    let verification: TurnVerification | null = null;
    try {
      verification = verifyTurnAnswer(content, sources);
    } catch {
      this.recorder.warn('The draft could not be checked against its sources.');
    }
    if (d.retrievalStatus !== 'ok') this.recorder.warn(RETRIEVAL_STATUS_MESSAGE[d.retrievalStatus]);
    this.recorder.setOutputs({ drafts: [{ title: d.label, content, authoringDocId: d.authoringDocId }] });
    this.recorder.setVerification(verification);
    return { check: verification?.check ?? null, turnRecord: await this.file('answered') };
  }

  /** File the turn as `outcome`, once; a second call is the first one's status. */
  async file(outcome: TurnOutcome, warning?: string): Promise<TurnRecordStatus> {
    if (this.filed) return { status: 'not_recorded', reason: 'This turn was already filed.' };
    this.filed = true;
    if (warning) this.recorder.warn(warning);
    return writeTurnRecordSafely(this.pool, this.recorder, outcome, this.audit);
  }
}

/** Open the door's turn before the model is asked, or null when it has no organization to file under. */
export function openDraftTurn(
  pool: ConnectablePool,
  t: {
    orgId: unknown;
    userId: unknown;
    sectionId: string;
    request: Record<string, unknown>;
    prompt: string;
    audit: { ipAddress?: string; userAgent?: string };
  },
): DraftTurn | null {
  const recorder = openTurnRecorder({
    orgId: t.orgId,
    userId: t.userId,
    typed: canonicalJson({ sectionId: t.sectionId, ...t.request }),
    surface: 'api:authoring/sections/ai/draft',
  });
  if (!recorder) return null;
  recorder.setModelInput([{ role: 'user', content: t.prompt }]);
  recorder.warn(DOOR_LIMITS);
  return new DraftTurn(recorder, pool, t.audit);
}

/** File a failed draft turn, when there is one and it is not filed yet. Never throws. */
export async function fileFailedDraftTurn(turn: DraftTurn | null, warning: string): Promise<void> {
  if (turn) await turn.file('failed', warning);
}
