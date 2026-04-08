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
import { WebView } from 'react-native-webview';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Spacing, Typography } from '@/constants/theme';
import { isWalletFundingCallback, waitForWalletFundingConfirmation } from '@/lib/wallet-funding';

const QUICK_AMOUNTS = [1000, 2500, 5000, 10000];

export default function RiderWalletScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();

  const [walletId, setWalletId] = useState<string | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [paymentReference, setPaymentReference] = useState<string | null>(null);
  const [confirmingPayment, setConfirmingPayment] = useState(false);

  useEffect(() => {
    if (!profile?.id) return;
    let isActive = true;

    const loadWallet = async () => {
      const { data, error } = await supabase
        .from('wallets')
        .select('id, balance')
        .eq('owner_id', profile.id)
        .eq('owner_type', 'rider')
        .single();
      if (!isActive) return;
      if (error) {
        console.warn('rider-wallet load wallet failed:', error.message);
        return;
      }
      if (data) {
        const wallet = data as { id: string; balance: number };
        setWalletId(wallet.id);
        setBalance(wallet.balance);
      }
    };

    void loadWallet();

    return () => {
      isActive = false;
    };
  }, [profile?.id]);

  const handleFund = async () => {
    const amt = parseInt(amount || '0', 10);
    if (!walletId || !profile?.id) return;
    if (amt < 100) { Alert.alert('Minimum', 'Minimum top-up is ₦100'); return; }
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/payment-initialize`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ amount: amt, wallet_id: walletId }),
        }
      );
      const json = await res.json() as { authorization_url?: string; reference?: string };
      if (!json.authorization_url || !json.reference) throw new Error('No auth URL');
      setPaymentReference(json.reference);
      setAuthUrl(json.authorization_url);
    } catch {
      Alert.alert('Error', 'Could not initialize payment. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const confirmWalletFunding = async () => {
    if (!walletId || !paymentReference) {
      setAuthUrl(null);
      return;
    }

    setAuthUrl(null);
    setConfirmingPayment(true);

    try {
      const result = await waitForWalletFundingConfirmation(paymentReference, walletId);

      if (result.balance !== null) {
        setBalance(result.balance);
      }

      if (result.confirmed) {
        Alert.alert('Wallet Funded', 'Your rider wallet has been credited successfully.', [
          { text: 'OK', onPress: () => router.replace({ pathname: '/(rider)/earnings' as any }) },
        ]);
        return;
      }

      Alert.alert(
        'Payment Received',
        'Your payment is still being confirmed. Your wallet will update as soon as the provider confirms it.',
        [{ text: 'OK', onPress: () => router.replace({ pathname: '/(rider)/earnings' as any }) }],
      );
    } catch {
      Alert.alert(
        'Payment Processing',
        'We could not confirm your wallet credit yet. Please check your earnings wallet shortly.',
        [{ text: 'OK', onPress: () => router.replace({ pathname: '/(rider)/earnings' as any }) }],
      );
    } finally {
      setConfirmingPayment(false);
      setPaymentReference(null);
    }
  };

  const handleWebViewNav = (url: string) => {
    if (isWalletFundingCallback(url)) {
      const confirmFunding = async () => {
        await confirmWalletFunding();
      };
      void confirmFunding();
      return false;
    }
    return true;
  };

  if (confirmingPayment) {
    return (
      <View style={styles.confirmingWrap}>
        <Text style={styles.confirmingTitle}>Confirming Payment</Text>
        <Text style={styles.confirmingText}>
          We are waiting for the wallet credit to be confirmed before showing success.
        </Text>
      </View>
    );
  }

  if (authUrl) {
    return (
      <View style={{ flex: 1, paddingTop: insets.top }}>
        <View style={styles.webHeader}>
          <Pressable onPress={() => setAuthUrl(null)} style={styles.backBtn} hitSlop={8}>
            <Ionicons name="close" size={20} color="#0040e0" />
          </Pressable>
          <Text style={styles.webHeaderTitle}>Secure Payment</Text>
          <View style={{ width: 36 }} />
        </View>
        <WebView
          source={{ uri: authUrl }}
          onShouldStartLoadWithRequest={(req) => handleWebViewNav(req.url)}
          onNavigationStateChange={(state) => { if (!handleWebViewNav(state.url)) setAuthUrl(null); }}
        />
      </View>
    );
  }

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
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
            <Ionicons name="arrow-back" size={20} color="#0040e0" />
          </Pressable>
          <Text style={styles.headerTitle}>Fund Wallet</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>AVAILABLE BALANCE</Text>
          <Text style={styles.balanceAmount}>₦{balance.toLocaleString()}</Text>
        </View>

        <View style={styles.inputCard}>
          <Text style={styles.inputLabel}>AMOUNT TO ADD</Text>
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
          </View>
          <View style={styles.inputDivider} />
        </View>

        <View style={styles.quickRow}>
          {QUICK_AMOUNTS.map((a) => (
            <Pressable key={a} style={styles.quickChip} onPress={() => setAmount(String(a))}>
              <Text style={styles.quickChipText}>₦{(a / 1000).toFixed(0)}K</Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          style={[styles.fundBtn, (!amount || loading) && styles.fundBtnDisabled]}
          onPress={handleFund}
          disabled={!amount || loading}
        >
          <Ionicons name="card-outline" size={18} color="#FFFFFF" />
          <Text style={styles.fundBtnText}>{loading ? 'Processing...' : 'Proceed to Payment'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingHorizontal: Spacing[5] },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2FF' },
  headerTitle: { fontSize: Typography.md, fontWeight: '800', color: '#000D22' },
  webHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing[5], paddingVertical: 14, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F1F4F6' },
  webHeaderTitle: { fontSize: Typography.md, fontWeight: '700', color: '#000D22' },
  balanceCard: {
    backgroundColor: '#0A2342', borderRadius: 24, padding: 24, gap: 8,
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 5,
  },
  balanceLabel: { fontSize: Typography.xs, fontWeight: '700', color: 'rgba(255,255,255,0.6)', letterSpacing: 1.5, textTransform: 'uppercase' },
  balanceAmount: { fontSize: 40, fontWeight: '900', color: '#FFFFFF' },
  inputCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, gap: 8,
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 2,
  },
  inputLabel: { fontSize: Typography.xs, fontWeight: '700', color: '#74777e', letterSpacing: 1.5, textTransform: 'uppercase' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  currencySymbol: { fontSize: 32, fontWeight: '900', color: '#0040e0' },
  amountInput: { flex: 1, fontSize: 38, fontWeight: '900', color: '#000D22', padding: 0, includeFontPadding: false },
  inputDivider: { height: 2, backgroundColor: '#0040e0', borderRadius: 1 },
  quickRow: { flexDirection: 'row', gap: 10 },
  quickChip: {
    flex: 1, height: 42, borderRadius: 12,
    backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center',
  },
  quickChipText: { fontSize: Typography.sm, fontWeight: '700', color: '#0040e0' },
  fundBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, height: 58, borderRadius: 18, backgroundColor: '#0040e0',
    shadowColor: '#0040e0', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 6,
  },
  fundBtnDisabled: { opacity: 0.4, shadowOpacity: 0 },
  fundBtnText: { fontSize: Typography.md, fontWeight: '800', color: '#FFFFFF' },
  confirmingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing[6],
    backgroundColor: '#F7FAFC',
  },
  confirmingTitle: { fontSize: Typography.lg, fontWeight: '800', color: '#000D22' },
  confirmingText: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: Typography.sm,
    color: '#44474e',
    lineHeight: 20,
  },
});
