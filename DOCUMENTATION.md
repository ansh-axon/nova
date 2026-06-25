# NOVA Chat — Complete Project Documentation

> Handoff document. Read this fully before changing anything. It explains the
> whole system end-to-end (server + mobile app), how each feature works, the
> deployment pipeline, conventions, and the known traps. Written so a new
> developer or AI agent can be productive immediately.

---

## 1. What NOVA is

NOVA is a **private, WhatsApp-style real-time chat + calling app** (not on the
Play Store — distributed as a signed APK to a small circle of users).

Capabilities:
- 1-on-1 and group chats (max 15 members) with end-to-end encryption
- Voice calls (WebRTC). **Video has been removed — the app is voice-only.**
- Group/meeting voice calls (mesh WebRTC)
- Status/Stories (24h expiry)
- Read receipts, typing indicators, online/last-seen presence
- Push + lock-screen incoming-call ring and message notifications (FCM)
- Status, blocking, app-lock (biometric/PIN), hidden "locked" chats, document locker
- A built-in AI assistant chat (`meta_ai` / "NOVA AI")
- Auto-deleting messages (30 days)

---

## 2. Tech stack

### Mobile app (`/app`)
- **Expo SDK 51**, **React Native 0.74.5**, **React 18.2**
- **expo-router 3.5** (file-based routing, typed routes)
- **TypeScript**
- **react-native-webrtc 118** (calls) via `@config-plugins/react-native-webrtc`
- **@react-native-firebase/app + messaging 20.5** (FCM data/notification messages)
- **@notifee/react-native 9** (local notification channels + lock-screen call UI)
- **expo-av** (audio: ringtones, voice notes), **expo-camera**, **expo-local-authentication**
- **socket.io-client 4.7** (real-time signaling + presence)
- **tweetnacl** (E2E encryption on the client)
- State: a single React Context (`AppContext`) — no Redux.

### Backend (`/server`)
- **Node.js + Express 4**
- **MongoDB + Mongoose 8** (MongoDB Atlas in production)
- **socket.io 4.7** (real-time)
- **jsonwebtoken** (JWT auth, 7-day tokens)
- **bcryptjs** (password hashing)
- **firebase-admin 14** (server → device FCM messages for calls + messages)
- **nodemailer** (email OTP verification + password reset)
- **multer** (media upload), **tweetnacl** (group key gen / crypto helpers)
- **express-rate-limit** (brute-force protection on auth)

### Infra
- **Server**: Render (free tier) — auto-deploys from GitHub `main`. URL:
  `https://nova-server-wg9p.onrender.com`. Kept warm by self-ping (4 min) +
  external UptimeRobot pinging `/ping`.
- **App builds**: EAS Build (Expo). APK profile = `preview`.
- **Repo remote**: `github` → `https://github.com/ansh-axon/nova.git` (branch `main`).
- **Push (FCM)**: Firebase project; `google-services.json` in `/app`,
  `FIREBASE_SERVICE_ACCOUNT` env on the server.

---

## 3. Repository layout

```
d:\ChatApp\
├── app/                      # Expo React Native mobile app
│   ├── app.json              # Expo config (plugins, permissions, version, owner, projectId)
│   ├── eas.json              # EAS build profiles (preview = internal APK)
│   ├── google-services.json  # Firebase Android config
│   ├── index.js              # TRUE entry point — registers FCM bg handlers, then expo-router
│   ├── package.json
│   └── src/
│       ├── app/              # expo-router screens (file = route)
│       │   ├── _layout.tsx           # Root layout + GlobalCallHost (the in-call UI) + unlock gate
│       │   ├── index.tsx
│       │   ├── (auth)/               # login, register, verify (OTP), forgot
│       │   ├── (tabs)/               # index(chats), status, calls, settings + _layout (tab bar)
│       │   └── chat/[conversationId].tsx   # the chat screen (largest file)
│       ├── components/       # NeonAlert, GroupCallHost, UnlockScreen, DocumentLocker, etc.
│       ├── context/AppContext.tsx    # ⭐ ALL app state + logic (calls, sockets, FCM, chat, auth)
│       ├── hooks/
│       └── utils/            # fcmCall, encryption, api, tokenStore, iceConfig, locker, etc.
│
├── server/                   # Node/Express + MongoDB backend
│   ├── server.js             # App entry: express, socket.io, routes, AI seed, keep-alive
│   ├── config.js             # Loads + validates JWT_SECRET from env (exits if weak/missing)
│   ├── db.js                 # Mongo connection
│   ├── middleware/auth.js    # JWT verify → req.user
│   ├── models/               # Mongoose schemas (User, Conversation, Message, Call, Status, LockerFile)
│   ├── routes/               # auth, users, conversations, messages, calls, status, upload, locker
│   ├── utils/                # encryption, fcmAdmin, mailer, push, aiAssistant, lockerCrypto
│   ├── public/               # birthday.html + assets, served at /birthday and /static
│   └── uploads/              # uploaded media (served at /uploads, nosniff)
│
└── DOCUMENTATION.md          # (this file)
```

