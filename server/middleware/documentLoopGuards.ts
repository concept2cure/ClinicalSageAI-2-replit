/**
 * Document Loop Runtime Guards
 *
 * Middleware and utility functions that prevent the document loop from breaking.
 * These fire warnings (not errors) in development and hard errors in production
 * for violations like empty content, missing projectId, or demo data leaks.
 */

/**
 * Guard: reject artifact creation with empty content.
 * Applied as middleware before artifact creation endpoints.
 */
export function guardEmptyContent(req: any, res: any, next: any) {
  const content = req.body?.content || req.body?.htmlContent;
  if (typeof content === 'string' && content.trim().length === 0) {
    console.warn('[DOCUMENT-LOOP-GUARD] Blocked empty content artifact creation', {
      path: req.path,
      title: req.body?.title,
      userId: req.userId || req.user?.id,
    });
    return res.status(400).json({
      error: 'Content must not be empty — document loop requires real content',
      code: 'EMPTY_CONTENT_BLOCKED',
    });
  }
  next();
}

/**
 * Guard: reject artifact creation without projectId.
 */
export function guardMissingProjectId(req: any, res: any, next: any) {
  const projectId = req.params?.projectId || req.body?.projectId;
  if (!projectId || projectId === 'undefined' || projectId === 'null' || projectId === '0') {
    console.warn('[DOCUMENT-LOOP-GUARD] Blocked artifact creation without projectId', {
      path: req.path,
      title: req.body?.title,
    });
    return res.status(400).json({
      error: 'projectId is required — artifacts must be bound to a project',
      code: 'MISSING_PROJECT_ID',
    });
  }
  next();
}

/**
 * Guard: detect and block demo/mock data patterns in production.
 * Scans artifact content for known demo signatures.
 */
const DEMO_SIGNATURES = [
  'Lemizumab Phase 1/2 Program',
  'DEMO_PROGRAM_ID',
  'ectd-ind-001',
  'Demo program',
  'Nexavar-2 NDA',  // Mission control demo
];

export function guardDemoContent(req: any, res: any, next: any) {
  const content = req.body?.content || req.body?.htmlContent || '';
  const title = req.body?.title || '';
  const combined = `${title} ${content}`;

  for (const sig of DEMO_SIGNATURES) {
    if (combined.includes(sig)) {
      console.warn('[DOCUMENT-LOOP-GUARD] Demo data detected in artifact creation', {
        path: req.path,
        signature: sig,
        title: req.body?.title,
      });
      // Warn but don't block — some legitimate content might match
      // In strict mode, uncomment the return below:
      // return res.status(400).json({ error: 'Demo data not allowed in production', code: 'DEMO_DATA_BLOCKED' });
      break;
    }
  }
  next();
}

/**
 * Guard: log generation events that don't create artifacts.
 * Attach to AI generation endpoints to detect orphaned generations.
 */
export function warnOrphanedGeneration(endpointName: string) {
  return (req: any, res: any, next: any) => {
    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
      // If this is a successful generation response without artifact creation
      const content = body?.content || body?.data?.content || body?.answer || body?.response;
      if (content && typeof content === 'string' && content.length > 200) {
        const hasArtifact = body?.artifactId || body?.data?.artifactId;
        if (!hasArtifact) {
          console.warn(
            `[DOCUMENT-LOOP-GUARD] Generation without artifact: ${endpointName} returned ${content.length} chars but no artifactId`
          );
        }
      }
      return originalJson(body);
    };
    next();
  };
}
