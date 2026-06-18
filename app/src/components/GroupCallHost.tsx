import React, { useState, useCallback } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Dimensions, Image, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { RTCView } from 'react-native-webrtc';
import { useApp } from '../context/AppContext';

const { width } = Dimensions.get('window');

const getInitials = (name?: string) => (name ? name.charAt(0).toUpperCase() : '?');

const getAvatarColor = (name?: string) => {
  if (!name) return '#0df';
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const colors = ['#f43f5e', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#06b6d4'];
  return colors[Math.abs(hash) % colors.length];
};

// A single participant video/voice tile.
function CallTile({ stream, name, isVideo, muted }: { stream: any; name: string; isVideo: boolean; muted?: boolean }) {
  const hasVideo = isVideo && stream && stream.getVideoTracks && stream.getVideoTracks().length > 0;
  return (
    <View style={styles.tile}>
      {hasVideo ? (
        <RTCView streamURL={stream.toURL()} style={StyleSheet.absoluteFillObject} objectFit="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, styles.tileAvatarWrap]}>
          <View style={[styles.tileAvatar, { backgroundColor: getAvatarColor(name) }]}>
            <Text style={styles.tileAvatarText}>{getInitials(name)}</Text>
          </View>
        </View>
      )}
      <View style={styles.tileNameTag}>
        {muted && <Ionicons name="mic-off" size={11} color="#f43f5e" style={{ marginRight: 4 }} />}
        <Text style={styles.tileNameText} numberOfLines={1}>{name}</Text>
      </View>
    </View>
  );
}

export default function GroupCallHost() {
  const {
    user,
    groupCall,
    incomingGroupCall,
    groupCallState,
    groupLocalStream,
    groupRemoteStreams,
    groupParticipants,
    acceptGroupCall,
    rejectGroupCall,
    leaveGroupCall,
  } = useApp();

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);

  const isVideo = (groupCall?.callType || incomingGroupCall?.callType) === 'video';

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (groupLocalStream) {
        groupLocalStream.getAudioTracks().forEach((t: any) => { t.enabled = !next; });
      }
      return next;
    });
  }, [groupLocalStream]);

  const toggleVideo = useCallback(() => {
    setIsVideoOn((prev) => {
      const next = !prev;
      if (groupLocalStream) {
        groupLocalStream.getVideoTracks().forEach((t: any) => { t.enabled = next; });
      }
      return next;
    });
  }, [groupLocalStream]);

  const switchCamera = useCallback(() => {
    if (groupLocalStream) {
      groupLocalStream.getVideoTracks().forEach((t: any) => {
        if (typeof t._switchCamera === 'function') t._switchCamera();
      });
    }
  }, [groupLocalStream]);

  // ── Incoming meeting ring screen ──
  if (incomingGroupCall && !groupCall) {
    const caller = incomingGroupCall.caller || {};
    return (
      <Modal animationType="fade" transparent={false} visible onRequestClose={rejectGroupCall}>
        <StatusBar style="light" />
        <View style={styles.incomingContainer}>
          <Text style={styles.incomingLabel}>INCOMING {incomingGroupCall.callType === 'video' ? 'VIDEO' : 'VOICE'} MEETING</Text>
          <View style={[styles.incomingAvatar, { backgroundColor: getAvatarColor(caller.name) }]}>
            {caller.avatar ? (
              <Image source={{ uri: caller.avatar }} style={styles.incomingAvatarImg} />
            ) : (
              <Text style={styles.incomingAvatarText}>{getInitials(caller.name)}</Text>
            )}
          </View>
          <Text style={styles.incomingName}>{caller.name || 'Someone'}</Text>
          <Text style={styles.incomingSub}>is inviting you to a group meeting</Text>

          <View style={styles.incomingControls}>
            <TouchableOpacity style={[styles.roundBtn, styles.rejectBtn]} onPress={rejectGroupCall}>
              <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.roundBtn, styles.acceptBtn]} onPress={acceptGroupCall}>
              <Ionicons name={isVideo ? 'videocam' : 'call'} size={28} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  // ── Active meeting grid ──
  if (groupCall && groupCallState === 'connected') {
    const remoteEntries = Object.entries(groupRemoteStreams);
    const totalParticipants = remoteEntries.length + 1;

    return (
      <Modal animationType="fade" transparent={false} visible onRequestClose={leaveGroupCall}>
        <StatusBar style="light" />
        <View style={styles.meetContainer}>
          <View style={styles.meetHeader}>
            <Ionicons name="people" size={16} color="#0df" style={{ marginRight: 6 }} />
            <Text style={styles.meetHeaderText}>MEETING • {totalParticipants} ON CALL</Text>
            <View style={styles.secureBadge}>
              <Ionicons name="lock-closed" size={11} color="rgba(0,221,255,0.6)" />
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.grid}>
            {/* Local tile */}
            <CallTile
              stream={groupLocalStream}
              name={`${user?.displayName || 'You'} (You)`}
              isVideo={isVideo && isVideoOn}
              muted={isMuted}
            />
            {/* Remote tiles */}
            {remoteEntries.map(([uid, stream]) => (
              <CallTile
                key={uid}
                stream={stream}
                name={groupParticipants[uid]?.displayName || groupParticipants[uid]?.username || 'Participant'}
                isVideo={isVideo}
              />
            ))}
          </ScrollView>

          {remoteEntries.length === 0 && (
            <Text style={styles.waitingText}>Waiting for others to join…</Text>
          )}

          {/* Controls */}
          <View style={styles.controlsRow}>
            <TouchableOpacity style={[styles.ctrlBtn, isMuted && styles.ctrlBtnActive]} onPress={toggleMute}>
              <Ionicons name={isMuted ? 'mic-off' : 'mic'} size={22} color={isMuted ? '#090d16' : '#fff'} />
            </TouchableOpacity>
            {isVideo && (
              <TouchableOpacity style={[styles.ctrlBtn, !isVideoOn && styles.ctrlBtnActive]} onPress={toggleVideo}>
                <Ionicons name={isVideoOn ? 'videocam' : 'videocam-off'} size={22} color={!isVideoOn ? '#090d16' : '#fff'} />
              </TouchableOpacity>
            )}
            {isVideo && (
              <TouchableOpacity style={styles.ctrlBtn} onPress={switchCamera}>
                <Ionicons name="camera-reverse" size={22} color="#fff" />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.ctrlBtn, styles.leaveBtn]} onPress={leaveGroupCall}>
              <Ionicons name="call" size={22} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  return null;
}

