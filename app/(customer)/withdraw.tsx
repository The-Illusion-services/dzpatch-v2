import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Spacing, Typography } from '@/constants/theme';

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_WITHDRAWAL = 1000;
const FEE = 50;

const NIGERIAN_BANKS = [
  'Access Bank', 'First Bank', 'GTBank', 'Zenith Bank', 'UBA',
  'Stanbic IBTC', 'Fidelity Bank', 'FCMB', 'Polaris Bank',
  'Union Bank', 'Wema Bank', 'Kuda MFB', 'OPay', 'PalmPay',
  'Moniepoint', 'Sterling Bank', 'Ecobank',
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function WithdrawScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const [balance, setBalance] = useState<number | null>(null);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [bankPickerOpen, setBankPickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  // ── Load wallet ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!profile?.id) return;
    supabase
      .from('wallets')
      .select('id, balance')
      .eq('owner_id', profile.id)
      .eq('owner_type', 'customer')
      .single()
      .then(({ data }) => {
        if (data) {
          const w = data as { id: string; balance: number };
          setBalance(w.balance);
          setWalletId(w.id);
        }
        setFetching(false);
      });
  }, [profile?.id]);

  const parsedAmount = parseFloat(amount.replace(/[^0-9.]/g, '')) || 0;
  const total = parsedAmount + FEE;
  const isValid =
    parsedAmount >= MIN_WITHDRAWAL &&
    bankName.length > 0 &&
    accountNumber.length === 10 &&
    balance !== null &&
    total <= balance;

  const setMax = () => {
    if (balance === null) return;
    const maxWithdrawable = balance - FEE;
    if (maxWithdrawable > 0) setAmount(String(Math.floor(maxWithdrawable)));
  };

  // ── Submit withdrawal ──────────────────────────────────────────────────────

  const submit = async () => {
    if (!isValid || !walletId || !profile) return;
    setLoading(true);

    const { error } = await supabase.rpc('request_withdrawal', {
      p_wallet_id: walletId,
      p_amount: parsedAmount,
      p_bank_name: bankName,
      p_bank_code: '',
      p_account_number: accountNumber,
      p_account_name: profile.full_name ?? '',
    } as any);

    setLoading(false);

    if (error) {
      Alert.alert('Withdrawal Failed', error.message ?? 'Please try again later.');
      return;
    }

    Alert.alert(
      'Withdrawal Requested',
      `₦${parsedAmount.toLocaleString()} will be sent to your ${bankName} account within 15 minutes.`,
      [{ text: 'Done', onPress: () => router.replace('/(customer)/wallet' as any) }],
    );
  };

  // ── Bank picker modal ──────────────────────────────────────────────────────

  if (bankPickerOpen) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => setBankPickerOpen(false)} hitSlop={8}>
            <Text style={styles.backArrow}>←</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Select Bank</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>
          {NIGERIAN_BANKS.map((b) => (
            <Pressable
              key={b}
              style={[styles.bankRow, bankName === b && styles.bankRowActive]}
              onPress={() => {
                setBankName(b);
                setBankPickerOpen(false);
              }}
            >
              <Text style={[styles.bankRowText, bankName === b && styles.bankRowTextActive]}>{b}</Text>
              {bankName === b && <Text style={styles.bankRowCheck}>✓</Text>}
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  }

  // ── Main screen ────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/(customer)/wallet' as any)} hitSlop={8}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Withdraw</Text>
        <Text style={styles.headerIcon}>🏦</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Balance card */}
        <View style={styles.balanceCard}>
          <View style={styles.balanceGlow} />
          <View style={{ position: 'relative', zIndex: 1 }}>
            <Text style={styles.balanceLabel}>Available Balance</Text>
            {fetching ? (
              <View style={styles.balanceSkeleton} />
            ) : (
              <Text style={styles.balanceValue}>
                ₦{balance !== null ? Number(balance).toLocaleString('en-NG', { minimumFractionDigits: 2 }) : '0.00'}
              </Text>
            )}
          </View>
          <View style={styles.securedBadge}>
            <Text style={styles.securedBadgeText}>🔒  Secured Wallet</Text>
          </View>
        </View>

        {/* Amount input */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Withdrawal Amount</Text>
          <View style={styles.amountInputWrap}>
            <Text style={styles.currencySign}>₦</Text>
            <TextInput
              style={styles.amountInput}
              placeholder="0.00"
              placeholderTextColor="#C4C6CF"
              keyboardType="numeric"
              value={amount}
              onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ''))}
              returnKeyType="done"
            />
          </View>
          <View style={styles.amountMeta}>
            <Text style={styles.amountMin}>Min: ₦{MIN_WITHDRAWAL.toLocaleString()}</Text>
            <Pressable onPress={setMax} hitSlop={8}>
              <Text style={styles.amountMax}>Max Amount</Text>
            </Pressable>
          </View>
        </View>

        {/* Bank details */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Bank Destination</Text>
          <View style={styles.bankCard}>
            {/* Bank select */}
            <Pressable style={styles.bankField} onPress={() => setBankPickerOpen(true)}>
              <Text style={[styles.bankFieldText, !bankName && styles.bankFieldPlaceholder]}>
                {bankName || 'Select Bank'}
              </Text>
              <Text style={styles.bankFieldChevron}>›</Text>
            </Pressable>
            <View style={styles.divider} />

            {/* Account number */}
            <View style={styles.bankField}>
              <TextInput
                style={styles.bankFieldInput}
                placeholder="Account Number (10 digits)"
                placeholderTextColor="#74777e"
                keyboardType="numeric"
                maxLength={10}
                value={accountNumber}
                onChangeText={setAccountNumber}
              />
            </View>
            <View style={styles.divider} />

            {/* Account name preview */}
            <View style={styles.accountNameRow}>
              <View style={styles.accountNameAvatar}>
                <Text style={styles.accountNameAvatarText}>
                  {profile?.full_name?.charAt(0) ?? '?'}
                </Text>
              </View>
              <View>
                <Text style={styles.accountNameLabel}>ACCOUNT NAME</Text>
                <Text style={styles.accountNameValue}>
                  {accountNumber.length === 10 ? (profile?.full_name ?? '—') : '—'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Fee notice */}
        {parsedAmount > 0 && (
          <View style={styles.feeNotice}>
            <Text style={styles.feeIcon}>ℹ</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.feeTitle}>Transaction Fee: ₦{FEE.toLocaleString()}</Text>
              <Text style={styles.feeBody}>
                You&apos;ll receive ₦{parsedAmount.toLocaleString()} and ₦{FEE} is deducted for bank processing.
                Total deducted: ₦{total.toLocaleString()}.
              </Text>
            </View>
          </View>
        )}

        {/* Insufficient funds warning */}
        {parsedAmount > 0 && balance !== null && total > balance && (
          <View style={[styles.feeNotice, styles.errorNotice]}>
            <Text style={styles.feeIcon}>⚠</Text>
            <Text style={[styles.feeTitle, styles.errorText]}>
              Insufficient balance. Max you can withdraw is ₦{Math.max(0, balance - FEE).toLocaleString()}.
            </Text>
          </View>
        )}

        <Text style={styles.arrivalNote}>Funds usually arrive within 15 minutes.</Text>
      </ScrollView>

      {/* Fixed CTA */}
      <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          style={[styles.ctaBtn, !isValid && styles.ctaBtnDisabled]}
          onPress={submit}
          disabled={!isValid || loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Text style={styles.ctaBtnText}>
                {isValid ? `Withdraw ₦${parsedAmount.toLocaleString()}` : 'Withdraw to Bank'}
              </Text>
              <Text style={styles.ctaBtnIcon}>→</Text>
            </>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196,198,207,0.2)',
  },
  backArrow: { fontSize: 20, color: '#0040e0', fontWeight: Typography.bold },
  headerTitle: { fontSize: Typography.lg, fontWeight: Typography.bold, color: '#000D22', letterSpacing: -0.3 },
  headerIcon: { fontSize: 22 },

  scrollContent: { paddingTop: 0 },

  // Balance card
  balanceCard: {
    margin: Spacing[5],
    backgroundColor: '#0a2342',
    borderRadius: 28,
    padding: 28,
    gap: 16,
    overflow: 'hidden',
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 8,
  },
  balanceGlow: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#0040e0',
    opacity: 0.12,
  },
  balanceLabel: {
    fontSize: 10,
    fontWeight: Typography.bold,
    color: '#768baf',
    textTransform: 'uppercase',
    letterSpacing: 3,
    marginBottom: 6,
  },
  balanceSkeleton: { height: 40, width: 180, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8 },
  balanceValue: {
    fontSize: 36,
    fontWeight: Typography.extrabold,
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  securedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  securedBadgeText: {
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    color: 'rgba(255,255,255,0.8)',
  },

  // Section
  section: { paddingHorizontal: Spacing[5], marginBottom: 24 },
  sectionLabel: {
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    color: '#44474e',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 12,
    marginLeft: 4,
  },

  // Amount input
  amountInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0E3E5',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 18,
    gap: 8,
  },
  currencySign: { fontSize: 24, fontWeight: Typography.extrabold, color: '#44474e' },
  amountInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: Typography.extrabold,
    color: '#000D22',
    padding: 0,
  },
  amountMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingHorizontal: 4 },
  amountMin: { fontSize: 11, fontWeight: Typography.medium, color: '#44474e' },
  amountMax: {
    fontSize: 11,
    fontWeight: Typography.extrabold,
    color: '#0040e0',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Bank card
  bankCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  bankField: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  bankFieldText: { flex: 1, fontSize: Typography.md, fontWeight: Typography.semibold, color: '#000D22' },
  bankFieldPlaceholder: { color: '#74777e' },
  bankFieldChevron: { fontSize: 20, color: '#74777e', fontWeight: Typography.bold },
  bankFieldInput: {
    flex: 1,
    fontSize: Typography.md,
    fontWeight: Typography.semibold,
    color: '#000D22',
    padding: 0,
  },
  divider: { height: 1, backgroundColor: '#F1F4F6', marginHorizontal: 16 },
  accountNameRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  accountNameAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#dde1ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountNameAvatarText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: '#0040e0' },
  accountNameLabel: {
    fontSize: 9,
    fontWeight: Typography.bold,
    color: '#74777e',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  accountNameValue: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: '#000D22', marginTop: 2 },

  // Bank picker
  bankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F4F6',
    backgroundColor: '#FFFFFF',
  },
  bankRowActive: { backgroundColor: '#F0F4FF' },
  bankRowText: { fontSize: Typography.md, color: '#000D22' },
  bankRowTextActive: { fontWeight: Typography.bold, color: '#0040e0' },
  bankRowCheck: { fontSize: 16, color: '#0040e0', fontWeight: Typography.bold },

  // Fee notice
  feeNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginHorizontal: Spacing[5],
    marginBottom: 16,
    backgroundColor: '#fff8ed',
    borderRadius: 16,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#e66100',
  },
  errorNotice: {
    backgroundColor: '#ffdad6',
    borderLeftColor: '#ba1a1a',
  },
  feeIcon: { fontSize: 16, marginTop: 2 },
  feeTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: '#e66100', marginBottom: 2 },
  feeBody: { fontSize: Typography.xs, color: '#7a3000', lineHeight: 18 },
  errorText: { color: '#ba1a1a' },

  arrivalNote: {
    textAlign: 'center',
    fontSize: Typography.xs,
    color: '#74777e',
    paddingHorizontal: Spacing[5],
    paddingBottom: 8,
  },

  // CTA
  ctaBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing[5],
    paddingTop: 12,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(196,198,207,0.2)',
  },
  ctaBtn: {
    height: 56,
    backgroundColor: '#0040e0',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#0040e0',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  ctaBtnDisabled: { backgroundColor: '#C4C6CF', shadowOpacity: 0 },
  ctaBtnText: { fontSize: Typography.md, fontWeight: Typography.extrabold, color: '#FFFFFF' },
  ctaBtnIcon: { fontSize: 18, color: '#FFFFFF' },
});
