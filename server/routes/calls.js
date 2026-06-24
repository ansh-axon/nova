const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Call = require('../models/Call');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const { v4: uuidv4 } = require('uuid');
const { sendPush } = require('../utils/push');
const { sendData } = require('../utils/fcmAdmin');

// @route   GET api/calls/history
// @desc    Get call history for the authenticated user
router.get('/history', auth, async (req, res) => {
  try {
    const calls = await Call.find({
      $or: [
        { caller: req.user.id },
        { receiver: req.user.id }
      ]
    })
      .populate('caller', 'username displayName avatarUrl')
      .populate('receiver', 'username displayName avatarUrl')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(calls);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error fetching call history' });
  }
});

// @route   POST api/calls/initiate
// @desc    Initiate a voice or video call
router.post('/initiate', auth, async (req, res) => {
  const { recipientId, callType, conversationId } = req.body;

  if (!recipientId || !callType) {
    return res.status(400).json({ message: 'Recipient ID and call type are required' });
  }

  if (!['voice', 'video'].includes(callType)) {
    return res.status(400).json({ message: 'Call type must be voice or video' });
  }

  try {
    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({ message: 'Recipient not found' });
    }

    const callRoomId = uuidv4();
    const signalingServer = process.env.SIGNALING_SERVER || 'ws://localhost:8080';

    const call = new Call({
      caller: req.user.id,
      receiver: recipientId,
      callType: callType,
      conversation: conversationId || null,
      callRoomId: callRoomId,
      signalingServer: signalingServer,
      status: 'ringing'
    });

    await call.save();

    const populatedCall = await Call.findById(call._id)
      .populate('caller', 'username displayName avatarUrl')
      .populate('receiver', 'username displayName avatarUrl');

    // Notify receiver via Socket.io
    req.io.to(`user_${recipientId}`).emit('incoming_call', populatedCall);

    res.json(populatedCall);

    const callerName = populatedCall.caller.displayName || populatedCall.caller.username || 'Someone';

    // ── FCM data message → full-screen incoming call even when app is closed ──
    (async () => {
      try {
        const tokCount = Array.isArray(recipient.fcmTokens) ? recipient.fcmTokens.length : 0;
        console.log(`[FCM] call initiate → recipient ${recipientId} has ${tokCount} fcmToken(s)`);
        if (Array.isArray(recipient.fcmTokens) && recipient.fcmTokens.length > 0) {
          // Notification payload (OS-shown) → reliably rings + shows on the lock
          // screen even when the app is closed. A fixed `tag` lets a later
          // cancel message REPLACE (clear) this ringing notification.
          const TONE_IDS = ['pulse','chime','ripple','glow','aurora','marimba','classic','bright','bubble','cool','melody','romantic'];
          const tone = (recipient.callRingtone && TONE_IDS.indexOf(recipient.callRingtone) >= 0) ? recipient.callRingtone : null;
          const ringChannelId = tone ? ('nova_call_' + tone) : 'nova_incoming_call_v3';
          const ringSound = tone || 'ring_call';
          const invalidTokens = await sendData(recipient.fcmTokens, {
            type: 'incoming_call',
            callId: call._id.toString(),
            callRoomId,
            callType,
            callerName,
            callerId: req.user.id,
            conversationId: conversationId || '',
          }, {
            title: `Incoming ${callType === 'video' ? 'video' : 'voice'} call`,
            body: `${callerName} is calling you on NOVA`,
            channelId: ringChannelId,
            sound: ringSound,
            tag: 'nova_call',
          });
          // Prune tokens FCM reported as permanently invalid (e.g. reinstalled app).
          if (Array.isArray(invalidTokens) && invalidTokens.length > 0) {
            await User.findByIdAndUpdate(recipientId, { $pull: { fcmTokens: { $in: invalidTokens } } });
            console.log(`[FCM] pruned ${invalidTokens.length} stale token(s) for ${recipientId}`);
          }
        }
      } catch (e) {
        console.error('[FCM] call data message failed:', e.message);
      }
    })();

    // ── Expo push fallback alert (in case FCM/notifee path isn't available) ──
    (async () => {
      try {
        if (Array.isArray(recipient.pushTokens) && recipient.pushTokens.length > 0) {
          await sendPush(recipient.pushTokens, {
            title: `Incoming ${callType === 'video' ? 'video' : 'voice'} call`,
            body: `${callerName} is calling you on NOVA`,
            channelId: 'calls-v2',
            priority: 'high',
            sound: 'ring_call.wav',
            data: { type: 'call', callRoomId, callType, conversationId: conversationId || null },
          });
        }
      } catch (e) {
        console.error('[PUSH] call push failed:', e.message);
      }
    })();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error initiating call' });
  }
});

