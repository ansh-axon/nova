import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Crypto from 'expo-crypto';
import nacl from 'tweetnacl';
import { decodeUTF8, encodeBase64 } from 'tweetnacl-util';

// Shared security gate used by BOTH App Lock and Hidden (Locked) Chats:
// a biometric (fingerprint/face) check with a 4-digit PIN fallback.

if (!(nacl as any).__novaPrngSet) {
  nacl.setPRNG((x: Uint8Array, n: number) => {
    const random = Crypto.getRandomBytes(n);
    for (let i = 0; i < n; i++) x[i] = random[i];
  });
  (nacl as any).__novaPrngSet = true;
}

const PIN_KEY = 'applock_pin_v1';            // hashed security PIN (shared)
const APPLOCK_ENABLED_KEY = 'applock_enabled_v1';
const LOCKED_CHATS_KEY = 'locked_chats_v1';

interface PinRecord { salt: string; hash: string; }

function hashPin(pin: string, salt: string): string {
  return encodeBase64(nacl.hash(decodeUTF8(`${salt}:${pin}`)));
}

// ── Shared security PIN ──
export async function hasSecurityPin(): Promise<boolean> {
  return !!(await AsyncStorage.getItem(PIN_KEY));
}

export async function setSecurityPin(pin: string): Promise<void> {
  const salt = encodeBase64(nacl.randomBytes(16));
  const record: PinRecord = { salt, hash: hashPin(pin, salt) };
  await AsyncStorage.setItem(PIN_KEY, JSON.stringify(record));
}

export async function verifySecurityPin(pin: string): Promise<boolean> {
  const raw = await AsyncStorage.getItem(PIN_KEY);
  if (!raw) return false;
  try {
    const record: PinRecord = JSON.parse(raw);
    return hashPin(pin, record.salt) === record.hash;
  } catch {
    return false;
  }
}

// ── Biometric ──
export async function isBiometricAvailable(): Promise<boolean> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return hasHardware && enrolled;
  } catch {
    return false;
  }
}

/** Prompts the device biometric. Returns true on success. */
export async function authenticateBiometric(prompt = 'Unlock NOVA'): Promise<boolean> {
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: prompt,
      fallbackLabel: 'Use PIN',
      disableDeviceFallback: true, // we provide our own PIN fallback UI
    });
    return res.success;
  } catch {
    return false;
  }
}

// ── App Lock enabled flag ──
export async function isAppLockEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(APPLOCK_ENABLED_KEY)) === 'true';
}

export async function setAppLockEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(APPLOCK_ENABLED_KEY, enabled ? 'true' : 'false');
}

// ── Locked (hidden) chats ──
export async function getLockedChats(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(LOCKED_CHATS_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export async function setLockedChats(ids: string[]): Promise<void> {
  await AsyncStorage.setItem(LOCKED_CHATS_KEY, JSON.stringify(Array.from(new Set(ids))));
}
