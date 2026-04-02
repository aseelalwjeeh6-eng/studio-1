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
 * Sets a value in the local cache with metadata.
 */
export function setCachedState<T>(roomId: string, key: string, value: T, options?: CacheOptions) {
  if (typeof window === 'undefined') return;
  try {
    const storageKey = `${APP_PREFIX}${roomId}_${key}`;
    const entry: CacheEntry<T> = {
      value,
      timestamp: Date.now(),
      version: CACHE_VERSION,
      ttl: options?.ttl,
    };
    localStorage.setItem(storageKey, JSON.stringify(entry));
  } catch (e) {
    // Fail silently to avoid interrupting app flow
    console.warn('Cache write error:', e);
  }
}

/**
 * Retrieves a value from the local cache, validating version and TTL.
 */
export function getCachedState<T>(roomId: string, key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const storageKey = `${APP_PREFIX}${roomId}_${key}`;
    const raw = localStorage.getItem(storageKey);
    if (!raw) return defaultValue;

    const entry: CacheEntry<T> = JSON.parse(raw);

    // Validate version - if version mismatch, ignore cache
    if (entry.version !== CACHE_VERSION) return defaultValue;

    // Validate TTL - if expired, remove and ignore
    if (entry.ttl && Date.now() - entry.timestamp > entry.ttl) {
      localStorage.removeItem(storageKey);
      return defaultValue;
    }

    return entry.value;
  } catch (e) {
    return defaultValue;
  }
}

/**
 * Clears specific room cache.
 */
export function clearRoomCache(roomId: string) {
  if (typeof window === 'undefined') return;
  try {
    const prefix = `${APP_PREFIX}${roomId}_`;
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith(prefix)) localStorage.removeItem(k);
    });
  } catch (e) {}
}
