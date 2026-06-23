// Sends native FCM DATA messages via firebase-admin. Used for incoming-call
// alerts that must wake the app even when it is fully closed (a data-only,
// high-priority message triggers the client's background handler, which then
// shows a full-screen call screen via notifee).
//
// Configure on the server with the Firebase service-account JSON (the same file
// downloaded from Firebase console → Project settings → Service accounts):
//   FIREBASE_SERVICE_ACCOUNT = <the full JSON, as a single-line string>
//
// Uses the firebase-admin v14 modular API. Everything here is best-effort and
// never throws — a failed push must not break the call flow.

let messagingInstance = null;
let initialized = false;
let initTried = false;

function init() {
  if (initTried) return;
  initTried = true;
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) {
      console.warn('[FCM-ADMIN] FIREBASE_SERVICE_ACCOUNT not set — call data messages disabled.');
      return;
    }
    const { initializeApp, getApps, cert } = require('firebase-admin/app');
    const { getMessaging } = require('firebase-admin/messaging');

    const serviceAccount = JSON.parse(raw);
    const app = getApps().length
      ? getApps()[0]
      : initializeApp({ credential: cert(serviceAccount) });

    messagingInstance = getMessaging(app);
    initialized = true;
    console.log('[FCM-ADMIN] Initialized.');
  } catch (err) {
    console.error('[FCM-ADMIN] init failed:', err.message);
    messagingInstance = null;
    initialized = false;
  }
}

/**
 * Send a high-priority FCM message to the given device tokens.
 * @param {string[]} tokens
 * @param {object} data  // string key/values only (FCM data requirement)
 * @param {object} [notification]  // { title, body, channelId, sound } — when
 *   provided, a notification payload is included so the OS itself shows + rings
 *   the alert on the lock screen even when the app is fully closed (data-only
 *   messages are dropped by aggressive ROMs). Returns invalid tokens to prune.
 */
async function sendData(tokens, data, notification) {
  try {
    init();
    if (!initialized || !messagingInstance) return [];
    const valid = (tokens || []).filter((t) => typeof t === 'string' && t.length > 10);
    if (valid.length === 0) return [];

    // FCM data values must all be strings.
    const stringData = {};
    Object.keys(data || {}).forEach((k) => {
      stringData[k] = data[k] == null ? '' : String(data[k]);
    });

    const android = { priority: 'high' };
    const message = { tokens: valid, data: stringData, android };

    if (notification && notification.title) {
      message.notification = { title: notification.title, body: notification.body || '' };
      android.notification = {
        sound: notification.sound || 'default',
        priority: 'max',
        visibility: 'public',
        channelId: notification.channelId || undefined,
      };
    }

    const res = await messagingInstance.sendEachForMulticast(message);
    console.log(`[FCM-ADMIN] sent: ${res.successCount} ok, ${res.failureCount} failed`);

    const invalidTokens = [];
    (res.responses || []).forEach((r, i) => {
      if (!r.success) {
        const code = r.error && r.error.code;
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token' ||
          code === 'messaging/invalid-argument'
        ) {
          invalidTokens.push(valid[i]);
        }
      }
    });
    return invalidTokens;
  } catch (err) {
    console.error('[FCM-ADMIN] sendData error:', err.message);
    return [];
  }
}

module.exports = { sendData };
