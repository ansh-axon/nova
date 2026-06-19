import React, { useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { setSecurityPin } from '../utils/applock';

const PIN_LENGTH = 4;

interface Props {
  visible: boolean;
  onDone: (success: boolean) => void;
}

/** Modal to create the shared 4-digit security PIN (App Lock + Locked Chats). */
export default function SetSecurityPinModal({ visible, onDone }: Props) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const firstRef = useRef<string>('');
  const [confirming, setConfirming] = useState(false);

  const reset = () => { setPin(''); setError(null); firstRef.current = ''; setConfirming(false); };

  const handleKey = async (key: string) => {
    setError(null);
    if (key === 'del') { setPin((p) => p.slice(0, -1)); return; }
    const next = pin.length >= PIN_LENGTH ? pin : pin + key;
    setPin(next);
    if (next.length === PIN_LENGTH) {
      if (!confirming) {
        firstRef.current = next;
        setConfirming(true);
        setPin('');
      } else {
        if (next === firstRef.current) {
          await setSecurityPin(next);
          reset();
          onDone(true);
        } else {
          setError('PINs did not match. Start again.');
          firstRef.current = '';
          setConfirming(false);
          setPin('');
        }
      }
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { reset(); onDone(false); }}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <TouchableOpacity style={styles.close} onPress={() => { reset(); onDone(false); }}>
            <Ionicons name="close" size={24} color="#cbd5e1" />
          </TouchableOpacity>
          <View style={styles.badge}><Ionicons name="shield-checkmark" size={28} color="#0df" /></View>
          <Text style={styles.title}>{confirming ? 'CONFIRM YOUR PIN' : 'CREATE A 4-DIGIT PIN'}</Text>
          <Text style={styles.sub}>{confirming ? 'Re-enter the same PIN.' : 'Used for App Lock and Locked Chats.'}</Text>

          <View style={styles.dotsRow}>
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <View key={i} style={[styles.dot, pin.length > i ? (error ? styles.dotErr : styles.dotOn) : styles.dotOff]} />
            ))}
          </View>
          <View style={styles.errBox}>{error ? <Text style={styles.errText}>{error}</Text> : null}</View>

          <View style={styles.keypad}>
            {[['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['', '0', 'del']].map((row, ri) => (
              <View key={ri} style={styles.keyRow}>
                {row.map((k, ci) => k === '' ? <View key={ci} style={styles.keyEmpty} /> : (
                  <TouchableOpacity key={ci} style={styles.key} onPress={() => handleKey(k)} activeOpacity={0.7}>
                    {k === 'del' ? <Ionicons name="backspace-outline" size={24} color="#cbd5e1" /> : <Text style={styles.keyText}>{k}</Text>}
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#0b1220', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 24, paddingBottom: 30, alignItems: 'center', borderTopWidth: 1, borderColor: 'rgba(0,221,255,0.2)' },
  close: { position: 'absolute', top: 16, right: 16, padding: 6 },
  badge: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(0,221,255,0.08)', borderWidth: 1, borderColor: 'rgba(0,221,255,0.3)', justifyContent: 'center', alignItems: 'center', marginTop: 6 },
  title: { color: '#f8fafc', fontSize: 14, fontWeight: '800', letterSpacing: 1.2, marginTop: 14 },
  sub: { color: '#64748b', fontSize: 12, marginTop: 6 },
  dotsRow: { flexDirection: 'row', gap: 16, marginTop: 22 },
  dot: { width: 16, height: 16, borderRadius: 8 },
  dotOn: { backgroundColor: '#0df' },
  dotErr: { backgroundColor: '#ef4444' },
  dotOff: { backgroundColor: '#1e293b', borderWidth: 1.5, borderColor: '#475569' },
  errBox: { height: 20, justifyContent: 'center', marginTop: 8 },
  errText: { color: '#f43f5e', fontSize: 12, fontWeight: '600' },
  keypad: { marginTop: 6 },
  keyRow: { flexDirection: 'row', justifyContent: 'center', gap: 18, marginBottom: 14 },
  key: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  keyEmpty: { width: 64, height: 64 },
  keyText: { color: '#f1f5f9', fontSize: 24, fontWeight: '700' },
});
