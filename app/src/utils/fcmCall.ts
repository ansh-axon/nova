import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, AndroidCategory, AndroidVisibility, EventType } from '@notifee/react-native';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Incoming-call experience for when the app is backgrounded/closed:
// the server sends a high-priority FCM DATA message → the background handler
// here shows a full-screen call notification (via notifee) with Accept/Reject
// and a looping ringtone. Accept opens the app; Reject calls the server.

const CALL_CHANNEL = 'nova_incoming_call';
const CALL_NOTIF_ID = 'nova_incoming_call_notif';

// Stores the pending call so the app, once opened, can act on Accept.
const PENDING_CALL_KEY = 'pending_incoming_call_v1';

export async function ensureCallChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await notifee.createChannel({
    id: CALL_CHANNEL,
    name: 'Incoming Calls',
    importance: AndroidImportance.HIGH,
    sound: 'ring_call',
    vibration: true,
    vibrationPattern: [0, 1000, 800, 1000, 800, 1000],
  });
}

// Asks for notification permission and returns the device FCM token (or null).
export async function registerForFcm(): Promise<string | null> {
  try {
    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;
    if (!enabled) return null;
    await ensureCallChannel();
    const token = await messaging().getToken();
    return token || null;
  } catch (e) {
    console.warn('[FCM] registerForFcm failed:', (e as any)?.message || e);
    return null;
  }
}

// Shows the full-screen incoming-call notification.
export async function displayIncomingCall(data: any): Promise<void> {
  try {
    await ensureCallChannel();
    await notifee.displayNotification({
      id: CALL_NOTIF_ID,
      title: `Incoming ${data.callType === 'video' ? 'video' : 'voice'} call`,
      body: `${data.callerName || 'Someone'} is calling you on NOVA`,
      data: data || {},
      android: {
        channelId: CALL_CHANNEL,
        importance: AndroidImportance.HIGH,
        category: AndroidCategory.CALL,
        visibility: AndroidVisibility.PUBLIC,
        ongoing: true,
        autoCancel: false,
        loopSound: true,
        fullScreenAction: { id: 'default', launchActivity: 'default' },
        pressAction: { id: 'default', launchActivity: 'default' },
        actions: [
          { title: 'Reject', pressAction: { id: 'reject' } },
          { title: 'Accept', pressAction: { id: 'accept', launchActivity: 'default' } },
        ],
        timeoutAfter: 35000, // auto-dismiss if unanswered (~matches 30s reject)
      },
    });
  } catch (e) {
    console.warn('[FCM] displayIncomingCall failed:', (e as any)?.message || e);
  }
}

export async function cancelIncomingCall(): Promise<void> {
  try {
    await notifee.cancelNotification(CALL_NOTIF_ID);
  } catch (e) { /* ignore */ }
}

export async function setPendingCall(data: any): Promise<void> {
  try { await AsyncStorage.setItem(PENDING_CALL_KEY, JSON.stringify(data || {})); } catch (e) {}
}
export async function getPendingCall(): Promise<any | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_CALL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
export async function clearPendingCall(): Promise<void> {
  try { await AsyncStorage.removeItem(PENDING_CALL_KEY); } catch (e) {}
}

// Handles an incoming FCM DATA message (works in background/killed state).
export async function handleFcmDataMessage(remoteMessage: any): Promise<void> {
  const data = remoteMessage?.data || {};
  if (data.type === 'incoming_call') {
    await setPendingCall(data);
    await displayIncomingCall(data);
  } else if (data.type === 'cancel_call') {
    await cancelIncomingCall();
    await clearPendingCall();
  }
}

// Registers the background handlers. MUST run at module load (top level), once.
let registered = false;
export function registerCallBackgroundHandlers(): void {
  if (registered) return;
  registered = true;

  // FCM data messages while the app is in the background or killed.
  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    await handleFcmDataMessage(remoteMessage);
  });

  // Notifee action presses (Accept/Reject) while in the background.
  notifee.onBackgroundEvent(async ({ type, detail }) => {
    const pressId = detail?.pressAction?.id;
    if (type === EventType.ACTION_PRESS && pressId === 'reject') {
      // Reject in the background: mark intent; app/server reconcile via socket.
      await cancelIncomingCall();
      await setPendingCall({ ...(detail?.notification?.data || {}), _action: 'reject' });
    } else if (type === EventType.ACTION_PRESS && pressId === 'accept') {
      await cancelIncomingCall();
      await setPendingCall({ ...(detail?.notification?.data || {}), _action: 'accept' });
    } else if (type === EventType.PRESS) {
      await cancelIncomingCall();
    }
  });
}
