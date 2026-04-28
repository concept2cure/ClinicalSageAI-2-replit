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

import React, { useEffect } from 'react';
import { Switch, Route, useLocation, Redirect } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { ZenLogin, ZenSignup, ZenAuthLayout } from '../auth';
import { ZenApp } from '../ZenApp';
import { ProjectProvider } from '../context/ProjectContext';
import {
  AuthProvider as PortalAuthProvider,
  useAuth as usePortalAuth,
} from '@/portal-v2/services/authService';

// Module-deep-link route policy is shared by ZenApp; the bridge components
// that previously lived here (Project510kBridge, ProjectPMABridge,
// ProofCertificatePage, BillingDashboard, InteractiveDemoPage, legal pages,
// SalesLandingPage) have been removed — none of those surfaces are in the
// design-system bundle. Their routes were stripped above.

const ProtectedZenApp: React.FC = () => (
  <ProtectedRoute>
    <ProjectProvider>
      <ZenApp />
    </ProjectProvider>
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

  return (
    <PortalAuthProvider>
      <AnimatePresence mode="wait">
        <Switch location={location} key={location}>
          {/* TO BE REMOVED — auth (phase 5) is "in design" per
              design-system/HANDOFF.md, but the app cannot function
              without login. Delete the next four routes once Anthropic
              Design ships ui_kits/auth/. */}
          <Route path="/concept2cure/login">
            {() => (
              <PageTransition>
                <AuthRoute>
                  <ZenLogin />
                </AuthRoute>
              </PageTransition>
            )}
          </Route>
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
                  <ZenLogin />
                </AuthRoute>
              </PageTransition>
            )}
          </Route>

          {/* Legacy aliases — collapse to bundle entry. */}
          <Route path="/concept2cure/onboarding">{() => <Redirect to="/concept2cure" />}</Route>
          <Route path="/billing">{() => <Redirect to="/concept2cure" />}</Route>
          <Route path="/billing/success">{() => <Redirect to="/concept2cure" />}</Route>
          <Route path="/billing/canceled">{() => <Redirect to="/concept2cure" />}</Route>

          {/* Bundle surfaces — ZenApp resolves layoutMode + URL into one of
              the four designed surfaces (home, mdx, ana_ri, ectd_coauthor). */}
          <Route path="/">
            {() => (
              <PageTransition>
                <ProtectedZenApp />
              </PageTransition>
            )}
          </Route>
          <Route path="/concept2cure/project/:projectId/:rest*">
            {() => (
              <PageTransition>
                <ProtectedZenApp />
              </PageTransition>
            )}
          </Route>
          <Route path="/concept2cure/project/:projectId">
            {() => (
              <PageTransition>
                <ProtectedZenApp />
              </PageTransition>
            )}
          </Route>
          <Route path="/concept2cure">
            {() => (
              <PageTransition>
                <ProtectedZenApp />
              </PageTransition>
            )}
          </Route>
          <Route path="/concept2cure/*">
            {() => (
              <PageTransition>
                <ProtectedZenApp />
              </PageTransition>
            )}
          </Route>

          {/* Catch-all — anything we didn't recognize lands on the bundle home. */}
          <Route>{() => <Redirect to="/concept2cure" />}</Route>
        </Switch>
      </AnimatePresence>
    </PortalAuthProvider>
  );
};

export default ZenRouter;
