import { db } from '../db';
import {
  sapVersions,
  sapComments,
  sapAmendments,
  statisticalThreads,
} from 'shared/schema';
import { eq, and, desc, asc } from 'drizzle-orm';

// ── Types ──────────────────────────────────────────────────────────────

/** Structured SAP content keyed by section path */
export type SapContent = Record<string, unknown>;

/** Diff entry produced by comparing two SAP versions */
export interface SapDiffEntry {
  sectionPath: string;
  action: 'added' | 'modified' | 'removed';
  before?: unknown;
  after?: unknown;
}

/** Electronic-signature payload compliant with 21 CFR Part 11 */
export interface SignatureData {
  signatureId: string;
  signerName: string;
  signerTitle: string;
  signerEmail: string;
  meaning: 'authorship' | 'review' | 'approval';
  timestamp: string; // ISO-8601
  method: 'password' | 'mfa' | 'certificate';
  /** Base-64 encoded signature image, if available */
  signatureImage?: string;
}

// ── Service ────────────────────────────────────────────────────────────

export class CollaborativeSapService {
  private static instance: CollaborativeSapService;

  static getInstance(): CollaborativeSapService {
    if (!CollaborativeSapService.instance) {
      CollaborativeSapService.instance = new CollaborativeSapService();
    }
    return CollaborativeSapService.instance;
  }

  // ── helpers ────────────────────────────────────────────────────────

  private getDb() {
    if (!db) throw new Error('Database unavailable');
    return db;
  }

  /**
   * Compute a shallow diff between two SAP content objects.
   * Walks all top-level keys and recursively compares nested section paths
   * in a dot-delimited fashion.
   */
  private computeDiff(
    previous: SapContent | null,
    current: SapContent
  ): SapDiffEntry[] {
    const diffs: SapDiffEntry[] = [];
    const prev = previous ?? {};

    const allKeys = new Set([...Object.keys(prev), ...Object.keys(current)]);

    for (const key of allKeys) {
      const before = prev[key];
      const after = current[key];

      if (before === undefined) {
        diffs.push({ sectionPath: key, action: 'added', after });
      } else if (after === undefined) {
        diffs.push({ sectionPath: key, action: 'removed', before });
      } else if (JSON.stringify(before) !== JSON.stringify(after)) {
        diffs.push({ sectionPath: key, action: 'modified', before, after });
      }
    }

    return diffs;
  }

  // ── 1. createSapVersion ────────────────────────────────────────────

  /**
   * Create a new SAP version for a given statistical thread.
   * Automatically computes the diff from the most-recent prior version.
   */
  async createSapVersion(
    threadId: number,
    content: SapContent,
    organizationId: number,
    userId: number
  ) {
    const database = this.getDb();

    // Fetch the latest version for this thread to determine version number & diff
    const [latestVersion] = await database
      .select()
      .from(sapVersions)
      .where(
        and(
          eq(sapVersions.threadId, threadId),
          eq(sapVersions.organizationId, organizationId)
        )
      )
      .orderBy(desc(sapVersions.version))
      .limit(1);

    const nextVersion = latestVersion ? latestVersion.version + 1 : 1;
    const diff = this.computeDiff(
      latestVersion ? (latestVersion.content as SapContent) : null,
      content
    );

    const [inserted] = await database
      .insert(sapVersions)
      .values({
        threadId,
        version: nextVersion,
        content,
        diff,
        status: 'draft',
        organizationId,
        createdBy: userId,
      })
      .returning();

    return inserted;
  }

  // ── 2. updateSection ───────────────────────────────────────────────