---

## 4. High-level architecture

```
   ┌─────────────────┐    JWT (Authorization: Bearer)     ┌──────────────────┐
   │  Mobile app     │ ──────── REST (axios/fetch) ──────▶ │  Express API     │
   │  (Expo RN)      │                                     │  (Render)        │
   │                 │ ◀─────── Socket.io (real-time) ───▶ │  socket.io       │
   │  AppContext     │                                     │                  │
   └────────┬────────┘                                     └────────┬─────────┘
            │                                                        │
            │  WebRTC media (P2P, via STUN/TURN)                     │ Mongoose
            │  ◀───────────────────────────────▶ (other peer)       ▼
            │                                              ┌──────────────────┐
            │  FCM (incoming call / message)               │  MongoDB Atlas   │
            └────────────── firebase-admin ◀────────────── └──────────────────┘
                                                    (server sends FCM via fcmAdmin)
```

- **Signaling** (call setup, offer/answer/ICE) goes over **socket.io**.
- **Media** (voice) is **peer-to-peer WebRTC** (no media server/SFU for 1-on-1).
  Group calls use a **mesh** (each peer connects to every other peer).
- **Wake-ups** (ring when app is closed/locked) use **FCM** through `firebase-admin`.

---

## 5. Backend reference

### 5.1 Data models (`server/models`)

**User.js**
- `username` (unique, lowercase), `email` (unique sparse), `password` (bcrypt hash)
- `isVerified`, `otpCode/otpExpires`, `resetCode/resetExpires` (all `select:false`)
- `displayName`, `about`, `avatarUrl` (Base64), `isOnline`, `lastSeen`
- `publicKey`, `secretKey` (`select:false`) — E2E keypair (tweetnacl)
- `deviceFingerprint` — one-account-per-device enforcement on register
- `pushTokens[]` — Expo push tokens; `fcmTokens[]` — native FCM tokens
- `callRingtone`, `messageRingtone` — chosen tone ids → per-tone notification channels
- `blockedUsers[]`

**Conversation.js**
- `participants[]`, `isGroup`, `groupName`, `groupIcon`, `description`
- `groupAdmin`, `groupEncryptionKey`, `participantStatus[]` (user/joinedAt/role)
- `maxParticipants` (15), `lastMessage`, `deletedFor[]` (per-user soft-delete of the conversation)

**Message.js**
- `conversation`, `sender`, `encryptedContent{ciphertext,nonce}`, `text`
- `status` (sent/delivered/read), `readBy[]`, `messageType` (text/image/video/audio/file), `mediaUrl`
- `edited`, `deletedForEveryone`
- `deletedFor[]` — **per-user clear chat** (cleared messages never reappear; the
  other participant keeps their copy)
- `expiresAt` — TTL index, auto-deletes after 30 days
- `replyTo`

**Call.js**
- `caller`, `receiver`, `conversation`, `callType` (voice/video), `status`
  (ringing/accepted/rejected/missed/ended), `callRoomId` (UUID — also the WebRTC room),
  `duration`, `startedAt`, `endedAt`
- `deletedFor[]` — **per-user clear call log**

**Status.js** — stories (media/text, privacy, viewers, 24h expiry).
**LockerFile.js** — encrypted document locker entries (owner-only).

### 5.2 REST endpoints (all under `/api`, all require `auth` unless noted)

**auth** (`/api/auth`) — _no JWT; rate-limited_
- `POST /register` — create user (unverified) + email OTP. One account per `deviceId`.
- `POST /verify-otp` — verify email OTP → returns JWT.
- `POST /resend-otp`, `POST /login`, `POST /forgot-password`, `POST /reset-password`
- `GET /user-keys/:userId` — public key lookup (auth required to stop enumeration)

