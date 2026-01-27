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

// Loading fallback component
const ModuleLoading: React.FC = () => (
  <div className="flex h-64 items-center justify-center">
    <div className="flex flex-col items-center gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
      <p className="text-sm text-muted-foreground">Loading module...</p>
    </div>
  </div>
);

// Placeholder components for routes not yet implemented
const PlaceholderPage: React.FC<{ title: string }> = ({ title }) => (
  <div className="flex h-64 flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50">
    <h2 className="text-lg font-medium text-gray-900">{title}</h2>
    <p className="mt-1 text-sm text-muted-foreground">This module is coming soon.</p>
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
              <PlaceholderPage title="Regulatory Intelligence" />
            </Route>

            {/* CMC Platform */}
            <Route path="/client-portal/cmc-wizard">
              <PlaceholderPage title="CMC Platform" />
            </Route>

            {/* Study Architect / Clinical Trials */}
            <Route path="/client-portal/study-architect">
              <PlaceholderPage title="Study Architect" />
            </Route>

            {/* Analytics */}
            <Route path="/client-portal/analytics">
              <PlaceholderPage title="Analytics Dashboard" />
            </Route>

            {/* IND Automation */}
            <Route path="/client-portal/ind-wizard">
              <PlaceholderPage title="IND Automation Wizard" />
            </Route>

            {/* CER Generator */}
            <Route path="/client-portal/cer-generator">
              <PlaceholderPage title="CER Generator" />
            </Route>

            {/* Protocol Designer */}
            <Route path="/client-portal/protocol-designer">
              <PlaceholderPage title="Protocol Designer" />
            </Route>

            {/* Safety Database */}
            <Route path="/client-portal/safety">
              <PlaceholderPage title="Safety Database" />
            </Route>

            {/* Biostatistics */}
            <Route path="/client-portal/biostatistics">
              <PlaceholderPage title="Biostatistics" />
            </Route>

            {/* Medical Writing */}
            <Route path="/client-portal/medical-writing">
              <PlaceholderPage title="Medical Writing" />
            </Route>

            {/* Dossier Builder */}
            <Route path="/client-portal/dossier">
              <PlaceholderPage title="Dossier Builder" />
            </Route>

            {/* Submission Tracker */}
            <Route path="/client-portal/submissions">
              <PlaceholderPage title="Submission Tracker" />
            </Route>

            {/* Audit Trail */}
            <Route path="/client-portal/audit">
              <PlaceholderPage title="Audit Trail" />
            </Route>

            {/* Quality Management */}
            <Route path="/client-portal/quality">
              <PlaceholderPage title="Quality Management" />
            </Route>

            {/* Document Control */}
            <Route path="/client-portal/documents">
              <PlaceholderPage title="Document Control" />
            </Route>

            {/* Settings */}
            <Route path="/client-portal/settings">
              <PlaceholderPage title="Settings" />
            </Route>

            {/* Profile */}
            <Route path="/client-portal/profile">
              <PlaceholderPage title="User Profile" />
            </Route>

            {/* Search */}
            <Route path="/client-portal/search">
              <PlaceholderPage title="Search Results" />
            </Route>

            {/* Notifications */}
            <Route path="/client-portal/notifications">
              <PlaceholderPage title="Notifications" />
            </Route>

            {/* Help */}
            <Route path="/client-portal/help">
              <PlaceholderPage title="Help & Documentation" />
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
