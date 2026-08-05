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
import { Switch, Route, useLocation, Redirect } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { ZenSignup, ZenAuthLayout } from '../auth';
import { Concept2CureLogin } from '../components/concept2cure-auth';
import { isFeatureEnabled } from '@/flags/featureFlags';
// Master Administration + Business Center UI is owned by Claude Design (built
// from HANDOFF_TO_DESIGN_master_admin_business_center.md). Only the backend +
// API ship here; route registrations are added back when the designed UI lands.
import {
  AuthProvider as PortalAuthProvider,
  useAuth as usePortalAuth,
} from '@/services/portal/authService';

// Module-deep-link route policy is shared by ZenApp; the bridge components
// that previously lived here (Project510kBridge, ProjectPMABridge,
// ProofCertificatePage, BillingDashboard, InteractiveDemoPage, legal pages,
// SalesLandingPage) have been removed — none of those surfaces are in the
// design-system bundle. Their routes were stripped above.

// ui-v2 — the full UI replacement shell (design_handoff_c2c_v2_ui_replacement).
// Phase 7: the legacy ZenApp shell is deleted; the v2 shell IS the product.
// Lazy so auth entry pages never download the app chunk (or its stylesheet).
const V2App = lazy(() => import('../v2/V2App'));

/* `<ProjectProvider>` used to wrap this. It was an 863-line reducer holding
   activeProjectId / activeConversationId / activeArtifactId and persisting to
   localStorage['concept2cure_state'] — and `useProject`, its only way out, had
   ZERO consumers: two mentions in the whole repository, both inside its own
   file. So `activeProjectId` was null for every session no matter what the
   user opened, and the provider's one remaining effect was a mount-time write
   of {"projects":[],"conversations":[],"artifacts":[]} that nothing read.

   `window.C2C_PROJECT` is the live selection — it carries the real
   `regulatory_programs` UUID and is read by 14+ non-test files. Wiring this up
   instead of deleting it would have meant migrating all of them off a working,
   DB-backed channel onto a browser-minted UUID space (ProjectContext.tsx:337
   minted its own). */
const ProtectedZenApp: React.FC = () => (
  <ProtectedRoute>
    <Suspense fallback={<ZenLoadingScreen />}>
      <V2App />
    </Suspense>
  </ProtectedRoute>
);

// ═══════════════════════════════════════════════════════════════════════════════
// LOADING SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
const ZenLoadingScreen: React.FC<{ message?: string }> = () => (
  <div className="min-h-screen bg-transparent" aria-hidden="true" />
);

// ═══════════════════════════════════════════════════════════════════════════════
// PROTECTED ROUTE WRAPPER
// ═══════════════════════════════════════════════════════════════════════════════

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading, isBootstrapping } = usePortalAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!isBootstrapping && !isAuthenticated) {
      // Redirect to login with return URL
      const returnTo = encodeURIComponent(location);
      setLocation(`/concept2cure/login?returnTo=${returnTo}`);
    }
  }, [isAuthenticated, isBootstrapping, location, setLocation]);

  if (isBootstrapping || isLoading) {
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
  const { isAuthenticated, isBootstrapping } = usePortalAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isBootstrapping && isAuthenticated) {
      // Already logged in, redirect to main app
      setLocation('/concept2cure');
    }
  }, [isAuthenticated, isBootstrapping, setLocation]);

  if (isBootstrapping) {
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
// MAIN ROUTER
// ═══════════════════════════════════════════════════════════════════════════════

export const ZenRouter: React.FC = () => {
  const [location] = useLocation();

  // ui-v2 owns its routing internally (wouter location -> surface id), so the
  // shell must persist across in-app navigations. Rendering it inside the
  // location-keyed <Switch>/<AnimatePresence> below would remount the whole
  // shell on every nav (dropping palette/AnA/scroll state and replaying the
  // enter animation). Auth entry routes keep the legacy transition switch, as
  // do the two retired kit paths — they must fall through to the Switch for
  // their redirects to fire, after which the shell owns the location again.
  const uiV2AuthRoute =
    /^\/(concept2cure\/)?(login|signup|password-reset)(\/|\?|$)/.test(location);
  // `/concept2cure/mdx` and `/concept2cure/pdev` used to be excluded here so
  // they could fall through to the Switch and mount a second application. Both
  // are ordinary shell surfaces now, so the shell owns them like every other
  // path — `pdev` resolves directly, `mdx` through DEEP_LINK_ALIASES.
  const uiV2Owns =
    !uiV2AuthRoute && (location === '/' || location.startsWith('/concept2cure'));
  if (uiV2Owns) {
    return (
      <PortalAuthProvider>
        <ProtectedZenApp />
      </PortalAuthProvider>
    );
  }

  return (
    <PortalAuthProvider>
      <AnimatePresence mode="wait">
        <Switch location={location} key={location}>
          {/* Auth — ZenLogin / ZenSignup / password-reset. Kept as a
              permanent shipping surface alongside the four design-system
              ui_kits (home, mdx, ana_ri, ectd_coauthor). */}
          <Route path="/concept2cure/login">
            {() => (
              <PageTransition>
                <AuthRoute>
                  <Concept2CureLogin />
                </AuthRoute>
              </PageTransition>
            )}
          </Route>
          {/* Signup keeps the legacy ZenSignup until Claude Design ships a
              signup kit. Concept2CureLogin only covers sign-in / MFA /
              forgot-password / reset-password. */}
          <Route path="/concept2cure/signup">
            {() => (
              <PageTransition>
                <AuthRoute>
                  <ZenSignup />
                </AuthRoute>
              </PageTransition>
            )}
          </Route>
          <Route path="/login">{() => <Redirect to="/concept2cure/login" />}</Route>
          <Route path="/signup">{() => <Redirect to="/concept2cure/signup" />}</Route>
          <Route path="/concept2cure/password-reset">
            {() => (
              <PageTransition>
                <AuthRoute>
                  <Concept2CureLogin />
                </AuthRoute>
              </PageTransition>
            )}
          </Route>

          {/* Legacy aliases — collapse to bundle entry. */}
          <Route path="/concept2cure/onboarding">{() => <Redirect to="/concept2cure" />}</Route>
          <Route path="/billing">{() => <Redirect to="/concept2cure" />}</Route>
          <Route path="/billing/success">{() => <Redirect to="/concept2cure" />}</Route>
          <Route path="/billing/canceled">{() => <Redirect to="/concept2cure" />}</Route>

          {/* App routes — /, /concept2cure and every surface/project deep link —
              are owned by the ui-v2 fast path above this Switch (the shell must
              persist across navs, so it renders outside the location-keyed
              transition). Only auth entry, the standalone MDX module, and
              legacy redirects reach this Switch. */}

          {/* Catch-all — anything we didn't recognize lands on the shell home. */}
          <Route>{() => <Redirect to="/concept2cure" />}</Route>
        </Switch>
      </AnimatePresence>
    </PortalAuthProvider>
  );
};

export default ZenRouter;
