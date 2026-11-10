/**
 * The launch boundary, re-proved after the catalog changed (2026-10-15): the
 * sub-namespaces found under a launch claim that no launch screen calls and no
 * launch app uses are no longer served at launch, and every one a launch
 * screen calls or a launch app uses still is.
 *
 * A claim on a prefix covers every route under it, so a broad claim let 79
 * dead or hidden-app routes through the production gate (three skeptics per
 * finding; docs/evidence/D2-API-SCOPE/2026-10-15-reproof/api-scope/). Where a
 * prefix's root is not called, the claim was narrowed in the registry. Where
 * it is (or is served and was not judged), the dead children are listed in
 * LAUNCH_EXCLUDED_API, each with its reason.
 */
import { describe, expect, it } from 'vitest';

import { buildPrefixMap, modulesForPath, NEVER_GATED } from '../api-prefix-map';
import { LAUNCH_EXCLUDED_API, launchScopeApiVerdict } from '../launch-scope-api';

const prefixMap = buildPrefixMap();
const verdict = (p: string) => launchScopeApiVerdict(p, prefixMap, NEVER_GATED);

/** The 79 upheld findings, as the sub-namespace the gate served. */
const NOT_SERVED_AT_LAUNCH = [ // Remaining findings after admitted/reached callers; stored-run reproduction is pinned below.
  '/api/authoring-actions/authority-map',
  '/api/authoring-actions/body-aware-gaps',
  '/api/authoring-actions/compare-versions',
  '/api/authoring-actions/contradiction-consequence',
  '/api/authoring-actions/contradiction-context',
  '/api/authoring-actions/contradiction-scan',
  '/api/authoring-actions/correction-draft',
  '/api/authoring-actions/cross-section-consistency',
  '/api/authoring-actions/decision',
  '/api/authoring-actions/dossier-preflight',
  '/api/authoring-actions/execute-contradiction-resolution',
  '/api/authoring-actions/explain-contradiction-resolution',
  '/api/authoring-actions/harmonize-sections',
  '/api/authoring-actions/mark-submission-ready',
  '/api/authoring-actions/plan-contradiction-resolution',
  '/api/authoring-actions/project-resolution-status',
  '/api/authoring-actions/promote-to-review',
  '/api/authoring-actions/promotion-blockers',
  '/api/authoring-actions/resolution-changelog',
  '/api/authoring-actions/resume-last-section',
  '/api/authoring-actions/section-context',
  '/api/authoring-actions/section-evidence',
  '/api/authoring-actions/section-expectations',
  '/api/authoring-actions/section-preflight',
  '/api/authoring-actions/seed-overlay-rules',
  '/api/biostat-bridge/filing-placements',
  '/api/chat/actions',
  '/api/chat/health',
  '/api/chat/send-message',
  '/api/chat/stream',
  '/api/chat/thread',
  '/api/coauthor/sessions',
  '/api/coauthor/templates',
  '/api/concept2cure/artifacts/export-pptx',
  '/api/concept2cure/projects/all',
  /* /api/concept2cure/reviews/pending: served since 9357715132 (P-95, 2026-11-09), below. */
  '/api/conversation-os/artifacts',
  '/api/conversation-os/conversations',
  '/api/corpus/benchmark',
  '/api/corpus/extract',
  '/api/corpus/ingest',
  /* /api/ectd/controlled-vocab: served since the ectd-publishing fold (2026-10-29),
     below. /api/ectd/qualification stays: eCTD Compile claims its one route,
     /spec-versions, and neither the root nor any other child. */
  '/api/ectd/qualification',
  '/api/ectd/templates',
  '/api/ectd/v4',
  /* /api/mdx/qms/readiness: served since P-122 (2026-11-10), below. */
  '/api/project-sections',
  '/api/project-sections/dependencies',
  '/api/project-sections/initialize',
  '/api/project-sections/milestones',
  '/api/project-sections/notifications',
  /* /api/project-sections/summary and /timeline: served since P-122 (2026-11-10), below. */
  '/api/realtime-collab/health',
  '/api/regulatory/tasks/dashboard',
  '/api/regulatory/tasks/sync',
  '/api/submission-ops/approval-bottlenecks',
  '/api/submission-ops/automation',
  '/api/submission-ops/command-center',
  '/api/submission-ops/digests',
  /* /api/submission-ops/due-soon: served since P-122 (2026-11-10), below. */
  '/api/submission-ops/hotspots',
  '/api/submission-ops/policies',
  '/api/submission-ops/sections',
  '/api/submission-ops/unified-work',
  '/api/submission-ops/workload',
  '/api/task-management/automation',
  '/api/tasks/automation',
  '/api/workflow/progression',
  '/api/workflow/proofs',
  '/api/workflow/status',
  '/api/workflow/tasks',
  /* Found 2026-10-29 (trunk-red-sweep-2): device-510k claims the root and is a
     Projects feature since 62a8d5e7, and no launch screen calls a route under it. */
  '/api/programs',
  /* Upheld on 2026-10-15, served from 62a8d5e7 while the device vault was a
     Projects feature, and not served again since it folded into the Vault (D2,
     fold F3, 2026-10-29): its router and its one screen are gone. */
  '/api/mdx/vault',
];

