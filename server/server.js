const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const path = require('path');
const EncryptionManager = require('./utils/encryption');
require('dotenv').config();

const { connectDB } = require('./db');
const User = require('./models/User');
const Conversation = require('./models/Conversation');
const Message = require('./models/Message');

const app = express();
const server = http.createServer(app);

// Configure Socket.io with CORS allowed and optimized settings
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  // Optimize for calling applications
  transports: ['websocket', 'polling'],
  pingInterval: 30000, // Ping every 30 seconds
  pingTimeout: 10000, // 10 second timeout
  maxHttpBufferSize: 10e6, // 10MB buffer for large files
  allowEIO3: true // Support older clients
});

// Middleware
app.use(cors());
// Render (and most hosts) run the app behind a reverse proxy. Trust the first
// proxy hop so rate limiting and req.ip use the real client IP, not the proxy's.
app.set('trust proxy', 1);
app.use(express.json({ limit: '100mb' })); // Allow large uploads
app.use(express.urlencoded({ limit: '100mb', extended: true }));
// Serve static uploads. nosniff stops browsers from MIME-sniffing a file into
// an executable type; inline disposition is fine because executable types are
// blocked at upload time.
app.use('/uploads', (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
}, express.static(path.join(__dirname, 'uploads')));

// Store active socket connections: userId -> socketId
const activeSockets = {};
// Store typing status: conversationId -> Set of typing users
const typingUsers = new Map();
// Store group/meeting call rooms: roomId -> Set of userIds currently in the call (mesh)
const groupRooms = {};

// ── Socket authentication ──────────────────────────────────────────────
// New app builds present a JWT in the handshake; the authenticated user id is
// then derived from the verified token (socket.authUserId) so clients cannot
// impersonate other users.
//
// TRANSITIONAL: connections WITHOUT a token are still allowed for now so that
// older installed app builds keep working until everyone updates. Once the new
// build is rolled out, set SOCKET_AUTH_STRICT=true to reject tokenless sockets
// and fully close the impersonation gap.
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./config');
const SOCKET_AUTH_STRICT = process.env.SOCKET_AUTH_STRICT === 'true';

io.use((socket, next) => {
  const token =
    (socket.handshake.auth && socket.handshake.auth.token) ||
    (socket.handshake.headers && socket.handshake.headers['x-auth-token']);

  if (!token) {
    if (SOCKET_AUTH_STRICT) return next(new Error('Authentication required'));
    return next(); // legacy client — allowed during transition
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const uid = decoded && decoded.user && decoded.user.id;
    if (uid) socket.authUserId = String(uid);
    else if (SOCKET_AUTH_STRICT) return next(new Error('Invalid token'));
    next();
  } catch (err) {
    if (SOCKET_AUTH_STRICT) return next(new Error('Authentication failed'));
    next(); // invalid token but transition mode — fall back to legacy identity
  }
});

