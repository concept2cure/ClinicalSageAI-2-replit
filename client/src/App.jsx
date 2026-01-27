// /client/src/App.jsx

import { QueryClientProvider, useQueryClient, useQuery } from '@tanstack/react-query';
import { Switch, Route, useLocation, Link, Redirect } from 'wouter';
import { useState, useEffect, lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './hooks/use-auth';
import AuthPage from './pages/AuthPage';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  LayoutGrid,
  FileText,
  FlaskConical,
  Activity,
  BookOpen,
  Archive,
  Shield,
  ArrowRight,
  CheckCircle,
  ChevronRight,
  BarChart3,
  Users,
  Clock,
  PlayCircle,
  Edit,
  Package,
  Send,
  CheckSquare,
  UserPlus,
} from 'lucide-react';
import queryClient from './lib/queryClient';
import { TenantProvider } from './contexts/TenantContext.tsx';
import { LumenAiAssistantProvider } from './contexts/LumenAiAssistantContext';
import { FileProvider } from './contexts/FileContext.jsx';
import { SubmissionProvider } from './contexts/SubmissionContext.jsx';
import { EvidenceGraphProvider } from './contexts/EvidenceGraphContext';
import { LumenAiAssistantContainer } from '@/components/ai/LumenAiAssistantContainer';
import { memoryOptimizer } from './utils/memoryOptimizer';
import { AnimatedPipeline } from './components/ModernDashboardUI';

// Initialize memory optimization
memoryOptimizer.startPeriodicCleanup();

// Initialize dependency monitoring and hardening
import { packageMonitor } from './services/packageMonitorService.js';
import { dependencyLoader, preloadCriticalComponents } from './utils/dependencyLoader.js';

// Preload critical components for document editor
const initializeDependencyHardening = async () => {
  try {
    console.log('🔧 Initializing dependency hardening system...');

    // Verify package status
    const packageStatus = await packageMonitor.verifyAllPackages();
    console.log('📦 Package verification complete:', packageStatus);

    // Preload critical components
    const preloadResults = await preloadCriticalComponents();
    console.log('⚡ Component preloading complete:', preloadResults);

    // Check if emergency fallback is needed
    if (preloadResults.failed > 0) {
      console.warn('⚠️ Some components failed to load, fallback mode activated');
    } else {
      console.log('✅ All critical components loaded successfully');
    }

    return true;
  } catch (error) {
    console.error('❌ Dependency hardening initialization failed:', error);
    return false;
  }
};

// Initialize on app start
initializeDependencyHardening();

// Stability utilities removed to show authentic TrialSage content

// Core navigation component (loaded immediately)
import UnifiedTopNavV3 from './components/navigation/UnifiedTopNavV3';
import { ErrorBoundary } from './ErrorBoundary.jsx';
import { ModuleErrorBoundary } from './components/ui/error-boundary.jsx';
import EnhancedDocumentEditor from './components/EnhancedDocumentEditor';
import UnifiedTaskDashboard from './components/UnifiedTaskDashboard';

// Loading component for lazy-loaded routes
const LoadingPage = () => (
  <div className="flex flex-col items-center justify-center p-8 h-screen">
    <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full mb-4"></div>
    <p className="text-gray-600">Loading...</p>
  </div>
);

// Eagerly load the landing pages for faster initial render
import HomeLanding from './pages/HomeLanding';
import UnifiedSubmissionCenter from './pages/UnifiedSubmissionCenter';
const ClientPortalV2 = lazy(() => import('./portal-v2/components/client-portal'));
const ClientPortalV3 = lazy(() => import('./pages/client-portal/v3'));

// Import Enterprise Sign-On page
import TrialSageSignOn from './pages/TrialSageSignOn';

// Import Lumen Cortex AI Assistant
const LumenCortex = lazy(() => import('./pages/LumenCortex'));

// Admin & Management Pages
const AdminPage = lazy(() => import('./pages/AdminPage'));
const AdminProfile = lazy(() => import('./pages/AdminProfile'));
const UserManagementPage = lazy(() => import('./pages/admin/UserManagementPage'));
const RoleManagementPage = lazy(() => import('./pages/admin/RoleManagementPage'));
const TenantManagement = lazy(() => import('./pages/TenantManagement'));
const AuditTrailDashboard = lazy(() => import('./pages/AuditTrailDashboard'));

// Lazy load all other pages grouped by related functionality
// Stability-related pages - REMOVED: Stability only exists within CMC Blueprint

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

// Modern Task Management Dashboard
const ModernTaskDashboard = lazy(() => import('./pages/ModernTaskDashboard'));

// IND-related pages - DELETED per user request
// const INDWizard = lazy(() => import('./pages/IND/INDWizard')); // DELETED
// const UnifiedECTD = lazy(() => import('./pages/UnifiedECTD')); // DELETED
const UnifiedECTD = lazy(() => import('./pages/UnifiedECTD'));

// CSR-related pages
const CsrAnalyzer = lazy(() => import('./modules/CsrAnalyzer'));
const CSRPage = lazy(() => import('./pages/CSRPage'));
const CSRDetail = lazy(() => import('./pages/CSRDetail'));
const CSRIntelligence = lazy(() => import('./pages/CSRIntelligence'));

// Vault-related pages
const Vault = lazy(() => import('./modules/Vault'));
const VaultPage = lazy(() => import('./pages/VaultPage'));
const DataRoomPage = lazy(() => import('./pages/DataRoomPage'));
// VaultTestPage removed - was demo content
// VaultDocumentViewer removed - functionality included in VaultPage
const PredictiveVaultPage = lazy(() => import('./pages/PredictiveVaultPage'));

