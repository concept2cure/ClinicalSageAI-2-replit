/**
 * MDX Submissions adapter API routes — kit-shaped views over the existing
 * c2c_submission_packages + readiness + audit + approval data.
 *
 * Mounted at:  /api/mdx/submissions
 *
 * The kit's Submission Center pane ships with strict shape expectations
 * (`Submission`, `SubmissionDetail` in client/src/concept2cure/mdx/types.ts).
 * Rather than make the pane stitch together submission-ops + audit +
 * approvals + ESG endpoints, this route does it server-side and returns
 * the exact kit shape. Result: one round-trip per view, no client-side
 * join logic to maintain, and a single point to extend when the kit grows
 * new fields.
 *
 * Endpoints:
 *   GET /api/mdx/submissions                — list view (Submission[])
 *   GET /api/mdx/submissions/:packageId     — detail view (SubmissionDetail)
 *
 * Filters (list): ?projectId=N, ?workstream=mdx, ?type=510k
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { eq, and, desc, inArray } from 'drizzle-orm';
import {
  c2cSubmissionPackages,
  c2cPackageSections,
  projects,
  users,
} from '../../shared/schema';
import { computePackageReadiness } from '../submission-ops/readiness-engine';

const router = Router();

function getOrgId(req: Request): number {
  const orgId = (req as any).organizationId ?? (req as any).user?.organizationId;
  if (!orgId) throw new Error('Organization context required');
  return orgId;
}

// ─── Kit-shape mapping helpers ─────────────────────────────────────────────

type KitWorkstream = 'mdx' | 'biotech' | 'pharma' | 'cro';
type KitStage =
  | 'build'
  | 'validate'
  | 'sign'
  | 'package'
  | 'transmit'
  | 'receipt'
  | 'aic';
type KitStatus = 'active' | 'blocked' | 'complete';
type KitTone = '' | 'ok' | 'warn' | 'err';

const FAMILY_TO_WORKSTREAM: Record<string, KitWorkstream> = {
  '510k':       'mdx',
  'denovo':     'mdx',
  'pma':        'mdx',
  'pma-s':      'mdx',
  'cer':        'mdx',
  'eudamed':    'mdx',
  'ivdr_td':    'mdx',
  'ind':        'biotech',
  'bla':        'biotech',
  'ind-amend':  'biotech',
  'nda':        'pharma',
  'anda':       'pharma',
  'maa':        'pharma',
  'jnda':       'pharma',
  'ide':        'cro',
  'ctd-cta':    'cro',
};

/** Default gateway per submission type (overridable via package metadata.gateway). */
const TYPE_DEFAULT_GATEWAY: Record<string, string> = {
  '510k':       'fda-esg',
  'denovo':     'fda-esg',
  'pma':        'fda-esg',
  'pma-s':      'fda-esg',
  'ind':        'fda-esg',
  'ind-amend':  'fda-esg',
  'bla':        'fda-esg',
  'nda':        'fda-esg',
  'anda':       'fda-esg',
  'ide':        'fda-esg',
  'cer':        'eu-eudamed',
  'eudamed':    'eu-eudamed',
  'ivdr_td':    'eu-eudamed',
  'maa':        'ema-cesp',
  'jnda':       'pmda-gw',
  'ctd-cta':    'ema-cesp',
};

interface PackageRow {
  id: number;
  packageId: string;
  projectId: number;
  packageFamily: string;
  title: string;
  description: string | null;
  targetDate: Date | null;
  status: string;
  metadata: unknown;
  createdById: number | null;
  createdAt: Date;
  updatedAt: Date;
}

interface PackageContext {
  pkg: PackageRow;
  projectName: string;
  projectCode: string;
  ownerName: string;
}

interface ReadinessLite {
  overallReadinessPercent: number;
  overallState: 'on_track' | 'at_risk' | 'blocked';
  totalBlockers: number;
  totalOverdue: number;
  sections: Array<{
    sectionDbId: number;
    sectionKey: string;
    sectionLabel: string;
    totalArtifacts: number;
    readyArtifacts: number;
    readinessPercent: number;
    overallState: 'on_track' | 'at_risk' | 'blocked';
    openCriticalFindings: number;
    missingApprovals: number;
  }>;
}

function readMetaString(meta: unknown, key: string): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const v = (meta as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : null;
}