// Socket.io real-time connection logic
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // User joins with their identity.
  // SECURITY: prefer the verified JWT identity (socket.authUserId). The
  // client-sent value is only used as a fallback for legacy (tokenless) clients.
  socket.on('join', async (clientUserId) => {
    const userId = socket.authUserId || (clientUserId && String(clientUserId));
    if (!userId) return;
    if (socket.authUserId && clientUserId && String(clientUserId) !== socket.authUserId) {
      console.warn(`[Socket] join userId mismatch: token=${socket.authUserId} client=${clientUserId} — using token id`);
    }
    socket.userId = userId;
    socket.join(`user_${userId}`); // Join personal room
    activeSockets[userId] = socket.id;
    console.log(`User joined: ${userId} on socket ${socket.id}`);

    // Update online status in Database
    try {
      await User.findByIdAndUpdate(userId, { isOnline: true, lastSeen: new Date() });
      io.emit('user_online', { userId, isOnline: true });
    } catch (err) {
      console.error('Error updating online status:', err);
    }
  });

  // User joins a conversation room for real-time updates
  socket.on('join_conversation', (conversationId) => {
    socket.join(`conversation_${conversationId}`);
    console.log(`User ${socket.userId} joined conversation ${conversationId}`);
  });

  // User leaves a conversation room
  socket.on('leave_conversation', (conversationId) => {
    socket.leave(`conversation_${conversationId}`);
    console.log(`User ${socket.userId} left conversation ${conversationId}`);
  });

  // Typing indicator
  socket.on('user_typing', (data) => {
    // data = { conversationId, isTyping }
    const conversationRoom = `conversation_${data.conversationId}`;
    
    if (data.isTyping) {
      if (!typingUsers.has(data.conversationId)) {
        typingUsers.set(data.conversationId, new Set());
      }
      typingUsers.get(data.conversationId).add(socket.userId);
    } else {
      if (typingUsers.has(data.conversationId)) {
        typingUsers.get(data.conversationId).delete(socket.userId);
        if (typingUsers.get(data.conversationId).size === 0) {
          typingUsers.delete(data.conversationId);
        }
      }
    }

    io.to(conversationRoom).emit('typing_status', {
      conversationId: data.conversationId,
      typingUsers: Array.from(typingUsers.get(data.conversationId) || []),
      isTyping: data.isTyping
    });
  });

  // Direct typing relay (1-on-1): client emits 'typing' with the recipient id,
  // server forwards a 'typing_status' carrying senderId to that recipient.
  socket.on('typing', (data) => {
    if (!data || !data.recipientId) return;
    io.to(`user_${data.recipientId}`).emit('typing_status', {
      conversationId: data.conversationId,
      senderId: socket.userId,
      isTyping: !!data.isTyping
    });
  });

  // User is calling
  socket.on('call_initiated', (data) => {    // data = { recipientId, callRoomId, callType }
    io.to(`user_${data.recipientId}`).emit('incoming_call', {
      callerId: socket.userId,
      callRoomId: data.callRoomId,
      callType: data.callType
    });
  });

  // WebRTC Signaling with error handling
  socket.on('webrtc_offer', (data) => {
    try {
      if (!data || !data.recipientId || !data.offer) {
        console.error('[WebRTC Server] Invalid offer data:', data);
        return;
      }
      console.log(`[WebRTC Server] Offer from ${socket.userId} to ${data.recipientId} for room ${data.callRoomId}`);
      io.to(`user_${data.recipientId}`).emit('webrtc_offer', {
        senderId: socket.userId,
        offer: data.offer,
        callRoomId: data.callRoomId
      });
    } catch (err) {
      console.error('[WebRTC Server] Error handling offer:', err);
    }
  });

  socket.on('webrtc_answer', (data) => {
    try {
      if (!data || !data.callerId || !data.answer) {
        console.error('[WebRTC Server] Invalid answer data:', data);
        return;
      }
      console.log(`[WebRTC Server] Answer from ${socket.userId} to ${data.callerId} for room ${data.callRoomId}`);
      io.to(`user_${data.callerId}`).emit('webrtc_answer', {
        senderId: socket.userId,
        answer: data.answer,
        callRoomId: data.callRoomId
      });
    } catch (err) {
      console.error('[WebRTC Server] Error handling answer:', err);
    }
  });

  socket.on('webrtc_ice_candidate', (data) => {
    try {
      if (!data || !data.candidate) {
        console.error('[WebRTC Server] Invalid ICE candidate data:', data);
        return;
      }
      const targetUser = data.isAnswer ? data.callerId : data.recipientId;
      console.log(`[WebRTC Server] ICE candidate from ${socket.userId} to ${targetUser}`);
      io.to(`user_${targetUser}`).emit('webrtc_ice_candidate', {
        senderId: socket.userId,
        candidate: data.candidate,
        callRoomId: data.callRoomId
      });
    } catch (err) {
      console.error('[WebRTC Server] Error handling ICE candidate:', err);
    }
  });

  // ──────────────────────────────────────────────────────────────
  // GROUP / MEETING CALL SIGNALING (mesh topology)
  // Every participant maintains a direct PeerConnection to every other
  // participant. The server only relays signaling and tracks room membership.
  // ──────────────────────────────────────────────────────────────

  // Initiator starts a meeting and rings the invited participants
  socket.on('group_start', (data) => {
    try {
      const { roomId, callType, participantIds, caller } = data;
      if (!roomId || !Array.isArray(participantIds)) return;
      console.log(`[Group] ${socket.userId} started meeting ${roomId} (${callType}) inviting ${participantIds.length}`);
      participantIds.forEach((pid) => {
        if (pid && pid !== socket.userId) {
          io.to(`user_${pid}`).emit('group_incoming', { roomId, callType, caller });
        }
      });
    } catch (err) {
      console.error('[Group] Error in group_start:', err);
    }
  });

  // A participant joins the mesh room
  socket.on('group_join', (data) => {
    try {
      const { roomId } = data;
      if (!roomId) return;
      if (!groupRooms[roomId]) groupRooms[roomId] = new Set();
      const existingPeers = Array.from(groupRooms[roomId]).filter((id) => id !== socket.userId);

      groupRooms[roomId].add(socket.userId);
      socket.join(`group_${roomId}`);
      socket.groupRooms = socket.groupRooms || new Set();
      socket.groupRooms.add(roomId);

      console.log(`[Group] ${socket.userId} joined ${roomId}. Existing peers: [${existingPeers.join(', ')}]`);

      // Tell the joiner who is already in the room (joiner initiates offers to them)
      socket.emit('group_existing_peers', { roomId, peers: existingPeers });
      // Tell existing members that a new peer joined (they wait for the joiner's offer)
      socket.to(`group_${roomId}`).emit('group_peer_joined', { roomId, userId: socket.userId });
    } catch (err) {
      console.error('[Group] Error in group_join:', err);
    }
  });

  socket.on('group_offer', (data) => {
    const { roomId, targetId, offer } = data;
    if (!targetId || !offer) return;
    io.to(`user_${targetId}`).emit('group_offer', { roomId, senderId: socket.userId, offer });
  });

  socket.on('group_answer', (data) => {
    const { roomId, targetId, answer } = data;
    if (!targetId || !answer) return;
    io.to(`user_${targetId}`).emit('group_answer', { roomId, senderId: socket.userId, answer });
  });

  socket.on('group_ice', (data) => {
    const { roomId, targetId, candidate } = data;
    if (!targetId || !candidate) return;
    io.to(`user_${targetId}`).emit('group_ice', { roomId, senderId: socket.userId, candidate });
  });

  socket.on('group_leave', (data) => {
    try {
      const { roomId } = data;
      if (!roomId) return;
      leaveGroupRoom(socket, roomId);
    } catch (err) {
      console.error('[Group] Error in group_leave:', err);
    }
  });

  // Helper to remove a socket from a group room and notify peers
  function leaveGroupRoom(sock, roomId) {
    if (groupRooms[roomId]) {
      groupRooms[roomId].delete(sock.userId);
      if (groupRooms[roomId].size === 0) delete groupRooms[roomId];
    }
    sock.leave(`group_${roomId}`);
    if (sock.groupRooms) sock.groupRooms.delete(roomId);
    io.to(`group_${roomId}`).emit('group_peer_left', { roomId, userId: sock.userId });
    console.log(`[Group] ${sock.userId} left ${roomId}`);
  }

  // User disconnects
  socket.on('disconnect', async () => {
    console.log(`Socket disconnected: ${socket.id}`);
    // Clean up any group call rooms this socket was part of
    if (socket.groupRooms) {
      Array.from(socket.groupRooms).forEach((roomId) => leaveGroupRoom(socket, roomId));
    }
    if (socket.userId) {
      delete activeSockets[socket.userId];
      
      // Update database status
      try {
        await User.findByIdAndUpdate(socket.userId, {
          isOnline: false,
          lastSeen: new Date()
        });
        io.emit('user_offline', {
          userId: socket.userId,
          isOnline: false,
          lastSeen: new Date()
        });
      } catch (err) {
        console.error('Error updating offline status:', err);
      }
    }
  });
});

