/**
 * Extract Template From Upload Handler
 *
 * AnA-callable counterpart to the `/api/c2c/templates/from-upload` endpoint.
 * After a paperclip upload lands a file in the project vault, AnA can call this
 * to "recreate the template" — it reads the stored bytes, reconstructs a
 * TemplateSpec (fonts, margins, logo, header/footer), and (by default) saves it
 * so future documents can be produced in the client's exact format.
 *
 * Payload:
 *   vaultVersionId : string  (required) — the stored file to read
 *   fileName?      : string             — overrides the stored filename
 *   name?          : string             — template name (defaults to file name)
 *   projectId?     : string             — project scope (NULL ⇒ org-wide)
 *   save?          : boolean (default true) — persist, or preview only
 */

import { registerActionHandler } from '../action-registry';
import { getStorageProvider } from '../../storage';
import { extractTemplateFromFile, createTemplate } from '../../templates';
import type {
  AIActionHandler,
  AIActionRequest,
  AIActionResponse,
  AIActionExecutionContext,
  AIActionError,
} from '../../../../shared/types/ai-actions';

const handler: AIActionHandler = {
  actionType: 'extract_template_from_upload',

  validate(request: AIActionRequest): AIActionError[] {
    const errors: AIActionError[] = [];
    if (!request.payload?.vaultVersionId || typeof request.payload.vaultVersionId !== 'string') {
      errors.push({ code: 'MISSING_FILE', message: 'payload.vaultVersionId is required' });
    }
    return errors;
  },

  async execute(
    request: AIActionRequest,
    ctx: AIActionExecutionContext,
  ): Promise<AIActionResponse> {
    const vaultVersionId = String(request.payload.vaultVersionId);
    const save = request.payload.save !== false;

    const storage = getStorageProvider();
    const file = await storage.get(vaultVersionId);

    const base = {
      actionType: 'extract_template_from_upload' as const,
      createdObjects: [],
      updatedObjects: [],
      provenance: {
        actionId: ctx.actionId,
        timestamp: new Date().toISOString(),
        userId: ctx.user.userId,
        organizationId: ctx.user.organizationId,
        projectId: request.projectId,
        sourceSurface: request.sourceSurface,
      },
      nextSuggestedActions: [],
    };

    if (!file) {
      return {
        ...base,
        success: false,
        status: 'failed',
        result: null,
        warnings: [],
        errors: [
          {
            code: 'FILE_NOT_FOUND',
            message: `No stored file for vaultVersionId ${vaultVersionId}`,
          },
        ],
      };
    }

    const fileName =
      (typeof request.payload.fileName === 'string' && request.payload.fileName) ||
      file.filename ||
      'upload.docx';

    const extracted = await extractTemplateFromFile(file.bytes, fileName, file.mime);

    if (!save) {
      return {
        ...base,
        success: true,
        status: 'completed',
        result: {
          saved: false,
          spec: extracted.spec,
          confidence: extracted.confidence,
          warnings: extracted.warnings,
        },
        warnings: extracted.warnings,
        errors: [],
      };
    }

    const name =
      (typeof request.payload.name === 'string' && request.payload.name.trim()) ||
      fileName.replace(/\.(docx|pdf)$/i, '');

    const record = await createTemplate({
      orgId: ctx.user.organizationId,
      userId: ctx.user.userId,
      name,
      projectId: typeof request.payload.projectId === 'string' ? request.payload.projectId : null,
      spec: extracted.spec,
      sourceFileName: fileName,
      sourceFileType: /\.pdf$/i.test(fileName) ? 'pdf' : 'docx',
      extractionConfidence: extracted.confidence,
      extractionWarnings: extracted.warnings,
    });

    return {
      ...base,
      success: true,
      status: 'completed',
      result: {
        saved: true,
        templateId: record.id,
        name: record.name,
        confidence: extracted.confidence,
        warnings: extracted.warnings,
        spec: record.spec,
      },
      createdObjects: [{ type: 'template', id: record.id, title: record.name, status: 'extracted' }],
      warnings: extracted.warnings,
      errors: [],
      nextSuggestedActions: [
        {
          actionType: 'render_document_with_template',
          label: 'Produce a document in this template',
          description: 'Render a Word or PDF document using the formatting just recreated.',
          payload: { templateId: record.id },
        },
      ],
    };
  },
};

registerActionHandler(handler);

export default handler;