/** What a launch screen calls or a launch app uses under the same prefixes (the route inventory's 'called' list). */
const STILL_SERVED = [
  /* Excluded as dead from 4aa204390. P-122 (2026-11-10) reaches it: Quality's figure line reads the server's
     quality-system counts (quality/QualityFigures.tsx; quality-figures-launch-claim.test.ts). */
  '/api/mdx/qms/readiness',
  /* Upheld on 2026-10-15: no screen read them. P-122 (2026-11-10) reaches them: the project page's Plan step reads
     the section owners, deadlines and milestones, and the Projects page's "at risk" answer reads the work due soon,
     each listing only the projects the person can open (tests/db/p122-project-management-reads.dbtest.ts). Claimed
     exactly, so the section list, its writes and the rest of /api/submission-ops stay refused. */
  '/api/project-sections/summary',
  '/api/project-sections/timeline',
  '/api/submission-ops/due-soon',
  '/api/authoring-actions/decision-context',
  '/api/authoring-actions/decisions',
  '/api/authoring-actions/module-preflight',
  '/api/biostat-bridge/designs',
  '/api/biostat-bridge/computation-runs/12/reproduce',
  '/api/chat/threads',
  '/api/chat/upload',
  '/api/coauthor/documents',
  '/api/concept2cure/artifacts/export-docx',
  '/api/concept2cure/artifacts/export-pdf',
  '/api/concept2cure/projects',
  '/api/concept2cure/reviews/my-queue',
  /* Upheld as unmapped on 2026-10-15: no screen read it. Since 9357715132 (P-95, 2026-11-09) the named
     reviewer's requests are read from it by the Review screen (surfaces/ReviewRequests.tsx, mounted in
     ReviewThreads.tsx) and by Your open work (OpenWork.tsx), and the review surface claims it exactly. */
  '/api/concept2cure/reviews/pending',
  '/api/ectd/export',
  '/api/ectd/validate',
  /* Upheld as HIDDEN APP on 2026-10-15 (claimed by ectd-publishing alone); the
     reference folded into eCTD Compile (D2, 2026-10-29), whose panel reads both
     (EctdCompileReference.tsx). Claimed exactly, so /api/ectd/v4 and the rest of
     /api/ectd/qualification stay refused. */
  '/api/ectd/controlled-vocab',
  '/api/ectd/qualification/spec-versions',
  '/api/mdx/qms',
  '/api/mdx/qms/changes',
  '/api/mdx/qms/documents',
  '/api/mdx/qms/templates',
  '/api/mdx/qms/training',
  /* Upheld as HIDDEN APP on 2026-10-15; admitted to the QMS app by decision P-48
     (2026-10-29), and called by the Quality records (quality/QmsRecords.tsx). */
  '/api/mdx/qms/internal-audits',
  '/api/mdx/qms/management-reviews',
  '/api/mdx/qms/nonconforming',
  '/api/mdx/qms/suppliers',
  '/api/realtime-collab/locks',
  '/api/realtime-collab/rooms',
  '/api/regulatory/tasks',
  '/api/regulatory/tasks/all',
  '/api/regulatory/tasks/by-module',
  '/api/regulatory/tasks/unified',
  '/api/submission-ops/artifact-section-map',
  '/api/submission-ops/packages',
  /* '/api/submission-ops/blockers' left this list on 2026-10-30: fold F5 item 2 (041880cbdf, P-61) retired
     the organization-wide blocker list and its caller (mdx/hooks/useWorkbench.ts); a blocker is its filing's
     readiness (EstarFilingPanel), reached through submission-center. No launch screen calls it. */
  '/api/task-management/assignees',
  '/api/task-management/board',
  '/api/task-management/filings',
  '/api/task-management/messages',
  '/api/task-management/my-work',
  '/api/task-management/tasks',
  '/api/task-management/templates',
  '/api/tasks/messages',
  '/api/tasks/my-work',
  '/api/tasks/tasks',
  '/api/tasks/templates',
];

