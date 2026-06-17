import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, Image, Modal, Dimensions, StatusBar, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import { useIsFocused } from '@react-navigation/native';

const { width, height } = Dimensions.get('window');

export default function CallsScreen() {
  const { user, callHistory, fetchCallHistory, initiateCallLog, endCallLog } = useApp();
  const isFocused = useIsFocused();

  // Call simulation states
  const [activeCall, setActiveCall] = useState<any | null>(null);
  const [callState, setCallState] = useState<'ringing' | 'connected' | 'ended'>('ringing');
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [loading, setLoading] = useState(false);

  // Fetch call log history when focused
  useEffect(() => {
    if (isFocused) {
      setLoading(true);
      fetchCallHistory().then(() => setLoading(false));
    }
  }, [isFocused]);

  // Connect simulation transitions and duration timer
  useEffect(() => {
    let connectTimeout: NodeJS.Timeout;
    let timerInterval: NodeJS.Timeout;

    if (activeCall && callState === 'ringing') {
      connectTimeout = setTimeout(() => {
        setCallState('connected');
      }, 3000); // ringing simulates for 3 seconds, then connects!
    }

    if (activeCall && callState === 'connected') {
      timerInterval = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    }

    return () => {
      if (connectTimeout) clearTimeout(connectTimeout);
      if (timerInterval) clearInterval(timerInterval);
    };
  }, [activeCall, callState]);

  const handleStartCall = async (targetUser: any, type: 'voice' | 'video') => {
    if (!targetUser) return;
    
    // 1. Write call initiation to backend DB
    const callLogId = await initiateCallLog(targetUser._id || targetUser.id, type);

    // 2. Open call overlay modal
    setActiveCall({
      id: callLogId,
      user: targetUser,
      type: type
    });
    setCallState('ringing');
    setCallDuration(0);
    setIsMuted(false);
    setIsSpeaker(false);
    setIsVideoOn(type === 'video');
  };

  const handleHangUp = async () => {
    if (!activeCall) return;

    setCallState('ended');

    // Update call log on backend
    if (activeCall.id) {
      await endCallLog(activeCall.id, callDuration);
    }

    // Dismiss call UI after showing "Call Ended" brief delay
    setTimeout(() => {
      setActiveCall(null);
    }, 1200);
  };

  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  const getInitials = (name: string) => {
    return name ? name.charAt(0).toUpperCase() : '?';
  };

  const getAvatarColor = (name: string) => {
    if (!name) return '#0df';
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = ['#f43f5e', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#06b6d4'];
    return colors[Math.abs(hash) % colors.length];
  };

  const formatCallTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const renderCallItem = ({ item }: { item: any }) => {
    const isCallerMe = item.caller?._id === user?.id || item.caller?.id === user?.id;
    const otherParty = isCallerMe ? item.receiver : item.caller;

    if (!otherParty) return null;

    const isMissed = item.status === 'missed' || item.status === 'rejected';
    const otherName = otherParty.displayName || otherParty.username || 'User';

    return (
      <View style={styles.callCard}>
        {/* Avatar letter or fallback */}
        {otherParty.avatarUrl ? (
          <Image source={{ uri: otherParty.avatarUrl }} style={styles.avatarImg} />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: getAvatarColor(otherName) }]}>
            <Text style={styles.avatarFallbackText}>{getInitials(otherName)}</Text>
          </View>
        )}

        {/* Info text */}
        <View style={styles.callInfo}>
          <Text style={styles.userName}>{otherName}</Text>
          
          <View style={styles.statusRow}>
            <Ionicons
              name={
                isCallerMe
                  ? 'arrow-up-outline'
                  : 'arrow-down-outline'
              }
              size={14}
              color={isCallerMe ? '#10b981' : isMissed ? '#ef4444' : '#0df'}
              style={{ marginRight: 6 }}
            />
            <Text style={styles.callTime}>
              {formatCallTime(item.createdAt)}
              {item.duration ? ` (${formatDuration(item.duration)})` : ''}
            </Text>
          </View>
        </View>

        {/* Direct Redial Button */}
        <TouchableOpacity
          style={styles.callButton}
          onPress={() => handleStartCall(otherParty, item.callType)}
        >
          <Ionicons
            name={item.callType === 'video' ? 'videocam-outline' : 'call-outline'}
            size={20}
            color="#0df"
          />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#090d16" />

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#0df" />
          <Text style={styles.loaderText}>Syncing neural call logs...</Text>
        </View>
      ) : callHistory.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="call-outline" size={64} color="#1e293b" />
          <Text style={styles.emptyText}>No secure calls logged</Text>
          <Text style={styles.emptySubtitle}>
            Encrypted holographic voice and video calls will display here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={callHistory}
          keyExtractor={(item) => item._id}
          renderItem={renderCallItem}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Cyberpunk Calling Overlay Modal */}
      {activeCall && (
        <Modal
          animationType="fade"
          transparent={false}
          visible={true}
          onRequestClose={handleHangUp}
        >
          <StatusBar hidden />
          <View style={styles.modalContainer}>
            {/* Holographic glowing lines decor */}
            <View style={styles.hologramScanline} />

            {/* Calling Info top */}
            <View style={styles.modalHeader}>
              <Ionicons name="lock-closed" size={14} color="rgba(0, 221, 255, 0.4)" style={{ marginRight: 6 }} />
              <Text style={styles.modalSecText}>E2E SECURE LINK ACTIVE</Text>
            </View>

            {/* Avatar & Neon glowing circles */}
            <View style={styles.callAvatarSection}>
              <View style={[styles.avatarPulseCircle, callState === 'ringing' && styles.avatarPulseAnimation]}>
                <View style={styles.avatarInnerContainer}>
                  {activeCall.user.avatarUrl ? (
                    <Image source={{ uri: activeCall.user.avatarUrl }} style={styles.callAvatarImage} />
                  ) : (
                    <View style={[styles.callAvatarFallback, { backgroundColor: getAvatarColor(activeCall.user.displayName || activeCall.user.username) }]}>
                      <Text style={styles.callAvatarFallbackText}>
                        {getInitials(activeCall.user.displayName || activeCall.user.username)}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              <Text style={styles.callingName}>
                {activeCall.user.displayName || activeCall.user.username}
              </Text>
              
              <Text style={[
                styles.callingStatus,
                callState === 'ringing' && { color: '#f59e0b' },
                callState === 'connected' && { color: '#10b981' },
                callState === 'ended' && { color: '#ef4444' }
              ]}>
                {callState === 'ringing' && 'RINGING UPLINK...'}
                {callState === 'connected' && `CONNECTED • ${formatDuration(callDuration)}`}
                {callState === 'ended' && 'CALL DISCONNECTED'}
              </Text>
            </View>

            {/* Interactive Call Controls bottom */}
            <View style={styles.callControlsContainer}>
              <View style={styles.controlsRow}>
                {/* Mute Button */}
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

                {/* Speaker Button */}
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
                {activeCall.type === 'video' && (
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
              </View>

              {/* Red Hangup button */}
              <TouchableOpacity style={styles.hangUpCircle} onPress={handleHangUp}>
                <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090d16',
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loaderText: {
    color: '#0df',
    fontSize: 14,
    marginTop: 16,
    letterSpacing: 0.5,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  callCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.02)',
  },
  avatarImg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 14,
  },
  avatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarFallbackText: {
    color: '#090d16',
    fontSize: 18,
    fontWeight: '700',
  },
  callInfo: {
    flex: 1,
  },
  userName: {
    color: '#f1f5f9',
    fontSize: 16,
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  callTime: {
    color: '#64748b',
    fontSize: 13,
  },
  callButton: {
    padding: 10,
    backgroundColor: 'rgba(0, 221, 255, 0.05)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 221, 255, 0.08)',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 120,
  },
  emptyText: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
  },
  emptySubtitle: {
    color: '#475569',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
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
  modalHeader: {
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
