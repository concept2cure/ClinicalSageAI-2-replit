/**
 * Cross-Module Event Bus - Portal V2
 *
 * Enables communication between modules without tight coupling.
 * Supports typed events, state synchronization, and cache invalidation.
 *
 * Per CONCEPT2CURE_ROADMAP_PART2.md - Week 9 Task 9.1
 *
 * @version 1.0.0
 * @module portal-v2/events/eventBus
 */

import { useEffect, useCallback, useState } from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * All possible event types in the portal
 */
export type PortalEventType =
  // Navigation events
  | 'navigate:module'
  | 'navigate:route'
  | 'navigate:back'
  // Context events
  | 'context:org-changed'
  | 'context:project-changed'
  | 'context:user-changed'
  | 'context:role-changed'
  // Module events
  | 'module:loaded'
  | 'module:unloaded'
  | 'module:error'
  // Document events
  | 'document:created'
  | 'document:updated'
  | 'document:deleted'
  | 'document:uploaded'
  // Submission events
  | 'submission:created'
  | 'submission:status-changed'
  | 'submission:submitted'
  // AI/Cortex events
  | 'cortex:message'
  | 'cortex:suggestion'
  | 'cortex:analysis-complete'
  // Cache events
  | 'cache:invalidate'
  | 'cache:refresh'
  // Notification events
  | 'notification:show'
  | 'notification:dismiss'
  // System events
  | 'system:error'
  | 'system:warning'
  | 'system:info';

/**
 * Event payloads for type safety
 */
export interface PortalEventPayloads {
  // Navigation
  'navigate:module': { moduleId: string; params?: Record<string, string> };
  'navigate:route': { route: string; replace?: boolean };
  'navigate:back': void;

  // Context
  'context:org-changed': { orgId: string; orgName: string };
  'context:project-changed': { projectId: string; projectName: string };
  'context:user-changed': { userId: string; userName: string };
  'context:role-changed': { role: string; previousRole?: string };

  // Module
  'module:loaded': { moduleId: string; loadTime: number };
  'module:unloaded': { moduleId: string };
  'module:error': { moduleId: string; error: string };

  // Document
  'document:created': { documentId: string; documentType: string; name: string };
  'document:updated': { documentId: string; changes: string[] };
  'document:deleted': { documentId: string };
  'document:uploaded': { documentId: string; fileName: string; size: number };

  // Submission
  'submission:created': { submissionId: string; type: string };
  'submission:status-changed': { submissionId: string; status: string; previousStatus: string };
  'submission:submitted': { submissionId: string; agency: string };

  // AI/Cortex
  'cortex:message': { threadId: string; message: string; role: 'user' | 'assistant' };
  'cortex:suggestion': { suggestionId: string; type: string; content: string };
  'cortex:analysis-complete': { analysisId: string; results: Record<string, unknown> };

  // Cache
  'cache:invalidate': { keys: string[] };
  'cache:refresh': { keys: string[] };

  // Notification
  'notification:show': {
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message?: string;
    duration?: number;
  };
  'notification:dismiss': { id: string };

  // System
  'system:error': { code: string; message: string; details?: unknown };
  'system:warning': { code: string; message: string };
  'system:info': { message: string };
}

/**
 * Event handler function type
 */
export type EventHandler<T extends PortalEventType> = (
  payload: PortalEventPayloads[T]
) => void | Promise<void>;

/**
 * Event subscription
 */
interface EventSubscription {
  id: string;
  type: PortalEventType;
  handler: EventHandler<any>;
  once: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT BUS IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * PortalEventBus - Central event dispatcher for cross-module communication
 *
 * Features:
 * - Typed events with payload validation
 * - Async handler support
 * - One-time subscriptions
 * - Debug logging
 * - Memory leak prevention
 */
class PortalEventBus {
  private subscriptions: Map<PortalEventType, Set<EventSubscription>> = new Map();
  private subscriptionCounter = 0;
  private debug: boolean;
  private eventHistory: Array<{ type: PortalEventType; payload: unknown; timestamp: Date }> = [];
  private maxHistorySize = 100;

  constructor(debug = false) {
    this.debug = debug;
  }

  /**
   * Subscribe to an event
   */
  on<T extends PortalEventType>(
    type: T,
    handler: EventHandler<T>,
    options?: { once?: boolean }
  ): () => void {
    const subscription: EventSubscription = {
      id: `sub_${++this.subscriptionCounter}`,
      type,
      handler,
      once: options?.once ?? false,
    };

    if (!this.subscriptions.has(type)) {
      this.subscriptions.set(type, new Set());
    }
    this.subscriptions.get(type)!.add(subscription);

    if (this.debug) {
      console.log(`[EventBus] Subscribed to ${type} (${subscription.id})`);
    }

    // Return unsubscribe function
    return () => this.off(type, subscription.id);
  }

  /**
   * Subscribe to an event once
   */
  once<T extends PortalEventType>(type: T, handler: EventHandler<T>): () => void {
    return this.on(type, handler, { once: true });
  }

  /**
   * Unsubscribe from an event
   */
  off(type: PortalEventType, subscriptionId: string): void {
    const subs = this.subscriptions.get(type);
    if (subs) {
      for (const sub of subs) {
        if (sub.id === subscriptionId) {
          subs.delete(sub);
          if (this.debug) {
            console.log(`[EventBus] Unsubscribed from ${type} (${subscriptionId})`);
          }
          break;
        }
      }
    }
  }

