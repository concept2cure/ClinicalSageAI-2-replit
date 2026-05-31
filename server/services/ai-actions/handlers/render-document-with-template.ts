/**
 * Render Document With Template Handler
 *
 * AnA-callable counterpart to `POST /api/c2c/templates/:id/render`. Mirrors the
 * `export_document` handler's pattern: it verifies the template exists
 * (org-scoped) and returns the render URL + payload the client uses to trigger
 * the actual .docx / .pdf download — binary bytes are streamed by the REST
 * route, not embedded in the action envelope.
 *
 * Target:
 *   targetId : the template id (tpl_…)
 * Payload:
 *   format?   : 'docx' | 'pdf' (default 'docx')
 *   document  : DocxInput-shaped { metadata, sections } to render
 */

import { registerActionHandler } from '../action-registry';
import { getTemplate } from '../../templates';
import type {
  AIActionHandler,
  AIActionRequest,
  AIActionResponse,
  AIActionExecutionContext,
  AIActionError,
} from '../../../../shared/types/ai-actions';

const handler: AIActionHandler = {
  actionType: 'render_document_with_template',

  validate(request: AIActionRequest): AIActionError[] {
    const errors: AIActionError[] = [];
    const templateId = request.targetId ?? request.payload?.templateId;
    if (!templateId) {
      errors.push({ code: 'MISSING_TARGET', message: 'targetId (template id) is required' });
    }
    const format = (request.payload?.format as string) ?? 'docx';
    if (!['docx', 'pdf'].includes(format)) {
      errors.push({ code: 'BAD_FORMAT', message: 'format must be "docx" or "pdf"' });
    }
    return errors;
  },

  async execute(
    request: AIActionRequest,
    ctx: AIActionExecutionContext,
  ): Promise<AIActionResponse> {
    const templateId = String(request.targetId ?? request.payload?.templateId);
    const format = ((request.payload?.format as string) ?? 'docx') as 'docx' | 'pdf';

    const record = await getTemplate(ctx.user.organizationId, templateId);

    const provenance = {
      actionId: ctx.actionId,
      timestamp: new Date().toISOString(),
      userId: ctx.user.userId,
      organizationId: ctx.user.organizationId,
      projectId: request.projectId,
      sourceSurface: request.sourceSurface,
    };

    if (!record) {
      return {
        success: false,
        actionType: 'render_document_with_template',
        status: 'failed',
        result: null,
        createdObjects: [],
        updatedObjects: [],
        warnings: [],
        errors: [{ code: 'TEMPLATE_NOT_FOUND', message: `No template ${templateId}` }],
        provenance,
        nextSuggestedActions: [],
      };
    }

    const renderUrl = `/api/c2c/templates/${templateId}/render`;

    return {
      success: true,
      actionType: 'render_document_with_template',
      status: 'completed',
      result: {
        templateId,
        templateName: record.name,
        format,
        renderUrl,
        renderPayload: { format, document: request.payload?.document ?? null },
        note: 'POST renderPayload to renderUrl to download the produced file.',
      },
      createdObjects: [],
      updatedObjects: [{ type: 'template', id: templateId, title: record.name, status: 'used' }],
      warnings: request.payload?.document ? [] : ['No document payload supplied; provide { metadata, sections } to render.'],
      errors: [],
      provenance,
      nextSuggestedActions: [],
    };
  },
};

registerActionHandler(handler);

export default handler;
