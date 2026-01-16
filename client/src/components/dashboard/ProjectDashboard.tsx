import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import type { LucideIcon } from 'lucide-react';
import { CheckCircle2, Circle, Edit3, Loader2 } from 'lucide-react';
import { IND_PYRAMID, INDModule, INDSection, ECTD_DOCUMENT_TYPE } from '@/config/ectd-structure';
import { documentApiService } from '@/services/DocumentAPIService';

const DEFAULT_ORGANIZATION_ID = 1;

type SectionProgressStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

type StatusPresentation = {
  label: string;
  className: string;
  icon: LucideIcon;
};

const getStatusPresentation = (status: SectionProgressStatus): StatusPresentation => {
  switch (status) {
    case 'COMPLETED':
      return {
        label: 'Completed',
        className: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
        icon: CheckCircle2,
      };
    case 'IN_PROGRESS':
      return {
        label: 'In drafting',
        className: 'bg-indigo-100 text-indigo-700 border border-indigo-200',
        icon: Edit3,
      };
    default:
      return {
        label: 'Not started',
        className: 'bg-slate-100 text-slate-700 border border-slate-200',
        icon: Circle,
      };
  }
};

const parseMetadata = (metadata: unknown): Record<string, any> => {
  if (!metadata) {
    return {};
  }

  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata);
    } catch (error) {
      console.warn('Unable to parse metadata JSON for document.', error);
      return {};
    }
  }

  if (typeof metadata === 'object') {
    return metadata as Record<string, any>;
  }

  return {};
};

const formatTimestamp = (value?: string | null) => {
  if (!value) {
    return 'Not yet modified';
  }

  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  } catch (error) {
    console.warn('Unable to format timestamp', error);
    return value;
  }
};

type TemplateContext = {
  drugName: string;
  company: string;
  date: string;
};

const getTemplateContext = (): TemplateContext => ({
  drugName: 'C2C-101',
  company: 'My Biotech Co',
  date: new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }),
});

const applyTemplateContext = (html: string, context: TemplateContext) =>
  html
    .replace(/{{DrugName}}/g, context.drugName)
    .replace(/{{Company}}/g, context.company)
    .replace(/{{Date}}/g, context.date);

const findMatchingDocument = (
  documents: ApiDocument[],
  targetSection: INDSection,
): ApiDocument | undefined => {
  return documents.find(document => {
    const metadata = parseMetadata(document.metadata);
    const metadataSection =
      metadata.ectdId || metadata.sectionId || metadata.section || metadata.ctdPath;

    if (metadataSection && String(metadataSection).toLowerCase() === targetSection.sectionId.toLowerCase()) {
      return true;
    }

    const name = (document.name || document.title || '').toLowerCase();
    if (!name) {
      return false;
    }

    if (name.includes(targetSection.sectionId.toLowerCase())) {
      return true;
    }

    const combined = `${targetSection.sectionId} ${targetSection.title}`.toLowerCase();
    return name.includes(combined);
  });
};

type ApiDocument = {
  id: number | string;
  documentId?: number | string;
  name?: string;
  title?: string;
  status?: string;
  content?: any;
  metadata?: any;
  document?: any;
  updated_at?: string | null;
  updatedAt?: string | null;
  created_at?: string | null;
};

type SectionState = {
  document?: ApiDocument;
  metadata: Record<string, any>;
};

const deriveSectionStatus = (state?: SectionState): SectionProgressStatus => {
  if (!state?.document) {
    return 'NOT_STARTED';
  }

  const raw =
    state.metadata?.status ??
    state.metadata?.progressStatus ??
    state.metadata?.workflowStatus ??
    state.metadata?.stage ??
    state.document.status ??
    '';

  const normalized = raw.toString().trim().toUpperCase();

  if (
    normalized === 'COMPLETED' ||
    normalized === 'COMPLETE' ||
    normalized === 'DONE' ||
    normalized === 'FINAL' ||
    normalized === 'APPROVED' ||
    normalized === 'SUBMITTED'
  ) {
    return 'COMPLETED';
  }

  if (
    normalized === 'IN_PROGRESS' ||
    normalized === 'DRAFT' ||
    normalized === 'DRAFTING' ||
    normalized === 'IN_DRAFT' ||
    normalized === 'STARTED' ||
    normalized === 'ACTIVE' ||
    normalized === 'OPEN'
  ) {
    return 'IN_PROGRESS';
  }

  return 'IN_PROGRESS';
};

