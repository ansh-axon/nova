// Secure storage for the auth token.
//
// The JWT is a sensitive credential, so it is kept in the OS-level encrypted
// keystore (expo-secure-store: Keychain on iOS, Keystore-backed prefs on
// Android) instead of plain AsyncStorage.
//
// A one-time migration transparently moves any token that an existing install
// already has in AsyncStorage, so users are NOT logged out by this upgrade.
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'nova_auth_token';
const LEGACY_KEY = 'token';

export async function getToken(): Promise<string | null> {
  try {
    const secure = await SecureStore.getItemAsync(KEY);
    if (secure) return secure;
  } catch {
    // SecureStore unavailable (e.g. web) — fall back to AsyncStorage below.
  }

  // Migrate a legacy AsyncStorage token, if present.
  try {
    const legacy = await AsyncStorage.getItem(LEGACY_KEY);
    if (legacy) {
      await setToken(legacy);
      await AsyncStorage.removeItem(LEGACY_KEY);
      return legacy;
    }
  } catch {
    // ignore
  }
  return null;
}

export async function setToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, token);
    // Ensure no plaintext copy lingers in AsyncStorage.
    await AsyncStorage.removeItem(LEGACY_KEY).catch(() => {});
  } catch {
    // Last-resort fallback so auth still works where SecureStore is unavailable.
    await AsyncStorage.setItem(LEGACY_KEY, token);
  }
}

export async function deleteToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // ignore
  }
  await AsyncStorage.removeItem(LEGACY_KEY).catch(() => {});
}
