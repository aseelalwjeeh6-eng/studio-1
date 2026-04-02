/**
 * @fileOverview Universal caching utility for ASEEL Cinema.
 * Handles state persistence with versioning, TTL, and error boundaries.
 */

const APP_PREFIX = 'aseel_cache_';
const CACHE_VERSION = '1.2'; // Update this to invalidate all previous caches

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  version: string;
  ttl?: number;
}

export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
}

/**
 * Validates if the environment is browser and storage is accessible
 */
const isStorageAvailable = () => {
  if (typeof window === 'undefined') return false;
  try {
    const x = '__storage_test__';
    window.localStorage.setItem(x, x);
    window.localStorage.removeItem(x);
    return true;
  } catch (e) {
    return false;
  }
};

/**
 * Sets a value in the local cache with metadata.
 * OPTIMIZATION: Prevents redundant writes if data is unchanged.
 */
export function setCachedState<T>(roomId: string, key: string, value: T, options?: CacheOptions) {
  if (!isStorageAvailable()) return;
  try {
    const storageKey = `${APP_PREFIX}${roomId}_${key}`;
    const entry: CacheEntry<T> = {
      value,
      timestamp: Date.now(),
      version: CACHE_VERSION,
      ttl: options?.ttl,
    };
    
    const stringifiedEntry = JSON.stringify(entry);
    const existingRaw = window.localStorage.getItem(storageKey);
    
    // Performance Guard: Avoid writing to disk if the data is identical
    if (existingRaw === stringifiedEntry) return;
    
    window.localStorage.setItem(storageKey, stringifiedEntry);
  } catch (e) {
    console.warn('[Cache] Set failed:', e);
  }
}

/**
 * Retrieves a value from the local cache, validating version and TTL.
 */
export function getCachedState<T>(roomId: string, key: string, defaultValue: T): T {
  if (!isStorageAvailable()) return defaultValue;
  try {
    const storageKey = `${APP_PREFIX}${roomId}_${key}`;
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return defaultValue;

    const entry: CacheEntry<T> = JSON.parse(raw);

    // Validate version - if version mismatch, ignore cache
    if (entry.version !== CACHE_VERSION) {
      window.localStorage.removeItem(storageKey);
      return defaultValue;
    }

    // Validate TTL - if expired, remove and ignore
    if (entry.ttl && Date.now() - entry.timestamp > entry.ttl) {
      window.localStorage.removeItem(storageKey);
      return defaultValue;
    }

    return entry.value;
  } catch (e) {
    console.warn('[Cache] Get failed:', e);
    return defaultValue;
  }
}

/**
 * Clears specific room cache.
 */
export function clearRoomCache(roomId: string) {
  if (!isStorageAvailable()) return;
  try {
    const prefix = `${APP_PREFIX}${roomId}_`;
    Object.keys(window.localStorage).forEach((k) => {
      if (k.startsWith(prefix)) window.localStorage.removeItem(k);
    });
  } catch (e) {
    console.warn('[Cache] Clear failed:', e);
  }
}