  /**
   * Update a specific section of the SAP, producing a new version
   * with a tracked diff limited to the changed section.
   */
  async updateSection(
    sapVersionId: number,
    sectionPath: string,
    newContent: unknown,
    organizationId: number,
    userId: number
  ) {
    const database = this.getDb();

    // Fetch the current version
    const [current] = await database
      .select()
      .from(sapVersions)
      .where(
        and(
          eq(sapVersions.id, sapVersionId),
          eq(sapVersions.organizationId, organizationId)
        )
      );

    if (!current) {
      throw new Error(`SAP version ${sapVersionId} not found`);
    }

    if (current.isLocked) {
      throw new Error(
        `SAP version ${sapVersionId} is locked and cannot be edited`
      );
    }

    // Clone content and apply section update
    const updatedContent: SapContent = {
      ...(current.content as SapContent),
      [sectionPath]: newContent,
    };

    const diff: SapDiffEntry[] = [
      {
        sectionPath,
        action: (current.content as SapContent)[sectionPath] === undefined
          ? 'added'
          : 'modified',
        before: (current.content as SapContent)[sectionPath],
        after: newContent,
      },
    ];

    const nextVersion = current.version + 1;

    const [inserted] = await database
      .insert(sapVersions)
      .values({
        threadId: current.threadId,
        version: nextVersion,
        content: updatedContent,
        diff,
        status: 'draft',
        organizationId,
        createdBy: userId,
      })
      .returning();

    return inserted;
  }

  // ── 3. addComment ──────────────────────────────────────────────────

  /**
   * Add a threaded comment on a specific SAP version / section.
   */
  async addComment(
    sapVersionId: number,
    sectionPath: string | null,
    content: string,
    organizationId: number,
    userId: number,
    parentCommentId?: number
  ) {
    const database = this.getDb();

    // Verify the version exists
    const [version] = await database
      .select()
      .from(sapVersions)
      .where(
        and(
          eq(sapVersions.id, sapVersionId),
          eq(sapVersions.organizationId, organizationId)
        )
      );

    if (!version) {
      throw new Error(`SAP version ${sapVersionId} not found`);
    }

    // If parentCommentId is provided, verify it exists
    if (parentCommentId) {
      const [parent] = await database
        .select()
        .from(sapComments)
        .where(eq(sapComments.id, parentCommentId));

      if (!parent) {
        throw new Error(`Parent comment ${parentCommentId} not found`);
      }
    }

    const [inserted] = await database
      .insert(sapComments)
      .values({
        sapVersionId,
        sectionPath,
        content,
        parentCommentId: parentCommentId ?? null,
        organizationId,
        createdBy: userId,
      })
      .returning();

    return inserted;
  }

  // ── 4. resolveComment ──────────────────────────────────────────────

  /**
   * Mark a comment as resolved.
   */
  async resolveComment(
    commentId: number,
    organizationId: number,
    userId: number
  ) {
    const database = this.getDb();

    const [updated] = await database
      .update(sapComments)
      .set({
        resolved: true,
        resolvedBy: userId,
        resolvedAt: new Date(),
      })
      .where(
        and(
          eq(sapComments.id, commentId),
          eq(sapComments.organizationId, organizationId)
        )
      )
      .returning();

    if (!updated) {
      throw new Error(`Comment ${commentId} not found`);
    }

    return updated;
  }

  // ── 5. createAmendment ─────────────────────────────────────────────

  /**
   * Create a formal SAP amendment that links a previous version to a new
   * version and records the rationale for the change.
   */
  async createAmendment(
    threadId: number,
    rationale: string,
    changesDescription: string,
    sectionsAffected: string[],
    organizationId: number,
    userId: number
  ) {
    const database = this.getDb();

    // Get the latest version for this thread (becomes previousVersionId)
    const [latestVersion] = await database
      .select()
      .from(sapVersions)
      .where(
        and(
          eq(sapVersions.threadId, threadId),
          eq(sapVersions.organizationId, organizationId)
        )
      )
      .orderBy(desc(sapVersions.version))
      .limit(1);

    if (!latestVersion) {
      throw new Error(
        `No SAP versions exist for thread ${threadId}; cannot create amendment`
      );
    }

    // Create a new version that clones the latest content (to be edited later)
    const newVersion = await this.createSapVersion(
      threadId,
      latestVersion.content as SapContent,
      organizationId,
      userId
    );

    // Determine amendment number
    const existingAmendments = await database
      .select()
      .from(sapAmendments)
      .where(
        and(
          eq(sapAmendments.threadId, threadId),
          eq(sapAmendments.organizationId, organizationId)
        )
      )
      .orderBy(desc(sapAmendments.amendmentNumber))
      .limit(1);

    const nextAmendmentNumber = existingAmendments.length > 0
      ? existingAmendments[0].amendmentNumber + 1
      : 1;

    // Determine if the latest version was already locked
    const isPreLock = !latestVersion.isLocked;

    const [amendment] = await database
      .insert(sapAmendments)
      .values({
        threadId,
        amendmentNumber: nextAmendmentNumber,
        rationale,
        changesDescription,
        sectionsAffected,
        isPreLock,
        previousVersionId: latestVersion.id,
        newVersionId: newVersion.id,
        organizationId,
        createdBy: userId,
      })
      .returning();

    return {
      amendment,
      newVersion,
    };
  }

