import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, AndroidCategory, AndroidVisibility, EventType } from '@notifee/react-native';
import { Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getToken } from './tokenStore';

const APP_PACKAGE = 'com.rahulverma.nova';
const DEFAULT_SERVER = 'https://nova-server-wg9p.onrender.com';

// Reads the configured server URL (falls back to the production default) so the
// background handler can reach the API even when the app is fully closed.
async function getServerBaseUrl(): Promise<string> {
  try {
    const u = await AsyncStorage.getItem('serverUrl');
    if (u) return u.replace(/\/$/, '');
  } catch (e) {}
  return DEFAULT_SERVER;
}

// Sends an authenticated PUT to the server from the (possibly headless)
// background context — used to reject a call directly from the notification
// action so the caller stops ringing even if the app never opens.
async function putToServer(path: string): Promise<void> {
  try {
    const token = await getToken();
    if (!token) return;
    const base = await getServerBaseUrl();
    await fetch(`${base}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    });
  } catch (e) { /* best-effort */ }
}

// Incoming-call experience for when the app is backgrounded/closed:
// the server sends a high-priority FCM DATA message → the background handler
// here shows a full-screen call notification (via notifee) with Accept/Reject
// and a looping ringtone. Accept opens the app; Reject calls the server.

// NOTE: bump this id whenever the channel's sound/importance changes — Android
// channels are immutable once created, so a new id forces the new settings.
const CALL_CHANNEL = 'nova_incoming_call_v3';
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
    bypassDnd: true,
  });
  // Silent channel used to REPLACE (clear) the ringing call notification when a
  // call is cut/missed — stops the ring and shows a quiet "Missed call".
  await notifee.createChannel({
    id: 'nova_call_cancel',
    name: 'Call Updates',
    importance: AndroidImportance.LOW,
    vibration: false,
  });
  // Channel for chat message notifications (lock-screen / app-closed alerts).
  await notifee.createChannel({
    id: 'nova_message',
    name: 'Messages',
    importance: AndroidImportance.HIGH,
    sound: 'notif_message',
    vibration: true,
  });
}

// Built-in tones bundled as notification (res/raw) sounds. The lock-screen /
// closed-app call ring uses a notification CHANNEL sound, which Android freezes
// at creation time — so each selectable ringtone needs its own channel.
export const CALL_TONE_IDS = [
  'pulse', 'chime', 'ripple', 'glow', 'aurora',
  'marimba', 'classic', 'bright', 'bubble', 'cool', 'melody', 'romantic',
];

// Returns the notification channel id whose sound matches the chosen ringtone
// (falls back to the default ring_call channel).
export function callChannelIdForTone(toneId?: string | null): string {
  if (toneId && CALL_TONE_IDS.indexOf(toneId) >= 0) return 'nova_call_' + toneId;
  return CALL_CHANNEL;
}

// Creates (once) the per-tone incoming-call channel so its sound rings on the
// lock screen. No-op for unknown ids.
export async function ensureToneCallChannel(toneId: string): Promise<string> {
  if (Platform.OS !== 'android' || CALL_TONE_IDS.indexOf(toneId) < 0) return CALL_CHANNEL;
  const id = 'nova_call_' + toneId;
  await notifee.createChannel({
    id,
    name: 'Incoming Calls (' + toneId + ')',
    importance: AndroidImportance.HIGH,
    sound: toneId,
    vibration: true,
    vibrationPattern: [400, 1000, 400, 1000],
    bypassDnd: true,
  });
  return id;
}

// Persisted id of the user's chosen call ringtone (so it can be re-applied and
// re-uploaded to the server on every app start).
const CALL_RINGTONE_KEY = 'call_ringtone_id_v1';
export async function setSelectedCallRingtone(id: string): Promise<void> {
  try { await AsyncStorage.setItem(CALL_RINGTONE_KEY, id); } catch (e) {}
}
export async function getSelectedCallRingtone(): Promise<string | null> {
  try { return await AsyncStorage.getItem(CALL_RINGTONE_KEY); } catch (e) { return null; }
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
    // Ring with the user's chosen tone via its dedicated channel (if any).
    let channelId = CALL_CHANNEL;
    try {
      const toneId = await getSelectedCallRingtone();
      if (toneId) channelId = await ensureToneCallChannel(toneId);
    } catch (e) {}
    await notifee.displayNotification({
      id: CALL_NOTIF_ID,
      title: `Incoming ${data.callType === 'video' ? 'video' : 'voice'} call`,
      body: `${data.callerName || 'Someone'} is calling you on NOVA`,
      data: data || {},
      android: {
        channelId,
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

// Opens the Android 14+ "Full screen notifications" permission screen for NOVA,
// needed so incoming calls take over the lock screen (instead of a heads-up).
export async function openFullScreenIntentSettings(): Promise<void> {
  try {
    if (Platform.OS !== 'android') return;
    await IntentLauncher.startActivityAsync(
      'android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT',
      { data: 'package:' + APP_PACKAGE }
    );
  } catch (e) { /* not present on this Android version */ }
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
    const data = detail?.notification?.data || {};
    const callId = data.callId as string | undefined;
    if (type === EventType.ACTION_PRESS && pressId === 'reject') {
      // Reject immediately on the server so the caller stops ringing, even
      // though tapping Reject does NOT open the app.
      await cancelIncomingCall();
      await clearPendingCall();
      if (callId) await putToServer(`/api/calls/${callId}/reject`);
    } else if (type === EventType.ACTION_PRESS && pressId === 'accept') {
      // Accept needs the foreground app for the WebRTC handshake: store the
      // intent and let reconcilePendingCall() finish once the app opens
      // (the action's launchActivity brings the app to the foreground).
      await cancelIncomingCall();
      await setPendingCall({ ...data, _action: 'accept' });
    } else if (type === EventType.PRESS) {
      await cancelIncomingCall();
    }
  });
}
