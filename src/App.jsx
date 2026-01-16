// /client/src/App.jsx

import { QueryClientProvider } from '@tanstack/react-query';
import { Switch, Route, useLocation, Link } from 'wouter';
import { useState, useEffect, lazy, Suspense } from 'react';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import EnhancedDocumentEditor from './components/ectd/EnhancedDocumentEditor';
import TipTapEnhancedDocumentEditor from './components/ectd/TipTapEnhancedDocumentEditor';
import { MissionControl } from './components/dashboard/MissionControl';
import { DataManager } from './components/data-lake/DataManager';
import { db } from './lib/database';
import { SaaSLayout } from './components/layout/SaaSLayout';
import { ToastProvider } from './components/ui/ToastSystem';
import queryClient from './lib/queryClient';
import { TenantProvider } from './contexts/TenantContext.tsx';
import { LumenAiAssistantProvider } from './contexts/LumenAiAssistantContext';
import { FileProvider } from './contexts/FileContext.jsx';
import { LumenAiAssistantContainer } from '@/components/ai/LumenAiAssistantContainer';
import EmbeddedCodingAgent from './components/ai/EmbeddedCodingAgent.jsx';
import SelfHealingStatusPanel from './components/SelfHealingStatusPanel';
import LiveCodeMonitor from './components/LiveCodeMonitor';
import DirectDevInterface from './components/DirectDevInterface';
import { memoryOptimizer } from './utils/memoryOptimizer';

// Initialize memory optimization
memoryOptimizer.startPeriodicCleanup();

// Stability utilities removed to show authentic TrialSage content

// Core navigation component (loaded immediately)
import UnifiedTopNavV3 from './components/navigation/UnifiedTopNavV3';
import { ErrorBoundary } from './ErrorBoundary.jsx';
import { ModuleErrorBoundary } from './components/ui/error-boundary.jsx';

// Loading component for lazy-loaded routes
const LoadingPage = () => (
  <div className="flex flex-col items-center justify-center p-8 h-screen">
    <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full mb-4"></div>
    <p className="text-gray-600">Loading...</p>
  </div>
);

// Eagerly load the landing pages for faster initial render
import ClientPortalLanding from './pages/ClientPortalLanding';
import HomeLanding from './pages/HomeLanding';
import CodingAgentPage from './pages/CodingAgentPage';

// Lazy load all other pages grouped by related functionality
// CER-related pages
const CERPage = lazy(() => import('./pages/CerPage'));
// Import the original CERV2Page directly, not the wrapper
const CERV2Page = lazy(() => import('./pages/CERV2Page'));

const CerGenerator = lazy(() => import('./modules/CerGenerator'));

// VAULT Document Browser page
const VaultBrowserPage = lazy(() => import('./pages/VaultBrowser'));
const EmbeddedVaultBrowser = lazy(() => import('./pages/EmbeddedVaultBrowser'));

// CMC-related pages
const CmcWizard = lazy(() => import('./modules/CmcWizard'));
const CMCPage = lazy(() => import('./pages/CMCPage'));
const CMCGenerator = lazy(() => import('./pages/CMC/CMCGenerator'));
const CMCBlueprintGenerator = lazy(() => import('./components/cmc/CMCBlueprintGenerator'));

// IND-related pages (using existing components)
// const INDWizard = lazy(() => import('./pages/IND/INDWizard')); // Removed - using existing INDWizardDashboard

// CSR-related pages
const CsrAnalyzer = lazy(() => import('./modules/CsrAnalyzer'));
const CSRPage = lazy(() => import('./pages/CSRPage'));
const CSRIntelligence = lazy(() => import('./pages/CSRIntelligence'));
const CSRLibraryPage = lazy(() => import('./pages/CSRLibraryPage'));
const CSRSearch = lazy(() => import('./pages/CSRSearch'));
const CSRDetail = lazy(() => import('./pages/CSRDetail'));

// Vault-related pages
const Vault = lazy(() => import('./modules/Vault'));
const VaultPage = lazy(() => import('./pages/VaultPage'));
// VaultTestPage removed - was demo content
const VaultDocumentViewer = lazy(() => import('./components/vault/VaultDocumentViewer'));
const PredictiveVaultPage = lazy(() => import('./pages/PredictiveVaultPage'));

