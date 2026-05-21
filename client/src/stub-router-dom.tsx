// Stub implementation forwarding to wouter
// Instead of using this file, please import from "wouter" directly

import React from 'react';
import {
  Link as WouterLink,
  Route as WouterRoute,
  Switch as WouterSwitch,
  useLocation as wouterUseLocation,
  useRoute,
} from 'wouter';

// Forward to wouter
export const Link = WouterLink;
export const Route = WouterRoute;
export const Switch = WouterSwitch;
export const useLocation = wouterUseLocation;

// For compatibility with any code still using react-router-dom
export const BrowserRouter = ({ children }: { children: React.ReactNode }) => <>{children}</>;
export const Routes = ({ children }: { children: React.ReactNode }) => <WouterSwitch>{children}</WouterSwitch>;
export const Outlet = () => <div>Please update to use wouter components</div>;
export const Navigate = ({ to }: { to: string }) => {
  window.location.href = to;
  return null;
};

// Compatibility hooks
export const useNavigate = () => (path: string) => {
  console.warn(`[compatibility] useNavigate() called - please update to use wouter hooks`);
  window.location.href = path;
};

export const useParams = () => {
  console.warn(`[compatibility] useParams() called - please update to use useRoute from wouter`);
  const [, params] = useRoute('*');
  return params || {};
};
