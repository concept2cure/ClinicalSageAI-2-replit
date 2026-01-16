import React, { useState, useEffect } from 'react';
import { Link } from 'wouter';
import {
  FileText, ChevronRight, Package, Check, BookOpen, FilePlus, FileSymlink, AlertCircle, Zap, Workflow, Clock, BarChart, Activity, HeartPulse, ArrowRight, Share2, Globe, CheckSquare, FileCheck, Rocket, Building, Briefcase, Users, Loader2 } from 'lucide-react'
import { useToast } from '../hooks/use-toast';
import { apiRequest } from '../lib/queryClient';
import ExampleReportPackages from '../components/ExampleReportPackages';

export default function INDFullSolution() {
  const [activeTab, setActiveTab] = useState('ind-templates');
  const [isLoading, setIsLoading] = useState(false);
  const [indStats, setIndStats] = useState({
    totalSubmissions: 842,
    successRate: 98.4,
    averagePreparationTime: 14.2,
    avgCostSavings: 187500,
  });
  const { toast } = useToast();

  // Handle template download
  const handleDownloadTemplate = async templateId => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/ind/template/${templateId}/download`);
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
      const response = await fetch(`/api/ind/module/${moduleId}/download`);
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
      const response = await fetch(`/api/ind/template/${templateId}/create`, {
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

  useEffect(() => {
    const fetchINDStats = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/ind/stats');
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
  }, []);

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
        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mr-2 mb-2"
      >
        {module}
      </span>
    ));
  };

  // Function to render a template card
  const TemplateCard = ({ template }) => (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
      <div className="border-b border-gray-100 p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-md bg-indigo-100 text-indigo-600 flex items-center justify-center mr-4">
              <Package size={20} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900">{template.title}</h3>
              <p className="text-sm text-gray-500 mt-1">
                Specialization: {template.specialization}
              </p>
            </div>
          </div>
          <div className="text-xs text-gray-500">Updated: {template.lastUpdated}</div>
        </div>
      </div>
      <div className="px-5 py-4">
        <p className="text-sm text-gray-600 mb-4">{template.description}</p>
        <div className="mb-4">{renderModuleTags(template.modules)}</div>
        <div className="flex justify-between items-center">
          <Link to={`/ind-full-solution/template/${template.id}`}>
            <button className="inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-800">
              View Package Details
              <ChevronRight size={16} className="ml-1" />
            </button>
          </Link>
          <button
            onClick={() => handleDownloadTemplate(template.id)}
            disabled={isLoading}
            className="inline-flex items-center px-3 py-1.5 border border-indigo-600 text-indigo-600 hover:bg-indigo-50 rounded text-sm disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="animate-spin h-4 w-4 mr-1" /> : null}
            Download Package
          </button>
        </div>
      </div>
    </div>
  );

  // Function to render a module card
  const ModuleCard = ({ module }) => (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
      <div className="border-b border-gray-100 p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-md bg-blue-100 text-blue-600 flex items-center justify-center mr-4">
              <FileText size={20} />
            </div>
            <h3 className="text-lg font-medium text-gray-900">{module.name}</h3>
          </div>
          <div className="text-xs text-gray-500">Updated: {module.lastUpdated}</div>
        </div>
      </div>
      <div className="px-5 py-4">
        <p className="text-sm text-gray-600 mb-4">{module.description}</p>
        <div className="flex justify-between text-sm text-gray-500 mb-4">
          <div>Components: {module.components}</div>
          <div>Pages: {module.pageCount}</div>
        </div>
        <div className="flex justify-between items-center">
          <Link to={`/ind-full-solution/module/${module.id}`}>
            <button className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800">
              View Module Details
              <ChevronRight size={16} className="ml-1" />
            </button>
          </Link>
          <button
            onClick={() => handleDownloadModule(module.id)}
            disabled={isLoading}
            className="inline-flex items-center px-3 py-1.5 border border-blue-600 text-blue-600 hover:bg-blue-50 rounded text-sm disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="animate-spin h-4 w-4 mr-1" /> : null}
            Download Module
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="bg-gradient-to-r from-indigo-800 to-indigo-900 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center mb-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-indigo-700 text-white mr-4">
              <FileSymlink size={24} />
            </div>
            <h1 className="text-3xl font-bold text-white">IND Full Solution Package</h1>
          </div>
          <p className="text-indigo-100 max-w-3xl">
            Comprehensive IND templates, modules, and checklists designed to streamline your
            regulatory submissions with industry-standard formatting and content structured for FDA
            compliance.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* What It Does Section */}
        <div className="mb-12 bg-white rounded-xl p-8 border border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
            <Rocket className="mr-2 text-indigo-600" size={24} />
            What the IND Automation Module Does
          </h2>

          <div className="overflow-x-auto">
            <table className="min-w-full bg-white rounded-lg overflow-hidden">
              <thead className="bg-indigo-50">
                <tr>
                  <th className="py-3 px-4 text-left text-sm font-medium text-indigo-800 border-b">
                    Pillar
                  </th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-indigo-800 border-b">
                    New Clinical Reality We Enable
                  </th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-indigo-800 border-b">
                    Traditional Pain
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                <tr>
                  <td className="py-3 px-4 text-sm font-medium text-gray-700">
                    End-to-End eCTD Builder
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-700">
                    Draft ➜ QC ➜ Sequence ➜ XML ➜ FDA/EMA/PMDA gateway in one click
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-500">
                    6–8 tools, manual PDF fixes, IT hand-offs
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 text-sm font-medium text-gray-700">AI-Assisted QA</td>
                  <td className="py-3 px-4 text-sm text-gray-700">
                    Ghostscript/PDF-A, auto-bookmarks, dead-link checks, eValidator & EU/JP rules
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-500">
                    TR letters for font, size, checksum errors
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 text-sm font-medium text-gray-700">
                    Smart Lifecycle Engine
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-700">
                    Auto-detect "replace / new / append", diff viewer
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-500">
                    Spreadsheet trackers get out of sync
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 text-sm font-medium text-gray-700">
                    Real-Time ACK Telemetry
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-700">
                    Live ACK1/2/3 badges, Slack / Teams / email notifications
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-500">
                    Waiting days to learn of TR failures
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 text-sm font-medium text-gray-700">
                    Multi-Region Profiles
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-700">
                    FDA IND, EMA CTA, PMDA JP-M1—all share the same doc vault
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-500">
                    Parallel folder trees, duplicate uploads
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 text-sm font-medium text-gray-700">
                    Embedded Cost-ROI Cards
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-700">
                    See PDF QC cost saved, hours saved, and CO₂ reduction
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-500">
                    No visibility on hidden submission labor
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Key Use-Cases Section */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
            <BookOpen className="mr-2 text-indigo-600" size={24} />
            Key Use-Cases (beyond "initial IND")
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
              <div className="flex items-center mb-4">
                <div className="h-8 w-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mr-3">
                  <span className="font-semibold">1</span>
                </div>
                <h3 className="text-lg font-medium text-gray-900">
                  CMC "Drug-Product ANDA Supplements"
                </h3>
              </div>
              <p className="text-gray-600">
                Upload stability update, map to m3.2.P.5., generate sequence 00xx.*
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
              <div className="flex items-center mb-4">
                <div className="h-8 w-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mr-3">
                  <span className="font-semibold">2</span>
                </div>
                <h3 className="text-lg font-medium text-gray-900">Safety 7-Day / 15-Day Reports</h3>
              </div>
              <p className="text-gray-600">
                Wizard auto-creates 3500A narrative + cover letter. Sequence flagged "Amendment –
                Safety".
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
              <div className="flex items-center mb-4">
                <div className="h-8 w-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mr-3">
                  <span className="font-semibold">3</span>
                </div>
                <h3 className="text-lg font-medium text-gray-900">Annual Report (21 CFR 312.33)</h3>
              </div>
              <p className="text-gray-600">
                Auto-roll prior year's protocol list + safety summary into template; QC; file to
                m5.3.7.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
              <div className="flex items-center mb-4">
                <div className="h-8 w-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mr-3">
                  <span className="font-semibold">4</span>
                </div>
                <h3 className="text-lg font-medium text-gray-900">EU Substantial Amendment</h3>
              </div>
              <p className="text-gray-600">
                Switch region = EMA, drag Protocol v3.1 → m1.2 Annex II; system builds
                eu-regional.xml and validates with EU profile.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
              <div className="flex items-center mb-4">
                <div className="h-8 w-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mr-3">
                  <span className="font-semibold">5</span>
                </div>
                <h3 className="text-lg font-medium text-gray-900">Japan CTN Re-Submission</h3>
              </div>
              <p className="text-gray-600">
                Select PMDA profile, auto-generates jp-regional.xml, JP-annex folder, and JP
                index.dat.
              </p>
            </div>
          </div>
        </div>

        {/* Why Clients Use It Section */}
        <div className="mb-12 bg-gradient-to-r from-indigo-50 to-blue-50 rounded-xl p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
            <Zap className="mr-2 text-indigo-600" size={24} />
            Why Clients Use It
          </h2>

          <ul className="space-y-4">
            <li className="flex items-start">
              <div className="flex-shrink-0 h-6 w-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mt-0.5 mr-3">
                <Check size={14} />
              </div>
              <span className="text-gray-700">
                <span className="font-semibold">Cut 80% submission prep time</span> – drag-drop + AI
                QC replaces 4–6 FTE weeks.
              </span>
            </li>
            <li className="flex items-start">
              <div className="flex-shrink-0 h-6 w-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mt-0.5 mr-3">
                <Check size={14} />
              </div>
              <span className="text-gray-700">
                <span className="font-semibold">Zero Technical Rejections</span> – every doc passes
                DTD and Lorenz/PMDA rules.
              </span>
            </li>
            <li className="flex items-start">
              <div className="flex-shrink-0 h-6 w-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mt-0.5 mr-3">
                <Check size={14} />
              </div>
              <span className="text-gray-700">
                <span className="font-semibold">Audit-Ready Traceability</span> – QC JSON, diff
                snapshots, ACK files all version-controlled.
              </span>
            </li>
            <li className="flex items-start">
              <div className="flex-shrink-0 h-6 w-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mt-0.5 mr-3">
                <Check size={14} />
              </div>
              <span className="text-gray-700">
                <span className="font-semibold">Adaptive Cost Model</span> – pay-per-sequence or
                per-region; no hidden validator fees.
              </span>
            </li>
            <li className="flex items-start">
              <div className="flex-shrink-0 h-6 w-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mt-0.5 mr-3">
                <Check size={14} />
              </div>
              <span className="text-gray-700">
                <span className="font-semibold">Regulatory Confidence</span> – visual badges +
                Slack/Teams alerts prove delivery.
              </span>
            </li>
          </ul>
        </div>

        {/* How Teams Work With It Section */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
            <Users className="mr-2 text-indigo-600" size={24} />
            How Teams Work With It
          </h2>

          <div className="overflow-x-auto">
            <table className="min-w-full bg-white rounded-lg overflow-hidden border border-gray-200">
              <thead className="bg-indigo-50">
                <tr>
                  <th className="py-3 px-4 text-left text-sm font-medium text-indigo-800 border-b">
                    Role
                  </th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-indigo-800 border-b">
                    Daily Workflow
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                <tr>
                  <td className="py-3 px-4 text-sm font-medium text-gray-700">Med-Writer</td>
                  <td className="py-3 px-4 text-sm text-gray-700">
                    Upload draft → click "Run QC" → get font/link feedback in 60 s.
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 text-sm font-medium text-gray-700">Reg Lead</td>
                  <td className="py-3 px-4 text-sm text-gray-700">
                    Drag QC-passed docs into module folders, choose region, click "Finalize
                    Sequence".
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 text-sm font-medium text-gray-700">Head of QA</td>
                  <td className="py-3 px-4 text-sm text-gray-700">
                    Review automated PDF QC JSON + Lorenz report; e-sign Form 1571 w/in the
                    platform.
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 text-sm font-medium text-gray-700">CTO / IT</td>
                  <td className="py-3 px-4 text-sm text-gray-700">
                    Zero infra; optional on-prem Docker script with Traefik + TLS.
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 text-sm font-medium text-gray-700">C-Suite</td>
                  <td className="py-3 px-4 text-sm text-gray-700">
                    Dashboard shows sequence velocity vs. CRO baseline, cost savings, and ESG ACK
                    SLA.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Step-By-Step Flow Section */}
        <div className="mb-12 bg-white rounded-xl p-8 border border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
            <Workflow className="mr-2 text-indigo-600" size={24} />
            Step-By-Step Flow
          </h2>

          <div className="space-y-6">
            <div className="relative pl-8 border-l-2 border-indigo-200">
              <div className="absolute -left-3 top-0 w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center text-xs font-bold">
                1
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Create Project → Select Region
              </h3>
              <p className="text-gray-600">
                FDA (default), EMA, or PMDA profile chooses correct Module 1 schema.
              </p>
            </div>

            <div className="relative pl-8 border-l-2 border-indigo-200">
              <div className="absolute -left-3 top-0 w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center text-xs font-bold">
                2
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Upload or Sync Docs</h3>
              <p className="text-gray-600">
                Benchling, SharePoint, Box integration. AI auto-extracts metadata & suggests module
                slot.
              </p>
            </div>

            <div className="relative pl-8 border-l-2 border-indigo-200">
              <div className="absolute -left-3 top-0 w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center text-xs font-bold">
                3
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">AI PDF QC</h3>
              <p className="text-gray-600">
                AI ticks ✅ if PDF/A-1b, searchable, ≤10 MB; ❌ if not.
              </p>
            </div>

            <div className="relative pl-8 border-l-2 border-indigo-200">
              <div className="absolute -left-3 top-0 w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center text-xs font-bold">
                4
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Drag-Drop Builder</h3>
              <p className="text-gray-600">Arrange modules, bulk-approve any remaining docs.</p>
            </div>

            <div className="relative pl-8 border-l-2 border-indigo-200">
              <div className="absolute -left-3 top-0 w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center text-xs font-bold">
                5
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Finalize Sequence</h3>
              <p className="text-gray-600">
                System assigns next eCTD number, builds index.xml + regional XML, computes MD5s.
              </p>
            </div>

            <div className="relative pl-8 border-l-2 border-indigo-200">
              <div className="absolute -left-3 top-0 w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center text-xs font-bold">
                6
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Validate</h3>
              <p className="text-gray-600">
                2-hover DTD + Lorenz profile; errors highlighted with jump-links.
              </p>
            </div>

            <div className="relative pl-8 border-l-2 border-indigo-200">
              <div className="absolute -left-3 top-0 w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center text-xs font-bold">
                7
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Submit</h3>
              <p className="text-gray-600">
                ESG envelope + ZIP; live ACK1/2/3 badges; Slack / email pushed.
              </p>
            </div>

            <div className="relative pl-8 border-l-2 border-indigo-200">
              <div className="absolute -left-3 top-0 w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center text-xs font-bold">
                8
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Monitor Annual / Safety Timers
              </h3>
              <p className="text-gray-600">
                Scheduler warns when DSUR or Annual Report window opens.
              </p>
            </div>
          </div>
        </div>

        {/* ROI Snapshot Section */}
        <div className="mb-12 bg-gradient-to-r from-indigo-50 to-blue-50 rounded-xl p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
            <BarChart className="mr-2 text-indigo-600" size={24} />
            ROI Snapshot{' '}
            <span className="text-sm font-normal text-gray-500 ml-2">
              (average mid-size biotech, 8 sequences/yr)
            </span>
          </h2>

          <div className="overflow-x-auto">
            <table className="min-w-full bg-white rounded-lg overflow-hidden border border-gray-200">
              <thead className="bg-indigo-50">
                <tr>
                  <th className="py-3 px-4 text-left text-sm font-medium text-indigo-800 border-b">
                    Metric
                  </th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-indigo-800 border-b">
                    CRO Baseline
                  </th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-indigo-800 border-b">
                    TrialSage Automated
                  </th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-indigo-800 border-b">
                    Δ
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                <tr>
                  <td className="py-3 px-4 text-sm font-medium text-gray-700">
                    Prep labor / sequence
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-700">120 hrs</td>
                  <td className="py-3 px-4 text-sm text-gray-700">18 hrs</td>
                  <td className="py-3 px-4 text-sm font-medium text-green-600">–85%</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 text-sm font-medium text-gray-700">
                    Tech Rejection rate
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-700">12%</td>
                  <td className="py-3 px-4 text-sm text-gray-700">0%</td>
                  <td className="py-3 px-4 text-sm font-medium text-green-600">–12 pp</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 text-sm font-medium text-gray-700">
                    Vendor validator cost
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-700">$5k</td>
                  <td className="py-3 px-4 text-sm text-gray-700">$0</td>
                  <td className="py-3 px-4 text-sm font-medium text-green-600">–$5k</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 text-sm font-medium text-gray-700">
                    Time to IND clearance
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-700">30 days</td>
                  <td className="py-3 px-4 text-sm text-gray-700">&lt;14 days</td>
                  <td className="py-3 px-4 text-sm font-medium text-green-600">–53%</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-sm text-gray-500 mt-3 italic">
            Data based on customers running more than 60 sequences.
          </p>
        </div>

        {/* Getting Started Section */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
            <Rocket className="mr-2 text-indigo-600" size={24} />
            Getting Started
          </h2>

          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <ol className="space-y-4">
              <li className="flex">
                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mr-3">
                  1
                </div>
                <div className="pt-1">
                  <p className="text-gray-700 font-medium">
                    Sign Up ➜ free sandbox (no ESG submit).
                  </p>
                </div>
              </li>
              <li className="flex">
                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mr-3">
                  2
                </div>
                <div className="pt-1">
                  <p className="text-gray-700 font-medium">
                    Connect Doc Source (one-click Benchling OAuth).
                  </p>
                </div>
              </li>
              <li className="flex">
                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mr-3">
                  3
                </div>
                <div className="pt-1">
                  <p className="text-gray-700 font-medium">Run First QC – see live badges.</p>
                </div>
              </li>
              <li className="flex">
                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mr-3">
                  4
                </div>
                <div className="pt-1">
                  <p className="text-gray-700 font-medium">
                    Book 30-min Concierge – our regulatory AI team walks through first sequence.
                  </p>
                </div>
              </li>
              <li className="flex">
                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mr-3">
                  5
                </div>
                <div className="pt-1">
                  <p className="text-gray-700 font-medium">Add ESG Keys – go live to FDA.</p>
                </div>
              </li>
            </ol>

            <div className="mt-8 flex justify-center">
              <button className="inline-flex items-center px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow transition-colors">
                Start IND Automation Free Trial
                <ArrowRight size={16} className="ml-2" />
              </button>
            </div>
          </div>
        </div>

        {/* Key features section */}
        <div className="mb-10">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Key Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-lg border border-gray-200">
              <div className="flex items-center mb-4">
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center mr-3">
                  <Check className="h-5 w-5 text-indigo-600" />
                </div>
                <h3 className="text-lg font-medium text-gray-900">FDA-Compliant Structure</h3>
              </div>
              <p className="text-gray-600">
                Pre-formatted templates following current FDA IND guidelines and expectations for
                seamless submission.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg border border-gray-200">
              <div className="flex items-center mb-4">
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center mr-3">
                  <Globe className="h-5 w-5 text-indigo-600" />
                </div>
                <h3 className="text-lg font-medium text-gray-900">Multi-Region Compliance</h3>
              </div>
              <p className="text-gray-600">
                Specialized packages for FDA, EMA, and PMDA with region-specific validation and
                formatting requirements.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg border border-gray-200">
              <div className="flex items-center mb-4">
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center mr-3">
                  <Share2 className="h-5 w-5 text-indigo-600" />
                </div>
                <h3 className="text-lg font-medium text-gray-900">Real-Time Validation</h3>
              </div>
              <p className="text-gray-600">
                Live technical validation with instant feedback on document compliance and sequence
                readiness.
              </p>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200 mb-8">
          <nav className="-mb-px flex">
            <button
              onClick={() => setActiveTab('ind-templates')}
              className={`inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'ind-templates'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } mr-8`}
            >
              <Package size={16} className="mr-2" />
              IND Full Packages
            </button>
            <button
              onClick={() => setActiveTab('ind-modules')}
              className={`inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'ind-modules'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } mr-8`}
            >
              <FileText size={16} className="mr-2" />
              Individual Modules
            </button>
            <button
              onClick={() => setActiveTab('ind-checklist')}
              className={`inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'ind-checklist'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
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

              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        Status
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        Requirement
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        Category
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {indRequirements.map(requirement => (
                      <tr key={requirement.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div
                            className={`flex items-center justify-center h-6 w-6 rounded-full ${
                              requirement.completed ? 'bg-green-100' : 'bg-amber-100'
                            }`}
                          >
                            {requirement.completed ? (
                              <Check className="h-4 w-4 text-green-600" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-amber-600" />
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {requirement.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {requirement.category}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <button className="text-indigo-600 hover:text-indigo-900">
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
        <div className="mb-16 bg-gray-50 rounded-xl p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-8 flex items-center">
            <FileText className="mr-2 text-indigo-600" size={24} />
            Example IND Submission Reports
          </h2>

          {/* Live Stats Banner */}
          <div className="mb-12 grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm text-center">
              <div className="flex items-center justify-center mb-2">
                {isLoading ? (
                  <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
                ) : (
                  <FileText className="h-8 w-8 text-indigo-500" />
                )}
              </div>
              <div className="text-2xl font-bold text-gray-900">{indStats.totalSubmissions}</div>
              <div className="text-sm text-gray-500">Total IND Submissions</div>
            </div>

            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm text-center">
              <div className="flex items-center justify-center mb-2">
                {isLoading ? (
                  <Loader2 className="h-8 w-8 text-green-400 animate-spin" />
                ) : (
                  <CheckSquare className="h-8 w-8 text-green-500" />
                )}
              </div>
              <div className="text-2xl font-bold text-gray-900">{indStats.successRate}%</div>
              <div className="text-sm text-gray-500">First-Time Success Rate</div>
            </div>

            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm text-center">
              <div className="flex items-center justify-center mb-2">
                {isLoading ? (
                  <Loader2 className="h-8 w-8 text-blue-400 animate-spin" />
                ) : (
                  <Clock className="h-8 w-8 text-blue-500" />
                )}
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {indStats.averagePreparationTime} days
              </div>
              <div className="text-sm text-gray-500">Avg. Preparation Time</div>
            </div>

            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm text-center">
              <div className="flex items-center justify-center mb-2">
                {isLoading ? (
                  <Loader2 className="h-8 w-8 text-amber-400 animate-spin" />
                ) : (
                  <BarChart className="h-8 w-8 text-amber-500" />
                )}
              </div>
              <div className="text-2xl font-bold text-gray-900">
                ${indStats.avgCostSavings.toLocaleString()}
              </div>
              <div className="text-sm text-gray-500">Avg. Cost Savings</div>
            </div>
          </div>

          <ExampleReportPackages />
        </div>

        {/* Action Banner */}
        <div className="bg-gradient-to-r from-indigo-50 to-blue-50 rounded-lg p-6 border border-indigo-100">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <div className="mb-4 md:mb-0">
              <h3 className="text-lg font-medium text-gray-900 mb-1">
                Need Customized IND Support?
              </h3>
              <p className="text-gray-600">
                Our regulatory experts can help tailor an IND package specific to your indication
                and development program
              </p>
            </div>
            <Link to="/contact">
              <button className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md flex items-center">
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
