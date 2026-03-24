import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { Button, Input } from '@/components/ui';

const OTP_LENGTH = 6;

function PasswordRequirement({ met, label }: { met: boolean; label: string }) {
  return (
    <View style={styles.reqRow}>
      <Text style={[styles.reqDot, met && styles.reqDotMet]}>{met ? '✓' : '○'}</Text>
      <Text style={[styles.reqLabel, met && styles.reqLabelMet]}>{label}</Text>
    </View>
  );
}

export default function ResetPasswordScreen() {
  const { email, phone } = useLocalSearchParams<{ email?: string; phone?: string }>();

  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRefs = useRef<(TextInput | null)[]>([]);

  const hasMinLength = password.length >= 8;
  const hasNumber = /\d/.test(password);
  const hasSymbol = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  const hasCase = /[A-Z]/.test(password) && /[a-z]/.test(password);

  const handleOtpChange = (value: string, index: number) => {
    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').slice(0, OTP_LENGTH - index);
      const next = [...otp];
      for (let i = 0; i < digits.length; i++) next[index + i] = digits[i];
      setOtp(next);
      inputRefs.current[Math.min(index + digits.length, OTP_LENGTH - 1)]?.focus();
      return;
    }
    if (!/^\d?$/.test(value)) return;
    const next = [...otp];
    next[index] = value;
    setOtp(next);
    if (value && index < OTP_LENGTH - 1) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleUpdate = async () => {
    const code = otp.join('');
    if (code.length < OTP_LENGTH) { setError('Enter all 6 digits'); return; }
    if (!hasMinLength) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }

    setError('');
    setLoading(true);
    try {
      // Verify OTP first to get a session
      if (email) {
        const { error: e } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
        if (e) throw e;
      } else if (phone) {
        const { error: e } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' });
        if (e) throw e;
      }
      // Update password
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) throw updateErr;

      router.replace('/(auth)/reset-success');
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const maskedTarget = email
    ? email.replace(/^(.{2})(.*)(@.*)/, '$1****$3')
    : phone?.replace(/(\+\d{3})\d+(\d{4})/, '$1****$2') ?? '';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.brand}>Dzpatch</Text>
        <Text style={styles.headerTag}>Security Center</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <View style={styles.headlineWrap}>
            <Text style={styles.title}>Reset Password</Text>
            <Text style={styles.subtitle}>
              Enter the code sent to{' '}
              <Text style={styles.subtitleTarget}>{maskedTarget}</Text>
              {' '}and set your new credentials.
            </Text>
          </View>

          <View style={styles.card}>
            {/* OTP */}
            <View style={styles.otpSection}>
              <Text style={styles.fieldLabel}>VERIFICATION CODE</Text>
              <View style={styles.otpGrid}>
                {Array(OTP_LENGTH).fill(null).map((_, i) => (
                  <TextInput
                    key={i}
                    ref={(r) => { inputRefs.current[i] = r; }}
                    style={[styles.otpCell, otp[i] ? styles.otpCellFilled : null]}
                    value={otp[i]}
                    onChangeText={(v) => handleOtpChange(v, i)}
                    onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
                    maxLength={6}
                    keyboardType="number-pad"
                    textContentType="oneTimeCode"
                    selectTextOnFocus
                  />
                ))}
              </View>
            </View>

            {/* New password */}
            <Input
              label="NEW PASSWORD"
              value={password}
              onChangeText={setPassword}
              placeholder="Minimum 8 characters"
              secureTextEntry={!showPass}
              rightIcon={
                <Text style={styles.eyeIcon}>{showPass ? '🙈' : '👁'}</Text>
              }
              onRightIconPress={() => setShowPass((v) => !v)}
            />

            {/* Confirm password */}
            <Input
              label="CONFIRM PASSWORD"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Repeat new password"
              secureTextEntry={!showPass}
            />

            {/* Requirements */}
            <View style={styles.requirements}>
              <PasswordRequirement met={hasMinLength} label="8+ Characters" />
              <PasswordRequirement met={hasNumber} label="One Number" />
              <PasswordRequirement met={hasSymbol} label="One Symbol" />
              <PasswordRequirement met={hasCase} label="Case Sensitive" />
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Button label="Update Password" onPress={handleUpdate} loading={loading} />
          </View>

          {/* Secure divider */}
          <View style={styles.secureRow}>
            <View style={styles.divider} />
            <Text style={styles.secureText}>🔒  Secure Transit Protocol</Text>
            <View style={styles.divider} />
          </View>
        </View>
      </ScrollView>

      {/* Decorative circles */}
      <View style={styles.decoCircle1} />
      <View style={styles.decoCircle2} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196,198,207,0.2)',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
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
    flex: 1,
  },
  headerTag: {
    fontSize: 11,
    fontWeight: '600',
    color: '#74777e',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  scroll: {
    flexGrow: 1,
  },
  content: {
    padding: 24,
    gap: 24,
  },
  headlineWrap: {
    gap: 8,
  },
  title: {
    fontSize: 36,
    fontWeight: '900',
    color: '#000D22',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: '#44474e',
    lineHeight: 24,
    fontWeight: '500',
  },
  subtitleTarget: {
    color: '#000D22',
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    gap: 20,
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 32,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(196,198,207,0.1)',
  },
  otpSection: {
    gap: 12,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#324768',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  otpGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  otpCell: {
    flex: 1,
    height: 56,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    backgroundColor: '#e0e3e5',
    borderRadius: 12,
    color: '#000D22',
  },
  otpCellFilled: {
    backgroundColor: '#dde1ff',
  },
  eyeIcon: {
    fontSize: 16,
  },
  requirements: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    backgroundColor: '#F1F4F6',
    borderRadius: 12,
    padding: 16,
  },
  reqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: '48%',
  },
  reqDot: {
    fontSize: 12,
    color: '#c4c6cf',
    fontWeight: '700',
  },
  reqDotMet: {
    color: '#e66100',
  },
  reqLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#44474e',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  reqLabelMet: {
    color: '#181c1e',
  },
  error: {
    fontSize: 13,
    color: '#ba1a1a',
    textAlign: 'center',
    fontWeight: '500',
  },
  secureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    opacity: 0.4,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: '#c4c6cf',
  },
  secureText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#181c1e',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  decoCircle1: {
    position: 'absolute',
    top: -96,
    right: -96,
    width: 384,
    height: 384,
    borderRadius: 192,
    borderWidth: 40,
    borderColor: '#0040e0',
    opacity: 0.03,
    zIndex: -1,
  },
  decoCircle2: {
    position: 'absolute',
    top: '50%',
    right: -192,
    width: 500,
    height: 500,
    borderRadius: 250,
    borderWidth: 1,
    borderColor: '#000D22',
    opacity: 0.03,
    zIndex: -1,
  },
});
