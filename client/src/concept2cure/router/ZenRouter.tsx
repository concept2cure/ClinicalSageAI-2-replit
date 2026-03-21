/**
 * @fileoverview Concept2Cure Unified Router
 * @module concept2cure/router/ZenRouter
 * @version 1.0.0
 *
 * @description
 * Unified routing for Concept2Cure with authentication flow.
 * Handles login, signup, and protected app routes.
 *
 * Routes:
 * - /concept2cure/login - Login page
 * - /concept2cure/signup - Request access page
 * - /concept2cure/* - Protected main app (requires auth)
 *
 * @compliance
 * - FDA 21 CFR Part 11: Session management and audit trails
 * - WCAG 2.1 AA: Accessible routing with focus management
 */

import React, { useEffect, lazy, Suspense } from 'react';
import { Switch, Route, useLocation, useRoute, Redirect } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { ZenLogin, ZenSignup, ZenAuthLayout, ZenOnboarding } from '../auth';
import { ZenApp } from '../ZenApp';
import ProofCertificatePage from '../pages/ProofCertificatePage';
import {
  AuthProvider as PortalAuthProvider,
  useAuth as usePortalAuth,
} from '@/portal-v2/services/authService';
import { isFeatureEnabled } from '@/flags/featureFlags';

// Lazy-load CERV2Page only when a project 510k route is hit (standalone mode)
const CERV2Page = lazy(() => import('@/pages/csr/CERV2Page'));
// Lazy-load PMA Workspace for standalone mode
const PMAWorkspacePage = lazy(() => import('../components/pma/PMAWorkspace'));

// NOTE: ECTDSubmissionDashboard, PharmacovigilanceDashboard, ClinicalOperationsDashboard,
// DocumentArtifactsHub, HAQManagerDashboard, INDAutoDraftDashboard are now rendered inside
// ZenApp shell (lazy-loaded there) so they get persistent AI access.

// DTC Landing Page — public, renders at / for unauthenticated users
const LandingPage = lazy(() => import('../pages/LandingPage'));

// Interactive Demo — public, AnA-narrated platform walkthrough
const InteractiveDemoPage = lazy(() => import('../pages/InteractiveDemoPage'));

// Error pages
const ErrorPages = lazy(() => import('../pages/ErrorPages'));

// Pricing page
const PricingPage = lazy(() => import('../pages/PricingPage'));

// Legal pages
const TermsOfService = lazy(() => import('../pages/legal/TermsOfService'));
const PrivacyPolicy = lazy(() => import('../pages/legal/PrivacyPolicy'));
const DataProcessingAgreement = lazy(() => import('../pages/legal/DataProcessingAgreement'));
const BusinessAssociateAgreement = lazy(() => import('../pages/legal/BusinessAssociateAgreement'));
const ServiceLevelAgreement = lazy(() => import('../pages/legal/ServiceLevelAgreement'));
const CookiePolicy = lazy(() => import('../pages/legal/CookiePolicy'));
const AcceptableUsePolicy = lazy(() => import('../pages/legal/AcceptableUsePolicy'));

// Lazy-load Billing Dashboard and Sales Landing Page
const BillingDashboard = lazy(() => import('@/pages/billing/BillingDashboard'));
const SalesLandingPage = lazy(() => import('@/pages/SalesLandingPage'));

// Lazy-load PasswordReset for the reset-password-via-email flow
const PasswordResetPage = lazy(
  () => import('@/portal-v2/components/auth/PasswordReset'),
);

/**
 * Bridge that extracts :projectId from URL and renders CERV2Page with it.
 */
const Project510kBridge: React.FC = () => {
  const [, params] = useRoute('/concept2cure/project/:projectId/510k');
  const projectId = params?.projectId ?? null;
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#FAF9F5]">
          <p className="text-sm text-[#B0AEA5]">Loading workspace…</p>
        <div className="min-h-screen flex items-center justify-center bg-[#faf9f5]">
          <p className="text-sm text-zinc-400">Loading workspace…</p>
        </div>
      }
    >
      <CERV2Page projectId={projectId} />
    </Suspense>
  );
};

/**
 * Bridge that extracts :projectId from URL and renders PMAWorkspace with it.
 */
