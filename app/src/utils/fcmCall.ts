import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, AndroidCategory, AndroidVisibility, EventType } from '@notifee/react-native';
import { Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import AsyncStorage from '@react-native-async-storage/async-storage';

const APP_PACKAGE = 'com.rahulverma.nova';

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
    vibrationPattern: [400, 1000, 400, 1000],
  });
}

// Asks for notification permission and returns the device FCM token (or null),
// along with a short diagnostic string describing each step's outcome (so the
// failure point is visible in server logs without needing device logcat).
export type FcmRegisterResult = { token: string | null; detail: string };

export async function registerForFcm(): Promise<FcmRegisterResult> {
  const steps: string[] = [];
  try {
    if (Platform.OS === 'android') {
      try {
        const p = await notifee.requestPermission();
        steps.push('perm=' + String((p as any)?.authorizationStatus));
      } catch (e: any) { steps.push('permErr=' + (e?.message || e)); }

      try { await ensureCallChannel(); steps.push('channel=ok'); }
      catch (e: any) { steps.push('channelErr=' + (e?.message || e)); }

      try { await messaging().registerDeviceForRemoteMessages(); steps.push('reg=ok'); }
      catch (e: any) { steps.push('regErr=' + (e?.message || e)); }

      try {
        const token = await messaging().getToken();
        steps.push('token=' + (token ? '…' + token.slice(-8) : 'EMPTY'));
        return { token: token || null, detail: steps.join('|') };
      } catch (e: any) {
        steps.push('getTokenErr=' + (e?.message || e));
        return { token: null, detail: steps.join('|') };
      }
    }

    // iOS: a granted permission is required before a token is issued.
    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;
    steps.push('iosPerm=' + String(authStatus));
    if (!enabled) return { token: null, detail: steps.join('|') };
    await messaging().registerDeviceForRemoteMessages();
    const token = await messaging().getToken();
    steps.push('token=' + (token ? '…' + token.slice(-8) : 'EMPTY'));
    return { token: token || null, detail: steps.join('|') };
  } catch (e: any) {
    steps.push('fatal=' + (e?.message || e));
    return { token: null, detail: steps.join('|') };
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

// ── Background-delivery readiness (for app-killed incoming calls) ──
// On aggressive OEM ROMs (Infinix/Transsion, Oppo/ColorOS, Xiaomi/MIUI, etc.)
// a swiped-away app is force-stopped and stops receiving FCM data messages.
// Exempting the app from battery optimization (and enabling Autostart) lets the
// incoming-call message wake the app even when it's closed.
export async function isBatteryOptimized(): Promise<boolean> {
  try {
    if (Platform.OS !== 'android') return false;
    return await notifee.isBatteryOptimizationEnabled();
  } catch (e) { return false; }
}

export async function openBatteryOptimizationSettings(): Promise<void> {
  try { await notifee.openBatteryOptimizationSettings(); } catch (e) {}
}

export async function openPowerManagerSettings(): Promise<void> {
  try { await notifee.openPowerManagerSettings(); } catch (e) {}
}

// Fires the system's ONE-TAP "Allow [app] to ignore battery optimisations?"
// dialog (Allow / Deny) instead of making the user dig through Settings.
// Requires the REQUEST_IGNORE_BATTERY_OPTIMIZATIONS permission in the manifest.
// Returns true if the dialog could be launched.
export async function requestIgnoreBatteryOptimizations(): Promise<boolean> {
  try {
    if (Platform.OS !== 'android') return false;
    await IntentLauncher.startActivityAsync(
      'android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
      { data: 'package:' + APP_PACKAGE }
    );
    return true;
  } catch (e) {
    // Fallback: open the battery-optimisation list if the direct dialog fails.
    try { await notifee.openBatteryOptimizationSettings(); return true; } catch (e2) { return false; }
  }
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
