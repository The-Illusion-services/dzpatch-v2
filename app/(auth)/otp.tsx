import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/ui';

const OTP_LENGTH = 6;
const RESEND_SECONDS = 60;

export default function OtpScreen() {
  const { phone, email } = useLocalSearchParams<{ phone?: string; email?: string }>();
  const { initialize } = useAuthStore();

  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(RESEND_SECONDS);
  const [canResend, setCanResend] = useState(false);

  const inputRefs = useRef<(TextInput | null)[]>([]);

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) {
      setCanResend(true);
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const handleChange = (value: string, index: number) => {
    if (value.length > 1) {
      // Handle paste — fill from this index
      const digits = value.replace(/\D/g, '').slice(0, OTP_LENGTH - index);
      const next = [...otp];
      for (let i = 0; i < digits.length; i++) {
        next[index + i] = digits[i];
      }
      setOtp(next);
      const focusIndex = Math.min(index + digits.length, OTP_LENGTH - 1);
      inputRefs.current[focusIndex]?.focus();
      return;
    }

    if (!/^\d?$/.test(value)) return;
    const next = [...otp];
    next[index] = value;
    setOtp(next);

    if (value && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    const code = otp.join('');
    if (code.length < OTP_LENGTH) {
      setError('Enter all 6 digits');
      return;
    }
    setError('');
    setLoading(true);
    try {
      let result;
      if (phone) {
        result = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' });
      } else if (email) {
        result = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
      } else {
        throw new Error('No phone or email provided');
      }
      if (result.error) throw result.error;

      // Initialize auth store (loads profile, sets role)
      await initialize();
    } catch (err: any) {
      setError(err.message ?? 'Invalid code. Please try again.');
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!canResend) return;
    setCanResend(false);
    setCountdown(RESEND_SECONDS);
    try {
      if (phone) {
        await supabase.auth.signInWithOtp({ phone });
      } else if (email) {
        await supabase.auth.signInWithOtp({ email });
      }
    } catch {
      // Silent fail — timer already reset
    }
  };

  const maskedTarget = phone
    ? phone.replace(/(\+\d{3})\d+(\d{4})/, '$1****$2')
    : email?.replace(/^(.{2})(.*)(@.*)/, '$1****$3') ?? '';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Back button */}
      <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
        <Text style={styles.backArrow}>←</Text>
        <Text style={styles.brand}>Dzpatch</Text>
      </Pressable>

      <View style={styles.content}>
        {/* Headline */}
        <View style={styles.headline}>
          <View style={styles.securityPill}>
            <Text style={styles.securityText}>Security Protocol</Text>
          </View>
          <Text style={styles.title}>{'Verify your\nidentity.'}</Text>
          <Text style={styles.subtitle}>
            We've sent a 6-digit code to{' '}
            <Text style={styles.target}>{maskedTarget}</Text>
          </Text>
        </View>

        {/* OTP grid */}
        <View style={styles.otpGrid}>
          {Array(OTP_LENGTH).fill(null).map((_, i) => (
            <View key={i} style={styles.otpCell}>
              <TextInput
                ref={(r) => { inputRefs.current[i] = r; }}
                style={[styles.otpInput, otp[i] ? styles.otpInputFilled : null, error ? styles.otpInputError : null]}
                value={otp[i]}
                onChangeText={(v) => handleChange(v, i)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
                maxLength={6}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                selectTextOnFocus
              />
              <View style={[styles.otpUnderline, otp[i] ? styles.otpUnderlineFilled : null]} />
            </View>
          ))}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Actions */}
        <Button
          label="Confirm Access"
          onPress={handleVerify}
          loading={loading}
        />

        <View style={styles.resendRow}>
          <View style={styles.timerRow}>
            <Text style={styles.timerLabel}>
              {canResend ? 'Code expired' : `Code expires in `}
              {!canResend && (
                <Text style={styles.timerValue}>
                  {String(Math.floor(countdown / 60)).padStart(2, '0')}:{String(countdown % 60).padStart(2, '0')}
                </Text>
              )}
            </Text>
          </View>
          <Pressable onPress={handleResend} disabled={!canResend} hitSlop={8}>
            <Text style={[styles.resendBtn, !canResend && styles.resendDisabled]}>
              Resend Code
            </Text>
          </Pressable>
        </View>

        {/* Security tip */}
        <View style={styles.tipCard}>
          <View style={styles.tipIcon}>
            <Text style={styles.tipIconText}>ℹ</Text>
          </View>
          <View style={styles.tipText}>
            <Text style={styles.tipTitle}>SECURITY TIP</Text>
            <Text style={styles.tipBody}>
              Dzpatch will never ask for your verification code via call or text. Keep this code private.
            </Text>
          </View>
        </View>
      </View>

      {/* Ambient glows */}
      <View style={[styles.glow, styles.glowBR]} />
      <View style={[styles.glow, styles.glowTL]} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7FAFC',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,13,34,0.05)',
  },
  backArrow: {
    fontSize: 20,
    color: '#0040e0',
    fontWeight: '600',
  },
  brand: {
    fontSize: 22,
    fontWeight: '900',
    color: '#000D22',
    letterSpacing: -0.5,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 48,
    gap: 28,
  },
  headline: {
    gap: 12,
  },
  securityPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#dde1ff',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  securityText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0035be',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  title: {
    fontSize: 40,
    fontWeight: '900',
    color: '#000D22',
    lineHeight: 44,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 17,
    color: '#44474e',
    lineHeight: 26,
    maxWidth: 320,
  },
  target: {
    color: '#000D22',
    fontWeight: '600',
  },
  otpGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  otpCell: {
    flex: 1,
    position: 'relative',
  },
  otpInput: {
    height: 72,
    textAlign: 'center',
    fontSize: 28,
    fontWeight: '700',
    backgroundColor: '#e0e3e5',
    borderRadius: 12,
    color: '#000D22',
    borderWidth: 0,
  },
  otpInputFilled: {
    backgroundColor: '#dde1ff',
    color: '#000D22',
  },
  otpInputError: {
    backgroundColor: '#ffdad6',
  },
  otpUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'transparent',
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  otpUnderlineFilled: {
    backgroundColor: '#0040e0',
  },
  error: {
    fontSize: 13,
    color: '#ba1a1a',
    textAlign: 'center',
    fontWeight: '500',
    marginTop: -8,
  },
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timerLabel: {
    fontSize: 13,
    color: '#44474e',
    fontWeight: '500',
  },
  timerValue: {
    color: '#000D22',
    fontWeight: '700',
  },
  resendBtn: {
    fontSize: 13,
    fontWeight: '700',
    color: '#324768',
  },
  resendDisabled: {
    opacity: 0.4,
  },
  tipCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#F1F4F6',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(196,198,207,0.1)',
  },
  tipIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0a2342',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipIconText: {
    color: '#dde1ff',
    fontWeight: '700',
    fontSize: 14,
  },
  tipText: {
    flex: 1,
    gap: 4,
  },
  tipTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#000D22',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  tipBody: {
    fontSize: 13,
    color: '#44474e',
    lineHeight: 20,
  },
  glow: {
    position: 'absolute',
    width: 384,
    height: 384,
    borderRadius: 192,
    zIndex: -1,
  },
  glowBR: {
    bottom: -160,
    right: -160,
    backgroundColor: 'rgba(0,64,224,0.05)',
  },
  glowTL: {
    top: 80,
    left: -80,
    backgroundColor: 'rgba(0,13,34,0.05)',
  },
});
