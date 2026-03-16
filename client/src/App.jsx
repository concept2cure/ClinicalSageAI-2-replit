// /client/src/App.jsx
// Sprint 1: Route/Render Truth — Pruned from 153 routes to ~35 surviving routes
// All duplicate, placeholder, and dead routes removed for beta readiness

import { QueryClientProvider } from '@tanstack/react-query';
import { Switch, Route, useLocation, Redirect } from 'wouter';
import { useState, useEffect, lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './portal-v2/services/authService';
import queryClient from './lib/queryClient';
import { TenantProvider } from './contexts/TenantContext.tsx';
import { FileProvider } from './contexts/FileContext.jsx';
import { EvidenceGraphProvider } from './contexts/EvidenceGraphContext';
import { memoryOptimizer } from './utils/memoryOptimizer';

// Initialize memory optimization
memoryOptimizer.startPeriodicCleanup();

// Core navigation (loaded immediately)
import UnifiedTopNavV3 from './components/navigation/UnifiedTopNavV3';
import { ErrorBoundary } from './ErrorBoundary.jsx';
import { ModuleErrorBoundary } from './components/ui/error-boundary.jsx';
import EnhancedDocumentEditor from './components/EnhancedDocumentEditor';

// ═══════════════════════════════════════════════════════════════════════════════
// LOADING COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

const LoadingPage = () => (
  <div className="flex flex-col items-center justify-center p-8 h-screen">
    <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full mb-4"></div>
    <p className="text-gray-600">Loading...</p>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// LAZY IMPORTS — Only surviving beta surfaces
// ═══════════════════════════════════════════════════════════════════════════════

// Primary surfaces
const ClientPortalV2 = lazy(() => import('./portal-v2/components/client-portal'));
const ZenRouter = lazy(() => import('./concept2cure/router/ZenRouter'));
const UnifiedSubmissionCenter = lazy(() => import('./pages/ind/UnifiedSubmissionCenter'));

// Medical Device Module (510k / PMA / CER)
const CERV2Page = lazy(() => import('./pages/csr/CERV2Page'));

// Submission Builder (eCTD Co-Author)
const FulleCTDCoAuthor = lazy(() => import('./pages/coauthor/FulleCTDCoAuthor'));

// Document Vault
const VaultPage = lazy(() => import('./pages/vault/VaultPage'));

// CMC Platform
const CmcWizard = lazy(() => import('./modules/CmcWizard'));

// Docx Factory
const DocxFactory = lazy(() => import('./pages/coauthor/DocxFactory'));

// Reports
const ReportsPage = lazy(() => import('./pages/reports/ReportsPage'));

// Clinical / CSR
const CSRPage = lazy(() => import('./pages/csr/CSRPage'));
const CSRDetail = lazy(() => import('./pages/csr/CSRDetail'));

// Regulatory Intelligence
const StudyRegulatoryIntelligenceSuite = lazy(
  () => import('./components/unified/StudyRegulatoryIntelligenceSuite')
);

// Analytics
const AnalyticsDashboard = lazy(() => import('./modules/AnalyticsDashboard'));

// Admin & Settings
const AdminPage = lazy(() => import('./pages/admin/AdminPage'));
const AdminProfile = lazy(() => import('./pages/admin/AdminProfile'));
const UserManagementPage = lazy(() => import('./pages/admin/UserManagementPage'));
const RoleManagementPage = lazy(() => import('./pages/admin/RoleManagementPage'));
const BatchOpsDashboard = lazy(() => import('./pages/admin/BatchOpsDashboard'));
const TenantManagement = lazy(() => import('./pages/admin/TenantManagement'));
const AuditTrailDashboard = lazy(() => import('./pages/admin/AuditTrailDashboard'));
const PlatformReadinessDashboard = lazy(() => import('./pages/admin/PlatformReadinessDashboard'));
const ClientManagement = lazy(() => import('./pages/admin/ClientManagement'));
const ClientLicenseManagement = lazy(() => import('./pages/admin/ClientLicenseManagement'));
const Settings = lazy(() => import('./pages/admin/Settings'));
const ModuleSettingsPage = lazy(() => import('./pages/admin/ModuleSettingsPage'));

// Editor
const ModuleSectionEditorPage = lazy(() => import('./pages/coauthor/ModuleSectionEditorPage'));
const UnifiedDocumentEditor = lazy(() => import('./concept2cure/components/editor/UnifiedDocumentEditor'));

// Timeline
const TimelinePage = lazy(() => import('./pages/coauthor/TimelinePage'));

// New Project Wizard
const NewProjectWizard = lazy(() => import('./pages/NewProjectWizard'));



// ═══════════════════════════════════════════════════════════════════════════════
// SUSPENSE WRAPPER — reduces boilerplate
// ═══════════════════════════════════════════════════════════════════════════════

const Lazy = ({ children }) => (
  <Suspense fallback={<LoadingPage />}>{children}</Suspense>
);

// ═══════════════════════════════════════════════════════════════════════════════
// COMING SOON PAGE — placeholder for modules pending beta activation
// ═══════════════════════════════════════════════════════════════════════════════

const ComingSoonPage = ({ title }) => (
  <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
    <div className="text-center max-w-md">
      <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-violet-100 flex items-center justify-center">
        <svg className="w-8 h-8 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-gray-900 mb-2">{title}</h2>
      <p className="text-gray-500 text-sm">This module is being activated for the beta release. Check back soon.</p>
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// PROTECTED ROUTE — redirects to Concept2Cure login if not authenticated
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// APP CONTENT — protected route shell
// ═══════════════════════════════════════════════════════════════════════════════

function AppContent() {
  const [location] = useLocation();

  const isConcept2CurePublicRoute =
    location === '/concept2cure' || location.startsWith('/concept2cure/');

  if (isConcept2CurePublicRoute) {
    return <MainApp />;
  }

  return (
    <ProtectedRoute>
      <MainApp />
    </ProtectedRoute>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT EDITOR ROUTE — loads a document by ID into UnifiedDocumentEditor
// ═══════════════════════════════════════════════════════════════════════════════

function DocumentEditorRoute({ docId }) {
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [, setLocation] = useLocation();

  useEffect(() => {
    fetch(`/api/document-authoring/documents/${docId}`, { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error('Document not found'); return r.json(); })
      .then(data => { setDoc(data.data || data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [docId]);

  if (loading) return <LoadingPage />;
  if (error) return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <p className="text-red-600 font-medium">Could not load document: {error}</p>
      <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700" onClick={() => setLocation('/client-portal/vault')}>Back to Vault</button>
    </div>
  );

  const handleSave = async (content, metadata) => {
    const response = await fetch(`/api/document-authoring/documents/${docId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ content, ...metadata }),
    });
    if (!response.ok) throw new Error('Failed to save document');
  };

  return (
    <Suspense fallback={<LoadingPage />}>
      <UnifiedDocumentEditor
        documentId={docId}
        initialContent={doc?.content || ''}
        documentTitle={doc?.title || 'Untitled Document'}
        documentType={doc?.documentType || 'regulatory'}
        onSave={handleSave}
      />
    </Suspense>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APP — all surviving routes
// ═══════════════════════════════════════════════════════════════════════════════

function MainApp() {
  const [activeTab, setActiveTab] = useState('RiskHeatmap');
  const [location] = useLocation();

  // Determine when to show the top nav
  const isConcept2CurePage = location === '/concept2cure' || location.startsWith('/concept2cure/');
  const isPortalPage = location === '/' || location === '/client-portal' || location === '/dashboard';
  const shouldShowNav = !isPortalPage && !isConcept2CurePage;

  return (
    <div>
      {shouldShowNav && (
        <UnifiedTopNavV3 activeTab={activeTab} onTabChange={setActiveTab} navItems={[]} />
      )}
      <div className={isConcept2CurePage ? '' : isPortalPage ? 'p-4' : 'p-4 mt-24'}>
        <main className="min-h-screen bg-gray-100">
          <Switch>
            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* CONCEPT2CURE — RI Copilot (Claude.ai-style regulatory AI)     */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <Route path="/concept2cure/login">{() => <Lazy><ZenRouter /></Lazy>}</Route>
            <Route path="/concept2cure/signup">{() => <Lazy><ZenRouter /></Lazy>}</Route>
            <Route path="/concept2cure">{() => <Lazy><ZenRouter /></Lazy>}</Route>
            <Route path="/concept2cure/:rest*">{() => <Lazy><ZenRouter /></Lazy>}</Route>
            <Route path="/login">{() => <Lazy><ZenRouter /></Lazy>}</Route>
            <Route path="/signup">{() => <Lazy><ZenRouter /></Lazy>}</Route>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* CLIENT PORTAL — main dashboard and module hub                 */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <Route path="/" component={ClientPortalV2} />
            <Route path="/client-portal" component={ClientPortalV2} />
            <Route path="/dashboard" component={ClientPortalV2} />

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* SUBMISSION OPS — package command center                       */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <Route path="/submission-center">{() => <Lazy><UnifiedSubmissionCenter /></Lazy>}</Route>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* MEDICAL DEVICE MODULE — 510(k), PMA, CER                     */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <Route path="/cerv2">{() => <Lazy><CERV2Page /></Lazy>}</Route>
            <Route path="/cerv2/:rest*">{() => <Lazy><CERV2Page /></Lazy>}</Route>
            <Route path="/cerV2">{() => <Lazy><CERV2Page /></Lazy>}</Route>
            <Route path="/cerV2/:rest*">{() => <Lazy><CERV2Page /></Lazy>}</Route>
            <Route path="/cer-generator">{() => <Lazy><CERV2Page /></Lazy>}</Route>
            <Route path="/cer-generator/:rest*">{() => <Lazy><CERV2Page /></Lazy>}</Route>
            <Route path="/510k">{() => <Lazy><CERV2Page initialDocumentType="510k" initialActiveTab="predicates" /></Lazy>}</Route>
            <Route path="/510k-dashboard">{() => <Lazy><CERV2Page initialDocumentType="510k" initialActiveTab="predicates" /></Lazy>}</Route>
            <Route path="/medical-device">{() => <Lazy><CERV2Page /></Lazy>}</Route>
            <Route path="/client-portal/cer-generator">{() => <Lazy><CERV2Page /></Lazy>}</Route>
            <Route path="/client-portal/cer-generator/:rest*">{() => <Lazy><CERV2Page /></Lazy>}</Route>
            <Route path="/client-portal/510k">{() => <Lazy><CERV2Page initialDocumentType="510k" initialActiveTab="predicates" /></Lazy>}</Route>
            <Route path="/client-portal/510k-builder">{() => <Lazy><CERV2Page initialDocumentType="510k" initialActiveTab="predicates" /></Lazy>}</Route>
            <Route path="/client-portal/510k-dashboard">{() => <Lazy><CERV2Page initialDocumentType="510k" initialActiveTab="predicates" /></Lazy>}</Route>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* SUBMISSION BUILDER — eCTD Co-Author                          */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <Route path="/client-portal/ectd-coauthor">{() => <Lazy><FulleCTDCoAuthor /></Lazy>}</Route>
            <Route path="/ectd-co-author">{() => <Lazy><FulleCTDCoAuthor /></Lazy>}</Route>
            {/* Legacy module redirects → eCTD Co-Author */}
            <Route path="/module-1">{() => <Redirect to="/client-portal/ectd-coauthor" />}</Route>
            <Route path="/module-2">{() => <Redirect to="/client-portal/ectd-coauthor" />}</Route>
            <Route path="/module-3">{() => <Redirect to="/client-portal/ectd-coauthor" />}</Route>
            <Route path="/module-4">{() => <Redirect to="/client-portal/ectd-coauthor" />}</Route>
            <Route path="/module-5">{() => <Redirect to="/client-portal/ectd-coauthor" />}</Route>
            <Route path="/client-portal/ind-wizard">{() => <Redirect to="/client-portal/ectd-coauthor" />}</Route>
            <Route path="/coauthor">{() => <Redirect to="/client-portal/ectd-coauthor" />}</Route>
            <Route path="/coauthor/:rest*">{() => <Redirect to="/client-portal/ectd-coauthor" />}</Route>
            <Route path="/working-coauthor">{() => <Redirect to="/client-portal/ectd-coauthor" />}</Route>
            <Route path="/coauthor-clean">{() => <Redirect to="/client-portal/ectd-coauthor" />}</Route>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* DOCUMENT VAULT — governed document system of record           */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <Route path="/client-portal/vault">{() => <Lazy><VaultPage /></Lazy>}</Route>
            <Route path="/vault">{() => <Redirect to="/client-portal/vault" />}</Route>
            <Route path="/vault-page">{() => <Redirect to="/client-portal/vault" />}</Route>
            <Route path="/vault-browser">{() => <Redirect to="/client-portal/vault" />}</Route>
            <Route path="/embedded-vault">{() => <Redirect to="/client-portal/vault" />}</Route>
            <Route path="/predictive-vault">{() => <Redirect to="/client-portal/vault" />}</Route>
            <Route path="/data-room">{() => <Redirect to="/client-portal/vault" />}</Route>
            <Route path="/client-portal/documents">{() => <Lazy><VaultPage /></Lazy>}</Route>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* CMC PLATFORM — Chemistry, Manufacturing, Controls             */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <Route path="/client-portal/cmc-wizard">{() => <Lazy><CmcWizard /></Lazy>}</Route>
            <Route path="/cmc-wizard">{() => <Lazy><CmcWizard /></Lazy>}</Route>
            <Route path="/cmc">{() => <Redirect to="/client-portal/cmc-wizard" />}</Route>
            <Route path="/cmc-blueprint">{() => <Redirect to="/client-portal/cmc-wizard" />}</Route>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* DOCX FACTORY — template-driven formal document generation     */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <Route path="/docx-factory">{() => <Lazy><DocxFactory /></Lazy>}</Route>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* REPORTS & COMMUNICATION CENTER                                */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <Route path="/reports">{() => <Lazy><ReportsPage /></Lazy>}</Route>
            <Route path="/reports-dashboard">{() => <Redirect to="/reports" />}</Route>
            <Route path="/cer-reports">{() => <Lazy><ReportsPage /></Lazy>}</Route>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* CLINICAL / CSR                                                */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <Route path="/csr">{() => <Lazy><CSRPage /></Lazy>}</Route>
            <Route path="/csr/:id">{() => <Lazy><CSRDetail /></Lazy>}</Route>
            <Route path="/csr-analyzer">{() => <Redirect to="/unified-suite" />}</Route>
            <Route path="/csr-intelligence">{() => <Redirect to="/unified-suite" />}</Route>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* REGULATORY INTELLIGENCE SUITE                                 */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <Route path="/unified-suite">{() => <Lazy><StudyRegulatoryIntelligenceSuite /></Lazy>}</Route>
            <Route path="/client-portal/regulatory-intel">{() => <Redirect to="/unified-suite" />}</Route>
            <Route path="/regulatory-dashboard">{() => <Redirect to="/unified-suite" />}</Route>
            <Route path="/regulatory-intelligence-hub">{() => <Redirect to="/unified-suite" />}</Route>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* AI ASSISTANT — consolidated into Concept2Cure ZenChat          */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <Route path="/lumen-cortex">{() => <Redirect to="/concept2cure" />}</Route>
            <Route path="/client-portal/ai-assistant">{() => <Redirect to="/concept2cure" />}</Route>
            <Route path="/client-portal/lumen-cortex">{() => <Redirect to="/concept2cure" />}</Route>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* ANALYTICS & QUALITY                                           */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <Route path="/analytics">{() => <Lazy><AnalyticsDashboard /></Lazy>}</Route>
            <Route path="/client-portal/analytics">{() => <Lazy><AnalyticsDashboard /></Lazy>}</Route>
            <Route path="/client-portal/quality">{() => <ComingSoonPage title="Quality Management" />}</Route>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* EDITORS & TOOLS                                               */}
            {/* ═══════════════════════════════════════════════════════════════ */}
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
                  <Lazy>
                    <EnhancedDocumentEditor
                      document={document}
                      onBack={() => window.history.back()}
                    />
                  </Lazy>
                );
              }}
            </Route>
            <Route path="/editor/:docId">
              {(params) => <Lazy><DocumentEditorRoute docId={params.docId} /></Lazy>}
            </Route>
            <Route path="/module-editor">{() => <Lazy><ModuleSectionEditorPage /></Lazy>}</Route>
            <Route path="/timeline">{() => <Lazy><TimelinePage /></Lazy>}</Route>
            <Route path="/client-portal/timeline-planner">{() => <Lazy><TimelinePage /></Lazy>}</Route>
            <Route path="/new-project-wizard">{() => <Lazy><NewProjectWizard /></Lazy>}</Route>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* ADMIN & SETTINGS                                              */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <Route path="/admin">{() => <Lazy><AdminPage /></Lazy>}</Route>
            <Route path="/admin/users">{() => <Lazy><UserManagementPage /></Lazy>}</Route>
            <Route path="/admin/roles">{() => <Lazy><RoleManagementPage /></Lazy>}</Route>
            <Route path="/admin/audit-dashboard">{() => <Lazy><AuditTrailDashboard /></Lazy>}</Route>
            <Route path="/admin/profile">{() => <Lazy><AdminProfile /></Lazy>}</Route>
            <Route path="/admin/batch-ops">{() => <Lazy><BatchOpsDashboard /></Lazy>}</Route>
            <Route path="/admin/platform-readiness">{() => <Lazy><PlatformReadinessDashboard /></Lazy>}</Route>
            <Route path="/tenant-management">{() => <Lazy><TenantManagement /></Lazy>}</Route>
            <Route path="/client-management">{() => <Lazy><ClientManagement /></Lazy>}</Route>
            <Route path="/client-portal/client-management">{() => <Lazy><ClientManagement /></Lazy>}</Route>
            <Route path="/client-licenses">{() => <Lazy><ClientLicenseManagement /></Lazy>}</Route>
            <Route path="/settings">{() => <Lazy><Settings /></Lazy>}</Route>
            <Route path="/client-portal/settings">{() => <Lazy><Settings /></Lazy>}</Route>
            <Route path="/module-settings">{() => <Lazy><ModuleSettingsPage /></Lazy>}</Route>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* LEGACY REDIRECTS — catch old bookmarks                        */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <Route path="/cer">{() => <Redirect to="/cerv2" />}</Route>
            <Route path="/cer-*">{() => <Redirect to="/cerv2" />}</Route>
            <Route path="/protocol">{() => <Redirect to="/unified-suite" />}</Route>
            <Route path="/study-architect">{() => <Redirect to="/unified-suite" />}</Route>
            <Route path="/foresight">{() => <Redirect to="/unified-suite" />}</Route>
            <Route path="/foresight-ai">{() => <Redirect to="/unified-suite" />}</Route>
            <Route path="/ind-full-solution">{() => <Redirect to="/client-portal/ectd-coauthor" />}</Route>
            <Route path="/ind-full-solution/:rest*">{() => <Redirect to="/client-portal/ectd-coauthor" />}</Route>
            <Route path="/enhanced-editor">{() => <Redirect to="/editor" />}</Route>
            <Route path="/canvas">{() => <Redirect to="/concept2cure" />}</Route>
            <Route path="/create-document">{() => <Redirect to="/concept2cure" />}</Route>
            <Route path="/predicate-intelligence">{() => <Redirect to="/cerv2" />}</Route>
            <Route path="/v3">{() => <Redirect to="/client-portal" />}</Route>
            <Route path="/client-portal/study-architect">{() => <Redirect to="/unified-suite" />}</Route>
            <Route path="/client-portal/csr-analyzer">{() => <Redirect to="/unified-suite" />}</Route>
            <Route path="/client-portal/protocol">{() => <Redirect to="/unified-suite" />}</Route>
            <Route path="/client-portal/safety">{() => <ComingSoonPage title="Safety Reporting" />}</Route>
            <Route path="/client-portal/training">{() => <ComingSoonPage title="Training Center" />}</Route>
            <Route path="/client-portal/project-hub">{() => <ComingSoonPage title="Project Hub" />}</Route>
            <Route path="/client-portal/predictive-vault">{() => <Redirect to="/client-portal/vault" />}</Route>
            <Route path="/regulatory-risk-dashboard">{() => <Redirect to="/unified-suite" />}</Route>
            <Route path="/regulatory-ai-test">{() => <Redirect to="/unified-suite" />}</Route>
            <Route path="/rih">{() => <Redirect to="/unified-suite" />}</Route>
            <Route path="/risk-heatmap">{() => <Redirect to="/unified-suite" />}</Route>
            <Route path="/csr-library">{() => <Redirect to="/unified-suite" />}</Route>
            <Route path="/analytical">{() => <Redirect to="/client-portal/cmc-wizard" />}</Route>
            <Route path="/comparability">{() => <Redirect to="/client-portal/cmc-wizard" />}</Route>
            <Route path="/blueprint">{() => <Redirect to="/cmc-blueprint" />}</Route>
            <Route path="/components">{() => <Redirect to="/client-portal/ectd-coauthor" />}</Route>
            <Route path="/ectd-planner">{() => <Redirect to="/client-portal/ectd-coauthor" />}</Route>
            <Route path="/ectd-module">{() => <Redirect to="/client-portal/ectd-coauthor" />}</Route>
            <Route path="/unified-ectd">{() => <Redirect to="/client-portal/ectd-coauthor" />}</Route>
            <Route path="/ectd-unified">{() => <Redirect to="/client-portal/ectd-coauthor" />}</Route>
            {/* Module number redirects */}
            <Route path="/client-portal/module-1">{() => <Redirect to="/client-portal/ectd-coauthor" />}</Route>
            <Route path="/client-portal/module-2">{() => <Redirect to="/client-portal/ectd-coauthor" />}</Route>
            <Route path="/client-portal/module-3">{() => <Redirect to="/client-portal/ectd-coauthor" />}</Route>
            <Route path="/client-portal/module-4">{() => <Redirect to="/client-portal/ectd-coauthor" />}</Route>
            <Route path="/client-portal/module-5">{() => <Redirect to="/client-portal/ectd-coauthor" />}</Route>
            <Route path="/module-6">{() => <Redirect to="/client-portal/ectd-coauthor" />}</Route>
            <Route path="/module-7">{() => <Redirect to="/client-portal/ectd-coauthor" />}</Route>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* 404 FALLBACK — redirect to portal                             */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <Route>
              {() => {
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

// ═══════════════════════════════════════════════════════════════════════════════
// APP — root with providers
// ═══════════════════════════════════════════════════════════════════════════════

function App() {
  return (
    <ModuleErrorBoundary>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <TenantProvider>
              <EvidenceGraphProvider>
                  <Switch>
                    <Route path="/sign-in">{() => <Redirect to="/concept2cure/login" />}</Route>
                    <Route path="/auth">{() => <Redirect to="/concept2cure/login" />}</Route>
                    <Route>{() => <AppContent />}</Route>
                  </Switch>
              </EvidenceGraphProvider>
            </TenantProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </ModuleErrorBoundary>
  );
}

export default App;
