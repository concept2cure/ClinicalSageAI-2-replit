/**
 * TrialSage Client Portal V2 - Main Entry Point
 *
 * Central router and provider setup for the Client Portal V2.
 * This component serves as the root of the portal module system.
 */

import React, { Suspense, lazy } from 'react';
import { Route, Switch } from 'wouter';
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
const ActivityMonitor = lazy(() => import('./components/monitoring/ActivityMonitor'));
const ComplianceDashboard = lazy(() => import('./components/compliance/ComplianceDashboard'));

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
              <ModulePage
                title="Regulatory Intelligence"
                description="AI-powered regulatory landscape monitoring and advisory alerts"
                icon="📊"
                status="beta"
              />
            </Route>

            {/* CMC Platform */}
            <Route path="/client-portal/cmc-wizard">
              <ModulePage
                title="CMC Platform"
                description="Chemistry, Manufacturing & Controls documentation wizard"
                icon="🧪"
                status="beta"
              />
            </Route>

            {/* Study Architect / Clinical Trials */}
            <Route path="/client-portal/study-architect">
              <ModulePage
                title="Study Architect"
                description="Clinical trial protocol design and optimization engine"
                icon="🔬"
                status="beta"
              />
            </Route>

            {/* Analytics */}
            <Route path="/client-portal/analytics">
              <ModulePage
                title="Analytics Dashboard"
                description="Real-time submission metrics, pipeline analytics and KPI tracking"
                icon="📈"
              />
            </Route>

            {/* IND Automation */}
            <Route path="/client-portal/ind-wizard">
              <ModulePage
                title="IND Automation Wizard"
                description="Investigational New Drug application assembly and validation"
                icon="💊"
                status="beta"
              />
            </Route>

            {/* CER Generator */}
            <Route path="/client-portal/cer-generator">
              <ModulePage
                title="CER Generator"
                description="Clinical Evaluation Report generation with EU MDR compliance"
                icon="📝"
              />
            </Route>

            {/* Protocol Designer */}
            <Route path="/client-portal/protocol-designer">
              <ModulePage
                title="Protocol Designer"
                description="Clinical protocol authoring with ICH-GCP compliance checking"
                icon="📋"
                status="beta"
              />
            </Route>

            {/* Safety Database */}
            <Route path="/client-portal/safety">
              <ModulePage
                title="Safety Database"
                description="Adverse event tracking, FAERS integration and safety signal detection"
                icon="🛡️"
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

            {/* Medical Writing */}
            <Route path="/client-portal/medical-writing">
              <ModulePage
                title="Medical Writing"
                description="AI-assisted regulatory document authoring with template library"
                icon="✍️"
                status="beta"
              />
            </Route>

            {/* Dossier Builder */}
            <Route path="/client-portal/dossier">
              <ModulePage
                title="Dossier Builder"
                description="eCTD dossier assembly with module structure validation"
                icon="📑"
                status="beta"
              />
            </Route>

            {/* Submission Tracker */}
            <Route path="/client-portal/submissions">
              <ModulePage
                title="Submission Tracker"
                description="Track regulatory submissions across FDA, EMA and global health authorities"
                icon="🚀"
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
              <ModulePage
                title="User Profile"
                description="Account settings, preferences and role management"
                icon="👤"
              />
            </Route>

            {/* Search */}
            <Route path="/client-portal/search">
              <ModulePage
                title="Search Results"
                description="Full-text search across all documents, reports and project artifacts"
                icon="🔍"
              />
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
