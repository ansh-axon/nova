import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '../../context/AppContext';
import { Ionicons } from '@expo/vector-icons';
import { showNeonAlert } from '../../components/NeonAlert';

export default function RegisterScreen() {
  const { register, serverUrl, setServerUrl } = useApp();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [ipAddress, setIpAddress] = useState(serverUrl);
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const handleRegister = async () => {
    if (!username.trim() || !email.trim() || !password.trim() || !confirmPassword.trim()) {
      showNeonAlert({ title: 'Missing Fields', message: 'Please fill in all fields to create your account.', icon: 'alert-circle-outline', borderColor: '#f59e0b', iconColor: '#f59e0b' });
      return;
    }

    if (username.trim().length < 3) {
      showNeonAlert({ title: 'Username Too Short', message: 'Username must be at least 3 characters long.', icon: 'person-outline', borderColor: '#f59e0b', iconColor: '#f59e0b' });
      return;
    }

    if (!isValidEmail(email.trim())) {
      showNeonAlert({ title: 'Invalid Email', message: 'Please enter a valid email address for verification.', icon: 'mail-outline', borderColor: '#f59e0b', iconColor: '#f59e0b' });
      return;
    }

    if (password.length < 6) {
      showNeonAlert({ title: 'Weak Password', message: 'Password must be at least 6 characters for security.', icon: 'lock-closed-outline', borderColor: '#f43f5e', iconColor: '#f43f5e' });
      return;
    }

    if (password !== confirmPassword) {
      showNeonAlert({ title: 'Password Mismatch', message: 'The passwords you entered do not match. Please try again.', icon: 'shield-outline', borderColor: '#f43f5e', iconColor: '#f43f5e' });
      return;
    }

    setSubmitting(true);

    // Accept either a full URL (https://...) or a bare IP (auto :5000)
    const raw = ipAddress.trim().replace(/\/+$/, '');
    const newServerUrl = raw.includes('://') ? raw : `http://${raw}:5000`;
    if (newServerUrl !== serverUrl) {
      await setServerUrl(newServerUrl);
    }

    const result = await register(username.trim().toLowerCase(), email.trim().toLowerCase(), password, newServerUrl);
    setSubmitting(false);

    if (result.success && result.needsVerification) {
      router.push({ pathname: '/(auth)/verify' as any, params: { email: result.email || email.trim().toLowerCase() } });
    } else if (result.needsVerification && result.email) {
      // Account already exists but unverified — let them verify
      router.push({ pathname: '/(auth)/verify' as any, params: { email: result.email } });
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      {/* Ambient premium background glow */}
      <View pointerEvents="none" style={styles.ambientOrbTop} />
      <View pointerEvents="none" style={styles.ambientOrbBottom} />

      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        {/* Logo and Branding */}
        <View style={styles.logoContainer}>
          <View style={styles.logoGlow} />
          <View style={styles.logoBadge}>
            <Ionicons name="triangle" size={38} color="#0df" />
          </View>
          <Text style={styles.logoText}>NOVA</Text>
          <View style={styles.taglineRow}>
            <View style={styles.taglineDot} />
            <Text style={styles.tagline}>Connected · Secure · Boundless</Text>
            <View style={styles.taglineDot} />
          </View>
        </View>

        {/* Form Container */}
        <View style={styles.formContainer}>
          <Text style={styles.welcomeText}>Create Account</Text>
          <Text style={styles.subtitle}>Sign up to start chatting instantly</Text>

          {/* Username Input */}
          <View style={styles.inputWrapper}>
            <Ionicons name="person-outline" size={20} color="#64748b" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Choose Username"
              placeholderTextColor="#475569"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Email Input */}
          <View style={styles.inputWrapper}>
            <Ionicons name="mail-outline" size={20} color="#64748b" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Email (for verification & recovery)"
              placeholderTextColor="#475569"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
          </View>

          {/* Password Input */}
          <View style={styles.inputWrapper}>
            <Ionicons name="lock-closed-outline" size={20} color="#64748b" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#475569"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color="#64748b"
              />
            </TouchableOpacity>
          </View>

          {/* Confirm Password Input */}
          <View style={styles.inputWrapper}>
            <Ionicons name="shield-checkmark-outline" size={20} color="#64748b" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Confirm Password"
              placeholderTextColor="#475569"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>

        {/* Submit Button - Full Width outside form card */}
        <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator color="#090d16" />
          ) : (
            <Text style={styles.buttonText}>Sign Up</Text>
          )}
        </TouchableOpacity>

          {/* Redirect to Login */}
          <View style={styles.redirectContainer}>
            <Text style={styles.redirectText}>Have an account? </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
              <Text style={styles.redirectLink}>Log In</Text>
            </TouchableOpacity>
          </View>

          {/* Advanced Server Configuration Expandable */}
          <TouchableOpacity
            style={styles.serverConfigHeader}
            onPress={() => setShowServerConfig(!showServerConfig)}
          >
            <Ionicons name="settings-outline" size={16} color="#475569" />
            <Text style={styles.serverConfigHeaderText}>Network Settings</Text>
            <Ionicons
              name={showServerConfig ? 'chevron-up-outline' : 'chevron-down-outline'}
              size={16}
              color="#475569"
              style={{ marginLeft: 'auto' }}
            />
          </TouchableOpacity>

          {showServerConfig && (
            <View style={styles.serverConfigContent}>
              <Text style={styles.serverConfigLabel}>Backend Server IP Address</Text>
              <View style={styles.ipInputWrapper}>
                <Text style={styles.ipPrefix}>http://</Text>
                <TextInput
                  style={styles.ipInput}
                  placeholder="192.168.0.105"
                  placeholderTextColor="#475569"
                  value={ipAddress}
                  onChangeText={setIpAddress}
                  keyboardType="numeric"
                  autoCapitalize="none"
                />
                <Text style={styles.ipSuffix}>:5000</Text>
              </View>
              <Text style={styles.serverConfigTip}>
                Ensure your phone is connected to the same Wi-Fi network as your PC.
              </Text>
            </View>
          )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#05070d',
  },
  ambientOrbTop: {
    position: 'absolute',
    top: -120,
    right: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: '#0df',
    opacity: 0.08,
  },
  ambientOrbBottom: {
    position: 'absolute',
    bottom: -140,
    left: -90,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: '#3b82f6',
    opacity: 0.07,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 32,
    position: 'relative',
  },
  logoGlow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#0df',
    opacity: 0.18,
    top: -8,
  },
  logoBadge: {
    width: 78,
    height: 78,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 221, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(0, 221, 255, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#0df',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 12,
  },
  logoText: {
    fontSize: 44,
    fontWeight: '900',
    color: '#f8fafc',
    letterSpacing: 8,
    textShadowColor: 'rgba(0, 221, 255, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
  taglineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  taglineDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#0df',
    marginHorizontal: 8,
    opacity: 0.7,
  },
  tagline: {
    fontSize: 12,
    color: '#38bdf8',
    letterSpacing: 1.5,
    fontWeight: '600',
  },
  formContainer: {
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#f8fafc',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 28,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(2, 6, 23, 0.5)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 16,
    paddingHorizontal: 16,
    height: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 16,
    height: '100%',
  },
  eyeIcon: {
    padding: 4,
  },
  button: {
    backgroundColor: '#0df',
    borderRadius: 16,
    height: 60,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    shadowColor: '#0df',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 10,
  },
  buttonText: {
    color: '#090d16',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  redirectContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
    marginBottom: 12,
  },
  redirectText: {
    color: '#64748b',
    fontSize: 14,
  },
  redirectLink: {
    color: '#0df',
    fontWeight: '600',
    fontSize: 14,
  },
  serverConfigHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    marginTop: 16,
  },
  serverConfigHeaderText: {
    color: '#64748b',
    fontSize: 13,
    marginLeft: 8,
    fontWeight: '600',
  },
  serverConfigContent: {
    backgroundColor: 'rgba(2, 6, 23, 0.3)',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  serverConfigLabel: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  ipInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 8,
    height: 40,
  },
  ipPrefix: {
    color: '#475569',
    fontSize: 14,
  },
  ipSuffix: {
    color: '#475569',
    fontSize: 14,
  },
  ipInput: {
    flex: 1,
    color: '#cbd5e1',
    fontSize: 14,
    textAlign: 'center',
    padding: 0,
  },
  serverConfigTip: {
    color: '#475569',
    fontSize: 11,
    marginTop: 6,
    lineHeight: 14,
  },
});
