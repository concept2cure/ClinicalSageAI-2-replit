// /client/src/App.jsx

import { QueryClientProvider } from '@tanstack/react-query';
import { Switch, Route, useLocation, Redirect } from 'wouter';
import { useState, useEffect, lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './portal-v2/services/authService';
import queryClient from './lib/queryClient';
import { TenantProvider } from './contexts/TenantContext.tsx';
import { LumenAiAssistantProvider } from './contexts/LumenAiAssistantContext';
import { FileProvider } from './contexts/FileContext.jsx';
import { EvidenceGraphProvider } from './contexts/EvidenceGraphContext';
import { LumenAiAssistantContainer } from '@/components/ai/LumenAiAssistantContainer';
import { memoryOptimizer } from './utils/memoryOptimizer';

// Initialize memory optimization
memoryOptimizer.startPeriodicCleanup();

// Initialize dependency monitoring and hardening
import { packageMonitor } from './services/packageMonitorService.js';
import { dependencyLoader, preloadCriticalComponents } from './utils/dependencyLoader.js';

const isDev = import.meta.env.DEV;

// Preload critical components for document editor
const initializeDependencyHardening = async () => {
  try {
    if (isDev) console.log('Initializing dependency hardening system...');

    const packageStatus = await packageMonitor.verifyAllPackages();
    if (isDev) console.log('Package verification complete:', packageStatus);

    const preloadResults = await preloadCriticalComponents();
    if (isDev) console.log('Component preloading complete:', preloadResults);

    if (preloadResults.failed > 0) {
      console.warn('Some components failed to load, fallback mode activated');
    }

    return true;
  } catch (error) {
    console.error('Dependency hardening initialization failed:', error);
    return false;
  }
};

// Initialize on app start
initializeDependencyHardening();

// Prefetch high-traffic route chunks after initial render (1.5s delay)
const prefetchRoutes = () => {
  const routes = [
    () => import('./concept2cure/router/ZenRouter'),
    () => import('./pages/csr/CERV2Page'),
    () => import('./pages/cmc/CMCPage'),
    () => import('./pages/ind/UnifiedECTD'),
    () => import('./pages/vault/VaultBrowser'),
  ];
  routes.forEach(load => {
    load().catch(() => {}); // Silently prefetch, ignore errors
  });
};
if (typeof window !== 'undefined') {
  setTimeout(prefetchRoutes, 1500);
}

// Stability utilities removed to show authentic Concept2Cure content

// Core navigation component (loaded immediately)
import UnifiedTopNavV3 from './components/navigation/UnifiedTopNavV3';
import { ErrorBoundary } from './ErrorBoundary.jsx';
import { ModuleErrorBoundary } from './components/ui/error-boundary.jsx';
import EnhancedDocumentEditor from './components/EnhancedDocumentEditor';
import UnifiedTaskDashboard from './components/UnifiedTaskDashboard';

// Branded loading component for lazy-loaded routes
const LoadingPage = () => (
  <div className="flex flex-col items-center justify-center p-8 h-screen" style={{ background: '#faf9f5' }}>
    <div className="relative w-16 h-16 rounded-2xl overflow-hidden shadow-md mb-4">
      <img src="/src/assets/concept2cure-logo.jpg" alt="Concept2Cure" className="w-full h-full object-cover" />
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at center, transparent 40%, #faf9f5 100%)' }} />
    </div>
    <p className="text-sm" style={{ color: '#8a8880', fontFamily: "'Poppins', Arial, sans-serif" }}>Loading...</p>
    <div className="w-32 h-1 mt-3 rounded-full overflow-hidden" style={{ background: '#e8e6dc' }}>
      <div className="h-full rounded-full animate-pulse" style={{ background: 'linear-gradient(135deg, #d97757, #c15f3c)', width: '60%' }} />
    </div>
  </div>
);

// Eagerly load the landing pages for faster initial render
import UnifiedSubmissionCenter from './pages/ind/UnifiedSubmissionCenter';
const ClientPortalV3 = lazy(() => import('./pages/client-portal/v3'));

// Import Lumen Cortex AI Assistant
const LumenCortex = lazy(() => import('./pages/LumenCortex'));

// Import Concept2Cure - Claude.ai-style regulatory interface with ZenRouter
const ZenRouter = lazy(() => import('./concept2cure/router/ZenRouter'));

// Sales Landing Page and Billing Dashboard
const SalesLandingPage = lazy(() => import('./pages/SalesLandingPage'));
const BillingDashboard = lazy(() => import('./pages/billing/BillingDashboard'));

// Admin & Management Pages
const AdminPage = lazy(() => import('./pages/admin/AdminPage'));
const AdminProfile = lazy(() => import('./pages/admin/AdminProfile'));
const UserManagementPage = lazy(() => import('./pages/admin/UserManagementPage'));
const RoleManagementPage = lazy(() => import('./pages/admin/RoleManagementPage'));
const BatchOpsDashboard = lazy(() => import('./pages/admin/BatchOpsDashboard'));
const TenantManagement = lazy(() => import('./pages/admin/TenantManagement'));
const AuditTrailDashboard = lazy(() => import('./pages/admin/AuditTrailDashboard'));

// Lazy load all other pages grouped by related functionality
// Stability-related pages - REMOVED: Stability only exists within CMC Blueprint

// CER-related pages
// Old CerPage hidden — superseded by CERV2Page (Wave 2)
// const CERPage = lazy(() => import('./pages/csr/CerPage'));
// Import the original CERV2Page directly, not the wrapper
const CERV2Page = lazy(() => import('./pages/csr/CERV2Page'));
// Phase 7.3 – CERV2 Editor AI Integration
const CERV2EditorAI = lazy(() => import('./pages/csr/CERV2EditorAI'));

// VAULT Document Browser page
const VaultBrowserPage = lazy(() => import('./pages/vault/VaultBrowser'));
const EmbeddedVaultBrowser = lazy(() => import('./pages/vault/EmbeddedVaultBrowser'));

// CMC-related pages
const CmcWizard = lazy(() => import('./modules/CmcWizard'));
const CMCPage = lazy(() => import('./pages/cmc/CMCPage'));
const CMCBlueprintGenerator = lazy(() => import('./components/cmc/CMCBlueprintGenerator'));

const UnifiedECTD = lazy(() => import('./pages/ind/UnifiedECTD'));

// CSR-related pages
const CSRPage = lazy(() => import('./pages/csr/CSRPage'));
const CSRDetail = lazy(() => import('./pages/csr/CSRDetail'));
const CSRIntelligence = lazy(() => import('./pages/csr/CSRIntelligence'));

// Vault-related pages
const VaultPage = lazy(() => import('./pages/vault/VaultPage'));

// CoAuthor and Canvas-related pages
const CoAuthor = lazy(() => import('./pages/coauthor/CoAuthor'));
const ComponentManagementSystem = lazy(
  () => import('./components/coauthor/ComponentManagementSystem')
);
// DocumentEditor removed - using enhanced CMC document authoring module instead

const CanvasPage = lazy(() => import('./pages/coauthor/CanvasPage'));
const TimelinePage = lazy(() => import('./pages/coauthor/TimelinePage'));
const ModuleSectionEditorPage = lazy(() => import('./pages/coauthor/ModuleSectionEditorPage'));

// eCTD Co-Author Module subpages
const ValidationDashboard = lazy(() => import('./pages/admin/ValidationDashboard'));

const DocumentTemplates = lazy(() => import('./pages/coauthor/DocumentTemplates'));

// DOCX Factory — Phase 6.4.A
const DocxFactory = lazy(() => import('./pages/coauthor/DocxFactory'));

// Predicate Intelligence — Phase 6.6
const PredicateIntelligence = lazy(() => import('./pages/csr/PredicateIntelligence'));

// Regulatory-related pages (excluding Regulatory Submissions Hub)
const RegulatoryRiskDashboard = lazy(() => import('./pages/admin/RegulatoryRiskDashboard'));
const RegulatoryAITesting = lazy(() => import('./pages/admin/RegulatoryAITesting'));

// Unified Study & Regulatory Intelligence Suite - comprehensive module combining all features
const StudyRegulatoryIntelligenceSuite = lazy(
  () => import('./components/unified/StudyRegulatoryIntelligenceSuite')
);

// Analytics and Dashboard pages
const AnalyticsDashboard = lazy(() => import('./modules/AnalyticsDashboard'));

// eCTD Co-Author components
const FulleCTDCoAuthor = lazy(() => import('./pages/coauthor/FulleCTDCoAuthor'));

// Other utility pages
// ContextDemoPage removed - was demo content
const BlueprintPage = lazy(() => import('./pages/coauthor/BlueprintPage'));
const CitationManagerPage = lazy(() => import('./pages/coauthor/CitationManagerPage'));
const AuditPage = lazy(() => import('./pages/admin/AuditPage'));
const SignaturePage = lazy(() => import('./pages/admin/SignaturePage'));
// RoleTest removed - was test content

// IVDR Module — EU IVDR 2017/746 compliance
const IVDRProjectHub = lazy(() => import('./pages/regulatory/IVDRProjectHub'));

// Analytical and Stability modules
const AnalyticalMethodsStubPage = lazy(() => import('./pages/cmc/AnalyticalMethodsStubPage'));
const ComparabilityStudiesStubPage = lazy(() => import('./pages/cmc/ComparabilityStudiesStubPage'));
const ReportsPage = lazy(() => import('./pages/reports/ReportsPage'));
const ReportsDashboard = lazy(() => import('./pages/reports/ReportsDashboard'));

// Client Management and Settings Pages (TenantManagement already declared above)
const ClientManagement = lazy(() => import('./pages/admin/ClientManagement'));
const ClientLicenseManagement = lazy(() => import('./pages/admin/ClientLicenseManagement'));
const Settings = lazy(() => import('./pages/admin/Settings'));
const ModuleSettingsPage = lazy(() => import('./pages/admin/ModuleSettingsPage'));
const PreSubmissionValidation = lazy(() => import('./pages/ind/PreSubmissionValidation'));

// Help pages
const QualityHelp = lazy(() => import('./routes/help/QualityHelp'));

// 510(k) Automation is now fully integrated into CERV2Page
// Standalone FDA510k pages have been permanently removed

// New Project Wizard for 510(k) submissions
const NewProjectWizard = lazy(() => import('./pages/NewProjectWizard'));

// Platform Readiness Dashboard — interactive Phase 0–1 audit visualization
const PlatformReadinessDashboard = lazy(() => import('./pages/admin/PlatformReadinessDashboard'));

// Protected Route wrapper - redirects to Concept2Cure login if not authenticated
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation('/concept2cure/login');
    }
  }, [isAuthenticated, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
        <span className="ml-2">Checking authentication...</span>
      </div>
    );
  }

  return isAuthenticated ? children : null;
};

