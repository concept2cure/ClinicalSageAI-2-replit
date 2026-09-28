/**
 * place_project_document — filing a studied document where it belongs.
 *
 * The other half of the catalog loop. vault-filing.service.ts PROPOSES a
 * placement at ingest, from the file name and a sample of the text, and
 * vault-ingest writes that proposal once. Nothing ever revisited it: a
 * document the classifier could not place sat in the Unfiled queue forever,
 * and one it placed wrongly sat under "suggested" forever, because the only
 * writer of a filing decision was an HTTP handler behind the Vault surface.
 * AnA could read a document end to end, record exactly what it was, and still
 * do nothing about where it lived.
 *
 * This tool closes that, over the SAME governed write the Vault surface uses
 * (vault-placement.service.ts): one transaction, one §11 audit row recording
 * both the prior and the new location, the program\u0027s own taxonomy enforced.
 *
 * The one rule it adds on top: AnA may file only a document she has CATALOGED.
 * Filing is a claim about what a document is, and a placement resting on a
 * filename is the guess the ingest classifier already made — repeating it
 * under AnA\u0027s name would dress a guess up as judgement. Unfiling is exempt,
 * because it retracts a claim rather than making one.
 *
 * And what she writes is a SUGGESTION, in her own name (D5,
 * placement-attribution, 2026-09-24). This tool used to hand the service only
 * the person's user id, so her folder was recorded as 'confirmed' — what the
 * Vault counts as "an upload a person filed" — placed_by that person, under a
 * Part 11 audit row naming only them, while URS-VAULT-007 says a person
 * confirms the filing. She now passes her provenance, which makes the write
 * 'suggested' (the state the Vault already asks a person to confirm) and puts
 * the tool, the serving model, the thread and the turn on the audit row. She
 * cannot confirm a suggestion at all; that is the person's act, in the Vault.
 *
 * @module server/services/ana/document-placement-tools
 */

import type { ToolContext } from './AnaToolExecutor.js';
import type { CommandContext } from '../ana-ri/command-executor.js';
import { agentAuditDetails, type PolicyCheck } from '../ana-ri/mdx-tool-policy.js';
import {
  CHAT_UPLOAD_ID,
  requireCatalog,
  unknownDocumentRefusal,
  withCaughtErrors,
  type RegisterFn,
} from './document-tools-shared.js';

/**
 * A placement request, already resolved to the arguments the service takes.
 *
 * The two destinations (a named folder, and unfile) differ only in these
 * fields, so they are normalized here rather than branched over again at the
 * call site — where parallel ternaries would be chances for one of them to
 * disagree with the others. "Confirm what was suggested" is not a destination
 * AnA has: it is refused before a plan is made (confirmationRefusal).
 */
interface PlacementPlan {
  documentId: string;
  /** True only for an explicit unfile, which skips the comprehension gate. */
  unfile: boolean;
  /** A folder to suggest, or `null` to unfile. */
  folderId: string | null;
  ctdSection: string | null;
  evidenceKind: string | null;
  rationale: string;
}

function parsePlacementInput(input: Record<string, unknown>): PlacementPlan | { error: string } {
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const documentId = str(input.document_id) ?? '';
  if (!documentId) {
    return { error: 'place_project_document requires document_id (string).' };
  }
  const rationale = str(input.rationale);
  if (!rationale) {
    return {
      error:
        'place_project_document requires rationale — one sentence saying why this folder, grounded in what the document says.',
    };
  }
  if (input.unfile === true) {
    return {
      documentId,
      unfile: true,
      folderId: null,
      ctdSection: null,
      evidenceKind: null,
      rationale,
    };
  }

  const folderId = str(input.folder_id);
  if (!folderId) {
    return {
      error:
        'place_project_document needs a destination: folder_id to suggest a folder (a person confirms it in the ' +
        'Vault), or unfile:true to put it in the Unfiled queue.',
    };
  }
  return {
    documentId,
    unfile: false,
    folderId,
    ctdSection: str(input.ctd_section),
    evidenceKind: str(input.evidence_kind),
    rationale,
  };
}

/**
 * Filing a document into a dossier folder is a claim about what it is, so it
 * is refused for a document AnA has not read and recorded. This is the same
 * discipline as the read-coverage gate on catalog_project_document, one step
 * later: a placement resting on a filename is the guess the ingest classifier
 * already made, and repeating it under AnA's name would dress it up as
 * judgement. Unfiling is exempt — it retracts a claim rather than making one.
 */
function comprehensionRefusal(
  doc: { id: string; fileName: string; catalog: { status: string } | null },
): string | null {
  if (doc.catalog?.status === 'cataloged') return null;
  const state =
    doc.catalog?.status === 'extraction_failed'
      ? 'its text could not be extracted, so there is nothing to base a placement on'
      : 'you have not recorded what it is yet';
  return JSON.stringify({
    ok: false,
    refused: true,
    documentId: doc.id,
    reason:
      `${doc.fileName} cannot be filed because ${state}. Read it in full with read_project_document and record ` +
      'it with catalog_project_document, then file it. If it genuinely belongs nowhere you can justify, ' +
      'pass unfile:true instead — the Unfiled queue is visible and honest; a guessed folder is not.',
  });
}

