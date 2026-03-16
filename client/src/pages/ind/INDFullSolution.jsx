import React, { useState, useEffect } from 'react';
import { Link } from 'wouter';
import {
  FileText,
  ChevronRight,
  Package,
  Check,
  BookOpen,
  FilePlus,
  FileSymlink,
  AlertCircle,
  Zap,
  Workflow,
  Clock,
  BarChart,
  Activity,
  HeartPulse,
  ArrowRight,
  Share2,
  Globe,
  CheckSquare,
  FileCheck,
  Rocket,
  Building,
  Briefcase,
  Users,
  Loader2,
  Bot,
  Sparkles,
} from 'lucide-react';
import { useToast } from '../../hooks/use-toast';
import { apiRequest } from '../../lib/queryClient';
import ExampleReportPackages from '../../components/ExampleReportPackages';

export default function INDFullSolution() {
  const COAUTHOR_IMPORT_KEY = 'coauthor_pending_canvas_import';
  const [activeTab, setActiveTab] = useState('ind-templates');
  const [isLoading, setIsLoading] = useState(false);
  const [isCreatingFromDocs, setIsCreatingFromDocs] = useState(false);
  const [templateWorkflowResults, setTemplateWorkflowResults] = useState({});
  const [moduleReviewActions, setModuleReviewActions] = useState({});
  const [guidedFamily, setGuidedFamily] = useState('ind');
  const [guidedTemplateId, setGuidedTemplateId] = useState('1');
  const [focusedTemplateId, setFocusedTemplateId] = useState(null);
  const [kpiWindowDays, setKpiWindowDays] = useState(7);
  const [indStats, setIndStats] = useState({
    totalSubmissions: 842,
    successRate: 98.4,
    averagePreparationTime: 14.2,
    avgCostSavings: 187500,
    kpiEvents: {
      totalTracked: 0,
      uploadStarted: 0,
      draftGenerated: 0,
      sectionAccepted: 0,
      sectionRewritten: 0,
      exportTriggered: 0,
      last24Hours: {
        uploadStarted: 0,
        draftGenerated: 0,
        sectionAccepted: 0,
        sectionRewritten: 0,
        exportTriggered: 0,
      },
    },
    kpiTrends: {
      windowDays: 7,
      rows: [],
    },
    kpiDerived: {
      window: {
        acceptanceRatio: 0,
        draftToExportConversion: 0,
      },
      lifetime: {
        acceptanceRatio: 0,
        draftToExportConversion: 0,
      },
    },
    kpiAttribution: {
      total: {
        standardFlow: 0,
        riskAlert: 0,
      },
      last24Hours: {
        standardFlow: 0,
        riskAlert: 0,
      },
    },
    kpiDeltas: {
      windowDays: 7,
      acceptanceRatioDelta: 0,
      draftToExportConversionDelta: 0,
      interventionShareDelta: 0,
    },
  });
  const { toast } = useToast();

  const acceptanceRatio = indStats.kpiDerived?.window?.acceptanceRatio ?? 0;
  const draftToExportConversion = indStats.kpiDerived?.window?.draftToExportConversion ?? 0;
  const acceptanceAtRisk = acceptanceRatio < 60;
  const conversionAtRisk = draftToExportConversion < 30;
  const standardFlowEvents24h = indStats.kpiAttribution?.last24Hours?.standardFlow ?? 0;
  const riskAlertEvents24h = indStats.kpiAttribution?.last24Hours?.riskAlert ?? 0;
  const interventionDenominator24h = standardFlowEvents24h + riskAlertEvents24h;
  const interventionShare24h =
    interventionDenominator24h > 0
      ? Math.round((riskAlertEvents24h / interventionDenominator24h) * 1000) / 10
      : 0;
  const interventionShareAtRisk = interventionShare24h > 40;
  const acceptanceRatioDelta = indStats.kpiDeltas?.acceptanceRatioDelta ?? 0;
  const draftToExportConversionDelta = indStats.kpiDeltas?.draftToExportConversionDelta ?? 0;
  const interventionShareDelta = indStats.kpiDeltas?.interventionShareDelta ?? 0;

  // Handle template download
  const handleDownloadTemplate = async templateId => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/ind-templates/template/${templateId}/download`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `IND_Template_${templateId}.zip`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast({
          title: 'Download Started',
          description: 'IND template package is downloading...',
        });
      } else {
        throw new Error('Download failed');
      }
    } catch (error) {
      toast({
        title: 'Download Error',
        description: 'Failed to download template. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle module download
  const handleDownloadModule = async moduleId => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/ind-templates/module/${moduleId}/download`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `IND_Module_${moduleId}.zip`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast({
          title: 'Download Started',
          description: 'IND module is downloading...',
        });
      } else {
        throw new Error('Download failed');
      }
    } catch (error) {
      toast({
        title: 'Download Error',
        description: 'Failed to download module. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle template creation
  const handleCreateTemplate = async templateId => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/ind-templates/template/${templateId}/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (response.ok) {
        const data = await response.json();
        toast({
          title: 'Template Created',
          description: `New IND project created with ID: ${data.projectId}`,
        });
        // Navigate to the created project
        window.location.href = `/ind-wizard/project/${data.projectId}`;
      } else {
        throw new Error('Creation failed');
      }
    } catch (error) {
      toast({
        title: 'Creation Error',
        description: 'Failed to create template. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateFromDocuments = template => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt';

    input.onchange = async event => {
      const files = Array.from(event.target?.files || []);
      if (!files.length) {
        return;
      }

      try {
        setIsCreatingFromDocs(true);
        const formData = new FormData();
        formData.append('projectName', template.title);
        files.forEach(file => formData.append('files', file));

        const response = await fetch(
          `/api/ind-templates/template/${template.id}/create-with-documents`,
          {
            method: 'POST',
            body: formData,
          }
        );

        if (!response.ok) {
          throw new Error('Failed to create IND project from documents');
        }

        const result = await response.json();

        setTemplateWorkflowResults(prev => ({
          ...prev,
          [template.id]: result,
        }));

        toast({
          title: 'IND Project Created',
          description: `Generated ${Object.keys(result.moduleDrafts || {}).length} module drafts and prepared Canvas + DOCX workflow outputs.`,
        });

        localStorage.setItem(
          COAUTHOR_IMPORT_KEY,
          JSON.stringify({
            projectId: result.projectId,
            projectName: result.projectName,
            templateId: result.templateId,
            specialization: result.specialization,
            editorJson: result.canvasEditorJson,
            moduleDrafts: result.moduleDrafts,
            moduleAssessments: result.moduleAssessments,
            reviewActions: result.reviewActions || {},
            createdAt: result.created,
          })
        );

        toast({
          title: 'Opening Canvas Editor',
          description: 'Loading your generated IND draft into the editor session...',
        });

        setTimeout(() => {
          window.location.href = '/coauthor?source=ind-templates';
        }, 250);
      } catch (error) {
        toast({
          title: 'Creation Error',
          description: 'Failed to create IND project from uploaded documents.',
          variant: 'destructive',
        });
      } finally {
        setIsCreatingFromDocs(false);
      }
    };

    input.click();
  };

  const handleDownloadWorkflowDocx = async url => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to download generated DOCX');
      }

      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = 'generated_ind_project.docx';
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(objectUrl);
      document.body.removeChild(link);
    } catch (error) {
      toast({
        title: 'Download Error',
        description: 'Unable to download generated DOCX artifact.',
        variant: 'destructive',
      });
    }
  };

  const handleDownloadCanvasJson = async url => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to download Canvas JSON');
      }

      const payload = await response.json();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = 'ind_canvas_editor.json';
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(objectUrl);
      document.body.removeChild(link);
    } catch (error) {
      toast({
        title: 'Download Error',
        description: 'Unable to download Canvas JSON artifact.',
        variant: 'destructive',
      });
    }
  };

  const getWorkflowReviewActions = workflowResult => {
    if (!workflowResult?.projectId) {
      return workflowResult?.reviewActions || {};
    }

    const statefulActions = Object.entries(moduleReviewActions).reduce((acc, [key, value]) => {
      if (key.startsWith(`${workflowResult.projectId}:`)) {
        const moduleName = key.slice(`${workflowResult.projectId}:`.length);
        acc[moduleName] = value;
      }
      return acc;
    }, {});

    return {
      ...(workflowResult.reviewActions || {}),
      ...statefulActions,
    };
  };

  const getModuleReviewAction = (projectId, moduleName, fallbackActions = {}) => {
    if (!projectId) {
      return fallbackActions[moduleName] || 'pending';
    }

    const key = `${projectId}:${moduleName}`;
    return moduleReviewActions[key] || fallbackActions[moduleName] || 'pending';
  };

  const setModuleReviewAction = async (projectId, templateId, moduleName, action) => {
    if (!projectId) {
      return;
    }

    const key = `${projectId}:${moduleName}`;
    setModuleReviewActions(prev => ({
      ...prev,
      [key]: action,
    }));

    setTemplateWorkflowResults(prev => {
      const workflowResult = prev?.[templateId];
      if (!workflowResult) return prev;

      return {
        ...prev,
        [templateId]: {
          ...workflowResult,
          reviewActions: {
            ...(workflowResult.reviewActions || {}),
            [moduleName]: action,
          },
        },
      };
    });

    try {
      await fetch(`/api/ind-templates/projects/${projectId}/review-actions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ moduleName, action }),
      });
    } catch (error) {
      console.error('Failed to persist module review action:', error);
    }
  };

  const confidenceBadgeClass = confidence => {
    if (confidence === 'high') {
      return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    }
    if (confidence === 'medium') {
      return 'bg-amber-100 text-amber-700 border-amber-200';
    }
    return 'bg-rose-100 text-rose-700 border-rose-200';
  };

  const getLatestWorkflowResult = () => {
    const results = Object.values(templateWorkflowResults || {}).filter(
      workflow => workflow?.projectId && workflow?.canvasEditorJson
    );

    if (!results.length) return null;

    return [...results].sort((a, b) => {
      const aTs = new Date(a.created || a.createdAt || 0).getTime();
      const bTs = new Date(b.created || b.createdAt || 0).getTime();
      return bTs - aTs;
    })[0];
  };

  const emitIndKpiEvent = async (eventName, projectId, payload = {}) => {
    try {
      await fetch('/api/ind-templates/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          eventName,
          projectId,
          payload,
        }),
      });
    } catch (error) {
      console.warn('Failed to emit IND KPI event:', eventName, error);
    }
  };

  const handleOpenCanvasEditor = (payload, reviewActionOverrides = {}) => {
    if (!payload?.canvasEditorJson) {
      window.location.href = '/coauthor';
      return;
    }

    localStorage.setItem(
      COAUTHOR_IMPORT_KEY,
      JSON.stringify({
        projectId: payload.projectId,
        projectName: payload.projectName,
        templateId: payload.templateId,
        specialization: payload.specialization,
        editorJson: payload.canvasEditorJson,
        moduleDrafts: payload.moduleDrafts,
        moduleAssessments: payload.moduleAssessments,
        reviewActions: {
          ...(getWorkflowReviewActions(payload) || {}),
          ...(reviewActionOverrides || {}),
        },
        createdAt: payload.created,
      })
    );

    window.location.href = '/coauthor?source=ind-templates';
  };

  const handleFocusLowConfidenceSections = async () => {
    const latestWorkflow = getLatestWorkflowResult();
    if (!latestWorkflow) {
      toast({
        title: 'No Active Draft',
        description: 'Generate an IND draft first to focus low-confidence sections.',
        variant: 'destructive',
      });
      return;
    }

    const lowConfidenceModules = Object.entries(latestWorkflow.moduleAssessments || {})
      .filter(([, assessment]) => assessment?.confidence !== 'high')
      .map(([moduleName]) => moduleName);

    if (!lowConfidenceModules.length) {
      toast({
        title: 'No Low-Confidence Sections',
        description: 'Current project has no low-confidence sections.',
      });
      return;
    }

    setActiveTab('ind-templates');
    setFocusedTemplateId(Number(latestWorkflow.templateId));

    await Promise.allSettled(
      lowConfidenceModules.map(moduleName =>
        setModuleReviewAction(
          latestWorkflow.projectId,
          latestWorkflow.templateId,
          moduleName,
          'needs_revision'
        )
      )
    );

    void Promise.allSettled(
      lowConfidenceModules.map(moduleName =>
        emitIndKpiEvent('section_rewritten', latestWorkflow.projectId, {
          moduleName,
          source: 'kpi_risk_alert',
          intent: 'focus_low_confidence_sections',
        })
      )
    );

    setTimeout(() => {
      const node = document.getElementById(`ind-template-card-${latestWorkflow.templateId}`);
      node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);

    toast({
      title: 'Focused Review Ready',
      description: `${lowConfidenceModules.length} section(s) marked for revision in the active project.`,
    });
  };

  const handleOpenLatestRiskDraftInCoAuthor = async () => {
    const latestWorkflow = getLatestWorkflowResult();
    if (!latestWorkflow) {
      toast({
        title: 'No Active Draft',
        description: 'Generate an IND draft first before opening CoAuthor.',
        variant: 'destructive',
      });
      return;
    }

    const lowConfidenceModules = Object.entries(latestWorkflow.moduleAssessments || {})
      .filter(([, assessment]) => assessment?.confidence !== 'high')
      .map(([moduleName]) => moduleName);

    const reviewActionOverrides = lowConfidenceModules.reduce((acc, moduleName) => {
      acc[moduleName] = 'needs_revision';
      return acc;
    }, {});

    await Promise.allSettled(
      lowConfidenceModules.map(moduleName =>
        setModuleReviewAction(
          latestWorkflow.projectId,
          latestWorkflow.templateId,
          moduleName,
          'needs_revision'
        )
      )
    );

    void emitIndKpiEvent('export_triggered', latestWorkflow.projectId, {
      source: 'kpi_risk_alert',
      intent: 'open_in_coauthor',
      lowConfidenceModuleCount: lowConfidenceModules.length,
    });

    handleOpenCanvasEditor(latestWorkflow, reviewActionOverrides);
  };

  const startGuidedFlow = () => {
    if (guidedFamily === 'ind') {
      const selectedTemplate =
        indTemplates.find(template => String(template.id) === guidedTemplateId) || indTemplates[0];
      setActiveTab('ind-templates');
      handleCreateFromDocuments(selectedTemplate);
      return;
    }

    window.location.href = `/docx-factory?doc_family=${encodeURIComponent(guidedFamily)}`;
  };

  useEffect(() => {
    const fetchINDStats = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/ind-templates/stats?windowDays=${kpiWindowDays}`);
        if (response.ok) {
          const data = await response.json();
          setIndStats(data);
        }
      } catch (error) {
        console.error('Error fetching IND stats:', error);
        // Use fallback stats - this is expected during development
      } finally {
        setIsLoading(false);
      }
    };

    fetchINDStats();
  }, [kpiWindowDays]);

  // Sample IND templates
  const indTemplates = [
    {
      id: 1,
      title: 'Oncology IND Full Solution',
      description:
        'End-to-end templates for oncology INDs, including protocol templates, CMC documentation, and regulatory response examples.',
      modules: ['Protocol', 'CMC', 'IB', 'FDA Forms', 'Cover Letter'],
      specialization: 'Oncology',
      lastUpdated: 'March 15, 2024',
    },
    {
      id: 2,
      title: 'Rare Disease IND Package',
      description:
        'Comprehensive package for rare disease indications with orphan drug designation elements and regulatory pathways.',
      modules: ['Protocol', 'CMC', 'IB', 'FDA Forms', 'Orphan Designation', 'Cover Letter'],
      specialization: 'Rare Disease',
      lastUpdated: 'April 2, 2024',
    },
    {
      id: 3,
      title: 'First-in-Human IND Template',
      description:
        'Templates designed specifically for Phase 1 first-in-human studies with robust safety monitoring provisions.',
      modules: [
        'Protocol',
        'CMC',
        'IB',
        'FDA Forms',
        'DSUR Template',
        'Safety Monitoring',
        'Cover Letter',
      ],
      specialization: 'Phase 1',
      lastUpdated: 'February 28, 2024',
    },
    {
      id: 4,
      title: 'Advanced Therapy IND (Cell/Gene)',
      description:
        'Specialized IND package for cell and gene therapies with comprehensive CMC and manufacturing documentation.',
      modules: [
        'Protocol',
        'Advanced CMC',
        'IB',
        'FDA Forms',
        'Manufacturing Controls',
        'Cover Letter',
      ],
      specialization: 'Cell/Gene Therapy',
      lastUpdated: 'March 22, 2024',
    },
    {
      id: 5,
      title: 'Infectious Disease IND Solution',
      description:
        'IND package with special considerations for infectious disease indications including accelerated pathway elements.',
      modules: [
        'Protocol',
        'CMC',
        'IB',
        'FDA Forms',
        'Accelerated Approval Sections',
        'Cover Letter',
      ],
      specialization: 'Infectious Disease',
      lastUpdated: 'April 10, 2024',
    },
  ];

  // Sample IND modules
  const indModules = [
    {
      id: 1,
      name: 'Protocol Template',
      description:
        'Comprehensive clinical protocol template with statistical sections, safety monitoring, and dosing schemas.',
      components: 18,
      pageCount: 85,
      lastUpdated: 'April 12, 2024',
    },
    {
      id: 2,
      name: 'CMC Documentation',
      description:
        'Chemistry, manufacturing, and controls documentation templates with compliant formatting and structure.',
      components: 24,
      pageCount: 120,
      lastUpdated: 'March 30, 2024',
    },
    {
      id: 3,
      name: "Investigator's Brochure",
      description:
        'Standardized IB template with clinical and non-clinical data presentation frameworks.',
      components: 15,
      pageCount: 65,
      lastUpdated: 'April 5, 2024',
    },
    {
      id: 4,
      name: 'FDA Forms Package',
      description:
        'Complete set of FDA forms (1571, 1572, 3674, etc.) with guidance on proper completion.',
      components: 8,
      pageCount: 32,
      lastUpdated: 'April 8, 2024',
    },
    {
      id: 5,
      name: 'Cover Letter Templates',
      description:
        'Industry-standard cover letter templates for initial submissions, amendments, and responses to information requests.',
      components: 12,
      pageCount: 24,
      lastUpdated: 'April 15, 2024',
    },
    {
      id: 6,
      name: 'Response to Clinical Hold',
      description:
        'Templates and frameworks for responding to various types of clinical holds with example remediation plans.',
      components: 10,
      pageCount: 45,
      lastUpdated: 'March 25, 2024',
    },
  ];

  // Sample IND requirements checklist
  const indRequirements = [
    { id: 1, name: 'Form FDA 1571', category: 'Administrative', completed: true },
    { id: 2, name: 'Table of Contents', category: 'Administrative', completed: true },
    { id: 3, name: 'Introductory Statement', category: 'Administrative', completed: false },
    { id: 4, name: 'General Investigational Plan', category: 'Administrative', completed: false },
    { id: 5, name: "Investigator's Brochure", category: 'Clinical', completed: true },
    { id: 6, name: 'Clinical Protocol', category: 'Clinical', completed: true },
    {
      id: 7,
      name: 'Chemistry, Manufacturing and Control Information',
      category: 'CMC',
      completed: false,
    },
    {
      id: 8,
      name: 'Pharmacology and Toxicology Information',
      category: 'Nonclinical',
      completed: true,
    },
    { id: 9, name: 'Previous Human Experience', category: 'Clinical', completed: false },
    { id: 10, name: 'Additional Information', category: 'Supplementary', completed: false },
    {
      id: 11,
      name: 'Biosimilarity Assessment (if applicable)',
      category: 'Biosimilar',
      completed: false,
    },
    {
      id: 12,
      name: 'Environmental Assessment or Categorical Exclusion',
      category: 'Administrative',
      completed: true,
    },
  ];

  // Function to generate tag content based on module names
  const renderModuleTags = modules => {
    return modules.map((module, index) => (
      <span
        key={index}
        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 mr-2 mb-2"
      >
        {module}
      </span>
    ));
  };

  // Function to render a template card
  const TemplateCard = ({ template }) => (
    <div
      id={`ind-template-card-${template.id}`}
      className={`bg-white/80 border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow ${
        focusedTemplateId === template.id
          ? 'border-amber-300 ring-2 ring-amber-100'
          : 'border-slate-200/70'
      }`}
    >
      <div className="border-b border-slate-200/60 p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-md bg-slate-900/5 text-slate-700 flex items-center justify-center mr-4">
              <Package size={20} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-slate-900">{template.title}</h3>
              <p className="text-sm text-slate-500 mt-1">
                Specialization: {template.specialization}
              </p>
            </div>
          </div>
          <div className="text-xs text-slate-500">Updated: {template.lastUpdated}</div>
        </div>
      </div>
      <div className="px-5 py-4">
        <p className="text-sm text-slate-600 mb-4">{template.description}</p>
        <div className="mb-4">{renderModuleTags(template.modules)}</div>
        <div className="flex justify-between items-center">
          <Link to={`/ind-full-solution/template/${template.id}`}>
            <button className="inline-flex items-center text-sm font-medium text-slate-700 hover:text-slate-900">
              View Package Details
              <ChevronRight size={16} className="ml-1" />
            </button>
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleCreateFromDocuments(template)}
              disabled={isCreatingFromDocs}
              className="inline-flex items-center px-3 py-1.5 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded text-sm disabled:opacity-50"
            >
              {isCreatingFromDocs ? <Loader2 className="animate-spin h-4 w-4 mr-1" /> : null}
              Create from Uploaded Docs
            </button>
            <button
              onClick={() => handleDownloadTemplate(template.id)}
              disabled={isLoading}
              className="inline-flex items-center px-3 py-1.5 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded text-sm disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="animate-spin h-4 w-4 mr-1" /> : null}
              Download Package
            </button>
          </div>
        </div>
        {templateWorkflowResults[template.id]?.workflow ? (
          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-medium text-slate-700 mb-2">
              Generated IND workflow artifacts ready:
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() =>
                  handleDownloadWorkflowDocx(
                    templateWorkflowResults[template.id].workflow.docxDownloadUrl
                  )
                }
                className="inline-flex items-center px-2.5 py-1.5 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded text-xs"
              >
                Download Generated DOCX
              </button>
              <button
                onClick={() =>
                  handleDownloadCanvasJson(
                    templateWorkflowResults[template.id].workflow.canvasJsonUrl
                  )
                }
                className="inline-flex items-center px-2.5 py-1.5 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded text-xs"
              >
                Download Canvas JSON
              </button>
              <Link to="/docx-factory">
                <button className="inline-flex items-center px-2.5 py-1.5 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded text-xs">
                  Open DOCX Factory
                </button>
              </Link>
              <Link to="/coauthor">
                <button
                  onClick={event => {
                    event.preventDefault();
                    handleOpenCanvasEditor(templateWorkflowResults[template.id]);
                  }}
                  className="inline-flex items-center px-2.5 py-1.5 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded text-xs"
                >
                  Open Canvas Editor
                </button>
              </Link>
            </div>

            {templateWorkflowResults[template.id]?.moduleAssessments ? (
              <div className="mt-4 border-t border-slate-200 pt-3">
                <p className="text-xs font-medium text-slate-700 mb-2">AI Quality Review</p>
                <div className="space-y-2">
                  {Object.entries(templateWorkflowResults[template.id].moduleAssessments).map(
                    ([moduleName, assessment]) => {
                      const workflowResult = templateWorkflowResults[template.id];
                      const reviewAction = getModuleReviewAction(
                        workflowResult?.projectId,
                        moduleName,
                        getWorkflowReviewActions(workflowResult)
                      );
                      return (
                        <div
                          key={moduleName}
                          className="rounded border border-slate-200 bg-white/80 px-3 py-2"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-medium text-slate-800">{moduleName}</p>
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${confidenceBadgeClass(
                                assessment.confidence
                              )}`}
                            >
                              {assessment.confidence} confidence
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1">
                            Relevance score: {assessment.relevanceScore}
                          </p>
                          {assessment.evidence?.length ? (
                            <div className="mt-2 space-y-1">
                              {assessment.evidence.slice(0, 2).map(evidence => (
                                <div
                                  key={`${moduleName}-${evidence.filename}`}
                                  className="text-[11px] text-slate-600 bg-slate-50 rounded border border-slate-100 px-2 py-1"
                                >
                                  <span className="font-medium">{evidence.filename}</span> · score{' '}
                                  {evidence.score}
                                  <div className="text-slate-500 mt-0.5">{evidence.excerpt}</div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[11px] text-slate-500 mt-2">
                              No direct evidence found in uploaded files.
                            </p>
                          )}

                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <button
                              onClick={() =>
                                setModuleReviewAction(
                                  workflowResult?.projectId,
                                  template.id,
                                  moduleName,
                                  'accepted'
                                )
                              }
                              className={`px-2 py-1 rounded text-[11px] border ${
                                reviewAction === 'accepted'
                                  ? 'bg-emerald-100 border-emerald-200 text-emerald-700'
                                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              Accept
                            </button>
                            <button
                              onClick={() =>
                                setModuleReviewAction(
                                  workflowResult?.projectId,
                                  template.id,
                                  moduleName,
                                  'needs_revision'
                                )
                              }
                              className={`px-2 py-1 rounded text-[11px] border ${
                                reviewAction === 'needs_revision'
                                  ? 'bg-amber-100 border-amber-200 text-amber-700'
                                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              Needs Revision
                            </button>
                            <button
                              onClick={() =>
                                setModuleReviewAction(
                                  workflowResult?.projectId,
                                  template.id,
                                  moduleName,
                                  'rewrite'
                                )
                              }
                              className={`px-2 py-1 rounded text-[11px] border ${
                                reviewAction === 'rewrite'
                                  ? 'bg-rose-100 border-rose-200 text-rose-700'
                                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              Rewrite
                            </button>
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );

  // Function to render a module card
  const ModuleCard = ({ module }) => (
    <div className="bg-white/80 border border-slate-200/70 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div className="border-b border-slate-200/60 p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-md bg-slate-900/5 text-slate-700 flex items-center justify-center mr-4">
              <FileText size={20} />
            </div>
            <h3 className="text-lg font-medium text-slate-900">{module.name}</h3>
          </div>
          <div className="text-xs text-slate-500">Updated: {module.lastUpdated}</div>
        </div>
      </div>
      <div className="px-5 py-4">
        <p className="text-sm text-slate-600 mb-4">{module.description}</p>
        <div className="flex justify-between text-sm text-slate-500 mb-4">
          <div>Components: {module.components}</div>
          <div>Pages: {module.pageCount}</div>
        </div>
        <div className="flex justify-between items-center">
          <Link to={`/ind-full-solution/module/${module.id}`}>
            <button className="inline-flex items-center text-sm font-medium text-slate-700 hover:text-slate-900">
              View Module Details
              <ChevronRight size={16} className="ml-1" />
            </button>
          </Link>
          <button
            onClick={() => handleDownloadModule(module.id)}
            disabled={isLoading}
            className="inline-flex items-center px-3 py-1.5 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded text-sm disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="animate-spin h-4 w-4 mr-1" /> : null}
            Download Module
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="bg-slate-50 min-h-screen">
      <div className="bg-slate-900 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center mb-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-slate-800 text-white mr-4">
              <FileSymlink size={24} />
            </div>
            <h1 className="text-3xl font-bold text-white">IND Full Solution Package</h1>
          </div>
          <p className="text-slate-300 max-w-3xl">
            Comprehensive IND templates, modules, and checklists designed to streamline your
            regulatory submissions with industry-standard formatting and content structured for FDA
            compliance.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* What It Does Section */}
        <div className="mb-12 bg-white/80 rounded-2xl p-8 border border-slate-200/70 shadow-sm">
          <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center">
            <Rocket className="mr-2 text-slate-700" size={24} />
            What the IND Automation Module Does
          </h2>

          <div className="overflow-x-auto">
            <table className="min-w-full bg-white/80 rounded-lg overflow-hidden">
              <thead className="bg-slate-100/70">
                <tr>
                  <th className="py-3 px-4 text-left text-sm font-medium text-slate-700 border-b border-slate-200/60">
                    Pillar
                  </th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-slate-700 border-b border-slate-200/60">
                    New Clinical Reality We Enable
                  </th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-slate-700 border-b border-slate-200/60">
                    Traditional Pain
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60">
                <tr>
                  <td className="py-3 px-4 text-sm font-medium text-slate-700">
                    End-to-End eCTD Builder
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-700">
                    Draft ➜ QC ➜ Sequence ➜ XML ➜ FDA/EMA/PMDA gateway in one click
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-500">
                    6–8 tools, manual PDF fixes, IT hand-offs
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 text-sm font-medium text-slate-700">AI-Assisted QA</td>
                  <td className="py-3 px-4 text-sm text-slate-700">
                    Ghostscript/PDF-A, auto-bookmarks, dead-link checks, eValidator & EU/JP rules
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-500">
                    TR letters for font, size, checksum errors
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 text-sm font-medium text-slate-700">
                    Smart Lifecycle Engine
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-700">
                    Auto-detect "replace / new / append", diff viewer
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-500">
                    Spreadsheet trackers get out of sync
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 text-sm font-medium text-slate-700">
                    Real-Time ACK Telemetry
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-700">
                    Live ACK1/2/3 badges, Slack / Teams / email notifications
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-500">
                    Waiting days to learn of TR failures
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 text-sm font-medium text-slate-700">
                    Multi-Region Profiles
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-700">
                    FDA IND, EMA CTA, PMDA JP-M1—all share the same doc vault
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-500">
                    Parallel folder trees, duplicate uploads
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 text-sm font-medium text-slate-700">
                    Embedded Cost-ROI Cards
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-700">
                    See PDF QC cost saved, hours saved, and CO₂ reduction
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-500">
                    No visibility on hidden submission labor
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Key Use-Cases Section */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center">
            <BookOpen className="mr-2 text-slate-700" size={24} />
            Key Use-Cases (beyond "initial IND")
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-white/80 p-6 rounded-lg border border-slate-200/70 shadow-sm">
              <div className="flex items-center mb-4">
                <div className="h-8 w-8 rounded-full bg-slate-900/5 text-slate-700 flex items-center justify-center mr-3">
                  <span className="font-semibold">1</span>
                </div>
                <h3 className="text-lg font-medium text-slate-900">
                  CMC "Drug-Product ANDA Supplements"
                </h3>
              </div>
              <p className="text-slate-600">
                Upload stability update, map to m3.2.P.5., generate sequence 00xx.*
              </p>
            </div>

            <div className="bg-white/80 p-6 rounded-lg border border-slate-200/70 shadow-sm">
              <div className="flex items-center mb-4">
                <div className="h-8 w-8 rounded-full bg-slate-900/5 text-slate-700 flex items-center justify-center mr-3">
                  <span className="font-semibold">2</span>
                </div>
                <h3 className="text-lg font-medium text-slate-900">
                  Safety 7-Day / 15-Day Reports
                </h3>
              </div>
              <p className="text-slate-600">
                Wizard auto-creates 3500A narrative + cover letter. Sequence flagged "Amendment –
                Safety".
              </p>
            </div>

            <div className="bg-white/80 p-6 rounded-lg border border-slate-200/70 shadow-sm">
              <div className="flex items-center mb-4">
                <div className="h-8 w-8 rounded-full bg-slate-900/5 text-slate-700 flex items-center justify-center mr-3">
                  <span className="font-semibold">3</span>
                </div>
                <h3 className="text-lg font-medium text-slate-900">
                  Annual Report (21 CFR 312.33)
                </h3>
              </div>
              <p className="text-slate-600">
                Auto-roll prior year's protocol list + safety summary into template; QC; file to
                m5.3.7.
              </p>
            </div>

            <div className="bg-white/80 p-6 rounded-lg border border-slate-200/70 shadow-sm">
              <div className="flex items-center mb-4">
                <div className="h-8 w-8 rounded-full bg-slate-900/5 text-slate-700 flex items-center justify-center mr-3">
                  <span className="font-semibold">4</span>
                </div>
                <h3 className="text-lg font-medium text-slate-900">EU Substantial Amendment</h3>
              </div>
              <p className="text-slate-600">
                Switch region = EMA, drag Protocol v3.1 → m1.2 Annex II; system builds
                eu-regional.xml and validates with EU profile.
              </p>
            </div>

            <div className="bg-white/80 p-6 rounded-lg border border-slate-200/70 shadow-sm">
              <div className="flex items-center mb-4">
                <div className="h-8 w-8 rounded-full bg-slate-900/5 text-slate-700 flex items-center justify-center mr-3">
                  <span className="font-semibold">5</span>
                </div>
                <h3 className="text-lg font-medium text-slate-900">Japan CTN Re-Submission</h3>
              </div>
              <p className="text-slate-600">
                Select PMDA profile, auto-generates jp-regional.xml, JP-annex folder, and JP
                index.dat.
              </p>
            </div>
          </div>
        </div>

        {/* Why Clients Use It Section */}
        <div className="mb-12 bg-slate-50/80 rounded-2xl p-8 border border-slate-200/60">
          <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center">
            <Zap className="mr-2 text-slate-700" size={24} />
            Why Clients Use It
          </h2>

          <ul className="space-y-4">
            <li className="flex items-start">
              <div className="flex-shrink-0 h-6 w-6 rounded-full bg-slate-900/5 text-slate-700 flex items-center justify-center mt-0.5 mr-3">
                <Check size={14} />
              </div>
              <span className="text-slate-700">
                <span className="font-semibold">Cut 80% submission prep time</span> – drag-drop + AI
                QC replaces 4–6 FTE weeks.
              </span>
            </li>
            <li className="flex items-start">
              <div className="flex-shrink-0 h-6 w-6 rounded-full bg-slate-900/5 text-slate-700 flex items-center justify-center mt-0.5 mr-3">
                <Check size={14} />
              </div>
              <span className="text-slate-700">
                <span className="font-semibold">Zero Technical Rejections</span> – every doc passes
                DTD and Lorenz/PMDA rules.
              </span>
            </li>
            <li className="flex items-start">
              <div className="flex-shrink-0 h-6 w-6 rounded-full bg-slate-900/5 text-slate-700 flex items-center justify-center mt-0.5 mr-3">
                <Check size={14} />
              </div>
              <span className="text-slate-700">
                <span className="font-semibold">Audit-Ready Traceability</span> – QC JSON, diff
                snapshots, ACK files all version-controlled.
              </span>
            </li>
            <li className="flex items-start">
              <div className="flex-shrink-0 h-6 w-6 rounded-full bg-slate-900/5 text-slate-700 flex items-center justify-center mt-0.5 mr-3">
                <Check size={14} />
              </div>
              <span className="text-slate-700">
                <span className="font-semibold">Adaptive Cost Model</span> – pay-per-sequence or
                per-region; no hidden validator fees.
              </span>
            </li>
            <li className="flex items-start">
              <div className="flex-shrink-0 h-6 w-6 rounded-full bg-slate-900/5 text-slate-700 flex items-center justify-center mt-0.5 mr-3">
                <Check size={14} />
              </div>
              <span className="text-slate-700">
                <span className="font-semibold">Regulatory Confidence</span> – visual badges +
                Slack/Teams alerts prove delivery.
              </span>
            </li>
          </ul>
        </div>

        {/* How Teams Work With It Section */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center">
            <Users className="mr-2 text-slate-700" size={24} />
            How Teams Work With It
          </h2>

          <div className="overflow-x-auto">
            <table className="min-w-full bg-white/80 rounded-lg overflow-hidden border border-slate-200/70">
              <thead className="bg-slate-100/70">
                <tr>
                  <th className="py-3 px-4 text-left text-sm font-medium text-slate-700 border-b border-slate-200/60">
                    Role
                  </th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-slate-700 border-b border-slate-200/60">
                    Daily Workflow
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60">
                <tr>
                  <td className="py-3 px-4 text-sm font-medium text-slate-700">Med-Writer</td>
                  <td className="py-3 px-4 text-sm text-slate-700">
                    Upload draft → click "Run QC" → get font/link feedback in 60 s.
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 text-sm font-medium text-slate-700">Reg Lead</td>
                  <td className="py-3 px-4 text-sm text-slate-700">
                    Drag QC-passed docs into module folders, choose region, click "Finalize
                    Sequence".
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 text-sm font-medium text-slate-700">Head of QA</td>
                  <td className="py-3 px-4 text-sm text-slate-700">
                    Review automated PDF QC JSON + Lorenz report; e-sign Form 1571 w/in the
                    platform.
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 text-sm font-medium text-slate-700">CTO / IT</td>
                  <td className="py-3 px-4 text-sm text-slate-700">
                    Zero infra; optional on-prem Docker script with Traefik + TLS.
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 text-sm font-medium text-slate-700">C-Suite</td>
                  <td className="py-3 px-4 text-sm text-slate-700">
                    Dashboard shows sequence velocity vs. CRO baseline, cost savings, and ESG ACK
                    SLA.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Step-By-Step Flow Section */}
        <div className="mb-12 bg-white/80 rounded-2xl p-8 border border-slate-200/70 shadow-sm">
          <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center">
            <Workflow className="mr-2 text-slate-700" size={24} />
            Step-By-Step Flow
          </h2>

          <div className="space-y-6">
            <div className="relative pl-8 border-l-2 border-slate-200/70">
              <div className="absolute -left-3 top-0 w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold">
                1
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-1">
                Create Project → Select Region
              </h3>
              <p className="text-slate-600">
                FDA (default), EMA, or PMDA profile chooses correct Module 1 schema.
              </p>
            </div>

            <div className="relative pl-8 border-l-2 border-slate-200/70">
              <div className="absolute -left-3 top-0 w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold">
                2
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-1">Upload or Sync Docs</h3>
              <p className="text-slate-600">
                Benchling, SharePoint, Box integration. AI auto-extracts metadata & suggests module
                slot.
              </p>
            </div>

            <div className="relative pl-8 border-l-2 border-slate-200/70">
              <div className="absolute -left-3 top-0 w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold">
                3
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-1">AI PDF QC</h3>
              <p className="text-slate-600">
                AI ticks ✅ if PDF/A-1b, searchable, ≤10 MB; ❌ if not.
              </p>
            </div>

            <div className="relative pl-8 border-l-2 border-slate-200/70">
              <div className="absolute -left-3 top-0 w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold">
                4
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-1">Drag-Drop Builder</h3>
              <p className="text-slate-600">Arrange modules, bulk-approve any remaining docs.</p>
            </div>

            <div className="relative pl-8 border-l-2 border-slate-200/70">
              <div className="absolute -left-3 top-0 w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold">
                5
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-1">Finalize Sequence</h3>
              <p className="text-slate-600">
                System assigns next eCTD number, builds index.xml + regional XML, computes MD5s.
              </p>
            </div>

            <div className="relative pl-8 border-l-2 border-slate-200/70">
              <div className="absolute -left-3 top-0 w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold">
                6
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-1">Validate</h3>
              <p className="text-slate-600">
                2-hover DTD + Lorenz profile; errors highlighted with jump-links.
              </p>
            </div>

            <div className="relative pl-8 border-l-2 border-slate-200/70">
              <div className="absolute -left-3 top-0 w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold">
                7
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-1">Submit</h3>
              <p className="text-slate-600">
                ESG envelope + ZIP; live ACK1/2/3 badges; Slack / email pushed.
              </p>
            </div>

            <div className="relative pl-8 border-l-2 border-slate-200/70">
              <div className="absolute -left-3 top-0 w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold">
                8
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-1">
                Monitor Annual / Safety Timers
              </h3>
              <p className="text-slate-600">
                Scheduler warns when DSUR or Annual Report window opens.
              </p>
            </div>
          </div>
        </div>

        {/* ROI Snapshot Section */}
        <div className="mb-12 bg-slate-50/80 rounded-2xl p-8 border border-slate-200/60">
          <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center">
            <BarChart className="mr-2 text-slate-700" size={24} />
            ROI Snapshot{' '}
            <span className="text-sm font-normal text-slate-500 ml-2">
              (average mid-size biotech, 8 sequences/yr)
            </span>
          </h2>

          <div className="overflow-x-auto">
            <table className="min-w-full bg-white/80 rounded-lg overflow-hidden border border-slate-200/70">
              <thead className="bg-slate-100/70">
                <tr>
                  <th className="py-3 px-4 text-left text-sm font-medium text-slate-700 border-b border-slate-200/60">
                    Metric
                  </th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-slate-700 border-b border-slate-200/60">
                    CRO Baseline
                  </th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-slate-700 border-b border-slate-200/60">
                    Concept2Cure Automated
                  </th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-slate-700 border-b border-slate-200/60">
                    Δ
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60">
                <tr>
                  <td className="py-3 px-4 text-sm font-medium text-slate-700">
                    Prep labor / sequence
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-700">120 hrs</td>
                  <td className="py-3 px-4 text-sm text-slate-700">18 hrs</td>
                  <td className="py-3 px-4 text-sm font-medium text-green-600">–85%</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 text-sm font-medium text-slate-700">
                    Tech Rejection rate
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-700">12%</td>
                  <td className="py-3 px-4 text-sm text-slate-700">0%</td>
                  <td className="py-3 px-4 text-sm font-medium text-green-600">–12 pp</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 text-sm font-medium text-slate-700">
                    Vendor validator cost
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-700">$5k</td>
                  <td className="py-3 px-4 text-sm text-slate-700">$0</td>
                  <td className="py-3 px-4 text-sm font-medium text-green-600">–$5k</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 text-sm font-medium text-slate-700">
                    Time to IND clearance
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-700">30 days</td>
                  <td className="py-3 px-4 text-sm text-slate-700">&lt;14 days</td>
                  <td className="py-3 px-4 text-sm font-medium text-green-600">–53%</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-sm text-slate-500 mt-3 italic">
            Data based on customers running more than 60 sequences.
          </p>
        </div>

        {/* Getting Started Section */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center">
            <Rocket className="mr-2 text-slate-700" size={24} />
            Getting Started
          </h2>

          <div className="bg-white/80 rounded-2xl p-6 border border-slate-200/70 shadow-sm">
            <ol className="space-y-4">
              <li className="flex">
                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-slate-900/5 text-slate-700 flex items-center justify-center mr-3">
                  1
                </div>
                <div className="pt-1">
                  <p className="text-slate-700 font-medium">
                    Sign Up ➜ free sandbox (no ESG submit).
                  </p>
                </div>
              </li>
              <li className="flex">
                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-slate-900/5 text-slate-700 flex items-center justify-center mr-3">
                  2
                </div>
                <div className="pt-1">
                  <p className="text-slate-700 font-medium">
                    Connect Doc Source (one-click Benchling OAuth).
                  </p>
                </div>
              </li>
              <li className="flex">
                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-slate-900/5 text-slate-700 flex items-center justify-center mr-3">
                  3
                </div>
                <div className="pt-1">
                  <p className="text-slate-700 font-medium">Run First QC – see live badges.</p>
                </div>
              </li>
              <li className="flex">
                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-slate-900/5 text-slate-700 flex items-center justify-center mr-3">
                  4
                </div>
                <div className="pt-1">
                  <p className="text-slate-700 font-medium">
                    Book 30-min Concierge – our regulatory AI team walks through first sequence.
                  </p>
                </div>
              </li>
              <li className="flex">
                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-slate-900/5 text-slate-700 flex items-center justify-center mr-3">
                  5
                </div>
                <div className="pt-1">
                  <p className="text-slate-700 font-medium">Add ESG Keys – go live to FDA.</p>
                </div>
              </li>
            </ol>

            <div className="mt-8 flex justify-center">
              <button className="inline-flex items-center px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-lg shadow transition-colors">
                Start IND Automation Free Trial
                <ArrowRight size={16} className="ml-2" />
              </button>
            </div>
          </div>
        </div>

        {/* Key features section */}
        <div className="mb-10">
          <h2 className="text-2xl font-bold text-slate-900 mb-6">Key Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white/80 p-6 rounded-lg border border-slate-200/70 shadow-sm">
              <div className="flex items-center mb-4">
                <div className="w-8 h-8 rounded-full bg-slate-900/5 flex items-center justify-center mr-3">
                  <Check className="h-5 w-5 text-slate-700" />
                </div>
                <h3 className="text-lg font-medium text-slate-900">FDA-Compliant Structure</h3>
              </div>
              <p className="text-slate-600">
                Pre-formatted templates following current FDA IND guidelines and expectations for
                seamless submission.
              </p>
            </div>

            <div className="bg-white/80 p-6 rounded-lg border border-slate-200/70 shadow-sm">
              <div className="flex items-center mb-4">
                <div className="w-8 h-8 rounded-full bg-slate-900/5 flex items-center justify-center mr-3">
                  <Globe className="h-5 w-5 text-slate-700" />
                </div>
                <h3 className="text-lg font-medium text-slate-900">Multi-Region Compliance</h3>
              </div>
              <p className="text-slate-600">
                Specialized packages for FDA, EMA, and PMDA with region-specific validation and
                formatting requirements.
              </p>
            </div>

            <div className="bg-white/80 p-6 rounded-lg border border-slate-200/70 shadow-sm">
              <div className="flex items-center mb-4">
                <div className="w-8 h-8 rounded-full bg-slate-900/5 flex items-center justify-center mr-3">
                  <Share2 className="h-5 w-5 text-slate-700" />
                </div>
                <h3 className="text-lg font-medium text-slate-900">Real-Time Validation</h3>
              </div>
              <p className="text-slate-600">
                Live technical validation with instant feedback on document compliance and sequence
                readiness.
              </p>
            </div>
          </div>
        </div>

        <div className="mb-10 bg-white/80 rounded-xl border border-slate-200/70 shadow-sm p-6">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Bot size={16} className="text-slate-700" />
                AI Guided Submission Builder
              </p>
              <p className="text-sm text-slate-600 mt-1">
                Choose your regulatory family and start a guided draft flow with uploaded evidence.
              </p>
            </div>
            <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border border-slate-200 text-slate-600 bg-slate-50">
              <Sparkles size={12} className="mr-1" />
              Simple Mode
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            <div>
              <label className="text-xs text-slate-500">Regulatory Family</label>
              <select
                value={guidedFamily}
                onChange={event => setGuidedFamily(event.target.value)}
                className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
              >
                <option value="ind">IND</option>
                <option value="nda">NDA</option>
                <option value="bla">BLA</option>
                <option value="sop">SOP</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500">IND Package</label>
              <select
                value={guidedTemplateId}
                onChange={event => setGuidedTemplateId(event.target.value)}
                disabled={guidedFamily !== 'ind'}
                className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 disabled:bg-slate-100 disabled:text-slate-400"
              >
                {indTemplates.map(template => (
                  <option key={template.id} value={String(template.id)}>
                    {template.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={startGuidedFlow}
                disabled={isCreatingFromDocs}
                className="w-full inline-flex items-center justify-center px-3 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded text-sm disabled:opacity-50"
              >
                {isCreatingFromDocs ? <Loader2 className="animate-spin h-4 w-4 mr-1" /> : null}
                {guidedFamily === 'ind' ? 'Start Guided Upload' : 'Open Family Workspace'}
              </button>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-slate-200/60 mb-8">
          <nav className="-mb-px flex">
            <button
              onClick={() => setActiveTab('ind-templates')}
              className={`inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'ind-templates'
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              } mr-8`}
            >
              <Package size={16} className="mr-2" />
              IND Full Packages
            </button>
            <button
              onClick={() => setActiveTab('ind-modules')}
              className={`inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'ind-modules'
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              } mr-8`}
            >
              <FileText size={16} className="mr-2" />
              Individual Modules
            </button>
            <button
              onClick={() => setActiveTab('ind-checklist')}
              className={`inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'ind-checklist'
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <AlertCircle size={16} className="mr-2" />
              IND Requirements Checklist
            </button>
          </nav>
        </div>

        {/* Content Section */}
        <div className="mb-12">
          {activeTab === 'ind-templates' && (
            <>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-medium text-gray-900">
                  Complete IND Solution Packages
                </h2>
                <div className="text-sm text-gray-500">Showing {indTemplates.length} packages</div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {indTemplates.map(template => (
                  <TemplateCard key={template.id} template={template} />
                ))}
              </div>
            </>
          )}

          {activeTab === 'ind-modules' && (
            <>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-medium text-gray-900">Individual IND Modules</h2>
                <div className="text-sm text-gray-500">Showing {indModules.length} modules</div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {indModules.map(module => (
                  <ModuleCard key={module.id} module={module} />
                ))}
              </div>
            </>
          )}

          {activeTab === 'ind-checklist' && (
            <>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-medium text-gray-900">IND Requirements Checklist</h2>
                <div className="text-sm text-gray-500">
                  Showing {indRequirements.length} requirements
                </div>
              </div>

              <div className="bg-white/80 rounded-lg border border-slate-200/70 overflow-hidden shadow-sm">
                <table className="min-w-full divide-y divide-slate-200/60">
                  <thead className="bg-slate-100/60">
                    <tr>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                      >
                        Status
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                      >
                        Requirement
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                      >
                        Category
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                      >
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white/80 divide-y divide-slate-200/60">
                    {indRequirements.map(requirement => (
                      <tr key={requirement.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div
                            className={`flex items-center justify-center h-6 w-6 rounded-full ${
                              requirement.completed ? 'bg-emerald-100/70' : 'bg-amber-100/70'
                            }`}
                          >
                            {requirement.completed ? (
                              <Check className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-amber-600" />
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                          {requirement.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                          {requirement.category}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                          <button className="text-slate-700 hover:text-slate-900">
                            View Template
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Example Reports Section */}
        <div className="mb-16 bg-slate-50/80 rounded-2xl p-8 border border-slate-200/60">
          <h2 className="text-2xl font-bold text-slate-900 mb-8 flex items-center">
            <FileText className="mr-2 text-slate-700" size={24} />
            Example IND Submission Reports
          </h2>

          {/* Live Stats Banner */}
          <div className="mb-12 grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white/80 p-6 rounded-lg border border-slate-200/70 shadow-sm text-center">
              <div className="flex items-center justify-center mb-2">
                {isLoading ? (
                  <Loader2 className="h-8 w-8 text-slate-400 animate-spin" />
                ) : (
                  <FileText className="h-8 w-8 text-slate-600" />
                )}
              </div>
              <div className="text-2xl font-bold text-slate-900">{indStats.totalSubmissions}</div>
              <div className="text-sm text-slate-500">Total IND Submissions</div>
            </div>

            <div className="bg-white/80 p-6 rounded-lg border border-slate-200/70 shadow-sm text-center">
              <div className="flex items-center justify-center mb-2">
                {isLoading ? (
                  <Loader2 className="h-8 w-8 text-slate-400 animate-spin" />
                ) : (
                  <CheckSquare className="h-8 w-8 text-emerald-600" />
                )}
              </div>
              <div className="text-2xl font-bold text-slate-900">{indStats.successRate}%</div>
              <div className="text-sm text-slate-500">First-Time Success Rate</div>
            </div>

            <div className="bg-white/80 p-6 rounded-lg border border-slate-200/70 shadow-sm text-center">
              <div className="flex items-center justify-center mb-2">
                {isLoading ? (
                  <Loader2 className="h-8 w-8 text-slate-400 animate-spin" />
                ) : (
                  <Clock className="h-8 w-8 text-slate-600" />
                )}
              </div>
              <div className="text-2xl font-bold text-slate-900">
                {indStats.averagePreparationTime} days
              </div>
              <div className="text-sm text-slate-500">Avg. Preparation Time</div>
            </div>

            <div className="bg-white/80 p-6 rounded-lg border border-slate-200/70 shadow-sm text-center">
              <div className="flex items-center justify-center mb-2">
                {isLoading ? (
                  <Loader2 className="h-8 w-8 text-slate-400 animate-spin" />
                ) : (
                  <BarChart className="h-8 w-8 text-slate-600" />
                )}
              </div>
              <div className="text-2xl font-bold text-slate-900">
                ${indStats.avgCostSavings.toLocaleString()}
              </div>
              <div className="text-sm text-slate-500">Avg. Cost Savings</div>
            </div>
          </div>

          <div className="mb-8 bg-white/80 rounded-lg border border-slate-200/70 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-900">AI Workflow KPI Events</h3>
              <span className="text-xs text-slate-500">
                Total tracked: {indStats.kpiEvents?.totalTracked ?? 0}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[11px] text-slate-500">Upload Started (24h)</div>
                <div className="text-lg font-semibold text-slate-900">
                  {indStats.kpiEvents?.last24Hours?.uploadStarted ?? 0}
                </div>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[11px] text-slate-500">Draft Generated (24h)</div>
                <div className="text-lg font-semibold text-slate-900">
                  {indStats.kpiEvents?.last24Hours?.draftGenerated ?? 0}
                </div>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[11px] text-slate-500">Sections Accepted (24h)</div>
                <div className="text-lg font-semibold text-slate-900">
                  {indStats.kpiEvents?.last24Hours?.sectionAccepted ?? 0}
                </div>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[11px] text-slate-500">Sections Rewritten (24h)</div>
                <div className="text-lg font-semibold text-slate-900">
                  {indStats.kpiEvents?.last24Hours?.sectionRewritten ?? 0}
                </div>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[11px] text-slate-500">Export Triggered (24h)</div>
                <div className="text-lg font-semibold text-slate-900">
                  {indStats.kpiEvents?.last24Hours?.exportTriggered ?? 0}
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px]">
              <span className="text-slate-500">Attribution (24h):</span>
              <span className="inline-flex items-center rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-700">
                Standard flow: {indStats.kpiAttribution?.last24Hours?.standardFlow ?? 0}
              </span>
              <span className="inline-flex items-center rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700">
                Risk-alert interventions: {indStats.kpiAttribution?.last24Hours?.riskAlert ?? 0}
              </span>
              <span
                className={`inline-flex items-center rounded border px-2 py-0.5 ${
                  interventionShareAtRisk
                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                    : 'border-slate-200 bg-slate-50 text-slate-700'
                }`}
              >
                Intervention share: {interventionShare24h}%
              </span>
              <span className="text-slate-500">
                Δ{indStats.kpiDeltas?.windowDays ?? kpiWindowDays}d:{' '}
                <span
                  className={
                    interventionShareDelta > 0
                      ? 'text-rose-700'
                      : interventionShareDelta < 0
                        ? 'text-emerald-700'
                        : 'text-slate-600'
                  }
                >
                  {interventionShareDelta > 0 ? '+' : ''}
                  {interventionShareDelta}%
                </span>
              </span>
            </div>

            <div className="mt-4 border-t border-slate-200 pt-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-slate-700">
                  Last {indStats.kpiTrends?.windowDays ?? 7} Days Trend
                </p>
                <div className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 p-1">
                  {[7, 14, 30].map(days => (
                    <button
                      key={days}
                      onClick={() => setKpiWindowDays(days)}
                      className={`px-2 py-0.5 rounded text-[11px] ${
                        kpiWindowDays === days
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {days}d
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-[11px]">
                  <thead>
                    <tr className="text-slate-500">
                      <th className="text-left py-1 pr-3">Date</th>
                      <th className="text-left py-1 pr-3">Uploads</th>
                      <th className="text-left py-1 pr-3">Drafts</th>
                      <th className="text-left py-1 pr-3">Accepted</th>
                      <th className="text-left py-1 pr-3">Rewritten</th>
                      <th className="text-left py-1">Exports</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(indStats.kpiTrends?.rows || []).map(row => (
                      <tr key={row.date} className="border-t border-slate-100 text-slate-700">
                        <td className="py-1.5 pr-3">{row.date}</td>
                        <td className="py-1.5 pr-3">{row.uploadStarted}</td>
                        <td className="py-1.5 pr-3">{row.draftGenerated}</td>
                        <td className="py-1.5 pr-3">{row.sectionAccepted}</td>
                        <td className="py-1.5 pr-3">{row.sectionRewritten}</td>
                        <td className="py-1.5">{row.exportTriggered}</td>
                      </tr>
                    ))}
                    {!indStats.kpiTrends?.rows?.length ? (
                      <tr>
                        <td colSpan={6} className="py-3 text-slate-500">
                          No trend data yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div
                  className={`rounded border px-3 py-2 ${
                    acceptanceAtRisk ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <p className="text-[11px] text-slate-500">Acceptance Ratio</p>
                  <p
                    className={`text-lg font-semibold ${
                      acceptanceAtRisk ? 'text-rose-700' : 'text-slate-900'
                    }`}
                  >
                    {acceptanceRatio}%
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Lifetime: {indStats.kpiDerived?.lifetime?.acceptanceRatio ?? 0}%
                  </p>
                  <p
                    className={`text-[10px] ${
                      acceptanceRatioDelta > 0
                        ? 'text-emerald-700'
                        : acceptanceRatioDelta < 0
                          ? 'text-rose-700'
                          : 'text-slate-500'
                    }`}
                  >
                    vs prev window: {acceptanceRatioDelta > 0 ? '+' : ''}
                    {acceptanceRatioDelta}%
                  </p>
                </div>
                <div
                  className={`rounded border px-3 py-2 ${
                    conversionAtRisk ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <p className="text-[11px] text-slate-500">Draft → Export Conversion</p>
                  <p
                    className={`text-lg font-semibold ${
                      conversionAtRisk ? 'text-rose-700' : 'text-slate-900'
                    }`}
                  >
                    {draftToExportConversion}%
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Lifetime: {indStats.kpiDerived?.lifetime?.draftToExportConversion ?? 0}%
                  </p>
                  <p
                    className={`text-[10px] ${
                      draftToExportConversionDelta > 0
                        ? 'text-emerald-700'
                        : draftToExportConversionDelta < 0
                          ? 'text-rose-700'
                          : 'text-slate-500'
                    }`}
                  >
                    vs prev window: {draftToExportConversionDelta > 0 ? '+' : ''}
                    {draftToExportConversionDelta}%
                  </p>
                </div>
              </div>

              {acceptanceAtRisk || conversionAtRisk ? (
                <div className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
                  <p className="font-medium">KPI risk alert</p>
                  <p className="mt-0.5">
                    {acceptanceAtRisk ? 'Acceptance ratio is below 60%. ' : ''}
                    {conversionAtRisk ? 'Draft-to-export conversion is below 30%. ' : ''}
                    Review low-confidence sections and export blockers.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      onClick={handleFocusLowConfidenceSections}
                      className="inline-flex items-center rounded border border-rose-200 bg-white px-2 py-1 text-[11px] text-rose-700 hover:bg-rose-50"
                    >
                      Focus Low-Confidence Sections
                    </button>
                    <button
                      onClick={handleOpenLatestRiskDraftInCoAuthor}
                      className="inline-flex items-center rounded border border-rose-200 bg-white px-2 py-1 text-[11px] text-rose-700 hover:bg-rose-50"
                    >
                      Open in CoAuthor
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <ExampleReportPackages />
        </div>

        {/* Action Banner */}
        <div className="bg-slate-50/80 rounded-lg p-6 border border-slate-200/60">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <div className="mb-4 md:mb-0">
              <h3 className="text-lg font-medium text-slate-900 mb-1">
                Need Customized IND Support?
              </h3>
              <p className="text-slate-600">
                Our regulatory experts can help tailor an IND package specific to your indication
                and development program
              </p>
            </div>
            <Link to="/contact">
              <button className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-md flex items-center">
                Request Consultation
                <ChevronRight size={16} className="ml-1" />
              </button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
