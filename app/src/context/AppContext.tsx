import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Vibration, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io, Socket } from 'socket.io-client';
import { showNeonAlert } from '../components/NeonAlert';
import { getIceServers, getIceServersSync } from '../utils/iceConfig';
import { getToken, setToken as secureSetToken, deleteToken } from '../utils/tokenStore';
import {
  isAppLockEnabled as alIsEnabled,
  setAppLockEnabled as alSetEnabled,
  getLockedChats as alGetLockedChats,
  setLockedChats as alSetLockedChats,
} from '../utils/applock';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { registerForPushNotificationsAsync } from '../utils/pushNotifications';
import messaging from '@react-native-firebase/messaging';
import { registerForFcm, getPendingCall, clearPendingCall, cancelIncomingCall, isBatteryOptimized, requestIgnoreBatteryOptimizations } from '../utils/fcmCall';

// A reference to a user-picked tone file stored in the app's documents dir.
export interface ToneRef { uri: string; name: string }

export interface User {
  id: string;
  username: string;
  email?: string;
  displayName: string;
  about: string;
  avatarUrl: string;
  isOnline?: boolean;
  lastSeen?: string;
  blockedUsers?: string[];
}

export interface Message {
  _id: string;
  conversation: string;
  sender: User | string; // populated User or ID
  text: string;
  status: 'sent' | 'delivered' | 'read';
  createdAt: string;
  updatedAt: string;
  messageType?: 'text' | 'image' | 'video' | 'audio' | 'file';
  mediaUrl?: string;
  edited?: boolean;
  deletedForEveryone?: boolean;
}

export interface Conversation {
  _id: string;
  participants: User[];
  lastMessage?: Message;
  updatedAt: string;
  isGroup?: boolean;
  groupName?: string | null;
  unreadCount?: number;
}

export interface StatusStory {
  _id: string;
  user: User;
  statusType: 'image' | 'video' | 'text';
  mediaUrl?: string;
  textContent?: string;
  textColor?: string;
  backgroundColor?: string;
  viewers: { user: User | string; viewedAt: string }[];
  privacy: 'public' | 'contacts' | 'private';
  createdAt: string;
  expiresAt: string;
}

export interface CallRecord {
  _id: string;
  caller: User;
  receiver: User;
  callType: 'voice' | 'video';
  callRoomId: string;
  status: 'ringing' | 'accepted' | 'rejected' | 'ended' | 'missed';
  duration?: number;
  createdAt: string;
}

interface AppContextType {
  user: User | null;
  token: string | null;
  serverUrl: string;
  socket: Socket | null;
  conversations: Conversation[];
  users: User[];
  messages: { [conversationId: string]: Message[] };
  activeConversationId: string | null;
  loading: boolean;
  statuses: StatusStory[];
  callHistory: CallRecord[];
  missedCallCount: number;
  markCallsSeen: () => Promise<void>;
  setServerUrl: (url: string) => void;
  setActiveConversationId: (id: string | null) => void;
  login: (username: string, password: string, customUrl?: string) => Promise<boolean | { needsVerification: boolean; email?: string }>;
  register: (username: string, email: string, password: string, customUrl?: string) => Promise<{ success: boolean; needsVerification?: boolean; email?: string }>;
  verifyOtp: (email: string, code: string) => Promise<boolean>;
  resendOtp: (email: string) => Promise<boolean>;
  forgotPassword: (email: string) => Promise<boolean>;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<boolean>;
  logout: () => Promise<void>;
  updateProfile: (displayName: string, about: string, avatarUrl: string) => Promise<boolean>;
  fetchUsers: () => Promise<void>;
  fetchConversations: () => Promise<void>;
  loadMessages: (conversationId: string) => Promise<void>;
  markConversationRead: (conversationId: string) => Promise<void>;
  blockUser: (userId: string) => Promise<boolean>;
  unblockUser: (userId: string) => Promise<boolean>;
  clearChat: (conversationId: string) => Promise<boolean>;
  editMessage: (messageId: string, text: string) => Promise<boolean>;
  deleteMessageForEveryone: (messageId: string) => Promise<boolean>;
  sendMessage: (
    conversationId: string, 
    text: string, 
    messageType?: 'text' | 'image' | 'video' | 'audio' | 'file', 
    mediaUrl?: string
  ) => Promise<void>;
  startConversation: (recipientId: string) => Promise<string | null>;
  createGroup: (groupName: string, participantIds: string[]) => Promise<string | null>;
  fetchStatuses: () => Promise<void>;
  uploadStatus: (statusData: {
    statusType: 'image' | 'video' | 'text';
    mediaUrl?: string;
    textContent?: string;
    textColor?: string;
    backgroundColor?: string;
  }) => Promise<boolean>;
  uploadFile: (fileUri: string, fileMimeType: string) => Promise<{ url: string } | null>;
  markStatusViewed: (statusId: string) => Promise<void>;
  deleteStatus: (statusId: string) => Promise<boolean>;
  fetchCallHistory: () => Promise<void>;
  initiateCallLog: (recipientId: string, callType: 'voice' | 'video', conversationId?: string) => Promise<any | null>;
  endCallLog: (callId: string, duration?: number) => Promise<void>;
  chatWallpaper: string | null;
  selectedRingtone: string;
  // User-selected custom tones (picked from device). null = use default.
  customTones: { call: ToneRef | null; message: ToneRef | null; group: ToneRef | null };
  setCustomTone: (kind: 'call' | 'message' | 'group', tone: ToneRef | null) => Promise<void>;
  playMessageTone: (isGroup: boolean) => void;
  // App lock + hidden (locked) chats
  appLockEnabled: boolean;
  appLocked: boolean;
  lockedChatIds: string[];
  setAppLocked: (v: boolean) => void;
  toggleAppLock: (enabled: boolean) => Promise<void>;
  lockChat: (id: string) => Promise<void>;
  unlockChat: (id: string) => Promise<void>;
  privacyLastSeen: boolean;
  privacyReadReceipts: boolean;
  setChatWallpaper: (val: string | null) => Promise<void>;
  setSelectedRingtone: (val: string) => Promise<void>;
  setPrivacyLastSeen: (val: boolean) => Promise<void>;
  setPrivacyReadReceipts: (val: boolean) => Promise<void>;
  incomingCall: any | null;
  activeCall: any | null;
  callState: 'ringing' | 'connected' | 'ended' | null;
  callDuration: number;
  localStream: any | null;
  remoteStream: any | null;
  setIncomingCall: (call: any | null) => void;
  setActiveCall: (call: any | null) => void;
  setCallState: (state: 'ringing' | 'connected' | 'ended' | null) => void;
  setCallDuration: (duration: number) => void;
  acceptCall: (callId: string) => Promise<void>;
  rejectCall: (callId: string) => Promise<void>;
  endCall: (callId: string, duration: number) => Promise<void>;
  // ── Group / Meeting calls (mesh) ──
  groupCall: any | null;
  incomingGroupCall: any | null;
  groupCallState: 'connected' | null;
  groupLocalStream: any | null;
  groupRemoteStreams: { [userId: string]: any };
  groupParticipants: { [userId: string]: User };
  startGroupCall: (participantIds: string[], callType: 'voice' | 'video', participantUsers?: User[]) => Promise<void>;
  acceptGroupCall: () => Promise<void>;
  rejectGroupCall: () => void;
  leaveGroupCall: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Default timeout is generous (60s) because the free-tier server can "cold start"
// (wake from sleep) which takes ~30-50s on the first request after inactivity.
// Used only by auth calls, so a longer wait here is acceptable and avoids
// spurious "Connection Timeout" errors on the first login/register of the day.
const fetchWithTimeout = async (url: string, options: any = {}, timeoutMs = 60000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error: any) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      throw new Error('Connection Timeout');
    }
    throw error;
  }
};

