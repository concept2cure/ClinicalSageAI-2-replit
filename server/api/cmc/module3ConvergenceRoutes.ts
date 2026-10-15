/**
 * Module 3 Convergence API Routes
 *
 * Phase 2 + 6 — Module 3 Workflow Convergence
 *
 * Endpoint:
 *  POST /build-section/:projectId/:sectionKey — Compile + bridge a specific section
 *
 * Deleted 2026-10-05, with no caller in client/src or server, when the cmc
 * surface's API claim was narrowed to what its screens call (decision P-28;
 * docs/evidence/CMC-M3-GA/2026-10-05/20-cmc-api-allowlist/), and kept gone by
 * server/api/cmc/__tests__/cmc-retired-routers.contract.test.ts:
 *  POST /classify-artifact/:projectId — an upload is classified into a
 *    canonical source by AnA's module3_classify_source command
 *    (services/ana-ri/module3-command-handlers.ts, the same
 *    classifyAndMapArtifactToSource), and a Vault document is linked to the
 *    record it evidences by /source-evidence (sourceEvidenceRoutes.ts);
 *  GET /source-lineage/:projectId/:sectionKey — a section's sources and their
 *    drift are GET /provenance/:projectId/:sectionKey
 *    (module3OperatingSystemRoutes.ts) and GET /build-state/:projectId
 *    (module3BuildStateRoutes.ts).
 */

import express from 'express';
import { getPool } from '../../db';
import { bridgeCompileToArtifact } from '../../services/module3-convergence-service';
/* The canonical Module 3 composition and persistence. Core sections + emittable
   3.2.A appendices + 3.2.R for the recorded region; one row, one lineage
   rewrite and one provenance event per section. */
import { composeProjectModule3, persistComposedSection } from '../../services/cmc/module3-compile';
import { compositionRefusalBody, isCompositionOutOfScope } from '../../services/cmc/composition-scope';
import { NO_CANONICAL_SOURCES_REMEDY } from '../../services/cmc/link-to-module3';

/** Said the same way by every build path, so the remedy does not depend on which one the user hit. */
const NO_CANONICAL_SOURCES_ERROR =
  'No canonical source objects for this project — nothing to build from.';
/* The remedy names a door that exists: /classify-artifact and
   /module3-os/source-objects were both retired on 2026-10-05, and the one
   writer of cmc_source_objects is the registers' write-through
   (services/cmc-write-through.ts). */
import { serverError } from '../../lib/api-response';
import { createScopedLogger } from '../../utils/logger';
import { guardModule3Project, module3OrgId } from './module3-project-guard';
import { governedActorId } from '../../middleware/orgMembership';

const router = express.Router();
const log = createScopedLogger('module3-convergence');
/* Every route here that names a project reads or builds only in a project of
   the caller's organization (PF-15); another organization's project is 404,
   not an empty build state. */
guardModule3Project(router, log);


// ── POST /build-section/:projectId/:sectionKey ───────────────────────────────
// Compile a specific subsection and auto-bridge the result to a governed artifact.
// This is the "build one section" action from the editor or AnA.

router.post('/build-section/:projectId/:sectionKey', async (req, res) => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const orgId = module3OrgId(req);
    const { projectId, sectionKey } = req.params;
    // 2026-10-15: with no user, the section's provenance event was written by 'system'.
    const userId = governedActorId(req);
    if (userId == null) return res.status(401).json({ success: false, error: 'AUTH_REQUIRED' });

    await client.query('BEGIN');

    /* ONE composition and ONE persist — services/cmc/module3-compile, the same
       pair the AnA build handlers and the compile route run. This handler used
       to carry its own copy of the whole body (source read, compose, upsert,
       lineage rewrite, provenance event), and that copy composed the CORE
       §3.2.S / §3.2.P / 3.1 / 3.3 rules only. composeProjectModule3 is a strict
       superset: core, plus the emittable 3.2.A appendices, plus 3.2.R for the
       region the linked submission records — and it runs the regional read
       under a SAVEPOINT, because inside this transaction a failed statement
       poisons everything after it even when caught.

       So a request for a regional or appendix section came back
       404 "not found in composition rules", which was not true: the rule
       exists, this copy just could not reach the pass that emits it. 3.2.R is a
       required region-specific module in every CTD filing. */
    const { sources, sections: allComposed } = await composeProjectModule3(client, orgId, projectId);

    if (sources.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: NO_CANONICAL_SOURCES_ERROR,
        hint: NO_CANONICAL_SOURCES_REMEDY,
      });
    }

    const section = allComposed.find((s) => s.sectionKey === sectionKey);
    if (!section) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: `Section ${sectionKey} is not composable from this project's sources (no composition rule, or no recorded region for a regional section).`,
      });
    }

    await persistComposedSection(client, orgId, projectId, section, {
      actorId: String(userId),
      event: 'compiled',
      eventPayload: { trigger: 'build-section-api' },
    });

    await client.query('COMMIT');

    // 6. Auto-bridge to governed artifact. A bridge that could not run is
    // reported, not swallowed — the old catch-and-warn hid the spine break.
    let bridgedArtifact: { artifactId: string; isNew: boolean } | null = null;
    let bridgeSkip: { reason: string; detail: string } | null = null;
    try {
      const bridged = await bridgeCompileToArtifact(orgId, projectId, section.sectionKey, {
        narrativeDraft: section.narrativeDraft,
        tables: section.tables,
        completeness: section.completeness,
        missingInputs: section.missingInputs,
        lineage: section.lineage,
      }, { createdById: userId });
      if (bridged.bridged) {
        bridgedArtifact = { artifactId: bridged.artifactId, isNew: bridged.isNew };
      } else {
        bridgeSkip = { reason: bridged.reason, detail: bridged.detail };
      }
    } catch (bridgeErr) {
      bridgeSkip = {
        reason: 'error',
        detail: bridgeErr instanceof Error ? bridgeErr.message : String(bridgeErr),
      };
    }

    return res.json({
      success: true,
      data: {
        sectionKey: section.sectionKey,
        completeness: section.completeness,
        missingInputs: section.missingInputs,
        narrativePreview: section.narrativeDraft.substring(0, 500),
        sourceCount: section.lineage.length,
        bridgedArtifact,
        bridgeSkip,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    // The composition boundary, on the same terms as the compile route
    // (services/cmc/composition-scope.ts).
    if (isCompositionOutOfScope(error)) {
      return res.status(409).json(compositionRefusalBody(error.refusal));
    }
    if (String((error as Error)?.message || '').includes('Organization context required')) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    return serverError(res, log, 'building the section', error);
  } finally {
    client.release();
  }
});

export default router;
