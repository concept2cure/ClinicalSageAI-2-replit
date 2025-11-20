import { db } from '../db/index.js';
import { 
  documentComponents,
  coauthorDocuments
} from '../../shared/schema.js';
import { eq, and, sql, isNull, or } from 'drizzle-orm';

/**
 * Document Locking Service for Component-Based Editing
 * Provides granular component-level locking for collaborative editing
 */

// In-memory lock registry for performance
const activeLocks = new Map();
const LOCK_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const LOCK_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Lock a component for editing
export async function lockComponent(componentId, documentId, userId, userName, organizationId, reason = null) {
  try {
    const lockKey = `${documentId}-${componentId}`;
    
    // Check if component is already locked
    const existingLock = activeLocks.get(lockKey);
    if (existingLock && existingLock.userId !== userId) {
      // Check if lock has expired
      if (Date.now() - existingLock.timestamp > LOCK_TIMEOUT) {
        // Lock expired, remove it
        activeLocks.delete(lockKey);
      } else {
        return {
          success: false,
          error: 'Component is locked by another user',
          lockedBy: existingLock.userName,
          lockedAt: new Date(existingLock.timestamp).toISOString(),
          remainingTime: Math.ceil((LOCK_TIMEOUT - (Date.now() - existingLock.timestamp)) / 1000)
        };
      }
    }
    
    // Update database
    await db.update(documentComponents)
      .set({
        isLocked: true,
        lockedById: userId,
        lockedAt: sql`NOW()`,
        lockReason: reason
      })
      .where(and(
        eq(documentComponents.documentId, documentId),
        eq(documentComponents.componentId, componentId),
        eq(documentComponents.organizationId, organizationId)
      ));
    
    // Update in-memory registry
    activeLocks.set(lockKey, {
      userId,
      userName,
      timestamp: Date.now(),
      reason
    });
    
    return {
      success: true,
      lockId: lockKey,
      expiresAt: new Date(Date.now() + LOCK_TIMEOUT).toISOString()
    };
    
  } catch (error) {
    console.error('Error locking component:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Release a component lock
export async function unlockComponent(componentId, documentId, userId, organizationId) {
  try {
    const lockKey = `${documentId}-${componentId}`;
    
    // Check if user owns the lock
    const existingLock = activeLocks.get(lockKey);
    if (existingLock && existingLock.userId !== userId) {
      return {
        success: false,
        error: 'You do not own this lock'
      };
    }
    
    // Update database
    await db.update(documentComponents)
      .set({
        isLocked: false,
        lockedById: null,
        lockedAt: null,
        lockReason: null
      })
      .where(and(
        eq(documentComponents.documentId, documentId),
        eq(documentComponents.componentId, componentId),
        eq(documentComponents.organizationId, organizationId)
      ));
    
    // Remove from in-memory registry
    activeLocks.delete(lockKey);
    
    return {
      success: true
    };
    
  } catch (error) {
    console.error('Error unlocking component:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Refresh a component lock (extend timeout)
export async function refreshLock(componentId, documentId, userId, organizationId) {
  try {
    const lockKey = `${documentId}-${componentId}`;
    
    // Check if user owns the lock
    const existingLock = activeLocks.get(lockKey);
    if (!existingLock || existingLock.userId !== userId) {
      return {
        success: false,
        error: 'Lock not found or not owned by user'
      };
    }
    
    // Update timestamp
    existingLock.timestamp = Date.now();
    
    // Update database
    await db.update(documentComponents)
      .set({
        lockedAt: sql`NOW()`
      })
      .where(and(
        eq(documentComponents.documentId, documentId),
        eq(documentComponents.componentId, componentId),
        eq(documentComponents.organizationId, organizationId),
        eq(documentComponents.lockedById, userId)
      ));
    
    return {
      success: true,
      expiresAt: new Date(Date.now() + LOCK_TIMEOUT).toISOString()
    };
    
  } catch (error) {
    console.error('Error refreshing lock:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Get all active locks for a document
export async function getDocumentLocks(documentId, organizationId) {
  try {
    const locks = await db
      .select({
        componentId: documentComponents.componentId,
        position: documentComponents.position,
        isLocked: documentComponents.isLocked,
        lockedById: documentComponents.lockedById,
        lockedAt: documentComponents.lockedAt,
        lockReason: documentComponents.lockReason
      })
      .from(documentComponents)
      .where(and(
        eq(documentComponents.documentId, documentId),
        eq(documentComponents.organizationId, organizationId),
        eq(documentComponents.isLocked, true)
      ));
    
    // Enhance with in-memory data
    const enhancedLocks = locks.map(lock => {
      const lockKey = `${documentId}-${lock.componentId}`;
      const memoryLock = activeLocks.get(lockKey);
      
      if (memoryLock) {
        const timeRemaining = Math.max(0, 
          LOCK_TIMEOUT - (Date.now() - memoryLock.timestamp)
        );
        
        return {
          ...lock,
          userName: memoryLock.userName,
          expiresIn: Math.ceil(timeRemaining / 1000)
        };
      }
      
      return lock;
    });
    
    return {
      success: true,
      locks: enhancedLocks,
      totalLocked: enhancedLocks.length
    };
    
  } catch (error) {
    console.error('Error getting document locks:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Auto-save document changes with debouncing
class AutoSaveManager {
  constructor() {
    this.pendingSaves = new Map();
    this.saveInterval = 5000; // 5 seconds debounce
  }
  
  // Queue a save operation
  queueSave(documentId, organizationId, content, userId) {
    const saveKey = `${documentId}-${organizationId}`;
    
    // Clear existing timeout
    if (this.pendingSaves.has(saveKey)) {
      clearTimeout(this.pendingSaves.get(saveKey).timeout);
    }
    
    // Set new timeout
    const timeoutId = setTimeout(async () => {
      await this.executeSave(documentId, organizationId, content, userId);
      this.pendingSaves.delete(saveKey);
    }, this.saveInterval);
    
    // Store pending save
    this.pendingSaves.set(saveKey, {
      timeout: timeoutId,
      content,
      userId,
      timestamp: Date.now()
    });
  }
  
  // Execute the save
  async executeSave(documentId, organizationId, content, userId) {
    try {
      // Update document content
      await db.update(coauthorDocuments)
        .set({
          content,
          updatedAt: sql`NOW()`,
          updatedBy: userId
        })
        .where(and(
          eq(coauthorDocuments.id, documentId),
          eq(coauthorDocuments.organizationId, organizationId)
        ));
      
      console.log(`Auto-saved document ${documentId} at ${new Date().toISOString()}`);
      
      return {
        success: true,
        savedAt: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('Auto-save failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // Force immediate save (bypass debounce)
  async forceSave(documentId, organizationId) {
    const saveKey = `${documentId}-${organizationId}`;
    const pendingSave = this.pendingSaves.get(saveKey);
    
    if (!pendingSave) {
      return { success: false, error: 'No pending save found' };
    }
    
    // Clear timeout
    clearTimeout(pendingSave.timeout);
    this.pendingSaves.delete(saveKey);
    
    // Execute save immediately
    return await this.executeSave(
      documentId,
      organizationId,
      pendingSave.content,
      pendingSave.userId
    );
  }
  
  // Get pending save status
  getPendingSaves() {
    const pending = [];
    
    for (const [key, save] of this.pendingSaves) {
      const [documentId, organizationId] = key.split('-');
      pending.push({
        documentId: parseInt(documentId),
        organizationId: parseInt(organizationId),
        pendingSince: new Date(save.timestamp).toISOString(),
        willSaveIn: Math.ceil((this.saveInterval - (Date.now() - save.timestamp)) / 1000)
      });
    }
    
    return pending;
  }
}

// Create singleton instance
export const autoSaveManager = new AutoSaveManager();

// Clean up expired locks periodically
setInterval(() => {
  const now = Date.now();
  const expiredLocks = [];
  
  for (const [key, lock] of activeLocks) {
    if (now - lock.timestamp > LOCK_TIMEOUT) {
      expiredLocks.push(key);
    }
  }
  
  // Remove expired locks
  for (const key of expiredLocks) {
    activeLocks.delete(key);
    console.log(`Removed expired lock: ${key}`);
  }
  
  if (expiredLocks.length > 0) {
    // Update database to clear expired locks
    const [documentId, componentId] = expiredLocks[0].split('-');
    db.update(documentComponents)
      .set({
        isLocked: false,
        lockedById: null,
        lockedAt: null,
        lockReason: null
      })
      .where(and(
        isNull(documentComponents.lockedById),
        sql`locked_at < NOW() - INTERVAL '30 minutes'`
      ))
      .catch(err => console.error('Error clearing expired locks:', err));
  }
}, 60000); // Check every minute

export default {
  lockComponent,
  unlockComponent,
  refreshLock,
  getDocumentLocks,
  autoSaveManager
};