**users** (`/api/users`)
- `GET /` (all users), `GET /me`, `PUT /profile`
- `POST /call-ringtone`, `POST /message-ringtone` — save chosen tone id
- `POST /fcm-token`, `POST /fcm-token/remove`, `POST /push-token`, `POST /push-token/remove`
- `POST /block`, `POST /unblock`, `POST /fcm-debug`

**conversations** (`/api/conversations`)
- `GET /` (list, with unread counts + per-user lastMessage hiding)
- `GET /:conversationId`, `POST /` (start 1-on-1)
- `POST /group/create`
- `PUT /:conversationId/add-member` (admin only — emits `group_updated` socket event)
- `PUT /:conversationId/remove-member`, `/mute`, `/unmute`
- `DELETE /:conversationId` (leave/soft-delete)

**messages** (`/api/messages`)
- `GET /:conversationId` (filters out `deletedFor` = me)
- `DELETE /conversation/:conversationId/clear` — **per-user clear chat**
- `POST /search` (regex is escaped → no ReDoS; also filters cleared messages)
- `POST /` (send; encrypts; sends FCM/Expo notif to recipients; AI auto-reply for the bot)
- `PUT /:messageId/edit`, `DELETE /:messageId` (delete for everyone — soft, tombstone)
- `PUT /:messageId/read`, `PUT /conversation/:conversationId/read-all`

**calls** (`/api/calls`)
- `GET /history` (filters `deletedFor` = me)
- `DELETE /history` — **per-user clear call log**
- `GET /active-incoming` — still-ringing incoming call in last 45s (declared BEFORE `/:callId`)
- `GET /:callId`, `POST /initiate`, `PUT /:callId/accept|reject|end|missed`
- On initiate → sends **FCM notification-payload** ring; on accept/reject/end → sends
  same-tag cancel notification to stop the ring / show "Missed call".

**status**, **upload** (`POST /media`, multer, blocks executable types, nosniff),
**locker** (owner-only encrypted files).

### 5.3 Socket.io events (`server/server.js`)

Auth: client presents JWT in `handshake.auth.token` → `socket.authUserId`.
(Transitional: tokenless legacy clients still allowed unless `SOCKET_AUTH_STRICT=true`.)

- `join` (userId) → joins `user_<id>` room, marks online, broadcasts `user_online`
- `join_conversation` / `leave_conversation`, `user_typing` / `typing`
- **1-on-1 calls**: `call_initiated`, `webrtc_offer`, `webrtc_answer`, `webrtc_ice_candidate`
- **group calls (mesh)**: `group_start`, `group_join`, `group_offer`, `group_answer`,
  `group_ice`, `group_leave` (+ server emits `group_incoming`, `group_existing_peers`,
  `group_peer_joined`, `group_peer_left`)
- Server → client emits: `incoming_call`, `call_accepted`, `call_rejected`, `call_ended`,
  `message_received`, `message_edited`, `message_deleted` (`{_id, conversation}`),
  `message_read`, `messages_read`, `group_updated`, `user_online`, `user_offline`
- `disconnect` → marks offline, cleans group rooms

### 5.4 Server utils
- `encryption.js` — tweetnacl keypair gen, 1-on-1 + group message encryption
- `fcmAdmin.js` — `sendData(tokens, data, notification?)` via firebase-admin (high priority).
  Data-only when `notification` omitted; notification-payload (OS-shown) when provided.
  Returns invalid tokens to prune.
- `mailer.js` — OTP/reset emails (nodemailer); `push.js` — Expo push fallback
- `aiAssistant.js` — generates the `meta_ai` bot replies
- `lockerCrypto.js` — document locker encryption

---

## 6. Mobile app reference

### 6.1 Entry & routing
- `app/index.js` is the **real entry point** (`"main"` in package.json). It calls
  `registerCallBackgroundHandlers()` (so FCM can wake the app for calls/messages even
  when killed) and then `require('expo-router/entry')`. **Do not move the background
  handler registration out of the true entry point — it breaks killed-state wake-ups.**
- `src/app/_layout.tsx` — root layout. Hosts:
  - `AppProvider` (the context)
  - `GlobalCallHost` — the **full-screen in-call UI** (ringing/connected). Renders
    whenever `incomingCall || activeCall` exists. Contains the **call duration timer**.
  - `UnlockScreen` — biometric/PIN gate for app-lock.
  - `NeonAlertHost` — the app's custom alert component (`showNeonAlert(...)`).
