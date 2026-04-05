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
import { useAuthStore } from '@/store/auth.store';
import { Button, Input } from '@/components/ui';

function navigateByRole(role: string | null) {
  switch (role) {
    case 'rider':         router.replace('/(rider)' as any); break;
    default:              router.replace('/(customer)' as any); break;
  }
}

type Mode = 'phone' | 'email';
type EmailAction = 'signin' | 'signup';

export default function LoginScreen() {
  const { initialize } = useAuthStore();
  const [mode, setMode] = useState<Mode>('phone');
  const [emailAction, setEmailAction] = useState<EmailAction>('signin');

  // Phone fields
  const [phone, setPhone] = useState('');

  // Email fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ─── Phone OTP ───────────────────────────────────────────────────────────────

  const handleSendOtp = async () => {
    setError('');
    if (!phone) { setError('Enter your phone number'); return; }

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
      return;
    }

    setLoading(true);
    try {
      const { error: err } = await supabase.auth.signInWithOtp({ phone: formatted });
      if (err) throw err;
      router.push({ pathname: '/(auth)/otp', params: { phone: formatted } });
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Email + Password ─────────────────────────────────────────────────────

  const handleEmailAuth = async () => {
    setError('');
    if (!email) { setError('Enter your email address'); return; }
    if (!password) { setError('Enter your password'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (emailAction === 'signup' && !fullName.trim()) {
      setError('Enter your full name'); return;
    }

    setLoading(true);
    try {
      if (emailAction === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        await initialize();
        navigateByRole(useAuthStore.getState().role);
      } else {
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName.trim(), role: 'customer' } },
        });
        if (err) throw err;
        if (data.session) {
          await initialize();
          navigateByRole(useAuthStore.getState().role);
        } else {
          // Email confirmation required
          router.push({
            pathname: '/(auth)/otp',
            params: { email, isEmailSignup: 'true' },
          });
        }
      }
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

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

        <View style={styles.content}>
          {/* Welcome text */}
          <View style={styles.welcomeText}>
            <Text style={styles.title}>
              {mode === 'email' && emailAction === 'signup' ? 'Create account' : 'Welcome back'}
            </Text>
            <Text style={styles.subtitle}>
              {mode === 'email' && emailAction === 'signup'
                ? 'Sign up to start sending packages'
                : 'Sign in to your account to continue'}
            </Text>
          </View>

          {/* Mode toggle: Phone / Email */}
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

          {/* ── Phone mode ── */}
          {mode === 'phone' && (
            <>
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

              <Button
                label="Send Verification Code"
                onPress={handleSendOtp}
                loading={loading}
                style={styles.cta}
              />

              <Pressable onPress={() => router.push('/forgot-password' as any)} hitSlop={8}>
                <Text style={styles.forgotText}>Forgot password?</Text>
              </Pressable>

              <Text style={styles.newUserNote}>
                New to DZPATCH?{' '}
                <Text style={styles.newUserLink}>
                  Just enter your number — we&apos;ll create your account automatically.
                </Text>
              </Text>
            </>
          )}

          {/* ── Email mode ── */}
          {mode === 'email' && (
            <>
              {/* Sign In / Sign Up sub-toggle */}
              <View style={styles.actionRow}>
                <Pressable
                  style={[styles.actionBtn, emailAction === 'signin' && styles.actionBtnActive]}
                  onPress={() => { setEmailAction('signin'); setError(''); }}
                >
                  <Text style={[styles.actionBtnText, emailAction === 'signin' && styles.actionBtnTextActive]}>
                    Sign In
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, emailAction === 'signup' && styles.actionBtnActive]}
                  onPress={() => { setEmailAction('signup'); setError(''); }}
                >
                  <Text style={[styles.actionBtnText, emailAction === 'signup' && styles.actionBtnTextActive]}>
                    Create Account
                  </Text>
                </Pressable>
              </View>

              {emailAction === 'signup' && (
                <Input
                  label="FULL NAME"
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="John Doe"
                  autoCapitalize="words"
                  autoComplete="name"
                />
              )}

              <Input
                label="EMAIL ADDRESS"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />

              <Input
                label="PASSWORD"
                value={password}
                onChangeText={setPassword}
                placeholder={emailAction === 'signup' ? 'Min. 6 characters' : '••••••••'}
                secureTextEntry
                autoComplete={emailAction === 'signup' ? 'new-password' : 'current-password'}
                error={error}
              />

              <Button
                label={emailAction === 'signin' ? 'Sign In' : 'Create Account'}
                onPress={handleEmailAuth}
                loading={loading}
                style={styles.cta}
              />

              {emailAction === 'signin' && (
                <Pressable onPress={() => router.push('/forgot-password' as any)} hitSlop={8}>
                  <Text style={styles.forgotText}>Forgot password?</Text>
                </Pressable>
              )}
            </>
          )}
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
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#F1F4F6',
    borderRadius: 12,
    padding: 4,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 9,
    alignItems: 'center',
  },
  actionBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#74777e',
  },
  actionBtnTextActive: {
    color: '#0040e0',
    fontWeight: '700',
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
    marginTop: 4,
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
