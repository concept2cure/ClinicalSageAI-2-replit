import React from 'react';

/**
 * Layout Component
 * 
 * A wrapper component that provides consistent page structure.
 * Supports hiding navigation for auth pages.
 */
const Layout = ({ children, hideNavigation = false }) => {
  return (
    <div className="min-h-screen bg-zinc-50">
      {!hideNavigation && (
        <nav className="bg-white/80 backdrop-blur border-b border-zinc-200">
          {/* Navigation would go here if not hidden */}
        </nav>
      )}
      <main className={hideNavigation ? '' : 'pt-14'}>
        {children}
      </main>
    </div>
  );
};

export default Layout;
