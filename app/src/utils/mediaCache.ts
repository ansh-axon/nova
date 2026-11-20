import * as FileSystem from 'expo-file-system';

// Simple on-device cache for remote media (status videos, etc.). The first time
// a file is seen it streams from the server (and is cached in the background);
// every later view plays from the local copy — instant and smooth, with no
// re-streaming from the (sometimes sleeping) server.

const CACHE_DIR = FileSystem.cacheDirectory + 'nova_media/';

// Module-level in-memory cache to synchronously know if a file is already downloaded
const memoryCache: Record<string, string> = {};

export function safeNameFromUrl(url: string): string {
  const base = (url.split('?')[0].split('/').pop() || `media_${Date.now()}`);
  return base.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(CACHE_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
}

/** Synchronous check if media is already mapped to a local file in memory */
export function getSyncCachedMedia(url: string): string | null {
  if (!url) return null;
  if (url.startsWith('file://')) return url;
  return memoryCache[url] || null;
}

/** Copies a local file into cache keyed by the remote URL so the sender plays from local disk immediately. */
export async function saveLocalMediaCopy(remoteUrl: string, localFilePath: string): Promise<string | null> {
  try {
    if (!remoteUrl || !localFilePath) return null;
    await ensureDir();
    const dest = CACHE_DIR + safeNameFromUrl(remoteUrl);
    const info = await FileSystem.getInfoAsync(dest);
    if (!info.exists) {
      await FileSystem.copyAsync({ from: localFilePath, to: dest });
    }
    memoryCache[remoteUrl] = dest;
    return dest;
  } catch (e) {
    console.warn('saveLocalMediaCopy error:', e);
    return null;
  }
}

/** Returns the local cached path for a URL if it has already been downloaded, else null. */
export async function getCachedMedia(url: string): Promise<string | null> {
  try {
    if (!url || url.startsWith('file://')) return url || null;
    if (memoryCache[url]) return memoryCache[url];
    const path = CACHE_DIR + safeNameFromUrl(url);
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) {
      memoryCache[url] = path;
      return path;
    }
    return null;
  } catch {
    return null;
  }
}

/** Downloads a URL into the cache (if not already present) and returns the local path. */
export async function cacheMedia(url: string): Promise<string | null> {
  try {
    if (!url || url.startsWith('file://')) return url || null;
    if (memoryCache[url]) return memoryCache[url];
    const path = CACHE_DIR + safeNameFromUrl(url);
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) {
      memoryCache[url] = path;
      return path;
    }
    await ensureDir();
    const res = await FileSystem.downloadAsync(url, path);
    if (!res || (res.status && res.status >= 400)) return null;
    memoryCache[url] = path;
    return path;
  } catch {
    return null;
  }
}
