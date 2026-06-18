import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import nacl from 'tweetnacl';
import util from 'tweetnacl-util';

// On-device document locker. Files are copied into the app's PRIVATE sandbox
// directory (not visible to other apps / gallery) and metadata + a hashed PIN
// are kept in AsyncStorage. Nothing is uploaded to any server — zero storage cost
// and maximum privacy.

const LOCKER_DIR = FileSystem.documentDirectory + 'locker/';
const ITEMS_KEY = 'locker_items_v1';
const PIN_KEY = 'locker_pin_v1';

export interface LockerItem {
  id: string;
  name: string;
  uri: string;
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

function hashPin(pin: string, salt: string): string {
  return util.encodeBase64(nacl.hash(util.decodeUTF8(`${salt}:${pin}`)));
}

export async function hasPin(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(PIN_KEY);
  return !!raw;
}

export async function setPin(pin: string): Promise<void> {
  const salt = util.encodeBase64(nacl.randomBytes(16));
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

export async function listItems(): Promise<LockerItem[]> {
  const raw = await AsyncStorage.getItem(ITEMS_KEY);
  if (!raw) return [];
  try {
    const items: LockerItem[] = JSON.parse(raw);
    return items.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
  } catch {
    return [];
  }
}

async function saveItems(items: LockerItem[]) {
  await AsyncStorage.setItem(ITEMS_KEY, JSON.stringify(items));
}

/**
 * Copies a picked file into the private locker directory and records metadata.
 */
export async function addItem(file: { uri: string; name: string; size?: number; mimeType?: string }): Promise<LockerItem> {
  await ensureDir();
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const dest = `${LOCKER_DIR}${id}_${safeName}`;
  await FileSystem.copyAsync({ from: file.uri, to: dest });

  let size = file.size || 0;
  if (!size) {
    const info = await FileSystem.getInfoAsync(dest);
    size = (info.exists && (info as any).size) || 0;
  }

  const item: LockerItem = {
    id,
    name: file.name,
    uri: dest,
    size,
    mimeType: file.mimeType || 'application/octet-stream',
    addedAt: new Date().toISOString(),
  };

  const items = await listItems();
  await saveItems([item, ...items]);
  return item;
}

export async function removeItem(id: string): Promise<void> {
  const items = await listItems();
  const target = items.find((i) => i.id === id);
  if (target) {
    try { await FileSystem.deleteAsync(target.uri, { idempotent: true }); } catch {}
  }
  await saveItems(items.filter((i) => i.id !== id));
}

export function formatSize(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
