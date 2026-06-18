import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useApp } from '../../context/AppContext';
import { Ionicons } from '@expo/vector-icons';
import { showNeonAlert } from '../../components/NeonAlert';

const CODE_LENGTH = 6;

export default function VerifyScreen() {
  const { verifyOtp, resendOtp } = useApp();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = (params.email as string) || '';

  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputs = useRef<Array<TextInput | null>>([]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleChange = (text: string, index: number) => {
    const clean = text.replace(/[^0-9]/g, '');
    if (clean.length > 1) {
      // Pasted full code
      const arr = clean.slice(0, CODE_LENGTH).split('');
      const next = Array(CODE_LENGTH).fill('');
      arr.forEach((d, i) => (next[i] = d));
      setDigits(next);
      inputs.current[Math.min(arr.length, CODE_LENGTH - 1)]?.focus();
      return;
    }
    const next = [...digits];
    next[index] = clean;
    setDigits(next);
    if (clean && index < CODE_LENGTH - 1) inputs.current[index + 1]?.focus();
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    const code = digits.join('');
    if (code.length !== CODE_LENGTH) {
      showNeonAlert({ title: 'Incomplete Code', message: `Please enter the ${CODE_LENGTH}-digit code sent to your email.`, icon: 'alert-circle-outline', borderColor: '#f59e0b', iconColor: '#f59e0b' });
      return;
    }
    setSubmitting(true);
    const ok = await verifyOtp(email, code);
    setSubmitting(false);
    if (ok) router.replace('/(tabs)');
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    const ok = await resendOtp(email);
    if (ok) setCooldown(30);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <View style={styles.content}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#cbd5e1" />
        </TouchableOpacity>

        <View style={styles.iconCircle}>
          <Ionicons name="mail-unread-outline" size={40} color="#0df" />
        </View>

        <Text style={styles.title}>Verify Your Email</Text>
        <Text style={styles.subtitle}>
          We sent a {CODE_LENGTH}-digit code to{'\n'}
          <Text style={styles.email}>{email || 'your email'}</Text>
        </Text>

        <View style={styles.codeRow}>
          {digits.map((d, i) => (
            <TextInput
              key={i}
              ref={(r) => { inputs.current[i] = r; }}
              style={[styles.codeBox, d ? styles.codeBoxFilled : null]}
              value={d}
              onChangeText={(t) => handleChange(t, i)}
              onKeyPress={(e) => handleKeyPress(e, i)}
              keyboardType="number-pad"
              maxLength={CODE_LENGTH}
              autoFocus={i === 0}
            />
          ))}
        </View>

        <TouchableOpacity style={styles.button} onPress={handleVerify} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#090d16" /> : <Text style={styles.buttonText}>Verify & Continue</Text>}
        </TouchableOpacity>

        <View style={styles.resendRow}>
          <Text style={styles.resendText}>Didn't get the code? </Text>
          <TouchableOpacity onPress={handleResend} disabled={cooldown > 0}>
            <Text style={[styles.resendLink, cooldown > 0 && { color: '#475569' }]}>
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend Code'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090d16' },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  back: { position: 'absolute', top: 50, left: 16, padding: 8 },
  iconCircle: {
    width: 90, height: 90, borderRadius: 45, alignSelf: 'center',
    backgroundColor: 'rgba(0,221,255,0.08)', borderWidth: 1, borderColor: 'rgba(0,221,255,0.25)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 24,
  },
  title: { fontSize: 26, fontWeight: '800', color: '#f8fafc', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#64748b', textAlign: 'center', marginTop: 10, lineHeight: 20 },
  email: { color: '#38bdf8', fontWeight: '700' },
  codeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 32, marginBottom: 8 },
  codeBox: {
    width: 48, height: 58, borderRadius: 12, backgroundColor: 'rgba(2,6,23,0.6)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', color: '#f8fafc',
    fontSize: 24, fontWeight: '800', textAlign: 'center',
  },
  codeBoxFilled: { borderColor: '#0df', backgroundColor: 'rgba(0,221,255,0.06)' },
  button: {
    backgroundColor: '#0df', borderRadius: 16, height: 58, justifyContent: 'center', alignItems: 'center',
    marginTop: 28, shadowColor: '#0df', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 10,
  },
  buttonText: { color: '#090d16', fontSize: 16, fontWeight: '800', letterSpacing: 1 },
  resendRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 22 },
  resendText: { color: '#64748b', fontSize: 14 },
  resendLink: { color: '#0df', fontWeight: '700', fontSize: 14 },
});