const ProjectPMABridge: React.FC = () => {
  const [, params] = useRoute('/concept2cure/project/:projectId/pma');
  const projectId = params?.projectId ?? null;
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#FAFAF9]">
          <p className="text-sm text-zinc-400">Loading PMA workspace…</p>
        </div>
      }
    >
      <PMAWorkspacePage projectId={projectId || ''} projectName="PMA Submission" />
    </Suspense>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// LOADING SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
const ZenLoadingScreen: React.FC<{ message?: string }> = ({ message = 'Loading...' }) => (
  <div className="min-h-screen bg-[#FAF9F5] flex items-center justify-center">
  <div className="min-h-screen bg-[#faf9f5] flex items-center justify-center">
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-6"
    >
      {/* Brand logo with gentle pulse */}
      <motion.div
        animate={{ scale: [1, 1.03, 1], opacity: [0.8, 1, 0.8] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        className="relative"
      >
        <svg
          viewBox="0 0 40 40"
          className="w-full h-full"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            cx="20"
            cy="20"
            r="18"
            stroke="currentColor"
            strokeWidth="2"
            className="text-[#D97757]"
          />
          <motion.path
            d="M12 14C16 14 18 18 20 20C22 22 24 26 28 26"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="text-[#D97757]"
          />
          <motion.path
            d="M28 14C24 14 22 18 20 20C18 22 16 26 12 26"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="text-[#E8967A]"
          />
        </svg>
      </motion.div>

      <p className="text-sm text-[#8A8880]">{message}</p>
        <div className="relative w-20 h-20 rounded-2xl overflow-hidden shadow-md">
          <img
            src="/src/assets/concept2cure-logo.jpg"
            alt="Concept2Cure"
            className="w-full h-full object-cover object-center"
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(circle at center, transparent 40%, #faf9f5 100%)' }}
          />
        </div>
      </motion.div>

      <p className="text-sm text-zinc-500" style={{ fontFamily: "'Poppins', Arial, sans-serif" }}>{message}</p>

      {/* Progress bar */}
      <div className="w-48 h-1 bg-[#E8E6DC] rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-[#D97757] rounded-full"
          className="h-full rounded-full"
          style={{ background: 'linear-gradient(135deg, #d97757, #c15f3c)' }}
          initial={{ x: '-100%' }}
          animate={{ x: '100%' }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
    </motion.div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// PROTECTED ROUTE WRAPPER
// ═══════════════════════════════════════════════════════════════════════════════

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading } = usePortalAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Redirect to login with return URL
      setLocation('/concept2cure/login');
    }
  }, [isAuthenticated, isLoading, setLocation]);

  if (isLoading) {
    return <ZenLoadingScreen message="Checking authentication..." />;
  }

  if (!isAuthenticated) {
    return null; // Will redirect
  }

  return <>{children}</>;
};

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH ROUTE WRAPPER (redirects if already logged in)
// ═══════════════════════════════════════════════════════════════════════════════

interface AuthRouteProps {
  children: React.ReactNode;
}

const AuthRoute: React.FC<AuthRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading } = usePortalAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      // Already logged in, redirect to main app
      setLocation('/concept2cure');
    }
  }, [isAuthenticated, isLoading, setLocation]);

  if (isLoading) {
    return <ZenLoadingScreen message="Loading..." />;
  }

  if (isAuthenticated) {
    return null; // Will redirect
  }

  return <ZenAuthLayout>{children}</ZenAuthLayout>;
};

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE TRANSITION WRAPPER
// ═══════════════════════════════════════════════════════════════════════════════

interface PageTransitionProps {
  children: React.ReactNode;
}

const PageTransition: React.FC<PageTransitionProps> = ({ children }) => (
  <motion.div
    className="h-full"
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -8 }}
    transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
  >
    {children}
  </motion.div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// LANDING PAGE ROUTE (public → landing, authenticated → redirect to app)
// ═══════════════════════════════════════════════════════════════════════════════

