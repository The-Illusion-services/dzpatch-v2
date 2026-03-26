import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
import WebView from 'react-native-webview';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Spacing, Typography } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type PayMethod = 'card' | 'bank_transfer' | 'ussd';

// ─── Constants ────────────────────────────────────────────────────────────────

const QUICK_AMOUNTS = [1000, 2500, 5000, 10000];
const CALLBACK_URL = 'https://dzpatch.co/paystack-callback';

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function FundWalletScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PayMethod>('card');
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [paystackUrl, setPaystackUrl] = useState<string | null>(null);
  const webViewRef = useRef(null);

  // ── Load balance on mount ──────────────────────────────────────────────────
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
      });
  }, [profile?.id]);

  const parsedAmount = parseFloat(amount.replace(/,/g, '')) || 0;
  const isValid = parsedAmount >= 100;

  // ── Initiate payment via Edge Function ────────────────────────────────────

  const initiatePayment = async () => {
    if (!isValid || !profile || !walletId) return;
    setLoading(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    if (!token) {
      setLoading(false);
      Alert.alert('Error', 'Not authenticated. Please log in again.');
      return;
    }

    const res = await fetch(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/payment-initialize`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount: parsedAmount, wallet_id: walletId }),
      }
    );

    const result = await res.json();
    setLoading(false);

    if (!res.ok || !result.authorization_url) {
      Alert.alert('Payment Error', result.error ?? 'Could not initiate payment. Please try again.');
      return;
    }

    setPaystackUrl(result.authorization_url);
  };

  // ── Handle WebView navigation ──────────────────────────────────────────────

  const handleWebViewNav = (url: string) => {
    if (url.startsWith(CALLBACK_URL) || url.includes('paystack.com/complete')) {
      setPaystackUrl(null);
      // Webhook will update wallet; just navigate back with success
      router.replace('/(customer)/wallet' as any);
      return false; // block webview from navigating
    }
    return true;
  };

  // ── Paystack WebView ───────────────────────────────────────────────────────

  if (paystackUrl) {
    return (
      <View style={{ flex: 1, paddingTop: insets.top }}>
        <View style={styles.webviewHeader}>
          <Pressable onPress={() => setPaystackUrl(null)} hitSlop={8}>
            <Text style={styles.webviewBack}>✕  Cancel</Text>
          </Pressable>
          <Text style={styles.webviewTitle}>Secure Payment</Text>
          <View style={styles.webviewLock}>
            <Text style={styles.webviewLockText}>🔒</Text>
          </View>
        </View>
        <WebView
          ref={webViewRef}
          source={{ uri: paystackUrl }}
          style={{ flex: 1 }}
          onShouldStartLoadWithRequest={(req) => handleWebViewNav(req.url)}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.webviewLoading}>
              <ActivityIndicator size="large" color="#0040e0" />
            </View>
          )}
        />
      </View>
    );
  }

  // ── Main form ──────────────────────────────────────────────────────────────

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
        <Text style={styles.headerTitle}>Fund Wallet</Text>
        <Text style={styles.headerIcon}>💳</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Balance card */}
        <View style={styles.balanceCard}>
          <View style={styles.balanceGlow} />
          <View style={styles.balanceGlow2} />
          <View style={{ position: 'relative', zIndex: 1 }}>
            <Text style={styles.balanceLabel}>Available Balance</Text>
            <Text style={styles.balanceValue}>
              ₦{balance !== null ? Number(balance).toLocaleString('en-NG', { minimumFractionDigits: 2 }) : '—'}
            </Text>
          </View>
        </View>

        {/* Amount input */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Amount to Add</Text>
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

          {/* Quick amount chips */}
          <View style={styles.quickAmounts}>
            {QUICK_AMOUNTS.map((q) => (
              <Pressable
                key={q}
                style={[styles.quickChip, parsedAmount === q && styles.quickChipActive]}
                onPress={() => setAmount(String(q))}
              >
                <Text style={[styles.quickChipText, parsedAmount === q && styles.quickChipTextActive]}>
                  ₦{q.toLocaleString()}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Payment method */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Method</Text>

          <Pressable
            style={[styles.methodCard, method === 'card' && styles.methodCardActive]}
            onPress={() => setMethod('card')}
          >
            <View style={[styles.methodIconWrap, method === 'card' && styles.methodIconWrapActive]}>
              <Text style={styles.methodIconEmoji}>💳</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.methodTitle, method === 'card' && styles.methodTitleActive]}>
                Credit / Debit Card
              </Text>
              <Text style={styles.methodSub}>MasterCard, Visa, Verve</Text>
            </View>
            <View style={[styles.radioOuter, method === 'card' && styles.radioOuterActive]}>
              {method === 'card' && <View style={styles.radioInner} />}
            </View>
          </Pressable>

          <Pressable
            style={[styles.methodCard, method === 'bank_transfer' && styles.methodCardActive]}
            onPress={() => setMethod('bank_transfer')}
          >
            <View style={[styles.methodIconWrap, method === 'bank_transfer' && styles.methodIconWrapActive]}>
              <Text style={styles.methodIconEmoji}>🏦</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.methodTitle, method === 'bank_transfer' && styles.methodTitleActive]}>
                Bank Transfer
              </Text>
              <Text style={styles.methodSub}>Transfer from any Nigerian bank</Text>
            </View>
            <View style={[styles.radioOuter, method === 'bank_transfer' && styles.radioOuterActive]}>
              {method === 'bank_transfer' && <View style={styles.radioInner} />}
            </View>
          </Pressable>

          <Pressable
            style={[styles.methodCard, method === 'ussd' && styles.methodCardActive]}
            onPress={() => setMethod('ussd')}
          >
            <View style={[styles.methodIconWrap, method === 'ussd' && styles.methodIconWrapActive]}>
              <Text style={styles.methodIconEmoji}>📱</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.methodTitle, method === 'ussd' && styles.methodTitleActive]}>
                USSD Code
              </Text>
              <Text style={styles.methodSub}>Pay using your bank&apos;s code</Text>
            </View>
            <View style={[styles.radioOuter, method === 'ussd' && styles.radioOuterActive]}>
              {method === 'ussd' && <View style={styles.radioInner} />}
            </View>
          </Pressable>
        </View>

        {/* Security notice */}
        <View style={styles.securityRow}>
          <Text style={styles.securityIcon}>🔒</Text>
          <Text style={styles.securityText}>Secured by 256-bit SSL encryption</Text>
        </View>
      </ScrollView>

      {/* Fixed CTA */}
      <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          style={[styles.ctaBtn, !isValid && styles.ctaBtnDisabled]}
          onPress={initiatePayment}
          disabled={!isValid || loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Text style={styles.ctaBtnText}>
                {isValid ? `Pay ₦${parsedAmount.toLocaleString()}` : 'Proceed to Pay'}
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

  scrollContent: { paddingTop: 0, gap: 0 },

  // Balance card
  balanceCard: {
    margin: Spacing[5],
    backgroundColor: '#000D22',
    borderRadius: 28,
    padding: 28,
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
    opacity: 0.15,
  },
  balanceGlow2: {
    position: 'absolute',
    bottom: -20,
    left: -20,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#2e5bff',
    opacity: 0.1,
  },
  balanceLabel: {
    fontSize: 10,
    fontWeight: Typography.bold,
    color: '#768baf',
    textTransform: 'uppercase',
    letterSpacing: 3,
    marginBottom: 6,
  },
  balanceValue: {
    fontSize: 36,
    fontWeight: Typography.extrabold,
    color: '#FFFFFF',
    letterSpacing: -1,
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
  sectionTitle: {
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    color: '#000D22',
    marginBottom: 12,
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
  currencySign: { fontSize: 24, fontWeight: Typography.extrabold, color: '#0040e0' },
  amountInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: Typography.extrabold,
    color: '#000D22',
    padding: 0,
  },

  // Quick amounts
  quickAmounts: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  quickChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#EBEEf0',
  },
  quickChipActive: { backgroundColor: '#000D22' },
  quickChipText: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: '#44474e' },
  quickChipTextActive: { color: '#FFFFFF' },

  // Method cards
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 10,
    gap: 14,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  methodCardActive: { borderColor: '#0040e0' },
  methodIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#F1F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  methodIconWrapActive: { backgroundColor: '#dde1ff' },
  methodIconEmoji: { fontSize: 22 },
  methodTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: '#000D22' },
  methodTitleActive: { color: '#0040e0' },
  methodSub: { fontSize: Typography.xs, color: '#74777e', marginTop: 2 },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#C4C6CF',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radioOuterActive: { borderColor: '#0040e0' },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0040e0',
  },

  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: Spacing[5],
  },
  securityIcon: { fontSize: 12 },
  securityText: {
    fontSize: 10,
    fontWeight: Typography.semibold,
    color: '#74777e',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
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

  // WebView
  webviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196,198,207,0.2)',
  },
  webviewBack: { fontSize: Typography.sm, fontWeight: Typography.bold, color: '#ba1a1a' },
  webviewTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: '#000D22' },
  webviewLock: { width: 32, alignItems: 'center' },
  webviewLockText: { fontSize: 16 },
  webviewLoading: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7FAFC',
  },
});
