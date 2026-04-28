// /client/src/App.jsx
//
// Concept2Cure top-level app shell.
//
// Per CLAUDE.md "UI Source of Truth": the design system at design-system/
// is the sole UI authority. The four bundle ui_kits (home, mdx, ana_ri,
// ectd_coauthor) are the only designed surfaces. Every other page that
// previously had a route here has been removed — Replace-or-Delete Law.
//
// What remains in this file is infrastructure (providers, error boundary)
// and the minimum routing required to land users on the bundle:
//   - /, /concept2cure, /concept2cure/* → ZenRouter (bundle surfaces)
//   - /login, /signup, /sign-in, /auth   → /concept2cure/login (auth)
//   - /client-portal*                    → /concept2cure          (legacy alias)
//   - everything else                    → /concept2cure          (catch-all)
//
// TO BE REMOVED — auth (phase 5) and admin (phase 6) are flagged
// "in design — do not build" by design-system/HANDOFF.md. They remain
// reachable here because the app cannot function without login. Once
// the bundle ships those surfaces, remove the auth redirect block, the
// `<AnAAssistantProvider>` wrapper, and the global `<AnAAssistantContainer>`.

import { QueryClientProvider } from '@tanstack/react-query';
import { Switch, Route, Redirect } from 'wouter';
import { lazy, Suspense } from 'react';
import { AuthProvider } from './portal-v2/services/authService';
import queryClient from './lib/queryClient';
import { TenantProvider } from './contexts/TenantContext.tsx';
import { AnAAssistantProvider } from './contexts/AnAAssistantContext';
import { EvidenceGraphProvider } from './contexts/EvidenceGraphContext';
import { AnAAssistantContainer } from '@/components/ai/AnAAssistantContainer';
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
                {/* TO BE REMOVED — legacy AnA assistant overlay; superseded
                    by the bundle ana_ri shell. Wrapper kept so legacy
                    components that import useAnAAssistant don't crash. */}
                <AnAAssistantProvider>
                  <Switch>
                    {/* TO BE REMOVED — auth (phase 5) is "in design"; keep
                        the redirect block until the bundle ships login. */}
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

                  {/* TO BE REMOVED — legacy global AnA overlay. Renders nothing
                      visible until something opens it (and nothing in the
                      bundle does). Kept only because legacy contexts still
                      reference it. */}
                  <AnAAssistantContainer />
                </AnAAssistantProvider>
              </EvidenceGraphProvider>
            </TenantProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </ModuleErrorBoundary>
  );
}

export default App;
