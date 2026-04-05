import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
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
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Spacing, Typography } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BankForm {
  bank_name: string;
  account_number: string;
  account_name: string;
  bank_code: string;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function BankAccountSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { riderId } = useAuthStore();

  const [form, setForm] = useState<BankForm>({
    bank_name: '',
    account_number: '',
    account_name: '',
    bank_code: '',
  });
  const [saving, setSaving] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);
  const [existingBankAccountId, setExistingBankAccountId] = useState<string | null>(null);

  // ── Fetch existing bank account ────────────────────────────────────────────

  useEffect(() => {
    if (!riderId) return;
    supabase
      .from('rider_bank_accounts')
      .select('id, bank_name, account_number, account_name, bank_code')
      .eq('rider_id', riderId)
      .eq('is_default', true)
      .single()
      .then(({ data }) => {
        if (data) {
          setHasExisting(true);
          setExistingBankAccountId((data as any).id ?? null);
          setForm({
            bank_name: (data as any).bank_name ?? '',
            account_number: (data as any).account_number ?? '',
            account_name: (data as any).account_name ?? '',
            bank_code: (data as any).bank_code ?? '',
          });
        }
      });
  }, [riderId]);

  const update = (field: keyof BankForm, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!riderId) return;
    if (!form.bank_name.trim() || !form.account_number.trim() || !form.account_name.trim()) {
      Alert.alert('Required Fields', 'Please fill in bank name, account number, and account holder name.');
      return;
    }
    setSaving(true);
    try {
      if (existingBankAccountId) {
        const { error } = await supabase
          .from('rider_bank_accounts')
          .update({
            bank_name: form.bank_name.trim(),
            bank_code: form.bank_code.trim(),
            account_number: form.account_number.trim(),
            account_name: form.account_name.trim(),
            is_default: true,
          } as any)
          .eq('id', existingBankAccountId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('rider_bank_accounts')
          .insert({
            rider_id: riderId,
            bank_name: form.bank_name.trim(),
            bank_code: form.bank_code.trim(),
            account_number: form.account_number.trim(),
            account_name: form.account_name.trim(),
            is_default: true,
          } as any);
        if (error) throw error;
      }

      Alert.alert('Saved', 'Bank account updated successfully.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert('Error', 'Could not save bank account. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#F7FAFC' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
            <Ionicons name="arrow-back" size={20} color="#0040e0" />
          </Pressable>
          <Text style={styles.headerTitle}>Bank Account</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Security badge */}
        <View style={styles.securityBadge}>
          <Ionicons name="shield-checkmark" size={16} color="#0040e0" />
          <Text style={styles.securityText}>
            256-bit AES encrypted. Your financial data is securely stored.
          </Text>
        </View>

        {/* Form */}
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>{hasExisting ? 'Edit Bank Account' : 'Add Bank Account'}</Text>
          <Text style={styles.formSub}>Update the destination for your weekly earnings payouts.</Text>

          {/* Bank name */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Bank Name *</Text>
            <TextInput
              style={styles.input}
              value={form.bank_name}
              onChangeText={(v) => update('bank_name', v)}
              placeholder="e.g. First Bank of Nigeria"
              placeholderTextColor="#C4C6CF"
              autoCapitalize="words"
            />
          </View>

          {/* Account number + routing */}
          <View style={styles.row}>
            <View style={[styles.fieldGroup, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>Account Number *</Text>
              <TextInput
                style={styles.input}
                value={form.account_number}
                onChangeText={(v) => update('account_number', v.replace(/[^0-9]/g, ''))}
                placeholder="0123456789"
                placeholderTextColor="#C4C6CF"
                keyboardType="number-pad"
                secureTextEntry
              />
            </View>
            <View style={[styles.fieldGroup, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>Bank Code</Text>
              <TextInput
                style={styles.input}
                value={form.bank_code}
                onChangeText={(v) => update('bank_code', v)}
                placeholder="Optional"
                placeholderTextColor="#C4C6CF"
                keyboardType="number-pad"
              />
            </View>
          </View>

          {/* Account holder name */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Account Holder Name *</Text>
            <TextInput
              style={styles.input}
              value={form.account_name}
              onChangeText={(v) => update('account_name', v)}
              placeholder="Must match your bank statement"
              placeholderTextColor="#C4C6CF"
              autoCapitalize="words"
            />
            <Text style={styles.fieldHint}>Must exactly match the name on your bank statement.</Text>
          </View>
        </View>

        {/* Payment notice */}
        <View style={styles.noticeCard}>
          <Ionicons name="time-outline" size={14} color="#74777e" />
          <Text style={styles.noticeText}>
            Updates made after Monday 12:00 PM will take effect on the next pay cycle.
          </Text>
        </View>

        {/* Save */}
        <Pressable
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
          <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Update Bank Details'}</Text>
        </Pressable>

        <Pressable style={styles.cancelBtn} onPress={() => router.back()}>
          <Text style={styles.cancelText}>Cancel Changes</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: { gap: 16, paddingHorizontal: Spacing[5] },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 4,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2FF' },
  headerTitle: { fontSize: Typography.md, fontWeight: '800', color: '#000D22' },

  securityBadge: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#EEF2FF', borderRadius: 14, padding: 12,
  },
  securityText: { flex: 1, fontSize: Typography.xs, color: '#44474e', lineHeight: 18 },

  formCard: {
    backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, gap: 16,
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 12, elevation: 2,
  },
  formTitle: { fontSize: Typography.lg, fontWeight: '900', color: '#000D22' },
  formSub: { fontSize: Typography.sm, color: '#74777e', marginTop: -8 },

  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: Typography.xs, fontWeight: '700', color: '#000D22', letterSpacing: 0.5 },
  input: {
    height: 48, borderRadius: 12, paddingHorizontal: 14,
    backgroundColor: '#F7FAFC', borderWidth: 1.5, borderColor: '#E5E7EB',
    fontSize: Typography.sm, fontWeight: '600', color: '#000D22',
  },
  fieldHint: { fontSize: Typography.xs, color: '#74777e' },
  row: { flexDirection: 'row', gap: 12 },

  noticeCard: {
    backgroundColor: '#F7FAFC', borderRadius: 14, padding: 12,
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  noticeText: { flex: 1, fontSize: Typography.xs, color: '#74777e', lineHeight: 18 },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, height: 58, borderRadius: 18,
    backgroundColor: '#0040e0',
    shadowColor: '#0040e0', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25, shadowRadius: 16, elevation: 6,
  },
  saveBtnText: { fontSize: Typography.md, fontWeight: '800', color: '#FFFFFF' },
  cancelBtn: { alignItems: 'center', paddingVertical: 8 },
  cancelText: { fontSize: Typography.sm, fontWeight: '700', color: '#74777e' },
});
