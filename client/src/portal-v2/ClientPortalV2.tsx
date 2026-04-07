/**
 * Concept2Cure Client Portal V2 - Main Entry Point
 *
 * Central router and provider setup for the Client Portal V2.
 * This component serves as the root of the portal module system.
 *
 * @deprecated Stage 2 beta cleanup fence.
 * This file defines a full /client-portal/* route tree, but Stage 1 ownership
 * evidence did not prove an explicit live mount from App.jsx.
 * Do not delete or repurpose until /client-portal ownership is finalized.
 */

import React, { Suspense, lazy, useState, useCallback } from 'react';
import { Route, Switch, useLocation, Redirect } from 'wouter';
import { PortalProvider } from './core/portalContext';
import { PortalFrame } from './layouts/PortalFrame';
import { MobileNav } from './layouts/MobileNav';

// Lazy load dashboard components
const UnifiedDashboard = lazy(() => import('./components/dashboards/UnifiedDashboard'));
const DocumentVault = lazy(() => import('./components/vault/DocumentVault'));
const AIAssistant = lazy(() => import('./components/ai-assistant/AIAssistant'));
const WorkflowDashboard = lazy(() => import('./components/workflows/WorkflowDashboard'));
const AuditTrailViewer = lazy(() => import('./components/audit/AuditTrailViewer'));
const SecuritySettings = lazy(() => import('./components/settings/SecuritySettings'));
const UserSecurityProfile = lazy(() => import('./components/settings/UserSecurityProfile'));
const ActivityMonitor = lazy(() => import('./components/monitoring/ActivityMonitor'));
const ComplianceDashboard = lazy(() => import('./components/compliance/ComplianceDashboard'));

// Lazy load actual module page components (connected to real implementations)
const CERV2Page = lazy(() => import('../pages/CERV2Page'));
const AnalyticsDashboard = lazy(() => import('../modules/AnalyticsDashboard'));
const CmcWizard = lazy(() => import('../modules/CmcWizard'));

// Loading fallback component
const ModuleLoading: React.FC = () => (
  <div className="flex h-64 items-center justify-center">
    <div className="flex flex-col items-center gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
      <p className="text-sm text-muted-foreground">Loading module...</p>
    </div>
  </div>
);

