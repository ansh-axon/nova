import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Foreground behaviour: still show a heads-up banner + play sound while the app
// is open (Android shows it in the tray; iOS shows the banner).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Android requires explicit notification channels. We make a high-importance
// channel for messages and a max-importance one for calls.
export async function ensureAndroidChannels() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#00ddff',
    });
    await Notifications.setNotificationChannelAsync('calls', {
      name: 'Calls',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 500, 500],
      lightColor: '#00ddff',
    });
  } catch (e) {
    console.warn('[PUSH] channel setup failed:', e);
  }
}

function getProjectId(): string | undefined {
  return (
    (Constants?.expoConfig as any)?.extra?.eas?.projectId ||
    (Constants as any)?.easConfig?.projectId
  );
}

/**
 * Requests notification permission and returns the Expo push token, or null if
 * unavailable (simulator, denied permission, or FCM not configured). Never throws.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  try {
    if (!Device.isDevice) return null; // push only works on physical devices

    await ensureAndroidChannels();

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;

    const projectId = getProjectId();
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined as any
    );
    return tokenResponse.data || null;
  } catch (e) {
    // Common on standalone builds before FCM credentials are configured —
    // we simply skip push registration without crashing.
    console.warn('[PUSH] registration skipped:', (e as any)?.message || e);
    return null;
  }
}
