/**
 * SubmissionAppsPanel — Card-based launcher for role-usable document-producing apps.
 *
 * 6 apps: Evidence Memo, Protocol Rationale, Clinical Overview,
 *          Module 3 Builder, Risk-Benefit, Audit Report.
 *
 * Each app declares: target doc type, default CTD placement, template source,
 * required inputs, and governed output path.
 */

import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  getAllSubmissionApps,
  getSectionLabel,
  type SubmissionAppCandidate,
} from '../../models/ctdHierarchy';
import {
  FileText,
  FlaskConical,
  BookOpen,
  Layers,
  ShieldCheck,
  ClipboardList,
  Loader2,
  X,
  ChevronRight,
  CheckCircle,
  Sparkles,
  ArrowRight,
} from 'lucide-react';

// ── Auth helper ──
function getAuthHeaders(): Record<string, string> {
  const token =
    sessionStorage.getItem('trialsage_access_token') ||
    localStorage.getItem('trialsage_access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// App icon map
const APP_ICONS: Record<string, React.ReactNode> = {
  'evidence-memo': <FileText className="w-5 h-5 text-blue-500" />,
  'protocol-rationale': <FlaskConical className="w-5 h-5 text-violet-500" />,
  'clinical-overview': <BookOpen className="w-5 h-5 text-emerald-500" />,
  'module3-builder': <Layers className="w-5 h-5 text-cyan-500" />,
  'risk-benefit': <ShieldCheck className="w-5 h-5 text-amber-500" />,
  'audit-report': <ClipboardList className="w-5 h-5 text-red-500" />,
};

interface SubmissionAppsPanelProps {
  projectId?: string;
  projectName?: string;
  onClose: () => void;
  onCreateDraft: (title: string, ctdSection: string, templateKey?: string) => void;
  onOpenTransformCanvas?: (ctdSection: string, templateKey?: string) => void;
}

export const SubmissionAppsPanel: React.FC<SubmissionAppsPanelProps> = ({
  projectId,
  projectName,
  onClose,
  onCreateDraft,
  onOpenTransformCanvas,
}) => {
  const [selectedApp, setSelectedApp] = useState<SubmissionAppCandidate | null>(null);
  const [running, setRunning] = useState(false);
  const apps = getAllSubmissionApps();

  const handleRunApp = useCallback(async () => {
    if (!selectedApp || !projectId) return;
    setRunning(true);
    try {
      // Create governed draft via existing artifact creation endpoint
      const title = `${selectedApp.label} — ${projectName || 'Project'}`;
      const scaffoldContent = generateAppScaffold(selectedApp);
      const res = await fetch(`/api/concept2cure/projects/${projectId}/artifacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          title,
          content: scaffoldContent,
          type: selectedApp.targetDocType,
          category: 'document',
          ctdSection: selectedApp.defaultCtdSection,
          templateId: selectedApp.templateKey,
        }),
      });
      if (res.ok) {
        onCreateDraft(title, selectedApp.defaultCtdSection, selectedApp.templateKey);
      }
    } catch {
      /* silent */
    } finally {
      setRunning(false);
    }
  }, [selectedApp, projectId, projectName, onCreateDraft]);

  return (
    <div className="flex-1 flex flex-col bg-white min-h-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 h-10 border-b border-zinc-100 shrink-0">
        <Sparkles className="w-4 h-4 text-blue-500" />
        <h2 className="text-sm font-semibold text-zinc-800">Submission Apps</h2>
        {projectName && (
          <>
            <span className="text-zinc-300">·</span>
            <span className="text-xs text-zinc-500 truncate">{projectName}</span>
          </>
        )}
        <button
          onClick={onClose}
          className="ml-auto p-1 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
          aria-label="Close panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {!selectedApp ? (
          /* App grid */
          <div className="grid grid-cols-2 gap-3">
            {apps.map(app => (
              <button
                key={app.appId}
                onClick={() => setSelectedApp(app)}
                className="flex flex-col items-start gap-2 p-3 rounded-lg border border-zinc-100 hover:border-blue-200 hover:bg-blue-50/30 hover:shadow-sm hover:-translate-y-px transition-all duration-150 text-left focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none group"
              >
                <div className="flex items-center gap-2 w-full">
                  {APP_ICONS[app.appId] || <FileText className="w-5 h-5 text-zinc-400" />}
                  <span className="text-xs font-semibold text-zinc-800 flex-1">{app.label}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-300 group-hover:text-blue-400 transition-colors" />
                </div>
                <p className="text-[11px] text-zinc-500 leading-snug">{app.description}</p>
                <div className="flex items-center gap-2 mt-auto">
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500">
                    CTD {app.defaultCtdSection}
                  </span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500">
                    {app.targetDocType.replace(/_/g, ' ')}
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          /* App detail / run view */
          <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-200">
            <button
              onClick={() => setSelectedApp(null)}
              className="text-[11px] text-blue-600 hover:text-blue-700 font-medium focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none rounded group/back"
            >
              <span className="inline-block transition-transform duration-150 group-hover/back:-translate-x-0.5">
                ←
              </span>{' '}
              Back to apps
            </button>

            <div className="flex items-center gap-3">
              {APP_ICONS[selectedApp.appId] || <FileText className="w-6 h-6 text-zinc-400" />}
              <div>
                <h3 className="text-sm font-semibold text-zinc-800">{selectedApp.label}</h3>
                <p className="text-[11px] text-zinc-500">{selectedApp.description}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-zinc-50 border border-zinc-100">
              <div>
                <span className="text-[11px] text-zinc-400 uppercase tracking-wider">Creates</span>
                <p className="text-[12px] text-zinc-700 font-medium">
                  {selectedApp.targetDocType.replace(/_/g, ' ')}
                </p>
              </div>
              <div>
                <span className="text-[11px] text-zinc-400 uppercase tracking-wider">
                  CTD section
                </span>
                <p className="text-[12px] text-zinc-700 font-medium">
                  {selectedApp.defaultCtdSection} — {getSectionLabel(selectedApp.defaultCtdSection)}
                </p>
              </div>
              {selectedApp.templateKey && (
                <div>
                  <span className="text-[11px] text-zinc-400 uppercase tracking-wider">
                    Template
                  </span>
                  <p className="text-[12px] text-zinc-700 font-medium">{selectedApp.templateKey}</p>
                </div>
              )}
              <div>
                <span className="text-[11px] text-zinc-400 uppercase tracking-wider">
                  Required inputs
                </span>
                <p className="text-[12px] text-zinc-700">{selectedApp.requiredInputs.join(', ')}</p>
              </div>
            </div>

            {/* Transform & output path */}
            <div className="flex items-center gap-2 text-[11px] text-zinc-500">
              <span className="px-2 py-1 rounded bg-blue-50 text-blue-600 font-medium">Input</span>
              <ArrowRight className="w-3 h-3" />
              <span className="px-2 py-1 rounded bg-violet-50 text-violet-600 font-medium">
                Transform
              </span>
              <ArrowRight className="w-3 h-3" />
              <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-600 font-medium">
                Governed Draft
              </span>
              <ArrowRight className="w-3 h-3" />
              <span className="px-2 py-1 rounded bg-amber-50 text-amber-600 font-medium">
                Editor
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleRunApp}
                disabled={!projectId || running}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  'focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none',
                  projectId && !running
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                )}
              >
                {running ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                {running ? 'Creating...' : 'Create Governed Draft'}
              </button>
              {onOpenTransformCanvas && (
                <button
                  onClick={() =>
                    onOpenTransformCanvas(selectedApp.defaultCtdSection, selectedApp.templateKey)
                  }
                  className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium bg-zinc-50 text-zinc-600 hover:bg-zinc-100 border border-zinc-200 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Open in Canvas
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Scaffold generator ──
function generateAppScaffold(app: SubmissionAppCandidate): string {
  const sections: Record<string, string> = {
    'evidence-memo': `<h1>${app.label}</h1>
<h2>Executive Summary</h2><p>[Summarize key evidence findings]</p>
<h2>Evidence Sources</h2><p>[List CSR and precedent sources]</p>
<h2>Key Claims</h2><p>[Evidence-backed claims with citations]</p>
<h2>Gaps &amp; Limitations</h2><p>[Identify evidence gaps]</p>
<h2>Conclusions</h2><p>[Evidence-based conclusions]</p>`,

    'protocol-rationale': `<h1>${app.label}</h1>
<h2>Study Design Rationale</h2><p>[Justify the chosen study design]</p>
<h2>Endpoint Selection</h2><p>[Rationale for primary and secondary endpoints]</p>
<h2>Population Selection</h2><p>[Inclusion/exclusion criteria justification]</p>
<h2>Comparator Rationale</h2><p>[Active comparator or placebo rationale]</p>
<h2>Statistical Considerations</h2><p>[Sample size and analysis plan rationale]</p>`,

    'clinical-overview': `<h1>${app.label}</h1>
<h2>2.5.1 Product Development Rationale</h2><p>[Describe development rationale]</p>
<h2>2.5.2 Overview of Clinical Pharmacology</h2><p>[Clinical pharmacology summary]</p>
<h2>2.5.3 Overview of Efficacy</h2><p>[Efficacy data summary]</p>
<h2>2.5.4 Overview of Safety</h2><p>[Safety data summary]</p>
<h2>2.5.5 Benefits and Risks Conclusions</h2><p>[Benefit-risk assessment]</p>`,

    'module3-builder': `<h1>${app.label}</h1>
<h2>3.2.S Drug Substance</h2>
<h3>3.2.S.1 General Information</h3><p>[Nomenclature, structure, properties]</p>
<h3>3.2.S.2 Manufacture</h3><p>[Manufacturing process description]</p>
<h3>3.2.S.3 Characterisation</h3><p>[Structural characterisation]</p>
<h3>3.2.S.4 Control of Drug Substance</h3><p>[Specifications and methods]</p>`,

    'risk-benefit': `<h1>${app.label}</h1>
<h2>Benefit Assessment</h2><p>[Therapeutic benefits with evidence]</p>
<h2>Risk Assessment</h2><p>[Known and potential risks]</p>
<h2>Risk Minimization Measures</h2><p>[Proposed risk management]</p>
<h2>Benefit-Risk Balance</h2><p>[Overall assessment with uncertainties]</p>
<h2>Conclusions</h2><p>[Final benefit-risk determination]</p>`,

    'audit-report': `<h1>${app.label}</h1>
<h2>Audit Scope</h2><p>[Define audit scope and objectives]</p>
<h2>Document Inventory</h2><p>[List all artifacts under audit]</p>
<h2>Integrity Verification</h2><p>[Hash chain and version verification]</p>
<h2>Signature Verification</h2><p>[Electronic signature audit]</p>
<h2>Findings</h2><p>[Audit findings and observations]</p>
<h2>Compliance Determination</h2><p>[Overall compliance status]</p>`,
  };

  return sections[app.appId] || `<h1>${app.label}</h1><p>Generated document scaffold.</p>`;
}

export default SubmissionAppsPanel;
