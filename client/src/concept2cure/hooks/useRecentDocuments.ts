/**
 * useRecentDocuments — Track and retrieve recently viewed/edited documents.
 *
 * Stores recent document access in localStorage for quick access via
 * command palette, dashboard, and sidebar. Max 20 entries, LRU eviction.
 */

const STORAGE_KEY = 'trialsage_recent_documents';
const MAX_ENTRIES = 20;

export interface RecentDocument {
  id: string;
  title: string;
  projectId: string;
  projectName?: string;
  ctdSection?: string;
  status?: string;
  lastAccessedAt: string;
}

function loadRecents(): RecentDocument[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentDocument[];
  } catch {
    return [];
  }
}

function saveRecents(docs: RecentDocument[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
  } catch {
    // Storage full or unavailable — ignore
  }
}

/**
 * Record a document access. Moves existing entries to the top.
 */
export function recordDocumentAccess(doc: {
  id: string;
  title: string;
  projectId: string;
  projectName?: string;
  ctdSection?: string;
  status?: string;
}): void {
  const recents = loadRecents();
  const entry: RecentDocument = {
    ...doc,
    lastAccessedAt: new Date().toISOString(),
  };

  // Remove existing entry for same document
  const filtered = recents.filter(r => r.id !== doc.id);
  // Add to front
  filtered.unshift(entry);
  // Trim to max
  saveRecents(filtered.slice(0, MAX_ENTRIES));
}

/**
 * Get recently accessed documents, most recent first.
 */
export function getRecentDocuments(limit = 10): RecentDocument[] {
  return loadRecents().slice(0, limit);
}

/**
 * Clear all recent document history.
 */
export function clearRecentDocuments(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * React hook for recent documents with automatic re-render on changes.
 */
import { useState, useEffect, useCallback } from 'react';

export function useRecentDocuments(limit = 10) {
  const [recents, setRecents] = useState<RecentDocument[]>(() => getRecentDocuments(limit));

  // Refresh periodically (other tabs may update storage)
  useEffect(() => {
    const interval = setInterval(() => {
      setRecents(getRecentDocuments(limit));
    }, 5000);
    return () => clearInterval(interval);
  }, [limit]);

  const record = useCallback((doc: {
    id: string;
    title: string;
    projectId: string;
    projectName?: string;
    ctdSection?: string;
    status?: string;
  }) => {
    recordDocumentAccess(doc);
    setRecents(getRecentDocuments(limit));
  }, [limit]);

  const clear = useCallback(() => {
    clearRecentDocuments();
    setRecents([]);
  }, []);

  return { recents, record, clear };
}
