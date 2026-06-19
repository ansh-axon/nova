// Sends push notifications via the Expo Push API (HTTPS, port 443 — works on
// Render free tier). No SDK required. Tokens are Expo push tokens of the form
// "ExponentPushToken[xxxxxxxx]". Delivery to standalone Android builds requires
// FCM credentials configured in EAS for the project.
//
// Every function here is best-effort and never throws — a failed push must
// never break the message/call flow.

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

function isExpoToken(t) {
  return typeof t === 'string' && (t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken['));
}

/**
 * Send a push notification to one or more Expo push tokens.
 * @param {string[]} tokens
 * @param {{title:string, body:string, data?:object, sound?:string, channelId?:string, priority?:string}} payload
 */
async function sendPush(tokens, payload) {
  try {
    const valid = (tokens || []).filter(isExpoToken);
    if (valid.length === 0) return;

    const messages = valid.map((to) => ({
      to,
      title: payload.title,
      body: payload.body,
      data: payload.data || {},
      sound: payload.sound || 'default',
      channelId: payload.channelId || 'messages',
      priority: payload.priority || 'high',
    }));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const resp = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify(messages),
        signal: controller.signal,
      });
      const text = await resp.text();
      if (!resp.ok) {
        console.error('[PUSH] Expo push failed:', resp.status, text);
      }
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    console.error('[PUSH] sendPush error:', err.message);
  }
}

module.exports = { sendPush, isExpoToken };
