import { db } from '../../db';
import { concept2cureArtifacts, projects, sections } from '@shared/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { ReportScope } from '@shared/schema/report-os';
import {
  evaluateReadiness,
  type SectionStatus as ReadinessSectionStatus,
  type ArtifactStatus as ReadinessArtifactStatus,
} from '../regulatory/readinessEvaluator';
import {
  buildPackageManifest,
  type ProjectSectionData,
  type ProjectArtifactData,
} from '../regulatory/submissionPackageBuilder';
import { resolveRegistryId } from '../regulatory/registry/legacySubmissionTypeMapper';

export interface ProviderResult {
  provider: string;
  observedAt: string;
  status: 'ready' | 'partial' | 'missing';
  blocker?: string;
}

export interface RunComputationResult {
  providers: ProviderResult[];
  confidence: number;
  blockers: string[];
  summary: Record<string, unknown>;
}

export async function computeInitialRun(
  organizationId: number,
  scopeType: ReportScope,
  scopeId: string,
  options?: {
    programProjectIds?: number[];
    explicitRegistryId?: string;
    explicitSubmissionType?: string;
  }
): Promise<RunComputationResult> {
  const providers: ProviderResult[] = [];
  const blockers: string[] = [];

  // Provider 1: artifact availability
  let artifactCount = 0;
  let approvedOrLockedCount = 0;
  let reviewCount = 0;
  let draftCount = 0;
  const collectLifecycle = async (projectIds: number[]) => {
    if (projectIds.length === 0) return;
    const rows = await db
      .select({
        status: concept2cureArtifacts.status,
        count: sql<number>`count(*)::int`,
      })
      .from(concept2cureArtifacts)
      .where(
        and(
          eq(concept2cureArtifacts.organizationId, organizationId),
          inArray(concept2cureArtifacts.projectId, projectIds)
        )
      )
      .groupBy(concept2cureArtifacts.status);

    for (const row of rows) {
      const status = (row.status || '').toLowerCase();
      const count = row.count ?? 0;
      artifactCount += count;
      if (status === 'approved' || status === 'locked') approvedOrLockedCount += count;
      else if (status === 'review' || status === 'in_review' || status === 'in-review') reviewCount += count;
      else draftCount += count;
    }
  };

  if (scopeType === 'project' || scopeType === 'submission' || scopeType === 'document') {
    const projectId = Number(scopeId);
    if (Number.isFinite(projectId)) {
      await collectLifecycle([projectId]);
    }
  }
  if (scopeType === 'program') {
    const projectIds = options?.programProjectIds ?? [];
    if (projectIds.length > 0) {
      await collectLifecycle(projectIds);
    }
  }

  if (artifactCount > 0) {
    providers.push({ provider: 'artifact_state', observedAt: new Date().toISOString(), status: 'ready' });
  } else {
    providers.push({ provider: 'artifact_state', observedAt: new Date().toISOString(), status: 'partial', blocker: 'No governed artifacts discovered for this scope' });
    blockers.push('No governed artifacts discovered for this scope');
  }

  const readinessStatus: ProviderResult['status'] =
    approvedOrLockedCount > 0 ? 'ready' : artifactCount > 0 ? 'partial' : 'missing';
  const readinessBlocker =
    readinessStatus === 'ready'
      ? undefined
      : readinessStatus === 'partial'
        ? 'No approved or locked artifacts in current scope'
        : 'No artifacts available to compute readiness';
  providers.push({
    provider: 'submission_readiness',
    observedAt: new Date().toISOString(),
    status: readinessStatus,
    blocker: readinessBlocker,
  });
  if (readinessBlocker) blockers.push(readinessBlocker);

  // Provider 3: compliance/audit derived from governed lifecycle evidence.
  const complianceStatus: ProviderResult['status'] =
    approvedOrLockedCount > 0 ? 'ready' : reviewCount > 0 ? 'partial' : 'missing';
  const complianceBlocker =
    complianceStatus === 'ready'
      ? undefined
      : complianceStatus === 'partial'
        ? 'Artifacts are in review but not approved/locked for regulated audit posture'
        : 'No governed artifacts available for compliance evidence';
  providers.push({
    provider: 'compliance_audit',
    observedAt: new Date().toISOString(),
    status: complianceStatus,
    blocker: complianceBlocker,
  });
  if (complianceBlocker) blockers.push(complianceBlocker);

  // Provider 4/5: regional registry readiness + package completeness (project scopes)
  if (scopeType === 'project') {
    const projectId = Number(scopeId);
    if (Number.isFinite(projectId) && projectId > 0) {
      const [project] = await db
        .select({ metadata: projects.metadata })
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)))
        .limit(1);

      const metadata = (project?.metadata ?? {}) as Record<string, unknown>;
      const rawRegistryId = typeof metadata.registryId === 'string' ? metadata.registryId : undefined;
      const rawSubmissionType =
        typeof metadata.submissionType === 'string' ? metadata.submissionType : undefined;
      const registryId = rawRegistryId || (rawSubmissionType ? resolveRegistryId(rawSubmissionType) : null);

      if (!registryId) {
        providers.push({
          provider: 'regional_registry_readiness',
          observedAt: new Date().toISOString(),
          status: 'partial',
          blocker: 'Project is missing registryId/submissionType in metadata',
        });
        blockers.push('Regional readiness unavailable: project metadata has no registry context');
      } else {
        const [sectionRows, artifactRows] = await Promise.all([
          db
            .select({
              sectionId: sections.sectionId,
              status: sections.status,
              metadata: sections.metadata,
              title: sections.title,
            })
            .from(sections)
            .where(
              and(eq(sections.organizationId, organizationId), eq(sections.projectId, projectId))
            ),
          db
            .select({
              type: concept2cureArtifacts.type,
              status: concept2cureArtifacts.status,
              title: concept2cureArtifacts.title,
              templateId: concept2cureArtifacts.templateId,
              ctdSection: concept2cureArtifacts.ctdSection,
              metadata: concept2cureArtifacts.metadata,
            })
            .from(concept2cureArtifacts)
            .where(
              and(
                eq(concept2cureArtifacts.organizationId, organizationId),
                eq(concept2cureArtifacts.projectId, projectId)
              )
            ),
        ]);

        const projectSections: ProjectSectionData[] = sectionRows.map(row => ({
          code:
            (row.metadata as any)?.sectionCode ||
            (row.metadata as any)?.code ||
            row.sectionId ||
            row.title ||
            'unknown',
          status: row.status || 'not_started',
          documentIds: [],
        }));

        const inferArtifactType = (row: {
          type: string;
          title: string;
          templateId: string | null;
          ctdSection: string | null;
          metadata: unknown;
        }): string => {
          const explicit =
            typeof (row.metadata as any)?.artifactType === 'string'
              ? String((row.metadata as any).artifactType).toLowerCase()
              : null;
          if (explicit) return explicit;

          const text = [row.type, row.title, row.templateId || '', row.ctdSection || '']
            .join(' ')
            .toLowerCase();
          if (text.includes('1571')) return 'form_1571';
          if (text.includes('1572')) return 'form_1572';
          if (text.includes('3674')) return 'form_3674';
          if (text.includes('356h')) return 'form_356h';
          if (text.includes('cover letter')) return 'cover_letter';
          if (text.includes('table of contents') || text.includes(' toc ')) return 'toc';
          if (text.includes('clinical overview')) return 'clinical_overview';
          if (text.includes('quality overall summary') || text.includes('qos'))
            return 'quality_overall_summary';
          if (text.includes('nonclinical overview')) return 'nonclinical_overview';
          if (text.includes('investigator brochure') || text.includes(' ib ')) return 'investigator_brochure';
          if (text.includes('protocol')) return 'protocol';
          if (text.includes('device description')) return 'device_description';
          if (text.includes('predicate')) return 'predicate_comparison';
          if (text.includes('performance') && text.includes('test')) return 'performance_testing';
          if (text.includes('label')) return 'labeling';
          if (text.includes('rmp')) return 'rmp';
          if (text.includes('impd')) return 'impd';
          if (text.includes('smpc')) return 'smpc';
          if (text.includes('package leaflet') || text.includes('pil')) return 'pil';
          if (text.includes('csr') || text.includes('clinical study report')) return 'csr';
          return row.type.toLowerCase();
        };

        const projectArtifacts: ProjectArtifactData[] = artifactRows.map(row => ({
          type: inferArtifactType(row),
          status: row.status || 'draft',
          documentId: row.templateId || undefined,
        }));

        const readinessInput: {
          registryIdOrLegacy: string;
          sections: ReadinessSectionStatus[];
          artifacts: ReadinessArtifactStatus[];
        } = {
          registryIdOrLegacy: registryId,
          sections: projectSections.map(section => ({
            code: section.code,
            title: section.code,
            status: section.status,
            artifactCount: 0,
          })),
          artifacts: projectArtifacts.map(artifact => ({
            type: artifact.type,
            status: artifact.status,
          })),
        };
        const readiness = evaluateReadiness(readinessInput);
        const packageManifest = buildPackageManifest(
          registryId,
          String(projectId),
          projectSections,
          projectArtifacts
        );

        providers.push({
          provider: 'regional_registry_readiness',
          observedAt: new Date().toISOString(),
          status:
            readiness.level === 'ready'
              ? 'ready'
              : readiness.level === 'nearly_ready' || readiness.level === 'in_progress'
                ? 'partial'
                : 'missing',
          blocker:
            readiness.gaps.length > 0
              ? `${readiness.gaps.length} regulatory gaps detected (${readiness.applicationDisplayName})`
              : undefined,
        });
        if (readiness.gaps.length > 0) {
          blockers.push(
            ...readiness.gaps
              .filter(gap => gap.severity === 'critical')
              .slice(0, 4)
              .map(gap => `${gap.title}: ${gap.message}`)
          );
        }

        providers.push({
          provider: 'regional_package_manifest',
          observedAt: new Date().toISOString(),
          status: packageManifest?.metadata.packageComplete ? 'ready' : 'partial',
          blocker: packageManifest?.metadata.packageComplete
            ? undefined
            : 'Required package sections/artifacts are incomplete',
        });
        if (readiness.regionalWarnings.length > 0) {
          blockers.push(...readiness.regionalWarnings.slice(0, 2));
        }

        const readinessSummary = {
          registryId,
          applicationDisplayName: readiness.applicationDisplayName,
          dossierStandard: readiness.dossierStandard,
          readinessScore: readiness.score,
          readinessLevel: readiness.level,
          requiredSections: readiness.sectionReadiness.required,
          completedSections: readiness.sectionReadiness.completed,
          requiredArtifacts: readiness.artifactReadiness.required,
          presentArtifacts: readiness.artifactReadiness.present,
          missingArtifacts: readiness.artifactReadiness.missing.slice(0, 8),
          regionalWarnings: readiness.regionalWarnings,
        };

        const confidenceBase = Math.max(25, Math.min(95, 95 - blockers.length * 20));
        const confidence = Math.round(confidenceBase * 0.55 + readiness.score * 0.45);
        return {
          providers,
          confidence: Math.max(25, Math.min(95, confidence)),
          blockers,
          summary: {
            scopeType,
            scopeId,
            artifactCount,
            lifecycle: {
              approvedOrLockedCount,
              reviewCount,
              draftCount,
            },
            regulatory: readinessSummary,
          },
        };
      }
    }
  }

  const confidence = Math.max(25, Math.min(95, 95 - blockers.length * 20));

  return {
    providers,
    confidence,
    blockers,
    summary: {
      scopeType,
      scopeId,
      artifactCount,
      lifecycle: {
        approvedOrLockedCount,
        reviewCount,
        draftCount,
      },
    },
  };
}
