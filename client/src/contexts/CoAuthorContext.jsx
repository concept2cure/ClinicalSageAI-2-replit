/**
 * CoAuthor Context Provider — Shared State for Decomposed CoAuthor Modules
 *
 * Holds all state that multiple CoAuthor sub-modules need access to:
 * - Selected document, version, section
 * - Authenticated user context
 * - Submission metadata
 * - AI context (pre-built for every AI call)
 * - Document lifecycle and versioning
 * - Toast/notification system
 *
 * This is the single source of truth that binds the decomposed modules together.
 *
 * @version 2.0.0
 */

import React, { createContext, useContext, useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { emitAuditEvent, AuditAction } from '@/services/auditEventEmitter';

// ─── Context Shape ──────────────────────────────────────────────────────────

const CoAuthorContext = createContext(null);

// ─── Provider ───────────────────────────────────────────────────────────────

export function CoAuthorProvider({ children, sharedData = {} }) {
  const { session } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const authenticatedUser = session?.user;

  // ── Core Document State ─────────────────────────────────────────────────
  const [selectedDocument, setSelectedDocumentRaw] = useState(null);
  const [openDocuments, setOpenDocuments] = useState([]);
  const [activeTab, setActiveTab] = useState('editor');
  const [activeTabIndex, setActiveTabIndex] = useState(0);

  // ── Submission Context ──────────────────────────────────────────────────
  const [submissionType, setSubmissionType] = useState(sharedData.submissionType || 'IND');
  const [currentModule, setCurrentModule] = useState(sharedData.module || '');
  const [currentSection, setCurrentSection] = useState(sharedData.section || '');
  const [projectId, setProjectId] = useState(sharedData.projectId || null);

  // ── Source Set for AI Context ───────────────────────────────────────────
  const [sourceSet, setSourceSet] = useState([]);

  // ── Layout State ────────────────────────────────────────────────────────
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [rightPanelTab, setRightPanelTab] = useState('ai');

  // ── Document Lifecycle ──────────────────────────────────────────────────
  const [documentLifecycle, setDocumentLifecycle] = useState({
    status: 'Draft',
    version: '0.1',
    lastModified: null,
    lastExportedEctd: null,
    ectdExports: [],
    history: [],
  });

  // ── Version Management ──────────────────────────────────────────────────
  const [activeVersion, setActiveVersion] = useState('v1.0');
  const [compareVersions, setCompareVersions] = useState({ base: 'v1.0', compare: 'v0.9' });
  const [showVersionHistory, setShowVersionHistory] = useState(false);

  // ── Auto-save ───────────────────────────────────────────────────────────
  const [autoSaveStatus, setAutoSaveStatus] = useState('saved'); // 'saved' | 'saving' | 'unsaved' | 'error'
  const autoSaveTimerRef = useRef(null);

  // ── User Context (derived from auth) ────────────────────────────────────
  const userContext = useMemo(() => ({
    id: authenticatedUser?.id ? String(authenticatedUser.id) : 'anonymous',
    name: authenticatedUser?.display_name || authenticatedUser?.username || 'Unknown User',
    email: authenticatedUser?.email || '',
    role: authenticatedUser?.role || 'author',
  }), [authenticatedUser]);

  // ── AI Context (auto-built from current state) ─────────────────────────
  const aiContext = useMemo(() => ({
    submissionType,
    module: currentModule,
    section: currentSection,
    documentId: selectedDocument?.id ? String(selectedDocument.id) : '',
    versionId: documentLifecycle.version || '0.1',
    userId: userContext.id,
    userRole: userContext.role,
    userName: userContext.name,
    sourceSet,
    projectId,
  }), [submissionType, currentModule, currentSection, selectedDocument, documentLifecycle.version, userContext, sourceSet, projectId]);

  // ── Organization ID ─────────────────────────────────────────────────────
  const organizationId = useMemo(() => {
    return localStorage.getItem('selectedOrganizationId') || '7';
  }, []);

  // ── Document Selection Handler ──────────────────────────────────────────
  const selectDocument = useCallback((doc) => {
    setSelectedDocumentRaw(doc);
    if (doc) {
      // Auto-populate module/section from document metadata
      if (doc.module) setCurrentModule(doc.module);
      if (doc.section) setCurrentSection(doc.section);

      emitAuditEvent(AuditAction.DOCUMENT_OPENED, {
        documentId: doc.id ? String(doc.id) : '',
        section: doc.section || doc.module || '',
        reason: `Opened document "${doc.title || 'Untitled'}"`,
      }, userContext);

      // Add to open documents if not already there
      setOpenDocuments(prev => {
        const exists = prev.find(d => d.id === doc.id);
        if (exists) return prev;
        return [...prev, doc];
      });
    }
  }, [userContext]);

  const closeDocument = useCallback((docId) => {
    setOpenDocuments(prev => {
      const filtered = prev.filter(d => d.id !== docId);
      // Adjust active tab index if needed
      if (activeTabIndex >= filtered.length && filtered.length > 0) {
        setActiveTabIndex(filtered.length - 1);
      }
      return filtered;
    });
    if (selectedDocument?.id === docId) {
      setSelectedDocumentRaw(null);
    }
  }, [selectedDocument, activeTabIndex]);

  // ── Document Save ───────────────────────────────────────────────────────
  const saveDocumentMutation = useMutation({
    mutationFn: async ({ document, content }) => {
      const saveData = {
        id: document?.id,
        title: document?.title || 'Untitled Document',
        content: content,
        module: document?.module || currentModule || 'Module 2',
        status: document?.status || documentLifecycle.status?.toLowerCase() || 'draft',
        version: document?.version || 1,
        metadata: {
          editorType: 'tiptap',
          lastSavedAt: new Date().toISOString(),
          section: currentSection,
          submissionType,
          savedBy: userContext.name,
          userId: userContext.id,
        },
      };

      return apiRequest('/api/coauthor/documents', {
        method: 'POST',
        body: saveData,
        headers: {
          'X-Organization-Id': organizationId,
        },
      });
    },
    onSuccess: (data) => {
      setAutoSaveStatus('saved');
      emitAuditEvent(AuditAction.DOCUMENT_SAVED, {
        documentId: selectedDocument?.id ? String(selectedDocument.id) : '',
        versionId: documentLifecycle.version,
        section: currentSection,
        reason: `Document saved by ${userContext.name}`,
      }, userContext);
      queryClient.invalidateQueries({ queryKey: ['/api/coauthor/documents'] });
    },
    onError: (error) => {
      setAutoSaveStatus('error');
      toast({
        title: 'Save Failed',
        description: error.message || 'Failed to save document. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const saveDocument = useCallback((content) => {
    if (!selectedDocument) return;
    setAutoSaveStatus('saving');
    saveDocumentMutation.mutate({ document: selectedDocument, content });
  }, [selectedDocument, saveDocumentMutation]);

  // ── Save Version ────────────────────────────────────────────────────────
  const saveVersionMutation = useMutation({
    mutationFn: async ({ versionLabel, changeDescription }) => {
      if (!selectedDocument?.id) throw new Error('No document selected');
      return apiRequest(`/api/coauthor/documents/${selectedDocument.id}/versions`, {
        method: 'POST',
        body: { versionLabel, changeDescription },
      });
    },
    onSuccess: (data) => {
      emitAuditEvent(AuditAction.VERSION_CREATED, {
        documentId: selectedDocument?.id ? String(selectedDocument.id) : '',
        versionId: data?.version?.id || documentLifecycle.version,
        reason: `New version created by ${userContext.name}`,
      }, userContext);
      toast({
        title: 'Version Saved',
        description: data?.message || 'Document version saved successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/coauthor/documents'] });
    },
    onError: (error) => {
      toast({
        title: 'Version Save Failed',
        description: error.message || 'Failed to save document version',
        variant: 'destructive',
      });
    },
  });

  const saveVersion = useCallback((versionLabel, changeDescription) => {
    saveVersionMutation.mutate({ versionLabel, changeDescription });
  }, [saveVersionMutation]);

  // ── Lifecycle Updater ───────────────────────────────────────────────────
  const updateLifecycleStatus = useCallback((newStatus, reason = '') => {
    const oldStatus = documentLifecycle.status;

    emitAuditEvent(AuditAction.STATUS_CHANGED, {
      documentId: selectedDocument?.id ? String(selectedDocument.id) : '',
      versionId: documentLifecycle.version,
      reason: reason || `Status changed from ${oldStatus} to ${newStatus}`,
      details: { oldStatus, newStatus },
    }, userContext);

    setDocumentLifecycle(prev => ({
      ...prev,
      status: newStatus,
      lastModified: new Date().toISOString(),
      history: [
        ...prev.history,
        {
          id: `lc-${Date.now()}`,
          event: 'Status Changed',
          timestamp: new Date().toISOString(),
          user: userContext.name,
          userId: userContext.id,
          details: `Status changed from ${oldStatus} to ${newStatus}${reason ? ': ' + reason : ''}`,
          version: prev.version,
        },
      ],
    }));

    toast({
      title: 'Status Updated',
      description: `Document status changed to ${newStatus}`,
    });
  }, [documentLifecycle, selectedDocument, userContext, toast]);

  // ── Mark content as unsaved when document is modified ───────────────────
  const markUnsaved = useCallback(() => {
    setAutoSaveStatus('unsaved');
    // Clear existing auto-save timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
  }, []);

  // ── Cleanup auto-save timer on unmount ──────────────────────────────────
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  // ── Context Value ───────────────────────────────────────────────────────
  const value = useMemo(() => ({
    // Auth
    authenticatedUser,
    userContext,

    // Document
    selectedDocument,
    selectDocument,
    setSelectedDocument: setSelectedDocumentRaw,
    openDocuments,
    setOpenDocuments,
    closeDocument,
    activeTab,
    setActiveTab,
    activeTabIndex,
    setActiveTabIndex,

    // Submission
    submissionType,
    setSubmissionType,
    currentModule,
    setCurrentModule,
    currentSection,
    setCurrentSection,
    projectId,
    setProjectId,
    organizationId,

    // Source set for AI
    sourceSet,
    setSourceSet,

    // Layout
    leftPanelOpen,
    setLeftPanelOpen,
    rightPanelOpen,
    setRightPanelOpen,
    rightPanelTab,
    setRightPanelTab,

    // Lifecycle
    documentLifecycle,
    setDocumentLifecycle,
    updateLifecycleStatus,

    // Versioning
    activeVersion,
    setActiveVersion,
    compareVersions,
    setCompareVersions,
    showVersionHistory,
    setShowVersionHistory,

    // Save operations
    saveDocument,
    saveVersion,
    isSaving: saveDocumentMutation.isPending,
    autoSaveStatus,
    setAutoSaveStatus,
    markUnsaved,

    // AI
    aiContext,

    // Services
    toast,
    queryClient,
  }), [
    authenticatedUser, userContext,
    selectedDocument, selectDocument, openDocuments, closeDocument, activeTab, activeTabIndex,
    submissionType, currentModule, currentSection, projectId, organizationId,
    sourceSet,
    leftPanelOpen, rightPanelOpen, rightPanelTab,
    documentLifecycle, updateLifecycleStatus,
    activeVersion, compareVersions, showVersionHistory,
    saveDocument, saveVersion, saveDocumentMutation.isPending, autoSaveStatus, markUnsaved,
    aiContext, toast, queryClient,
  ]);

  return (
    <CoAuthorContext.Provider value={value}>
      {children}
    </CoAuthorContext.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useCoAuthor() {
  const context = useContext(CoAuthorContext);
  if (!context) {
    throw new Error('useCoAuthor must be used within a CoAuthorProvider');
  }
  return context;
}

export default CoAuthorContext;
