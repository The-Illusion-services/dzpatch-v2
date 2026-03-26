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

// Nigerian banks list (common ones)
const NIGERIAN_BANKS = [
  'Access Bank', 'First Bank', 'GTBank', 'Zenith Bank', 'UBA',
  'Fidelity Bank', 'FCMB', 'Sterling Bank', 'Stanbic IBTC', 'Union Bank',
  'Polaris Bank', 'Wema Bank', 'Keystone Bank', 'Heritage Bank', 'Jaiz Bank',
  'Kuda Bank', 'Opay', 'PalmPay', 'Moniepoint', 'Carbon',
];

export default function SignupBankScreen() {
  const insets = useSafeAreaInsets();
  const store = useRiderSignupStore();

  const [bankName, setBankName] = useState(store.bankName);
  const [accountHolder, setAccountHolder] = useState(store.accountHolderName);
  const [accountNumber, setAccountNumber] = useState(store.accountNumber);
  const [showBankPicker, setShowBankPicker] = useState(false);
  const [bankSearch, setBankSearch] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const filteredBanks = NIGERIAN_BANKS.filter((b) =>
    b.toLowerCase().includes(bankSearch.toLowerCase())
  );

  const validate = () => {
    const e: Record<string, string> = {};
    if (!bankName) e.bank = 'Select a bank';
    if (!accountHolder.trim()) e.holder = 'Account holder name is required';
    if (!accountNumber.trim()) e.number = 'Account number is required';
    else if (!/^\d{10}$/.test(accountNumber.trim()))
      e.number = 'Enter a valid 10-digit account number';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => {
    if (!validate()) return;
    store.setBank({
      bankName,
      accountHolderName: accountHolder.trim(),
      accountNumber: accountNumber.trim(),
    });
    router.push('/(rider-auth)/signup-review' as any);
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
          <Text style={styles.headerTitle}>Payout Details</Text>
          <Text style={styles.headerStep}>Step 4 of {TOTAL_STEPS}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Progress bar */}
      <View style={progressStyles.track}>
        <View style={[progressStyles.fill, { width: '80%' }]} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Final step badge */}
        <View style={styles.stepBadge}>
          <Ionicons name="wallet-outline" size={14} color="#0040e0" />
          <Text style={styles.stepBadgeText}>Final Step</Text>
        </View>

        <Text style={styles.headline}>Enter your bank details to receive earnings securely.</Text>

        {/* Bank selector */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>BANK NAME</Text>
          <Pressable
            style={[styles.selectBtn, !!errors.bank && styles.selectBtnError]}
            onPress={() => setShowBankPicker(true)}
          >
            <Text style={[styles.selectBtnText, !bankName && styles.placeholderText]}>
              {bankName || 'Select your bank'}
            </Text>
            <Ionicons name="chevron-down" size={18} color="#74777e" />
          </Pressable>
          {!!errors.bank && <Text style={styles.errorText}>{errors.bank}</Text>}
        </View>

        <InputField
          label="ACCOUNT HOLDER NAME"
          placeholder="Exactly as on your bank account"
          value={accountHolder}
          onChangeText={setAccountHolder}
          error={errors.holder}
          autoCapitalize="words"
        />

        <InputField
          label="ACCOUNT NUMBER"
          placeholder="10-digit account number"
          value={accountNumber}
          onChangeText={(t) => setAccountNumber(t.replace(/\D/g, '').slice(0, 10))}
          error={errors.number}
          keyboardType="number-pad"
          secureEntry
        />

        {/* Security note */}
        <View style={styles.securityCard}>
          <Ionicons name="shield-checkmark" size={16} color="#0040e0" />
          <View style={{ flex: 1 }}>
            <Text style={styles.securityTitle}>Secure bank-grade encryption</Text>
            <Text style={styles.securitySub}>Payments are processed every Friday</Text>
          </View>
        </View>
      </ScrollView>

      {/* Bank picker overlay */}
      {showBankPicker && (
        <View style={styles.pickerOverlay}>
          <Pressable style={styles.pickerBackdrop} onPress={() => setShowBankPicker(false)} />
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>Select Bank</Text>
            <View style={styles.searchWrap}>
              <Ionicons name="search-outline" size={16} color="#74777e" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search banks..."
                placeholderTextColor="#9ea2ac"
                value={bankSearch}
                onChangeText={setBankSearch}
                autoFocus
              />
            </View>
            <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
              {filteredBanks.map((b) => (
                <Pressable
                  key={b}
                  style={styles.bankOption}
                  onPress={() => {
                    setBankName(b);
                    setShowBankPicker(false);
                    setBankSearch('');
                    setErrors((e) => ({ ...e, bank: '' }));
                  }}
                >
                  <Text style={[styles.bankOptionText, bankName === b && styles.bankOptionSelected]}>
                    {b}
                  </Text>
                  {bankName === b && <Ionicons name="checkmark" size={16} color="#0040e0" />}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable style={styles.nextBtn} onPress={handleNext}>
          <Text style={styles.nextBtnText}>Review Application</Text>
          <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function InputField({
  label, placeholder, value, onChangeText, error, keyboardType, autoCapitalize, secureEntry,
}: {
  label: string; placeholder: string; value: string;
  onChangeText: (t: string) => void; error?: string;
  keyboardType?: any; autoCapitalize?: any; secureEntry?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={fieldStyles.wrap}>
      <Text style={fieldStyles.label}>{label}</Text>
      <View style={[fieldStyles.inputWrap, focused && fieldStyles.focused, !!error && fieldStyles.errored]}>
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
          secureTextEntry={secureEntry}
        />
      </View>
      {!!error && <Text style={fieldStyles.error}>{error}</Text>}
    </View>
  );
}

const progressStyles = StyleSheet.create({
  track: { height: 4, backgroundColor: '#E5E7EB', marginHorizontal: Spacing[5], borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#0040e0', borderRadius: 2 },
});

const fieldStyles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontSize: 10, fontWeight: '700', color: '#324768', textTransform: 'uppercase', letterSpacing: 2 },
  inputWrap: {
    backgroundColor: '#FFFFFF', borderRadius: 14,
    borderWidth: 1.5, borderColor: '#E5E7EB', paddingHorizontal: 16,
  },
  focused: { borderColor: '#0040e0' },
  errored: { borderColor: '#ba1a1a' },
  input: { height: 50, fontSize: 15, color: '#000D22' },
  error: { fontSize: 12, color: '#ba1a1a', marginTop: 2 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing[5], paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: 'rgba(196,198,207,0.2)',
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center', gap: 2 },
  headerTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: '#000D22' },
  headerStep: { fontSize: Typography.xs, color: '#74777e' },

  scroll: { paddingHorizontal: Spacing[5], paddingTop: 20, paddingBottom: 20, gap: 20 },

  stepBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#EEF2FF', borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  stepBadgeText: { fontSize: 12, fontWeight: '700', color: '#0040e0' },

  headline: { fontSize: Typography.sm, color: '#44474e', lineHeight: 22 },

  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 10, fontWeight: '700', color: '#324768', textTransform: 'uppercase', letterSpacing: 2 },
  selectBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    height: 50, backgroundColor: '#FFFFFF',
    borderRadius: 14, borderWidth: 1.5, borderColor: '#E5E7EB',
    paddingHorizontal: 16,
  },
  selectBtnError: { borderColor: '#ba1a1a' },
  selectBtnText: { fontSize: 15, color: '#000D22' },
  placeholderText: { color: '#9ea2ac' },
  errorText: { fontSize: 12, color: '#ba1a1a', marginTop: 2 },

  securityCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#EEF2FF', borderRadius: 14, padding: 14,
  },
  securityTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: '#000D22' },
  securitySub: { fontSize: Typography.xs, color: '#74777e', marginTop: 2 },

  // Bank picker
  pickerOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 50 },
  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,13,34,0.5)' },
  pickerSheet: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 32,
  },
  pickerTitle: { fontSize: Typography.lg, fontWeight: Typography.bold, color: '#000D22', marginBottom: 16 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F7FAFC', borderRadius: 12, paddingHorizontal: 12,
    marginBottom: 12, height: 44,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#000D22' },
  bankOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F1F4F6',
  },
  bankOptionText: { fontSize: Typography.sm, color: '#000D22' },
  bankOptionSelected: { fontWeight: Typography.bold, color: '#0040e0' },

  footer: {
    paddingHorizontal: Spacing[5], paddingTop: 12,
    backgroundColor: '#F7FAFC',
    borderTopWidth: 1, borderTopColor: '#F1F4F6',
  },
  nextBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 54, backgroundColor: '#0040e0', borderRadius: 16,
  },
  nextBtnText: { fontSize: Typography.md, fontWeight: Typography.bold, color: '#FFFFFF' },
});
