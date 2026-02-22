/**
 * AuditEventEmitter — Structured Event Bus for Regulatory Audit Trail
 *
 * Every "meaningful action" in the CoAuthor system emits through this module.
 * Events are: persisted to the backend, visible in the AuditTrailDashboard,
 * and provide Part 11 compliant "who did what, when, why" records.
 *
 * Backend endpoint: POST /api/audit/events (single event insert)
 *   Expects: { eventType, entityType, entityId, userId, userName, userRole,
 *              reason, metadata, regulatorySignificant, gxpRelevant }
 *
 * Usage:
 *   import { emitAuditEvent, AuditAction } from '@/services/auditEventEmitter';
 *   emitAuditEvent(AuditAction.DOCUMENT_EDITED, { documentId, changes, reason }, userContext);
 *
 * @version 2.0.0
 * @compliance 21 CFR Part 11 §11.10(e) — audit trail
 */

import { useEffect, useRef, useCallback } from 'react';

// ─── Audit Action Catalog ───────────────────────────────────────────────────

export const AuditAction = Object.freeze({
  // Document lifecycle
  DOCUMENT_CREATED:       'document.created',
  DOCUMENT_EDITED:        'document.edited',
  DOCUMENT_SAVED:         'document.saved',
  DOCUMENT_DELETED:       'document.deleted',
  DOCUMENT_EXPORTED:      'document.exported',
  DOCUMENT_IMPORTED:      'document.imported',
  DOCUMENT_OPENED:        'document.opened',

  // Version control
  VERSION_CREATED:        'version.created',
  VERSION_RESTORED:       'version.restored',
  VERSION_COMPARED:       'version.compared',
  DOCUMENT_CHECKED_OUT:   'document.checked_out',
  DOCUMENT_CHECKED_IN:    'document.checked_in',

  // Review workflow
  STATUS_CHANGED:         'status.changed',
  REVIEW_REQUESTED:       'review.requested',
  REVIEW_COMPLETED:       'review.completed',
  APPROVAL_GRANTED:       'approval.granted',
  APPROVAL_REJECTED:      'approval.rejected',

  // AI interactions
  AI_CONTENT_GENERATED:   'ai.content_generated',
  AI_CONTENT_INSERTED:    'ai.content_inserted',
  AI_COMPLIANCE_CHECK:    'ai.compliance_check',
  AI_SUGGESTION_ACCEPTED: 'ai.suggestion_accepted',
  AI_SUGGESTION_REJECTED: 'ai.suggestion_rejected',

  // Collaboration
  COLLABORATOR_JOINED:    'collaboration.joined',
  COLLABORATOR_LEFT:      'collaboration.left',
  COMMENT_ADDED:          'collaboration.comment_added',
  COMMENT_RESOLVED:       'collaboration.comment_resolved',

  // Signatures
  SIGNATURE_APPLIED:      'signature.applied',
  SIGNATURE_VERIFIED:     'signature.verified',

  // Navigation & access
  SECTION_ACCESSED:       'navigation.section_accessed',

  // Cross-references
  CROSS_REF_CREATED:      'cross_reference.created',
  CROSS_REF_REMOVED:      'cross_reference.removed',

  // eCTD packaging
  ECTD_PACKAGE_CREATED:   'ectd.package_created',
  ECTD_VALIDATED:         'ectd.validated',
});

/** Regulatory-significant action types that merit special attention in audits */
const REGULATORY_SIGNIFICANT_ACTIONS = new Set([
  AuditAction.STATUS_CHANGED,
  AuditAction.APPROVAL_GRANTED,
  AuditAction.APPROVAL_REJECTED,
  AuditAction.SIGNATURE_APPLIED,
  AuditAction.VERSION_RESTORED,
  AuditAction.DOCUMENT_DELETED,
  AuditAction.AI_CONTENT_INSERTED,
  AuditAction.ECTD_PACKAGE_CREATED,
]);

// ─── Event Buffer & Batching ────────────────────────────────────────────────

