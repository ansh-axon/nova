import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authenticateBiometric, isBiometricAvailable, verifySecurityPin } from '../utils/applock';

const PIN_LENGTH = 4;

interface Props {
  title?: string;
  subtitle?: string;
  onUnlock: () => void;
  onCancel?: () => void;     // if provided, shows a close button (used for Locked Chats)
  autoBiometric?: boolean;
}

/**
 * Reusable unlock gate: tries device biometric first (if available), with a
 * 4-digit PIN fallback. Used by App Lock (full screen) and Locked Chats (modal).
 */
export default function UnlockScreen({ title = 'NOVA Locked', subtitle = 'Unlock to continue', onUnlock, onCancel, autoBiometric = true }: Props) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [checking, setChecking] = useState(false);
  const triedRef = useRef(false);

  const runBiometric = async () => {
    setChecking(true);
    const ok = await authenticateBiometric(title);
    setChecking(false);
    if (ok) onUnlock();
  };

  useEffect(() => {
    // Only detect availability. We do NOT auto-trigger the biometric prompt on
    // mount — auto-calling it on screen open caused instability on some devices.
    // The user taps the fingerprint button to use biometric.
    isBiometricAvailable().then(setBioAvailable).catch(() => setBioAvailable(false));
  }, []);

  const handleKey = async (key: string) => {
    setError(null);
    if (key === 'del') {
      setPin((p) => p.slice(0, -1));
      return;
    }
    const next = pin.length >= PIN_LENGTH ? pin : pin + key;
    setPin(next);
    if (next.length === PIN_LENGTH) {
      const ok = await verifySecurityPin(next);
      if (ok) {
        setPin('');
        onUnlock();
      } else {
        setError('Incorrect PIN. Try again.');
        setPin('');
      }
    }
  };

  return (
    <View style={styles.wrap}>
      {onCancel && (
        <TouchableOpacity style={styles.close} onPress={onCancel}>
          <Ionicons name="close" size={26} color="#cbd5e1" />
        </TouchableOpacity>
      )}

      <View style={styles.lockBadge}>
        <Ionicons name="lock-closed" size={34} color="#0df" />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>

      <View style={styles.dotsRow}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <View key={i} style={[styles.dot, pin.length > i ? (error ? styles.dotErr : styles.dotOn) : styles.dotOff]} />
        ))}
      </View>

      <View style={styles.errBox}>{error ? <Text style={styles.errText}>{error}</Text> : null}</View>

      <View style={styles.keypad}>
        {[['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['bio', '0', 'del']].map((row, ri) => (
          <View key={ri} style={styles.keyRow}>
            {row.map((k, ci) => {
              if (k === 'bio') {
                return bioAvailable ? (
                  <TouchableOpacity key={ci} style={styles.key} onPress={runBiometric} disabled={checking}>
                    {checking ? <ActivityIndicator color="#0df" /> : <Ionicons name="finger-print" size={26} color="#0df" />}
                  </TouchableOpacity>
                ) : <View key={ci} style={styles.keyEmpty} />;
              }
              if (k === 'del') {
                return (
                  <TouchableOpacity key={ci} style={styles.key} onPress={() => handleKey('del')}>
                    <Ionicons name="backspace-outline" size={24} color="#cbd5e1" />
                  </TouchableOpacity>
                );
              }
              return (
                <TouchableOpacity key={ci} style={styles.key} onPress={() => handleKey(k)} activeOpacity={0.7}>
                  <Text style={styles.keyText}>{k}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      {bioAvailable && (
        <TouchableOpacity style={styles.bioHint} onPress={runBiometric}>
          <Ionicons name="finger-print" size={16} color="#0df" />
          <Text style={styles.bioHintText}>Use fingerprint / face</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#090d16', justifyContent: 'center', alignItems: 'center', padding: 24 },
  close: { position: 'absolute', top: 50, right: 20, padding: 8 },
  lockBadge: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(0,221,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(0,221,255,0.3)', justifyContent: 'center', alignItems: 'center', marginBottom: 18,
  },
  title: { color: '#f8fafc', fontSize: 20, fontWeight: '800', letterSpacing: 0.5 },
  subtitle: { color: '#64748b', fontSize: 13, marginTop: 6 },
  dotsRow: { flexDirection: 'row', gap: 16, marginTop: 30 },
  dot: { width: 16, height: 16, borderRadius: 8 },
  dotOn: { backgroundColor: '#0df' },
  dotErr: { backgroundColor: '#ef4444' },
  dotOff: { backgroundColor: '#1e293b', borderWidth: 1.5, borderColor: '#475569' },
  errBox: { height: 22, justifyContent: 'center', marginTop: 12 },
  errText: { color: '#f43f5e', fontSize: 12, fontWeight: '600' },
  keypad: { marginTop: 8 },
  keyRow: { flexDirection: 'row', justifyContent: 'center', gap: 18, marginBottom: 16 },
  key: { width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  keyEmpty: { width: 68, height: 68 },
  keyText: { color: '#f1f5f9', fontSize: 26, fontWeight: '700' },
  bioHint: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18 },
  bioHintText: { color: '#0df', fontSize: 13, fontWeight: '600' },
});