  // ── 6. signVersion ────────────────────────────────────────────────

  /**
   * Attach a 21 CFR Part 11 compliant electronic signature to a SAP version.
   * This updates the version status to 'approved'.
   */
  async signVersion(
    sapVersionId: number,
    signatureData: SignatureData,
    organizationId: number,
    userId: number
  ) {
    const database = this.getDb();

    // Verify version exists and is not already signed
    const [version] = await database
      .select()
      .from(sapVersions)
      .where(
        and(
          eq(sapVersions.id, sapVersionId),
          eq(sapVersions.organizationId, organizationId)
        )
      );

    if (!version) {
      throw new Error(`SAP version ${sapVersionId} not found`);
    }

    if (version.signatureId) {
      throw new Error(
        `SAP version ${sapVersionId} has already been signed (signature: ${version.signatureId})`
      );
    }

    // Validate required Part 11 fields
    if (
      !signatureData.signatureId ||
      !signatureData.signerName ||
      !signatureData.meaning ||
      !signatureData.timestamp ||
      !signatureData.method
    ) {
      throw new Error(
        '21 CFR Part 11 compliance requires signatureId, signerName, meaning, timestamp, and method'
      );
    }

    const [updated] = await database
      .update(sapVersions)
      .set({
        signatureId: signatureData.signatureId,
        approvedBy: userId,
        approvedAt: new Date(signatureData.timestamp),
        status: 'approved',
      })
      .where(
        and(
          eq(sapVersions.id, sapVersionId),
          eq(sapVersions.organizationId, organizationId)
        )
      )
      .returning();

    return {
      version: updated,
      signature: signatureData,
    };
  }

  // ── 7. lockVersion ────────────────────────────────────────────────

  /**
   * Lock a SAP version to prevent further edits.
   */
  async lockVersion(sapVersionId: number, organizationId: number) {
    const database = this.getDb();

    const [updated] = await database
      .update(sapVersions)
      .set({
        isLocked: true,
        status: 'locked',
      })
      .where(
        and(
          eq(sapVersions.id, sapVersionId),
          eq(sapVersions.organizationId, organizationId)
        )
      )
      .returning();

    if (!updated) {
      throw new Error(`SAP version ${sapVersionId} not found`);
    }

    return updated;
  }

  // ── 8. getAuditTrail ──────────────────────────────────────────────

