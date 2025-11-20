/**
 * Cache Manager
 *
 * This module provides caching functionality for API responses and processed data.
 * It helps reduce API calls to external services and improves performance.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get directory name for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
const CACHE_DIR = path.join(__dirname, '..', 'data', 'cache');

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    console.log(`Created cache directory: ${CACHE_DIR}`);
  } catch (err) {
    console.error(`Failed to create cache directory: ${err.message}`);
  }
}

/**
 * Create a cache manager for a specific data source
 *
 * @param {string} sourceName The name of the data source (e.g., 'fda_maude', 'fda_faers')
 * @returns {Object} Cache manager methods
 */
export function createCache(sourceName) {
  const cacheDir = path.join(CACHE_DIR, sourceName);

  // Ensure source-specific cache directory exists
  if (!fs.existsSync(cacheDir)) {
    try {
      fs.mkdirSync(cacheDir, { recursive: true });
    } catch (err) {
      console.error(`Failed to create source cache directory ${cacheDir}: ${err.message}`);
    }
  }

  /**
   * Gets the path for a cache file
   *
   * @param {string} key The cache key
   * @returns {string} The full path to the cache file
   */
  function getCacheFilePath(key) {
    // Sanitize key to ensure it's a valid filename
    const sanitizedKey = key.replace(/[^a-z0-9_\-]/gi, '_').toLowerCase();
    return path.join(cacheDir, `${sanitizedKey}.json`);
  }

  /**
   * Save data to cache with expiry time
   *
   * @param {string} key The cache key
   * @param {Object} data The data to cache
   * @param {number} expirySeconds Expiry time in seconds
   * @returns {Promise<boolean>} Success indicator
   */
  async function saveToCacheWithExpiry(key, data, expirySeconds = 3600) {
    try {
      const filePath = getCacheFilePath(key);
      const cacheData = {
        timestamp: Date.now(),
        expiry: Date.now() + expirySeconds * 1000,
        data: data,
      };

      await fs.promises.writeFile(filePath, JSON.stringify(cacheData, null, 2));
      return true;
    } catch (err) {
      console.error(`Failed to save to cache: ${err.message}`);
      return false;
    }
  }

  /**
   * Check if cached data is valid (exists and not expired)
   *
   * @param {string} key The cache key
   * @returns {Promise<boolean>} Validity indicator
   */
  async function isCacheValid(key) {
    try {
      const filePath = getCacheFilePath(key);

      // Check if cache file exists
      if (!fs.existsSync(filePath)) {
        return false;
      }

      // Read cache file
      const cacheData = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));

      // Check if cache has expired
      if (cacheData.expiry < Date.now()) {
        return false;
      }

      return true;
    } catch (err) {
      console.error(`Cache validation error: ${err.message}`);
      return false;
    }
  }

  /**
   * Get cached data if valid, otherwise returns null
   *
   * @param {string} key The cache key
   * @returns {Promise<Object|null>} The cached data or null if invalid
   */
  async function getCachedData(key) {
    try {
      if (await isCacheValid(key)) {
        const filePath = getCacheFilePath(key);
        return JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
      }
      return null;
    } catch (err) {
      console.error(`Failed to get cached data: ${err.message}`);
      return null;
    }
  }

  /**
   * Clear expired caches from a specific source
   *
   * @returns {Promise<number>} Number of expired cache files removed
   */
  async function clearExpiredCache() {
    try {
      let removedCount = 0;
      const files = await fs.promises.readdir(cacheDir);

      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(cacheDir, file);

          try {
            const cacheData = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));

            // Remove if expired
            if (cacheData.expiry < Date.now()) {
              await fs.promises.unlink(filePath);
              removedCount++;
            }
          } catch (error) {
            // Ignore invalid JSON files
            console.error(`Invalid cache file: ${filePath}`);
          }
        }
      }

      return removedCount;
    } catch (err) {
      console.error(`Error clearing expired cache: ${err.message}`);
      return 0;
    }
  }

  /**
   * Clear all cache files for a specific source
   *
   * @returns {Promise<number>} Number of cache files removed
   */
  async function clearAllCache() {
    try {
      let removedCount = 0;
      const files = await fs.promises.readdir(cacheDir);

      for (const file of files) {
        if (file.endsWith('.json')) {
          await fs.promises.unlink(path.join(cacheDir, file));
          removedCount++;
        }
      }

      return removedCount;
    } catch (err) {
      console.error(`Error clearing all cache: ${err.message}`);
      return 0;
    }
  }

  // Return available cache methods
  return {
    saveToCacheWithExpiry,
    isCacheValid,
    getCachedData,
    clearExpiredCache,
    clearAllCache,
  };
}

/**
 * Clear expired caches across all sources
 *
 * @returns {Promise<number>} Number of expired cache files removed
 */
export async function clearAllExpiredCaches() {
  try {
    let totalRemoved = 0;

    if (fs.existsSync(CACHE_DIR)) {
      const sources = await fs.promises.readdir(CACHE_DIR);

      for (const source of sources) {
        const sourceCache = createCache(source);
        const removed = await sourceCache.clearExpiredCache();
        totalRemoved += removed;
      }
    }

    console.log(`Cleared ${totalRemoved} expired cache files`);
    return totalRemoved;
  } catch (err) {
    console.error(`Error clearing all expired caches: ${err.message}`);
    return 0;
  }
}

export default {
  createCache,
  clearAllExpiredCaches,
};
