/** JSON chat's request boundary over the existing saved-reference resolver. */
import type { Request } from 'express';
import { requestPgClient } from '../../db/requestDb';
import type { AdmittedAnaProjectScope } from '../../services/ana/project-scope-admission';
import {
  openDocumentPromptContexts,
  selectAuthoringContext,
  withTimeout,
} from '../../services/ana-ri/chat-context-builder';
import {
  OPEN_DOCUMENT_UNREAD,
  openDocumentFields,
  resolveOpenDocument,
  withStatedDocumentType,
} from '../../services/ana-ri/open-document';

/** A complete authoring identity takes precedence; never fill its missing IDs from another channel. */
export async function jsonOpenDocumentContext(
  req: Request,
  organizationId: number | null,
  userId: number,
  project: AdmittedAnaProjectScope
) {
  const authoringContext = selectAuthoringContext(req.body.authoring_context, req.body.context);
  const [settled] = await Promise.allSettled([
    withTimeout(
      resolveOpenDocument({
        authoringContext: withStatedDocumentType(authoringContext, req.body.document_context),
        organizationId,
        access: { getClient: () => requestPgClient(req), userId, project },
      }),
      3000,
      OPEN_DOCUMENT_UNREAD
    ),
  ]);
  const fields = openDocumentFields(settled);
  const contexts = openDocumentPromptContexts(fields, authoringContext, req.body.document_context);
  return { ...fields, ...contexts, artifactStatus: contexts.authoringContext?.artifactStatus };
}
