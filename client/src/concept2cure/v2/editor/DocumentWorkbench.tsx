/**
 * DocumentWorkbench — THE document editor, wherever it is mounted.
 *
 * ── What this is ─────────────────────────────────────────────────────────────
 * The editing core that lived inside `surfaces/DocumentAuthoring.tsx` (5,143
 * lines on 2026-09-21), moved here so that ONE component renders the section
 * outline, the canonical `RichSectionEditor` for the active section, and the
 * side rail — comments, history, sources, signatures, audit, exports,
 * project files, review tasks — for a given document. Two hosts mount it:
 *
 *   · `surfaces/DocumentAuthoring.tsx` — the Authoring surface: it owns the
 *     document LIST (status filter, GET /api/authoring/docs) and mounts the
 *     workbench over that list, consuming the editor deep-link channel and
 *     registering the surface-action bus.
 *   · `editor/DocumentCanvas.tsx` — the canvas beneath an AnA message in the
 *     conversation thread: "Open full editor" grows the card in place and
 *     mounts the workbench PINNED to that one document, with the thread's own
 *     composer still below it.
 *
 * Five editor generations were built and deleted in this repository between
 * 2026-06 and 2026-08 (CLAUDE.md, "Deleting a user-facing capability"). This
 * move is the opposite of a sixth: the canvas expands INTO this component, so
 * there is one editor, never two. `scripts/ci/check-canvas-path.mjs` pins the
 * path (thread → canvas → workbench; surface → workbench).
 *
 * ── What did not change in the move ──────────────────────────────────────────
 * Everything below the props block is the surface's own code, moved, not
 * rewritten: the same governed reads and writes against `/api/authoring`
 * (server/routes/authoring.router.ts, tables authoring_documents /
 * authoring_sections / doc_revisions / authoring_comments /
 * authoring_citations), the same honesty rules (live data, honest empty,
 * honest failed-load, never a fixture; writes awaited; a success toast only
 * after the server confirms; attribution from the server, never guessed), the
 * same unsaved-work guard, the same §11.10(d)/(e) reason-for-change funnel,
 * the same one save path. Existing editor tests exercise that surface core;
 * the AnA destination tests exercise its canonical conversation handoff.
 *
 * ── AnA's one conversation ────────────────────────────────────────────────
 * Every ask goes to ConversationThread, whose DocumentCanvas mounts this
 * same editor and shares its governed bridge. A standalone ask carries only
 * saved record identity, after the unsaved-work guard. Embedded asks prefill
 * the visible host composer. Neither sends until the person presses Enter.

 */
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { I } from '../icons';
import type { OwnedSurfaceViewProps } from '../surfaceViews';
import { EmptyState } from '../dataConnect';
import { GovernedTimestamp } from '../../_shared/components/GovernedTimestamp';
import type { AnaTurnRecordStatus } from '../../components/ana/useAnaChat.types';
import { ANA_SUGGESTION_AUTHOR_ID, anaInsertRefusal } from './anaInsertGate';
import type { AuthoringContextPack } from '@shared/types/authoring-context';
import { apiRequest, serverMessage, ApiRequestError, redactInternals } from '@/lib/queryClient';
import { AuthoringFilingBar } from '../surfaces/AuthoringFilingBar';
import { esignSignerOf } from '../../_shared/components/EsignModal';
import { AuthoringPlaceIntoFiling } from '../surfaces/AuthoringPlaceIntoFiling';
import { AuthoringCollab } from '../surfaces/AuthoringCollab';
import { AuthoringCreateExport } from '../surfaces/AuthoringCreateExport';
import { newDocumentAction } from '../newDocumentAction';
import { downloadBlob, safeFileName } from '../download';
import { ProjectFilesPanel } from './ProjectFilesPanel';
import { ReviewTasksPanel } from './ReviewTasksPanel';
import { DocumentPermissionsPanel } from './DocumentPermissionsPanel';
import { FileToVaultDialog } from './FileToVaultDialog';
import { SendForReviewDialog } from './SendForReviewDialog';
import { useProgramSummary, programHeadline, programName } from './programSummary';
import { askAnaToDraftPrompt, openConversationWithPrompt, originWithSavedVersion, prefillConversation, type AskOrigin, type SavedSectionVersion } from './askAnaToDraft';
import { describeClaimsCheck, describeFigureCheck, describeProvenance, type ClaimsCheckSummary, type DocumentProvenance, type FigureCheckSummary } from './provenance';
import { DraftFigureLine } from './DraftFigureLine';
import { DraftClaimsLine } from './DraftClaimsLine';
import { AuthoringRevisionDiff } from '../surfaces/AuthoringRevisionDiff';
import { AuthoringAiDraft, type AcceptedAttribution } from '../surfaces/AuthoringAiDraft';
import { AuthoringExports } from '../surfaces/AuthoringExports';
import { RichSectionEditor, type RichSectionEditorHandle, type ProposalState } from './RichSectionEditor';
import { scopedProposalResult, type EditorProposalReceipt } from './editorProposalReceipt';
import { readSavedTemplateContext, savedTemplateFacts, type SavedTemplateContext } from './savedTemplateContext';
import { AuthoringOversightActions } from './AuthoringOversightActions';
import { AuthoringAssemblyBuild, useAuthoringAssemblyBuild } from './AuthoringAssemblyBuild';
import { captureAssemblySourceIntent, type AssemblySourceIntent } from './assemblySourceIntent';
import { assemblySelectionKey } from './assemblySourceSelection';
import { admitWorkbenchNavigation, workbenchAlreadyThere, workbenchAssemblyIntent, type WorkbenchLeaveTarget } from './workbenchLeaveTarget';
import { ImportSourceNotice } from './ImportSourceNotice';
import { TemplateGuidance } from './TemplateGuidance';
import { isWorkflowImportOrigin } from '@shared/authoring/source-import';
import type {
  ProposeRefusal,
  ReplacementProposal,
  SuggestionAuthor,
  SuggestionDecision,
} from './suggestions';
import type { CommentAnchorPayload } from './commentAnchor';
import { useProjectSourceCatalog } from './useProjectSourceCatalog';
import { admittedCitationSources, admittedPrecedingSources, useDocumentCitationAdmission } from './citationAdmission';
import { sourceCitationEligible, type ProjectSourceRecord } from './projectSourceCatalog';
import { captionedObjectsInHtml } from './captionNumbering';
import type { CaptionedObject } from '@shared/authoring/captions';
import type { CitationSource } from '@shared/authoring/citations';
import { citationRefreshRefusalMessage } from '@shared/authoring/citations';
import { useAuth } from '@/services/portal/authService';
import { getAuthToken } from '@/utils/authToken';
import { describeRulePackProvenance } from '@shared/rule-pack-provenance';

import { useFilingOutline, findSectionForNode, nodeHasDraft } from '../useFilingOutline';
import { outlineReadState, unboundNodeTitle, unboundNodeToast } from './outlineReadState';
import { useStartOutlineSection, unstartedRowProps } from './startOutlineSection';
import { FilingMarkets, FilingGaps, useCreateMarketCopy } from './FilingMarkets';
import {
  editorTargetDocLabel,
  clearEditorTarget,
  describeEditorTarget,
  matchEditorTargetSection,
  peekEditorTarget,
  setEditorTarget,
  EDITOR_TARGET_EVENT,
  editorTargetFromSearch,
  type EditorTarget,
} from '../editorTarget';
import { consumeNavParams, registerSurfaceLeaveGuard } from '../navParams';
import { ceremonyOpen } from '../ceremony';
import {
  advertisedScreenActions,
  listedChoices,
  notifySurfaceActionReady,
  useSurfaceActionHandlers,
} from '../surfaceActions';
import { isFeatureEnabled } from '@/flags/featureFlags';
import '../styles/project-home-v2.css';
import { C2CToast, useToast } from '../toast';
import { AuthoringSignatures } from '../surfaces/AuthoringSignatures';
import { useDialog } from '../useDialog';
import { AuthoredHtml } from './AuthoredHtml';
import { usePublishSurfaceContext } from '../surfaceContext';

/* ── Server row shapes (mirror server/routes/authoring.router.ts) ── */

interface AuthDoc {
  id: string;
  title: string;
  module: string | null;
  product_code: string | null;
  status: string;
  updated_at: string | null;
  section_count: number | string | null;
  /** The author (GET /docs returns it): not offered as the document's reviewer. */
  created_by?: string | number | null;
  /** The governed filing this is the editing copy of; null when unbound,
      absent when the list did not say. The outline starts a section only in
      the filing's copy (startOutlineSection.ts startOffer). */
  c2c_document_id?: string | null;
}

/**
 * Document-level structural findings (server: shared/regulatory/section-code).
 *
 * Neither is visible from any one section, which is why they travel with the
 * list rather than with a row: a code filed twice puts two 3.2.S in the
 * assembled dossier, and a stored order that disagrees with the codes means it
 * assembles in the wrong order.
 */
interface SectionStructure {
  duplicateCodes: string[];
  outOfOrder: boolean;
  suggestedOrder: string[];
}

interface AuthSection {
  id: string;
  doc_id: string;
  code: string;
  title: string;
  content: string | null;
  order_index: number | null;
  /** The store's own column — the editor binds real suggestions to it. */
  track_changes?: boolean | null;
  comment_count: number | string | null;
  revision_count: number | string | null;
  citation_count: number | string | null;
  updated_at: string | null;
}

interface AuthRevision {
  id: string;
  section_id: string;
  content: string | null;
  created_at: string | null;
  created_by_name: string | null;
  created_by_email: string | null;
  /** Ledger columns (null on revisions predating the ledger). */
  content_sha256?: string | null;
  chain_sha256?: string | null;
  origin?: string | null;
}

/** How each ledger origin reads to an author. */
const REVISION_ORIGIN_LABELS: Record<string, string> = {
  genesis: 'created',
  'human-edit': 'edited',
  'ai-draft-accept': 'AI draft accepted',
  revert: 'reverted',
  'template-apply': 'template applied',
  'pre-template-snapshot': 'pre-template snapshot',
};

/** The server's recomputed ledger verdict for a section's history. */
interface LedgerVerdict {
  intact: boolean;
  revisionCount: number;
  chainedCount: number;
  preLedgerCount: number;
  breaks: Array<{ revisionId: string; reason: string }>;
}

/** A row from GET /docs/:docId/audit — the Part 11 audit trail the server has
 *  written on every governed act since the store shipped, readable by no
 *  surface until this rail. Field names are the endpoint's aliases. */
interface AuthAuditEvent {
  id: string;
  section_id: string | null;
  event_type: string | null;
  actor: string | null;
  actor_role: string | null;
  change_reason: string | null;
  content_hash_before: string | null;
  content_hash_after: string | null;
  created_at: string | null;
  /** The endpoint has always returned this and no surface read it, so the
   *  richest part of several governed records — which model produced a draft,
   *  which redline a reviewer refused — was written and unreadable. */
  metadata: Record<string, unknown> | null;
  /** The server's verdict on this row against its entry on the tenant audit
   *  chain, computed at read time (authoring-record.ts). `chained: false` is a
   *  row no chain entry names — written before the chain carried trail ids —
   *  and is unknown, neither a failure nor a pass. Absent from older servers. */
  integrity?: AuditRowIntegrity | null;
}

interface AuditRowIntegrity {
  chained: boolean;
  intact: boolean | null;
  mismatches: string[];
  chainPayloadIntact?: boolean | null;
}

/** What each field the server compares reads as on the rail. */
const AUDIT_MISMATCH_LABELS: Record<string, string> = {
  before_content: 'text before',
  after_content: 'text after',
  metadata: 'details',
  change_reason: 'reason',
  operation_type: 'operation',
  chain_payload: 'chain entry',
};

/**
 * The warning an audit row carries when it no longer matches its chained
 * record, or null.
 *
 * Only `intact === false` speaks. A row the chain does not name (`chained:
 * false`) and a row with no verdict are unknown, and unknown is not rendered as
 * a failure; an intact row gets no badge either, because silence is the rail's
 * default and a "verified" mark on every row would stop being read.
 */
export function auditIntegrityNote(integrity: AuditRowIntegrity | null | undefined): string | null {
  if (!integrity || integrity.chained !== true || integrity.intact !== false) return null;
  const fields = (Array.isArray(integrity.mismatches) ? integrity.mismatches : [])
    .filter((m): m is string => typeof m === 'string' && m.length > 0)
    .map(m => AUDIT_MISMATCH_LABELS[m] ?? m.replace(/_/g, ' '));
  return (
    'This entry no longer matches its record on the audit chain' +
    (fields.length > 0 ? ` (${fields.join(', ')}).` : '.')
  );
}

/** How each recorded operation reads to a reviewer. Unknown operations are
 *  humanized from the raw value, never hidden. */
const AUDIT_EVENT_LABELS: Record<string, string> = {
  CREATE: 'created',
  EDIT: 'content saved',
  UPDATE: 'updated',
  COMMIT: 'committed to filing',
  REVERT: 'reverted to a prior revision',
  tracked_change_decision: 'tracked change decided',
  tracked_change_bulk_decision: 'tracked changes decided in bulk',
  comment_added: 'comment added',
  reply_added: 'reply added',
  REORDER_SECTIONS: 'sections reordered',
  RENAME: 'renamed',
  TRACK_CHANGES: 'track changes toggled',
  FREEZE: 'frozen',
  SIGN: 'signed',
  E_SIGN: 'e-signed',
  EXPORT: 'exported',
  EXPORT_HISTORY_DELETED: 'export record deleted',
  SUBMIT: 'submitted',
};

/**
 * The readable part of an audit row's `metadata`, or null when it carries
 * nothing a reviewer would act on.
 *
 * Two recorded shapes were being written and shown to nobody, and both answer
 * the first question an assessor asks:
 *
 *   tracked_change_decision — a reviewer accepted or REFUSED a redline. A
 *     rejection changes no text, so this row is the only place it exists.
 *   ai-draft-accept — which model and provider produced the text, and whether
 *     the author edited it before accepting (so "accepted AI draft" cannot
 *     vouch for words the model never wrote).
 *   comment_added / reply_added — the passage the comment was anchored to.
 *
 * Unrecognised metadata is left alone rather than dumped as JSON: a rail is a
 * reading surface, and raw payloads are not read.
 */
/**
 * Whether the rail may call a proposer verified.
 *
 * It needs the turn record to have vouched for THESE WORDS, not merely a
 * machine author id on the request, and not merely a turn that exists.
 *
 * The trail is append-only, and "verified" has not always meant the same
 * thing. Under DP-43 it was a bare "this turn is in this organization" lookup;
 * round 10 made it "this turn holds the words decided" and began recording
 * `servedBy` alongside it. Rows from before that are still in the trail,
 * including the case round 10 was written for — a person typing inside AnA's
 * pending insertion with track changes off, the database default, whose words
 * were filed as AnA's verified words. Those rows carry `verified: true` and no
 * model list, so the presence of the list is what distinguishes a round-10
 * verification from its namesake. Without that test the rail would put round
 * 10's claim on exactly the rows round 10 exists to catch.
 */
function proposerVouched(metadata: Record<string, unknown>): boolean {
  if (metadata.proposedByVerified !== true) return false;
  const src = metadata.source as { verified?: unknown; servedBy?: unknown } | null | undefined;
  return !!src && typeof src === 'object' && src.verified === true && Array.isArray(src.servedBy);
}

export function describeAuditMetadata(
  eventType: string | null,
  metadata: Record<string, unknown> | null,
): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const str = (k: string): string | null => {
    const v = (metadata as Record<string, unknown>)[k];
    return typeof v === 'string' && v.trim().length > 0 ? v : null;
  };

  if (eventType === 'tracked_change_decision') {
    const decision = str('decision');
    const kind = str('changeType');
    const text = str('text');
    const proposedBy = str('proposedBy');
    if (!decision) return null;
    const verb = decision === 'accept' ? 'accepted' : 'rejected';
    const what = kind === 'deletion' ? 'a proposed deletion' : kind === 'insertion' ? 'a proposed insertion' : 'a tracked change';
    /* The quoted text is what makes the row resolvable — accepting a
       suggestion strips its mark, so the document no longer holds it. */
    const quoted = text ? ` — “${text.length > 160 ? text.slice(0, 160) + '…' : text}”` : '';
    /* `proposedBy` is copied by the server from the editing client's own
       request (the editor's suggestion mark carries the author's display
       name), not derived from a verified identity. Rendered unqualified it
       read as the audit trail's finding; the qualifier keeps the two apart.
       Only a machine proposer whose turn record holds the words decided is
       verified (DP-43, round 10), and then the rail says so (round 13). */
    const by = proposedBy
      ? ` (proposed by ${proposedBy}, ${proposerVouched(metadata) ? 'verified against its turn record' : 'as recorded by the editing client'})`
      : '';
    /* The turn this came from is its own line (describeAuditSource): packed in
       here it made one run-on span in which the fact that matters most — a
       model that may not write regulatory text — sat mid-sentence. */
    return `${verb} ${what}${by}${quoted}`;
  }

  if (eventType === 'tracked_change_bulk_decision') {
    const decision = str('decision');
    const count = typeof metadata.count === 'number' ? metadata.count : null;
    if (!decision || count === null) return null;
    const verb = decision === 'accept' ? 'accepted' : 'rejected';
    /* Every change decided is on the row now, whole (2026-09-26), so the rail
       shows a sample of the first three and the export carries the rest.
       Rows written before that were capped at twenty changes and said how
       many they left out in `changesOmittedFromSummary`. The trail is
       immutable, so those rows still exist and still read that way: a
       truncated record that reads as complete is worse than one that admits
       its limit. */
    const omitted =
      typeof metadata.changesOmittedFromSummary === 'number'
        ? metadata.changesOmittedFromSummary
        : 0;
    const changes = Array.isArray(metadata.changes) ? metadata.changes : [];
    const sample = changes
      .slice(0, 3)
      .map(c => (c && typeof (c as any).text === 'string' ? (c as any).text : null))
      .filter((t): t is string => !!t)
      .map(t => `“${t.length > 80 ? t.slice(0, 80) + '…' : t}”`);
    return (
      `${verb} ${count} tracked change${count === 1 ? '' : 's'} in one action` +
      (sample.length > 0 ? ` — including ${sample.join(', ')}` : '') +
      (omitted > 0 ? ` (${omitted} more not summarised on this row)` : '')
    );
  }

  if (eventType === 'comment_added' || eventType === 'reply_added') {
    /* The passage the comment was anchored to, as the server stored it. The
       comment's own words are the row's content (and in the export); the
       quote is what places it in the document. */
    const quote = str('quote');
    if (!quote) return null;
    return `commented on “${quote.length > 80 ? quote.slice(0, 80) + '…' : quote}”`;
  }

  if (metadata.source === 'section-metadata') {
    /* A rename or a track-changes toggle. Renders what moved, from and to, so
       the row is resolvable without opening the section — the same standard the
       tracked-change rows above hold. */
    const changes = Array.isArray(metadata.changes) ? metadata.changes : [];
    const parts = changes
      .map((c) => {
        const ch = (c ?? {}) as Record<string, unknown>;
        const field = typeof ch.field === 'string' ? ch.field : null;
        const from = ch.from == null ? '—' : String(ch.from);
        const to = ch.to == null ? '—' : String(ch.to);
        if (field === 'title') return `title “${from}” → “${to}”`;
        if (field === 'code') return `code ${from} → ${to}`;
        if (field === 'track_changes') return `track changes turned ${ch.to ? 'on' : 'off'}`;
        return null;
      })
      .filter((p): p is string => !!p);
    return parts.length ? parts.join('; ') : null;
  }

  if (metadata.source === 'ai-draft-accept') {
    const gen = (metadata.generator ?? null) as Record<string, unknown> | null;
    const model = gen && typeof gen.model === 'string' ? gen.model : null;
    const provider = gen && typeof gen.provider === 'string' ? gen.provider : null;
    const who = [model, provider].filter(Boolean).join(' · ');
    const edited = metadata.draft_modified_on_accept === true;
    // The turn the draft was filed as (round 12): its record holds the prompt, the draft and the check.
    const turn = gen && typeof gen.turnRecordId === 'string' ? `, from AnA turn record ${gen.turnRecordId.slice(0, 8)}` : '';
    return (
      'accepted an AI draft' +
      (who ? ` generated by ${who}` : ' whose generating model was not recorded') +
      turn +
      (edited ? ', edited before accepting — the saved text is not the model’s wording' : '')
    );
  }

  return null;
}

/** A served model as a decision row records it (approved-models.ts QualifiedServedModel). */
interface RecordedServedModel {
  model?: unknown;
  qualified?: unknown;
  approvedForHighRisk?: unknown;
}

/** Why RULE 2 does not let a model's text stand, in the insert gate's words; null when it does. */
function servedModelRefusal(m: RecordedServedModel): string | null {
  if (m.qualified === true) return null;
  return m.approvedForHighRisk === true ? 'has not passed performance qualification' : 'is not approved for regulatory drafting';
}

/** "a", "a and b", "a, b and c". */
function listed(names: string[]): string {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * The AnA turn a decided change came from — its own line under the decision.
 *
 * The server records this on every tracked-change decision (round 10,
 * resolveTurnRecordSources): the turn verified against the WORDS decided, its
 * outcome, and every model that served it with RULE 2's verdict on each. The
 * rail showed none of it, so an inspector could not see that an accepted AnA
 * insertion came from a model that may not write regulatory text.
 *
 * ── "Served by", not "written by" ───────────────────────────────────────────
 * `servedBy` is every model that served ANY call in the turn
 * (services/ana/turn-record-models.ts). It does not say which model wrote the
 * decided words. The insert gate refuses to say "written in part by" for
 * exactly that reason, and a rail that said "written by A and B" would claim
 * more than the record holds — and would be plainly wrong on a DELETION, where
 * the words struck are not AnA's at all. "Served by" is what the row supports,
 * in one phrase that is true of every case.
 *
 * Null when the change names no turn, so the rail draws no second line.
 *
 * @param metadata a decision row's metadata — one change, or a bulk row
 */
export function describeAuditSource(metadata: Record<string, unknown> | null | undefined): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  if (Array.isArray(metadata.changes)) return describeBulkSource(metadata.changes);
  return describeOneSource(metadata.source);
}

/** The models a turn was served by, and what RULE 2 says of them. */
function servedClause(served: RecordedServedModel[]): string {
  if (served.length === 0) return ', whose record names no model.';
  const unnamed = served.filter((m) => !(typeof m.model === 'string' && m.model));
  if (unnamed.length > 0) {
    /* An unnamed model is not an unapproved one: there is nothing to judge, and
       the gate says so rather than returning a verdict. */
    return served.length === 1
      ? '; the record does not name the model that served it.'
      : '; the record does not name one of the models that served it.';
  }
  const names = served.map((m) => String(m.model));
  const refusals = served.flatMap((m) => {
    const why = servedModelRefusal(m);
    return why ? [`${String(m.model)} ${why}.`] : [];
  });
  return `, served by ${listed(names)}.${refusals.length ? ` ${refusals.join(' ')}` : ''}`;
}

/** One change's source line. */
function describeOneSource(source: unknown): string | null {
  if (!source || typeof source !== 'object') return null;
  const s = source as Record<string, unknown>;
  if (s.verified === false && typeof s.claimed === 'string') {
    return `Names AnA turn record ${s.claimed.slice(0, 8)}, not verified${typeof s.why === 'string' ? `: ${s.why}` : ''}.`;
  }
  if (s.verified !== true || typeof s.turnRecordId !== 'string') return null;
  const from = `From AnA turn record ${s.turnRecordId.slice(0, 8)}`;
  /* Absent and empty are different facts, and the gate draws the same line: a
     row that recorded no list cannot be reported as a record that names none. */
  const clause = Array.isArray(s.servedBy)
    ? servedClause(s.servedBy as RecordedServedModel[])
    : '; the models that served it were not recorded with this decision.';
  /* The turn's own outcome. The insert gate can only read whether the answer
     finished from live client state, which a reopened page does not have; the
     decision row keeps it, so the rail is the one place it survives. */
  const outcome = typeof s.outcome === 'string' && s.outcome !== 'answered' ? ` That turn ended: ${s.outcome}.` : '';
  return `${from}${clause}${outcome}`;
}

/** A bulk row: how many changes came from AnA turns, and what is wrong with them. */
function describeBulkSource(changes: unknown[]): string | null {
  const sources = changes
    .map((c) => (c && typeof c === 'object' ? (c as { source?: unknown }).source : null))
    .filter((src): src is Record<string, unknown> => !!src && typeof src === 'object');
  const verified = sources.filter((src) => src.verified === true);
  /* Counted, not dropped. A change whose named turn did NOT verify is the one
     an inspector most needs to see, and the single-decision line says so; a
     bulk row that silently kept only the verified ones hid it. */
  const unverified = sources.filter((src) => src.verified === false && typeof src.claimed === 'string');
  if (verified.length === 0 && unverified.length === 0) return null;
  const refused = verified.filter((src) =>
    (Array.isArray(src.servedBy) ? (src.servedBy as RecordedServedModel[]) : []).some(
      (m) => typeof m.model === 'string' && m.model && servedModelRefusal(m),
    ),
  );
  const parts: string[] = [];
  if (verified.length > 0) {
    parts.push(`${verified.length} ${verified.length === 1 ? 'change from an AnA turn' : 'changes from AnA turns'}.`);
  }
  if (refused.length > 0) {
    parts.push(`${refused.length} of them ${refused.length === 1 ? 'was' : 'were'} served by a model that is not allowed to write regulatory text.`);
  }
  if (unverified.length > 0) {
    parts.push(`${unverified.length} ${verified.length > 0 ? 'more ' : ''}${unverified.length === 1 ? 'names' : 'name'} a turn that does not verify.`);
  }
  return parts.join(' ');
}

/**
 * The AnA turn a decided change came from, on its own line under the decision.
 * It is the part an inspector looks for, and packed into the sentence above it
 * read as one more clause in a run-on.
 */
function AuditSourceLine({ metadata }: { metadata: Record<string, unknown> | null }) {
  const source = describeAuditSource(metadata);
  if (!source) return null;
  return (
    <span style={{ fontSize: 12, color: 'var(--text-300)' }} data-testid="audit-source">
      {source}
    </span>
  );
}

function auditEventLabel(raw: string | null): string {
  if (!raw) return 'recorded';
  return AUDIT_EVENT_LABELS[raw] ?? raw.replace(/_/g, ' ').toLowerCase();
}

/** POST /sections/:id/ai/deficiency-scan — a handful of mechanical checks over the
 *  SAVED section (length, module keywords, tables/figures, placeholders,
 *  structure). The handler itself refuses to call this a compliance
 *  determination (`signal_type: 'heuristic_quality'`); the panel keeps that
 *  framing rather than dressing regexes up as review. */
interface ScanDeficiency {
  type: string;
  severity: 'high' | 'medium' | 'low' | string;
  message: string;
  recommendation?: string | null;
  location?: string | null;
}
/**
 * What the canonical record says the open section must contain, as the scan
 * serves it (server/routes/authoring.router.ts, `recordRequirementsFor`).
 *
 * READ-ONLY. The record's elements are descriptions ("Product development
 * rationale linking unmet need, MOA, and program design (2.5.1)"), which no
 * keyword test can verify — so the scan does not test them and the panel says
 * so. `indexed: false` carries the resolver's own reason and must read as "not
 * indexed", never as an empty list and never as "nothing required".
 */
interface RecordRequirements {
  indexed: boolean;
  /** Whose entry answered: the section's own, its containing section's, or its children. */
  source?: 'exact' | 'ancestor' | 'parent';
  /** The code whose entry answered. */
  answered_by?: string;
  title?: string;
  elements?: string[];
  /** For a parent code: the sections it contains, each with its own requirements. */
  contains?: Array<{ code?: string; title?: string }>;
  /** How many contained sections the server's cap withheld, so the list is never silently short. */
  contains_omitted?: number;
  verified_by_this_check?: boolean;
  note?: string;
  /** basisLabel() from the server — recall never reads as the regulator's text. */
  basis?: string;
  /** Present when `indexed` is false: the resolver's own words. */
  reason?: string;
}

/**
 * Whether the open DOCUMENT agrees with itself: the same figure, in the same frame, stated twice in
 * two sections with two different values (server: authoring/document-figure-consistency.ts). Absent
 * when the sections could not be read — never an empty result, which would read as "it agrees".
 */
interface DocumentFigureConsistency {
  verdict: 'conflicts_found' | 'no_conflict_among_compared' | 'nothing_compared';
  compared: number;
  conflicts: number;
  comparisons?: Array<{
    outcome: 'conflict' | 'consistent';
    measure?: string;
    arm?: string;
    a?: { section?: string; values?: string[] };
    b?: { section?: string; values?: string[] };
  }>;
  truncated?: boolean;
}

interface ScanResults {
  section_id: string;
  section_code?: string;
  /** The record's statement of required content, or its honest absence. */
  record_requirements?: RecordRequirements;
  /** Whether the open document's own figures agree with each other, across its sections. */
  document_figure_consistency?: DocumentFigureConsistency;
  quality_score?: number;
  status?: string;
  deficiencies: ScanDeficiency[];
  deficiency_count?: number;
  /** The denominator behind `quality_score`, and how many of those passed. The
   *  panel names the server's count rather than a literal, so the sentence
   *  cannot drift from the checks the handler actually runs. */
  checks_run?: number;
  checks_passed?: number;
  scanned_at?: string;
}

const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

interface AuthComment {
  id: string;
  section_id: string | null;
  body: string;
  status: string | null;
  author_name: string | null;
  section_code: string | null;
  section_title: string | null;
  created_at: string | null;
  /** Range anchor recorded at creation (authoring_comments.anchor JSONB). */
  anchor?: unknown;
  /** Threaded replies — the server nests them under each top-level comment
   *  (GET /documents/:id/comments), oldest first. Absent on reply rows. */
  replies?: AuthComment[];
  /** Resolution record — the server has captured all three since the store
   *  shipped (PATCH /comments/:id), and a status chip alone is not a record:
   *  the rail shows WHO resolved a thread, when, and their stated reason. */
  resolved_by?: string | null;
  resolved_at?: string | null;
  resolution_note?: string | null;
}

/** Runtime guard over the JSONB the server returns verbatim. */
function asTextRangeAnchor(v: unknown): CommentAnchorPayload | null {
  if (!v || typeof v !== 'object') return null;
  const a = v as Record<string, unknown>;
  return a.kind === 'text-range' && typeof a.quote === 'string'
    ? (a as unknown as CommentAnchorPayload)
    : null;
}



/**
 * A recorded citation of a canonical source, as the server reports it
 * (server/services/clinical-regulatory-evidence/source-usage.service.ts).
 *
 * `state` is the citation's standing against the source's content TODAY:
 *   current      the checksum recorded at cite time still matches
 *   changed      the source's content moved after this section cited it
 *   unverified   no checksum was recorded — nothing to compare, nothing claimed
 *   unresolved   the source no longer resolves for this tenant
 * Never inferred here; it is computed server-side from stored checksums.
 */
interface SectionSource {
  citationId: string;
  citedAt: string | null;
  citationText: string | null;
  citedChecksum: string | null;
  state: 'current' | 'changed' | 'superseded' | 'unverified' | 'unresolved';
  source: {
    id: number;
    title: string | null;
    checksum: string | null;
    extractionStatus: string | null;
    mimeType: string | null;
  } | null;
}

/** A source in the project's Data Room, for the "add a source" picker. */
export type ProjectSource = ProjectSourceRecord;