/**
 * confirm_suggested is refused outright. Confirming is the act that turns a
 * proposal into a person's filing decision (URS-VAULT-007), so an AnA call
 * that did it recorded a person's decision nobody made — the D5 defect in its
 * plainest form. The service refuses an agent's confirm too; this answers
 * first, before anything is read, with what she CAN do instead.
 */
function confirmationRefusal(documentId: unknown): string {
  return JSON.stringify({
    ok: false,
    refused: true,
    documentId: typeof documentId === 'string' ? documentId : null,
    reason:
      'You cannot confirm a filing. A person confirms where a document is filed, in the Vault; until they do, ' +
      'a placement is a suggestion. If you have read the document and a folder is right, pass folder_id with your ' +
      'rationale — it is recorded as your suggestion for them to confirm. If it belongs nowhere you can justify, ' +
      'pass unfile:true. Tell the user the existing suggestion is waiting for their confirmation in the Vault.',
  });
}

/**
 * Who made this placement, for its audit row — the D5 fix.
 *
 * In the repo's one agent-audit shape: agentAuditDetails (ana-ri/
 * mdx-tool-policy), the details every agent.ana.* row carries and
 * explain_audit_row reads to say "AnA (agent)" rather than "human user". The
 * helper takes a command context and a governed-tool gate; it reads only the
 * thread, chat-message ids and serving model from the one and the reason and
 * artifact flag from the other, so a tool call supplies what it has — its
 * thread, its model call, and its rationale as the reason — and the rest of
 * this tool's provenance is added beside it.
 */
/** As the gateway reported it, with the bare model name as the fallback. */
function servingModelOf(ctx: ToolContext | undefined): CommandContext['servingModel'] {
  const served = ctx?.servingModel;
  return {
    provider: served?.provider ?? null,
    model: served?.model ?? ctx?.model ?? null,
    requestId: served?.requestId ?? null,
  };
}

function placementProvenance(
  ctx: ToolContext | undefined,
  orgId: number,
  rationale: string,
): Record<string, unknown> {
  const commandCtx = {
    organizationId: orgId,
    userId: ctx?.userId,
    threadId: ctx?.threadId ?? undefined,
    servingModel: servingModelOf(ctx),
  } as CommandContext;
  const gate = { ok: true, reason: rationale } as PolicyCheck;
  return {
    ...agentAuditDetails(commandCtx, gate),
    // That soft signal is computed by the governed-tool gate, which this tool
    // does not run. The helper would record `false`, which explain_audit_row
    // renders as "the reason did NOT cite a concrete artifact" — a finding no
    // one made. Null is "not assessed".
    reasonReferencedArtifact: null,
    tool: 'place_project_document',
    turnId: ctx?.turnId ?? null,
  };
}

async function handlePlaceProjectDocument(
  input: Record<string, unknown>,
  ctx?: ToolContext,
): Promise<string> {
  const gate = await requireCatalog(ctx, 'place_project_document');
  if ('refusal' in gate) return JSON.stringify({ error: gate.refusal });
  const { svc, orgId } = gate;

  if (input.confirm_suggested === true) return confirmationRefusal(input.document_id);

  const parsed = parsePlacementInput(input);
  if ('error' in parsed) return JSON.stringify(parsed);
  if (CHAT_UPLOAD_ID.test(parsed.documentId)) {
    return unknownDocumentRefusal(parsed.documentId, 'place_project_document');
  }

  const doc = await svc.loadDocumentForOrg(parsed.documentId, orgId);
  if (!doc) return unknownDocumentRefusal(parsed.documentId, 'place_project_document');

  if (!parsed.unfile) {
    const refusal = comprehensionRefusal(doc);
    if (refusal) return refusal;
  }

  const { placeVaultDocument } = await import('../vault/vault-placement.service.js');
  const outcome = await placeVaultDocument({
    programId: doc.programId,
    documentId: doc.id,
    organizationId: orgId,
    // The person on whose behalf she acts; `agent` says who decided.
    userId: ctx?.userId ?? null,
    folderId: parsed.folderId,
    ctdSection: parsed.ctdSection,
    evidenceKind: parsed.evidenceKind,
    note: parsed.rationale,
    agent: placementProvenance(ctx, orgId, parsed.rationale),
  });

  if (!outcome.ok) {
    return JSON.stringify({ ok: false, error: outcome.code, message: outcome.message });
  }
  const { filing } = outcome;
  return JSON.stringify({
    ok: true,
    documentId: doc.id,
    fileName: doc.fileName,
    from: outcome.before,
    filing,
    message:
      filing.placementStatus === 'unfiled'
        ? `${doc.fileName} is now in the Unfiled queue with your reason recorded, for a person to decide. ` +
          'Tell the user it is unplaced and why.'
        : `${doc.fileName} is now suggested for ${filing.folderLabel}${
            filing.ctdSection ? ` (${filing.ctdSection})` : ''
          } — your suggestion, not a filing: a person confirms it in the Vault. The suggestion is in the ` +
          'Part 11 audit trail under your name. Tell the user where you suggested it and that it awaits their ' +
          'confirmation in the Vault.',
  });
}

export function registerDocumentPlacementHandlers(register: RegisterFn): void {
  register(
    'place_project_document',
    withCaughtErrors('place_project_document', handlePlaceProjectDocument),
  );
}