// Make io instance accessible in routes
app.use((req, res, next) => {
  req.io = io;
  req.activeSockets = activeSockets;
  next();
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/conversations', require('./routes/conversations'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/status', require('./routes/status'));
app.use('/api/calls', require('./routes/calls'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/locker', require('./routes/locker'));

// Lightweight keep-alive endpoint. An external free uptime monitor (e.g.
// UptimeRobot / cron-job.org) hits this every ~10 minutes so the free-tier
// server never spins down — avoiding the 30-50s cold-start delays.
app.get('/ping', (req, res) => {
  res.status(200).json({ ok: true, ts: Date.now() });
});

// Simple index status route
app.get('/', (req, res) => {
  res.json({ 
    name: 'Project Nova API Server',
    status: 'Running',
    version: '1.0.0',
    activeConnections: Object.keys(activeSockets).length,
    features: [
      '✅ Encrypted in transit (HTTPS/TLS) & secured at rest',
      '✅ 1-on-1 & Group Chats (15 member limit)',
      '✅ Voice & Video Calls (WebRTC)',
      '✅ Status/Stories (24hr expiry)',
      '✅ Read Receipts & Typing Indicators',
      '✅ Message Search',
      '✅ User Presence Tracking',
      '✅ Auto-delete Messages (30 days)'
    ]
  });
});

// Seed / update the NOVA AI assistant bot on startup
const seedMetaAI = async () => {
  try {
    let metaAI = await User.findOne({ username: 'meta_ai' });
    if (!metaAI) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('meta_ai_password_secure_123', salt);
      const encryptionKeys = EncryptionManager.generateKeyPair();
      
      metaAI = new User({
        username: 'meta_ai',
        password: hashedPassword,
        displayName: 'NOVA AI 🤖',
        about: 'Your smart AI assistant. Ask me anything!',
        avatarUrl: '',
        publicKey: encryptionKeys.publicKey,
        secretKey: encryptionKeys.secretKey
      });
      await metaAI.save();
      console.log('--- Seeded NOVA AI Bot User successfully ---');
    } else if (metaAI.displayName !== 'NOVA AI 🤖') {
      // Rebrand any previously-seeded "Meta AI" bot to NOVA AI
      metaAI.displayName = 'NOVA AI 🤖';
      metaAI.about = 'Your smart AI assistant. Ask me anything!';
      await metaAI.save();
      console.log('--- Rebranded AI bot to NOVA AI ---');
    }
  } catch (err) {
    console.error('Failed to seed NOVA AI Bot:', err);
  }
};

// Start Server
const PORT = process.env.PORT || 5000;
const startServer = async () => {
  await connectDB();
  await seedMetaAI();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔐 NOVA secure messaging server`);
    startSelfKeepAlive();
  });
};

// Self keep-alive: every ~10 minutes the server pings its own public URL so the
// Render free tier never hits the 15-minute idle spin-down (avoids the 30-50s
// cold-start delays). Render automatically provides RENDER_EXTERNAL_URL.
const startSelfKeepAlive = () => {
  const selfUrl = process.env.RENDER_EXTERNAL_URL || process.env.SELF_URL;
  if (!selfUrl) {
    console.log('[KeepAlive] No RENDER_EXTERNAL_URL/SELF_URL set — self keep-alive disabled (local dev).');
    return;
  }
  const TEN_MIN = 10 * 60 * 1000;
  setInterval(() => {
    fetch(`${selfUrl}/ping`)
      .then(() => console.log('[KeepAlive] self-ping ok'))
      .catch((e) => console.log('[KeepAlive] self-ping failed:', e.message));
  }, TEN_MIN);
  console.log(`[KeepAlive] self-ping enabled every 10 min -> ${selfUrl}/ping`);
};

startServer();
