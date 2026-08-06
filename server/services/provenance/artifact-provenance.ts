/**
 * Canonical artifact-provenance primitive.
 *
 * Every write to concept2cure_artifacts is a document the platform builds, and
 * every such write must emit a provenance event so the lifecycle of that
 * document — where it came from, how it was transformed, who approved it, when
 * it was exported — is uniformly recorded across the ENTIRE application.
 *
 * Before this, ~16 of ~22 artifact producers wrote content with no provenance
 * event, each in its own inline style (some Drizzle, some raw SQL), because the
 * one good emitter (routes/concept2cure.ts:emitProvenanceEvent) was private and
 * Drizzle-bound, so raw-SQL/transactional producers could not share it. This is
 * the single primitive they all call instead — exec-based like
 * enforceAuthorLineage, so it enlists in the caller's transaction and the
 * artifact and its provenance commit together (or roll back together).
 *
 * @module server/services/provenance/artifact-provenance
 */
import crypto from 'node:crypto';

/** Minimal executor: a pg Pool/PoolClient, or any {query} — lets the caller
 *  enlist the provenance write in the same transaction as the artifact write. */
export interface ProvenanceExec {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
}

/** The lifecycle stages a built document passes through (matches the CHECK
 *  vocabulary documented on concept2cure_provenance_events.event_type). */
export type ProvenanceEventType =
  | 'source_input'
  | 'generation'
  | 'transformation'
  | 'edit'
  | 'approval'
  | 'export'
  | 'placement';

export interface ArtifactProvenanceInput {
  /** concept2cure_artifacts.id — the numeric PK, not the external artifact_id. */
  artifactId: number;
  organizationId: number;
  eventType: ProvenanceEventType;
  /** Specific action within the stage, e.g. 'ai_generate', 'human_edit',
   *  'template_apply', 'docx_export', 'cmc_data_load'. */
  eventAction: string;
  artifactVersionId?: number | null;
  actorId?: number | null;
  actorName?: string | null;
  actorEmail?: string | null;
  details?: Record<string, unknown>;
  /** The upstream artifact this one was derived/transformed from, if any. */
  sourceArtifactId?: number | null;
  sourceDescription?: string | null;
  backendRoute?: string | null;
  backendService?: string | null;
  ipAddress?: string | null;
}

/**
 * Append one provenance event for an artifact. Append-only — events are never
 * modified or deleted. Throws on failure so a caller that runs this inside the
 * artifact's transaction fails closed (content without provenance never
 * commits); a caller that genuinely wants best-effort can catch. `details`
 * defaults to `{}`.
 */
export async function recordArtifactProvenance(
  exec: ProvenanceExec,
  input: ArtifactProvenanceInput,
): Promise<string> {
  const eventId = `prov_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  await exec.query(
    `INSERT INTO concept2cure_provenance_events
       (event_id, artifact_id, artifact_version_id, organization_id, event_type, event_action,
        actor_id, actor_name, actor_email, details, source_artifact_id, source_description,
        backend_route, backend_service, ip_address)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15)`,
    [
      eventId,
      input.artifactId,
      input.artifactVersionId ?? null,
      input.organizationId,
      input.eventType,
      input.eventAction,
      input.actorId ?? null,
      input.actorName ?? null,
      input.actorEmail ?? null,
      JSON.stringify(input.details ?? {}),
      input.sourceArtifactId ?? null,
      input.sourceDescription ?? null,
      input.backendRoute ?? null,
      input.backendService ?? null,
      input.ipAddress ?? null,
    ],
  );
  return eventId;
}
