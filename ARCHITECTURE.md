# 🏗️ Project Nova - System Architecture

## Complete System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    PROJECT NOVA - WHATSAPP CLONE                │
│              End-to-End Encryption with TweetNaCl               │
└─────────────────────────────────────────────────────────────────┘

                            🌐 USERS

        ┌────────────────┐           ┌────────────────┐
        │   Alice        │           │      Bob       │
        │   (Contacts)   │           │   (Contacts)   │
        │                │           │                │
        │ pubKey: A_pub  │           │ pubKey: B_pub  │
        │ secKey: A_sec  │           │ secKey: B_sec  │
        │ (device local) │           │ (device local) │
        └────────┬────────┘           └────────┬───────┘
                 │                            │
                 │      Socket.io             │
                 │      ◀──────────────────▶  │
                 │                            │
                 └────────────┬────────────────┘
                              │
        ┌─────────────────────▼────────────────────┐
        │  🔐 ENCRYPTION LAYER                     │
        │  ┌──────────────────────────────────────┐│
        │  │ 1-on-1 Messages:                     ││
        │  │ encrypt(msg, alice.sec, bob.pub)    ││
        │  │                                      ││
        │  │ Group Messages:                      ││
        │  │ encrypt(msg, groupKey)               ││
        │  │                                      ││
        │  │ Algorithm: NaCl (TweetNaCl.js)       ││
        │  │ - XSalsa20 (cipher)                  ││
        │  │ - Poly1305 (auth)                    ││
        │  │ - Curve25519 (ECDH)                  ││
        │  └──────────────────────────────────────┘│
        └─────────────────────┬────────────────────┘
                              │
        ┌─────────────────────▼────────────────────┐
        │  📡 EXPRESS.JS BACKEND                   │
        │                                          │
        │  ┌────────────────────────────────────┐ │
        │  │ REST API ROUTES                    │ │
        │  ├────────────────────────────────────┤ │
        │  │ POST   /api/auth/register          │ │
        │  │ POST   /api/auth/login             │ │
        │  │ GET    /api/auth/user-keys/:userId │ │
        │  │                                    │ │
        │  │ POST   /api/conversations          │ │
        │  │ POST   /api/conversations/group    │ │
        │  │ PUT    /api/conversations/:id/*    │ │
        │  │ DELETE /api/conversations/:id      │ │
        │  │                                    │ │
        │  │ GET    /api/messages/:convId       │ │
        │  │ POST   /api/messages               │ │
        │  │ PUT    /api/messages/:id/read      │ │
        │  │ DELETE /api/messages/:id           │ │
        │  │                                    │ │
        │  │ GET    /api/status                 │ │
        │  │ POST   /api/status                 │ │
        │  │ PUT    /api/status/:id/view        │ │
        │  │                                    │ │
        │  │ GET    /api/calls/history          │ │
        │  │ POST   /api/calls/initiate         │ │
        │  │ PUT    /api/calls/:id/:action      │ │
        │  └────────────────────────────────────┘ │
        │                                          │
        │  ┌────────────────────────────────────┐ │
        │  │ SOCKET.IO REAL-TIME EVENTS         │ │
        │  ├────────────────────────────────────┤ │
        │  │ SERVER EMITS:                      │ │
        │  │ • message_received (encrypted)     │ │
        │  │ • message_read (receipt)           │ │
        │  │ • typing_status (indicators)       │ │
        │  │ • user_online/offline (presence)   │ │
        │  │ • incoming_call (notifications)    │ │
        │  │ • webrtc_offer/answer (signals)    │ │
        │  │                                    │ │
        │  │ SERVER LISTENS:                    │ │
        │  │ • join (user connection)           │ │
        │  │ • user_typing (broadcast typing)   │ │
        │  │ • call_initiated (ring alert)      │ │
        │  │ • webrtc_* (signaling)             │ │
        │  │ • disconnect (offline status)      │ │
        │  └────────────────────────────────────┘ │
        │                                          │
        │  ┌────────────────────────────────────┐ │
        │  │ MIDDLEWARE                         │ │
        │  ├────────────────────────────────────┤ │
        │  │ JWT Authentication                 │ │
        │  │ Input Validation                   │ │
        │  │ Error Handling                     │ │
        │  │ CORS Configuration                 │ │
        │  └────────────────────────────────────┘ │
        └─────────────────────┬────────────────────┘
                              │
        ┌─────────────────────▼────────────────────┐
        │  💾 MONGODB DATABASE                     │
        │                                          │
        │  ┌────────────────────────────────────┐ │
        │  │ Collections:                       │ │
        │  │                                    │ │
        │  │ users                              │ │
        │  │ ├─ username, password (hashed)     │ │
        │  │ ├─ publicKey (base64)              │ │
        │  │ ├─ secretKey (base64, hidden)      │ │
        │  │ ├─ isOnline, lastSeen              │ │
        │  │ └─ profile (displayName, avatar)   │ │
        │  │                                    │ │
        │  │ messages                           │ │
        │  │ ├─ conversation (ref)              │ │
        │  │ ├─ sender (ref)                    │ │
        │  │ ├─ encryptedContent                │ │
        │  │ │  └─ {ciphertext, nonce}         │ │
        │  │ ├─ readBy: [{user, readAt}]        │ │
        │  │ ├─ messageType                     │ │
        │  │ └─ expiresAt (TTL: 30 days)        │ │
        │  │                                    │ │
        │  │ conversations                      │ │
        │  │ ├─ participants: [User ref]        │ │
        │  │ ├─ isGroup: boolean                │ │
        │  │ ├─ groupName, groupIcon            │ │
        │  │ ├─ groupEncryptionKey              │ │
        │  │ ├─ maxParticipants: 15             │ │
        │  │ ├─ participantStatus               │ │
        │  │ └─ lastMessage (ref)               │ │
        │  │                                    │ │
        │  │ statuses                           │ │
        │  │ ├─ user (ref)                      │ │
        │  │ ├─ statusType (image|video|text)   │ │
        │  │ ├─ viewers: [{user, viewedAt}]     │ │
        │  │ ├─ privacy (public|contacts)       │ │
        │  │ └─ expiresAt (TTL: 24 hours)       │ │
        │  │                                    │ │
        │  │ calls                              │ │
        │  │ ├─ caller, receiver (refs)         │ │
        │  │ ├─ callType (voice|video)          │ │
        │  │ ├─ status (ringing|accepted|ended) │ │
        │  │ ├─ callRoomId (WebRTC)             │ │
        │  │ └─ duration, callQuality           │ │
        │  └────────────────────────────────────┘ │
        └─────────────────────────────────────────┘


═══════════════════════════════════════════════════════════════════

                    📊 MESSAGE ENCRYPTION FLOW

          ┌─────────────────────────────────────┐
          │   1-ON-1 MESSAGE (ASYMMETRIC)       │
          └─────────────────────────────────────┘

SENDER (ALICE)                          RECEIVER (BOB)
─────────────────                       ───────────────

Alice types: "Hello"                    Bob reads encrypted
        │                               message from DB
        ▼
1. Get Bob's public key                 1. Get Alice's
   from server (pub_B)                     public key
        │
2. Encrypt using:                       2. Decrypt using:
   • alice.secret_key                      • alice.public_key
   • bob.public_key                        • bob.secret_key
   • random nonce                          • received nonce
        │
3. Send {ciphertext,                    3. Message visible:
        nonce} to server                   "Hello"
        │
        ▼
   SERVER STORES:
   {
     conversation: conv_id,
     sender: alice_id,
     encryptedContent: {
       ciphertext: "a3f9e2...",
       nonce: "c1d7b4..."
     },
     readBy: [],
     createdAt: timestamp
   }


          ┌─────────────────────────────────────┐
          │   GROUP MESSAGE (SYMMETRIC)         │
          └─────────────────────────────────────┘

GROUP CREATION (ADMIN)          SENDING (ANY MEMBER)        RECEIVING (OTHERS)
──────────────────────          ──────────────────          ──────────────────

1. Generate shared key          1. Get group key from       1. Get group key
   groupKey = random                conversation             from conversation
        │
2. Send groupKey to each        2. Encrypt using:           2. Decrypt using:
   member encrypted with           • groupKey               • groupKey (same)
   their public key                • random nonce

3. Store in database:
   {
     groupEncryptionKey:
       "xN8pQ2r..."
   }

4. All members can
   encrypt/decrypt
   with same key


═══════════════════════════════════════════════════════════════════

                   🔄 REAL-TIME MESSAGE FLOW

Alice sends message                    Bob receives message
───────────────────                    ────────────────────

┌──────────────────┐                   ┌──────────────────┐
│ Client (Alice)   │                   │ Client (Bob)     │
└──────────────────┘                   └──────────────────┘
        │                                      ▲
        │ 1. Type message                      │ 5. Socket emit
        │    Encrypt locally                   │    message_received
        │                                      │
        ▼                                      │
   ┌─────────────────────────────────────────┐│
   │        Express.js Backend               ││
   │  ┌───────────────────────────────────┐  ││
   │  │ 2. POST /api/messages             │  ││
   │  │    Validate JWT                   │  ││
   │  │    Check permissions              │  ││
   │  │    Store encrypted message        │  ││
   │  │                                   │  ││
   │  │ 3. Emit via Socket.io             │  ││
   │  │    to: user_bob (room)            │  ││
   │  │    data: {encrypted message}      │  ││
   │  │                                   │  ││
   │  │ 4. MongoDB stores:                │  ││
   │  │    {                              │  ││
   │  │     encryptedContent,             │  ││
   │  │     readBy: [],                   │  ││
   │  │     expiresAt: 30d                │  ││
   │  │    }                              │  ││
   │  └───────────────────────────────────┘  ││
   └─────────────────────────────────────────┘│
                                              │
                                    Bob opens message
                                    ↓
                                 Decrypt locally
                                 Show: "Hello"
                                    ↓
                              Mark as read
                              Send receipt


═══════════════════════════════════════════════════════════════════

                      📱 FRONTEND ARCHITECTURE

┌─────────────────────────────────────────────────────────┐
│          EXPO / REACT NATIVE APP                        │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │ SCREENS                                           │ │
│  ├───────────────────────────────────────────────────┤ │
│  │ (tabs)                                            │ │
│  │  ├─ index.tsx       → Chat List                   │ │
│  │  ├─ calls.tsx       → Call History & WebRTC       │ │
│  │  ├─ status.tsx      → Stories/Status Feed         │ │
│  │  └─ settings.tsx    → Profile & Keys Display      │ │
│  │                                                   │ │
│  │ chat                                              │ │
│  │  └─ [conversationId].tsx → Message Thread        │ │
│  │     • Display encrypted messages (decrypted)     │ │
│  │     • Send messages (encrypt locally)            │ │
│  │     • Show typing indicators                     │ │
│  │     • Display read receipts                      │ │
│  │                                                   │ │
│  │ (auth)                                            │ │
│  │  ├─ login.tsx       → Login Screen               │ │
│  │  └─ register.tsx    → Registration (Gen Keys)    │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │ UTILITIES                                         │ │
│  ├───────────────────────────────────────────────────┤ │
│  │ encryption.ts     ← NaCl encryption/decryption    │ │
│  │ api.ts            ← API service layer             │ │
│  │ socket.ts         ← Socket.io wrapper             │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │ CONTEXT & HOOKS                                  │ │
│  ├───────────────────────────────────────────────────┤ │
│  │ AppContext.tsx    ← Global auth state            │ │
│  │ use-theme.ts      ← Theme management             │ │
│  │ use-color-scheme  ← Dark/Light mode              │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │ STORAGE                                           │ │
│  ├───────────────────────────────────────────────────┤ │
│  │ AsyncStorage                                      │ │
│  │  ├─ token (JWT)                                   │ │
│  │  ├─ userId                                        │ │
│  │  ├─ publicKey                                     │ │
│  │  ├─ secretKey (encrypted locally)                │ │
│  │  └─ preferences                                   │ │
│  └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘


═══════════════════════════════════════════════════════════════════

              🔐 ENCRYPTION ALGORITHM DETAILS

KEY GENERATION:
  ├─ Algorithm: Ed25519 (Elliptic Curve)
  ├─ Public Key Size: 32 bytes
  ├─ Secret Key Size: 32 bytes
  └─ Generated once per user during registration

1-ON-1 MESSAGE ENCRYPTION:
  ├─ Algorithm: NaCl.box (Curve25519 + XSalsa20 + Poly1305)
  ├─ Key Exchange: ECDH (Elliptic Curve Diffie-Hellman)
  ├─ Symmetric Cipher: XSalsa20 (20-round Salsa20)
  ├─ Authenticator: Poly1305 (MAC for authentication)
  ├─ Nonce: 24 random bytes per message (unique)
  ├─ Ciphertext: encrypted_message
  ├─ Auth Tag: included in ciphertext
  └─ Total Overhead: 32 bytes (24 nonce + 16 auth tag - 8 overlapped)

GROUP MESSAGE ENCRYPTION:
  ├─ Algorithm: NaCl.secretbox (XSalsa20 + Poly1305)
  ├─ Symmetric Key: 32 random bytes (shared)
  ├─ Cipher: XSalsa20
  ├─ Authenticator: Poly1305
  ├─ Nonce: 24 random bytes per message
  ├─ Ciphertext: encrypted_group_message
  └─ Distribution: Each member gets key encrypted with their public key

SECURITY PROPERTIES:
  ├─ Forward Secrecy: Unique nonce per message
  ├─ Authentication: Poly1305 MAC prevents tampering
  ├─ Confidentiality: XSalsa20 provides encryption
  ├─ Integrity: MAC verification on decryption
  ├─ No Plaintext: Never stored on server
  └─ Perfect Forward Secrecy: Future keys safe if present key compromised


═══════════════════════════════════════════════════════════════════

                   🚀 DEPLOYMENT ARCHITECTURE

┌─────────────────────────────────────────┐
│      PRODUCTION ENVIRONMENT              │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │ FRONTEND (Vercel / Netlify)       │ │
│  │ • Expo Web Build                  │ │
│  │ • CDN for static assets           │ │
│  │ • Android/iOS builds via EAS      │ │
│  └────────────┬──────────────────────┘ │
│               │ HTTPS                   │
│  ┌────────────▼──────────────────────┐ │
│  │ BACKEND (AWS / Heroku / DigitalOcean) │
│  │ • Express.js on Node.js           │ │
│  │ • SSL/TLS Certificates            │ │
│  │ • Rate Limiting                   │ │
│  │ • Load Balancing                  │ │
│  └────────────┬──────────────────────┘ │
│               │                         │
│  ┌────────────▼──────────────────────┐ │
│  │ DATABASE (MongoDB Atlas)          │ │
│  │ • Encrypted at rest               │ │
│  │ • Automatic backups               │ │
│  │ • Replication (3 nodes)           │ │
│  │ • TTL indexes for auto-delete     │ │
│  └───────────────────────────────────┘ │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │ ADDITIONAL SERVICES               │ │
│  │ • SendGrid (Email notifications)  │ │
│  │ • Sentry (Error logging)          │ │
│  │ • Datadog (Performance monitoring)│ │
│  │ • Cloudflare (WAF & DDoS)         │ │
│  └───────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

---

## 📊 Data Flow Diagrams

### **Complete Message Lifecycle**

```
CREATION              ENCRYPTION            TRANSMISSION
─────────────         ──────────────        ────────────

User types ──→ Encrypt locally ──→ API call ──→ Validate JWT
message       (NaCl.box)          (HTTPS)      Check perms
                │                 │
                │                 ├─→ Store in DB
                │                 │   (encrypted)
                └─→ Ciphertext    │
                    Nonce         └─→ Socket.io emit
                                      to recipient


STORAGE               RETRIEVAL             DECRYPTION
─────────             ──────────────        ──────────

DB: {                 Client polls DB ──→ Get encrypted ──→ Decrypt locally
  encryptedContent: { or receives      message             (NaCl.box)
    ciphertext: "...",via Socket.io
    nonce: "..."    }                                      ↓
  readBy: [],                                         Plain text
  expiresAt: TTL     Recipient sees                    Message
}                    in chat UI                        displayed


NOTIFICATIONS         VERIFICATION          AUTO-DELETE
─────────────────     ─────────────────     ────────────

Socket.io emit ──→ Read receipt ──→ Mark read ──→ TTL Index
message_read        API call        in DB         (30 days)
                                    Update
Notify sender                       database      Message
of read status                                    expired
```

---

## 🔄 WebRTC Call Flow

```
INITIATION              SIGNALING              CONNECTION
──────────              ──────────              ──────────

Caller calls  ──→ POST /calls/initiate ──→ Create SDP offer
              
Caller socket ──→ Emit: call_initiated ──→ WebRTC (not HTTPS!)
                                           - Peers exchange
Socket.io ────→ Send to receiver      ←──  SDP offers/answers
                                          - Exchange ICE candidates
Receiver ────→ POST /calls/accept     ←──  - Direct media stream
gets ring                                  - No server relaying

Receiver ────→ Emit: call_accepted ──→ Answer with SDP
Socket.io

Peers ────────→ WebRTC.ontrack() ────→ Audio/Video streams
exchange ICE   establish peer         begin flowing
candidates     connection


END CALL                AUTO-DETECT DISCONNECT
────────────            ─────────────────────

Either peer ──→ PUT /calls/:id/end ──→ Update DB
calls hang-up                         (duration, quality)

Socket.io ────→ Notify other peer ──→ Close media streams
               call_ended event       Update UI
```

---

**This architecture provides:**
✅ **Security**: E2E encryption at all layers
✅ **Scalability**: Horizontal scaling via load balancers
✅ **Reliability**: Database replication + backups
✅ **Performance**: Indexed queries + CDN + caching
✅ **Monitoring**: Error tracking + performance metrics