- Screens: `(auth)/` login/register/verify/forgot, `(tabs)/` chats/status/calls/settings,
  `chat/[conversationId].tsx` (chat screen — note literal brackets in filename;
  `grep --include` globs treat `[ ]` as a char class, so include-filtered searches
  on that file silently match nothing — search repo-wide instead).

### 6.2 AppContext (`src/context/AppContext.tsx`) — the heart of the app
This single file holds **almost all state and logic**. Key areas:
- Auth: `login`, `register`, `logout`, token persistence (`tokenStore`)
- Conversations/messages: `fetchConversations`, `loadMessages`, `sendMessage`,
  `clearChat` (per-user), `createGroup`, `addGroupMember`, `markConversationRead`, etc.
- Calls: `initiateCallLog`, `acceptCall`, `rejectCall`, `endCall`, WebRTC peer setup
  (`initPeerConnection`), ICE (`iceConfig`), group mesh peers.
- Call state exposed: `incomingCall`, `activeCall`, `callState`
  ('ringing'|'connected'|'ended'|null), `callDuration`, `localStream`, `remoteStream`.
- Sockets: created on login; all `socketInstance.on(...)` handlers live in one effect.
- FCM: `registerForFcm`, token upload, `showIncomingCallFromData`,
  `checkActiveIncomingCall` (on unlock/foreground, shows full-screen if still ringing),
  foreground `onMessage` (dismisses cancelled calls).
- Ringtones: `registerCallRingtone` / `registerMessageRingtone` → create per-tone
  notifee channels + save to server.
- Calls-tab badge: `missedCallCount`, `markCallsSeen`.

**Refs to watch**: `incomingCallRef`, `activeCallRef`, `conversationsRef`,
`activeConversationIdRef` — used to read latest values inside socket callbacks (avoid
stale closures). Update them when you add new call/conversation state.

### 6.3 App utils (`src/utils`)
- `fcmCall.ts` — **FCM + notifee core**. Notification channels (`ensureCallChannel`:
  `nova_incoming_call_v3`, `nova_call_cancel`, `nova_message`), per-tone channels
  (`nova_call_<tone>`, `nova_msg_<tone>`), `displayIncomingCall`, background handlers
  (`registerCallBackgroundHandlers` → `handleFcmDataMessage`), battery-optimization prompt.
  `CALL_TONE_IDS` / `MESSAGE_TONE_IDS` list the bundled tone ids.
- `encryption.ts` — client tweetnacl E2E
- `api.ts` — axios instance + endpoint helpers
- `tokenStore.ts` — JWT persistence (used by background handler too)
- `iceConfig.ts` — STUN/TURN servers for WebRTC
- `applock.ts`, `locker.ts`, `mediaCache.ts`, `pushNotifications.ts`

### 6.4 Ringtones / tones
- Bundled WAV/MP3 in `app/assets/tones/`, declared under `expo-notifications.sounds`
  in `app.json`, and listed in `BUILTIN_TONES` in `settings.tsx`.
- A notification **channel's sound is frozen at channel-creation time** by Android, so
  each selectable tone needs its **own channel** (`nova_call_<tone>`, `nova_msg_<tone>`).
- The user's chosen tone id is stored on the server (`User.callRingtone` /
  `messageRingtone`) so the server picks the right channel when sending the FCM.

---

## 7. How the key features work (the important flows)

### 7.1 Voice call (the main feature)
1. Caller taps call → `initiateCallLog` → `POST /api/calls/initiate`.
2. Server saves Call (`callRoomId` = UUID), emits `incoming_call` over socket AND sends
   an **FCM notification-payload** (so a closed/locked phone rings on its lock screen).
3. Receiver: socket handler (app open) OR FCM notification (app closed) shows the call.
   In-app, `GlobalCallHost` renders the ringing UI; the in-app ringtone plays.
4. Receiver accepts → `PUT /accept` → server sets `startedAt`, emits `call_accepted`
   to caller + sends a same-tag cancel notification to stop the lock-screen ring.
5. WebRTC handshake over socket (`webrtc_offer`/`answer`/`ice_candidate`) → P2P audio.
6. Hang up → `PUT /end`; reject → `PUT /reject`. Both stop the ring (tag-replacement)
   and update the call log.

