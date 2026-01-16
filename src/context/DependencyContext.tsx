import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

export type SubscriberType = 'chip' | 'table';

interface SubscriberRecord {
  nodeId: string;
  type: SubscriberType;
  value?: string;
}

interface PendingChange {
  currentValue: string;
  nextValue: string;
}

interface DependencyContextValue {
  registerSubscriber: (
    sourceId: string,
    nodeId: string,
    type: SubscriberType,
    meta?: { currentValue?: string },
  ) => void;
  unregisterSubscriber: (sourceId: string, nodeId: string) => void;
  updateSubscriberValue: (sourceId: string, nodeId: string, value: string) => void;
  getImpactReport: (sourceId: string) => { tables: number; chips: number };
  markDatasetUpdate: (
    sourceId: string,
    overrides?: Record<string, Partial<PendingChange> & { nextValue?: string }>,
  ) => void;
  acknowledgeNodeUpdate: (sourceId: string, nodeId: string) => void;
  isNodeStale: (sourceId: string, nodeId: string) => boolean;
  getPendingChange: (sourceId: string, nodeId: string) => PendingChange | null;
}

const DependencyContext = createContext<DependencyContextValue | undefined>(undefined);

type SubscriberMap = Map<string, Map<string, SubscriberRecord>>;
type StaleMap = Map<string, Map<string, PendingChange>>;

const normaliseSourceId = (value: string) => value.trim().toLowerCase();

const computeNextValue = (currentValue: string): string => {
  if (!currentValue) {
    return 'Pending verification';
  }

  const numericMatch = currentValue.match(/-?\d+(\.\d+)?/);
  if (!numericMatch) {
    return `${currentValue}*`;
  }

  const numeric = Number.parseFloat(numericMatch[0]);
  if (!Number.isFinite(numeric)) {
    return `${currentValue}*`;
  }

  const adjusted = numeric + numeric * 0.05;
  const fixed = numericMatch[0].includes('.') ? adjusted.toFixed(3) : Math.round(adjusted).toString();

  if (currentValue.includes('%')) {
    return `${fixed}%`;
  }

  if (currentValue.includes('day')) {
    return currentValue.replace(numericMatch[0], fixed);
  }

  return currentValue.replace(numericMatch[0], fixed);
};