// Main App Content (protected)
function AppContent() {
  const [location] = useLocation();

  // These routes are handled by ZenRouter which has its own auth logic
  const isPublicRoute =
    location === '/' ||
    location === '/login' ||
    location === '/signup' ||
    location === '/concept2cure' ||
    location.startsWith('/concept2cure/');

  if (isPublicRoute) {
    return <MainApp />;
  }

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

  // Removed stability measures to show authentic Concept2Cure content

  // Check if we're on the landing page, regulatory hub, coauthor pages, or dashboard (which have their own navigation)
  const isLandingPage = location === '/client-portal';
  const isRegulatoryHub =
    location === '/regulatory-intelligence-hub' || location === '/client-portal/regulatory-intel';
  const isCoAuthorPage =
    location === '/coauthor' || location.startsWith('/coauthor/') || location === '/canvas';
  const isDashboardPage = location === '/dashboard';
  // Ensure CERV2 pages are NOT excluded from the navigation
  const isCERV2Page = location === '/cerv2' || location.startsWith('/cerv2/');

  // Concept2Cure pages (and root landing) have their own layout, no top nav needed
  const isConcept2CurePage = location === '/' || location === '/concept2cure' || location.startsWith('/concept2cure/');

  // Always show navigation for CERV2 pages
  const shouldShowNav =
    isCERV2Page ||
    (!isLandingPage &&
      !isRegulatoryHub &&
      !isCoAuthorPage &&
      !isDashboardPage &&
      !isConcept2CurePage);

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
          isConcept2CurePage
            ? '' // No padding/margins for Concept2Cure - full-screen Claude.ai-style layout
            : isLandingPage
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
        <main className={isConcept2CurePage ? 'h-screen' : 'min-h-screen bg-gray-100'}>
          <Switch>
            {/* Concept2Cure - Claude.ai-style regulatory interface with auth */}
            <Route path="/concept2cure/login">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <ZenRouter />
                </Suspense>
              )}
            </Route>
            <Route path="/concept2cure/signup">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <ZenRouter />
                </Suspense>
              )}
            </Route>
            <Route path="/concept2cure">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <ZenRouter />
                </Suspense>
              )}
            </Route>
            <Route path="/concept2cure/*">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <ZenRouter />
                </Suspense>
              )}
            </Route>
            {/* Login/Signup redirects */}
            <Route path="/login">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <ZenRouter />
                </Suspense>
              )}
            </Route>
            <Route path="/signup">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <ZenRouter />
                </Suspense>
              )}
            </Route>
            {/* V3 Portal - New Elegant UI */}
            <Route path="/v3">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <ClientPortalV3 />
                </Suspense>
              )}
            </Route>
            {/* Root → Marketing Landing Page via ZenRouter (shows LandingPage for unauth, redirects to /concept2cure for auth) */}
            <Route path="/">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <ZenRouter />
                </Suspense>
              )}
            </Route>
            {/* Public Sales Landing Page */}
            <Route path="/sales">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <SalesLandingPage />
                </Suspense>
              )}
            </Route>
            {/* Billing Dashboard - accessible from /billing shortcut */}
            <Route path="/billing">
              {() => <Redirect to="/concept2cure/billing" />}
            </Route>
            <Route path="/billing/*">
              {() => <Redirect to="/concept2cure/billing" />}
            </Route>
            {/* Root and legacy portal routes → redirect to Concept2Cure home */}
            <Route path="/">{() => <Redirect to="/concept2cure" />}</Route>
            <Route path="/submission-center" component={UnifiedSubmissionCenter} />
            {/* Lumen Cortex AI Assistant - Full Page */}
            <Route path="/lumen-cortex">
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
            {/* Unified eCTD System */}
            <Route path="/unified-ectd">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <UnifiedECTD />
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
            <Route path="/vault">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <VaultPage />
                </Suspense>
              )}
            </Route>
            <Route path="/vault-browser">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <VaultBrowserPage />
                </Suspense>
              )}
            </Route>
            <Route path="/embedded-vault">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <EmbeddedVaultBrowser />
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
            {/* DOCX Factory */}
            <Route path="/docx-factory">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <DocxFactory />
                </Suspense>
              )}
            </Route>
            {/* Predicate Intelligence */}
            <Route path="/predicate-intelligence">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <PredicateIntelligence />
                </Suspense>
              )}
            </Route>
            {/* CoAuthor sub-routes */}
            {/* Add our CoAuthor page */}
            {/* DocumentEditor route removed - using enhanced CMC document authoring instead */}
            <Route path="/coauthor/timeline">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <CoAuthor />
                </Suspense>
              )}
            </Route>
            {/* CoAuthor timeline tab */}
            <Route path="/coauthor/ask-lumen">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <CoAuthor />
                </Suspense>
              )}
            </Route>
            {/* CoAuthor Ask Lumen tab */}
            <Route path="/coauthor/canvas">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <CoAuthor />
                </Suspense>
              )}
            </Route>
            {/* CoAuthor Canvas Workbench tab */}
            {/* eCTD Co-Author Module Subpages */}
            <Route path="/ectd-co-author">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <FulleCTDCoAuthor />
                </Suspense>
              )}
            </Route>
            {/* Full eCTD Co-Author Module */}
            <Route path="/coauthor/validation">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <ValidationDashboard />
                </Suspense>
              )}
            </Route>
            {/* eCTD Validation Dashboard */}
            <Route path="/coauthor/templates">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <DocumentTemplates />
                </Suspense>
              )}
            </Route>
            {/* Document Templates Library */}
            <Route path="/canvas">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <CanvasPage />
                </Suspense>
              )}
            </Route>
            {/* Canvas page route */}
            <Route path="/timeline">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <TimelinePage />
                </Suspense>
              )}
            </Route>
            {/* Timeline page route */}
            {/* 510k functionality integrated in CERV2Page */}
            <Route path="/510k">
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
            </Route>
            {/* CSR Deep Intelligence page route - keeping this as it's different from CSRIntelligence */}
            <Route path="/csr/:id">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <CSRDetail />
                </Suspense>
              )}
            </Route>
            {/* CSR Detail page route */}
            <Route path="/cmc">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <CMCPage />
                </Suspense>
              )}
            </Route>
            {/* CMC Module page route */}
            {/* IND Wizard route DELETED per user request */} {/* IND Wizard page route */}
            {/* Old CER route hidden — superseded by CERV2Page (Wave 2) */}
            <Route path="/cerv2">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <CERV2Page />
                </Suspense>
              )}
            </Route>
            <Route path="/blueprint">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <BlueprintPage />
                </Suspense>
              )}
            </Route>
            {/* Blueprint Generator page route */}
            <Route path="/citations">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <CitationManagerPage />
                </Suspense>
              )}
            </Route>
            {/* Citation Manager page route */}
            <Route path="/audit">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <AuditPage />
                </Suspense>
              )}
            </Route>
            {/* Audit Trail page route */}
            <Route path="/signature">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <SignaturePage />
                </Suspense>
              )}
            </Route>
            {/* Digital Signature page route */}
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
            <Route path="/new-project-wizard">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <NewProjectWizard />
                </Suspense>
              )}
            </Route>
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
            <Route path="/regulatory-ai-test">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <RegulatoryAITesting />
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
            <Route path="/admin/batch-ops">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <BatchOpsDashboard />
                </Suspense>
              )}
            </Route>
            <Route path="/admin/platform-readiness">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <PlatformReadinessDashboard />
                </Suspense>
              )}
            </Route>
            <Route path="/ivdr">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <IVDRProjectHub />
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
            {/* Help Routes */}
            <Route path="/help/quality">
              {() => (
                <Suspense fallback={<LoadingPage />}>
                  <QualityHelp />
                </Suspense>
              )}
            </Route>
            {/* CER Generator catch-all routes */}
            <Route path="/cer-generator/*">{() => <CERV2Page />}</Route>
            {/* CERV2 Editor AI Integration */}
            <Route path="/cerv2/editor-ai">{() => <CERV2EditorAI />}</Route>
            <Route path="/cerv2-editor-ai">{() => <CERV2EditorAI />}</Route>
            <Route path="/cerv2/*">{() => <CERV2Page />}</Route>
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
            {/* Default catch-all → redirect to Concept2Cure */}
            <Route>{() => <Redirect to="/concept2cure" />}</Route>
          </Switch>
        </main>
      </div>
    </div>
  );
}

// Main App wrapper with auth and providers
function App() {
  return (
    <ModuleErrorBoundary>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <TenantProvider>
              <EvidenceGraphProvider>
                <LumenAiAssistantProvider>
                  <Switch>
                    {/* Unified auth routes - redirect to Concept2Cure login */}
                    <Route path="/sign-in">{() => <Redirect to="/concept2cure/login" />}</Route>
                    <Route path="/auth">{() => <Redirect to="/concept2cure/login" />}</Route>
                    <Route path="/login">{() => <Redirect to="/concept2cure/login" />}</Route>

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
