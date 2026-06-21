// Sends native FCM DATA messages via firebase-admin. Used for incoming-call
// alerts that must wake the app even when it is fully closed (a data-only,
// high-priority message triggers the client's background handler, which then
// shows a full-screen call screen via notifee).
//
// Configure on the server with the Firebase service-account JSON (the same file
// downloaded from Firebase console → Project settings → Service accounts):
//   FIREBASE_SERVICE_ACCOUNT = <the full JSON, as a single-line string>
//
// Everything here is best-effort and never throws — a failed push must not
// break the call flow.

let admin = null;
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
    admin = require('firebase-admin');
    const serviceAccount = JSON.parse(raw);
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    initialized = true;
    console.log('[FCM-ADMIN] Initialized.');
  } catch (err) {
    console.error('[FCM-ADMIN] init failed:', err.message);
    admin = null;
    initialized = false;
  }
}

/**
 * Send a data-only high-priority FCM message to the given device tokens.
 * @param {string[]} tokens
 * @param {object} data  // string key/values only (FCM data requirement)
 */
async function sendData(tokens, data) {
  try {
    init();
    if (!initialized || !admin) return;
    const valid = (tokens || []).filter((t) => typeof t === 'string' && t.length > 10);
    if (valid.length === 0) return;

    // FCM data values must all be strings.
    const stringData = {};
    Object.keys(data || {}).forEach((k) => {
      stringData[k] = data[k] == null ? '' : String(data[k]);
    });

    const message = {
      tokens: valid,
      data: stringData,
      android: {
        priority: 'high',
      },
    };

    const res = await admin.messaging().sendEachForMulticast(message);
    console.log(`[FCM-ADMIN] sent: ${res.successCount} ok, ${res.failureCount} failed`);
  } catch (err) {
    console.error('[FCM-ADMIN] sendData error:', err.message);
  }
}

module.exports = { sendData };
