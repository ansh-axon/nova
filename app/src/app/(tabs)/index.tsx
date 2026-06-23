import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, Image, Modal, TextInput, ActivityIndicator, Dimensions, ScrollView } from 'react-native';
import { showNeonAlert } from '../../components/NeonAlert';
import { useApp, Conversation, User } from '../../context/AppContext';
import { useRouter, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';

import DocumentLocker from '../../components/DocumentLocker';
import UnlockScreen from '../../components/UnlockScreen';
import SetSecurityPinModal from '../../components/SetSecurityPinModal';
import { hasSecurityPin } from '../../utils/applock';

const { width } = Dimensions.get('window');

interface VaultItem {
  name: string;
  details: string;
  type: 'DOCUMENT' | 'IMAGE';
  securityStatus: string;
}

export default function BentoDashboardScreen() {
  const { conversations, users, fetchConversations, fetchUsers, startConversation, createGroup, sendMessage, user, loading, logout, lockedChatIds, lockChat, unlockChat, callHistory, fetchCallHistory } = useApp();
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [startingChat, setStartingChat] = useState(false);
  const [showLockedChats, setShowLockedChats] = useState(false);
  const [lockedUnlocked, setLockedUnlocked] = useState(false);
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [pendingLockId, setPendingLockId] = useState<string | null>(null);
  // New Group + Broadcast
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [broadcastText, setBroadcastText] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busyAction, setBusyAction] = useState(false);
  const router = useRouter();
  const navigation = useNavigation();
  const isFocused = useIsFocused();

  // Dynamically set up working search and 3-dot buttons in the navigation header
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 12 }}>
          <TouchableOpacity 
            style={{ padding: 8, marginLeft: 8, borderRadius: 20, backgroundColor: 'rgba(255, 255, 255, 0.02)' }} 
            onPress={() => setModalVisible(true)}
          >
            <Ionicons name="search-outline" size={22} color="#cbd5e1" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={{ padding: 8, marginLeft: 8, borderRadius: 20, backgroundColor: 'rgba(255, 255, 255, 0.02)' }} 
            onPress={handleThreeDotPress}
          >
            <Ionicons name="ellipsis-vertical" size={22} color="#cbd5e1" />
          </TouchableOpacity>
        </View>
      )
    });
  }, [navigation, users, conversations]);

  const handleThreeDotPress = () => {
    showNeonAlert({
      title: 'NOVA SETTINGS',
      message: 'Choose a secure command to execute:',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        { text: '🤖 Ask NOVA AI', onPress: handleStartMetaAI },
        { text: '👥 New Group', onPress: () => { setSelectedIds([]); setGroupName(''); setShowNewGroup(true); } },
        { text: '📢 Broadcast', onPress: () => { setSelectedIds([]); setBroadcastText(''); setShowBroadcast(true); } },
        { text: '🚪 Logout', style: 'destructive', onPress: async () => {
            await logout();
            router.replace('/(auth)/login');
          }
        }
      ],
      icon: 'settings-outline',
      iconColor: '#0df',
      borderColor: '#0df',
    });
  };

  // Secure Vault PIN Locker states matching Kotlin ChatViewModel
  const [showVaultModal, setShowVaultModal] = useState(false);
  const [isVaultUnlocked, setIsVaultUnlocked] = useState(false);
  const [vaultPin, setVaultPin] = useState('1234'); // Default PIN matching Kotlin
  const [pinInput, setPinInput] = useState('');
  const [isChangingPinMode, setIsChangingPinMode] = useState(false);
  const [newPinInput, setNewPinInput] = useState('');
  const [vaultErrorMessage, setVaultErrorMessage] = useState<string | null>(null);
  
  // Encrypt new file form states
  const [showAddForm, setShowAddForm] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFileType, setNewFileType] = useState<'DOCUMENT' | 'IMAGE'>('DOCUMENT');
  const [newFileSize, setNewFileSize] = useState('150 KB');

  // Vault items matching Kotlin ViewModel
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([
    { name: "Project Specs.pdf", details: "4.2 MB • Zoya Sen", type: "DOCUMENT", securityStatus: "AES-256 Verified" },
    { name: "Cryptographic_Private_Keys.pem", details: "12 KB • Kabir Singh", type: "DOCUMENT", securityStatus: "ECC Secp256k1 Verified" },
    { name: "Finances_Q2_Loop.xlsx", details: "840 KB • Sameer Rao", type: "DOCUMENT", securityStatus: "AES-256 Verified" },
    { name: "Symmetric_Circle_Backup.txt", details: "45 KB • Admin", type: "DOCUMENT", securityStatus: "Chacha20 Verified" }
  ]);

  // Reload data when screen gains focus
  useEffect(() => {
    if (isFocused) {
      fetchConversations();
      fetchUsers();
      fetchCallHistory();
    }
  }, [isFocused]);

  const handleStartChat = async (recipientId: string) => {
    setStartingChat(true);
    const conversationId = await startConversation(recipientId);
    setStartingChat(false);
    setModalVisible(false);
    if (conversationId) {
      router.push(`/chat/${conversationId}`);
    }
  };

  // Conversations split into normal vs locked (hidden) lists.
  const visibleConversations = conversations.filter((c) => !lockedChatIds.includes(c._id));
  const lockedConversations = conversations.filter((c) => lockedChatIds.includes(c._id));

  const handleChatLongPress = (item: Conversation) => {
    const isLocked = lockedChatIds.includes(item._id);
    const other = item.participants.find((p) => p.id !== user?.id) || item.participants[0];
    const name = other?.displayName || 'this chat';
    showNeonAlert({
      title: isLocked ? 'UNLOCK CHAT' : 'LOCK CHAT',
      message: isLocked
        ? `Move "${name}" back to your normal chat list?`
        : `Hide "${name}" behind your fingerprint / PIN? It will only appear inside Locked Chats.`,
      icon: isLocked ? 'lock-open-outline' : 'lock-closed-outline',
      iconColor: '#0df',
      borderColor: '#0df',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isLocked ? 'Unlock' : 'Lock',
          onPress: async () => {
            if (isLocked) { unlockChat(item._id); return; }
            const has = await hasSecurityPin();
            if (has) {
              lockChat(item._id);
            } else {
              // Need a security PIN before any chat can be locked.
              setPendingLockId(item._id);
              setShowPinSetup(true);
            }
          },
        },
      ],
    });
  };

  const onPinSetupDone = (success: boolean) => {
    setShowPinSetup(false);
    if (success && pendingLockId) {
      lockChat(pendingLockId);
    }
    setPendingLockId(null);
  };

  const openLockedChats = () => {
    // If there are no locked chats yet, there's nothing to protect — show the
    // (empty) list directly instead of prompting to unlock.
    setLockedUnlocked(lockedConversations.length === 0);
    setShowLockedChats(true);
  };

  // Contacts available for groups/broadcast (exclude self + AI bot)
  const contacts = users.filter((u) => u.id !== user?.id && u.username !== 'meta_ai');
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      showNeonAlert({ title: 'NAME REQUIRED', message: 'Please enter a group name.', icon: 'people-outline', iconColor: '#f59e0b', borderColor: '#f59e0b' });
      return;
    }
    if (selectedIds.length === 0) {
      showNeonAlert({ title: 'ADD MEMBERS', message: 'Select at least one member.', icon: 'person-add-outline', iconColor: '#f59e0b', borderColor: '#f59e0b' });
      return;
    }
    if (selectedIds.length > 14) {
      showNeonAlert({ title: 'TOO MANY', message: 'A group can have up to 15 members (including you).', icon: 'people-outline', iconColor: '#f59e0b', borderColor: '#f59e0b' });
      return;
    }
    setBusyAction(true);
    const convId = await createGroup(groupName.trim(), selectedIds);
    setBusyAction(false);
    if (convId) {
      setShowNewGroup(false);
      router.push(`/chat/${convId}`);
    }
  };

  const handleSendBroadcast = async () => {
    if (!broadcastText.trim()) {
      showNeonAlert({ title: 'MESSAGE REQUIRED', message: 'Type a message to broadcast.', icon: 'chatbubble-outline', iconColor: '#f59e0b', borderColor: '#f59e0b' });
      return;
    }
    if (selectedIds.length === 0) {
      showNeonAlert({ title: 'SELECT RECIPIENTS', message: 'Choose at least one person.', icon: 'people-outline', iconColor: '#f59e0b', borderColor: '#f59e0b' });
      return;
    }
    setBusyAction(true);
    let sent = 0;
    for (const id of selectedIds) {
      try {
        const cid = await startConversation(id);
        if (cid) { await sendMessage(cid, broadcastText.trim()); sent++; }
      } catch (e) { /* continue */ }
    }
    setBusyAction(false);
    setShowBroadcast(false);
    showNeonAlert({ title: 'BROADCAST SENT', message: `Message delivered to ${sent} of ${selectedIds.length} contact${selectedIds.length === 1 ? '' : 's'}.`, icon: 'checkmark-done-outline', iconColor: '#10b981', borderColor: '#10b981' });
  };

  const handleStartMetaAI = async () => {
    const metaAIBot = users.find(u => u.username === 'meta_ai');
    if (metaAIBot) {
      handleStartChat(metaAIBot.id);
    } else {
      await fetchUsers();
      const retryBot = users.find(u => u.username === 'meta_ai');
      if (retryBot) {
        handleStartChat(retryBot.id);
      } else {
        showNeonAlert({
          title: 'AI SYNC',
          message: 'NOVA AI is starting up. Please try again.',
          icon: 'information-circle-outline',
          iconColor: '#f59e0b',
          borderColor: '#f59e0b',
        });
      }
    }
  };

  // Filtered users for search modal
  const filteredUsers = users.filter(u => 
    u.id !== user?.id &&
    u.username !== 'meta_ai' &&
    (u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) || 
     u.username.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Avatar initial extraction
  const getInitials = (name: string) => {
    return name ? name.charAt(0).toUpperCase() : '?';
  };

  const getAvatarColor = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = ['#f43f5e', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#06b6d4'];
    return colors[Math.abs(hash) % colors.length];
  };

  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours % 12 || 12}:${minutes} ${hours >= 12 ? 'PM' : 'AM'}`;
  };

  // Chat-list timestamp: today -> time, yesterday -> "Yesterday", else date.
  const formatListTime = (isoString?: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const dayDiff = Math.round((startOfToday - startOfDate) / 86400000);
    if (dayDiff <= 0) return formatTime(isoString);
    if (dayDiff === 1) return 'Yesterday';
    return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
  };

  // Keyboard button click handler
  const handleKeyPress = (key: string) => {
    setVaultErrorMessage(null);
    const activeInput = isChangingPinMode ? newPinInput : pinInput;
    const setActiveInput = isChangingPinMode ? setNewPinInput : setPinInput;

    if (key === 'Clear') {
      if (activeInput.length > 0) {
        setActiveInput(activeInput.slice(0, -1));
      }
    } else if (key === 'OK') {
      submitPin(activeInput);
    } else {
      if (activeInput.length < 4) {
        const updated = activeInput + key;
        setActiveInput(updated);
        // Autocomplete check at 4 digits
        if (updated.length === 4) {
          submitPin(updated);
        }
      }
    }
  };

  const submitPin = (input: string) => {
    if (isChangingPinMode) {
      if (input.length === 4) {
        setVaultPin(input);
        setIsChangingPinMode(false);
        setVaultErrorMessage(`PIN updated successfully to ${input}!`);
        setNewPinInput('');
      } else {
        setVaultErrorMessage("PIN must be exactly 4 digits!");
      }
    } else {
      if (input === vaultPin) {
        setIsVaultUnlocked(true);
        setPinInput('');
      } else {
        setVaultErrorMessage("ACCESS DENIED • INCORRECT PIN!");
        setPinInput('');
      }
    }
  };

  const handleEncryptFile = () => {
    if (!newFileName.trim()) {
      showNeonAlert({
        title: 'VALIDATION ERROR',
        message: 'Please enter a document name',
        icon: 'alert-circle-outline',
        iconColor: '#f59e0b',
        borderColor: '#f59e0b',
      });
      return;
    }
    const newItem: VaultItem = {
      name: newFileName.trim(),
      details: `${newFileSize} • Me`,
      type: newFileType,
      securityStatus: "AES-256 Secured"
    };
    setVaultItems([newItem, ...vaultItems]);
    setNewFileName('');
    setShowAddForm(false);
  };

  return (
    <View style={styles.container}>
      {/* Ambient Neon Turbo/Ultraviolet Shadows matching Kotlin */}
      <View style={styles.neonTurquoiseGlow} />
      <View style={styles.neonUltravioletGlow} />

      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        {/* Bento Item 1: Secure E2EE Banner Card */}
        <View style={styles.bentoSecureBanner}>
          <View style={styles.lockIconBg}>
            <Ionicons name="lock-closed" size={20} color="#0df" />
          </View>
          <View style={styles.bentoSecureInfo}>
            <Text style={styles.bentoSecureTitle}>ENCRYPTION ACTIVE</Text>
            <Text style={styles.bentoSecureSubtitle}>End-to-end secure · private by design</Text>
          </View>
          <View style={styles.memberCountPill}>
            <Ionicons name="people" size={14} color="#0df" />
            <Text style={styles.memberCountNum}>{users.filter(u => u.username !== 'meta_ai').length + 1}/15</Text>
            <Text style={styles.memberCountLbl}>users</Text>
          </View>
        </View>

        {/* Bento Items 2: Featured Dials Bento Grid */}
        <View style={styles.bentoGrid}>
          {/* Left Column: Document Locker quick-access card (opens real on-device locker) */}
          <TouchableOpacity 
            style={styles.bentoBigCard}
            onPress={() => {
              setIsVaultUnlocked(false);
              setPinInput('');
              setVaultErrorMessage(null);
              setShowVaultModal(true);
            }}
          >
            <View style={styles.bentoBigCardHeader}>
              <View style={styles.vaultBadgeBg}>
                <Ionicons name="lock-closed" size={20} color="#10b981" />
              </View>
              <View style={styles.membersCountBadge}>
                <Text style={styles.membersCountText}>SECURE</Text>
              </View>
            </View>
            <View style={styles.bentoBigCardFooter}>
              <Text style={styles.bentoBigCardTitle}>Document Locker</Text>
              <Text style={styles.bentoBigCardSubtitle} numberOfLines={1}>Private · encrypted files</Text>
            </View>
          </TouchableOpacity>

          {/* Right Column: Locked Chats shortcut */}
          <View style={styles.bentoRightColumn}>
            {/* Locked (hidden) Chats Card — opens behind fingerprint / PIN */}
            <TouchableOpacity 
              style={[styles.bentoSmallCard, { backgroundColor: 'rgba(139, 92, 246, 0.1)' }]}
              onPress={openLockedChats}
            >
              <Ionicons name="lock-closed" size={20} color="#a78bfa" style={styles.bentoCardIcon} />
              <View>
                <Text style={[styles.bentoSmallCardTitle, { color: '#a78bfa' }]}>Locked Chats</Text>
                <Text style={[styles.bentoSmallCardSubtitle, { color: 'rgba(167, 139, 250, 0.7)' }]}>
                  {lockedConversations.length} hidden
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Section Header: Direct Secure Chats */}
        <Text style={styles.sectionHeader}>Direct Secure Channels</Text>

        {/* Conversations List */}
        {visibleConversations.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubbles-outline" size={48} color="#334155" />
            <Text style={styles.emptyText}>No chats active yet.</Text>
            <Text style={styles.emptySubtitle}>Start a chat with Nova AI or search other users below!</Text>
          </View>
        ) : (
          <View style={styles.chatsListWrapper}>
            {visibleConversations.map((item) => {
              const isGroup = !!item.isGroup;
              const otherParticipant = item.participants.find(p => p.id !== user?.id) || item.participants[0];
              if (!isGroup && !otherParticipant) return null;

              const isAI = !isGroup && otherParticipant?.username === 'meta_ai';
              const isOnline = !isGroup && otherParticipant?.isOnline;
              const title = isGroup ? (item.groupName || 'Group') : otherParticipant.displayName;
              const avatarUrl = isGroup ? '' : otherParticipant.avatarUrl;

              return (
                <TouchableOpacity
                  key={item._id}
                  style={styles.chatCard}
                  onPress={() => router.push(`/chat/${item._id}`)}
                  onLongPress={() => handleChatLongPress(item)}
                  delayLongPress={350}
                >
                  <View style={styles.avatarWrapper}>
                    {isGroup ? (
                      <View style={[styles.avatarFallback, { backgroundColor: '#1e293b' }]}>
                        <Ionicons name="people" size={26} color="#0df" />
                      </View>
                    ) : avatarUrl ? (
                      <Image
                        source={{ uri: avatarUrl }}
                        style={styles.avatar}
                      />
                    ) : (
                      <View style={[styles.avatarFallback, { backgroundColor: getAvatarColor(title) }]}>
                        <Text style={styles.avatarFallbackText}>{getInitials(title)}</Text>
                      </View>
                    )}
                    {isOnline && !isAI && <View style={styles.onlineBadge} />}
                    {isAI && <View style={styles.aiBadge}><Text style={styles.aiBadgeText}>AI</Text></View>}
                  </View>

                  <View style={styles.chatInfo}>
                    <View style={styles.chatHeader}>
                      <Text style={[styles.participantName, isAI && styles.aiName]}>
                        {title}
                      </Text>
                      <Text style={[styles.chatTime, (item.unreadCount ?? 0) > 0 && styles.chatTimeUnread]}>
                        {formatListTime(item.lastMessage?.createdAt || item.updatedAt)}
                      </Text>
                    </View>

                    <View style={styles.chatBody}>
                      <View style={{ flex: 1 }}>
                        {item.lastMessage ? (
                          <View style={styles.messageRow}>
                            {item.lastMessage.sender === user?.id && (
                              <Ionicons
                                name={item.lastMessage.status === 'read' ? 'checkmark-done' : 'checkmark'}
                                size={16}
                                color={item.lastMessage.status === 'read' ? '#0df' : '#64748b'}
                                style={{ marginRight: 4 }}
                              />
                            )}
                            <Text style={styles.lastMessageText} numberOfLines={1}>
                              {item.lastMessage.text}
                            </Text>
                          </View>
                        ) : (
                          <Text style={styles.noMessageText}>{isGroup ? 'Group created · say hi 👋' : 'No messages yet'}</Text>
                        )}
                      </View>
                      {(item.unreadCount ?? 0) > 0 && (
                        <View style={styles.unreadBadge}>
                          <Text style={styles.unreadBadgeText}>{item.unreadCount! > 99 ? '99+' : item.unreadCount}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Floating Action Button (FAB) ChatGPT secure AI */}
      <TouchableOpacity style={styles.fab} onPress={handleStartMetaAI}>
        <Ionicons name="sparkles" size={24} color="#090d16" />
      </TouchableOpacity>

      {/* Contact Search Button for starting chats */}
      <TouchableOpacity style={styles.fabSearch} onPress={() => setModalVisible(true)}>
        <Ionicons name="add" size={24} color="#090d16" />
      </TouchableOpacity>

      {/* --- MODAL 1: SELECT CONTACT MODAL --- */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Contact</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#cbd5e1" />
              </TouchableOpacity>
            </View>

            <View style={styles.searchBox}>
              <Ionicons name="search" size={18} color="#64748b" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search users..."
                placeholderTextColor="#64748b"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
              />
            </View>

            {startingChat ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="large" color="#0df" />
                <Text style={styles.modalLoadingText}>Opening chat...</Text>
              </View>
            ) : filteredUsers.length === 0 ? (
              <View style={styles.modalEmpty}>
                <Ionicons name="people-outline" size={48} color="#475569" />
                <Text style={styles.modalEmptyText}>No contacts found</Text>
              </View>
            ) : (
              <FlatList
                data={filteredUsers}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.contactItem}
                    onPress={() => handleStartChat(item.id)}
                  >
                    <View style={[styles.contactAvatarFallback, { backgroundColor: getAvatarColor(item.displayName) }]}>
                      <Text style={styles.contactAvatarText}>{getInitials(item.displayName)}</Text>
                    </View>
                    <View style={styles.contactInfo}>
                      <Text style={styles.contactName}>{item.displayName}</Text>
                      <Text style={styles.contactAbout} numberOfLines={1}>{item.about}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#475569" />
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* On-device, PIN-protected Document Locker (private to this phone) */}
      <DocumentLocker visible={showVaultModal} onClose={() => setShowVaultModal(false)} />

      {/* Locked (hidden) Chats — gated by fingerprint / PIN */}
      <Modal
        visible={showLockedChats}
        animationType="slide"
        transparent={false}
        onRequestClose={() => { setShowLockedChats(false); setLockedUnlocked(false); }}
      >
        {!lockedUnlocked ? (
          <UnlockScreen
            title="Locked Chats"
            subtitle="Unlock to view hidden chats"
            onUnlock={() => setLockedUnlocked(true)}
            onCancel={() => { setShowLockedChats(false); setLockedUnlocked(false); }}
          />
        ) : (
          <View style={styles.container}>
            <View style={styles.lockedHeader}>
              <Text style={styles.lockedTitle}>Locked Chats</Text>
              <TouchableOpacity onPress={() => { setShowLockedChats(false); setLockedUnlocked(false); }}>
                <Ionicons name="close" size={26} color="#cbd5e1" />
              </TouchableOpacity>
            </View>
            {lockedConversations.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="lock-open-outline" size={48} color="#334155" />
                <Text style={styles.emptyText}>No locked chats</Text>
                <Text style={styles.emptySubtitle}>Long-press any chat, then choose Lock to hide it here.</Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
                {lockedConversations.map((item) => {
                  const other = item.participants.find((p) => p.id !== user?.id) || item.participants[0];
                  if (!other) return null;
                  return (
                    <TouchableOpacity
                      key={item._id}
                      style={styles.chatCard}
                      onPress={() => { setShowLockedChats(false); setLockedUnlocked(false); router.push(`/chat/${item._id}`); }}
                      onLongPress={() => handleChatLongPress(item)}
                      delayLongPress={350}
                    >
                      <View style={styles.avatarWrapper}>
                        {other.avatarUrl ? (
                          <Image source={{ uri: other.avatarUrl }} style={styles.avatar} />
                        ) : (
                          <View style={[styles.avatarFallback, { backgroundColor: getAvatarColor(other.displayName) }]}>
                            <Text style={styles.avatarFallbackText}>{getInitials(other.displayName)}</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.chatInfo}>
                        <Text style={styles.participantName}>{other.displayName}</Text>
                        <Text style={styles.lastMessageText} numberOfLines={1}>
                          {item.lastMessage?.text || 'Tap to open'}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => unlockChat(item._id)} style={{ padding: 8 }}>
                        <Ionicons name="lock-open-outline" size={20} color="#a78bfa" />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        )}
      </Modal>

      <SetSecurityPinModal visible={showPinSetup} onDone={onPinSetupDone} />

      {/* New Group modal */}
      <Modal visible={showNewGroup} animationType="slide" transparent onRequestClose={() => setShowNewGroup(false)}>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>New Group</Text>
              <TouchableOpacity onPress={() => setShowNewGroup(false)}><Ionicons name="close" size={24} color="#cbd5e1" /></TouchableOpacity>
            </View>
            <TextInput style={styles.pickerInput} placeholder="Group name" placeholderTextColor="#475569" value={groupName} onChangeText={setGroupName} />
            <Text style={styles.pickerHint}>{selectedIds.length} selected · up to 14 members</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {contacts.map((c) => {
                const sel = selectedIds.includes(c.id);
                return (
                  <TouchableOpacity key={c.id} style={styles.pickerRow} onPress={() => toggleSelect(c.id)} activeOpacity={0.7}>
                    <View style={[styles.pickerAvatar, { backgroundColor: getAvatarColor(c.displayName) }]}>
                      <Text style={styles.avatarFallbackText}>{getInitials(c.displayName)}</Text>
                    </View>
                    <Text style={styles.pickerName} numberOfLines={1}>{c.displayName}</Text>
                    <Ionicons name={sel ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={sel ? '#0df' : '#475569'} />
                  </TouchableOpacity>
                );
              })}
              {contacts.length === 0 && <Text style={styles.pickerHint}>No contacts yet.</Text>}
            </ScrollView>
            <TouchableOpacity style={styles.pickerBtn} onPress={handleCreateGroup} disabled={busyAction}>
              {busyAction ? <ActivityIndicator color="#090d16" /> : <Text style={styles.pickerBtnText}>Create Group</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Broadcast modal */}
      <Modal visible={showBroadcast} animationType="slide" transparent onRequestClose={() => setShowBroadcast(false)}>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Broadcast</Text>
              <TouchableOpacity onPress={() => setShowBroadcast(false)}><Ionicons name="close" size={24} color="#cbd5e1" /></TouchableOpacity>
            </View>
            <TextInput style={[styles.pickerInput, { height: 70 }]} placeholder="Type a message to send to everyone selected…" placeholderTextColor="#475569" value={broadcastText} onChangeText={setBroadcastText} multiline />
            <Text style={styles.pickerHint}>{selectedIds.length} recipient{selectedIds.length === 1 ? '' : 's'} selected</Text>
            <ScrollView style={{ maxHeight: 280 }}>
              {contacts.map((c) => {
                const sel = selectedIds.includes(c.id);
                return (
                  <TouchableOpacity key={c.id} style={styles.pickerRow} onPress={() => toggleSelect(c.id)} activeOpacity={0.7}>
                    <View style={[styles.pickerAvatar, { backgroundColor: getAvatarColor(c.displayName) }]}>
                      <Text style={styles.avatarFallbackText}>{getInitials(c.displayName)}</Text>
                    </View>
                    <Text style={styles.pickerName} numberOfLines={1}>{c.displayName}</Text>
                    <Ionicons name={sel ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={sel ? '#0df' : '#475569'} />
                  </TouchableOpacity>
                );
              })}
              {contacts.length === 0 && <Text style={styles.pickerHint}>No contacts yet.</Text>}
            </ScrollView>
            <TouchableOpacity style={styles.pickerBtn} onPress={handleSendBroadcast} disabled={busyAction}>
              {busyAction ? <ActivityIndicator color="#090d16" /> : <Text style={styles.pickerBtnText}>Send Broadcast</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* --- MODAL 2: VAULT PIN LOCKER DIALOG MODAL (Kotlin Bento Replica) --- */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={false}
        onRequestClose={() => {
          setIsVaultUnlocked(false);
          setShowVaultModal(false);
        }}
      >
        <View style={styles.vaultOverlay}>
          <View style={styles.vaultContent}>
            {/* Header */}
            <View style={styles.vaultHeader}>
              <View style={styles.vaultHeaderLeft}>
                <View style={[styles.lockStatusIconBg, { backgroundColor: isVaultUnlocked ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)' }]}>
                  <Ionicons 
                    name={isVaultUnlocked ? "folder-open" : "lock-closed"} 
                    size={18} 
                    color={isVaultUnlocked ? "#10b981" : "#ef4444"} 
                  />
                </View>
                <Text style={styles.vaultTitle}>
                  {isVaultUnlocked ? "NOVA Secure Vault" : "NOVA Security Locker"}
                </Text>
              </View>
              <TouchableOpacity 
                onPress={() => {
                  setIsVaultUnlocked(false);
                  setShowVaultModal(false);
                }}
              >
                <Ionicons name="close" size={24} color="#cbd5e1" />
              </TouchableOpacity>
            </View>

            {!isVaultUnlocked ? (
              // --- 1. Passcode Keyboard View ---
              <View style={styles.passcodeContainer}>
                <Text style={styles.passcodeTitle}>
                  {isChangingPinMode ? "CONFIGURE SECURITY CODE" : "ENTER SECURITY PIN TO DECRYPT"}
                </Text>
                <Text style={styles.passcodeSubtitle}>
                  {isChangingPinMode ? "Choose a 4-digit code to seal your documents." : "All vault assets are sealed on-device using military-grade key algorithms."}
                </Text>

                {/* PASSCODE DOTS INDICATOR */}
                <View style={styles.dotsRow}>
                  {[0, 1, 2, 3].map((i) => {
                    const activeInput = isChangingPinMode ? newPinInput : pinInput;
                    const hasDigit = activeInput.length > i;
                    return (
                      <View 
                        key={i} 
                        style={[
                          styles.passcodeDot, 
                          hasDigit ? { backgroundColor: vaultErrorMessage ? '#ef4444' : '#10b981' } : { backgroundColor: '#1e293b' },
                          !hasDigit && { borderWidth: 1.5, borderColor: '#475569' }
                        ]} 
                      />
                    );
                  })}
                </View>

                {/* Error/Helper Logs */}
                <View style={styles.errorBox}>
                  {vaultErrorMessage && (
                    <Text style={[styles.errorText, { color: vaultErrorMessage.includes('ACCESS') ? '#ef4444' : '#10b981' }]}>
                      {vaultErrorMessage}
                    </Text>
                  )}
                  {!vaultErrorMessage && isChangingPinMode && (
                    <Text style={styles.tipText}>Enter a new 4-digit PIN to update your vault.</Text>
                  )}
                </View>

                {/* snappy keypad grid */}
                <View style={styles.keypadGrid}>
                  {[
                    ['1', '2', '3'],
                    ['4', '5', '6'],
                    ['7', '8', '9'],
                    ['Clear', '0', 'OK']
                  ].map((rowKeys, rowIndex) => (
                    <View key={rowIndex} style={styles.keypadRow}>
                      {rowKeys.map((key) => (
                        <TouchableOpacity
                          key={key}
                          style={[
                            styles.keypadKey,
                            key === 'OK' && { backgroundColor: '#10b981' },
                            key === 'Clear' && { backgroundColor: '#1e293b' }
                          ]}
                          onPress={() => handleKeyPress(key)}
                        >
                          <Text style={[
                            styles.keypadKeyText,
                            key === 'OK' && { color: '#090d16' }
                          ]}>
                            {key}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ))}
                </View>

                <TouchableOpacity 
                  style={styles.changePinBtn}
                  onPress={() => {
                    setIsChangingPinMode(!isChangingPinMode);
                    setVaultErrorMessage(null);
                    setPinInput('');
                    setNewPinInput('');
                  }}
                >
                  <Text style={styles.changePinBtnText}>
                    {isChangingPinMode ? "Back to Unlock" : "Change Encryption PIN"}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              // --- 2. Unlocked File Locker View ---
              <View style={styles.unlockedContainer}>
                {!showAddForm ? (
                  <>
                    <Text style={styles.unlockedSubtitle}>
                      End-to-end encrypted files shared within your private loop. All content is protected with local military-grade AES-256.
                    </Text>

                    <ScrollView style={styles.filesList} contentContainerStyle={styles.filesListContent}>
                      {vaultItems.map((item, idx) => (
                        <View key={idx} style={styles.fileRow}>
                          <View style={styles.fileIconWrapper}>
                            <Ionicons name="document-text" size={20} color="#0df" />
                          </View>
                          <View style={styles.fileInfo}>
                            <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
                            <View style={styles.fileMetaRow}>
                              <Text style={styles.fileSizeText}>{item.details}</Text>
                              <View style={styles.verifiedBadgeBg}>
                                <Text style={styles.verifiedBadgeText}>{item.securityStatus}</Text>
                              </View>
                            </View>
                          </View>
                          <TouchableOpacity onPress={() => showNeonAlert({
                            title: 'SECURE DOWNLOAD',
                            message: `Downloading ${item.name} safely...`,
                            icon: 'checkmark-circle-outline',
                            iconColor: '#10b981',
                            borderColor: '#10b981',
                          })}>
                            <Ionicons name="arrow-down-circle" size={24} color="#10b981" />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </ScrollView>

                    <View style={styles.unlockedActions}>
                      <TouchableOpacity 
                        style={styles.addFileBtn}
                        onPress={() => setShowAddForm(true)}
                      >
                        <Ionicons name="add" size={16} color="#0df" style={{ marginRight: 6 }} />
                        <Text style={styles.addFileBtnText}>Encrypt File</Text>
                      </TouchableOpacity>

                      <TouchableOpacity 
                        style={styles.lockVaultBtn}
                        onPress={() => {
                          setIsVaultUnlocked(false);
                          setShowVaultModal(false);
                        }}
                      >
                        <Text style={styles.lockVaultBtnText}>Close Locker</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  // --- 3. Encrypt New Document Form ---
                  <View style={styles.addFormContainer}>
                    <Text style={styles.addFormTitle}>Encrypt New Document</Text>
                    
                    <TextInput 
                      style={styles.formInput}
                      placeholder="Document Name (e.g. Passwords.txt)"
                      placeholderTextColor="#475569"
                      value={newFileName}
                      onChangeText={setNewFileName}
                      autoCapitalize="none"
                    />

                    {/* File type picker */}
                    <View style={styles.fileTypePickerRow}>
                      <TouchableOpacity 
                        style={[styles.typeOption, newFileType === 'DOCUMENT' && styles.typeOptionActive]}
                        onPress={() => setNewFileType('DOCUMENT')}
                      >
                        <Text style={[styles.typeOptionText, newFileType === 'DOCUMENT' && styles.typeOptionTextActive]}>DOCUMENT</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.typeOption, newFileType === 'IMAGE' && styles.typeOptionActive]}
                        onPress={() => setNewFileType('IMAGE')}
                      >
                        <Text style={[styles.typeOptionText, newFileType === 'IMAGE' && styles.typeOptionTextActive]}>IMAGE</Text>
                      </TouchableOpacity>
                    </View>

                    <TextInput 
                      style={styles.formInput}
                      placeholder="Simulated Size (e.g. 150 KB)"
                      placeholderTextColor="#475569"
                      value={newFileSize}
                      onChangeText={setNewFileSize}
                    />

                    <View style={styles.formActions}>
                      <TouchableOpacity 
                        style={styles.formCancelBtn}
                        onPress={() => setShowAddForm(false)}
                      >
                        <Text style={styles.formCancelBtnText}>Cancel</Text>
                      </TouchableOpacity>

                      <TouchableOpacity 
                        style={styles.formSubmitBtn}
                        onPress={handleEncryptFile}
                      >
                        <Text style={styles.formSubmitBtnText}>Encrypt & Add</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  pickerSheet: { backgroundColor: '#0b1220', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 28, borderTopWidth: 1, borderColor: 'rgba(0,221,255,0.2)', maxHeight: '85%' },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  pickerTitle: { color: '#f8fafc', fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
  pickerInput: { backgroundColor: 'rgba(2,6,23,0.6)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', color: '#f8fafc', fontSize: 15, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10 },
  pickerHint: { color: '#64748b', fontSize: 12, marginBottom: 10 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)' },
  pickerAvatar: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  pickerName: { flex: 1, color: '#e2e8f0', fontSize: 15, fontWeight: '600' },
  pickerBtn: { backgroundColor: '#0df', borderRadius: 14, height: 52, justifyContent: 'center', alignItems: 'center', marginTop: 14 },
  pickerBtnText: { color: '#090d16', fontWeight: '800', fontSize: 15, letterSpacing: 0.5 },
  lockedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  lockedTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  container: {
    flex: 1,
    backgroundColor: '#040810', // Pure premium OLED dark canvas matching Kotlin
    position: 'relative',
  },
  neonTurquoiseGlow: {
    position: 'absolute',
    top: 50,
    left: 20,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: '#00f2fe',
    opacity: 0.08,
  },
  neonUltravioletGlow: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: '#d435ff',
    opacity: 0.06,
  },
  scrollContainer: {
    padding: 20,
    paddingBottom: 90,
  },
  bentoSecureBanner: {
    flexDirection: 'row',
    backgroundColor: 'rgba(6, 78, 59, 0.5)',
    borderRadius: 24,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  lockIconBg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  bentoSecureInfo: {
    flex: 1,
  },
  bentoSecureTitle: {
    color: '#0df',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  bentoSecureSubtitle: {
    color: '#a7f3d0',
    fontSize: 13,
    marginTop: 2,
    fontWeight: '500',
  },
  memberCountPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 221, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0, 221, 255, 0.3)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginLeft: 10,
  },
  memberCountNum: {
    color: '#0df',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },
  memberCountLbl: {
    color: '#67e8f9',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  bentoGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  bentoBigCard: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    borderRadius: 28,
    padding: 16,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  bentoBigCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  vaultBadgeBg: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  vaultBadgeText: {
    color: '#818cf8',
    fontSize: 18,
    fontWeight: '800',
  },
  membersCountBadge: {
    borderRadius: 20,
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  membersCountText: {
    color: '#818cf8',
    fontSize: 10,
    fontWeight: '800',
  },
  bentoBigCardFooter: {
    marginTop: 'auto',
  },
  bentoBigCardTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '800',
  },
  bentoBigCardSubtitle: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
  },
  bentoRightColumn: {
    flex: 1,
    gap: 10,
  },
  bentoSmallCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    paddingHorizontal: 16,
    height: 68,
  },
  bentoCardIcon: {
    marginRight: 12,
  },
  bentoSmallCardTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  bentoSmallCardSubtitle: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: '500',
  },
  sectionHeader: {
    color: '#0df',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  chatsListWrapper: {
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    borderRadius: 24,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.03)',
  },
  chatCard: {
    flexDirection: 'row',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.03)',
    alignItems: 'center',
  },
  avatarWrapper: {
    position: 'relative',
    marginRight: 14,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarFallback: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarFallbackText: {
    color: '#090d16',
    fontSize: 18,
    fontWeight: '800',
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10b981',
    borderWidth: 2,
    borderColor: '#040810',
  },
  aiBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#0df',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: '#040810',
  },
  aiBadgeText: {
    color: '#090d16',
    fontSize: 8,
    fontWeight: '800',
  },
  chatInfo: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  participantName: {
    color: '#f1f5f9',
    fontSize: 15,
    fontWeight: '800',
  },
  aiName: {
    color: '#0df',
    textShadowColor: 'rgba(0, 221, 255, 0.25)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },
  chatTime: {
    color: '#475569',
    fontSize: 12,
  },
  chatTimeUnread: {
    color: '#10b981',
    fontWeight: '700',
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 7,
    marginLeft: 8,
  },
  unreadBadgeText: {
    color: '#04140d',
    fontSize: 12,
    fontWeight: '800',
  },
  chatBody: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  lastMessageText: {
    color: '#94a3b8',
    fontSize: 14,
    flex: 1,
  },
  noMessageText: {
    color: '#475569',
    fontSize: 14,
    fontStyle: 'italic',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0df',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0df',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 2,
  },
  fabSearch: {
    position: 'absolute',
    bottom: 24,
    right: 90,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 2,
  },
  emptyContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
  },
  emptySubtitle: {
    color: '#475569',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.85)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#040810',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    height: '80%',
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '800',
  },
  closeButton: {
    padding: 4,
  },
  searchBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    height: 48,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  searchInput: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 15,
    height: '100%',
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.03)',
  },
  contactAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  contactAvatarText: {
    color: '#090d16',
    fontSize: 16,
    fontWeight: '800',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '800',
  },
  contactAbout: {
    color: '#475569',
    fontSize: 13,
  },
  modalLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalLoadingText: {
    color: '#0df',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
  },
  modalEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 40,
  },
  modalEmptyText: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
  },

  /* --- VAULT DIALOG STYLING --- */
  vaultOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  vaultContent: {
    backgroundColor: '#090d16',
    borderRadius: 28,
    width: width * 0.9,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#0df',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  vaultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  vaultHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lockStatusIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  vaultTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '800',
  },
  passcodeContainer: {
    alignItems: 'center',
  },
  passcodeTitle: {
    color: '#0df',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
  },
  passcodeSubtitle: {
    color: '#64748b',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 16,
    lineHeight: 16,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 16,
    marginVertical: 20,
  },
  passcodeDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  errorBox: {
    height: 24,
    justifyContent: 'center',
    marginBottom: 16,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  tipText: {
    color: '#475569',
    fontSize: 11,
    textAlign: 'center',
  },
  keypadGrid: {
    gap: 12,
    width: '100%',
    paddingHorizontal: 8,
  },
  keypadRow: {
    flexDirection: 'row',
    gap: 12,
  },
  keypadKey: {
    flex: 1,
    aspectRatio: 1.8,
    borderRadius: 16,
    backgroundColor: 'rgba(30, 41, 59, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.03)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  keypadKeyText: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '800',
  },
  changePinBtn: {
    paddingVertical: 12,
    marginTop: 16,
  },
  changePinBtnText: {
    color: '#0df',
    fontSize: 14,
    fontWeight: '800',
  },

  /* Unlocked Vault Files Locker View */
  unlockedContainer: {
    width: '100%',
  },
  unlockedSubtitle: {
    color: '#64748b',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 16,
  },
  filesList: {
    maxHeight: 240,
    marginBottom: 16,
  },
  filesListContent: {
    gap: 10,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#040810',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
    padding: 12,
  },
  fileIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 221, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '800',
  },
  fileMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  fileSizeText: {
    color: '#64748b',
    fontSize: 11,
  },
  verifiedBadgeBg: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  verifiedBadgeText: {
    color: '#10b981',
    fontSize: 9,
    fontWeight: '800',
  },
  unlockedActions: {
    flexDirection: 'row',
    gap: 8,
  },
  addFileBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#0df',
  },
  addFileBtnText: {
    color: '#0df',
    fontWeight: '800',
    fontSize: 14,
  },
  lockVaultBtn: {
    flex: 1,
    backgroundColor: '#0df',
    borderRadius: 12,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockVaultBtnText: {
    color: '#090d16',
    fontWeight: '800',
    fontSize: 14,
  },

  /* Encrypt File Form */
  addFormContainer: {
    gap: 12,
  },
  addFormTitle: {
    color: '#0df',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  formInput: {
    backgroundColor: 'rgba(2, 6, 23, 0.5)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 16,
    height: 48,
    color: '#f8fafc',
    fontSize: 14,
  },
  fileTypePickerRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typeOption: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  typeOptionActive: {
    backgroundColor: 'rgba(0, 221, 255, 0.1)',
    borderColor: '#0df',
  },
  typeOptionText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '800',
  },
  typeOptionTextActive: {
    color: '#0df',
  },
  formActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  formCancelBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    height: 44,
  },
  formCancelBtnText: {
    color: '#cbd5e1',
    fontWeight: '800',
    fontSize: 14,
  },
  formSubmitBtn: {
    flex: 1,
    backgroundColor: '#0df',
    borderRadius: 12,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formSubmitBtnText: {
    color: '#090d16',
    fontWeight: '800',
    fontSize: 14,
  },
});
