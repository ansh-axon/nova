import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { showNeonAlert } from './NeonAlert';
import { hasPin, setPin, verifyPin, listItems, addItem, removeItem, formatSize, LockerItem } from '../utils/locker';

type Stage = 'loading' | 'setup' | 'unlock' | 'browse';
const PIN_LENGTH = 4;

const fileIcon = (mime: string) => {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'videocam';
  if (mime.startsWith('audio/')) return 'musical-notes';
  if (mime.includes('pdf')) return 'document-text';
  return 'document';
};

export default function DocumentLocker({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [stage, setStage] = useState<Stage>('loading');
  const [pinInput, setPinInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<LockerItem[]>([]);
  const [busy, setBusy] = useState(false);

  // ── Use refs for PIN flow so async callbacks always read the latest values ──
  // (React state in async closures can be stale — refs are always up-to-date)
  const stageRef = useRef<Stage>('loading');
  const firstPinRef = useRef<string>('');   // stores the first PIN entry during setup/change
  const changingRef = useRef<boolean>(false);

  const setStageSync = (s: Stage) => { stageRef.current = s; setStage(s); };

  useEffect(() => {
    if (!visible) return;
    // Reset everything when the modal opens
    setPinInput('');
    setError(null);
    firstPinRef.current = '';
    changingRef.current = false;
    (async () => {
      setStageSync('loading');
      const exists = await hasPin();
      setStageSync(exists ? 'unlock' : 'setup');
    })();
  }, [visible]);

  const refreshItems = useCallback(async () => {
    setItems(await listItems());
  }, []);

  const handleKey = (key: string) => {
    setError(null);
    if (key === 'del') {
      setPinInput((p) => p.slice(0, -1));
      return;
    }
    setPinInput((p) => (p.length >= PIN_LENGTH ? p : p + key));
  };

  // Called when user taps the Confirm/Set/Unlock button.
  // Uses refs so it always sees the latest stage + firstPin — no stale closure.
  const handleSubmit = async (code: string) => {
    const isSetup = stageRef.current === 'setup' || changingRef.current;

    if (isSetup) {
      if (!firstPinRef.current) {
        // Step 1: store first entry and ask to confirm
        firstPinRef.current = code;
        setPinInput('');
        setError(null);
        // Force re-render so title updates to "CONFIRM YOUR PIN"
        setStage((s) => s); // no-op state update triggers re-render
        return;
      }
      // Step 2: compare
      if (firstPinRef.current !== code) {
        setError('PINs did not match. Try again.');
        firstPinRef.current = '';
        setPinInput('');
        return;
      }
      // Match — save PIN
      try {
        await setPin(code);
      } catch (e: any) {
        setError('Could not save PIN: ' + e.message);
        firstPinRef.current = '';
        setPinInput('');
        return;
      }
      firstPinRef.current = '';
      changingRef.current = false;
      setPinInput('');
      setError(null);
      await refreshItems();
      setStageSync('browse');
      showNeonAlert({ title: 'PIN SET', message: 'Locker PIN saved on this device.', icon: 'lock-closed', borderColor: '#10b981', iconColor: '#10b981' });
      return;
    }

    // Unlock flow
    let ok = false;
    try {
      ok = await verifyPin(code);
    } catch (e: any) {
      setError('Verify error: ' + e.message);
      setPinInput('');
      return;
    }
    if (ok) {
      setPinInput('');
      setError(null);
      await refreshItems();
      setStageSync('browse');
    } else {
      setError('Incorrect PIN. Access denied.');
      setPinInput('');
    }
  };

  const handleAddFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets || !res.assets[0]) return;
      const a = res.assets[0];
      setBusy(true);
      await addItem({ uri: a.uri, name: a.name, size: a.size || 0, mimeType: a.mimeType || 'application/octet-stream' });
      await refreshItems();
    } catch (e) {
      console.error('Locker add error:', e);
      showNeonAlert({ title: 'ADD FAILED', message: 'Could not add this file.', icon: 'alert-circle-outline', borderColor: '#f43f5e', iconColor: '#f43f5e' });
    } finally {
      setBusy(false);
    }
  };

  const handleOpen = async (item: LockerItem) => {
    try {
      const can = await Sharing.isAvailableAsync();
      if (!can) {
        showNeonAlert({ title: 'PREVIEW UNAVAILABLE', message: 'Sharing is not available on this device.', icon: 'alert-circle-outline', borderColor: '#f59e0b', iconColor: '#f59e0b' });
        return;
      }
      await Sharing.shareAsync(item.uri, { mimeType: item.mimeType, dialogTitle: item.name });
    } catch (e) { console.error('Locker open error:', e); }
  };

  const handleDelete = (item: LockerItem) => {
    showNeonAlert({
      title: 'DELETE FILE',
      message: `Remove "${item.name}" from your locker?`,
      icon: 'trash-outline', borderColor: '#f43f5e', iconColor: '#f43f5e',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => { await removeItem(item.id); await refreshItems(); } },
      ],
    });
  };

  const isSetupStage = stage === 'setup' || changingRef.current;
  const confirmLabel = isSetupStage ? (firstPinRef.current ? 'Confirm PIN' : 'Set PIN') : 'Unlock';
  const titleLabel = isSetupStage
    ? (firstPinRef.current ? 'CONFIRM YOUR PIN' : 'CREATE A 4-DIGIT PIN')
    : 'ENTER LOCKER PIN';

  const renderKeypad = () => (
    <View style={styles.padWrap}>
      <Text style={styles.padTitle}>{titleLabel}</Text>
      <Text style={styles.padSub}>
        {isSetupStage && firstPinRef.current ? 'Re-enter the same PIN to confirm.' : 'Files are sealed privately on this device only.'}
      </Text>

      <View style={styles.dotsRow}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <View key={i} style={[styles.dot, pinInput.length > i ? (error ? styles.dotErr : styles.dotOn) : styles.dotOff]} />
        ))}
      </View>

      <View style={styles.errBox}>{error && <Text style={styles.errText}>{error}</Text>}</View>

      <View style={styles.keypad}>
        {[['1','2','3'],['4','5','6'],['7','8','9'],['','0','del']].map((row, ri) => (
          <View key={ri} style={styles.keyRow}>
            {row.map((k, ci) => k === '' ? <View key={ci} style={styles.keyEmpty} /> : (
              <TouchableOpacity key={ci} style={styles.key} onPress={() => handleKey(k)} activeOpacity={0.7}>
                {k === 'del'
                  ? <Ionicons name="backspace-outline" size={24} color="#cbd5e1" />
                  : <Text style={styles.keyText}>{k}</Text>}
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.confirmBtn, pinInput.length === PIN_LENGTH ? styles.confirmBtnOn : styles.confirmBtnOff]}
        onPress={() => { if (pinInput.length === PIN_LENGTH && !busy) handleSubmit(pinInput); }}
        disabled={pinInput.length !== PIN_LENGTH || busy}
        activeOpacity={0.85}
      >
        {busy
          ? <ActivityIndicator color="#090d16" />
          : <>
              <Ionicons name="checkmark-circle" size={20} color={pinInput.length === PIN_LENGTH ? '#090d16' : '#475569'} />
              <Text style={[styles.confirmBtnText, { color: pinInput.length === PIN_LENGTH ? '#090d16' : '#475569' }]}>{confirmLabel}</Text>
            </>
        }
      </TouchableOpacity>
    </View>
  );

  const renderBrowse = () => (
    <View style={styles.browseWrap}>
      <Text style={styles.browseSub}>{items.length} private file{items.length === 1 ? '' : 's'} · stored only on this device</Text>
      <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 8 }}>
        {items.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="folder-open-outline" size={48} color="#1e293b" />
            <Text style={styles.emptyText}>Locker is empty</Text>
            <Text style={styles.emptySub}>Tap "Add File" to securely store any document, photo or video.</Text>
          </View>
        ) : items.map((item) => (
          <View key={item.id} style={styles.row}>
            <View style={styles.rowIcon}><Ionicons name={fileIcon(item.mimeType) as any} size={20} color="#0df" /></View>
            <TouchableOpacity style={styles.rowInfo} onPress={() => handleOpen(item)} activeOpacity={0.7}>
              <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.rowMeta}>{formatSize(item.size)} · {new Date(item.addedAt).toLocaleDateString()}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleOpen(item)} style={{ padding: 6 }}>
              <Ionicons name="open-outline" size={20} color="#10b981" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDelete(item)} style={{ padding: 6 }}>
              <Ionicons name="trash-outline" size={19} color="#f43f5e" />
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
      <View style={styles.browseActions}>
        <TouchableOpacity style={styles.addBtn} onPress={handleAddFile} disabled={busy}>
          {busy ? <ActivityIndicator color="#090d16" /> : (<><Ionicons name="add" size={18} color="#090d16" /><Text style={styles.addBtnText}>Add File</Text></>)}
        </TouchableOpacity>
        <TouchableOpacity style={styles.changeBtn} onPress={() => {
          changingRef.current = true;
          firstPinRef.current = '';
          setStageSync('setup');
          setPinInput('');
          setError(null);
        }}>
          <Ionicons name="key-outline" size={16} color="#0df" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={[styles.lockBadge, { backgroundColor: stage === 'browse' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)' }]}>
                <Ionicons name={stage === 'browse' ? 'folder-open' : 'lock-closed'} size={18} color={stage === 'browse' ? '#10b981' : '#ef4444'} />
              </View>
              <Text style={styles.title}>Document Locker</Text>
            </View>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color="#cbd5e1" /></TouchableOpacity>
          </View>
          {stage === 'loading'
            ? <View style={{ paddingVertical: 60 }}><ActivityIndicator size="large" color="#0df" /></View>
            : stage === 'browse' ? renderBrowse() : renderKeypad()}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#0b1220', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 28, borderTopWidth: 1, borderColor: 'rgba(0,221,255,0.2)', minHeight: '62%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  lockBadge: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  title: { color: '#f8fafc', fontSize: 17, fontWeight: '800', letterSpacing: 0.5 },
  padWrap: { alignItems: 'center', paddingTop: 6 },
  padTitle: { color: '#f8fafc', fontSize: 14, fontWeight: '800', letterSpacing: 1.5 },
  padSub: { color: '#64748b', fontSize: 12, marginTop: 6, textAlign: 'center' },
  dotsRow: { flexDirection: 'row', gap: 16, marginTop: 26 },
  dot: { width: 16, height: 16, borderRadius: 8 },
  dotOn: { backgroundColor: '#10b981' },
  dotErr: { backgroundColor: '#ef4444' },
  dotOff: { backgroundColor: '#1e293b', borderWidth: 1.5, borderColor: '#475569' },
  errBox: { height: 22, justifyContent: 'center', marginTop: 12 },
  errText: { color: '#f43f5e', fontSize: 12, fontWeight: '600' },
  keypad: { marginTop: 8 },
  keyRow: { flexDirection: 'row', justifyContent: 'center', gap: 18, marginBottom: 16 },
  key: { width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  keyEmpty: { width: 68, height: 68 },
  keyText: { color: '#f1f5f9', fontSize: 26, fontWeight: '700' },
  confirmBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 50, borderRadius: 14, marginTop: 6, paddingHorizontal: 28, alignSelf: 'stretch', marginHorizontal: 8 },
  confirmBtnOn: { backgroundColor: '#0df' },
  confirmBtnOff: { backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  confirmBtnText: { fontSize: 15, fontWeight: '800', letterSpacing: 0.5, marginLeft: 8 },
  browseWrap: { flex: 1 },
  browseSub: { color: '#64748b', fontSize: 12, marginBottom: 12 },
  list: { maxHeight: 360 },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: '#cbd5e1', fontSize: 15, fontWeight: '700', marginTop: 12 },
  emptySub: { color: '#475569', fontSize: 12, textAlign: 'center', marginTop: 6, paddingHorizontal: 20, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  rowIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(0,221,255,0.08)', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  rowInfo: { flex: 1 },
  rowName: { color: '#e2e8f0', fontSize: 14, fontWeight: '600' },
  rowMeta: { color: '#64748b', fontSize: 11, marginTop: 2 },
  browseActions: { flexDirection: 'row', gap: 12, marginTop: 14 },
  addBtn: { flex: 1, flexDirection: 'row', backgroundColor: '#0df', borderRadius: 14, height: 52, justifyContent: 'center', alignItems: 'center' },
  addBtnText: { color: '#090d16', fontWeight: '800', fontSize: 15, marginLeft: 6 },
  changeBtn: { width: 52, height: 52, borderRadius: 14, backgroundColor: 'rgba(0,221,255,0.08)', borderWidth: 1, borderColor: 'rgba(0,221,255,0.2)', justifyContent: 'center', alignItems: 'center' },
});