describe('the remaining sub-namespaces upheld by the re-proof are not served at launch', () => {
  it.each(NOT_SERVED_AT_LAUNCH)('%s', (path) => {
    expect(verdict(path)).not.toBe('launch');
    // Their children too: a claim covers what is under it.
    expect(verdict(`${path}/x`)).not.toBe('launch');
  });
});

describe('in any letter case: Express routes ignore it, so the verdict does too', () => {
  /* The bypass keeps the launch-claimed prefix as written and changes the
     case of what follows it, so the longest claim it still matches is the
     launch root's (found by the narrowing's review, 2026-10-22). */
  it.each(NOT_SERVED_AT_LAUNCH)('%s', (path) => {
    expect(verdict(path.replace(/[^/]+$/, (seg) => seg.toUpperCase()))).not.toBe('launch');
    expect(verdict(`${path.replace(/[^/]+$/, (seg) => seg[0].toUpperCase() + seg.slice(1))}/x`)).not.toBe('launch');
  });
});

describe('what a launch screen calls under those prefixes still is', () => {
  it.each(STILL_SERVED)('%s', (path) => {
    expect(verdict(path)).toBe('launch');
  });
});


describe('stored-run reproduction reached by protocol statistics and Biostatistics', () => {
  it('attributes the real computation route to both existing callers without claiming the bridge root', () => {
    const path = '/api/biostat-bridge/computation-runs/12/reproduce';
    expect(modulesForPath(path, prefixMap)).toEqual(new Set(['protocol-dev', 'biostatistics']));
    expect(prefixMap.has('/api/biostat-bridge')).toBe(false);
    expect(verdict(path)).toBe('launch');
    expect(verdict(path.toUpperCase())).toBe('launch');
  });

  it.each([
    '/api/biostat-bridge/filing-placements',
    '/api/biostat-bridge/unrelated',
    '/api/biostat-bridge/computation-runs-extra/12/reproduce',
  ])('keeps the unrelated path %s outside launch', path => {
    expect(modulesForPath(path, prefixMap)).toBeNull();
    expect(verdict(path)).not.toBe('launch');
    expect(verdict(path.toUpperCase())).not.toBe('launch');
  });
});

describe('LAUNCH_EXCLUDED_API stays honest', () => {
  it.each(Object.entries(LAUNCH_EXCLUDED_API))('%s carries a reason, and is one of the upheld findings', (path, reason) => {
    expect(reason).toMatch(/^(DEAD|HIDDEN APP): .{20,}/);
    expect(NOT_SERVED_AT_LAUNCH).toContain(path);
  });

  it('every key the verdict matches is lower case, because it matches a lower-cased path', async () => {
    const { UI_SURFACES } = await import('../../../../shared/constants/ui-surface-registry');
    const { LAUNCH_PLATFORM_API, LAUNCH_INFRASTRUCTURE_API } = await import('../launch-scope-api');
    const keys = [
      ...UI_SURFACES.flatMap((s) => s.apiPrefixes ?? []),
      ...NEVER_GATED,
      ...Object.keys(LAUNCH_PLATFORM_API),
      ...Object.keys(LAUNCH_INFRASTRUCTURE_API),
      ...Object.keys(LAUNCH_EXCLUDED_API),
    ];
    expect(keys.filter((k) => k !== k.toLowerCase())).toEqual([]);
  });

  it('excludes no path a launch screen calls', () => {
    for (const path of STILL_SERVED) {
      expect(Object.keys(LAUNCH_EXCLUDED_API).some((p) => path === p || path.startsWith(`${p}/`)), path).toBe(false);
    }
  });
});
