import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Animated, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '../../context/AppContext';
import { Ionicons } from '@expo/vector-icons';
import { showNeonAlert } from '../../components/NeonAlert';

export default function LoginScreen() {
  const { login, serverUrl } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  // ── 3D dynamic intro animations ──
  const logoFlip = useRef(new Animated.Value(0)).current;   // 0 -> 1 (rotateY 90deg -> 0)
  const logoScale = useRef(new Animated.Value(0.5)).current;
  const formOpacity = useRef(new Animated.Value(0)).current;
  const formSlide = useRef(new Animated.Value(40)).current;
  const glow = useRef(new Animated.Value(0.4)).current;     // pulsing glow
  const floatY = useRef(new Animated.Value(0)).current;     // gentle float
  const spin = useRef(new Animated.Value(0)).current;       // subtle continuous 3D sway

  useEffect(() => {
    // Entrance: logo flips in 3D + scales up, then the form slides up & fades in
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

    // Continuous: pulsing glow, gentle float, subtle 3D sway → "dynamic" feel
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
    Animated.loop(
      Animated.sequence([
        Animated.timing(spin, { toValue: 1, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(spin, { toValue: -1, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(spin, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const flipDeg = logoFlip.interpolate({ inputRange: [0, 1], outputRange: ['90deg', '0deg'] });
  const swayDeg = spin.interpolate({ inputRange: [-1, 1], outputRange: ['-12deg', '12deg'] });

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      showNeonAlert({ title: 'Missing Fields', message: 'Please enter your username and password to log in.', icon: 'alert-circle-outline', borderColor: '#f59e0b', iconColor: '#f59e0b' });
      return;
    }
    setSubmitting(true);
    const success = await login(username.trim(), password, serverUrl);
    setSubmitting(false);

    if (success === true) {
      router.replace('/(tabs)');
    } else if (success && typeof success === 'object' && success.needsVerification) {
      showNeonAlert({ title: 'VERIFY EMAIL', message: 'Your account is not verified yet. Enter the code sent to your email.', icon: 'mail-outline', borderColor: '#f59e0b', iconColor: '#f59e0b' });
      router.push({ pathname: '/(auth)/verify' as any, params: { email: success.email || '' } });
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
        {/* Animated 3D Logo and Branding */}
        <View style={styles.logoContainer}>
          <Animated.View style={[styles.logoGlow, { opacity: glow, transform: [{ scale: glow.interpolate({ inputRange: [0.4, 1], outputRange: [0.9, 1.25] }) }] }]} />
          <Animated.View
            style={[
              styles.logoBadge,
              {
                transform: [
                  { perspective: 800 },
                  { translateY: floatY },
                  { rotateY: flipDeg },
                  { rotateZ: swayDeg },
                  { scale: logoScale },
                ],
              },
            ]}
          >
            <Ionicons name="triangle" size={38} color="#0df" />
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
            <Text style={styles.welcomeText}>Welcome Back</Text>
            <Text style={styles.subtitle}>Sign in to continue chatting</Text>

            {/* Username Input */}
            <View style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={20} color="#64748b" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Username"
                placeholderTextColor="#475569"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
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

            {/* Forgot Password link */}
            <TouchableOpacity style={styles.forgotWrapper} onPress={() => router.push('/(auth)/forgot' as any)}>
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </TouchableOpacity>
          </View>

          {/* Submit Button */}
          <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={submitting}>
            {submitting ? (
              <ActivityIndicator color="#090d16" />
            ) : (
              <Text style={styles.buttonText}>Log In</Text>
            )}
          </TouchableOpacity>

          {/* Redirect to Signup */}
          <View style={styles.redirectContainer}>
            <Text style={styles.redirectText}>New to Nova? </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
              <Text style={styles.redirectLink}>Create Account</Text>
            </TouchableOpacity>
          </View>

          {/* Premium security footer */}
          <View style={styles.secureFooter}>
            <Ionicons name="lock-closed" size={12} color="#334155" />
            <Text style={styles.secureFooterText}>End-to-end encrypted · Private by design</Text>
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
  logoContainer: { alignItems: 'center', marginBottom: 36, position: 'relative' },
  logoGlow: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: '#0df', opacity: 0.18, top: -8 },
  logoBadge: {
    width: 78, height: 78, borderRadius: 22,
    backgroundColor: 'rgba(0, 221, 255, 0.06)',
    borderWidth: 1, borderColor: 'rgba(0, 221, 255, 0.35)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
    shadowColor: '#0df', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 20, elevation: 12,
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
  forgotWrapper: { alignSelf: 'flex-end', marginTop: 2 },
  forgotText: { color: '#38bdf8', fontSize: 13, fontWeight: '600' },
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