/** How each citation state reads to an author. */
function sourceStateLabel(s: SectionSource): {
  text: string;
  tone: 'ok' | 'warn' | 'muted';
  hint: string;
} {
  switch (s.state) {
    case 'current':
      return {
        // Mirrors SourceTracer deliberately — see the note there. The old
        // wording asserted the document was unchanged, which nothing here can
        // establish: a revised document becomes a new source row rather than a
        // changed checksum.
        text: 'Matches the source record as stored',
        tone: 'ok',
        hint: 'The checksum recorded at cite time still matches this source record. That is a statement about the RECORD, not the document: a revised document is ingested as a NEW source, which this citation does not point at, so a revision upstream is not detected here.',
      };
    case 'superseded':
      return {
        text: 'Source has been replaced since cited',
        tone: 'warn',
        hint:
          'A newer version of this document was ingested after this section cited it. The ' +
          'checksum still matches, because a source keeps its bytes and its hash forever — ' +
          'the revision was recorded as a successor, and that is what says this citation ' +
          'points at a superseded version.',
      };
    case 'changed':
      return {
        text: 'Source changed since cited',
        tone: 'warn',
        hint: 'This section was drafted from earlier content. Nothing has been rewritten — re-read the source and decide whether it changes what this section says.',
      };
    case 'unresolved':
      return {
        text: 'Source unavailable with current access',
        tone: 'warn',
        hint: 'This recorded citation’s source could not be resolved within your current access. The citation remains recorded.',
      };
    default:
      return {
        text: 'Not checked against content',
        tone: 'muted',
        hint: 'No checksum was recorded for this citation, so no claim is made about whether the source has changed.',
      };
  }
}

/* ── Helpers ── */

/** GET via apiRequest without throwing — honest {ok,status,body}. */
async function readJson<T = any>(
  path: string, headers?: Record<string, string>
): Promise<{ ok: boolean; status: number; body: T | null }> {
  try {
    const res = headers ? await apiRequest('GET', path, undefined, headers) : await apiRequest('GET', path);
    const body = (await res.json().catch(() => null)) as T | null;
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    // apiRequest throws on a non-2xx other than 401; the status still says
    // what the answer was (a 403 is a refusal, not a failed read).
    return { ok: false, status: err instanceof ApiRequestError ? err.status : 0, body: null };
  }
}

function verifiedRecoveryStructure(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value !== 'object') return false;
  const structure = value as Record<string, unknown>;
  const strings = (items: unknown) => Array.isArray(items) && items.every(item => typeof item === 'string');
  return strings(structure.duplicateCodes) && typeof structure.outOfOrder === 'boolean' && strings(structure.suggestedOrder);
}

function verifiedRecoverySections(body: { success?: boolean; sections?: AuthSection[]; structure?: unknown } | null, docId: string): boolean {
  return body?.success === true && verifiedRecoveryStructure(body.structure) && Array.isArray(body.sections) && body.sections.every(row =>
    row && typeof row.id === 'string' && row.id.trim() && row.doc_id === docId && typeof row.code === 'string'
    && typeof row.title === 'string' && (row.content === null || typeof row.content === 'string'));
}

function usableSectionRead<T extends { success?: boolean; sections?: AuthSection[] }>(ok: boolean, body: T | null, docId: string, recovery: boolean): body is T {
  if (!ok || !body) return false;
  return !recovery || verifiedRecoverySections(body, docId);
}

/* ── What the caller may do to this document (GE-P-3, 2026-09-28) ──
   GET /api/authoring/docs/:docId returns `access`: per governed act, the
   decision the write route will make for this caller (callerDocumentAccess in
   server/routes/authoring.router.ts), or null where the server could not
   determine it. A refused act is shown DISABLED with the server's reason as
   visible text the control is described by — never hidden. Anything unknown
   (the read failed, no `access`, a malformed entry) is left enabled and the
   write route decides: this never invents a denial or an allowance. */
export interface DocumentActGate {
  allowed: boolean;
  reason: string | null;
}
export interface DocumentAccess {
  edit?: DocumentActGate | null;
  freeze: DocumentActGate | null;
  esign: DocumentActGate | null;
  /** The review signature alone (E-sign, meaning Review): a Reviewer grant
   *  suffices for it (QA 2026-10-08, j4). */
  esignReview: DocumentActGate | null;
  fileToVault: DocumentActGate | null;
  assignReview: DocumentActGate | null;
  /** Place into filing: its two writes require regulatory-author. */
  placeIntoFiling: DocumentActGate | null;
}
export const UNKNOWN_DOCUMENT_ACCESS: DocumentAccess = {
  edit: null,
  freeze: null,
  esign: null,
  esignReview: null,
  fileToVault: null,
  assignReview: null,
  placeIntoFiling: null,
};

function readActGate(raw: unknown): DocumentActGate | null {
  if (!raw || typeof raw !== 'object') return null;
  const g = raw as { allowed?: unknown; reason?: unknown };
  if (typeof g.allowed !== 'boolean') return null;
  return { allowed: g.allowed, reason: typeof g.reason === 'string' && g.reason.trim() ? g.reason : null };
}

/** Parse the server's `access`; anything missing or malformed is unknown. */
export function readDocumentAccess(raw: unknown): DocumentAccess {
  if (!raw || typeof raw !== 'object') return UNKNOWN_DOCUMENT_ACCESS;
  const a = raw as Record<string, unknown>;
  return {
    edit: readActGate(a.edit),
    freeze: readActGate(a.freeze),
    esign: readActGate(a.esign),
    esignReview: readActGate(a.esignReview),
    fileToVault: readActGate(a.fileToVault),
    assignReview: readActGate(a.assignReview),
    placeIntoFiling: readActGate(a.placeIntoFiling),
  };
}

/**
 * What a section save's `filing` field says, as a sentence appended to the save
 * confirmation; '' when the server reported nothing (QA 2026-10-08, j4: the
 * field was never read, so a save that did not reach the filing read exactly
 * like one that did). The server's own reason is shown as given.
 */
export function filingCommitNote(filing: unknown): string {
  if (!filing || typeof filing !== 'object') return '';
  const f = filing as { committed?: unknown; reason?: unknown; partOf?: unknown };
  /* QA 2026-10-08, walk 2: a section under an undivided outline node (2.5.1 of
     the 2.5 Clinical Overview) goes into that node with the document's other
     sections there; the server names the node as `partOf`. */
  if (f.committed === true && typeof f.partOf === 'string' && f.partOf.trim()) {
    return ` The text was committed to the filing as part of its section ${f.partOf}, with this document’s other sections under ${f.partOf}.`;
  }
  if (f.committed === true) return ' The text was committed to the filing.';
  if (f.committed === false) {
    const why = typeof f.reason === 'string' && f.reason.trim() ? f.reason.trim() : 'the server gave no reason.';
    return ` The text is saved in Authoring but not in the filing: ${why}`;
  }
  return '';
}

/**
 * What a section save's `machineText` field says, as a sentence appended to the
 * save confirmation; '' when the save claimed nothing or everything it claimed
 * was credited (AnA reasoning round 15, SEC-A-7 door 1).
 *
 * Without this the author sees an ordinary "Section saved" while the record
 * now says they asserted words they believed were attributed to AnA. The
 * server's own reason is shown as given — it is the reason the record keeps.
 *
 * A claim whose MODEL the governed-write rule refuses never reaches here: that
 * save is refused outright, and the author reads the 403's own sentence.
 */
export function machineTextNote(machineText: unknown): string {
  if (!machineText || typeof machineText !== 'object') return '';
  const m = machineText as { refused?: unknown };
  const refused = Array.isArray(m.refused) ? m.refused : [];
  const reasons = [
    ...new Set(
      refused
        .map((r) => (r as { why?: unknown })?.why)
        .filter((why): why is string => typeof why === 'string' && why.trim().length > 0),
    ),
  ];
  if (reasons.length === 0) return '';
  const passages = refused.length === 1 ? 'One passage' : `${refused.length} passages`;
  const was = refused.length === 1 ? 'was' : 'were';
  return (
    ` ${passages} you accepted from AnA ${was} recorded as your own words, because ` +
    `${reasons.join('; ')}. The record says so.`
  );
}

/** True when the server refuses every signature but the review signature. */
export function esignReviewOnly(access: DocumentAccess): boolean {
  return !!actRefusal(access.esign) && access.esignReview?.allowed === true;
}

/** The sentence to show for a refused act; null when allowed OR unknown. */
export function actRefusal(gate: DocumentActGate | null | undefined): string | null {
  if (!gate || gate.allowed) return null;
  return gate.reason ?? 'The server does not permit this for your account on this document.';
}

/** True when the keydown should NOT close a rail or collapse the canvas:
 *  inside a dialog, the editor's own document, or a text control — each of
 *  those owns Escape. Lives here (moved 2026-09-28 from DocumentCanvas.tsx,
 *  which re-exports it) because the workbench's rails ask the same question
 *  (GA-4) and DocumentCanvas already imports this module. */
export function escapeBelongsToInner(target: KeyboardEvent['target']): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest('[role="dialog"], [role="alertdialog"], .ProseMirror, input, textarea, select, [contenteditable="true"]'),
  );
}

/** A right rail's own close control, matching AnA's (`ed-comments-close`).
 *  2026-09-28, coverage-gap sweep GA-4: six rails had none. */
function RailClose({ label, onClose }: { label: string; onClose: () => void }) {
  return (
    <button type="button" className="ed-comments-close" aria-label={label} title={label} onClick={onClose}>
      {I.close}
    </button>
  );
}

function num(v: number | string | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Coarse relative time from an ISO timestamp; '' when absent. */
function relTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  const mins = Math.floor(secs / 60);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (days > 0) return `${days} d ago`;
  if (hrs > 0) return `${hrs} h ago`;
  if (mins > 0) return `${mins} min ago`;
  return 'just now';
}

/* BP-W0-7. This listed three states and the document lifecycle has five. Freeze
   writes FROZEN and there was no option that could select it, so a sealed
   document — the one a reviewer most needs to open — could not be listed at all.

   `all` is first and is the default. A status filter that silently hides records
   is worse than no filter on a surface whose job is to find a document, and the
   previous default of `draft` meant the editor opened onto a view that excluded
   everything already submitted. Selecting a state is now a deliberate narrowing
   rather than the starting position. */
const STATUSES = ['all', 'draft', 'in_review', 'approved', 'frozen'];


/** The document rows the host lists — the shape GET /api/authoring/docs returns. */
export type { AuthDoc };

/** What an embedding host may do with the open section (see `embedded.onEditorBridge`). */
export interface EditorBridge {
  docId: string;
  sectionId?: string;
  /** Actual sections this document holds; opening one uses the unsaved-work guard. */
  sectionLabels?: Record<string, string>;
  openSection?: (sectionId: string) => void;
  sectionCode: string;
  sectionTitle: string;
  /** The host's actual read/edit view, so a remedy can open the section editor. */
  viewMode?: 'section' | 'document';
  /** False for a sealed document or assembled Document view: readable, but no insert. */
  editable: boolean;
  /** The real host's reason, including assembled Document view, when read-only. */
  insertRefusal?: string | null;
  /** The document and section open, as this editor's own chat sends them; null with no project. */
  authoringContext: AuthoringContextPack | null;
  /** Saved evidence/import identity, shared by the editor's chat hosts. */
  moduleContext?: Record<string, unknown>;
  /**
   * Insert text as an attributed tracked suggestion; false when the section
   * cannot take it. AnA's text also needs the record status of the turn that
   * wrote it and whether that answer finished, and is refused unless it
   * finished and the governed-write rule admits every model that wrote it
   * (anaInsertGate.ts, rounds 11 and 13).
   */
  insert: (text: string, author: SuggestionAuthor, record?: AnaTurnRecordStatus, unfinished?: boolean) => boolean;
  /**
   * Redline one quoted passage of the open section as an attributed tracked
   * suggestion (the editor handle's `proposeReplacement`). Asynchronous: the
   * base hash is checked over the loaded content with WebCrypto. Refuses
   * `model-not-approved`, `wrong-section`, `no-base`, `stale` and
   * `not-editable` for itself (see EditorBridgeProposeResult); otherwise the
   * editor's own refusals.
   *
   * `record` and `unfinished` are the AnA turn's, exactly as `insert` takes
   * them, and are checked the same way: this door redlines AnA's words into
   * the section and the person's next Save stores them, so the governed-write
   * rule holds here too. Omitted for a person's own redline, which the rule
   * is not about; omitted for AnA's, it refuses.
   */
  propose: (
    proposal: EditorBridgeProposal,
    author: SuggestionAuthor,
    record?: AnaTurnRecordStatus,
    unfinished?: boolean,
  ) => Promise<EditorBridgeProposeResult>;
  /** Observe only the current editor's actual application state; unavailable across scopes. */
  getProposalState?: (receipt: EditorProposalReceipt) => ProposalState;
  subscribeProposalChanges?: (listener: () => void) => () => void;
  canPropose?: () => boolean;
}

/** An anchored proposal as the conversation hands it to the open section. */
export interface EditorBridgeProposal extends ReplacementProposal {
  /** The section the proposal is for. Only the open section takes it. */
  sectionId: string;
  /**
   * The version of the section AnA read, as the section reader reports it
   * (server/services/authoring/authoring-read.ts): `baseSha256` is the hex
   * SHA-256 of the section's STORED content, `baseUpdatedAt` its
   * `updated_at`. At least one is required, and every one given must be the
   * section as this editor loaded it.
   */
  baseSha256?: string | null;
  baseUpdatedAt?: string | null;
}

/**
 * Why the bridge refused, beyond the editor's own reasons:
 *   - model-not-approved: the governed-write rule does not admit the AnA turn
 *     these words came from, or this view was not told which models served it.
 *     Carries the reason as the sentence `anaInsertRefusal` returned, so a
 *     caller shows the wording round 13 settled on instead of inventing its
 *     own — the mistake that produced a toast naming a cause that was untrue.
 *     (That sentence says "inserted", which is the insert door's verb. When a
 *     caller renders it, it should become this door's: see round 14's README.)
 *   - wrong-section: the proposal is for a section that is not the open one,
 *     so its quote was read from other text;
 *   - no-base: it names no version of the section, so nothing shows the quote
 *     was chosen against the text that is there now;
 *   - stale: the section was saved (or reverted, or the editor reopened) after
 *     AnA read it, so the quote was chosen against text that is no longer the
 *     record.
 */
export type EditorBridgeProposeResult =
  | { ok: true; receipt?: EditorProposalReceipt }
  | { ok: false; reason: 'model-not-approved'; message: string }
  | { ok: false; reason: ProposeRefusal | 'stale' | 'wrong-section' | 'no-base' };

/**
 * Whether a proposal's base is the section version this editor loaded. Both
 * are `updated_at` values, which reach the client through different
 * serializers (a tool result, a route row), so the same instant may be written
 * with or without milliseconds: compared as instants when both parse, as
 * strings otherwise. A base with no loaded version to compare is not a match.
 */
function isLoadedVersion(base: string, loaded: string | null): boolean {
  if (loaded == null) return false;
  const a = Date.parse(base);
  const b = Date.parse(loaded);
  if (Number.isFinite(a) && Number.isFinite(b)) return a === b;
  return base === loaded;
}

/**
 * Hex SHA-256 of `text` as UTF-8 — what the section reader computes in SQL
 * (`encode(sha256(convert_to(content, 'UTF8')), 'hex')`) — or null where
 * WebCrypto is not available or fails, which the bridge treats as a base it
 * cannot confirm.
 */
