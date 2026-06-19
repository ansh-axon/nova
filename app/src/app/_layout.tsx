import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useState, useCallback, useRef } from 'react';
import { AppProvider, useApp } from '../context/AppContext';
import { ActivityIndicator, View, Modal, Text, TouchableOpacity, Image, StyleSheet, Dimensions, Animated, Easing } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import NeonAlert, { NeonAlertConfig, registerNeonAlert } from '../components/NeonAlert';
import { Ionicons } from '@expo/vector-icons';
import { CameraView } from 'expo-camera';
import { RTCView } from 'react-native-webrtc';
import GroupCallHost from '../components/GroupCallHost';
import UnlockScreen from '../components/UnlockScreen';

const { width } = Dimensions.get('window');

// Paint the native window background dark immediately, so there is NO white
// flash between the OS launch, the splash, and the first React frame.
SystemUI.setBackgroundColorAsync('#090d16').catch(() => {});

// Hold the native splash screen on-screen until the JS app tree is ready.
// Without this, splash auto-hides when the bundle loads, but React still has
// to mount AppProvider / restore auth from AsyncStorage — which causes a
// brief white flash. Keeping splash visible covers that gap.
SplashScreen.preventAutoHideAsync().catch(() => {
  // ignore — already prevented or no splash
});

function NeonAlertHost() {
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState<NeonAlertConfig | null>(null);

  const show = useCallback((cfg: NeonAlertConfig) => {
    setConfig(cfg);
    setVisible(true);
  }, []);

  useEffect(() => {
    registerNeonAlert(show);
  }, [show]);

  return (
    <NeonAlert
      visible={visible}
      config={config}
      onDismiss={() => setVisible(false)}
    />
  );
}

// RingingPulse sub-component
function RingingPulse({ isRinging, children }: { isRinging: boolean; children: React.ReactNode }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

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
}