function deriveStage(pkg: PackageRow, readiness: ReadinessLite): KitStage {
  /* Explicit stage override wins when set in metadata. */
  const explicit = readMetaString(pkg.metadata, 'stage') as KitStage | null;
  if (explicit) return explicit;

  if (pkg.status === 'completed') return 'aic';
  /* Otherwise derive from readiness percent — early stages map to build/validate,
     late stages to sign/package. transmit/receipt/aic require explicit overrides
     because the system can't infer them from readiness alone. */
  const pct = readiness.overallReadinessPercent;
  if (pct >= 100) return 'sign';
  if (pct >= 80)  return 'sign';
  if (pct >= 50)  return 'validate';
  return 'build';
}

function deriveStatus(pkg: PackageRow, readiness: ReadinessLite): KitStatus {
  if (pkg.status === 'completed') return 'complete';
  if (pkg.status === 'cancelled') return 'complete';
  if (readiness.overallState === 'blocked' || readiness.totalBlockers > 0) return 'blocked';
  return 'active';
}

function deriveTone(status: KitStatus, readiness: ReadinessLite): KitTone {
  if (status === 'complete') return 'ok';
  if (status === 'blocked')  return 'err';
  if (readiness.overallState === 'at_risk' || readiness.totalOverdue > 0) return 'warn';
  return '';
}

function formatTargetAt(targetDate: Date | null): string {
  if (!targetDate) return '—';
  const ms = targetDate.getTime() - Date.now();
  const days = Math.round(ms / 86_400_000);
  const iso = targetDate.toISOString().slice(0, 10);
  if (days < 0)  return `Past · ${iso}`;
  if (days <= 0) return `Today · ${iso}`;
  return `${days} days · ${iso}`;
}

function formatBytes(n: number): string {
  if (n >= 1e9)   return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6)   return `${(n / 1e6).toFixed(0)} MB`;
  if (n >= 1e3)   return `${(n / 1e3).toFixed(0)} KB`;
  return `${n} B`;
}

function packageToSubmission(ctx: PackageContext, readiness: ReadinessLite) {
  const { pkg, projectName, projectCode, ownerName } = ctx;
  const type = pkg.packageFamily;
  const workstream = FAMILY_TO_WORKSTREAM[type] ?? 'mdx';
  const gateway =
    readMetaString(pkg.metadata, 'gateway') ?? TYPE_DEFAULT_GATEWAY[type] ?? 'fda-esg';

  const totalArtifacts = readiness.sections.reduce((s, r) => s + r.totalArtifacts, 0);
  const readyArtifacts = readiness.sections.reduce((s, r) => s + r.readyArtifacts, 0);
  const errs = readiness.totalBlockers;
  const warns = readiness.sections.reduce((s, r) => s + r.openCriticalFindings, 0) - errs;
  const ok = readyArtifacts;

  const status = deriveStatus(pkg, readiness);
  const stage  = deriveStage(pkg, readiness);
  const tone   = deriveTone(status, readiness);

  return {
    id:         pkg.packageId,
    workstream,
    type,
    gateway,
    prog:       projectCode || projectName,
    progTitle:  projectName,
    title:      pkg.title,
    stage,
    status,
    targetAt:   formatTargetAt(pkg.targetDate),
    sentAt:     null as string | null,
    files:      totalArtifacts,
    bytes:      formatBytes(0), /* artifact-bytes aggregation pending dedicated query */
    gate:       { errs, warns: Math.max(warns, 0), ok },
    cover:      'draft' as 'draft' | 'review' | 'signed',
    esig:       false,
    owner:      ownerName || '—',
    tone,
  };
}

async function loadProjectsByIds(ids: number[]) {
  if (ids.length === 0) return new Map<number, { name: string; code: string; ownerId: number | null }>();
  const rows = await db
    .select({ id: projects.id, name: projects.name, code: projects.code, ownerId: projects.ownerId })
    .from(projects)
    .where(inArray(projects.id, ids));
  return new Map(rows.map((r) => [r.id, { name: r.name, code: r.code ?? '', ownerId: r.ownerId }]));
}

async function loadUserNamesByIds(ids: number[]) {
  if (ids.length === 0) return new Map<number, string>();
  const rows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, ids));
  return new Map(rows.map((r) => [r.id, r.name]));
}

// ─── Routes ─────────────────────────────────────────────────────────────────