// Module page component — provides consistent layout for each module section
const ModulePage: React.FC<{
  title: string;
  description: string;
  icon?: string;
  status?: 'active' | 'beta' | 'preview';
}> = ({ title, description, icon, status = 'active' }) => (
  <div className="p-6">
    <div className="mb-6 flex items-center gap-3">
      {icon && <span className="text-3xl">{icon}</span>}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {status === 'beta' && (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
              Beta
            </span>
          )}
          {status === 'preview' && (
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
              Preview
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </div>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-medium text-gray-500">Status</h3>
        <p className="mt-2 text-lg font-semibold text-gray-900">
          {status === 'active'
            ? '✅ Active'
            : status === 'beta'
              ? '🔧 In Development'
              : '👁️ Preview Mode'}
        </p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-medium text-gray-500">Module</h3>
        <p className="mt-2 text-lg font-semibold text-gray-900">{title}</p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-medium text-gray-500">Last Updated</h3>
        <p className="mt-2 text-lg font-semibold text-gray-900">
          {new Date().toLocaleDateString()}
        </p>
      </div>
    </div>
  </div>
);

// Wrapper for modules that link to the Concept2Cure copilot
const CopilotPreviewPage: React.FC<{
  title: string;
  description: string;
  icon?: string;
  copilotLabel?: string;
}> = ({ title, description, icon, copilotLabel = 'Launch in AnA' }) => {
  const [, navigate] = useLocation();
  return (
    <div className="p-6">
      <div className="mb-6 flex items-center gap-3">
        {icon && <span className="text-3xl">{icon}</span>}
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
              Preview
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500">Status</h3>
          <p className="mt-2 text-lg font-semibold text-gray-900">👁️ Preview Mode</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500">Module</h3>
          <p className="mt-2 text-lg font-semibold text-gray-900">{title}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500">Last Updated</h3>
          <p className="mt-2 text-lg font-semibold text-gray-900">
            {new Date().toLocaleDateString()}
          </p>
        </div>
      </div>
      <div className="mt-6">
        <button
          onClick={() => navigate('/concept2cure')}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:ring-offset-2"
        >
          {copilotLabel}
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
        </button>
      </div>
    </div>
  );
};

// Search page with vault search input
const SearchPage: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/vault/search/?q=${encodeURIComponent(query.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setResults(Array.isArray(data) ? data : data.results || []);
      } else {
        setResults([]);
      }
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl">🔍</span>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Search Results</h1>
            <p className="mt-1 text-sm text-gray-500">Full-text search across all documents, reports and project artifacts</p>
          </div>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search documents, reports, protocols..."
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-400"
          />
          <button
            onClick={handleSearch}
            disabled={loading}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </div>
      {searched && !loading && results.length === 0 && (
        <p className="text-sm text-gray-500">No results found for "{query}".</p>
      )}
      {results.length > 0 && (
        <div className="space-y-3">
          {results.map((item: any, i: number) => (
            <div key={i} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <h3 className="font-medium text-gray-900">{item.title || item.name || `Result ${i + 1}`}</h3>
              {item.description && <p className="mt-1 text-sm text-gray-500">{item.description}</p>}
              {item.snippet && <p className="mt-1 text-sm text-gray-600">{item.snippet}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * ClientPortalV2 - Main portal application component
 *
 * Provides routing for all portal modules and wraps everything
 * in the PortalProvider context.
 */
export const ClientPortalV2: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  return (
    <PortalProvider>
      <PortalFrame>
        <Suspense fallback={<ModuleLoading />}>
          <Switch>
            {/* Dashboard Routes */}
            <Route path="/client-portal">
              <UnifiedDashboard />
            </Route>
            <Route path="/client-portal/">
              <UnifiedDashboard />
            </Route>

            {/* Document Vault */}
            <Route path="/client-portal/vault">
              <DocumentVault />
            </Route>
            <Route path="/client-portal/vault/:section*">
              <DocumentVault />
            </Route>

            {/* AI Assistant */}
            <Route path="/client-portal/ai-assistant">
              <AIAssistant />
            </Route>

            {/* Workflows */}
            <Route path="/client-portal/workflows">
              <WorkflowDashboard />
            </Route>
            <Route path="/client-portal/workflows/:workflowId">
              <WorkflowDashboard />
            </Route>

            {/* Regulatory Intelligence */}
            <Route path="/client-portal/regulatory-intel">
              <CopilotPreviewPage
                title="Regulatory Intelligence"
                description="AI-powered regulatory landscape monitoring and advisory alerts. Full RI analysis is available in the Concept2Cure copilot."
                icon="📊"
                copilotLabel="Launch in AnA"
              />
            </Route>

            {/* CMC Platform */}
            <Route path="/client-portal/cmc-wizard">
              <CmcWizard />
            </Route>

            {/* Study Architect / Clinical Trials */}
            <Route path="/client-portal/study-architect">
              <CopilotPreviewPage
                title="Study Architect"
                description="Clinical trial protocol design and optimization engine. Launch the Concept2Cure copilot for full study design capabilities."
                icon="🔬"
                copilotLabel="Launch Study Design Copilot"
              />
            </Route>

            {/* Analytics */}
            <Route path="/client-portal/analytics">
              <AnalyticsDashboard />
            </Route>

            {/* [BATCH 5] eCTD CoAuthor routes → redirect to documents */}
            <Route path="/client-portal/ind-wizard">
              <Redirect to="/client-portal/documents" />
            </Route>
            <Route path="/client-portal/ectd-coauthor">
              <Redirect to="/client-portal/documents" />
            </Route>

            {/* CER Generator — Medical Device & Diagnostic Module */}
            <Route path="/client-portal/cer-generator">
              <CERV2Page />
            </Route>

            {/* 510(k) Builder — integrated in CERV2Page */}
            <Route path="/client-portal/510k-builder">
              <CERV2Page initialDocumentType="510k" initialActiveTab="predicates" />
            </Route>
            <Route path="/client-portal/510k">
              <CERV2Page initialDocumentType="510k" initialActiveTab="predicates" />
            </Route>
            <Route path="/client-portal/510k-dashboard">
              <CERV2Page initialDocumentType="510k" initialActiveTab="predicates" />
            </Route>

            {/* [BATCH 5] Protocol Designer → redirect to documents */}
            <Route path="/client-portal/protocol-designer">
              <Redirect to="/client-portal/documents" />
            </Route>

            {/* Safety Database */}
            <Route path="/client-portal/safety">
              <ModulePage
                title="Safety Database"
                description="Adverse event tracking and safety signal detection. Connects to FDA FAERS data for real-world pharmacovigilance analysis."
                icon="🛡️"
                status="preview"
              />
            </Route>

            {/* Biostatistics */}
            <Route path="/client-portal/biostatistics">
              <ModulePage
                title="Biostatistics"
                description="Statistical analysis plans, sample size calculations and endpoint analysis"
                icon="📐"
                status="preview"
              />
            </Route>

            {/* [BATCH 5] Medical Writing & Dossier → redirect to documents */}
            <Route path="/client-portal/medical-writing">
              <Redirect to="/client-portal/documents" />
            </Route>
            <Route path="/client-portal/dossier">
              <Redirect to="/client-portal/documents" />
            </Route>

            {/* Submission Tracker */}
            <Route path="/client-portal/submissions">
              <ModulePage
                title="Submission Tracker"
                description="Track regulatory submissions across FDA, EMA and global health authorities"
                icon="🚀"
                status="beta"
              />
            </Route>

            {/* Audit Trail */}
            <Route path="/client-portal/audit">
              <AuditTrailViewer />
            </Route>

            {/* Quality Management */}
            <Route path="/client-portal/quality">
              <ComplianceDashboard />
            </Route>

            {/* Document Control */}
            <Route path="/client-portal/documents">
              <DocumentVault />
            </Route>

            {/* Settings */}
            <Route path="/client-portal/settings">
              <SecuritySettings />
            </Route>

            {/* Profile */}
            <Route path="/client-portal/profile">
              <UserSecurityProfile />
            </Route>

            {/* Search */}
            <Route path="/client-portal/search">
              <SearchPage />
            </Route>

            {/* Notifications */}
            <Route path="/client-portal/notifications">
              <ActivityMonitor />
            </Route>

            {/* Help */}
            <Route path="/client-portal/help">
              <ModulePage
                title="Help & Documentation"
                description="User guides, API documentation and regulatory reference library"
                icon="📚"
              />
            </Route>

            {/* 404 fallback */}
            <Route>
              <div className="flex h-64 flex-col items-center justify-center">
                <h2 className="text-2xl font-bold text-gray-900">404</h2>
                <p className="mt-2 text-muted-foreground">Page not found</p>
              </div>
            </Route>
          </Switch>
        </Suspense>
      </PortalFrame>

      {/* Mobile bottom navigation */}
      <MobileNav onMenuClick={() => setMobileMenuOpen(true)} />
    </PortalProvider>
  );
};

// Default export for lazy loading
export default ClientPortalV2;
