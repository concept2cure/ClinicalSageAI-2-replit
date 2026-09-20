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
 * @module server/services/ana/document-placement-tools
 */

import type { ToolContext } from './AnaToolExecutor.js';
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
 * The three destinations (a named folder, "confirm what was suggested", and
 * unfile) differ only in these five fields, so they are normalized here rather
 * than branched over again at the call site — where five parallel ternaries
 * would be five chances for one of them to disagree with the others.
 */
interface PlacementPlan {
  documentId: string;
  /** True only for an explicit unfile, which skips the comprehension gate. */
  unfile: boolean;
  confirm: boolean;
  /** A folder, `null` to unfile, or `undefined` to confirm in place. */
  folderId: string | null | undefined;
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
      confirm: false,
      folderId: null,
      ctdSection: null,
      evidenceKind: null,
      rationale,
    };
  }

  const folderId = str(input.folder_id) ?? undefined;
  const confirm = input.confirm_suggested === true;
  if (!folderId && !confirm) {
    return {
      error:
        'place_project_document needs a destination: folder_id to file it, confirm_suggested:true to accept the ' +
        'existing suggestion, or unfile:true to put it in the Unfiled queue.',
    };
  }
  return {
    documentId,
    unfile: false,
    confirm,
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

async function handlePlaceProjectDocument(
  input: Record<string, unknown>,
  ctx?: ToolContext,
): Promise<string> {
  const gate = await requireCatalog(ctx, 'place_project_document');
  if ('refusal' in gate) return JSON.stringify({ error: gate.refusal });
  const { svc, orgId } = gate;

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
    userId: ctx?.userId ?? null,
    confirm: parsed.confirm,
    folderId: parsed.folderId,
    ctdSection: parsed.ctdSection,
    evidenceKind: parsed.evidenceKind,
    note: parsed.rationale,
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
        ? `${doc.fileName} is now in the Unfiled queue with your reason recorded. Tell the user it is unplaced and why.`
        : `${doc.fileName} is filed under ${filing.folderLabel}${
            filing.ctdSection ? ` (${filing.ctdSection})` : ''
          }. The move is in the Part 11 audit trail. Tell the user where it now lives.`,
  });
}

export function registerDocumentPlacementHandlers(register: RegisterFn): void {
  register(
    'place_project_document',
    withCaughtErrors('place_project_document', handlePlaceProjectDocument),
  );
}