/** GET /api/mdx/submissions — kit-shaped list view. */
router.get('/submissions', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const projectId = req.query.projectId ? Number(req.query.projectId) : undefined;
    const workstreamFilter = req.query.workstream as KitWorkstream | undefined;
    const typeFilter = req.query.type as string | undefined;

    const conditions = [eq(c2cSubmissionPackages.orgId, orgId)];
    if (projectId) conditions.push(eq(c2cSubmissionPackages.projectId, projectId));

    const packages = (await db
      .select()
      .from(c2cSubmissionPackages)
      .where(and(...conditions))
      .orderBy(desc(c2cSubmissionPackages.createdAt))) as PackageRow[];

    if (packages.length === 0) {
      return res.json({ data: [] });
    }

    /* Pre-resolve project + owner lookups */
    const projectIds = Array.from(new Set(packages.map((p) => p.projectId)));
    const projectMap = await loadProjectsByIds(projectIds);
    const ownerIds = Array.from(
      new Set(
        packages
          .map((p) => p.createdById)
          .filter((id): id is number => typeof id === 'number'),
      ),
    );
    const userMap = await loadUserNamesByIds(ownerIds);

    /* Compute readiness in parallel for all packages */
    const readinessByPkg = new Map<number, ReadinessLite>();
    await Promise.all(
      packages.map(async (pkg) => {
        try {
          const r = await computePackageReadiness(orgId, pkg.id);
          readinessByPkg.set(pkg.id, {
            overallReadinessPercent: r.overallReadinessPercent,
            overallState:            r.overallState,
            totalBlockers:           r.totalBlockers,
            totalOverdue:            r.totalOverdue,
            sections: r.sections.map((s) => ({
              sectionDbId:           s.sectionDbId,
              sectionKey:            s.sectionKey,
              sectionLabel:          s.sectionLabel,
              totalArtifacts:        s.totalArtifacts,
              readyArtifacts:        s.readyArtifacts,
              readinessPercent:      s.readinessPercent,
              overallState:          s.overallState,
              openCriticalFindings:  s.openCriticalFindings,
              missingApprovals:      s.missingApprovals,
            })),
          });
        } catch {
          readinessByPkg.set(pkg.id, {
            overallReadinessPercent: 0,
            overallState:            'on_track',
            totalBlockers:           0,
            totalOverdue:            0,
            sections:                [],
          });
        }
      }),
    );

    const submissions = packages.map((pkg) => {
      const proj = projectMap.get(pkg.projectId);
      const ctx: PackageContext = {
        pkg,
        projectName: proj?.name ?? `Project ${pkg.projectId}`,
        projectCode: proj?.code ?? '',
        ownerName:
          (pkg.createdById != null ? userMap.get(pkg.createdById) : undefined) ?? '—',
      };
      const r = readinessByPkg.get(pkg.id)!;
      return packageToSubmission(ctx, r);
    });

    /* Apply optional client-driven filters */
    const filtered = submissions.filter((s) => {
      if (workstreamFilter && s.workstream !== workstreamFilter) return false;
      if (typeFilter && s.type !== typeFilter)                   return false;
      return true;
    });

    res.json({ data: filtered });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
  }
});

