/**
 * AnA Document Studio — durable draft version store.
 *
 * Persists AnA-authored document drafts to the governed
 * concept2cure_artifacts / concept2cure_artifact_versions tables, replacing the
 * per-session-only `versions` array previously held in the React layer. Each
 * AnA thread keeps a stable lookup key (ana_thread_id + normalized title_slug)
 * so successive rewrites of the same document append as version 2, 3, … on a
 * single artifacts row, giving Document Studio an auditable version history.
 *
 * INSERT pattern mirrors server/services/compute/artifactWriteback.ts
 * (registerArtifactWithGovernance): hardcoded type='regulatory_document' /
 * category='document' (both NOT NULL), both created_at and updated_at written,
 * SHA-256 content hash, same getPool() connection. Both tables have RLS enabled;
 * this is the same pool the writeback path uses successfully.
 */
import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { getPool } from '../../db';

/**
 * Normalize a document title into a stable lookup slug: lowercase, trimmed, and
 * internal whitespace collapsed to single spaces. Pure — no I/O. Used so two
 * drafts whose titles differ only in case/whitespace ('IND Cover Letter' vs
 * 'ind cover letter ') resolve to the same artifacts row and append as versions.
 */
export function normalizeTitleSlug(title: string): string {
  return title.toLowerCase().trim().replace(/\s+/g, ' ');
}

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export interface UpsertDocumentArtifactVersionInput {
  organizationId: number;
  projectId: number;
  userId?: number | null;
  anaThreadId: string;
  title: string;
  content: string;
  documentType?: string;
}

export interface UpsertDocumentArtifactVersionResult {
  created: boolean;
  /** External artifact id (artifact_xxx). */
  artifactId: string;
  version: number;
  contentHash: string;
}

/**
 * Insert the first artifacts row + initial version for a document AnA has not
 * drafted before in this thread. NOT NULL type/category hardcoded per the
 * writeback template. Runs inside the caller's transaction.
 */
