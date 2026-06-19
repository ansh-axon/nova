import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, Text, View, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Image, ActivityIndicator, Modal, StatusBar, Dimensions, ImageBackground, Animated, Easing } from 'react-native';
import { showNeonAlert } from '../../components/NeonAlert';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApp, Message } from '../../context/AppContext';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, Camera } from 'expo-camera';
import { Audio, Video, ResizeMode, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

const { width } = Dimensions.get('window');

// EMOJI DETECTION HELPER
const isOnlyEmoji = (text: string) => {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > 12) return false;
  // Remove all emoji-related characters and whitespace; if nothing remains, it's emoji-only
  const stripped = trimmed.replace(/[\s\uFE0F\u200D\u20E3]/g, '')
    .replace(/[\u2600-\u27BF]/g, '')
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
    .replace(/[\u2011-\u26FF]/g, '')
    .replace(/[\uE000-\uF8FF]/g, '');
  return stripped.length === 0;
};


// SUB-COMPONENT: HIGH PERFORMANCE NATIVE ANIMATED EMOJI
const AnimatedEmoji = ({ emoji }: { emoji: string }) => {
  const animValue = React.useRef(new Animated.Value(emoji.includes('❤️') || emoji.includes('💖') ? 1.0 : 0)).current;

  useEffect(() => {
    const isHeart = emoji.includes('❤️') || emoji.includes('💖') || emoji.includes('💕') || emoji.includes('💜');
    const isSpin = emoji.includes('✨') || emoji.includes('🌟') || emoji.includes('💫') || emoji.includes('🌀');
    const isBounce = emoji.includes('😂') || emoji.includes('🤣') || emoji.includes('😭') || emoji.includes('👍') || emoji.includes('👏');

    if (isHeart) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(animValue, {
            toValue: 1.25,
            duration: 150,
            useNativeDriver: true,
            easing: Easing.linear
          }),
          Animated.timing(animValue, {
            toValue: 0.9,
            duration: 150,
            useNativeDriver: true,
            easing: Easing.linear
          }),
          Animated.timing(animValue, {
            toValue: 1.2,
            duration: 150,
            useNativeDriver: true,
            easing: Easing.linear
          }),
          Animated.timing(animValue, {
            toValue: 1.0,
            duration: 600,
            useNativeDriver: true,
            easing: Easing.linear
          })
        ])
      ).start();
    } else if (isSpin) {
      Animated.loop(
        Animated.timing(animValue, {
          toValue: 1,
          duration: 4000,
          useNativeDriver: true,
          easing: Easing.linear
        })
      ).start();
    } else if (isBounce) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(animValue, {
            toValue: -24,
            duration: 350,
            useNativeDriver: true,
            easing: Easing.bezier(0.25, 0.46, 0.45, 0.94)
          }),
          Animated.timing(animValue, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
            easing: Easing.bezier(0.55, 0.085, 0.68, 0.53)
          }),
          Animated.delay(250)
        ])
      ).start();
    } else {
      Animated.loop(
        Animated.sequence([
          Animated.timing(animValue, {
            toValue: 1.15,
            duration: 1100,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.ease)
          }),
          Animated.timing(animValue, {
            toValue: 1.0,
            duration: 1100,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.ease)
          })
        ])
      ).start();
    }
  }, [emoji]);

  const isHeart = emoji.includes('❤️') || emoji.includes('💖') || emoji.includes('💕') || emoji.includes('💜');
  const isSpin = emoji.includes('✨') || emoji.includes('🌟') || emoji.includes('💫') || emoji.includes('🌀');
  const isBounce = emoji.includes('😂') || emoji.includes('🤣') || emoji.includes('😭') || emoji.includes('👍') || emoji.includes('👏');

  let transformStyle = {};
  if (isHeart) {
    transformStyle = { transform: [{ scale: animValue }] };
  } else if (isSpin) {
    const rotateInterpolate = animValue.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '360deg']
    });
    transformStyle = { transform: [{ rotate: rotateInterpolate }, { scale: 1.15 }] };
  } else if (isBounce) {
    transformStyle = { transform: [{ translateY: animValue }] };
  } else {
    transformStyle = { transform: [{ scale: animValue }] };
  }

  return (
    <Animated.View style={[styles.emojiAnimWrapper, transformStyle]}>
      <Text style={styles.largeEmojiText}>{emoji}</Text>
    </Animated.View>
  );
};

// SUB-COMPONENT: ANIMATED RINGING PULSE FOR CALL UI
const RingingPulse = ({ isRinging, children }: { isRinging: boolean; children: React.ReactNode }) => {
  const pulseAnim = React.useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isRinging) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.12,
            duration: 800,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.ease)
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 800,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.ease)
          })
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRinging]);

  return (
    <Animated.View style={[styles.avatarPulseCircle, isRinging && styles.avatarPulseAnimation, { transform: [{ scale: pulseAnim }] }]}>
      {children}
    </Animated.View>
  );
};