const LandingPageRoute: React.FC = () => {
  const { isAuthenticated, isLoading } = usePortalAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      setLocation('/concept2cure');
    }
  }, [isAuthenticated, isLoading, setLocation]);

  if (isLoading) {
    return <ZenLoadingScreen message="Loading..." />;
  }

  if (isAuthenticated) {
    return null; // Will redirect
  }

  return (
    <Suspense fallback={<ZenLoadingScreen message="Loading..." />}>
      <LandingPage />
    </Suspense>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ROUTER
// ═══════════════════════════════════════════════════════════════════════════════

export const ZenRouter: React.FC = () => {
  const [location] = useLocation();

  return (
    <PortalAuthProvider>
      <AnimatePresence mode="wait">
        <Switch location={location} key={location}>
          {/* Interactive Demo — public, no auth required */}
          <Route path="/concept2cure/demo">
            {() => (
              <PageTransition>
                <Suspense fallback={<ZenLoadingScreen message="Loading demo..." />}>
                  <InteractiveDemoPage />
                </Suspense>
              </PageTransition>
            )}
          </Route>

          {/* Login page */}
          <Route path="/concept2cure/login">
            {() => (
              <PageTransition>
                <AuthRoute>
                  <ZenLogin />
                </AuthRoute>
              </PageTransition>
            )}
          </Route>

          {/* Signup / Request Access page */}
          <Route path="/concept2cure/signup">
            {() => (
              <PageTransition>
                <AuthRoute>
                  <ZenSignup />
                </AuthRoute>
              </PageTransition>
            )}
          </Route>

          {/* Alias: /login redirects to /concept2cure/login */}
          <Route path="/login">{() => <Redirect to="/concept2cure/login" />}</Route>

          {/* Alias: /signup redirects to /concept2cure/signup */}
          <Route path="/signup">{() => <Redirect to="/concept2cure/signup" />}</Route>

          {/* DTC Landing Page — public, shows for unauthenticated visitors */}
          <Route path="/">
            {() => (
              <PageTransition>
                <LandingPageRoute />
              </PageTransition>
            )}
          </Route>
          {/* Alias: /billing redirects to /concept2cure/billing */}
          <Route path="/billing">{() => <Redirect to="/concept2cure/billing" />}</Route>

          {/* Password reset (linked from email) */}
          <Route path="/concept2cure/password-reset">
            {() => (
              <PageTransition>
                <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
                  <PasswordResetPage />
                </Suspense>
              </PageTransition>
            )}
          </Route>

          {/* Onboarding - protected, for first-time users */}
          <Route path="/concept2cure/onboarding">
            {() => (
              <PageTransition>
                <ProtectedRoute>
                  <ZenOnboarding />
                </ProtectedRoute>
              </PageTransition>
            )}
          </Route>

          {/* Proof Certificate Explorer */}
          <Route path="/concept2cure/proofs/:workflowRunId">
            {() => (
              <PageTransition>
                <ProtectedRoute>
                  <ProofCertificatePage />
                </ProtectedRoute>
              </PageTransition>
            )}
          </Route>

          {/* Project-scoped 510(k) workspace
              When EMBED_MODULES_IN_SHELL is enabled, this route falls through
              to ZenApp (caught by project/:projectId/:rest*) which renders CERV2
              inside the shell frame. When disabled, standalone full-page bridge. */}
          {!isFeatureEnabled('EMBED_MODULES_IN_SHELL') && (
            <Route path="/concept2cure/project/:projectId/510k">
              {() => (
                <PageTransition>
                  <ProtectedRoute>
                    <Project510kBridge />
                  </ProtectedRoute>
                </PageTransition>
              )}
            </Route>
          )}

          {/* Project-scoped PMA workspace (standalone mode) */}
          {!isFeatureEnabled('EMBED_MODULES_IN_SHELL') && (
            <Route path="/concept2cure/project/:projectId/pma">
              {() => (
                <PageTransition>
                  <ProtectedRoute>
                    <ProjectPMABridge />
                  </ProtectedRoute>
                </PageTransition>
              )}
            </Route>
          )}
          {/* Billing Dashboard - protected */}
          <Route path="/concept2cure/billing">
            {() => (
              <PageTransition>
                <ProtectedRoute>
                  <Suspense fallback={<ZenLoadingScreen message="Loading billing..." />}>
                    <BillingDashboard />
                  </Suspense>
                </ProtectedRoute>
              </PageTransition>
            )}
          </Route>

          {/* Pricing Page — public */}
          <Route path="/concept2cure/pricing">
            {() => (<PageTransition><Suspense fallback={<ZenLoadingScreen message="Loading pricing..." />}><PricingPage /></Suspense></PageTransition>)}
          </Route>

          {/* Legal Pages — public, no auth required */}
          <Route path="/concept2cure/legal/terms">
            {() => (<PageTransition><Suspense fallback={<ZenLoadingScreen message="Loading..." />}><TermsOfService /></Suspense></PageTransition>)}
          </Route>
          <Route path="/concept2cure/legal/privacy">
            {() => (<PageTransition><Suspense fallback={<ZenLoadingScreen message="Loading..." />}><PrivacyPolicy /></Suspense></PageTransition>)}
          </Route>
          <Route path="/concept2cure/legal/dpa">
            {() => (<PageTransition><Suspense fallback={<ZenLoadingScreen message="Loading..." />}><DataProcessingAgreement /></Suspense></PageTransition>)}
          </Route>
          <Route path="/concept2cure/legal/baa">
            {() => (<PageTransition><Suspense fallback={<ZenLoadingScreen message="Loading..." />}><BusinessAssociateAgreement /></Suspense></PageTransition>)}
          </Route>
          <Route path="/concept2cure/legal/sla">
            {() => (<PageTransition><Suspense fallback={<ZenLoadingScreen message="Loading..." />}><ServiceLevelAgreement /></Suspense></PageTransition>)}
          </Route>
          <Route path="/concept2cure/legal/cookies">
            {() => (<PageTransition><Suspense fallback={<ZenLoadingScreen message="Loading..." />}><CookiePolicy /></Suspense></PageTransition>)}
          </Route>
          <Route path="/concept2cure/legal/aup">
            {() => (<PageTransition><Suspense fallback={<ZenLoadingScreen message="Loading..." />}><AcceptableUsePolicy /></Suspense></PageTransition>)}
          </Route>

          {/* Project-scoped hub — ZenApp reads :projectId from route */}
          <Route path="/concept2cure/project/:projectId/:rest*">
            {() => (
              <PageTransition>
                <ProtectedRoute>
                  <ZenApp />
                </ProtectedRoute>
              </PageTransition>
            )}
          </Route>

          <Route path="/concept2cure/project/:projectId">
            {() => (
              <PageTransition>
                <ProtectedRoute>
                  <ZenApp />
                </ProtectedRoute>
              </PageTransition>
            )}
          </Route>

          {/* Main app - protected */}
          <Route path="/concept2cure">
            {() => (
              <PageTransition>
                <ProtectedRoute>
                  <ZenApp />
                </ProtectedRoute>
              </PageTransition>
            )}
          </Route>

          {/* Shell-embedded dashboard routes — rendered inside ZenApp for persistent AI access */}
          <Route path="/concept2cure/ectd-agent">
            {() => (
              <PageTransition>
                <ProtectedRoute>
                  <ZenApp />
                </ProtectedRoute>
              </PageTransition>
            )}
          </Route>
          <Route path="/concept2cure/pharmacovigilance">
            {() => (
              <PageTransition>
                <ProtectedRoute>
                  <ZenApp />
                </ProtectedRoute>
              </PageTransition>
            )}
          </Route>
          <Route path="/concept2cure/documents">
            {() => (
              <PageTransition>
                <ProtectedRoute>
                  <ZenApp />
                </ProtectedRoute>
              </PageTransition>
            )}
          </Route>
          <Route path="/concept2cure/haq-manager">
            {() => (
              <PageTransition>
                <ProtectedRoute>
                  <ZenApp />
                </ProtectedRoute>
              </PageTransition>
            )}
          </Route>
          <Route path="/concept2cure/ind-autodraft">
            {() => (
              <PageTransition>
                <ProtectedRoute>
                  <ZenApp />
                </ProtectedRoute>
              </PageTransition>
            )}
          </Route>
          <Route path="/concept2cure/clinical-operations">
            {() => (
              <PageTransition>
                <ProtectedRoute>
                  <ZenApp />
                </ProtectedRoute>
              </PageTransition>
            )}
          </Route>

          {/* Catch-all for /concept2cure/* routes */}
          <Route path="/concept2cure/*">
            {() => (
              <PageTransition>
                <ProtectedRoute>
                  <ZenApp />
                </ProtectedRoute>
              </PageTransition>
            )}
          </Route>
          {/* Phase 3: Readiness Intelligence Dashboard */}
          <Route path="/concept2cure/readiness">
            {() => (
              <PageTransition>
                <ProtectedRoute>
                  <ZenApp />
                </ProtectedRoute>
              </PageTransition>
            )}
          </Route>
        </Switch>
      </AnimatePresence>
    </PortalAuthProvider>
  );
};

export default ZenRouter;
