import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import nacl from 'tweetnacl';
import { decodeUTF8, encodeBase64 } from 'tweetnacl-util';
import { getToken } from './tokenStore';

// React Native does not provide window.crypto.getRandomValues by default, so
// tweetnacl's randomBytes throws "no PRNG". Wire it up to expo-crypto.
if (!(nacl as any).__novaPrngSet) {
  nacl.setPRNG((x: Uint8Array, n: number) => {
    const random = Crypto.getRandomBytes(n);
    for (let i = 0; i < n; i++) x[i] = random[i];
  });
  (nacl as any).__novaPrngSet = true;
}

// ── Document Locker ──────────────────────────────────────────────────────
// Files are stored DURABLY on the server (tied to the account, encrypted at
// rest) so they survive deleting the file from the phone, app reinstalls, and
// new devices. A local copy is cached for instant access; the server is the
// source of truth. The PIN remains a device-local access lock.

const LOCKER_DIR = FileSystem.documentDirectory + 'locker/';
const ITEMS_KEY = 'locker_items_v1';     // local cache of the file list (offline)
const PIN_KEY = 'locker_pin_v1';
const DEFAULT_SERVER = 'https://nova-server-wg9p.onrender.com';

export interface LockerItem {
  id: string;
  name: string;
  uri: string;        // local cached path (may be empty until downloaded)
  size: number;
  mimeType: string;
  addedAt: string;
}

interface PinRecord { salt: string; hash: string; }

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(LOCKER_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(LOCKER_DIR, { intermediates: true });
  }
}

async function getBaseUrl(): Promise<string> {
  const u = await AsyncStorage.getItem('serverUrl');
  return (u || DEFAULT_SERVER).replace(/\/$/, '');
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function safeFileName(name: string): string {
  return (name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function localPathFor(item: { id: string; name: string }): string {
  return `${LOCKER_DIR}${item.id}_${safeFileName(item.name)}`;
}

// ── PIN (device-local access lock) ──
function hashPin(pin: string, salt: string): string {
  return encodeBase64(nacl.hash(decodeUTF8(`${salt}:${pin}`)));
}

export async function hasPin(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(PIN_KEY);
  return !!raw;
}

export async function setPin(pin: string): Promise<void> {
  const salt = encodeBase64(nacl.randomBytes(16));
  const record: PinRecord = { salt, hash: hashPin(pin, salt) };
  await AsyncStorage.setItem(PIN_KEY, JSON.stringify(record));
}

export async function verifyPin(pin: string): Promise<boolean> {
  const raw = await AsyncStorage.getItem(PIN_KEY);
  if (!raw) return false;
  try {
    const record: PinRecord = JSON.parse(raw);
    return hashPin(pin, record.salt) === record.hash;
  } catch {
    return false;
  }
}

// ── Files (server-backed with local cache) ──
async function cacheList(items: LockerItem[]) {
  await AsyncStorage.setItem(ITEMS_KEY, JSON.stringify(items));
}

async function readCachedList(): Promise<LockerItem[]> {
  const raw = await AsyncStorage.getItem(ITEMS_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

/**
 * Lists the user's locker files from the server (source of truth). Falls back
 * to the locally cached list if the network is unavailable.
 */
export async function listItems(): Promise<LockerItem[]> {
  try {
    const base = await getBaseUrl();
    const res = await fetch(`${base}/api/locker`, { headers: await authHeaders() });
    if (!res.ok) throw new Error(`Locker list failed: ${res.status}`);
    const data: Array<{ id: string; name: string; size: number; mimeType: string; addedAt: string }> = await res.json();
    const items: LockerItem[] = data.map((f) => ({
      id: String(f.id),
      name: f.name,
      size: f.size || 0,
      mimeType: f.mimeType || 'application/octet-stream',
      addedAt: f.addedAt || new Date().toISOString(),
      uri: localPathFor({ id: String(f.id), name: f.name }),
    }));
    await cacheList(items);
    return items;
  } catch (e) {
    // Offline / server unreachable → show what we have cached.
    return readCachedList();
  }
}

/**
 * Uploads a picked file into the locker (stored durably on the server) and
 * caches a local copy for instant access.
 */
export async function addItem(file: { uri: string; name: string; size?: number; mimeType?: string }): Promise<LockerItem> {
  const base = await getBaseUrl();
  const mimeType = file.mimeType || 'application/octet-stream';

  const form = new FormData();
  form.append('file', { uri: file.uri, name: safeFileName(file.name), type: mimeType } as any);
  form.append('name', file.name);
  form.append('mimeType', mimeType);

  const res = await fetch(`${base}/api/locker`, {
    method: 'POST',
    headers: { ...(await authHeaders()) }, // let fetch set multipart boundary
    body: form,
  });
  if (!res.ok) {
    let msg = 'Upload failed';
    try { msg = (await res.json()).message || msg; } catch {}
    throw new Error(msg);
  }
  const meta: { id: string; name: string; size: number; mimeType: string; addedAt: string } = await res.json();

  const item: LockerItem = {
    id: String(meta.id),
    name: meta.name,
    size: meta.size || file.size || 0,
    mimeType: meta.mimeType || mimeType,
    addedAt: meta.addedAt || new Date().toISOString(),
    uri: localPathFor({ id: String(meta.id), name: meta.name }),
  };

  // Cache the local copy so opening is instant (best-effort).
  try {
    await ensureDir();
    await FileSystem.copyAsync({ from: file.uri, to: item.uri });
  } catch {}

  const items = await readCachedList();
  await cacheList([item, ...items.filter((i) => i.id !== item.id)]);
  return item;
}

/**
 * Ensures the file exists locally (downloading it from the server if needed)
 * and returns a local file:// URI suitable for opening/sharing.
 */
export async function ensureLocalFile(item: LockerItem): Promise<string> {
  await ensureDir();
  const dest = localPathFor(item);
  const info = await FileSystem.getInfoAsync(dest);
  if (info.exists && (info as any).size > 0) return dest;

  const base = await getBaseUrl();
  const token = await getToken();
  const result = await FileSystem.downloadAsync(`${base}/api/locker/${item.id}`, dest, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (result.status !== 200) {
    try { await FileSystem.deleteAsync(dest, { idempotent: true }); } catch {}
    throw new Error('Could not download file');
  }
  return dest;
}

export async function removeItem(id: string): Promise<void> {
  const base = await getBaseUrl();
  try {
    await fetch(`${base}/api/locker/${id}`, { method: 'DELETE', headers: await authHeaders() });
  } catch {}
  // Remove local cache + metadata regardless
  const items = await readCachedList();
  const target = items.find((i) => i.id === id);
  if (target?.uri) {
    try { await FileSystem.deleteAsync(target.uri, { idempotent: true }); } catch {}
  }
  await cacheList(items.filter((i) => i.id !== id));
}

export function formatSize(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
