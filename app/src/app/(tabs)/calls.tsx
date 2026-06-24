import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, Image, Modal, Dimensions, StatusBar, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Camera } from 'expo-camera';
import { showNeonAlert } from '../../components/NeonAlert';
import { useApp } from '../../context/AppContext';
import { useIsFocused } from '@react-navigation/native';

const { width, height } = Dimensions.get('window');

export default function CallsScreen() {
  const { user, callHistory, fetchCallHistory, initiateCallLog, endCallLog, users, fetchUsers, startGroupCall, markCallsSeen, activeCall, setActiveCall, setCallState, setCallDuration } = useApp();
  const isFocused = useIsFocused();

  const [loading, setLoading] = useState(false);

  // Group meeting starter states (voice only)
  const [showMeeting, setShowMeeting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const meetingType: 'voice' | 'video' = 'voice';

  // Fetch call log history when focused
  useEffect(() => {
    if (isFocused) {
      setLoading(true);
      fetchCallHistory().then(() => {
        setLoading(false);
        // Viewing the call log marks all missed calls as seen → clears tab badge.
        markCallsSeen();
      });
      fetchUsers();
    }
  }, [isFocused]);

  const otherUsers = (users || []).filter((u) => u.id !== user?.id && u.username !== 'meta_ai');

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 14) return prev; // 15 total incl. self
      return [...prev, id];
    });
  };

  const handleStartMeeting = () => {
    if (selectedIds.length === 0) return;
    const selectedUsers = otherUsers.filter((u) => selectedIds.includes(u.id));
    startGroupCall(selectedIds, meetingType, selectedUsers);
    setShowMeeting(false);
    setSelectedIds([]);
  };

  // Starts a REAL call (voice/video) via the global WebRTC call system; the
  // in-call UI is rendered by GlobalCallHost (no simulation / auto-connect).
  const handleStartCall = async (targetUser: any, type: 'voice' | 'video') => {
    if (!targetUser) return;
    if (type === 'video') {
      const { status } = await Camera.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        showNeonAlert({ title: 'PERMISSION DENIED', message: 'Camera access is required for video calling.', icon: 'videocam-outline', iconColor: '#f43f5e', borderColor: '#f43f5e' });
        return;
      }
    }
    setCallState('ringing');
    setCallDuration(0);
    const tempCall = {
      _id: `temp_${Date.now()}`,
      caller: user,
      receiver: targetUser,
      callType: type,
      status: 'ringing',
      callRoomId: `room_${Date.now()}`,
    };
    setActiveCall(tempCall);
    try {
      const callData = await initiateCallLog(targetUser._id || targetUser.id, type);
      if (callData) setActiveCall(callData);
    } catch (err) {
      console.log('Call log failed, but call UI continues:', err);
    }
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

        {/* Direct Redial Button — voice only */}
        <TouchableOpacity
          style={styles.callButton}
          onPress={() => handleStartCall(otherParty, 'voice')}
        >
          <Ionicons
            name="call-outline"
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

      {/* The active-call UI is rendered globally by GlobalCallHost (real WebRTC). */}

      {/* New Meeting Floating Button */}
      {!activeCall && (
        <TouchableOpacity style={styles.fab} onPress={() => setShowMeeting(true)} activeOpacity={0.85}>
          <Ionicons name="people" size={24} color="#090d16" />
          <Text style={styles.fabText}>Meeting</Text>
        </TouchableOpacity>
      )}

      {/* Group Meeting Participant Picker */}
      <Modal animationType="slide" transparent visible={showMeeting} onRequestClose={() => setShowMeeting(false)}>
        <View style={styles.pickerBackdrop}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHandle} />
            <Text style={styles.pickerTitle}>NEW GROUP MEETING</Text>
            <Text style={styles.pickerSub}>Select up to 14 participants ({selectedIds.length}/14)</Text>

            <FlatList
              data={otherUsers}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: height * 0.42 }}
              ListEmptyComponent={<Text style={styles.pickerEmpty}>No contacts found.</Text>}
              renderItem={({ item }) => {
                const selected = selectedIds.includes(item.id);
                const name = item.displayName || item.username;
                return (
                  <TouchableOpacity style={styles.pickerRow} onPress={() => toggleSelect(item.id)}>
                    {item.avatarUrl ? (
                      <Image source={{ uri: item.avatarUrl }} style={styles.pickerAvatar} />
                    ) : (
                      <View style={[styles.pickerAvatarFb, { backgroundColor: getAvatarColor(name) }]}>
                        <Text style={styles.pickerAvatarFbText}>{getInitials(name)}</Text>
                      </View>
                    )}
                    <Text style={styles.pickerName}>{name}</Text>
                    <Ionicons
                      name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                      size={24}
                      color={selected ? '#0df' : '#475569'}
                    />
                  </TouchableOpacity>
                );
              }}
            />

            <View style={styles.pickerActions}>
              <TouchableOpacity style={styles.pickerCancel} onPress={() => { setShowMeeting(false); setSelectedIds([]); }}>
                <Text style={styles.pickerCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pickerStart, selectedIds.length === 0 && { opacity: 0.4 }]}
                onPress={handleStartMeeting}
                disabled={selectedIds.length === 0}
              >
                <Ionicons name="call" size={18} color="#090d16" style={{ marginRight: 6 }} />
                <Text style={styles.pickerStartText}>Start Meeting</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0df',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 30,
    shadowColor: '#0df',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  fabText: {
    color: '#090d16',
    fontWeight: '800',
    fontSize: 14,
    marginLeft: 8,
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 30,
    borderTopWidth: 1,
    borderColor: 'rgba(0,221,255,0.2)',
  },
  pickerHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#334155',
    alignSelf: 'center',
    marginBottom: 16,
  },
  pickerTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
    textAlign: 'center',
  },
  pickerSub: {
    color: '#64748b',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 14,
  },
  typeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 14,
  },
  typeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  typeBtnActive: {
    backgroundColor: '#0df',
    borderColor: '#0df',
  },
  typeBtnText: {
    color: '#cbd5e1',
    fontWeight: '700',
    marginLeft: 8,
  },
  typeBtnTextActive: {
    color: '#090d16',
  },
  pickerEmpty: {
    color: '#475569',
    textAlign: 'center',
    paddingVertical: 20,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  pickerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  pickerAvatarFb: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerAvatarFbText: {
    color: '#090d16',
    fontWeight: '800',
    fontSize: 16,
  },
  pickerName: {
    flex: 1,
    color: '#e2e8f0',
    fontSize: 15,
    fontWeight: '600',
  },
  pickerActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  pickerCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
  },
  pickerCancelText: {
    color: '#cbd5e1',
    fontWeight: '700',
  },
  pickerStart: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#0df',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerStartText: {
    color: '#090d16',
    fontWeight: '800',
    fontSize: 15,
  },
});