const ProjectDashboard: React.FC = () => {
  const [, navigate] = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sectionStates, setSectionStates] = useState<Record<string, SectionState>>({});
  const [launching, setLaunching] = useState<Record<string, boolean>>({});

  const loadDocuments = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = (await documentApiService.getDocuments({
        type: ECTD_DOCUMENT_TYPE,
        organizationId: DEFAULT_ORGANIZATION_ID,
        limit: 200,
      })) as ApiDocument[];

      const nextState: Record<string, SectionState> = {};

      IND_PYRAMID.forEach(module => {
        module.sections.forEach(section => {
          const existing = findMatchingDocument(response, section);
          nextState[section.sectionId] = {
            document: existing,
            metadata: existing ? parseMetadata(existing.metadata) : {},
          };
        });
      });

      setSectionStates(nextState);
    } catch (fetchError) {
      console.error('Failed to load eCTD documents', fetchError);
      setError('Unable to load module readiness. Please retry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  const progressSummary = useMemo(() => {
    let completed = 0;
    let drafting = 0;
    let notStarted = 0;

    IND_PYRAMID.forEach(module => {
      module.sections.forEach(section => {
        const status = deriveSectionStatus(sectionStates[section.sectionId]);

        if (status === 'COMPLETED') {
          completed += 1;
          return;
        }

        if (status === 'IN_PROGRESS') {
          drafting += 1;
          return;
        }

        notStarted += 1;
      });
    });

    const total = completed + drafting + notStarted;
    return {
      completed,
      drafting,
      notStarted,
      total,
    };
  }, [sectionStates]);

  const upsertDocumentForSection = async (
    module: INDModule,
    section: INDSection,
  ): Promise<ApiDocument> => {
    let existing = sectionStates[section.sectionId]?.document;

    if (!existing) {
      const lookup = (await documentApiService.getDocuments({
        type: ECTD_DOCUMENT_TYPE,
        search: section.sectionId,
        organizationId: DEFAULT_ORGANIZATION_ID,
        limit: 50,
      })) as ApiDocument[];

      existing = findMatchingDocument(lookup, section);
    }

    if (existing) {
      return existing;
    }

    const context = getTemplateContext();
    const payload = {
      name: `${section.sectionId} ${section.title}`,
      title: `${section.sectionId} ${section.title}`,
      type: ECTD_DOCUMENT_TYPE,
      documentType: ECTD_DOCUMENT_TYPE,
      status: 'draft',
      description: `${section.title} workspace generated from the Project Dashboard.`,
      tags: ['ectd', 'ind', section.sectionId],
      content: {
        html: applyTemplateContext(section.defaultContent, context),
        sectionId: section.sectionId,
        moduleNumber: section.moduleNumber,
        moduleTitle: section.moduleTitle,
        context,
      },
      metadata: {
        ectdId: section.sectionId,
        moduleNumber: section.moduleNumber,
        moduleTitle: section.moduleTitle,
        status: 'IN_PROGRESS',
        progressStatus: 'IN_PROGRESS',
        source: 'project-dashboard',
        context,
      },
      organizationId: DEFAULT_ORGANIZATION_ID,
    };

    const created = (await documentApiService.createDocument(payload)) as ApiDocument;
    return created;
  };

  const handleOpenSection = async (module: INDModule, section: INDSection) => {
    setLaunching(prev => ({ ...prev, [section.sectionId]: true }));
    setError(null);

    try {
      const resolvedDocument = await upsertDocumentForSection(module, section);
      const metadata = parseMetadata(resolvedDocument.metadata);

      setSectionStates(prev => ({
        ...prev,
        [section.sectionId]: {
          document: resolvedDocument,
          metadata,
        },
      }));

      const documentId =
        resolvedDocument?.id ??
        resolvedDocument?.documentId ??
        resolvedDocument?.document?.id;

      if (!documentId) {
        throw new Error('Document ID missing from API response');
      }

      navigate(`/editor/${documentId}`);
    } catch (launchError) {
      console.error('Failed to open section workspace', launchError);
      const message =
        launchError instanceof Error && launchError.message
          ? `Unable to open the selected module. ${launchError.message}`
          : 'Unable to open the selected module. Please try again.';
      setError(message);
    } finally {
      setLaunching(prev => ({ ...prev, [section.sectionId]: false }));
    }
  };

  const renderSectionCard = (module: INDModule, section: INDSection) => {
    const state = sectionStates[section.sectionId];
    const status = deriveSectionStatus(state);
    const presentation = getStatusPresentation(status);
    const StatusIcon = presentation.icon;
    const timestamp = state?.document?.updated_at || state?.document?.updatedAt || state?.document?.created_at;
    const actionLabel =
      status === 'NOT_STARTED'
        ? 'Start Draft'
        : status === 'COMPLETED'
        ? 'View Document'
        : 'Resume Editing';
    const lastModifiedLabel =
      status === 'NOT_STARTED' ? 'Draft not yet started' : formatTimestamp(timestamp);

    return (
      <button
        key={section.sectionId}
        onClick={() => handleOpenSection(module, section)}
        disabled={Boolean(launching[section.sectionId])}
        className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm transition-all hover:-translate-y-1 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-75"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
              {section.sectionId}
            </p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">{section.title}</h3>
          </div>
          <span className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${presentation.className}`}>
            <StatusIcon className="h-3.5 w-3.5" />
            {presentation.label}
          </span>
        </div>

        <p className="mt-3 line-clamp-3 text-sm text-slate-600">
          {section.defaultContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}
        </p>

        <div className="mt-6 flex items-center justify-between text-xs text-slate-500">
          <span>{lastModifiedLabel}</span>
          {launching[section.sectionId] ? (
            <span className="flex items-center gap-2 text-indigo-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Preparing...
            </span>
          ) : (
            <span className="text-sm font-semibold text-indigo-600">{actionLabel}</span>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 py-12">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-indigo-600">
            eCTD Project Dashboard
          </p>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">
            Command center for your IND submission
          </h1>
          <p className="mt-3 max-w-3xl text-base text-slate-600">
            Monitor readiness across every eCTD module, launch curated workspaces with FDA-standard
            templates, and keep the Enhanced Document Editor, Study Data panel, and AI Co-Pilot aligned
            from a single control surface.
          </p>
          <div className="mt-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase text-slate-500">Completed sections</p>
              <p className="mt-2 text-2xl font-semibold text-emerald-600">{progressSummary.completed}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase text-slate-500">In drafting</p>
              <p className="mt-2 text-2xl font-semibold text-indigo-600">{progressSummary.drafting}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase text-slate-500">Not started</p>
              <p className="mt-2 text-2xl font-semibold text-slate-700">{progressSummary.notStarted}</p>
            </div>
          </div>
        </header>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="h-48 animate-pulse rounded-xl border border-slate-200 bg-white"
              >
                <div className="h-full w-full rounded-xl bg-gradient-to-b from-slate-100 to-white" />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-12">
            {IND_PYRAMID.map(module => (
              <section key={module.moduleNumber} className="flex flex-col gap-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-500">
                    Module {module.moduleNumber}
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-900">{module.moduleTitle}</h2>
                </div>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  {module.sections.map(section => renderSectionCard(module, section))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectDashboard;
