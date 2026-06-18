import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Animated, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '../../context/AppContext';
import { Ionicons } from '@expo/vector-icons';
import { showNeonAlert } from '../../components/NeonAlert';

export default function RegisterScreen() {
  const { register, serverUrl } = useApp();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  // ── 3D dynamic intro animations ──
  const logoFlip = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.5)).current;
  const formOpacity = useRef(new Animated.Value(0)).current;
  const formSlide = useRef(new Animated.Value(40)).current;
  const glow = useRef(new Animated.Value(0.4)).current;
  const floatY = useRef(new Animated.Value(0)).current;
  const orbitSpin = useRef(new Animated.Value(0)).current;   // continuous ring orbit

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(logoFlip, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(logoScale, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(formOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(formSlide, { toValue: 0, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.4, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, { toValue: -10, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(floatY, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
    // Continuous orbit rotation of the ring around the planet
    Animated.loop(
      Animated.timing(orbitSpin, { toValue: 1, duration: 6000, easing: Easing.linear, useNativeDriver: true })
    ).start();
  }, []);

  const ringRotate = orbitSpin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

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
    const result = await register(username.trim().toLowerCase(), email.trim().toLowerCase(), password, serverUrl);
    setSubmitting(false);

    if (result.success && result.needsVerification) {
      router.push({ pathname: '/(auth)/verify' as any, params: { email: result.email || email.trim().toLowerCase() } });
    } else if (result.needsVerification && result.email) {
      router.push({ pathname: '/(auth)/verify' as any, params: { email: result.email } });
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View pointerEvents="none" style={styles.ambientOrbTop} />
      <View pointerEvents="none" style={styles.ambientOrbBottom} />

      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        {/* Animated Cosmic Orbit Logo */}
        <View style={styles.logoContainer}>
          <Animated.View style={[styles.logoGlow, { opacity: glow, transform: [{ scale: glow.interpolate({ inputRange: [0.4, 1], outputRange: [0.9, 1.3] }) }] }]} />
          <Animated.View
            style={[
              styles.orbitWrap,
              { transform: [{ translateY: floatY }, { scale: logoScale }] },
            ]}
          >
            {/* Spinning elliptical orbit ring */}
            <Animated.View
              style={[
                styles.orbitRing,
                { transform: [{ perspective: 600 }, { rotateX: '68deg' }, { rotateZ: ringRotate }] },
              ]}
            />
            {/* Planet core */}
            <View style={styles.planet}>
              <View style={styles.planetHighlight} />
            </View>
          </Animated.View>
          <Animated.Text style={[styles.logoText, { opacity: logoFlip, transform: [{ scale: logoScale }] }]}>NOVA</Animated.Text>
          <View style={styles.taglineRow}>
            <View style={styles.taglineDot} />
            <Text style={styles.tagline}>Connected · Secure · Boundless</Text>
            <View style={styles.taglineDot} />
          </View>
        </View>

        {/* Form Container (slides/fades in) */}
        <Animated.View style={{ opacity: formOpacity, transform: [{ translateY: formSlide }] }}>
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

          {/* Submit Button */}
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

          {/* Premium security footer */}
          <View style={styles.secureFooter}>
            <Ionicons name="lock-closed" size={12} color="#334155" />
            <Text style={styles.secureFooterText}>Encrypted & private by design</Text>
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#05070d' },
  ambientOrbTop: { position: 'absolute', top: -120, right: -80, width: 280, height: 280, borderRadius: 140, backgroundColor: '#0df', opacity: 0.08 },
  ambientOrbBottom: { position: 'absolute', bottom: -140, left: -90, width: 300, height: 300, borderRadius: 150, backgroundColor: '#3b82f6', opacity: 0.07 },
  scrollContainer: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logoContainer: { alignItems: 'center', marginBottom: 32, position: 'relative' },
  logoGlow: { position: 'absolute', width: 130, height: 130, borderRadius: 65, backgroundColor: '#0df', opacity: 0.18, top: -6 },
  orbitWrap: {
    width: 110, height: 110,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 18,
  },
  orbitRing: {
    position: 'absolute',
    width: 104, height: 104, borderRadius: 52,
    borderWidth: 4, borderColor: '#0df',
    backgroundColor: 'transparent',
    shadowColor: '#0df', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 8,
  },
  planet: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: '#22d3ee',
    justifyContent: 'flex-start', alignItems: 'flex-start',
    overflow: 'hidden',
    shadowColor: '#0df', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 18, elevation: 14,
  },
  planetHighlight: {
    width: 30, height: 30, borderRadius: 18,
    backgroundColor: '#aef6ff',
    marginTop: 6, marginLeft: 8,
    opacity: 0.85,
  },
  logoText: {
    fontSize: 44, fontWeight: '900', color: '#f8fafc', letterSpacing: 8,
    textShadowColor: 'rgba(0, 221, 255, 0.5)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 18,
  },
  taglineRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  taglineDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#0df', marginHorizontal: 8, opacity: 0.7 },
  tagline: { fontSize: 12, color: '#38bdf8', letterSpacing: 1.5, fontWeight: '600' },
  secureFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  secureFooterText: { color: '#334155', fontSize: 11, fontWeight: '600', marginLeft: 6, letterSpacing: 0.5 },
  formContainer: { backgroundColor: 'rgba(15, 23, 42, 0.65)', borderRadius: 24, padding: 24, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.05)' },
  welcomeText: { fontSize: 24, fontWeight: '700', color: '#f8fafc', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#64748b', textAlign: 'center', marginTop: 6, marginBottom: 28 },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(2, 6, 23, 0.5)',
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 16, paddingHorizontal: 16, height: 56,
  },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, color: '#f8fafc', fontSize: 16, height: '100%' },
  eyeIcon: { padding: 4 },
  button: {
    backgroundColor: '#0df', borderRadius: 16, height: 60, width: '100%',
    justifyContent: 'center', alignItems: 'center', marginTop: 24,
    shadowColor: '#0df', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 10,
  },
  buttonText: { color: '#090d16', fontSize: 17, fontWeight: '800', letterSpacing: 1.5 },
  redirectContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: 20, marginBottom: 12 },
  redirectText: { color: '#64748b', fontSize: 14 },
  redirectLink: { color: '#0df', fontWeight: '600', fontSize: 14 },
});
