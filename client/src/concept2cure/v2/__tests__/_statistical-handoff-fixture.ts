/** Wire-contract fixture only; native/server tests verify these persisted facts. */
import { renderSafeMarkdown } from '../../components/ana/renderSafeMarkdown';

export const isStatisticalSave = (url: unknown, body: unknown): body is Record<string, any> =>
  url === '/api/ana-biostats/document' && !!body && typeof body === 'object' && (body as Record<string, unknown>).action === 'save_to_authoring';

export function statisticalSaveReceipt(body: Record<string, any>, docId = 'D-9', options: { organizationId?: number; governance?: unknown } = {}) {
  const basis = body.basis;
  const origin = {
    organizationId: options.organizationId ?? 1, programId: body.programId, projectId: 42, documentType: body.documentType,
    basis, contentSha256: 'a'.repeat(64),
    computation: { execution: 'server_recomputed', computationInputs: body.input, inputsSha256: 'b'.repeat(64), outputsSha256: 'c'.repeat(64) },
    design: basis.kind === 'study_design' ? { studyId: basis.studyId, studyRef: 11, adaptedInputsSha256: basis.designInputsSha256 } : null,
    sizingRun: basis.kind === 'worked_example' ? { state: 'not_applicable' }
      : basis.sizingRunId ? { state: 'recorded', runId: basis.sizingRunId } : { state: 'none' },
  };
  const title = body.documentType + (basis.kind === 'worked_example' ? ` — worked example: ${basis.label}` : '');
  const doc = { id: docId, title, client_program_id: body.programId, provenance: { source: 'import', statisticalSource: origin } };
  const sections = [{ id: `${docId}-section`, doc_id: docId, code: body.documentType, title, content: renderSafeMarkdown(body.expectedMarkdown) }];
  return { success: true, data: { doc, sections }, governance: options.governance ?? { bound: false, reason: 'Working document' } };
}
