import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useRiderSignupStore } from '@/store/rider-signup.store';
import { Spacing, Typography } from '@/constants/theme';

const OTP_LENGTH = 6;
const TOTAL_STEPS = 5;
const RESEND_COOLDOWN = 60;

export default function SignupOtpScreen() {
  const insets = useSafeAreaInsets();
  const { phone, setPhoneVerified } = useRiderSignupStore();

  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(RESEND_COOLDOWN);
  const [otpSent, setOtpSent] = useState(false);

  const inputRefs = useRef<(TextInput | null)[]>([]);

  // Send OTP on mount
  useEffect(() => {
    sendOtp();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!otpSent) return;
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [otpSent, countdown]);

  const sendOtp = async () => {
    if (!phone) {
      Alert.alert('Error', 'Phone number missing. Go back and fill in your details.');
      return;
    }
    try {
      const { error: e } = await supabase.auth.signInWithOtp({ phone });
      if (e) throw e;
      setOtpSent(true);
      setCountdown(RESEND_COOLDOWN);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to send OTP');
    }
  };

  const handleChange = (text: string, idx: number) => {
    const digit = text.replace(/\D/g, '').slice(-1);
    const next = [...otp];
    next[idx] = digit;
    setOtp(next);
    setError('');
    if (digit && idx < OTP_LENGTH - 1) {
      inputRefs.current[idx + 1]?.focus();
    }
    if (next.every(Boolean)) {
      verifyOtp(next.join(''));
    }
  };

  const handleKeyPress = (key: string, idx: number) => {
    if (key === 'Backspace' && !otp[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
      const next = [...otp];
      next[idx - 1] = '';
      setOtp(next);
    }
  };

  const verifyOtp = async (code: string) => {
    setLoading(true);
    setError('');
    try {
      const { error: e } = await supabase.auth.verifyOtp({
        phone,
        token: code,
        type: 'sms',
      });
      if (e) throw e;
      setPhoneVerified(true);
      router.push('/(rider-auth)/signup-vehicle' as any);
    } catch {
      setError('Invalid code. Please try again.');
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={20} color="#0040e0" />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Verify Your Phone</Text>
          <Text style={styles.headerStep}>Step 1.5 of {TOTAL_STEPS}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Progress bar */}
      <View style={progressStyles.track}>
        <View style={[progressStyles.fill, { width: '25%' }]} />
      </View>

      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="phone-portrait-outline" size={32} color="#0040e0" />
        </View>

        <Text style={styles.headline}>Enter the 6-digit code</Text>
        <Text style={styles.subtitle}>
          We sent a code to{'\n'}
          <Text style={styles.phoneText}>{phone}</Text>
        </Text>

        {/* OTP inputs */}
        <View style={styles.otpRow}>
          {otp.map((digit, i) => (
            <TextInput
              key={i}
              ref={(r) => { inputRefs.current[i] = r; }}
              style={[
                styles.otpInput,
                digit ? styles.otpInputFilled : null,
                error ? styles.otpInputError : null,
              ]}
              value={digit}
              onChangeText={(t) => handleChange(t, i)}
              onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
              keyboardType="number-pad"
              maxLength={1}
              selectTextOnFocus
              editable={!loading}
            />
          ))}
        </View>

        {!!error && <Text style={styles.errorText}>{error}</Text>}

        {/* Resend */}
        <View style={styles.resendRow}>
          {countdown > 0 ? (
            <Text style={styles.cooldownText}>
              Resend in <Text style={styles.cooldownCount}>{countdown}s</Text>
            </Text>
          ) : (
            <Pressable onPress={sendOtp} hitSlop={8}>
              <Text style={styles.resendText}>Resend code</Text>
            </Pressable>
          )}
        </View>

        {/* Security note */}
        <View style={styles.securityRow}>
          <Ionicons name="shield-checkmark" size={13} color="#0040e0" />
          <Text style={styles.securityText}>Secure AES-256 Encryption</Text>
        </View>
      </View>

      {/* Manual verify if user can't wait for auto-verify */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          style={[styles.verifyBtn, loading && styles.verifyBtnDisabled]}
          onPress={() => {
            const code = otp.join('');
            if (code.length < OTP_LENGTH) { setError('Enter all 6 digits'); return; }
            verifyOtp(code);
          }}
          disabled={loading}
        >
          <Text style={styles.verifyBtnText}>{loading ? 'Verifying...' : 'Verify'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const progressStyles = StyleSheet.create({
  track: {
    height: 4, backgroundColor: '#E5E7EB',
    marginHorizontal: Spacing[5], borderRadius: 2, overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: '#0040e0', borderRadius: 2 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing[5], paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: 'rgba(196,198,207,0.2)',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center', gap: 2 },
  headerTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: '#000D22' },
  headerStep: { fontSize: Typography.xs, color: '#74777e' },

  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing[5],
    paddingTop: 48,
    gap: 16,
  },
  iconWrap: {
    width: 72, height: 72, borderRadius: 22,
    backgroundColor: '#EEF2FF',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
  headline: {
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
    color: '#000D22',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: Typography.sm,
    color: '#44474e',
    textAlign: 'center',
    lineHeight: 22,
  },
  phoneText: { fontWeight: Typography.bold, color: '#000D22' },

  otpRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  otpInput: {
    width: 48, height: 56,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '800',
    color: '#000D22',
  },
  otpInputFilled: { borderColor: '#0040e0', backgroundColor: '#EEF2FF' },
  otpInputError: { borderColor: '#ba1a1a' },

  errorText: { fontSize: Typography.sm, color: '#ba1a1a', textAlign: 'center' },

  resendRow: { marginTop: 4 },
  cooldownText: { fontSize: Typography.sm, color: '#74777e' },
  cooldownCount: { fontWeight: Typography.bold, color: '#000D22' },
  resendText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: '#0040e0' },

  securityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8,
  },
  securityText: { fontSize: 12, color: '#9ea2ac' },

  footer: {
    paddingHorizontal: Spacing[5], paddingTop: 12,
    backgroundColor: '#F7FAFC',
    borderTopWidth: 1, borderTopColor: '#F1F4F6',
  },
  verifyBtn: {
    height: 54, backgroundColor: '#0040e0',
    borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  verifyBtnDisabled: { opacity: 0.6 },
  verifyBtnText: { fontSize: Typography.md, fontWeight: Typography.bold, color: '#FFFFFF' },
});
