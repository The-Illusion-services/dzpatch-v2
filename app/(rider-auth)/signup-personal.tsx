import { router } from 'expo-router';
import { useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRiderSignupStore } from '@/store/rider-signup.store';
import { Spacing, Typography } from '@/constants/theme';

const TOTAL_STEPS = 5;

export default function SignupPersonalScreen() {
  const insets = useSafeAreaInsets();
  const { fullName, email, phone, setPersonal } = useRiderSignupStore();

  const [name, setName] = useState(fullName);
  const [emailVal, setEmailVal] = useState(email);
  const [phoneVal, setPhoneVal] = useState(phone);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Full name is required';
    if (!phoneVal.trim()) e.phone = 'Phone number is required';
    else if (!/^\+?[0-9]{10,14}$/.test(phoneVal.replace(/\s/g, '')))
      e.phone = 'Enter a valid phone number';
    if (emailVal && !/\S+@\S+\.\S+/.test(emailVal))
      e.email = 'Enter a valid email';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => {
    if (!validate()) return;
    setPersonal({ fullName: name.trim(), email: emailVal.trim(), phone: phoneVal.trim() });
    router.push('/(rider-auth)/signup-otp' as any);
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
          <Text style={styles.headerTitle}>Create Your Profile</Text>
          <Text style={styles.headerStep}>Step 1 of {TOTAL_STEPS}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Progress bar */}
      <ProgressBar step={1} total={TOTAL_STEPS} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>
          Join the Dzpatch network and start earning today.
        </Text>

        <View style={styles.form}>
          <Field
            label="FULL NAME"
            placeholder="e.g. Emeka Okafor"
            value={name}
            onChangeText={setName}
            error={errors.name}
            autoCapitalize="words"
          />
          <Field
            label="PHONE NUMBER"
            placeholder="+234 800 000 0000"
            value={phoneVal}
            onChangeText={setPhoneVal}
            error={errors.phone}
            keyboardType="phone-pad"
          />
          <Field
            label="EMAIL (OPTIONAL)"
            placeholder="emeka@example.com"
            value={emailVal}
            onChangeText={setEmailVal}
            error={errors.email}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        {/* Trust row */}
        <View style={styles.trustRow}>
          <Ionicons name="lock-closed" size={13} color="#9ea2ac" />
          <Text style={styles.trustText}>
            Your information is encrypted and never shared.
          </Text>
        </View>
      </ScrollView>

      {/* CTA */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable style={styles.nextBtn} onPress={handleNext}>
          <Text style={styles.nextBtnText}>Continue</Text>
          <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  placeholder,
  value,
  onChangeText,
  error,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  error?: string;
  keyboardType?: any;
  autoCapitalize?: any;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={fieldStyles.wrap}>
      <Text style={fieldStyles.label}>{label}</Text>
      <View
        style={[
          fieldStyles.inputWrap,
          focused && fieldStyles.inputFocused,
          !!error && fieldStyles.inputError,
        ]}
      >
        <TextInput
          style={fieldStyles.input}
          placeholder={placeholder}
          placeholderTextColor="#9ea2ac"
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
        />
      </View>
      {!!error && <Text style={fieldStyles.error}>{error}</Text>}
    </View>
  );
}

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <View style={progressStyles.track}>
      <View style={[progressStyles.fill, { width: `${(step / total) * 100}%` }]} />
    </View>
  );
}

const progressStyles = StyleSheet.create({
  track: {
    height: 4,
    backgroundColor: '#E5E7EB',
    marginHorizontal: Spacing[5],
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: '#0040e0',
    borderRadius: 2,
  },
});

const fieldStyles = StyleSheet.create({
  wrap: { gap: 6 },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: '#324768',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  inputWrap: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    paddingHorizontal: 16,
  },
  inputFocused: { borderColor: '#0040e0' },
  inputError: { borderColor: '#ba1a1a' },
  input: {
    height: 50,
    fontSize: 15,
    color: '#000D22',
  },
  error: {
    fontSize: 12,
    color: '#ba1a1a',
    marginTop: 2,
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[5],
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196,198,207,0.2)',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center', gap: 2 },
  headerTitle: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: '#000D22',
  },
  headerStep: {
    fontSize: Typography.xs,
    color: '#74777e',
  },
  scroll: {
    paddingHorizontal: Spacing[5],
    paddingTop: 24,
    paddingBottom: 20,
    gap: 20,
  },
  subtitle: {
    fontSize: Typography.sm,
    color: '#44474e',
    lineHeight: 22,
  },
  form: { gap: 18 },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  trustText: {
    fontSize: Typography.xs,
    color: '#9ea2ac',
    flex: 1,
  },
  footer: {
    paddingHorizontal: Spacing[5],
    paddingTop: 12,
    backgroundColor: '#F7FAFC',
    borderTopWidth: 1,
    borderTopColor: '#F1F4F6',
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 54,
    backgroundColor: '#0040e0',
    borderRadius: 16,
  },
  nextBtnText: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: '#FFFFFF',
  },
});