/** GET /api/mdx/submissions/:packageId — kit-shaped detail view. */
router.get('/submissions/:packageId', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const packageId = String(req.params.packageId);
    const [pkg] = (await db
      .select()
      .from(c2cSubmissionPackages)
      .where(
        and(
          eq(c2cSubmissionPackages.packageId, packageId),
          eq(c2cSubmissionPackages.orgId, orgId),
        ),
      )) as PackageRow[];

    if (!pkg) return res.status(404).json({ error: 'Submission not found' });

    /* Project + owner */
    const [proj] = await db
      .select({ name: projects.name, code: projects.code, ownerId: projects.ownerId })
      .from(projects)
      .where(eq(projects.id, pkg.projectId));
    let ownerName = '—';
    if (pkg.createdById != null) {
      const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, pkg.createdById));
      if (u) ownerName = u.name;
    }

    /* Sections (build outline) */
    const sectionRows = await db
      .select()
      .from(c2cPackageSections)
      .where(eq(c2cPackageSections.packageDbId, pkg.id))
      .orderBy(c2cPackageSections.sortOrder);

    /* Readiness (validation + sections-with-counts) */
    const readinessRaw = await computePackageReadiness(orgId, pkg.id);
    const readiness: ReadinessLite = {
      overallReadinessPercent: readinessRaw.overallReadinessPercent,
      overallState:            readinessRaw.overallState,
      totalBlockers:           readinessRaw.totalBlockers,
      totalOverdue:            readinessRaw.totalOverdue,
      sections: readinessRaw.sections.map((s) => ({
        sectionDbId:           s.sectionDbId,
        sectionKey:            s.sectionKey,
        sectionLabel:          s.sectionLabel,
        totalArtifacts:        s.totalArtifacts,
        readyArtifacts:        s.readyArtifacts,
        readinessPercent:      s.readinessPercent,
        overallState:          s.overallState,
        openCriticalFindings:  s.openCriticalFindings,
        missingApprovals:      s.missingApprovals,
      })),
    };

    const readinessByDbId = new Map(readiness.sections.map((s) => [s.sectionDbId, s]));

    const ctx: PackageContext = {
      pkg,
      projectName: proj?.name ?? `Project ${pkg.projectId}`,
      projectCode: proj?.code ?? '',
      ownerName,
    };
    const submission = packageToSubmission(ctx, readiness);

    /* Build outline */
    const buildSections = sectionRows.map((s) => {
      const sr = readinessByDbId.get(s.id);
      const status = !sr
        ? 'empty'
        : sr.overallState === 'blocked'
          ? 'blocked'
          : sr.readinessPercent >= 100
            ? 'complete'
            : sr.readinessPercent >= 50
              ? 'review'
              : sr.readinessPercent > 0
                ? 'draft'
                : 'empty';
      return {
        id:     s.sectionKey,
        label:  s.sectionLabel,
        status,
        files:  sr?.totalArtifacts ?? 0,
      };
    });

    /* Validation summary */
    const validation = {
      profile:  readMetaString(pkg.metadata, 'validationProfile') ?? `${submission.type.toUpperCase()} validator`,
      runAt:    pkg.updatedAt.toISOString(),
      errors:   readiness.totalBlockers,
      warnings: readiness.sections.reduce((s, r) => s + Math.max(0, r.openCriticalFindings), 0),
      pass:     readiness.sections.reduce((s, r) => s + r.readyArtifacts, 0),
      sections: readiness.sections.map((s) => ({
        id:    s.sectionKey,
        label: s.sectionLabel,
        errs:  s.overallState === 'blocked' ? 1 : 0,
        warns: s.openCriticalFindings,
        ok:    s.readyArtifacts,
        ...(s.overallState === 'blocked' ? { blocker: `${s.sectionLabel} blocked` } : {}),
      })),
    };

    /* Signatures — surfaced from completedAt fields on workflow_approvals if a workflow exists.
       For now we surface a placeholder shape until the orchestrator exposes per-submission
       workflow lookup; adding a join here is the next iteration. */
    const signatures = {
      mode:    '21 CFR Part 11',
      signers: [] as Array<{
        who: string;
        role: string;
        when: string | null;
        status: 'queued' | 'pending' | 'signed' | 'rejected';
        audit: string;
      }>,
    };

    const detail = {
      summary:    pkg.description ?? `${submission.title} · ${submission.type.toUpperCase()}.`,
      build: {
        shape:       (readMetaString(pkg.metadata, 'buildShape') ?? 'estar') as
          | 'estar'
          | 'ectd'
          | 'ectd-pma'
          | 'cer'
          | 'eudamed'
          | 'ide',
        label:       `${submission.type.toUpperCase()} · ${buildSections.length} sections`,
        sections:    buildSections,
        totalFiles:  submission.files,
        totalBytes:  submission.bytes,
      },
      validation,
      signatures,
      package: {
        shape:    readMetaString(pkg.metadata, 'packageShape') ?? `${submission.type.toUpperCase()} ZIP`,
        filename: `${pkg.packageId}.zip`,
        size:     submission.bytes,
        checksum: 'pending',
        contents: [] as Array<{ name: string; bytes: string }>,
      },
      transmit: {
        gatewayLabel: submission.gateway,
        mode:         readMetaString(pkg.metadata, 'transmitMode') ?? '',
        to:           readMetaString(pkg.metadata, 'transmitTo') ?? '',
        readyToSend:  submission.stage === 'transmit' && submission.status === 'active',
      },
      receipt: { shape: 'esg', coreId: null, ack1: null, ack2: null, ack3: null } as
        | { shape: 'esg'; coreId: string | null; ack1: null; ack2: null; ack3: null }
        | { shape: string; [key: string]: unknown },
      aic:      [] as unknown[],
      activity: [] as Array<{ when: string; who: string; what: string }>,
      ...submission,
    };

    res.json({ data: detail });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
  }
});

export default router;