// CoAuthor and Canvas-related pages
const CoAuthor = lazy(() => import('./pages/CoAuthor'));
const RealCoAuthor = lazy(() => import('./pages/RealCoAuthor'));
const ComponentManagementSystem = lazy(
  () => import('./components/coauthor/ComponentManagementSystem')
);
// DocumentEditor removed - using enhanced CMC document authoring module instead

// FixedDocumentEditor removed during cleanup
const SimpleDocumentCreator = lazy(() => import('./pages/SimpleDocumentCreator'));
const CanvasPage = lazy(() => import('./pages/CanvasPage'));
const TimelinePage = lazy(() => import('./pages/TimelinePage'));
const ModuleSectionEditorPage = lazy(() => import('./pages/ModuleSectionEditorPage'));

// eCTD Co-Author Module subpages
const ValidationDashboard = lazy(() => import('./pages/ValidationDashboard'));

const DocumentTemplates = lazy(() => import('./pages/DocumentTemplates'));
const DocumentViewer = lazy(() => import('./pages/DocumentViewer'));

// Regulatory-related pages (excluding Regulatory Submissions Hub)
const RegulatoryRiskDashboard = lazy(() => import('./pages/RegulatoryRiskDashboard'));
const EnhancedRegulatoryDashboard = lazy(() => import('./pages/EnhancedRegulatoryDashboard'));
const RegulatoryDashboard = lazy(() => import('./pages/RegulatoryDashboard'));
const RegulatoryAITesting = lazy(() => import('./pages/RegulatoryAITesting'));
// RegulatoryAITestPage removed - was test content

// Unified Study & Regulatory Intelligence Suite - comprehensive module combining all features
const StudyRegulatoryIntelligenceSuite = lazy(
  () => import('./components/unified/StudyRegulatoryIntelligenceSuite')
);

// IND Wizard pages - DELETED per user request
// const IndWizardLayout = lazy(() => import('./components/ind-wizard/IndWizardLayout')); // DELETED
// import INDWizardModule from './components/ind-wizard/INDWizardModule'; // DELETED
// const INDWizardDashboard = lazy(() => import('./pages/INDWizardDashboard')); // DELETED
// const INDFullSolution = lazy(() => import('./pages/INDFullSolution')); // DELETED
// const Module1AdminPage = lazy(() => import('./modules/Module1AdminPage')); // DELETED
// const Module2SummaryPage = lazy(() => import('./modules/Module2SummaryPage')); // DELETED
// const Module3QualityPage = lazy(() => import('./modules/Module3QualityPage')); // DELETED
// const Module4NonclinicalPage = lazy(() => import('./modules/Module4NonclinicalPage')); // DELETED
// const Module5ClinicalPage = lazy(() => import('./modules/Module5ClinicalPage')); // DELETED

// Study and Protocol-related pages
const StudyArchitect = lazy(() => import('./modules/StudyArchitect'));

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
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const ReportsDashboard = lazy(() => import('./pages/ReportsDashboard'));

// Tenant Management, Client Management and Settings Pages
const TenantManagement = lazy(() => import('./pages/TenantManagement'));
const ClientManagement = lazy(() => import('./pages/ClientManagement'));
const ClientLicenseManagement = lazy(() => import('./pages/ClientLicenseManagement'));
const Settings = lazy(() => import('./pages/Settings'));
const ModuleSettingsPage = lazy(() => import('./pages/ModuleSettingsPage'));
const PreSubmissionValidation = lazy(() => import('./pages/PreSubmissionValidation'));

// Help pages
const QualityHelp = lazy(() => import('./routes/help/QualityHelp'));

// 510(k) Automation is now fully integrated into CERV2Page
// Standalone FDA510k pages have been permanently removed

// New Project Wizard for 510(k) submissions
const NewProjectWizard = lazy(() => import('./pages/NewProjectWizard'));

// Protected Route wrapper - redirects to /auth if not authenticated
const ProtectedRoute = ({ children }) => {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation('/auth');
    }
  }, [user, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
        <span className="ml-2">Checking authentication...</span>
      </div>
    );
  }

  return user ? children : null;
};

// Main App Content (protected)
function AppContent() {
  return (
    <ProtectedRoute>
      <MainApp />
    </ProtectedRoute>
  );
}

