import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Hook for memory optimization in components that handle large datasets
 *
 * This hook provides functions for:
 * 1. Large dataset management
 * 2. Memory usage monitoring
 * 3. Garbage collection hinting
 * 4. Component recycling
 */
export const useMemoryOptimization = (options = {}) => {
  const {
    threshold = 0.8, // Memory threshold before optimization (80% by default)
    interval = 10000, // Check interval in ms
    autoOptimize = true, // Whether to auto-optimize
    datasetSize = 'medium', // 'small', 'medium', 'large', 'xlarge'
    debugMode = false, // Enable debug logs
  } = options;

  const [memoryUsage, setMemoryUsage] = useState(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const gcHintTimeout = useRef(null);
  const lastOptimizationTime = useRef(null);
  const objectCache = useRef(new Map());

  const log = useCallback(
    (message, data) => {
      if (debugMode) {
        console.log(`[MemoryOptimizer] ${message}`, data);
      }
    },
    [debugMode]
  );

  // Calculate chunk size based on dataset size
  const getChunkSize = useCallback(() => {
    switch (datasetSize) {
      case 'small':
        return 100;
      case 'medium':
        return 50;
      case 'large':
        return 25;
      case 'xlarge':
        return 10;
      default:
        return 50;
    }
  }, [datasetSize]);

  // Monitor memory usage if the API is available
  useEffect(() => {
    if (!window.performance || !window.performance.memory) {
      log('Performance.memory API not available, using limited memory monitoring');
      return () => {};
    }

    log('Performance.memory API available, setting up memory monitoring');

    const checkMemory = () => {
      const { usedJSHeapSize, totalJSHeapSize } = window.performance.memory;
      const ratio = usedJSHeapSize / totalJSHeapSize;

      setMemoryUsage({
        used: usedJSHeapSize,
        total: totalJSHeapSize,
        ratio,
      });

      log('Memory usage updated', { ratio, used: usedJSHeapSize, total: totalJSHeapSize });

      // Auto optimize if threshold exceeded
      if (autoOptimize && ratio > threshold && !isOptimizing) {
        optimizeMemory();
      }
    };

    const intervalId = setInterval(checkMemory, interval);
    checkMemory(); // Initial check

    return () => clearInterval(intervalId);
  }, [interval, threshold, autoOptimize, isOptimizing, log]);

  // Suggest garbage collection (doesn't directly trigger GC)
  const hintGarbageCollection = useCallback(() => {
    log('Hinting for garbage collection');

    // Clear any existing timeout
    if (gcHintTimeout.current) {
      clearTimeout(gcHintTimeout.current);
    }

    // Clear large object references if possible
    objectCache.current.clear();

    // Reset some large local references if any exist
    let largeArray = new Array(10000).fill(0);
    largeArray = null;

    // Schedule a future check to see if memory improved
    gcHintTimeout.current = setTimeout(() => {
      if (window.performance && window.performance.memory) {
        log('Post GC hint memory check', window.performance.memory);
      }
    }, 2000);

    return true;
  }, [log]);

  // Optimize memory usage
  const optimizeMemory = useCallback(() => {
    if (isOptimizing) return false;

    log('Starting memory optimization');
    setIsOptimizing(true);
    lastOptimizationTime.current = Date.now();

    // Run optimizations
    objectCache.current.clear();
    hintGarbageCollection();

    // Simulate image optimization
    const imageElements = document.querySelectorAll('img');
    imageElements.forEach(img => {
      if (!img.getAttribute('data-original-src') && img.src) {
        // Store original source only if not already stored
        img.setAttribute('data-original-src', img.src);

        // If image is offscreen, set to blank placeholder
        const rect = img.getBoundingClientRect();
        if (
          rect.bottom < 0 ||
          rect.top > window.innerHeight ||
          rect.right < 0 ||
          rect.left > window.innerWidth
        ) {
          img.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
          img.setAttribute('data-optimized', 'true');
        }
      }
    });

    // Finish optimization after a delay
    setTimeout(() => {
      setIsOptimizing(false);
      log('Memory optimization complete');
    }, 1000);

    return true;
  }, [isOptimizing, hintGarbageCollection, log]);

  // Process large arrays in chunks to avoid blocking the main thread
  const processInChunks = useCallback(
    (array, processFn, onComplete) => {
      if (!array || !array.length) {
        if (onComplete) onComplete([]);
        return;
      }

      const chunkSize = getChunkSize();
      const results = [];
      let index = 0;

      log(`Processing array of length ${array.length} in chunks of ${chunkSize}`);

      const processChunk = () => {
        const chunk = array.slice(index, index + chunkSize);

        // Process this chunk
        for (let i = 0; i < chunk.length; i++) {
          results.push(processFn(chunk[i], index + i));
        }

        index += chunkSize;

        if (index < array.length) {
          // Schedule next chunk
          setTimeout(processChunk, 0);
        } else {
          // All done
          if (onComplete) onComplete(results);
          log('Chunk processing complete', { resultsLength: results.length });
        }
      };

      // Start processing
      processChunk();
    },
    [getChunkSize, log]
  );

  // Memoize expensive objects
  const memoize = useCallback((key, createFn) => {
    if (objectCache.current.has(key)) {
      return objectCache.current.get(key);
    }

    const value = createFn();
    objectCache.current.set(key, value);
    return value;
  }, []);

  // Clear specific cached items
  const clearCache = useCallback(
    (keyPattern = null) => {
      if (keyPattern === null) {
        objectCache.current.clear();
        log('Cleared entire object cache');
        return true;
      }

      // Clear keys matching the pattern
      let count = 0;
      objectCache.current.forEach((value, key) => {
        if (
          (typeof keyPattern === 'string' && key.includes(keyPattern)) ||
          (keyPattern instanceof RegExp && keyPattern.test(key))
        ) {
          objectCache.current.delete(key);
          count++;
        }
      });

      log(`Cleared ${count} items from cache matching pattern`, keyPattern);
      return count > 0;
    },
    [log]
  );

  return {
    memoryUsage,
    isOptimizing,
    optimizeMemory,
    hintGarbageCollection,
    processInChunks,
    memoize,
    clearCache,
    lastOptimizationTime: lastOptimizationTime.current,
  };
};

export default useMemoryOptimization;
