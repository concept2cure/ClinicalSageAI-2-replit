import { io } from 'socket.io-client';

class CoAuthorCollaborationService {
  constructor() {
    this.socket = null;
    this.documentId = null;
    this.user = null;
    this.collaborators = new Map();
    this.activities = [];
    this.comments = [];
    this.locks = new Map();
    this.listeners = new Map();
    this.typingUsers = new Map();
    this.typingTimeout = null;
    this.cursors = new Map();
    this.selections = new Map();
  }

  connect(documentId, user) {
    if (this.socket) {
      this.disconnect();
    }

    this.documentId = documentId;
    this.user = user;

    // Connect to the Socket.io server with enhanced configuration
    this.socket = io(window.location.origin, {
      path: '/socket.io/',
      transports: ['websocket', 'polling'], // Fallback to polling if websocket fails
      reconnection: true,
      reconnectionAttempts: 10, // Increased attempts
      reconnectionDelay: 1000, // Initial delay
      reconnectionDelayMax: 5000, // Maximum delay between attempts
      timeout: 20000, // Connection timeout
      // Exponential backoff configuration
      randomizationFactor: 0.5
    });

    // Add connection timeout handler
    const connectionTimeout = setTimeout(() => {
      if (this.socket && !this.socket.connected) {
        console.warn('⚠️ WebSocket connection timeout, falling back to polling');
        if (this.socket.io && this.socket.io.opts) {
          this.socket.io.opts.transports = ['polling'];
          this.socket.connect();
        }
      }
    }, 5000);

    // Clear timeout on successful connection
    this.socket.once('connect', () => {
      clearTimeout(connectionTimeout);
      console.log('✅ WebSocket connected successfully');
    });

    this.setupEventListeners();

    // Join the document room after connection
    this.socket.on('connect', () => {
      this.socket.emit('join-document', {
        documentId,
        user: {
          id: user.id || `user_${Math.random().toString(36).substr(2, 9)}`,
          name: user.name || 'Anonymous User',
          email: user.email,
          avatar: user.avatar
        }
      });
    });

    return this.socket;
  }

