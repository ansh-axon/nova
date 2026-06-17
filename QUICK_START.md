# ⚡ Quick Start Guide - Project Nova WhatsApp Clone

## 🚀 Get Running in 5 Minutes

### **Option 1: Full Stack Setup**

#### **Terminal 1: Start MongoDB**
```bash
mongod
```

#### **Terminal 2: Start Backend Server**
```bash
cd server
npm install
echo "PORT=5000
MONGODB_URI=mongodb://localhost:27017/nova-chat
JWT_SECRET=nova_secret_key_2024
SIGNALING_SERVER=ws://localhost:8080" > .env

npm start
```

The server will start on `http://localhost:5000`

#### **Terminal 3: Start Expo Frontend**
```bash
cd app
npm install
echo "EXPO_PUBLIC_API_URL=http://localhost:5000/api" > .env.local

npm start
```

Then:
- Press `a` for Android emulator
- Press `i` for iOS simulator
- Press `w` for web browser

---

### **Option 2: Docker Setup (Recommended)**

```bash
# Start MongoDB
docker run -d -p 27017:27017 --name mongo mongo:latest

# Start Backend
cd server
npm install && npm start

# Start Frontend (in another terminal)
cd app
npm install && npm start
```

---

## 🧪 Test the App

### **1. Create Account**

**Register User 1:**
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "alice",
    "password": "password123"
  }'
```

**Register User 2:**
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "bob",
    "password": "password123"
  }'
```

### **2. Login & Get Keys**

```bash
# Login as Alice
TOKEN=$(curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "alice", "password": "password123"}' \
  | jq -r '.token')

echo "Alice Token: $TOKEN"
```

### **3. Create 1-on-1 Conversation**

```bash
# Get Bob's ID first (from register response or search)
BOB_ID="<bob_user_id>"

curl -X POST http://localhost:5000/api/conversations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"recipientId\": \"$BOB_ID\"}"
```

### **4. Send Encrypted Message**

```bash
CONV_ID="<conversation_id>"

curl -X POST http://localhost:5000/api/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"conversationId\": \"$CONV_ID\",
    \"text\": \"Hello Bob! 🔐\",
    \"messageType\": \"text\"
  }"
```

### **5. Receive & Decrypt Message**

In the frontend app, messages will be:
1. Received encrypted from server
2. Decrypted client-side using your secret key
3. Displayed as plain text in chat UI

---

## 📱 Frontend Usage

### **Login/Register Flow**
1. Open app → Register or Login
2. Your encryption keys are auto-generated
3. Public key sent to server, secret key stored locally

### **Chat Features**

**Start Chat:**
- Tap "Conversations" → "+" → Search user → Start chat

**Send Message:**
- Type message → Press Send
- Message encrypted automatically on client
- Server stores encrypted data

**Read Receipts:**
- Open message → Auto-marked as "read"
- Sender sees read status in real-time

**Typing Indicator:**
- Start typing → Sender sees "typing..." indicator
- Stop typing → Indicator disappears

**Group Chat:**
- Tap "+" → "Create Group"
- Add up to 15 members
- Group has shared encryption key

**Status/Stories:**
- Tap "Status" → "+" → Add photo/video
- Expires after 24 hours
- Only visible to contacts

**Calls:**
- Tap user → Call icon (phone/video)
- WebRTC establishes peer connection
- Audio/Video transmitted directly (encrypted)

---

## 🔐 Understanding the Encryption

### **How 1-on-1 Messages Work**

```
Alice's Private Key + Bob's Public Key
         ↓
      ENCRYPT
         ↓
  Ciphertext + Nonce (sent to server)
         ↓
  Server stores: { ciphertext, nonce }
         ↓
  Bob downloads message
         ↓
Bob's Private Key + Alice's Public Key
         ↓
      DECRYPT
         ↓
  Plain text message visible
```

### **How Group Messages Work**

```
Shared Group Key (symmetric)
         ↓
Alice uses group key
         ↓
      ENCRYPT
         ↓
  Message sent to all members
         ↓
Bob uses same group key
         ↓
      DECRYPT
         ↓
  All members see same message
```

---

## 🐛 Debug Mode

### **Enable Console Logs**

**Server (Node.js):**
```bash
DEBUG=* npm start
```

**Frontend (Expo):**
```javascript
// In app/src/utils/api.ts
api.interceptors.response.use(
  response => {
    console.log('API Response:', response);
    return response;
  }
);
```

### **Check Encryption Working**

```javascript
// Test in your frontend component
import EncryptionUtils from '@/utils/encryption';

const testEncryption = () => {
  const msg = "Test message";
  const key1 = // ... user1 secret key
  const key2pub = // ... user2 public key
  
  const encrypted = EncryptionUtils.encryptMessage(msg, key1, key2pub);
  console.log("Encrypted:", encrypted);
};
```

---

## 📊 Monitor Database

### **View Collections**