// Returns a stable per-install device identifier, generating and persisting one on
// first use. Used to enforce "one account per device" at registration time.
const getOrCreateDeviceId = async (): Promise<string> => {
  try {
    let id = await AsyncStorage.getItem('deviceId');
    if (!id) {
      id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 12)}`;
      await AsyncStorage.setItem('deviceId', id);
    }
    return id;
  } catch {
    return `dev_fallback_${Date.now()}`;
  }
};

// Shared ICE configuration (STUN + free TURN) used by both 1-on-1 and group mesh calls.
const GROUP_PC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  ],
  iceCandidatePoolSize: 10,
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrlState] = useState<string>('https://nova-server-wg9p.onrender.com');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [messages, setMessages] = useState<{ [conversationId: string]: Message[] }>({});
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [statuses, setStatuses] = useState<StatusStory[]>([]);
  const [callHistory, setCallHistory] = useState<CallRecord[]>([]);
  // Unseen incoming missed/rejected calls → shown as a badge on the Calls tab,
  // cleared when the user opens the Calls tab. Persisted across restarts.
  const [missedCallCount, setMissedCallCount] = useState<number>(0);
  const [callsSeenAt, setCallsSeenAt] = useState<number>(0);

  const [chatWallpaper, setChatWallpaperState] = useState<string | null>(null);
  const [selectedRingtone, setSelectedRingtoneState] = useState<string>('Neon Horizon');
  const [customTones, setCustomTonesState] = useState<{ call: ToneRef | null; message: ToneRef | null; group: ToneRef | null }>({ call: null, message: null, group: null });
  // A dedicated sound ref for short message/notification tones (separate from the
  // looping call ringtone so they never interfere with each other).
  const messageToneSoundRef = useRef<any>(null);
  // Refs mirror latest values so the (once-bound) socket handlers never read stale state.
  const customTonesRef = useRef(customTones);
  useEffect(() => { customTonesRef.current = customTones; }, [customTones]);
  // Tracks which chat is currently open so we don't count its messages as unread.
  const activeConversationIdRef = useRef<string | null>(null);
  useEffect(() => { activeConversationIdRef.current = activeConversationId; }, [activeConversationId]);
  const conversationsRef = useRef<Conversation[]>([]);
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);

  // App lock + hidden chats state
  const [appLockEnabled, setAppLockEnabledState] = useState(false);
  const [appLocked, setAppLocked] = useState(false);
  const [lockedChatIds, setLockedChatIds] = useState<string[]>([]);
  const [privacyLastSeen, setPrivacyLastSeenState] = useState<boolean>(true);
  const [privacyReadReceipts, setPrivacyReadReceiptsState] = useState<boolean>(true);

  const [incomingCall, setIncomingCallState] = useState<any | null>(null);
  const [activeCall, setActiveCallState] = useState<any | null>(null);
  const incomingCallRef = useRef<any>(null);
  const activeCallRef = useRef<any>(null);

  const setIncomingCall = useCallback((call: any) => {
    setIncomingCallState(call);
    incomingCallRef.current = call;
  }, []);

  const setActiveCall = useCallback((call: any) => {
    setActiveCallState(call);
    activeCallRef.current = call;
  }, []);
  const [callState, setCallState] = useState<'ringing' | 'connected' | 'ended' | null>(null);
  const [callDuration, setCallDuration] = useState<number>(0);
  const [localStream, setLocalStream] = useState<any | null>(null);
  const [remoteStream, setRemoteStream] = useState<any | null>(null);
  const pcRef = useRef<any>(null);
  const ringtoneSoundRef = useRef<any>(null);
  const isInitializingRef = useRef<boolean>(false);
  const localStreamRef = useRef<any>(null);
  const remoteStreamRef = useRef<any>(null);
  const hasCreatedOfferRef = useRef<boolean>(false);
  const socketRef = useRef<any>(null);
  // Buffers remote ICE candidates that arrive before the remote description is set.
  // Without this, early candidates throw InvalidStateError and get dropped, which
  // breaks media flow (call "connects" but no audio/video). Flushed once remote desc is set.
  const pendingCandidatesRef = useRef<any[]>([]);

  // ── Group / Meeting call (mesh) state & refs ──
  const [groupCall, setGroupCall] = useState<any | null>(null);
  const [incomingGroupCall, setIncomingGroupCall] = useState<any | null>(null);
  const [groupCallState, setGroupCallState] = useState<'connected' | null>(null);
  const [groupLocalStream, setGroupLocalStream] = useState<any | null>(null);
  const [groupRemoteStreams, setGroupRemoteStreams] = useState<{ [userId: string]: any }>({});
  const [groupParticipants, setGroupParticipants] = useState<{ [userId: string]: User }>({});
  const groupPeersRef = useRef<{ [userId: string]: any }>({});
  const groupPendingIceRef = useRef<{ [userId: string]: any[] }>({});
  const groupLocalStreamRef = useRef<any>(null);
  const groupRoomIdRef = useRef<string | null>(null);
  const groupCallTypeRef = useRef<'voice' | 'video'>('voice');
  useEffect(() => { groupLocalStreamRef.current = groupLocalStream; }, [groupLocalStream]);

  // Keep refs in sync with state for use inside socket event closures (prevents stale closures)
  useEffect(() => { localStreamRef.current = localStream; }, [localStream]);
  useEffect(() => { remoteStreamRef.current = remoteStream; }, [remoteStream]);
  useEffect(() => { socketRef.current = socket; }, [socket]);

  const cleanupCallStreams = useCallback(() => {
    console.log('Cleaning up WebRTC call streams...');
    isInitializingRef.current = false;
    hasCreatedOfferRef.current = false;
    pendingCandidatesRef.current = [];
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch (e) {
        console.error('Error closing peer connection:', e);
      }
      pcRef.current = null;
    }
    // Use refs to access latest stream values (avoids stale closure bugs in socket handlers)
    const currentLocalStream = localStreamRef.current;
    if (currentLocalStream) {
      try {
        currentLocalStream.getTracks().forEach((track: any) => track.stop());
      } catch (e) {
        console.error('Error stopping local track:', e);
      }
      setLocalStream(null);
    }
    const currentRemoteStream = remoteStreamRef.current;
    if (currentRemoteStream) {
      try {
        currentRemoteStream.getTracks().forEach((track: any) => track.stop());
      } catch (e) {
        console.error('Error stopping remote track:', e);
      }
      setRemoteStream(null);
    }
  }, []); // No state dependencies - uses refs for latest values

  const playCallSound = useCallback(async (type: 'dialing' | 'ringing') => {
    try {
      const { Audio } = require('expo-av');
      
      if (ringtoneSoundRef.current) {
        try {
          await ringtoneSoundRef.current.stopAsync();
          await ringtoneSoundRef.current.unloadAsync();
        } catch (e) {}
        ringtoneSoundRef.current = null;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldRouteThroughEarpieceAndroid: false
      });

      // Candidate sources tried in order. Remote URLs can fail on private/LAN/offline
      // networks, so we try several mirrors and rely on Vibration (see ringing effect)
      // as a guaranteed fallback alert on the receiver's device.
      const dialingUrls = [
        'https://raw.githubusercontent.com/jitsi/jitsi-meet/master/sounds/outgoingRinging.wav',
        'https://cdn.jsdelivr.net/gh/jitsi/jitsi-meet@master/sounds/outgoingRinging.wav',
      ];

      let ringtoneUrls = [
        'https://raw.githubusercontent.com/jitsi/jitsi-meet/master/sounds/incomingMessage.wav',
        'https://cdn.jsdelivr.net/gh/jitsi/jitsi-meet@master/sounds/ring.wav',
        'https://raw.githubusercontent.com/jitsi/jitsi-meet/master/sounds/ring.wav',
      ];
      if (selectedRingtone === 'Interstellar Pulsar') {
        ringtoneUrls = [
          'https://cdnjs.cloudflare.com/ajax/libs/ion-sound/3.0.7/sounds/bell_ring.mp3',
          ...ringtoneUrls,
        ];
      }

      const candidates = type === 'dialing' ? dialingUrls : ringtoneUrls;
      // A user-picked custom ringtone takes priority for incoming calls.
      const finalCandidates = (type === 'ringing' && customTones.call?.uri)
        ? [customTones.call.uri, ...candidates]
        : candidates;
      console.log(`[SoundEngine] Attempting to play ${type} tone, ${finalCandidates.length} source(s)`);

      let loaded = false;
      for (const url of finalCandidates) {
        try {
          const { sound } = await Audio.Sound.createAsync(
            { uri: url },
            { shouldPlay: true, isLooping: true, volume: 1.0 }
          );
          ringtoneSoundRef.current = sound;
          loaded = true;
          console.log(`[SoundEngine] Playing ${type} tone from:`, url);
          break;
        } catch (e) {
          console.warn(`[SoundEngine] Source failed, trying next:`, url);
        }
      }
      if (!loaded) {
        console.warn('[SoundEngine] All audio sources failed; relying on vibration only.');
      }
    } catch (err) {
      console.error('Failed to play call sound:', err);
    }
  }, [selectedRingtone, customTones]);

  // Plays a short, non-looping message/group notification tone if the user has
  // picked one. Safe to call rapidly — it replaces any currently-playing tone.
  const playMessageTone = useCallback(async (isGroup: boolean) => {
    const tones = customTonesRef.current;
    const tone = isGroup ? tones.group : tones.message;
    if (!tone?.uri) return; // no custom tone set → stay silent (OS notif handles default)
    try {
      const { Audio } = require('expo-av');
      if (messageToneSoundRef.current) {
        try { await messageToneSoundRef.current.unloadAsync(); } catch (e) {}
        messageToneSoundRef.current = null;
      }
      const { sound } = await Audio.Sound.createAsync(
        { uri: tone.uri },
        { shouldPlay: true, isLooping: false, volume: 1.0 }
      );
      messageToneSoundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
          if (messageToneSoundRef.current === sound) messageToneSoundRef.current = null;
        }
      });
    } catch (err) {
      console.warn('[SoundEngine] message tone failed:', err);
    }
  }, []);

  const stopCallSound = useCallback(async () => {
    Vibration.cancel();
    if (ringtoneSoundRef.current) {
      try {
        console.log('[SoundEngine] Stopping and unloading call sound...');
        await ringtoneSoundRef.current.stopAsync();
        await ringtoneSoundRef.current.unloadAsync();
      } catch (e) {
        console.warn('[SoundEngine] Error unloading sound:', e);
      }
      ringtoneSoundRef.current = null;
    }
  }, []);

  const initPeerConnection = useCallback(async (callRecord: any, isCaller: boolean) => {
    if (pcRef.current) {
      console.log('[WebRTC] PeerConnection already exists, returning existing instance.');
      return pcRef.current;
    }
    
    if (isInitializingRef.current) {
      console.log('[WebRTC] Initialization already in progress, waiting for instance...');
      for (let i = 0; i < 20; i++) {
        await new Promise(resolve => setTimeout(resolve, 150));
        if (pcRef.current) return pcRef.current;
      }
      return null;
    }
    
    isInitializingRef.current = true;
    try {
      console.log('Initializing RTCPeerConnection for call:', callRecord._id || callRecord.id);
      
      // 1. Instantly release audio hardware focus before requesting getUserMedia to prevent Android resource locks
      await stopCallSound();

      // 2. Explicitly request/verify Camera and Audio/Microphone permissions before media devices getUserMedia is called
      const { Audio } = require('expo-av');
      const { Camera } = require('expo-camera');

      console.log('[WebRTC] Requesting microphone permissions...');
      const micPermission = await Audio.requestPermissionsAsync();
      if (micPermission.status !== 'granted') {
        console.warn('[WebRTC] Microphone permission denied!');
        showNeonAlert({
          title: 'MICROPHONE BLOCKED',
          message: 'Voice and video calling features require microphone access to transmit audio.',
          icon: 'mic-off-outline',
          borderColor: '#f43f5e',
          iconColor: '#f43f5e'
        });
        isInitializingRef.current = false;
        return null;
      }

      if (callRecord.callType === 'video') {
        console.log('[WebRTC] Requesting camera permissions...');
        const camPermission = await Camera.requestCameraPermissionsAsync();
        if (camPermission.status !== 'granted') {
          console.warn('[WebRTC] Camera permission denied!');
          showNeonAlert({
            title: 'CAMERA BLOCKED',
            message: 'Video calling requires camera access to transmit video streams.',
            icon: 'videocam-outline',
            borderColor: '#f43f5e',
            iconColor: '#f43f5e'
          });
          isInitializingRef.current = false;
          return null;
        }
      }

      // 3. Initialize peer connection with STUN + TURN servers for better connectivity
      const { RTCPeerConnection, mediaDevices } = require('react-native-webrtc');
      
      const pcConfig = {
        iceServers: await getIceServers(),
        iceCandidatePoolSize: 10,
      };
      
      const pc = new RTCPeerConnection(pcConfig);
      pcRef.current = pc;
      
      const constraints = {
        audio: true,
        video: callRecord.callType === 'video' ? {
          facingMode: 'user'
        } : false
      };
      
      console.log('[WebRTC] Requesting local media stream with constraints:', constraints);
      let stream;
      try {
        // Configure audio mode for call (voice only, optimized for call quality)
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          shouldRouteThroughEarpieceAndroid: true, // Route through earpiece (phone speaker)
          staysActiveInBackground: true,
          interruptionMode: 0 // Ignore interruptions (highest priority for calls)
        });
        
        stream = await mediaDevices.getUserMedia(constraints);
      } catch (err) {
        console.warn('[WebRTC] getUserMedia failed with constraints, trying audio-only fallback:', err);
        if (callRecord.callType === 'video') {
          try {
            stream = await mediaDevices.getUserMedia({ audio: true, video: false });
            showNeonAlert({
              title: 'CAMERA OFFLINE/BLOCKED',
              message: 'Failed to access device camera. Connecting call using voice only.',
              icon: 'videocam-off-outline',
              borderColor: '#f59e0b',
              iconColor: '#f59e0b'
            });
          } catch (audioErr) {
            console.error('[WebRTC] Audio fallback also failed:', audioErr);
            throw audioErr;
          }
        } else {
          throw err;
        }
      }
      setLocalStream(stream);
      
      stream.getTracks().forEach((track: any) => {
        pc.addTrack(track, stream);
      });
      
      pc.ontrack = (event: any) => {
        console.log('[WebRTC] Remote track received!', event.streams);
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
          // Ensure audio is properly enabled for remote stream
          event.streams[0].getTracks().forEach((track: any) => {
            if (track.kind === 'audio') {
              track.enabled = true;
              console.log('[WebRTC] Remote audio track enabled');
            }
          });
        }
      };
      
      pc.onicecandidate = (event: any) => {
        const currentSocket = socketRef.current;
        if (event.candidate && currentSocket) {
          console.log('[WebRTC] Local ICE candidate generated');
          const callerId = typeof callRecord.caller === 'object' 
            ? (callRecord.caller._id || callRecord.caller.id) 
            : callRecord.caller;
          const receiverId = typeof callRecord.receiver === 'object' 
            ? (callRecord.receiver._id || callRecord.receiver.id) 
            : callRecord.receiver;
          
          currentSocket.emit('webrtc_ice_candidate', {
            callerId: callerId,
            recipientId: receiverId,
            candidate: event.candidate,
            isAnswer: !isCaller,
            callRoomId: callRecord.callRoomId
          });
        }
      };
      
      pc.onconnectionstatechange = () => {
        console.log('[WebRTC] Connection State changed:', pc.connectionState);
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          console.warn('[WebRTC] Connection failed or disconnected, attempting to restart ICE...');
        }
      };

      // Monitor ICE connection state for better diagnostics
      pc.oniceconnectionstatechange = () => {
        console.log('[WebRTC] ICE Connection State:', pc.iceConnectionState);
        if (pc.iceConnectionState === 'failed') {
          console.error('[WebRTC] ICE Connection failed - checking for NAT/firewall issues');
        }
      };

      // Monitor ICE gathering state
      pc.onicegatheringstatechange = () => {
        console.log('[WebRTC] ICE Gathering State:', pc.iceGatheringState);
      };
      
      isInitializingRef.current = false;
      return pc;
    } catch (err) {
      console.error('[WebRTC] Failed to initialize peer connection:', err);
      isInitializingRef.current = false;
      return null;
    }
  }, [stopCallSound]); // Uses socketRef instead of socket state to avoid stale closure

  const acceptCall = async (callId: string) => {
    try {
      console.log('[CallManager] User accepted call. Stopping ringtone instantly.');
      await stopCallSound();
      
      // Configure audio mode for active call (optimized for two-way communication)
      const { Audio } = require('expo-av');
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          shouldRouteThroughEarpieceAndroid: true, // Route through earpiece (phone speaker)
          staysActiveInBackground: true,
          interruptionMode: 0 // Highest priority for calls
        });
        console.log('[CallManager] Audio mode configured for active call');
      } catch (audioErr) {
        console.warn('[CallManager] Warning: Could not set audio mode:', audioErr);
      }
      
      const response = await fetch(`${serverUrl}/api/calls/${callId}/accept`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setActiveCall(data);
        setCallState('connected');
        setIncomingCall(null);
        // DO NOT call initPeerConnection here!
        // Receiver B waits for Caller A's webrtc_offer, which lazily creates B's PeerConnection.
        // Calling it here caused a race condition: B's initPeerConnection would lock isInitializingRef,
        // blocking the webrtc_offer handler from creating the PC, causing a deadlock.
      }
    } catch (err) {
      console.error('Accept call error:', err);
    }
  };

  const rejectCall = async (callId: string) => {
    try {
      cleanupCallStreams();
      await fetch(`${serverUrl}/api/calls/${callId}/reject`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      setCallState('ended');
      setTimeout(() => {
        setCallState(null);
        setActiveCall(null);
        setIncomingCall(null);
      }, 1500);
    } catch (err) {
      console.error('Reject call error:', err);
    }
  };

  const endCall = async (callId: string, duration: number) => {
    try {
      cleanupCallStreams();
      
      // Reset audio mode to default
      try {
        const { Audio } = require('expo-av');
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: false,
          shouldRouteThroughEarpieceAndroid: false,
          staysActiveInBackground: false,
          interruptionMode: 1 // Default interruption mode
        });
        console.log('[CallManager] Audio mode reset to default');
      } catch (audioErr) {
        console.warn('[CallManager] Warning: Could not reset audio mode:', audioErr);
      }
      
      await fetch(`${serverUrl}/api/calls/${callId}/end`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ duration })
      });
      setCallState('ended');
      setTimeout(() => {
        setCallState(null);
        setActiveCall(null);
        setIncomingCall(null);
      }, 1500);
    } catch (err) {
      console.error('End call error:', err);
    }
  };

  // ──────────────────────────────────────────────────────────────
  // GROUP / MEETING CALLS (mesh): each participant holds a direct
  // PeerConnection to every other participant. Good for ~4-6 video
  // and more for voice. The server only relays signaling.
  // ──────────────────────────────────────────────────────────────

  const getGroupLocalMedia = async (callType: 'voice' | 'video') => {
    if (groupLocalStreamRef.current) return groupLocalStreamRef.current;
    // Warm the TURN/ICE cache so mesh peers get reliable servers
    await getIceServers();
    try {
      const { Audio } = require('expo-av');
      const { mediaDevices } = require('react-native-webrtc');

      const micPerm = await Audio.requestPermissionsAsync();
      if (micPerm.status !== 'granted') {
        showNeonAlert({ title: 'MICROPHONE BLOCKED', message: 'Group calls require microphone access.', icon: 'mic-off-outline', borderColor: '#f43f5e', iconColor: '#f43f5e' });
        return null;
      }
      if (callType === 'video') {
        const { Camera } = require('expo-camera');
        await Camera.requestCameraPermissionsAsync();
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldRouteThroughEarpieceAndroid: false,
        staysActiveInBackground: true,
        interruptionMode: 0
      });

      let stream;
      try {
        stream = await mediaDevices.getUserMedia({
          audio: true,
          video: callType === 'video' ? { facingMode: 'user' } : false
        });
      } catch (e) {
        console.warn('[Group] getUserMedia failed, falling back to audio only:', e);
        stream = await mediaDevices.getUserMedia({ audio: true, video: false });
      }
      groupLocalStreamRef.current = stream;
      setGroupLocalStream(stream);
      return stream;
    } catch (err) {
      console.error('[Group] getGroupLocalMedia error:', err);
      return null;
    }
  };

  // Creates (or returns existing) a mesh peer connection to a specific participant.
  const createGroupPeer = (peerId: string, _isInitiator: boolean) => {
    if (groupPeersRef.current[peerId]) return groupPeersRef.current[peerId];
    const { RTCPeerConnection } = require('react-native-webrtc');
    const pc = new RTCPeerConnection({ iceServers: getIceServersSync(), iceCandidatePoolSize: 10 });
    groupPeersRef.current[peerId] = pc;
    if (!groupPendingIceRef.current[peerId]) groupPendingIceRef.current[peerId] = [];

    const localStream = groupLocalStreamRef.current;
    if (localStream) {
      localStream.getTracks().forEach((track: any) => pc.addTrack(track, localStream));
    }

    pc.ontrack = (event: any) => {
      if (event.streams && event.streams[0]) {
        setGroupRemoteStreams((prev) => ({ ...prev, [peerId]: event.streams[0] }));
      }
    };
    pc.onicecandidate = (event: any) => {
      if (event.candidate && socketRef.current && groupRoomIdRef.current) {
        socketRef.current.emit('group_ice', { roomId: groupRoomIdRef.current, targetId: peerId, candidate: event.candidate });
      }
    };
    pc.onconnectionstatechange = () => {
      console.log(`[Group] Peer ${peerId} connection state:`, pc.connectionState);
    };
    return pc;
  };

  const flushGroupIce = async (peerId: string) => {
    const pc = groupPeersRef.current[peerId];
    const pending = groupPendingIceRef.current[peerId] || [];
    groupPendingIceRef.current[peerId] = [];
    if (!pc || pending.length === 0) return;
    const { RTCIceCandidate } = require('react-native-webrtc');
    for (const c of pending) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); }
      catch (e: any) { console.warn('[Group] flush ice err:', e.message); }
    }
  };

  const cleanupGroupCall = () => {
    Object.values(groupPeersRef.current).forEach((pc: any) => { try { pc.close(); } catch (e) {} });
    groupPeersRef.current = {};
    groupPendingIceRef.current = {};
    const ls = groupLocalStreamRef.current;
    if (ls) { try { ls.getTracks().forEach((t: any) => t.stop()); } catch (e) {} }
    groupLocalStreamRef.current = null;
    groupRoomIdRef.current = null;
    setGroupLocalStream(null);
    setGroupRemoteStreams({});
    setGroupParticipants({});
  };

  const startGroupCall = async (participantIds: string[], callType: 'voice' | 'video', participantUsers: User[] = []) => {
    if (!user || !socketRef.current) return;
    const roomId = `meet_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    groupRoomIdRef.current = roomId;
    groupCallTypeRef.current = callType;

    const stream = await getGroupLocalMedia(callType);
    if (!stream) { groupRoomIdRef.current = null; return; }

    const infoMap: { [id: string]: User } = {};
    participantUsers.forEach((u) => { if (u) infoMap[u.id] = u; });
    setGroupParticipants(infoMap);
    setGroupCall({ roomId, callType, isInitiator: true, participantIds });
    setGroupCallState('connected');

    socketRef.current.emit('group_start', {
      roomId,
      callType,
      participantIds,
      caller: { id: user.id, name: user.displayName || user.username, avatar: user.avatarUrl }
    });
    socketRef.current.emit('group_join', { roomId });
  };

  const acceptGroupCall = async () => {
    const inc = incomingGroupCall;
    if (!inc || !socketRef.current) return;
    groupRoomIdRef.current = inc.roomId;
    groupCallTypeRef.current = inc.callType;

    const stream = await getGroupLocalMedia(inc.callType);
    if (!stream) { groupRoomIdRef.current = null; return; }

    if (inc.caller) {
      setGroupParticipants((prev) => ({
        ...prev,
        [inc.caller.id]: { id: inc.caller.id, displayName: inc.caller.name, avatarUrl: inc.caller.avatar } as User
      }));
    }
    setGroupCall({ roomId: inc.roomId, callType: inc.callType, isInitiator: false });
    setGroupCallState('connected');
    setIncomingGroupCall(null);
    socketRef.current.emit('group_join', { roomId: inc.roomId });
  };

  const rejectGroupCall = () => {
    setIncomingGroupCall(null);
  };

  const leaveGroupCall = () => {
    const roomId = groupRoomIdRef.current;
    if (roomId && socketRef.current) socketRef.current.emit('group_leave', { roomId });
    cleanupGroupCall();
    setGroupCall(null);
    setGroupCallState(null);
    setIncomingGroupCall(null);
    try {
      const { Audio } = require('expo-av');
      Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: false, shouldRouteThroughEarpieceAndroid: false, staysActiveInBackground: false, interruptionMode: 1 });
    } catch (e) {}
  };

  // Custom setter for server URL that saves to AsyncStorage
  const setServerUrl = async (url: string) => {
    const formattedUrl = url.trim().replace(/\/$/, ''); // Remove trailing slash
    setServerUrlState(formattedUrl);
    await AsyncStorage.setItem('serverUrl', formattedUrl);
  };

  // Load session from AsyncStorage on startup
  useEffect(() => {
    const loadSession = async () => {
      try {
        const storedUrl = await AsyncStorage.getItem('serverUrl');
        const defaultUrl = 'https://nova-server-wg9p.onrender.com';
        // Migrate away from old/dead tunnel URLs so existing installs pick up the live server.
        const isStale = storedUrl && (storedUrl.includes('trycloudflare.com') || storedUrl.includes('192.168.') || storedUrl.includes('localhost') || storedUrl.includes('10.0.2.2'));
        if (storedUrl && !isStale) {
          setServerUrlState(storedUrl);
        } else {
          setServerUrlState(defaultUrl);
          await AsyncStorage.setItem('serverUrl', defaultUrl);
        }
        
        const storedToken = await getToken();
        const storedUser = await AsyncStorage.getItem('user');
        
        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(JSON.parse(storedUser));
        }

        const storedWallpaper = await AsyncStorage.getItem('chatWallpaper');
        if (storedWallpaper) {
          setChatWallpaperState(storedWallpaper);
        }

        const storedRingtone = await AsyncStorage.getItem('selectedRingtone');
        if (storedRingtone) {
          setSelectedRingtoneState(storedRingtone);
        }

        // Restore any user-picked custom tones (call / message / group)
        try {
          const [callT, msgT, grpT] = await Promise.all([
            AsyncStorage.getItem('customTone_call'),
            AsyncStorage.getItem('customTone_message'),
            AsyncStorage.getItem('customTone_group'),
          ]);
          setCustomTonesState({
            call: callT ? JSON.parse(callT) : null,
            message: msgT ? JSON.parse(msgT) : null,
            group: grpT ? JSON.parse(grpT) : null,
          });
        } catch (e) {
          console.warn('Failed to load custom tones:', e);
        }

        // Restore app-lock + locked-chats state
        try {
          const [enabled, locked] = await Promise.all([alIsEnabled(), alGetLockedChats()]);
          setAppLockEnabledState(enabled);
          setLockedChatIds(locked);
          // If app lock is on, start locked so the gate shows on launch.
          if (enabled) setAppLocked(true);
        } catch (e) {
          console.warn('Failed to load app lock state:', e);
        }

        const storedLastSeen = await AsyncStorage.getItem('privacyLastSeen');
        if (storedLastSeen) {
          setPrivacyLastSeenState(storedLastSeen === 'true');
        }

        const storedReadReceipts = await AsyncStorage.getItem('privacyReadReceipts');
        if (storedReadReceipts) {
          setPrivacyReadReceiptsState(storedReadReceipts === 'true');
        }
      } catch (err) {
        console.error('Failed to load session:', err);
      } finally {
        setLoading(false);
      }
    };
    loadSession();
  }, []);

  // Register for push notifications once authenticated, and upload the Expo
  // push token to the server so it can notify this device when the app is closed.
  const pushTokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!token || !user) return;
    let cancelled = false;
    (async () => {
      const pushToken = await registerForPushNotificationsAsync();
      if (cancelled || !pushToken) return;
      pushTokenRef.current = pushToken;
      try {
        await fetch(`${serverUrl}/api/users/push-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ token: pushToken }),
        });
      } catch (e) {
        console.warn('[PUSH] token upload failed:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [token, user]);

  // When the user taps a push notification, open the relevant screen.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      try {
        const data: any = response.notification.request.content.data || {};
        if (data.type === 'message' && data.conversationId) {
          router.push(`/chat/${data.conversationId}` as any);
        } else if (data.type === 'call') {
          // Bring the app forward; the incoming-call UI is driven by the socket
          // once it reconnects.
          router.push('/(tabs)' as any);
        }
      } catch (e) {
        console.warn('[PUSH] response handling failed:', e);
      }
    });
    return () => sub.remove();
  }, []);

  // ── Native FCM (full-screen incoming-call data messages) ──
  const fcmTokenRef = useRef<string | null>(null);

  // Shows a one-time popup asking the user to exempt NOVA from battery
  // optimization (and enable Autostart on OEM ROMs). Without this, a fully
  // closed app won't receive the incoming-call wake-up on phones like
  // Infinix/Oppo/Xiaomi. Tapping a button opens the relevant system screen.
  const maybePromptBatteryOptimization = useCallback(async () => {
    try {
      const optimized = await isBatteryOptimized();
      if (!optimized) return; // already exempt — nothing to do
      const shown = await AsyncStorage.getItem('battery_opt_prompt_v1');
      if (shown === 'done') return; // don't nag every login

      showNeonAlert({
        title: 'ALLOW CALLS WHEN CLOSED',
        message:
          'NOVA needs to run in the background so calls reach you even when the app is closed or your screen is locked.\n\nTap "Allow" and choose YES on the next screen.',
        icon: 'battery-charging-outline',
        borderColor: '#00ddff',
        iconColor: '#00ddff',
        buttons: [
          { text: 'Later', style: 'cancel' },
          {
            text: 'Allow',
            style: 'default',
            onPress: async () => {
              await AsyncStorage.setItem('battery_opt_prompt_v1', 'done');
              // One-tap system dialog: "Allow NOVA to ignore battery optimisations?"
              await requestIgnoreBatteryOptimizations();
            },
          },
        ],
      });
    } catch (e) { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!token || !user) return;
    let cancelled = false;

    const uploadToken = async (fcmToken: string) => {
      fcmTokenRef.current = fcmToken;
      try {
        await fetch(`${serverUrl}/api/users/fcm-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ token: fcmToken }),
        });
      } catch (e) {
        console.warn('[FCM] token upload failed:', e);
      }
    };

    (async () => {
      // Try a few times — on a fresh install the native FCM layer may take a
      // moment to be ready right after login.
      for (let attempt = 0; attempt < 3 && !cancelled; attempt++) {
        const res = await registerForFcm();
        if (cancelled) return;
        // Report the step-by-step outcome to the server so the failure point
        // is visible in logs (device logcat is not otherwise reachable).
        try {
          await fetch(`${serverUrl}/api/users/fcm-debug`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ detail: `attempt${attempt}:${res.detail}` }),
          });
        } catch (e) {}
        if (res.token) {
          await uploadToken(res.token);
          // One-time nudge to exempt the app from battery optimization so
          // incoming calls can wake it even when fully closed (required on
          // aggressive OEM ROMs like Infinix/Oppo/Xiaomi).
          maybePromptBatteryOptimization();
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    })();

    // If FCM rotates the device token, re-upload it.
    const unsubToken = messaging().onTokenRefresh(async (newToken: string) => {
      if (!cancelled && newToken) await uploadToken(newToken);
    });

    // Foreground data messages: the socket already drives the in-app call UI,
    // so here we only dismiss a full-screen notification if the call cancelled.
    const unsub = messaging().onMessage(async (rm: any) => {
      const data: any = rm?.data || {};
      if (data.type === 'cancel_call') await cancelIncomingCall();
    });

    return () => { cancelled = true; unsub(); unsubToken(); };
  }, [token, user]);

  // Reconcile a call that arrived while the app was closed: when the app opens
  // (or returns to foreground), act on the pending full-screen notification.
  const reconcilePendingCall = useCallback(async () => {
    try {
      const data = await getPendingCall();
      if (!data || data.type !== 'incoming_call' || !data.callId) return;
      await clearPendingCall();
      await cancelIncomingCall();
      if (data._action === 'reject') {
        rejectCall(data.callId);
        return;
      }
      // Show the in-app incoming-call UI so the WebRTC handshake can proceed.
      const callObj: any = {
        _id: data.callId,
        callRoomId: data.callRoomId,
        callType: data.callType === 'video' ? 'video' : 'voice',
        caller: { _id: data.callerId, id: data.callerId, displayName: data.callerName, username: data.callerName, avatarUrl: '' },
        receiver: user,
        status: 'ringing',
      };
      setIncomingCall(callObj);
      setCallState('ringing');
      if (data._action === 'accept') {
        acceptCall(data.callId);
      }
    } catch (e) {
      console.warn('[FCM] reconcile pending call failed:', e);
    }
  }, [user]);

  useEffect(() => {
    if (!token || !user) return;
    reconcilePendingCall();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') reconcilePendingCall();
    });
    return () => sub.remove();
  }, [token, user, reconcilePendingCall]);


  // Initialize and manage Socket.io connection
  useEffect(() => {
    if (!token || !user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    console.log(`Connecting to Socket.io server at: ${serverUrl}`);
    const socketInstance = io(serverUrl, {
      transports: ['websocket'],
      forceNew: true,
      // Authenticate the socket with the JWT so the server can trust our identity.
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10
    });

    // Flushes any ICE candidates that were buffered while waiting for the remote
    // description. Declared here so all WebRTC socket handlers below can reuse it.
    async function flushPendingCandidates() {
      const pc = pcRef.current;
      if (!pc || pendingCandidatesRef.current.length === 0) return;
      const { RTCIceCandidate } = require('react-native-webrtc');
      const queued = pendingCandidatesRef.current;
      pendingCandidatesRef.current = [];
      console.log(`[WebRTC] Flushing ${queued.length} buffered ICE candidate(s)`);
      for (const candidate of queued) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          const err = e as any;
          console.warn('Error flushing buffered ICE candidate:', err.message);
        }
      }
    }

    socketInstance.on('connect', () => {
      console.log('Socket.io connected successfully');
      socketInstance.emit('join', user.id);
    });

    // Handle socket reconnection
    socketInstance.on('reconnect', () => {
      console.log('[Socket.io] Reconnected to server');
      socketInstance.emit('join', user.id);
    });

    socketInstance.on('reconnect_attempt', () => {
      console.log('[Socket.io] Attempting to reconnect...');
    });

    socketInstance.on('disconnect', (reason: string) => {
      console.warn('[Socket.io] Disconnected:', reason);
      if (reason === 'io server disconnect') {
        // Server intentionally closed connection, try to reconnect
        socketInstance.connect();
      }
    });

    socketInstance.on('connect_error', (error: any) => {
      console.error('[Socket.io] Connection error:', error);
    });

    socketInstance.on('message_received', (newMessage: Message) => {
      console.log('New message received via Socket:', newMessage);
      const convId = newMessage.conversation;

      // Play the user's chosen message/group tone for incoming messages
      // (server only emits this event to recipients, never the sender).
      try {
        const conv = conversationsRef.current.find((c) => c._id === convId);
        playMessageTone(!!(conv && conv.isGroup));
      } catch (e) { /* non-fatal */ }

      // 1. Append message to the conversation's message history if loaded
      setMessages((prev) => {
        const convMessages = prev[convId] || [];
        // Prevent duplicate appends
        if (convMessages.some((m) => m._id === newMessage._id)) return prev;
        return {
          ...prev,
          [convId]: [...convMessages, newMessage]
        };
      });

      // 2. Update lastMessage in the corresponding conversation
      setConversations((prevConvs) => {
        const index = prevConvs.findIndex((c) => c._id === convId);
        if (index === -1) {
          // If conversation is not yet loaded in list, fetch conversations again
          fetchConversations();
          return prevConvs;
        }

        const updatedConvs = [...prevConvs];
        const isActiveChat = activeConversationIdRef.current === convId;
        updatedConvs[index] = {
          ...updatedConvs[index],
          lastMessage: newMessage,
          updatedAt: newMessage.createdAt,
          // Bump the unread badge unless the user is currently viewing this chat.
          unreadCount: isActiveChat ? 0 : ((updatedConvs[index].unreadCount || 0) + 1),
        };
        // Sort conversations by updated date (newest first)
        return updatedConvs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      });
    });

    // A message was edited by its sender — update it in place everywhere.
    socketInstance.on('message_edited', (updated: Message) => {
      const convId = (updated as any).conversation;
      setMessages((prev) => {
        const list = prev[convId] || [];
        return { ...prev, [convId]: list.map((m) => (m._id === updated._id ? updated : m)) };
      });
    });

    // A message was deleted for everyone — replace it with a tombstone.
    socketInstance.on('message_deleted', (data: { _id: string; conversation: string }) => {
      setMessages((prev) => {
        const list = prev[data.conversation] || [];
        return {
          ...prev,
          [data.conversation]: list.map((m) =>
            m._id === data._id ? { ...m, deletedForEveryone: true, text: '', mediaUrl: undefined } : m
          ),
        };
      });
    });

    socketInstance.on('user_status_changed', (data: { userId: string; isOnline: boolean; lastSeen?: string }) => {
      setUsers((prevUsers) =>
        prevUsers.map((u) => (u.id === data.userId ? { ...u, isOnline: data.isOnline, lastSeen: data.lastSeen } : u))
      );

      // Update online status in conversation participants lists
      setConversations((prevConvs) =>
        prevConvs.map((c) => ({
          ...c,
          participants: c.participants.map((p) =>
            p.id === data.userId ? { ...p, isOnline: data.isOnline, lastSeen: data.lastSeen } : p
          )
        }))
      );
    });

    // The server actually emits 'user_online' / 'user_offline' — wire both so the
    // live online dots update in real time.
    const applyPresence = (userId: string, isOnline: boolean, lastSeen?: string) => {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, isOnline, lastSeen } : u)));
      setConversations((prev) =>
        prev.map((c) => ({
          ...c,
          participants: c.participants.map((p) => (p.id === userId ? { ...p, isOnline, lastSeen } : p))
        }))
      );
    };
    socketInstance.on('user_online', (data: { userId: string; isOnline?: boolean }) => {
      applyPresence(data.userId, true);
    });
    socketInstance.on('user_offline', (data: { userId: string; lastSeen?: string }) => {
      applyPresence(data.userId, false, data.lastSeen);
    });

    // Read receipts: the other participant read our messages → flip them to 'read' (double tick)
    socketInstance.on('messages_read', (data: { conversationId: string; readerId: string }) => {
      setMessages((prev) => {
        const convMsgs = prev[data.conversationId];
        if (!convMsgs) return prev;
        const updated = convMsgs.map((m) => {
          const senderId = typeof m.sender === 'string' ? m.sender : (m.sender as any)?._id || (m.sender as any)?.id;
          return senderId !== data.readerId ? { ...m, status: 'read' as const } : m;
        });
        return { ...prev, [data.conversationId]: updated };
      });
    });

    socketInstance.on('typing_status', (data: { conversationId: string; senderId: string; isTyping: boolean }) => {
      // Handle active conversation typing indicators in UI
      console.log('Typing status update:', data);
    });

    socketInstance.on('incoming_call', (data) => {
      console.log('Socket incoming call received:', data);
      setIncomingCall(data);
      setCallState('ringing');
    });

    socketInstance.on('call_accepted', async (data) => {
      console.log('Socket call accepted received:', data);
      setActiveCall(data);
      setCallState('connected');
      setIncomingCall(null);

      // Guard: prevent duplicate offer if HTTP polling already handled it
      if (hasCreatedOfferRef.current) {
        console.log('[WebRTC] Offer already created via polling, skipping socket handler duplicate');
        return;
      }
      hasCreatedOfferRef.current = true;

      // Caller A initializes peer connection and creates offer!
      const pc = await initPeerConnection(data, true);
      if (pc) {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socketInstance.emit('webrtc_offer', {
            recipientId: data.receiver._id || data.receiver.id,
            offer: offer,
            callRoomId: data.callRoomId
          });
          console.log('WebRTC Offer sent to recipient');
        } catch (e) {
          console.error('Error creating offer:', e);
        }
      }
    });

    socketInstance.on('call_rejected', () => {
      console.log('Socket call rejected received');
      setCallState('ended');
      cleanupCallStreams();
      setTimeout(() => {
        setCallState(null);
        setActiveCall(null);
        setIncomingCall(null);
      }, 1500);
    });

    socketInstance.on('call_ended', () => {
      console.log('Socket call ended received');
      setCallState('ended');
      cleanupCallStreams();
      setTimeout(() => {
        setCallState(null);
        setActiveCall(null);
        setIncomingCall(null);
      }, 1500);
    });

    socketInstance.on('webrtc_offer', async (data) => {
      console.log('Socket WebRTC Offer received:', data.callRoomId);
      const currentCall = activeCallRef.current || incomingCallRef.current;
      if (!currentCall) return;
      
      const { RTCSessionDescription } = require('react-native-webrtc');
      const pc = pcRef.current || await initPeerConnection(currentCall, false);
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
          await flushPendingCandidates();
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          
          socketInstance.emit('webrtc_answer', {
            callerId: data.senderId,
            answer: answer,
            callRoomId: data.callRoomId
          });
          console.log('WebRTC Answer sent back to caller');
        } catch (e) {
          console.error('Error handling offer:', e);
        }
      }
    });

    socketInstance.on('webrtc_answer', async (data) => {
      console.log('Socket WebRTC Answer received:', data.callRoomId);
      const pc = pcRef.current;
      if (pc) {
        const { RTCSessionDescription } = require('react-native-webrtc');
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
          await flushPendingCandidates();
          console.log('WebRTC remote description set successfully');
        } catch (e) {
          console.error('Error setting remote description:', e);
        }
      }
    });

    socketInstance.on('webrtc_ice_candidate', async (data) => {
      console.log('Socket WebRTC ICE candidate received');
      if (!data.candidate) return;
      const pc = pcRef.current;
      // Only add candidates once the remote description exists; otherwise buffer them.
      // addIceCandidate before setRemoteDescription throws InvalidStateError and the
      // candidate is lost, which is a common cause of "connected but no media".
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        const { RTCIceCandidate } = require('react-native-webrtc');
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          console.log('Added remote ICE candidate successfully');
        } catch (e) {
          const err = e as any;
          console.warn('Error adding ICE candidate:', err.message);
        }
      } else {
        console.log('Remote description not ready, buffering ICE candidate');
        pendingCandidatesRef.current.push(data.candidate);
      }
    });

    // ── GROUP / MEETING mesh signaling handlers ──
    socketInstance.on('group_incoming', (data) => {
      console.log('[Group] Incoming meeting:', data.roomId);
      if (groupRoomIdRef.current === data.roomId) return; // already in this room
      setIncomingGroupCall(data);
    });

    socketInstance.on('group_existing_peers', async (data) => {
      const { roomId, peers } = data;
      console.log('[Group] Existing peers to offer:', peers);
      for (const peerId of peers) {
        try {
          const pc = createGroupPeer(peerId, true);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socketInstance.emit('group_offer', { roomId, targetId: peerId, offer });
        } catch (e) {
          console.error('[Group] Error creating offer for', peerId, e);
        }
      }
    });

    socketInstance.on('group_peer_joined', (data) => {
      // A newer participant joined; they will send us an offer. Nothing to do here.
      console.log('[Group] Peer joined (will offer to us):', data.userId);
    });

    socketInstance.on('group_offer', async (data) => {
      const { roomId, senderId, offer } = data;
      const { RTCSessionDescription } = require('react-native-webrtc');
      try {
        const pc = createGroupPeer(senderId, false);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        await flushGroupIce(senderId);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socketInstance.emit('group_answer', { roomId, targetId: senderId, answer });
      } catch (e) {
        console.error('[Group] Error handling offer from', senderId, e);
      }
    });

    socketInstance.on('group_answer', async (data) => {
      const { senderId, answer } = data;
      const pc = groupPeersRef.current[senderId];
      if (!pc) return;
      const { RTCSessionDescription } = require('react-native-webrtc');
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        await flushGroupIce(senderId);
      } catch (e) {
        console.error('[Group] Error setting answer from', senderId, e);
      }
    });

    socketInstance.on('group_ice', async (data) => {
      const { senderId, candidate } = data;
      if (!candidate) return;
      const pc = groupPeersRef.current[senderId];
      const { RTCIceCandidate } = require('react-native-webrtc');
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
        catch (e: any) { console.warn('[Group] add ice err:', e.message); }
      } else {
        if (!groupPendingIceRef.current[senderId]) groupPendingIceRef.current[senderId] = [];
        groupPendingIceRef.current[senderId].push(candidate);
      }
    });

    socketInstance.on('group_peer_left', (data) => {
      const { userId } = data;
      console.log('[Group] Peer left:', userId);
      const pc = groupPeersRef.current[userId];
      if (pc) { try { pc.close(); } catch (e) {} delete groupPeersRef.current[userId]; }
      delete groupPendingIceRef.current[userId];
      setGroupRemoteStreams((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [token, user, serverUrl]);

  // HTTP Fallback Polling for Ringing State Synchronization
  useEffect(() => {
    if (callState !== 'ringing' || !activeCall || !token) return;
    
    console.log('Ringing state detected. Starting HTTP status fallback sync polling...');
    const callId = activeCall._id || activeCall.id;
    if (!callId || callId.startsWith('temp_')) return;
    
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`${serverUrl}/api/calls/${callId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const callData = await response.json();
          console.log('Polling call status:', callData.status);
          
          if (callData.status === 'accepted') {
            clearInterval(interval);
            setActiveCall(callData);
            setCallState('connected');
            setIncomingCall(null);
            
            // Guard: prevent duplicate offer if socket handler already handled it
            if (hasCreatedOfferRef.current) {
              console.log('[WebRTC] Offer already created via socket, skipping polling duplicate');
              return;
            }
            hasCreatedOfferRef.current = true;

            // Caller A initializes peer connection and creates offer!
            const pc = await initPeerConnection(callData, true);
            if (pc) {
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              const currentSocket = socketRef.current;
              if (currentSocket) {
                currentSocket.emit('webrtc_offer', {
                  recipientId: callData.receiver._id || callData.receiver.id,
                  offer: offer,
                  callRoomId: callData.callRoomId
                });
              }
            }
          } else if (callData.status === 'rejected' || callData.status === 'ended' || callData.status === 'missed') {
            clearInterval(interval);
            setCallState('ended');
            cleanupCallStreams();
            setTimeout(() => {
              setCallState(null);
              setActiveCall(null);
              setIncomingCall(null);
            }, 1500);
          }
        }
      } catch (err) {
        console.error('Ringing poll error:', err);
      }
    }, 1500);
    
    return () => {
      clearInterval(interval);
    };
  }, [callState, activeCall, token, serverUrl, socket, initPeerConnection, cleanupCallStreams]);

  // Call Sound Player (Ringtone / Dialtone) Effect
  useEffect(() => {
    let autoEndTimer: any = null;
    if (callState === 'ringing') {
      if (incomingCall) {
        // We are receiving the call (Receiver B) -> Play Ringtone + vibrate the phone.
        // Vibration is a guaranteed alert even if the network audio fails to load.
        playCallSound('ringing');
        // Repeating pattern: wait 0ms, vibrate 800ms, pause 1000ms, ... (loop)
        Vibration.vibrate([0, 800, 1000], true);
      } else {
        // We are making the call (Caller A) -> Play Dialing tone
        playCallSound('dialing');
      }

      // Auto end an unanswered call after 30 seconds: the receiver auto-rejects
      // (becomes a missed call) and the caller's dialing auto-cancels.
      autoEndTimer = setTimeout(() => {
        const inc = incomingCallRef.current;
        const out = activeCallRef.current;
        if (inc?._id) {
          rejectCall(inc._id);
        } else if (out?._id) {
          endCall(out._id, 0);
        }
      }, 30000);
    } else {
      // Not ringing anymore -> Stop any playing sound and vibration
      Vibration.cancel();
      stopCallSound();
    }

    return () => {
      if (autoEndTimer) clearTimeout(autoEndTimer);
      Vibration.cancel();
      stopCallSound();
    };
  }, [callState, incomingCall, playCallSound, stopCallSound]);

  // Ring + vibrate for an incoming GROUP/meeting call until it is accepted or dismissed.
  useEffect(() => {
    if (incomingGroupCall && !groupCall) {
      playCallSound('ringing');
      Vibration.vibrate([0, 800, 1000], true);
      return () => {
        Vibration.cancel();
        stopCallSound();
      };
    }
  }, [incomingGroupCall, groupCall, playCallSound, stopCallSound]);

  // REST API: Register
  const register = async (username: string, email: string, password: string, customUrl?: string): Promise<{ success: boolean; needsVerification?: boolean; email?: string }> => {
    const activeUrl = customUrl || serverUrl;
    try {
      const deviceId = await getOrCreateDeviceId();
      const response = await fetchWithTimeout(`${activeUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password, deviceId })
      }, 25000);

      const data = await response.json();
      if (!response.ok) {
        showNeonAlert({ title: 'SIGN UP FAILED', message: data.message || 'Please try again in a moment.', icon: 'close-circle-outline', borderColor: '#f43f5e', iconColor: '#f43f5e' });
        return { success: false, needsVerification: data.needsVerification, email: data.email };
      }
      // Account created; user must now verify the emailed OTP.
      return { success: true, needsVerification: true, email: data.email };
    } catch (err: any) {
      console.error(err);
      showNeonAlert({
        title: 'SERVER WAKING UP',
        message: 'Our server is starting up after a period of inactivity. Please tap Sign Up again — it usually connects within 2-3 attempts.',
        icon: 'cloud-offline-outline',
        borderColor: '#f59e0b',
        iconColor: '#f59e0b'
      });
      return { success: false };
    }
  };

  // Stores token + user (shared by verifyOtp and login)
  const persistAuth = async (data: any) => {
    const formattedUser: User = {
      id: data.user.id,
      username: data.user.username,
      email: data.user.email,
      displayName: data.user.displayName,
      about: data.user.about,
      avatarUrl: data.user.avatarUrl,
      blockedUsers: Array.isArray(data.user.blockedUsers)
        ? data.user.blockedUsers.map((b: any) => (typeof b === 'string' ? b : b?._id || b?.id)).filter(Boolean)
        : [],
    };
    setToken(data.token);
    setUser(formattedUser);
    await secureSetToken(data.token);
    await AsyncStorage.setItem('user', JSON.stringify(formattedUser));
  };

  // REST API: Verify email OTP (logs the user in on success)
  const verifyOtp = async (email: string, code: string): Promise<boolean> => {
    try {
      const response = await fetchWithTimeout(`${serverUrl}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code })
      }, 8000);
      const data = await response.json();
      if (!response.ok) {
        showNeonAlert({ title: 'VERIFICATION FAILED', message: data.message || 'Invalid code.', icon: 'close-circle-outline', borderColor: '#f43f5e', iconColor: '#f43f5e' });
        return false;
      }
      await persistAuth(data);
      return true;
    } catch (err: any) {
      console.error(err);
      showNeonAlert({ title: 'CONNECTION ERROR', message: 'Failed to reach the server.', icon: 'cloud-offline-outline', borderColor: '#f43f5e', iconColor: '#f43f5e' });
      return false;
    }
  };

  // REST API: Resend verification OTP
  const resendOtp = async (email: string): Promise<boolean> => {
    try {
      const response = await fetchWithTimeout(`${serverUrl}/api/auth/resend-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      }, 8000);
      const data = await response.json();
      if (!response.ok) {
        showNeonAlert({ title: 'RESEND FAILED', message: data.message || 'Could not resend code.', icon: 'close-circle-outline', borderColor: '#f43f5e', iconColor: '#f43f5e' });
        return false;
      }
      showNeonAlert({ title: 'CODE SENT', message: data.message || 'A new code is on its way.', icon: 'mail-outline', borderColor: '#10b981', iconColor: '#10b981' });
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  // REST API: Forgot password — request a reset code
  const forgotPassword = async (email: string): Promise<boolean> => {
    try {
      const response = await fetchWithTimeout(`${serverUrl}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      }, 25000);
      const data = await response.json();
      if (!response.ok) {
        showNeonAlert({ title: 'REQUEST FAILED', message: data.message || 'Could not send reset code.', icon: 'close-circle-outline', borderColor: '#f43f5e', iconColor: '#f43f5e' });
        return false;
      }
      showNeonAlert({ title: 'CHECK YOUR EMAIL', message: data.message || 'Reset code sent. Also check your Spam folder.', icon: 'mail-outline', borderColor: '#10b981', iconColor: '#10b981' });
      return true;
    } catch (err) {
      console.error(err);
      showNeonAlert({ title: 'SERVER WAKING UP', message: 'The server may be starting up. Please tap Send again in a few seconds.', icon: 'time-outline', borderColor: '#f59e0b', iconColor: '#f59e0b' });
      return false;
    }
  };

  // REST API: Reset password using the emailed code
  const resetPassword = async (email: string, code: string, newPassword: string): Promise<boolean> => {
    try {
      const response = await fetchWithTimeout(`${serverUrl}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, newPassword })
      }, 25000);
      const data = await response.json();
      if (!response.ok) {
        showNeonAlert({ title: 'RESET FAILED', message: data.message || 'Could not reset password.', icon: 'close-circle-outline', borderColor: '#f43f5e', iconColor: '#f43f5e' });
        return false;
      }
      showNeonAlert({ title: 'PASSWORD UPDATED', message: data.message || 'You can now log in.', icon: 'checkmark-circle-outline', borderColor: '#10b981', iconColor: '#10b981' });
      return true;
    } catch (err) {
      console.error(err);
      showNeonAlert({ title: 'SERVER WAKING UP', message: 'The server may be starting up. Please tap again in a few seconds.', icon: 'time-outline', borderColor: '#f59e0b', iconColor: '#f59e0b' });
      return false;
    }
  };

  // REST API: Login
  const login = async (username: string, password: string, customUrl?: string): Promise<boolean | { needsVerification: boolean; email?: string }> => {
    const activeUrl = customUrl || serverUrl;
    try {
      const response = await fetchWithTimeout(`${activeUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      }, 25000);

      const data = await response.json();
      if (!response.ok) {
        if (data.needsVerification) {
          return { needsVerification: true, email: data.email };
        }
        showNeonAlert({ title: 'LOGIN FAILED', message: data.message || 'Invalid username or password.', icon: 'close-circle-outline', borderColor: '#f43f5e', iconColor: '#f43f5e' });
        return false;
      }

      await persistAuth(data);
      return true;
    } catch (err: any) {
      console.error(err);
      showNeonAlert({
        title: 'SERVER WAKING UP',
        message: 'Our server is starting up after a period of inactivity. Please tap Login again — it usually connects within 2-3 attempts.',
        icon: 'cloud-offline-outline',
        borderColor: '#f59e0b',
        iconColor: '#f59e0b'
      });
      return false;
    }
  };

  // REST API: Logout
  const logout = async () => {
    // Best-effort: unregister this device's push token so it stops receiving pushes.
    if (pushTokenRef.current && token) {
      try {
        await fetch(`${serverUrl}/api/users/push-token/remove`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ token: pushTokenRef.current }),
        });
      } catch (e) { /* ignore */ }
      pushTokenRef.current = null;
    }
    // Also unregister the native FCM token (incoming-call alerts).
    if (fcmTokenRef.current && token) {
      try {
        await fetch(`${serverUrl}/api/users/fcm-token/remove`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ token: fcmTokenRef.current }),
        });
      } catch (e) { /* ignore */ }
      fcmTokenRef.current = null;
    }

    if (socket) {
      socket.disconnect();
    }
    setToken(null);
    setUser(null);
    setConversations([]);
    setUsers([]);
    setMessages({});
    setActiveConversationId(null);

    await deleteToken();
    await AsyncStorage.removeItem('user');
  };

  // REST API: Update Profile DP, display name or status
  const updateProfile = async (displayName: string, about: string, avatarUrl: string): Promise<boolean> => {
    if (!token) return false;
    try {
      const response = await fetch(`${serverUrl}/api/users/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ displayName, about, avatarUrl })
      });

      const data = await response.json();
      if (!response.ok) {
        showNeonAlert({ title: 'UPDATE FAILED', message: data.message || 'Server error.', icon: 'close-circle-outline', borderColor: '#f43f5e', iconColor: '#f43f5e' });
        return false;
      }

      const updatedUser: User = {
        id: data._id || data.id,
        username: data.username,
        displayName: data.displayName,
        about: data.about,
        avatarUrl: data.avatarUrl
      };

      setUser(updatedUser);
      await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
      return true;
    } catch (err) {
      console.error(err);
      showNeonAlert({ title: 'ERROR', message: 'Failed to update profile.', icon: 'close-circle-outline', borderColor: '#f43f5e', iconColor: '#f43f5e' });
      return false;
    }
  };

  // REST API: Fetch all users
  const fetchUsers = async () => {
    if (!token) return;
    try {
      const response = await fetch(`${serverUrl}/api/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        // Map _id to id for uniformity
        const formattedUsers = data.map((u: any) => ({
          id: u._id,
          username: u.username,
          displayName: u.displayName,
          about: u.about,
          avatarUrl: u.avatarUrl,
          isOnline: u.isOnline,
          lastSeen: u.lastSeen
        }));
        setUsers(formattedUsers);
      }
    } catch (err) {
      console.error('Fetch users error:', err);
    }
  };

  // REST API: Fetch all conversations
  const fetchConversations = async () => {
    if (!token) return;
    try {
      const response = await fetch(`${serverUrl}/api/conversations`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        const formattedConversations = data.map((c: any) => ({
          ...c,
          participants: c.participants.map((p: any) => ({
            id: p._id,
            username: p.username,
            displayName: p.displayName,
            about: p.about,
            avatarUrl: p.avatarUrl,
            isOnline: p.isOnline,
            lastSeen: p.lastSeen
          }))
        }));
        setConversations(formattedConversations);
      }
    } catch (err) {
      console.error('Fetch conversations error:', err);
    }
  };

  // REST API: Load message history for a conversation
  const loadMessages = async (conversationId: string) => {
    if (!token) return;
    try {
      const response = await fetch(`${serverUrl}/api/messages/${conversationId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setMessages((prev) => ({
          ...prev,
          [conversationId]: data
        }));
      }
    } catch (err) {
      console.error('Load messages error:', err);
    }
  };

  // REST API & Sockets: Send message
  const sendMessage = async (
    conversationId: string, 
    text: string, 
    messageType?: 'text' | 'image' | 'video' | 'audio' | 'file', 
    mediaUrl?: string
  ) => {
    if (!token || !user) return;
    
    // 1. Optimistic UI update: local insert of message to feel instant
    const tempId = `temp_${Date.now()}`;
    const optimisticMessage: Message = {
      _id: tempId,
      conversation: conversationId,
      sender: user,
      text: text.trim(),
      status: 'sent',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageType: messageType || 'text',
      mediaUrl: mediaUrl || undefined
    } as any;

    setMessages((prev) => ({
      ...prev,
      [conversationId]: [...(prev[conversationId] || []), optimisticMessage]
    }));

    try {
      const response = await fetch(`${serverUrl}/api/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ conversationId, text, messageType, mediaUrl })
      });

      const realMessage = await response.json();
      if (response.ok) {
        // Replace the optimistic message with the database saved message
        setMessages((prev) => ({
          ...prev,
          [conversationId]: (prev[conversationId] || []).map((m) =>
            m._id === tempId ? realMessage : m
          )
        }));

        // Update conversation lastMessage
        setConversations((prevConvs) => {
          const index = prevConvs.findIndex((c) => c._id === conversationId);
          if (index === -1) return prevConvs;
          const updatedConvs = [...prevConvs];
          updatedConvs[index] = {
            ...updatedConvs[index],
            lastMessage: realMessage,
            updatedAt: realMessage.createdAt
          };
          return updatedConvs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        });
      } else {
        // Server rejected (e.g., blocked). Remove the optimistic message + inform.
        setMessages((prev) => ({
          ...prev,
          [conversationId]: (prev[conversationId] || []).filter((m) => m._id !== tempId)
        }));
        showNeonAlert({
          title: 'NOT SENT',
          message: realMessage?.message || 'Message could not be sent.',
          icon: 'ban-outline', borderColor: '#f43f5e', iconColor: '#f43f5e',
        });
      }
    } catch (err) {
      console.error('Error sending message:', err);
      // Revert optimistic insert on failure
      setMessages((prev) => ({
        ...prev,
        [conversationId]: (prev[conversationId] || []).filter((m) => m._id !== tempId)
      }));
      showNeonAlert({ title: 'SEND ERROR', message: 'Message failed to send. Check server connection.', icon: 'cloud-offline-outline', borderColor: '#f43f5e', iconColor: '#f43f5e' });
    }
  };

  // REST API: Mark all incoming messages in a conversation as read (drives double-tick)
  const markConversationRead = async (conversationId: string): Promise<void> => {
    if (!token || !conversationId) return;
    // Optimistically clear the unread badge for this chat immediately on open.
    setConversations((prev) => prev.map((c) =>
      c._id === conversationId ? { ...c, unreadCount: 0 } : c
    ));
    try {
      await fetch(`${serverUrl}/api/messages/conversation/${conversationId}/read-all`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
    } catch (err) {
      console.log('markConversationRead failed:', err);
    }
  };

  // Block a user (server stops messages both ways).
  const blockUser = async (userId: string): Promise<boolean> => {
    if (!token) return false;
    try {
      const res = await fetch(`${serverUrl}/api/users/block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        setUser((prev) => {
          if (!prev) return prev;
          const updated = { ...prev, blockedUsers: Array.from(new Set([...(prev.blockedUsers || []), userId])) };
          AsyncStorage.setItem('user', JSON.stringify(updated)).catch(() => {});
          return updated;
        });
      }
      return res.ok;
    } catch (e) {
      console.log('blockUser failed:', e);
      return false;
    }
  };

  const unblockUser = async (userId: string): Promise<boolean> => {
    if (!token) return false;
    try {
      const res = await fetch(`${serverUrl}/api/users/unblock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        setUser((prev) => {
          if (!prev) return prev;
          const updated = { ...prev, blockedUsers: (prev.blockedUsers || []).filter((id) => id !== userId) };
          AsyncStorage.setItem('user', JSON.stringify(updated)).catch(() => {});
          return updated;
        });
      }
      return res.ok;
    } catch (e) {
      console.log('unblockUser failed:', e);
      return false;
    }
  };

  // Clear/delete a chat: removes it for this user (server soft-deletes 1-on-1,
  // and removes the member from a group = leave group).
  const clearChat = async (conversationId: string): Promise<boolean> => {
    if (!token) return false;
    try {
      const res = await fetch(`${serverUrl}/api/conversations/${conversationId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c._id !== conversationId));
        setMessages((prev) => { const n = { ...prev }; delete n[conversationId]; return n; });
      }
      return res.ok;
    } catch (e) {
      console.log('clearChat failed:', e);
      return false;
    }
  };

  // Edit your own text message (server re-encrypts + notifies everyone).
  const editMessage = async (messageId: string, text: string): Promise<boolean> => {
    if (!token || !text.trim()) return false;
    try {
      const res = await fetch(`${serverUrl}/api/messages/${messageId}/edit`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ text: text.trim() }),
      });
      if (res.ok) {
        const updated = await res.json();
        setMessages((prev) => {
          const convId = updated.conversation;
          const list = prev[convId] || [];
          return { ...prev, [convId]: list.map((m) => (m._id === updated._id ? updated : m)) };
        });
        return true;
      }
      return false;
    } catch (e) {
      console.log('editMessage failed:', e);
      return false;
    }
  };

  // Delete your own message for everyone.
  const deleteMessageForEveryone = async (messageId: string): Promise<boolean> => {
    if (!token) return false;
    try {
      const res = await fetch(`${serverUrl}/api/messages/${messageId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        setMessages((prev) => {
          const next: { [k: string]: Message[] } = {};
          for (const cid of Object.keys(prev)) {
            next[cid] = prev[cid].map((m) => (m._id === messageId ? { ...m, deletedForEveryone: true, text: '', mediaUrl: undefined } : m));
          }
          return next;
        });
        return true;
      }
      return false;
    } catch (e) {
      console.log('deleteMessageForEveryone failed:', e);
      return false;
    }
  };

  // REST API: Start or get conversation with user
  const startConversation = async (recipientId: string): Promise<string | null> => {
    if (!token) return null;
    try {
      const response = await fetch(`${serverUrl}/api/conversations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ recipientId })
      });

      const data = await response.json();
      if (response.ok) {
        const formattedConv = {
          ...data,
          participants: data.participants.map((p: any) => ({
            id: p._id,
            username: p.username,
            displayName: p.displayName,
            about: p.about,
            avatarUrl: p.avatarUrl,
            isOnline: p.isOnline,
            lastSeen: p.lastSeen
          }))
        };

        // If conversation is already in list, do not add duplicate
        setConversations((prev) => {
          if (prev.some((c) => c._id === formattedConv._id)) return prev;
          return [formattedConv, ...prev];
        });

        return formattedConv._id;
      }
      return null;
    } catch (err) {
      console.error('Start conversation error:', err);
      return null;
    }
  };

  // REST API: Create a group conversation (max 15 incl. creator)
  const createGroup = async (groupName: string, participantIds: string[]): Promise<string | null> => {
    if (!token) return null;
    try {
      const response = await fetch(`${serverUrl}/api/conversations/group/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ groupName, participantIds }),
      });
      const data = await response.json();
      if (!response.ok) {
        showNeonAlert({ title: 'GROUP FAILED', message: data.message || 'Could not create the group.', icon: 'people-outline', borderColor: '#f43f5e', iconColor: '#f43f5e' });
        return null;
      }
      const formattedConv = {
        ...data,
        participants: (data.participants || []).map((p: any) => ({
          id: p._id, username: p.username, displayName: p.displayName,
          about: p.about, avatarUrl: p.avatarUrl, isOnline: p.isOnline, lastSeen: p.lastSeen,
        })),
      };
      setConversations((prev) => {
        if (prev.some((c) => c._id === formattedConv._id)) return prev;
        return [formattedConv, ...prev];
      });
      return formattedConv._id;
    } catch (err) {
      console.error('Create group error:', err);
      showNeonAlert({ title: 'CONNECTION ERROR', message: 'Could not reach the server to create the group.', icon: 'cloud-offline-outline', borderColor: '#f43f5e', iconColor: '#f43f5e' });
      return null;
    }
  };

  // REST API: Fetch statuses
  const fetchStatuses = async () => {
    if (!token) return;
    try {
      const response = await fetch(`${serverUrl}/api/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setStatuses(data);
      }
    } catch (err) {
      console.error('Fetch statuses error:', err);
    }
  };

  // REST API: Upload status
  const uploadStatus = async (statusData: {
    statusType: 'image' | 'video' | 'text';
    mediaUrl?: string;
    textContent?: string;
    textColor?: string;
    backgroundColor?: string;
  }): Promise<boolean> => {
    if (!token) return false;
    try {
      const response = await fetch(`${serverUrl}/api/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(statusData)
      });
      const data = await response.json();
      if (response.ok) {
        await fetchStatuses();
        return true;
      } else {
        showNeonAlert({ title: 'UPLOAD FAILED', message: data.message || 'Server error.', icon: 'cloud-upload-outline', borderColor: '#f43f5e', iconColor: '#f43f5e' });
        return false;
      }
    } catch (err) {
      console.error('Upload status error:', err);
      showNeonAlert({ title: 'UPLOAD ERROR', message: 'Failed to connect to server.', icon: 'cloud-offline-outline', borderColor: '#f43f5e', iconColor: '#f43f5e' });
      return false;
    }
  };

  // REST API: Upload any file/media (image, video, etc.)
  const uploadFile = async (fileUri: string, fileMimeType: string): Promise<{ url: string } | null> => {
    if (!token) {
      showNeonAlert({ title: 'UPLOAD ERROR', message: 'Authentication required.', icon: 'lock-closed-outline', borderColor: '#f43f5e', iconColor: '#f43f5e' });
      return null;
    }
    try {
      const formData = new FormData();
      
      // Ensure file protocol is robustly formatted for Android to prevent 'Network request failed'
      let formattedUri = fileUri;
      if (!fileUri.startsWith('file://') && !fileUri.startsWith('content://') && !fileUri.startsWith('http://') && !fileUri.startsWith('https://')) {
        formattedUri = 'file://' + fileUri;
      }

      let filename = fileUri.split('/').pop() || 'upload.bin';
      // Ensure filename has a valid extension matching the mimetype so Multer saves it correctly
      if (!filename.includes('.')) {
        const ext = fileMimeType ? fileMimeType.split('/').pop() : 'jpg';
        filename = `${filename}.${ext}`;
      }
      
      formData.append('media', {
        uri: formattedUri,
        name: filename,
        type: fileMimeType
      } as any);

      console.log('Uploading file:', filename, 'Mimetype:', fileMimeType, 'URI:', fileUri);

      const response = await fetch(`${serverUrl}/api/upload/media`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await response.json();
      if (response.ok) {
        console.log('Upload successful! File URL:', data.url);
        return data;
      } else {
        console.error('Upload API returned error status:', response.status, data);
        throw new Error(data.message || 'Server error occurred during upload.');
      }
    } catch (err: any) {
      console.error('uploadFile exception:', err);
      throw new Error(err.message || 'Failed to connect to the server or upload file.');
    }
  };

  // REST API: Mark status as viewed
  const markStatusViewed = async (statusId: string) => {
    if (!token) return;
    try {
      const response = await fetch(`${serverUrl}/api/status/${statusId}/view`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        fetchStatuses();
      }
    } catch (err) {
      console.error('Mark status viewed error:', err);
    }
  };

  // REST API: Delete own status
  const deleteStatus = async (statusId: string): Promise<boolean> => {
    if (!token) return false;
    try {
      const response = await fetch(`${serverUrl}/api/status/${statusId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        await fetchStatuses();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Delete status error:', err);
      return false;
    }
  };

  // REST API: Fetch call history
  // Load the persisted "calls last seen" timestamp once on mount.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('callsSeenAt');
        if (raw) setCallsSeenAt(parseInt(raw, 10) || 0);
      } catch (e) {}
    })();
  }, []);

  // Recompute the unseen missed-call count whenever the log or seen-marker changes.
  useEffect(() => {
    const count = (callHistory || []).filter((c: any) => {
      const isCallerMe = c.caller?._id === user?.id || c.caller?.id === user?.id;
      if (isCallerMe) return false;
      if (c.status !== 'missed' && c.status !== 'rejected') return false;
      const t = new Date(c.createdAt).getTime();
      return t > callsSeenAt;
    }).length;
    setMissedCallCount(count);
  }, [callHistory, callsSeenAt, user]);

  // Marks all current missed calls as seen (called when the Calls tab opens),
  // clearing the tab badge. Persisted so it survives app restarts.
  const markCallsSeen = useCallback(async () => {
    const now = Date.now();
    setCallsSeenAt(now);
    setMissedCallCount(0);
    try { await AsyncStorage.setItem('callsSeenAt', String(now)); } catch (e) {}
  }, []);

  const fetchCallHistory = async () => {
    if (!token) return;
    try {
      const response = await fetch(`${serverUrl}/api/calls/history`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setCallHistory(data);
      }
    } catch (err) {
      console.error('Fetch call history error:', err);
    }
  };

  // When a call concludes (possibly missed/unanswered), refresh the log shortly
  // after so the Calls-tab badge updates even if the user never opens that tab.
  useEffect(() => {
    if (callState === 'ended') {
      const t = setTimeout(() => { fetchCallHistory().catch(() => {}); }, 1500);
      return () => clearTimeout(t);
    }
  }, [callState]);

  // REST API: Initiate call log
  const initiateCallLog = async (recipientId: string, callType: 'voice' | 'video', conversationId?: string): Promise<any | null> => {
    if (!token) return null;
    try {
      const response = await fetch(`${serverUrl}/api/calls/initiate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ recipientId, callType, conversationId })
      });
      const data = await response.json();
      if (response.ok) {
        fetchCallHistory();
        return data;
      }
      return null;
    } catch (err) {
      console.error('Initiate call log error:', err);
      return null;
    }
  };

  // REST API: End call log
  const endCallLog = async (callId: string, duration?: number) => {
    if (!token) return;
    try {
      await fetch(`${serverUrl}/api/calls/${callId}/end`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ duration })
      });
      fetchCallHistory();
    } catch (err) {
      console.error('End call log error:', err);
    }
  };

  const setChatWallpaper = async (val: string | null) => {
    setChatWallpaperState(val);
    if (val) {
      await AsyncStorage.setItem('chatWallpaper', val);
    } else {
      await AsyncStorage.removeItem('chatWallpaper');
    }
  };

  const setSelectedRingtone = async (val: string) => {
    setSelectedRingtoneState(val);
    await AsyncStorage.setItem('selectedRingtone', val);
  };

  // Persist & apply a user-picked custom tone (or clear it with null).
  const setCustomTone = async (kind: 'call' | 'message' | 'group', tone: ToneRef | null) => {
    setCustomTonesState((prev) => ({ ...prev, [kind]: tone }));
    try {
      if (tone) {
        await AsyncStorage.setItem(`customTone_${kind}`, JSON.stringify(tone));
      } else {
        await AsyncStorage.removeItem(`customTone_${kind}`);
      }
    } catch (e) {
      console.warn('Failed to persist custom tone:', e);
    }
  };

  // ── App lock + hidden chats ──
  const toggleAppLock = async (enabled: boolean) => {
    setAppLockEnabledState(enabled);
    await alSetEnabled(enabled);
    // Don't lock immediately when turning ON (user is already in); it engages
    // on next background→foreground. Turning OFF clears any active lock.
    if (!enabled) setAppLocked(false);
  };

  const lockChat = async (id: string) => {
    setLockedChatIds((prev) => {
      const next = Array.from(new Set([...prev, id]));
      alSetLockedChats(next);
      return next;
    });
  };

  const unlockChat = async (id: string) => {
    setLockedChatIds((prev) => {
      const next = prev.filter((x) => x !== id);
      alSetLockedChats(next);
      return next;
    });
  };

  // Re-lock the app only after it has been in the background for a while.
  // Opening the image/video picker, share sheet, or camera briefly sends the
  // app to 'inactive'/'background'. Locking on every such event forced the user
  // to re-enter the PIN constantly, so we use a grace period instead.
  const appLockEnabledRef = useRef(appLockEnabled);
  useEffect(() => { appLockEnabledRef.current = appLockEnabled; }, [appLockEnabled]);
  const backgroundedAtRef = useRef<number>(0);
  const RELOCK_GRACE_MS = 60000; // 60s: covers pickers, sharing, short recordings
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (!appLockEnabledRef.current) return;
      if (state === 'background' || state === 'inactive') {
        // Mark when we left; don't lock yet (pickers/share momentarily background us).
        if (backgroundedAtRef.current === 0) backgroundedAtRef.current = Date.now();
      } else if (state === 'active') {
        const awayMs = backgroundedAtRef.current ? Date.now() - backgroundedAtRef.current : 0;
        backgroundedAtRef.current = 0;
        if (awayMs > RELOCK_GRACE_MS) setAppLocked(true);
      }
    });
    return () => sub.remove();
  }, []);

  const setPrivacyLastSeen = async (val: boolean) => {
    setPrivacyLastSeenState(val);
    await AsyncStorage.setItem('privacyLastSeen', val ? 'true' : 'false');
  };

  const setPrivacyReadReceipts = async (val: boolean) => {
    setPrivacyReadReceiptsState(val);
    await AsyncStorage.setItem('privacyReadReceipts', val ? 'true' : 'false');
  };

  return (
    <AppContext.Provider
      value={{
        user,
        token,
        serverUrl,
        socket,
        conversations,
        users,
        messages,
        activeConversationId,
        loading,
        statuses,
        callHistory,
        missedCallCount,
        markCallsSeen,
        setServerUrl,
        setActiveConversationId,
        login,
        register,
        verifyOtp,
        resendOtp,
        forgotPassword,
        resetPassword,
        logout,
        updateProfile,
        fetchUsers,
        fetchConversations,
        loadMessages,
        markConversationRead,
        blockUser,
        unblockUser,
        clearChat,
        editMessage,
        deleteMessageForEveryone,
        sendMessage,
        startConversation,
        createGroup,
        fetchStatuses,
        uploadStatus,
        uploadFile,
        markStatusViewed,
        deleteStatus,
        fetchCallHistory,
        initiateCallLog,
        endCallLog,
        chatWallpaper,
        selectedRingtone,
        customTones,
        setCustomTone,
        playMessageTone,
        appLockEnabled,
        appLocked,
        lockedChatIds,
        setAppLocked,
        toggleAppLock,
        lockChat,
        unlockChat,
        privacyLastSeen,
        privacyReadReceipts,
        setChatWallpaper,
        setSelectedRingtone,
        setPrivacyLastSeen,
        setPrivacyReadReceipts,
        incomingCall,
        activeCall,
        callState,
        callDuration,
        localStream,
        remoteStream,
        setIncomingCall,
        setActiveCall,
        setCallState,
        setCallDuration,
        acceptCall,
        rejectCall,
        endCall,
        groupCall,
        incomingGroupCall,
        groupCallState,
        groupLocalStream,
        groupRemoteStreams,
        groupParticipants,
        startGroupCall,
        acceptGroupCall,
        rejectGroupCall,
        leaveGroupCall
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
