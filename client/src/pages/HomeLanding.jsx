// Empty homepage - unauthorized content removed
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Clock, FileText, Loader2 } from 'lucide-react';
import { ectdModules, ECTD_DOCUMENT_TYPE } from '@/config/ectd-structure';
import { documentApiService } from '../services/DocumentAPIService';

const defaultOrganizationId = 1;

const normalizeMetadata = metadata => {
  if (!metadata) {
    return {};
  }

  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata);
    } catch (error) {
      console.warn('Unable to parse document metadata as JSON', error);
      return {};
    }
  }

  return metadata;
};

const matchesModule = (doc, moduleDefinition) => {
  const metadata = normalizeMetadata(doc.metadata);
  const moduleNumberCandidate = metadata.moduleNumber || metadata.module_number || metadata.module;
  const moduleCodeCandidate = metadata.moduleCode || metadata.module_code;

  if (moduleNumberCandidate && String(moduleNumberCandidate) === moduleDefinition.moduleNumber) {
    return true;
  }

  if (
    moduleCodeCandidate &&
    String(moduleCodeCandidate).toLowerCase() === moduleDefinition.code.toLowerCase()
  ) {
    return true;
  }

  if (typeof doc.name === 'string') {
    const name = doc.name.toLowerCase();
    const descriptor = `module ${moduleDefinition.moduleNumber}`;
    if (name.includes(descriptor.toLowerCase())) {
      return true;
    }
  }

  return false;
};

const getStatusVisuals = status => {
  if (!status) {
    return {
      label: 'Not started',
      badgeClass: 'bg-gray-100 text-gray-700 border border-gray-200',
      icon: Clock,
    };
  }

  const normalized = String(status).toLowerCase();

  if (normalized === 'final') {
    return {
      label: 'Ready for submission',
      badgeClass: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
      icon: CheckCircle2,
    };
  }

  return {
    label: 'In progress',
    badgeClass: 'bg-indigo-100 text-indigo-700 border border-indigo-200',
    icon: FileText,
  };
};