```bash
mongosh
use nova-chat

# View users with keys
db.users.find().pretty()

# View messages
db.messages.find().pretty()

# View conversations
db.conversations.find().pretty()

# Check message encryption
db.messages.findOne({}, {encryptedContent: 1})
```

---

## 🚨 Common Issues & Fixes

### **Issue: "Failed to connect to server"**
```bash
# Check if backend is running
curl http://localhost:5000

# If not, start it
cd server && npm start
```

### **Issue: "Encryption failed"**
```bash
# Ensure keys are generated on registration
# Check User model has publicKey and secretKey
db.users.findOne({}, {publicKey: 1, secretKey: 1})
```

### **Issue: "Socket connection failed"**
```bash
# Check Socket.io CORS in server.js
# Frontend URL should match allowed origins

# In server.js:
const io = socketIo(server, {
  cors: { origin: 'http://localhost:8081' }
});
```

### **Issue: "Message not decrypting"**
```bash
# Verify message has encryptedContent field
db.messages.findOne({encryptedContent: {$exists: true}})

# Check nonce is unique per message
db.messages.find({}).project({nonce: 1})
```

---

## 📈 Performance Tips

1. **Limit message pagination:**
   ```javascript
   messages.limit(50).skip(offset)
   ```

2. **Lazy load media:**
   ```javascript
   // Don't load all images upfront
   image={msg.mediaUrl} // loads on demand
   ```

3. **Optimize encryption:**
   ```javascript
   // Cache decryption for same sender
   const senderPublicKeyCache = new Map();
   ```

4. **Use connection pooling:**
   ```javascript
   // In MongoDB connection
   mongoose.connect(uri, {
     maxPoolSize: 10
   })
   ```

---

## 🔒 Production Checklist

- [ ] Change JWT_SECRET to strong random string
- [ ] Enable HTTPS/TLS for all connections
- [ ] Set DATABASE_URL to production MongoDB
- [ ] Enable database backups
- [ ] Configure rate limiting on API
- [ ] Set up error logging (Sentry, etc.)
- [ ] Enable CORS for production domain only
- [ ] Set secure cookies (httpOnly, secure)
- [ ] Enable request validation & sanitization
- [ ] Setup CI/CD pipeline
- [ ] Configure CDN for media files
- [ ] Monitor server health & metrics
- [ ] Setup automated tests

---

## 📚 File Structure Quick Reference

```
ChatApp/
├── server/
│   ├── .env                    ← Configuration (PORT, DB, JWT)
│   ├── server.js               ← Express + Socket.io entry
│   ├── db.js                   ← MongoDB connection
│   ├── utils/
│   │   └── encryption.js       ← Server encryption logic
│   ├── models/                 ← MongoDB schemas
│   ├── routes/                 ← API endpoints
│   └── middleware/
│       └── auth.js             ← JWT verification
│
├── app/
│   ├── .env.local              ← Frontend config (API_URL)
│   ├── src/
│   │   ├── utils/
│   │   │   ├── encryption.ts   ← Client encryption
│   │   │   └── api.ts          ← HTTP client
│   │   ├── app/                ← Screens
│   │   │   ├── chat/           ← Chat screens
│   │   │   └── (tabs)/         ← Tab navigation
│   │   └── context/            ← Global state (AppContext)
│   └── package.json
│
└── WHATSAPP_CLONE_README.md    ← Full documentation
```

---

## 🎯 Next Steps

1. **Run the app** using Terminal 1-3 setup above
2. **Create two user accounts** in the app
3. **Start a chat** between users
4. **Send messages** and watch them encrypt/decrypt
5. **Test features**: Read receipts, typing, status, calls
6. **Monitor database** to see encrypted data stored
7. **Deploy to production** with proper security

---

## 💬 Real-time Communication Flow

```
┌─────────┐  message  ┌──────────┐  encrypted  ┌────────┐
│ Client  ├──────────→│ Server   ├───────────→ │MongoDB │
│ Alice   │  (plain)  │(validates│   (with TTL)│        │
└─────────┘           └──────────┘            └────────┘
                           │
                      encryption │
                           │
                      Socket.io emit
                           │
                           ▼
                      ┌─────────┐
                      │ Client  │
                      │  Bob    │
                      │(decrypt)│
                      └─────────┘
```

---

## 🎬 Demo Workflow

**Time: 5 minutes**

1. **Register (1 min)**
   - Alice: Create account
   - Bob: Create account

2. **Start Chat (1 min)**
   - Alice: Search for Bob
   - Alice: Send message "Hey Bob! 👋"

3. **Verify Encryption (1 min)**
   - Alice: Monitor Network tab → See encrypted payload
   - Server: Check MongoDB → See ciphertext stored
   - Bob: Message appears decrypted on his screen

4. **Test Features (2 min)**
   - Bob: Reply to Alice
   - Alice: See "typing..." while Bob types
   - Alice: See read receipt when Bob opens message
   - Test: Create group, add status, view call history

---

**🎉 Congratulations! Your WhatsApp Clone is running with military-grade encryption! 🔒**

For full documentation, see `WHATSAPP_CLONE_README.md`
