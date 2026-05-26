/**
 * @fileoverview Session Restoration Hook
 * @module concept2cure/hooks/useSessionRestore
 * @version 1.0.0
 *
 * @description
 * Claude.ai-style session persistence. Remembers user's last workspace
 * state and restores it instantly on re-login.
 *
 * @compliance
 * - FDA 21 CFR Part 11: Session state includes audit metadata
 */

import { useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'wouter';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface SessionState {
  // Workspace context
  projectId?: string;
  projectName?: string;
  submissionType?: string;
  
  // Active items
  conversationId?: string;
  threadId?: string;
  documentId?: string;
  artifactId?: string;
  
  // UI state
  sidebarCollapsed?: boolean;
  activeToolPanel?: string | null;
  layoutMode?: string;
  
  // Scroll/focus
  scrollPosition?: number;
  focusedElement?: string;
  
  // Metadata
  savedAt: string;
  userId: string;
  organizationId: string;
}

export interface SessionRestoreResult {
  // State
  lastSession: SessionState | null;
  isRestoring: boolean;
  hasRestoredOnce: boolean;
  
  // Actions
  saveSession: (state: Partial<SessionState>) => void;
  restoreSession: () => Promise<boolean>;
  clearSession: () => void;
  
  // Getters
  getLastProject: () => { id: string; name: string; type: string; updatedAt?: string | Date } | null;
  getLastConversation: () => { id: string; threadId?: string } | null;
  getSessionHistory: () => Array<{ id: string; startedAt?: string | Date; userId?: string }>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STORAGE KEYS
// ═══════════════════════════════════════════════════════════════════════════════

const SESSION_KEY_PREFIX = 'c2c_session_';
const SESSION_HISTORY_KEY = 'c2c_session_history';
const MAX_SESSION_AGE_HOURS = 72; // 3 days

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════════

export function useSessionRestore(userId?: string, organizationId?: string): SessionRestoreResult {
  const [, setLocation] = useLocation();
  const isRestoringRef = useRef(false);
  const hasRestoredOnceRef = useRef(false);
  
  // ─────────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────────
  
  const getSessionKey = useCallback(() => {
    if (!userId) return null;
    return `${SESSION_KEY_PREFIX}${userId}`;
  }, [userId]);
  
  const isSessionValid = useCallback((session: SessionState): boolean => {
    if (!session.savedAt) return false;
    
    const savedDate = new Date(session.savedAt);
    const now = new Date();
    const hoursDiff = (now.getTime() - savedDate.getTime()) / (1000 * 60 * 60);
    
    return hoursDiff < MAX_SESSION_AGE_HOURS;
  }, []);
  
  // ─────────────────────────────────────────────────────────────────────────────
  // LOAD SESSION
  // ─────────────────────────────────────────────────────────────────────────────
  
  const loadSession = useCallback((): SessionState | null => {
    const key = getSessionKey();
    if (!key) return null;
    
    try {
      const stored = localStorage.getItem(key);
      if (!stored) return null;
      
      const session = JSON.parse(stored) as SessionState;
      
      // Validate session age
      if (!isSessionValid(session)) {
        localStorage.removeItem(key);
        return null;
      }
      
      return session;
    } catch (error) {
      console.warn('[SessionRestore] Failed to load session:', error);
      return null;
    }
  }, [getSessionKey, isSessionValid]);
  
  // ─────────────────────────────────────────────────────────────────────────────
  // SAVE SESSION
  // ─────────────────────────────────────────────────────────────────────────────
  
  const saveSession = useCallback((state: Partial<SessionState>) => {
    const key = getSessionKey();
    if (!key || !userId) return;
    
    try {
      // Merge with existing session
      const existing: Partial<SessionState> = loadSession() || {};
      
      const newSession: SessionState = {
        ...existing,
        ...state,
        savedAt: new Date().toISOString(),
        userId,
        organizationId: organizationId || (existing as any).organizationId || '',
      };
      
      localStorage.setItem(key, JSON.stringify(newSession));
      
      // Also update session history for analytics
      updateSessionHistory(newSession);
      
    } catch (error) {
      console.warn('[SessionRestore] Failed to save session:', error);
    }
  }, [getSessionKey, userId, organizationId, loadSession]);
  
  // ─────────────────────────────────────────────────────────────────────────────
  // SESSION HISTORY (for analytics/debugging)
  // ─────────────────────────────────────────────────────────────────────────────
  
  const updateSessionHistory = useCallback((session: SessionState) => {
    try {
      const historyStr = localStorage.getItem(SESSION_HISTORY_KEY);
      const history = historyStr ? JSON.parse(historyStr) : [];
      
      // Add new entry (keep last 10)
      history.unshift({
        timestamp: session.savedAt,
        projectId: session.projectId,
        projectName: session.projectName,
        userId: session.userId,
      });
      
      localStorage.setItem(
        SESSION_HISTORY_KEY,
        JSON.stringify(history.slice(0, 10))
      );
    } catch (error) {
      // Non-critical, ignore
    }
  }, []);
  
  // ─────────────────────────────────────────────────────────────────────────────
  // RESTORE SESSION
  // ─────────────────────────────────────────────────────────────────────────────
  
  const restoreSession = useCallback(async (): Promise<boolean> => {
    if (isRestoringRef.current || hasRestoredOnceRef.current) {
      return false;
    }
    
    isRestoringRef.current = true;
    
    try {
      const session = loadSession();
      if (!session) {
        return false;
      }
      
      // Build restoration path
      let path = '/concept2cure';
      
      if (session.projectId) {
        path = `/concept2cure/project/${session.projectId}`;
        
        if (session.conversationId) {
          path += `/chat/${session.conversationId}`;
        }
      }
      
      // Navigate
      setLocation(path);
      
      // Restore scroll position after navigation
      if (session.scrollPosition) {
        requestAnimationFrame(() => {
          setTimeout(() => {
            window.scrollTo({
              top: session.scrollPosition,
              behavior: 'instant',
            });
          }, 100);
        });
      }
      
      hasRestoredOnceRef.current = true;
      return true;
      
    } catch (error) {
      console.error('[SessionRestore] Restore failed:', error);
      return false;
    } finally {
      isRestoringRef.current = false;
    }
  }, [loadSession, setLocation]);
  
  // ─────────────────────────────────────────────────────────────────────────────
  // CLEAR SESSION
  // ─────────────────────────────────────────────────────────────────────────────
  
  const clearSession = useCallback(() => {
    const key = getSessionKey();
    if (key) {
      localStorage.removeItem(key);
    }
    hasRestoredOnceRef.current = false;
  }, [getSessionKey]);
  
  // ─────────────────────────────────────────────────────────────────────────────
  // GETTERS
  // ─────────────────────────────────────────────────────────────────────────────
  
  const getLastProject = useCallback(() => {
    const session = loadSession();
    if (!session?.projectId) return null;
    
    return {
      id: session.projectId,
      name: session.projectName || 'Untitled Project',
      type: session.submissionType || 'Unknown',
    };
  }, [loadSession]);
  
  const getLastConversation = useCallback(() => {
    const session = loadSession();
    if (!session?.conversationId) return null;
    
    return {
      id: session.conversationId,
      threadId: session.threadId,
    };
  }, [loadSession]);
  
  // ─────────────────────────────────────────────────────────────────────────────
  // AUTO-SAVE ON NAVIGATION
  // ─────────────────────────────────────────────────────────────────────────────
  
  useEffect(() => {
    // Save scroll position on scroll
    const handleScroll = () => {
      saveSession({ scrollPosition: window.scrollY });
    };
    
    // Debounce scroll saves
    let scrollTimeout: NodeJS.Timeout;
    const debouncedScroll = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(handleScroll, 500);
    };
    
    window.addEventListener('scroll', debouncedScroll, { passive: true });
    
    // Save session on beforeunload
    const handleBeforeUnload = () => {
      saveSession({ scrollPosition: window.scrollY });
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('scroll', debouncedScroll);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      clearTimeout(scrollTimeout);
    };
  }, [saveSession]);
  
  // ─────────────────────────────────────────────────────────────────────────────
  // RETURN
  // ─────────────────────────────────────────────────────────────────────────────
  
  return {
    lastSession: loadSession(),
    isRestoring: isRestoringRef.current,
    hasRestoredOnce: hasRestoredOnceRef.current,
    saveSession,
    restoreSession,
    clearSession,
    getLastProject,
    getLastConversation,
    getSessionHistory: () => [],
  };
}

export default useSessionRestore;