function MainApp() {
  // Default tab for the UnifiedTopNavV3 component
  const [activeTab, setActiveTab] = useState('RiskHeatmap');
  const [isLoading, setIsLoading] = useState(true);

  // Initial loading state management - removed artificial delay
  useEffect(() => {
    // Load immediately since TenantContext handles its own loading
    setIsLoading(false);
  }, []);

  // Get current location to determine when to show the unified nav
  const [location] = useLocation();

  // Removed stability measures to show authentic TrialSage content

  // Check if we're on the landing page, regulatory hub, coauthor pages, or dashboard (which have their own navigation)
  const isLandingPage = location === '/' || location === '/client-portal';
  const isRegulatoryHub =
    location === '/regulatory-intelligence-hub' || location === '/client-portal/regulatory-intel';
  const isCoAuthorPage =
    location === '/coauthor' || location.startsWith('/coauthor/') || location === '/canvas';
  const isDashboardPage = location === '/dashboard';
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
    <div>
      {/* Only show the UnifiedTopNavV3 if we're not on the landing page, regulatory hub, or dashboard */}
      {shouldShowNav && (
        <UnifiedTopNavV3 activeTab={activeTab} onTabChange={setActiveTab} navItems={navItems} />
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
            {/* V3 Portal - New Elegant UI */}
            <Route path="/v3">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <ClientPortalV3 />
                </Suspense>
              )}
            </Route>
            {/* Main Portal Landing Pages - both root and /client-portal go to same component */}
            <Route path="/" component={ClientPortalV2} />
            <Route path="/submission-center" component={UnifiedSubmissionCenter} />
            <Route path="/client-portal" component={ClientPortalV2} />
            {/* Lumen Cortex AI Assistant - Full Page */}
            <Route path="/lumen-cortex">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <LumenCortex />
                </Suspense>
              )}
            </Route>
            <Route path="/client-portal/lumen-cortex">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <LumenCortex />
                </Suspense>
              )}
            </Route>
            <Route path="/module-settings">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <ModuleSettingsPage />
                </Suspense>
              )}
            </Route>
            <Route path="/pre-submission-validation">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <PreSubmissionValidation />
                </Suspense>
              )}
            </Route>
            <Route path="/dashboard" component={ClientPortalV2} />
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
              {() => <Redirect to="/unified-suite" />}
            </Route>
            <Route path="/client-portal/protocol">{() => <Redirect to="/unified-suite" />}</Route>
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
              {() => <Redirect to="/unified-suite" />}
            </Route>
            {/* IND Wizard route DELETED per user request */}
            <Route path="/client-portal/study-architect">
              {() => <Redirect to="/unified-suite" />}
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
            {/* IND Dashboard route DELETED per user request */}
            {/* Unified eCTD System - combines IND Wizard and Co-Author */}
            <Route path="/unified-ectd">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <UnifiedECTD />
                </Suspense>
              )}
            </Route>
            <Route path="/ectd-unified">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <UnifiedECTD />
                </Suspense>
              )}
            </Route>
            {/* IND routes DELETED per user request */}
            {/* Client Portal IND Wizard Route - Main active route */}
            {/* IND Wizard route DELETED per user request */}
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
            <Route path="/csr-intelligence">{() => <Redirect to="/unified-suite" />}</Route>
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
            {/* ForesightAI™ Journey Navigator Route - redirects to unified suite */}
            <Route path="/foresight-ai">{() => <Redirect to="/unified-suite" />}</Route>
            {/* CSR Intelligence Routes */}
            <Route path="/csr-intelligence">{() => <Redirect to="/unified-suite" />}</Route>
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
            <Route path="/enhanced-editor">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <EnhancedDocumentEditor />
                </Suspense>
              )}
            </Route>
            <Route path="/module-editor">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <ModuleSectionEditorPage />
                </Suspense>
              )}
            </Route>
            <Route path="/coauthor">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <FileProvider>
                    <CoAuthor />
                  </FileProvider>
                </Suspense>
              )}
            </Route>
            {/* Component Management System (CCMS) - Component-Centric Management with UDI tracking */}
            <Route path="/components">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <ComponentManagementSystem />
                </Suspense>
              )}
            </Route>
            {/* Unified Submission Center - Enterprise-grade workflow interface */}
            <Route path="/submission-center">
              {() => {
                const UnifiedSubmissionWorkflow = () => {
                  const [location] = useLocation();
                  const queryClient = useQueryClient();
                  const { toast } = useToast();

                  // Navigation state
                  const [activeModule, setActiveModule] = useState('dashboard');
                  const [activePhase, setActivePhase] = useState('preparation');
                  const [isTransitioning, setIsTransitioning] = useState(false);

                  // Module status state
                  const [moduleStatus, setModuleStatus] = useState({
                    ind: { complete: 0, total: 7, status: 'in-progress' },
                    cmc: { complete: 0, total: 6, status: 'pending' },
                    csr: { complete: 0, total: 5, status: 'pending' },
                    ectd: { complete: 0, total: 8, status: 'pending' },
                    vault: { documents: 0, status: 'active' },
                    compliance: { score: 0, status: 'pending' },
                  });

                  // Shared data state for module integration
                  const [sharedData, setSharedData] = useState({
                    drugName: '',
                    indication: '',
                    sponsor: '',
                    phase: '',
                    protocolId: '',
                    studyDesign: '',
                    manufacturingData: null,
                    clinicalData: null,
                  });

                  // Calculate overall progress
                  const calculateOverallProgress = () => {
                    const indProgress = (moduleStatus.ind.complete / moduleStatus.ind.total) * 25;
                    const cmcProgress = (moduleStatus.cmc.complete / moduleStatus.cmc.total) * 25;
                    const csrProgress = (moduleStatus.csr.complete / moduleStatus.csr.total) * 25;
                    const ectdProgress =
                      (moduleStatus.ectd.complete / moduleStatus.ectd.total) * 25;
                    return Math.round(indProgress + cmcProgress + csrProgress + ectdProgress);
                  };

                  const overallProgress = calculateOverallProgress();

                  // Handle module navigation
                  const navigateToModule = module => {
                    setIsTransitioning(true);
                    setTimeout(() => {
                      setActiveModule(module);
                      setIsTransitioning(false);

                      // Track navigation for audit
                      addAuditEntry({
                        action: 'MODULE_NAVIGATION',
                        module: module,
                        timestamp: new Date().toISOString(),
                      });
                    }, 300);
                  };

                  // Handle data flow between modules
                  const updateSharedData = updates => {
                    setSharedData(prev => ({ ...prev, ...updates }));

                    // Propagate data to other modules via event bus
                    window.dispatchEvent(
                      new CustomEvent('submissionDataUpdate', {
                        detail: updates,
                      })
                    );
                  };

                  // Fetch module statuses from database
                  const { data: statusData } = useQuery({
                    queryKey: ['/api/submission-status'],
                    queryFn: async () => {
                      try {
                        const response = await fetch('/api/submission-status');
                        if (response.ok) {
                          return await response.json();
                        }
                        return null;
                      } catch (error) {
                        console.log('Using default status');
                        return null;
                      }
                    },
                    refetchInterval: 30000, // Refresh every 30 seconds
                  });

                  // Update module status from database
                  useEffect(() => {
                    if (statusData) {
                      setModuleStatus(statusData);
                    }
                  }, [statusData]);

                  // Listen for module updates
                  useEffect(() => {
                    const handleModuleUpdate = event => {
                      const { module, data } = event.detail;

                      if (module === 'ind' && data.drugName) {
                        updateSharedData({ drugName: data.drugName, indication: data.indication });
                      }
                      if (module === 'cmc' && data.manufacturingData) {
                        updateSharedData({ manufacturingData: data.manufacturingData });
                      }
                      if (module === 'csr' && data.clinicalData) {
                        updateSharedData({ clinicalData: data.clinicalData });
                      }
                    };

                    window.addEventListener('moduleDataUpdate', handleModuleUpdate);
                    return () => window.removeEventListener('moduleDataUpdate', handleModuleUpdate);
                  }, []);

                  // Add audit entry for tracking
                  const addAuditEntry = entry => {
                    // Store audit trail in database
                    fetch('/api/audit-log', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(entry),
                    }).catch(console.error);
                  };

                  return (
                    <SubmissionProvider>
                      <div className="min-h-screen bg-gradient-to-br from-white via-blue-50/20 to-indigo-50/20">
                        {/* Modern Professional Header */}
                        <div className="bg-white shadow-sm border-b border-gray-200">
                          <div className="px-8 py-6">
                            {/* Workflow Pipeline Visualization */}
                            <div className="mb-6">
                              <div className="flex items-center justify-between mb-3">
                                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-700 to-indigo-700 bg-clip-text text-transparent">
                                  Regulatory Submission Workflow
                                </h1>
                                <div className="flex items-center gap-3">
                                  <span className="text-sm text-gray-500">Submission ID:</span>
                                  <code className="px-2 py-1 bg-gray-100 rounded text-xs font-mono">
                                    SUB-2025-001
                                  </code>
                                  <Badge
                                    variant={
                                      overallProgress === 100
                                        ? 'success'
                                        : overallProgress > 50
                                          ? 'warning'
                                          : 'secondary'
                                    }
                                    className="ml-2"
                                  >
                                    {overallProgress === 100
                                      ? '✓ Ready'
                                      : `${overallProgress}% Complete`}
                                  </Badge>
                                </div>
                              </div>

                              {/* Modern Animated Workflow Pipeline */}
                              <div>
                                <AnimatedPipeline
                                  stages={[
                                    {
                                      name: 'Initiation',
                                      icon: PlayCircle,
                                      status: 'complete',
                                      description: 'Project started',
                                    },
                                    {
                                      name: 'Authoring',
                                      icon: Edit,
                                      status: moduleStatus.ind.complete > 0 ? 'active' : 'pending',
                                      description: 'Document creation',
                                    },
                                    {
                                      name: 'Review',
                                      icon: CheckCircle,
                                      status: moduleStatus.cmc.complete > 0 ? 'active' : 'pending',
                                      description: 'Quality review',
                                    },
                                    {
                                      name: 'Assembly',
                                      icon: Package,
                                      status: moduleStatus.ectd.complete > 0 ? 'active' : 'pending',
                                      description: 'eCTD assembly',
                                    },
                                    {
                                      name: 'Submission',
                                      icon: Send,
                                      status: overallProgress === 100 ? 'complete' : 'pending',
                                      description: 'Submit to FDA',
                                    },
                                  ]}
                                  currentStage={moduleStatus.ind.complete > 0 ? 1 : 0}
                                />
                              </div>
                            </div>

                            {/* Key Metrics Bar */}
                            <div className="grid grid-cols-6 gap-4 mb-4">
                              <div className="bg-blue-50 rounded-lg p-3">
                                <div className="text-xs text-blue-600 font-medium">Documents</div>
                                <div className="text-xl font-bold text-blue-900">
                                  {moduleStatus.vault.documents}
                                </div>
                              </div>
                              <div className="bg-green-50 rounded-lg p-3">
                                <div className="text-xs text-green-600 font-medium">Completed</div>
                                <div className="text-xl font-bold text-green-900">
                                  {moduleStatus.ind.complete + moduleStatus.cmc.complete}
                                </div>
                              </div>
                              <div className="bg-amber-50 rounded-lg p-3">
                                <div className="text-xs text-amber-600 font-medium">
                                  In Progress
                                </div>
                                <div className="text-xl font-bold text-amber-900">
                                  {moduleStatus.ind.total - moduleStatus.ind.complete}
                                </div>
                              </div>
                              <div className="bg-purple-50 rounded-lg p-3">
                                <div className="text-xs text-purple-600 font-medium">Reviews</div>
                                <div className="text-xl font-bold text-purple-900">3</div>
                              </div>
                              <div className="bg-indigo-50 rounded-lg p-3">
                                <div className="text-xs text-indigo-600 font-medium">
                                  Compliance
                                </div>
                                <div className="text-xl font-bold text-indigo-900">
                                  {moduleStatus.compliance.score}%
                                </div>
                              </div>
                              <div className="bg-rose-50 rounded-lg p-3">
                                <div className="text-xs text-rose-600 font-medium">Days Left</div>
                                <div className="text-xl font-bold text-rose-900">14</div>
                              </div>
                            </div>

                            {/* Module Navigation Tabs */}
                            <Tabs value={activeModule} onValueChange={navigateToModule}>
                              <TabsList className="grid w-full grid-cols-5 h-12">
                                <TabsTrigger value="dashboard" className="flex items-center gap-2">
                                  <LayoutGrid className="w-4 h-4" />
                                  Dashboard
                                </TabsTrigger>
                                <TabsTrigger value="ind" className="flex items-center gap-2">
                                  <FileText className="w-4 h-4" />
                                  IND Wizard
                                  <Badge variant="outline" className="ml-1 text-xs">
                                    {moduleStatus.ind.complete}/{moduleStatus.ind.total}
                                  </Badge>
                                </TabsTrigger>
                                <TabsTrigger value="cmc" className="flex items-center gap-2">
                                  <FlaskConical className="w-4 h-4" />
                                  CMC (M3)
                                  <Badge variant="outline" className="ml-1 text-xs">
                                    {moduleStatus.cmc.complete}/{moduleStatus.cmc.total}
                                  </Badge>
                                </TabsTrigger>
                                <TabsTrigger value="csr" className="flex items-center gap-2">
                                  <Activity className="w-4 h-4" />
                                  CSR (M5)
                                  <Badge variant="outline" className="ml-1 text-xs">
                                    {moduleStatus.csr.complete}/{moduleStatus.csr.total}
                                  </Badge>
                                </TabsTrigger>
                                <TabsTrigger value="ectd" className="flex items-center gap-2">
                                  <BookOpen className="w-4 h-4" />
                                  eCTD Assembly
                                  <Badge variant="outline" className="ml-1 text-xs">
                                    {moduleStatus.ectd.complete}/{moduleStatus.ectd.total}
                                  </Badge>
                                </TabsTrigger>
                              </TabsList>
                            </Tabs>

                            {/* Overall Progress Bar */}
                            <div className="mt-4 relative">
                              <Progress value={overallProgress} className="h-3 bg-gray-200" />
                              <div className="absolute top-0 left-0 w-full h-full flex items-center justify-between px-2">
                                <div className="flex items-center gap-2">
                                  <div
                                    className={`w-2 h-2 rounded-full ${overallProgress > 0 ? 'bg-blue-600' : 'bg-gray-400'}`}
                                  />
                                  <span className="text-xs text-gray-700 font-medium">Start</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-700 font-medium">
                                    IND Ready
                                  </span>
                                  <div
                                    className={`w-2 h-2 rounded-full ${overallProgress >= 25 ? 'bg-blue-600' : 'bg-gray-400'}`}
                                  />
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-700 font-medium">
                                    CMC Complete
                                  </span>
                                  <div
                                    className={`w-2 h-2 rounded-full ${overallProgress >= 50 ? 'bg-blue-600' : 'bg-gray-400'}`}
                                  />
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-700 font-medium">
                                    Clinical Ready
                                  </span>
                                  <div
                                    className={`w-2 h-2 rounded-full ${overallProgress >= 75 ? 'bg-blue-600' : 'bg-gray-400'}`}
                                  />
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-700 font-medium">
                                    Submission Ready
                                  </span>
                                  <div
                                    className={`w-2 h-2 rounded-full ${overallProgress === 100 ? 'bg-green-600' : 'bg-gray-400'}`}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Module Content Area */}
                        <div
                          className={`p-8 transition-all duration-300 ${isTransitioning ? 'opacity-0 transform scale-95' : 'opacity-100 transform scale-100'}`}
                        >
                          {activeModule === 'dashboard' && (
                            <div>
                              {/* Unified Task Management System */}
                              <UnifiedTaskDashboard organizationId={7} />

                              {/* Dashboard Grid */}
                              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">
                                {/* Module Cards with Navigation */}
                                <Card
                                  className="cursor-pointer hover:shadow-lg transition-shadow"
                                  onClick={() => navigateToModule('ind')}
                                >
                                  <CardHeader>
                                    <CardTitle className="flex items-center justify-between">
                                      <span className="flex items-center gap-2">
                                        <FileText className="w-5 h-5" />
                                        IND Wizard
                                      </span>
                                      <Badge
                                        variant={
                                          moduleStatus.ind.status === 'in-progress'
                                            ? 'default'
                                            : 'outline'
                                        }
                                      >
                                        {moduleStatus.ind.status}
                                      </Badge>
                                    </CardTitle>
                                    <CardDescription>
                                      Prepare initial IND submission documents
                                    </CardDescription>
                                  </CardHeader>
                                  <CardContent>
                                    <div className="space-y-2">
                                      <div className="flex justify-between text-sm">
                                        <span>Progress</span>
                                        <span>
                                          {moduleStatus.ind.complete} of {moduleStatus.ind.total}{' '}
                                          steps
                                        </span>
                                      </div>
                                      <Progress
                                        value={
                                          (moduleStatus.ind.complete / moduleStatus.ind.total) * 100
                                        }
                                      />
                                      {sharedData.drugName && (
                                        <div className="pt-2 text-sm text-gray-600">
                                          Drug: {sharedData.drugName}
                                        </div>
                                      )}
                                    </div>
                                  </CardContent>
                                </Card>

                                <Card
                                  className="cursor-pointer hover:shadow-lg transition-shadow"
                                  onClick={() => (window.location.href = '/cmc-blueprint')}
                                >
                                  <CardHeader>
                                    <CardTitle className="flex items-center justify-between">
                                      <span className="flex items-center gap-2">
                                        <FlaskConical className="w-5 h-5" />
                                        CMC Platform (Module 3)
                                      </span>
                                      <Badge
                                        variant={
                                          moduleStatus.cmc.status === 'in-progress'
                                            ? 'default'
                                            : 'outline'
                                        }
                                      >
                                        {moduleStatus.cmc.status}
                                      </Badge>
                                    </CardTitle>
                                    <CardDescription>
                                      Chemistry, Manufacturing, and Controls
                                    </CardDescription>
                                  </CardHeader>
                                  <CardContent>
                                    <div className="space-y-2">
                                      <div className="flex justify-between text-sm">
                                        <span>Sections Complete</span>
                                        <span>
                                          {moduleStatus.cmc.complete} of {moduleStatus.cmc.total}
                                        </span>
                                      </div>
                                      <Progress
                                        value={
                                          (moduleStatus.cmc.complete / moduleStatus.cmc.total) * 100
                                        }
                                      />
                                      <Button
                                        className="w-full mt-2"
                                        size="sm"
                                        onClick={e => {
                                          e.stopPropagation();
                                          window.location.href = '/cmc-blueprint';
                                        }}
                                      >
                                        Open CMC Platform
                                      </Button>
                                    </div>
                                  </CardContent>
                                </Card>

                                <Card
                                  className="cursor-pointer hover:shadow-lg transition-shadow"
                                  onClick={() => navigateToModule('csr')}
                                >
                                  <CardHeader>
                                    <CardTitle className="flex items-center justify-between">
                                      <span className="flex items-center gap-2">
                                        <Activity className="w-5 h-5" />
                                        CSR Intelligence (Module 5)
                                      </span>
                                      <Badge
                                        variant={
                                          moduleStatus.csr.status === 'in-progress'
                                            ? 'default'
                                            : 'outline'
                                        }
                                      >
                                        {moduleStatus.csr.status}
                                      </Badge>
                                    </CardTitle>
                                    <CardDescription>
                                      Clinical Study Report Intelligence
                                    </CardDescription>
                                  </CardHeader>
                                  <CardContent>
                                    <div className="space-y-2">
                                      <div className="flex justify-between text-sm">
                                        <span>Reports Analyzed</span>
                                        <span>
                                          {moduleStatus.csr.complete} of {moduleStatus.csr.total}
                                        </span>
                                      </div>
                                      <Progress
                                        value={
                                          (moduleStatus.csr.complete / moduleStatus.csr.total) * 100
                                        }
                                      />
                                      {sharedData.protocolId && (
                                        <div className="pt-2 text-sm text-gray-600">
                                          Protocol: {sharedData.protocolId}
                                        </div>
                                      )}
                                    </div>
                                  </CardContent>
                                </Card>

                                <Card
                                  className="cursor-pointer hover:shadow-lg transition-shadow"
                                  onClick={() => navigateToModule('ectd')}
                                >
                                  <CardHeader>
                                    <CardTitle className="flex items-center justify-between">
                                      <span className="flex items-center gap-2">
                                        <BookOpen className="w-5 h-5" />
                                        eCTD Co-Author
                                      </span>
                                      <Badge
                                        variant={
                                          moduleStatus.ectd.status === 'in-progress'
                                            ? 'default'
                                            : 'outline'
                                        }
                                      >
                                        {moduleStatus.ectd.status}
                                      </Badge>
                                    </CardTitle>
                                    <CardDescription>
                                      Document assembly and submission packaging
                                    </CardDescription>
                                  </CardHeader>
                                  <CardContent>
                                    <div className="space-y-2">
                                      <div className="flex justify-between text-sm">
                                        <span>Documents Ready</span>
                                        <span>
                                          {moduleStatus.ectd.complete} of {moduleStatus.ectd.total}
                                        </span>
                                      </div>
                                      <Progress
                                        value={
                                          (moduleStatus.ectd.complete / moduleStatus.ectd.total) *
                                          100
                                        }
                                      />
                                      <Button
                                        className="w-full mt-2"
                                        size="sm"
                                        variant="outline"
                                        onClick={e => {
                                          e.stopPropagation();
                                          window.location.href = '/coauthor';
                                        }}
                                      >
                                        Open Co-Author
                                      </Button>
                                    </div>
                                  </CardContent>
                                </Card>

                                <Card className="hover:shadow-lg transition-shadow">
                                  <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                      <Archive className="w-5 h-5" />
                                      Document Vault
                                    </CardTitle>
                                    <CardDescription>
                                      Centralized document management
                                    </CardDescription>
                                  </CardHeader>
                                  <CardContent>
                                    <div className="space-y-2">
                                      <div className="flex justify-between text-sm">
                                        <span>Total Documents</span>
                                        <span className="font-semibold">
                                          {moduleStatus.vault.documents}
                                        </span>
                                      </div>
                                      <Button
                                        className="w-full mt-2"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => (window.location.href = '/vault')}
                                      >
                                        Open Vault
                                      </Button>
                                    </div>
                                  </CardContent>
                                </Card>

                                <Card className="hover:shadow-lg transition-shadow">
                                  <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                      <Shield className="w-5 h-5" />
                                      Compliance Monitoring
                                    </CardTitle>
                                    <CardDescription>Real-time compliance tracking</CardDescription>
                                  </CardHeader>
                                  <CardContent>
                                    <div className="space-y-2">
                                      <div className="flex justify-between text-sm">
                                        <span>Compliance Score</span>
                                        <span className="font-semibold">
                                          {moduleStatus.compliance.score}%
                                        </span>
                                      </div>
                                      <Progress value={moduleStatus.compliance.score} />
                                      <Button
                                        className="w-full mt-2"
                                        size="sm"
                                        variant="outline"
                                        onClick={() =>
                                          toast({
                                            title: 'Compliance Details',
                                            description:
                                              'View detailed compliance report in the Regulatory Intelligence Hub',
                                          })
                                        }
                                      >
                                        View Details
                                      </Button>
                                    </div>
                                  </CardContent>
                                </Card>
                              </div>

                              {/* Data Flow Visualization */}
                              <Card>
                                <CardHeader>
                                  <CardTitle>Workflow Data Integration</CardTitle>
                                  <CardDescription>
                                    Real-time data flow between modules
                                  </CardDescription>
                                </CardHeader>
                                <CardContent>
                                  <div className="space-y-4">
                                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                                      <div className="flex items-center gap-3">
                                        <FileText className="w-5 h-5 text-blue-600" />
                                        <div>
                                          <div className="font-medium">IND Wizard</div>
                                          <div className="text-sm text-gray-600">
                                            Drug: {sharedData.drugName || 'Not set'}
                                          </div>
                                        </div>
                                      </div>
                                      <ArrowRight className="w-5 h-5 text-gray-400" />
                                      <div className="flex items-center gap-3">
                                        <FlaskConical className="w-5 h-5 text-green-600" />
                                        <div>
                                          <div className="font-medium">CMC Platform</div>
                                          <div className="text-sm text-gray-600">
                                            Manufacturing data
                                          </div>
                                        </div>
                                      </div>
                                      <ArrowRight className="w-5 h-5 text-gray-400" />
                                      <div className="flex items-center gap-3">
                                        <BookOpen className="w-5 h-5 text-purple-600" />
                                        <div>
                                          <div className="font-medium">eCTD Co-Author</div>
                                          <div className="text-sm text-gray-600">
                                            Final assembly
                                          </div>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                                      <div className="flex items-center gap-3">
                                        <FileText className="w-5 h-5 text-blue-600" />
                                        <div>
                                          <div className="font-medium">IND Wizard</div>
                                          <div className="text-sm text-gray-600">
                                            Clinical protocol
                                          </div>
                                        </div>
                                      </div>
                                      <ArrowRight className="w-5 h-5 text-gray-400" />
                                      <div className="flex items-center gap-3">
                                        <Activity className="w-5 h-5 text-orange-600" />
                                        <div>
                                          <div className="font-medium">CSR Intelligence</div>
                                          <div className="text-sm text-gray-600">
                                            Study analysis
                                          </div>
                                        </div>
                                      </div>
                                      <ArrowRight className="w-5 h-5 text-gray-400" />
                                      <div className="flex items-center gap-3">
                                        <BookOpen className="w-5 h-5 text-purple-600" />
                                        <div>
                                          <div className="font-medium">eCTD Co-Author</div>
                                          <div className="text-sm text-gray-600">
                                            Clinical sections
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            </div>
                          )}

                          {activeModule === 'ind' && (
                            <Card className="shadow-lg border-t-4 border-blue-500">
                              <CardContent className="p-0">
                                <IndWizardLayout
                                  onDataUpdate={data => {
                                    updateSharedData({
                                      drugName: data.drugName,
                                      indication: data.indication,
                                      sponsor: data.sponsor,
                                      phase: data.phase,
                                    });

                                    // Update module status
                                    setModuleStatus(prev => ({
                                      ...prev,
                                      ind: {
                                        ...prev.ind,
                                        complete: data.stepsComplete || prev.ind.complete,
                                      },
                                    }));
                                  }}
                                />
                              </CardContent>
                            </Card>
                          )}

                          {activeModule === 'cmc' && (
                            <Card className="shadow-lg border-t-4 border-green-500">
                              <CardContent className="p-6">
                                <div className="text-center">
                                  <h2 className="text-2xl font-bold mb-4">
                                    CMC Platform Integration
                                  </h2>
                                  <p className="text-gray-600 mb-6">
                                    Access the comprehensive CMC platform for Module 3 content
                                  </p>
                                  <Button
                                    size="lg"
                                    onClick={() => {
                                      // Pass shared data to CMC platform via URL params
                                      const params = new URLSearchParams({
                                        drugName: sharedData.drugName,
                                        indication: sharedData.indication,
                                      });
                                      window.location.href = `/cmc-blueprint?${params}`;
                                    }}
                                  >
                                    <FlaskConical className="w-5 h-5 mr-2" />
                                    Open CMC Platform
                                  </Button>
                                  {sharedData.drugName && (
                                    <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                                      <p className="text-sm text-blue-800">
                                        Data from IND Wizard will be automatically populated:
                                      </p>
                                      <div className="mt-2 text-left space-y-1">
                                        <div className="text-sm">
                                          <strong>Drug:</strong> {sharedData.drugName}
                                        </div>
                                        <div className="text-sm">
                                          <strong>Indication:</strong> {sharedData.indication}
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          )}

                          {activeModule === 'csr' && (
                            <Card className="shadow-lg border-t-4 border-orange-500">
                              <CardContent className="p-0">
                                <CSRIntelligence
                                  sharedData={sharedData}
                                  onDataUpdate={data => {
                                    updateSharedData({ clinicalData: data });
                                    setModuleStatus(prev => ({
                                      ...prev,
                                      csr: {
                                        ...prev.csr,
                                        complete: data.reportsAnalyzed || prev.csr.complete,
                                      },
                                    }));
                                  }}
                                />
                              </CardContent>
                            </Card>
                          )}

                          {activeModule === 'ectd' && (
                            <Card className="shadow-lg border-t-4 border-purple-500">
                              <CardContent className="p-0">
                                <FileProvider>
                                  <CoAuthor
                                    sharedData={sharedData}
                                    onDocumentUpdate={status => {
                                      setModuleStatus(prev => ({
                                        ...prev,
                                        ectd: {
                                          ...prev.ectd,
                                          complete: status.documentsComplete || prev.ectd.complete,
                                        },
                                      }));
                                    }}
                                  />
                                </FileProvider>
                              </CardContent>
                            </Card>
                          )}
                        </div>

                        {/* Lumen AI Assistant Integration */}
                        <LumenAiAssistantContainer />
                      </div>
                    </SubmissionProvider>
                  );
                };

                return (
                  <Suspense fallback={<LoadingPage />}>
                    <UnifiedSubmissionWorkflow />
                  </Suspense>
                );
              }}
            </Route>
            <Route path="/working-coauthor">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <CoAuthor />
                </Suspense>
              )}
            </Route>
            <Route path="/coauthor-clean">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <CoAuthor />
                </Suspense>
              )}
            </Route>
            <Route path="/coauthor">
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
            <Route path="/protocol">{() => <Redirect to="/unified-suite" />}</Route>{' '}
            {/* Protocol Designer page route - redirects to unified suite */}
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
            {/* CSR Deep Intelligence page route - keeping this as it's different from CSRIntelligence */}
            <Route path="/csr-library">{() => <Redirect to="/unified-suite" />}</Route>{' '}
            {/* CSR Library page route - redirects to unified suite */}
            <Route path="/csr/search">{() => <Redirect to="/unified-suite" />}</Route>{' '}
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
            {/* IND Wizard route DELETED per user request */} {/* IND Wizard page route */}
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
            <Route path="/study-architect">{() => <Redirect to="/unified-suite" />}</Route>
            <Route path="/unified-suite">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <StudyRegulatoryIntelligenceSuite />
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
            {/* New module routes for Client Portal */}
            {/* eCTD Unified Editor route DELETED per user request */}
            <Route path="/medical-device">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <CERV2Page />
                </Suspense>
              )}
            </Route>
            <Route path="/new-project-wizard">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <NewProjectWizard />
                </Suspense>
              )}
            </Route>
            <Route path="/module-editor">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <ModuleSectionEditorPage />
                </Suspense>
              )}
            </Route>
            <Route path="/enhanced-editor">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <EnhancedDocumentEditor />
                </Suspense>
              )}
            </Route>
            <Route path="/foresight">{() => <Redirect to="/unified-suite" />}</Route>
            <Route path="/vault">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <VaultPage />
                </Suspense>
              )}
            </Route>
            <Route path="/data-room">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <DataRoomPage />
                </Suspense>
              )}
            </Route>
            <Route path="/coauthor-clean">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <RealCoAuthor />
                </Suspense>
              )}
            </Route>
            <Route path="/working-coauthor">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <RealCoAuthor />
                </Suspense>
              )}
            </Route>
            {/* Alias routes for compatibility */}
            <Route path="/rih">{() => <Redirect to="/unified-suite" />}</Route>
            <Route path="/risk-heatmap">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <RegulatoryRiskDashboard />
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
              {() => <Redirect to="/unified-suite" />}
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
            {/* Admin Panel Routes */}
            <Route path="/admin">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <AdminPage />
                </Suspense>
              )}
            </Route>
            <Route path="/admin/users">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <UserManagementPage />
                </Suspense>
              )}
            </Route>
            <Route path="/admin/roles">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <RoleManagementPage />
                </Suspense>
              )}
            </Route>
            <Route path="/admin/audit-dashboard">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <AuditTrailDashboard />
                </Suspense>
              )}
            </Route>
            <Route path="/admin/profile">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <AdminProfile />
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
            <Route path="/client-licenses">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <ClientLicenseManagement />
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
            {/* Help Routes */}
            <Route path="/help/quality">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <QualityHelp />
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
                    The URL you're trying to access is being redirected to the CER Generator module.
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
            {/* Enhanced Document Editor Route for IND Wizard Integration */}
            <Route path="/editor">
              {() => {
                const params = new URLSearchParams(window.location.search);
                const document = {
                  id: params.get('documentId'),
                  leafId: params.get('leafId'),
                  templateId: params.get('templateId'),
                  sessionId: params.get('sessionId'),
                  title: `Document ${params.get('documentId')}`,
                };
                return (
                  <Suspense fallback={<LoadingPage />}>
                    <EnhancedDocumentEditor
                      document={document}
                      onBack={() => window.history.back()}
                    />
                  </Suspense>
                );
              }}
            </Route>
            {/* Document Editor Routes removed - using enhanced CMC document authoring module instead */}
            {/* Default Redirect to Client Portal */}
            <Route>
              {() => {
                // Automatically redirect to client portal
                window.location.href = '/client-portal';
                return (
                  <div className="flex flex-col items-center justify-center p-8">
                    <h2 className="text-xl font-medium mb-4">Redirecting to Client Portal...</h2>
                    <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
                  </div>
                );
              }}
            </Route>
          </Switch>
        </main>
      </div>
    </div>
  );
}

// Main App wrapper with auth and providers
function App() {
  const [location] = useLocation();

  // Auth page should not require authentication
  const isAuthPage = location === '/auth' || location === '/sign-in';

  return (
    <ModuleErrorBoundary>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <TenantProvider>
              <EvidenceGraphProvider>
                <LumenAiAssistantProvider>
                  <Switch>
                    {/* Enterprise Sign-On route - public */}
                    <Route path="/sign-in" component={TrialSageSignOn} />

                    {/* Legacy auth route - redirect to new sign-in */}
                    <Route path="/auth">{() => <Redirect to="/sign-in" />}</Route>

                    {/* Login route - redirect to new sign-in */}
                    <Route path="/login">{() => <Redirect to="/sign-in" />}</Route>

                    {/* All other routes - protected */}
                    <Route>{() => <AppContent />}</Route>
                  </Switch>
                  {/* Global AI Assistant */}
                  <LumenAiAssistantContainer />
                </LumenAiAssistantProvider>
              </EvidenceGraphProvider>
            </TenantProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </ModuleErrorBoundary>
  );
}

export default App;
