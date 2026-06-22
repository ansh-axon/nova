// Custom entry point.
//
// The FCM + notifee background handlers MUST be registered in every JS context,
// including the short-lived "headless" task that Android spins up when a
// high-priority data message arrives while the app is FULLY CLOSED (killed).
//
// With Expo Router's default entry (`expo-router/entry`), the root
// `app/_layout.tsx` is only evaluated when the navigation tree renders — which
// never happens in a headless task — so registering the handler there is not
// enough for the app-killed case. Registering it here, at the real entry,
// guarantees `setBackgroundMessageHandler` / `notifee.onBackgroundEvent` are
// wired up as soon as the JS bundle loads, in any context.
//
// Uses require() (not import) so execution order is strictly top-to-bottom:
// register the handler first, then boot the router.
require('./src/utils/fcmCall').registerCallBackgroundHandlers();

// Boot the Expo Router app as usual.
require('expo-router/entry');