**Duration timer** (in `GlobalCallHost`): locks a start time **once** per connected
call in a ref, prefers server `startedAt` but falls back to the local connect moment if
`startedAt` is ahead of this device's clock (prevents cross-device clock-skew from
freezing the caller at 00:00).

### 7.2 Lock-screen / closed-app incoming-call ring
- Uses **FCM notification-payload** (the OS shows + rings it). This is the reliable path
  across OEMs (Realme/Xiaomi/Samsung). The notification uses the per-tone channel so the
  user's selected NOVA tone rings.
- On cut/reject/missed, the server sends a **same-tag** (`nova_call`) silent notification
  on `nova_call_cancel` channel that **replaces** the ringing notification (stops sound /
  shows "Missed call").
- On unlock/foreground, `checkActiveIncomingCall` shows the full-screen UI **only if the
  call is still ringing** (so a cut call doesn't pop up).

### 7.3 Message notifications
- On new message, server sends FCM **per-recipient** using each recipient's chosen
  `messageRingtone` channel (`nova_msg_<tone>` or default `nova_message`). Expo push is a
  fallback only for recipients without an FCM token (avoids double-notify).

### 7.4 Clear chat / clear call log (per-user, permanent)
- Both add the user's id to a `deletedFor[]` array on each Message / Call (never hard
  delete) so the **other** participant keeps their copy and old items **never reappear**
  when new ones arrive. Fetch/search/history routes all filter `deletedFor`.

### 7.5 E2E encryption
- tweetnacl keypair per user (generated on register). 1-on-1 messages encrypted with
  sender secret + recipient public key; group messages with a shared `groupEncryptionKey`.

---

## 8. Configuration & environment

### Server env (`server/.env`, see `.env.example`)
- `MONGODB_URI` — MongoDB Atlas connection string
- `JWT_SECRET` — 32+ random chars (server **refuses to start** if weak/missing)
- `EMAIL_USER` / `EMAIL_PASS` — nodemailer SMTP (Gmail app password)
- `FIREBASE_SERVICE_ACCOUNT` — full Firebase service-account JSON (single line) for FCM
- `SIGNALING_SERVER` (optional), `SOCKET_AUTH_STRICT` (set `true` after all clients update),
  `RENDER_EXTERNAL_URL` (auto on Render — drives self keep-alive)

### App config (`app/app.json`)
- `version` (user-facing, e.g. `1.3.1`), `android.package = com.rahulverma.nova`
- `owner` + `extra.eas.projectId` — **EAS account binding** (see §9)
- `plugins`: expo-router, expo-splash-screen, expo-build-properties (cleartext, sdk 34,
  minSdk 23), `@config-plugins/react-native-webrtc`, expo-local-authentication,
  expo-notifications (with the full `sounds` list), `@react-native-firebase/app`
- Android permissions: INTERNET, RECORD_AUDIO, CAMERA, POST_NOTIFICATIONS,
  USE_FULL_SCREEN_INTENT, WAKE_LOCK, biometrics, REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, etc.

---

## 9. Build & deploy

### Server (Render)
- Render auto-deploys on every push to GitHub `main`. No manual step.
- Just commit + push server changes; Render redeploys in ~1-2 min.

### App (EAS Build → APK)
- Profile `preview` builds an internal **APK** (`eas.json`).
- Command (run from `app/`):
  ```
  eas build --platform android --profile preview --non-interactive --no-wait
  ```
  Add `--clear-cache` after changing native deps/plugins.
- **Free tier = ~30 Android builds/month per Expo account.** When exhausted, the build
  fails with "used its Android builds from the Free plan this month". Workaround used
  historically: **create a new Expo account** and re-point the project:
  ```
  eas logout && eas login            # log into the new account
  # set app.json "owner" to the new username, clear extra.eas.projectId
  eas init --force --non-interactive # creates a fresh @<owner>/nova-chat project + projectId
  eas build --platform android --profile preview --non-interactive --no-wait
  ```
- **Account history**: `ansh_nova` → `anshnovas-team` → **`yuvi_axon`** (current).
  Build link pattern: `https://expo.dev/accounts/<owner>/projects/nova-chat/builds/<id>`.
