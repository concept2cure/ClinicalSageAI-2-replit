/**
 * @fileoverview Zen Auth Layout
 * @module concept2cure/auth/ZenAuthLayout
 * @version 1.0.0
 *
 * @description
 * Calm layout wrapper for authentication pages.
 */

import React from 'react';

interface ZenAuthLayoutProps {
  children: React.ReactNode;
}

export const ZenAuthLayout: React.FC<ZenAuthLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-stone-50">
      <div className="relative">{children}</div>
    </div>
  );
};

export default ZenAuthLayout;