// CoAuthor and Canvas-related pages
const CoAuthor = lazy(() => import('./pages/CoAuthor'));
const RealCoAuthor = lazy(() => import('./pages/RealCoAuthor'));
// DocumentEditor removed - using enhanced CMC document authoring module instead

// FixedDocumentEditor removed during cleanup
const SimpleDocumentCreator = lazy(() => import('./pages/SimpleDocumentCreator'));
const CanvasPage = lazy(() => import('./pages/CanvasPage'));
const TimelinePage = lazy(() => import('./pages/TimelinePage'));
const ModuleSectionEditor = lazy(() => import('./components/ModuleSectionEditor'));

// eCTD Co-Author Module subpages
const ValidationDashboard = lazy(() => import('./pages/ValidationDashboard'));

const DocumentTemplates = lazy(() => import('./pages/DocumentTemplates'));
const DocumentViewer = lazy(() => import('./pages/DocumentViewer'));

// Regulatory-related pages (excluding Regulatory Submissions Hub)
const RegulatoryRiskDashboard = lazy(() => import('./pages/RegulatoryRiskDashboard'));
const EnhancedRegulatoryDashboard = lazy(() => import('./pages/EnhancedRegulatoryDashboard'));
const RegulatoryDashboard = lazy(() => import('./pages/RegulatoryDashboard'));
const RegulatoryIntelligenceHub = lazy(() => import('./pages/RegulatoryIntelligenceHub'));
const RegulatoryAITesting = lazy(() => import('./pages/RegulatoryAITesting'));
// RegulatoryAITestPage removed - was test content

// IND Wizard pages (no Submission Builder)
const IndWizardLayout = lazy(() => import('./components/ind-wizard/IndWizardLayout'));
import INDWizardModule from './components/ind-wizard/INDWizardModule';
const INDWizardDashboard = lazy(() => import('./pages/INDWizardDashboard'));
const INDFullSolution = lazy(() => import('./pages/INDFullSolution'));
const Module1AdminPage = lazy(() => import('./modules/Module1AdminPage'));
const Module2SummaryPage = lazy(() => import('./modules/Module2SummaryPage'));
const Module3QualityPage = lazy(() => import('./modules/Module3QualityPage'));
const Module4NonclinicalPage = lazy(() => import('./modules/Module4NonclinicalPage'));
const Module5ClinicalPage = lazy(() => import('./modules/Module5ClinicalPage'));

// Study and Protocol-related pages
const StudyArchitect = lazy(() => import('./modules/StudyArchitect'));
const StudyArchitectPage = lazy(() => import('./pages/StudyArchitectPage'));
const ProtocolDesignerPage = lazy(() => import('./pages/ProtocolDesignerPage'));

// Analytics and Dashboard pages
const AnalyticsDashboard = lazy(() => import('./modules/AnalyticsDashboard'));
const ModuleDashboard = lazy(() => import('./pages/ModuleDashboard'));

// eCTD Co-Author components
const FulleCTDCoAuthor = lazy(() => import('./pages/FulleCTDCoAuthor'));

// Other utility pages
// ContextDemoPage removed - was demo content
const BlueprintPage = lazy(() => import('./pages/BlueprintPage'));
const CitationManagerPage = lazy(() => import('./pages/CitationManagerPage'));
const AuditPage = lazy(() => import('./pages/AuditPage'));
const SignaturePage = lazy(() => import('./pages/SignaturePage'));
// RoleTest removed - was test content

