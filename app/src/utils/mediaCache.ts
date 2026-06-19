import * as FileSystem from 'expo-file-system';

// Simple on-device cache for remote media (status videos, etc.). The first time
// a file is seen it streams from the server (and is cached in the background);
// every later view plays from the local copy — instant and smooth, with no
// re-streaming from the (sometimes sleeping) server.

const CACHE_DIR = FileSystem.cacheDirectory + 'nova_media/';

function safeNameFromUrl(url: string): string {
  const base = (url.split('?')[0].split('/').pop() || `media_${Date.now()}`);
  return base.replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(CACHE_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
}

/** Returns the local cached path for a URL if it has already been downloaded, else null. */
export async function getCachedMedia(url: string): Promise<string | null> {
  try {
    if (!url || url.startsWith('file://')) return url || null;
    const path = CACHE_DIR + safeNameFromUrl(url);
    const info = await FileSystem.getInfoAsync(path);
    return info.exists ? path : null;
  } catch {
    return null;
  }
}

/** Downloads a URL into the cache (if not already present) and returns the local path. */
export async function cacheMedia(url: string): Promise<string | null> {
  try {
    if (!url || url.startsWith('file://')) return url || null;
    const path = CACHE_DIR + safeNameFromUrl(url);
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) return path;
    await ensureDir();
    const res = await FileSystem.downloadAsync(url, path);
    if (!res || (res.status && res.status >= 400)) return null;
    return path;
  } catch {
    return null;
  }
}
