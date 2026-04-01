import crypto from 'node:crypto';
import { getPool } from '../../db';

export async function persistEvidence(params: {
  tenantId: number;
  conversationId?: string;
  messageId?: string;
  sourceProvider: string;
  acquisitionMethod: string;
  url?: string;
  title?: string;
  rawMarkdown?: string;
  rawHtml?: string;
  metadata?: Record<string, unknown>;
}) {
  const pool = getPool();
  const canonicalUrl = params.url
    ? (() => {
        try {
          const u = new URL(params.url);
          u.hash = '';
          return u.toString();
        } catch {
          return params.url;
        }
      })()
    : null;
  const contentHash = crypto
    .createHash('sha256')
    .update(`${params.rawMarkdown || ''}${params.rawHtml || ''}`)
    .digest('hex');

  const existing = await pool.query(
    `SELECT id
       FROM external_evidence_documents
      WHERE tenant_id = $1
        AND canonical_url IS NOT DISTINCT FROM $2
        AND content_hash = $3
      LIMIT 1`,
    [params.tenantId, canonicalUrl, contentHash]
  );
  if (existing.rows[0]?.id) return Number(existing.rows[0].id);

  const result = await pool.query(
    `INSERT INTO external_evidence_documents
      (tenant_id, conversation_id, message_id, source_provider, acquisition_method, url, canonical_url, title, fetched_at, content_hash, raw_markdown, raw_html, metadata_json, parser_version, status, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9,$10,$11,$12,'v1','captured_needs_review',NOW())
     RETURNING id`,
    [
      params.tenantId,
      params.conversationId || null,
      params.messageId || null,
      params.sourceProvider,
      params.acquisitionMethod,
      params.url || null,
      canonicalUrl,
      params.title || null,
      contentHash,
      params.rawMarkdown || null,
      params.rawHtml || null,
      JSON.stringify({ ...(params.metadata || {}), reviewRequired: true }),
    ]
  );

  return result.rows[0]?.id as number;
}
