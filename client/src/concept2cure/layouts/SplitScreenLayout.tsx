/**
 * Concept2Cure - Split Screen Layout
 * 
 * Claude.ai-style split view with:
 * - Left panel: Chat with Lumen (always visible)
 * - Right panel: Artifact viewer (appears when artifact is active)
 * - Resizable divider
 * 
 * Mobile: Artifact panel becomes a full-screen overlay
 * Desktop: Side-by-side resizable panels
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useProject } from '../context/ProjectContext';
import { ChatPanel } from '../components/chat/ChatPanel';
import { ArtifactPanel } from '../components/artifacts/ArtifactPanel';
import { cn } from '@/lib/utils';
import { GripVertical, X, ChevronLeft } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// SPLIT SCREEN LAYOUT
// ─────────────────────────────────────────────────────────────────────────────

export const SplitScreenLayout: React.FC = () => {
  const { state, activeArtifact, setArtifactPanelWidth } = useProject();
  const { artifactPanelVisible, artifactPanelWidth } = state.ui;

  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle resize drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;

      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      const newWidth = ((containerRect.right - e.clientX) / containerRect.width) * 100;

      // Clamp between 20% and 80%
      const clampedWidth = Math.max(20, Math.min(80, newWidth));
      setArtifactPanelWidth(clampedWidth);
    },
    [isDragging, setArtifactPanelWidth]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Calculate panel widths
  const chatWidth = artifactPanelVisible ? 100 - artifactPanelWidth : 100;
  const artifactWidth = artifactPanelVisible ? artifactPanelWidth : 0;

  // Check if we're on mobile (can also use useMediaQuery hook)
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Mobile: Full-screen artifact overlay
  if (isMobile) {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden bg-white">
        {/* Chat Panel - Full width on mobile */}
        <div className={cn(
          'flex-1 flex flex-col h-full overflow-hidden',
          artifactPanelVisible && 'hidden'
        )}>
          <ChatPanel />
        </div>

        {/* Artifact Panel - Full screen overlay on mobile */}
        {artifactPanelVisible && (
          <div className="fixed inset-0 z-30 flex flex-col bg-white animate-in slide-in-from-right duration-200">
            {/* Mobile artifact header */}
            <div className="flex h-12 items-center justify-between border-b border-gray-200 px-4">
              <button
                onClick={() => setArtifactPanelWidth(0)} // This will hide the panel
                className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
              >
                <ChevronLeft className="h-4 w-4" />
                Back to chat
              </button>
            </div>
            {/* Artifact content */}
            <div className="flex-1 overflow-hidden">
              <ArtifactPanel artifact={activeArtifact} />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Desktop: Side-by-side panels
  return (
    <div ref={containerRef} className="flex h-full w-full overflow-hidden bg-white">
      {/* Chat Panel (Left) */}
      <div
        className="flex flex-col h-full overflow-hidden transition-all duration-200"
        style={{ width: `${chatWidth}%` }}
      >
        <ChatPanel />
      </div>

      {/* Resize Handle */}
      {artifactPanelVisible && (
        <div
          onMouseDown={handleMouseDown}
          className={cn(
            'relative flex w-1 cursor-col-resize items-center justify-center',
            'bg-gray-200 hover:bg-blue-400 transition-colors',
            isDragging && 'bg-blue-500'
          )}
        >
          <div
            className={cn(
              'absolute z-10 flex h-12 w-5 items-center justify-center rounded',
              'bg-gray-100 border border-gray-300 shadow-sm',
              'hover:bg-gray-200 transition-colors',
              isDragging && 'bg-blue-100 border-blue-400'
            )}
          >
            <GripVertical className="h-4 w-4 text-gray-400" />
          </div>
        </div>
      )}

      {/* Artifact Panel (Right) */}
      {artifactPanelVisible && (
        <div
          className="flex flex-col h-full overflow-hidden border-l border-gray-200 bg-gray-50 transition-all duration-200"
          style={{ width: `${artifactWidth}%` }}
        >
          <ArtifactPanel artifact={activeArtifact} />
        </div>
      )}
    </div>
  );
};

export default SplitScreenLayout;