const EVENT_BUFFER = [];
const FLUSH_INTERVAL_MS = 3000;
const MAX_BUFFER_SIZE = 20;
const MAX_RETRY_ATTEMPTS = 3;
let flushTimer = null;
let retryCount = 0;

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(flushEvents, FLUSH_INTERVAL_MS);
}

/**
 * Sends a single event to the backend audit endpoint.
 * Maps our event schema to the server's expected fields.
 */
async function persistEvent(event) {
  const orgId = localStorage.getItem('selectedOrganizationId') || '1';

  const body = {
    organizationId: parseInt(orgId, 10) || 1,
    eventType: event.action,
    entityType: 'document',
    entityId: event.documentId ? parseInt(event.documentId, 10) || 0 : 0,
    userId: event.user?.id ? parseInt(event.user.id, 10) || 0 : 0,
    userName: event.user?.name || 'System',
    userRole: event.user?.role || 'user',
    reason: event.reason || null,
    metadata: {
      clientEventId: event.id,
      clientTimestamp: event.clientTimestamp,
      versionId: event.versionId,
      section: event.section,
      details: event.details,
    },
    regulatorySignificant: REGULATORY_SIGNIFICANT_ACTIONS.has(event.action),
    gxpRelevant: true,
  };

  const response = await fetch('/api/audit/events', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Organization-Id': String(orgId),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Audit persist returned ${response.status}`);
  }

  return response.json();
}

async function flushEvents() {
  flushTimer = null;
  if (EVENT_BUFFER.length === 0) return;

  const batch = EVENT_BUFFER.splice(0, EVENT_BUFFER.length);

  try {
    // Send events individually to match backend's single-event POST endpoint
    await Promise.allSettled(batch.map(event => persistEvent(event)));
    retryCount = 0; // Reset on success
  } catch (error) {
    console.error('[AuditEventEmitter] Failed to flush events:', error);
    retryCount++;
    if (retryCount < MAX_RETRY_ATTEMPTS) {
      // Re-queue failed events (at front) and schedule retry
      EVENT_BUFFER.unshift(...batch);
      scheduleFlush();
    } else {
      // After max retries, log and discard to prevent memory leak
      console.error(`[AuditEventEmitter] Discarding ${batch.length} events after ${MAX_RETRY_ATTEMPTS} failed attempts`);
      retryCount = 0;
    }
  }
}

// ─── Core Emit Function ─────────────────────────────────────────────────────

/**
 * Emit a structured audit event.
 *
 * @param {string} action - Action from AuditAction enum
 * @param {Object} payload - Event details
 * @param {string} payload.documentId - Document involved
 * @param {string} [payload.versionId] - Version involved
 * @param {string} [payload.section] - CTD section (e.g., "2.7.3")
 * @param {string} [payload.reason] - Human-readable reason / description
 * @param {Object} [payload.details] - Arbitrary structured details
 * @param {Object} [userContext] - User info { id, name, role }
 */
export function emitAuditEvent(action, payload = {}, userContext = null) {
  const event = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    action,
    timestamp: new Date().toISOString(),
    user: userContext || {
      id: localStorage.getItem('userId') || 'unknown',
      name: localStorage.getItem('userName') || 'Unknown User',
      role: localStorage.getItem('userRole') || 'unknown',
    },
    documentId: payload.documentId || null,
    versionId: payload.versionId || null,
    section: payload.section || null,
    reason: payload.reason || null,
    details: payload.details || {},
    clientTimestamp: Date.now(),
  };

  // Add to buffer
  EVENT_BUFFER.push(event);

  // Dispatch a local CustomEvent so UI components can react in real-time
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('audit-event', { detail: event }));
  }

  // Flush immediately if buffer is full, otherwise schedule
  if (EVENT_BUFFER.length >= MAX_BUFFER_SIZE) {
    flushEvents();
  } else {
    scheduleFlush();
  }

  return event;
}

// ─── React Hook ─────────────────────────────────────────────────────────────

/**
 * React hook to listen for audit events of specific types in real-time.
 * Properly attaches/detaches event listeners via useEffect.
 *
 * @param {string|string[]} actionFilter - Action(s) to listen for, or '*' for all
 * @param {Function} callback - Called with the event detail when a matching event fires
 *
 * @example
 *   useAuditEventListener(AuditAction.AI_CONTENT_INSERTED, (event) => {
 *     console.log('AI content was inserted:', event);
 *   });
 */