export default function ChatScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const { 
    conversations, 
    messages, 
    loadMessages, 
    sendMessage, 
    uploadFile, 
    serverUrl, 
    user, 
    socket, 
    initiateCallLog, 
    chatWallpaper, 
    setCallState, 
    setCallDuration, 
    setActiveCall,
    markConversationRead
  } = useApp();
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  // Immersive viewer & dynamic audio memo states
  const [fullViewImageUri, setFullViewImageUri] = useState<string | null>(null);
  const [showImageModal, setShowImageModal] = useState(false);
  const [fullViewVideoUri, setFullViewVideoUri] = useState<string | null>(null);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  // Authoritative handle to the active recording (state can be stale in async flows).
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordStartRef = useRef<number>(0);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  // Live clock tick (updates every second) for the 30-day auto-purge countdown banner
  const [nowTick, setNowTick] = useState(Date.now());



  // Interactive Poll Creator Modal states
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOpt1, setPollOpt1] = useState('');
  const [pollOpt2, setPollOpt2] = useState('');
  const [pollOpt3, setPollOpt3] = useState('');

  // Holographic Event Creator Modal states
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [eventDesc, setEventDesc] = useState('');

  const flatListRef = useRef<FlatList>(null);
  const router = useRouter();

  // Find corresponding conversation
  const conversation = conversations.find((c) => c._id === conversationId);
  const otherParticipant = conversation?.participants.find((p) => p.id !== user?.id) || conversation?.participants[0];
  const isAI = otherParticipant?.username === 'meta_ai';

  // Load message history on focus
  useEffect(() => {
    if (!conversationId) return;
    const fetchChatData = async () => {
      await loadMessages(conversationId);
      setLoading(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 150);
      // Mark the other person's messages as read (seen) once we open the chat
      markConversationRead(conversationId);
    };
    fetchChatData();
  }, [conversationId]);

  // Listen for socket typing events and automatic scrolls
  useEffect(() => {
    if (!socket || !conversationId) return;

    socket.on('typing_status', (data: { conversationId: string; senderId: string; isTyping: boolean }) => {
      if (data.conversationId === conversationId && data.senderId === otherParticipant?.id) {
        setOtherUserTyping(data.isTyping);
      }
    });

    return () => {
      socket.off('typing_status');
    };
  }, [socket, conversationId, otherParticipant]);

  // Trigger typing emission to recipient when user types
  const handleInputChange = (text: string) => {
    setInputText(text);
    if (!socket || !otherParticipant || isAI) return;

    if (text.length > 0 && !isTyping) {
      setIsTyping(true);
      socket.emit('typing', {
        conversationId,
        recipientId: otherParticipant.id,
        isTyping: true
      });
    } else if (text.length === 0 && isTyping) {
      setIsTyping(false);
      socket.emit('typing', {
        conversationId,
        recipientId: otherParticipant.id,
        isTyping: false
      });
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() || !conversationId) return;

    const textToSend = inputText;
    setInputText('');
    
    // Stop typing status if active
    if (isTyping && socket && otherParticipant && !isAI) {
      setIsTyping(false);
      socket.emit('typing', {
        conversationId,
        recipientId: otherParticipant.id,
        isTyping: false
      });
    }

    await sendMessage(conversationId, textToSend);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);
  };



  const handleStartCall = async (type: 'voice' | 'video') => {
    if (!otherParticipant) return;
    
    if (type === 'video') {
      const { status } = await Camera.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        showNeonAlert({
          title: 'PERMISSION DENIED',
          message: 'Camera access is required for video calling features.',
          icon: 'videocam-outline',
          iconColor: '#f43f5e',
          borderColor: '#f43f5e',
        });
        return;
      }
    }

    // Set global calling states
    setCallState('ringing');
    setCallDuration(0);
    
    // Set a uniform initial local active call object
    const tempCall = {
      _id: `temp_${Date.now()}`,
      caller: user,
      receiver: otherParticipant,
      callType: type,
      status: 'ringing',
      callRoomId: `room_${Date.now()}`
    };
    
    setActiveCall(tempCall);

    try {
      const callData = await initiateCallLog(otherParticipant.id, type, conversationId);
      if (callData) {
        setActiveCall(callData);
      }
    } catch (err) {
      console.log('Call log failed, but call UI continues:', err);
    }
  };

  // Advanced Secure Attachment Selectors
  const handleAttachmentMenu = () => {
    setShowAttachmentMenu(!showAttachmentMenu);
  };

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const uri = asset.uri;
        const name = asset.name;
        const size = asset.size ? `${(asset.size / (1024 * 1024)).toFixed(2)} MB` : 'Unknown size';
        const mimeType = asset.mimeType || 'application/octet-stream';

        setIsUploading(true);
        const uploadResult = await uploadFile(uri, mimeType);
        if (uploadResult && uploadResult.url) {
          const textMsg = `📁 Secure Document: ${name} (${size}) • AES-256 Verified 🔒`;
          await sendMessage(conversationId, textMsg, 'file', uploadResult.url);
        }
        setIsUploading(false);
      }
    } catch (err) {
      console.error('Pick document error:', err);
      setIsUploading(false);
    }
  };

  const handleCameraAction = () => {
    handleLaunchCamera();
  };

  const handleLaunchCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.7
    });

    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      setIsUploading(true);
      try {
        const uploadResult = await uploadFile(uri, 'image/jpeg');
        if (uploadResult && uploadResult.url) {
          await sendMessage(conversationId, '📷 Photo Shared • Encrypted 🔒', 'image', uploadResult.url);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsUploading(false);
      }
    }
  };

  const handleLaunchGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7
    });

    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      setIsUploading(true);
      try {
        const uploadResult = await uploadFile(uri, 'image/jpeg');
        if (uploadResult && uploadResult.url) {
          await sendMessage(conversationId, '📷 Photo Shared • Encrypted 🔒', 'image', uploadResult.url);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsUploading(false);
      }
    }
  };

  const handlePickVideo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showNeonAlert({
        title: 'PERMISSION DENIED',
        message: 'Gallery access permission is required to select videos!',
        icon: 'alert-circle-outline',
        iconColor: '#f59e0b',
        borderColor: '#f59e0b',
      });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: false,
      quality: 0.8
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const uri = asset.uri;
      const duration = asset.duration ? `${Math.round(asset.duration / 1000)}s` : '';
      setIsUploading(true);
      try {
        const uploadResult = await uploadFile(uri, 'video/mp4');
        if (uploadResult && uploadResult.url) {
          await sendMessage(conversationId, `📹 Video Shared${duration ? ` (${duration})` : ''} • Encrypted 🔒`, 'video', uploadResult.url);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsUploading(false);
      }
    }
  };

  const startAudioRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        showNeonAlert({
          title: 'PERMISSION DENIED',
          message: 'Microphone permission is required to record voice notes!',
          icon: 'alert-circle-outline',
          iconColor: '#f59e0b',
          borderColor: '#f59e0b',
        });
        return;
      }

      // CRITICAL: clean up any leftover recording from a previous (failed/aborted)
      // attempt. expo-av only allows ONE Recording object at a time — a stale one
      // makes createAsync throw and breaks the feature entirely until app restart.
      if (recordingRef.current) {
        try { await recordingRef.current.stopAndUnloadAsync(); } catch (e) {}
        recordingRef.current = null;
        setRecording(null);
      }

      // Configure a clean recording audio session. DO_NOT_MIX ensures we take
      // exclusive control of the mic — important because react-native-webrtc
      // (calls) can otherwise hold the audio session and block recording.
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldRouteThroughEarpieceAndroid: false,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      });

      console.log('Starting audio recording...');
      const newRecording = new Audio.Recording();
      await newRecording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await newRecording.startAsync();

      recordingRef.current = newRecording;
      recordStartRef.current = Date.now();
      setRecording(newRecording);
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording:', err);
      // Make sure we don't leave a half-prepared recording around.
      recordingRef.current = null;
      setRecording(null);
      setIsRecording(false);
      try { await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true }); } catch (e) {}
      showNeonAlert({
        title: 'RECORDING ERROR',
        message: 'Could not start the microphone. Close any active call and try again.',
        icon: 'close-circle-outline',
        iconColor: '#f43f5e',
        borderColor: '#f43f5e',
      });
    }
  };

  const stopAudioRecording = async () => {
    const activeRecording = recordingRef.current || recording;
    if (!activeRecording) {
      setIsRecording(false);
      return;
    }
    try {
      console.log('Stopping audio recording...');
      setIsRecording(false);
      const elapsed = recordStartRef.current ? Date.now() - recordStartRef.current : 0;

      await activeRecording.stopAndUnloadAsync();
      // Reset audio mode out of "recording" so playback routes correctly afterwards
      try {
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      } catch (e) {}
      const uri = activeRecording.getURI();
      recordingRef.current = null;
      setRecording(null);

      // Ignore accidental taps (recording shorter than ~0.7s has no usable audio).
      if (elapsed < 700) {
        showNeonAlert({
          title: 'TOO SHORT',
          message: 'Hold to record a longer voice note.',
          icon: 'mic-off-outline',
          iconColor: '#f59e0b',
          borderColor: '#f59e0b',
        });
        return;
      }

      if (uri) {
        setIsUploading(true);
        const uploadResult = await uploadFile(uri, 'audio/m4a');
        if (uploadResult && uploadResult.url) {
          await sendMessage(conversationId, '🎤 Voice Note Transmitted • Encrypted 🔒', 'audio', uploadResult.url);
        }
        setIsUploading(false);
      }
    } catch (err: any) {
      console.error('Failed to stop recording:', err);
      recordingRef.current = null;
      setRecording(null);
      setIsUploading(false);
      showNeonAlert({
        title: 'RECORDING ERROR',
        message: err.message || 'Failed to save the voice note.',
        icon: 'close-circle-outline',
        iconColor: '#f43f5e',
        borderColor: '#f43f5e',
      });
    }
  };

  const handleCreatePollSubmit = async () => {
    if (!pollQuestion.trim() || !pollOpt1.trim() || !pollOpt2.trim()) {
      showNeonAlert({
        title: 'INPUT REQUIRED',
        message: 'Please fill out the question and at least 2 options!',
        icon: 'information-circle-outline',
        iconColor: '#0df',
        borderColor: '#0df',
      });
      return;
    }

    const options = [
      { id: '1', text: pollOpt1.trim(), votes: 0 },
      { id: '2', text: pollOpt2.trim(), votes: 0 }
    ];
    if (pollOpt3.trim()) {
      options.push({ id: '3', text: pollOpt3.trim(), votes: 0 });
    }

    const pollObj = {
      question: pollQuestion.trim(),
      options
    };

    const pollMessageString = `POLL:${JSON.stringify(pollObj)}`;
    await sendMessage(conversationId, pollMessageString);
    
    // Clear states & close modal
    setPollQuestion('');
    setPollOpt1('');
    setPollOpt2('');
    setPollOpt3('');
    setShowPollModal(false);
  };

  const handleCreateEventSubmit = async () => {
    if (!eventTitle.trim() || !eventDate.trim() || !eventTime.trim()) {
      showNeonAlert({
        title: 'MISSING FIELDS',
        message: 'Please fill out the title, date, and time!',
        icon: 'information-circle-outline',
        iconColor: '#0df',
        borderColor: '#0df',
      });
      return;
    }

    const eventObj = {
      title: eventTitle.trim(),
      date: eventDate.trim(),
      time: eventTime.trim(),
      desc: eventDesc.trim()
    };

    const eventMessageString = `EVENT:${JSON.stringify(eventObj)}`;
    await sendMessage(conversationId, eventMessageString);

    // Clear states & close modal
    setEventTitle('');
    setEventDate('');
    setEventTime('');
    setEventDesc('');
    setShowEventModal(false);
  };

  const chatMessages = messages[conversationId] || [];

  // When new messages arrive while this chat is open, mark them seen immediately
  useEffect(() => {
    if (!conversationId || chatMessages.length === 0) return;
    const last = chatMessages[chatMessages.length - 1];
    const lastSenderId = typeof last.sender === 'string' ? last.sender : (last.sender as any)?._id || (last.sender as any)?.id;
    if (lastSenderId && lastSenderId !== user?.id) {
      markConversationRead(conversationId);
    }
  }, [chatMessages.length, conversationId]);

  // Live ticking clock for the 30-day auto-purge countdown shown under the header.
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Safety: if the user leaves the chat mid-recording, unload it so the next
  // recording attempt doesn't fail with "Only one Recording object" error.
  useEffect(() => {
    return () => {
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
      }
    };
  }, []);

  // Each message auto-deletes 30 days after it was sent (server TTL index). The banner
  // counts down to when the OLDEST message in this chat will purge. Returns null when
  // there are no messages yet.
  const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
  const getPurgeCountdown = () => {
    if (!chatMessages.length) return null;
    const oldest = chatMessages.reduce((min, m) => {
      const t = new Date(m.createdAt).getTime();
      return t < min ? t : min;
    }, Infinity);
    if (!isFinite(oldest)) return null;
    let remaining = oldest + RETENTION_MS - nowTick;
    if (remaining < 0) remaining = 0;
    const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
    const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const mins = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
    const secs = Math.floor((remaining % (60 * 1000)) / 1000);
    return `${days}d ${hours.toString().padStart(2, '0')}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
  };

  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours % 12 || 12}:${minutes} ${hours >= 12 ? 'PM' : 'AM'}`;
  };

  const getInitials = (name?: string) => {
    return name ? name.charAt(0).toUpperCase() : '?';
  };

  const getAvatarColor = (name?: string) => {
    if (!name) return '#0df';
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = ['#f43f5e', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#06b6d4'];
    return colors[Math.abs(hash) % colors.length];
  };

  // SUB-COMPONENT: INTERACTIVE POLL BUBBLE
  const PollBubble = ({ pollData }: { pollData: any }) => {
    const [selectedOpt, setSelectedOpt] = useState<string | null>(null);
    const [votes, setVotes] = useState<any>(pollData.options);

    const handleVote = (optId: string) => {
      if (selectedOpt) return; // Allow exactly one vote
      setSelectedOpt(optId);
      setVotes((prev: any) =>
        prev.map((opt: any) =>
          opt.id === optId ? { ...opt, votes: opt.votes + 1 } : opt
        )
      );
    };

    const totalVotes = votes.reduce((sum: number, o: any) => sum + o.votes, 0) || 1;

    return (
      <View style={styles.pollContainer}>
        <View style={styles.pollHeader}>
          <Ionicons name="bar-chart" size={18} color="#0df" style={{ marginRight: 6 }} />
          <Text style={styles.pollQuestion}>{pollData.question}</Text>
        </View>
        
        {votes.map((opt: any) => {
          const percentage = Math.round((opt.votes / totalVotes) * 100);
          const isChosen = selectedOpt === opt.id;
          
          return (
            <TouchableOpacity
              key={opt.id}
              style={[styles.pollOptRow, isChosen && styles.pollOptRowChosen]}
              onPress={() => handleVote(opt.id)}
            >
              {/* Vote percentage bar backing */}
              <View style={[styles.pollVoteBarFill, { width: `${percentage}%` }, isChosen && { backgroundColor: '#0df' }]} />
              
              <View style={styles.pollOptDetails}>
                <Text style={[styles.pollOptText, isChosen && { color: '#090d16', fontWeight: '700' }]}>
                  {opt.text}
                </Text>
                <Text style={[styles.pollOptVotes, isChosen && { color: '#090d16', fontWeight: '700' }]}>
                  {opt.votes} ({percentage}%)
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
        <Text style={styles.pollFooter}>matrix neural poll • tap to cast vote</Text>
      </View>
    );
  };

  // SUB-COMPONENT: CYBER AUDIOWAVE MEMO BUBBLE
  const AudioMemoBubble = ({ uri }: { uri: string }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [sound, setSound] = useState<Audio.Sound | null>(null);
    const [duration, setDuration] = useState(0);
    const [position, setPosition] = useState(0);

    const onStatus = (status: any) => {
      if (status.isLoaded) {
        if (status.durationMillis) setDuration(status.durationMillis);
        setPosition(status.positionMillis || 0);
        setIsPlaying(status.isPlaying);
        if (status.didJustFinish) {
          setIsPlaying(false);
          setPosition(0);
        }
      }
    };

    // Load the audio on mount so its duration shows BEFORE playing (like WhatsApp).
    useEffect(() => {
      let mounted = true;
      let localSound: Audio.Sound | null = null;
      (async () => {
        try {
          const { sound: s, status } = await Audio.Sound.createAsync(
            { uri },
            { shouldPlay: false, progressUpdateIntervalMillis: 250 },
            onStatus
          );
          localSound = s;
          if (!mounted) { await s.unloadAsync(); return; }
          if (status.isLoaded && status.durationMillis) setDuration(status.durationMillis);
          setSound(s);
        } catch (err) {
          console.log('Audio preload error:', err);
        }
      })();
      return () => {
        mounted = false;
        if (localSound) localSound.unloadAsync();
      };
    }, [uri]);

    const handlePlayPause = async () => {
      try {
        // Ensure audio routes to the loudspeaker for playback (not stuck in the
        // quiet earpiece, and not in record mode).
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          shouldRouteThroughEarpieceAndroid: false,
        });
        if (!sound) return;
        if (isPlaying) {
          await sound.pauseAsync();
          setIsPlaying(false);
        } else {
          const st: any = await sound.getStatusAsync();
          if (st.isLoaded && st.didJustFinish) {
            await sound.setPositionAsync(0);
          }
          await sound.playAsync();
          setIsPlaying(true);
        }
      } catch (err) {
        console.error('Play audio error:', err);
      }
    };

    const playProgress = duration > 0 ? position / duration : 0;
    const formatDuration = (ms: number) => {
      const totalSecs = Math.round(ms / 1000);
      const m = Math.floor(totalSecs / 60);
      const s = totalSecs % 60;
      return `${m}:${s.toString().padStart(2, '0')}`;
    };

    return (
      <View style={styles.audioBubbleContainer}>
        <TouchableOpacity
          style={styles.audioPlayBtn}
          onPress={handlePlayPause}
        >
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={20} color="#0df" />
        </TouchableOpacity>
        
        <View style={styles.audioWaveformContainer}>
          <View style={styles.audioProgressTrack}>
            <View style={[styles.audioProgressFill, { width: `${playProgress * 100}%` }]} />
          </View>
          <View style={styles.audioTimingRow}>
            <Text style={styles.audioTimeText}>
              {isPlaying || position > 0 ? formatDuration(position) : (duration > 0 ? formatDuration(duration) : '0:00')}
            </Text>
            <Ionicons name="mic-outline" size={14} color="#0df" />
          </View>
        </View>
      </View>
    );
  };

  // SUB-COMPONENT: HOLOGRAPHIC EVENT TICKET
  const EventBubble = ({ eventData }: { eventData: any }) => {
    return (
      <View style={styles.eventTicketContainer}>
        <View style={styles.eventTicketHeader}>
          <Ionicons name="ticket" size={20} color="#f59e0b" style={{ marginRight: 6 }} />
          <Text style={styles.eventTicketBadge}>SECURE EVENT TICKET</Text>
        </View>
        
        <Text style={styles.eventTicketTitle}>{eventData.title}</Text>
        
        <View style={styles.eventDividerDotted} />
        
        <View style={styles.eventDetailsRow}>
          <View style={styles.eventDetailCol}>
            <Text style={styles.eventLabel}>DATE</Text>
            <Text style={styles.eventValue}>{eventData.date}</Text>
          </View>
          <View style={styles.eventDetailCol}>
            <Text style={styles.eventLabel}>TIME</Text>
            <Text style={styles.eventValue}>{eventData.time}</Text>
          </View>
        </View>
        
        {eventData.desc ? (
          <Text style={styles.eventTicketDesc} numberOfLines={2}>
            {eventData.desc}
          </Text>
        ) : null}
        
        <View style={styles.eventBarcodeWrapper}>
          <View style={styles.eventBarcodeSim} />
          <Text style={styles.eventBarcodeCode}>NOVA-EV-{Math.round(Math.random() * 100000)}</Text>
        </View>
      </View>
    );
  };
  // SUB-COMPONENT: CYBER DOCUMENT BUBBLE
  const DocumentBubble = ({ item }: { item: Message }) => {
    const text = item.text || 'Secure Document';
    const cleanText = text.replace('📁', '').trim();
    const parts = cleanText.split('•');
    const title = parts[0].replace('Secure Document:', '').replace('Secure Document Transmitted:', '').trim();
    const meta = parts[1] ? parts[1].replace('🔒', '').trim() : 'AES-256 Secured';
    const [downloading, setDownloading] = useState(false);

    const handleDownloadAndOpen = async () => {
      if (!item.mediaUrl) {
        showNeonAlert({
          title: 'ERROR',
          message: 'This document does not have a valid download link.',
          icon: 'close-circle-outline',
          iconColor: '#f43f5e',
          borderColor: '#f43f5e',
        });
        return;
      }

      const fileUrl = item.mediaUrl.startsWith('http') 
        ? item.mediaUrl 
        : `${serverUrl}${item.mediaUrl}`;

      try {
        setDownloading(true);
        console.log('Downloading document from:', fileUrl);
        
        let filename = title.split(' ')[0] || 'document';
        if (filename.includes('(')) {
          filename = filename.substring(0, filename.indexOf('(')).trim();
        }
        
        const urlExt = fileUrl.split('.').pop()?.split('?')[0] || '';
        if (urlExt && !filename.toLowerCase().endsWith(`.${urlExt.toLowerCase()}`)) {
          filename = `${filename}.${urlExt}`;
        }
        
        const localPath = `${FileSystem.documentDirectory}${filename}`;
        
        console.log('Saving to local path:', localPath);
        
        const { uri } = await FileSystem.downloadAsync(fileUrl, localPath);
        setDownloading(false);
        
        console.log('Download complete, sharing local file URI:', uri);
        
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri);
        } else {
          showNeonAlert({
            title: 'SHARED',
            message: 'File downloaded successfully to your device vault!',
            icon: 'checkmark-circle-outline',
            iconColor: '#10b981',
            borderColor: '#10b981',
          });
        }
      } catch (err: any) {
        console.error('Download/Open document error:', err);
        setDownloading(false);
        showNeonAlert({
          title: 'TRANSMISSION ERROR',
          message: 'Failed to retrieve or open the secure document.',
          icon: 'warning-outline',
          iconColor: '#f43f5e',
          borderColor: '#f43f5e',
        });
      }
    };

    return (
      <TouchableOpacity 
        style={styles.documentContainer} 
        onPress={handleDownloadAndOpen}
        disabled={downloading}
      >
        <View style={styles.documentHeader}>
          {downloading ? (
            <ActivityIndicator size="small" color="#0df" style={{ marginRight: 8 }} />
          ) : (
            <Ionicons name="document-text" size={24} color="#0df" style={{ marginRight: 8 }} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.documentTitle} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.documentMeta}>{downloading ? 'Syncing...' : meta}</Text>
          </View>
          <Ionicons name="download-outline" size={18} color="#0df" />
        </View>
      </TouchableOpacity>
    );
  };

  const renderMessageItem = ({ item }: { item: Message }) => {
    const isMe = typeof item.sender === 'string' ? item.sender === user?.id : (item.sender as any)._id === user?.id;
    const isEmoji = item.text && isOnlyEmoji(item.text);
    const isImage = (item.text && item.text.startsWith('data:image/')) || item.messageType === 'image';
    const isVideo = (item.text && item.text.startsWith('data:video/')) || item.messageType === 'video';
    const isAudio = (item.text && item.text.startsWith('data:audio/')) || item.messageType === 'audio';
    const isPoll = item.text && item.text.startsWith('POLL:');
    const isEvent = item.text && item.text.startsWith('EVENT:');
    const isDocument = (item.text && (item.text.includes('📁 Secure Document') || item.text.startsWith('data:application/'))) || item.messageType === 'file';

    const mediaSourceUri = item.mediaUrl
      ? (item.mediaUrl.startsWith('http') ? item.mediaUrl : `${serverUrl}${item.mediaUrl}`)
      : item.text;

    let pollData: any = null;
    if (isPoll) {
      try {
        pollData = JSON.parse(item.text.substring(5));
      } catch (e) {
        console.error('Error parsing poll data:', e);
      }
    }

    let eventData: any = null;
    if (isEvent) {
      try {
        eventData = JSON.parse(item.text.substring(6));
      } catch (e) {
        console.error('Error parsing event data:', e);
      }
    }

    return (
      <View style={[styles.bubbleWrapper, isMe ? styles.myBubbleWrapper : styles.otherBubbleWrapper]}>
        {isEmoji ? (
          <View style={styles.emojiBubbleOnly}>
            <AnimatedEmoji emoji={item.text} />
            <Text style={[styles.messageTime, { alignSelf: 'flex-end', marginTop: 4 }]}>
              {formatTime(item.createdAt)}
            </Text>
          </View>
        ) : (
          <View style={[styles.bubble, isMe ? styles.myBubble : styles.otherBubble, (isPoll || isEvent || isDocument) ? styles.bentoCardBubble : null]}>
            {isImage ? (
              <TouchableOpacity onPress={() => {
                setFullViewImageUri(mediaSourceUri);
                setShowImageModal(true);
              }}>
                <Image source={{ uri: mediaSourceUri }} style={styles.bubbleImage} resizeMode="cover" />
              </TouchableOpacity>
            ) : isVideo ? (
              <TouchableOpacity
                style={styles.videoBubbleWrapper}
                activeOpacity={0.85}
                onPress={() => {
                  if (mediaSourceUri) {
                    setFullViewVideoUri(mediaSourceUri);
                    setShowVideoModal(true);
                  }
                }}
              >
                <View style={styles.videoPlayerPlaceholder}>
                  <Ionicons name="play-circle" size={48} color="#0df" />
                  <Text style={styles.videoPlaceholderText}>Tap to Stream Video Uplink</Text>
                </View>
              </TouchableOpacity>
            ) : isAudio ? (
              <AudioMemoBubble uri={mediaSourceUri} />
            ) : isPoll && pollData ? (
              <PollBubble pollData={pollData} />
            ) : isEvent && eventData ? (
              <EventBubble eventData={eventData} />
            ) : isDocument ? (
              <DocumentBubble item={item} />
            ) : (
              <Text style={styles.messageText}>{item.text}</Text>
            )}
            <View style={styles.bubbleFooter}>
              <Text style={styles.messageTime}>{formatTime(item.createdAt)}</Text>
              {isMe && (
                <Ionicons
                  name={item.status === 'read' ? 'checkmark-done' : 'checkmark'}
                  size={14}
                  color={item.status === 'read' ? '#0df' : '#94a3b8'}
                  style={{ marginLeft: 4 }}
                />
              )}
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {isUploading && (
        <View style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(9, 13, 22, 0.85)',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <ActivityIndicator size="large" color="#0df" />
          <Text style={{ color: '#0df', marginTop: 12, fontFamily: 'monospace', fontSize: 13, fontWeight: 'bold', letterSpacing: 1 }}>UPLOADING SECURE PACK...</Text>
        </View>
      )}
      {/* Custom Sliding Chat Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#cbd5e1" />
        </TouchableOpacity>

        {/* Recipient Profile Avatar */}
        <TouchableOpacity style={styles.profileTap}>
          {otherParticipant?.avatarUrl ? (
            <Image
              source={{ uri: otherParticipant.avatarUrl.startsWith('data:') ? otherParticipant.avatarUrl : `data:image/jpeg;base64,${otherParticipant.avatarUrl}` }}
              style={styles.headerAvatar}
            />
          ) : (
            <View style={[styles.headerAvatarFallback, { backgroundColor: getAvatarColor(otherParticipant?.displayName) }]}>
              <Text style={styles.headerAvatarFallbackText}>{getInitials(otherParticipant?.displayName)}</Text>
            </View>
          )}

          <View style={styles.headerTitleContainer}>
            <Text style={[styles.headerTitleText, isAI && styles.aiTitleText]}>
              {conversation?.isGroup ? (conversation.groupName || 'Group') : (otherParticipant?.displayName || 'User')}
            </Text>
            <Text style={styles.headerStatusText}>
              {conversation?.isGroup
                ? `${conversation.participants?.length || 0} members`
                : otherUserTyping
                ? 'typing...'
                : isAI
                ? 'Nova AI Bot 🤖'
                : otherParticipant?.isOnline
                ? 'Online'
                : 'Offline'}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerActionBtn} onPress={() => handleStartCall('voice')}>
            <Ionicons name="call-outline" size={22} color="#cbd5e1" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerActionBtn} onPress={() => handleStartCall('video')}>
            <Ionicons name="videocam-outline" size={22} color="#cbd5e1" />
          </TouchableOpacity>
        </View>
      </View>

      {/* 30-Day Auto-Purge Live Countdown Banner */}
      {getPurgeCountdown() && (
        <View style={styles.purgeBanner}>
          <Ionicons name="timer-outline" size={13} color="#0df" style={{ marginRight: 6 }} />
          <Text style={styles.purgeBannerText}>
            Auto-delete in <Text style={styles.purgeBannerTimer}>{getPurgeCountdown()}</Text>
          </Text>
        </View>
      )}

      {/* Main Message Stream */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={64}
      >
        {loading ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color="#0df" />
            <Text style={styles.loaderText}>Syncing conversation...</Text>
          </View>
        ) : chatWallpaper ? (
          <ImageBackground source={{ uri: chatWallpaper }} style={{ flex: 1 }} resizeMode="cover">
            <FlatList
              ref={flatListRef}
              data={chatMessages}
              keyExtractor={(item) => item._id}
              renderItem={renderMessageItem}
              contentContainerStyle={[styles.messageStreamContent, { backgroundColor: 'rgba(9, 13, 22, 0.7)' }]}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
              ListHeaderComponent={() => (
                <View style={styles.e2eBanner}>
                  <Ionicons name="lock-closed" size={12} color="#a1a1aa" style={{ marginRight: 6 }} />
                  <Text style={styles.e2eText}>
                    Messages are E2E encrypted and automatically self-destruct after 30 days for maximum security.
                  </Text>
                </View>
              )}
            />
          </ImageBackground>
        ) : (
          <FlatList
            ref={flatListRef}
            data={chatMessages}
            keyExtractor={(item) => item._id}
            renderItem={renderMessageItem}
            contentContainerStyle={styles.messageStreamContent}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            ListHeaderComponent={() => (
              <View style={styles.e2eBanner}>
                <Ionicons name="lock-closed" size={12} color="#a1a1aa" style={{ marginRight: 6 }} />
                <Text style={styles.e2eText}>
                  Messages are E2E encrypted and automatically self-destruct after 30 days for maximum security.
                </Text>
              </View>
            )}
          />
        )}

        {showAttachmentMenu && (
          <View style={styles.floatingAttachmentPanel}>
            <TouchableOpacity style={styles.attachmentPanelItem} onPress={() => { setShowAttachmentMenu(false); handleLaunchCamera(); }}>
              <View style={[styles.panelIconBg, { backgroundColor: '#f43f5e' }]}>
                <Ionicons name="camera" size={20} color="#fff" />
              </View>
              <Text style={styles.panelItemText}>Camera</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.attachmentPanelItem} onPress={() => { setShowAttachmentMenu(false); handleLaunchGallery(); }}>
              <View style={[styles.panelIconBg, { backgroundColor: '#8b5cf6' }]}>
                <Ionicons name="images" size={20} color="#fff" />
              </View>
              <Text style={styles.panelItemText}>Gallery</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.attachmentPanelItem} onPress={() => { setShowAttachmentMenu(false); handlePickVideo(); }}>
              <View style={[styles.panelIconBg, { backgroundColor: '#ec4899' }]}>
                <Ionicons name="videocam" size={20} color="#fff" />
              </View>
              <Text style={styles.panelItemText}>Video</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.attachmentPanelItem} onPress={() => { setShowAttachmentMenu(false); handlePickDocument(); }}>
              <View style={[styles.panelIconBg, { backgroundColor: '#0ea5e9' }]}>
                <Ionicons name="document-text" size={20} color="#fff" />
              </View>
              <Text style={styles.panelItemText}>Document</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.attachmentPanelItem} onPress={() => { setShowAttachmentMenu(false); setShowPollModal(true); }}>
              <View style={[styles.panelIconBg, { backgroundColor: '#10b981' }]}>
                <Ionicons name="bar-chart" size={20} color="#fff" />
              </View>
              <Text style={styles.panelItemText}>Poll</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.attachmentPanelItem} onPress={() => { setShowAttachmentMenu(false); setShowEventModal(true); }}>
              <View style={[styles.panelIconBg, { backgroundColor: '#f59e0b' }]}>
                <Ionicons name="ticket" size={20} color="#fff" />
              </View>
              <Text style={styles.panelItemText}>Event</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Custom Input Bar */}
        <View style={styles.inputContainer}>
          <View style={styles.textInputBoxWrapper}>
            <TouchableOpacity style={styles.inputActionBtn} onPress={handleAttachmentMenu}>
              <Ionicons name="add" size={24} color="#64748b" />
            </TouchableOpacity>
            
            <TextInput
              style={styles.textInput}
              placeholder="Message"
              placeholderTextColor="#475569"
              value={inputText}
              onChangeText={handleInputChange}
              multiline
            />

            <TouchableOpacity style={styles.inputActionBtn} onPress={handleLaunchCamera}>
              <Ionicons name="camera-outline" size={22} color="#64748b" />
            </TouchableOpacity>
          </View>

          {/* Glowing Send Button */}
          {inputText.trim().length > 0 ? (
            <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
              <Ionicons name="send" size={18} color="#090d16" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              style={[styles.sendBtn, isRecording ? { backgroundColor: '#ef4444' } : { backgroundColor: '#1e293b' }]} 
              onPress={isRecording ? stopAudioRecording : startAudioRecording}
            >
              <Ionicons name={isRecording ? "stop" : "mic"} size={20} color={isRecording ? "#fff" : "#0df"} />
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>



      {/* --- MODAL A: INTERACTIVE POLL CREATOR MODAL --- */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showPollModal}
        onRequestClose={() => setShowPollModal(false)}
      >
        <View style={styles.creatorModalOverlay}>
          <View style={styles.creatorModalContent}>
            <View style={styles.creatorModalHeader}>
              <Text style={styles.creatorModalTitle}>📊 Create Matrix Poll</Text>
              <TouchableOpacity onPress={() => setShowPollModal(false)} style={styles.creatorModalCloseBtn}>
                <Ionicons name="close" size={24} color="#cbd5e1" />
              </TouchableOpacity>
            </View>

            <View style={styles.creatorInputWrapper}>
              <Text style={styles.creatorLabel}>Poll Question</Text>
              <TextInput
                style={styles.creatorInput}
                placeholder="Ask something secure..."
                placeholderTextColor="#475569"
                value={pollQuestion}
                onChangeText={setPollQuestion}
              />
            </View>

            <View style={styles.creatorInputWrapper}>
              <Text style={styles.creatorLabel}>Option 1</Text>
              <TextInput
                style={styles.creatorInput}
                placeholder="Option 1"
                placeholderTextColor="#475569"
                value={pollOpt1}
                onChangeText={setPollOpt1}
              />
            </View>

            <View style={styles.creatorInputWrapper}>
              <Text style={styles.creatorLabel}>Option 2</Text>
              <TextInput
                style={styles.creatorInput}
                placeholder="Option 2"
                placeholderTextColor="#475569"
                value={pollOpt2}
                onChangeText={setPollOpt2}
              />
            </View>

            <View style={styles.creatorInputWrapper}>
              <Text style={styles.creatorLabel}>Option 3 (Optional)</Text>
              <TextInput
                style={styles.creatorInput}
                placeholder="Option 3 (Optional)"
                placeholderTextColor="#475569"
                value={pollOpt3}
                onChangeText={setPollOpt3}
              />
            </View>

            <TouchableOpacity style={styles.creatorSubmitBtn} onPress={handleCreatePollSubmit}>
              <Text style={styles.creatorSubmitBtnText}>Transmit Secure Poll</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* --- MODAL B: SECURE EVENT CREATOR MODAL --- */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showEventModal}
        onRequestClose={() => setShowEventModal(false)}
      >
        <View style={styles.creatorModalOverlay}>
          <View style={styles.creatorModalContent}>
            <View style={styles.creatorModalHeader}>
              <Text style={styles.creatorModalTitle}>🎟️ Schedule Cyber Event</Text>
              <TouchableOpacity onPress={() => setShowEventModal(false)} style={styles.creatorModalCloseBtn}>
                <Ionicons name="close" size={24} color="#cbd5e1" />
              </TouchableOpacity>
            </View>

            <View style={styles.creatorInputWrapper}>
              <Text style={styles.creatorLabel}>Event Title</Text>
              <TextInput
                style={styles.creatorInput}
                placeholder="Secure uplink meeting..."
                placeholderTextColor="#475569"
                value={eventTitle}
                onChangeText={setEventTitle}
              />
            </View>

            <View style={styles.creatorInputWrapper}>
              <Text style={styles.creatorLabel}>Date</Text>
              <TextInput
                style={styles.creatorInput}
                placeholder="e.g. June 15, 2026"
                placeholderTextColor="#475569"
                value={eventDate}
                onChangeText={setEventDate}
              />
            </View>

            <View style={styles.creatorInputWrapper}>
              <Text style={styles.creatorLabel}>Time</Text>
              <TextInput
                style={styles.creatorInput}
                placeholder="e.g. 6:00 PM IST"
                placeholderTextColor="#475569"
                value={eventTime}
                onChangeText={setEventTime}
              />
            </View>

            <View style={styles.creatorInputWrapper}>
              <Text style={styles.creatorLabel}>Description</Text>
              <TextInput
                style={styles.creatorInput}
                placeholder="Brief description..."
                placeholderTextColor="#475569"
                value={eventDesc}
                onChangeText={setEventDesc}
              />
            </View>

            <TouchableOpacity style={[styles.creatorSubmitBtn, { backgroundColor: '#f59e0b' }]} onPress={handleCreateEventSubmit}>
              <Text style={[styles.creatorSubmitBtnText, { color: '#090d16' }]}>Transmit Ticket</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {/* Full-Screen Image Immersive Viewer Modal */}
      <Modal
        visible={showImageModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowImageModal(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.95)', justifyContent: 'center', alignItems: 'center' }}>
          <StatusBar hidden />
          <TouchableOpacity 
            style={{ position: 'absolute', top: 40, right: 20, zIndex: 10, padding: 8, backgroundColor: 'rgba(9, 13, 22, 0.5)', borderRadius: 20 }}
            onPress={() => setShowImageModal(false)}
          >
            <Ionicons name="close" size={30} color="#fff" />
          </TouchableOpacity>
          {fullViewImageUri && (
            <Image 
              source={{ uri: fullViewImageUri }} 
              style={{ width: '100%', height: '80%' }} 
              resizeMode="contain" 
            />
          )}
        </SafeAreaView>
      </Modal>

      {/* Full-Screen Video Player Modal */}
      <Modal
        visible={showVideoModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => { setShowVideoModal(false); setFullViewVideoUri(null); }}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.97)', justifyContent: 'center', alignItems: 'center' }}>
          <StatusBar hidden />
          <TouchableOpacity 
            style={{ position: 'absolute', top: 40, right: 20, zIndex: 10, padding: 8, backgroundColor: 'rgba(9, 13, 22, 0.5)', borderRadius: 20 }}
            onPress={() => { setShowVideoModal(false); setFullViewVideoUri(null); }}
          >
            <Ionicons name="close" size={30} color="#fff" />
          </TouchableOpacity>
          {fullViewVideoUri && (
            <Video
              source={{ uri: fullViewVideoUri }}
              style={{ width: '100%', height: '80%' }}
              resizeMode={ResizeMode.CONTAIN}
              useNativeControls
              shouldPlay
              isLooping={false}
            />
          )}
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090d16',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 64,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
    paddingHorizontal: 8,
  },
  backButton: {
    padding: 8,
    borderRadius: 20,
  },
  profileTap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerAvatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  headerAvatarFallbackText: {
    color: '#090d16',
    fontSize: 16,
    fontWeight: '700',
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitleText: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
  },
  aiTitleText: {
    color: '#0df',
  },
  headerStatusText: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerActionBtn: {
    padding: 10,
    marginLeft: 4,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loaderText: {
    color: '#0df',
    fontSize: 14,
    marginTop: 12,
  },
  messageStreamContent: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    paddingBottom: 40,
  },
  e2eBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 20,
  },
  purgeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 221, 255, 0.06)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 221, 255, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  purgeBannerText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  purgeBannerTimer: {
    color: '#0df',
    fontWeight: '800',
    fontFamily: 'monospace',
  },
  e2eText: {
    color: '#f59e0b',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    flex: 1,
  },
  bubbleWrapper: {
    flexDirection: 'row',
    marginBottom: 14,
    width: '100%',
  },
  myBubbleWrapper: {
    justifyContent: 'flex-end',
  },
  otherBubbleWrapper: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: width * 0.78,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  myBubble: {
    backgroundColor: '#0c4a6e',
    borderBottomRightRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(0, 221, 255, 0.15)',
  },
  otherBubble: {
    backgroundColor: '#1e293b',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.03)',
  },
  messageText: {
    color: '#f1f5f9',
    fontSize: 15,
    lineHeight: 20,
  },
  bubbleFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 4,
  },
  messageTime: {
    color: '#94a3b8',
    fontSize: 10,
  },
  inputContainer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#090d16',
    alignItems: 'flex-end',
  },
  textInputBoxWrapper: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    borderRadius: 24,
    flex: 1,
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.03)',
  },
  textInput: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 16,
    maxHeight: 100,
    minHeight: 40,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  inputActionBtn: {
    padding: 8,
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#0df',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0df',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  bubbleImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#090d16',
    justifyContent: 'space-between',
    paddingVertical: 60,
    alignItems: 'center',
  },
  hologramScanline: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 221, 255, 0.02)',
    zIndex: 1,
    pointerEvents: 'none',
  },
  modalHeaderSec: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 221, 255, 0.06)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 221, 255, 0.15)',
    zIndex: 5,
  },
  modalSecText: {
    color: '#0df',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  callAvatarSection: {
    alignItems: 'center',
    zIndex: 5,
  },
  callAvatarSectionMini: {
    position: 'absolute',
    top: 100,
    right: 20,
    width: 110,
    height: 140,
    backgroundColor: 'rgba(9, 13, 22, 0.85)',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#0df',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
    paddingVertical: 10,
    shadowColor: '#0df',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  localCameraContainer: {
    position: 'absolute',
    top: 260,
    right: 20,
    width: 110,
    height: 160,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#0df',
    zIndex: 110,
    shadowColor: '#0df',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
  },
  avatarPulseCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(0, 221, 255, 0.03)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 221, 255, 0.15)',
    marginBottom: 24,
  },
  avatarPulseAnimation: {
    shadowColor: '#0df',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 15,
  },
  avatarInnerContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#0df',
    justifyContent: 'center',
    alignItems: 'center',
  },
  callAvatarImage: {
    width: '100%',
    height: '100%',
  },
  callAvatarFallback: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  callAvatarFallbackText: {
    color: '#090d16',
    fontSize: 48,
    fontWeight: '900',
  },
  callingName: {
    color: '#f8fafc',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  callingStatus: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
    letterSpacing: 2,
  },
  callControlsContainer: {
    alignItems: 'center',
    width: '100%',
    zIndex: 5,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: width * 0.8,
    marginBottom: 40,
  },
  controlBtn: {
    alignItems: 'center',
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  controlBtnActive: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  controlBtnLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 32,
    position: 'absolute',
    bottom: -22,
    width: 90,
    textAlign: 'center',
  },
  hangUpCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },

  // CYBER ADVANCED CHAT SHARING EXTRA STYLES
  videoBubbleWrapper: {
    width: 200,
    height: 120,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 4,
  },
  videoPlayerPlaceholder: {
    flex: 1,
    backgroundColor: '#020617',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 221, 255, 0.2)',
  },
  videoPlaceholderText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 8,
    textTransform: 'uppercase',
  },
  
  audioBubbleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 210,
    paddingVertical: 4,
  },
  audioPlayBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0, 221, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(0, 221, 255, 0.3)',
  },
  audioWaveformContainer: {
    flex: 1,
  },
  audioProgressTrack: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  audioProgressFill: {
    height: '100%',
    backgroundColor: '#0df',
  },
  audioTimingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  audioTimeText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  
  bentoCardBubble: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderWidth: 1.5,
    borderColor: 'rgba(0, 221, 255, 0.3)',
    shadowColor: '#0df',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  pollContainer: {
    width: 220,
    paddingVertical: 2,
  },
  pollHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    paddingBottom: 6,
  },
  pollQuestion: {
    color: '#0df',
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  pollOptRow: {
    position: 'relative',
    height: 38,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 8,
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: 10,
  },
  pollOptRowChosen: {
    borderColor: '#0df',
    backgroundColor: '#0df',
  },
  pollVoteBarFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 221, 255, 0.15)',
    borderRadius: 6,
  },
  pollOptDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 2,
  },
  pollOptText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '600',
  },
  pollOptVotes: {
    color: '#0df',
    fontSize: 11,
    fontWeight: '700',
  },
  pollFooter: {
    color: '#475569',
    fontSize: 9,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 4,
  },

  eventTicketContainer: {
    width: 230,
    paddingVertical: 2,
  },
  eventTicketHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  eventTicketBadge: {
    color: '#f59e0b',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  eventTicketTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
  },
  eventDividerDotted: {
    height: 1,
    borderWidth: 1,
    borderColor: '#f59e0b',
    borderStyle: 'dashed',
    marginVertical: 8,
    opacity: 0.3,
  },
  eventDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  eventDetailCol: {
    flex: 1,
  },
  eventLabel: {
    color: '#475569',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  eventValue: {
    color: '#f8fafc',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  eventTicketDesc: {
    color: '#94a3b8',
    fontSize: 11,
    lineHeight: 14,
    marginBottom: 10,
  },
  eventBarcodeWrapper: {
    alignItems: 'center',
    marginTop: 6,
  },
  eventBarcodeSim: {
    width: '100%',
    height: 16,
    backgroundColor: '#fff',
    opacity: 0.7,
    borderRadius: 2,
    marginBottom: 4,
  },
  eventBarcodeCode: {
    color: '#475569',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },

  // CREATOR MODALS STYLES
  creatorModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(9, 13, 22, 0.85)',
    justifyContent: 'flex-end',
  },
  creatorModalContent: {
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(0, 221, 255, 0.15)',
    paddingBottom: 40,
  },
  creatorModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    paddingBottom: 10,
  },
  creatorModalTitle: {
    color: '#0df',
    fontSize: 18,
    fontWeight: '800',
  },
  creatorModalCloseBtn: {
    padding: 4,
  },
  creatorInputWrapper: {
    marginBottom: 16,
  },
  creatorLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  creatorInput: {
    backgroundColor: 'rgba(9, 13, 22, 0.5)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    color: '#f8fafc',
    height: 46,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  creatorSubmitBtn: {
    height: 48,
    borderRadius: 10,
    backgroundColor: '#0df',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  creatorSubmitBtnText: {
    color: '#090d16',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  emojiBubbleOnly: {
    padding: 10,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiAnimWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
    minWidth: 70,
    minHeight: 70,
  },
  largeEmojiText: {
    fontSize: 48,
    textAlign: 'center',
  },
  documentContainer: {
    width: 220,
    paddingVertical: 4,
  },
  documentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  documentTitle: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
  },
  documentMeta: {
    color: '#0df',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  floatingAttachmentPanel: {
    position: 'absolute',
    bottom: 74,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderRadius: 24,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 221, 255, 0.15)',
    shadowColor: '#0df',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    zIndex: 999,
  },
  attachmentPanelItem: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelIconBg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  panelItemText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
});
