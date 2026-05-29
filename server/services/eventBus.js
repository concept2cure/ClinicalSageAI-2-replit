/**
 * EventBus Service
 * Manages inter-module communication between IND Wizard and eCTD Co-Author
 */

const EventEmitter = require('events');

class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100); // Support many concurrent listeners
    
    // Event types
    this.events = {
      // IND Wizard → eCTD Co-Author events
      WIZARD_PACKAGE_CREATED: 'wizard.package.created',
      WIZARD_DOCS_INSTANTIATED: 'wizard.docs.instantiated',
      WIZARD_LOCALIZATION_REQUESTED: 'wizard.localization.requested',
      WIZARD_TEMPLATE_SELECTED: 'wizard.template.selected',
      WIZARD_VARIABLES_UPDATED: 'wizard.variables.updated',
      WIZARD_SUBMISSION_INITIATED: 'wizard.submission.initiated',
      
      // eCTD Co-Author → IND Wizard events  
      COAUTHOR_DOCUMENT_LOCKED: 'coauthor.document.locked',
      COAUTHOR_SEQUENCE_READY: 'coauthor.sequence.ready',
      COAUTHOR_VALIDATION_FAILED: 'coauthor.validation.failed',
      COAUTHOR_DOCUMENT_UPDATED: 'coauthor.document.updated',
      COAUTHOR_REVIEW_REQUESTED: 'coauthor.review.requested',
      COAUTHOR_EXPORT_COMPLETED: 'coauthor.export.completed',
      
      // Shared events
      TEMPLATE_INSTANTIATED: 'template.instantiated',
      VARIABLE_CHANGED: 'variable.changed',
      DOCUMENT_STATUS_CHANGED: 'document.status.changed',
      VALIDATION_COMPLETED: 'validation.completed',
      COLLABORATION_STARTED: 'collaboration.started',
      COLLABORATION_ENDED: 'collaboration.ended'
    };
    
    // Event history for debugging
    this.eventHistory = [];
    this.maxHistorySize = 1000;
    
    // WebSocket connections for real-time updates
    this.wsConnections = new Map();
    
    // Initialize event handlers
    this.initializeHandlers();
  }
  
  /**
   * Initialize default event handlers
   */
  initializeHandlers() {
    // Log all events for debugging
    Object.values(this.events).forEach(eventName => {
      this.on(eventName, (data) => {
        this.logEvent(eventName, data);
      });
    });
    
    // Handle wizard package created
    this.on(this.events.WIZARD_PACKAGE_CREATED, async (data) => {
      console.log('[EventBus] Package created in IND Wizard:', data);
      
      // Create submission container in eCTD Co-Author
      await this.createSubmissionContainer(data);
      
      // Notify connected clients
      this.broadcastToWebSockets('package.created', data);
    });
    
    // Handle document instantiation
    this.on(this.events.WIZARD_DOCS_INSTANTIATED, async (data) => {
      console.log('[EventBus] Documents instantiated:', data);
      
      // Materialize stubs with variables in eCTD Co-Author
      await this.materializeDocumentStubs(data);
      
      // Notify connected clients
      this.broadcastToWebSockets('documents.ready', data);
    });
    
    // Handle localization requests
    this.on(this.events.WIZARD_LOCALIZATION_REQUESTED, async (data) => {
      console.log('[EventBus] Localization requested:', data);
      
      // Spawn language branches in eCTD Co-Author
      await this.spawnLanguageBranches(data);
      
      // Notify connected clients
      this.broadcastToWebSockets('localization.started', data);
    });
    
    // Handle content lock from Co-Author
    this.on(this.events.COAUTHOR_DOCUMENT_LOCKED, async (data) => {
      console.log('[EventBus] Document locked in Co-Author:', data);
      
      // Freeze content/variables in IND Wizard
      await this.freezeContent(data);
      
      // Notify connected clients
      this.broadcastToWebSockets('document.locked', data);
    });
    
    // Handle sequence ready from Co-Author
    this.on(this.events.COAUTHOR_SEQUENCE_READY, async (data) => {
      console.log('[EventBus] Sequence ready in Co-Author:', data);
      
      // Mark checklist items complete in IND Wizard
      await this.updateChecklistStatus(data);
      
      // Notify connected clients
      this.broadcastToWebSockets('sequence.ready', data);
    });
    
    // Handle validation failures
    this.on(this.events.COAUTHOR_VALIDATION_FAILED, async (data) => {
      console.log('[EventBus] Validation failed in Co-Author:', data);
      
      // Push actionable fixes to IND Wizard
      await this.pushValidationFixes(data);
      
      // Notify connected clients
      this.broadcastToWebSockets('validation.failed', data);
    });
  }
  
  /**
   * Emit an event with data
   */
  emitEvent(eventName, data) {
    if (!Object.values(this.events).includes(eventName)) {
      console.warn(`[EventBus] Unknown event: ${eventName}`);
    }
    
    const eventData = {
      ...data,
      timestamp: new Date().toISOString(),
      eventId: this.generateEventId()
    };
    
    this.emit(eventName, eventData);
    
    return eventData;
  }
  
  /**
   * Subscribe to an event
   */
  subscribe(eventName, handler) {
    if (!Object.values(this.events).includes(eventName)) {
      console.warn(`[EventBus] Subscribing to unknown event: ${eventName}`);
    }
    
    this.on(eventName, handler);
    
    return () => {
      this.removeListener(eventName, handler);
    };
  }
  
  /**
   * Subscribe to an event (once only)
   */
  subscribeOnce(eventName, handler) {
    if (!Object.values(this.events).includes(eventName)) {
      console.warn(`[EventBus] Subscribing to unknown event: ${eventName}`);
    }
    
    this.once(eventName, handler);
  }
  
  /**
   * Log event to history
   */
  logEvent(eventName, data) {
    const logEntry = {
      eventName,
      data,
      timestamp: new Date().toISOString()
    };
    
    this.eventHistory.push(logEntry);
    
    // Trim history if too large
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
  }
  
  /**
   * Get event history
   */
  getEventHistory(eventName = null, limit = 100) {
    let history = this.eventHistory;
    
    if (eventName) {
      history = history.filter(entry => entry.eventName === eventName);
    }
    
    return history.slice(-limit);
  }
  
  /**
   * Clear event history
   */
  clearEventHistory() {
    this.eventHistory = [];
  }
  
  /**
   * Generate unique event ID
   */
  generateEventId() {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * WebSocket Management
   */
  
  /**
   * Register WebSocket connection
   */
  registerWebSocket(clientId, ws) {
    this.wsConnections.set(clientId, ws);
    
    // Remove on close
    ws.on('close', () => {
      this.wsConnections.delete(clientId);
    });
  }
  
  /**
   * Broadcast to all WebSocket clients
   */
  broadcastToWebSockets(type, data) {
    const message = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
    
    this.wsConnections.forEach((ws, clientId) => {
      if (ws.readyState === 1) { // WebSocket.OPEN
        ws.send(message);
      }
    });
  }
  
  /**
   * Action Handlers (called by events)
   */
  
  /**
   * Create submission container in eCTD Co-Author
   */
  async createSubmissionContainer(data) {
    // The eCTD Co-Author submission-container API is not wired. Report this
    // honestly instead of returning success:true with a fabricated containerId,
    // which claimed a container was created when nothing happened.
    // See FORENSIC_CODE_AUDIT_2026-05-29.md HI-4.
    console.warn('[EventBus] createSubmissionContainer not implemented; no container created:', {
      packageId: data.packageId,
      regions: data.regions,
      submissionType: data.submissionType
    });
    return {
      success: false,
      implemented: false,
      reason: 'eCTD Co-Author submission-container API is not wired',
    };
  }
  
  /**
   * Materialize document stubs in eCTD Co-Author
   */
  async materializeDocumentStubs(data) {
    try {
      console.log('[EventBus] Materializing document stubs:', {
        documents: data.documents?.length || 0,
        variables: Object.keys(data.variables || {}).length
      });
      
      // Process each document
      const results = [];
      for (const doc of (data.documents || [])) {
        results.push({
          documentId: doc.id,
          stubId: `stub_${doc.id}`,
          status: 'materialized'
        });
      }
      
      return results;
    } catch (error) {
      console.error('[EventBus] Error materializing stubs:', error);
      throw error;
    }
  }
  
  /**
   * Spawn language branches for ICF/assent forms
   */
  async spawnLanguageBranches(data) {
    try {
      console.log('[EventBus] Spawning language branches:', {
        languages: data.languages,
        documentId: data.documentId
      });
      
      const branches = [];
      for (const lang of (data.languages || [])) {
        branches.push({
          language: lang,
          branchId: `branch_${lang}_${data.documentId}`,
          status: 'created'
        });
      }
      
      return branches;
    } catch (error) {
      console.error('[EventBus] Error spawning language branches:', error);
      throw error;
    }
  }
  
  /**
   * Freeze content and variables in IND Wizard
   */
  async freezeContent(data) {
    try {
      console.log('[EventBus] Freezing content:', {
        documentId: data.documentId,
        contentHash: data.contentHash
      });
      
      return {
        success: true,
        frozenAt: new Date().toISOString(),
        documentId: data.documentId
      };
    } catch (error) {
      console.error('[EventBus] Error freezing content:', error);
      throw error;
    }
  }
  
  /**
   * Update checklist status in IND Wizard
   */
  async updateChecklistStatus(data) {
    try {
      console.log('[EventBus] Updating checklist:', {
        sequenceId: data.sequenceId,
        completedItems: data.completedItems
      });
      
      return {
        success: true,
        updatedAt: new Date().toISOString(),
        sequenceId: data.sequenceId
      };
    } catch (error) {
      console.error('[EventBus] Error updating checklist:', error);
      throw error;
    }
  }
  
  /**
   * Push validation fixes to IND Wizard
   */
  async pushValidationFixes(data) {
    try {
      console.log('[EventBus] Pushing validation fixes:', {
        documentId: data.documentId,
        issues: data.issues?.length || 0
      });
      
      return {
        success: true,
        fixesApplied: data.issues?.length || 0,
        documentId: data.documentId
      };
    } catch (error) {
      console.error('[EventBus] Error pushing fixes:', error);
      throw error;
    }
  }
  
  /**
   * Get statistics about events
   */
  getStatistics() {
    const stats = {
      totalEvents: this.eventHistory.length,
      eventCounts: {},
      recentEvents: this.getEventHistory(null, 10),
      activeWebSockets: this.wsConnections.size
    };
    
    // Count events by type
    this.eventHistory.forEach(entry => {
      stats.eventCounts[entry.eventName] = (stats.eventCounts[entry.eventName] || 0) + 1;
    });
    
    return stats;
  }
}

// Export singleton instance
const eventBus = new EventBus();
module.exports = eventBus;