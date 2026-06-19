import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Foreground behaviour: when the app is OPEN, the in-app call/message UI and
// tones already handle alerts, so we suppress the push banner + sound to avoid
// a double-ring (the push "calls" sound is ~18s and can't be stopped mid-way,
// which made it keep ringing even after a call was cut). When the app is in the
// background/closed this handler is NOT used — the OS plays the channel sound.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// Android requires explicit notification channels. We use NEW channel IDs (v2)
// so devices that already created the old default-sound channels pick up our
// custom NOVA sounds (Android never changes an existing channel's sound).
export const MESSAGE_CHANNEL_ID = 'messages-v2';
export const CALL_CHANNEL_ID = 'calls-v2';

export async function ensureAndroidChannels() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(MESSAGE_CHANNEL_ID, {
      name: 'Messages',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'notif_message.wav',
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#00ddff',
    });
    await Notifications.setNotificationChannelAsync(CALL_CHANNEL_ID, {
      name: 'Calls',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'ring_call.wav',
      vibrationPattern: [0, 1000, 800, 1000, 800, 1000, 800],
      lightColor: '#00ddff',
      bypassDnd: true,
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
