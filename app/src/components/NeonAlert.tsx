import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

export interface NeonAlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

export interface NeonAlertConfig {
  title: string;
  message?: string;
  buttons?: NeonAlertButton[];
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  borderColor?: string;
}

interface NeonAlertProps {
  visible: boolean;
  config: NeonAlertConfig | null;
  onDismiss: () => void;
}

const NeonAlert: React.FC<NeonAlertProps> = ({ visible, config, onDismiss }) => {
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 80,
          friction: 8,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
          easing: Easing.out(Easing.ease),
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0.85);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  if (!visible || !config) return null;

  const borderColor = config.borderColor || '#0df';
  const iconColor = config.iconColor || borderColor;
  const icon = config.icon || 'information-circle-outline';

  const buttons = config.buttons && config.buttons.length > 0
    ? config.buttons
    : [{ text: 'OK', style: 'default' as const }];

  const handlePress = (btn: NeonAlertButton) => {
    onDismiss();
    if (btn.onPress) {
      // Small delay so dismiss animation starts first
      setTimeout(() => btn.onPress!(), 100);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.container,
            {
              borderColor: borderColor,
              shadowColor: borderColor,
              transform: [{ scale: scaleAnim }],
              opacity: opacityAnim,
            },
          ]}
        >
          {/* Glow accent line at top */}
          <View style={[styles.glowLine, { backgroundColor: borderColor }]} />

          {/* Icon */}
          <View style={[styles.iconCircle, { borderColor: borderColor }]}>
            <Ionicons name={icon} size={28} color={iconColor} />
          </View>

          {/* Title */}
          <Text style={styles.title}>{config.title}</Text>

          {/* Message */}
          {config.message ? (
            <Text style={styles.message}>{config.message}</Text>
          ) : null}

          {/* Buttons */}
          <View style={[styles.buttonsRow, buttons.length > 2 && styles.buttonsColumn]}>
            {buttons.map((btn, idx) => {
              const isDestructive = btn.style === 'destructive';
              const isCancel = btn.style === 'cancel';
              const btnBorderColor = isDestructive ? '#ef4444' : isCancel ? '#475569' : borderColor;
              const btnTextColor = isDestructive ? '#ef4444' : isCancel ? '#94a3b8' : borderColor;
              const btnBg = isDestructive
                ? 'rgba(239, 68, 68, 0.08)'
                : isCancel
                ? 'rgba(71, 85, 105, 0.08)'
                : `rgba(0, 221, 255, 0.08)`;

              const isColumn = buttons.length > 2;

              return (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.button,
                    {
                      borderColor: btnBorderColor,
                      backgroundColor: btnBg,
                      width: isColumn ? '100%' : undefined,
                      flex: (!isColumn && buttons.length > 1) ? 1 : undefined,
                      marginLeft: (!isColumn && idx > 0) ? 10 : 0,
                      marginTop: (isColumn && idx > 0) ? 10 : 0,
                    },
                  ]}
                  onPress={() => handlePress(btn)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      { color: btnTextColor },
                      isDestructive && { fontWeight: '900' },
                    ]}
                    numberOfLines={1}
                  >
                    {btn.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

export default NeonAlert;

// ──────────────────────────────────────────────────
// Global imperative API so you can call:
//   showNeonAlert({ title: '...', message: '...' })
// from anywhere (like Alert.alert) without prop threading.
// ──────────────────────────────────────────────────

let _globalShow: ((cfg: NeonAlertConfig) => void) | null = null;

export function registerNeonAlert(showFn: (cfg: NeonAlertConfig) => void) {
  _globalShow = showFn;
}

/**
 * Drop-in replacement for `Alert.alert(title, message, buttons)`.
 * Usage: `showNeonAlert({ title, message, buttons, icon, iconColor, borderColor })`
 */
export function showNeonAlert(config: NeonAlertConfig) {
  if (_globalShow) {
    _globalShow(config);
  } else {
    // Fallback: use native alert if NeonAlert host not mounted yet
    const { Alert } = require('react-native');
    Alert.alert(
      config.title,
      config.message,
      config.buttons?.map((b) => ({ text: b.text, onPress: b.onPress, style: b.style }))
    );
  }
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(9, 13, 22, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    width: width * 0.82,
    backgroundColor: '#0f172a',
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 24,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 12,
  },
  glowLine: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
    height: 2,
    borderRadius: 1,
    opacity: 0.7,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    marginBottom: 14,
  },
  title: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '800',
    fontFamily: 'monospace',
    letterSpacing: 0.8,
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    color: '#94a3b8',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  buttonsRow: {
    flexDirection: 'row',
    width: '100%',
  },
  buttonsColumn: {
    flexDirection: 'column',
    width: '100%',
  },
  button: {
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  buttonText: {
    fontWeight: '700',
    fontFamily: 'monospace',
    fontSize: 12,
    letterSpacing: 0.5,
  },
});
