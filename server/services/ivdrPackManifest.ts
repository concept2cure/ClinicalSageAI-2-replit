/**
 * IVDR Pack Manifest Generator
 *
 * Builds deterministic manifest.json with:
 *   - Pack metadata (org, project, version, type)
 *   - Snapshot hash reference
 *   - Binder evidence map (vault + atom sources)
 *   - AI provenance chain IDs (retrieval, generation, snapshot)
 *   - Verifier summary (supportedClaimRate, flags)
 *   - Artifact hashes
 *   - Build metadata (timestamp, git commit)
 *
 * @module server/services/ivdrPackManifest
 */

import { createHash } from 'crypto';
import { Pool } from 'pg';

// ── Stable stringify (deterministic JSON) ───────────────────────────────────

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') {
    if (typeof value === 'number' && !isFinite(value)) return 'null';
    return String(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (typeof value === 'object') {
    if (typeof (value as any).toJSON === 'function')
      return stableStringify((value as any).toJSON());
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const pairs: string[] = [];
    for (const key of keys) {
      const v = (value as Record<string, unknown>)[key];
      if (v === undefined) continue;
      pairs.push(JSON.stringify(key) + ':' + stableStringify(v));
    }
    return '{' + pairs.join(',') + '}';
  }
  return 'null';
}

function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface ManifestV1 {
  manifestVersion: '1.0';
  generatedAt: string;
  pack: {
    packId: string;
    packType: string;
    packVersion: number;
    organizationId: number;
    projectId: string;
    status: string;
  };
  hashes: {
    snapshotHashSha256: string;
    manifestHashSha256: string;
    artifactHashes?: Record<string, string>; // filled after artifact generation
  };
  binderEvidence: {
    totalClaims: number;
    requiredClaims: number;
    approvedClaims: number;
    claims: Array<{
      claimId: string;
      claimKey: string;
      title: string;
      status: string;
      required: boolean;
      evidenceCount: number;
      evidence: Array<{
        evidenceId: string;
        sourceType: string;
        vaultFileId?: string;
        vaultVersionId?: string;
        sourceAtomId?: string;
        retrievalChunkId?: string;
        excerptPreview?: string;
        excerptHashSha256?: string;
      }>;
    }>;
  };
  provenanceChain?: {
    retrievalRunIds: string[];
    generationRunIds: string[];
    snapshotHashes: string[];
    aiClaimSummary?: {
      totalClaims: number;
      supported: number;
      weak: number;
      unsupported: number;
      supportedClaimRate: number;
      flaggedCount: number;
      topRules: string[];
    };
  };
  buildMetadata: {
    gitCommit?: string;
    nodeVersion: string;
    builderVersion: string;
  };
}

// ── Build Manifest ──────────────────────────────────────────────────────────

export interface BuildManifestOpts {
  pool: Pool;
  packId: string;
  packType: string;
  packVersion: number;
  organizationId: number;
  projectId: string;
  snapshotHashSha256: string;
  claimIds: string[];
}

/**
 * Build a complete manifest.json with provenance chain + verifier summary.
 */
