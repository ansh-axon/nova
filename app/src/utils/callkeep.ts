import RNCallKeep from 'react-native-callkeep';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─────────────────────────────────────────────────────────────────────────
// CallKeep gives a SYSTEM-managed incoming call (Android self-managed
// ConnectionService). The OS shows a real call screen and rings — and crucially
// STOPS the ring the instant we call endCall(). That's the "discipline" the
// notification-sound approach could never guarantee (Android plays a channel
// sound to completion and replacing the notification doesn't stop it).
//
// We use the server's `callRoomId` (already a UUID v4) as the CallKeep call
// UUID, so the foreground app, the background FCM handler and the cancel signal
// all reference the same call without extra bookkeeping.
// ─────────────────────────────────────────────────────────────────────────

let isSetup = false;

const PENDING_ANSWER_KEY = 'callkeep_pending_answer_v1';

export async function setupCallKeep(): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (isSetup) return;
  try {
    await RNCallKeep.setup({
      ios: {
        appName: 'NOVA',
      },
      android: {
        alertTitle: 'Permissions required',
        alertDescription: 'NOVA needs access to show incoming calls',
        cancelButton: 'Cancel',
        okButton: 'OK',
        // Self-managed: NOVA owns the call experience (no SIM/telephony needed).
        selfManaged: true,
        // Foreground service keeps the call alive/ringing reliably.
        foregroundService: {
          channelId: 'com.rahulverma.nova.callkeep',
          channelName: 'NOVA Calls',
          notificationTitle: 'NOVA is running a call',
        },
        additionalPermissions: [],
      },
    });
    RNCallKeep.setAvailable(true);
    RNCallKeep.canMakeMultipleCalls(false);
    isSetup = true;
  } catch (e) {
    // best-effort — never break the call flow
  }
}

// Shows the native incoming-call UI and starts the system ring. `callRoomId`
// MUST be a UUID (the server's callRoomId is one).
export async function displayIncomingCallKeep(
  callRoomId: string,
  callerName: string,
  meta?: { callId?: string; callType?: string; callerId?: string; conversationId?: string }
): Promise<void> {
  if (Platform.OS !== 'android' || !callRoomId) return;
  try {
    await setupCallKeep();
    // Remember which call this UUID maps to, so when the user answers from the
    // native screen (even after the app was killed) we can accept the right call.
    await AsyncStorage.setItem(
      PENDING_ANSWER_KEY,
      JSON.stringify({ callRoomId, ...(meta || {}) })
    );
    RNCallKeep.displayIncomingCall(
      callRoomId,
      callerName || 'NOVA',
      callerName || 'NOVA',
      'generic',
      false // voice only
    );
  } catch (e) { /* best-effort */ }
}

// Ends the native call session → STOPS the ring immediately. Called when the
// caller cuts, when the receiver rejects, or when the call truly ends.
export function endCallKeep(callRoomId?: string): void {
  if (Platform.OS !== 'android') return;
  try {
    if (callRoomId) RNCallKeep.endCall(callRoomId);
    else RNCallKeep.endAllCalls();
  } catch (e) { /* best-effort */ }
}

export function endAllCallKeep(): void {
  if (Platform.OS !== 'android') return;
  try { RNCallKeep.endAllCalls(); } catch (e) {}
}

// Tells the OS the call is now connected (stops ring, starts the in-call state).
export function setCallKeepConnected(callRoomId: string): void {
  if (Platform.OS !== 'android' || !callRoomId) return;
  try {
    RNCallKeep.setCurrentCallActive(callRoomId);
    RNCallKeep.backToForeground();
  } catch (e) {}
}

export async function getPendingAnswer(): Promise<any | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_ANSWER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

export async function clearPendingAnswer(): Promise<void> {
  try { await AsyncStorage.removeItem(PENDING_ANSWER_KEY); } catch (e) {}
}

type Handlers = {
  onAnswer: (callRoomId: string) => void;
  onEnd: (callRoomId: string) => void;
};

let listenersAttached = false;

// Wires the native call buttons to NOVA's accept/reject logic. Safe to call
// multiple times (listeners are attached once).
export function registerCallKeepHandlers(handlers: Handlers): () => void {
  if (Platform.OS !== 'android') return () => {};
  // Always keep the latest handlers.
  currentHandlers = handlers;
  if (listenersAttached) return () => {};
  listenersAttached = true;

  RNCallKeep.addEventListener('answerCall', ({ callUUID }: any) => {
    try { RNCallKeep.setCurrentCallActive(callUUID); } catch (e) {}
    currentHandlers?.onAnswer(callUUID);
  });
  RNCallKeep.addEventListener('endCall', ({ callUUID }: any) => {
    currentHandlers?.onEnd(callUUID);
  });

  return () => {
    try {
      RNCallKeep.removeEventListener('answerCall');
      RNCallKeep.removeEventListener('endCall');
    } catch (e) {}
    listenersAttached = false;
  };
}

let currentHandlers: Handlers | null = null;