const HomeLanding = () => {
  const [moduleStatuses, setModuleStatuses] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [launching, setLaunching] = useState({});

  useEffect(() => {
    const fetchModuleDocuments = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const documents = await documentApiService.getDocuments({
          type: ECTD_DOCUMENT_TYPE,
          organizationId: defaultOrganizationId,
          limit: 100,
        });

        const nextStatusMap = {};

        documents.forEach(doc => {
          const matchingModule = ectdModules.find(module => matchesModule(doc, module));
          if (matchingModule) {
            nextStatusMap[matchingModule.code] = {
              document: doc,
              metadata: normalizeMetadata(doc.metadata),
            };
          }
        });

        setModuleStatuses(nextStatusMap);
      } catch (fetchError) {
        console.error('Failed to load eCTD documents', fetchError);
        setError('Unable to load eCTD module progress. Please retry.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchModuleDocuments();
  }, []);

  const moduleProgress = useMemo(() => {
    let completed = 0;
    let inProgress = 0;

    ectdModules.forEach(module => {
      const doc = moduleStatuses[module.code]?.document;
      if (!doc) {
        return;
      }

      const status = String(doc.status || '').toLowerCase();
      if (status === 'final') {
        completed += 1;
      } else {
        inProgress += 1;
      }
    });

    const total = ectdModules.length;
    const notStarted = total - completed - inProgress;

    return { completed, inProgress, notStarted, total };
  }, [moduleStatuses]);

  const handleLaunchModule = async moduleDefinition => {
    setLaunching(prev => ({ ...prev, [moduleDefinition.code]: true }));
    setError(null);

    try {
      let existingDoc = moduleStatuses[moduleDefinition.code]?.document;

      if (!existingDoc) {
        const results = await documentApiService.getDocuments({
          type: ECTD_DOCUMENT_TYPE,
          search: moduleDefinition.defaultDocument.name,
          organizationId: defaultOrganizationId,
          limit: 25,
        });

        existingDoc = results.find(doc => matchesModule(doc, moduleDefinition));
      }

      if (!existingDoc) {
        const payload = {
          ...moduleDefinition.defaultDocument,
          organizationId: defaultOrganizationId,
        };

        existingDoc = await documentApiService.createDocument(payload);
      }

      setModuleStatuses(prev => ({
        ...prev,
        [moduleDefinition.code]: {
          document: existingDoc,
          metadata: normalizeMetadata(existingDoc.metadata),
        },
      }));

      window.location.href = `/editor?documentId=${existingDoc.id}&module=${moduleDefinition.code}`;
    } catch (launchError) {
      console.error('Unable to open module workspace', launchError);
      setError('Unable to open the module workspace. Please try again.');
    } finally {
      setLaunching(prev => ({ ...prev, [moduleDefinition.code]: false }));
    }
  };

  const renderModuleCard = moduleDefinition => {
    const statusEntry = moduleStatuses[moduleDefinition.code];
    const statusDetails = getStatusVisuals(statusEntry?.document?.status);
    const UpdatedIcon = statusDetails.icon;

    let lastTouchedLabel = 'No document yet';
    const updatedAt = statusEntry?.document?.updated_at || statusEntry?.document?.updatedAt;

    if (updatedAt) {
      try {
        const formatted = new Date(updatedAt).toLocaleString();
        lastTouchedLabel = `Last updated ${formatted}`;
      } catch (error) {
        lastTouchedLabel = `Last updated ${updatedAt}`;
      }
    }

    return (
      <div
        key={moduleDefinition.code}
        className="flex flex-col rounded-xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
              Module {moduleDefinition.moduleNumber}
            </p>
            <h3 className="mt-1 text-xl font-semibold text-gray-900">
              {moduleDefinition.title}
            </h3>
          </div>
          <span className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${statusDetails.badgeClass}`}>
            <UpdatedIcon className="h-3.5 w-3.5" />
            {statusDetails.label}
          </span>
        </div>

        <p className="mt-3 text-sm text-gray-600">{moduleDefinition.description}</p>

        <div className="mt-4 grid grid-cols-1 gap-3 text-sm text-gray-700">
          <div>
            <p className="font-medium text-gray-900">Focus areas</p>
            <ul className="mt-2 space-y-1">
              {moduleDefinition.focusAreas.map(item => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-[5px] h-1.5 w-1.5 rounded-full bg-indigo-400"></span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="font-medium text-gray-900">Key documents</p>
            <ul className="mt-2 space-y-1">
              {moduleDefinition.keyDocuments.map(item => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-[5px] h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="font-medium text-gray-900">Readiness checklist</p>
            <ul className="mt-2 space-y-1">
              {moduleDefinition.readinessChecklist.map(item => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-[5px] h-1.5 w-1.5 rounded-full bg-slate-300"></span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 text-sm">
          <p className="text-gray-500">{lastTouchedLabel}</p>
          <button
            onClick={() => handleLaunchModule(moduleDefinition)}
            disabled={Boolean(launching[moduleDefinition.code])}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
          >
            {launching[moduleDefinition.code] ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Preparing workspace...
              </>
            ) : (
              <>
                Open workspace
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 py-12">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6">
        <header className="rounded-2xl bg-white p-8 shadow-sm border border-slate-200">
          <p className="text-sm font-semibold uppercase tracking-widest text-indigo-600">
            eCTD Project Dashboard
          </p>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">
            Coordinate every module before submission day
          </h1>
          <p className="mt-3 max-w-3xl text-base text-slate-600">
            Track module readiness, launch pre-configured workspaces, and keep administrative,
            quality, nonclinical, and clinical deliverables aligned in one place.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-4 text-sm text-slate-700 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase text-slate-500">Completed modules</p>
              <p className="mt-2 text-2xl font-semibold text-emerald-600">
                {moduleProgress.completed}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase text-slate-500">In progress</p>
              <p className="mt-2 text-2xl font-semibold text-indigo-600">
                {moduleProgress.inProgress}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase text-slate-500">Not started</p>
              <p className="mt-2 text-2xl font-semibold text-slate-700">
                {moduleProgress.notStarted}
              </p>
            </div>
          </div>
        </header>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {Array.from({ length: ectdModules.length }).map((_, index) => (
              <div
                key={index}
                className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white"
              >
                <div className="h-full w-full rounded-xl bg-gradient-to-b from-slate-100 to-white"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {ectdModules.map(moduleDefinition => renderModuleCard(moduleDefinition))}
          </div>
        )}
      </div>
    </div>
  );
};

export default HomeLanding;
