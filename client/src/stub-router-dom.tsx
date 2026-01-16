// Stub implementation forwarding to wouter
// Instead of using this file, please import from "wouter" directly

import React from 'react';
import {
  Link as WouterLink,
  Route as WouterRoute,
  Switch,
  useLocation as wouterUseLocation,
  useRoute,
} from 'wouter';

// Forward to wouter
export const Link = WouterLink;
export const Route = WouterRoute;
export const Switch = Switch;
export const useLocation = wouterUseLocation;

// For compatibility with any code still using react-router-dom
export const BrowserRouter = ({ children }: { children: React.ReactNode }) => <>{children}</>;
export const Routes = ({ children }: { children: React.ReactNode }) => <Switch>{children}</Switch>;
export const Outlet = () => <div>Please update to use wouter components</div>;
export const Navigate = ({ to }: { to: string }) => {
  window.location.href = to;
  return null;
};

// Compatibility hooks
export const useNavigate = () => {
  return (path: string, options?: { state?: any }) => {
    console.warn(`[compatibility] useNavigate() called - please update to use wouter hooks`);
    if (options?.state) {
      window.history.pushState(options.state, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
      return;
    }
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };
};

export const useParams = () => {
  console.warn(`[compatibility] useParams() called - please update to use useRoute from wouter`);
  const [, params] = useRoute('*');
  return params || {};
};
