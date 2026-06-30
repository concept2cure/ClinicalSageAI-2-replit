/**
 * @fileoverview Translation Service
 * @module concept2cure/translation/services/translationService
 * @version 1.0.0
 *
 * @description
 * Live service for the translation workstream — projects, per-segment workflow
 * (machine draft → human post-edit → back-translation → approve), and the
 * tenant-scoped DNT / preferred-term glossary.
 *
 * Binds to the /api/translation routes (built in parallel by the API workstream):
 *   POST   /api/translation/projects                          create project
 *   GET    /api/translation/projects                          list projects
 *   GET    /api/translation/projects/:id                       project + segments
 *   POST   /api/translation/projects/:id/segments/draft        machine-draft segments
 *   POST   /api/translation/segments/:id/post-edit             human post-edit
 *   POST   /api/translation/segments/:id/back-translation      run back-translation
 *   POST   /api/translation/segments/:id/approve               approve (terminal)
 *   GET    /api/translation/glossary                           list glossary terms
 *   POST   /api/translation/glossary                           upsert glossary term
 *
 * Mirrors labelingService: every request unwraps the { data, meta } envelope
 * (api-response.ok), throws on the ApiError envelope, and is tenant-scoped
 * server-side via the x-organization-id header apiRequest injects. No mocks.
 */

import { apiRequest, type ApiRequestMethod } from '../../../lib/queryClient';
import type {
  ApproveSegmentRequest,
  ApproveSegmentResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  GlossaryListResponse,
  GlossaryTerm,
  ProjectListResponse,
  RunBackTranslationRequest,
  RunBackTranslationResponse,
  SubmitPostEditRequest,
  SubmitPostEditResponse,
  TranslateDraftRequest,
  TranslateDraftResponse,
  TranslationProject,
  TranslationSegment,
} from '@shared/types/translation';

/**
 * The /api/translation/projects/:id endpoint returns the project (status +
 * server-computed segmentCounts) plus its full ordered segment list. The
 * contract types `CreateProjectResponse = TranslationProject`, so the detail
 * read layers the segments on top for the surface to consume.
 */
export interface TranslationProjectDetail extends TranslationProject {
  segments: TranslationSegment[];
}

/** Upsert payload for a glossary term (create when id is omitted). */
export interface UpsertGlossaryTermRequest
  extends Partial<Pick<GlossaryTerm, 'id'>>,
    Pick<GlossaryTerm, 'sourceTerm' | 'doNotTranslate' | 'category'> {
  targetTerm?: GlossaryTerm['targetTerm'];
  targetLang?: GlossaryTerm['targetLang'];
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class TranslationService {
  private baseUrl = '/api/translation';

  private async request<T>(method: ApiRequestMethod, url: string, body?: unknown): Promise<T> {
    const response = await apiRequest(method, url, body);
    if (response.status === 204) {
      return undefined as T;
    }
    const payload = await response.json().catch(() => ({}));
    if (payload?.error) {
      const err = payload.error;
      throw new Error(typeof err === 'string' ? err : err?.message || 'Translation request failed');
    }
    // Routes wrap their result in the { data, meta } envelope (api-response.ok).
    return (payload?.data ?? payload) as T;
  }

  /** List translation projects. Tenant-scoped server-side. */
  async listProjects(): Promise<ProjectListResponse> {
    const rows = await this.request<ProjectListResponse>('GET', `${this.baseUrl}/projects`);
    return Array.isArray(rows) ? rows : [];
  }

  /** Single project with status + nested segments. */
  async getProject(id: number): Promise<TranslationProjectDetail> {
    return this.request<TranslationProjectDetail>('GET', `${this.baseUrl}/projects/${id}`);
  }

  /** Create a project, seeding its initial source segments. */
  async createProject(data: CreateProjectRequest): Promise<CreateProjectResponse> {
    return this.request<CreateProjectResponse>('POST', `${this.baseUrl}/projects`, data);
  }

  /** Machine-draft pending segments (DRAFT accelerator only — never approvable). */
  async draftSegments(projectId: number, data: TranslateDraftRequest): Promise<TranslateDraftResponse> {
    return this.request<TranslateDraftResponse>(
      'POST',
      `${this.baseUrl}/projects/${projectId}/segments/draft`,
      data,
    );
  }

  /** Submit a human post-edit of a segment → in_progress / review. */
  async submitPostEdit(data: SubmitPostEditRequest): Promise<SubmitPostEditResponse> {
    return this.request<SubmitPostEditResponse>(
      'POST',
      `${this.baseUrl}/segments/${data.segmentId}/post-edit`,
      data,
    );
  }

  /** Run back-translation to produce the evidence required before approval. */
  async runBackTranslation(data: RunBackTranslationRequest): Promise<RunBackTranslationResponse> {
    return this.request<RunBackTranslationResponse>(
      'POST',
      `${this.baseUrl}/segments/${data.segmentId}/back-translation`,
      data,
    );
  }

  /**
   * Approve a segment (terminal). The server rejects with ApiError code
   * 'method_not_approvable' (machine) or 'back_translation_required' (missing
   * evidence); both surface here as a thrown Error.message.
   */
  async approveSegment(data: ApproveSegmentRequest): Promise<ApproveSegmentResponse> {
    return this.request<ApproveSegmentResponse>(
      'POST',
      `${this.baseUrl}/segments/${data.segmentId}/approve`,
      data,
    );
  }

  /** List glossary terms (DNT identifiers + preferred translations). */
  async listGlossary(): Promise<GlossaryListResponse> {
    const rows = await this.request<GlossaryListResponse>('GET', `${this.baseUrl}/glossary`);
    return Array.isArray(rows) ? rows : [];
  }

  /** Create or update a glossary term. */
  async upsertGlossaryTerm(data: UpsertGlossaryTermRequest): Promise<GlossaryTerm> {
    return this.request<GlossaryTerm>('POST', `${this.baseUrl}/glossary`, data);
  }
}

const translationService = new TranslationService();
export default translationService;
