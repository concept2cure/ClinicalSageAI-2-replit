/**
 * Concept2Cure - Main Layout
 * 
 * Main application layout combining sidebar and split-screen content.
 * Claude.ai-style: Sidebar + Chat + Artifacts
 * 
 * Mobile: Sidebar becomes a sheet/drawer
 * Desktop: Persistent sidebar
 */

import React, { useState, useEffect } from 'react';
import { ProjectProvider } from '../context/ProjectContext';
import { ProjectsSidebar } from '../components/sidebar';
import { SplitScreenLayout } from './SplitScreenLayout';
import { cn } from '@/lib/utils';
import { Menu, X } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// MOBILE SIDEBAR OVERLAY
// ─────────────────────────────────────────────────────────────────────────────

interface MobileSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

const MobileSidebar: React.FC<MobileSidebarProps> = ({ isOpen, onClose, children }) => {
  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
        onClick={onClose}
      />
      {/* Sidebar */}
      <div className="fixed inset-y-0 left-0 z-50 w-80 md:hidden animate-in slide-in-from-left duration-200">
        {children}
      </div>
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MOBILE HEADER
// ─────────────────────────────────────────────────────────────────────────────

interface MobileHeaderProps {
  onMenuClick: () => void;
}

const MobileHeader: React.FC<MobileHeaderProps> = ({ onMenuClick }) => (
  <div className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4 md:hidden">
    <button
      onClick={onMenuClick}
      className="p-2 -ml-2 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
      aria-label="Open menu"
    >
      <Menu className="h-5 w-5" />
    </button>
    <span className="font-semibold text-gray-900">Concept2Cure</span>
    <div className="w-9" /> {/* Spacer for centering */}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// MAIN LAYOUT
// ─────────────────────────────────────────────────────────────────────────────

interface Concept2CureLayoutProps {
  children?: React.ReactNode;
}

export const Concept2CureLayout: React.FC<Concept2CureLayoutProps> = ({ children }) => {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <ProjectProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-white">
        {/* Desktop Sidebar - hidden on mobile */}
        <div className="hidden md:block">
          <ProjectsSidebar />
        </div>

        {/* Mobile Sidebar (Sheet/Drawer) */}
        <MobileSidebar isOpen={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)}>
          <div className="relative h-full">
            {/* Close button */}
            <button
              onClick={() => setMobileSidebarOpen(false)}
              className="absolute top-3 right-3 z-10 p-2 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            <ProjectsSidebar />
          </div>
        </MobileSidebar>

        {/* Main Content */}
        <main className="flex-1 flex flex-col h-full overflow-hidden">
          {/* Mobile Header */}
          <MobileHeader onMenuClick={() => setMobileSidebarOpen(true)} />
          
          {/* Content Area */}
          <div className="flex-1 overflow-hidden">
            {children || <SplitScreenLayout />}
          </div>
        </main>
      </div>
    </ProjectProvider>
  );
};

export default Concept2CureLayout;
