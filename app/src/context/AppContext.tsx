import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io, Socket } from 'socket.io-client';
import { showNeonAlert } from '../components/NeonAlert';

export interface User {
  id: string;
  username: string;
  displayName: string;
  about: string;
  avatarUrl: string;
  isOnline?: boolean;
  lastSeen?: string;
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
}

export interface Conversation {
  _id: string;
  participants: User[];
  lastMessage?: Message;
  updatedAt: string;
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
  setServerUrl: (url: string) => void;
  setActiveConversationId: (id: string | null) => void;
  login: (username: string, password: string, customUrl?: string) => Promise<boolean>;
  register: (username: string, password: string, customUrl?: string) => Promise<boolean>;
  logout: () => Promise<void>;
  updateProfile: (displayName: string, about: string, avatarUrl: string) => Promise<boolean>;
  fetchUsers: () => Promise<void>;
  fetchConversations: () => Promise<void>;
  loadMessages: (conversationId: string) => Promise<void>;
  sendMessage: (
    conversationId: string, 
    text: string, 
    messageType?: 'text' | 'image' | 'video' | 'audio' | 'file', 
    mediaUrl?: string
  ) => Promise<void>;
  startConversation: (recipientId: string) => Promise<string | null>;
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
  fetchCallHistory: () => Promise<void>;
  initiateCallLog: (recipientId: string, callType: 'voice' | 'video', conversationId?: string) => Promise<any | null>;
  endCallLog: (callId: string, duration?: number) => Promise<void>;
  chatWallpaper: string | null;
  selectedRingtone: string;
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
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const fetchWithTimeout = async (url: string, options: any = {}, timeoutMs = 6000) => {
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

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrlState] = useState<string>('http://192.168.0.111:5000');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [messages, setMessages] = useState<{ [conversationId: string]: Message[] }>({});
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [statuses, setStatuses] = useState<StatusStory[]>([]);
  const [callHistory, setCallHistory] = useState<CallRecord[]>([]);

  const [chatWallpaper, setChatWallpaperState] = useState<string | null>(null);
  const [selectedRingtone, setSelectedRingtoneState] = useState<string>('Neon Horizon');
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

  // Keep refs in sync with state for use inside socket event closures (prevents stale closures)
  useEffect(() => { localStreamRef.current = localStream; }, [localStream]);
  useEffect(() => { remoteStreamRef.current = remoteStream; }, [remoteStream]);
  useEffect(() => { socketRef.current = socket; }, [socket]);

