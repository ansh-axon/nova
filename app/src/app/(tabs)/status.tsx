import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, Image, Modal, Dimensions, StatusBar, TextInput, ActivityIndicator, DeviceEventEmitter } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import { useIsFocused } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Video, ResizeMode } from 'expo-av';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCachedMedia, cacheMedia, saveLocalMediaCopy, getSyncCachedMedia } from '../../utils/mediaCache';
import { showNeonAlert } from '../../components/NeonAlert';

const { width, height } = Dimensions.get('window');

// MODULE-LEVEL status video player, memoized so the parent's frequent progress
// re-renders do NOT thrash/re-buffer the video (that was the real stutter cause,
// even for locally-cached videos). It keeps its own buffering state and only
// reports the video duration once, so the parent can drive a smooth, reliable
// time-based progress bar (the player's progress callback sometimes stops
// emitting, which froze the old bar).
const StatusVideoPlayer = React.memo(({ 
  uri, 
  shouldPlay, 
  onDuration, 
  onBufferingChange,
  onFinished
}: {
  uri: string;
  shouldPlay: boolean;
  onDuration?: (ms: number) => void;
  onBufferingChange?: (buffering: boolean) => void;
  onFinished?: () => void;
}) => {
  const [buffering, setBuffering] = useState(true);
  const reportedRef = useRef(false);

  useEffect(() => {
    reportedRef.current = false;
    setBuffering(true);
    onBufferingChange?.(true);
  }, [uri]);

  return (
    <>
      <Video
        source={{ uri }}
        rate={1.0}
        volume={1.0}
        isMuted={false}
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay={shouldPlay}
        isLooping={false}
        style={styles.viewerVideo}
        onLoadStart={() => {
          setBuffering(true);
          onBufferingChange?.(true);
        }}
        onPlaybackStatusUpdate={(status: any) => {
          if (status.isLoaded) {
            const isBuff = !!status.isBuffering && !status.isPlaying;
            setBuffering(isBuff);
            onBufferingChange?.(isBuff);
            if (status.durationMillis && !reportedRef.current) {
              reportedRef.current = true;
              onDuration?.(status.durationMillis);
            }
            if (status.didJustFinish) {
              onFinished?.();
            }
          }
        }}
      />
      {buffering && (
        <View style={styles.videoLoadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#0df" />
          <Text style={styles.videoLoadingText}>Loading…</Text>
        </View>
      )}
    </>
  );
});

export default function StatusScreen() {
  const { user, statuses, fetchStatuses, uploadStatus, uploadFile, serverUrl, markStatusViewed, deleteStatus } = useApp();
  const isFocused = useIsFocused();

  const [selectedGroup, setSelectedGroup] = useState<any | null>(null);
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [groupedStatuses, setGroupedStatuses] = useState<any[]>([]);
  const [showViewers, setShowViewers] = useState(false);
  const videoBufferingRef = useRef<boolean>(false);
  const videoDurationRef = useRef<number>(0);

  // Active story source resolution (memoized per story so it never changes mid-playback)
  const currentStoryItem = selectedGroup?.stories?.[currentStoryIndex];
  const currentStoryId = currentStoryItem?._id;
  const currentStoryMediaUrl = currentStoryItem?.mediaUrl;

  const resolvedVideoUri = useMemo(() => {
    if (!currentStoryMediaUrl) return '';
    const remote = currentStoryMediaUrl.startsWith('http') ? currentStoryMediaUrl : `${serverUrl}${currentStoryMediaUrl}`;
    const local = getSyncCachedMedia(remote);
    if (!local) {
      // Pre-fetch into disk cache so subsequent views play from local flash storage instantly
      cacheMedia(remote).catch(() => {});
    }
    return local || remote;
  }, [currentStoryId, currentStoryMediaUrl, serverUrl]);

  // Text status creator states
  const [showTextModal, setShowTextModal] = useState(false);
  const [textStatusInput, setTextStatusInput] = useState('');
  const [selectedBgIndex, setSelectedBgIndex] = useState(0);
  const [uploading, setUploading] = useState(false);

  const neonBgs = [
    { name: 'Teal', bg: '#083344', text: '#0df' },
    { name: 'Magenta', bg: '#4c0519', text: '#f43f5e' },
    { name: 'Green', bg: '#022c22', text: '#10b981' },
    { name: 'Blue', bg: '#1e1b4b', text: '#3b82f6' },
    { name: 'Orange', bg: '#431407', text: '#f97316' },
  ];

  // Absolute status timestamp: "Today, 11:30 PM" / "Yesterday, 11:30 PM" / "17 Jun, 11:30 PM".
  const formatStatusTime = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const dayDiff = Math.round((startToday - startDate) / 86400000);
    let h = date.getHours();
    const m = date.getMinutes().toString().padStart(2, '0');
    const time = `${h % 12 || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`;
    if (dayDiff <= 0) return `Today, ${time}`;
    if (dayDiff === 1) return `Yesterday, ${time}`;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${date.getDate()} ${months[date.getMonth()]}, ${time}`;
  };

  // Helper to calculate time ago
  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  // Fetch statuses on tab focus
  useEffect(() => {
    if (isFocused) {
      fetchStatuses();
    }
  }, [isFocused]);

  // Background pre-cache: silently download all video statuses into local cache
  // so when any user taps to view them, they play INSTANTLY from device disk without buffering or lag!
  useEffect(() => {
    if (!statuses || statuses.length === 0) return;
    statuses.forEach((st: any) => {
      if (st.statusType === 'video' && st.mediaUrl) {
        const remote = st.mediaUrl.startsWith('http') ? st.mediaUrl : `${serverUrl}${st.mediaUrl}`;
        cacheMedia(remote).catch(() => {});
      }
    });
  }, [statuses, serverUrl]);

  // Group active statuses by user
  useEffect(() => {
    const groups: { [userId: string]: any } = {};

    // 1. Always inject a premium, dynamic Nova AI 🤖 Greeting status at the top
    groups['nova_ai'] = {
      id: 'nova_ai',
      userId: 'nova_ai',
      userName: 'Nova AI 🤖',
      timeAgo: 'Just now',
      avatarUrl: '',
      stories: [
        {
          _id: 'nova_ai_1',
          statusType: 'image',
          mediaUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800',
          textContent: '🚀 Welcome to Project NOVA! Tap left or right to traverse neural nodes. Your private space is ready.',
          backgroundColor: '#0c4a6e',
          createdAt: new Date().toISOString(),
          viewers: []
        }
      ]
    };

    // Filter statuses to exclude our own in the "Recent Updates" list
    const otherStatuses = statuses.filter((s: any) => {
      const sUser = s.user;
      if (!sUser) return false;
      const sUserId = typeof sUser === 'object' ? (sUser._id || sUser.id) : sUser;
      return String(sUserId) !== String(user?.id);
    });

    otherStatuses.forEach((status: any) => {
      const sUser = status.user;
      if (!sUser) return;
      const uId = typeof sUser === 'object' ? (sUser._id || sUser.id) : sUser;

      if (!groups[uId]) {
        groups[uId] = {
          id: uId,
          userId: uId,
          userName: typeof sUser === 'object' ? (sUser.displayName || sUser.username || 'User') : 'User',
          avatarUrl: typeof sUser === 'object' ? (sUser.avatarUrl || '') : '',
          timeAgo: formatTimeAgo(status.createdAt),
          stories: []
        };
      }
      groups[uId].stories.push(status);
    });

    // Sort stories inside each group by oldest first so they play chronologically
    Object.keys(groups).forEach((key) => {
      if (key !== 'nova_ai') {
        groups[key].stories.sort(
          (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      }
    });

    // Convert groups dictionary to array and sort latest status group at top
    const array = Object.values(groups).sort((a: any, b: any) => {
      if (a.id === 'nova_ai') return -1;
      if (b.id === 'nova_ai') return 1;
      
      const aLatest = new Date(a.stories[a.stories.length - 1]?.createdAt).getTime();
      const bLatest = new Date(b.stories[b.stories.length - 1]?.createdAt).getTime();
      return bLatest - aLatest;
    });

    setGroupedStatuses(array);
  }, [statuses, user]);

  // Story auto-progress:
  // Smooth, rock-solid time-based progress bar for BOTH images/text (5s) and videos (up to 30s).
  // Driven by a dedicated JavaScript interval that NEVER freezes or gets stuck.
  useEffect(() => {
    if (!selectedGroup) return;
    const cur = selectedGroup.stories?.[currentStoryIndex];
    if (!cur) return;
    const isVideoStory = cur.statusType === 'video';

    setProgress(0);
    videoBufferingRef.current = isVideoStory;
    videoDurationRef.current = (typeof cur.videoDuration === 'number' && cur.videoDuration > 0)
      ? Math.min(30000, cur.videoDuration)
      : 0;

    let elapsed = 0;
    let initialBufferingWait = 0;
    const interval = setInterval(() => {
      // While video is initial buffering at start (elapsed === 0), wait at most 1.2s before ticking
      if (isVideoStory && videoBufferingRef.current && elapsed === 0) {
        initialBufferingWait += 50;
        if (initialBufferingWait < 1200) {
          return;
        }
      }

      elapsed += 50;
      const dur = videoDurationRef.current > 0 ? Math.min(30000, videoDurationRef.current) : 30000;
      const targetDuration = isVideoStory ? dur : 5000;
      const p = Math.min(1, elapsed / targetDuration);
      setProgress(p);

      if (p >= 1) {
        clearInterval(interval);
        handleNextStory();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [selectedGroup?.userId, currentStoryIndex]);

  // Keep selectedGroup in sync with live status updates (such as real-time viewers)
  useEffect(() => {
    if (!selectedGroup) return;
    setSelectedGroup((prev: any) => {
      if (!prev) return null;
      let hasChange = false;
      const updatedStories = prev.stories.map((story: any) => {
        const live = statuses.find((s: any) => s._id === story._id);
        if (live && live.viewers?.length !== story.viewers?.length) {
          hasChange = true;
          return { ...story, viewers: live.viewers };
        }
        return story;
      });
      return hasChange ? { ...prev, stories: updatedStories } : prev;
    });
  }, [statuses]);

  // Mark viewed when a new story loads
  useEffect(() => {
    if (selectedGroup) {
      const currentStory = selectedGroup.stories[currentStoryIndex];
      if (currentStory && currentStory._id !== 'nova_ai_1' && selectedGroup.userId !== user?.id) {
        markStatusViewed(currentStory._id);
      }
    }
  }, [selectedGroup, currentStoryIndex]);

  const handleNextStory = () => {
    if (!selectedGroup) return;
    setShowViewers(false);
    if (currentStoryIndex < selectedGroup.stories.length - 1) {
      setCurrentStoryIndex((prev) => prev + 1);
      setProgress(0);
    } else {
      setSelectedGroup(null); // Auto close
    }
  };

  const handlePrevStory = () => {
    if (!selectedGroup) return;
    setShowViewers(false);
    if (currentStoryIndex > 0) {
      setCurrentStoryIndex((prev) => prev - 1);
      setProgress(0);
    } else {
      setSelectedGroup(null); // Auto close if tapped left on first
    }
  };

  // Stable callbacks for the memoized StatusVideoPlayer so it never re-renders
  // (and never re-buffers) just because the parent re-rendered for progress.
  const handleNextStoryRef = useRef(handleNextStory);
  handleNextStoryRef.current = handleNextStory;
  const onVideoDuration = useCallback((ms: number) => {
    if (ms > 0) {
      videoDurationRef.current = ms;
    }
  }, []);
  const onBufferingChange = useCallback((buffering: boolean) => {
    videoBufferingRef.current = buffering;
  }, []);
  const onVideoFinished = useCallback(() => {
    handleNextStoryRef.current();
  }, []);

  // Delete the currently-viewed status (own status only).
  const handleDeleteCurrentStatus = () => {
    if (!selectedGroup) return;
    const story = selectedGroup.stories[currentStoryIndex];
    if (!story) return;
    showNeonAlert({
      title: 'DELETE STATUS',
      message: 'Remove this status update? This cannot be undone.',
      icon: 'trash-outline',
      borderColor: '#f43f5e',
      iconColor: '#f43f5e',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            const ok = await deleteStatus(story._id);
            if (ok) {
              const remaining = selectedGroup.stories.filter((s: any) => s._id !== story._id);
              if (remaining.length === 0) {
                setSelectedGroup(null);
              } else {
                setSelectedGroup({ ...selectedGroup, stories: remaining });
                setCurrentStoryIndex(Math.min(currentStoryIndex, remaining.length - 1));
                setProgress(0);
              }
            }
          }
        },
      ],
    });
  };

  const handleLaunchCamera = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        showNeonAlert({
          title: 'CAMERA PERMISSION REQUIRED',
          message: 'Camera permission is required to capture photos and videos for status!',
          icon: 'camera-outline',
          iconColor: '#f43f5e',
          borderColor: '#f43f5e',
        });
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsEditing: true,
        quality: 0.8,
        videoMaxDuration: 30
      });

      if (!result.canceled && result.assets[0]) {
        setUploading(true);
        try {
          const asset = result.assets[0];
          const uri = asset.uri;
          const isVid = asset.type === 'video' || uri.toLowerCase().endsWith('.mp4');
          const mimeType = asset.mimeType || (isVid ? 'video/mp4' : 'image/jpeg');
          const uploadResult = await uploadFile(uri, mimeType);
          if (uploadResult && uploadResult.url) {
            const rawDur = asset.duration || 0;
            const dur = rawDur > 0 ? (rawDur < 1000 ? Math.round(rawDur * 1000) : Math.round(rawDur)) : 30000;
            const remoteUrl = uploadResult.url.startsWith('http') ? uploadResult.url : `${serverUrl}${uploadResult.url}`;
            if (isVid) await saveLocalMediaCopy(remoteUrl, uri);
            await uploadStatus({
              statusType: isVid ? 'video' : 'image',
              mediaUrl: uploadResult.url,
              startTime: 0,
              videoDuration: Math.min(30000, dur),
              textContent: ''
            });
          }
        } catch (err: any) {
          console.error(err);
          showNeonAlert({
            title: 'TRANSMISSION ERROR',
            message: err.message || 'Failed to upload status from camera.',
            icon: 'warning-outline',
            iconColor: '#f43f5e',
            borderColor: '#f43f5e',
          });
        } finally {
          setUploading(false);
        }
      }
    } catch (e: any) {
      console.warn('launchCamera error:', e);
    }
  };

  // Listen for header camera button click from tabs layout
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('OPEN_STATUS_CAMERA', () => {
      handleLaunchCamera();
    });
    return () => {
      sub.remove();
    };
  }, []);

  const handleCreateStatus = () => {
    showNeonAlert({
      title: 'NEW STATUS',
      message: 'Choose how you want to share your status update:',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        { text: '📸 Open Camera (Photo/Video)', onPress: handleLaunchCamera },
        { text: '🖼️ Choose Photo from Gallery', onPress: handleUploadPhoto },
        { text: '🎬 Choose Video from Gallery', onPress: handleUploadVideo },
        { text: '✍️ Write Text Status', onPress: () => setShowTextModal(true) },
      ],
      icon: 'camera-outline',
      iconColor: '#0df',
      borderColor: '#0df',
    });
  };

  const handleUploadPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showNeonAlert({
        title: 'PERMISSION DENIED',
        message: 'Gallery access permission is required to select photos!',
        icon: 'alert-circle-outline',
        iconColor: '#f43f5e',
        borderColor: '#f43f5e',
      });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7
    });

    if (!result.canceled && result.assets[0]) {
      setUploading(true);
      try {
        const uri = result.assets[0].uri;
        const mimeType = result.assets[0].mimeType || 'image/jpeg';
        const uploadResult = await uploadFile(uri, mimeType);
        if (uploadResult && uploadResult.url) {
          await uploadStatus({
            statusType: 'image',
            mediaUrl: uploadResult.url,
            textContent: ''
          });
        }
      } catch (err: any) {
        console.error(err);
        showNeonAlert({
          title: 'TRANSMISSION ERROR',
          message: err.message || 'Failed to upload photo status.',
          icon: 'warning-outline',
          iconColor: '#f43f5e',
          borderColor: '#f43f5e',
        });
      } finally {
        setUploading(false);
      }
    }
  };

  const handleUploadVideo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showNeonAlert({
        title: 'PERMISSION DENIED',
        message: 'Gallery access permission is required to select videos!',
        icon: 'alert-circle-outline',
        iconColor: '#f43f5e',
        borderColor: '#f43f5e',
      });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: false,
      quality: 0.8,
      videoMaxDuration: 30
    });

    if (!result.canceled && result.assets[0]) {
      setUploading(true);
      try {
        const asset = result.assets[0];
        const uri = asset.uri;
        const mimeType = asset.mimeType || 'video/mp4';
        const uploadResult = await uploadFile(uri, mimeType);
        if (uploadResult && uploadResult.url) {
          const rawDur = asset.duration || 0;
          const dur = rawDur > 0 ? (rawDur < 1000 ? Math.round(rawDur * 1000) : Math.round(rawDur)) : 30000;
          const remoteUrl = uploadResult.url.startsWith('http') ? uploadResult.url : `${serverUrl}${uploadResult.url}`;
          // Pre-cache local copy so the owner's status never has to stream over network!
          await saveLocalMediaCopy(remoteUrl, uri);
          await uploadStatus({
            statusType: 'video',
            mediaUrl: uploadResult.url,
            videoDuration: Math.min(30000, dur),
            textContent: ''
          });
        }
      } catch (err: any) {
        console.error(err);
        showNeonAlert({
          title: 'TRANSMISSION ERROR',
          message: err.message || 'Failed to upload video status.',
          icon: 'warning-outline',
          iconColor: '#f43f5e',
          borderColor: '#f43f5e',
        });
      } finally {
        setUploading(false);
      }
    }
  };

  const handleUploadText = async () => {
    if (!textStatusInput.trim()) {
      showNeonAlert({
        title: 'INPUT REQUIRED',
        message: 'Please write something first!',
        icon: 'information-circle-outline',
        iconColor: '#0df',
        borderColor: '#0df',
      });
      return;
    }

    setUploading(true);
    const success = await uploadStatus({
      statusType: 'text',
      textContent: textStatusInput.trim(),
      backgroundColor: neonBgs[selectedBgIndex].bg,
      textColor: neonBgs[selectedBgIndex].text,
    });
    setUploading(false);

    if (success) {
      setTextStatusInput('');
      setShowTextModal(false);
    }
  };

  const getInitials = (name: string) => {
    return name ? name.charAt(0).toUpperCase() : '?';
  };

  // Extract logged-in user's own stories
  const ownStories = statuses.filter((s: any) => {
    const sUser = s.user;
    if (!sUser) return false;
    const sUserId = typeof sUser === 'object' ? (sUser._id || sUser.id) : sUser;
    return String(sUserId) === String(user?.id);
  });

  const handleMyStatusPress = () => {
    if (ownStories.length > 0) {
      // Sort oldest first for playing
      const sortedOwnStories = [...ownStories].sort(
        (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      setSelectedGroup({
        id: user?.id,
        userId: user?.id,
        userName: 'My Status',
        avatarUrl: user?.avatarUrl || '',
        timeAgo: 'Just now',
        stories: sortedOwnStories
      });
      setCurrentStoryIndex(0);
      setProgress(0);
    } else {
      handleCreateStatus();
    }
  };

  const renderStoryItem = ({ item }: { item: any }) => {
    const latestStory = item.stories[item.stories.length - 1];
    return (
      <TouchableOpacity
        style={styles.storyCard}
        onPress={() => {
          setSelectedGroup(item);
          setCurrentStoryIndex(0);
          setProgress(0);
        }}
      >
        {/* Story Circle Outline */}
        <View style={styles.storyCircle}>
          <View style={[styles.storyBorderRing, { borderColor: '#0df' }]}>
            {item.avatarUrl ? (
              <Image source={{ uri: item.avatarUrl }} style={styles.storyAvatar} />
            ) : (
              <View style={[styles.storyAvatarFallback, { backgroundColor: '#1e293b' }]}>
                <Text style={styles.storyAvatarFallbackText}>{getInitials(item.userName)}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Story details */}
        <View style={styles.storyInfo}>
          <Text style={styles.storyUserName}>{item.userName}</Text>
          <Text style={styles.storyTime}>
            {item.stories.length} update{item.stories.length > 1 ? 's' : ''} • {item.timeAgo}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const currentStory = selectedGroup?.stories[currentStoryIndex];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#090d16" />

      {uploading && (
        <View style={styles.uploadingOverlay}>
          <ActivityIndicator size="large" color="#0df" />
          <Text style={styles.uploadingText}>Syncing status with network...</Text>
        </View>
      )}

      {/* My Status header card */}
      <View style={styles.myStatusCard}>
        <TouchableOpacity style={styles.avatarWrapper} onPress={handleMyStatusPress}>
          {user?.avatarUrl ? (
            <Image
              source={
                user.avatarUrl.startsWith('http') || user.avatarUrl.startsWith('data:')
                  ? { uri: user.avatarUrl }
                  : { uri: `${serverUrl}${user.avatarUrl}` }
              }
              style={styles.myAvatar}
            />
          ) : (
            <View style={[styles.myAvatarFallback, { backgroundColor: '#0df' }]}>
              <Text style={styles.myAvatarFallbackText}>{getInitials(user?.displayName || 'U')}</Text>
            </View>
          )}
          <TouchableOpacity style={styles.plusIconBg} onPress={handleCreateStatus}>
            <Ionicons name="add" size={16} color="#090d16" />
          </TouchableOpacity>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.myStatusInfo} onPress={handleMyStatusPress}>
          <Text style={styles.myStatusTitle}>My Status</Text>
          <Text style={styles.myStatusSubtitle}>
            {ownStories.length > 0 ? `You have ${ownStories.length} active updates` : 'Tap to add status update'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.addBtnCircle} onPress={handleLaunchCamera}>
          <Ionicons name="camera-outline" size={20} color="#0df" />
        </TouchableOpacity>
      </View>

      {/* Title */}
      <Text style={styles.sectionHeader}>Recent Updates</Text>

      {/* Stories list */}
      <FlatList
        data={groupedStatuses}
        keyExtractor={(item) => item.id}
        renderItem={renderStoryItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={() => (
          <View style={styles.emptyContainer}>
            <Ionicons name="aperture-outline" size={48} color="#1e293b" />
            <Text style={styles.emptyText}>No recent status logs</Text>
          </View>
        )}
      />

      {/* Immersive Text Status Creator Modal */}
      <Modal
        animationType="slide"
        transparent={false}
        visible={showTextModal}
        onRequestClose={() => setShowTextModal(false)}
      >
        <View style={[styles.textCreatorContainer, { backgroundColor: neonBgs[selectedBgIndex].bg }]}>
          <StatusBar hidden />
          <View style={styles.textCreatorHeader}>
            <TouchableOpacity style={styles.textCreatorClose} onPress={() => setShowTextModal(false)}>
              <Ionicons name="close-outline" size={32} color="#fff" />
            </TouchableOpacity>
            
            {/* Submit check button */}
            <TouchableOpacity style={styles.textCreatorSubmit} onPress={handleUploadText}>
              <Ionicons name="checkmark-sharp" size={28} color="#0df" />
            </TouchableOpacity>
          </View>

          {/* Input text centered */}
          <View style={styles.textInputWrapper}>
            <TextInput
              style={[styles.textStatusInput, { color: '#ffffff' }]}
              placeholder="Type your cyberpunk status..."
              placeholderTextColor="rgba(255, 255, 255, 0.4)"
              multiline
              maxLength={200}
              value={textStatusInput}
              onChangeText={setTextStatusInput}
              autoFocus
            />
          </View>

          {/* Neon background toggle selectors */}
          <View style={styles.bgSelectorsWrapper}>
            <Text style={styles.bgSelectLabel}>CHOOSE MATRIX COLOR:</Text>
            <View style={styles.bgRow}>
              {neonBgs.map((item, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.bgCircle,
                    { backgroundColor: item.bg },
                    selectedBgIndex === idx && styles.bgCircleSelected
                  ]}
                  onPress={() => setSelectedBgIndex(idx)}
                />
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* Full-Screen Story Immersive Viewer Modal */}
      {selectedGroup && currentStory && (
        <Modal
          animationType="fade"
          transparent={false}
          visible={true}
          onRequestClose={() => setSelectedGroup(null)}
        >
          <StatusBar hidden />
          <View style={[styles.viewerContainer, { backgroundColor: currentStory.backgroundColor || '#090d16' }]}>
            
            {/* Story Header Progress Bars */}
            <View style={styles.progressHeaderContainer}>
              <View style={styles.progressBarWrapper}>
                {selectedGroup.stories.map((s: any, idx: number) => {
                  let fillWidth: any = '0%';
                  if (idx < currentStoryIndex) fillWidth = '100%';
                  else if (idx === currentStoryIndex) fillWidth = `${progress * 100}%`;
                  
                  return (
                    <View key={idx} style={styles.progressBarBg}>
                      <View style={[styles.progressBarFill, { width: fillWidth }]} />
                    </View>
                  );
                })}
              </View>
            </View>

            {/* Story Profile Top Info */}
            <View style={styles.viewerProfileHeader}>
              <View style={styles.viewerAvatarBg}>
                {selectedGroup.avatarUrl ? (
                  <Image source={{ uri: selectedGroup.avatarUrl }} style={styles.viewerAvatarImg} />
                ) : (
                  <Text style={styles.viewerAvatarText}>{getInitials(selectedGroup.userName)}</Text>
                )}
              </View>
              <View style={styles.viewerProfileInfo}>
                <Text style={styles.viewerProfileName}>{selectedGroup.userName}</Text>
                <Text style={styles.viewerProfileTime}>
                  {formatStatusTime(currentStory.createdAt)}
                </Text>
              </View>
              {selectedGroup.userId === user?.id && (
                <TouchableOpacity style={styles.viewerDelete} onPress={handleDeleteCurrentStatus}>
                  <Ionicons name="trash-outline" size={22} color="#f43f5e" />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.viewerClose} onPress={() => setSelectedGroup(null)}>
                <Ionicons name="close-outline" size={28} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Content Body */}
            <View style={styles.viewerBody}>
              {currentStory.statusType === 'image' && currentStory.mediaUrl ? (() => {
                const mediaSourceUri = currentStory.mediaUrl.startsWith('http') 
                  ? currentStory.mediaUrl 
                  : `${serverUrl}${currentStory.mediaUrl}`;
                return (
                  <View style={styles.imageViewerWrapper}>
                    <Image source={{ uri: mediaSourceUri }} style={styles.viewerImage} resizeMode="contain" />
                    {currentStory.textContent && (
                      <View style={styles.imageTextCaptionBg}>
                        <Text style={styles.imageTextCaption}>{currentStory.textContent}</Text>
                      </View>
                    )}
                  </View>
                );
              })() : currentStory.statusType === 'video' && currentStory.mediaUrl ? (() => {
                return (
                  <View style={styles.imageViewerWrapper}>
                    <StatusVideoPlayer
                      key={currentStory._id || `vid_${currentStoryIndex}`}
                      uri={resolvedVideoUri}
                      shouldPlay={selectedGroup !== null}
                      onDuration={onVideoDuration}
                      onBufferingChange={onBufferingChange}
                      onFinished={handleNextStory}
                    />
                    {currentStory.textContent && (
                      <View style={styles.imageTextCaptionBg}>
                        <Text style={styles.imageTextCaption}>{currentStory.textContent}</Text>
                      </View>
                    )}
                  </View>
                );
              })() : (
                <View style={styles.viewerTextWrapper}>
                  <Text style={[styles.viewerText, { color: currentStory.textColor || '#fff' }]}>
                    {currentStory.textContent}
                  </Text>
                </View>
              )}
            </View>

            {/* Tap Triggers left and right for navigation */}
            <View style={styles.tapControls}>
              <TouchableOpacity style={styles.tapLeft} onPress={handlePrevStory} />
              <TouchableOpacity style={styles.tapRight} onPress={handleNextStory} />
            </View>

            {/* Own Story views count drawer */}
            {selectedGroup.userId === user?.id && (
              <TouchableOpacity style={styles.viewerBottomBar} onPress={() => setShowViewers(true)} activeOpacity={0.8}>
                <Ionicons name="eye-outline" size={20} color="#0df" style={{ marginRight: 8 }} />
                <Text style={styles.viewersText}>
                  {currentStory.viewers?.length || 0} viewed{(currentStory.viewers?.length || 0) > 0 ? ' • tap to see who' : ''}
                </Text>
                {(currentStory.viewers?.length || 0) > 0 && (
                  <Ionicons name="chevron-up" size={18} color="#0df" style={{ marginLeft: 'auto' }} />
                )}
              </TouchableOpacity>
            )}

            {/* Seen-by list (who viewed this status) */}
            {showViewers && selectedGroup.userId === user?.id && (
              <View style={styles.seenSheet}>
                <View style={styles.seenSheetHeader}>
                  <Text style={styles.seenSheetTitle}>Viewed by {currentStory.viewers?.length || 0}</Text>
                  <TouchableOpacity onPress={() => setShowViewers(false)}>
                    <Ionicons name="close" size={24} color="#cbd5e1" />
                  </TouchableOpacity>
                </View>
                <FlatList
                  data={currentStory.viewers || []}
                  keyExtractor={(v: any, i: number) => (v.user?._id || v.user?.id || String(i))}
                  ListEmptyComponent={<Text style={styles.seenEmpty}>No views yet.</Text>}
                  renderItem={({ item }: { item: any }) => {
                    const vu = item.user || {};
                    const vname = vu.displayName || vu.username || 'User';
                    return (
                      <View style={styles.seenRow}>
                        {vu.avatarUrl ? (
                          <Image source={{ uri: vu.avatarUrl }} style={styles.seenAvatar} />
                        ) : (
                          <View style={[styles.seenAvatar, styles.seenAvatarFb]}>
                            <Text style={styles.seenAvatarTxt}>{getInitials(vname)}</Text>
                          </View>
                        )}
                        <Text style={styles.seenName}>{vname}</Text>
                        {item.viewedAt && <Text style={styles.seenTime}>{formatTimeAgo(item.viewedAt)}</Text>}
                      </View>
                    );
                  }}
                />
              </View>
            )}
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
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(9, 13, 22, 0.85)',
    zIndex: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadingText: {
    color: '#0df',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 16,
    letterSpacing: 0.5,
  },
  myStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.03)',
  },
  avatarWrapper: {
    position: 'relative',
    marginRight: 16,
  },
  myAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  myAvatarFallback: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  myAvatarFallbackText: {
    color: '#090d16',
    fontSize: 22,
    fontWeight: '700',
  },
  plusIconBg: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#0df',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#090d16',
  },
  myStatusInfo: {
    flex: 1,
  },
  myStatusTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
  },
  myStatusSubtitle: {
    color: '#64748b',
    fontSize: 13,
    marginTop: 2,
  },
  addBtnCircle: {
    padding: 10,
    backgroundColor: 'rgba(0, 221, 255, 0.05)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 221, 255, 0.1)',
  },
  sectionHeader: {
    color: '#0df',
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  storyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.02)',
  },
  storyCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  storyBorderRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  storyAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  storyAvatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  storyAvatarFallbackText: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
  },
  storyInfo: {
    flex: 1,
  },
  storyUserName: {
    color: '#f1f5f9',
    fontSize: 15,
    fontWeight: '700',
  },
  storyTime: {
    color: '#64748b',
    fontSize: 13,
    marginTop: 2,
  },
  emptyContainer: {
    paddingVertical: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#475569',
    fontSize: 14,
    marginTop: 8,
  },
  textCreatorContainer: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  textCreatorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  textCreatorClose: {
    padding: 4,
  },
  textCreatorSubmit: {
    padding: 8,
    backgroundColor: 'rgba(0, 221, 255, 0.1)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#0df',
  },
  textInputWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textStatusInput: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    width: width * 0.8,
    lineHeight: 38,
  },
  bgSelectorsWrapper: {
    alignItems: 'center',
  },
  bgSelectLabel: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  bgRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  bgCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginHorizontal: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  bgCircleSelected: {
    borderColor: '#fff',
    transform: [{ scale: 1.15 }],
  },
  viewerContainer: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: 10,
    paddingBottom: 20,
  },
  progressHeaderContainer: {
    paddingHorizontal: 8,
    marginTop: 10,
  },
  progressBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressBarBg: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    marginHorizontal: 2,
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#0df',
  },
  viewerProfileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 12,
  },
  viewerAvatarBg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  viewerAvatarImg: {
    width: '100%',
    height: '100%',
  },
  viewerAvatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  viewerProfileInfo: {
    flex: 1,
  },
  viewerProfileName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  viewerProfileTime: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
  },
  viewerClose: {
    padding: 4,
  },
  viewerDelete: {
    padding: 6,
    marginRight: 4,
  },
  viewerBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  imageViewerWrapper: {
    width: width,
    height: height * 0.78,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerImage: {
    width: width,
    height: height * 0.7,
  },
  viewerVideo: {
    width: width,
    height: height * 0.78,
  },
  videoLoadingOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoLoadingText: {
    color: '#67e8f9',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 10,
    letterSpacing: 1,
  },
  imageTextCaptionBg: {
    position: 'absolute',
    bottom: 10,
    backgroundColor: 'rgba(9, 13, 22, 0.85)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  imageTextCaption: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  viewerTextWrapper: {
    padding: 24,
    maxWidth: width * 0.9,
  },
  viewerText: {
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 36,
  },
  tapControls: {
    position: 'absolute',
    top: 100,
    bottom: 60,
    left: 0,
    right: 0,
    flexDirection: 'row',
    zIndex: 10,
  },
  tapLeft: {
    flex: 1,
  },
  tapRight: {
    flex: 1,
  },
  viewerBottomBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.04)',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    zIndex: 20,
  },
  viewersText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  seenSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: height * 0.5,
    backgroundColor: '#0b1220',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderColor: 'rgba(0,221,255,0.2)',
    zIndex: 30,
  },
  seenSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  seenSheetTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '800',
  },
  seenEmpty: {
    color: '#64748b',
    textAlign: 'center',
    paddingVertical: 20,
  },
  seenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  seenAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginRight: 12,
  },
  seenAvatarFb: {
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  seenAvatarTxt: {
    color: '#0df',
    fontWeight: '800',
    fontSize: 15,
  },
  seenName: {
    flex: 1,
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '600',
  },
  seenTime: {
    color: '#64748b',
    fontSize: 11,
  },
});