- ⚠️ **A new EAS account generates a NEW signing keystore.** APKs signed with a different
  key **cannot upgrade over** an existing install → users must **uninstall the old NOVA
  first**, then install the new APK. Data is safe (lives on the server).

---

## 10. Known issues, limitations & decisions (READ THIS)

1. **CallKeep was tried and removed.** A `react-native-callkeep` (system-managed call)
   integration was implemented to make the ring stop exactly on cut. It **failed on
   Realme/ColorOS Android 11**: nothing rang and the app glitched, because aggressive
   OEM ROMs block the data-only-FCM background wake + self-managed ConnectionService that
   CallKeep needs. It was **fully reverted** (commit `revert-callkeep-...`). The app is
   back to the reliable **FCM notification-payload** ring. **Do not re-add CallKeep**
   unless targeting stock Android (Pixel/Samsung) and you can test there.

2. **"Perfect" ring discipline is not achievable on aggressive ROMs.** Android plays a
   notification channel sound to completion; replacing the notification (same tag) stops
   it in most cases but isn't a hard guarantee on every ROM. This is a platform limit.

3. **Fully-killed (swiped) app on ColorOS/MIUI may not wake** for calls unless the user
   enables **Autostart** + battery-optimization exemption (no API for Autostart). The
   app prompts for battery exemption once (`maybePromptBatteryOptimization`).

4. **Pre-existing TS warning (do NOT "fix" blindly):** `chat/[conversationId].tsx` uses
   `shouldRouteThroughEarpieceAndroid` in `Audio.setAudioModeAsync` (lines ~125, ~869).
   TypeScript flags it (the correct key is `playThroughEarpieceAndroid`), but expo-av
   ignores the unknown key at runtime and **voice calls work as-is**. Changing it alters
   audio routing (earpiece vs speaker) and risks the working voice path. Left intentionally.

5. **Voice only.** Video calling was removed everywhere (chat header, redial, group
   meeting). Some harmless video-capable code paths remain dormant (`callType` can still
   be 'video' in old logs) but the UI never initiates video.

6. **Socket auth is transitional.** Tokenless legacy clients are still accepted. Once all
   users are on a recent build, set `SOCKET_AUTH_STRICT=true` to close the gap.

---

## 11. Conventions & workflow (how changes are made here)

- **Verify before building** (builds are scarce): `npx tsc --noEmit --skipLibCheck` for
  the app, `node --check <file>` for each server file, and `get_diagnostics`.
- **Git**: commit to `main`, push to remote `github`. Keep `.vscode/settings.json`
  unstaged (`git restore --staged .vscode/settings.json`). Commit messages used here are
  single hyphenated tokens (tooling-friendly), e.g. `clear-chat-and-call-log-per-user`.
- **Don't break voice calls.** It is the most important working feature.
- **Don't add features beyond what's asked.**
- **Per-user delete pattern**: always use a `deletedFor[]` array (never hard-delete shared
  records) so the other participant is unaffected.
- **New native dependency or app.json plugin change** → rebuild with `--clear-cache`, and
  validate with `npx expo config --type prebuild` (run via cmd.exe; npx is blocked under
  the PowerShell execution policy here).
- This is a **Windows** dev environment; shell snippets assume `cmd.exe`.

---

## 12. Quick start for a new agent/developer

1. **Server**: `cd server` → set `.env` (see §8) → `npm install` → `npm start`
   (or just push to `main` and let Render run it).
2. **App**: `cd app` → `npm install --legacy-peer-deps` → ensure logged into the EAS
   account that owns the project (`eas whoami`) → build with the §9 command, OR run a dev
   client. (`expo start` works for JS-only changes if a dev build is installed.)
3. To change call/chat/notification behavior, start in **`AppContext.tsx`** (client logic)
   and **`server/routes/{calls,messages,conversations}.js`** + **`utils/fcmAdmin.js`**.
4. Re-read §10 before touching calls, ringtones, or audio.

---

## 13. Extra pages

- **Birthday page**: served at `https://nova-server-wg9p.onrender.com/birthday`
  (`server/public/birthday.html` + `p1-p4.jpg`, `song.mp3` at `/static`). Personal
  surprise page; unrelated to the chat features.
- **`/ping`**: keep-alive health endpoint (UptimeRobot + self-ping hit this).

---

_Last updated: this revision documents the post-CallKeep-revert state (app v1.3.1,
EAS account `yuvi_axon`). Server changes deploy via Render on push to `main`._
