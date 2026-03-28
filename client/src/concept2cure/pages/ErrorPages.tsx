/**
 * @fileoverview Branded Error Pages
 * 404, 500, maintenance, and session expired pages with company branding.
 */

import React from 'react';
import logoSrc from '@/assets/concept2cure-logo.jpg';

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED LAYOUT
// ═══════════════════════════════════════════════════════════════════════════════

const ErrorLayout: React.FC<{
  code?: string;
  title: string;
  description: string;
  action?: { label: string; href: string };
  children?: React.ReactNode;
}> = ({ code, title, description, action, children }) => (
  <div
    className="min-h-screen flex flex-col items-center justify-center px-6"
    style={{ background: '#faf9f5', fontFamily: "'Lora', Georgia, serif" }}
  >
    {/* Logo with gradient blend */}
    <div className="relative w-20 h-20 rounded-2xl overflow-hidden shadow-md mb-8">
      <img src={logoSrc} alt="Concept2Cure" className="w-full h-full object-cover object-center" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(circle at center, transparent 40%, #faf9f5 100%)' }}
      />
    </div>

    {/* Error code */}
    {code && (
      <p
        className="text-7xl font-bold mb-4"
        style={{
          fontFamily: "'Poppins', Arial, sans-serif",
          background: 'linear-gradient(135deg, #d97757, #c15f3c)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        {code}
      </p>
    )}

    {/* Title */}
    <h1
      className="text-2xl font-semibold text-stone-900 mb-3 text-center"
      style={{ fontFamily: "'Poppins', Arial, sans-serif" }}
    >
      {title}
    </h1>

    {/* Description */}
    <p className="text-sm text-stone-500 max-w-md text-center mb-8 leading-relaxed">
      {description}
    </p>

    {/* Custom content */}
    {children}

    {/* Action button */}
    {action && (
      <a
        href={action.href}
        className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-white rounded-xl transition-all hover:shadow-lg"
        style={{
          background: 'linear-gradient(135deg, #d97757, #c15f3c)',
          fontFamily: "'Poppins', Arial, sans-serif",
        }}
      >
        {action.label}
      </a>
    )}

    {/* Footer */}
    <div className="mt-16 text-center">
      <p className="text-xs text-stone-400" style={{ fontFamily: "'Poppins', Arial, sans-serif" }}>
        © {new Date().getFullYear()} Concept2Cure, Inc. — AI-Powered Regulatory Intelligence
      </p>
      <div className="flex gap-4 justify-center mt-2">
        <a href="/concept2cure/legal/terms" className="text-[11px] text-stone-400 hover:text-stone-600 transition-colors">Terms</a>
        <a href="/concept2cure/legal/privacy" className="text-[11px] text-stone-400 hover:text-stone-600 transition-colors">Privacy</a>
        <a href="mailto:support@concept2cure.com" className="text-[11px] text-stone-400 hover:text-stone-600 transition-colors">Support</a>
      </div>
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// 404 NOT FOUND
// ═══════════════════════════════════════════════════════════════════════════════

export const NotFoundPage: React.FC = () => (
  <ErrorLayout
    code="404"
    title="Page Not Found"
    description="The page you're looking for doesn't exist or has been moved. If you believe this is an error, please contact support."
    action={{ label: 'Return to Platform', href: '/concept2cure' }}
  />
);

// ═══════════════════════════════════════════════════════════════════════════════
// 500 SERVER ERROR
// ═══════════════════════════════════════════════════════════════════════════════

export const ServerErrorPage: React.FC = () => (
  <ErrorLayout
    code="500"
    title="Something Went Wrong"
    description="We encountered an unexpected error processing your request. Our team has been notified and is investigating. Your data is safe — all actions are logged per FDA 21 CFR Part 11."
    action={{ label: 'Try Again', href: '/concept2cure' }}
  />
);

// ═══════════════════════════════════════════════════════════════════════════════
// MAINTENANCE
// ═══════════════════════════════════════════════════════════════════════════════

export const MaintenancePage: React.FC = () => (
  <ErrorLayout
    title="Scheduled Maintenance"
    description="We're performing scheduled maintenance to improve platform reliability and security. This is typically completed within our maintenance window (Sundays 02:00–06:00 UTC). Thank you for your patience."
  >
    <div
      className="mb-8 px-6 py-4 rounded-xl border max-w-md text-center"
      style={{ background: 'white', borderColor: '#e8e6dc' }}
    >
      <p className="text-xs font-medium text-stone-700" style={{ fontFamily: "'Poppins', Arial, sans-serif" }}>
        Expected completion
      </p>
      <p className="text-lg font-semibold text-stone-900 mt-1" style={{ fontFamily: "'Poppins', Arial, sans-serif" }}>
        Within 4 hours
      </p>
      <p className="text-xs text-stone-500 mt-2">
        For urgent matters, contact support@concept2cure.com
      </p>
    </div>
  </ErrorLayout>
);

// ═══════════════════════════════════════════════════════════════════════════════
// SESSION EXPIRED
// ═══════════════════════════════════════════════════════════════════════════════

export const SessionExpiredPage: React.FC = () => (
  <ErrorLayout
    title="Session Expired"
    description="Your session has expired for security reasons per FDA 21 CFR Part 11 requirements. Please sign in again to continue. Your work has been automatically saved."
    action={{ label: 'Sign In Again', href: '/concept2cure/login' }}
  />
);

// ═══════════════════════════════════════════════════════════════════════════════
// OFFLINE
// ═══════════════════════════════════════════════════════════════════════════════

export const OfflinePage: React.FC = () => (
  <ErrorLayout
    title="You're Offline"
    description="It looks like you've lost your internet connection. The Concept2Cure platform requires an active connection to ensure data integrity and audit compliance. Please check your connection and try again."
    action={{ label: 'Retry Connection', href: window.location.href }}
  />
);

// ═══════════════════════════════════════════════════════════════════════════════
// ACCESS DENIED
// ═══════════════════════════════════════════════════════════════════════════════

export const AccessDeniedPage: React.FC = () => (
  <ErrorLayout
    code="403"
    title="Access Denied"
    description="You don't have permission to access this resource. If you believe this is an error, contact your organization administrator or Concept2Cure support."
    action={{ label: 'Return to Platform', href: '/concept2cure' }}
  />
);

export default NotFoundPage;
