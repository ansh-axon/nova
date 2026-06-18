import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '../../context/AppContext';
import { Ionicons } from '@expo/vector-icons';
import { showNeonAlert } from '../../components/NeonAlert';

export default function ForgotPasswordScreen() {
  const { forgotPassword, resetPassword } = useApp();
  const router = useRouter();

  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const handleRequest = async () => {
    if (!isValidEmail(email.trim())) {
      showNeonAlert({ title: 'Invalid Email', message: 'Please enter your registered email address.', icon: 'mail-outline', borderColor: '#f59e0b', iconColor: '#f59e0b' });
      return;
    }
    setSubmitting(true);
    const ok = await forgotPassword(email.trim().toLowerCase());
    setSubmitting(false);
    if (ok) setStep('reset');
  };

  const handleReset = async () => {
    if (!code.trim() || code.trim().length < 6) {
      showNeonAlert({ title: 'Code Required', message: 'Enter the 6-digit code sent to your email.', icon: 'alert-circle-outline', borderColor: '#f59e0b', iconColor: '#f59e0b' });
      return;
    }
    if (newPassword.length < 6) {
      showNeonAlert({ title: 'Weak Password', message: 'Password must be at least 6 characters.', icon: 'lock-closed-outline', borderColor: '#f43f5e', iconColor: '#f43f5e' });
      return;
    }
    if (newPassword !== confirm) {
      showNeonAlert({ title: 'Password Mismatch', message: 'The passwords do not match.', icon: 'shield-outline', borderColor: '#f43f5e', iconColor: '#f43f5e' });
      return;
    }
    setSubmitting(true);
    const ok = await resetPassword(email.trim().toLowerCase(), code.trim(), newPassword);
    setSubmitting(false);
    if (ok) router.replace('/(auth)/login');
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.back} onPress={() => (step === 'reset' ? setStep('request') : router.back())}>
          <Ionicons name="arrow-back" size={24} color="#cbd5e1" />
        </TouchableOpacity>

        <View style={styles.iconCircle}>
          <Ionicons name={step === 'request' ? 'key-outline' : 'lock-open-outline'} size={38} color="#0df" />
        </View>

        <Text style={styles.title}>{step === 'request' ? 'Forgot Password' : 'Reset Password'}</Text>
        <Text style={styles.subtitle}>
          {step === 'request'
            ? 'Enter your registered email and we will send you a reset code.'
            : `Enter the code sent to ${email} and choose a new password.`}
        </Text>

        {step === 'request' ? (
          <>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={20} color="#64748b" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Registered Email"
                placeholderTextColor="#475569"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
              />
            </View>
            <TouchableOpacity style={styles.button} onPress={handleRequest} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#090d16" /> : <Text style={styles.buttonText}>Send Reset Code</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.inputWrapper}>
              <Ionicons name="keypad-outline" size={20} color="#64748b" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="6-digit code"
                placeholderTextColor="#475569"
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                maxLength={6}
              />
            </View>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color="#64748b" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="New Password"
                placeholderTextColor="#475569"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#64748b" />
              </TouchableOpacity>
            </View>
            <View style={styles.inputWrapper}>
              <Ionicons name="shield-checkmark-outline" size={20} color="#64748b" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Confirm New Password"
                placeholderTextColor="#475569"
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
            </View>
            <TouchableOpacity style={styles.button} onPress={handleReset} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#090d16" /> : <Text style={styles.buttonText}>Reset Password</Text>}
            </TouchableOpacity>
          </>
        )}

        <View style={styles.redirectRow}>
          <Text style={styles.redirectText}>Remembered it? </Text>
          <TouchableOpacity onPress={() => router.replace('/(auth)/login')}>
            <Text style={styles.redirectLink}>Back to Login</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090d16' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  back: { position: 'absolute', top: 50, left: 16, padding: 8 },
  iconCircle: {
    width: 86, height: 86, borderRadius: 43, alignSelf: 'center',
    backgroundColor: 'rgba(0,221,255,0.08)', borderWidth: 1, borderColor: 'rgba(0,221,255,0.25)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 22,
  },
  title: { fontSize: 26, fontWeight: '800', color: '#f8fafc', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#64748b', textAlign: 'center', marginTop: 10, marginBottom: 26, lineHeight: 20 },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(2,6,23,0.5)',
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 16, paddingHorizontal: 16, height: 56,
  },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, color: '#f8fafc', fontSize: 16, height: '100%' },
  eyeIcon: { padding: 4 },
  button: {
    backgroundColor: '#0df', borderRadius: 16, height: 58, justifyContent: 'center', alignItems: 'center',
    marginTop: 8, shadowColor: '#0df', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 10,
  },
  buttonText: { color: '#090d16', fontSize: 16, fontWeight: '800', letterSpacing: 1 },
  redirectRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  redirectText: { color: '#64748b', fontSize: 14 },
  redirectLink: { color: '#0df', fontWeight: '700', fontSize: 14 },
});