function GlobalCallHost() {
  const { 
    incomingCall, 
    activeCall, 
    callState, 
    callDuration,
    setIncomingCall,
    setActiveCall,
    setCallState,
    setCallDuration,
    acceptCall,
    rejectCall,
    endCall,
    localStream,
    remoteStream,
    user
  } = useApp();

  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);

  const handleSwitchCamera = useCallback(() => {
    if (localStream) {
      localStream.getVideoTracks().forEach((track: any) => {
        if (typeof track._switchCamera === 'function') {
          track._switchCamera();
          console.log('[WebRTC] Camera switched successfully');
        } else {
          console.warn('[WebRTC] _switchCamera is not supported on this track');
        }
      });
    }
  }, [localStream]);

  // Call duration timer.
  // Derive elapsed time from the server-provided `startedAt` timestamp (set when the
  // call is accepted) so BOTH devices show the same duration. Previously each device
  // counted locally from the moment it switched to 'connected', which happened at
  // different times on caller vs receiver and caused the durations to drift apart.
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (callState === 'connected') {
      const startedAtRaw = activeCall?.startedAt;
      const startTime = startedAtRaw ? new Date(startedAtRaw).getTime() : Date.now();
      const tick = () => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setCallDuration(elapsed > 0 ? elapsed : 0);
      };
      tick(); // set immediately so UI doesn't show 00:00 for a second
      interval = setInterval(tick, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [callState, activeCall]);

  // Bind local mic muting to WebRTC track configurations
  useEffect(() => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track: any) => {
        track.enabled = !isMuted;
      });
      console.log('Local microphone track enabled:', !isMuted);
    }
  }, [isMuted, localStream]);

  // Bind local camera toggle to WebRTC track configurations
  useEffect(() => {
    if (localStream) {
      localStream.getVideoTracks().forEach((track: any) => {
        track.enabled = isVideoOn;
      });
      console.log('Local camera track enabled:', isVideoOn);
    }
  }, [isVideoOn, localStream]);

  if (!incomingCall && !activeCall) return null;

  const currentCall = activeCall || incomingCall;
  const isVideo = currentCall.callType === 'video';
  
  // Resolve other participant cleanly
  const otherUser = user && currentCall.caller && (currentCall.caller.id === user.id || currentCall.caller._id === user.id)
    ? currentCall.receiver
    : currentCall.caller;
    
  const displayName = otherUser?.displayName || otherUser?.username || 'User';
  const avatarUrl = otherUser?.avatarUrl || '';

  const formatCallDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
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

  const handleAccept = () => {
    acceptCall(currentCall._id || currentCall.id);
  };

  const handleReject = () => {
    rejectCall(currentCall._id || currentCall.id);
  };

  const handleHangUp = () => {
    endCall(currentCall._id || currentCall.id, callDuration);
  };

  return (
    <Modal
      animationType="fade"
      transparent={false}
      visible={true}
      onRequestClose={handleHangUp}
    >
      <StatusBar style="light" />
      <View style={styles.modalContainer}>
        {/* Remote Live Video Stream via RTCView */}
        {isVideo && callState === 'connected' && remoteStream ? (
          <RTCView
            streamURL={remoteStream.toURL()}
            style={StyleSheet.absoluteFillObject}
            objectFit="cover"
          />
        ) : (
          /* Fallback when no stream or connecting */
          isVideo && callState === 'connected' && (
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center' }]}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={[StyleSheet.absoluteFillObject, { opacity: 0.25 }]} blurRadius={15} />
              ) : (
                <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#090d16', opacity: 0.8 }]} />
              )}
              <ActivityIndicator size="large" color="#0df" style={{ position: 'absolute' }} />
              <Text style={{ color: 'rgba(0, 221, 255, 0.6)', marginTop: 80, fontFamily: 'monospace', letterSpacing: 2, fontSize: 11 }}>CONNECTING LIVE FEED...</Text>
            </View>
          )
        )}

        {/* Remote Audio/Voice static panel layout for voice call or video ringing state */}
        {(!isVideo || callState !== 'connected') && (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#090d16', justifyContent: 'center', alignItems: 'center' }]}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={[StyleSheet.absoluteFillObject, { opacity: 0.15 }]} blurRadius={15} />
            ) : (
              <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#090d16', opacity: 0.8 }]} />
            )}
            <Ionicons name={isVideo ? 'videocam' : 'call'} size={120} color="rgba(0, 221, 255, 0.1)" style={{ position: 'absolute' }} />
          </View>
        )}

        {/* Local Camera Floating Live Video Stream */}
        {isVideo && (callState === 'ringing' || callState === 'connected') && isVideoOn && localStream && (
          <View style={styles.localCameraContainer}>
            <RTCView
              streamURL={localStream.toURL()}
              style={StyleSheet.absoluteFillObject}
              objectFit="cover"
            />
          </View>
        )}

        {/* Scanline grid decor */}
        <View style={styles.hologramScanline} />

        {/* Secure indicator */}
        <View style={styles.modalHeaderSec}>
          <Ionicons name="lock-closed" size={14} color="rgba(0, 221, 255, 0.4)" style={{ marginRight: 6 }} />
          <Text style={styles.modalSecText}>SECURE LINK ACTIVE</Text>
        </View>

        {/* Avatar section */}
        <View style={[styles.callAvatarSection, isVideo && callState === 'connected' && isVideoOn && styles.callAvatarSectionMini]}>
          <RingingPulse isRinging={callState === 'ringing'}>
            <View style={[styles.avatarInnerContainer, isVideo && callState === 'connected' && isVideoOn && { width: 60, height: 60, borderRadius: 30, borderWidth: 1.5 }]}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.callAvatarImage} />
              ) : (
                <View style={[styles.callAvatarFallback, { backgroundColor: getAvatarColor(displayName) }]}>
                  <Text style={[styles.callAvatarFallbackText, isVideo && callState === 'connected' && isVideoOn && { fontSize: 24 }]}>
                    {getInitials(displayName)}
                  </Text>
                </View>
              )}
            </View>
          </RingingPulse>

          <Text style={[styles.callingName, isVideo && callState === 'connected' && isVideoOn && { fontSize: 13, marginTop: 6, fontWeight: '700' }]}>
            {displayName}
          </Text>
          
          <Text style={[
            styles.callingStatus,
            callState === 'ringing' && { color: '#f59e0b' },
            callState === 'connected' && { color: '#10b981' },
            callState === 'ended' && { color: '#ef4444' },
            isVideo && callState === 'connected' && isVideoOn && { fontSize: 9, marginTop: 2, letterSpacing: 0.5 }
          ]}>
            {callState === 'ringing' && (incomingCall && !activeCall ? 'INCOMING CALL...' : 'RINGING UPLINK...')}
            {callState === 'connected' && `CONNECTED • ${formatCallDuration(callDuration)}`}
            {callState === 'ended' && 'CALL DISCONNECTED'}
          </Text>
        </View>

        {/* Controls */}
        <View style={styles.callControlsContainer}>
          {incomingCall && !activeCall ? (
            /* Incoming call Accept/Reject Row */
            <View style={[styles.controlsRow, { justifyContent: 'space-around', width: width * 0.7 }]}>
              {/* Reject Circle */}
              <TouchableOpacity style={styles.hangUpCircle} onPress={handleReject}>
                <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
              </TouchableOpacity>
              
              {/* Accept Circle */}
              <TouchableOpacity style={[styles.hangUpCircle, { backgroundColor: '#10b981', shadowColor: '#10b981' }]} onPress={handleAccept}>
                <Ionicons name="call" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : (
            /* Active call control options */
            <>
              <View style={styles.controlsRow}>
                {/* Mute button */}
                <TouchableOpacity
                  style={[styles.controlBtn, isMuted && styles.controlBtnActive]}
                  onPress={() => setIsMuted(!isMuted)}
                >
                  <Ionicons
                    name={isMuted ? 'mic-off' : 'mic'}
                    size={24}
                    color={isMuted ? '#090d16' : '#fff'}
                  />
                  <Text style={styles.controlBtnLabel}>{isMuted ? 'Muted' : 'Mute'}</Text>
                </TouchableOpacity>

                {/* Speaker button */}
                <TouchableOpacity
                  style={[styles.controlBtn, isSpeaker && styles.controlBtnActive]}
                  onPress={() => setIsSpeaker(!isSpeaker)}
                >
                  <Ionicons
                    name="volume-high"
                    size={24}
                    color={isSpeaker ? '#090d16' : '#fff'}
                  />
                  <Text style={styles.controlBtnLabel}>{isSpeaker ? 'Speaker On' : 'Speaker'}</Text>
                </TouchableOpacity>

                {/* Video camera toggle */}
                {isVideo && (
                  <TouchableOpacity
                    style={[styles.controlBtn, !isVideoOn && styles.controlBtnActive]}
                    onPress={() => setIsVideoOn(!isVideoOn)}
                  >
                    <Ionicons
                      name={isVideoOn ? 'videocam' : 'videocam-off'}
                      size={24}
                      color={!isVideoOn ? '#090d16' : '#fff'}
                    />
                    <Text style={styles.controlBtnLabel}>{isVideoOn ? 'Cam On' : 'Cam Off'}</Text>
                  </TouchableOpacity>
                )}

                {/* Switch camera button */}
                {isVideo && (
                  <TouchableOpacity
                    style={styles.controlBtn}
                    onPress={handleSwitchCamera}
                  >
                    <Ionicons
                      name="camera-reverse"
                      size={24}
                      color="#fff"
                    />
                    <Text style={styles.controlBtnLabel}>Switch</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Red Hangup button */}
              <TouchableOpacity style={styles.hangUpCircle} onPress={handleHangUp}>
                <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

// Branded loading screen shown during the app's cold start. Keeps the NOVA
// logo + a gentle pulse on-screen for the whole 2–4s init, so it feels like
// "NOVA is opening" rather than a blank loading screen. It hides the native
// splash on first paint so the transition is seamless.
function BrandedSplash() {
  const pulse = useRef(new Animated.Value(0.9)).current;
  const glow = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.9, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 0.9, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.35, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View
      style={styles.splashWrap}
      onLayout={() => { SplashScreen.hideAsync().catch(() => {}); }}
    >
      <Animated.View style={[styles.splashGlow, { opacity: glow }]} />
      <Animated.Image
        source={require('../../assets/images/splash-icon.png')}
        style={[styles.splashLogo, { transform: [{ scale: pulse }] }]}
        resizeMode="contain"
      />
      <Text style={styles.splashTitle}>NOVA</Text>
      <Text style={styles.splashTagline}>Connecting securely…</Text>
    </View>
  );
}

function RootLayoutNav() {
  const { token, loading } = useApp();
  const segments = useSegments();
  const router = useRouter();

  // Hide the native splash screen as soon as auth state is resolved.
  // This removes the 2-second white flash between splash and first render.
  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [loading]);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!token && !inAuthGroup) {
      // New users land on the animated Sign Up screen first; login is one tap away.
      router.replace('/(auth)/register');
    } else if (token && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [token, loading, segments]);

  if (loading) {
    return <BrandedSplash />;
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#090d16' } }}>
      <Stack.Screen name="(auth)/login" options={{ animation: 'fade' }} />
      <Stack.Screen name="(auth)/register" options={{ animation: 'fade' }} />
      <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
      <Stack.Screen name="chat/[conversationId]" options={{ 
        headerShown: false,
        animation: 'slide_from_right' 
      }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#090d16' }}>
      <AppProvider>
        <StatusBar style="light" backgroundColor="#090d16" />
        <RootLayoutNav />
        <NeonAlertHost />
        <GlobalCallHost />
        <GroupCallHost />
        <AppLockGate />
      </AppProvider>
    </GestureHandlerRootView>
  );
}

// Full-screen lock gate shown over everything when App Lock is enabled and the
// app is currently locked (fresh launch or returning from background).
function AppLockGate() {
  const { appLockEnabled, appLocked, setAppLocked } = useApp();
  if (!appLockEnabled || !appLocked) return null;
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 9999 }]}>
      <UnlockScreen
        title="NOVA is Locked"
        subtitle="Unlock with fingerprint or PIN"
        onUnlock={() => setAppLocked(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  splashWrap: {
    flex: 1,
    backgroundColor: '#090d16',
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashGlow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#0df',
    opacity: 0.18,
    top: '38%',
  },
  splashLogo: {
    width: 110,
    height: 110,
    marginBottom: 22,
  },
  splashTitle: {
    color: '#f8fafc',
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 8,
    textShadowColor: 'rgba(0, 221, 255, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
  splashTagline: {
    color: '#38bdf8',
    fontSize: 12,
    letterSpacing: 1.5,
    fontWeight: '600',
    marginTop: 12,
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
});