export function useAuditEventListener(actionFilter, callback) {
  const filters = Array.isArray(actionFilter) ? actionFilter : [actionFilter];
  const callbackRef = useRef(callback);
  const filtersRef = useRef(filters);

  // Keep refs fresh without re-subscribing
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    filtersRef.current = filters;
  }, [actionFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function handler(e) {
      const event = e.detail;
      if (!event) return;
      if (filtersRef.current.includes('*') || filtersRef.current.includes(event.action)) {
        callbackRef.current(event);
      }
    }

    window.addEventListener('audit-event', handler);
    return () => window.removeEventListener('audit-event', handler);
  }, []); // Stable — always subscribed while mounted
}

// ─── Convenient Emitters ────────────────────────────────────────────────────

export function emitDocumentEdited(documentId, versionId, section, changes, userContext) {
  return emitAuditEvent(AuditAction.DOCUMENT_EDITED, {
    documentId,
    versionId,
    section,
    reason: `Document edited in section ${section || 'unknown'}`,
    details: { changeCount: changes?.length || 0, changes },
  }, userContext);
}

export function emitAIContentGenerated(documentId, section, prompt, model, citationCount, userContext) {
  return emitAuditEvent(AuditAction.AI_CONTENT_GENERATED, {
    documentId,
    section,
    reason: `AI content generated for section ${section || 'unknown'}`,
    details: { prompt: prompt?.substring(0, 200), model, citationCount },
  }, userContext);
}

export function emitAIContentInserted(documentId, versionId, section, contentLength, provenance, userContext) {
  return emitAuditEvent(AuditAction.AI_CONTENT_INSERTED, {
    documentId,
    versionId,
    section,
    reason: `AI-generated content (${contentLength} chars) inserted into document`,
    details: { contentLength, model: provenance?.model, sourceDocuments: provenance?.sourceDocuments },
  }, userContext);
}

export function emitStatusChanged(documentId, versionId, oldStatus, newStatus, userContext) {
  return emitAuditEvent(AuditAction.STATUS_CHANGED, {
    documentId,
    versionId,
    reason: `Status changed from ${oldStatus} to ${newStatus}`,
    details: { oldStatus, newStatus },
  }, userContext);
}

// ─── Page Unload: Reliable Delivery ─────────────────────────────────────────

if (typeof window !== 'undefined') {
  // Flush when tab becomes hidden (more reliable than beforeunload)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && EVENT_BUFFER.length > 0) {
      flushEvents();
    }
  });

  window.addEventListener('beforeunload', () => {
    if (EVENT_BUFFER.length > 0) {
      // sendBeacon sends individual events as a batch payload
      // The backend will need the batch endpoint for this path
      // For now, send each event via sendBeacon individually
      const orgId = localStorage.getItem('selectedOrganizationId') || '1';
      EVENT_BUFFER.splice(0).forEach(event => {
        const body = {
          organizationId: parseInt(orgId, 10) || 1,
          eventType: event.action,
          entityType: 'document',
          entityId: event.documentId ? parseInt(event.documentId, 10) || 0 : 0,
          userId: event.user?.id ? parseInt(event.user.id, 10) || 0 : 0,
          userName: event.user?.name || 'System',
          userRole: event.user?.role || 'user',
          reason: event.reason || null,
          metadata: { clientEventId: event.id, details: event.details },
          regulatorySignificant: REGULATORY_SIGNIFICANT_ACTIONS.has(event.action),
          gxpRelevant: true,
        };
        navigator.sendBeacon?.(
          '/api/audit/events',
          new Blob([JSON.stringify(body)], { type: 'application/json' })
        );
      });
    }
  });
}

export default {
  emitAuditEvent,
  emitDocumentEdited,
  emitAIContentGenerated,
  emitAIContentInserted,
  emitStatusChanged,
  AuditAction,
  useAuditEventListener,
};