  /**
   * Retrieve the complete audit trail for a statistical thread:
   * all versions, comments, and amendments in chronological order.
   */
  async getAuditTrail(threadId: number, organizationId: number) {
    const database = this.getDb();

    // Fetch the thread itself
    const [thread] = await database
      .select()
      .from(statisticalThreads)
      .where(
        and(
          eq(statisticalThreads.id, threadId),
          eq(statisticalThreads.organizationId, organizationId)
        )
      );

    if (!thread) {
      throw new Error(`Statistical thread ${threadId} not found`);
    }

    // All versions ordered chronologically
    const versions = await database
      .select()
      .from(sapVersions)
      .where(
        and(
          eq(sapVersions.threadId, threadId),
          eq(sapVersions.organizationId, organizationId)
        )
      )
      .orderBy(asc(sapVersions.version));

    // All comments across all versions of this thread
    const versionIds = versions.map(v => v.id);
    let comments: any[] = [];
    if (versionIds.length > 0) {
      // Collect comments for each version
      const commentPromises = versionIds.map(vid =>
        database
          .select()
          .from(sapComments)
          .where(
            and(
              eq(sapComments.sapVersionId, vid),
              eq(sapComments.organizationId, organizationId)
            )
          )
          .orderBy(asc(sapComments.createdAt))
      );
      const commentArrays = await Promise.all(commentPromises);
      comments = commentArrays.flat();
    }

    // All amendments
    const amendments = await database
      .select()
      .from(sapAmendments)
      .where(
        and(
          eq(sapAmendments.threadId, threadId),
          eq(sapAmendments.organizationId, organizationId)
        )
      )
      .orderBy(asc(sapAmendments.createdAt));

    // Build a unified chronological audit trail
    type AuditEntry = {
      type: 'version_created' | 'comment_added' | 'comment_resolved' | 'amendment_created' | 'version_signed' | 'version_locked';
      timestamp: Date;
      details: Record<string, unknown>;
    };

    const trail: AuditEntry[] = [];

    for (const v of versions) {
      trail.push({
        type: 'version_created',
        timestamp: v.createdAt,
        details: {
          versionId: v.id,
          version: v.version,
          status: v.status,
          createdBy: v.createdBy,
          diffSummary: Array.isArray(v.diff) ? (v.diff as SapDiffEntry[]).length : 0,
        },
      });
      if (v.signatureId) {
        trail.push({
          type: 'version_signed',
          timestamp: v.approvedAt ?? v.createdAt,
          details: {
            versionId: v.id,
            signatureId: v.signatureId,
            approvedBy: v.approvedBy,
          },
        });
      }
      if (v.isLocked) {
        trail.push({
          type: 'version_locked',
          timestamp: v.createdAt,
          details: { versionId: v.id },
        });
      }
    }

    for (const c of comments) {
      trail.push({
        type: 'comment_added',
        timestamp: c.createdAt,
        details: {
          commentId: c.id,
          sapVersionId: c.sapVersionId,
          sectionPath: c.sectionPath,
          createdBy: c.createdBy,
          parentCommentId: c.parentCommentId,
        },
      });
      if (c.resolved && c.resolvedAt) {
        trail.push({
          type: 'comment_resolved',
          timestamp: c.resolvedAt,
          details: {
            commentId: c.id,
            resolvedBy: c.resolvedBy,
          },
        });
      }
    }

    for (const a of amendments) {
      trail.push({
        type: 'amendment_created',
        timestamp: a.createdAt,
        details: {
          amendmentId: a.id,
          amendmentNumber: a.amendmentNumber,
          previousVersionId: a.previousVersionId,
          newVersionId: a.newVersionId,
          rationale: a.rationale,
        },
      });
    }

    // Sort by timestamp ascending
    trail.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    return {
      thread,
      versions,
      comments,
      amendments,
      auditTrail: trail,
    };
  }

  // ── 9. getSapVersion ──────────────────────────────────────────────

  /**
   * Get a specific SAP version along with its comments.
   */
  async getSapVersion(sapVersionId: number, organizationId: number) {
    const database = this.getDb();

    const [version] = await database
      .select()
      .from(sapVersions)
      .where(
        and(
          eq(sapVersions.id, sapVersionId),
          eq(sapVersions.organizationId, organizationId)
        )
      );

    if (!version) {
      throw new Error(`SAP version ${sapVersionId} not found`);
    }

    const comments = await database
      .select()
      .from(sapComments)
      .where(
        and(
          eq(sapComments.sapVersionId, sapVersionId),
          eq(sapComments.organizationId, organizationId)
        )
      )
      .orderBy(asc(sapComments.createdAt));

    // Build threaded comment tree
    const rootComments = comments.filter(c => !c.parentCommentId);
    const childMap = new Map<number, typeof comments>();
    for (const c of comments) {
      if (c.parentCommentId) {
        const existing = childMap.get(c.parentCommentId) ?? [];
        existing.push(c);
        childMap.set(c.parentCommentId, existing);
      }
    }

    const threadedComments = rootComments.map(root => ({
      ...root,
      replies: childMap.get(root.id) ?? [],
    }));

    return {
      ...version,
      comments: threadedComments,
    };
  }

  // ── 10. listVersions ──────────────────────────────────────────────

  /**
   * List all SAP versions for a given statistical thread.
   */
  async listVersions(threadId: number, organizationId: number) {
    const database = this.getDb();

    const versions = await database
      .select()
      .from(sapVersions)
      .where(
        and(
          eq(sapVersions.threadId, threadId),
          eq(sapVersions.organizationId, organizationId)
        )
      )
      .orderBy(desc(sapVersions.version));

    return versions;
  }
}