  /**
   * Emit an event to all subscribers
   */
  async emit<T extends PortalEventType>(type: T, payload: PortalEventPayloads[T]): Promise<void> {
    // Record in history
    this.eventHistory.push({
      type,
      payload,
      timestamp: new Date(),
    });

    // Trim history if needed
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }

    if (this.debug) {
      console.log(`[EventBus] Emitting ${type}`, payload);
    }

    const subs = this.subscriptions.get(type);
    if (!subs || subs.size === 0) {
      return;
    }

    const toRemove: EventSubscription[] = [];

    for (const sub of subs) {
      try {
        await sub.handler(payload);
        if (sub.once) {
          toRemove.push(sub);
        }
      } catch (error) {
        console.error(`[EventBus] Handler error for ${type}:`, error);
      }
    }

    // Clean up once subscriptions
    for (const sub of toRemove) {
      subs.delete(sub);
    }
  }

  /**
   * Get event history
   */
  getHistory(type?: PortalEventType): typeof this.eventHistory {
    if (type) {
      return this.eventHistory.filter(e => e.type === type);
    }
    return [...this.eventHistory];
  }

  /**
   * Clear all subscriptions
   */
  clear(): void {
    this.subscriptions.clear();
    if (this.debug) {
      console.log('[EventBus] All subscriptions cleared');
    }
  }

  /**
   * Get subscription count
   */
  getSubscriptionCount(type?: PortalEventType): number {
    if (type) {
      return this.subscriptions.get(type)?.size ?? 0;
    }
    let total = 0;
    this.subscriptions.forEach(subs => {
      total += subs.size;
    });
    return total;
  }

  /**
   * Enable/disable debug mode
   */
  setDebug(enabled: boolean): void {
    this.debug = enabled;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

let eventBusInstance: PortalEventBus | null = null;

/**
 * Get singleton EventBus instance
 */
export function getEventBus(): PortalEventBus {
  if (!eventBusInstance) {
    const isDev = typeof window !== 'undefined' && window.location?.hostname === 'localhost';
    eventBusInstance = new PortalEventBus(isDev);
  }
  return eventBusInstance;
}

/**
 * Reset event bus (for testing)
 */
export function resetEventBus(): void {
  eventBusInstance?.clear();
  eventBusInstance = null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// REACT HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook to subscribe to portal events
 *
 * @example
 * ```tsx
 * usePortalEvent('document:created', (payload) => {
 *   console.log('New document:', payload.documentId);
 * });
 * ```
 */
export function usePortalEvent<T extends PortalEventType>(
  type: T,
  handler: EventHandler<T>,
  deps: React.DependencyList = []
) {
  // Memoize handler to prevent unnecessary re-subscriptions
  const memoizedHandler = useCallback(handler, deps);

  useEffect(() => {
    const eventBus = getEventBus();
    const unsubscribe = eventBus.on(type, memoizedHandler);

    return () => {
      unsubscribe();
    };
  }, [type, memoizedHandler]);
}

/**
 * Hook to emit portal events
 *
 * @example
 * ```tsx
 * const emit = useEmitEvent();
 * emit('document:created', { documentId: '123', documentType: 'ind', name: 'Draft' });
 * ```
 */
export function useEmitEvent() {
  const eventBus = getEventBus();

  return useCallback(<T extends PortalEventType>(type: T, payload: PortalEventPayloads[T]) => {
    return eventBus.emit(type, payload);
  }, []);
}

/**
 * Hook to track event history
 */
export function useEventHistory(type?: PortalEventType) {
  const [history, setHistory] = useState<ReturnType<PortalEventBus['getHistory']>>([]);
  const eventBus = getEventBus();

  useEffect(() => {
    // Initial load
    setHistory(eventBus.getHistory(type));

    // Update on any event
    const unsubscribes: Array<() => void> = [];

    if (type) {
      unsubscribes.push(
        eventBus.on(type, () => {
          setHistory(eventBus.getHistory(type));
        })
      );
    } else {
      // Subscribe to all for general history
      const allTypes: PortalEventType[] = [
        'navigate:module',
        'document:created',
        'document:updated',
        'submission:status-changed',
        'cortex:message',
        'notification:show',
      ];
      for (const t of allTypes) {
        unsubscribes.push(
          eventBus.on(t, () => {
            setHistory(eventBus.getHistory());
          })
        );
      }
    }

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [type]);

  return history;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONVENIENCE EMITTERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Emit a notification
 */
export function showNotification(
  type: 'success' | 'error' | 'warning' | 'info',
  title: string,
  message?: string,
  duration?: number
) {
  const eventBus = getEventBus();
  eventBus.emit('notification:show', {
    id: `notif_${Date.now()}`,
    type,
    title,
    message,
    duration,
  });
}

/**
 * Invalidate cache keys
 */
export function invalidateCache(...keys: string[]) {
  const eventBus = getEventBus();
  eventBus.emit('cache:invalidate', { keys });
}

/**
 * Navigate to a module
 */
export function navigateToModule(moduleId: string, params?: Record<string, string>) {
  const eventBus = getEventBus();
  eventBus.emit('navigate:module', { moduleId, params });
}

export default PortalEventBus;