async function insertNewArtifact(
  client: PoolClient,
  input: UpsertDocumentArtifactVersionInput,
  ctx: { titleSlug: string; contentHash: string; userId: number | null; now: Date }
): Promise<UpsertDocumentArtifactVersionResult> {
  const externalArtifactId = `artifact_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const artifactInsert = await client.query(
    `INSERT INTO concept2cure_artifacts (
      artifact_id, project_id, organization_id, type, category, title, content,
      content_hash, version, ana_thread_id, title_slug, status, created_by_id,
      metadata, created_at, updated_at
    ) VALUES ($1,$2,$3,'regulatory_document','document',$4,$5,$6,1,$7,$8,'draft',$9,$10,$11,$11)
    RETURNING id, artifact_id, version`,
    [
      externalArtifactId,
      input.projectId,
      input.organizationId,
      input.title,
      input.content,
      ctx.contentHash,
      input.anaThreadId,
      ctx.titleSlug,
      ctx.userId,
      JSON.stringify({
        source: 'ana_document_studio',
        anaThreadId: input.anaThreadId,
        documentType: input.documentType ?? null,
        governed: true,
      }),
      ctx.now,
    ]
  );
  const artifactPk = artifactInsert.rows[0].id as number;
  await client.query(
    `INSERT INTO concept2cure_artifact_versions (
      artifact_id, organization_id, version, content, content_hash,
      change_description, created_by_id, created_at, updated_at
    ) VALUES ($1,$2,1,$3,$4,$5,$6,$7,$7)`,
    [
      artifactPk,
      input.organizationId,
      input.content,
      ctx.contentHash,
      'Initial AnA Document Studio draft',
      ctx.userId,
      ctx.now,
    ]
  );
  return {
    created: true,
    artifactId: artifactInsert.rows[0].artifact_id as string,
    version: 1,
    contentHash: ctx.contentHash,
  };
}

/**
 * Upsert a draft into the governed artifact version history for an AnA thread.
 *
 * Transactional. Finds the artifacts row by
 * (organization_id, project_id, ana_thread_id, title_slug) with `FOR UPDATE` to
 * serialize concurrent same-thread drafts against the
 * UNIQUE(artifact_id, version) constraint (c2c_artifact_unique_version). If no
 * row exists, inserts a new artifacts row at version 1. De-dupes on SHA-256
 * content_hash: when the latest version's hash equals the new content's hash it
 * returns a no-op `{ created: false }`. Otherwise appends a new
 * concept2cure_artifact_versions row at max(version)+1 and bumps the artifacts
 * row's version/content/content_hash/updated_at.
 */
export async function upsertDocumentArtifactVersion(
  input: UpsertDocumentArtifactVersionInput
): Promise<UpsertDocumentArtifactVersionResult> {
  const pool = getPool();
  const client = await pool.connect();
  const now = new Date();
  const titleSlug = normalizeTitleSlug(input.title);
  const contentHash = sha256(input.content);
  const userId = typeof input.userId === 'number' ? input.userId : null;

  try {
    await client.query('BEGIN');

    // Serialize concurrent same-thread drafts on the artifacts row so two
    // requests cannot both compute the same max(version)+1 and collide on
    // UNIQUE(artifact_id, version). FOR UPDATE on the SELECT below is mandatory.
    const existing = await client.query(
      `SELECT id, artifact_id, version, content_hash
         FROM concept2cure_artifacts
        WHERE organization_id = $1
          AND project_id = $2
          AND ana_thread_id = $3
          AND title_slug = $4
        ORDER BY id ASC
        LIMIT 1
        FOR UPDATE`,
      [input.organizationId, input.projectId, input.anaThreadId, titleSlug]
    );

    if (existing.rows.length === 0) {
      // First draft of this document in this thread.
      const result = await insertNewArtifact(client, input, {
        titleSlug,
        contentHash,
        userId,
        now,
      });
      await client.query('COMMIT');
      return result;
    }

    const row = existing.rows[0];
    const artifactPk = row.id as number;
    const externalArtifactId = row.artifact_id as string;
    const currentVersion = Number(row.version);

    // De-dupe: an identical re-emit of the latest content is a no-op so flipping
    // back and forth in the editor doesn't manufacture phantom versions.
    if (row.content_hash === contentHash) {
      await client.query('COMMIT');
      return {
        created: false,
        artifactId: externalArtifactId,
        version: currentVersion,
        contentHash,
      };
    }

    // Append the next version. Use max(version)+1 (not the cached artifacts.version)
    // so a partially-migrated row can't reuse an existing version number.
    const maxRes = await client.query(
      `SELECT COALESCE(MAX(version), 0) AS max_version
         FROM concept2cure_artifact_versions
        WHERE artifact_id = $1`,
      [artifactPk]
    );
    const nextVersion = Number(maxRes.rows[0].max_version) + 1;

    await client.query(
      `INSERT INTO concept2cure_artifact_versions (
        artifact_id, organization_id, version, content, content_hash,
        change_description, created_by_id, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
      [
        artifactPk,
        input.organizationId,
        nextVersion,
        input.content,
        contentHash,
        `AnA Document Studio revision (v${nextVersion})`,
        userId,
        now,
      ]
    );

    await client.query(
      `UPDATE concept2cure_artifacts
          SET version = $1, content = $2, content_hash = $3, updated_at = $4
        WHERE id = $5`,
      [nextVersion, input.content, contentHash, now, artifactPk]
    );

    await client.query('COMMIT');
    return {
      created: true,
      artifactId: externalArtifactId,
      version: nextVersion,
      contentHash,
    };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* swallow rollback error; preserve original */ }
    throw error;
  } finally {
    client.release();
  }
}

export interface DocumentArtifactVersion {
  version: number;
  content: string;
  contentHash: string;
  changeDescription: string | null;
  createdAt: Date;
}

/**
 * List the full, org-scoped version history for a document artifact, oldest →
 * newest. Joins concept2cure_artifacts → concept2cure_artifact_versions and
 * returns each version's full content. Returns [] when the artifact does not
 * belong to the given organization (tenant isolation).
 */
export async function listDocumentArtifactVersions(params: {
  artifactExternalId: string;
  organizationId: number;
}): Promise<DocumentArtifactVersion[]> {
  const pool = getPool();
  const res = await pool.query(
    `SELECT v.version, v.content, v.content_hash, v.change_description, v.created_at
       FROM concept2cure_artifacts a
       JOIN concept2cure_artifact_versions v ON v.artifact_id = a.id
      WHERE a.artifact_id = $1
        AND a.organization_id = $2
        AND v.organization_id = $2
      ORDER BY v.version ASC`,
    [params.artifactExternalId, params.organizationId]
  );
  return res.rows.map(r => ({
    version: Number(r.version),
    content: r.content as string,
    contentHash: r.content_hash as string,
    changeDescription: (r.change_description ?? null) as string | null,
    createdAt: r.created_at as Date,
  }));
}