async function sha256Hex(text: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  try {
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

/** The section a bridge was built for, as its editor loaded it. */
interface LoadedSection {
  id: string;
  updatedAt: string | null;
  /** Hex SHA-256 of the stored content, computed once, on first need. */
  sha256: () => Promise<string | null>;
}

/**
 * Why a proposal's base is not the section as loaded — `no-base` when it
 * names none, `stale` when any it names differs — or null when it is.
 */
async function baseRefusal(
  proposal: EditorBridgeProposal,
  loaded: LoadedSection,
): Promise<'no-base' | 'stale' | null> {
  const baseSha = proposal.baseSha256?.trim().toLowerCase() || null;
  const baseAt = proposal.baseUpdatedAt?.trim() || null;
  if (!baseSha && !baseAt) return 'no-base';
  if (baseAt && !isLoadedVersion(baseAt, loaded.updatedAt)) return 'stale';
  if (baseSha && (await loaded.sha256()) !== baseSha) return 'stale';
  return null;
}

export interface DocumentWorkbenchProps {
  onNav: (id: string) => void;
  liveDrive?: OwnedSurfaceViewProps['liveDrive'];
  /** The documents the workbench may navigate between. The Authoring surface
   *  passes its filtered list; the canvas passes exactly one. */
  docs: AuthDoc[];
  docsState: 'loading' | 'ready' | 'error';
  /** The list's status filter, for the tree header and the honest-miss
   *  notices. `onStatusChange` absent means the filter is not the host's to
   *  offer (the canvas), so the select is not drawn. */
  status: string;
  onStatusChange?: (status: string) => void;
  /** Re-read the list — after a create, a freeze, a filing change. */
  reloadDocs: () => Promise<void>;
  /** Confirm that the current native host applied its verified recovery read. */
  refreshCreationContext?: () => Promise<boolean>;
  /** The designated project (regulatory_programs UUID) or null. */
  programId: string | null;
  /** Pin the workbench to one document (the canvas). The tree lists only it
   *  and no document switch is offered. */
  pinnedDocId?: string | null;
  /** Mounted inside a conversation: draws "Back to conversation" and uses
   *  that host's composer for every AnA request.
   *  `hostShowsBack` when the host's own chrome already carries the way back —
   *  the document canvas's bar does — so this component does not draw a
   *  second one into its crumb trail. `onBack` is still the one callback the
   *  way back runs, whoever draws the control. */
  embedded?: {
    onBack: () => void;
    backLabel?: string;
    hostShowsBack?: boolean;
    /** The host is told which section is open and given its suggestion door,
     *  or null with no section open. A sealed document is reported as not editable. */
    onEditorBridge?: (bridge: EditorBridge | null) => void;
    /** A section the host asks to show; each new nonce is one request. */
    focusSection?: { id: string; nonce: number } | null;
  } | null;
  /** Surface-action bus id to register under, or null to register nothing —
   *  the canvas must not claim the bus while ConversationThread is on. */
  surfaceActionId?: string | null;
  /** Consume the editor deep-link and navigation-params channels on mount.
   *  Only the Authoring surface is a navigation destination. */
  consumeDeepLinks?: boolean;
  /** Where an ask goes when the host owns the conversation. */
  onAsk?: ((text: string, savedOrigin?: AskOrigin) => void) | null;
  /** Keep the open buffer until the existing leave decision accepts a new scope. */
  pendingProgramSwitch?: { id: string; label: string; onContinue: () => void; onCancel: () => void } | null;
  programSwitchHeld?: boolean;
}

function contextForWorkbench({ projectId, documentId, document, section, filing, sections }: {
  projectId: string | null; documentId: string | null; document: AuthDoc | null; section: AuthSection | null;
  filing: { id: string; agency: string; doc_type: string } | null; sections: AuthSection[];
}): AuthoringContextPack | null {
  if (!projectId) return null;
  return {
    projectId, workflowStage: 'section-workspace', artifactId: documentId ?? undefined,
    ...(document ? { artifactStatus: document.status, moduleCode: document.module ?? undefined } : {}),
    ...(section ? { sectionCode: section.code, sectionTitle: section.title, sectionId: section.id,
      sectionUpdatedAt: section.updated_at ?? undefined } : {}),
    ...(filing ? { dossierId: filing.id, regulatorBody: filing.agency, submissionType: filing.doc_type } : {}),
    linkedSectionCodes: sections.filter(s => s.id !== section?.id).map(s => s.code).filter(Boolean),
  };
}

/* ════ Document Authoring surface ════ */

/**
 * Why this editor cannot take an insert at all, whoever wrote the answer; null
 * when it can.
 *
 * These are the HOST's refusals and they come before the governed-write rule:
 * a frozen document takes no edit, and document view assembles sections for
 * reading and edits none of them. The sibling "Draft from sources" control
 * refuses both the same way, in these words. The offer used to be drawn live
 * in both states and fail on the click — the discovery-by-failure that the
 * disabled-with-a-reason pattern exists to replace. The canonical conversation
 * keeps this host's refusal visible alongside its disabled offer.
 */
function editorInsertRefusal(docSealed: boolean, viewMode: 'section' | 'document', sectionCode: string): string | null {
  if (docSealed) return 'This document is frozen — its content cannot be edited, so nothing can be inserted into it.';
  if (viewMode === 'document') return `Document view assembles sections for reading. Switch to Section view to insert into ${sectionCode}.`;
  return null;
}

export function DocumentWorkbench({
  onNav,
  docs,
  docsState,
  status,
  onStatusChange,
  reloadDocs,
  refreshCreationContext,
  programId,
  pinnedDocId = null,
  embedded = null,
  surfaceActionId = null,
  consumeDeepLinks = false,
  onAsk = null,
  pendingProgramSwitch = null,
  programSwitchHeld = false,
}: DocumentWorkbenchProps) {
  // `module` is no longer a filter the user drives — the filing outline is. It
  // survives only as the value AuthoringCreateExport needs when creating a new
  // document, and it now follows the selected section instead of a dropdown
  // that defaulted every filing type to "M3".
  const [module, setModule] = useState('M3');
  const [creationNoticeContainer, setCreationNoticeContainer] = useState<HTMLDivElement | null>(null);

  /* ── The project's governed filing outline ──
     The tree this canvas navigates by. A project's structure is fixed at
     creation: the wizard writes program_type + primary_agency, and
     scaffoldProjectDocuments() inserts the matching rule pack's whole section
     tree. A BLA is 71 nested sections, a 510(k) is A/B/C/D/E, a CER is A0–A8.
     Until now none of it reached here — the canvas showed a Module × status
     dropdown pair, defaulted to M3, identical for every filing type. */
  const projectIdForOutline = programId;
  /* The program's name and phase, for the header. Read from the one program
     route (GET /api/c2c/projects/:id); null while unread or with no program. */
  const program = useProgramSummary(programId);

  /* ── The active document ──
     DERIVED, not reconciled after the fact. The surface's loader used to set
     the active id in the same update as the list; with the list now a prop,
     an effect that re-selected after the list landed cost one extra commit —
     a render in which the list was present and no document was active, and
     the header's Document toggle sat disabled for it. The selection rule is
     the loader's, unchanged: keep the chosen document if it survives the new
     list, else the first; a pinned document (the canvas) is never switched
     away from; nothing is active while the first list is in flight, and
     nothing is active after a failed read (an empty list). */
  const [chosenDocId, setActiveDocId] = useState<string | null>(pinnedDocId);
  const activeDocId = useMemo<string | null>(() => {
    if (pinnedDocId) return pinnedDocId;
    if (chosenDocId && docs.some(d => d.id === chosenDocId)) return chosenDocId;
    return docs[0]?.id ?? null;
  }, [pinnedDocId, chosenDocId, docs]);

  // Sections of the active document.
  const [sections, setSections] = useState<AuthSection[]>([]);
  const [sectionsState, setSectionsState] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle'
  );
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  // The canonical editor owns the in-flight buffer; the section row in
  // `sections` is the last-saved server truth (saves adopt the returned row).
  // `editorDirty` mirrors unsaved-changes state for the header Save button and
  // the leave-guard on filing actions.
  const [editorDirty, setEditorDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  /* ── REASON FOR CHANGE — stated once per section, carried on every save ──
   *
   * §11.10(d)/(e) wants to know WHY a governed record changed. Nothing on this
   * surface ever asked: only the AI-draft dialog sent `changeReason`, so every
   * ordinary save arrived without one and the filing's version ledger recorded
   * that it was not stated.
   *
   * Sticky rather than per-save, which is the shape this repo already settled
   * on for the same problem in ProtocolDev's schedule-of-assessments grid: the
   * governed router wants a reason on every write, and "prompting per tick
   * would be unusable — so the reason is stated ONCE for the editing session…
   * what the regulation does not ask for is the same sentence retyped forty
   * times." Save and ⌘S can each fire many times while working through one
   * section, and each one is a real write.
   *
   * It gates SAVE, not editing. The SoA grid can sit read-only until a reason
   * is given because it is one small governed table; this is the surface a
   * writer spends the day in, and locking the canvas would make the editor
   * hostile to the work it exists for. So: type freely, and state why before
   * the record moves.
   *
   * Cleared on section change, because it describes THAT section's edit. A
   * reason carried silently from one section to the next would attach one
   * author's stated intent to a different part of the filing — a fabrication
   * of exactly the kind the absent-reason handling was built to avoid.
   *
   * The ref exists because `saveSectionContent` is a useCallback that
   * `RichSectionEditor` holds across renders; reading state through it
   * directly would capture whatever the reason was when the callback was
   * built. */
  const [changeReason, setChangeReason] = useState('');
  /** The persistent note stating the reason rule (GA-1, 2026-09-28). */
  const reasonNoteId = useId();
  const changeReasonRef = useRef('');
  useEffect(() => {
    changeReasonRef.current = changeReason;
  }, [changeReason]);
  /* A reason describes the edit to ONE section. Carrying it across a section
     change would attach one stated intent to a different part of the filing. */
  useEffect(() => {
    setChangeReason('');
  }, [activeSectionId]);
  /** Bumped when the server replaces content out from under the editor
   *  (revert) so the canvas remounts on the new truth. */
  const [contentEpoch, setContentEpoch] = useState(0);
  /* The RAG-grounded drafting panel. Open state only — the panel owns the
     draft, because a draft that outlives its own panel is a draft whose
     section scope nobody is enforcing. */
  const [aiDraftOpen, setAiDraftOpen] = useState(false);
  const editorRef = useRef<RichSectionEditorHandle | null>(null);
  /** The signed-in author, for suggestion attribution and comment anchors. */
  const { user } = useAuth();

  /* ── A comment being anchored to a text range ──
     The editor's Comment button hands over the selection's anchor and waits;
     the comments rail collects the body and posts, and the server-issued
     comment id resolves the wait so the editor can apply the highlight mark.
     One pending request at a time; superseding or leaving resolves null. */
  const pendingAnchorRef = useRef<{
    anchor: CommentAnchorPayload;
    resolve: (id: string | null) => void;
  } | null>(null);
  const [pendingAnchor, setPendingAnchor] = useState<CommentAnchorPayload | null>(null);
  /** The comment whose anchored range was last clicked in the canvas. */
  const [focusedCommentId, setFocusedCommentId] = useState<string | null>(null);

  /* Section view edits ONE section in a box. Document view assembles every
     section into one continuous read, which is the thing an author is actually
     building and the thing a reviewer receives. Editing stays section-scoped —
     clicking a section in the document takes you to it. */
  const [viewMode, setViewMode] = useState<'section' | 'document'>('section');

  // Right rail: AnA, revision history, comments, or the section's sources.
  const [rail, setRail] = useState<
    | 'history'
    | 'comments'
    | 'sources'
    | 'signatures'
    | 'audit'
    | 'exports'
    | 'vault'
    | 'tasks'
    | 'access'
    | null
  >(null);
  /* The two governed dialogs this workbench opens itself: filing the document
     into the project vault (POST /docs/:id/file-to-vault) and sending it for
     review (POST /documents/:id/request-review, then each reviewer's task,
     POST /api/tasks/tasks: SendForReviewDialog.tsx). Both are closed until
     asked for. */
  const [fileToVaultOpen, setFileToVaultOpen] = useState(false);
  const [sendForReviewOpen, setSendForReviewOpen] = useState(false);
  /* Bumped after a task is created so the Tasks rail re-reads. */
  const [tasksEpoch, setTasksEpoch] = useState(0);
  /* What the document header says about where its content came from — the
     provenance GET /docs/:id returns (source ana / seed / import, the model
     the gateway reported, the conversation). Null until read; a failed read
     is a failed read, and the header then makes no origin claim. */
  const [docProvenance, setDocProvenance] = useState<DocumentProvenance | null>(null);
  const [docTemplateContext, setDocTemplateContext] = useState<SavedTemplateContext | null>(null);
  /* S5a: the save's check of the draft's figures against its cited sources. */
  const [docFigures, setDocFigures] = useState<FigureCheckSummary | null>(null);
  const [docClaims, setDocClaims] = useState<ClaimsCheckSummary | null>(null);
  /** What this caller may do to the open document (GE-P-3); unknown until read. */
  const [docAccess, setDocAccess] = useState<DocumentAccess>(UNKNOWN_DOCUMENT_ACCESS);
  const assignRefusalId = useId();
  const vaultRefusalId = useId();
  /* Bumped after a save or an export so the Exports rail re-reads. A save
     changes the live content hash, which is exactly what its verdict compares
     against — a rail left stale would keep saying "matches the last export"
     about text that no longer matches it. */
  const [exportsEpoch, setExportsEpoch] = useState(0);
  /** The open section, readable from the tracked-change callback. That callback
   *  is configured once per editor mount, so closing over the state value would
   *  attribute a decision to whichever section was open when the canvas
   *  mounted. */
  const activeSectionIdRef = useRef<string | null>(null);
  /** Decisions awaiting their coalesced flush, and whether one is scheduled. */
  const pendingDecisionsRef = useRef<SuggestionDecision[]>([]);
  const decisionFlushRef = useRef(false);
  /**
   * Accept/reject decisions recorded for the CURRENT section since it was last
   * saved. Every decision POSTs and audits immediately — independent of
   * whether the content that reflects it has been saved (accepting strips the
   * mark from the live editor doc; only Save/⌘S/the guard's Save persists
   * that). So a reviewer can accept N changes, then leave without saving, and
   * the audit trail permanently records N acceptances while the saved section
   * still shows them pending. This count exists only to make the unsaved-work
   * guard say so — see UnsavedWorkGuard below — never to block or alter the
   * decision itself. Reset in applyNav: it belongs to the section being left,
   * not the one about to be entered. */
  const pendingDecisionCountRef = useRef(0);
  useEffect(() => {
    activeSectionIdRef.current = activeSectionId ?? null;
  });
  const [revisions, setRevisions] = useState<AuthRevision[]>([]);
  // 'error' is a distinct state on purpose: an empty list because the read
  // failed and an empty list because there are no revisions are the same value
  // and opposite facts.
  /* 'loading' was missing: the rail rendered "No prior revisions" for the whole
     of every GET, and kept the PREVIOUS section's revisions — with a live Revert
     button — under the next section's header until its response landed. */
  const [revisionsState, setRevisionsState] = useState<'loading' | 'ready' | 'error'>('ready');
  const historySectionRef = useRef<string | null>(null);
  const [comments, setComments] = useState<AuthComment[]>([]);
  const [commentsState, setCommentsState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [newComment, setNewComment] = useState('');
  /* The document's Part 11 audit trail. 'error' is distinct from empty on
     purpose: a failed read of the compliance record must never render as "no
     governed acts have occurred". */
  const [auditEvents, setAuditEvents] = useState<AuthAuditEvent[]>([]);
  // 'forbidden': the server answered that this person may not read this
  // document's record (403) — not a failed read, and not an empty trail.
  const [auditState, setAuditState] = useState<'idle' | 'loading' | 'ready' | 'error' | 'forbidden'>('idle');
  /* The record export — busy while the server records the export on the chain
     and builds the package; `error` is the reason it did not arrive, kept on
     the rail until the next attempt. Scoped to the document it was asked for,
     so a refusal is never shown under a different document's trail. */
  const [recordExport, setRecordExport] = useState<{
    docId: string | null;
    busy: boolean;
    error: string | null;
  }>({ docId: null, busy: false, error: null });
  /* The revision ledger's recomputed verdict — null until asked, 'error' on a
     failed read (which is a failure to CHECK, never a claim about the chain). */
  const [ledger, setLedger] = useState<LedgerVerdict | 'error' | 'checking' | null>(null);

  // What the active section is drafted from, plus the project's Data Room for the
  // picker. Both are live reads; neither has a fixture fallback.
  const [sources, setSources] = useState<SectionSource[]>([]);
  const [sourcesState, setSourcesState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const projectCatalogue = useProjectSourceCatalog(programId);
  const { sources: projectSources, state: projectSourcesState, retry: loadProjectSources } = projectCatalogue;
  const citationAdmission = useDocumentCitationAdmission(activeDocId, programId);
  const refreshCitationAdmission = citationAdmission.retry;
  const citationScope = `${programId ?? ''}:${activeDocId ?? ''}:${activeSectionId ?? ''}`;
  const citationScopeRef = useRef(citationScope);
  citationScopeRef.current = citationScope;
  /** Citations the last document-wide re-read could NOT refresh, with the
   *  server's reason. Held rather than toasted away: "3 could not be re-read"
   *  is the finding, and a message that fades in four seconds is not where a
   *  finding belongs. */
  const [skippedRefreshes, setSkippedRefreshes] = useState<
    Array<{ cite_id: string; reason: string }>
  >([]);
  const [picking, setPicking] = useState(false);

  const [toast, fireToast] = useToast();

  /* ── Editor deep-link target (window.C2C_EDITOR_TARGET) ──
     Set by a workbench click ("Open §11 in editor", a CER Generator row) via
     v2/editorTarget.ts, the same set-navigate-consume idiom as C2C_CONVO.
     Peeked in the initializer (pure — safe under StrictMode double-render),
     CLEARED on mount: the channel is one-shot, so a target that isn't honoured
     now can never ambush a later, unrelated visit to the editor. */
  const [editorTarget, setIncomingEditorTarget] = useState<EditorTarget | null>(() => {
    const target = peekEditorTarget();
    return consumeDeepLinks ? target ?? editorTargetFromSearch(window.location.search) : target?.assemblySources ? target : null;
  });
  /** Where "Back to conversation" goes in the surface host: only what the
   *  sender named. Null means no such control is drawn. */
  const returnTo = editorTarget?.returnTo ?? null;
  /* ── Navigation-directive target (window.C2C_NAV_PARAMS) ──
     AnA's navigate_to (Live Drive or a chip click) can name a sectionCode
     ('section-workspace' / 'authoring' registry targets, e.g. "3.2.P.8").
     Consumed once on mount; resolved through the SAME bounded search and
     honest-miss notices as an editor-target hand-off — one resolution flow,
     two senders. Carries no docType/program claim, so those guards below
     simply don't apply to it. */
  const [navHandOff] = useState<{ sectionCode: string | null; docQuery: string | null }>(() => {
    const p = consumeDeepLinks ? consumeNavParams('document-authoring') : null;
    const code = p?.sectionCode?.trim();
    const doc = p?.authoringDocType?.trim();
    return {
      sectionCode: code && code.length > 0 ? code : null,
      docQuery: doc && doc.length > 0 ? doc : null,
    };
  });
  const navSectionCode = navHandOff.sectionCode;
  /** Unified open-on-mount target: a workbench editor-target wins (it carries
   *  the stronger claim); otherwise the navigation directive's section. */
  const sectionOpenTarget = useMemo<EditorTarget | null>(
    () =>
      editorTarget ??
      (navSectionCode
        ? {
            docType: null,
            docId: null,
            sectionCode: navSectionCode,
            sectionLabel: null,
            programId: null,
            programTitle: null,
            returnTo: null,
            setAt: 0,
          }
        : null),
    [editorTarget, navSectionCode],
  );
  /** The honest miss: why the deep-link did not open what it named. Rendered
   *  as a dismissible notice over the DEFAULT view — never a silent
   *  wrong-document open. */
  const [targetNotice, setTargetNotice] = useState<string | null>(null);
  /** The section the deep-link resolved, consumed by loadSections so the
   *  refetch that follows a document switch selects the target section
   *  instead of the document's first. Doc-scoped: a stale in-flight load of a
   *  DIFFERENT document must neither consume it nor act on it. */
  const targetSectionRef = useRef<{ docId: string; sectionId: string } | null>(null);
  useEffect(() => {
    if (consumeDeepLinks || peekEditorTarget()?.assemblySources) clearEditorTarget();
  }, [consumeDeepLinks]);

  const activeDoc = docs.find(d => d.id === activeDocId) ?? null;
  /* The filing the open document is the editing copy of: an added market's
     Module 1 and 3.2.R when it is that market's copy (FILING_SPINE F22b),
     otherwise the project's home filing. */
  const filing = useFilingOutline(projectIdForOutline, activeDoc?.c2c_document_id ?? null);
  /* The outline's keys: a node the outline does not subdivide opens the
     document's sections under it (findSectionForNode; QA 2026-10-08, walk 2). */
  const outlineKeys = useMemo(() => Array.from(filing.flat, n => n.key), [filing.flat]);
  const unboundDraft = !!activeDoc && activeDoc.module === null && !activeDoc.c2c_document_id;
  const activeSection = sections.find(s => s.id === activeSectionId) ?? null;
  const docSealed =
    activeDoc != null && ['FROZEN', 'APPROVED'].includes(String(activeDoc.status).toUpperCase());
  const editRefusal = actRefusal(docAccess.edit ?? null);
  const contentReadOnly = docSealed || !!editRefusal;
  const dirty = activeSection != null && editorDirty && !docSealed;
  const docScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const pane = docScrollRef.current;
    if (pane) pane.scrollTop = 0;
  }, [activeSectionId, activeDocId, contentEpoch]);

  /* ── Navigating away from unsaved work ────────────────────────────────────
     Clicking another section used to call setActiveSectionId directly. The
     canvas is keyed on the section id, so that unmounted it — and with it the
     only copy of everything typed since the last save. Nothing asked, nothing
     said; the work was simply not there on return unless the author happened
     to notice the device-cache restore offer.

     It is NOT fixed by saving on the way out. This surface's save is
     PATCH /api/authoring/sections/:id, which mints a doc_revisions row, writes
     a Part 11 audit record and commits the text into the filing. A save the
     author did not ask for is an attributable act they did not perform — the
     same defect as losing the text, pointed the other way. So the navigation is
     HELD and the author decides: save (deliberate, attributable), leave it on
     this device, or stay. */
  type LeaveTarget = WorkbenchLeaveTarget;
  const [pendingLeave, setPendingLeave] = useState<LeaveTarget | null>(null);
  const pendingLeaveRef = useRef(pendingLeave);
  pendingLeaveRef.current = pendingLeave;
  const [leaving, setLeaving] = useState(false);
  const navigationSequence = useRef(0);
  const authoringBusyGuardRef = useRef<() => { ok: false; reason: string } | null>(() => null);
  const assemblyLeaveRefusalRef = useRef<() => string | null>(() => null);
  const linkedTargetRefusal = useCallback(() => ceremonyOpen()
    ? 'Finish or cancel the open governed form, then retry the linked document.'
    : authoringBusyGuardRef.current()?.reason ?? null, []);
  const refuseStructuralLeave = useCallback((target: LeaveTarget): boolean => {
    const reason = assemblyLeaveRefusalRef.current();
    if (!reason) return false;
    if (target.kind === 'program') target.onCancel();
    fireToast(reason, 'error');
    return true;
  }, [fireToast]);
  const assemblyReceiver = useRef<{ token: object; target: EditorTarget; intent: AssemblySourceIntent | null } | null>(null);
  const receiverInitialized = useRef(false);
  const receiverAlive = useRef(true);
  const outgoingAssembly = useRef(false);
  useEffect(() => { receiverAlive.current = true; return () => { receiverAlive.current = false; }; }, []);
  const captureSourceTarget = useCallback((target: EditorTarget) => {
    const token = {}; const intent = captureAssemblySourceIntent(target,
      () => receiverAlive.current && assemblyReceiver.current?.token === token);
    assemblyReceiver.current = { token, target, intent };
  }, []);
  if (!receiverInitialized.current) {
    receiverInitialized.current = true;
    if (editorTarget?.assemblySources) captureSourceTarget(editorTarget);
  }
  const [acceptedAssemblyIntent, setAcceptedAssemblyIntent] = useState<AssemblySourceIntent | null>(null);
  const admitAssemblyNavigation = useCallback((intent: AssemblySourceIntent, adopt = true): boolean => {
    if (!intent.current() || intent.programId !== programId || programSwitchHeld || ceremonyOpen()) {
      setTargetNotice('The source handoff context changed or a governed form is open. Finish that work, then select these sources again.'); return false;
    }
    if (adopt) setAcceptedAssemblyIntent(intent); return true;
  }, [programId, programSwitchHeld]);
  const sectionLoaderRef = useRef<((id: string) => Promise<void>) | null>(null);
  const oversightOriginRef = useRef<AskOrigin>({ surfaceId: 'document-authoring', label: 'Authoring' });
  const confirmedSaveVersionRef = useRef<SavedSectionVersion | null>(null);

  const applyNav = useCallback((target: LeaveTarget, savedVersion?: SavedSectionVersion | null) => {
    if (!admitWorkbenchNavigation(target, programSwitchHeld,
      () => fireToast('Finish the project switch before opening a conversation.', 'error'), admitAssemblyNavigation)) return;
    // The editor's dirty flag belongs to the mount that is going away; clear
    // it first so the guard cannot re-fire against the section just left.
    setEditorDirty(false);
    // Same reason: the count of decisions-since-last-save belongs to the
    // section being left, whether or not it was saved first. The next section
    // starts its own count at zero.
    pendingDecisionCountRef.current = 0;
    // The create/export module follows where the author actually IS, so it
    // moves with the navigation and not with the click that proposed one.
    if (target.module) setModule(target.module);
    if (target.kind === 'view') setViewMode(target.mode);
    else if (target.kind === 'program' || target.kind === 'host-back') target.onContinue();
    else if (target.kind === 'conversation') {
      prefillConversation(target.prompt, originWithSavedVersion(oversightOriginRef.current, savedVersion), onNav);
    }
    else if (target.kind === 'external-document') {
      outgoingAssembly.current = true;
      try { setEditorTarget({ docType: null, docId: target.id, programId,
        ...(target.assemblyIntent ? { assemblySources: { version: 1 as const, sources: target.assemblyIntent.sources } } : {}) }); }
      finally { outgoingAssembly.current = false; }
      onNav('document-authoring');
    } else if (target.kind === 'section') {
      if (target.mode) setViewMode(target.mode);
      setActiveSectionId(target.id);
      setAiDraftOpen(open => target.draftReview === true || open);
    }
    else {
      if (target.sectionId) targetSectionRef.current = { docId: target.id, sectionId: target.sectionId };
      if (target.id === activeDocId && target.sectionId) void sectionLoaderRef.current?.(target.id);
      else setActiveDocId(target.id);
    }
  }, [programId, onNav, activeDocId, programSwitchHeld, fireToast, admitAssemblyNavigation]);

  /** Every in-surface navigation that unmounts the canvas goes through here. */
  const requestLeave = useCallback(
    (target: LeaveTarget): boolean => {
      if (refuseStructuralLeave(target)) return false;
      if (!workbenchAssemblyIntent(target)) assemblyReceiver.current = null;
      if (target.kind === 'conversation' && programSwitchHeld) {
        fireToast('Finish the project switch before opening a conversation.', 'error');
        return false;
      }
      navigationSequence.current += 1;
      const alreadyThere = workbenchAlreadyThere(target, { viewMode, sectionId: activeSectionId, docId: activeDocId, dirty });
      if (alreadyThere) {
        if (target.kind === 'section' && target.draftReview) setAiDraftOpen(true);
        if (target.kind === 'document' && target.assemblyIntent) return admitAssemblyNavigation(target.assemblyIntent);
        return true;
      }
      if (!dirty) {
        applyNav(target);
        return true;
      }
      /* Held by the unsaved-work guard: the author can still cancel, so a
         caller must not announce the open as done. Returns false so it knows. */
      setPendingLeave(target);
      return false;
    },
    [dirty, activeSectionId, activeDocId, applyNav, programSwitchHeld, fireToast, viewMode, refuseStructuralLeave, admitAssemblyNavigation]
  );
  const requestLeaveRef = useRef(requestLeave);
  requestLeaveRef.current = requestLeave;
  useEffect(() => {
    if (pendingProgramSwitch) requestLeaveRef.current({ kind: 'program', ...pendingProgramSwitch });
    else setPendingLeave(previous => previous?.kind === 'program' ? null : previous);
  }, [pendingProgramSwitch]);
  const openProgramRef = useRef(programId);
  openProgramRef.current = programId;
  // Replacing this token also detects A → B → A round trips while a read is pending.
  const creationScopeKey = `${programId}:${activeDocId}:${programSwitchHeld}:${status}:${pinnedDocId}`;
  const creationScopeRef = useRef({ key: creationScopeKey });
  if (creationScopeRef.current.key !== creationScopeKey) creationScopeRef.current = { key: creationScopeKey };
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  const openPulledDocument = useCallback(async (docId: string) => {
    if (programSwitchHeld || openProgramRef.current !== programId) return;
    const scope = creationScopeRef.current;
    const sequence = navigationSequence.current;
    // A pinned canvas cannot switch documents; a narrowed list may exclude
    // the new draft. Both use the same exact-id handoff after the leave guard.
    if (pinnedDocId || status !== 'all') {
      requestLeaveRef.current({ kind: 'external-document', id: docId });
      return;
    }
    await reloadDocs();
    if (!aliveRef.current || creationScopeRef.current !== scope || navigationSequence.current !== sequence) return;
    // The author can type while the list refreshes; consult the guard from
    // the current render so those new unsaved changes are held as well.
    requestLeaveRef.current({ kind: 'document', id: docId });
  }, [pinnedDocId, status, reloadDocs, programId, programSwitchHeld]);

  /* The host asking for a section (the conversation canvas: "Ask AnA to draft"
     opens the editor at it). Through requestLeave, so unsaved text in the open
     section is held for the author to decide. Each request is applied once,
     when its section is in the list, and never again on a later reload. */
  const focusSection = embedded?.focusSection ?? null;
  const appliedFocusRef = useRef<number | null>(null);
  useEffect(() => {
    if (!focusSection || appliedFocusRef.current === focusSection.nonce) return;
    if (!sections.some(s => s.id === focusSection.id)) return;
    appliedFocusRef.current = focusSection.nonce;
    requestLeave({ kind: 'section', id: focusSection.id });
  }, [focusSection, sections, requestLeave]);

  /** Save through the editor's one save path, then move. A refused save keeps
   *  the author here with the text intact — the toast says why. */
  const saveAndLeave = useCallback(async () => {
    const target = pendingLeave;
    if (!target) return;
    setLeaving(true);
    try {
      confirmedSaveVersionRef.current = null;
      const saved = await editorRef.current?.save();
      if (!saved) return; // stay put; the failure has already been reported
      if (pendingLeaveRef.current !== target) return;
      setPendingLeave(null);
      applyNav(target, confirmedSaveVersionRef.current);
    } finally {
      setLeaving(false);
    }
  }, [pendingLeave, applyNav]);

  /** Leave it unsaved. The editor's device cache (`dc::<sectionId>`) still
   *  holds the text and offers it back explicitly on return. */
  const leaveUnsaved = useCallback(() => {
    const target = pendingLeave;
    if (!target) return;
    setPendingLeave(null);
    applyNav(target);
  }, [pendingLeave, applyNav]);

  /* Saved context for AnA's one conversation: the server resolves the real
     project, document and section without guessing from the request text. */
  const authoringContext = useMemo<AuthoringContextPack | null>(
    () => contextForWorkbench({ projectId: projectIdForOutline, documentId: activeDocId, document: activeDoc, section: activeSection, filing: unboundDraft ? null : filing.document, sections }),
    [projectIdForOutline, activeDocId, activeDoc, activeSection, filing.document, sections, unboundDraft],
  );
  /* The conversation's canvas receives the editor's same governed suggestion
     door and saved authoring context. A sealed document and assembled Document
     view remain readable, with explicit reasons why they cannot take an insert. */
  /* AnA's text goes into the section only under the governed-write rule
     (anaInsertGate.ts, round 11): this is the one suggestion door exposed by
     the bridge. A turn it admits is remembered, so a paste of that suggestion
     keeps AnA's name (suggestions.ts, the paste door); any other pasted AnA
     suggestion becomes the pasting person's, still naming its turn. */
  const admittedAnaSources = useRef(new Set<string>());
  /* The same rule `insertAnaText` applies, in the shape `propose` returns. Its
     own function so the bridge effect's arrow stays under the file's limits. */
  const anaProposeRefusal = useCallback(
    (
      author: SuggestionAuthor,
      record: AnaTurnRecordStatus | undefined,
      unfinished: boolean,
    ): { ok: false; reason: 'model-not-approved'; message: string } | null => {
      if (author.id !== ANA_SUGGESTION_AUTHOR_ID) return null;
      const message = anaInsertRefusal(record, unfinished);
      return message ? { ok: false, reason: 'model-not-approved', message } : null;
    },
    [],
  );
  const insertAnaText = useCallback(
    (text: string, author: SuggestionAuthor, record: AnaTurnRecordStatus | undefined, unfinished = false): boolean => {
      if (editRefusal || editorInsertRefusal(docSealed, viewMode, activeSection?.code ?? 'the section')) return false;
      if (author.id === ANA_SUGGESTION_AUTHOR_ID && anaInsertRefusal(record, unfinished)) return false;
      const ok = editorRef.current?.insertSuggestion(text, author) ?? false;
      if (ok && author.id === ANA_SUGGESTION_AUTHOR_ID && author.sourceRecord) admittedAnaSources.current.add(author.sourceRecord);
      return ok;
    },
    [docSealed, editRefusal, viewMode, activeSection?.code],
  );
  const admitsAnaSource = useCallback((id: string | null) => id !== null && admittedAnaSources.current.has(id), []);
  // Evidence/context reads can settle while a version hash is computing.
  // They update context, not the saved text that a proposal is anchored to.
  const authoringContextRef = useRef(authoringContext);
  authoringContextRef.current = authoringContext;
  const editorModuleContextRef = useRef<Record<string, unknown>>({});
  const editorSectionLabelsRef = useRef<Record<string, string>>({});
  editorSectionLabelsRef.current = Object.fromEntries(sections.map(s => [s.id, `${s.code} ${s.title}`.trim()]));
  const onEditorBridge = embedded?.onEditorBridge;
  useEffect(() => {
    if (!activeSection || !activeDocId) {
      onEditorBridge?.(null);
      return undefined;
    }
    /* The section as this editor loaded it. The row is replaced on every
       save (and a revert or a section switch replaces the editor), and each
       of those re-runs this effect, so a bridge whose effect has been
       cleaned up describes a section that may no longer be the record: it
       refuses `stale`. (So does one rebuilt for a sealed
       flag — which costs the caller one re-read,
       never a redline on the wrong text.) */
    const content = activeSection.content ?? '';
    let sha: Promise<string | null> | null = null;
    const loaded: LoadedSection = {
      id: activeSection.id,
      updatedAt: activeSection.updated_at ?? null,
      sha256: () => (sha ??= sha256Hex(content)),
    };
    let live = true;
    const bridge: EditorBridge = {
      docId: activeDocId,
      sectionId: activeSection.id,
      get sectionLabels() { return editorSectionLabelsRef.current; },
      openSection: (id) => {
        if (Object.hasOwn(editorSectionLabelsRef.current, id)) requestLeaveRef.current({ kind: 'section', id, mode: 'section' });
      },
      sectionCode: activeSection.code,
      sectionTitle: activeSection.title,
      viewMode,
      editable: !editRefusal && !editorInsertRefusal(docSealed, viewMode, activeSection.code),
      insertRefusal: editRefusal || editorInsertRefusal(docSealed, viewMode, activeSection.code),
      get authoringContext() { return authoringContextRef.current; },
      get moduleContext() { return editorModuleContextRef.current; },
      insert: (text, author, record, unfinished) => insertAnaText(text, author, record, unfinished),
      /* A proposal is anchored to text AnA read, in one section. It must name
         this section and the version of it AnA read; every base it gives is
         checked against the section as this editor loaded it, so a section
         saved since is refused rather than redlined on a guess. Sealed before
         the base: re-reading would not make a frozen document take it. The
         hash is WebCrypto's, so this is asynchronous — and the section is
         checked again after it, since a save can land while it runs. */
      /* Every AnA replacement uses this governed bridge. The model check
         precedes the version check. */
      propose: async (proposal, author, record, unfinished = false) => {
        const refusedModel = anaProposeRefusal(author, record, unfinished);
        if (refusedModel) return refusedModel;
        if (!live) return { ok: false, reason: 'stale' };
        if (proposal.sectionId !== loaded.id) return { ok: false, reason: 'wrong-section' };
        if (contentReadOnly || viewMode !== 'section') return { ok: false, reason: 'not-editable' };
        const refused = await baseRefusal(proposal, loaded);
        if (refused) return { ok: false, reason: refused };
        if (!live) return { ok: false, reason: 'stale' };
        const result = editorRef.current?.proposeReplacement(proposal, author) ?? { ok: false as const, reason: 'not-editable' as const };
        if (result.ok && author.id === ANA_SUGGESTION_AUTHOR_ID && author.sourceRecord) admittedAnaSources.current.add(author.sourceRecord);
        return scopedProposalResult(result, activeDocId, loaded.id);
      },
      getProposalState: receipt => live && receipt.docId === activeDocId && receipt.sectionId === loaded.id
        ? editorRef.current?.getProposalState(receipt) ?? 'unavailable' : 'unavailable',
      subscribeProposalChanges: listener => live ? editorRef.current?.subscribeProposalChanges(listener) ?? (() => {}) : () => {},
      canPropose: () => live && editorRef.current?.canProposeReplacement() === true,
    };
    onEditorBridge?.(bridge);
    return () => {
      live = false;
      onEditorBridge?.(null);
    };
  }, [onEditorBridge, activeDocId, activeSection, docSealed, contentReadOnly, editRefusal, viewMode, insertAnaText, anaProposeRefusal]);

  /* With no project open there is no AuthoringContextPack to build (it requires
     a projectId), so the document/section identity still travels as module
     context rather than being dropped. */
  const moduleContext = useMemo(() => {
    const base: Record<string, unknown> = {
      surface: 'document-authoring',
      documentId: activeDocId,
      documentTitle: activeDoc?.title ?? null,
      sectionId: activeSectionId,
      sectionCode: activeSection?.code ?? null,
      sectionTitle: activeSection?.title ?? null,
      sectionUpdatedAt: activeSection?.updated_at ?? null,
      savedRecordOnly: true,
      ...savedTemplateFacts(docTemplateContext, activeDocId),
      evidenceSourceIds: sources.flatMap(s => s.source ? [String(s.source.id)] : []),
      evidenceSourcesRead: sourcesState,
      ...(docProvenance?.importSource ? { importSource: {
        kind: docProvenance.importSource.kind,
        id: docProvenance.importSource.id,
        programId: docProvenance.importSource.programId,
        ...(isWorkflowImportOrigin(docProvenance.importSource)
          ? { fingerprint: docProvenance.importSource.fingerprint, selection: docProvenance.importSource.selection,
            sectionOrigins: docProvenance.importSource.sectionOrigins, gaps: docProvenance.importSource.gaps }
          : { sha256: docProvenance.importSource.sha256 }),
        conversion: docProvenance.importSource.conversion,
        warnings: docProvenance.importSource.warnings,
      } } : {}),
    };
    /* The screen's OPERABLE vocabulary from the shared surface-action registry
       (aliases applied), folded exactly as the shell folds it for railed
       surfaces (V2App) — this surface owns its conversation, so its own chat
       must advertise what the rail would have. Omitted entirely when empty
       rather than sending an empty claim. */
    const screenActions = advertisedScreenActions('document-authoring');
    return screenActions.length > 0 ? { ...base, screen_actions: screenActions } : base;
  }, [activeDocId, activeDoc?.title, activeSectionId, activeSection?.code, activeSection?.title, activeSection?.updated_at, sources, sourcesState, docProvenance, docTemplateContext]);
  editorModuleContextRef.current = moduleContext;
  usePublishSurfaceContext('document-authoring', embedded ? null : {
    summary: activeDoc ? 'A saved authoring document is open.' : 'Authoring documents for the open project.',
    facts: { ...moduleContext, authoringContext },
    availableActions: ['Review section', 'Review document', 'Reconcile project evidence', 'Prepare targeted fixes'],
  });
  oversightOriginRef.current = {
    surfaceId: 'document-authoring', label: 'Authoring', moduleContext, authoringContext,
    ...(activeDoc && programId ? { authoringDocument: {
      docId: activeDoc.id, programId, ...(activeSection ? { sectionId: activeSection.id } : {}),
    } } : {}),
  };
  /* Every editor ask uses the one conversation. Embedded hosts prefill it
     in place; standalone asks wait for the same unsaved-work disposition. */
  const askAna = useCallback((text: string) => {
    const prompt = text.trim();
    if (!prompt) return;
    if (programSwitchHeld) { fireToast('Finish the project switch before opening a conversation.', 'error'); return; }
    if (onAsk) onAsk(prompt, originWithSavedVersion(oversightOriginRef.current, confirmedSaveVersionRef.current));
    else requestLeave({ kind: 'conversation', prompt });
  }, [onAsk, requestLeave, programSwitchHeld, fireToast]);
  const askAnaToDraft = useCallback(() => {
    askAna(askAnaToDraftPrompt(programName(program)));
  }, [askAna, program]);

  /* 2026-09-28, coverage-gap sweep GA-4: six record rails had no close control,
     so the way out of History,
     Comments, Sources, Signatures, Audit or Exports was to find the toolbar
     toggle again. Every other rail now closes on Escape and from its own
     close button, and focus goes back to the toggle that opened it — the
     toggle is the one stable control, since the close button unmounts with
     the rail. Escape that belongs to something inside (a dialog, the editor,
     a text field) is left alone, as the canvas does, and one the page already
     handled (defaultPrevented, e.g. the rename group) is not taken twice. */
  const railToggleRefs = useRef<Partial<Record<string, HTMLButtonElement | null>>>({});
  const railReturnFocusRef = useRef<string | null>(null);
  const closeRail = useCallback(() => {
    setRail(current => {
      railReturnFocusRef.current = current;
      return null;
    });
  }, []);
  useEffect(() => {
    if (rail !== null) return;
    const from = railReturnFocusRef.current;
    railReturnFocusRef.current = null;
    if (from) railToggleRefs.current[from]?.focus({ preventScroll: true });
  }, [rail]);
  useEffect(() => {
    if (rail === null) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (escapeBelongsToInner(event.target)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      /* Only an Escape from inside the workbench, or from the body (where
         focus sits after a click on non-focusable chrome). One from a host's
         own control — the canvas's Back bar — is the host's. */
      const t = event.target;
      if (t instanceof Node && t !== document.body && !rootRef.current?.contains(t)) return;
      event.preventDefault();
      closeRail();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [closeRail, rail]);

  /* ── The document list is the host's ──
     The Authoring surface reads it (status filter, program scope) and the
     canvas passes exactly one document. What was `loadDocs` here is the
     host's `reloadDocs`. */
  const loadDocs = reloadDocs;

  /* ── The document's provenance line ──
     GET /docs/:docId carries `provenance` for a document AnA drafted (source
     'ana', the conversation and turn, the model the gateway reported), for a
     seeded demo document ('seed') and for an import. Read on document change;
     a document with none, or a failed read, gets no origin line rather than a
     guessed one. Doc-scoped like the other loaders. */
  const provenanceDocRef = useRef<string | null>(null);
  const [docTemplateId, setDocTemplateId] = useState<string | null>(null);
  useEffect(() => {
    provenanceDocRef.current = activeDocId;
    setDocProvenance(null);
    setDocTemplateContext(null);
    setDocTemplateId(null);
    setDocFigures(null);
    setDocClaims(null);
    setDocAccess(UNKNOWN_DOCUMENT_ACCESS);
    if (!activeDocId) return;
    const wanted = activeDocId;
    void readJson<{ document?: { provenance?: unknown; template_id?: unknown }; access?: unknown }>(
      `/api/authoring/docs/${encodeURIComponent(wanted)}`,
    ).then(({ ok, body }) => {
      if (provenanceDocRef.current !== wanted) return;
      if (!ok || !body?.document) {
        setDocTemplateContext({ documentId: wanted, templateId: null, templateSourceState: 'unavailable' });
        return;
      }
      const template = readSavedTemplateContext(wanted, body.document);
      setDocTemplateContext(template);
      setDocProvenance(describeProvenance(body.document.provenance, { templateId: template.templateId }));
      setDocTemplateId(typeof body.document.template_id === 'string' ? body.document.template_id : null);
      setDocFigures(describeFigureCheck(body.document.provenance));
      setDocClaims(describeClaimsCheck(body.document.provenance));
      /* GE-P-3: the same read carries the caller's access. */
      setDocAccess(readDocumentAccess(body.access));
    });
    /* Re-read on a status change too: a freeze changes what may be filed. */
  }, [activeDocId, activeDoc?.status]);

  /* ── Load sections when the active document changes ──
     Doc-scoped like the comments/audit loaders below: the ref stamps the
     LATEST requested doc, and a response for any other doc is dropped whole.
     Without it, a fast doc switch (the docId deep-link resolving while the
     default document's larger section list was still in flight) let the
     STALE response land last — the header named the linked document while
     the outline and canvas held the other one's sections, and a save from
     there would have written the wrong governed document. */
  /** Document-level structural findings from GET …/sections. */
  const [structure, setStructure] = useState<SectionStructure | null>(null);
  const sectionsDocRef = useRef<string | null>(null);
  const sectionsReadSequence = useRef(0);
  const loadSections = useCallback(async (docId: string, afterRead?: (rows: AuthSection[]) => void, recovery = false,
    recoveryOwner?: { current: () => boolean; headers: Record<string, string> }) => {
    if (recoveryOwner?.current() === false) throw new Error('The section recovery owner changed.');
    const scope = creationScopeRef.current;
    const sequence = ++sectionsReadSequence.current;
    sectionsDocRef.current = docId;
    const currentRead = () => recoveryOwner?.current() !== false && aliveRef.current
      && creationScopeRef.current === scope && sectionsDocRef.current === docId && sectionsReadSequence.current === sequence;
    setSectionsState('loading');
    const { ok, body } = await readJson<{ success?: boolean; sections?: AuthSection[]; structure?: SectionStructure }>(
      `/api/authoring/docs/${encodeURIComponent(docId)}/sections`, recoveryOwner?.headers
    );
    if (!currentRead()) {
      if (recovery) throw new Error('The section recovery context changed.');
      return;
    }
    if (!usableSectionRead(ok, body, docId, recovery)) {
      setSectionsState('error');
      setSections([]);
      setStructure(null);
      if (recovery) throw new Error('The section recovery read could not be verified.');
      return;
    }
    const list = Array.isArray(body.sections) ? body.sections : [];
    setSections(list);
    /* Two document-level facts no single section can show: a code filed twice,
       and a stored order that disagrees with the codes. Null when the server
       did not send them, so an older server renders no claim either way. */
    setStructure(body.structure ?? null);
    setSectionsState('ready');
    // A deep-link resolution may have named the section this load should land
    // on. Selected HERE, after setSections, so the buffer-sync effect below
    // reads the section's real content — selecting it before the list arrived
    // would sync an empty buffer over a section that has text. Consumed only
    // by a load of the document it names: a stale in-flight load of another
    // document must not swallow the target.
    const target = targetSectionRef.current;
    const targetForDocument = target?.docId === docId;
    const landTarget =
      targetForDocument && list.some(s => s.id === target.sectionId);
    if (targetForDocument) targetSectionRef.current = null;
    setActiveSectionId(cur => {
      if (landTarget) return target!.sectionId;
      return cur && list.some(s => s.id === cur) ? cur : list[0]?.id ?? null;
    });
    afterRead?.(list);
  }, []);
  sectionLoaderRef.current = loadSections;

  const openCreatedSection = useCallback(async (section: { id: string; code: string }) => {
    if (!activeDocId || programSwitchHeld) return;
    const sequence = navigationSequence.current;
    await loadSections(activeDocId, rows => {
      if (navigationSequence.current === sequence && rows.some(row => row.id === section.id)) {
        requestLeaveRef.current({ kind: 'section', id: section.id });
      }
    });
  }, [activeDocId, programSwitchHeld, loadSections]);

  const checkCreation = useCallback(async (kind: 'document' | 'section') => {
    if (programSwitchHeld || openProgramRef.current !== programId) return false;
    const scope = creationScopeRef.current;
    const sequence = navigationSequence.current;
    try {
      if (kind === 'section') {
        if (!activeDocId) return false;
        await loadSections(activeDocId, undefined, true);
      } else if (await refreshCreationContext?.() !== true) return false;
      if (!aliveRef.current || creationScopeRef.current !== scope || navigationSequence.current !== sequence) return false;
      if (kind === 'document' && !pinnedDocId) onStatusChange?.('all');
      return true;
    } catch { return false; }
  }, [programSwitchHeld, programId, activeDocId, loadSections, pinnedDocId, onStatusChange, refreshCreationContext]);

  const assemblyHostScope = creationScopeRef.current;
  const assembly = useAuthoringAssemblyBuild({
    docId: activeDocId,
    programId,
    docSealed,
    editRefusal,
    editorDirty: dirty,
    isCurrent: () => aliveRef.current && creationScopeRef.current === assemblyHostScope && !programSwitchHeld,
    onStructureBuilt: async data => {
      if (data.docId !== activeDocId || data.programId !== programId
        || creationScopeRef.current !== assemblyHostScope || !aliveRef.current) return;
      setExportsEpoch(epoch => epoch + 1);
      await loadSections(data.docId);
      if (creationScopeRef.current === assemblyHostScope && aliveRef.current) void reloadDocs();
    },
    onRecoveryChecked: async (ownerCurrent, headers) => {
      const scope = creationScopeRef.current;
      const sequence = navigationSequence.current;
      const current = () => ownerCurrent() && aliveRef.current && creationScopeRef.current === scope
        && creationScopeRef.current === assemblyHostScope && navigationSequence.current === sequence
        && !programSwitchHeld && openProgramRef.current === programId;
      if (!activeDocId || !current()) return false;
      try {
        await loadSections(activeDocId, undefined, true, { current, headers });
        return current();
      } catch { return false; }
    },
    onReviewSection: sectionId => {
      const refusal = linkedTargetRefusal();
      if (refusal) { fireToast(refusal, 'error'); return; }
      requestLeaveRef.current({ kind: 'section', id: sectionId, mode: 'section', draftReview: true });
    },
  });
  assemblyLeaveRefusalRef.current = assembly.leaveRefusal;

  const markAssemblyAccepted = assembly.markAccepted;
  const assemblySourceScope = assemblySelectionKey(assembly.sourceSelection);
  const previousAssemblySourceScope = useRef(assemblySourceScope);
  useEffect(() => {
    if (previousAssemblySourceScope.current === assemblySourceScope) return;
    previousAssemblySourceScope.current = assemblySourceScope;
    setAiDraftOpen(false);
  }, [assemblySourceScope]);
  const selectedSourceReviewMissing = !!assembly.sourceSelection && (!activeSectionId || !assembly.reviewSessions[activeSectionId]?.sources);
  const adoptAssemblySources = assembly.adoptSources;
  useEffect(() => {
    const intent = acceptedAssemblyIntent;
    if (!intent || activeDocId !== intent.docId || programId !== intent.programId) return;
    if (intent.current() && !programSwitchHeld && !ceremonyOpen()) adoptAssemblySources(intent.sources);
    setAcceptedAssemblyIntent(null);
  }, [acceptedAssemblyIntent, activeDocId, programId, programSwitchHeld, adoptAssemblySources]);
  const draftEditorScope = useRef({ docId: activeDocId, sectionId: activeSectionId, scope: assemblyHostScope, dirty });
  draftEditorScope.current = { docId: activeDocId, sectionId: activeSectionId, scope: assemblyHostScope, dirty };

  useEffect(() => {
    if (!activeDocId) {
      setSections([]);
      setSectionsState('idle');
      setActiveSectionId(null);
      return;
    }
    void loadSections(activeDocId);
  }, [activeDocId, loadSections, creationScopeKey]);

  /* F4: a click on an outline node with no section here starts it — created
     through POST /api/authoring/sections, opened, the cursor put in it — but
     only in the document that is the filing's editing copy. */
  const startNode = useStartOutlineSection({
    activeDoc, filing: filing.document, docs, sections, loadSections, requestLeave, fireToast,
    activeSectionId, docPane: () => docScrollRef.current,
  });
  /* F22b: a market's editing copy, created bound to its document and opened. */
  const marketCopy = useCreateMarketCopy({ programId, fireToast, openDocument: openPulledDocument });

  /* ── Reset editor bookkeeping on section switch ──
     The canonical editor remounts per section (key includes the id) and reads
     its content from the section row, so there is no separate draft buffer to
     sync — only the dirty mirror and any pending comment anchor to clear. */
  useEffect(() => {
    setEditorDirty(false);
    pendingAnchorRef.current?.resolve(null);
    pendingAnchorRef.current = null;
    setPendingAnchor(null);
  }, [activeSectionId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Honour the deep-link target ──
     One attempt per mount, once the document list is ready and the governed
     outline has settled. FAIL CLOSED at every step: a target scoped to a
     different program, a target whose family contradicts this project's
     governed dossier, or a section no document in scope holds, all land on
     the DEFAULT view with a notice that says so — resolving a near-miss into
     the wrong document would be worse than an honest miss.

     One-shot via refs rather than by nulling the state inside the effect:
     a dep-change cleanup would cancel the in-flight search the moment the
     state write re-ran the effect. `aliveRef` guards only real unmount. */
  const targetAttemptedRef = useRef(false);
  useEffect(() => {
    const handoff = () => {
      if (outgoingAssembly.current) return;
      const target = peekEditorTarget();
      if (!consumeDeepLinks && !target?.assemblySources) return;
      clearEditorTarget();
      if (!target) return;
      const refusal = linkedTargetRefusal();
      if (refusal) {
        setTargetNotice(refusal);
        return;
      }
      if (target.assemblySources) captureSourceTarget(target);
      else assemblyReceiver.current = null;
      targetAttemptedRef.current = false;
      navigationSequence.current += 1;
      setIncomingEditorTarget(target);
    };
    window.addEventListener(EDITOR_TARGET_EVENT, handoff);
    return () => window.removeEventListener(EDITOR_TARGET_EVENT, handoff);
  }, [consumeDeepLinks, linkedTargetRefusal, captureSourceTarget]);
  const [treeScrollNonce, setTreeScrollNonce] = useState(0);
  const linkedReadStillCurrent = useCallback((scope: { key: string }, sequence: number): boolean => {
    if (!aliveRef.current || creationScopeRef.current !== scope || navigationSequence.current !== sequence) return false;
    const refusal = linkedTargetRefusal();
    if (refusal) setTargetNotice(refusal);
    return !refusal;
  }, [linkedTargetRefusal]);
  const openExactDocumentSection = useCallback(async (docId: string, code: string) => {
    const scope = creationScopeRef.current;
    const sequence = navigationSequence.current;
    const reply = await readJson<{ sections?: AuthSection[] }>(`/api/authoring/docs/${encodeURIComponent(docId)}/sections`);
    if (openProgramRef.current !== programId || !linkedReadStillCurrent(scope, sequence)) return;
    const matches = (reply.body?.sections ?? []).filter(s => s.code.toLowerCase() === code.toLowerCase());
    if (!reply.ok || matches.length !== 1) {
      setTargetNotice(`The linked document's section ${code} could not be resolved uniquely. Nothing else was opened.`);
      return;
    }
    setTargetNotice(null);
    requestLeaveRef.current({ kind: 'document', id: docId, sectionId: matches[0].id });
    setTreeScrollNonce(n => n + 1);
  }, [programId, linkedReadStillCurrent]);
  const rejectLinkedTarget = useCallback((target: EditorTarget): boolean => {
    const refusal = linkedTargetRefusal();
    if (refusal) {
      targetAttemptedRef.current = true;
      setTargetNotice(refusal);
      return true;
    }
    if (target.programId && target.programId !== projectIdForOutline) {
      targetAttemptedRef.current = true;
      setTargetNotice(`Couldn’t open the linked document — it belongs to ${target.programTitle ?? 'a different program'}. Open that program and retry.`);
      return true;
    }
    return false;
  }, [linkedTargetRefusal, projectIdForOutline]);
  useEffect(() => {
    if (targetAttemptedRef.current) return;
    if (!sectionOpenTarget || docsState === 'loading' || programSwitchHeld) return;
    const t = sectionOpenTarget;
    if (rejectLinkedTarget(t)) return;
    if (docsState === 'error') {
      /* A failed docs read must NOT spend the one attempt: the ref stays
         unlatched, so when the list does load (a retry, a status-filter
         change) this effect re-fires and the target still resolves — the
         retry this notice promises actually exists. The tree pane already
         reports the failed read; this says what it cost. */
      setTargetNotice(
        `Couldn’t open ${t.docId ? 'the linked document' : describeEditorTarget(t)} — ` +
          'the document list failed to load, so nothing was resolved. ' +
          'It opens automatically once documents load.'
      );
      return;
    }
    /* A doc-id target is the strongest claim a sender can make: it holds the
       EXACT document (the correspondence card's linked response draft). No
       search, no near-miss — the document is in the list or the miss is
       stated. Resolved before the section flow because a sender with the id
       has nothing to search for — and WITHOUT waiting on the filing outline
       (only the section flow's docType/program guards consult it; waiting
       here widened the window in which an author could type into the
       default document before the switch landed). */
    if (t.docId) {
      targetAttemptedRef.current = true;
      const intent = t.assemblySources ? assemblyReceiver.current?.target === t ? assemblyReceiver.current.intent : null : null;
      if (t.assemblySources && (!intent || !intent.current())) {
        setTargetNotice('The selected-source handoff is no longer current. Select those sources again; no document inherited them.'); return;
      }
      if (intent && pinnedDocId && t.docId !== pinnedDocId) {
        requestLeave({ kind: 'external-document', id: t.docId, assemblyIntent: intent }); return;
      }
      const linked = docs.find((d) => d.id === t.docId);
      if (linked) {
        if (t.sectionCode) {
          void openExactDocumentSection(linked.id, t.sectionCode);
          return;
        }
        // A docs-error notice posted moments ago must not outlive the open.
        setTargetNotice(null);
        /* Through the unsaved-work gate, not a bare setActiveDocId: a doc
           switch unmounts the section-keyed canvas, and if the author typed
           anything while this resolution was pending, the guard dialog gets
           to hold the navigation (see requestLeave above). */
        const opened = requestLeave({ kind: 'document', id: linked.id, ...(intent ? { assemblyIntent: intent } : {}) });
        setTreeScrollNonce(n => n + 1);
        /* "Opened …" used to fire regardless — including when the guard held
           the navigation and the author then cancelled it. */
        if (opened) fireToast(`Opened “${linked.title}” — the linked document.`);
        else fireToast(`“${linked.title}” will open once you decide about the unsaved work here.`);
      } else {
        setTargetNotice(
          'Couldn’t open the linked document — it isn’t in the documents in scope ' +
            `(status filter: ${status.replace('_', ' ')}). It may sit under another ` +
            'status or another project. Showing the editor’s default view instead.'
        );
      }
      return;
    }
    // Only the section flow consults the governed outline; its guards below
    // need the filing settled before the one attempt is spent.
    if (filing.loading) return;
    targetAttemptedRef.current = true;
    // A hand-off that named no section carried only program scope, which
    // window.C2C_PROJECT already delivered. Nothing more was claimed.
    if (!t.sectionCode && !t.sectionLabel) return;
    // A navigation-directive target claims no document family; the guards and
    // notices below only speak of one when the sender actually named it.
    const family = editorTargetDocLabel(t.docType);
    const wanted = describeEditorTarget(t);
    if (t.programId && t.programId !== projectIdForOutline) {
      setTargetNotice(
        `Couldn’t open ${wanted} — it belongs to ${t.programTitle ?? 'a different program'}, ` +
          'which is not the project this editor is scoped to. Open that project and retry. ' +
          'Showing the editor’s default view instead.'
      );
      return;
    }
    if (t.docType && filing.document && filing.document.doc_type !== t.docType) {
      setTargetNotice(
        `Couldn’t open ${wanted} — this project’s governed dossier is ` +
          `${filing.document.doc_type.toUpperCase()}, not ${family}. ` +
          'Showing the editor’s default view instead.'
      );
      return;
    }
    const scope = creationScopeRef.current;
    const sequence = navigationSequence.current;
    void (async () => {
      // The docs list is program-scoped (or the org's current filter); a
      // program's dossier is one or a few documents, so the search is bounded
      // defensively rather than paged.
      for (const d of docs.slice(0, 8)) {
        const { ok, body } = await readJson<{ sections?: AuthSection[] }>(
          `/api/authoring/docs/${encodeURIComponent(d.id)}/sections`
        );
        if (!linkedReadStillCurrent(scope, sequence)) return;
        if (!ok || !body) continue;
        const match = matchEditorTargetSection(
          Array.isArray(body.sections) ? body.sections : [],
          t
        );
        if (match) {
          // Route the selection through loadSections (via targetSectionRef) so
          // the section is selected only once its list — and therefore its
          // content — is in state. Selecting directly here could sync an empty
          // buffer over a section that has text.
          const opened = requestLeaveRef.current({ kind: 'document', id: d.id, sectionId: match.id });
          // A docs-error notice from before the list loaded must not outlive
          // the successful open.
          setTargetNotice(null);
          setTreeScrollNonce(n => n + 1);
          fireToast(opened ?
            `Opened ${match.code} · ${match.title}` +
              (family ? ` — from the ${family} workspace.` : ' — as requested in chat.')
              : `${match.code} · ${match.title} will open once you decide about the unsaved work here.`
          );
          return;
        }
      }
      if (!aliveRef.current || creationScopeRef.current !== scope || navigationSequence.current !== sequence) return;
      setTargetNotice(
        `Couldn’t find ${wanted} in the ${family ? `${family} ` : ''}documents in scope ` +
          `(status filter: ${status.replace('_', ' ')}). Showing the editor’s default view — ` +
          'the section may not be drafted here yet, or may sit under another status.'
      );
    })();
  }, [
    sectionOpenTarget,
    docsState,
    docs,
    filing.loading,
    filing.document,
    projectIdForOutline,
    status,
    activeDocId,
    loadSections,
    requestLeave,
    fireToast,
    programId,
    openExactDocumentSection,
    programSwitchHeld,
    rejectLinkedTarget,
    linkedReadStillCurrent,
    pinnedDocId,
  ]);

  /* ── Open-by-document-type hand-off (navigate_to `authoringDocType`) ──
     "AnA, open the Clinical Overview for authoring" → the directive names a
     document, not a section. Matched against the REAL documents in scope by
     title (normalized exact first, then containment) — never a fabricated
     document, and an honest notice on a miss. A section hand-off wins when
     both were named: its bounded search already spans every document. */
  const docQueryAttemptedRef = useRef(false);
  useEffect(() => {
    if (docQueryAttemptedRef.current) return;
    if (!navHandOff.docQuery || sectionOpenTarget || docsState === 'loading') return;
    docQueryAttemptedRef.current = true;
    const wanted = navHandOff.docQuery;
    if (docsState === 'error') {
      setTargetNotice(
        `Couldn’t open “${wanted}” — the document list failed to load, so nothing was resolved. ` +
          'Retry once documents load.'
      );
      return;
    }
    const norm = (s: string) => s.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    const want = norm(wanted);
    const match =
      docs.find(d => norm(d.title) === want) ?? docs.find(d => norm(d.title).includes(want));
    if (match) {
      if (match.id !== activeDocId) setActiveDocId(match.id);
      setTreeScrollNonce(n => n + 1);
      fireToast(`Opened “${match.title}” — as requested in chat.`);
      return;
    }
    setTargetNotice(
      `Couldn’t find a document matching “${wanted}” in scope ` +
        `(status filter: ${status.replace('_', ' ')}). Showing the editor’s default view — ` +
        'it may not be drafted here yet, or may sit under another status.'
    );
  }, [navHandOff.docQuery, sectionOpenTarget, docsState, docs, activeDocId, status, fireToast]);

  /* Bring the deep-linked section's tree row into view once it is active.
     Re-runs as the tree fills in; a no-op when nothing is active yet. */
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!treeScrollNonce) return;
    const row = rootRef.current?.querySelector<HTMLElement>('.ed-tree-row[data-active]');
    if (row && typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest' });
  }, [treeScrollNonce, activeSectionId, sections]);

  /* ── AnA's hands on this screen — the surface-action bus ──────────────────
     Registered under this surface's OWN surfaceViews id ('document-authoring');
     the bus alias-resolves the registry's 'authoring' surfaceId onto it, the
     same resolution nav() applies. Both handlers drive the SAME path the
     human's own tree clicks drive — requestLeave (the unsaved-work gate) plus
     the tree-scroll nonce — never a second navigation path, and both answer
     honest refusals instead of discarding a person's typing or resolving a
     near-miss into the wrong document. */
  /* One guard for both handlers: while a dialog or a write owns the canvas, an
     AnA-driven switch would discard or race the person's work. Specific per
     flag, because "busy" tells the subscriber nothing they can act on. */
  const authoringGuard = (): { ok: false; reason: string } | null => {
    const structuralRefusal = assemblyLeaveRefusalRef.current();
    if (structuralRefusal) return { ok: false, reason: structuralRefusal };
    if (pendingLeave)
      return { ok: false, reason: 'An unsaved-changes dialog is open — resolve it first.' };
    if (leaving)
      return { ok: false, reason: 'A save-and-leave is in progress — let it finish first.' };
    if (saving) return { ok: false, reason: 'A save is in progress — let it finish first.' };
    if (picking)
      return { ok: false, reason: 'The source picker is open — finish or cancel it first.' };
    if (pendingAnchor)
      return { ok: false, reason: 'A comment is being anchored — post or cancel it first.' };
    return null;
  };
  authoringBusyGuardRef.current = authoringGuard;
  /* Separate from the busy flags because it needs the honest specifics: AnA
     never discards typing, and the refusal names the section holding it. */
  const dirtyGuard = (): { ok: false; reason: string } | null => {
    if (!dirty) return null;
    const where = activeSection?.code ? `§${activeSection.code}` : 'the open section';
    return { ok: false, reason: `There are unsaved edits in ${where} — save or leave them first.` };
  };
  // The persistent task drawer shares these same refusal reasons. Keep the
  // current render's guard in a ref so a click cannot observe an older draft.
  const surfaceLeaveGuardRef = useRef<() => string | null>(() => null);
  surfaceLeaveGuardRef.current = () => (authoringGuard() ?? dirtyGuard())?.reason ?? null;
  useEffect(() => registerSurfaceLeaveGuard(() => surfaceLeaveGuardRef.current()), []);
  useSurfaceActionHandlers(surfaceActionId, {
    'authoring.open-document': params => {
      const guarded = authoringGuard() ?? dirtyGuard();
      if (guarded) return guarded;
      const raw = (params.title ?? '').trim();
      // Not-ready, not failed: the bus holds the directive and re-attempts on
      // this surface's ready signal below — the navigate→act gap.
      if (docsState === 'loading')
        return { ok: false, reason: 'The document list is still loading.', retry: true };
      if (docsState === 'error') return { ok: false, reason: 'The document list could not be read.' };
      const listed = () => listedChoices(docs.map(d => d.title), 'Documents listed');
      if (!raw) return { ok: false, reason: `No document named.${listed()}` };
      /* The same resolution idiom as the deep-link hand-off above — normalized
         exact, then containment — except that MULTIPLE containment hits are an
         honest refusal here. The legacy inline path silently took the first;
         an AnA-driven open must not guess between documents. */
      const norm = (s: string) =>
        s.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
      const want = norm(raw);
      const exact = docs.filter(d => norm(d.title) === want);
      const pool = exact.length > 0 ? exact : docs.filter(d => norm(d.title).includes(want));
      if (pool.length === 0) {
        return {
          ok: false,
          reason: `No document matching "${raw}" in scope (status filter: ${status.replace('_', ' ')}).${listed()}`,
        };
      }
      if (pool.length > 1) {
        return {
          ok: false,
          reason: `"${raw}" matches ${pool.length} documents — name one exactly.${listedChoices(
            pool.map(d => d.title),
            'Matches',
          )}`,
        };
      }
      const match = pool[0];
      if (match.id === activeDocId) return { ok: true, detail: 'Already open' };
      requestLeave({ kind: 'document', id: match.id });
      setTreeScrollNonce(n => n + 1);
      return { ok: true, detail: `Opened “${match.title}”` };
    },
    'authoring.open-section': params => {
      const guarded = authoringGuard() ?? dirtyGuard();
      if (guarded) return guarded;
      const code = (params.sectionCode ?? '').trim();
      if (!code) return { ok: false, reason: 'No section code given.' };
      if (activeDocId == null || sectionsState === 'idle') {
        return { ok: false, reason: 'No document is open — open one first.' };
      }
      if (sectionsState === 'loading')
        return { ok: false, reason: 'The document’s sections are still loading.', retry: true };
      if (sectionsState === 'error')
        return { ok: false, reason: 'The document’s sections could not be read.' };
      /* Resolved ONLY within the open document's loaded sections — the
         cross-document search belongs to navigate_to, and the refusal says so
         instead of quietly widening the scope. */
      const match = matchEditorTargetSection(sections, { sectionCode: code, sectionLabel: null });
      if (!match) {
        const docName = activeDoc ? `“${activeDoc.title}”` : 'the open document';
        return {
          ok: false,
          reason: `§${code} is not in ${docName} — for another document, ask me to navigate to authoring with that section code.`,
        };
      }
      if (match.id === activeSectionId) return { ok: true, detail: 'Already open' };
      requestLeave({ kind: 'section', id: match.id });
      setTreeScrollNonce(n => n + 1);
      return { ok: true, detail: `Opened §${match.code} · ${match.title}` };
    },
    'authoring.find': params => {
      /* Read-only affordance: dirtyGuard deliberately does NOT apply — the
         person's own Ctrl/⌘-F works over unsaved edits and opening the bar
         discards nothing. The dialog/save guards still do. */
      const guarded = authoringGuard();
      if (guarded) return guarded;
      if (docsState === 'loading' || sectionsState === 'loading')
        return { ok: false, reason: 'The document is still loading.', retry: true };
      const handle = editorRef.current;
      if (!handle) {
        return { ok: false, reason: 'No section is open in the editor — open a document first.' };
      }
      const q = (params.query ?? '').trim();
      if (!handle.openFind(q || undefined)) {
        return {
          ok: false,
          reason:
            'This section is in raw-HTML source mode — the find bar is unavailable there (the browser\'s own find works).',
        };
      }
      return { ok: true, detail: q ? `Find bar open — searching for "${q}"` : 'Find bar opened' };
    },
  });
  /* The ready signal for the retry contract above: when the reads settle
     (sections 'idle' — no document open — counts as settled; the handler
     answers that case honestly), a held not-ready directive gets its one
     re-attempt. */
  useEffect(() => {
    if (surfaceActionId && docsState !== 'loading' && sectionsState !== 'loading') {
      notifySurfaceActionReady(surfaceActionId);
    }
  }, [surfaceActionId, docsState, sectionsState]);

  /* ── Load the right-rail data for the active section on demand ── */
  const loadHistory = useCallback(async (sectionId: string) => {
    historySectionRef.current = sectionId;
    setRevisionsState('loading');
    setRevisions([]);
    // `ok` is honoured because a read FAILURE must never be rendered as an
    // assertion about the record. This destructured only `body`, so a 500 —
    // which this endpoint returned on every single call while its join was
    // `u.id = r.created_by::uuid` (integer = uuid, 42883 at parse time) —
    // produced an empty array and the rail said "No prior revisions". An
    // author who had saved five times was told her edits were never versioned,
    // and a reviewer was told the section had never changed.
    const { ok, body } = await readJson<{ revisions?: AuthRevision[] }>(
      `/api/authoring/sections/${encodeURIComponent(sectionId)}/history`
    );
    if (historySectionRef.current !== sectionId) return; // a later section is on screen
    if (!ok) {
      setRevisionsState('error');
      setRevisions([]);
      return;
    }
    setRevisionsState('ready');
    setRevisions(Array.isArray(body?.revisions) ? body!.revisions! : []);
  }, []);

  /* Same contract as loadSources below: a failed read is an ERROR, never an
     empty list. This loader used to discard `ok` and render every failure as
     "No comments yet" — on a rail consulted to decide whether a document is
     clear of open review threads before freezing it, that conflation is the
     dangerous one.

     Doc-scoped, same as the section loader's targetSectionRef: the ref stamps
     the LATEST requested doc, and a response for any other doc is dropped.
     Without it, switching documents while a slow comments fetch was in flight
     rendered document A's review threads under document B — and a reply or a
     resolution made there acted on threads of a document not on screen. */
  const commentsDocRef = useRef<string | null>(null);
  const loadComments = useCallback(async (docId: string) => {
    commentsDocRef.current = docId;
    setCommentsState('loading');
    /* The ref above stops a stale RESPONSE landing; nothing stopped the stale
       DISPLAY. On a document switch the previous document's threads stayed on
       screen — with live Resolve / Reply controls that write by comment id —
       until the new read returned. Cleared here, with the thread focus. */
    setComments([]);
    setFocusedCommentId(null);
    setReplyTo(null);
    setResolveFor(null);
    const { ok, body } = await readJson<{ comments?: AuthComment[] }>(
      `/api/authoring/documents/${encodeURIComponent(docId)}/comments`
    );
    if (commentsDocRef.current !== docId) return;
    if (!ok || !body) {
      setCommentsState('error');
      setComments([]);
      return;
    }
    setCommentsState('ready');
    setComments(Array.isArray(body.comments) ? body.comments : []);
  }, []);

  /* ── The document's audit trail ──
     GET /docs/:docId/audit has served these rows — actor, role, operation,
     reason, before/after content hashes — since the authoring store shipped,
     and no surface ever called it: the record §11.10(e) exists for was being
     written and could not be read. Newest first, as the server returns it. */
  const auditDocRef = useRef<string | null>(null);
  const loadAudit = useCallback(async (docId: string) => {
    // Doc-scoped like loadComments above: a Part 11 trail rendered under the
    // wrong document is worse than a late one.
    auditDocRef.current = docId;
    setAuditState('loading');
    const { ok, status, body } = await readJson<{ events?: AuthAuditEvent[] }>(
      `/api/authoring/docs/${encodeURIComponent(docId)}/audit?limit=100`
    );
    if (auditDocRef.current !== docId) return;
    if (status === 403) {
      setAuditState('forbidden');
      setAuditEvents([]);
      return;
    }
    if (!ok || !body) {
      setAuditState('error');
      setAuditEvents([]);
      return;
    }
    setAuditEvents(Array.isArray(body.events) ? body.events : []);
    setAuditState('ready');
  }, []);

  /* ── Download the document's authoring record ──
     GET /docs/:docId/audit/export — every trail row whole, its chain entry and
     verdict, the tenant chain walked now, and how to check it all offline.
     Through apiRequest, so the bearer token and tenant header travel with it
     (the API takes no cookie). The server records the export on the chain
     BEFORE it sends anything and answers 503 when it cannot; that refusal, like
     any other, stays on the rail in the server's own words. */
  const downloadAuditRecord = useCallback(async (docId: string) => {
    setRecordExport({ docId, busy: true, error: null });
    const settle = (error: string | null) =>
      setRecordExport(prev => (prev.docId === docId ? { docId, busy: false, error } : prev));
    try {
      const res = await apiRequest(
        'GET',
        `/api/authoring/docs/${encodeURIComponent(docId)}/audit/export`
      );
      // apiRequest RETURNS a 401 rather than throwing it.
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        settle(
          'The record was not downloaded. ' +
            (serverMessage(json) ?? 'Your session isn’t authenticated.')
        );
        return;
      }
      const blob = await res.blob();
      const saved = downloadBlob(`authoring-record-${safeFileName(docId, 'document')}.json`, blob);
      settle(
        saved
          ? null
          : 'The record was prepared, but this browser did not save the file. Try again.'
      );
    } catch (err) {
      settle(
        'The record was not downloaded. ' +
          (err instanceof ApiRequestError
            ? serverMessage(err.payload) ?? err.message
            : 'The service could not be reached.')
      );
    }
  }, []);

  /* ── The sources this section is drafted from ──
     Live read, honest failure. An error is reported as an error rather than as
     an empty list: "we could not load what this section cites" and "this section
     cites nothing" are different facts, and on a regulated surface conflating
     them is the more dangerous mistake. */
  const sourcesSectionRef = useRef<string | null>(null);
  const loadSources = useCallback(async (sectionId: string) => {
    /* Section-scoped like the other loaders: without the ref, fast section
       switching let §A's citation list resolve last and render as §B's
       "Drafted from" — with Re-read / Remove buttons that then posted §A's
       citation ids against §B — and fed the editor's citation picker the
       wrong section's library for the same window. */
    sourcesSectionRef.current = sectionId;
    setSourcesState('loading');
    setSources([]);
    const { ok, body } = await readJson<{ sources?: SectionSource[] }>(
      `/api/authoring/sections/${encodeURIComponent(sectionId)}/sources`
    );
    if (sourcesSectionRef.current !== sectionId) return;
    if (!ok || !body) {
      setSourcesState('error');
      setSources([]);
      return;
    }
    setSources(Array.isArray(body.sources) ? body.sources : []);
    setSourcesState('ready');
  }, []);

  /* ── Recompute the revision ledger server-side ──
     The server walks the section's revision chain oldest-first and recomputes
     every hash from stored content. "Verified" here is a computation result,
     never a cached flag. */
  const verifyLedger = useCallback(async (sectionId: string) => {
    setLedger('checking');
    const { ok, body } = await readJson<LedgerVerdict & { success?: boolean }>(
      `/api/authoring/sections/${encodeURIComponent(sectionId)}/history/verify`
    );
    if (!ok || !body) {
      setLedger('error');
      return;
    }
    setLedger(body);
  }, []);

  useEffect(() => {
    setLedger(null);
  }, [activeSectionId]);

  useEffect(() => {
    if (rail === 'sources') { loadProjectSources(); refreshCitationAdmission(); }
  }, [rail, loadProjectSources, refreshCitationAdmission]);

  useEffect(() => {
    if (rail === 'history' && activeSectionId) void loadHistory(activeSectionId);
    if (rail === 'comments' && activeDocId) void loadComments(activeDocId);
    if (rail === 'audit' && activeDocId) void loadAudit(activeDocId);
    /* Loaded whenever a section is open, not only when the Sources rail is:
       the editor's citation picker offers this library, and a writer citing a
       source mid-sentence should not have to open a rail first to make the
       list exist. The rail re-reads on open through the same callbacks. */
    if (activeSectionId) {
      void loadSources(activeSectionId);
    }
  }, [
    rail,
    activeSectionId,
    activeDocId,
    loadHistory,
    loadComments,
    loadAudit,
    loadSources,
  ]);

  /* The catalogue supplies metadata, while exact recorded associations admit
     each section's references. Previous sections advance the same registry. */
  const citationLibrary = useMemo<CitationSource[]>(() => admittedCitationSources(projectSources, citationAdmission.admissions, activeSectionId),
    [projectSources, citationAdmission.admissions, activeSectionId]);
  const precedingCitations = useMemo(() => admittedPrecedingSources(sections, activeSectionId, projectSources, citationAdmission.admissions),
    [sections, activeSectionId, projectSources, citationAdmission.admissions]);
  const citationChoices = useMemo(() => projectSources.filter(sourceCitationEligible).map(source => ({ id: String(source.id), title: source.title })), [projectSources]);
  const citationResolutionState = projectSourcesState === 'error' || citationAdmission.state === 'error' ? 'error'
    : projectSourcesState === 'loading' || citationAdmission.state === 'loading' ? 'loading' : 'ready';

  /* ── The document's tables and figures, either side of the open section ──
     A caption's number is the object's POSITION among the document's tables
     (or figures), and the editor holds one section. Without the objects above
     it the canvas would number from 1 and show "Table 1" for an object the
     filing prints as "Table 7" — a plausible-looking wrong number, which is
     the failure this design exists to remove. The ones BELOW are supplied too,
     because "as shown in Table 9" is routinely written above the table it
     names and must resolve.

     Read from the sections' SAVED content, in the document's own order, which
     is what the export will read too. The open section's own objects are not
     here: the canvas numbers those from its live document, so a table gets its
     number the moment it is captioned rather than at the next save. */
  const captionsAround = useMemo<{
    before: CaptionedObject[];
    after: CaptionedObject[];
  }>(() => {
    const before: CaptionedObject[] = [];
    const after: CaptionedObject[] = [];
    let seen = false;
    for (const sec of sections) {
      if (sec.id === activeSectionId) {
        seen = true;
        continue;
      }
      (seen ? after : before).push(...captionedObjectsInHtml(sec.content ?? ''));
    }
    return { before, after };
  }, [sections, activeSectionId]);

  /* ── Record that this section is drafted from a source ── */
  const citeSource = useCallback(
    async (sourceId: number) => {
      if (!activeSectionId || citationResolutionState !== 'ready'
        || !projectSources.some(source => source.id === sourceId && sourceCitationEligible(source))) return false;
      const scope = citationScope;
      try {
        const res = await apiRequest(
          'POST',
          `/api/authoring/sections/${activeSectionId}/cite-source`,
          {
            source_id: sourceId,
          }
        );
        const json = await res.json().catch(() => null);
        if (citationScopeRef.current !== scope) return false;
        if (!res.ok || !json || json.success !== true) {
          fireToast(
            'Couldn’t record the source — ' +
              (serverMessage(json) ?? 'the server refused it') +
              '. Nothing was saved.',
            'error'
          );
          return false;
        }
        const created = json.created === true;
        fireToast(
          created
            ? 'Source recorded — this section now cites it, with the source’s current checksum.'
            : 'This section already records the source; its original citation checksum is retained.'
        );
        citationAdmission.admit(activeSectionId, sourceId);
        setPicking(false);
        if (created) {
          // Same staleness as the comment count: the section row is the only
          // source of the rail button's number.
          setSections(ss =>
            ss.map(s => (s.id === activeSectionId ? { ...s, citation_count: num(s.citation_count) + 1 } : s))
          );
        }
        void loadSources(activeSectionId);
        return true;
      } catch (e) {
        if (citationScopeRef.current !== scope) return false;
        fireToast(
          'Couldn’t record the source — ' + redactInternals(e instanceof Error ? e.message : '', 'the server could not be reached') + '.',
          'error'
        );
        return false;
      }
    },
    [activeSectionId, citationScope, citationResolutionState, projectSources, citationAdmission, fireToast, loadSources]
  );

  /* ── Stop citing a source ── */
  const uncite = useCallback(
    async (sourceId: number) => {
      if (!activeSectionId) return;
      /* apiRequest THROWS on the server's actual refusal (404 "a frozen
         citation is immutable") and RETURNS a 401. The old shape had no catch,
         so the real refusal was an unhandled rejection with no toast and a row
         that just sat there — while the only reachable message, on 401, blamed
         freeze-immutability for an expired session. */
      try {
        const res = await apiRequest(
          'DELETE',
          `/api/authoring/sections/${activeSectionId}/cite-source/${sourceId}`
        );
        if (res.status === 401) {
          fireToast('Not removed — your session isn’t authenticated. Nothing was changed.', 'error');
          return;
        }
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          fireToast('Couldn’t remove the citation — ' + (serverMessage(json) ?? 'the server refused it') + '. Nothing was changed.', 'error');
          return;
        }
        citationAdmission.retry();
        fireToast('Citation removed.');
        void loadSources(activeSectionId);
      } catch (e) {
        fireToast(
          'Couldn’t remove the citation — ' + redactInternals(e instanceof Error ? e.message : '', 'the server refused it') + '. Nothing was changed.',
          'error'
        );
      }
    },
    [activeSectionId, fireToast, loadSources, citationAdmission]
  );

  /* ── Re-read the source and record what it says now ──
     The server re-resolves against the stored source; it does not invent a hash.
     A citation whose source is gone, or which is frozen, is refused with a reason. */
  const reresolve = useCallback(
    async (citationId: string) => {
      if (!activeSectionId) return;
      /* The route refuses with a phrased reason (frozen citation, source no
         longer resolves) as a 404/409 — which apiRequest THROWS, and this
         handler had no catch: "Re-read source" was a silent no-op on exactly
         the cases the comment above promises a reason for. */
      try {
        const res = await apiRequest(
          'POST',
          `/api/authoring/sections/${activeSectionId}/refresh-token`,
          {
            cite_id: citationId,
          }
        );
        const json = await res.json().catch(() => null);
        if (res.status === 401) {
          fireToast('Not re-read — your session isn’t authenticated. Nothing was changed.', 'error');
          return;
        }
        if (!res.ok) {
          fireToast('Couldn’t re-read the source — ' + (serverMessage(json) ?? 'the server refused it') + '. Nothing was changed.', 'error');
          return;
        }
        fireToast(serverMessage(json) ?? 'Source re-read.');
        void loadSources(activeSectionId);
      } catch (e) {
        fireToast(
          'Couldn’t re-read the source — ' + redactInternals(e instanceof Error ? e.message : '', 'the server refused it') + '. Nothing was changed.',
          'error'
        );
      }
    },
    [activeSectionId, fireToast, loadSources]
  );

  /* ── Re-read every source in the DOCUMENT ──
     The per-citation "re-read" above answers one claim at a time, which is the
     wrong granularity before an export or a sign-off: the question there is
     "has anything I cite moved?", across the whole document.

     The server re-resolves each unfrozen citation against its stored source and
     reports three separate numbers — how many it refreshed, how many of those
     actually CHANGED, and which it could not refresh and why. All three are
     said. Collapsing `skipped` into the success count is the tempting summary
     and the dishonest one: a citation whose source no longer exists is exactly
     what the person about to file this needs to see. */
  const [refreshingAll, setRefreshingAll] = useState(false);
  const refreshAllSources = useCallback(async () => {
    if (!activeDocId) return;
    setRefreshingAll(true);
    try {
      const res = await apiRequest('POST', `/api/authoring/docs/${activeDocId}/refresh-all`, {});
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        refreshed?: number;
        changed?: number;
        skipped?: Array<{ cite_id: string; reason: string }>;
      } | null;
      if (!res.ok || json?.ok !== true) {
        fireToast(
          'Couldn’t re-read this document’s sources — ' +
            (serverMessage(json) ?? `HTTP ${res.status}`) +
            '. Nothing was changed.',
          'error',
        );
        return;
      }
      const refreshed = typeof json.refreshed === 'number' ? json.refreshed : 0;
      const changed = typeof json.changed === 'number' ? json.changed : 0;
      const skipped = Array.isArray(json.skipped) ? json.skipped : [];
      setSkippedRefreshes(skipped);
      /* A refresh that changed nothing is a real and useful outcome — it means
         the citations still say what they said. It is reported as that, not as
         a bare "done". */
      fireToast(
        `Re-read ${refreshed} citation${refreshed === 1 ? '' : 's'}: ` +
          (changed === 0
            ? 'none had changed'
            : `${changed} had changed since they were recorded`) +
          (skipped.length > 0
            ? `. ${skipped.length} could not be re-read — see Sources.`
            : '.'),
        skipped.length > 0 ? 'error' : 'ok',
      );
      if (activeSectionId) void loadSources(activeSectionId);
    } catch (e) {
      fireToast(
        'Couldn’t re-read this document’s sources — ' +
          redactInternals(e instanceof Error ? e.message : '', 'the server could not be reached') +
          '. Nothing was changed.',
        'error',
      );
    } finally {
      setRefreshingAll(false);
    }
  }, [activeDocId, activeSectionId, loadSources, fireToast]);

  /* ── Save the section content (real, awaited, auto-revisioned) ──
     The ONE save path: the canonical editor serializes and calls this; the
     header Save button and Cmd/Ctrl-S route through the editor's own save so
     the footer save-state, the device cache and this governed PATCH cannot
     disagree. Throwing on failure lets the editor report the truth. */
  const saveSectionContent = useCallback(
    async (serialized: string, systemReason?: string) => {
      if (!activeSection) throw new Error('No section open');

      /* THE FUNNEL. Every content save arrives here — the Save button, ⌘S, and
         the unsaved-work guard's Save — so the reason is required here rather
         than only on the button, which is the one path a disabled attribute
         can cover. Without this, ⌘S saved silently with no reason and the
         button's requirement was decorative.
         Refused visibly, never silently: an author who pressed ⌘S and saw
         nothing happen would reasonably conclude their work was saved. */
      if (!systemReason && changeReasonRef.current.trim().length < 8) {
        fireToast(
          'Not saved — say why this section changed, in at least 8 characters. It is ' +
            'recorded with the revision, and the filing keeps it.',
          'error',
        );
        throw new Error('reason-for-change required');
      }

      setSaving(true);
      try {
        /* Authors whose insertions this reviewer accepted and no save has
           carried in yet. Accepting a suggestion strips the mark that named
           its author, so without this the revision would attribute an AnA
           draft entirely to whoever pressed accept.
           READ, not read-and-clear: the store is emptied by the save that
           LANDS, below. It used to be emptied here, before the request — so
           every refused save lost the attribution and the retry recorded AnA's
           clauses as a human's. See `clearAcceptedContributions`. */
        const acceptedAuthors = editorRef.current?.peekAcceptedAuthors?.() ?? [];
        /* And the accepted text itself, per insertion. The author list says
           WHO contributed to this save; this says WHICH words, so the lineage
           gate can record the machine's clauses as the machine's. The server
           keeps only machine authors it names — a colleague's accepted text is
           simply the document — and believes a claim only when the AnA turn
           record it names holds the words. */
        const acceptedMachineText = editorRef.current?.peekAcceptedInsertions?.() ?? [];
        /* The concurrency token. `updated_at` is the value THIS editor loaded;
           the server refuses with 409 SECTION_CHANGED if the row has moved
           since. Without it the PATCH is a blind last-write-wins, and two
           authors on one CTD section — a writer and a reviewer on the same
           §3.2.P.5 — end with the second save replacing the first's entire
           section, recorded in the revision ledger as an ordinary edit. */
        /* §11.10(d)/(e) reason for change. Stated once per section per editing
           session and carried on every save of that section — see
           `changeReason` below for why it is sticky rather than per-save.
           When it is absent the server records that it was NOT STATED; it does
           not invent one. */
        const reasonForChange = systemReason ?? changeReasonRef.current.trim();
        const res = await apiRequest('PATCH', `/api/authoring/sections/${activeSection.id}`, {
          content: serialized,
          ...(activeSection.updated_at ? { expectedUpdatedAt: activeSection.updated_at } : {}),
          ...(acceptedAuthors.length ? { acceptedAuthors } : {}),
          ...(acceptedMachineText.length ? { acceptedMachineText } : {}),
          ...(reasonForChange ? { changeReason: reasonForChange } : {}),
        });
        const json = await res.json().catch(() => null);
        if (res.status === 401) {
          fireToast('Not saved — your session isn’t authenticated. Sign in and retry.', 'error');
          throw new Error('unauthenticated');
        }
        /* The `!res.ok` branch that used to live here was UNREACHABLE, and with
           it every sentence this surface had for a refused save.
           `apiRequest` throws an ApiRequestError on any non-2xx except 401
           (client/src/lib/queryClient.ts), so execution never arrived at a
           non-ok `res`. The throw escaped this function — which has
           try/finally and no catch — into RichSectionEditor's unbound
           `catch { setSaveState('error') }`, where the error object, its
           message and its correlation id were all discarded. The author saw
           `Save failed — kept on this device` at 10px, in grey, and nothing
           else.
           On a Part 11 authoring surface that is the wrong failure to blur.
           The server distinguishes these deliberately and phrases each one:
             403 DOCUMENT_FROZEN     — with the lock's own reason
             403                     — no edit permission for this section
             500 LINEAGE_REQUIRED    — "the section was not saved: its data
                                        lineage could not be recorded"
           A frozen record and a flaky network need completely different
           actions from the author, and they were indistinguishable.
           The catch is in `doSave` below; this line documents why there is no
           `!res.ok` test here any more. */
        void json;
        const adopted = (json as { section?: AuthSection })?.section;
        confirmedSaveVersionRef.current = { sectionId: activeSection.id, updatedAt: adopted?.updated_at ?? null };
        const persisted = adopted?.content ?? serialized;
        // Adopt the server row (revision counter, updated_at) into the tree.
        setSections(ss =>
          ss.map(s =>
            s.id === activeSection.id ? { ...s, ...(adopted ?? {}), content: persisted } : s
          )
        );
        /* THE SAVE LANDED, so the accepted contributions it carried in are
           spent. Not before the request: a refused save must leave the claim
           for the retry, or the attribution is lost and the next save records
           AnA's clauses as this person's own. */
        editorRef.current?.clearAcceptedContributions?.();
        // This save just persisted whatever content reflects any decisions
        // made since the section was last saved — the unsaved-work guard's
        // count belongs to what is still unsaved, not to what this save
        // just closed out.
        pendingDecisionCountRef.current = 0;
        /* "a revision was recorded" was asserted from the 2xx alone. The
           server mints the revision in the same transaction and returns the
           row's counter; the sentence now names what came back, and defers to
           the History rail when nothing did. */
        fireToast(
          (adopted && adopted.revision_count != null
            ? `Section saved — revision ${num(adopted.revision_count)} recorded (${activeSection.code}).`
            : `Section saved (${activeSection.code}) — open History to confirm the revision.`) +
            filingCommitNote((json as { filing?: unknown } | null)?.filing) +
            machineTextNote((json as { machineText?: unknown } | null)?.machineText)
        );
        // Keep the history and audit rails fresh if open — a save writes both.
        if (rail === 'history') void loadHistory(activeSection.id);
        if (rail === 'audit' && activeDocId) void loadAudit(activeDocId);
        /* A save changes the document's content hash, which is precisely what
           the Exports rail compares against the last export. Unconditional:
           the rail re-reads on mount, so bumping while it is closed simply
           means it opens on the truth rather than on a cached verdict. */
        setExportsEpoch(e => e + 1);
        // A saved content change invalidates earlier peer verdict bindings.
        setTasksEpoch(e => e + 1);
      } catch (err) {
        /* THE AUTHOR IS TOLD WHY THE RECORD REFUSED THEIR WORK.
           `apiRequest` throws ApiRequestError for every non-2xx except 401, so
           this is where a frozen document, a permission refusal and a lineage
           failure actually arrive. `message` has already been through
           `extractApiError`, so it is the server's own sentence with SQL,
           relation names, routes and env vars filtered out — safe to render
           verbatim, which is the point: "This document is frozen. Its content
           is sealed under a content hash" tells the author to create a new
           version, and "HTTP 403" tells them to file a bug.
           `correlationId` is the X-Request-Id the server echoed; it is the one
           string that makes an outage diagnosable without describing the
           schema to whoever is looking.
           Re-thrown either way: the editor's own save-state must still go to
           'error' and keep the text cached on the device. This adds the
           explanation; it does not swallow the failure. */
        const e = err as Partial<ApiRequestError> & { message?: string };
        /* A collision is not a failure to report like the others. The author's
           text is intact on this device and nothing of theirs was lost — what
           they must NOT do is press save again expecting it to work, and what
           they must know is that someone else's version is now the record.
           Reloading is the only safe next step, so the message says so instead
           of offering a retry that would either fail again or clobber. */
        if (e?.status === 409) {
          fireToast(
            `Not saved — ${activeSection.code} was changed by someone else while you were editing. ` +
              'Your text is still here and theirs was not overwritten. Reload the section to see ' +
              'their version, then reapply your changes.',
            'error',
          );
          throw err;
        }
        const why = redactInternals(e?.message, 'the server did not accept the change');
        fireToast(
          `Couldn’t save ${activeSection.code} — ${why} Nothing was persisted.` +
            (e?.correlationId ? ` Reference ${e.correlationId}.` : ''),
          'error',
        );
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [activeSection, rail, loadHistory, fireToast]
  );

  /* ── Upload a figure into the governed image store ──
     Multipart, because apiRequest is JSON-only, with the Bearer attached
     explicitly — cookies alone never authenticate /api/authoring. The editor
     inserts the returned REFERENCE; section HTML never carries image bytes,
     so the revision ledger stays lean and the device cache stays inside its
     quota. Thrown reasons surface in the editor's own notice bar. */
  const imageContextRef = useRef('');
  imageContextRef.current = programSwitchHeld ? 'scope-switch-held' : `${activeDocId}:${activeSectionId}:${contentEpoch}:${programId}`;
  const uploadSectionImage = useCallback(async (file: File) => {
    if (!activeDocId || !activeSectionId || contentReadOnly || programSwitchHeld) throw new Error(editRefusal || 'Open an editable document in the current project before uploading an image.');
    const context = `${activeDocId}:${activeSectionId}:${contentEpoch}:${programId}`;
    const sequence = navigationSequence.current;
    const form = new FormData();
    form.append('file', file);
    form.append('documentId', activeDocId);
    const token = getAuthToken();
    const res = await fetch('/api/authoring/images', {
      method: 'POST',
      body: form,
      credentials: 'include',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    const json = (await res.json().catch(() => null)) as {
      image?: { id?: unknown; url?: unknown };
      error?: unknown;
    } | null;
    if (!aliveRef.current || sequence !== navigationSequence.current || context !== imageContextRef.current) {
      throw new Error('The editor context changed. This image was not inserted.');
    }
    if (!res.ok || typeof json?.image?.url !== 'string') {
      // The envelope's error goes through the canonical reader, which drops an
      // enum token or internal text before it reaches the thrown message a toast
      // will show. A hand-rolled `typeof error === 'string'` skips both filters.
      throw new Error(serverMessage(json) ?? `the image store returned HTTP ${res.status}`);
    }
    return { id: String(json.image.id), url: json.image.url };
  }, [activeDocId, activeSectionId, contentReadOnly, editRefusal, programSwitchHeld, contentEpoch, programId]);

  /* ── Track changes: the store's own column drives the suggestion engine ──
     The server column is flipped FIRST; the editor enables suggestion capture
     only after the PATCH confirms, so the canvas never claims a mode the
     record does not hold. */
  const toggleTrackChanges = useCallback(
    async (on: boolean) => {
      if (!activeSection) throw new Error('No section open');
      /* apiRequest THROWS the server's real refusal (a frozen document), and the
         editor's toggleTrack swallows the rethrow to keep its state truthful —
         so the author got no reason at all. The reason is said here, then the
         throw still reverts the toggle. */
      let res: Response;
      try {
        res = await apiRequest('PATCH', `/api/authoring/sections/${activeSection.id}`, {
          track_changes: on,
        });
      } catch (e) {
        fireToast(
          'Couldn’t change track changes — ' +
            redactInternals(e instanceof Error ? e.message : '', 'the server refused it') +
            '. The mode is unchanged.',
          'error'
        );
        throw new Error('track toggle refused', { cause: e });
      }
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        fireToast(
          'Couldn’t change track changes — ' +
            (serverMessage(json) ?? 'the server refused it') +
            '. The mode is unchanged.',
          'error'
        );
        throw new Error('track toggle refused');
      }
      setSections(ss => ss.map(s => (s.id === activeSection.id ? { ...s, track_changes: on } : s)));
      fireToast(
        on
          ? 'Track changes on — edits are captured as attributed suggestions until accepted or rejected.'
          : 'Track changes off — edits apply directly. Existing suggestions remain until resolved.'
      );
    },
    [activeSection, fireToast]
  );

  /* ── Comment anchoring hand-off (editor → comments rail → editor) ── */
  const requestAnchoredComment = useCallback((anchor: CommentAnchorPayload) => {
    return new Promise<string | null>(resolve => {
      pendingAnchorRef.current?.resolve(null); // supersede any prior request
      pendingAnchorRef.current = { anchor, resolve };
      setPendingAnchor(anchor);
      setRail('comments');
    });
  }, []);

  const cancelAnchoredComment = useCallback(() => {
    pendingAnchorRef.current?.resolve(null);
    pendingAnchorRef.current = null;
    setPendingAnchor(null);
  }, []);

  /** A click on annotated text in the canvas opens its thread in the rail. */
  const openCommentFromAnchor = useCallback((commentId: string) => {
    setFocusedCommentId(commentId);
    setRail('comments');
  }, []);

  /** Live co-editing rides the server's /collab Hocuspocus socket. Dark by
   *  default: both this client flag AND the server's ENABLE_COLLAB_CRDT must
   *  be on. When the socket is absent the editor reports "editing solo" and
   *  the governed PATCH path is unaffected. */
  const liveCoedit = isFeatureEnabled('ENABLE_LIVE_COEDITING');

  /* ── Revert to a prior revision (server snapshots current first) ── */
  const revert = useCallback(
    async (revId: string) => {
      if (!activeSection) return;
      try {
        const res = await apiRequest('POST', `/api/authoring/sections/${activeSection.id}/revert`, {
          rev_id: revId,
        });
        const json = await res.json().catch(() => null);
        if (res.status === 401) {
          fireToast('Not reverted — your session isn’t authenticated.', 'error');
          return;
        }
        if (!res.ok) {
          fireToast(
            'Couldn’t revert — ' + (serverMessage(json) ?? 'the server refused it') + '.',
            'error'
          );
          return;
        }
        const adopted = (json as { section?: AuthSection })?.section;
        const content = adopted?.content ?? '';
        setSections(ss =>
          ss.map(s => (s.id === activeSection.id ? { ...s, ...(adopted ?? {}), content } : s))
        );
        // The server replaced the content out from under the editor — remount
        // the canvas on the new truth rather than leaving a stale buffer.
        setContentEpoch(e => e + 1);
        setEditorDirty(false);
        setExportsEpoch(e => e + 1);
        fireToast('Section reverted to the selected revision.');
        void loadHistory(activeSection.id);
      } catch (e) {
        fireToast(
          'Couldn’t revert — ' + redactInternals(e instanceof Error ? e.message : '', 'the server could not be reached') + '.',
          'error'
        );
      }
    },
    [activeSection, loadHistory, fireToast]
  );

  /* ── Add a comment on the active section ──
     When a text-range anchor is pending (the editor's Comment button), it is
     recorded into the row's `anchor` JSONB and the server-issued comment id is
     resolved back to the editor so the highlight mark can be applied — the row
     is the thread, the mark is the anchor. */
  const addComment = useCallback(async () => {
    if (!activeSection || !activeDocId || !newComment.trim()) return;
    const pending = pendingAnchorRef.current;
    try {
      const res = await apiRequest('POST', `/api/authoring/sections/${activeSection.id}/comment`, {
        body: newComment.trim(),
        doc_id: activeDocId,
        ...(pending ? { anchor: pending.anchor } : {}),
      });
      const json = await res.json().catch(() => null);
      /* On every failure the editor's anchor request must be answered: it
         used to be left pending forever, and the Comment button then silently
         did nothing for the rest of the mount. */
      const abandonAnchor = () => {
        if (!pending) return;
        pending.resolve(null);
        pendingAnchorRef.current = null;
        setPendingAnchor(null);
      };
      if (res.status === 401) {
        abandonAnchor();
        fireToast('Comment not posted — your session isn’t authenticated. Sign in and retry.', 'error');
        return;
      }
      if (!res.ok) {
        abandonAnchor();
        fireToast(
          'Couldn’t post the comment — ' + (serverMessage(json) ?? 'the server refused it') + '.',
          'error'
        );
        return;
      }
      setNewComment('');
      const created = (json as { comment?: { id?: string } })?.comment;
      if (pending) {
        pending.resolve(typeof created?.id === 'string' ? created.id : null);
        pendingAnchorRef.current = null;
        setPendingAnchor(null);
        /* "Comment anchored" was toasted here — before the save that carries
           the anchor mark had been attempted. The thread exists; whether the
           highlight is in the record is the editor's onAnchored report. */
        fireToast('Comment created — anchoring it to the selected text…');
      } else {
        fireToast('Comment added.');
      }
      /* The rail button's count comes from the section row, refreshed only by
         loadSections — so it kept reading "Comments 3" when four existed.
         Bumped here from the confirmed write. */
      setSections(ss =>
        ss.map(s => (s.id === activeSection.id ? { ...s, comment_count: num(s.comment_count) + 1 } : s))
      );
      void loadComments(activeDocId);
    } catch (e) {
      if (pending) {
        pending.resolve(null);
        pendingAnchorRef.current = null;
        setPendingAnchor(null);
      }
      fireToast(
        'Couldn’t post the comment — ' + redactInternals(e instanceof Error ? e.message : '', 'the server could not be reached') + '.',
        'error'
      );
    }
  }, [activeSection, activeDocId, newComment, loadComments, fireToast]);

  /* ── Reply into a comment thread ──
     The write endpoint has accepted `parent_comment_id` and the read has
     returned nested `replies` since the duplicate-route collapse — and the
     rail rendered neither, so every review "thread" was a guestbook: a
     reviewer's question could only be answered by a NEW top-level comment
     above it. One reply box open at a time; the reply posts against the
     THREAD's section (not the section the author happens to have open), and
     nothing local changes until the server confirms. */
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  /* Resolve opens a small confirm with an OPTIONAL reason — the platform's
     reason-for-change convention, kept optional here because resolving a
     comment is not an edit to governed content. Whatever is stated is
     recorded as the thread's resolution_note and shown with the record. */
  const [resolveFor, setResolveFor] = useState<string | null>(null);
  const [resolveNote, setResolveNote] = useState('');
  const addReply = useCallback(
    async (parent: AuthComment) => {
      if (!activeDocId || !replyText.trim() || !parent.section_id) return;
      try {
        const res = await apiRequest(
          'POST',
          `/api/authoring/sections/${encodeURIComponent(parent.section_id)}/comment`,
          { body: replyText.trim(), doc_id: activeDocId, parent_comment_id: parent.id }
        );
        const json = await res.json().catch(() => null);
        if (res.status === 401) {
          fireToast('Reply not posted — your session isn’t authenticated. Sign in and retry.', 'error');
          return;
        }
        if (!res.ok) {
          fireToast(
            'Couldn’t post the reply — ' + (serverMessage(json) ?? 'the server refused it') + '.',
            'error'
          );
          return;
        }
        setReplyText('');
        setReplyTo(null);
        fireToast('Reply added to the thread.');
        void loadComments(activeDocId);
      } catch (e) {
        fireToast(
          'Couldn’t post the reply — ' + redactInternals(e instanceof Error ? e.message : '', 'the server could not be reached') + '.',
          'error'
        );
      }
    },
    [activeDocId, replyText, loadComments, fireToast]
  );

  /* ── Resolve / reopen a comment thread ──
     PATCH /api/authoring/comments/:id has recorded status changes with resolver
     attribution (JWT actor, resolved_at) since the store shipped — and no
     surface ever called it, so review threads could only accumulate. The row
     is never deleted by this: a resolved comment stays in the record with who
     resolved it; reopen is the honest undo. */
  const setCommentStatus = useCallback(
    async (commentId: string, statusTo: 'resolved' | 'open', note?: string) => {
      if (!activeDocId) return;
      try {
        const res = await apiRequest(
          'PATCH',
          `/api/authoring/comments/${encodeURIComponent(commentId)}`,
          {
            status: statusTo,
            // The server has kept resolution_note since the store shipped; the
            // UI never sent one, so every resolution closed without a stated
            // disposition. Optional — an empty note is not fabricated into one.
            ...(statusTo === 'resolved' && note?.trim() ? { resolution_note: note.trim() } : {}),
          }
        );
        const json = await res.json().catch(() => null);
        if (res.status === 401) {
          fireToast('Not changed — your session isn’t authenticated. Sign in and retry.', 'error');
          return;
        }
        if (!res.ok) {
          fireToast(
            'Couldn’t update the comment — ' +
              (serverMessage(json) ?? 'the server refused it') +
              '. Its status is unchanged.',
            'error'
          );
          return;
        }
        fireToast(
          statusTo === 'resolved'
            ? 'Comment resolved — recorded under your name. The thread stays in the record.'
            : 'Comment reopened.'
        );
        void loadComments(activeDocId);
      } catch (e) {
        fireToast(
          'Couldn’t update the comment — ' + redactInternals(e instanceof Error ? e.message : '', 'the server could not be reached') + '.',
          'error'
        );
      }
    },
    [activeDocId, fireToast, loadComments]
  );

  /* ── Rename the open section (code and title) ──
     PATCH /sections/:id has accepted `title` and `code` since the route was
     written; only `content` ever had UI. A mistyped section title was
     permanent unless someone edited the database. Renaming is metadata — the
     server records no content revision for it — and it is held to the same
     honesty contract: awaited, adopted from the server's row, nothing local
     mutated on failure. */
  const [renaming, setRenaming] = useState(false);
  const [renameCode, setRenameCode] = useState('');
  const [renameTitle, setRenameTitle] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);
  useEffect(() => {
    setRenaming(false);
  }, [activeSectionId]);
  /* 2026-09-28, coverage-gap sweep GA-6: every exit from the rename group
     (Escape, Cancel, a no-change or successful save) unmounted the control
     that held focus and left it on <body>. Those exits now go through
     closeRename, and focus returns to the Rename button once the header has
     re-rendered. The section-change reset above does not: the user moved
     somewhere else on purpose. */
  const renameBtnRef = useRef<HTMLButtonElement>(null);
  const renameReturnFocusRef = useRef(false);
  const closeRename = useCallback(() => {
    renameReturnFocusRef.current = true;
    setRenaming(false);
  }, []);
  useEffect(() => {
    if (renaming || !renameReturnFocusRef.current) return;
    renameReturnFocusRef.current = false;
    renameBtnRef.current?.focus({ preventScroll: true });
  }, [renaming]);

  const openRename = useCallback(() => {
    if (!activeSection) return;
    setRenameCode(activeSection.code);
    setRenameTitle(activeSection.title);
    setRenaming(true);
  }, [activeSection]);

  const saveRename = useCallback(async () => {
    if (!activeSection) return;
    const code = renameCode.trim();
    const title = renameTitle.trim();
    if (!code || !title) {
      fireToast('Both the section code and the title are required.', 'error');
      return;
    }
    if (code === activeSection.code && title === activeSection.title) {
      closeRename();
      return;
    }
    setRenameBusy(true);
    try {
      const res = await apiRequest('PATCH', `/api/authoring/sections/${activeSection.id}`, {
        code,
        title,
      });
      const json = await res.json().catch(() => null);
      /* apiRequest THROWS on any non-2xx EXCEPT 401 — which it returns. This
         handler's comment used to say so and then forgot it: a 401 landed here,
         `adopted` was undefined, the CLIENT's code/title were written into the
         section list, and the toast said "Section renamed" over a rename the
         server refused. Section code drives eCTD placement, so the tree and
         the cross-reference resolvers then ran against a code the record did
         not hold. The 401 is handled here, before anything is adopted. */
      if (res.status === 401) {
        fireToast('Not renamed — your session isn’t authenticated. Nothing was changed.', 'error');
        return;
      }
      if (!res.ok) {
        fireToast('Couldn’t rename the section — ' + (serverMessage(json) ?? 'the server refused it') + '. Nothing was changed.', 'error');
        return;
      }
      const adopted = (json as { section?: AuthSection })?.section;
      setSections(ss =>
        ss.map(s => (s.id === activeSection.id ? { ...s, ...(adopted ?? { code, title }) } : s))
      );
      closeRename();
      fireToast(`Section renamed — ${code} · ${title}. Its content and history are unchanged.`);
    } catch (e) {
      const err = e as Partial<ApiRequestError> & { message?: string };
      if (err?.status === 401) {
        fireToast('Not renamed — your session isn’t authenticated.', 'error');
        return;
      }
      /* The code is locked to the filing on a bound document — the server sent
         a complete sentence explaining why, so show it as-is rather than
         wrapping it in a second "couldn't rename" clause. */
      if (err?.code === 'CODE_LOCKED_TO_FILING') {
        fireToast(
          redactInternals(err.message, 'This section’s code cannot be changed on a filed document.'),
          'error',
        );
        return;
      }
      fireToast(
        'Couldn’t rename the section — ' +
          redactInternals(err?.message, 'the server did not accept it') +
          ' Nothing was changed.',
        'error'
      );
    } finally {
      setRenameBusy(false);
    }
  }, [activeSection, renameCode, renameTitle, fireToast, closeRename]);

  /* ── Move the open section within its document ──
     `order_index` is what the tree AND the export assembler order by, and
     until the reorder endpoint existed nothing could change it — a document
     whose sections were created out of order assembled out of order,
     permanently. The server validates the full permutation and renumbers in
     one transaction; the tree redraws from the canonical GET afterwards,
     never from a local echo. */
  const [reordering, setReordering] = useState(false);
  const moveSection = useCallback(
    async (dir: -1 | 1) => {
      if (!activeDocId || !activeSection || sections.length < 2) return;
      const idx = sections.findIndex(s => s.id === activeSection.id);
      const to = idx + dir;
      if (idx < 0 || to < 0 || to >= sections.length) return;
      const ids = sections.map(s => s.id);
      [ids[idx], ids[to]] = [ids[to], ids[idx]];
      setReordering(true);
      try {
        const res = await apiRequest(
          'POST',
          `/api/authoring/docs/${encodeURIComponent(activeDocId)}/sections/reorder`,
          { section_ids: ids }
        );
        const json = await res.json().catch(() => null);
        if (res.status === 401) {
          fireToast('Not moved — your session isn’t authenticated.', 'error');
          return;
        }
        if (!res.ok) {
          fireToast(
            'Couldn’t move the section — ' +
              (serverMessage(json) ?? 'the server refused it') +
              ' The order is unchanged.',
            'error'
          );
          // A 409 means the section list moved under us — adopt the truth.
          if (res.status === 409) void loadSections(activeDocId);
          return;
        }
        await loadSections(activeDocId);
        fireToast(
          `${activeSection.code} moved ${dir === -1 ? 'up' : 'down'} — the document assembles and exports in this order.`
        );
      } catch (e) {
        fireToast(
          'Couldn’t move the section — ' + redactInternals(e instanceof Error ? e.message : '', 'the server could not be reached') + '.',
          'error'
        );
      } finally {
        setReordering(false);
      }
    },
    [activeDocId, activeSection, sections, fireToast, loadSections]
  );

  /* ── Heuristic section check ──
     The endpoint has existed, worked, and needed no AI provider since it was
     written — and no surface called it. Results describe the SAVED content
     (the handler reads the stored row), so the panel says so when the canvas
     is dirty rather than implying unsaved edits were checked. Cleared on
     section switch: another section's flags must never linger. */
  const [check, setCheck] = useState<ScanResults | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    setCheck(null);
  }, [activeSectionId]);

  const runCheck = useCallback(async () => {
    if (!activeSection) return;
    setChecking(true);
    try {
      const res = await apiRequest(
        'POST',
        `/api/authoring/sections/${activeSection.id}/ai/deficiency-scan`,
        {}
      );
      const json = (await res.json().catch(() => null)) as {
        scan_results?: ScanResults;
        error?: unknown;
      } | null;
      if (!res.ok || !json?.scan_results) {
        fireToast(
          'Couldn’t check the section — ' +
            (serverMessage(json) ?? `HTTP ${res.status}`) +
            '. No result is shown because none was produced.',
          'error'
        );
        return;
      }
      setCheck(json.scan_results);
    } catch (e) {
      fireToast(
        'Couldn’t check the section — ' + redactInternals(e instanceof Error ? e.message : '', 'the server could not be reached') + '.',
        'error'
      );
    } finally {
      setChecking(false);
    }
  }, [activeSection, fireToast]);

  /* ── An accepted AI draft landed ──
     The server replaced the section content AND recorded span-level source
     lineage for it in one transaction, so this mirrors `revert`: adopt the
     returned row as the new truth, remount the canvas on it (a stale editor
     buffer would silently re-save over text that now has citations behind
     it), and refresh the rails the write actually touched — history gained a
     revision, the audit trail gained a row, and sources gained the citations
     that are the whole point of accepting this way rather than saving. */
  const onAiDraftAccepted = useCallback(
    (section: Record<string, unknown>, attribution: AcceptedAttribution | null) => {
      const current = draftEditorScope.current;
      if (!activeSectionId || !aliveRef.current || current.scope !== assemblyHostScope
        || current.docId !== activeDocId || current.sectionId !== activeSectionId || current.dirty) return;
      if (section.id !== activeSectionId || section.doc_id !== activeDocId || typeof section.content !== 'string') {
        fireToast('The saved draft did not confirm this exact document and section. Check the saved record before continuing.', 'error');
        return;
      }
      const content = section.content;
      setSections(ss =>
        ss.map(x => (x.id === section.id ? { ...x, ...(section as Partial<AuthSection>), content } : x)),
      );
      markAssemblyAccepted(activeSectionId);
      setContentEpoch(e => e + 1);
      setEditorDirty(false);
      setExportsEpoch(e => e + 1);
      /* The server's own count, not a claim of correctness: how much of the
         saved text is a verified quote from a source, and how much is recorded
         as author-original. Both numbers are the record, so both are said —
         and when the server sent no summary, that is said instead of a zero. */
      fireToast(
        attribution
          ? `Draft accepted and saved. ${attribution.sourceSpans} verified citation(s) across ` +
            `${attribution.distinctSources} source(s); ${attribution.coverage}% of the content is ` +
            'quoted from evidence, the rest recorded as author-original.'
          : 'Draft accepted and saved. The server reported no lineage summary for it — open Sources to see what was recorded.',
      );
      void loadHistory(activeSectionId);
      void loadSources(activeSectionId);
      if (activeDocId) void loadAudit(activeDocId);
    },
    [activeSectionId, activeDocId, assemblyHostScope, markAssemblyAccepted, loadHistory, loadSources, loadAudit, fireToast],
  );

  /** Post one reviewer action — one decision, or a whole accept/reject-all.
   *
   *  Split by size rather than by caller: a batch of one is a single decision
   *  however it arrived, and a batch of many is one bulk act however it was
   *  produced. Both carry the change TEXT, because accepting a suggestion
   *  strips its mark and the id alone would name something no longer in the
   *  document. */
  const flushDecisions = useCallback(
    async (docId: string, batch: SuggestionDecision[]) => {
      const sectionId = activeSectionIdRef.current ?? undefined;
      const context = (d: SuggestionDecision) => ({
        changeId: d.changeId,
        changeType: d.changeType,
        text: d.text,
        authorId: d.authorId ?? undefined,
        authorName: d.authorName ?? undefined,
        at: d.at ?? undefined,
        sourceRecord: d.sourceRecord ?? undefined,
      });
      const decision = batch[0].decision;
      try {
        const res =
          batch.length === 1
            ? await apiRequest(
                'POST',
                `/api/authoring/documents/${docId}/tracked-change-decisions`,
                { decision, sectionId, ...context(batch[0]) },
              )
            : await apiRequest(
                'POST',
                `/api/authoring/documents/${docId}/tracked-change-decisions/bulk`,
                {
                  decision,
                  changeIds: batch.map(d => d.changeId),
                  changes: batch.map(context),
                  sectionId,
                },
              );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        /* The audit rail gained a row. Refresh it if the reviewer is looking. */
        if (rail === 'audit') void loadAudit(docId);
      } catch (e) {
        /* The decision is already applied to the document — undoing the edit
           because a POST failed would be worse than the missing row. But a
           compliance record that vanishes quietly is not acceptable either, so
           the gap is stated and counted. */
        fireToast(
          `${batch.length === 1 ? 'That decision was' : `${batch.length} decisions were`} applied ` +
            'to the document but NOT recorded on the audit trail — ' +
            redactInternals(e instanceof Error ? e.message : '', 'the server could not be reached') +
            '. The content is still saved on the next save; report the missing record.',
          'error',
        );
      }
    },
    [rail, loadAudit, fireToast],
  );

  /* ── A reviewer decided a tracked change ──
     Posted per decision, accept AND reject. The rejection is the one that has
     had no home in the record: refusing a proposed deletion changes no text,
     writes no revision, and until now left nothing behind saying a reviewer
     considered it.

     Deliberately fire-and-forget with a VISIBLE failure. It must not block the
     editor action the reviewer just took — the decision is already applied to
     the document, and undoing it because a POST failed would be worse than the
     missing row. But a silently-dropped compliance record is not acceptable
     either, so a failure says so and names what was not recorded. */
  const recordTrackedChangeDecision = useCallback(
    (d: SuggestionDecision) => {
      if (!activeDocId) return;
      /* "Accept all" resolves every suggestion in one synchronous loop, so the
         callback fires N times in a single tick. Posting per call would send
         fifty requests for one click. Queue and flush on the microtask so one
         reviewer action becomes one write — the bulk endpoint exists for
         exactly this and records it as the single act it was. */
      pendingDecisionsRef.current.push(d);
      pendingDecisionCountRef.current += 1;
      if (decisionFlushRef.current) return;
      decisionFlushRef.current = true;
      queueMicrotask(() => {
        decisionFlushRef.current = false;
        const batch = pendingDecisionsRef.current.splice(0);
        if (batch.length > 0) void flushDecisions(activeDocId, batch);
      });
    },
    [activeDocId, flushDecisions],
  );

  const draftPrompt = activeSection
    ? `Draft ${activeSection.code} ${activeSection.title} from the linked section evidence.`
    : 'Draft this section from the linked section evidence.';

  // What the filing outline was built FROM, in the words the filer sees.
  // Null only when there is no governed document, in which case there is no
  // outline to qualify either.
  const provenance = !unboundDraft && filing.document
    ? describeRulePackProvenance(filing.document.provenance)
    : null;

  return (
    <div className="ed" ref={rootRef} data-comments={rail != null || undefined} data-rail={rail ?? undefined}>
      {/* ── Left: document + section tree ── */}
      <aside className="ed-tree">
        <div className="ed-tree-h">
          <div className="ed-tree-t">
            {unboundDraft ? activeDoc?.title : filing.document ? filing.document.title : pinnedDocId ? (activeDoc?.title ?? 'Document') : 'Document tree'}
          </div>
          <div className="ed-tree-m">
            {unboundDraft ? 'Saved draft sections · unbound' : filing.document
              ? `${filing.document.doc_type.toUpperCase()} · ${filing.document.agency.toUpperCase()} · ${
                  filing.flat.length
                } sections`
              : docsState === 'ready'
                ? `${docs.length} document${docs.length === 1 ? '' : 's'} · ${status.replace('_', ' ')}`
                : docsState === 'error'
                  ? /* was "0 documents · all", directly above "Couldn't load documents" */
                    `documents not read · ${status.replace('_', ' ')}`
                  : `reading documents… · ${status.replace('_', ' ')}`}
          </div>
          {/* A failed outline read used to degrade this pane, silently, to the
              flat document list — indistinguishable from a project with no
              rule pack. The failure and the wait are now said. */}
          {!unboundDraft && filing.loading && (
            <div role="status" className="scaf-note" style={{ padding: '4px 0' }}>Reading the governed filing outline…</div>
          )}
          {!unboundDraft && filing.error && (
            <div className="scaf-note" role="alert" style={{ padding: '4px 0' }}>
              The governed filing outline could not be read — what is listed below is the document list, not the filing outline.
            </div>
          )}
          {unboundDraft && <p className="scaf-note">Unbound working copy. These sections belong to the saved draft. Review and place the document into a filing before treating them as filing sections.</p>}
          {onStatusChange && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {/* The Module select is gone. It defaulted every filing type to
                  "M3" and hid the rest of the dossier behind a dropdown; the
                  filing outline below is the navigation now. Status stays — it
                  is a view filter, not a definition of the tree. Not drawn for
                  a pinned document: there is no list to filter. */}
              <select
                className="c2c-input"
                aria-label="Filter documents by status"
                style={{ height: 28, flex: 1 }}
                value={status}
                onChange={e => onStatusChange(e.target.value)}
              >
                {STATUSES.map(s => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* The project's filings: its home filing and each market added to it
            (FILING_SPINE F22b), and from here, which one to open. */}
        {!unboundDraft && !pinnedDocId && (
          <FilingMarkets
            home={filing.home}
            markets={filing.markets}
            marketsError={filing.marketsError}
            shownId={filing.document?.id ?? null}
            docs={docs}
            onOpen={(id) => requestLeave({ kind: 'document', id })}
            onCreate={(m) => void marketCopy.create(m)}
            creatingId={marketCopy.creatingId}
          />
        )}

        {/* ── What the outline below was built FROM ──
            Until this shipped, a tree transcribed from 21 CFR 814.20(b) and a
            tree constructed by reasoning about a regulation with no enumerated
            annex rendered identically, so a filer could not tell which one
            they were drafting against. The provenance columns recorded the
            difference; this is where it becomes visible. */}
        {provenance && filing.tree.length > 0 && (
          <div className="ed-basis">
            <div className="ed-basis-h">
              <span className="ed-basis-chip" data-tone={provenance.tone}>
                {provenance.headline}
              </span>
              <span className="ed-basis-l">outline basis</span>
            </div>
            <p className="ed-basis-d">{provenance.detail}</p>
          </div>
        )}

        {/* ── The governed filing outline, when this project has one ──
            Derived from (doc_type × agency) via c2c_rule_packs, so a BLA shows
            its 71 nested sections and a 510(k) shows A/B/C/D/E. Nodes bind to
            the authored section that holds the text by code. */}
        {!unboundDraft && filing.tree.length > 0 && (
          <div
            className="ed-tree-scroll"
            style={{ flex: '0 0 auto', maxHeight: '46%', borderBottom: '1px solid var(--border)' }}
          >
            {filing.flat.map(node => {
              /* `sections` is [] while the read is in flight and after it
                 failed, so every node rendered dimmed, "not started in this
                 document yet", with its "required" chip and a "no draft yet"
                 toast on click — drafting-status claims produced by a read that
                 had not happened. Unread is now its own state — and so is
                 "no document open", which read as "still being read" forever
                 (QA 2026-10-08, walk 2, j4; ./outlineReadState.ts). */
              const readState = outlineReadState({ activeDocId, docsState, sectionsState });
              const sectionsUnread = readState !== 'ready';
              const bound = sectionsUnread ? null : findSectionForNode(sections, node.key, outlineKeys);
              const isActive = bound != null && bound.id === activeSectionId;
              // F4: an unstarted node's tooltip, accessible name, disabled and
              // busy state (spread last, so its title is the one shown).
              const startProps = bound || sectionsUnread ? null : unstartedRowProps(startNode, node);
              return (
                <button
                  key={node.key}
                  className="ed-tree-row"
                  data-active={isActive || undefined}
                  style={{ paddingLeft: 10 + node.depth * 12, opacity: bound || sectionsUnread ? 1 : 0.62 }}
                  title={
                    readState !== 'ready'
                      ? unboundNodeTitle(node.label, readState)
                      : `${node.label} — open`
                  }
                  {...startProps}
                  onClick={() => {
                    if (readState !== 'ready') {
                      fireToast(unboundNodeToast(node, readState), 'error');
                    } else if (bound) {
                      // The module rides with the navigation: a nav the guard
                      // holds must not move the create/export default to a
                      // section the author never opened.
                      const m = /^(\d)/.exec(node.key)?.[1];
                      requestLeave({
                        kind: 'section',
                        id: bound.id,
                        module: m ? `M${m}` : undefined,
                      });
                    } else {
                      // F4: the click starts the section (a person's act),
                      // or says why it cannot be started in this document.
                      void startNode(node);
                    }
                  }}
                >
                  <span className="ed-num">{node.key}</span>
                  <span className="ed-lbl" style={{ fontWeight: node.depth === 0 ? 600 : 400 }}>
                    {node.label}
                  </span>
                  {node.mandatory && !bound && !sectionsUnread && (
                    <span
                      className="rd-chip tone-idle"
                      style={{ marginLeft: 'auto' }}
                      title="Required by the rule pack"
                    >
                      required
                    </span>
                  )}
                  {/* Asked of BOTH stores. node.has_content reads the governed
                      c2c_document_sections; this editor writes authoring_sections,
                      so on its own the dot could never light for anything drafted
                      here. See nodeHasDraft. */}
                  {nodeHasDraft(node, bound) && (
                    <span className="ed-dot" data-s="ok" title={node.status} />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {!unboundDraft && filing.document?.filing_scope === 'market' && (
          <FilingGaps gaps={filing.gaps} agency={filing.document.agency} />
        )}

        {/* Why there is no outline, said plainly rather than as a blank pane.
            A project with no governed document is usually not a fault: program
            types ivd/device/ide/biologic/anda have no rule pack, and the
            scaffolder skips them deliberately. */}
        {filing.reason === 'no-governed-document' && (
          <div className="scaf-note" style={{ padding: '10px 12px', fontSize: 12 }}>
            This project has no governed filing document, so there is no section outline to show.
            Projects created before scaffolding — and program types with no rule pack — fall here.
          </div>
        )}

        <div className="ed-tree-scroll">
          {docsState === 'loading' ? (
            <div role="status" className="scaf-note" style={{ padding: 16 }}>
              Loading documents…
            </div>
          ) : docsState === 'error' ? (
            <EmptyState
              tone="error"
              icon={I.alertTriangle}
              title="Couldn’t load documents"
              hint="The document list didn’t respond. Sign in to your tenant and retry."
            />
          ) : docs.length === 0 ? (
            <>
            {/* Was: `No ${status.replace('_',' ')} documents in this project.
                Switch the status filter above.` — which renders "No ALL
                documents in this project" on the default filter, because the
                filter's own value is interpolated into the middle of a
                sentence. It then instructed the reader to change a filter that
                was already showing everything, so following the instruction
                changed nothing.
                The action that actually resolves this is New document. It
                existed, in the toolbar directly above, and could not be reached
                from here — see ../newDocumentAction.ts. */}
            <EmptyState
              icon={I.fileText}
              title={status === 'all' ? 'No documents yet' : `Nothing at this stage`}
              hint={status === 'all'
                ? (programName(program)
                    ? `${programName(program)} has no documents yet. Ask AnA to draft one, or create one.`
                    : 'Documents you create in this project appear here.')
                : `This project has no ${status.replace('_', ' ')} documents. Clear the filter to see the rest.`}
              action={status === 'all'
                ? newDocumentAction()
                : { label: 'Show all documents', onAct: () => onStatusChange?.('all') }}
            />
            {status === 'all' && (
              <div style={{ padding: '0 16px 12px' }}>
                <button
                  type="button"
                  className="btn ghost"
                  style={{ height: 28, fontSize: 12 }}
                  onClick={askAnaToDraft}
                  data-testid="ask-ana-to-draft"
                >
                  {I.sparkles} Ask AnA to draft
                </button>
              </div>
            )}
            </>
          ) : (
            docs.map(d => {
              const open = d.id === activeDocId;
              return (
                <div key={d.id} className="ed-vol">
                  <button
                    className="ed-tree-row"
                    data-active={open || undefined}
                    onClick={() => requestLeave({ kind: 'document', id: d.id })}
                    style={{ fontWeight: 600 }}
                  >
                    <span className="ed-num">{d.module ?? '—'}</span>
                    <span className="ed-lbl">{d.title}</span>
                    <span className="rd-chip tone-idle" style={{ marginLeft: 'auto' }}>
                      {/* null is "not counted", not zero */}
                      {d.section_count == null ? '—' : num(d.section_count)}
                    </span>
                  </button>
                  {open &&
                    (sectionsState === 'loading' || sectionsState === 'idle' ? (
                      /* 'idle' with a document open is the render before the
                         read starts — not a document with no sections. Saying
                         "No sections yet" there was a fact nobody had read. */
                      <div role="status" className="scaf-note" style={{ padding: '6px 12px' }}>
                        Loading sections…
                      </div>
                    ) : sectionsState === 'error' ? (
                      <div
                        className="scaf-note"
                        style={{ padding: '6px 12px', color: 'var(--error)' }}
                      >
                        Couldn’t load sections.
                      </div>
                    ) : sections.length === 0 ? (
                      <div className="scaf-note" style={{ padding: '6px 12px' }}>
                        No sections yet in this document.
                      </div>
                    ) : (
                      <>
                        {/* Document-level structure. Stated where the order is
                            actually read, because that is where it misleads:
                            the tree looks authoritative, and nothing in it
                            shows that two sections share a code or that the
                            order is not the one the dossier assembles in. */}
                        {structure?.duplicateCodes.length ? (
                          <div
                            className="scaf-note"
                            style={{ padding: '6px 12px', color: 'var(--error)' }}
                          >
                            {structure.duplicateCodes.length === 1
                              ? `Section code ${structure.duplicateCodes[0]} is used by more than one section.`
                              : `${structure.duplicateCodes.length} section codes are each used by more than one section: ${structure.duplicateCodes.join(', ')}.`}{' '}
                            A filed dossier cannot say which one a reference means.
                          </div>
                        ) : null}
                        {structure?.outOfOrder ? (
                          <div className="scaf-note" style={{ padding: '6px 12px' }}>
                            These sections are stored in an order that differs from their
                            section codes, and they assemble and export in the stored order.
                            Reorder them if the stored order is not deliberate.
                          </div>
                        ) : null}
                        {sections.map(s => (
                        <button
                          key={s.id}
                          className="ed-tree-row"
                          data-active={activeSectionId === s.id || undefined}
                          onClick={() => requestLeave({ kind: 'section', id: s.id })}
                          style={{ paddingLeft: 22 }}
                        >
                          <span className="ed-num">{s.code}</span>
                          <span className="ed-lbl">{s.title}</span>
                          {num(s.comment_count) > 0 && (
                            <span
                              className="ed-dot"
                              data-s="review"
                              title={`${num(s.comment_count)} comments`}
                            />
                          )}
                        </button>
                        ))}
                      </>
                    ))}
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* ── Center: editable canvas ── */}
      <section className="ed-doc">
        <header className="ed-doc-h">
          <div className="ed-crumbs">
            {((embedded && !embedded.hostShowsBack) || (!embedded && returnTo)) && (
              <button
                type="button"
                className="ed-back"
                onClick={() => {
                  const refusal = linkedTargetRefusal();
                  if (refusal) { fireToast(refusal, 'error'); return; }
                  if (embedded) requestLeave({ kind: 'host-back', label: embedded.backLabel ?? 'the previous workspace', onContinue: embedded.onBack });
                  else if (returnTo && !programSwitchHeld) requestLeave({ kind: 'host-back', label: 'the AnA conversation', onContinue: () => openConversationWithPrompt(null, onNav, returnTo.conversationId) });
                }}
                data-testid="workbench-back"
              >
                {I.left} {embedded?.backLabel ?? 'Back to conversation'}
              </button>
            )}
            {programHeadline(program) && (
              <>
                <span className="ed-program" title={program?.name ?? undefined}>
                  {programHeadline(program)}
                </span>
                <span className="sep" aria-hidden="true">›</span>
              </>
            )}
            <span className="sep-first">{activeDoc?.module ?? (activeDoc ? (activeDoc.c2c_document_id ? 'Unassigned module' : 'Unbound draft') : 'eCTD')}</span>
            <span className="sep" aria-hidden="true">›</span>
            <span className="doc-title" title={activeDoc?.title ?? undefined}>
              {activeDoc?.title ?? 'No document'}
            </span>
            {activeSection && (
              <>
                <span className="sep" aria-hidden="true">›</span>
                <span className="here">{activeSection.code}</span>
              </>
            )}
          </div>
          {/* The governed acts — the reason for change, Save, lock / freeze /
              e-sign, Place into filing — are a group of their own that wraps
              and is never clipped. They sat at the far end of the panel
              scroller below, past its edge at 1440px and at 390px, so an
              author could not see Save or E-sign without scrolling a strip
              that did not look scrollable (QA 2026-10-08, walk 2, j5). */}
          <div className="ed-doc-commit" role="group" aria-label="Save and sign">
            {/* Reason for change, stated once per section and carried on every
                save of it. Inline beside Save rather than a dialog: there is no
                autosave here, but Save and ⌘S each fire many times while
                working through a section, and a modal on each would be the
                friction the regulation does not ask for. */}
            {/* 2026-09-28, coverage-gap sweep GA-1: the rule lived in the
                placeholder, gone after one keystroke, and why Save stayed
                inert was a `title` on a disabled button, which a keyboard
                never reaches. The field is now aria-required, and the rule is
                a persistent note both the field and Save are described by —
                the ProtocolDevSection `pde-sec-state` pattern. */}
            {dirty && !docSealed && (
              <>
                <input
                  className="de-input"
                  style={{ height: 30, width: 260 }}
                  value={changeReason}
                  onChange={e => setChangeReason(e.target.value)}
                  placeholder="Why this changed (at least 8 characters)"
                  aria-label="Reason for change"
                  aria-required="true"
                  aria-describedby={reasonNoteId}
                  data-testid="change-reason"
                />
                <span
                  id={reasonNoteId}
                  aria-live="polite"
                  style={{ fontSize: 11.5, color: 'var(--text-400)', maxWidth: 220 }}
                  data-testid="change-reason-note"
                >
                  {changeReason.trim().length < 8
                    ? 'Required to save: at least 8 characters, recorded with the revision.'
                    : 'Recorded with the revision.'}
                </span>
              </>
            )}
            <button
              className="btn primary"
              style={{ height: 30 }}
              onClick={() => void editorRef.current?.save()}
              aria-describedby={dirty && !docSealed ? reasonNoteId : undefined}
              disabled={!dirty || saving || contentReadOnly || changeReason.trim().length < 8}
              title={
                editRefusal ? editRefusal : docSealed
                  ? 'This document is frozen — its content cannot be edited.'
                  : !activeSection
                    ? 'Open a section to edit and save it.'
                    : dirty && changeReason.trim().length < 8
                      ? 'Say why this section changed, in at least 8 characters — it is recorded with the revision.'
                      : undefined
              }
              data-testid="save-section"
            >
              {/* "Saved" is a claim about a section's save state. It fell through
                  to that word whenever nothing was dirty — including with no
                  document or section open ("eCTD › No document" … "Saved"). */}
              {I.check} {saving ? 'Saving…' : editRefusal ? 'Read only' : docSealed ? 'Frozen' : dirty ? 'Save' : activeSection ? 'Saved' : 'Save'}
            </button>
            {activeDoc && (
              <AuthoringFilingBar
                key={activeDoc.id}
                docId={activeDoc.id}
                docTitle={activeDoc.title}
                docStatus={activeDoc.status}
                onChanged={() => {
                  void loadDocs();
                  if (activeDocId) void loadSections(activeDocId);
                }}
                fireToast={fireToast}
                signer={esignSignerOf(user as Parameters<typeof esignSignerOf>[0])}
                freezeRefusal={actRefusal(docAccess.freeze)}
                /* A Reviewer grant may sign the review and nothing else: the
                   control stays open for that one meaning (QA 2026-10-08, j4). */
                esignRefusal={esignReviewOnly(docAccess) ? null : actRefusal(docAccess.esign)}
                reviewOnly={esignReviewOnly(docAccess)}
                workflowOrigin={docProvenance?.importSource && isWorkflowImportOrigin(docProvenance.importSource) ? docProvenance.importSource : undefined}
                docRevision={`${activeDoc.updated_at ?? ''}:${contentEpoch}:${sections.map(s => s.updated_at ?? '').join('|')}`}
              />
            )}
            {/* The authoring → filing seam: place the OPEN document into an
                eCTD sequence of the canonical submission core. Beside the
                freeze/e-sign bar because it is the same family of act — the
                document leaving the editor for the governed record. */}
            {activeDoc && (
              <AuthoringPlaceIntoFiling
                docId={activeDoc.id}
                docTitle={activeDoc.title}
                activeSectionCode={activeSection?.code ?? null}
                /* The whole document is filed (QA 2026-10-08, j4), so the dialog
                   files it at its own code; only a read it can trust. */
                sectionCodes={sectionsState === 'ready' ? sections.map(s => s.code) : undefined}
                /* The filing copy takes this state when placed (F17). */
                docStatus={activeDoc.status ?? null}
                refusal={actRefusal(docAccess.placeIntoFiling)}
                dirty={dirty}
                onNav={onNav}
                fireToast={fireToast}
              />
            )}
          </div>
          <div className="ed-doc-actions">
            <AuthoringCreateExport
              docId={activeDoc?.id ?? null}
              docTitle={activeDoc?.title ?? null}
              docStatus={activeDoc?.status ?? null}
              module={module}
              programId={programId}
              programSwitchHeld={programSwitchHeld}
              noticeContainer={creationNoticeContainer}
              fireToast={fireToast}
              onDocCreated={d => openPulledDocument(d.id)}
              onSectionCreated={openCreatedSection}
              onCheckCreation={checkCreation}
              /* A confirmed export record re-baselines this document, so the Exports
                 rail's "changed since the last export" verdict is now stale. */
              onExported={() => setExportsEpoch(e => e + 1)}
              onCheckExports={() => {
                setExportsEpoch(e => e + 1);
                setRail('exports');
              }}
            />
            {/* Section / Document. An author writes a section but SHIPS a
                document, and until now the whole document was never on screen
                at any point in the workflow. */}
            <div className="ed-viewtoggle" role="group" aria-label="Editor view">
              <button
                className="btn ghost"
                style={{ height: 30 }}
                onClick={() => requestLeave({ kind: 'view', mode: 'section' })}
                data-active={viewMode === 'section' || undefined}
                aria-pressed={viewMode === 'section'}
                title="Edit one section"
              >
                {I.penLine} Section
              </button>
              <button
                className="btn ghost"
                style={{ height: 30 }}
                onClick={() => requestLeave({ kind: 'view', mode: 'document' })}
                data-active={viewMode === 'document' || undefined}
                aria-pressed={viewMode === 'document'}
                title="Read the whole document"
                disabled={!activeDocId}
              >
                {I.fileText} Document
              </button>
            </div>
            {!embedded && (
              <button
                className="btn ghost"
                style={{ height: 30 }}
                onClick={() => requestLeave({ kind: 'conversation', prompt: '' })}
              >
                {I.sparkles} AnA
              </button>
            )}
            <button
              className="btn ghost"
              style={{ height: 30 }}
              ref={el => { railToggleRefs.current.comments = el; }}
              onClick={() => setRail(rail === 'comments' ? null : 'comments')}
              data-active={rail === 'comments' || undefined}
            >
              {I.checkCircle} Comments
              {activeSection && num(activeSection.comment_count) > 0
                ? ' ' + num(activeSection.comment_count)
                : ''}
            </button>
            <button
              className="btn ghost"
              style={{ height: 30 }}
              ref={el => { railToggleRefs.current.history = el; }}
              onClick={() => setRail(rail === 'history' ? null : 'history')}
              data-active={rail === 'history' || undefined}
            >
              {I.clock} History
              {activeSection && num(activeSection.revision_count) > 0
                ? ' ' + num(activeSection.revision_count)
                : ''}
            </button>
            <button
              className="btn ghost"
              style={{ height: 30 }}
              ref={el => { railToggleRefs.current.sources = el; }}
              onClick={() => setRail(rail === 'sources' ? null : 'sources')}
              data-active={rail === 'sources' || undefined}
              data-testid="sources-rail-open"
            >
              {I.fileText} Sources
              {activeSection && num(activeSection.citation_count) > 0
                ? ' ' + num(activeSection.citation_count)
                : ''}
            </button>
            {/* §11.50(b): the signature record was stored, exposed by
                GET /docs/:docId/signatures, and read by nothing. The only
                manifestation a signer saw was a toast that fades in 4.2s. */}
            <button
              className="btn ghost"
              style={{ height: 30 }}
              ref={el => { railToggleRefs.current.signatures = el; }}
              onClick={() => setRail(rail === 'signatures' ? null : 'signatures')}
              data-active={rail === 'signatures' || undefined}
            >
              {I.shieldCheck} Signatures
            </button>
            {/* §11.10(e): the audit trail has been WRITTEN on every governed
                act since the store shipped — and readable by nothing. A
                record that cannot be reviewed satisfies no regulation. */}
            <button
              className="btn ghost"
              style={{ height: 30 }}
              ref={el => { railToggleRefs.current.audit = el; }}
              onClick={() => setRail(rail === 'audit' ? null : 'audit')}
              data-active={rail === 'audit' || undefined}
            >
              {I.activity} Audit
            </button>
            {/* Every export writes an authoring_export_history row — actor,
                time, format, and the document's content hash at that moment.
                Three endpoints read that table and none had a caller, so the
                product could hand someone a Word file and never tell them it
                had gone out of date. */}
            <button
              className="btn ghost"
              style={{ height: 30 }}
              ref={el => { railToggleRefs.current.exports = el; }}
              onClick={() => setRail(rail === 'exports' ? null : 'exports')}
              data-active={rail === 'exports' || undefined}
              data-testid="exports-rail-open"
            >
              {I.fileDown} Exports
            </button>
            {/* The project's vault, beside the page. The editor had no vault
                connection at all (docs/design/ANA_DOCUMENT_CANVAS.md): the
                one way in was Vault → editor; nothing read the vault from here
                and nothing filed a document into it. */}
            <button
              className="btn ghost"
              style={{ height: 30 }}
              ref={el => { railToggleRefs.current.vault = el; }}
              onClick={() => setRail(rail === 'vault' ? null : 'vault')}
              data-active={rail === 'vault' || undefined}
              data-testid="vault-rail-open"
            >
              {I.vault} Project files
            </button>
            <button
              className="btn ghost"
              style={{ height: 30 }}
              ref={el => { railToggleRefs.current.tasks = el; }}
              onClick={() => setRail(rail === 'tasks' ? null : 'tasks')}
              data-active={rail === 'tasks' || undefined}
              data-testid="tasks-rail-open"
            >
              {I.checkSquare} Tasks
            </button>
            <button
              className="btn ghost"
              ref={el => { railToggleRefs.current.access = el; }}
              onClick={() => setRail(rail === 'access' ? null : 'access')}
              data-active={rail === 'access' || undefined}
              data-testid="access-rail-open"
            >
              {I.shieldCheck} Access
            </button>
            {/* GE-P-3 (2026-09-28): disabled, not hidden, when the server
                will refuse this caller — the reason is the text beside it.
                2026-10-08: "Assign review" created a task the Review board
                never reads. Send for review records the review request the
                board lists, and each reviewer's task with it, as one act. The
                gate is that act's: the task create's role check, then the
                request's Owner or Author grant on a document that is not
                sealed (wave 2D, authoring.router.ts callerDocumentAccess). */}
            {activeDoc && (
              <button
                className="btn ghost"
                style={{ height: 30 }}
                onClick={() => setSendForReviewOpen(true)}
                disabled={!!actRefusal(docAccess.assignReview)}
                aria-describedby={actRefusal(docAccess.assignReview) ? assignRefusalId : undefined}
                data-testid="send-for-review-open"
              >
                {I.send} Send for review
              </button>
            )}
            {activeDoc && actRefusal(docAccess.assignReview) && (
              <span id={assignRefusalId} style={{ fontSize: 11.5, color: 'var(--text-400)', maxWidth: 240 }}>
                {actRefusal(docAccess.assignReview)}
              </span>
            )}
            {activeDoc && (
              <button
                className="btn ghost"
                style={{ height: 30 }}
                onClick={() => setFileToVaultOpen(true)}
                disabled={dirty || !!actRefusal(docAccess.fileToVault)}
                aria-describedby={actRefusal(docAccess.fileToVault) ? vaultRefusalId : undefined}
                title={
                  dirty
                    ? 'Save the open section first — the vault files the saved document.'
                    : !programId
                      ? 'This document is not filed under a program; the vault is program-scoped.'
                      : 'Export this document and file the file into the project vault, with its SHA-256 recorded.'
                }
                data-testid="file-to-vault-open"
              >
                {I.vault} File to vault
              </button>
            )}
            {activeDoc && actRefusal(docAccess.fileToVault) && (
              <span id={vaultRefusalId} style={{ fontSize: 11.5, color: 'var(--text-400)', maxWidth: 240 }}>
                {actRefusal(docAccess.fileToVault)}
              </span>
            )}
            <button
              className="btn ghost"
              style={{ height: 30 }}
              onClick={() => askAna(draftPrompt)}
              disabled={contentReadOnly}
              title={
                editRefusal || (docSealed ? 'This document is frozen — new drafts cannot be inserted.' : undefined)
              }
            >
              {I.sparkles} Draft with AnA
            </button>
            {/* Distinct from "Draft with AnA" on purpose, and named for the
                difference: AnA is a conversation whose text you insert as a
                tracked suggestion (author lineage). This retrieves the Data
                Room and accepts through the ONE endpoint that records verified
                span-level source citations alongside the content, in the same
                transaction. Same act, different record — so it gets its own
                control rather than being folded into the other. */}
            <button
              className="btn ghost"
              style={{ height: 30 }}
              onClick={() => {
                /* The panel lives in the section view — document view assembles
                   sections for reading and edits none of them. Toggling open
                   state from here would be a click with no visible effect, so
                   it goes to the section it is about to draft instead. */
                if (viewMode === 'document') {
                  setViewMode('section');
                  setAiDraftOpen(true);
                  return;
                }
                setAiDraftOpen(o => !o);
              }}
              data-active={(aiDraftOpen && viewMode === 'section') || undefined}
              disabled={!activeSection || contentReadOnly || selectedSourceReviewMissing}
              data-testid="ai-draft-open"
              title={
                editRefusal ? editRefusal : docSealed
                  ? 'This document is frozen — its content cannot be edited.'
                  : selectedSourceReviewMissing
                    ? 'Build a candidate from these selected sources first, then review it in this editor.'
                  : 'Draft this section from Data Room evidence and accept it with recorded citations.'
              }
            >
              {I.wand} Draft from sources
            </button>
            {activeDoc && (
              <AuthoringCollab
                documentId={activeDoc.id}
                sectionId={activeSectionId}
                fireToast={fireToast}
              />
            )}
          </div>
        </header>
        <div ref={setCreationNoticeContainer} data-testid="authoring-creation-notices" />
        <AuthoringOversightActions projectOpen={!!programId} sectionOpen={!!activeSection} documentOpen={!!activeDocId} dirty={dirty} onAsk={askAna} />

        {/* ── The deep-link's honest miss ──
            A workbench click named a section this canvas could not open. The
            DEFAULT view renders underneath — stated, dismissible, and never a
            silently-wrong document. */}
        {targetNotice && (
          <div
            className="scaf-note"
            role="status"
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'baseline',
              padding: '8px 16px',
              fontSize: 12,
              borderBottom: '1px solid var(--border)',
            }}
          >
            <span style={{ flex: 1, minWidth: 0 }}>{targetNotice}</span>
            <button className="nda-open" onClick={() => setTargetNotice(null)}>
              Dismiss
            </button>
          </div>
        )}

        <div className="ed-doc-scroll" ref={docScrollRef}>
          <div className="ed-doc-inner">
            <AuthoringAssemblyBuild controller={assembly} />
            {viewMode === 'document' && activeDoc ? (
              /* The whole document, in order, as one read. Sections are shown,
                 not edited: editing is section-scoped because a revision, a
                 signature and a lock are all section-scoped, and a view that
                 let you type across all of them would be lying about what a
                 save records. Click a section to go and edit it. */
              <div className="ed-full" aria-label={`${activeDoc.title} — full document`}>
                <div className="ed-full-mast">
                  <div className="ed-mast-num">{activeDoc.module ?? (activeDoc.c2c_document_id ? 'Unassigned module' : 'Unbound draft')}</div>
                  <h1 className="ed-mast-t">{activeDoc.title}</h1>
                  {docProvenance && (
                    <div className="ed-provline" data-source={docProvenance.source} data-testid="doc-provenance">
                      {docProvenance.line}
                    </div>
                  )}
                  <ImportSourceNotice source={docProvenance?.importSource} />
                  {docFigures && <DraftFigureLine check={docFigures} />}
                  {docClaims && <DraftClaimsLine check={docClaims} />}
                  <div className="ed-mast-meta">
                    {/* "0 sections" printed over a failed or in-flight read,
                        directly above a body that said the read failed. */}
                    {sectionsState === 'ready'
                      ? `${sections.length} section${sections.length === 1 ? '' : 's'}`
                      : sectionsState === 'error'
                        ? 'sections not read'
                        : 'reading sections…'}
                    {editRefusal ? ' · read only' : docSealed ? ' · frozen' : ''}
                  </div>
                </div>
                {sectionsState === 'error' ? (
                  <EmptyState
                    tone="error"
                    icon={I.alertTriangle}
                    title="Couldn’t read this document’s sections"
                    hint="The document is not empty — the read failed. Retry from the tree."
                  />
                ) : sectionsState !== 'ready' ? (
                  /* Every document open, and every reorder, passes through
                     'loading' — and this pane said "This document has no
                     sections yet" for the whole of it. The tree pane had the
                     loading branch; the assembled document, the thing a
                     reviewer receives, did not. */
                  <EmptyState icon={I.fileText} title="Reading this document’s sections…" busy />
                ) : sections.length === 0 ? (
                  <EmptyState
                    icon={I.fileText}
                    title="This document has no sections yet"
                    hint="Add a section to begin drafting."
                  />
                ) : (
                  sections.map(sec => {
                    const html = (sec.content ?? '').trim();
                    return (
                      <section
                        key={sec.id}
                        className="ed-full-sec"
                        data-active={sec.id === activeSectionId || undefined}
                        aria-label={`${sec.code} ${sec.title}`}
                      >
                        <div className="ed-full-sec-h">
                          <span className="ed-full-sec-num">{sec.code}</span>
                          <h2 className="ed-full-sec-t">{sec.title}</h2>
                          <button
                            className="btn ghost ed-full-edit"
                            style={{ height: 26 }}
                            onClick={() => {
                              requestLeave({ kind: 'section', id: sec.id, mode: 'section' });
                            }}
                          >
                            {I.penLine} Edit
                          </button>
                        </div>
                        {html ? (
                          /* AuthoredHtml, not sanitizeChatHtml: the chat
                             allowlist strips figures, so the assembled read
                             showed a DIFFERENT document from the canvas when
                             a section carried one. Same audited sanitiser
                             module, authoring variant, auth-resolved refs. */
                          <AuthoredHtml className="ed-full-sec-body" html={html} />
                        ) : (
                          /* Not "empty" as a finding — nothing has been written
                             here yet, and the document view says which. */
                          <p className="ed-full-sec-empty">Not drafted yet.</p>
                        )}
                      </section>
                    );
                  })
                )}
              </div>
            ) : !activeSection ? (
              <div style={{ paddingTop: 48 }}>
                {/* THE OTHER HALF OF THE CIRCLE. This said "Choose a document
                    from the tree" while the tree said "no documents — switch
                    the filter". Two empty states pointing at each other, on a
                    project where the honest answer is that nothing has been
                    created yet, next to a New document button neither of them
                    offered. When there are no documents at all this now offers
                    the action; when there IS a document open, "choose a
                    section" is genuinely correct — the tree beside it is full. */}
                <EmptyState
                  icon={I.fileText}
                  title={activeDoc ? 'Select a section to edit' : docs.length === 0 ? 'Nothing to edit yet' : 'Select a document'}
                  hint={activeDoc
                    ? 'Choose a section from the tree to open its content in the editor. Every save records an auditable revision.'
                    : docs.length === 0
                      ? 'Create the first document for this project and its sections open here.'
                      : 'Choose a document from the tree to open its sections.'}
                  action={!activeDoc && docs.length === 0 ? newDocumentAction() : undefined}
                  regulation={!activeDoc && docs.length === 0
                    ? 'Every save records an auditable revision (21 CFR Part 11)'
                    : undefined}
                />
              </div>
            ) : (
              <>
                <div className="ed-mast">
                  {renaming ? (
                    <div
                      role="group"
                      aria-label={`Rename section ${activeSection.code}`}
                      style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
                      onKeyDown={e => {
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          closeRename();
                        } else if (e.key === 'Enter') {
                          e.preventDefault();
                          void saveRename();
                        }
                      }}
                    >
                      <input
                        className="c2c-input"
                        style={{ width: 110, height: 30 }}
                        aria-label="Section code"
                        value={renameCode}
                        autoFocus
                        onChange={e => setRenameCode(e.target.value)}
                      />
                      <input
                        className="c2c-input"
                        style={{ flex: 1, minWidth: 200, height: 30 }}
                        aria-label="Section title"
                        value={renameTitle}
                        onChange={e => setRenameTitle(e.target.value)}
                      />
                      <button
                        className="btn primary"
                        style={{ height: 30 }}
                        disabled={renameBusy || !renameCode.trim() || !renameTitle.trim()}
                        onClick={() => void saveRename()}
                      >
                        {renameBusy ? 'Renaming…' : 'Rename'}
                      </button>
                      <button
                        className="btn ghost"
                        style={{ height: 30 }}
                        disabled={renameBusy}
                        onClick={closeRename}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="ed-mast-num">{activeSection.code}</div>
                      <h1 className="ed-mast-t" style={{ display: 'inline' }}>
                        {activeSection.title}
                      </h1>
                      {!contentReadOnly && (
                        <button
                          className="nda-open"
                          style={{ marginLeft: 8, verticalAlign: 'middle' }}
                          title="Rename this section's code and title — its content and history are unchanged"
                          ref={renameBtnRef}
                          onClick={openRename}
                        >
                          {I.penLine} Rename
                        </button>
                      )}
                      {!contentReadOnly &&
                        sections.length > 1 &&
                        (() => {
                          const idx = sections.findIndex(s => s.id === activeSection.id);
                          return (
                            <span style={{ marginLeft: 4, verticalAlign: 'middle' }}>
                              <button
                                className="nda-open"
                                disabled={reordering || idx <= 0}
                                title="Move this section up — the document assembles and exports in tree order"
                                aria-label={`Move ${activeSection.code} up`}
                                onClick={() => void moveSection(-1)}
                              >
                                {I.arrowUp}
                              </button>
                              <button
                                className="nda-open"
                                disabled={reordering || idx >= sections.length - 1}
                                title="Move this section down"
                                aria-label={`Move ${activeSection.code} down`}
                                onClick={() => void moveSection(1)}
                              >
                                {I.arrowDown}
                              </button>
                            </span>
                          );
                        })()}
                      <button
                        className="nda-open"
                        style={{ marginLeft: 4, verticalAlign: 'middle' }}
                        disabled={checking}
                        title="Mechanical checks over the saved section — length, module keywords, CTD elements, tables, placeholders, structure. Heuristic signals, not a compliance determination."
                        onClick={() => void runCheck()}
                      >
                        {I.checkCircle} {checking ? 'Checking…' : 'Check'}
                      </button>
                    </>
                  )}
                  {docProvenance && (
                    <div className="ed-provline" data-source={docProvenance.source} data-testid="doc-provenance">
                      {docProvenance.line}
                    </div>
                  )}
                  <ImportSourceNotice source={docProvenance?.importSource} />
                  {docFigures && <DraftFigureLine check={docFigures} />}
                  {docClaims && <DraftClaimsLine check={docClaims} />}
                  {docTemplateId && <TemplateGuidance key={activeSection.id} sectionId={activeSection.id} />}
                  <div className="ed-mast-meta">
                    {activeDoc?.title ?? ''}
                    {num(activeSection.revision_count) > 0
                      ? ` · ${num(activeSection.revision_count)} revisions`
                      : ''}
                    {num(activeSection.citation_count) > 0
                      ? ` · ${num(activeSection.citation_count)} citations`
                      : ''}
                    {/* "unsaved changes" alone reads as "the app will get to
                        it". It will not — nothing on this surface leaves the
                        device until the author saves, because a save here mints
                        a Part 11 revision. Say which of the two it is. */}
                    {dirty
                      ? ' · unsaved changes — on this device only'
                      : activeSection.updated_at
                      ? ` · saved ${relTime(activeSection.updated_at)}`
                      : ''}
                  </div>
                </div>
                {/* ── Heuristic check results ──
                    Framed exactly as the server frames them: mechanical
                    signals over the SAVED content. Zero flags is reported as
                    "passed N of M mechanical checks", never as "compliant" — and
                    N and M come from the server's own count, so the sentence
                    cannot drift from the checks the code actually runs. */}
                {check && check.section_id === activeSection.id && (
                  <div
                    className="scaf-note"
                    role="status"
                    style={{ marginBottom: 12, display: 'grid', gap: 6 }}
                    data-testid="section-check"
                  >
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                      <b style={{ fontSize: 12 }}>
                        Section check — heuristic signals, not a compliance determination
                      </b>
                      <span style={{ flex: 1 }} />
                      {dirty && (
                        <span style={{ fontSize: 11, color: 'var(--warning)' }}>
                          checked the last saved content — unsaved edits are not in it
                        </span>
                      )}
                      <button className="nda-open" onClick={() => setCheck(null)}>
                        Dismiss
                      </button>
                    </div>
                    {check.deficiencies.length === 0 ? (
                      <span style={{ fontSize: 12 }}>
                        {typeof check.checks_run === 'number' && check.checks_run > 0
                          ? `No flags. The section passed all ${check.checks_run} mechanical checks `
                          : 'No flags. The section passed the mechanical checks '}
                        (length, module keywords, CTD elements where defined, tables,
                        placeholders, structure) — this is not a review.
                      </span>
                    ) : (
                      [...check.deficiencies]
                        .sort(
                          (a, b) =>
                            (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3)
                        )
                        .map((d, i) => (
                          <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                            <span
                              className={
                                d.severity === 'high'
                                  ? 'sp-tone-warn'
                                  : d.severity === 'medium'
                                    ? 'sp-tone-warn'
                                    : undefined
                              }
                              style={{
                                flexShrink: 0,
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                fontSize: 10,
                                paddingTop: 2,
                                ...(d.severity === 'high' ? { color: 'var(--error)' } : {}),
                              }}
                            >
                              {d.severity}
                            </span>
                            <span style={{ minWidth: 0 }}>
                              {d.message}
                              {d.recommendation && (
                                <span style={{ opacity: 0.75 }}> — {d.recommendation}</span>
                              )}
                            </span>
                          </div>
                        ))
                    )}
                    {/* ── What the record says this section must contain ──
                        The scan's own expectations covered five CMC codes, so
                        an author drafting 2.5 or 2.7.3 was shown nothing about
                        required content while the record has carried it all
                        along. This is the record's statement, read-only: the
                        elements are descriptions, the scan does not test them,
                        and the panel says so rather than implying a pass. A
                        code the record does not index reads as the resolver's
                        reason — never as an empty list, which would say
                        "nothing required". Rendered only when the server sent
                        it; honest silence otherwise. */}
                    {check.record_requirements && (
                      <div
                        data-testid="section-check-record"
                        style={{
                          display: 'grid',
                          gap: 4,
                          marginTop: 2,
                          paddingTop: 6,
                          borderTop: '1px solid var(--border)',
                          fontSize: 12,
                        }}
                      >
                        {check.record_requirements.indexed === false ? (
                          <span>
                            <b style={{ fontWeight: 600 }}>Required content — not indexed.</b>{' '}
                            {check.record_requirements.reason ??
                              'The record has no entry for this section code.'}
                          </span>
                        ) : (
                          <>
                            <span>
                              <b style={{ fontWeight: 600 }}>
                                The record on {check.record_requirements.answered_by ?? activeSection.code}
                                {check.record_requirements.title
                                  ? ` — ${check.record_requirements.title}`
                                  : ''}
                              </b>
                              {check.record_requirements.note ? ` ${check.record_requirements.note}` : ''}
                            </span>
                            {check.record_requirements.source === 'ancestor' && (
                              <span style={{ opacity: 0.75 }}>
                                These are the requirements of the containing section{' '}
                                {check.record_requirements.answered_by};{' '}
                                {check.section_code ?? activeSection.code} has no entry of its own in
                                the record.
                              </span>
                            )}
                            {(check.record_requirements.elements ?? []).length > 0 && (
                              <>
                                <span style={{ opacity: 0.75 }}>It must contain:</span>
                                <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 2 }}>
                                  {(check.record_requirements.elements ?? []).map((el, i) => (
                                    <li key={i}>{el}</li>
                                  ))}
                                </ul>
                              </>
                            )}
                            {(check.record_requirements.contains ?? []).length > 0 && (
                              <>
                                <span style={{ opacity: 0.75 }}>
                                  The sections it contains, each with its own requirements:
                                </span>
                                <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 2 }}>
                                  {(check.record_requirements.contains ?? []).map((c, i) => (
                                    <li key={i}>
                                      {c.code}
                                      {c.title ? ` ${c.title}` : ''}
                                    </li>
                                  ))}
                                </ul>
                                {/* The server caps the listing; say what it
                                    withheld rather than show a short list. */}
                                {(check.record_requirements.contains_omitted ?? 0) > 0 && (
                                  <span style={{ opacity: 0.75 }}>
                                    and {check.record_requirements.contains_omitted} more.
                                  </span>
                                )}
                              </>
                            )}
                            {check.record_requirements.basis && (
                              <span style={{ opacity: 0.75 }}>
                                Basis: {check.record_requirements.basis}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    )}
                    {/* Whether the whole document agrees with itself: the same figure, in the same
                        frame, stated twice in two sections with two different values. Rendered only
                        when the server sent it — a failed read of the sections is not "it agrees" —
                        and it never says the figures are consistent, only that none of the pairs it
                        compared disagree, with the count it compared beside it. */}
                    {check.document_figure_consistency && (
                      <div
                        data-testid="section-check-consistency"
                        style={{
                          display: 'grid',
                          gap: 4,
                          marginTop: 2,
                          paddingTop: 6,
                          borderTop: '1px solid var(--border)',
                          fontSize: 12,
                        }}
                      >
                        {check.document_figure_consistency.conflicts > 0 ? (
                          <>
                            <span>
                              <b style={{ fontWeight: 600 }}>
                                {check.document_figure_consistency.conflicts} of{' '}
                                {check.document_figure_consistency.compared} figure pair(s) in this
                                document disagree with each other.
                              </b>{' '}
                              Each pair states the same thing twice, in two sections, with two
                              different values.
                            </span>
                            <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 2 }}>
                              {(check.document_figure_consistency.comparisons ?? [])
                                .filter((c) => c.outcome === 'conflict')
                                .map((c, i) => (
                                  <li key={i}>
                                    <strong>{(c.a?.values ?? []).join(', ')}</strong>
                                    {c.a?.section ? ` in ${c.a.section}` : ''}
                                    {' vs '}
                                    <strong>{(c.b?.values ?? []).join(', ')}</strong>
                                    {c.b?.section ? ` in ${c.b.section}` : ''}
                                    {c.measure ? ` — ${c.measure}` : ''}
                                    {c.arm ? ` (${c.arm})` : ''}
                                  </li>
                                ))}
                            </ul>
                            {check.document_figure_consistency.truncated && (
                              <span style={{ opacity: 0.75 }}>
                                More were found than the panel lists.
                              </span>
                            )}
                          </>
                        ) : check.document_figure_consistency.compared > 0 ? (
                          <span>
                            {check.document_figure_consistency.compared} figure pair(s) in this
                            document were set against each other and none disagree.
                          </span>
                        ) : (
                          <span>
                            No figure in this document could be set against another in a different
                            section, so nothing was compared.
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {editRefusal && <div className="scaf-note" role="status" style={{ marginBottom: 12 }}>{I.lock} {editRefusal}</div>}
                {docSealed && (
                  <div className="scaf-note" role="status" style={{ marginBottom: 12 }}>
                    {I.lock}{' '}
                    {String(activeDoc?.status).toUpperCase() === 'APPROVED'
                      ? 'This document has been approved and frozen. Its content is part of the signed record and cannot be edited.'
                      : 'This document is frozen. Its content is sealed under a content hash and cannot be edited.'}{' '}
                    {/* 2026-09-28 (GE-P-2, coverage-gap sweep): this said "Create a new
                        version to make further changes" — a capability nothing provides.
                        The remedy that exists is a new document; this one stays the record. */}
                    To make further changes, start a new document in Authoring; this one remains the record.
                  </div>
                )}
                {/* Above the canvas, at reading width: the accept decision is
                    made by reading a full section of regulatory prose, which
                    is not a thing the 300px rail can carry. Keyed to the
                    section so switching sections rebuilds it empty — the
                    panel's own effect discards the draft, and the key makes
                    that structural rather than dependent on effect ordering. */}
                {aiDraftOpen && !contentReadOnly && (
                  <AuthoringAiDraft
                    key={activeSection.id}
                    sectionId={activeSection.id}
                    docId={activeDocId ?? undefined}
                    programId={programId}
                    sectionCode={activeSection.code}
                    sectionTitle={activeSection.title}
                    docSealed={docSealed}
                    editorDirty={dirty}
                    reviewSession={assembly.reviewSessions[activeSection.id]}
                    onAccepted={onAiDraftAccepted}
                    onClose={() => setAiDraftOpen(false)}
                    fireToast={fireToast}
                  />
                )}
                <div
                  style={{
                    minHeight: 460,
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-lg)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <RichSectionEditor
                    /* contentEpoch remounts the canvas when the server
                       replaces content out from under it (revert). */
                    key={activeSection.id + ':' + contentEpoch}
                    ref={editorRef}
                    value={activeSection.content ?? ''}
                    format="html"
                    onSave={saveSectionContent}
                    /* ── Why there is no timed autosave here ──────────────
                       RichSectionEditor supports one, and the MDX dossier
                       drawer uses it (600ms). This surface must not.

                       `saveSectionContent` PATCHes /api/authoring/sections/:id,
                       and that handler is not a content write — it is a
                       governed transaction. In one BEGIN/COMMIT it appends a
                       `doc_revisions` row to a per-section hash chain whose
                       UPDATE/DELETE the database refuses outright, records the
                       Part 11 audit row (before/after with a SHA-256 of each
                       side, actor, IP, session), asserts author lineage per
                       clause, and commits the working copy into `c2c_documents`
                       — the filing itself.

                       A debounce against that would append a chain link per
                       typing pause, so a section's history would read as
                       hundreds of "edits" by one author within a minute, none
                       of them an act that author performed; and half-typed
                       sentences would be committed into the filing between
                       them. Under §11.10(e) a record entry has to be traceable
                       to a deliberate, attributable act. A debounce timer is
                       not one.

                       Coalescing into an open revision instead (updating the
                       latest row within a time window) is not available and
                       should not be: the ledger's immutability trigger refuses
                       UPDATE by engine rule, and `…/history/verify` recomputes
                       the whole chain — a revision that could be rewritten
                       after the fact is the thing that check exists to prove
                       impossible.

                       So continuous protection is provided WITHOUT a server
                       write: the editor caches every keystroke to
                       `dc::<sectionId>` on this device and offers it back
                       explicitly on return, arms the browser's discard prompt
                       while dirty, and this surface holds any navigation that
                       would unmount unsaved work (see `requestLeave`). The
                       author saves; the ledger records authors, not timers. */
                    autosaveMs={null}
                    showSaveButton={false}
                    onDirtyChange={setEditorDirty}
                    readOnly={contentReadOnly}
                    placeholder="Write the section content here. Cmd/Ctrl-S saves and records a revision."
                    storageKey={activeSection.id}
                    ariaLabel={`Section ${activeSection.code} — ${activeSection.title}`}
                    onAsk={askAna}
                    /* The text this section's lineage was recorded against —
                       the last SAVED content, not the in-flight draft. With
                       it, "Data Origins" refuses to answer once the canvas
                       has drifted from what lineage describes, rather than
                       reporting the provenance of the wrong words. */
                    lineage={{
                      documentTable: 'authoring_sections',
                      documentId: activeSection.id,
                      documentTitle: activeSection.title,
                      canonicalText: activeSection.content ?? '',
                    }}
                    track={{
                      enabled: !!activeSection.track_changes,
                      author: {
                        id: user?.email ?? 'unknown',
                        name: user?.displayName || user?.email || 'Unknown author',
                      },
                      onToggle: toggleTrackChanges,
                      onResolve: recordTrackedChangeDecision,
                      admitsAnaSource,
                    }}
                    commentsApi={{
                      onCreate: requestAnchoredComment,
                      onOpen: openCommentFromAnchor,
                      onAnchored: (_id, saved) =>
                        fireToast(
                          saved
                            ? 'Comment anchored to the selected text.'
                            : 'Comment created, but its anchor could not be saved with the section — save the section to make the highlight visible to others.',
                          saved ? undefined : 'error',
                        ),
                    }}
                    imagesApi={{ upload: uploadSectionImage }}
                    /* The document's own sections, as they stand right now.
                       A cross-reference stores the target's id and resolves its
                       number and title from this list, so renumbering or
                       retitling a section corrects every reference to it in
                       place — no referring section is edited, and no revision
                       is minted for a change nobody made to its words. The
                       same list the export resolves against server-side, so
                       the canvas and the filed document say the same thing. */
                    crossRefsApi={{
                      sections: sections.map(s => ({
                        id: s.id,
                        code: s.code,
                        title: s.title,
                      })),
                      /* And the document's captioned tables and figures, which
                         are cross-reference targets exactly as sections are —
                         "Table 3" is a rendering of where a table currently
                         sits, so a reference to one stores its identity and
                         resolves its number from this ordering. Split at the
                         open section because the number is positional. */
                      captionsBefore: captionsAround.before,
                      captionsAfter: captionsAround.after,
                    }}
                    /* The governed sources this document can cite, and the
                       numbering already used above this section. A citation
                       stores the source's id and derives its number from
                       position, so inserting one earlier renumbers the rest
                       with no section's stored content touched. Inserting one
                       also records the section→source link the Sources rail
                       and the change report already read, so the prose and the
                       recorded lineage cannot drift apart. */
                    citationsApi={{
                      sources: citationLibrary,
                      choices: citationChoices,
                      precedingSources: precedingCitations.sources,
                      precedingSourceIds: precedingCitations.ids,
                      resolutionState: citationResolutionState,
                      resolutionError: projectCatalogue.error ?? citationAdmission.error,
                      onRetry: () => { loadProjectSources(); citationAdmission.retry(); },
                      scopeKey: citationScope,
                      onCite: sourceId => citeSource(Number(sourceId)),
                    }}
                    collab={
                      liveCoedit && activeDoc
                        ? {
                            docName: `authoring:${activeDoc.id}:${activeSection.id}`,
                            token: getAuthToken(),
                          }
                        : null
                    }
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── Right: history / comments rail ── */}
      {rail === 'history' && (
        <aside className="ed-comments">
          <div className="ed-comments-h ed-comments-h-row">
            <span>Revision history</span>
            <RailClose label="Close revision history" onClose={closeRail} />
          </div>
          {/* ── The ledger: history as a checkable fact ──
              Every revision is a link in a hash chain the database refuses to
              edit; this control recomputes the whole chain from stored content
              and reports exactly what it found. */}
          {activeSection && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'baseline',
                gap: 8,
                padding: '0 2px',
                fontSize: 11.5,
              }}
            >
              <button
                className="nda-open"
                onClick={() => void verifyLedger(activeSection.id)}
                disabled={ledger === 'checking'}
              >
                {I.shieldCheck} {ledger === 'checking' ? 'Recomputing ledger…' : 'Verify ledger'}
              </button>
              {/* 2026-09-28, coverage-gap sweep GA-5: the verdict was plain
                  spans, so a screen reader announced nothing — not even
                  "Ledger BROKEN". Two live regions, always mounted (a region
                  mounted together with its text is not announced): status
                  for an intact chain, alert for a broken one or a failed
                  check, the split this file uses elsewhere. */}
              <span role="status" data-testid="ledger-verdict-status">
                {ledger != null && ledger !== 'error' && ledger !== 'checking' && ledger.intact && (
                  <span className="sp-tone-ok">
                    Ledger intact — {ledger.chainedCount} chained revision
                    {ledger.chainedCount === 1 ? '' : 's'} recomputed and verified
                    {ledger.preLedgerCount > 0 ? `; ${ledger.preLedgerCount} pre-ledger` : ''}.
                  </span>
                )}
              </span>
              <span role="alert" data-testid="ledger-verdict-alert">
                {ledger === 'error' && (
                  <span style={{ color: 'var(--error)' }}>
                    Couldn’t recompute the ledger — this is a failed check, not a verdict about the
                    record.
                  </span>
                )}
                {ledger != null && ledger !== 'error' && ledger !== 'checking' && !ledger.intact && (
                  <span style={{ color: 'var(--error)', fontWeight: 600 }}>
                    Ledger BROKEN at {ledger.breaks.length} point
                    {ledger.breaks.length === 1 ? '' : 's'} —{' '}
                    {ledger.breaks.map(b => b.reason).join(', ')}. The history has been altered or
                    forked; treat this section’s record as disputed.
                  </span>
                )}
              </span>
            </div>
          )}
          {!activeSection ? (
            <EmptyState
              icon={I.clock}
              title="No section selected"
              hint="Select a section to see its revision history."
            />
          ) : revisionsState === 'error' ? (
            <EmptyState
              icon={I.alertTriangle}
              title="Revision history unavailable"
              hint="The history could not be loaded. This is a failure to read the record — it does not mean the section has no revisions."
            />
          ) : revisionsState === 'loading' ? (
            <EmptyState icon={I.clock} title="Reading revision history…" busy />
          ) : revisions.length === 0 ? (
            <EmptyState
              icon={I.clock}
              title="No prior revisions"
              hint="Each save records the new content here under its author, so you can compare and revert."
            />
          ) : (
            revisions.map((r, i) => (
              <div key={r.id} className="cmt">
                <div className="cmt-meta">
                  <span className="cmt-av">
                    {(r.created_by_name ?? '·')
                      .split(' ')
                      .map(x => x[0])
                      .join('')
                      .slice(0, 2)}
                  </span>
                  <b>{r.created_by_name ?? r.created_by_email ?? 'Unknown author'}</b>
                  {/* Which write path produced this state — the input's kind,
                      from the ledger, never inferred. */}
                  {r.origin && (
                    <span className="cmt-role">{REVISION_ORIGIN_LABELS[r.origin] ?? r.origin}</span>
                  )}
                  <span className="cmt-when">· {relTime(r.created_at)}</span>
                  {r.chain_sha256 && (
                    <span
                      className="cmt-when"
                      style={{ fontFamily: 'var(--font-mono, monospace)' }}
                      title={`Ledger link ${r.chain_sha256}`}
                    >
                      · {r.chain_sha256.slice(0, 8)}
                    </span>
                  )}
                  <button
                    className="nda-open"
                    style={{ marginLeft: 'auto' }}
                    onClick={() => revert(r.id)}
                    disabled={contentReadOnly}
                    title={editRefusal || (docSealed ? 'This document is frozen — its content cannot be reverted.' : undefined)}
                  >
                    {I.rotateCcw} Revert
                  </button>
                </div>
                <div
                  className="cmt-body"
                  style={{ whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'hidden' }}
                >
                  {(r.content ?? '').slice(0, 400) || <span style={{ opacity: 0.6 }}>(empty)</span>}
                </div>
                {/* The word-level redline against the revision before this
                    one (the list is newest-first, so that is the next row).
                    Computed from the two stored contents already loaded —
                    nothing fetched, nothing inferred. */}
                <AuthoringRevisionDiff
                  current={r.content ?? ''}
                  previous={revisions[i + 1]?.content ?? ''}
                />
              </div>
            ))
          )}
        </aside>
      )}

      {/* ── Right: what this section is drafted from ──
          The source context that had to be held in the author's head. Every row
          is a citation someone recorded, with its standing against the source's
          content today computed server-side from stored checksums — nothing here
          is inferred from the draft text. */}
      {rail === 'signatures' && (
        <aside className="ed-comments">
          <div className="ed-comments-h ed-comments-h-row">
            <span>Electronic signatures</span>
            <RailClose label="Close electronic signatures" onClose={closeRail} />
          </div>
          <AuthoringSignatures docId={activeDocId} />
        </aside>
      )}

      {/* ── Right: what left this document, and whether it is still current ──
          Two drifts, reported separately because they answer different
          questions: the section text against the last export's content hash,
          and the citations added since that export. A single "out of date"
          badge would have merged them. */}
      {rail === 'exports' && (
        <aside className="ed-comments">
          <div className="ed-comments-h ed-comments-h-row">
            <span>Exports{activeDoc ? ` · ${activeDoc.title}` : ''}</span>
            <RailClose label="Close exports" onClose={closeRail} />
          </div>
          <AuthoringExports docId={activeDocId} refreshKey={exportsEpoch} />
        </aside>
      )}

      {/* ── Right: the document's Part 11 audit trail ──
          Every row is a governed act the SERVER recorded — actor and role
          from the verified JWT, operation, reason, and the content hashes on
          either side of the change. Nothing here is composed client-side. */}
      {rail === 'audit' && (
        <aside className="ed-comments">
          <div className="ed-comments-h ed-comments-h-row">
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Audit trail{activeDoc ? ` · ${activeDoc.title}` : ''}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {/* The whole record, for someone who is not in this product: every
                  row with its full content, its chain entry and verdict, and
                  how to check them offline. The server records the export
                  before it sends it. */}
              <button
                type="button"
                className="nda-open"
                onClick={() => activeDocId && void downloadAuditRecord(activeDocId)}
                disabled={
                  !activeDocId || (recordExport.busy && recordExport.docId === activeDocId)
                }
              >
                {recordExport.busy && recordExport.docId === activeDocId
                  ? 'Preparing the record…'
                  : 'Download the record'}
              </button>
              <button
                type="button"
                className="nda-open"
                onClick={() => activeDocId && void loadAudit(activeDocId)}
                disabled={!activeDocId || auditState === 'loading'}
              >
                {auditState === 'loading' ? 'Loading…' : 'Refresh'}
              </button>
              <RailClose label="Close audit trail" onClose={closeRail} />
            </span>
          </div>
          {activeDocId && recordExport.docId === activeDocId && recordExport.error && (
            <div
              className="scaf-note"
              role="alert"
              data-testid="audit-export-error"
              style={{ marginTop: 0, padding: '8px 12px', fontSize: 12, borderLeftColor: 'var(--error)' }}
            >
              {recordExport.error}
            </div>
          )}
          {!activeDocId ? (
            <EmptyState
              icon={I.activity}
              title="No document selected"
              hint="Select a document to review its audit trail."
            />
          ) : auditState === 'forbidden' ? (
            <EmptyState
              icon={I.lock}
              title="No access to this document’s record"
              hint="Reading it needs access to the document, or an audit role in the organization. Ask the document’s owner or your quality lead."
            />
          ) : auditState === 'error' ? (
            <EmptyState
              tone="error"
              icon={I.alertTriangle}
              title="Couldn’t load the audit trail"
              hint="The read failed. This is a failure to READ the record — it does not mean no governed acts occurred. Retry, or check the service is reachable."
            />
          ) : auditState === 'loading' && auditEvents.length === 0 ? (
            <div role="status" className="scaf-note" style={{ padding: 12 }}>
              Loading the audit trail…
            </div>
          ) : auditEvents.length === 0 ? (
            <EmptyState
              icon={I.activity}
              title="No audit events yet"
              hint="Governed acts on this document — saves, reverts, reorders, freezes, signatures, exports — are recorded here by the server as they happen."
            />
          ) : (
            auditEvents.map(ev => {
              const section = ev.section_id
                ? sections.find(s => s.id === ev.section_id) ?? null
                : null;
              const integrityNote = auditIntegrityNote(ev.integrity);
              return (
                <div key={ev.id} className="cmt" data-testid="audit-event">
                  <div className="cmt-meta">
                    <span className="cmt-av">
                      {(ev.actor ?? '·')
                        .split(/[@\s.]/)
                        .filter(Boolean)
                        .map(x => x[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                    <b
                      style={{
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {ev.actor ?? 'Unknown actor'}
                    </b>
                    {ev.actor_role && <span className="cmt-role">{ev.actor_role}</span>}
                    {/* The instant, not only "3 h ago". This rail now prints
                        as-of claims — whether a model was allowed to write
                        regulatory text, how the turn ended — and relTime caps
                        at "N d ago", so an inspector diffing a screenshot
                        against the trail had no date to diff against. The
                        signatures and exports rails already use the governed
                        stamp; this was the Part 11 rail that did not. */}
                    <span className="cmt-when">· {relTime(ev.created_at)}</span>
                    <GovernedTimestamp value={ev.created_at} layout="inline" className="cmt-when" />
                  </div>
                  <div className="cmt-body" style={{ display: 'grid', gap: 3 }}>
                    <span>
                      {auditEventLabel(ev.event_type)}
                      {section && (
                        <>
                          {' — '}
                          <button
                            className="nda-open"
                            title={`Open ${section.code} ${section.title}`}
                            onClick={() => requestLeave({ kind: 'section', id: section.id })}
                          >
                            §{section.code}
                          </button>
                        </>
                      )}
                    </span>
                    {/* The metadata the endpoint has always returned and no
                        surface read — the redline a reviewer refused, the model
                        that produced an accepted draft. */}
                    {(() => {
                      const detail = describeAuditMetadata(ev.event_type, ev.metadata);
                      return detail ? (
                        <span
                          style={{ fontSize: 12, opacity: 0.85 }}
                          data-testid="audit-metadata"
                        >
                          {detail}
                        </span>
                      ) : null;
                    })()}
                    <AuditSourceLine metadata={ev.metadata} />
                    {ev.change_reason && (
                      <span style={{ fontSize: 12, opacity: 0.85 }}>{ev.change_reason}</span>
                    )}
                    {(ev.content_hash_before || ev.content_hash_after) && (
                      <span
                        /* --text-400 rather than opacity: text-200 at .7 over
                           the rail composites to 4.36:1, just under AA at this
                           size, and the token keeps its own contrast in both
                           themes instead of depending on what is behind it. */
                        style={{
                          fontFamily: 'var(--font-mono, monospace)',
                          fontSize: 10.5,
                          color: 'var(--text-400)',
                        }}
                        title={`Content hash before: ${ev.content_hash_before ?? '—'}\nContent hash after: ${ev.content_hash_after ?? '—'}`}
                      >
                        {(ev.content_hash_before ?? '—').slice(0, 8)} →{' '}
                        {(ev.content_hash_after ?? '—').slice(0, 8)}
                      </span>
                    )}
                    {/* The server's check of this row against its chained
                        record, said only when it fails. A row the chain does
                        not name is unknown and gets nothing; an intact row gets
                        nothing either. */}
                    {integrityNote && (
                      <div className="ana-msg-warnings" role="note" data-testid="audit-integrity-note">
                        <div className="ana-msg-warning">
                          <span className="ana-msg-warning-ic" aria-hidden="true">
                            {I.alertTriangle}
                          </span>
                          <span>{integrityNote}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </aside>
      )}

      {rail === 'sources' && (
        <aside className="ed-comments">
          <div className="ed-comments-h ed-comments-h-row">
            <span>Drafted from</span>
            {/* Document-wide, not section-wide, because the question before an
                export or a sign-off is "has anything I cite moved?" across the
                whole document — not one claim at a time. */}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <button
                className="nda-open"
                onClick={() => void refreshAllSources()}
                disabled={!activeDocId || refreshingAll}
                data-testid="refresh-all-sources"
                title="Re-read every unfrozen citation in this document against its stored source. Frozen citations are left alone."
              >
                {refreshingAll ? 'Re-reading…' : 'Re-read all'}
              </button>
              <RailClose label="Close sources" onClose={closeRail} />
            </span>
          </div>
          {/* The findings from the last document-wide re-read. Kept on the rail
              rather than in a toast: a citation whose source is gone is the
              thing the person about to file this needs to see, and it must not
              fade after four seconds. */}
          {skippedRefreshes.length > 0 && (
            <div
              className="scaf-note"
              role="alert"
              data-testid="refresh-skipped"
              style={{ margin: 12, fontSize: 12, borderLeftColor: 'var(--error)' }}
            >
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <b>
                  {skippedRefreshes.length} citation
                  {skippedRefreshes.length === 1 ? '' : 's'} could not be re-read
                </b>
                <span style={{ flex: 1 }} />
                <button className="nda-open" onClick={() => setSkippedRefreshes([])}>
                  Dismiss
                </button>
              </div>
              {skippedRefreshes.slice(0, 8).map(sk => (
                <div key={sk.cite_id} style={{ marginTop: 4 }}>
                  {citationRefreshRefusalMessage(sk.reason)}
                </div>
              ))}
              {skippedRefreshes.length > 8 && (
                <div style={{ marginTop: 4, opacity: 0.75 }}>
                  and {skippedRefreshes.length - 8} more.
                </div>
              )}
            </div>
          )}
          {!activeSection ? (
            <EmptyState
              icon={I.fileText}
              title="No section selected"
              hint="Select a section to see the sources it is drafted from."
            />
          ) : sourcesState === 'loading' ? (
            <div role="status" className="scaf-note" style={{ padding: 12 }}>
              Loading this section’s sources…
            </div>
          ) : sourcesState === 'error' ? (
            <EmptyState
              icon={I.alertTriangle}
              title="Couldn’t load this section’s sources"
              hint="The read failed, so nothing is shown — this is not the same as the section citing nothing. Sign in and retry, or check the service is reachable."
            />
          ) : (
            <>
              <div
                style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}
              >
                {!picking ? (
                  <button
                    className="btn ghost"
                    style={{ height: 28, fontSize: 12 }}
                    onClick={() => setPicking(true)}
                  >
                    {I.plus} Record a source
                  </button>
                ) : projectSourcesState === 'error' ? (
                  <div role="alert" style={{ fontSize: 12 }}>
                    The project’s data room could not be read, so no sources are listed. This is
                    not the same as the data room being empty.
                    <button className="nda-open" style={{ marginLeft: 8 }} onClick={() => void loadProjectSources()}>
                      Retry
                    </button>
                    <button className="nda-open" style={{ marginLeft: 8 }} onClick={() => setPicking(false)}>
                      Close
                    </button>
                  </div>
                ) : projectSourcesState === 'loading' ? (
                  <div role="status" style={{ fontSize: 12, opacity: 0.8 }}>
                    Reading the project’s data room…
                  </div>
                ) : projectSources.length === 0 ? (
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    No project sources available. Add documents to the project’s data room first, or
                    open this document from its project so the data room is in context.
                    <button
                      className="nda-open"
                      style={{ marginLeft: 8 }}
                      onClick={() => setPicking(false)}
                    >
                      Close
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 4 }}>
                    <span style={{ fontSize: 11.5, opacity: 0.75 }}>
                      Choose a source from this project’s data room. Its current checksum is
                      recorded with the citation.
                    </span>
                    {projectSources.map(ps => (
                      <button
                        key={ps.id}
                        className="nda-open"
                        style={{ textAlign: 'left' }}
                        disabled={!sourceCitationEligible(ps)}
                        title={
                          sourceCitationEligible(ps)
                            ? 'Record this section as drafted from this source'
                            : 'Only current sources with eligible readable text can ground a draft'
                        }
                        onClick={() => void citeSource(ps.id)}
                      >
                        {ps.title || `Source ${ps.id}`}
                        {ps.extractionStatus !== 'extracted' ? ' — text not readable' : ''}
                      </button>
                    ))}
                    <button className="nda-open" onClick={() => setPicking(false)}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {sources.length === 0 ? (
                <EmptyState
                  icon={I.fileText}
                  title="No sources recorded for this section"
                  hint="Record the documents this section is written from. Each citation stores the source’s content identity, so if the source later changes this section is flagged rather than quietly left behind."
                />
              ) : (
                sources.map(s => {
                  const st = sourceStateLabel(s);
                  return (
                    <div key={s.citationId} className="cmt">
                      <div className="cmt-meta">
                        <b
                          style={{
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {s.source?.title ?? `Source ${s.citationId.slice(0, 8)}`}
                        </b>
                        <span className="cmt-when">· cited {relTime(s.citedAt)}</span>
                      </div>
                      <div className="cmt-body" style={{ display: 'grid', gap: 4 }}>
                        <span
                          className={
                            st.tone === 'ok'
                              ? 'sp-tone-ok'
                              : st.tone === 'warn'
                              ? 'sp-tone-warn'
                              : undefined
                          }
                          style={{ fontSize: 12 }}
                          title={st.hint}
                        >
                          {st.text}
                        </span>
                        {s.citationText && (
                          <span style={{ fontSize: 12, opacity: 0.85 }}>{s.citationText}</span>
                        )}
                        <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button className="nda-open" onClick={() => void reresolve(s.citationId)}>
                            {I.rotateCcw} Re-read source
                          </button>
                          {s.source && (
                            <button className="nda-open" onClick={() => void uncite(s.source!.id)}>
                              Remove
                            </button>
                          )}
                          {s.state === 'changed' && (
                            <button
                              className="nda-open"
                              onClick={() =>
                                askAna(
                                  `The source "${
                                    s.source?.title ?? 'this document'
                                  }" changed after section ${
                                    activeSection.code
                                  } was drafted from it. Read the current source and tell me what in this section no longer matches. Do not rewrite it yet.`
                                )
                              }
                            >
                              {I.sparkles} Ask what changed
                            </button>
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}
        </aside>
      )}

      {/* ── Right: the project's vault ──
          The read model the Vault surface renders (GET /api/c2c/project-vault/:id,
          /search), browsed beside the page: open a PDF here, cite a data-room
          source into the open section through the editor's own citation
          command, or insert a plain reference to a file that is not a source. */}
      {rail === 'vault' && (
        <aside className="ed-comments" aria-label="Project files">
          <ProjectFilesPanel
            programId={programId}
            programName={programName(program)}
            sectionOpen={activeSection != null && !contentReadOnly}
            sectionCode={activeSection?.code ?? null}
            projectSources={projectSources.filter(sourceCitationEligible)}
            onCite={(sourceId) => editorRef.current?.insertCitation(sourceId) ?? false}
            onInsertReference={(text) => editorRef.current?.insertReference(text) ?? false}
            onOpenDocument={(docId) => void openPulledDocument(docId)}
            onAsk={askAna}
            onClose={closeRail}
            fireToast={fireToast}
          />
        </aside>
      )}

      {/* ── Right: the document's review tasks ──
          Tasks linked to THIS document on the one task store (unified_tasks,
          sourceEntityType 'authoring_document'), with their state; a review
          task completes through the tasking path's own transition. */}
      {rail === 'tasks' && (
        <aside className="ed-comments" aria-label="Review tasks">
          <ReviewTasksPanel
            docId={activeDocId}
            docTitle={activeDoc?.title ?? null}
            refreshKey={tasksEpoch}
            onSendForReview={() => setSendForReviewOpen(true)}
            sendRefusal={actRefusal(docAccess.assignReview)}
            signer={esignSignerOf(user as Parameters<typeof esignSignerOf>[0])}
            onOpenBoard={() => onNav('review')}
            onClose={closeRail}
            fireToast={fireToast}
          />
        </aside>
      )}

      {rail === 'access' && (
        <aside className="ed-comments" aria-label="Document access">
          <div className="ed-comments-h ed-comments-h-row">
            <span>Document access</span>
            <RailClose label="Close document access" onClose={closeRail} />
          </div>
          <DocumentPermissionsPanel
            docId={activeDocId}
            docTitle={activeDoc?.title ?? null}
            organizationId={user?.organizationId}
            sections={sectionsState === 'ready' ? sections.filter(s => s.doc_id === activeDocId) : []}
            fireToast={fireToast}
          />
        </aside>
      )}

      {rail === 'comments' && (
        <aside className="ed-comments">
          <div className="ed-comments-h ed-comments-h-row">
            <span>Comments</span>
            <RailClose label="Close comments" onClose={closeRail} />
          </div>
          {activeSection && (
            <div
              style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}
            >
              {/* The range being commented on, handed over by the editor's
                  Comment button. Posting resolves the server id back to the
                  canvas so the highlight mark can be applied and saved. */}
              {pendingAnchor && (
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'baseline',
                    marginBottom: 6,
                    fontSize: 12,
                  }}
                >
                  <span className="rd-chip tone-idle" style={{ flexShrink: 0 }}>
                    Anchoring to
                  </span>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontStyle: 'italic',
                    }}
                  >
                    “{pendingAnchor.quote}”
                  </span>
                  <button className="nda-open" onClick={cancelAnchoredComment}>
                    Cancel
                  </button>
                </div>
              )}
              <textarea
                className="c2c-input"
                aria-label={pendingAnchor ? 'Comment on the selected text' : `Comment on ${activeSection.code}`}
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                placeholder={
                  pendingAnchor
                    ? 'Comment on the selected text…'
                    : `Comment on ${activeSection.code}…`
                }
                style={{ width: '100%', minHeight: 56, resize: 'vertical', fontSize: 13 }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                <button
                  className="btn primary"
                  style={{ height: 28 }}
                  onClick={addComment}
                  disabled={!newComment.trim()}
                >
                  {I.plus} Add comment
                </button>
              </div>
            </div>
          )}
          {comments.length === 0 ? (
            /* Three different facts, three different renders: still reading,
               the read FAILED, and genuinely no comments. This rail used to
               render every failure as "No comments yet" — on the panel a
               reviewer consults before freezing a document, the most dangerous
               conflation on the surface. */
            commentsState === 'loading' ? (
              <EmptyState icon={I.checkCircle} title="Loading comments…" busy />
            ) : commentsState === 'error' ? (
              <EmptyState
                tone="error"
                icon={I.alertTriangle}
                title="Couldn’t load this document’s comments"
                hint="The document may have open review threads that did not load — this is a failed read, not an empty record. Reopen the rail to retry."
              />
            ) : (
              <EmptyState
                icon={I.checkCircle}
                title="No comments yet"
                hint="Comments on this document appear here. Add one above."
              />
            )
          ) : (
            comments.map(c => {
              const anchor = asTextRangeAnchor(c.anchor);
              return (
                <div
                  key={c.id}
                  className="cmt"
                  data-active={focusedCommentId === c.id || undefined}
                  style={
                    focusedCommentId === c.id
                      ? {
                          background:
                            'color-mix(in srgb, var(--accent-100) 7%, transparent)',
                        }
                      : undefined
                  }
                >
                  <div className="cmt-meta">
                    <span className="cmt-av">
                      {(c.author_name ?? '·')
                        .split(' ')
                        .map(x => x[0])
                        .join('')
                        .slice(0, 2)}
                    </span>
                    <b>{c.author_name ?? 'Unknown'}</b>
                    {c.section_code && <span className="cmt-role">{c.section_code}</span>}
                    <span className="cmt-when">· {relTime(c.created_at)}</span>
                    {/* The thread's lifecycle. Resolving records the resolver
                        and keeps the row; reopen is the honest undo. Neither
                        deletes anything. */}
                    {c.status && c.status !== 'open' ? (
                      <>
                        <span className="rd-chip tone-ok" style={{ marginLeft: 'auto' }}>
                          {c.status}
                        </span>
                        <button
                          className="nda-open"
                          title="Reopen this comment thread"
                          onClick={() => void setCommentStatus(c.id, 'open')}
                        >
                          Reopen
                        </button>
                      </>
                    ) : (
                      <button
                        className="nda-open"
                        style={{ marginLeft: 'auto' }}
                        title="Mark this comment resolved — recorded under your name; the thread stays in the record"
                        onClick={() => {
                          setResolveFor(c.id);
                          setResolveNote('');
                        }}
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                  {/* The resolution RECORD, not just a chip: who closed the
                      thread, when, and their stated reason — the facts the
                      server has kept all along and the rail never showed. */}
                  {c.status === 'resolved' && (c.resolved_by || c.resolved_at) && (
                    <div className="cmt-resolution">
                      Resolved{c.resolved_by ? ` by ${c.resolved_by}` : ''}
                      {c.resolved_at ? ` · ${relTime(c.resolved_at)}` : ''}
                      {c.resolution_note ? <em> — “{c.resolution_note}”</em> : null}
                    </div>
                  )}
                  {resolveFor === c.id && (
                    <div style={{ margin: '4px 0 6px' }}>
                      <textarea
                        className="c2c-input"
                        value={resolveNote}
                        autoFocus
                        onChange={e => setResolveNote(e.target.value)}
                        placeholder="Reason for resolving (optional)"
                        aria-label="Reason for resolving"
                        style={{ width: '100%', minHeight: 40, resize: 'vertical', fontSize: 13 }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 4 }}>
                        <button className="nda-open" onClick={() => setResolveFor(null)}>
                          Cancel
                        </button>
                        <button
                          className="btn primary"
                          style={{ height: 26 }}
                          onClick={() => {
                            setResolveFor(null);
                            void setCommentStatus(c.id, 'resolved', resolveNote);
                          }}
                        >
                          Resolve
                        </button>
                      </div>
                    </div>
                  )}
                  {/* The quoted range this thread is anchored to, with a jump
                      into the canvas. An anchor whose text no longer exists is
                      reported as exactly that — never silently repointed. */}
                  {anchor && (
                    <div
                      style={{
                        display: 'flex',
                        gap: 6,
                        alignItems: 'baseline',
                        margin: '2px 0 4px',
                        fontSize: 11.5,
                      }}
                    >
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontStyle: 'italic',
                          opacity: 0.8,
                        }}
                      >
                        “{anchor.quote}”
                      </span>
                      {c.section_id === activeSectionId && (
                        <button
                          className="nda-open"
                          onClick={() => {
                            setFocusedCommentId(c.id);
                            const found = editorRef.current?.selectCommentAnchor(c.id);
                            if (!found) {
                              fireToast(
                                'The annotated text no longer exists in the current draft — the comment is kept, its highlight is gone.',
                                'error'
                              );
                            }
                          }}
                        >
                          Show in text
                        </button>
                      )}
                    </div>
                  )}
                  <div className="cmt-body">{c.body}</div>
                  {/* The thread under its head: replies the server nests,
                      oldest first, each with its own server-side attribution. */}
                  {(c.replies?.length ?? 0) > 0 && (
                    <div className="cmt-replies">
                      {c.replies!.map(r => (
                        <div key={r.id} className="cmt-reply">
                          <div className="cmt-meta">
                            <span className="cmt-av">
                              {(r.author_name ?? '·')
                                .split(' ')
                                .map(x => x[0])
                                .join('')
                                .slice(0, 2)}
                            </span>
                            <b>{r.author_name ?? 'Unknown'}</b>
                            <span className="cmt-when">· {relTime(r.created_at)}</span>
                          </div>
                          <div className="cmt-body">{r.body}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Reply — posts into THIS thread (parent_comment_id), against
                      the thread's own section. One box open at a time. */}
                  {c.section_id &&
                    (replyTo === c.id ? (
                      <div style={{ marginTop: 6 }}>
                        <textarea
                          className="c2c-input"
                          value={replyText}
                          autoFocus
                          onChange={e => setReplyText(e.target.value)}
                          placeholder={`Reply to ${c.author_name ?? 'this thread'}…`}
                          aria-label={`Reply to ${c.author_name ?? 'this thread'}`}
                          style={{ width: '100%', minHeight: 44, resize: 'vertical', fontSize: 13 }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 4 }}>
                          <button
                            className="nda-open"
                            onClick={() => {
                              setReplyTo(null);
                              setReplyText('');
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            className="btn primary"
                            style={{ height: 26 }}
                            disabled={!replyText.trim()}
                            onClick={() => void addReply(c)}
                          >
                            Reply
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        className="nda-open"
                        style={{ marginTop: 4 }}
                        title="Reply into this thread"
                        onClick={() => {
                          setReplyTo(c.id);
                          setReplyText('');
                        }}
                      >
                        {I.messageSquare} Reply
                      </button>
                    ))}
                </div>
              );
            })
          )}
        </aside>
      )}

      {fileToVaultOpen && activeDoc && (
        <FileToVaultDialog
          docId={activeDoc.id}
          docTitle={activeDoc.title}
          docStatus={activeDoc.status}
          programId={programId}
          programName={programName(program)}
          onClose={() => setFileToVaultOpen(false)}
          onNav={onNav}
          onFiled={() => {
            /* A filing is a governed act the audit rail records. */
            if (rail === 'audit' && activeDocId) void loadAudit(activeDocId);
          }}
          fireToast={fireToast}
        />
      )}
      {sendForReviewOpen && activeDoc && (
        <SendForReviewDialog
          docId={activeDoc.id}
          docTitle={activeDoc.title}
          programId={programId}
          sectionCode={activeSection?.code ?? null}
          authorId={activeDoc.created_by != null ? String(activeDoc.created_by) : null}
          onClose={() => setSendForReviewOpen(false)}
          onSent={() => {
            /* The tasks the act created are listed beside the document. */
            setTasksEpoch(e => e + 1);
            setRail('tasks');
          }}
          onCheckTasks={() => {
            setSendForReviewOpen(false);
            setTasksEpoch(e => e + 1);
            setRail('tasks');
          }}
          onOpenBoard={() => {
            setSendForReviewOpen(false);
            onNav('review');
          }}
          fireToast={fireToast}
        />
      )}

      {pendingLeave && activeSection && (
        <UnsavedWorkGuard
          sectionCode={activeSection.code}
          sectionTitle={activeSection.title}
          destination={
            pendingLeave.kind === 'view' ? `${pendingLeave.mode === 'document' ? 'Document' : 'Section'} view`
              : pendingLeave.kind === 'program' || pendingLeave.kind === 'host-back' ? pendingLeave.label : pendingLeave.kind === 'conversation' ? 'the AnA conversation' : pendingLeave.kind !== 'section'
              ? docs.find(d => d.id === pendingLeave.id)?.title ?? 'another document'
              : sections.find(s => s.id === pendingLeave.id)?.code ?? 'another section'
          }
          saving={leaving}
          pendingDecisionCount={pendingDecisionCountRef.current}
          onSave={() => void saveAndLeave()}
          onLeave={leaveUnsaved}
          onCancel={() => { if (pendingLeave.kind === 'program') pendingLeave.onCancel(); setPendingLeave(null); }}
        />
      )}

      <C2CToast msg={toast} />
    </div>
  );
}

/* ── The unsaved-work decision ────────────────────────────────────────────
   Three outcomes, all of them stated. The one thing this dialog must never do
   is decide for the author: saving mints an attributable Part 11 revision, and
   discarding loses text. Both are the author's call, so both are a button and
   neither is the default action of walking away. */
function UnsavedWorkGuard({
  sectionCode,
  sectionTitle,
  destination,
  saving,
  pendingDecisionCount,
  onSave,
  onLeave,
  onCancel,
}: {
  sectionCode: string;
  sectionTitle: string;
  destination: string;
  saving: boolean;
  /** Accept/reject decisions recorded for this section since it was last
   *  saved — already permanent on the audit trail regardless of what the
   *  author chooses here. Zero when nothing has been decided this session. */
  pendingDecisionCount: number;
  onSave: () => void;
  onLeave: () => void;
  onCancel: () => void;
}) {
  // Escape cancels (the safe outcome — it changes nothing either way) and
  // focus returns to the tree row that was clicked.
  const ref = useDialog(onCancel);
  return (
    <div
      className="ed-guard-bd"
      onMouseDown={e => {
        if (e.target === e.currentTarget && !saving) onCancel();
      }}
    >
      <div
        className="ed-guard"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="ed-guard-t"
        aria-describedby="ed-guard-d"
        tabIndex={-1}
        ref={ref}
      >
        <h2 className="ed-guard-t" id="ed-guard-t">
          Unsaved changes in {sectionCode}
        </h2>
        <p className="ed-guard-d" id="ed-guard-d">
          Your edits to {sectionCode} {sectionTitle} are cached on this device and are not in the
          record. Opening {destination} closes this section.
        </p>
        {pendingDecisionCount > 0 && (
          <p className="ed-guard-d">
            {pendingDecisionCount === 1
              ? 'One tracked-change decision in this section was'
              : `${pendingDecisionCount} tracked-change decisions in this section were`}{' '}
            already recorded to the audit trail. Leaving without saving keeps{' '}
            {pendingDecisionCount === 1 ? 'that decision' : 'those decisions'} on record while the
            section's saved content still shows {pendingDecisionCount === 1 ? 'it' : 'them'} as
            pending — deciding {pendingDecisionCount === 1 ? 'it' : 'them'} again later replaces
            this record rather than conflicting with it.
          </p>
        )}
        <p className="ed-guard-d">
          Saving records an auditable revision attributed to you. Leaving keeps the edits on this
          device only — this browser, on this machine — and offers them back when you return to the
          section.
        </p>
        <div className="ed-guard-acts">
          <button className="btn ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button className="btn ghost" onClick={onLeave} disabled={saving}>
            Leave without saving
          </button>
          <button className="btn primary" onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save and continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
