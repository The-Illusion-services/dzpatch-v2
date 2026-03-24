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

type Mode = 'phone' | 'email';

export default function LoginScreen() {
  const [mode, setMode] = useState<Mode>('phone');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSendOtp = async () => {
    setError('');
    if (mode === 'phone' && !phone) {
      setError('Enter your phone number');
      return;
    }
    if (mode === 'email' && !email) {
      setError('Enter your email address');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'phone') {
        // Strip all non-digits, then build E.164
        const digits = phone.replace(/\D/g, '');
        let formatted: string;
        if (digits.startsWith('234')) {
          formatted = `+${digits}`;
        } else if (digits.startsWith('0')) {
          formatted = `+234${digits.slice(1)}`;
        } else {
          formatted = `+234${digits}`;
        }
        if (formatted.length < 13 || formatted.length > 14) {
          setError('Enter a valid Nigerian phone number (e.g. 08012345678)');
          setLoading(false);
          return;
        }
        const { error: err } = await supabase.auth.signInWithOtp({ phone: formatted });
        if (err) throw err;
        router.push({ pathname: '/(auth)/otp', params: { phone: formatted } });
      } else {
        const { error: err } = await supabase.auth.signInWithOtp({ email });
        if (err) throw err;
        router.push({ pathname: '/(auth)/otp', params: { email } });
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
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.brand}>DZPATCH</Text>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {/* Welcome text */}
          <View style={styles.welcomeText}>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Sign in to your account to continue</Text>
          </View>

          {/* Mode toggle */}
          <View style={styles.modeRow}>
            <Pressable
              style={[styles.modeBtn, mode === 'phone' && styles.modeBtnActive]}
              onPress={() => { setMode('phone'); setError(''); }}
            >
              <Text style={[styles.modeBtnText, mode === 'phone' && styles.modeBtnTextActive]}>
                Phone
              </Text>
            </Pressable>
            <Pressable
              style={[styles.modeBtn, mode === 'email' && styles.modeBtnActive]}
              onPress={() => { setMode('email'); setError(''); }}
            >
              <Text style={[styles.modeBtnText, mode === 'email' && styles.modeBtnTextActive]}>
                Email
              </Text>
            </Pressable>
          </View>

          {/* Input */}
          {mode === 'phone' ? (
            <View>
              <Text style={styles.inputLabel}>PHONE NUMBER</Text>
              <View style={styles.phoneRow}>
                <View style={styles.countryCode}>
                  <Text style={styles.countryCodeText}>🇳🇬 +234</Text>
                </View>
                <Input
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="0801 234 5678"
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  error={error}
                  containerStyle={styles.phoneInput}
                />
              </View>
            </View>
          ) : (
            <Input
              label="EMAIL ADDRESS"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              error={error}
            />
          )}

          {/* CTA */}
          <Button
            label="Send Verification Code"
            onPress={handleSendOtp}
            loading={loading}
            style={styles.cta}
          />

          {/* Forgot password */}
          <Pressable onPress={() => router.push('/forgot-password' as any)} hitSlop={8}>
            <Text style={styles.forgotText}>Forgot password?</Text>
          </Pressable>

          {/* New user note */}
          <Text style={styles.newUserNote}>
            New to DZPATCH?{' '}
            <Text style={styles.newUserLink}>
              Just enter your number — we'll create your account automatically.
            </Text>
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FCFDFE',
  },
  scroll: {
    flexGrow: 1,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: 'rgba(252,253,254,0.85)',
  },
  brand: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0A2342',
    letterSpacing: 2,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 48,
    gap: 24,
  },
  welcomeText: {
    gap: 8,
  },
  title: {
    fontSize: 36,
    fontWeight: '900',
    color: '#0A2342',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: '#44474e',
    fontWeight: '500',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
  },
  modeBtnActive: {
    borderColor: '#0040e0',
    backgroundColor: '#EFF6FF',
  },
  modeBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#44474e',
  },
  modeBtnTextActive: {
    color: '#0040e0',
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(10,35,66,0.6)',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 4,
  },
  phoneRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  countryCode: {
    height: 52,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countryCodeText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0A2342',
  },
  phoneInput: {
    flex: 1,
  },
  cta: {
    marginTop: 8,
  },
  newUserNote: {
    fontSize: 13,
    color: '#44474e',
    textAlign: 'center',
    lineHeight: 20,
  },
  newUserLink: {
    color: '#0040e0',
    fontWeight: '700',
  },
  forgotText: {
    fontSize: 13,
    color: '#0040e0',
    fontWeight: '600',
    textAlign: 'center',
  },
});