// Analytical and Stability modules
const AnalyticalMethodsStubPage = lazy(() => import('./pages/AnalyticalMethodsStubPage'));
const ComparabilityStudiesStubPage = lazy(() => import('./pages/ComparabilityStudiesStubPage'));
const StabilityStudiesStubPage = lazy(() => import('./pages/StabilityStudiesStubPage'));
const ShelfLifePredictorStubPage = lazy(() => import('./pages/ShelfLifePredictorStubPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const ReportsDashboard = lazy(() => import('./pages/ReportsDashboard'));

// Tenant Management, Client Management and Settings Pages
const TenantManagement = lazy(() => import('./pages/TenantManagement'));
const ClientManagement = lazy(() => import('./pages/ClientManagement'));
const Settings = lazy(() => import('./pages/Settings'));

// Coding Agent Page
const CodingAgent = lazy(() => import('./pages/CodingAgent'));

// 510(k) Automation is now fully integrated into CERV2Page
// Standalone FDA510k pages have been permanently removed

const mockClinicalProtocols = [
  {
    id: 'prot_101',
    title: 'Protocol 101 — Phase II Oncology Study',
    phase: 'Phase II',
    sponsor: 'Acme BioPharma',
    owner: 'Clinical Ops',
    status: 'draft',
    updatedAt: '2d ago',
    summary: 'Primary endpoint and SAP alignment in progress. Pending data traceability checks.',
  },
  {
    id: 'prot_203',
    title: 'Protocol 203 — First-in-Human PK/PD',
    phase: 'Phase I',
    sponsor: 'Northstar Therapeutics',
    owner: 'Regulatory',
    status: 'review',
    updatedAt: '5d ago',
    summary: 'Safety sections updated; awaiting final protocol amendments and vendor confirmation.',
  },
  {
    id: 'prot_412',
    title: 'Protocol 412 — Pivotal Device Trial',
    phase: 'Pivotal',
    sponsor: 'MedDevice Co',
    owner: 'QA/RA',
    status: 'sealed',
    updatedAt: '1w ago',
    summary: 'Sealed package ready for submission packaging and final publishing checks.',
  },
];

const mockECTDTemplates = [
  {
    id: 'tmpl_m2_5',
    title: 'eCTD Module 2.5 — Clinical Overview',
    module: '2.5',
    region: 'FDA',
    status: 'draft',
    updatedAt: '3d ago',
    eta: '7 days',
    lastRun: 'Yesterday',
    summary: 'Auto-assembled from protocol metadata + study registry extracts. Needs narrative review.',
  },
  {
    id: 'tmpl_m3_2',
    title: 'eCTD Module 3.2 — Quality Overall Summary',
    module: '3.2',
    region: 'EMA',
    status: 'published',
    updatedAt: '2w ago',
    eta: null,
    lastRun: '2w ago',
    summary: 'Published template baseline with CMC placeholders and variance tracking.',
  },
];

function MissionControlPage() {
  const [view, setView] = useState('dashboard'); // 'dashboard' | 'editor'
  const [activeDoc, setActiveDoc] = useState(null);

  const handleOpenEditor = (id) => {
    // In real app, fetch doc by ID. Here we mock it.
    setActiveDoc(id === 'new' ? 'New Protocol' : `Protocol ${id}`);
    setView('editor');
  };

  const handleBack = () => {
    setView('dashboard');
    setActiveDoc(null);
  };

  // --- EDITOR VIEW ---
  if (view === 'editor') {
    return (
      <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
        {/* APP SHELL HEADER FOR EDITOR */}
        <div className="bg-white border-b border-gray-200 h-14 flex items-center justify-between px-4 shrink-0 shadow-sm z-20">
           <div className="flex items-center gap-4">
              <button 
                onClick={handleBack} 
                className="flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded transition-colors"
              >
                <ChevronLeft size={14} /> Back
              </button>
              <div className="h-6 w-px bg-gray-300"></div>
              <div>
                 <div className="text-sm font-bold text-gray-900">{activeDoc}</div>
                 <div className="text-[10px] text-gray-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> Live Sync
                 </div>
              </div>
           </div>
           
           <div className="flex items-center gap-3">
              <div className="text-xs text-gray-400 mr-2">Auto-saved 2s ago</div>
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-xs border border-blue-200">
                  ME
              </div>
           </div>
        </div>

        {/* EDITOR CANVAS */}
        <div className="flex-1 overflow-hidden relative">
            {/* USE THE TIPTAP VERSION IF AVAILABLE, ELSE LEGACY */}
            <TipTapEnhancedDocumentEditor
              document={{
                title: activeDoc,
                html: `<p><strong>${activeDoc}</strong></p><p>Start authoring…</p>`,
              }}
              onBack={handleBack}
              backLabel="Back"
              BackIcon={ChevronLeft}
            /> 
        </div>
      </div>
    );
  }

  // --- DASHBOARD VIEW ---
  return <MissionControl onOpenEditor={handleOpenEditor} />;
}

function App() {
  // Default tab for the UnifiedTopNavV3 component
  const [activeTab, setActiveTab] = useState('RiskHeatmap');
  const [showDevInterface, setShowDevInterface] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const handleKeyDown = e => {
      // Ctrl+Shift+D to open dev interface
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setShowDevInterface(true);
      }
    };

    const handleCloseDev = () => setShowDevInterface(false);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('closeDev', handleCloseDev);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('closeDev', handleCloseDev);
    };
  }, []);

  // Initial loading state management - removed artificial delay
  useEffect(() => {
    // Load immediately since TenantContext handles its own loading
    setIsLoading(false);
  }, []);

  // Get current location to determine when to show the unified nav
  const [location] = useLocation();

  // Removed stability measures to show authentic TrialSage content

  // Check if we're on the landing page, regulatory hub, coauthor pages, or dashboard (which have their own navigation)
  const isLandingPage = location === '/client-portal';
  const isRegulatoryHub =
    location === '/regulatory-intelligence-hub' || location === '/client-portal/regulatory-intel';
  const isCoAuthorPage =
    location === '/coauthor' || location.startsWith('/coauthor/') || location === '/canvas';
  const isDashboardPage = location === '/dashboard' || location === '/';
  // Ensure CERV2 pages are NOT excluded from the navigation
  const isCERV2Page = location === '/cerv2' || location.startsWith('/cerv2/');

  // Always show navigation for CERV2 pages
  const shouldShowNav =
    isCERV2Page || (!isLandingPage && !isRegulatoryHub && !isCoAuthorPage && !isDashboardPage);

  // Define CSR navigation items as per specifications
  const csrNavItems = [
    { label: 'Dashboard', path: '/csr-intelligence' },
    { label: 'Search', path: '/csr/search' },
    { label: 'Library', path: '/csr-library' },
    { label: 'Compare', path: '/csr/compare-list' }, // Link to the comparison list page
  ];

  // Only show CSR nav items on CSR pages
  const navItems =
    location.includes('/csr') ||
    location.includes('/csr-intelligence') ||
    location.includes('/csr-library')
      ? csrNavItems
      : [];

  // Show loading screen during initial hydration
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <svg
          className="animate-spin h-8 w-8 text-blue-600"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
        <span className="ml-2 text-gray-700">Loading platform...</span>
      </div>
    );
  }

  return (
    <ModuleErrorBoundary>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <TenantProvider>
            <LumenAiAssistantProvider>
              {/* Self-healing system components */}
              <SelfHealingStatusPanel />
              {process.env.NODE_ENV === 'development' && <LiveCodeMonitor />}
              {showDevInterface && <DirectDevInterface />}

              {/* Direct rendering for authentic TrialSage content */}
              <div>
                {/* Only show the UnifiedTopNavV3 if we're not on the landing page, regulatory hub, or dashboard */}
                {shouldShowNav && (
                  <UnifiedTopNavV3
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    navItems={navItems}
                  />
                )}
                <div
                  className={
                    isLandingPage
                      ? 'p-4'
                      : isRegulatoryHub
                        ? 'p-0'
                        : isCoAuthorPage
                          ? 'p-0' // No padding for CoAuthor pages
                          : isDashboardPage
                            ? 'p-0' // No padding for Dashboard page
                            : 'p-4 mt-24'
                  }
                >
                  {/* Main Content */}
                  <main className="min-h-screen bg-gray-100">
                    <Switch>
                      {/* Main Portal Landing Pages - both root and /client-portal go to same component */}
                      <Route path="/" component={MissionControlPage} />
                      <Route path="/client-portal" component={ClientPortalLanding} />
                      <Route path="/dashboard" component={MissionControlPage} />
                      {/* Client Portal becomes a secondary entry point */}
                      <Route path="/client-portal" component={ClientPortalLanding} />
                      {/* Client Portal Sub-Pages */}
                      <Route path="/client-portal/vault">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <VaultPage />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/client-portal/predictive-vault">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <PredictiveVaultPage />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/client-portal/regulatory-intel">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <RegulatoryIntelligenceHub />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/client-portal/cer-generator">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <CERV2Page />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/client-portal/cmc-wizard">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <CmcWizard />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/cmc-blueprint">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <CMCBlueprintGenerator />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/analytical-monitoring">
                        {() => {
                          const RealTimeMonitoringDashboard = lazy(
                            () => import('./components/cmc/RealTimeMonitoringDashboard')
                          );
                          return (
                            <Suspense fallback={<LoadingPage />}>
                              <RealTimeMonitoringDashboard />
                            </Suspense>
                          );
                        }}
                      </Route>
                      <Route path="/client-portal/csr-analyzer">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <CSRIntelligence />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/client-portal/ind-wizard">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <IndWizardLayout />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/client-portal/study-architect">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <StudyArchitectPage />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/client-portal/analytics">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <AnalyticsDashboard />
                          </Suspense>
                        )}
                      </Route>
                      {/* 510k functionality is now integrated in CERV2Page */}
                      <Route path="/client-portal/510k">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <CERV2Page initialDocumentType="510k" initialActiveTab="predicates" />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/client-portal/510k-dashboard">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <CERV2Page initialDocumentType="510k" initialActiveTab="predicates" />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/client-portal/client-management">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <ClientManagement />
                          </Suspense>
                        )}
                      </Route>
                      {/* Route for viewing existing applications */}
                      <Route path="/dashboard/ind">
                        <INDWizardModule />
                      </Route>
                      {/* Route for starting a new IND application - Legacy route, redirects to client portal */}
                      <Route path="/ind-wizard">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <INDWizardDashboard />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/ind-full-solution">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <INDFullSolution />
                          </Suspense>
                        )}
                      </Route>
                      {/* Client Portal IND Wizard Route - Main active route */}
                      <Route path="/client-portal/ind-wizard">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <IndWizardLayout />
                          </Suspense>
                        )}
                      </Route>
                      {/* AI Coding Agent Route */}
                      <Route path="/ai">
                        <CodingAgentPage />
                      </Route>
                      {/* Coding Agent Route */}
                      <Route path="/coding-agent">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <CodingAgent />
                          </Suspense>
                        )}
                      </Route>
                      {/* Other Module Pages */}
                      <Route path="/cer-generator">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <CERPage />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/cmc-wizard">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <CmcWizard />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/csr-analyzer">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <CSRIntelligence />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/csr-intelligence">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <CSRIntelligence />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/vault">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <VaultPage />
                          </Suspense>
                        )}
                      </Route>{' '}
                      {/* Use VaultPage which includes VaultDocumentViewer */}
                      <Route path="/vault-page">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <VaultPage />
                          </Suspense>
                        )}
                      </Route>
                      {/* vault-test route removed - was demo content */}
                      <Route path="/vault-browser">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <VaultBrowserPage />
                          </Suspense>
                        )}
                      </Route>{' '}
                      {/* Windows-style VAULT Document Browser */}
                      <Route path="/embedded-vault">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <EmbeddedVaultBrowser />
                          </Suspense>
                        )}
                      </Route>{' '}
                      {/* Integrated VAULT Browser with Document Viewer */}
                      <Route path="/predictive-vault">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <PredictiveVaultPage />
                          </Suspense>
                        )}
                      </Route>{' '}
                      {/* Predictive Analytics Vault Demo */}
                      {/* context-demo route removed - was demo content */}
                      <Route path="/coauthor">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <FileProvider>
                              <CoAuthor />
                            </FileProvider>
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/working-coauthor">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <CoAuthor />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/create-document">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <SimpleDocumentCreator />
                          </Suspense>
                        )}
                      </Route>{' '}
                      {/* Add our CoAuthor page */}
                      {/* DocumentEditor route removed - using enhanced CMC document authoring instead */}
                      <Route path="/coauthor/timeline">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <CoAuthor />
                          </Suspense>
                        )}
                      </Route>{' '}
                      {/* CoAuthor timeline tab */}
                      <Route path="/coauthor/ask-lumen">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <CoAuthor />
                          </Suspense>
                        )}
                      </Route>{' '}
                      {/* CoAuthor Ask Lumen tab */}
                      <Route path="/coauthor/canvas">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <CoAuthor />
                          </Suspense>
                        )}
                      </Route>{' '}
                      {/* CoAuthor Canvas Workbench tab */}
                      {/* eCTD Co-Author Module Subpages */}
                      <Route path="/ectd-co-author">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <FulleCTDCoAuthor />
                          </Suspense>
                        )}
                      </Route>{' '}
                      {/* Full eCTD Co-Author Module */}
                      <Route path="/coauthor/validation">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <ValidationDashboard />
                          </Suspense>
                        )}
                      </Route>{' '}
                      {/* eCTD Validation Dashboard */}
                      <Route path="/coauthor/templates">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <DocumentTemplates />
                          </Suspense>
                        )}
                      </Route>{' '}
                      {/* Document Templates Library */}
                      <Route path="/canvas">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <CanvasPage />
                          </Suspense>
                        )}
                      </Route>{' '}
                      {/* Canvas page route */}
                      <Route path="/timeline">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <TimelinePage />
                          </Suspense>
                        )}
                      </Route>{' '}
                      {/* Timeline page route */}
                      <Route path="/protocol">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <ProtocolDesignerPage />
                          </Suspense>
                        )}
                      </Route>{' '}
                      {/* Protocol Designer page route */}
                      {/* All 510k functionality is integrated in CERV2Page */}
                      <Route path="/510k">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <CERV2Page initialDocumentType="510k" initialActiveTab="predicates" />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/510k-dashboard">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <CERV2Page initialDocumentType="510k" initialActiveTab="predicates" />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/csr">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <CSRPage />
                          </Suspense>
                        )}
                      </Route>{' '}
                      {/* CSR Deep Intelligence page route */}
                      <Route path="/csr-library">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <CSRLibraryPage />
                          </Suspense>
                        )}
                      </Route>{' '}
                      {/* CSR Library page route */}
                      <Route path="/csr/search">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <CSRSearch />
                          </Suspense>
                        )}
                      </Route>{' '}
                      {/* CSR Search page route */}
                      <Route path="/csr/:id">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <CSRDetail />
                          </Suspense>
                        )}
                      </Route>{' '}
                      {/* CSR Detail page route */}
                      <Route path="/cmc">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <CMCPage />
                          </Suspense>
                        )}
                      </Route>{' '}
                      {/* CMC Module page route */}
                      <Route path="/ind-wizard">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <INDWizardDashboard />
                          </Suspense>
                        )}
                      </Route>{' '}
                      {/* IND Wizard page route */}
                      <Route path="/cer">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <CERPage />
                          </Suspense>
                        )}
                      </Route>{' '}
                      {/* CER Generator page route */}
                      <Route path="/cerV2">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <CERV2Page />
                          </Suspense>
                        )}
                      </Route>{' '}
                      {/* Advanced CER Generator page route */}
                      <Route path="/cerv2">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <CERV2Page />
                          </Suspense>
                        )}
                      </Route>{' '}
                      {/* Additional lowercase route for Advanced CER Generator */}
                      <Route path="/cerv2/info">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <CERV2Page />
                          </Suspense>
                        )}
                      </Route>{' '}
                      {/* CER Generator Landing page with detailed info */}
                      {/* role-test route removed - was test content */}
                      <Route path="/blueprint">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <BlueprintPage />
                          </Suspense>
                        )}
                      </Route>{' '}
                      {/* Blueprint Generator page route */}
                      <Route path="/citations">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <CitationManagerPage />
                          </Suspense>
                        )}
                      </Route>{' '}
                      {/* Citation Manager page route */}
                      <Route path="/audit">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <AuditPage />
                          </Suspense>
                        )}
                      </Route>{' '}
                      {/* Audit Trail page route */}
                      <Route path="/signature">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <SignaturePage />
                          </Suspense>
                        )}
                      </Route>{' '}
                      {/* Digital Signature page route */}
                      <Route path="/study-architect">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <StudyArchitectPage />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/analytics">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <AnalyticsDashboard />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/regulatory-risk-dashboard">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <RegulatoryRiskDashboard />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/regulatory-intelligence-hub">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <RegulatoryIntelligenceHub />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/regulatory-dashboard">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <RegulatoryDashboard />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/regulatory-ai-test">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <RegulatoryAITesting />
                          </Suspense>
                        )}
                      </Route>
                      {/* IND Wizard Module Routes - Using IndWizardLayout for all 7 steps */}
                      <Route path="/module-1">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <IndWizardLayout />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/module-2">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <IndWizardLayout />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/module-3">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <IndWizardLayout />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/module-4">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <IndWizardLayout />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/module-5">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <IndWizardLayout />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/module-6">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <IndWizardLayout />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/module-7">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <IndWizardLayout />
                          </Suspense>
                        )}
                      </Route>
                      {/* Analytical Control & Method Management Routes */}
                      <Route path="/analytical">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <AnalyticalMethodsStubPage />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/comparability">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <ComparabilityStudiesStubPage />
                          </Suspense>
                        )}
                      </Route>
                      {/* Stability Study Management Routes */}
                      <Route path="/stability">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <StabilityStudiesStubPage />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/stability/shelf-life-predictor">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <ShelfLifePredictorStubPage />
                          </Suspense>
                        )}
                      </Route>
                      {/* Reports Module Routes */}
                      <Route path="/reports">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <ReportsPage />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/cer-reports">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <ReportsPage />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/cerv2/reports">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <ReportsPage />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/reports-dashboard">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <ReportsDashboard />
                          </Suspense>
                        )}
                      </Route>
                      {/* Tenant Management Route */}
                      <Route path="/tenant-management">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <TenantManagement />
                          </Suspense>
                        )}
                      </Route>
                      {/* Client Management & Settings Routes */}
                      <Route path="/client-management">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <ClientManagement />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/settings">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <Settings />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/dev-agent" element={<EmbeddedCodingAgent />} />
                      <Route path="/coding-agent" element={<EmbeddedCodingAgent />} />
                      {/* Unified Submission Builder routes (combines eCTD and IND Wizard) */}
                      <Route path="/ectd-planner">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <SubmissionBuilder initialModule="ectd" />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/client-portal/module-1">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <IndWizardLayout />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/client-portal/module-2">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <IndWizardLayout />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/client-portal/module-3">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <IndWizardLayout />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/client-portal/module-4">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <IndWizardLayout />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/client-portal/module-5">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <IndWizardLayout />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/client-portal/module-6">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <IndWizardLayout />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/client-portal/module-7">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <IndWizardLayout />
                          </Suspense>
                        )}
                      </Route>
                      <Route path="/ectd-module">
                        {() => (
                          <Suspense fallback={<LoadingPage />}>
                            <SubmissionBuilder />
                          </Suspense>
                        )}
                      </Route>
                      {/* Error fallback and catch-all routes for specific modules */}
                      <Route path="/cer-*">
                        {() => (
                          <div className="flex flex-col items-center justify-center p-8">
                            <h2 className="text-2xl font-bold mb-4 text-indigo-700">
                              Redirecting to CER Generator
                            </h2>
                            <p className="mb-4 text-gray-600">
                              The URL you're trying to access is being redirected to the CER
                              Generator module.
                            </p>
                            <Button
                              onClick={() => (window.location.href = '/cerv2')}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded"
                            >
                              Go to CER Generator
                            </Button>
                          </div>
                        )}
                      </Route>
                      {/* CER Generator catch-all routes */}
                      <Route path="/cer-generator/*">{() => <CERV2Page />}</Route>
                      <Route path="/client-portal/cer-generator/*">{() => <CERV2Page />}</Route>
                      <Route path="/cerv2/*">{() => <CERV2Page />}</Route>
                      <Route path="/cerV2/*">{() => <CERV2Page />}</Route>
                      {/* Document Editor Routes removed - using enhanced CMC document authoring module instead */}
                      {/* Default Redirect to Client Portal */}
                      <Route>
                        {() => {
                          // Automatically redirect to client portal
                          window.location.href = '/client-portal';
                          return (
                            <div className="flex flex-col items-center justify-center p-8">
                              <h2 className="text-xl font-medium mb-4">
                                Redirecting to Client Portal...
                              </h2>
                              <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
                            </div>
                          );
                        }}
                      </Route>
                    </Switch>
                  </main>
                </div>
              </div>

              {/* Global AI Assistant that connects to the context */}
              <LumenAiAssistantContainer />
            </LumenAiAssistantProvider>
          </TenantProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </ModuleErrorBoundary>
  );
}

