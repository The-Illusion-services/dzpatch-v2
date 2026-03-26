import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { Button, Input } from '@/components/ui';

export default function ForgotPasswordScreen() {
  const [identifier, setIdentifier] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSend = async () => {
    if (!identifier.trim()) {
      setError('Enter your email or phone number');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const isEmail = identifier.includes('@');
      if (isEmail) {
        const { error: err } = await supabase.auth.resetPasswordForEmail(identifier.trim());
        if (err) throw err;
        router.push({
          pathname: '/(auth)/reset-password',
          params: { email: identifier.trim() },
        });
      } else {
        // Phone — send OTP then redirect to reset-password with OTP entry
        const digits = identifier.replace(/\D/g, '');
        const formatted = digits.startsWith('234')
          ? `+${digits}`
          : digits.startsWith('0')
          ? `+234${digits.slice(1)}`
          : `+234${digits}`;
        const { error: err } = await supabase.auth.signInWithOtp({ phone: formatted });
        if (err) throw err;
        router.push({
          pathname: '/(auth)/reset-password',
          params: { phone: formatted },
        });
      }
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

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
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          {/* Icon */}
          <View style={styles.iconWrap}>
            <Text style={styles.iconEmoji}>🔑</Text>
          </View>

          {/* Text */}
          <View style={styles.headlineWrap}>
            <Text style={styles.title}>Forgot password?</Text>
            <Text style={styles.subtitle}>
              No worries. Enter your registered email or phone number and we&apos;ll send you a reset link.
            </Text>
          </View>

          {/* Card */}
          <View style={styles.card}>
            <Input
              label="EMAIL OR PHONE NUMBER"
              value={identifier}
              onChangeText={setIdentifier}
              placeholder="name@company.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              error={error}
            />

            <Button
              label="Send Reset Link"
              onPress={handleSend}
              loading={loading}
              style={styles.cta}
            />

            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Text style={styles.backToLogin}>
                Remembered it?{' '}
                <Text style={styles.backToLoginLink}>Back to Login</Text>
              </Text>
            </Pressable>
          </View>

          {/* Trust badge */}
          <View style={styles.trustBadge}>
            <Text style={styles.trustText}>✓  Secure AES-256 Encryption</Text>
          </View>
        </View>
      </ScrollView>

      {/* Background glow */}
      <View style={styles.bgGlow} />
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
  },
  scroll: {
    flexGrow: 1,
  },
  content: {
    padding: 24,
    gap: 28,
    alignItems: 'center',
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F1F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  iconEmoji: {
    fontSize: 28,
  },
  headlineWrap: {
    gap: 12,
    alignItems: 'center',
  },
  title: {
    fontSize: 36,
    fontWeight: '900',
    color: '#181c1e',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#44474e',
    lineHeight: 26,
    textAlign: 'center',
    maxWidth: 320,
  },
  card: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    gap: 20,
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 24,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(196,198,207,0.1)',
  },
  cta: {
    marginTop: 4,
  },
  backToLogin: {
    fontSize: 13,
    color: '#44474e',
    textAlign: 'center',
  },
  backToLoginLink: {
    color: '#0040e0',
    fontWeight: '600',
  },
  trustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E5E9EB',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(196,198,207,0.1)',
  },
  trustText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#44474e',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  bgGlow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '33%',
    backgroundColor: 'rgba(0,64,224,0.03)',
    zIndex: -1,
  },
});