  const cleanupCallStreams = useCallback(() => {
    console.log('Cleaning up WebRTC call streams...');
    isInitializingRef.current = false;
    hasCreatedOfferRef.current = false;
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

      // Ultra-lightweight hosted audio files (under 150KB) to ensure instant playback over mobile data
      const dialingUrl = 'https://raw.githubusercontent.com/jitsi/jitsi-meet/master/sounds/outgoingRinging.wav';
      
      let ringtoneUrl = 'https://raw.githubusercontent.com/jitsi/jitsi-meet/master/sounds/ring.wav';
      if (selectedRingtone === 'Neon Horizon') {
        ringtoneUrl = 'https://raw.githubusercontent.com/jitsi/jitsi-meet/master/sounds/ring.wav';
      } else if (selectedRingtone === 'Interstellar Pulsar') {
        ringtoneUrl = 'https://cdnjs.cloudflare.com/ajax/libs/ion-sound/3.0.7/sounds/bell_ring.mp3';
      }

      const activeUrl = type === 'dialing' ? dialingUrl : ringtoneUrl;
      console.log(`[SoundEngine] Loading and playing ${type} tone from:`, activeUrl);

      const { sound } = await Audio.Sound.createAsync(
        { uri: activeUrl },
        { shouldPlay: true, isLooping: true, volume: 0.8 }
      );
      ringtoneSoundRef.current = sound;
    } catch (err) {
      console.error('Failed to play call sound:', err);
    }
  }, [selectedRingtone]);

  const stopCallSound = useCallback(async () => {
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
        iceServers: [
          // Google STUN servers (free, reliable, sufficient for same-network calls)
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' },
        ]
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
        const defaultUrl = 'http://192.168.0.111:5000';
        if (storedUrl) {
          setServerUrlState(storedUrl);
        } else {
          setServerUrlState(defaultUrl);
          await AsyncStorage.setItem('serverUrl', defaultUrl);
        }
        
        const storedToken = await AsyncStorage.getItem('token');
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
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10
    });

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
        updatedConvs[index] = {
          ...updatedConvs[index],
          lastMessage: newMessage,
          updatedAt: newMessage.createdAt
        };
        // Sort conversations by updated date (newest first)
        return updatedConvs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      });
    });

    socketInstance.on('user_status_changed', (data: { userId: string; isOnline: boolean; lastSeen?: string }) => {
      // Update online status in local users list
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
          console.log('WebRTC remote description set successfully');
        } catch (e) {
          console.error('Error setting remote description:', e);
        }
      }
    });

    socketInstance.on('webrtc_ice_candidate', async (data) => {
      console.log('Socket WebRTC ICE candidate received');
      const pc = pcRef.current;
      if (pc && data.candidate) {
        const { RTCIceCandidate } = require('react-native-webrtc');
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          console.log('Added remote ICE candidate successfully');
        } catch (e) {
          // Ignore errors for candidates that arrive before remote description is set
          const err = e as any;
          if (err.name !== 'InvalidStateError') {
            console.warn('Error adding ICE candidate:', err.message);
          }
        }
      }
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
    if (callState === 'ringing') {
      if (incomingCall) {
        // We are receiving the call (Receiver B) -> Play Ringtone
        playCallSound('ringing');
      } else {
        // We are making the call (Caller A) -> Play Dialing tone
        playCallSound('dialing');
      }
    } else {
      // Not ringing anymore -> Stop any playing sound
      stopCallSound();
    }

    return () => {
      stopCallSound();
    };
  }, [callState, incomingCall, playCallSound, stopCallSound]);

  // REST API: Register
  const register = async (username: string, password: string, customUrl?: string): Promise<boolean> => {
    const activeUrl = customUrl || serverUrl;
    try {
      const response = await fetchWithTimeout(`${activeUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      }, 6000);

      const data = await response.json();
      if (!response.ok) {
        showNeonAlert({ title: 'SIGN UP FAILED', message: data.message || 'Check server connection.', icon: 'close-circle-outline', borderColor: '#f43f5e', iconColor: '#f43f5e' });
        return false;
      }

      const formattedUser: User = {
        id: data.user.id,
        username: data.user.username,
        displayName: data.user.displayName,
        about: data.user.about,
        avatarUrl: data.user.avatarUrl
      };

      setToken(data.token);
      setUser(formattedUser);

      await AsyncStorage.setItem('token', data.token);
      await AsyncStorage.setItem('user', JSON.stringify(formattedUser));
      return true;
    } catch (err: any) {
      console.error(err);
      showNeonAlert({ title: 'CONNECTION ERROR', message: err.message === 'Connection Timeout' ? `Server connection timed out at ${activeUrl}. Please verify your server IP address and make sure it is running.` : `Failed to connect to backend server at ${activeUrl}. Ensure the server is running.`, icon: 'cloud-offline-outline', borderColor: '#f43f5e', iconColor: '#f43f5e' });
      return false;
    }
  };

  // REST API: Login
  const login = async (username: string, password: string, customUrl?: string): Promise<boolean> => {
    const activeUrl = customUrl || serverUrl;
    try {
      const response = await fetchWithTimeout(`${activeUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      }, 6000);

      const data = await response.json();
      if (!response.ok) {
        showNeonAlert({ title: 'LOGIN FAILED', message: data.message || 'Invalid username or password.', icon: 'close-circle-outline', borderColor: '#f43f5e', iconColor: '#f43f5e' });
        return false;
      }

      const formattedUser: User = {
        id: data.user.id,
        username: data.user.username,
        displayName: data.user.displayName,
        about: data.user.about,
        avatarUrl: data.user.avatarUrl
      };

      setToken(data.token);
      setUser(formattedUser);

      await AsyncStorage.setItem('token', data.token);
      await AsyncStorage.setItem('user', JSON.stringify(formattedUser));
      return true;
    } catch (err: any) {
      console.error(err);
      showNeonAlert({ title: 'CONNECTION ERROR', message: err.message === 'Connection Timeout' ? `Server connection timed out at ${activeUrl}. Please verify your server IP address and make sure it is running.` : `Failed to connect to backend server at ${activeUrl}. Ensure the server is running.`, icon: 'cloud-offline-outline', borderColor: '#f43f5e', iconColor: '#f43f5e' });
      return false;
    }
  };

  // REST API: Logout
  const logout = async () => {
    if (socket) {
      socket.disconnect();
    }
    setToken(null);
    setUser(null);
    setConversations([]);
    setUsers([]);
    setMessages({});
    setActiveConversationId(null);

    await AsyncStorage.removeItem('token');
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

  // REST API: Fetch call history
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
        setServerUrl,
        setActiveConversationId,
        login,
        register,
        logout,
        updateProfile,
        fetchUsers,
        fetchConversations,
        loadMessages,
        sendMessage,
        startConversation,
        fetchStatuses,
        uploadStatus,
        uploadFile,
        markStatusViewed,
        fetchCallHistory,
        initiateCallLog,
        endCallLog,
        chatWallpaper,
        selectedRingtone,
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
        endCall
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