// @route   GET api/calls/active-incoming
// @desc    Return this user's still-ringing incoming call (last 45s), if any.
//          Used when the app comes to the foreground (unlock) to show the
//          full-screen call UI only when the call is still actually ringing.
//          NOTE: must be declared BEFORE '/:callId' so it isn't captured by it.
router.get('/active-incoming', auth, async (req, res) => {
  try {
    const cutoff = new Date(Date.now() - 45 * 1000);
    const call = await Call.findOne({
      receiver: req.user.id,
      status: 'ringing',
      createdAt: { $gte: cutoff },
    })
      .populate('caller', 'username displayName avatarUrl')
      .populate('receiver', 'username displayName avatarUrl')
      .sort({ createdAt: -1 });

    res.json(call || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error fetching active incoming call' });
  }
});

// @route   GET api/calls/:callId
// @desc    Get call by ID for synchronization
router.get('/:callId', auth, async (req, res) => {
  try {
    const call = await Call.findById(req.params.callId)
      .populate('caller', 'username displayName avatarUrl')
      .populate('receiver', 'username displayName avatarUrl');

    if (!call) {
      return res.status(404).json({ message: 'Call not found' });
    }

    // Only the caller or receiver may view a call record (prevents IDOR).
    const callerId = call.caller && (call.caller._id ? call.caller._id.toString() : call.caller.toString());
    const receiverId = call.receiver && (call.receiver._id ? call.receiver._id.toString() : call.receiver.toString());
    if (callerId !== req.user.id && receiverId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to view this call' });
    }

    res.json(call);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error fetching call' });
  }
});

// @route   PUT api/calls/:callId/accept
// @desc    Accept an incoming call
router.put('/:callId/accept', auth, async (req, res) => {
  try {
    const call = await Call.findById(req.params.callId);
    if (!call) {
      return res.status(404).json({ message: 'Call not found' });
    }

    if (call.receiver.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to accept this call' });
    }

    call.status = 'accepted';
    call.startedAt = new Date();
    await call.save();

    const populatedCall = await Call.findById(call._id)
      .populate('caller', 'username displayName avatarUrl')
      .populate('receiver', 'username displayName avatarUrl');

    // Notify caller
    req.io.to(`user_${populatedCall.caller._id.toString()}`).emit('call_accepted', populatedCall);

    res.json(populatedCall);

    // Clear the receiver's ringing notification (replace via same tag) so the
    // lock-screen ringtone stops once the call is answered.
    (async () => {
      try {
        const receiver = await User.findById(call.receiver).select('fcmTokens');
        if (receiver && Array.isArray(receiver.fcmTokens) && receiver.fcmTokens.length > 0) {
          await sendData(receiver.fcmTokens, { type: 'cancel_call', callRoomId: call.callRoomId }, {
            title: 'On call',
            body: 'Call connected',
            channelId: 'nova_call_cancel',
            tag: 'nova_call',
          });
        }
      } catch (e) { /* ignore */ }
    })();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error accepting call' });
  }
});

// @route   PUT api/calls/:callId/reject
// @desc    Reject an incoming call
router.put('/:callId/reject', auth, async (req, res) => {
  try {
    const call = await Call.findById(req.params.callId);
    if (!call) {
      return res.status(404).json({ message: 'Call not found' });
    }

    if (call.receiver.toString() !== req.user.id && call.caller.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    call.status = 'rejected';
    call.endedAt = new Date();
    await call.save();

    const populatedCall = await Call.findById(call._id)
      .populate('caller', 'username displayName avatarUrl')
      .populate('receiver', 'username displayName avatarUrl');

    // Notify the other party
    if (call.caller.toString() === req.user.id) {
      req.io.to(`user_${call.receiver.toString()}`).emit('call_rejected', populatedCall);
    } else {
      req.io.to(`user_${call.caller.toString()}`).emit('call_rejected', populatedCall);
    }

    res.json(populatedCall);

    // Clear the ringing notification on the receiver's device by REPLACING it
    // (same tag) with a silent "Missed call" — works on lock screen / killed.
    (async () => {
      try {
        const receiver = await User.findById(call.receiver).select('fcmTokens');
        if (receiver && Array.isArray(receiver.fcmTokens) && receiver.fcmTokens.length > 0) {
          const cn = (populatedCall.caller && (populatedCall.caller.displayName || populatedCall.caller.username)) || 'Someone';
          await sendData(receiver.fcmTokens, { type: 'cancel_call', callRoomId: call.callRoomId }, {
            title: 'Missed call',
            body: `${cn} tried to call you on NOVA`,
            channelId: 'nova_call_cancel',
            tag: 'nova_call',
          });
        }
      } catch (e) { /* ignore */ }
    })();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error rejecting call' });
  }
});

// @route   PUT api/calls/:callId/end
// @desc    End an ongoing call
router.put('/:callId/end', auth, async (req, res) => {
  const { callQuality } = req.body;

  try {
    const call = await Call.findById(req.params.callId);
    if (!call) {
      return res.status(404).json({ message: 'Call not found' });
    }

    if (call.receiver.toString() !== req.user.id && call.caller.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Was this call still ringing (never answered) when it ended? Then it's a
    // cancelled/missed call and the receiver may still have a ringing notification.
    const wasRinging = call.status === 'ringing';

    call.status = 'ended';
    call.endedAt = new Date();
    
    if (call.startedAt) {
      call.duration = Math.floor((call.endedAt - call.startedAt) / 1000);
    }

    if (callQuality) {
      call.callQuality = callQuality;
    }

    await call.save();

    const populatedCall = await Call.findById(call._id)
      .populate('caller', 'username displayName avatarUrl')
      .populate('receiver', 'username displayName avatarUrl');

    // Notify both parties
    req.io.to(`user_${call.caller.toString()}`).emit('call_ended', populatedCall);
    req.io.to(`user_${call.receiver.toString()}`).emit('call_ended', populatedCall);

    res.json(populatedCall);

    // If the call was never answered (caller cancelled / missed), clear the
    // receiver's ringing notification by replacing it (same tag) with a silent
    // "Missed call". For answered-then-ended calls, just send a data cancel.
    (async () => {
      try {
        const receiver = await User.findById(call.receiver).select('fcmTokens');
        if (receiver && Array.isArray(receiver.fcmTokens) && receiver.fcmTokens.length > 0) {
          if (wasRinging) {
            const cn = (populatedCall.caller && (populatedCall.caller.displayName || populatedCall.caller.username)) || 'Someone';
            await sendData(receiver.fcmTokens, { type: 'cancel_call', callRoomId: call.callRoomId }, {
              title: 'Missed call',
              body: `${cn} tried to call you on NOVA`,
              channelId: 'nova_call_cancel',
              tag: 'nova_call',
            });
          } else {
            await sendData(receiver.fcmTokens, { type: 'cancel_call', callRoomId: call.callRoomId });
          }
        }
      } catch (e) { /* ignore */ }
    })();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error ending call' });
  }
});

// @route   PUT api/calls/:callId/missed
// @desc    Mark call as missed
router.put('/:callId/missed', auth, async (req, res) => {
  try {
    const call = await Call.findById(req.params.callId);
    if (!call) {
      return res.status(404).json({ message: 'Call not found' });
    }

    if (call.status !== 'ringing') {
      return res.status(400).json({ message: 'Call is not ringing' });
    }

    call.status = 'missed';
    call.endedAt = new Date();
    await call.save();

    res.json(call);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error marking call as missed' });
  }
});

module.exports = router;