  setupEventListeners() {
    // Connection events
    this.socket.on('connect', () => {
      console.log('✅ Connected to collaboration server');
      this.emit('connection-status', { connected: true });
    });

    this.socket.on('disconnect', () => {
      console.log('❌ Disconnected from collaboration server');
      this.emit('connection-status', { connected: false });
    });

    this.socket.on('reconnect', () => {
      console.log('🔄 Reconnected to collaboration server');
      // Rejoin the document room
      if (this.documentId && this.user) {
        this.socket.emit('join-document', {
          documentId: this.documentId,
          user: this.user
        });
      }
    });

    // Document state initialization
    this.socket.on('document-state', (data) => {
      this.collaborators.clear();
      data.collaborators.forEach(collab => {
        this.collaborators.set(collab.id, collab);
      });
      this.activities = data.activities || [];
      this.comments = data.comments || [];
      this.locks.clear();
      (data.locks || []).forEach(lock => {
        this.locks.set(lock.sectionId, lock);
      });
      
      this.emit('state-initialized', {
        collaborators: Array.from(this.collaborators.values()),
        activities: this.activities,
        comments: this.comments,
        locks: Array.from(this.locks.values())
      });
    });

    // Collaborator events
    this.socket.on('collaborator-joined', (data) => {
      if (data.collaborator) {
        this.collaborators.set(data.collaborator.id, data.collaborator);
      }
      if (data.activity) {
        this.activities.unshift(data.activity); // Add to beginning for recent activities
      }
      
      this.emit('collaborator-joined', data);
    });

    this.socket.on('collaborator-left', (data) => {
      this.collaborators.delete(data.userId);
      this.cursors.delete(data.userId);
      this.selections.delete(data.userId);
      this.typingUsers.delete(data.userId);
      
      if (data.activity) {
        this.activities.unshift(data.activity);
      }
      
      // Remove locks for the leaving user
      if (data.unlockedSections) {
        data.unlockedSections.forEach(sectionId => {
          this.locks.delete(sectionId);
        });
      }
      
      this.emit('collaborator-left', data);
    });

    this.socket.on('collaborator-status-update', (data) => {
      const collaborator = this.collaborators.get(data.userId);
      if (collaborator) {
        collaborator.status = data.status;
        this.emit('collaborator-status-update', data);
      }
    });

    // Cursor and selection events
    this.socket.on('cursor-update', (cursor) => {
      this.cursors.set(cursor.userId, cursor);
      this.emit('cursor-update', cursor);
    });

    this.socket.on('selection-update', (selection) => {
      this.selections.set(selection.userId, selection);
      this.emit('selection-update', selection);
    });

    // Document change events
    this.socket.on('document-updated', (data) => {
      if (data.activity) {
        this.activities.unshift(data.activity);
        // Keep only last 100 activities
        if (this.activities.length > 100) {
          this.activities = this.activities.slice(0, 100);
        }
      }
      this.emit('document-updated', data);
    });

    // Typing indicators
    this.socket.on('user-typing', (data) => {
      if (data.isTyping) {
        this.typingUsers.set(data.userId, {
          userName: data.userName,
          section: data.section
        });
      } else {
        this.typingUsers.delete(data.userId);
      }
      
      this.emit('typing-update', {
        typingUsers: Array.from(this.typingUsers.entries()).map(([userId, info]) => ({
          userId,
          ...info
        }))
      });
    });

    // Section lock events
    this.socket.on('section-locked', (data) => {
      if (data.lock) {
        this.locks.set(data.lock.sectionId, data.lock);
      }
      if (data.activity) {
        this.activities.unshift(data.activity);
      }
      
      this.emit('section-locked', data);
    });

    this.socket.on('section-unlocked', (data) => {
      this.locks.delete(data.sectionId);
      if (data.activity) {
        this.activities.unshift(data.activity);
      }
      
      this.emit('section-unlocked', data);
    });

    this.socket.on('lock-denied', (data) => {
      this.emit('lock-denied', data);
    });

    // Comment events
    this.socket.on('comment-added', (data) => {
      if (data.comment) {
        this.comments.unshift(data.comment); // Add to beginning for recent comments
      }
      if (data.activity) {
        this.activities.unshift(data.activity);
      }
      
      this.emit('comment-added', data);
    });

    this.socket.on('comment-resolved', (data) => {
      const comment = this.comments.find(c => c.id === data.commentId);
      if (comment) {
        comment.resolved = true;
      }
      
      this.emit('comment-resolved', data);
    });

    this.socket.on('mention-notification', (data) => {
      this.emit('mention-notification', data);
    });

    // Status change events
    this.socket.on('status-changed', (data) => {
      if (data.activity) {
        this.activities.unshift(data.activity);
      }
      
      this.emit('status-changed', data);
    });
  }