export async function buildManifestV1(opts: BuildManifestOpts): Promise<{
  manifest: ManifestV1;
  manifestJson: string;
  manifestHash: string;
}> {
  const {
    pool,
    packId,
    packType,
    packVersion,
    organizationId,
    projectId,
    snapshotHashSha256,
    claimIds,
  } = opts;

  // ── Fetch claims + evidence ────────────────────────────────────────────
  let claimsData: ManifestV1['binderEvidence']['claims'] = [];
  let approvedCount = 0;
  let requiredCount = 0;

  if (claimIds.length > 0) {
    const claimsResult = await pool.query(
      `SELECT id, claim_key, title, status, required_for_pack
       FROM ivdr_binder_claims
       WHERE id = ANY($1)
       ORDER BY claim_key`,
      [claimIds]
    );

    for (const claim of claimsResult.rows) {
      if (claim.status === 'APPROVED') approvedCount++;
      if (claim.required_for_pack) requiredCount++;

      // Fetch evidence for this claim (including source_type fields)
      const evidenceResult = await pool.query(
        `SELECT id, source_type, vault_file_id, vault_version_id,
                source_atom_id, source_retrieval_chunk_id,
                excerpt_preview, excerpt_hash_sha256
         FROM ivdr_binder_evidence
         WHERE claim_id = $1 AND removed_at IS NULL
         ORDER BY created_at`,
        [claim.id]
      );

      claimsData.push({
        claimId: claim.id,
        claimKey: claim.claim_key,
        title: claim.title,
        status: claim.status,
        required: claim.required_for_pack,
        evidenceCount: evidenceResult.rows.length,
        evidence: evidenceResult.rows.map((ev: any) => ({
          evidenceId: ev.id,
          sourceType: ev.source_type || 'vault',
          ...(ev.vault_file_id ? { vaultFileId: ev.vault_file_id } : {}),
          ...(ev.vault_version_id ? { vaultVersionId: ev.vault_version_id } : {}),
          ...(ev.source_atom_id ? { sourceAtomId: ev.source_atom_id } : {}),
          ...(ev.source_retrieval_chunk_id
            ? { retrievalChunkId: ev.source_retrieval_chunk_id }
            : {}),
          ...(ev.excerpt_preview ? { excerptPreview: ev.excerpt_preview.substring(0, 200) } : {}),
          ...(ev.excerpt_hash_sha256 ? { excerptHashSha256: ev.excerpt_hash_sha256 } : {}),
        })),
      });
    }
  }

  // ── Fetch AI provenance chain (if available) ───────────────────────────
  let provenanceChain: ManifestV1['provenanceChain'];
  try {
    // Get recent generation runs for this org
    const genResult = await pool.query(
      `SELECT DISTINCT gr.id AS gen_id, rr.id AS ret_id, rr.snapshot_hash_sha256
       FROM ai_generation_runs gr
       JOIN ai_retrieval_runs rr ON rr.id = gr.retrieval_run_id
       WHERE gr.organization_id = $1
       ORDER BY gr.id DESC
       LIMIT 20`,
      [organizationId]
    );

    // Get AI claim stats
    const claimStatsResult = await pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status = 'SUPPORTED') AS supported,
         COUNT(*) FILTER (WHERE status = 'WEAK') AS weak,
         COUNT(*) FILTER (WHERE status = 'UNSUPPORTED') AS unsupported,
         COUNT(*) FILTER (WHERE jsonb_array_length(verifier_flags) > 0) AS flagged
       FROM ai_claims ac
       JOIN ai_generation_runs gr ON gr.id = ac.generation_run_id
       WHERE gr.organization_id = $1`,
      [organizationId]
    );

    // Get top verifier rules
    const topRulesResult = await pool.query(
      `SELECT flag->>'rule' AS rule, COUNT(*) AS cnt
       FROM ai_claims ac
       JOIN ai_generation_runs gr ON gr.id = ac.generation_run_id,
       LATERAL jsonb_array_elements(ac.verifier_flags) AS flag
       WHERE gr.organization_id = $1
       GROUP BY flag->>'rule'
       ORDER BY cnt DESC
       LIMIT 5`,
      [organizationId]
    );

    const stats = claimStatsResult.rows[0] || {};
    const total = parseInt(stats.total || '0', 10);

    if (genResult.rows.length > 0 || total > 0) {
      provenanceChain = {
        retrievalRunIds: [...new Set(genResult.rows.map((r: any) => r.ret_id))],
        generationRunIds: genResult.rows.map((r: any) => r.gen_id),
        snapshotHashes: [
          ...new Set(genResult.rows.map((r: any) => r.snapshot_hash_sha256).filter(Boolean)),
        ],
        ...(total > 0
          ? {
              aiClaimSummary: {
                totalClaims: total,
                supported: parseInt(stats.supported || '0', 10),
                weak: parseInt(stats.weak || '0', 10),
                unsupported: parseInt(stats.unsupported || '0', 10),
                supportedClaimRate: total > 0 ? parseInt(stats.supported || '0', 10) / total : 0,
                flaggedCount: parseInt(stats.flagged || '0', 10),
                topRules: topRulesResult.rows.map((r: any) => r.rule),
              },
            }
          : {}),
      };
    }
  } catch {
    // AI provenance tables may not exist yet — skip gracefully
  }

  // ── Build manifest ─────────────────────────────────────────────────────

  const manifest: ManifestV1 = {
    manifestVersion: '1.0',
    generatedAt: new Date().toISOString(),
    pack: {
      packId,
      packType,
      packVersion,
      organizationId,
      projectId,
      status: 'BUILDING',
    },
    hashes: {
      snapshotHashSha256,
      manifestHashSha256: '', // filled below
    },
    binderEvidence: {
      totalClaims: claimsData.length,
      requiredClaims: requiredCount,
      approvedClaims: approvedCount,
      claims: claimsData,
    },
    ...(provenanceChain ? { provenanceChain } : {}),
    buildMetadata: {
      gitCommit: process.env.GIT_COMMIT || process.env.COMMIT_SHA || undefined,
      nodeVersion: process.version,
      builderVersion: '1.0.0',
    },
  };

  // Compute manifest hash (with manifestHashSha256 as empty so it's deterministic)
  const manifestJson = stableStringify(manifest);
  const manifestHash = sha256(manifestJson);

  // Set the hash in the manifest
  manifest.hashes.manifestHashSha256 = manifestHash;

  // Final JSON (pretty-printed for human readability)
  const finalJson = JSON.stringify(manifest, null, 2);

  return { manifest, manifestJson: finalJson, manifestHash };
}
