/**
 * Artifact Test Driver — Intent-Driven
 *
 * Models artifact state and versioning as business operations.
 */

import { createHash } from 'crypto';
import type { ResolutionTestState, TestArtifact, TestArtifactVersion } from './resolution-test-state';

export class ArtifactDriver {
  constructor(private state: ResolutionTestState) {}

  /**
   * Get an artifact's current status.
   */
  getStatus(organizationId: number, artifactId: string): string {
    const artifact = this.state.artifacts.find(
      a => a.id === artifactId && a.organizationId === organizationId
    );
    return artifact?.status ?? 'unknown';
  }

  /**
   * Stage a rewrite: create a new version with content.
   * Returns false if artifact doesn't exist.
   */
  stageRewrite(params: {
    organizationId: number;
    artifactId: string;
    content: string;
    userId: number;
    bundleId: string;
    planId?: string;
  }): boolean {
    const artifact = this.state.artifacts.find(
      a => a.id === params.artifactId && a.organizationId === params.organizationId
    );
    if (!artifact) return false;

    const maxVersion = artifact.versions.length > 0
      ? Math.max(...artifact.versions.map(v => v.version))
      : 0;

    // Check for duplicate version (race condition guard)
    const nextVersion = maxVersion + 1;
    const duplicateExists = artifact.versions.some(v => v.version === nextVersion);
    if (duplicateExists) return false;

    const version: TestArtifactVersion = {
      artifactId: params.artifactId,
      version: nextVersion,
      content: params.content,
      contentHash: createHash('sha256').update(params.content).digest('hex'),
      changeDescription: `Resolution rewrite via bundle ${params.bundleId}${params.planId ? ` (plan ${params.planId})` : ''}`,
      createdById: params.userId,
      createdAt: new Date(),
    };

    artifact.versions.push(version);
    return true;
  }

  /**
   * Flag an artifact for review (set status to 'review' if currently draft).
   */
  flagForReview(organizationId: number, artifactId: string): void {
    const artifact = this.state.artifacts.find(
      a => a.id === artifactId && a.organizationId === organizationId
    );
    if (artifact && artifact.status === 'draft') {
      artifact.status = 'review';
    }
  }

  /**
   * Mark an artifact as archived (superseded).
   */
  markArchived(organizationId: number, artifactId: string): void {
    const artifact = this.state.artifacts.find(
      a => a.id === artifactId && a.organizationId === organizationId
    );
    if (artifact) {
      artifact.status = 'archived';
    }
  }

  /**
   * Get a document's current status.
   */
  getDocumentStatus(organizationId: number, documentId: string): string {
    const doc = this.state.documents.find(
      d => d.id === documentId && d.organizationId === organizationId
    );
    return doc?.status ?? 'unknown';
  }
}
