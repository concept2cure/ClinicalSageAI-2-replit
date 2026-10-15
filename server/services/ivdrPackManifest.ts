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
import { stableStringify as sharedStableStringify } from '../../shared/canonical-json.js';

// ── Stable stringify (deterministic JSON) ───────────────────────────────────

/**
 * Deterministic serialization for the pack's manifest and snapshot hashes.
 *
 * Delegates to the one canonicalizer (ledger L46). This module and
 * `ivdr-pack-worker.ts` carried byte-identical private copies of it and hash
 * the SAME manifest from the service and the worker, so they are re-pointed in
 * one commit — a split migration would make the two halves of one pack disagree,
 * which is the failure the row is about.
 *
 * Free to re-point: `manifest_sha256` is written and read back for display, and
 * nothing recomputes it to compare. A regenerated pack gets a different hash
 * than it would have before, which is a discontinuity in a displayed value, not
 * a broken check.
 */
function stableStringify(value: unknown): string {
  return sharedStableStringify(value);
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
  /**
   * Set when the provenance read FAILED: the chain is then absent because it
   * could not be read, not because no AI was used. buildIvdrPackContent folds it
   * into readFailures as section 'provenanceChain'.
   */
  provenanceReadFailure?: { error: string };
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
  const claimsData: ManifestV1['binderEvidence']['claims'] = [];
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

  // ── Fetch AI provenance chain for THIS project ─────────────────────────
  // 2026-10-15: keyed on `gr.organization_id` — 20 runs (by random uuid) and
  // every AI claim of the organisation, none scoped to this pack — and
  // ai_generation_runs has no such column, so every build raised 42703 and an
  // empty catch dropped the chain: §6 read "not available" whether AI was unused
  // or unreadable. A run's tenant and project live on its retrieval run; the
  // runs and claims below are this project's, and a failed read is recorded.
  let provenanceChain: ManifestV1['provenanceChain'];
  let provenanceReadFailure: ManifestV1['provenanceReadFailure'];
  try {
    // Every retrieval-grounded generation run recorded against this project
    const genResult = await pool.query(
      `SELECT gr.id AS gen_id, rr.id AS ret_id, rr.snapshot_hash_sha256
       FROM ai_generation_runs gr
       JOIN ai_retrieval_runs rr ON rr.id = gr.retrieval_run_id
       WHERE rr.organization_id = $1 AND rr.project_id = $2
       ORDER BY gr.created_at, gr.id`,
      [organizationId, projectId]
    );

    // AI claim stats over the same runs
    const claimStatsResult = await pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE ac.status = 'SUPPORTED') AS supported,
         COUNT(*) FILTER (WHERE ac.status = 'WEAK') AS weak,
         COUNT(*) FILTER (WHERE ac.status = 'UNSUPPORTED') AS unsupported,
         COUNT(*) FILTER (WHERE jsonb_array_length(ac.verifier_flags) > 0) AS flagged
       FROM ai_claims ac
       JOIN ai_generation_runs gr ON gr.id = ac.generation_run_id
       JOIN ai_retrieval_runs rr ON rr.id = gr.retrieval_run_id
       WHERE rr.organization_id = $1 AND rr.project_id = $2`,
      [organizationId, projectId]
    );

    // Top verifier rules over the same claims
    const topRulesResult = await pool.query(
      `SELECT flag->>'rule' AS rule, COUNT(*) AS cnt
       FROM ai_claims ac
       JOIN ai_generation_runs gr ON gr.id = ac.generation_run_id
       JOIN ai_retrieval_runs rr ON rr.id = gr.retrieval_run_id,
       LATERAL jsonb_array_elements(ac.verifier_flags) AS flag
       WHERE rr.organization_id = $1 AND rr.project_id = $2
       GROUP BY flag->>'rule'
       ORDER BY cnt DESC, flag->>'rule'
       LIMIT 5`,
      [organizationId, projectId]
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    provenanceReadFailure = { error: message.slice(0, 200) };
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
    ...(provenanceReadFailure ? { provenanceReadFailure } : {}),
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