  // Event emitter methods
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    
    // Return unsubscribe function
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      });
    }
  }

  // Outgoing event methods
  sendCursorPosition(position) {
    if (!this.socket || !this.documentId) return;
    
    const collaborator = this.collaborators.get(this.user.id);
    const color = collaborator ? collaborator.color : '#4A90E2';
    
    this.socket.emit('cursor-move', {
      documentId: this.documentId,
      position: {
        userId: this.user.id,
        userName: this.user.name,
        color,
        ...position
      }
    });
  }

  sendSelection(selection) {
    if (!this.socket || !this.documentId) return;
    
    const collaborator = this.collaborators.get(this.user.id);
    const color = collaborator ? collaborator.color : '#4A90E2';
    
    this.socket.emit('selection-change', {
      documentId: this.documentId,
      selection: {
        userId: this.user.id,
        userName: this.user.name,
        color,
        ...selection
      }
    });
  }

  sendDocumentChange(change) {
    if (!this.socket || !this.documentId) return;
    
    this.socket.emit('document-change', {
      documentId: this.documentId,
      userId: this.user.id,
      userName: this.user.name,
      timestamp: new Date(),
      ...change
    });
  }

  startTyping(section) {
    if (!this.socket || !this.documentId) return;
    
    // Clear existing timeout
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
    
    this.socket.emit('typing-start', {
      documentId: this.documentId,
      userId: this.user.id,
      userName: this.user.name,
      section
    });
    
    // Auto-stop typing after 2 seconds of inactivity
    this.typingTimeout = setTimeout(() => {
      this.stopTyping();
    }, 2000);
  }

  stopTyping() {
    if (!this.socket || !this.documentId) return;
    
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
      this.typingTimeout = null;
    }
    
    this.socket.emit('typing-stop', {
      documentId: this.documentId,
      userId: this.user.id
    });
  }

  lockSection(sectionId) {
    if (!this.socket || !this.documentId) return Promise.reject('Not connected');
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.off('section-locked', handleLocked);
        this.off('lock-denied', handleDenied);
        reject(new Error('Lock request timed out'));
      }, 5000);
      
      const handleLocked = (data) => {
        if (data.lock && data.lock.sectionId === sectionId) {
          clearTimeout(timeout);
          this.off('section-locked', handleLocked);
          this.off('lock-denied', handleDenied);
          resolve(data.lock);
        }
      };
      
      const handleDenied = (data) => {
        if (data.sectionId === sectionId) {
          clearTimeout(timeout);
          this.off('section-locked', handleLocked);
          this.off('lock-denied', handleDenied);
          reject(new Error(data.message));
        }
      };
      
      this.on('section-locked', handleLocked);
      this.on('lock-denied', handleDenied);
      
      this.socket.emit('lock-section', {
        documentId: this.documentId,
        sectionId,
        userId: this.user.id,
        userName: this.user.name
      });
    });
  }

  unlockSection(sectionId) {
    if (!this.socket || !this.documentId) return;
    
    this.socket.emit('unlock-section', {
      documentId: this.documentId,
      sectionId,
      userId: this.user.id,
      userName: this.user.name
    });
  }

  addComment(comment) {
    if (!this.socket || !this.documentId) return;
    
    this.socket.emit('add-comment', {
      documentId: this.documentId,
      comment: {
        ...comment,
        documentId: this.documentId,
        userId: this.user.id,
        userName: this.user.name,
        userAvatar: this.user.avatar
      }
    });
  }

  resolveComment(commentId) {
    if (!this.socket || !this.documentId) return;
    
    this.socket.emit('resolve-comment', {
      documentId: this.documentId,
      commentId,
      userId: this.user.id,
      userName: this.user.name
    });
  }

  notifyStatusChange(oldStatus, newStatus) {
    if (!this.socket || !this.documentId) return;
    
    this.socket.emit('document-status-change', {
      documentId: this.documentId,
      userId: this.user.id,
      userName: this.user.name,
      oldStatus,
      newStatus
    });
  }

  updatePresence(status) {
    if (!this.socket || !this.documentId) return;
    
    this.socket.emit('presence-update', {
      documentId: this.documentId,
      userId: this.user.id,
      status
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    this.documentId = null;
    this.collaborators.clear();
    this.activities = [];
    this.comments = [];
    this.locks.clear();
    this.listeners.clear();
    this.typingUsers.clear();
    this.cursors.clear();
    this.selections.clear();
    
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
      this.typingTimeout = null;
    }
  }

  isConnected() {
    return this.socket && this.socket.connected;
  }

  getCollaborators() {
    return Array.from(this.collaborators.values());
  }

  getActivities() {
    return this.activities;
  }

  getComments() {
    return this.comments.filter(c => !c.resolved);
  }

  getResolvedComments() {
    return this.comments.filter(c => c.resolved);
  }

  getLocks() {
    return Array.from(this.locks.values());
  }

  isLocked(sectionId) {
    const lock = this.locks.get(sectionId);
    if (!lock) return false;
    
    // Check if lock is expired
    if (new Date(lock.expiresAt) < new Date()) {
      this.locks.delete(sectionId);
      return false;
    }
    
    return lock.userId !== this.user.id;
  }

  getMyLocks() {
    return Array.from(this.locks.values()).filter(lock => lock.userId === this.user.id);
  }

  getCursors() {
    return Array.from(this.cursors.values());
  }

  getSelections() {
    return Array.from(this.selections.values());
  }

  getTypingUsers() {
    return Array.from(this.typingUsers.entries()).map(([userId, info]) => ({
      userId,
      ...info
    }));
  }
}

// Export singleton instance
const coauthorCollaborationService = new CoAuthorCollaborationService();
export default coauthorCollaborationService;