export const DependencyProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [subscribers, setSubscribers] = useState<SubscriberMap>(new Map());
  const [staleNodes, setStaleNodes] = useState<StaleMap>(new Map());
  const subscribersRef = useRef(subscribers);

  useEffect(() => {
    subscribersRef.current = subscribers;
  }, [subscribers]);

  const registerSubscriber = useCallback(
    (sourceId: string, nodeId: string, type: SubscriberType, meta?: { currentValue?: string }) => {
      if (!sourceId || !nodeId) {
        return;
      }

      setSubscribers(prev => {
        const next = new Map(prev);
        const key = normaliseSourceId(sourceId);
        const bucket = new Map(next.get(key) ?? new Map());
        bucket.set(nodeId, { nodeId, type, value: meta?.currentValue ?? bucket.get(nodeId)?.value });
        next.set(key, bucket);
        return next;
      });
    },
    [],
  );

  const unregisterSubscriber = useCallback((sourceId: string, nodeId: string) => {
    if (!sourceId || !nodeId) {
      return;
    }

    setSubscribers(prev => {
      const next = new Map(prev);
      const key = normaliseSourceId(sourceId);
      const bucket = new Map(next.get(key) ?? new Map());
      bucket.delete(nodeId);
      if (bucket.size === 0) {
        next.delete(key);
      } else {
        next.set(key, bucket);
      }
      return next;
    });

    setStaleNodes(prev => {
      const next = new Map(prev);
      const key = normaliseSourceId(sourceId);
      const bucket = new Map(next.get(key) ?? new Map());
      bucket.delete(nodeId);
      if (bucket.size === 0) {
        next.delete(key);
      } else {
        next.set(key, bucket);
      }
      return next;
    });
  }, []);

  const updateSubscriberValue = useCallback((sourceId: string, nodeId: string, value: string) => {
    setSubscribers(prev => {
      const next = new Map(prev);
      const key = normaliseSourceId(sourceId);
      const bucket = new Map(next.get(key) ?? new Map());
      const record = bucket.get(nodeId);
      if (record) {
        bucket.set(nodeId, { ...record, value });
        next.set(key, bucket);
      }
      return next;
    });
  }, []);

  const getImpactReport = useCallback(
    (sourceId: string) => {
      const key = normaliseSourceId(sourceId);
      const bucket = subscribersRef.current.get(key);
      if (!bucket) {
        return { tables: 0, chips: 0 };
      }

      let tables = 0;
      let chips = 0;
      bucket.forEach(record => {
        if (record.type === 'table') {
          tables += 1;
        } else {
          chips += 1;
        }
      });

      return { tables, chips };
    },
    [],
  );

  const markDatasetUpdate = useCallback(
    (sourceId: string, overrides?: Record<string, Partial<PendingChange> & { nextValue?: string }>) => {
      const key = normaliseSourceId(sourceId);
      const subscribersForSource = subscribersRef.current.get(key);
      if (!subscribersForSource || subscribersForSource.size === 0) {
        return;
      }

      setStaleNodes(prev => {
        const next = new Map(prev);
        const bucket = new Map(next.get(key) ?? new Map());

        subscribersForSource.forEach(record => {
          if (record.type !== 'chip') {
            return;
          }

          const currentValue = record.value ?? '';
          const override = overrides?.[record.nodeId];
          const nextValue = override?.nextValue
            ? override.nextValue
            : computeNextValue(override?.currentValue ?? currentValue);

          bucket.set(record.nodeId, {
            currentValue,
            nextValue,
          });
        });

        if (bucket.size > 0) {
          next.set(key, bucket);
        } else {
          next.delete(key);
        }

        return next;
      });
    },
    [],
  );

  const acknowledgeNodeUpdate = useCallback((sourceId: string, nodeId: string) => {
    const key = normaliseSourceId(sourceId);

    setStaleNodes(prev => {
      const next = new Map(prev);
      const bucket = new Map(next.get(key) ?? new Map());
      bucket.delete(nodeId);
      if (bucket.size === 0) {
        next.delete(key);
      } else {
        next.set(key, bucket);
      }
      return next;
    });
  }, []);

  const isNodeStale = useCallback((sourceId: string, nodeId: string) => {
    const key = normaliseSourceId(sourceId);
    const bucket = staleNodes.get(key);
    return bucket?.has(nodeId) ?? false;
  }, [staleNodes]);

  const getPendingChange = useCallback(
    (sourceId: string, nodeId: string) => {
      const key = normaliseSourceId(sourceId);
      const bucket = staleNodes.get(key);
      if (!bucket) {
        return null;
      }
      return bucket.get(nodeId) ?? null;
    },
    [staleNodes],
  );

  const value = useMemo<DependencyContextValue>(
    () => ({
      registerSubscriber,
      unregisterSubscriber,
      updateSubscriberValue,
      getImpactReport,
      markDatasetUpdate,
      acknowledgeNodeUpdate,
      isNodeStale,
      getPendingChange,
    }),
    [
      registerSubscriber,
      unregisterSubscriber,
      updateSubscriberValue,
      getImpactReport,
      markDatasetUpdate,
      acknowledgeNodeUpdate,
      isNodeStale,
      getPendingChange,
    ],
  );

  return <DependencyContext.Provider value={value}>{children}</DependencyContext.Provider>;
};

export const useDependencyContext = () => {
  const context = useContext(DependencyContext);
  if (!context) {
    throw new Error('useDependencyContext must be used within a DependencyProvider');
  }
  return context;
};

```}