function SaaSApp() {
  const [session, setSession] = useState(null);
  const [activeModule, setActiveModule] = useState('dashboard');
  const [activeDocId, setActiveDocId] = useState(null);
  const [focusRequest, setFocusRequest] = useState(null);
  const [activeDocument, setActiveDocument] = useState(null);

  // 1. BOOTSTRAP SESSION (Simulate Auth Provider)
  useEffect(() => {
    const init = async () => {
       // Log in as Dr. Sarah (Acme Tenant)
       const s = await db.login('u1');
       // Make the build usable immediately: seed demo IND workspace + templates (persisted in localStorage)
       try {
         await db.seedDemoWorkspace(s.tenant.id);
       } catch {
         // ignore
       }
       setSession(s);
    };
    init();
  }, []);

  const handleNavigate = (module) => {
    setActiveModule(module);
    setActiveDocId(null);
    setFocusRequest(null);
  };

  const handleOpenDoc = (id) => {
    setActiveDocId(id);
    setActiveModule('co-author');
    setFocusRequest(null);
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!session?.tenant?.id || !activeDocId) {
        setActiveDocument(null);
        return;
      }

      try {
        const doc = await db.getDocument(activeDocId, session.tenant.id);
        if (!cancelled) setActiveDocument(doc);
      } catch {
        if (!cancelled) setActiveDocument({ id: String(activeDocId), title: `Protocol ${activeDocId}` });
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [activeDocId, session?.tenant?.id]);

  useEffect(() => {
    // Listen for "Deep Links" from Toasts
    const handleNav = (e) => {
      const detail = e?.detail;
      if (detail && typeof detail === 'object') {
        handleOpenDoc(detail.docId);
        setFocusRequest({
          anchorId: detail.anchorId ?? null,
          threadId: detail.threadId ?? null,
        });
        return;
      }
      // Back-compat: detail is a docId string
      handleOpenDoc(detail);
    };
    window.addEventListener('NAVIGATE_DOC', handleNav);
    return () => window.removeEventListener('NAVIGATE_DOC', handleNav);
  }, []);

  if (!session) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" size={40}/></div>;

  return (
    <ToastProvider>
    <SaaSLayout 
      user={session.user} 
      tenant={session.tenant} 
      activeModule={activeModule} 
      onNavigate={handleNavigate}
    >
      {activeModule === 'dashboard' && (
        <MissionControl onOpenEditor={handleOpenDoc} tenantId={session.tenant.id} />
      )}
      
      {activeModule === 'co-author' &&
        (activeDocId ? (
          <EnhancedDocumentEditor
            docId={activeDocId}
            document={activeDocument}
            focusRequest={focusRequest}
            tenantId={session.tenant.id}
            onOpenDoc={handleOpenDoc}
          />
        ) : (
          <MissionControl onOpenEditor={handleOpenDoc} tenantId={session.tenant.id} />
        ))}
      
      {activeModule === 'data-lake' && <DataManager tenantId={session?.tenant?.id} />}
      {activeModule === 'admin' && <div className="p-12 text-center text-gray-400">Admin Console</div>}
    </SaaSLayout>
    </ToastProvider>
  );
}

export default SaaSApp;