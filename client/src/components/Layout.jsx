import React from 'react';

/**
 * Layout Component
 * 
 * A wrapper component that provides consistent page structure.
 * Supports hiding navigation for auth pages.
 */
const Layout = ({ children, hideNavigation = false }) => {
  return (
    <div className="min-h-screen bg-gray-50">
      {!hideNavigation && (
        <nav className="bg-white shadow-sm border-b border-gray-200">
          {/* Navigation would go here if not hidden */}
        </nav>
      )}
      <main className={hideNavigation ? '' : 'pt-16'}>
        {children}
      </main>
    </div>
  );
};

export default Layout;
