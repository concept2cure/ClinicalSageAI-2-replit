// /client/src/App.jsx
//
// Concept2Cure top-level app shell.
//
// Per CLAUDE.md "UI Source of Truth": the design system at design-system/
// is the sole UI authority. Five surfaces ship today:
//   - Phase 1 home          (ui_kits/home/)
//   - Phase 2 MDX workstream (ui_kits/mdx/)
//   - Phase 2 ana_ri shell  (ui_kits/ana_ri/)
//   - Phase 3 eCTD coauthor (ui_kits/ectd_coauthor/)
//   - Auth (ZenLogin / ZenSignup) — kept by product decision; ships in
//     its current form until the design bundle delivers a redesign.
//
// Routing in this file:
//   - /, /concept2cure, /concept2cure/* → ZenRouter (bundle + auth)
//   - /login, /signup, /sign-in, /auth   → /concept2cure/login
//   - /client-portal*                    → /concept2cure (legacy alias)
//   - everything else                    → /concept2cure (catch-all)

import { QueryClientProvider } from '@tanstack/react-query';
import { Switch, Route, Redirect } from 'wouter';
import { lazy, Suspense } from 'react';
import { AuthProvider } from './services/portal/authService';
import queryClient from './lib/queryClient';
import { TenantProvider } from './contexts/TenantContext.tsx';
import { EvidenceGraphProvider } from './contexts/EvidenceGraphContext';
import { memoryOptimizer } from './utils/memoryOptimizer';

import { ErrorBoundary } from './ErrorBoundary.jsx';
import { ModuleErrorBoundary } from './components/ui/error-boundary.jsx';

// Initialize memory optimization
memoryOptimizer.startPeriodicCleanup();

// Concept2Cure router — owns every bundle surface (home, mdx, ana_ri,
// ectd_coauthor) and the auth redirect targets.
const ZenRouter = lazy(() => import('./concept2cure/router/ZenRouter'));

// Loading shim used while the lazy ZenRouter chunk loads.
const LoadingPage = () => (
  <div className="min-h-screen bg-transparent" aria-hidden="true" />
);

// Main App wrapper with auth and providers
function App() {
  return (
    <ModuleErrorBoundary>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <TenantProvider>
              <EvidenceGraphProvider>
                <Switch>
                  {/* Auth aliases — every flavour funnels into the
                      canonical Concept2Cure login page. */}
                  <Route path="/sign-in">{() => <Redirect to="/concept2cure/login" />}</Route>
                  <Route path="/auth">{() => <Redirect to="/concept2cure/login" />}</Route>
                  <Route path="/login">{() => <Redirect to="/concept2cure/login" />}</Route>

                  {/* Legacy client-portal aliases — fence them to the bundle home. */}
                  <Route path="/client-portal">{() => <Redirect to="/concept2cure" />}</Route>
                  <Route path="/client-portal/:rest*">{() => <Redirect to="/concept2cure" />}</Route>

                  {/* Bundle entry — every other path resolves through ZenRouter,
                      which renders the four designed surfaces (home, mdx,
                      ana_ri, ectd_coauthor) and the auth pages. */}
                  <Route>
                    {() => (
                      <Suspense fallback={<LoadingPage />}>
                        <ZenRouter />
                      </Suspense>
                    )}
                  </Route>
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
