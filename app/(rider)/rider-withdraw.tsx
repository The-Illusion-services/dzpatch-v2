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

interface WalletData {
  id: string;
  balance: number;
}

interface BankAccount {
  bank_name: string;
  bank_code: string | null;
  account_number: string;
  account_name: string;
}

const FEE = 100; // ₦100 flat withdrawal fee
const MIN_WITHDRAWAL = 500;

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function RiderWithdrawScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();

  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [bankAccount, setBankAccount] = useState<BankAccount | null>(null);
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ── Fetch wallet + bank account ────────────────────────────────────────────

  useEffect(() => {
    if (!profile?.id) return;

    supabase
      .from('wallets')
      .select('id, balance')
      .eq('owner_id', profile.id)
      .eq('owner_type', 'rider')
      .single()
      .then(({ data }) => { if (data) setWallet(data as WalletData); });

    supabase
      .from('rider_bank_accounts')
      .select('bank_name, bank_code, account_number, account_name')
      .eq('rider_id', profile.id)
      .eq('is_default', true)
      .single()
      .then(({ data }) => { if (data) setBankAccount(data as BankAccount); });
  }, [profile?.id]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const amountNum = parseInt(amount || '0', 10);
  const payout = Math.max(0, amountNum - FEE);
  const balance = wallet?.balance ?? 0;
  const isValid = amountNum >= MIN_WITHDRAWAL && amountNum <= balance && !!bankAccount;

  const setMax = () => setAmount(String(Math.max(0, balance - FEE)));

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleWithdraw = async () => {
    if (!wallet?.id || !profile?.id || !isValid) return;
    setSubmitting(true);
    try {
      const { error } = await (supabase as any).rpc('request_withdrawal', {
        p_wallet_id: wallet.id,
        p_amount: amountNum,
        p_bank_name: bankAccount!.bank_name,
        p_bank_code: bankAccount!.bank_code ?? '',
        p_account_number: bankAccount!.account_number,
        p_account_name: bankAccount!.account_name,
      });
      if (error) throw error;
      Alert.alert(
        'Withdrawal Requested',
        `₦${payout.toLocaleString()} will be transferred within 1–3 business days.`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch {
      Alert.alert('Error', 'Withdrawal request failed. Please try again.');
    } finally {
      setSubmitting(false);
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
          <Text style={styles.headerTitle}>Withdraw Funds</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Balance card */}
        <View style={styles.balanceCard}>
          <View style={styles.balanceDecor} />
          <Text style={styles.balanceLabel}>AVAILABLE FOR WITHDRAWAL</Text>
          <Text style={styles.balanceAmount}>₦{balance.toLocaleString()}</Text>
          {bankAccount && (
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
              <Text style={styles.verifiedText}>Verified Account</Text>
            </View>
          )}
        </View>

        {/* Amount input */}
        <View style={styles.inputCard}>
          <Text style={styles.inputLabel}>WITHDRAWAL AMOUNT</Text>
          <View style={styles.inputRow}>
            <Text style={styles.currencySymbol}>₦</Text>
            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={(v) => setAmount(v.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor="#C4C6CF"
              returnKeyType="done"
            />
            <Pressable onPress={setMax} style={styles.maxBtn}>
              <Text style={styles.maxBtnText}>Max</Text>
            </Pressable>
          </View>
          <View style={styles.inputDivider} />
          <Text style={styles.minText}>Min: ₦{MIN_WITHDRAWAL.toLocaleString()}</Text>
        </View>

        {/* Bank account selector */}
        <View style={styles.bankCard}>
          <Text style={styles.bankCardLabel}>DESTINATION ACCOUNT</Text>
          {bankAccount ? (
            <View style={styles.bankRow}>
              <View style={styles.bankIconWrap}>
                <Ionicons name="business-outline" size={20} color="#0040e0" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.bankName}>{bankAccount.bank_name}</Text>
                <Text style={styles.bankAccountNum}>
                  {bankAccount.account_name} • ****{bankAccount.account_number.slice(-4)}
                </Text>
              </View>
              <Ionicons name="checkmark-circle" size={20} color="#0040e0" />
            </View>
          ) : (
            <Pressable
              style={styles.addBankRow}
              onPress={() => router.push({ pathname: '/(rider)/bank-account-settings' as any })}
            >
              <Ionicons name="add-circle-outline" size={18} color="#0040e0" />
              <Text style={styles.addBankText}>Add Bank Account</Text>
            </Pressable>
          )}
        </View>

        {/* Calculation */}
        {amountNum > 0 && (
          <View style={styles.calcCard}>
            <View style={styles.calcRow}>
              <Text style={styles.calcLabel}>Withdrawal Amount</Text>
              <Text style={styles.calcValue}>₦{amountNum.toLocaleString()}</Text>
            </View>
            <View style={styles.calcRow}>
              <View style={styles.calcLabelRow}>
                <Ionicons name="information-circle-outline" size={14} color="#74777e" />
                <Text style={styles.calcLabel}>Transaction Fee</Text>
              </View>
              <Text style={[styles.calcValue, { color: '#ba1a1a' }]}>-₦{FEE.toLocaleString()}</Text>
            </View>
            <View style={styles.calcDivider} />
            <View style={styles.calcRow}>
              <Text style={[styles.calcLabel, { fontWeight: '900', color: '#000D22' }]}>Final Payout</Text>
              <Text style={[styles.calcValue, { color: '#0040e0', fontSize: Typography.md }]}>
                ₦{payout.toLocaleString()}
              </Text>
            </View>
          </View>
        )}

        {/* Processing notice */}
        <View style={styles.noticeCard}>
          <Ionicons name="time-outline" size={16} color="#0040e0" />
          <Text style={styles.noticeText}>
            Funds processed within 1–3 business days. High-value withdrawals may undergo additional verification.
          </Text>
        </View>

        {/* Submit */}
        <Pressable
          style={[styles.submitBtn, (!isValid || submitting) && styles.submitBtnDisabled]}
          onPress={handleWithdraw}
          disabled={!isValid || submitting}
        >
          <Ionicons name="lock-closed-outline" size={16} color="#FFFFFF" />
          <Text style={styles.submitText}>
            {submitting ? 'Processing...' : 'Confirm Withdrawal'}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: { gap: 16, paddingHorizontal: Spacing[5] },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 4,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2FF' },
  headerTitle: { fontSize: Typography.md, fontWeight: '800', color: '#000D22' },

  // Balance card
  balanceCard: {
    backgroundColor: '#0A2342', borderRadius: 24, padding: 24, gap: 8, overflow: 'hidden',
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18, shadowRadius: 18, elevation: 6,
  },
  balanceDecor: {
    position: 'absolute', right: -30, top: -30,
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: 'rgba(0,64,224,0.2)',
  },
  balanceLabel: {
    fontSize: Typography.xs, fontWeight: '700', color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1.5, textTransform: 'uppercase',
  },
  balanceAmount: { fontSize: 40, fontWeight: '900', color: '#FFFFFF' },
  verifiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', backgroundColor: 'rgba(22,163,74,0.15)',
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5,
  },
  verifiedText: { fontSize: Typography.xs, fontWeight: '700', color: '#4ADE80' },

  // Input card
  inputCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, gap: 8,
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 12, elevation: 2,
  },
  inputLabel: {
    fontSize: Typography.xs, fontWeight: '700', color: '#74777e',
    letterSpacing: 1.5, textTransform: 'uppercase',
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  currencySymbol: { fontSize: 32, fontWeight: '900', color: '#0040e0' },
  amountInput: { flex: 1, fontSize: 38, fontWeight: '900', color: '#000D22', padding: 0, includeFontPadding: false },
  maxBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
    backgroundColor: '#EEF2FF',
  },
  maxBtnText: { fontSize: Typography.xs, fontWeight: '700', color: '#0040e0' },
  inputDivider: { height: 2, backgroundColor: '#0040e0', borderRadius: 1 },
  minText: { fontSize: Typography.xs, color: '#74777e' },

  // Bank card
  bankCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, gap: 12,
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 12, elevation: 2,
  },
  bankCardLabel: {
    fontSize: Typography.xs, fontWeight: '700', color: '#74777e',
    letterSpacing: 1.5, textTransform: 'uppercase',
  },
  bankRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bankIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center',
  },
  bankName: { fontSize: Typography.sm, fontWeight: '700', color: '#000D22' },
  bankAccountNum: { fontSize: Typography.xs, color: '#74777e' },
  addBankRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addBankText: { fontSize: Typography.sm, fontWeight: '700', color: '#0040e0' },

  // Calculation
  calcCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, gap: 10,
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 12, elevation: 2,
  },
  calcRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  calcLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  calcLabel: { fontSize: Typography.sm, fontWeight: '600', color: '#44474e' },
  calcValue: { fontSize: Typography.sm, fontWeight: '800', color: '#000D22' },
  calcDivider: { height: 1, backgroundColor: '#F1F4F6' },

  // Notice
  noticeCard: {
    backgroundColor: '#EEF2FF', borderRadius: 14,
    padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10,
  },
  noticeText: { flex: 1, fontSize: Typography.xs, color: '#44474e', lineHeight: 18 },

  // Submit
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, height: 58, borderRadius: 18,
    backgroundColor: '#0040e0',
    shadowColor: '#0040e0', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25, shadowRadius: 16, elevation: 6,
  },
  submitBtnDisabled: { opacity: 0.4, shadowOpacity: 0 },
  submitText: { fontSize: Typography.md, fontWeight: '800', color: '#FFFFFF' },
});