const TILE_W = (width - 36) / 2;

const styles = StyleSheet.create({
  incomingContainer: { flex: 1, backgroundColor: '#090d16', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  incomingLabel: { color: '#0df', fontSize: 12, fontWeight: '800', letterSpacing: 2, marginBottom: 40 },
  incomingAvatar: { width: 130, height: 130, borderRadius: 65, justifyContent: 'center', alignItems: 'center', overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(0,221,255,0.4)' },
  incomingAvatarImg: { width: '100%', height: '100%' },
  incomingAvatarText: { color: '#090d16', fontSize: 52, fontWeight: '900' },
  incomingName: { color: '#f8fafc', fontSize: 24, fontWeight: '800', marginTop: 20 },
  incomingSub: { color: '#94a3b8', fontSize: 13, marginTop: 6 },
  incomingControls: { flexDirection: 'row', justifyContent: 'space-around', width: width * 0.7, position: 'absolute', bottom: 80 },
  roundBtn: { width: 68, height: 68, borderRadius: 34, justifyContent: 'center', alignItems: 'center' },
  rejectBtn: { backgroundColor: '#f43f5e' },
  acceptBtn: { backgroundColor: '#10b981' },

  meetContainer: { flex: 1, backgroundColor: '#070a11', paddingTop: 50 },
  meetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  meetHeaderText: { color: '#cbd5e1', fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  secureBadge: { marginLeft: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', paddingHorizontal: 12, paddingTop: 8, gap: 12 },
  tile: { width: TILE_W, height: TILE_W * 1.25, borderRadius: 16, backgroundColor: '#0f172a', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,221,255,0.15)' },
  tileAvatarWrap: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' },
  tileAvatar: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center' },
  tileAvatarText: { color: '#090d16', fontSize: 26, fontWeight: '900' },
  tileNameTag: { position: 'absolute', bottom: 6, left: 6, right: 6, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(9,13,22,0.6)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  tileNameText: { color: '#e2e8f0', fontSize: 11, fontWeight: '600', flex: 1 },
  waitingText: { color: '#64748b', textAlign: 'center', fontSize: 13, marginTop: 20 },

  controlsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16, paddingVertical: 24, position: 'absolute', bottom: 20, left: 0, right: 0 },
  ctrlBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center', alignItems: 'center' },
  ctrlBtnActive: { backgroundColor: '#e2e8f0' },
  leaveBtn: { backgroundColor: '#f43f5e' },
});
